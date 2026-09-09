-- ─────────────────────────────────────────────────────────────────────────────
-- Mover una jornada arrastra los vencimientos de sus cuotas impagas
--
-- ── El agujero ─────────────────────────────────────────────────────────────
--
-- La cuota de partidos nace atada a su jornada (`cuota.jornada_id`) y vence el
-- día que esa serie juega. Pero `mover_jornada` cambiaba SOLO la fecha de la
-- jornada: las cuotas ya generadas quedaban venciendo el día viejo. Movías la
-- Fecha 5 y el cashflow seguía proyectando el cobro en la fecha vieja — y peor,
-- la cuota entraba en mora por un partido que no se jugó.
--
-- Decisión de Facu (09/09): los vencimientos se mueven CON la jornada, con
-- confirmación del operador. La confirmación vive en la pantalla —que ya
-- muestra cuántas cuotas están atadas antes de confirmar—; acá vive el efecto.
--
-- ── Qué arrastra y qué no ──────────────────────────────────────────────────
--
-- Sólo las IMPAGAS (`pagado_at is null`). Una cuota pagada es historia: su
-- vencimiento fue el que fue cuando se pagó, y reescribírselo falsearía la
-- foto de la mora en el momento del cobro. La parcialmente imputada tiene
-- `pagado_at is null` —lo dice el trigger de sincronización— así que se mueve,
-- que es lo correcto: lo que falta pagar vence con la jornada nueva.
--
-- ── Por qué devuelve un resumen y no void ──────────────────────────────────
--
-- La pantalla confirma ANTES con el conteo de la vista, pero lo que muestra
-- DESPUÉS tiene que ser lo que pasó de verdad, no lo que se esperaba. El
-- cambio de tipo de retorno exige drop + create (42P13).
--
-- Reprogramar una suspendida ya la volvía a `programada`; eso queda igual.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.mover_jornada(uuid, date);

create function public.mover_jornada(p_jornada_id uuid, p_nueva_fecha date)
returns jsonb
language plpgsql
as $$
declare
  v_estado_previo text;
  v_fecha_previa  date;
  v_movidas       int;
  v_pagadas       int;
begin
  if p_nueva_fecha is null then
    raise exception
      'mover_jornada necesita una fecha. Para sacar una jornada del calendario '
      'usá suspender_jornada().';
  end if;

  select estado, fecha into v_estado_previo, v_fecha_previa
    from jornada where id = p_jornada_id;
  if not found then
    raise exception 'La jornada % no existe', p_jornada_id;
  end if;

  update jornada
     set fecha  = p_nueva_fecha,
         estado = case when estado = 'suspendida' then 'programada' else estado end
   where id = p_jornada_id;

  -- La cascada. Pasa por RLS (cuota_update_autenticado existe — verificado
  -- antes de escribir esto, después del DELETE mudo del borrado de torneos).
  update cuota
     set vence_at = p_nueva_fecha
   where jornada_id = p_jornada_id
     and pagado_at is null;
  get diagnostics v_movidas = row_count;

  select count(*) into v_pagadas
    from cuota where jornada_id = p_jornada_id and pagado_at is not null;

  return jsonb_build_object(
    'fecha_anterior', v_fecha_previa,
    'fecha_nueva', p_nueva_fecha,
    'cuotas_movidas', v_movidas,
    'cuotas_pagadas_intactas', v_pagadas,
    'reprogramada', v_estado_previo = 'suspendida');
end;
$$;

comment on function public.mover_jornada(uuid, date) is
  'Mueve la jornada a la fecha nueva y arrastra el vence_at de sus cuotas IMPAGAS. Las pagadas no se tocan. Devuelve el resumen de lo que pasó.';
