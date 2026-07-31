-- ═══════════════════════════════════════════════════════════════
-- B3 · preview_cobro() — arma las líneas del asiento SIN escribir
-- Espeja registrar_cobro() para el modal de pago. No inserta nada.
-- Aplicar: pendiente de confirmación de Facu (regla 11).
-- ═══════════════════════════════════════════════════════════════

create or replace function public.preview_cobro(
  p_tercero_id   uuid,
  p_monto        numeric,
  p_medio        text,
  p_imputaciones jsonb
) returns jsonb
language plpgsql
stable
as $function$
declare
  v_cuenta_caja text;
  v_suma_imp    numeric(16,2);
  v_lineas      jsonb;
  v_debe        numeric(16,2);
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del cobro debe ser positivo (se recibió %)', p_monto;
  end if;

  if p_medio not in ('efectivo','transferencia','cheque') then
    raise exception
      'Medio de pago inválido: "%". Los válidos son efectivo, transferencia y cheque.',
      p_medio;
  end if;

  v_cuenta_caja := case p_medio
                     when 'efectivo'      then 'CAJA_EFECTIVO'
                     when 'transferencia' then 'CAJA_TRANSFERENCIA'
                     when 'cheque'        then 'VALORES_A_DEPOSITAR'
                   end;

  if p_imputaciones is null or jsonb_array_length(p_imputaciones) = 0 then
    raise exception 'El cobro necesita al menos una imputación.';
  end if;

  select coalesce(sum((x->>'monto')::numeric), 0) into v_suma_imp
    from jsonb_array_elements(p_imputaciones) x;

  if v_suma_imp <> p_monto then
    raise exception
      'La imputación suma % y el pago es de %. Tienen que coincidir.',
      v_suma_imp, p_monto;
  end if;

  with grupos as (
    select pt.concepto, sum((x->>'monto')::numeric) as monto
      from jsonb_array_elements(p_imputaciones) x
      join cuota c              on c.id  = (x->>'cuota_id')::uuid
      join plan_tarifa_linea l  on l.id  = c.plan_tarifa_linea_id
      join plan_tarifa pt       on pt.id = l.plan_tarifa_id
     group by pt.concepto
  )
  select
    coalesce(sum(g.monto), 0),
    jsonb_build_array(
      jsonb_build_object('cuenta', v_cuenta_caja, 'debe', coalesce(sum(g.monto), 0))
    ) || coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cuenta', case g.concepto
                      when 'inscripcion' then 'ING_INSCRIPCIONES'
                      when 'partidos'    then 'ING_PARTIDOS'
                    end,
          'haber', g.monto,
          'tercero_id', p_tercero_id)
        order by g.concepto),
      '[]'::jsonb)
    into v_debe, v_lineas
  from grupos g;

  if jsonb_array_length(v_lineas) < 2 then
    raise exception 'No se pudo resolver la cuenta de ingreso de las cuotas imputadas';
  end if;

  return jsonb_build_object(
    'lineas', v_lineas,
    'total_debe', v_debe,
    'total_haber', v_debe,
    'balanceado', true
  );
end $function$;

comment on function public.preview_cobro is
  'Previsualiza el asiento de registrar_cobro() sin escribir. Para el modal de pago (B3).';