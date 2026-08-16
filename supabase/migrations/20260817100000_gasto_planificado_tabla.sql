-- ═══════════════════════════════════════════════════════════════
-- Gastos planificados (Tipo B) — PROPUESTA, NO APLICAR sin revisión de Facu
--
-- Responde a la propuesta de Facu en coordinacion.md (16/08): gastos
-- puntuales sin fórmula ni escala («se rompió un arco, hay que comprarlo
-- el mes que viene»). Tabla propia (decisión de Facu, no reusar
-- presupuesto_linea).
--
-- gasto_planificado.gasto_id: el vínculo con el gasto real que lo ejecuta.
-- Mismo patrón que cheque.pago_id — sin este vínculo, al pagar de verdad no
-- se sabría qué planificado marcar como ejecutado (mismo problema que ya
-- resolvimos en cheques).
--
-- estado: 'pendiente' (todavía no se gastó, aparece en el cashflow
-- estimado) | 'ejecutado' (ya se gastó, el gasto real lo reemplaza, sale
-- del estimado).
-- ═══════════════════════════════════════════════════════════════

create table if not exists gasto_planificado (
  id            uuid primary key default gen_random_uuid(),
  cat_gasto_id  uuid not null references cat_gasto(id),
  torneo_id     uuid references torneo(id),
  descripcion   text not null,
  monto         numeric(16,2) not null check (monto > 0),
  fecha_esperada date not null,
  estado        text not null default 'pendiente'
                  check (estado in ('pendiente','ejecutado','cancelado')),
  gasto_id      uuid references gasto(id),
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

comment on table gasto_planificado is
  'Gastos puntuales planificados a futuro (Tipo B del cashflow): monto y '
  'fecha propios, sin fórmula ni escala. Aparecen en v_cashflow como '
  'estimado mientras estado=pendiente; al ejecutarse, el gasto real los '
  'reemplaza y salen de la proyección.';

comment on column gasto_planificado.gasto_id is
  'El gasto real que ejecutó este planificado. Nulo hasta que se pague. '
  'Mismo patrón que cheque.pago_id — sin este vínculo, marcar_ejecutado() '
  'no tendría cómo saber cuál gasto corresponde.';