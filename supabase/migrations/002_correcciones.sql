-- ═══════════════════════════════════════════════════════════════
-- CAMPA · Migración 01 — Correcciones al esquema base
-- Aplicar DESPUÉS de campa_schema.sql y ANTES de seed.sql
--
-- Contenido:
--   A. Trazabilidad de asientos (origen_id)
--   B. Integridad de períodos (fecha vs. período, reapertura)
--   C. Cuotas: pagos parciales
--   D. total_facturado derivado, no duplicado
--   E. Caja por predio
--   F. Coherencia de gasto eventual
--   G. Ámbito de movimiento_fondo
--   H. Vistas corregidas
-- ═══════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────
-- A. TRAZABILIDAD DE ASIENTOS
-- ───────────────────────────────────────────────────────────────
-- El doc de arquitectura define origen_id; el esquema no lo tenía.
-- Sin esta columna solo existe el camino registro → asiento, y la
-- pantalla "Registro de movimientos" necesita el inverso.

alter table asiento
  add column if not exists origen_id uuid;

comment on column asiento.origen_id is
  'ID del registro que generó el asiento (gasto, pago, arqueo, etc.). '
  'Sin FK: el origen es polimórfico y se discrimina por la columna origen.';

create index if not exists idx_asiento_origen
  on asiento (origen, origen_id)
  where origen_id is not null;

-- Valores permitidos de origen, alineados con el doc §3.1
alter table asiento
  drop constraint if exists asiento_origen_check;

alter table asiento
  add constraint asiento_origen_check check (origen in (
    'devengo_equipo','pago_equipo',
    'gasto_devengo','gasto_pago',
    'bar','arqueo','sponsor','socio','usd',
    'amortizacion','cheque','fondo','ajuste','apertura'
  ));


-- ───────────────────────────────────────────────────────────────
-- B. INTEGRIDAD DE PERÍODOS
-- ───────────────────────────────────────────────────────────────

-- B.1 · La fecha del asiento debe caer dentro del mes de su período.
--      Sin esto se puede imputar un asiento de marzo al período de julio.

create or replace function check_asiento_fecha_periodo() returns trigger as $$
declare
  v_anio int;
  v_mes  int;
begin
  select anio, mes into v_anio, v_mes
    from periodo where id = new.periodo_id;

  if v_anio is null then
    raise exception 'Período % inexistente', new.periodo_id;
  end if;

  if extract(year from new.fecha)::int <> v_anio
     or extract(month from new.fecha)::int <> v_mes then
    raise exception
      'La fecha % no corresponde al período %-%',
      new.fecha, v_anio, lpad(v_mes::text, 2, '0');
  end if;

  return new;
end $$ language plpgsql;

drop trigger if exists trg_asiento_fecha_periodo on asiento;
create trigger trg_asiento_fecha_periodo
  before insert or update on asiento
  for each row execute function check_asiento_fecha_periodo();


-- B.2 · Un período cerrado no se reabre.
--      El cierre es el punto donde los números se vuelven definitivos.

create or replace function check_periodo_no_reabre() returns trigger as $$
begin
  if old.estado = 'cerrado' and new.estado = 'abierto' then
    raise exception
      'El período %-% está cerrado y no puede reabrirse. '
      'Las correcciones se registran como ajuste en el período abierto.',
      old.anio, lpad(old.mes::text, 2, '0');
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_periodo_no_reabre on periodo;
create trigger trg_periodo_no_reabre
  before update on periodo
  for each row execute function check_periodo_no_reabre();


-- B.3 · Al cerrar un período, registrar quién y cuándo.

create or replace function set_periodo_cierre() returns trigger as $$
begin
  if new.estado = 'cerrado' and old.estado = 'abierto' then
    new.cerrado_at := now();
    new.cerrado_por := coalesce(new.cerrado_por, auth.uid());
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_periodo_cierre on periodo;
create trigger trg_periodo_cierre
  before update on periodo
  for each row execute function set_periodo_cierre();


-- ───────────────────────────────────────────────────────────────
-- C. CUOTAS: PAGOS PARCIALES
-- ───────────────────────────────────────────────────────────────
-- Antes: cuota.pagado_at (timestamp) → la cuota está paga o no.
-- Un equipo que paga $500k de una cuota de $1.75M no tenía dónde
-- registrarse. En fútbol amateur el pago parcial es la norma.
--
-- Ahora: el saldo se deriva de los pagos imputados a la cuota.
-- pagado_at se mantiene por compatibilidad pero pasa a ser derivado:
-- se completa automáticamente cuando el saldo llega a cero.

-- C.1 · Un pago puede imputarse parcialmente a una cuota.
--      monto_imputado permite que un pago cubra parte de una cuota
--      o se reparta entre varias.

create table if not exists pago_imputacion (
  id       uuid primary key default gen_random_uuid(),
  pago_id  uuid not null references pago(id) on delete cascade,
  cuota_id uuid not null references cuota(id) on delete restrict,
  monto    numeric(16,2) not null check (monto > 0),
  unique (pago_id, cuota_id)
);

create index if not exists idx_imputacion_cuota on pago_imputacion(cuota_id);
create index if not exists idx_imputacion_pago  on pago_imputacion(pago_id);

comment on table pago_imputacion is
  'Distribuye un pago entre una o varias cuotas. Permite pagos '
  'parciales y pagos que cubren más de una cuota.';

-- C.2 · La suma imputada no puede exceder ni el pago ni la cuota.

create or replace function check_imputacion_coherente() returns trigger as $$
declare
  v_pago_monto     numeric(16,2);
  v_pago_imputado  numeric(16,2);
  v_cuota_monto    numeric(16,2);
  v_cuota_imputado numeric(16,2);
begin
  select monto into v_pago_monto from pago where id = new.pago_id;
  select coalesce(sum(monto),0) into v_pago_imputado
    from pago_imputacion where pago_id = new.pago_id;

  if v_pago_imputado > v_pago_monto then
    raise exception
      'La imputación (%) excede el monto del pago (%)',
      v_pago_imputado, v_pago_monto;
  end if;

  select monto into v_cuota_monto from cuota where id = new.cuota_id;
  select coalesce(sum(monto),0) into v_cuota_imputado
    from pago_imputacion where cuota_id = new.cuota_id;

  if v_cuota_imputado > v_cuota_monto then
    raise exception
      'Lo imputado a la cuota (%) excede su monto (%)',
      v_cuota_imputado, v_cuota_monto;
  end if;

  return new;
end $$ language plpgsql;

drop trigger if exists trg_imputacion_coherente on pago_imputacion;
create constraint trigger trg_imputacion_coherente
  after insert or update on pago_imputacion
  deferrable initially deferred
  for each row execute function check_imputacion_coherente();

-- C.3 · pagado_at se completa solo cuando la cuota queda saldada.

create or replace function sync_cuota_pagada() returns trigger as $$
declare
  v_cuota_id  uuid;
  v_monto     numeric(16,2);
  v_imputado  numeric(16,2);
  v_ultimo    date;
begin
  v_cuota_id := coalesce(new.cuota_id, old.cuota_id);

  select monto into v_monto from cuota where id = v_cuota_id;

  select coalesce(sum(pi.monto), 0),
         max(p.fecha)
    into v_imputado, v_ultimo
    from pago_imputacion pi
    join pago p on p.id = pi.pago_id
   where pi.cuota_id = v_cuota_id;

  if v_imputado >= v_monto then
    update cuota set pagado_at = v_ultimo where id = v_cuota_id;
  else
    update cuota set pagado_at = null where id = v_cuota_id;
  end if;

  return null;
end $$ language plpgsql;

drop trigger if exists trg_sync_cuota_pagada on pago_imputacion;
create trigger trg_sync_cuota_pagada
  after insert or update or delete on pago_imputacion
  for each row execute function sync_cuota_pagada();

-- C.4 · Regla de imputación automática: cuota más antigua primero.
--      Resuelve el caso "llega un pago sin cuota asignada".
--      Devuelve el monto que quedó a cuenta (sin imputar).

create or replace function imputar_pago_automatico(p_pago_id uuid)
returns numeric as $$
declare
  v_tercero_id uuid;
  v_restante   numeric(16,2);
  v_cuota      record;
  v_saldo      numeric(16,2);
  v_aplicar    numeric(16,2);
begin
  select tercero_id, monto into v_tercero_id, v_restante
    from pago where id = p_pago_id;

  -- Descontar lo ya imputado manualmente
  v_restante := v_restante - coalesce(
    (select sum(monto) from pago_imputacion where pago_id = p_pago_id), 0);

  for v_cuota in
    select c.id, c.monto
      from cuota c
      join equipo_torneo et on et.id = c.equipo_torneo_id
     where et.tercero_id = v_tercero_id
       and c.pagado_at is null
     order by c.vence_at, c.numero
  loop
    exit when v_restante <= 0;

    select v_cuota.monto - coalesce(sum(monto), 0) into v_saldo
      from pago_imputacion where cuota_id = v_cuota.id;

    if v_saldo <= 0 then
      continue;
    end if;

    v_aplicar := least(v_restante, v_saldo);

    insert into pago_imputacion (pago_id, cuota_id, monto)
    values (p_pago_id, v_cuota.id, v_aplicar)
    on conflict (pago_id, cuota_id)
      do update set monto = pago_imputacion.monto + excluded.monto;

    v_restante := v_restante - v_aplicar;
  end loop;

  return v_restante;  -- queda a cuenta
end $$ language plpgsql;

comment on function imputar_pago_automatico is
  'Imputa un pago a las cuotas impagas del equipo, de la más antigua '
  'a la más nueva. Devuelve el monto que quedó a cuenta.';


-- ───────────────────────────────────────────────────────────────
-- D. total_facturado DERIVADO
-- ───────────────────────────────────────────────────────────────
-- Era un número duplicado: la suma de las cuotas del equipo, guardado
-- aparte y sin nada que lo mantenga sincronizado. Viola el principio
-- de fuente única dentro de la propia base.
--
-- Se mantiene la columna (la usa el asiento de devengo) pero ahora
-- un trigger la sincroniza con la suma real de cuotas.

create or replace function sync_total_facturado() returns trigger as $$
declare v_et_id uuid;
begin
  v_et_id := coalesce(new.equipo_torneo_id, old.equipo_torneo_id);

  update equipo_torneo
     set total_facturado = coalesce(
       (select sum(monto) from cuota where equipo_torneo_id = v_et_id), 0)
   where id = v_et_id;

  return null;
end $$ language plpgsql;

drop trigger if exists trg_sync_total_facturado on cuota;
create trigger trg_sync_total_facturado
  after insert or update or delete on cuota
  for each row execute function sync_total_facturado();


-- ───────────────────────────────────────────────────────────────
-- E. CAJA POR PREDIO
-- ───────────────────────────────────────────────────────────────
-- caja.tipo tenía unique → una sola caja de efectivo en todo el
-- sistema. Pero el arqueo es por jornada + predio, así que se
-- necesita una caja de efectivo por predio.

alter table caja
  drop constraint if exists caja_tipo_key;

alter table caja
  add column if not exists predio_id uuid references predio(id);

alter table caja
  add column if not exists activo boolean not null default true;

-- Efectivo: una por predio. Transferencia y USD: una sola, global.
drop index if exists uq_caja_efectivo_predio;
create unique index uq_caja_efectivo_predio
  on caja (tipo, predio_id)
  where tipo = 'efectivo';

drop index if exists uq_caja_global;
create unique index uq_caja_global
  on caja (tipo)
  where tipo in ('transferencia','usd');

-- Coherencia: efectivo exige predio; el resto no lo admite.
create or replace function check_caja_predio() returns trigger as $$
begin
  if new.tipo = 'efectivo' and new.predio_id is null then
    raise exception 'Una caja de efectivo debe asignarse a un predio';
  end if;
  if new.tipo <> 'efectivo' and new.predio_id is not null then
    raise exception 'Solo las cajas de efectivo se asignan a un predio';
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_caja_predio on caja;
create trigger trg_caja_predio
  before insert or update on caja
  for each row execute function check_caja_predio();


-- ───────────────────────────────────────────────────────────────
-- F. COHERENCIA DE GASTO — cubrir 'eventual'
-- ───────────────────────────────────────────────────────────────
-- La versión anterior validaba por_fecha, inversion y recurrente.
-- Un gasto eventual podía quedar sin ningún anclaje.

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

  -- NUEVO: un gasto eventual necesita algún anclaje, si no queda huérfano
  if nat = 'eventual'
     and new.torneo_id is null
     and new.predio_id is null
     and new.activo_id is null then
    raise exception
      'Un gasto eventual debe imputarse a un torneo, un predio o un activo';
  end if;

  return new;
end $$ language plpgsql;

-- El trigger trg_gasto_coherente ya existe y apunta a esta función.
-- Al usar CREATE OR REPLACE, toma la nueva definición sin recrearlo.


-- ───────────────────────────────────────────────────────────────
-- G. ÁMBITO DE movimiento_fondo
-- ───────────────────────────────────────────────────────────────
-- Sin torneo_id, todo movimiento de fondo era estructura permanente
-- por omisión. Se explicita para que sea una decisión, no un default.

alter table movimiento_fondo
  add column if not exists torneo_id uuid references torneo(id);

comment on column movimiento_fondo.torneo_id is
  'NULL = movimiento de estructura permanente. Con valor = imputable al torneo.';


-- ───────────────────────────────────────────────────────────────
-- H. VISTAS CORREGIDAS
-- ───────────────────────────────────────────────────────────────

-- H.1 · Estado de cuota: distinguir "pagada" de "todavía no vence".
--       La versión anterior devolvía 'al_dia' para ambos casos.
--       Además: contemplar pagos parciales.

drop view if exists v_estado_cuota cascade;
create view v_estado_cuota as
select
  c.*,
  coalesce(i.imputado, 0) as pagado,
  c.monto - coalesce(i.imputado, 0) as saldo,
  case
    when c.pagado_at is not null                         then 'pagada'
    when coalesce(i.imputado,0) > 0
         and c.vence_at < current_date                   then 'parcial_vencida'
    when coalesce(i.imputado,0) > 0                      then 'parcial'
    when c.vence_at < current_date                       then 'vencida'
    when c.vence_at <= current_date + 7                  then 'por_vencer'
    else                                                      'al_dia'
  end as estado
from cuota c
left join (
  select cuota_id, sum(monto) as imputado
    from pago_imputacion
   group by cuota_id
) i on i.cuota_id = c.id;

comment on view v_estado_cuota is
  'Estado de cada cuota con saldo real. pagada / parcial / '
  'parcial_vencida / vencida / por_vencer / al_dia';


-- H.2 · KPIs de cobranza contemplando pagos parciales.
--       La versión anterior contaba la cuota entera o nada.

drop view if exists v_cobranza_kpi cascade;
create view v_cobranza_kpi as
select
  t.id as torneo_id,
  t.nombre,
  sum(c.monto)                                   as devengado,
  sum(coalesce(i.imputado, 0))                   as cobrado,
  round(100.0 * sum(coalesce(i.imputado,0))
        / nullif(sum(c.monto),0), 1)             as tasa_cobranza,
  round(avg(case when c.pagado_at is not null
                 then c.pagado_at - c.vence_at end), 1)
                                                 as dias_promedio_cobro,
  sum(case when c.vence_at >= current_date
           then c.monto - coalesce(i.imputado,0) else 0 end)
                                                 as por_vencer,
  sum(case when c.vence_at <  current_date
           then c.monto - coalesce(i.imputado,0) else 0 end)
                                                 as vencido
from cuota c
join equipo_torneo et on et.id = c.equipo_torneo_id
join torneo t         on t.id  = et.torneo_id
left join (
  select cuota_id, sum(monto) as imputado
    from pago_imputacion
   group by cuota_id
) i on i.cuota_id = c.id
group by t.id, t.nombre;


-- H.3 · Saldo de cada caja, derivado del libro diario.
--       Necesario para el arqueo: da el "saldo sistema" contra el
--       que se compara lo contado.

create or replace view v_saldo_caja as
select
  cj.id   as caja_id,
  cj.tipo,
  cj.nombre,
  cj.predio_id,
  p.nombre as predio,
  coalesce(sum(l.debe - l.haber), 0) as saldo
from caja cj
left join cuenta ct        on ct.codigo = 'CAJA_' || upper(cj.tipo)
left join asiento_linea l  on l.cuenta_id = ct.id
left join asiento a        on a.id = l.asiento_id
                          and a.anulado_por is null
                          and (cj.predio_id is null or a.predio_id = cj.predio_id)
left join predio p         on p.id = cj.predio_id
where cj.activo
group by cj.id, cj.tipo, cj.nombre, cj.predio_id, p.nombre;


-- H.4 · Cuenta corriente de un equipo: qué debe y qué pagó.

create or replace view v_cuenta_corriente_equipo as
select
  et.id            as equipo_torneo_id,
  te.id            as tercero_id,
  te.nombre        as equipo,
  t.nombre         as torneo,
  et.categoria,
  et.modalidad,
  et.total_facturado,
  coalesce(sum(i.imputado), 0)                    as total_pagado,
  et.total_facturado - coalesce(sum(i.imputado),0) as saldo,
  count(c.id)                                      as cuotas_total,
  count(c.pagado_at)                               as cuotas_pagadas,
  min(case when c.pagado_at is null then c.vence_at end) as proximo_vencimiento
from equipo_torneo et
join tercero te on te.id = et.tercero_id
join torneo t   on t.id  = et.torneo_id
left join cuota c on c.equipo_torneo_id = et.id
left join (
  select cuota_id, sum(monto) as imputado
    from pago_imputacion
   group by cuota_id
) i on i.cuota_id = c.id
group by et.id, te.id, te.nombre, t.nombre, et.categoria,
         et.modalidad, et.total_facturado;


-- H.5 · v_presupuesto_total tenía un alias mal resuelto:
--       referenciaba p.torneo_id sin que p estuviera en scope
--       dentro del subquery correlacionado.

drop view if exists v_presupuesto_total cascade;
create view v_presupuesto_total as
select
  pl.*,
  p.torneo_id,
  p.ejercicio_id,
  case pl.unidad
    when 'por_jornada' then pl.base * pl.cantidad * coalesce((
      select count(*) from jornada j
       where j.torneo_id = p.torneo_id
         and j.estado <> 'suspendida'), 0)
    when 'por_mes' then pl.base * pl.cantidad * 12
    else pl.base
  end as total_presupuestado
from presupuesto_linea pl
join presupuesto p on p.id = pl.presupuesto_id;


commit;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════
-- Ejecutar después de aplicar, debe devolver todo OK.

do $$
declare v_fallas text := '';
begin
  if not exists (select 1 from information_schema.columns
                 where table_name='asiento' and column_name='origen_id') then
    v_fallas := v_fallas || E'\n  - falta asiento.origen_id';
  end if;

  if not exists (select 1 from information_schema.tables
                 where table_name='pago_imputacion') then
    v_fallas := v_fallas || E'\n  - falta tabla pago_imputacion';
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_name='caja' and column_name='predio_id') then
    v_fallas := v_fallas || E'\n  - falta caja.predio_id';
  end if;

  if not exists (select 1 from pg_trigger
                 where tgname='trg_asiento_fecha_periodo') then
    v_fallas := v_fallas || E'\n  - falta trigger trg_asiento_fecha_periodo';
  end if;

  if not exists (select 1 from pg_trigger
                 where tgname='trg_periodo_no_reabre') then
    v_fallas := v_fallas || E'\n  - falta trigger trg_periodo_no_reabre';
  end if;

  if v_fallas <> '' then
    raise exception 'Migración incompleta:%', v_fallas;
  end if;

  raise notice 'Migración 01 aplicada correctamente';
end $$;
