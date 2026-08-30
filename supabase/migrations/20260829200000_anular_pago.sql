-- ═══════════════════════════════════════════════════════════════
-- anular_pago
-- ⚠️ APLICADA EL 29/08/2026 FUERA DEL FLUJO NORMAL DE MIGRACIONES —
-- se aplicó directo en el SQL Editor de Supabase antes de commitear
-- este archivo, por la urgencia de limpiar cobros de prueba que
-- quedaron en los libros. Este archivo documenta lo que ya está
-- aplicado, no propone un cambio nuevo.
--
-- No existía ninguna función para anular un pago (confirmado: solo
-- había anular_arqueo, anular_asiento, anular_gasto, anular_retiro_bar,
-- anular_venta_bar). Necesaria para limpiar los cobros de prueba que
-- quedaron en los libros — Facu los dejó sin tocar correctamente, por
-- la regla 4: no se borra, se anula con contraasiento.
--
-- Diseño: mismo patrón que cambiar_estado_cheque cuando rechaza un
-- cheque — anula el asiento (contraasiento vía anular_asiento) y
-- reabre la deuda borrando las filas de pago_imputacion que ese pago
-- había creado.
--
-- ALCANCE: NO cubre la nota de crédito ante ARCA. Si el pago tiene un
-- comprobante fiscal real (factura, no recibo interno), la función lo
-- detecta y rechaza — esa pieza está sin construir todavía.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.anular_pago(p_pago_id uuid, p_motivo text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_pago              record;
  v_tiene_factura     boolean;
  v_nuevo_asiento_id  uuid;
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas'])) then
    raise exception
      'Anular un pago es de administrador o finanzas. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  select * into v_pago from pago where id = p_pago_id;
  if not found then
    raise exception 'El pago % no existe', p_pago_id;
  end if;

  if v_pago.asiento_id is null then
    raise exception 'El pago % no tiene asiento — no se puede anular', p_pago_id;
  end if;

  select exists (
    select 1 from comprobante c
     where c.pago_id = p_pago_id
       and c.tipo_comprobante <> 0
       and c.estado = 'emitida'
  ) into v_tiene_factura;

  if v_tiene_factura then
    raise exception
      'El pago % tiene una factura fiscal emitida ante ARCA. No se puede '
      'anular con contraasiento solo — hace falta emitir una nota de '
      'crédito primero, que todavía no está construida.',
      p_pago_id;
  end if;

  delete from pago_imputacion where pago_id = p_pago_id;

  v_nuevo_asiento_id := anular_asiento(
    v_pago.asiento_id,
    p_motivo,
    null,
    coalesce(p_created_by, auth.uid()),
    true
  );

  return v_nuevo_asiento_id;
end;
$function$;

comment on function anular_pago(uuid, text, uuid) is
  'Anula un pago vía contraasiento (regla 4, no se borra) y reabre la '
  'deuda borrando su pago_imputacion. Rechaza si el pago tiene una '
  'factura fiscal real emitida — eso necesita nota de crédito ante '
  'ARCA, pieza separada sin construir todavía.';
