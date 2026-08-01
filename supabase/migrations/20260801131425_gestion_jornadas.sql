-- ============================================================================
-- CAMPA · Pieza 2/6 · Gestión de jornadas + comportamiento de la cuota de liga
--
-- Implementa el Draft 15 · decisiones 49, 50 y 51.
--
-- Tres funciones agnósticas del torneo (regla 12), el trigger que propaga el
-- vencimiento, y los cambios de vista para que una cuota de jornada suspendida
-- deje de contar como deuda vencida.
--
-- El seed de las 284 jornadas del Clausura va aparte: es dato, no estructura.
--
-- ── Cómo deriva el vencimiento de la cuota de liga (decisión 50) ────────────
--
-- `cuota.vence_at` SE MANTIENE NOT NULL y se sincroniza por trigger desde
-- `jornada.fecha`. No se deja nulo para las cuotas de liga.
--
-- Por qué: hay OCHO consumidores de vence_at —v_cobranza_kpi,
-- v_cuenta_corriente_equipo, v_deuda_detalle, v_deuda_equipo, v_estado_cuota,
-- generar_cuotas_plan, sugerir_imputacion y crear_equipo_torneo—. Dejarlo nulo
-- obligaría a los ocho a joinear jornada, y cualquier consulta futura que se
-- olvidara del join leería NULL en silencio.
--
-- La semántica de "derivado" se preserva igual: nadie escribe vence_at a mano
-- en una cuota de liga, lo escribe el trigger. Es el mismo patrón que
-- total_facturado (decisión 27) y pagado_at (decisión 26): columna mantenida
-- por la base, no por quien inserta.
--
-- El trigger va sobre `jornada`, no dentro de mover_jornada(): así cualquier
-- cambio de fecha se propaga, venga de la función o de un UPDATE directo.
-- ============================================================================


-- ── 1. Propagación del vencimiento ──────────────────────────────────────────

create or replace function sync_cuota_vence_at() returns trigger as $$
begin
  -- Solo las cuotas de liga cuelgan de una jornada. Las fijas tienen
  -- jornada_id nulo y no las alcanza este update.
  update cuota
     set vence_at = new.fecha
   where jornada_id = new.id
     and new.fecha is not null;

  return null;
end $$ language plpgsql;

drop trigger if exists trg_sync_cuota_vence_at on jornada;
create trigger trg_sync_cuota_vence_at
  after update of fecha on jornada
  for each row
  when (old.fecha is distinct from new.fecha)
  execute function sync_cuota_vence_at();

comment on function sync_cuota_vence_at is
  'Propaga jornada.fecha a las cuotas de liga que cuelgan de ella. Es lo que '
  'hace que mover una jornada corra el vencimiento de sus cuotas sin tocarlas '
  '(decisiones 39 y 50). Va sobre la tabla y no dentro de mover_jornada() para '
  'que también atrape los UPDATE directos.';


-- ── 2. Alta de jornada ──────────────────────────────────────────────────────
-- Agnóstica del torneo (regla 12): recibe serie, número y fecha. No sabe qué
-- torneo es ni cuántas fechas tiene una serie.

create or replace function crear_jornada(
  p_serie_id uuid,
  p_numero   smallint,
  p_fecha    date default null      -- null: se siembra la grilla sin programar
) returns uuid as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from serie where id = p_serie_id) then
    raise exception 'La serie % no existe', p_serie_id;
  end if;

  if p_numero is null or p_numero < 1 then
    raise exception
      'El número de fecha debe ser positivo (se recibió %)', p_numero;
  end if;

  insert into jornada (serie_id, numero, fecha, estado, es_playoff)
  values (p_serie_id, p_numero, p_fecha, 'programada', false)
  returning id into v_id;

  return v_id;

exception when unique_violation then
  raise exception
    'La serie ya tiene una fecha %. El número de jornada es único dentro de '
    'la serie: para cambiarle el día usá mover_jornada().', p_numero;
end $$ language plpgsql;

comment on function crear_jornada is
  'Alta validada de una jornada de liga. La usa el seed del calendario y la '
  'usará el módulo de calendario de la app: una sola lógica para las dos '
  'puertas (decisión 49). La fecha puede ser null — la grilla se puede sembrar '
  'antes de programar los días.';


-- ── 3. Mover una jornada ────────────────────────────────────────────────────
-- Reprogramar es mover una suspendida: vuelve a 'programada' con la fecha
-- nueva, y sus cuotas vuelven al circuito de cobro (decisiones 49 y 51).

create or replace function mover_jornada(
  p_jornada_id uuid,
  p_nueva_fecha date
) returns void as $$
declare
  v_estado_previo text;
begin
  if p_nueva_fecha is null then
    raise exception
      'mover_jornada necesita una fecha. Para sacar una jornada del calendario '
      'usá suspender_jornada().';
  end if;

  select estado into v_estado_previo from jornada where id = p_jornada_id;
  if not found then
    raise exception 'La jornada % no existe', p_jornada_id;
  end if;

  -- El trigger propaga la fecha nueva a las cuotas de liga de esta jornada.
  update jornada
     set fecha  = p_nueva_fecha,
         estado = case when estado = 'suspendida' then 'programada' else estado end
   where id = p_jornada_id;
end $$ language plpgsql;

comment on function mover_jornada is
  'Cambia el día de una jornada. Las cuotas de liga recalculan su vencimiento '
  'solas, por trigger. Mover una jornada suspendida la reprograma: vuelve a '
  '"programada" y sus cuotas vuelven al circuito de cobro.';


-- ── 4. Suspender una jornada ────────────────────────────────────────────────

create or replace function suspender_jornada(p_jornada_id uuid)
returns void as $$
begin
  if not exists (select 1 from jornada where id = p_jornada_id) then
    raise exception 'La jornada % no existe', p_jornada_id;
  end if;

  update jornada set estado = 'suspendida' where id = p_jornada_id;
end $$ language plpgsql;

comment on function suspender_jornada is
  'Saca una jornada del calendario. Sus cuotas de liga dejan de contar como '
  'deuda vencida mientras esté suspendida (decisión 51): esa fecha no se jugó, '
  'así que el equipo no es moroso de esa cuota. Vuelve al circuito con '
  'mover_jornada(), que la reprograma.';


-- ── 5. Vistas: excluir las cuotas de jornada suspendida ─────────────────────
--
-- El vencimiento no cambia acá —lo mantiene el trigger— pero "está vencida" sí:
-- una cuota de liga cuya jornada está suspendida NO es deuda vencida.
--
-- Sigue contando en deuda_total: el equipo la debe. Lo que no es, todavía, es
-- mora. La distinción importa porque la pantalla de deudores muestra mora.

drop view if exists v_estado_cuota;
create view v_estado_cuota as
select c.id,
       c.equipo_torneo_id,
       c.numero,
       c.vence_at,
       c.monto,
       c.pagado_at,
       coalesce(i.imputado, 0) as pagado,
       c.monto - coalesce(i.imputado, 0) as saldo,
       (j.id is not null and j.estado = 'suspendida') as jornada_suspendida,
       case
         when c.pagado_at is not null                     then 'pagada'
         -- La suspensión gana sobre el vencimiento: no se reclama una fecha
         -- que no se jugó.
         when j.estado = 'suspendida'                     then 'suspendida'
         when coalesce(i.imputado,0) > 0
              and c.vence_at < current_date               then 'parcial_vencida'
         when coalesce(i.imputado,0) > 0                  then 'parcial'
         when c.vence_at < current_date                   then 'vencida'
         when c.vence_at <= current_date + 7              then 'por_vencer'
         else 'al_dia'
       end as estado
  from cuota c
  left join jornada j on j.id = c.jornada_id
  left join (
    select cuota_id, sum(monto) as imputado
      from pago_imputacion group by cuota_id
  ) i on i.cuota_id = c.id;

comment on view v_estado_cuota is
  'Estado de cada cuota. Las de liga cuya jornada está suspendida salen como '
  '"suspendida", no como vencida (decisión 51).';


drop view if exists v_deuda_detalle;
create view v_deuda_detalle as
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
  (j.id is not null and j.estado = 'suspendida') as jornada_suspendida,
  case
    when c.pagado_at is not null                          then 'pagada'
    when j.estado = 'suspendida'                          then 'suspendida'
    when coalesce(imp.monto,0) + coalesce(ant.monto,0) > 0
         and c.vence_at < current_date                    then 'parcial_vencida'
    when coalesce(imp.monto,0) + coalesce(ant.monto,0) > 0 then 'parcial'
    when c.vence_at < current_date                        then 'vencida'
    when c.vence_at <= current_date + 7                   then 'por_vencer'
    else 'al_dia'
  end                                     as estado,
  case when j.estado = 'suspendida' then null
       else current_date - c.vence_at end as dias_atraso,
  c.pagado_at,
  et.id               as equipo_torneo_id
from tercero t
join equipo_torneo et  on et.tercero_id = t.id
join torneo tt         on tt.id  = et.torneo_id
join serie s           on s.id   = et.serie_id
join categoria cat     on cat.id = s.categoria_id
join cuota c           on c.equipo_torneo_id = et.id
left join jornada j    on j.id   = c.jornada_id
left join lateral (
  select sum(monto) as monto from pago_imputacion where cuota_id = c.id
) imp on true
left join lateral (
  select sum(monto) as monto from anticipo_uso where cuota_id = c.id
) ant on true
where t.tipo = 'equipo';

comment on view v_deuda_detalle is
  'Deuda del equipo cuota por cuota. Las de liga con jornada suspendida salen '
  'como "suspendida" y sin días de atraso (decisión 51).';


drop view if exists v_deuda_equipo;
create view v_deuda_equipo as
select
  t.id                as tercero_id,
  t.nombre            as equipo,
  t.email,
  count(distinct et.torneo_id) filter (
    where c.pagado_at is null and c.monto > coalesce(imp.imputado, 0)
  )                   as torneos_con_deuda,
  coalesce(sum(c.monto - coalesce(imp.imputado, 0)) filter (
    where c.pagado_at is null
  ), 0)               as deuda_total,
  -- La suspendida se sigue debiendo, pero NO es mora.
  coalesce(sum(c.monto - coalesce(imp.imputado, 0)) filter (
    where c.pagado_at is null
      and c.vence_at < current_date
      and (j.id is null or j.estado <> 'suspendida')
  ), 0)               as deuda_vencida,
  min(c.vence_at) filter (
    where c.pagado_at is null
      and (j.id is null or j.estado <> 'suspendida')
  )                   as vencimiento_mas_antiguo,
  coalesce(anticipo.saldo, 0) as saldo_a_favor
from tercero t
join equipo_torneo et on et.tercero_id = t.id
join cuota c          on c.equipo_torneo_id = et.id
left join jornada j   on j.id = c.jornada_id
left join lateral (
  select coalesce(sum(pi.monto),0)
       + coalesce((select sum(monto) from anticipo_uso au where au.cuota_id = c.id), 0)
      as imputado
  from pago_imputacion pi where pi.cuota_id = c.id
) imp on true
left join lateral (
  select sum(a.monto) - coalesce(sum(au.monto), 0) as saldo
  from anticipo a
  left join anticipo_uso au on au.anticipo_id = a.id
  where a.tercero_id = t.id
) anticipo on true
where t.tipo = 'equipo'
group by t.id, t.nombre, t.email, anticipo.saldo;

comment on view v_deuda_equipo is
  'Deuda consolidada por equipo. deuda_total incluye las cuotas de jornada '
  'suspendida —se deben igual— pero deuda_vencida y vencimiento_mas_antiguo '
  'las excluyen: no son mora (decisión 51).';


drop view if exists v_cobranza_kpi;
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
  -- Las suspendidas cuentan como por vencer, no como vencido: su fecha se
  -- va a reprogramar.
  sum(case when c.vence_at >= current_date
             or (j.id is not null and j.estado = 'suspendida')
           then c.monto - coalesce(i.imputado,0) else 0 end)
                                                 as por_vencer,
  sum(case when c.vence_at < current_date
            and (j.id is null or j.estado <> 'suspendida')
           then c.monto - coalesce(i.imputado,0) else 0 end)
                                                 as vencido
from cuota c
join equipo_torneo et on et.id = c.equipo_torneo_id
join torneo t         on t.id  = et.torneo_id
left join jornada j   on j.id  = c.jornada_id
left join (
  select cuota_id, sum(monto) as imputado
    from pago_imputacion
   group by cuota_id
) i on i.cuota_id = c.id
group by t.id, t.nombre;

comment on view v_cobranza_kpi is
  'KPIs de cobranza por torneo. Las cuotas de jornada suspendida van a '
  'por_vencer y no a vencido (decisión 51). NOTA: la columna "devengado" es '
  'un nombre heredado — con percibido puro (Draft 12) mide el total '
  'comprometido del plan de cuotas, no un devengo.';


drop view if exists v_cuenta_corriente_equipo;
create view v_cuenta_corriente_equipo as
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
  -- El próximo vencimiento ignora las suspendidas: no tienen fecha firme.
  min(case when c.pagado_at is null
            and (j.id is null or j.estado <> 'suspendida')
           then c.vence_at end)                    as proximo_vencimiento
from equipo_torneo et
join tercero   te  on te.id  = et.tercero_id
join torneo    t   on t.id   = et.torneo_id
join serie     s   on s.id   = et.serie_id
join categoria cat on cat.id = s.categoria_id
left join cuota c  on c.equipo_torneo_id = et.id
left join jornada j on j.id = c.jornada_id
left join (
  select cuota_id, sum(monto) as imputado
    from pago_imputacion
   group by cuota_id
) i on i.cuota_id = c.id
group by et.id, te.id, te.nombre, t.nombre,
         cat.nombre, cat.genero, s.nombre, et.total_facturado;

comment on view v_cuenta_corriente_equipo is
  'Ficha por ficha: qué debe y qué pagó un equipo. proximo_vencimiento ignora '
  'las cuotas de jornada suspendida (decisión 51).';


-- ============================================================================
-- VERIFICACIÓN · correr después de aplicar.
-- ============================================================================

do $$
declare v_fallas text := '';
begin
  -- las tres funciones de gestión
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname in ('crear_jornada','mover_jornada','suspender_jornada')) <> 3
    then v_fallas := v_fallas || E'\n  · faltan funciones de gestión de jornadas'; end if;

  -- el trigger de propagación
  if not exists (select 1 from pg_trigger
     where tgname='trg_sync_cuota_vence_at' and tgrelid='jornada'::regclass)
    then v_fallas := v_fallas || E'\n  · falta el trigger trg_sync_cuota_vence_at'; end if;

  -- vence_at sigue NOT NULL
  if not exists (select 1 from information_schema.columns
       where table_name='cuota' and column_name='vence_at' and is_nullable='NO')
    then v_fallas := v_fallas || E'\n  · cuota.vence_at dejó de ser NOT NULL'; end if;

  -- las cinco vistas contemplan la suspensión
  if (select count(*) from pg_views
       where schemaname='public'
         and viewname in ('v_estado_cuota','v_deuda_detalle','v_deuda_equipo',
                          'v_cobranza_kpi','v_cuenta_corriente_equipo')
         and pg_get_viewdef(('public.'||viewname)::regclass,true) ~ 'suspendida') <> 5
    then v_fallas := v_fallas || E'\n  · alguna vista de deuda no contempla jornada suspendida'; end if;

  -- las funciones son agnósticas: sin números de fechas ni nombres de torneo
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.prokind='f'
                and p.proname in ('crear_jornada','mover_jornada','suspender_jornada')
                and pg_get_functiondef(p.oid) ~ '(Clausura|Apertura|\m(?:13|15|284)\M)')
    then v_fallas := v_fallas || E'\n  · alguna función de jornada tiene valores de torneo (regla 12)'; end if;

  if v_fallas <> '' then
    raise exception 'Pieza 2 incompleta:%', v_fallas;
  end if;

  raise notice 'Pieza 2 OK · gestión de jornadas y vistas al día';
end $$;
