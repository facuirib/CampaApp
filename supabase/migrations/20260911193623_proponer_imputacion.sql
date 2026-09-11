-- ─────────────────────────────────────────────────────────────────────────────
-- proponer_imputacion: la propuesta ANTES de que exista el pago
--
-- Del diagnóstico del 11/09 (regla 10). La pantalla de cobro no podía usar
-- `sugerir_imputacion(p_pago_id)` porque exige un pago existente y
-- `registrar_cobro` es atómico — así que el front terminó calculando la
-- imputación en TypeScript (`calcularImputacionAutomatica`), con aritmética
-- de centavos a mano y un criterio propio. Dos criterios para el mismo
-- dominio: exactamente lo que la regla prohíbe.
--
-- Esta función es la MISMA propuesta, con el pago todavía inexistente:
--   · sin p_torneo_id: el criterio de sugerir_imputacion tal cual — torneo
--     en curso primero, después antigüedad (habilitar al equipo manda).
--   · con p_torneo_id: sólo las cuotas de ese torneo, por antigüedad — es la
--     pantalla de cobro, donde el operador ya eligió el torneo a mano.
--
-- NO escribe nada. Devuelve también los totales que la pantalla mostraba
-- sumando en el cliente (regla 1): el total propuesto y la deuda del torneo.
-- El operador ve la propuesta, la ajusta si quiere, y recién su confirmación
-- llama a registrar_cobro.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function proponer_imputacion(
  p_tercero_id uuid,
  p_monto      numeric,
  p_torneo_id  uuid default null
) returns jsonb
language plpgsql
stable
as $$
declare
  v_restante  numeric(16,2) := round(p_monto, 2);
  v_cuota     record;
  v_aplicar   numeric(16,2);
  v_result    jsonb := '[]'::jsonb;
  v_total     numeric(16,2) := 0;
  v_deuda     numeric(16,2) := 0;
begin
  if p_monto is null or p_monto <= 0 then
    return jsonb_build_object(
      'imputaciones', '[]'::jsonb, 'total', 0, 'deuda_alcance', 0, 'sobrante', 0);
  end if;

  for v_cuota in
    select c.id, c.numero, c.vence_at,
           c.monto - coalesce(sum(pi.monto), 0) as saldo,
           tt.nombre as torneo, tt.estado as torneo_estado
      from cuota c
      join equipo_torneo et on et.id = c.equipo_torneo_id
      join torneo tt        on tt.id = et.torneo_id
      left join pago_imputacion pi on pi.cuota_id = c.id
     where et.tercero_id = p_tercero_id
       and c.pagado_at is null
       and (p_torneo_id is null or et.torneo_id = p_torneo_id)
     group by c.id, c.numero, c.vence_at, c.monto, tt.nombre, tt.estado
    having c.monto - coalesce(sum(pi.monto), 0) > 0
     order by
       case when tt.estado = 'en_curso' then 0 else 1 end,
       c.vence_at,
       c.numero
  loop
    -- La deuda del alcance se acumula ENTERA, siga o no alcanzando el monto:
    -- es el «debe $X en este torneo» de la pantalla.
    v_deuda := v_deuda + v_cuota.saldo;

    if v_restante > 0 then
      v_aplicar  := least(v_restante, v_cuota.saldo);
      v_total    := v_total + v_aplicar;
      v_restante := v_restante - v_aplicar;

      v_result := v_result || jsonb_build_object(
        'cuota_id', v_cuota.id,
        'monto',    v_aplicar,
        'torneo',   v_cuota.torneo,
        'cuota',    v_cuota.numero,
        'vence_at', v_cuota.vence_at,
        'saldo',    v_cuota.saldo
      );
    end if;
  end loop;

  return jsonb_build_object(
    'imputaciones', v_result,
    'total',        v_total,     -- lo que la propuesta cubre
    'deuda_alcance', v_deuda,    -- la deuda total del alcance (torneo o todas)
    'sobrante',     v_restante   -- lo que quedaría como anticipo
  );
end $$;

comment on function proponer_imputacion(uuid, numeric, uuid) is
  'La propuesta de imputación ANTES de que exista el pago: mismo criterio que '
  'sugerir_imputacion (torneo en curso primero, después antigüedad), opcionalmente '
  'acotada a un torneo. No escribe. Devuelve imputaciones + totales para la '
  'pantalla de cobro (regla 1: los totales salen de la base, no del cliente).';
