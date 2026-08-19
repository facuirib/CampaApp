-- ═══════════════════════════════════════════════════════════════════════════
-- v_cashflow_estimado · lo real desplaza a lo estimado
--
-- ⚠️ PROPUESTA · NO APLICADA. Vista de HORACIO: se avisa en coordinacion.md.
--
-- ── El problema ────────────────────────────────────────────────────────────
--
-- La vista proyecta el presupuesto sobre el calendario: por cada jornada futura
-- estima `base × cantidad × partidos`. Pero **no mira si el gasto real de esa
-- jornada ya se cargó**. Cuando se carga, la jornada queda contada dos veces:
-- una en `v_cashflow_estimado` y otra en `v_cashflow_comprometido` (gasto_impago).
--
-- Verificado en rollback antes de escribir esto: cargando el gasto real de
-- árbitros de la jornada del 22/08 por $1.200.000, el estimado NO se movía y el
-- comprometido sumaba. $1.200.000 duplicados en la misma fecha.
--
-- Su única defensa era temporal —`fecha > CURRENT_DATE`— y no alcanza: la
-- factura del árbitro entra antes de que se juegue la fecha, que es lo normal.
--
-- ── El principio ───────────────────────────────────────────────────────────
--
-- **Lo real desplaza a lo estimado.** Es el mismo principio que ya aplica
-- `gasto_planificado` con su `estado = 'pendiente'`, pero no se puede calcar el
-- mecanismo: aquello es una FILA que se marca ejecutada, y una línea de
-- presupuesto no representa un pago sino N pagos repartidos por el calendario.
-- No hay fila que apagar — hay que apagar la OCURRENCIA, y eso es un NOT EXISTS.
--
-- ── Exclusión BINARIA, y por (categoría, ocurrencia) ───────────────────────
--
-- Si existe gasto real de esa categoría en esa jornada, la estimación de esa
-- jornada se va ENTERA. No se descuenta el importe real ni se compara contra el
-- presupuestado: el estimado existe para llenar el hueco de lo que todavía no se
-- cargó, y donde ya hay dato real no hay hueco que llenar.
--
-- Y es por **(categoría, jornada)**, nunca por jornada entera. La jornada del
-- 22/08 estima árbitros Y operativos: si se carga el gasto de árbitros, sale
-- árbitros y **operativos sigue estimado**. Sacar la jornada completa borraría
-- una previsión que nadie cargó, y el número seguiría siendo plausible — que es
-- el peor modo de falla.
--
-- ── El filtro de anulados no es decorativo ─────────────────────────────────
--
-- `anular_gasto` limpia `pagado_at`, así que un gasto anulado sigue cumpliendo
-- cualquier condición ingenua. Sin el filtro, un gasto anulado sacaría su
-- jornada del estimado y **la plata desaparecería de la proyección** — el mismo
-- bug que se corrigió en la 5ª rama de v_cashflow_comprometido, en espejo.
--
-- El estado sale de `v_gasto_detalle`, que lo deriva de `asiento.anulado_por`:
-- la fuente de verdad, sin reimplementarla. Se sale de `gasto` y no de la vista
-- porque **`v_gasto_detalle` no expone `cat_gasto_id`** — sólo el nombre de la
-- categoría, y unir por nombre se rompe con cualquier renombre.
--
-- ── Rama 2 · cubierta a medias, y queda dicho ──────────────────────────────
--
-- `por_dia_cancha` proyecta (categoría, fecha, predio) y el gasto real de una
-- categoría `por_fecha` está anclado a una JORNADA, que tiene fecha pero no
-- predio. `check_gasto_coherente` exige `jornada_id` y no exige `predio_id`, y
-- de hecho los 3 gastos `por_dia_cancha` que hay tienen `predio_id` en NULL.
--
-- La cláusula que va abajo compara contra `g.predio_id`, así que **no va a
-- disparar hasta que esos gastos se carguen con predio**. Es correcta y no
-- produce falsos positivos, pero HOY no cierra el agujero de esta rama.
--
-- Se eligió así a propósito. La alternativa era excluir sólo por (categoría,
-- fecha), y eso mataría las DOS filas de predio con un solo gasto: las 29 fechas
-- de días de cancha tienen los 2 predios. Cambiaría sobreestimar por
-- subestimar, y un cashflow que subestima gastos no dispara ninguna alarma.
--
-- **Tarea abierta para Horacio:** que `predio_id` pase a obligatorio en los
-- gastos de categorías con `unidad_default = 'por_dia_cancha'`. Con eso esta
-- cláusula empieza a funcionar sola, sin tocar la vista.
--
-- ── Rama 3 · por_mes NO se toca, pero NO está protegida ────────────────────
--
-- Se deja intacta por alcance, no porque esté cubierta. Hoy tiene un doble
-- conteo ACTIVO:
--
--     comprometido  10/08  Alquileres   −$333.000
--     comprometido  10/08  Alquileres   −$444.000
--     estimado      31/08  Alquileres  −$1.900.000   ← el mes entero, igual
--
-- Cerrarlo es una condición más —`date_trunc('month', g.devengado_at) =
-- date_trunc('month', m.fin)`— y excluiría 1 fila con los datos de hoy. Queda
-- para una migración aparte, con su propia aprobación.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_cashflow_estimado as
-- ── Rama 1 · por partido ──────────────────────────────────────────────────
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
    -- Lo real desplaza a lo estimado: esta (categoría, jornada) ya está cargada.
    and not exists (
      select 1
        from gasto g
        join v_gasto_detalle d on d.gasto_id = g.id
       where g.jornada_id   = j.id
         and g.cat_gasto_id = pt.cat_gasto_id
         and d.estado <> 'anulado'::text)

union all
-- ── Rama 2 · por día de cancha ────────────────────────────────────────────
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
    -- Ídem, por (categoría, día, predio). Ver la nota de la rama 2 arriba: no
    -- dispara mientras los gastos por día de cancha se carguen sin predio.
    and not exists (
      select 1
        from gasto g
        join v_gasto_detalle d on d.gasto_id = g.id
       where g.cat_gasto_id  = pt.cat_gasto_id
         and g.predio_id     = dct.predio_id
         and g.devengado_at  = dct.fecha
         and d.estado <> 'anulado'::text)

union all
-- ── Rama 3 · por mes · SIN CAMBIOS (ver la nota de arriba) ────────────────
 select m.fin as fecha,
    'estimado'::text as nivel,
    'presupuesto_mensual'::text as origen,
    cg.nombre as detalle,
    - (pt.base * pt.cantidad) as monto
   from v_presupuesto_total pt
     join cat_gasto cg on cg.id = pt.cat_gasto_id
     join ejercicio e on e.id = pt.ejercicio_id
     cross join lateral ( select (d.d + '1 mon -1 days'::interval)::date as fin
           from generate_series(date_trunc('month'::text, e.fecha_desde::timestamp with time zone),
                                date_trunc('month'::text, e.fecha_hasta::timestamp with time zone),
                                '1 mon'::interval) d(d)) m
  where pt.unidad = 'por_mes'::text
    and m.fin > CURRENT_DATE;

comment on view public.v_cashflow_estimado is
  'El presupuesto proyectado sobre el calendario, en 3 ramas: por partido '
  '(cruza jornada), por día de cancha y por mes. Desde el 19/08 lo REAL '
  'desplaza a lo estimado: si ya existe un gasto no anulado de esa categoría '
  'en esa jornada, la estimación de esa jornada no se emite — antes se contaba '
  'dos veces, acá y en gasto_impago. La exclusión es binaria y por (categoría, '
  'ocurrencia), nunca por jornada entera: si hay árbitros pero no operativos, '
  'operativos sigue estimado. ATENCIÓN: la rama por_dia_cancha compara predio, '
  'y los gastos por fecha hoy se cargan sin predio, así que ahí la exclusión '
  'todavía no dispara. La rama por_mes NO tiene exclusión: tiene doble conteo '
  'conocido y queda para otra migración.';
