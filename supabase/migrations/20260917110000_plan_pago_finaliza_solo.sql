-- ═══════════════════════════════════════════════════════════════════════════
-- Gasto en cuotas · el plan se finaliza solo
-- APLICADA el 17/09/2026 — probada con el caso límite de un plan de 1 sola
-- cuota: finalizó en el mismo llamado a devengar_cuota_plan. Depende de
-- 20260917100100 (devengar_cuota_plan tal como quedó aplicada antes),
-- redefinida acá con un paso más al final.
--
-- Hasta ahora `plan_pago.estado` nacía 'vigente' en `crear_plan_pago` y nada
-- lo movía nunca: un plan con sus N cuotas ya devengadas seguía diciendo
-- "vigente" para siempre. `PlanesPago.tsx` lo tapaba con un cálculo cosmético
-- en pantalla (`estadoVisual()`, comparando cuotas_cumplidas contra
-- cuotas_total) — correcto para mostrar, pero mentía si algo más —otra
-- pantalla, un reporte, una consulta a mano— leía `plan_pago.estado` directo.
--
-- Se cierra en la base, no en el front: `devengar_cuota_plan` mira, DESPUÉS
-- de marcar la cuota devengada como cumplida, si ya no queda ninguna
-- pendiente de ese plan — y si es así, pasa `plan_pago.estado` a
-- 'finalizado'. El cálculo cosmético de PlanesPago.tsx se simplifica a leer
-- `p.estado` tal cual.
--
-- El caso de plan que CAE por falta de pago —anular pendientes y
-- alertar— sigue sin construir (docs/arquitectura.md §3.14, sin cambios acá):
-- esto sólo cierra el camino de ÉXITO, cuando el plan se completa.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.devengar_cuota_plan(
  p_compromiso_id uuid,
  p_created_by    uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_user_id    uuid;
  v_compromiso record;
  v_plan       record;
  v_gasto_id   uuid;
begin
  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable del devengo: se requiere p_created_by o sesión autenticada.';
  end if;

  select * into v_compromiso from compromiso where id = p_compromiso_id;

  if not found then
    raise exception 'El compromiso % no existe.', p_compromiso_id;
  end if;

  if v_compromiso.tipo <> 'cuota_plan' then
    raise exception
      'El compromiso % no es una cuota de plan de pago (tipo: %). '
      'devengar_cuota_plan solo procesa compromisos tipo=cuota_plan.',
      p_compromiso_id, v_compromiso.tipo;
  end if;

  if v_compromiso.gasto_id is not null then
    raise exception
      'Esta cuota ya se devengó: es el gasto %. No se procesa dos veces.',
      v_compromiso.gasto_id;
  end if;

  if v_compromiso.estado <> 'pendiente' then
    raise exception
      'La cuota está en estado "%", no "pendiente". No se puede devengar.',
      v_compromiso.estado;
  end if;

  select * into v_plan from plan_pago where id = v_compromiso.plan_id;

  if not found then
    raise exception 'La cuota % no tiene un plan de pago válido.', p_compromiso_id;
  end if;

  -- registrar_gasto exige concepto_id (del catálogo) XOR concepto_libre
  -- (texto). El plan no tiene catálogo de conceptos propio, así que va con
  -- concepto_libre — la misma descripción que ya identifica a esta cuota en
  -- el cashflow ("Moratoria X · cuota 3/12"), para que el gasto real se lea
  -- igual que se leía comprometido.
  v_gasto_id := registrar_gasto(
    p_cat_gasto_id   => v_plan.cat_gasto_id,
    p_arancel        => v_compromiso.monto,
    p_cantidad       => 1,
    p_devengado_at   => v_compromiso.vence_at,
    p_concepto_libre => v_compromiso.descripcion,
    p_torneo_id      => v_compromiso.torneo_id,
    p_created_by     => v_user_id
  );

  update compromiso
     set gasto_id    = v_gasto_id,
         estado      = 'cumplido',
         cumplido_at = current_date
   where id = p_compromiso_id;

  -- ── El plan se cierra solo ────────────────────────────────────────────
  --
  -- Se mira DESPUÉS del update de arriba, nunca antes: si se mirara antes,
  -- la cuota que se acaba de devengar seguiría contando como 'pendiente'
  -- dentro de esta misma transacción, y un plan de una sola cuota —o la
  -- última cuota de cualquier plan— jamás se cerraría solo.
  --
  -- `not exists` sobre TODO el plan, no un contador: no hace falta saber
  -- cuántas faltan, sólo si falta alguna.
  if not exists (
    select 1 from compromiso
     where plan_id = v_compromiso.plan_id
       and estado = 'pendiente'
  ) then
    update plan_pago set estado = 'finalizado' where id = v_compromiso.plan_id;
  end if;

  return v_gasto_id;
end
$function$;

comment on function public.devengar_cuota_plan(uuid, uuid) is
  'El botón mensual (patrón devengar_sueldos_socios): toma UN compromiso '
  'pendiente de tipo=cuota_plan, carga el gasto real vía registrar_gasto '
  '(categoría y torneo del plan, monto y fecha de la cuota) y cierra el '
  'compromiso (gasto_id + cumplido). Si esa era la última cuota pendiente del '
  'plan, plan_pago.estado pasa a ''finalizado'' solo — no hace falta otra '
  'llamada ni otro botón. Idempotente por compromiso.gasto_id: una cuota ya '
  'devengada se rechaza, no se reprocesa. No paga — pagar_gasto sigue siendo '
  'un paso aparte, igual que con cualquier otro gasto.';
