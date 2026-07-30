-- ============================================================================
-- CAMPA · K11 · Estructura del torneo (categoría → serie) y ficha de equipo
--
-- Implementa el Draft 13 · decisiones 29 y 34–41.
--
-- Jerarquía nueva:  torneo → categoria → serie → equipo_torneo (la ficha)
--
-- El género es atributo de la CATEGORÍA, no del equipo ni del tercero: el mismo
-- club presenta equipos en Libre (masculino) y en Femenino. La ficha lo deriva
-- subiendo, y es lo que le permite encontrar su tarifario, que se busca por
-- (torneo, genero, concepto, opcion).
--
-- PRECONDICIÓN VERIFICADA: equipo_torneo y cuota tienen 0 filas, igual que el
-- resto del modelo. Por eso se pueden agregar columnas NOT NULL sin default y
-- sin backfill. Si esto se corriera sobre una base con datos, haría falta una
-- estrategia de migración que acá no existe — ver la verificación al final,
-- que aborta si hay filas.
--
-- Se bajan y recrean v_cuenta_corriente_equipo y v_deuda_detalle: dependen de
-- equipo_torneo.categoria y .modalidad, que se eliminan.
-- ============================================================================

-- ── 0. Precondición ─────────────────────────────────────────────────────────
-- Esta migración agrega columnas NOT NULL sin default y elimina otras. Solo es
-- válida sobre tablas vacías. Postgres ya fallaría al agregar el NOT NULL, pero
-- el mensaje sería críptico: acá aborta temprano y dice por qué.

do $$
declare v_et int; v_c int;
begin
  select count(*) into v_et from equipo_torneo;
  select count(*) into v_c  from cuota;

  if v_et > 0 or v_c > 0 then
    raise exception
      'K11 requiere equipo_torneo y cuota vacías (hay % y % filas). Con datos '
      'haría falta una estrategia de backfill que esta migración no tiene: '
      'de dónde sale la serie de cada ficha, y de qué línea del tarifario '
      'viene cada cuota.', v_et, v_c;
  end if;
end $$;


-- ── 1. Catálogos de estructura ──────────────────────────────────────────────
-- Por torneo, como el tarifario. Al crear un torneo se clonan del anterior.

create table categoria (
  id        uuid primary key default gen_random_uuid(),
  torneo_id uuid     not null references torneo(id) on delete cascade,
  nombre    text     not null,          -- 'Libre', '+30', '+40', 'Femenino', 'Flex'
  genero    genero   not null,          -- lo heredan las fichas, subiendo desde la serie
  orden     smallint,                   -- presentación
  unique (torneo_id, nombre)
);

comment on table categoria is
  'División que corre el equipo, por torneo. El género es atributo suyo: '
  'Libre/+30/+40 masculinas, Femenino/Flex femeninas (decisión 35).';

comment on column categoria.genero is
  'Fuente del género de las fichas. No se duplica en equipo_torneo: se deriva '
  'subiendo serie → categoria. Es lo que resuelve qué plan_tarifa aplica.';

create index idx_categoria_torneo on categoria(torneo_id);


create table serie (
  id           uuid     primary key default gen_random_uuid(),
  categoria_id uuid     not null references categoria(id) on delete cascade,
  nombre       text     not null,       -- 'A', 'B', 'C'
  orden        smallint,
  unique (categoria_id, nombre)
);

comment on table serie is
  'Nivel dentro de la categoría. Cuelga de la categoría y no del torneo: la '
  '"Serie A de Libre" y la "Serie A de +30" son filas distintas (decisión 34). '
  'Son datos y no un enum porque las series crecen con el tiempo.';

create index idx_serie_categoria on serie(categoria_id);


-- ── 2. Se bajan las vistas que dependen de las columnas a eliminar ──────────
-- v_cuenta_corriente_equipo lee et.categoria y et.modalidad;
-- v_deuda_detalle lee et.categoria. Se recrean en el paso 6.

drop view if exists v_cuenta_corriente_equipo;
drop view if exists v_deuda_detalle;


-- ── 3. equipo_torneo: la ficha ──────────────────────────────────────────────

-- Sale el texto libre ('+40 A'): lo reemplaza serie_id. Categoría y género no
-- se duplican en la ficha — duplicarlos permitiría que contradigan a la serie.
alter table equipo_torneo drop column categoria;

-- Sale modalidad: su CHECK ('cuotas','unitario','cinco_fechas') quedó de un
-- modelo anterior al tarifario y no alcanza para expresar las dos elecciones
-- que el plan exige (una opción de inscripción y otra de partidos).
alter table equipo_torneo drop column modalidad;

-- Sale asiento_id: sin devengo de ingresos no hay asiento que colgar de la
-- ficha. El asiento del cobro pertenece a pago (Draft 12).
alter table equipo_torneo drop column asiento_id;

alter table equipo_torneo
  add column serie_id            uuid not null references serie(id),
  add column plan_inscripcion_id uuid not null references plan_tarifa(id),
  add column plan_partidos_id    uuid not null references plan_tarifa(id),
  add column medio_previsto      medio_pago not null;

-- La ficha se inserta antes que sus cuotas y el trigger sync_total_facturado
-- la corrige después: sin default, B0 tendría que pasar un 0 a mano.
alter table equipo_torneo alter column total_facturado set default 0;

comment on column equipo_torneo.serie_id is
  'Nivel más específico de la estructura. Categoría y género se derivan '
  'subiendo (decisión 36).';

comment on column equipo_torneo.plan_inscripcion_id is
  'Opción de tarifario elegida para el concepto inscripcion.';

comment on column equipo_torneo.plan_partidos_id is
  'Opción de tarifario elegida para el concepto partidos.';

comment on column equipo_torneo.medio_previsto is
  'Congela si las cuotas toman precio_efectivo o precio_transferencia. Pagar '
  'después por otro medio no reabre el importe (decisión 40).';

comment on column equipo_torneo.total_facturado is
  'Suma de las cuotas, mantenida por trigger. NO es la deuda: la deuda es la '
  'mora, cuotas vencidas e impagas.';

create index idx_equipo_torneo_serie on equipo_torneo(serie_id);


-- ── 4. cuota ────────────────────────────────────────────────────────────────

alter table cuota
  -- Decisión 29: toda cuota de equipo nace de una línea del tarifario y hereda
  -- de ella el concepto, que es lo que rutea el asiento del cobro. NOT NULL
  -- porque no existen cuotas de equipo sin tarifario: las de moratoria viven
  -- en compromiso, nunca acá.
  add column plan_tarifa_linea_id uuid not null references plan_tarifa_linea(id),
  -- Decisión 39: las cuotas por_partido vencen con su jornada y se mueven si
  -- se reprograma. Nullable: las de fecha propia (fecha_fija,
  -- bloque_adelantado) no la usan.
  add column jornada_id uuid references jornada(id);

comment on column cuota.plan_tarifa_linea_id is
  'Línea del tarifario que originó la cuota. De acá sale el concepto '
  '(inscripcion/partidos) que rutea el asiento del cobro (decisión 29). '
  'El monto NO se lee de acá: se copió al generar la cuota (decisión 41).';

comment on column cuota.jornada_id is
  'Solo para cuotas por_partido de liga: la jornada que define su vencimiento. '
  'Reprogramar la jornada corre el vencimiento (decisión 39).';

create index idx_cuota_plan_linea on cuota(plan_tarifa_linea_id);
create index idx_cuota_jornada    on cuota(jornada_id) where jornada_id is not null;


-- ── 5. Coherencia de la ficha ───────────────────────────────────────────────
-- Las FKs garantizan que los ids existen, no que sean los correctos. Sin esto
-- una ficha de Libre podría apuntar al tarifario femenino, o al de otro torneo,
-- y el error sería silencioso.

create or replace function check_ficha_coherente() returns trigger as $$
declare
  v_genero_ficha genero;
  v_torneo_serie uuid;
  p              record;
  v_plan         record;
begin
  -- El género y el torneo salen de la estructura, subiendo desde la serie.
  select cat.genero, cat.torneo_id
    into v_genero_ficha, v_torneo_serie
    from serie s
    join categoria cat on cat.id = s.categoria_id
   where s.id = new.serie_id;

  if v_torneo_serie <> new.torneo_id then
    raise exception
      'La serie pertenece al torneo % y la ficha al torneo %',
      v_torneo_serie, new.torneo_id;
  end if;

  -- Cada plan tiene que ser del torneo y género de la ficha, y del concepto
  -- que le corresponde.
  for p in
    select 'inscripcion'::concepto_pago as esperado, new.plan_inscripcion_id as id
    union all
    select 'partidos'::concepto_pago,                new.plan_partidos_id
  loop
    select * into v_plan from plan_tarifa where id = p.id;

    if v_plan.concepto <> p.esperado then
      raise exception
        'El plan % es del concepto % y se lo asignó como %',
        p.id, v_plan.concepto, p.esperado;
    end if;

    if v_plan.torneo_id <> new.torneo_id then
      raise exception
        'El plan % es del torneo % y la ficha del torneo %',
        p.id, v_plan.torneo_id, new.torneo_id;
    end if;

    if v_plan.genero <> v_genero_ficha then
      raise exception
        'El plan % es de género % y la ficha es % (según su categoría)',
        p.id, v_plan.genero, v_genero_ficha;
    end if;
  end loop;

  return new;
end $$ language plpgsql;

drop trigger if exists trg_ficha_coherente on equipo_torneo;
create trigger trg_ficha_coherente
  before insert or update of serie_id, torneo_id,
                             plan_inscripcion_id, plan_partidos_id
  on equipo_torneo
  for each row execute function check_ficha_coherente();

comment on function check_ficha_coherente is
  'La serie y los dos planes tienen que ser del mismo torneo que la ficha, y '
  'los planes del género que sale de la categoría y del concepto que les '
  'corresponde. Las FKs solas no lo garantizan.';


-- ── 6. Vistas recreadas ─────────────────────────────────────────────────────
-- categoria ya no es una columna de la ficha: se llega por serie → categoria.
-- Se expone además serie y genero, que antes no existían.

create or replace view v_cuenta_corriente_equipo as
select
  et.id            as equipo_torneo_id,
  te.id            as tercero_id,
  te.nombre        as equipo,
  t.nombre         as torneo,
  cat.nombre       as categoria,
  cat.genero       as genero,
  s.nombre         as serie,
  et.total_facturado,
  coalesce(sum(i.imputado), 0)                     as total_pagado,
  et.total_facturado - coalesce(sum(i.imputado),0) as saldo,
  count(c.id)                                      as cuotas_total,
  count(c.pagado_at)                               as cuotas_pagadas,
  min(case when c.pagado_at is null then c.vence_at end) as proximo_vencimiento
from equipo_torneo et
join tercero   te  on te.id  = et.tercero_id
join torneo    t   on t.id   = et.torneo_id
join serie     s   on s.id   = et.serie_id
join categoria cat on cat.id = s.categoria_id
left join cuota c on c.equipo_torneo_id = et.id
left join (
  select cuota_id, sum(monto) as imputado
    from pago_imputacion
   group by cuota_id
) i on i.cuota_id = c.id
group by et.id, te.id, te.nombre, t.nombre,
         cat.nombre, cat.genero, s.nombre, et.total_facturado;

comment on view v_cuenta_corriente_equipo is
  'Ficha por ficha: qué debe y qué pagó un equipo en cada torneo. Categoría y '
  'género salen de la estructura, subiendo desde la serie.';


create or replace view v_deuda_detalle as
select
  t.id                as tercero_id,
  t.nombre            as equipo,
  tt.id               as torneo_id,
  tt.nombre           as torneo,
  tt.estado           as torneo_estado,
  cat.nombre          as categoria,
  cat.genero          as genero,
  s.nombre            as serie,
  c.id                as cuota_id,
  c.numero            as cuota_numero,
  c.vence_at,
  c.monto,
  coalesce(imp.monto, 0) + coalesce(ant.monto, 0)  as pagado,
  c.monto - coalesce(imp.monto, 0) - coalesce(ant.monto, 0) as saldo,
  coalesce(ant.monto, 0)                  as pagado_con_anticipo,
  case
    when c.pagado_at is not null                          then 'pagada'
    when coalesce(imp.monto,0) + coalesce(ant.monto,0) > 0
         and c.vence_at < current_date                    then 'parcial_vencida'
    when coalesce(imp.monto,0) + coalesce(ant.monto,0) > 0 then 'parcial'
    when c.vence_at < current_date                        then 'vencida'
    when c.vence_at <= current_date + 7                   then 'por_vencer'
    else 'al_dia'
  end                                     as estado,
  current_date - c.vence_at               as dias_atraso,
  c.pagado_at,
  et.id               as equipo_torneo_id
from tercero t
join equipo_torneo et  on et.tercero_id = t.id
join torneo tt         on tt.id  = et.torneo_id
join serie s           on s.id   = et.serie_id
join categoria cat     on cat.id = s.categoria_id
join cuota c           on c.equipo_torneo_id = et.id
left join lateral (
  select sum(monto) as monto from pago_imputacion where cuota_id = c.id
) imp on true
left join lateral (
  select sum(monto) as monto from anticipo_uso where cuota_id = c.id
) ant on true
where t.tipo = 'equipo';

comment on view v_deuda_detalle is
  'Deuda del equipo cuota por cuota, en todos sus torneos. Alimenta el '
  'selector de imputación al registrar un pago.';


-- ============================================================================
-- VERIFICACIÓN · correr después de aplicar. Debe devolver todo OK.
-- ============================================================================

do $$
declare v_fallas text := '';
begin
  if not exists (select 1 from information_schema.tables
                 where table_name = 'categoria') then
    v_fallas := v_fallas || E'\n  · falta la tabla categoria';
  end if;

  if not exists (select 1 from information_schema.tables
                 where table_name = 'serie') then
    v_fallas := v_fallas || E'\n  · falta la tabla serie';
  end if;

  if exists (select 1 from information_schema.columns
             where table_name = 'equipo_torneo'
               and column_name in ('categoria','modalidad','asiento_id')) then
    v_fallas := v_fallas || E'\n  · equipo_torneo conserva columnas que debían salir';
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_name = 'equipo_torneo'
                   and column_name = 'serie_id' and is_nullable = 'NO') then
    v_fallas := v_fallas || E'\n  · falta equipo_torneo.serie_id NOT NULL';
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_name = 'cuota'
                   and column_name = 'plan_tarifa_linea_id' and is_nullable = 'NO') then
    v_fallas := v_fallas || E'\n  · falta cuota.plan_tarifa_linea_id NOT NULL';
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_name = 'cuota'
                   and column_name = 'jornada_id' and is_nullable = 'YES') then
    v_fallas := v_fallas || E'\n  · falta cuota.jornada_id nullable';
  end if;

  if not exists (select 1 from pg_views
                 where viewname = 'v_cuenta_corriente_equipo') then
    v_fallas := v_fallas || E'\n  · no se recreó v_cuenta_corriente_equipo';
  end if;

  if not exists (select 1 from pg_views where viewname = 'v_deuda_detalle') then
    v_fallas := v_fallas || E'\n  · no se recreó v_deuda_detalle';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_ficha_coherente') then
    v_fallas := v_fallas || E'\n  · falta el trigger trg_ficha_coherente';
  end if;

  if v_fallas <> '' then
    raise exception 'K11 incompleta:%', v_fallas;
  end if;

  raise notice 'K11 OK · estructura categoría/serie y ficha reestructurada';
end $$;
