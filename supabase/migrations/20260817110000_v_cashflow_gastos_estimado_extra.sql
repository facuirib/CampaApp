-- ═══════════════════════════════════════════════════════════════
-- v_cashflow_gastos_estimado_extra — PROPUESTA, NO APLICAR sin revisión
--
-- Responde a la propuesta de Facu (16/08), opción (c): vista aditiva,
-- sin tocar v_cashflow_estimado.
--
-- Por ahora, UNA sola rama: gasto_planificado (pendientes, no ejecutados).
-- Al ejecutarse (marcar_gasto_planificado_ejecutado) el gasto real los
-- reemplaza y salen de acá — anti-doble-conteo resuelto por el vínculo
-- gasto_planificado.gasto_id.
--
-- ⚠️ presupuesto_linea con unidad='unico' QUEDA AFUERA de esta vista, a
-- propósito. Facu señaló el hueco (coordinacion.md, 16/08): esa unidad no
-- tiene columna de fecha propia, así que no hay convención válida para
-- ubicarla en el tiempo ni vínculo para evitar duplicarla si se ejecuta.
-- Mismo tratamiento que 'anual': "trampa latente, ninguna línea la usa
-- hoy — se resuelve cuando aparezca el primer caso real". Si el día de
-- mañana hace falta, la salida más limpia es migrar esas líneas a
-- gasto_planificado (que sí tiene fecha y vínculo), no inventarle una
-- convención a presupuesto_linea.
--
-- Shape idéntico a v_cashflow_estimado: fecha, nivel, origen, detalle,
-- monto. Entra al UNION ALL de v_cashflow sin fricción (Facu: "v_cashflow
-- sólo consume esas cinco columnas, y el signo del monto ES el sentido").
-- ═══════════════════════════════════════════════════════════════

create or replace view public.v_cashflow_gastos_estimado_extra as
select
  gp.fecha_esperada  as fecha,
  'estimado'         as nivel,
  'gasto_planificado' as origen,
  gp.descripcion     as detalle,
  -gp.monto          as monto
from gasto_planificado gp
where gp.estado = 'pendiente'
  and gp.fecha_esperada > current_date;

comment on view public.v_cashflow_gastos_estimado_extra is
  'Egresos estimados que NO cubre v_cashflow_estimado: gastos planificados '
  'pendientes (Tipo B). unidad=unico de presupuesto queda afuera a '
  'propósito, sin convención de fecha ni vínculo — ver header. Vista '
  'aditiva (opción c, 16/08) — no toca v_cashflow_estimado.';