-- ═══════════════════════════════════════════════════════════════════════════
-- Vistas de lectura de Activos · v_activo y v_amortizacion
--
-- ⚠️ PROPUESTA · NO APLICADA. El nombre del archivo se define al aplicar, con
-- la versión que registre la herramienta.
--
-- El backend del circuito está completo —compra ruteada a BIENES_USO, pago,
-- y asentar_amortizacion— pero **no hay ninguna vista** que toque `activo` ni
-- `amortizacion`. La pantalla no puede calcular nada de esto: es la regla 1.
--
-- ── Los dos cuidados que estas vistas existen para resolver ────────────────
--
-- **1 · El gasto anulado.** La Desmalezadora tiene DOS gastos apuntándola: el
-- original (anulado, imputado a GAS_PREDIO) y el vigente (BIENES_USO). Un join
-- ingenuo daría **2 filas por activo** y un valor de compra de $2.900.000.
-- El filtro sale de `v_gasto_detalle.estado`, para no reimplementar la regla de
-- anulación —que se deriva de `asiento.anulado_por`— en un segundo lugar.
--
-- **2 · La multiplicación cruzada.** Un activo con N cuotas Y un gasto daría
-- N×1 filas si se joinean las dos cosas en la misma query. Por eso **todas las
-- derivadas son subconsultas correlacionadas**: cada una devuelve un escalar y
-- `v_activo` tiene exactamente una fila por activo, pase lo que pase con los
-- datos.
--
-- ── Dos decisiones de cálculo ──────────────────────────────────────────────
--
-- **`cuota_mensual` usa la MISMA expresión que `proponer_amortizaciones`**
-- —`round(valor_origen / vida_util_meses, 2)`—. Si acá se calculara distinto,
-- la pantalla mostraría una cuota y se asentaría otra.
--
-- **`numero_cuota` se deriva de `fecha_alta`, no de un `row_number()`.** La
-- tabla `amortizacion` no guarda el número de cuota. Contarlas por orden daría
-- mal en cuanto se saltee un período: si se asienta agosto y noviembre, el
-- `row_number` diría 2 para noviembre cuando en realidad es la cuota 4. La
-- fórmula es la de `proponer_amortizaciones`, así que las dos coinciden siempre.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── v_activo · una fila por activo, con todo lo derivado ───────────────────

create or replace view v_activo as
select
  a.id                                   as activo_id,
  a.nombre,
  a.categoria,
  a.predio_id,
  p.codigo                               as predio,
  a.fecha_alta,
  a.valor_origen,
  a.vida_util_meses,
  a.estado,
  a.fecha_baja,
  a.motivo_baja,

  -- Misma expresión que proponer_amortizaciones: la pantalla y el asiento
  -- tienen que decir el mismo número.
  round(a.valor_origen / a.vida_util_meses, 2)  as cuota_mensual,

  -- Confirmadas explícito: hoy no existen filas 'propuesta' porque el flujo es
  -- de un paso, pero si algún día aparecen no deben contar como amortizadas.
  (select count(*) from amortizacion am
    where am.activo_id = a.id and am.estado = 'confirmada')::int
                                                as cuotas_confirmadas,

  (a.vida_util_meses - (select count(*) from amortizacion am
                         where am.activo_id = a.id and am.estado = 'confirmada'))::int
                                                as cuotas_restantes,

  (select coalesce(sum(am.monto), 0) from amortizacion am
    where am.activo_id = a.id and am.estado = 'confirmada')::numeric(16,2)
                                                as amortizado,

  (a.valor_origen - (select coalesce(sum(am.monto), 0) from amortizacion am
                      where am.activo_id = a.id and am.estado = 'confirmada'))::numeric(16,2)
                                                as residual,

  -- nullif por si un activo se cargara con valor 0: no hay check que lo impida.
  round(
    100 * (select coalesce(sum(am.monto), 0) from amortizacion am
            where am.activo_id = a.id and am.estado = 'confirmada')
        / nullif(a.valor_origen, 0), 2)         as avance_pct,

  -- La compra es un gasto de naturaleza `inversion` que apunta al activo. Puede
  -- no existir todavía: el alta del bien y la carga de la compra son dos pasos
  -- (gasto tiene FK a activo, no al revés, así que el activo va primero).
  exists (select 1 from gasto g
           join v_gasto_detalle d on d.gasto_id = g.id
          where g.activo_id = a.id and d.estado <> 'anulado')
                                                as compra_registrada,

  -- `limit 1` con orden determinístico: nada impide dos gastos vigentes contra
  -- el mismo activo, y la vista no puede devolver dos filas por eso.
  (select g.id from gasto g
     join v_gasto_detalle d on d.gasto_id = g.id
    where g.activo_id = a.id and d.estado <> 'anulado'
    order by g.devengado_at, g.id
    limit 1)                                    as gasto_id

from activo a
left join predio p on p.id = a.predio_id;

comment on view v_activo is
  'Un activo por fila, con lo que la pantalla no puede calcular: cuota mensual, '
  'cuotas confirmadas y restantes, amortizado, residual y avance. Las derivadas '
  'son subconsultas correlacionadas para que un activo con N cuotas y un gasto '
  'no multiplique filas. El gasto de la compra se busca ignorando los anulados.';


-- ── v_amortizacion · una fila por cuota asentada ───────────────────────────

create or replace view v_amortizacion as
select
  am.id                                  as amortizacion_id,
  am.activo_id,
  a.nombre                               as activo,
  am.periodo_id,
  pe.anio,
  pe.mes,

  -- El número de cuota NO está guardado: se deriva de fecha_alta al último día
  -- del mes del período, igual que en proponer_amortizaciones. Contar por orden
  -- daría mal si se saltea un período.
  (extract(year  from age(
     (make_date(pe.anio, pe.mes, 1) + interval '1 month - 1 day')::date,
     a.fecha_alta)) * 12
   + extract(month from age(
     (make_date(pe.anio, pe.mes, 1) + interval '1 month - 1 day')::date,
     a.fecha_alta)) + 1)::int             as numero_cuota,

  a.vida_util_meses                      as cuotas_total,
  am.monto,
  am.estado,
  am.asiento_id,
  asi.fecha                              as asiento_fecha

from amortizacion am
join activo a  on a.id  = am.activo_id
join periodo pe on pe.id = am.periodo_id
left join asiento asi on asi.id = am.asiento_id;

comment on view v_amortizacion is
  'Las cuotas de amortización ya asentadas, por activo y período. Las PROPUESTAS '
  'no salen de acá: salen de proponer_amortizaciones(periodo), que es función. '
  'numero_cuota se deriva de fecha_alta, no del orden de las filas.';
