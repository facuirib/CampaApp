-- ═══════════════════════════════════════════════════════════════
-- anular_cobro_sponsor
-- APLICADA el 30/08/2026 fuera del flujo normal de migraciones —
-- construida y verificada directo en el SQL Editor, siguiendo el
-- hallazgo de Facu ("HUECO · no hay forma de deshacer un cobro de
-- sponsor").
--
-- anular_pago cubre pago, pero el cobro de sponsor no pasa por pago —
-- marca cuota_cobro_sponsor.cobrado_at directamente. Sin esto, un
-- cobro de sponsor mal cargado no se podía revertir por ningún camino.
--
-- Mismo molde que anular_pago:
--  - contraasiento con anular_asiento (regla 4, no se borra)
--  - cobrado_at y asiento_id vuelven a NULL (reaparece en cashflow)
--  - rechaza si hay factura fiscal emitida (nota de crédito, sin
--    construir todavía)
--  - guarda admin/finanzas
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.anular_cobro_sponsor(p_cuota_id uuid, p_motivo text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_cuota             record;
  v_tiene_factura     boolean;
  v_nuevo_asiento_id  uuid;
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas'])) then
    raise exception
      'Anular un cobro de sponsor es de administrador o finanzas. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  select * into v_cuota from cuota_cobro_sponsor where id = p_cuota_id;
  if not found then
    raise exception 'La cuota de cobro de sponsor % no existe', p_cuota_id;
  end if;

  if v_cuota.asiento_id is null then
    raise exception
      'La cuota % no tiene un cobro registrado — no se puede anular', p_cuota_id;
  end if;

  select exists (
    select 1 from comprobante c
     where c.cuota_cobro_sponsor_id = p_cuota_id
       and c.tipo_comprobante <> 0
       and c.estado = 'emitida'
  ) into v_tiene_factura;

  if v_tiene_factura then
    raise exception
      'La cuota % tiene una factura fiscal emitida ante ARCA. No se puede '
      'anular con contraasiento solo — hace falta emitir una nota de '
      'crédito primero, que todavía no está construida.',
      p_cuota_id;
  end if;

  v_nuevo_asiento_id := anular_asiento(
    v_cuota.asiento_id,
    p_motivo,
    null,
    coalesce(p_created_by, auth.uid()),
    true
  );

  update cuota_cobro_sponsor
     set cobrado_at = null, asiento_id = null
   where id = p_cuota_id;

  return v_nuevo_asiento_id;
end;
$function$;

comment on function anular_cobro_sponsor(uuid, text, uuid) is
  'Anula un cobro de sponsor vía contraasiento (regla 4) y reabre la cuota. Rechaza si tiene una factura fiscal real emitida. Hermano de anular_pago, para el circuito de sponsor que no pasa por pago.';
