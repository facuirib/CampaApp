-- ═══════════════════════════════════════════════════════════════════════════
-- La cola de la proyección avisa que le faltan gastos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hoy la proyección termina con cuatro meses que **sólo tienen ingresos**:
--
--     12/2026   entradas 0            salidas −7.850.000    saldo 121.309.500
--     03/2027   entradas 6.600.000    salidas 0             saldo 127.909.500
--     04/2027   entradas 13.200.000   salidas 0             saldo 141.109.500
--     05/2027   entradas 23.400.000   salidas 0             saldo 164.509.500
--     06/2027   entradas 23.400.000   salidas 0             saldo 187.909.500
--
-- Son **$66.600.000 de cuotas del Apertura 2027 sin un peso de lo que cuesta
-- correrlo**. El saldo final no está mal calculado: está calculado sobre datos
-- que faltan, que es distinto y peor, porque el número se ve igual de firme.
--
-- ── Qué NO hace esta migración ─────────────────────────────────────────────
--
-- **No cambia ningún número.** No inventa gastos —serían gastos que nadie
-- presupuestó— ni esconde los ingresos —están comprometidos de verdad, las
-- cuotas existen—. Agrega **una columna que avisa**, y nada más. Quien mira
-- mayo 2027 tiene que poder saber que a ese número le falta el otro lado.
--
-- ── Por qué el corte se deriva y no se escribe ─────────────────────────────
--
--     cola_incompleta = el período es posterior al último que tiene gasto
--                       estimado
--
-- Escribir «desde 03/2027» sería más simple hoy y estaría mal mañana: la razón
-- por la que el estimado corta es que **falta cargar datos**, no que la vista
-- tenga un tope. Relevado: `v_cashflow_estimado` sale de tres fuentes —por
-- partido, por día de cancha y por mes— y las tres se quedan sin de dónde
-- salir porque el Apertura 2027 **no tiene jornadas, ni días de cancha, ni
-- presupuesto**, y porque hay un solo ejercicio, que termina el 31/12/2026.
--
-- O sea que el día que se carguen el ejercicio 2027 y el presupuesto del
-- Apertura, la cola se llena sola **sin tocar una línea de SQL** — y la marca
-- tiene que retroceder sola con ella. Una fecha fija se quedaría avisando de un
-- problema resuelto, que es la mejor forma de que la próxima advertencia no se
-- lea.
--
-- ── Por qué es una columna y no un cálculo en la pantalla ──────────────────
--
-- El corte es un **agregado sobre toda la serie** —el máximo período con gasto
-- estimado—, no un dato de la fila. Resolverlo en el front es recorrer el
-- arreglo: el mismo `.reduce()` que la regla 1 saca de la pantalla, aunque acá
-- devuelva un booleano en vez de un total.
--
-- Y hay una razón de forma: `/proyeccion` tiene dos ramas —semanal y mensual—
-- que hoy son un solo código porque las dos vistas **tienen la misma forma**.
-- Una columna las mantiene iguales; un cálculo en TypeScript habría que
-- escribirlo dos veces y mantenerlo sincronizado.
--
-- ── El caso de borde que define el `coalesce` ──────────────────────────────
--
-- Si NO hay ningún período con gasto estimado, el `max(...) filter` da NULL y
-- la comparación daría NULL, no `false`. Con `coalesce(..., false)` la columna
-- queda apagada entera — que es lo correcto: ese caso ya lo cubre la
-- advertencia que la pantalla tiene desde antes («Proyección sin egresos
-- presupuestados»). Las dos señales **no se pisan**: una dice «no hay gastos en
-- ningún lado», la otra «hay, pero se terminan antes que los ingresos».
-- ═══════════════════════════════════════════════════════════════════════════


-- ── v_cashflow — grano semanal ─────────────────────────────────────────────
--
-- La columna va AL FINAL: `create or replace view` no admite insertarla en el
-- medio, y de esta vista cuelga `v_cashflow_mensual`.
--
-- Se resuelve con una ventana sobre todo el resultado —`over ()` sin
-- partición— y no con un subselect: una vista no puede referenciarse a sí
-- misma, y repetir el UNION de las tres fuentes para calcular el máximo sería
-- una segunda definición de lo mismo.

create or replace view public.v_cashflow as
 WITH flujo AS (
         SELECT v_cashflow_real.fecha, v_cashflow_real.nivel, v_cashflow_real.origen,
            NULL::text AS detalle, v_cashflow_real.monto
           FROM v_cashflow_real
        UNION ALL
         SELECT v_cashflow_comprometido.fecha, v_cashflow_comprometido.nivel,
            v_cashflow_comprometido.origen, v_cashflow_comprometido.detalle,
            v_cashflow_comprometido.monto
           FROM v_cashflow_comprometido
        UNION ALL
         SELECT v_cashflow_estimado.fecha, v_cashflow_estimado.nivel,
            v_cashflow_estimado.origen, v_cashflow_estimado.detalle,
            v_cashflow_estimado.monto
           FROM v_cashflow_estimado
        ), por_semana AS (
         SELECT date_trunc('week'::text, flujo.fecha::timestamp with time zone)::date AS semana,
            sum(flujo.monto) FILTER (WHERE flujo.nivel = 'real'::text) AS monto_real,
            sum(flujo.monto) FILTER (WHERE flujo.nivel = 'comprometido'::text) AS monto_comprometido,
            sum(flujo.monto) FILTER (WHERE flujo.nivel = 'estimado'::text) AS monto_estimado,
            sum(flujo.monto) AS flujo_neto,
            sum(flujo.monto) FILTER (WHERE flujo.monto > 0::numeric) AS entradas,
            sum(flujo.monto) FILTER (WHERE flujo.monto < 0::numeric) AS salidas
           FROM flujo
          GROUP BY (date_trunc('week'::text, flujo.fecha::timestamp with time zone)::date)
        )
 SELECT semana,
    date_trunc('month'::text, semana::timestamp with time zone)::date AS mes,
    COALESCE(monto_real, 0::numeric) AS monto_real,
    COALESCE(monto_comprometido, 0::numeric) AS monto_comprometido,
    COALESCE(monto_estimado, 0::numeric) AS monto_estimado,
    COALESCE(entradas, 0::numeric) AS entradas,
    COALESCE(salidas, 0::numeric) AS salidas,
    flujo_neto,
    (( SELECT COALESCE(sum(l.debe - l.haber), 0::numeric) AS "coalesce"
           FROM caja cj
             JOIN asiento_linea l ON l.cuenta_id = cj.cuenta_id
             JOIN asiento a ON a.id = l.asiento_id
          WHERE cj.activo AND (cj.predio_id IS NULL OR a.predio_id = cj.predio_id) AND a.fecha <= (s.semana + 6))) + sum(COALESCE(monto_comprometido, 0::numeric) + COALESCE(monto_estimado, 0::numeric)) OVER (ORDER BY semana ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS saldo_proyectado,
    semana >= date_trunc('week'::text, CURRENT_DATE::timestamp with time zone)::date AS futura,

    -- Posterior a la última semana con gasto estimado. Ventana sobre todo el
    -- resultado —`over ()` sin partición— y no un subselect: una vista no puede
    -- referenciarse a sí misma, y repetir el UNION sería una segunda definición
    -- de lo mismo. El `coalesce` apaga la columna entera cuando NO hay ningún
    -- gasto estimado: ese caso ya lo cubre el aviso viejo de la pantalla.
    coalesce(
      semana > max(semana) filter (where monto_estimado < 0) over (),
      false
    ) AS cola_incompleta
   FROM por_semana s;

comment on view public.v_cashflow is
  'El flujo de caja semanal: real, comprometido y estimado, con el saldo '
  'proyectado acumulado. `futura` marca lo que todavía no pasó; '
  '`cola_incompleta` marca las semanas posteriores a la última con gasto '
  'estimado — ahí el saldo tiene ingresos pero le faltan los egresos, así que '
  'es optimista. El corte se deriva del dato: se corre solo cuando se carga '
  'más presupuesto.';


-- ── v_cashflow_mensual — grano mensual ─────────────────────────────────────
--
-- Se recalcula al grano del mes en vez de arrastrar `bool_or` de las semanas.
-- No es lo mismo: un mes puede tener una semana con gasto estimado y tres sin,
-- y ese mes NO es cola —tiene presupuesto, sólo que repartido—. La pregunta es
-- «¿este mes es posterior al último mes con gasto?», y se contesta al grano en
-- el que se hace.

create or replace view public.v_cashflow_mensual as
 WITH flujos_mes AS (
         SELECT v_cashflow.mes,
            sum(v_cashflow.monto_real) AS monto_real,
            sum(v_cashflow.monto_comprometido) AS monto_comprometido,
            sum(v_cashflow.monto_estimado) AS monto_estimado,
            sum(v_cashflow.entradas) AS entradas,
            sum(v_cashflow.salidas) AS salidas,
            sum(v_cashflow.flujo_neto) AS flujo_neto
           FROM v_cashflow
          WHERE v_cashflow.mes IS NOT NULL
          GROUP BY v_cashflow.mes
        ), saldo_fin_mes AS (
         SELECT DISTINCT ON (v_cashflow.mes) v_cashflow.mes,
            v_cashflow.saldo_proyectado AS saldo_fin_mes,
            v_cashflow.futura
           FROM v_cashflow
          WHERE v_cashflow.mes IS NOT NULL
          ORDER BY v_cashflow.mes, v_cashflow.semana DESC
        )
 SELECT f.mes,
    f.monto_real,
    f.monto_comprometido,
    f.monto_estimado,
    f.entradas,
    f.salidas,
    f.flujo_neto,
    s.saldo_fin_mes AS saldo_proyectado,
    s.futura,

    -- Se recalcula al grano del mes en vez de arrastrar un `bool_or` de las
    -- semanas: un mes con gasto estimado en una sola de sus semanas TIENE
    -- presupuesto, sólo que repartido, y no es cola.
    coalesce(
      f.mes > max(f.mes) filter (where f.monto_estimado < 0) over (),
      false
    ) AS cola_incompleta
   FROM flujos_mes f
     JOIN saldo_fin_mes s ON s.mes = f.mes;

comment on view public.v_cashflow_mensual is
  'El mismo flujo que v_cashflow, agrupado por mes. `cola_incompleta` se '
  'recalcula al grano del mes y no se hereda de las semanas: un mes con gasto '
  'estimado en una sola de sus semanas tiene presupuesto, sólo que repartido.';
