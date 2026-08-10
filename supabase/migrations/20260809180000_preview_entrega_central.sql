-- ═══════════════════════════════════════════════════════════════
-- Arqueo · preview_entrega_central — preview del asiento de entrega
--
-- Espeja el asiento que hará registrar_entrega_central, sin insertar (STABLE).
-- Para el AsientoPreview del formulario de entrega.
--   Debe: CAJA_CENTRAL · Haber: CAJA_EFECTIVO · monto = saldo_contado
-- Hecha bien: nombre de cuenta + totales derivados. Valida el mismo estado
-- que registrar_entrega_central (pendiente, saldo != 0).
-- Pendiente de aplicar por Facu (regla 11).
-- ═══════════════════════════════════════════════════════════════

create or replace function public.preview_entrega_central(
  p_arqueo_id uuid
)
returns jsonb
language plpgsql
stable
as $function$
declare
  v_estado        text;
  v_saldo         numeric(16,2);
  v_central_nom   text;
  v_efectivo_nom  text;
  v_lineas        jsonb;
  v_total_debe    numeric(16,2);
  v_total_haber   numeric(16,2);
begin
  select a.estado, a.saldo_contado
    into v_estado, v_saldo
  from arqueo a
  where a.id = p_arqueo_id;

  if not found then
    raise exception 'El arqueo % no existe', p_arqueo_id;
  end if;

  if v_estado <> 'pendiente_entrega' then
    raise exception 'El arqueo % ya fue entregado', p_arqueo_id;
  end if;

  if v_saldo = 0 then
    raise exception 'El arqueo % contó cero: no hay efectivo que entregar', p_arqueo_id;
  end if;

  select nombre into v_central_nom  from cuenta where codigo = 'CAJA_CENTRAL';
  select nombre into v_efectivo_nom from cuenta where codigo = 'CAJA_EFECTIVO';

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', 'CAJA_CENTRAL',  'nombre', v_central_nom,  'debe',  v_saldo),
    jsonb_build_object('cuenta', 'CAJA_EFECTIVO', 'nombre', v_efectivo_nom, 'haber', v_saldo)
  );

  select
    coalesce(sum((l->>'debe')::numeric),  0),
    coalesce(sum((l->>'haber')::numeric), 0)
    into v_total_debe, v_total_haber
    from jsonb_array_elements(v_lineas) l;

  return jsonb_build_object(
    'lineas', v_lineas,
    'total_debe', v_total_debe,
    'total_haber', v_total_haber,
    'balanceado', v_total_debe = v_total_haber
  );
end $function$;

comment on function public.preview_entrega_central(uuid) is
  'Preview del asiento de entrega a central (CAJA_CENTRAL debe / CAJA_EFECTIVO haber por saldo contado). STABLE. Espeja registrar_entrega_central.';