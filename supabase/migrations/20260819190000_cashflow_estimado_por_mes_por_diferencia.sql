-- ═══════════════════════════════════════════════════════════════════════════
-- v_cashflow_estimado · la rama por_mes estima POR DIFERENCIA
--
-- ⚠️ PROPUESTA · NO APLICADA. Vista de HORACIO: se avisa en coordinacion.md.
--
-- Cierra el doble conteo que `20260819180000` dejó anotado en `por_mes`. Pero
-- **no con el mismo criterio que las otras dos ramas**, y la diferencia es el
-- punto de esta migración.
--
-- ── Por qué por_mes NO puede ser binaria ───────────────────────────────────
--
-- En `por_partido` y `por_dia_cancha` la exclusión binaria es correcta: la
-- factura del árbitro cubre la jornada completa, así que apenas aparece el
-- gasto real, la estimación de esa jornada sobra entera.
--
-- Los fijos mensuales no funcionan así. Un alquiler entra **fraccionado** —uno
-- por predio, o en cuotas— y con la regla binaria **el primer gasto que se
-- cargue apagaría el mes entero**. Con los datos de hoy se ve la forma exacta
-- del problema: $777.000 cargados apagarían una estimación de $1.900.000, y la
-- proyección quedaría **$1.123.000 corta** en agosto, sin ninguna alarma.
--
-- Un cashflow que sobreestima gastos molesta; uno que los subestima miente en
-- la dirección peligrosa.
--
-- ── El criterio ────────────────────────────────────────────────────────────
--
--     estimado del mes = GREATEST(presupuestado − real acumulado del mes, 0)
--
-- El estimado sólo cubre **el hueco**: lo que el presupuesto dice que va a
-- pasar y todavía no se cargó. A medida que entran los gastos del mes, la
-- estimación se achica sola.
--
-- **El tope en 0 no es cosmético.** Si el real supera al presupuestado, el
-- exceso YA está contado como gasto real en `v_cashflow_comprometido`. Sin el
-- `greatest`, la diferencia daría negativa y —al invertirle el signo— la vista
-- emitiría un monto POSITIVO: un gasto convertido en ingreso. Es el modo de
-- falla más feo posible, porque el número sigue siendo plausible.
--
-- ── Las otras dos ramas NO cambian ─────────────────────────────────────────
--
-- `por_partido` y `por_dia_cancha` quedan textuales, binarias, tal como las
-- dejó `20260819180000`. La inconsistencia entre ramas es deliberada: responde
-- a cómo se factura cada cosa, no a un descuido.
--
-- ── Detalles de implementación ─────────────────────────────────────────────
--
-- · El real se acumula en un `cross join lateral`, no en un subselect por
--   columna: hace falta el mismo valor en el SELECT y en el WHERE.
--
-- · El matcheo del mes es el mismo que se verificó para la versión binaria:
--   las dos fechas truncadas a mes. `m.fin` es `primer_día + 1 mes − 1 día`, o
--   sea que siempre cae dentro de su propio mes y el truncado no puede saltar.
--   Comprobado contra los 12 meses del ejercicio.
--
-- · El WHERE descarta los meses ya cubiertos en vez de emitirlos en 0: una
--   fila de `−$0` en una lista de cashflow es ruido que hay que leer para
--   descartar. Con ese filtro el `greatest` queda redundante — se deja igual,
--   a propósito: si alguien toca el WHERE mañana, el `greatest` sigue
--   impidiendo que un mes sobregirado se convierta en un ingreso fantasma.
--
-- · El filtro de anulados sale de `v_gasto_detalle.estado`, que deriva de
--   `asiento.anulado_por`. Un gasto anulado no debe achicar la estimación:
--   esa plata se va a volver a gastar.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_cashflow_estimado as
-- ── Rama 1 · por partido · BINARIA · sin cambios ──────────────────────────
 select j.fecha,
    'estimado'::text as nivel,
    'presupuesto_partido'::text as origen,
    cg.nombre as detalle,
    - (pt.base * pt.cantidad *
        case
            when j.es_playoff then j.cantidad_partidos::numeric
            else ( select count(*)::numeric / 2::numeric
               from equipo_torneo et
              where et.serie_id = j.serie_id)
        end) as monto
   from v_presupuesto_total pt
     join cat_gasto cg on cg.id = pt.cat_gasto_id
     join categoria c on c.torneo_id = pt.torneo_id
     join serie s on s.categoria_id = c.id
     join jornada j on j.serie_id = s.id
  where pt.unidad = 'por_partido'::text
    and j.estado <> 'suspendida'::text
    and j.fecha > CURRENT_DATE
    and not exists (
      select 1
        from gasto g
        join v_gasto_detalle d on d.gasto_id = g.id
       where g.jornada_id   = j.id
         and g.cat_gasto_id = pt.cat_gasto_id
         and d.estado <> 'anulado'::text)

union all
-- ── Rama 2 · por día de cancha · BINARIA · sin cambios ────────────────────
 select dct.fecha,
    'estimado'::text as nivel,
    'presupuesto_dia_cancha'::text as origen,
    cg.nombre as detalle,
    - (pt.base * pt.cantidad) as monto
   from v_presupuesto_total pt
     join cat_gasto cg on cg.id = pt.cat_gasto_id
     join v_dia_cancha_torneo dct on dct.torneo_id = pt.torneo_id
  where pt.unidad = 'por_dia_cancha'::text
    and dct.fecha > CURRENT_DATE
    and not exists (
      select 1
        from gasto g
        join v_gasto_detalle d on d.gasto_id = g.id
       where g.cat_gasto_id  = pt.cat_gasto_id
         and g.predio_id     = dct.predio_id
         and g.devengado_at  = dct.fecha
         and d.estado <> 'anulado'::text)

union all
-- ── Rama 3 · por mes · POR DIFERENCIA · lo que cambia ─────────────────────
 select m.fin as fecha,
    'estimado'::text as nivel,
    'presupuesto_mensual'::text as origen,
    cg.nombre as detalle,
    - GREATEST(pt.base * pt.cantidad - ya.real_del_mes, 0::numeric) as monto
   from v_presupuesto_total pt
     join cat_gasto cg on cg.id = pt.cat_gasto_id
     join ejercicio e on e.id = pt.ejercicio_id
     cross join lateral ( select (d.d + '1 mon -1 days'::interval)::date as fin
           from generate_series(date_trunc('month'::text, e.fecha_desde::timestamp with time zone),
                                date_trunc('month'::text, e.fecha_hasta::timestamp with time zone),
                                '1 mon'::interval) d(d)) m
     cross join lateral ( select coalesce(sum(g.total), 0::numeric) as real_del_mes
           from gasto g
           join v_gasto_detalle d on d.gasto_id = g.id
          where g.cat_gasto_id = pt.cat_gasto_id
            and d.estado <> 'anulado'::text
            and date_trunc('month'::text, g.devengado_at)
              = date_trunc('month'::text, m.fin)) ya
  where pt.unidad = 'por_mes'::text
    and m.fin > CURRENT_DATE
    -- El mes ya cubierto no emite fila, en vez de emitirla en 0.
    and pt.base * pt.cantidad > ya.real_del_mes;

comment on view public.v_cashflow_estimado is
  'El presupuesto proyectado sobre el calendario, en 3 ramas. LAS TRES '
  'descuentan el gasto real, con DOS criterios distintos y a propósito: '
  'por_partido y por_dia_cancha son BINARIAS —la factura cubre la jornada o el '
  'día entero, así que el gasto real apaga esa estimación—, y por_mes va POR '
  'DIFERENCIA —los fijos entran fraccionados, así que la estimación del mes es '
  'presupuestado menos lo ya cargado, con tope en 0—. El tope evita que un mes '
  'sobregirado emita un monto positivo, o sea un gasto convertido en ingreso. '
  'Salvedad conocida: la rama por_dia_cancha compara predio y los gastos por '
  'fecha hoy se cargan sin predio, así que ahí todavía no dispara.';
