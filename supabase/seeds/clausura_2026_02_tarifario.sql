-- ============================================================================
-- CAMPA · Seed de PRODUCCIÓN · Clausura 2026 · 2/2 · Tarifario
--
-- Requiere que 01_estructura ya haya corrido: necesita el torneo.
--
-- 8 planes = 2 géneros × 2 conceptos (inscripción, partidos) × 2 opciones.
-- El equipo elige UNA opción por concepto en su ficha.
--
-- Idempotente: on conflict do nothing contra las claves naturales
-- (torneo, género, concepto, opción) y (plan, línea).
--
-- ── Cómo se representa cada regla ───────────────────────────────────────────
--
--   fecha_fija         precio_* es el importe de esa cuota.
--                      El vencimiento va en fecha_referencia.
--                      hito_jornada_id queda NULL: apuntaría a una jornada del
--                      calendario, y la grilla de Clausura todavía no existe.
--                      Ver nota al pie.
--
--   por_partido        precio_* es el arancel UNITARIO por partido.
--                      fecha_desde/fecha_hasta acotan el rango de fechas.
--                      cantidad_esperada = cuántos partidos se prevén.
--                      Genera una cuota por fecha, atada a su jornada.
--
--   bloque_adelantado  precio_* es el TOTAL DEL BLOQUE, no el unitario.
--                      El unitario queda en observacion, informativo.
--                      Genera una sola cuota.
--
--   es_playoff         no genera cuota al armar la ficha: no se sabe si el
--                      equipo clasifica. Se cobra aparte. Por eso lleva
--                      fecha_desde/hasta en NULL (el CHECK lo permite).
-- ============================================================================


-- ── MASCULINO · INSCRIPCIÓN ─────────────────────────────────────────────────

insert into plan_tarifa (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
select t.id, 'masculino', 'inscripcion', 1, 'Pago único'
  from torneo t where t.temporada = 'clausura' and t.anio = 2026
on conflict (torneo_id, genero, concepto, opcion_orden) do nothing;

insert into plan_tarifa_linea (
  plan_tarifa_id, linea_orden, concepto_label,
  precio_efectivo, precio_transferencia, regla, fecha_referencia)
select p.id, v.orden, v.label, v.efec, v.transf, 'fecha_fija', v.vence::date
from plan_tarifa p
join torneo t on t.id = p.torneo_id
join (values
  (1, 'Seña',      800000,  1000000, '2026-07-10'),
  (2, 'Restante', 1700000,  2000000, '2026-08-08')
) as v(orden, label, efec, transf, vence) on true
where t.temporada='clausura' and t.anio=2026
  and p.genero='masculino' and p.concepto='inscripcion' and p.opcion_orden=1
on conflict (plan_tarifa_id, linea_orden) do nothing;


insert into plan_tarifa (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
select t.id, 'masculino', 'inscripcion', 2, 'Cuotas'
  from torneo t where t.temporada = 'clausura' and t.anio = 2026
on conflict (torneo_id, genero, concepto, opcion_orden) do nothing;

insert into plan_tarifa_linea (
  plan_tarifa_id, linea_orden, concepto_label,
  precio_efectivo, precio_transferencia, regla, fecha_referencia)
select p.id, v.orden, v.label, v.efec, v.transf, 'fecha_fija', v.vence::date
from plan_tarifa p
join torneo t on t.id = p.torneo_id
join (values
  (1, 'Seña',     800000, 1000000, '2026-07-10'),
  (2, 'Cuota 1', 1000000, 1200000, '2026-08-08'),
  (3, 'Cuota 2', 1000000, 1200000, '2026-09-05')
) as v(orden, label, efec, transf, vence) on true
where t.temporada='clausura' and t.anio=2026
  and p.genero='masculino' and p.concepto='inscripcion' and p.opcion_orden=2
on conflict (plan_tarifa_id, linea_orden) do nothing;


-- ── MASCULINO · PARTIDOS ────────────────────────────────────────────────────

insert into plan_tarifa (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
select t.id, 'masculino', 'partidos', 1, 'Pago por fecha'
  from torneo t where t.temporada = 'clausura' and t.anio = 2026
on conflict (torneo_id, genero, concepto, opcion_orden) do nothing;

insert into plan_tarifa_linea (
  plan_tarifa_id, linea_orden, concepto_label,
  precio_efectivo, precio_transferencia, regla,
  fecha_desde, fecha_hasta, cantidad_esperada, es_playoff,
  fecha_referencia, observacion)
select p.id, v.orden, v.label, v.efec, v.transf, v.regla::regla_vencimiento,
       v.desde, v.hasta, v.cant, v.playoff, v.vence::date, v.obs
from plan_tarifa p
join torneo t on t.id = p.torneo_id
join (values
  (1, 'Fechas 1–10',            430000,  490000, 'por_partido',
      1::smallint, 10::smallint, 10::smallint, false, null,
      'Arancel unitario: van pagando partido a partido'),
  (2, 'Fechas 11–15 (bloque)', 2300000, 2600000, 'bloque_adelantado',
      11::smallint, 15::smallint, 5::smallint, false, '2026-11-07',
      'TOTAL del bloque: 5 fechas juntas por adelantado (460.000/520.000 × 5)'),
  (3, 'Playoffs',               470000,  530000, 'por_partido',
      null::smallint, null::smallint, 3::smallint, true, null,
      'Eliminación directa, máx 3: cuartos, semi, final. No genera cuota al armar la ficha')
) as v(orden, label, efec, transf, regla, desde, hasta, cant, playoff, vence, obs) on true
where t.temporada='clausura' and t.anio=2026
  and p.genero='masculino' and p.concepto='partidos' and p.opcion_orden=1
on conflict (plan_tarifa_id, linea_orden) do nothing;


insert into plan_tarifa (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
select t.id, 'masculino', 'partidos', 2, 'Cuotas'
  from torneo t where t.temporada = 'clausura' and t.anio = 2026
on conflict (torneo_id, genero, concepto, opcion_orden) do nothing;

insert into plan_tarifa_linea (
  plan_tarifa_id, linea_orden, concepto_label,
  precio_efectivo, precio_transferencia, regla, fecha_referencia)
select p.id, v.orden, v.label, v.efec, v.transf, 'fecha_fija', v.vence::date
from plan_tarifa p
join torneo t on t.id = p.torneo_id
join (values
  (1, 'Cuota 1', 2100000, 2400000, '2026-09-05'),
  (2, 'Cuota 2', 2100000, 2400000, '2026-10-03'),
  (3, 'Cuota 3', 2100000, 2400000, '2026-11-07')
) as v(orden, label, efec, transf, vence) on true
where t.temporada='clausura' and t.anio=2026
  and p.genero='masculino' and p.concepto='partidos' and p.opcion_orden=2
on conflict (plan_tarifa_id, linea_orden) do nothing;


-- ── FEMENINO · INSCRIPCIÓN ──────────────────────────────────────────────────

insert into plan_tarifa (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
select t.id, 'femenino', 'inscripcion', 1, 'Pago único'
  from torneo t where t.temporada = 'clausura' and t.anio = 2026
on conflict (torneo_id, genero, concepto, opcion_orden) do nothing;

insert into plan_tarifa_linea (
  plan_tarifa_id, linea_orden, concepto_label,
  precio_efectivo, precio_transferencia, regla, fecha_referencia)
select p.id, v.orden, v.label, v.efec, v.transf, 'fecha_fija', v.vence::date
from plan_tarifa p
join torneo t on t.id = p.torneo_id
join (values
  (1, 'Seña',     270000, 300000, '2026-07-10'),
  (2, 'Restante', 370000, 400000, '2026-08-08')
) as v(orden, label, efec, transf, vence) on true
where t.temporada='clausura' and t.anio=2026
  and p.genero='femenino' and p.concepto='inscripcion' and p.opcion_orden=1
on conflict (plan_tarifa_id, linea_orden) do nothing;


insert into plan_tarifa (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
select t.id, 'femenino', 'inscripcion', 2, 'Cuotas'
  from torneo t where t.temporada = 'clausura' and t.anio = 2026
on conflict (torneo_id, genero, concepto, opcion_orden) do nothing;

insert into plan_tarifa_linea (
  plan_tarifa_id, linea_orden, concepto_label,
  precio_efectivo, precio_transferencia, regla, fecha_referencia)
select p.id, v.orden, v.label, v.efec, v.transf, 'fecha_fija', v.vence::date
from plan_tarifa p
join torneo t on t.id = p.torneo_id
join (values
  (1, 'Seña',    270000, 300000, '2026-07-10'),
  (2, 'Cuota 1', 230000, 250000, '2026-08-08'),
  (3, 'Cuota 2', 230000, 250000, '2026-09-05')
) as v(orden, label, efec, transf, vence) on true
where t.temporada='clausura' and t.anio=2026
  and p.genero='femenino' and p.concepto='inscripcion' and p.opcion_orden=2
on conflict (plan_tarifa_id, linea_orden) do nothing;


-- ── FEMENINO · PARTIDOS ─────────────────────────────────────────────────────
--
-- ── Nota sobre el bloque femenino (línea 2) ─────────────────────────────────
--
-- 435.000 / 510.000 es el TOTAL de las 3 fechas, no el unitario. Verificado
-- contra la fuente antes de sembrar.
--
-- Se deja escrito porque es el error más fácil de cometer acá: el bloque
-- masculino sí nace de un unitario (460.000/520.000 × 5 = 2.300.000/2.600.000),
-- así que la tentación es multiplicar también el femenino y cargar 1.305.000.
-- Es incorrecto — y la asimetría entre géneros está documentada en
-- arquitectura.md §3.18.
--
-- Dos controles que lo confirman, por si alguien vuelve a dudar:
--
--   1. Razón femenino/masculino por fecha. Todo el tarifario femenino corre
--      al 30–34% del masculino (seña 34%, fecha suelta 30%, playoff 32%).
--      Con 435.000 de total → 145.000 por fecha = 32%, en línea.
--      Con 1.305.000        → 435.000 por fecha = 95%, fuera de escala, y
--      3,3× el precio de una fecha suelta femenina (130.000).
--
--   2. Paridad entre las dos opciones del mismo concepto. Pagar por fecha y
--      pagar en cuotas tienen que costar parecido:
--        masculino  6.600.000 vs 6.300.000  → −4,5%
--        femenino   1.735.000 vs 1.560.000  → −10%    (con 435.000) ✓
--        femenino   2.605.000 vs 1.560.000  → −40%    (con 1.305.000) ✗

insert into plan_tarifa (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
select t.id, 'femenino', 'partidos', 1, 'Pago por fecha'
  from torneo t where t.temporada = 'clausura' and t.anio = 2026
on conflict (torneo_id, genero, concepto, opcion_orden) do nothing;

insert into plan_tarifa_linea (
  plan_tarifa_id, linea_orden, concepto_label,
  precio_efectivo, precio_transferencia, regla,
  fecha_desde, fecha_hasta, cantidad_esperada, es_playoff,
  fecha_referencia, observacion)
select p.id, v.orden, v.label, v.efec, v.transf, v.regla::regla_vencimiento,
       v.desde, v.hasta, v.cant, v.playoff, v.vence::date, v.obs
from plan_tarifa p
join torneo t on t.id = p.torneo_id
join (values
  (1, 'Fechas 1–10',            130000,  150000, 'por_partido',
      1::smallint, 10::smallint, 10::smallint, false, null,
      'Arancel unitario: van pagando partido a partido'),
  (2, 'Fechas 11–13 (bloque)',  435000,  510000, 'bloque_adelantado',
      11::smallint, 13::smallint, 3::smallint, false, '2026-11-07',
      'TOTAL del bloque: las 3 fechas juntas por adelantado. El importe YA ES el total, no el unitario — a diferencia del masculino, que nace de 460.000/520.000 × 5'),
  (3, 'Playoffs',               150000,  180000, 'por_partido',
      null::smallint, null::smallint, 3::smallint, true, null,
      'Eliminación directa, máx 3: cuartos, semi, final. No genera cuota al armar la ficha')
) as v(orden, label, efec, transf, regla, desde, hasta, cant, playoff, vence, obs) on true
where t.temporada='clausura' and t.anio=2026
  and p.genero='femenino' and p.concepto='partidos' and p.opcion_orden=1
on conflict (plan_tarifa_id, linea_orden) do nothing;


insert into plan_tarifa (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
select t.id, 'femenino', 'partidos', 2, 'Cuotas'
  from torneo t where t.temporada = 'clausura' and t.anio = 2026
on conflict (torneo_id, genero, concepto, opcion_orden) do nothing;

insert into plan_tarifa_linea (
  plan_tarifa_id, linea_orden, concepto_label,
  precio_efectivo, precio_transferencia, regla, fecha_referencia)
select p.id, v.orden, v.label, v.efec, v.transf, 'fecha_fija', v.vence::date
from plan_tarifa p
join torneo t on t.id = p.torneo_id
join (values
  (1, 'Cuota 1', 600000, 700000, '2026-09-05'),
  (2, 'Cuota 2', 600000, 700000, '2026-10-03'),
  (3, 'Cuota 3', 360000, 420000, '2026-11-07')
) as v(orden, label, efec, transf, vence) on true
where t.temporada='clausura' and t.anio=2026
  and p.genero='femenino' and p.concepto='partidos' and p.opcion_orden=2
on conflict (plan_tarifa_id, linea_orden) do nothing;


-- ── Verificación ────────────────────────────────────────────────────────────

do $$
declare v_torneo uuid; v_planes int; v_lineas int; v_fallas text := '';
begin
  select id into v_torneo from torneo where temporada='clausura' and anio=2026;
  if v_torneo is null then
    raise exception 'Falta el torneo Clausura 2026: correr primero 01_estructura';
  end if;

  select count(*) into v_planes from plan_tarifa where torneo_id = v_torneo;
  if v_planes <> 8 then
    v_fallas := v_fallas || format(E'\n  · planes: %s, se esperaban 8', v_planes);
  end if;

  select count(*) into v_lineas
    from plan_tarifa_linea l join plan_tarifa p on p.id = l.plan_tarifa_id
   where p.torneo_id = v_torneo;
  if v_lineas <> 22 then
    v_fallas := v_fallas || format(E'\n  · líneas: %s, se esperaban 22', v_lineas);
  end if;

  -- Cada género tiene que tener sus dos conceptos con dos opciones cada uno.
  if exists (
    select 1 from (values ('masculino'),('femenino')) g(genero)
    cross join (values ('inscripcion'),('partidos')) c(concepto)
    where (select count(*) from plan_tarifa p
            where p.torneo_id = v_torneo
              and p.genero = g.genero::genero
              and p.concepto = c.concepto::concepto_pago) <> 2
  ) then
    v_fallas := v_fallas || E'\n  · algún género/concepto no tiene sus 2 opciones';
  end if;

  if v_fallas <> '' then
    raise exception 'Seed de tarifario incompleto:%', v_fallas;
  end if;

  raise notice 'Tarifario Clausura 2026 OK · 8 planes · 22 líneas';
end $$;
