-- ═══════════════════════════════════════════════════════════════
-- CAMPA · Esquema de base de datos
-- Postgres 15+ / Supabase
-- Orden de ejecución respetado: sin forward references
-- ═══════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ───────────────────────────────────────────────────────────────
-- 1. ESTRUCTURA TEMPORAL Y ORGANIZATIVA
-- ───────────────────────────────────────────────────────────────

create table ejercicio (
  id          uuid primary key default gen_random_uuid(),
  anio        int  not null unique,
  fecha_desde date not null,
  fecha_hasta date not null,
  estado      text not null default 'abierto' check (estado in ('abierto','cerrado'))
);

create table predio (
  id     uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  activo boolean not null default true
);

create table torneo (
  id           uuid primary key default gen_random_uuid(),
  ejercicio_id uuid not null references ejercicio(id),
  nombre       text not null,
  fecha_desde  date,
  fecha_hasta  date,
  cant_fechas  int  not null default 10,
  estado       text not null default 'planificado'
                 check (estado in ('planificado','en_curso','cerrado'))
);

create table jornada (
  id           uuid primary key default gen_random_uuid(),
  torneo_id    uuid not null references torneo(id) on delete cascade,
  numero       int  not null,
  fecha        date not null,
  predio_id    uuid not null references predio(id),
  estado       text not null default 'programada'
                 check (estado in ('programada','jugada','suspendida','reprogramada')),
  reprograma_a uuid references jornada(id),
  unique (torneo_id, numero, predio_id)
);

create table periodo (
  id           uuid primary key default gen_random_uuid(),
  ejercicio_id uuid not null references ejercicio(id),
  anio         int  not null,
  mes          int  not null check (mes between 1 and 12),
  estado       text not null default 'abierto' check (estado in ('abierto','cerrado')),
  cerrado_por  uuid references auth.users(id),
  cerrado_at   timestamptz,
  unique (ejercicio_id, anio, mes)
);

-- ───────────────────────────────────────────────────────────────
-- 2. NÚCLEO CONTABLE
-- ───────────────────────────────────────────────────────────────

create table cuenta (
  id        uuid primary key default gen_random_uuid(),
  codigo    text not null unique,
  nombre    text not null,
  tipo      text not null check (tipo in
              ('activo','pasivo','patrimonio','ingreso','egreso','financiero')),
  imputable boolean not null default true,
  padre_id  uuid references cuenta(id)
);

create table tercero (
  id      uuid primary key default gen_random_uuid(),
  tipo    text not null check (tipo in ('equipo','sponsor','socio','proveedor')),
  nombre  text not null,
  email   text,
  contacto text,
  activo  boolean not null default true
);

create table caja (
  id     uuid primary key default gen_random_uuid(),
  tipo   text not null unique check (tipo in ('efectivo','transferencia','usd')),
  nombre text not null
);

create table asiento (
  id          uuid primary key default gen_random_uuid(),
  periodo_id  uuid not null references periodo(id),
  torneo_id   uuid references torneo(id),      -- NULL = estructura permanente
  jornada_id  uuid references jornada(id),
  predio_id   uuid references predio(id),
  fecha       date not null,
  origen      text not null,
  descripcion text not null,
  anulado_por uuid references asiento(id),
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

create table asiento_linea (
  id         uuid primary key default gen_random_uuid(),
  asiento_id uuid not null references asiento(id) on delete cascade,
  cuenta_id  uuid not null references cuenta(id),
  debe       numeric(16,2) not null default 0,
  haber      numeric(16,2) not null default 0,
  tercero_id uuid references tercero(id),
  check (debe >= 0 and haber >= 0),
  check ((debe > 0 and haber = 0) or (haber > 0 and debe = 0))
);

-- ───────────────────────────────────────────────────────────────
-- 3. CATÁLOGO DE GASTOS (dos ejes: naturaleza + área)
-- ───────────────────────────────────────────────────────────────

create table cat_gasto (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  naturaleza         text not null check (naturaleza in
                       ('por_fecha','recurrente','eventual','inversion')),
  area               text not null check (area in
                       ('torneo','predio','bar','administracion')),
  cuenta_id          uuid not null references cuenta(id),
  imputacion_default text not null default 'torneo'
                       check (imputacion_default in ('torneo','estructura')),
  activo             boolean not null default true,
  unique (area, nombre)
);

create table concepto_gasto (
  id           uuid primary key default gen_random_uuid(),
  cat_gasto_id uuid not null references cat_gasto(id) on delete cascade,
  nombre       text not null,
  arancel_ref  numeric(16,2),
  activo       boolean not null default true,
  unique (cat_gasto_id, nombre)
);

-- ───────────────────────────────────────────────────────────────
-- 4. ACTIVOS Y AMORTIZACIÓN
-- ───────────────────────────────────────────────────────────────

create table config_contable (
  id                uuid primary key default gen_random_uuid(),
  umbral_activacion numeric(16,2) not null default 500000,
  vigente_desde     date not null default current_date,
  updated_by        uuid references auth.users(id),
  updated_at        timestamptz not null default now()
);

create table activo (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  categoria       text not null check (categoria in
                    ('herramientas','maquinaria','equipamiento_bar','infraestructura','otro')),
  predio_id       uuid references predio(id),
  fecha_alta      date not null,
  valor_origen    numeric(16,2) not null,
  vida_util_meses int  not null check (vida_util_meses > 0),
  estado          text not null default 'activo' check (estado in ('activo','baja')),
  fecha_baja      date,
  motivo_baja     text,
  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now()
);

create table amortizacion (
  id         uuid primary key default gen_random_uuid(),
  activo_id  uuid not null references activo(id) on delete restrict,
  periodo_id uuid not null references periodo(id),
  monto      numeric(16,2) not null,
  asiento_id uuid references asiento(id),
  estado     text not null default 'propuesta' check (estado in ('propuesta','confirmada')),
  unique (activo_id, periodo_id)
);

-- ───────────────────────────────────────────────────────────────
-- 5. GASTOS
-- ───────────────────────────────────────────────────────────────

create table gasto (
  id             uuid primary key default gen_random_uuid(),
  cat_gasto_id   uuid not null references cat_gasto(id),
  concepto_id    uuid references concepto_gasto(id),
  concepto_libre text,
  torneo_id      uuid references torneo(id),
  jornada_id     uuid references jornada(id),
  predio_id      uuid references predio(id),
  arancel        numeric(16,2) not null,
  cantidad       numeric(10,2) not null default 1,
  total          numeric(16,2) generated always as (arancel * cantidad) stored,
  devengado_at   date not null,
  pagado_at      date,
  medio_pago     text check (medio_pago in ('efectivo','transferencia')),
  activo_id      uuid references activo(id),
  asiento_dev_id uuid references asiento(id),
  asiento_pag_id uuid references asiento(id),
  check (concepto_id is not null or concepto_libre is not null)
);

-- ───────────────────────────────────────────────────────────────
-- 6. EQUIPOS, CUOTAS Y COBRANZA
-- ───────────────────────────────────────────────────────────────

create table equipo_torneo (
  id              uuid primary key default gen_random_uuid(),
  tercero_id      uuid not null references tercero(id),
  torneo_id       uuid not null references torneo(id),
  categoria       text not null,
  modalidad       text not null check (modalidad in ('cuotas','unitario','cinco_fechas')),
  responsable_id  uuid references auth.users(id),
  total_facturado numeric(16,2) not null,
  asiento_id      uuid references asiento(id),
  unique (tercero_id, torneo_id)
);

create table cuota (
  id               uuid primary key default gen_random_uuid(),
  equipo_torneo_id uuid not null references equipo_torneo(id) on delete cascade,
  numero           int  not null,
  vence_at         date not null,
  monto            numeric(16,2) not null,
  pagado_at        date,
  unique (equipo_torneo_id, numero)
);

create table pago (
  id               uuid primary key default gen_random_uuid(),
  tercero_id       uuid not null references tercero(id),
  cuota_id         uuid references cuota(id),
  fecha            date not null,
  monto            numeric(16,2) not null,
  medio_pago       text not null check (medio_pago in ('efectivo','transferencia','cheque')),
  jornada_id       uuid references jornada(id),
  predio_id        uuid references predio(id),
  asiento_id       uuid references asiento(id),
  registrado_por   uuid not null references auth.users(id),
  created_at       timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────
-- 7. CHEQUES, PLANES Y COMPROMISOS
-- ───────────────────────────────────────────────────────────────

create table cheque (
  id                uuid primary key default gen_random_uuid(),
  sentido           text not null check (sentido in ('recibido','emitido')),
  numero            text,
  banco             text,
  tercero_id        uuid references tercero(id),
  fecha_emision     date not null,
  fecha_cobro       date not null,
  monto             numeric(16,2) not null,
  estado            text not null default 'pendiente' check (estado in
                      ('pendiente','acreditado','debitado','rechazado','anulado')),
  fecha_estado      date,
  observaciones     text,
  asiento_alta_id   uuid references asiento(id),
  asiento_cierre_id uuid references asiento(id),
  created_at        timestamptz not null default now()
);

create table plan_pago (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  organismo       text,
  fecha_inicio    date not null,
  cuotas_total    int  not null,
  monto_cuota     numeric(16,2) not null,
  dia_vencimiento int  not null default 15,
  indexado        boolean not null default false,
  estado          text not null default 'vigente' check (estado in ('vigente','finalizado','caido'))
);

create table compromiso (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in
                ('factura','cuota_plan','cheque_emitido','cheque_recibido','otro')),
  sentido     text not null check (sentido in ('pagar','cobrar')),
  tercero_id  uuid references tercero(id),
  descripcion text not null,
  vence_at    date not null,
  monto       numeric(16,2) not null,
  estado      text not null default 'pendiente' check (estado in
                ('pendiente','cumplido','rechazado','anulado')),
  cumplido_at date,
  gasto_id    uuid references gasto(id),
  plan_id     uuid references plan_pago(id),
  cheque_id   uuid references cheque(id),
  torneo_id   uuid references torneo(id),
  asiento_id  uuid references asiento(id),
  created_at  timestamptz not null default now()
);

create table movimiento_fondo (
  id         uuid primary key default gen_random_uuid(),
  fecha      date not null,
  tipo       text not null check (tipo in ('rescate','colocacion')),
  monto      numeric(16,2) not null check (monto > 0),
  caja_id    uuid not null references caja(id),
  motivo     text,
  asiento_id uuid references asiento(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────
-- 8. CONTROLES
-- ───────────────────────────────────────────────────────────────

create table arqueo (
  id             uuid primary key default gen_random_uuid(),
  jornada_id     uuid not null references jornada(id),
  predio_id      uuid not null references predio(id),
  saldo_sistema  numeric(16,2) not null,
  saldo_contado  numeric(16,2) not null,
  diferencia     numeric(16,2) generated always as (saldo_contado - saldo_sistema) stored,
  asiento_id     uuid references asiento(id),
  responsable_id uuid not null references auth.users(id),
  created_at     timestamptz not null default now()
);

create table usd_operacion (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  tipo        text not null check (tipo in ('compra','venta','revaluacion')),
  cantidad    numeric(14,2) not null,
  tc          numeric(10,2) not null,
  monto_pesos numeric(16,2) not null,
  motivo      text,
  asiento_id  uuid references asiento(id)
);

-- ───────────────────────────────────────────────────────────────
-- 9. PRESUPUESTO
-- ───────────────────────────────────────────────────────────────

create table presupuesto (
  id           uuid primary key default gen_random_uuid(),
  torneo_id    uuid references torneo(id),
  ejercicio_id uuid not null references ejercicio(id),
  estado       text not null default 'borrador' check (estado in ('borrador','aprobado'))
);

create table presupuesto_linea (
  id             uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references presupuesto(id) on delete cascade,
  cat_gasto_id   uuid not null references cat_gasto(id),
  concepto_id    uuid references concepto_gasto(id),
  base           numeric(16,2) not null,
  cantidad       numeric(10,2) not null default 1,
  unidad         text not null check (unidad in ('por_jornada','por_mes','anual','unico'))
);

create table escenario (
  id                  uuid primary key default gen_random_uuid(),
  ejercicio_id        uuid not null references ejercicio(id),
  nombre              text not null,
  es_base             boolean not null default false,
  tasa_cobranza       numeric(5,2) not null default 100,
  demora_cobro_dias   int  not null default 0,
  ajuste_gastos_pct   numeric(5,2) not null default 0,
  equipos_proyectados int,
  created_at          timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────
-- 10. COMUNICACIONES
-- ───────────────────────────────────────────────────────────────

create table plantilla_mail (
  id     uuid primary key default gen_random_uuid(),
  clave  text not null unique,
  asunto text not null,
  cuerpo text not null
);

create table envio (
  id           uuid primary key default gen_random_uuid(),
  tercero_id   uuid not null references tercero(id),
  plantilla    text not null,
  destinatario text not null,
  payload      jsonb,
  enviado_at   timestamptz not null default now(),
  enviado_por  uuid references auth.users(id)
);

-- ═══════════════════════════════════════════════════════════════
-- TRIGGERS E INVARIANTES
-- ═══════════════════════════════════════════════════════════════

-- Debe = Haber en todo asiento (deferrable: permite insertar líneas de a una)
create or replace function check_asiento_balanceado() returns trigger as $$
declare d numeric; h numeric; aid uuid;
begin
  aid := coalesce(new.asiento_id, old.asiento_id);
  select coalesce(sum(debe),0), coalesce(sum(haber),0) into d, h
    from asiento_linea where asiento_id = aid;
  if d <> h then
    raise exception 'Asiento % no balancea: debe=% haber=%', aid, d, h;
  end if;
  return null;
end $$ language plpgsql;

create constraint trigger trg_asiento_balanceado
  after insert or update or delete on asiento_linea
  deferrable initially deferred
  for each row execute function check_asiento_balanceado();

-- No se escribe sobre período cerrado
create or replace function check_periodo_abierto() returns trigger as $$
begin
  if (select estado from periodo where id = new.periodo_id) = 'cerrado' then
    raise exception 'El período está cerrado';
  end if;
  return new;
end $$ language plpgsql;

create trigger trg_periodo_abierto before insert or update on asiento
  for each row execute function check_periodo_abierto();

-- Coherencia entre naturaleza del gasto y su anclaje
create or replace function check_gasto_coherente() returns trigger as $$
declare nat text;
begin
  select naturaleza into nat from cat_gasto where id = new.cat_gasto_id;

  if nat = 'por_fecha' and new.jornada_id is null then
    raise exception 'Un gasto por fecha requiere jornada';
  end if;
  if nat <> 'por_fecha' and new.jornada_id is not null then
    raise exception 'Solo los gastos por fecha se anclan a una jornada';
  end if;
  if nat = 'inversion' and new.activo_id is null then
    raise exception 'Una inversión requiere un activo asociado';
  end if;
  if nat = 'recurrente' and new.torneo_id is not null then
    raise exception 'Los gastos recurrentes son de estructura, no de un torneo';
  end if;
  return new;
end $$ language plpgsql;

create trigger trg_gasto_coherente before insert or update on gasto
  for each row execute function check_gasto_coherente();

-- ═══════════════════════════════════════════════════════════════
-- ÍNDICES
-- ═══════════════════════════════════════════════════════════════

create index idx_linea_asiento    on asiento_linea(asiento_id);
create index idx_linea_cuenta     on asiento_linea(cuenta_id);
create index idx_linea_tercero    on asiento_linea(tercero_id) where tercero_id is not null;
create index idx_asiento_periodo  on asiento(periodo_id) where anulado_por is null;
create index idx_asiento_torneo   on asiento(torneo_id)  where anulado_por is null;
create index idx_asiento_fecha    on asiento(fecha)      where anulado_por is null;
create index idx_gasto_jornada    on gasto(jornada_id)   where jornada_id is not null;
create index idx_gasto_cat        on gasto(cat_gasto_id);
create index idx_cuota_vence      on cuota(vence_at)     where pagado_at is null;
create index idx_compromiso_vence on compromiso(vence_at) where estado = 'pendiente';
create index idx_compromiso_tipo  on compromiso(tipo, sentido) where estado = 'pendiente';
create index idx_cheque_pendiente on cheque(fecha_cobro) where estado = 'pendiente';
create index idx_jornada_torneo   on jornada(torneo_id);
create index idx_equipo_torneo    on equipo_torneo(torneo_id);

-- ═══════════════════════════════════════════════════════════════
-- FUNCIONES DE NEGOCIO
-- ═══════════════════════════════════════════════════════════════

-- Genera los compromisos de un plan de pago
create or replace function generar_cuotas_plan(p_plan_id uuid)
returns int as $$
declare p record; i int; v_fecha date; v_count int := 0;
begin
  select * into p from plan_pago where id = p_plan_id;
  for i in 1..p.cuotas_total loop
    v_fecha := (date_trunc('month', p.fecha_inicio + (i-1) * interval '1 month')
                + (p.dia_vencimiento - 1) * interval '1 day')::date;
    insert into compromiso (tipo, sentido, descripcion, vence_at, monto, plan_id)
    values ('cuota_plan','pagar',
            p.nombre || ' · cuota ' || i || '/' || p.cuotas_total,
            v_fecha, p.monto_cuota, p_plan_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$ language plpgsql;

-- Propone amortizaciones del período (no las confirma)
create or replace function proponer_amortizaciones(p_periodo_id uuid)
returns table (activo_id uuid, nombre text, monto numeric, cuota int, cuotas_total int) as $$
declare v_anio int; v_mes int; v_fin date;
begin
  select anio, mes into v_anio, v_mes from periodo where id = p_periodo_id;
  v_fin := (make_date(v_anio, v_mes, 1) + interval '1 month - 1 day')::date;

  return query
  select a.id, a.nombre,
         round(a.valor_origen / a.vida_util_meses, 2),
         (extract(year  from age(v_fin, a.fecha_alta)) * 12
        + extract(month from age(v_fin, a.fecha_alta)) + 1)::int,
         a.vida_util_meses
  from activo a
  where a.estado = 'activo'
    and a.fecha_alta <= v_fin
    and (extract(year  from age(v_fin, a.fecha_alta)) * 12
       + extract(month from age(v_fin, a.fecha_alta)) + 1) <= a.vida_util_meses
    and not exists (
      select 1 from amortizacion am
      where am.activo_id = a.id and am.periodo_id = p_periodo_id
    );
end $$ language plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- VISTAS
-- ═══════════════════════════════════════════════════════════════

-- Estado de cobranza de cada cuota
create view v_estado_cuota as
select c.*,
  case
    when c.pagado_at is not null                                    then 'al_dia'
    when c.vence_at < current_date                                  then 'cuota_vencida'
    when c.vence_at between current_date and current_date + 7       then 'proxima_a_vencer'
    else 'al_dia'
  end as estado
from cuota c;

-- Resultado por producto: torneos + estructura permanente
create view v_resultado_producto as
select
  e.anio,
  coalesce(t.nombre, 'Estructura permanente') as producto,
  sum(case when c.tipo = 'ingreso' then l.haber - l.debe else 0 end) as ingresos,
  sum(case when c.tipo = 'egreso'  then l.debe  - l.haber else 0 end) as egresos,
  sum(case when c.tipo = 'ingreso' then l.haber - l.debe else 0 end)
  - sum(case when c.tipo = 'egreso' then l.debe - l.haber else 0 end) as contribucion
from asiento a
join periodo p        on p.id = a.periodo_id
join ejercicio e      on e.id = p.ejercicio_id
join asiento_linea l  on l.asiento_id = a.id
join cuenta c         on c.id = l.cuenta_id
left join torneo t    on t.id = a.torneo_id
where a.anulado_por is null and c.tipo in ('ingreso','egreso')
group by e.anio, coalesce(t.nombre, 'Estructura permanente');

-- KPIs de cobranza por torneo
create view v_cobranza_kpi as
select
  t.id as torneo_id, t.nombre,
  sum(c.monto) as devengado,
  sum(case when c.pagado_at is not null then c.monto else 0 end) as cobrado,
  round(100.0 * sum(case when c.pagado_at is not null then c.monto else 0 end)
        / nullif(sum(c.monto),0), 1) as tasa_cobranza,
  round(avg(case when c.pagado_at is not null then c.pagado_at - c.vence_at end), 1)
        as dias_promedio_cobro,
  sum(case when c.pagado_at is null and c.vence_at >= current_date then c.monto else 0 end)
        as por_vencer,
  sum(case when c.pagado_at is null and c.vence_at <  current_date then c.monto else 0 end)
        as vencido
from cuota c
join equipo_torneo et on et.id = c.equipo_torneo_id
join torneo t         on t.id = et.torneo_id
group by t.id, t.nombre;

-- Comparación entre torneos
create view v_comparador_torneos as
select t.nombre, t.fecha_desde,
  count(distinct et.id) as equipos,
  sum(case when c.tipo='ingreso' then l.haber-l.debe else 0 end) as ingresos,
  sum(case when c.tipo='egreso'  then l.debe-l.haber else 0 end) as costos_directos,
  sum(case when c.tipo='ingreso' then l.haber-l.debe else 0 end)
  - sum(case when c.tipo='egreso' then l.debe-l.haber else 0 end) as contribucion,
  round((sum(case when c.tipo='ingreso' then l.haber-l.debe else 0 end)
       - sum(case when c.tipo='egreso'  then l.debe-l.haber else 0 end))
       / nullif(count(distinct et.id),0), 0) as contribucion_por_equipo
from torneo t
left join equipo_torneo et on et.torneo_id = t.id
left join asiento a        on a.torneo_id  = t.id and a.anulado_por is null
left join asiento_linea l  on l.asiento_id = a.id
left join cuenta c         on c.id = l.cuenta_id
group by t.id, t.nombre, t.fecha_desde;

-- Calendario de pagos
create view v_calendario_pagos as
select
  c.vence_at as fecha, c.tipo, c.sentido, c.descripcion,
  t.nombre as tercero, c.monto, c.estado,
  case c.tipo
    when 'cheque_emitido' then 'critico'
    when 'cuota_plan'     then 'alto'
    when 'factura'        then 'medio'
    else 'normal'
  end as criticidad
from compromiso c
left join tercero t on t.id = c.tercero_id
where c.estado = 'pendiente';

-- Dependencia del fondo de inversión
create view v_dependencia_fondo as
select
  date_trunc('month', fecha) as mes,
  sum(case when tipo='rescate'    then monto else 0 end) as rescatado,
  sum(case when tipo='colocacion' then monto else 0 end) as colocado,
  sum(case when tipo='rescate'    then monto else -monto end) as neto
from movimiento_fondo
group by date_trunc('month', fecha);

-- Presupuesto con total calculado según unidad
create view v_presupuesto_total as
select pl.*,
  case pl.unidad
    when 'por_jornada' then pl.base * pl.cantidad * (
      select count(*) from jornada j
      where j.torneo_id = p.torneo_id and j.estado <> 'suspendida')
    when 'por_mes' then pl.base * pl.cantidad * 12
    else pl.base
  end as total_presupuestado
from presupuesto_linea pl
join presupuesto p on p.id = pl.presupuesto_id;

-- ═══════════════════════════════════════════════════════════════
-- AUDITORÍA DE CAMBIOS
-- ═══════════════════════════════════════════════════════════════
-- `asiento` ya es inmutable (se anula con contraasiento).
-- Esta tabla registra cambios sobre el resto de entidades sensibles.

create table audit_log (
  id         bigserial primary key,
  tabla      text not null,
  registro_id uuid not null,
  operacion  text not null check (operacion in ('UPDATE','DELETE')),
  anterior   jsonb,
  nuevo      jsonb,
  usuario_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_audit_tabla on audit_log(tabla, registro_id);
create index idx_audit_fecha on audit_log(created_at);

create or replace function fn_audit() returns trigger as $$
begin
  insert into audit_log (tabla, registro_id, operacion, anterior, nuevo, usuario_id)
  values (TG_TABLE_NAME,
          coalesce(new.id, old.id),
          TG_OP,
          case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when TG_OP = 'UPDATE' then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end $$ language plpgsql security definer;

create trigger trg_audit_equipo_torneo after update or delete on equipo_torneo
  for each row execute function fn_audit();
create trigger trg_audit_cuota after update or delete on cuota
  for each row execute function fn_audit();
create trigger trg_audit_gasto after update or delete on gasto
  for each row execute function fn_audit();
create trigger trg_audit_arqueo after update or delete on arqueo
  for each row execute function fn_audit();
create trigger trg_audit_cheque after update or delete on cheque
  for each row execute function fn_audit();
create trigger trg_audit_activo after update or delete on activo
  for each row execute function fn_audit();
