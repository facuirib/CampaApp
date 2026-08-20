-- ═══════════════════════════════════════════════════════════════════════════
-- v_presupuesto_ambito · una fila por presupuesto, para el encabezado de /presupuesto
--
-- ⚠️ PROPUESTA · NO APLICADA.
--
-- ── Para qué ───────────────────────────────────────────────────────────────
--
-- La pantalla de carga agrupa por ÁMBITO —«Clausura 2026» y «Estructura
-- permanente»— y cada sección muestra su total. `v_presupuesto_total` da una
-- fila por LÍNEA, así que ese total es una suma y por la regla 1 no lo puede
-- hacer el front.
--
-- Además resuelve tres cosas que la pantalla necesita y hoy no tiene de dónde
-- sacar sin recorrer filas:
--
--   · `estado`, que en `v_presupuesto_total` NO ESTÁ — la vista filtra por él
--     pero no lo expone, así que desde la pantalla no se puede saber si un
--     presupuesto está en borrador (§ver abajo, es el punto importante).
--   · `lineas`, para el empty state de una sección sin líneas.
--   · `lineas_sin_calendario`, las que tienen factor 0 porque su torneo no
--     tiene jornadas ni días cargados. Sin ese dato la pantalla muestra «$0»
--     pelado y se lee como bug.
--
-- ── Por qué NO se puede derivar de v_presupuesto_total ─────────────────────
--
-- Porque **aquella sólo expone los aprobados** (20260819200000). Un presupuesto
-- en BORRADOR no aparece ahí — que es correcto para el cashflow y **inservible
-- para la pantalla de carga**, cuyo trabajo es justamente editar borradores.
--
-- Por eso esta vista sale de `presupuesto` y calcula el total con un LATERAL
-- contra `v_presupuesto_total`: el encabezado del borrador existe, con sus
-- líneas contadas, y su total da 0 hasta que se apruebe. Es la lectura
-- honesta: «tenés 3 líneas cargadas y todavía no proyectan nada».
--
-- ── El total de un borrador da 0, y está bien ──────────────────────────────
--
-- No es un bug: es la consecuencia visible de la decisión A. La pantalla lo
-- explica con el badge de estado al lado, y el botón de aprobar es el que lo
-- convierte en plata proyectada.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_presupuesto_ambito as
select
  p.id                                             as presupuesto_id,
  p.torneo_id,
  p.ejercicio_id,
  e.anio,
  coalesce(t.nombre, 'Estructura permanente')      as ambito,
  p.torneo_id is null                              as es_estructura,
  p.estado,

  -- Las líneas se cuentan SIEMPRE (sobre la tabla), el total sólo suma lo que
  -- v_presupuesto_total deja pasar: en borrador da 0 con las líneas visibles.
  (select count(*) from presupuesto_linea pl
    where pl.presupuesto_id = p.id)::int           as lineas,

  coalesce(agg.total, 0)::numeric(16,2)            as total,
  coalesce(agg.sin_calendario, 0)::int             as lineas_sin_calendario

from presupuesto p
  join ejercicio e on e.id = p.ejercicio_id
  left join torneo t on t.id = p.torneo_id
  left join lateral (
    select sum(v.total_presupuestado)               as total,
           count(*) filter (where v.factor = 0)     as sin_calendario
      from v_presupuesto_total v
     where v.presupuesto_id = p.id
  ) agg on true;

comment on view public.v_presupuesto_ambito is
  'Una fila por presupuesto, para el encabezado de cada sección de '
  '/presupuesto: ámbito (torneo o estructura), estado, cuántas líneas tiene y '
  'cuánto suma. Sale de `presupuesto` y no de v_presupuesto_total porque esa '
  'sólo expone los APROBADOS y la pantalla de carga necesita ver los '
  'borradores. Por eso `lineas` cuenta sobre la tabla y `total` suma lo '
  'proyectable: un borrador muestra sus líneas con total 0, que es la lectura '
  'correcta —todavía no proyecta—. `lineas_sin_calendario` son las que dan '
  'factor 0 porque su torneo no tiene jornadas ni días de cancha cargados: sin '
  'ese dato la pantalla mostraría $0 sin explicación.';
