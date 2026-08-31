-- ─────────────────────────────────────────────────────────────────────────────
-- Las vistas que faltaban para los gráficos de la Ola 3
--
-- Hito 2. SQL puro, sin UI: agregar es de la vista, nunca del front (regla 1).
--
-- ── Son TRES y no cinco ───────────────────────────────────────────────────
--
-- El plan hablaba de cinco. Al relevar aparecieron dos ya construidas:
--
--   · «ingresos vs gastos por mes» ya es `v_pl_mensual_total`
--     (anio, mes, ingresos, egresos, financiero, resultado) — la misma que usa
--     /resultados, así que el gráfico y la pantalla de detalle no pueden
--     discrepar: es literalmente la misma fila.
--
--   · «calendario por día» ya es `v_calendario_dia`
--     (dia, items, entra, sale, neto, vencidos, acumulado). Verificado que
--     suma exactamente igual que v_calendario_kpi y que las 285 filas de
--     v_cashflow_comprometido: entra $263.452.498, sale −$16.150.000.
--
-- Hacer una vista nueva para cualquiera de las dos habría creado una segunda
-- fuente de los mismos números, que es justo lo que la regla 2 prohíbe.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1 · Cómo se cobró de verdad, por mes ───────────────────────────────────
--
-- `pago.medio_pago`, y NO `equipo_torneo.medio_previsto`: lo pactado ya se ve
-- en el historial del equipo, y lo que interesa acá es el desvío entre lo que
-- se acordó y lo que efectivamente entró.
--
-- 🔴 Excluye los pagos anulados, y hay que mirarlo con cuidado porque `pago`
-- NO tiene columna de anulado: `anular_pago` borra las imputaciones y
-- contraasienta, dejando la fila del pago en su lugar. Así que lo anulado se
-- reconoce por su ASIENTO. Sin este filtro, la vista contaría plata que se
-- deshizo — y encima sin contrapartida, porque acá no hay un contraasiento que
-- compense: no estamos sumando líneas de diario, estamos contando pagos.
create or replace view v_cobro_medio_mes as
select
  extract(year  from p.fecha)::integer as anio,
  extract(month from p.fecha)::integer as mes,
  p.medio_pago,
  count(*)                                as cobros,
  coalesce(sum(p.monto), 0)::numeric(16,2) as total
from pago p
left join asiento a on a.id = p.asiento_id
where a.id is null or a.anulado_por is null
group by 1, 2, p.medio_pago;

comment on view v_cobro_medio_mes is
  'Cobros por medio de pago y mes, según cómo se cobró de verdad (pago.medio_pago). Excluye pagos cuyo asiento fue anulado.';


-- ── 2 · El bar, por mes: facturación, mix y margen ─────────────────────────
--
-- Las ventas salen de `v_venta_bar` —la misma que lista /bar— y los costos de
-- los gastos con área `bar`, que es lo que carga /bar/costo.
--
-- El margen se calcula ACÁ y no en la pantalla, que es la regla 1: es una
-- resta entre dos magnitudes que ya viven en la base, y hacerla en el front
-- sería exactamente el `.reduce()` que no se hace.
--
-- Va con `full join` sobre el mes: un mes con costos y sin ventas es
-- información —el bar gastó y no vendió— y con `left join` desde ventas
-- desaparecería.
create or replace view v_bar_mes as
with ventas as (
  select
    extract(year  from fecha)::integer as anio,
    extract(month from fecha)::integer as mes,
    count(*)                                  as ventas,
    coalesce(sum(total), 0)::numeric(16,2)          as facturado,
    coalesce(sum(monto_efectivo), 0)::numeric(16,2) as efectivo,
    coalesce(sum(monto_tarjeta), 0)::numeric(16,2)  as tarjeta,
    coalesce(sum(monto_mp), 0)::numeric(16,2)       as mercado_pago
  from v_venta_bar
  where estado <> 'anulado'
  group by 1, 2
),
costos as (
  select
    extract(year  from devengado_at)::integer as anio,
    extract(month from devengado_at)::integer as mes,
    coalesce(sum(total), 0)::numeric(16,2) as costos
  from v_gasto_detalle
  where area = 'bar' and estado <> 'anulado'
  group by 1, 2
)
select
  coalesce(v.anio, c.anio) as anio,
  coalesce(v.mes,  c.mes)  as mes,
  coalesce(v.ventas, 0)                       as ventas,
  coalesce(v.facturado, 0)::numeric(16,2)     as facturado,
  coalesce(v.efectivo, 0)::numeric(16,2)      as efectivo,
  coalesce(v.tarjeta, 0)::numeric(16,2)       as tarjeta,
  coalesce(v.mercado_pago, 0)::numeric(16,2)  as mercado_pago,
  coalesce(c.costos, 0)::numeric(16,2)        as costos,
  (coalesce(v.facturado, 0) - coalesce(c.costos, 0))::numeric(16,2) as margen
from ventas v
full join costos c on c.anio = v.anio and c.mes = v.mes;

comment on view v_bar_mes is
  'El bar por mes: facturado, mix de cobro (efectivo/tarjeta/MP), costos del área bar y margen.';


-- ── 3 · Facturado por dirección ────────────────────────────────────────────
--
-- El domicilio determina Comercio e Industria, así que «por dirección» es «por
-- punto de venta» — pero el domicilio que corresponde es el CONGELADO en el
-- comprobante (`emisor_domicilio`), no el que hoy tiene el punto.
--
-- Es el principio del documento congelado, el mismo del receptor: una factura
-- de hace dos años dice el domicilio que tenía el punto cuando se emitió, y si
-- después se mudó, esa factura sigue perteneciendo a la dirección vieja. Ir a
-- buscar el domicilio actual reescribiría el pasado y movería facturación de
-- una jurisdicción a otra.
--
-- 🔴 Solo facturas. Los recibos internos usan punto 0 y no tienen domicilio
-- —un recibo no tiene punto de venta, así que no afirma nada sobre C&I— y
-- meterlos armaría una categoría «sin dirección» que se comería el gráfico:
-- hoy son 4 de 6 comprobantes.
--
-- Cuando el domicilio congelado falta se dice, no se completa: hay una Factura
-- B con punto 200 que ni siquiera existe en `punto_venta`, y taparla con un
-- «Sin asignar» genérico escondería que ese comprobante tiene un problema.
create or replace view v_facturado_direccion as
select
  extract(year  from c.fecha_emision)::integer as anio,
  extract(month from c.fecha_emision)::integer as mes,
  c.punto_venta,
  coalesce(pv.nombre, 'Punto ' || c.punto_venta) as punto,
  coalesce(
    nullif(btrim(c.emisor_domicilio), ''),
    'Sin domicilio en el comprobante (punto ' || c.punto_venta || ')'
  ) as direccion,
  (pv.numero is null) as punto_desconocido,
  count(*)                                as comprobantes,
  coalesce(sum(c.monto), 0)::numeric(16,2) as total
from v_comprobante c
left join punto_venta pv on pv.numero = c.punto_venta
where c.es_factura
  and c.estado <> 'error'
group by 1, 2, c.punto_venta, pv.nombre, pv.numero,
         coalesce(nullif(btrim(c.emisor_domicilio), ''),
                  'Sin domicilio en el comprobante (punto ' || c.punto_venta || ')');

comment on view v_facturado_direccion is
  'Facturas por dirección (el domicilio CONGELADO en el comprobante, no el actual del punto) y mes. Solo facturas: los recibos no tienen punto de venta.';
