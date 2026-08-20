-- ═══════════════════════════════════════════════════════════════
-- X1 · cerrar_periodo — PROPUESTA, NO APLICAR sin revisión de Facu
--
-- Hallazgo: el bloqueo de ESCRITURA en período cerrado YA EXISTE
-- (periodo_de_fecha lo rechaza con mensaje claro). Lo que falta es la
-- función de CIERRE en sí — hoy se hace con un UPDATE directo a
-- `periodo`, sin ninguna validación. Título de X1 promete "con
-- validaciones"; esta función las agrega.
--
-- Validación elegida (la más clara y menos discutible): no cerrar un
-- período con arqueos sin entregar (estado='pendiente_entrega') cuyo
-- dia_cancha caiga dentro de ese mes. Un arqueo pendiente es plata
-- física sin conciliar contra la caja central — cerrar el mes con eso
-- abierto deja un agujero de control.
--
-- ⚠️ DECISIONES PARA FACU:
--  1. ¿La validación de arqueos alcanza, o hace falta chequear algo más
--     (cheques pendientes del mes, compromisos vencidos, gastos
--     devengados sin pagar)? Los dejé afuera a propósito — son más
--     ambiguos (un cheque puede seguir pendiente cruzando el cierre sin
--     que sea un problema).
--  2. ¿Reabrir un período cerrado necesita su propia función
--     (reabrir_periodo), o alcanza con un UPDATE directo como hoy?
--     Cerrar con validación y reabrir sin ella es asimétrico a propósito
--     —reabrir es la salida de emergencia—, pero quería que quede
--     explícito y no implícito.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.cerrar_periodo(
  p_periodo_id     uuid,
  p_responsable_id uuid default null
)
returns void
language plpgsql
as $function$
declare
  v_periodo   record;
  v_pendiente int;
begin
  select id, estado, anio, mes into v_periodo
  from periodo where id = p_periodo_id;

  if not found then
    raise exception 'El período % no existe', p_periodo_id;
  end if;

  if v_periodo.estado = 'cerrado' then
    raise exception 'El período %-% ya está cerrado',
      v_periodo.anio, lpad(v_periodo.mes::text, 2, '0');
  end if;

  select count(*)
    into v_pendiente
  from arqueo a
  join dia_cancha dc on dc.id = a.dia_cancha_id
  where a.estado = 'pendiente_entrega'
    and extract(year  from dc.fecha)::int = v_periodo.anio
    and extract(month from dc.fecha)::int = v_periodo.mes;

  if v_pendiente > 0 then
    raise exception
      'No se puede cerrar %-%: hay % arqueo(s) sin entregar a central. '
      'Resolvelos antes de cerrar el período.',
      v_periodo.anio, lpad(v_periodo.mes::text, 2, '0'), v_pendiente;
  end if;

  update periodo
     set estado = 'cerrado',
         cerrado_por = coalesce(p_responsable_id, auth.uid())
   where id = p_periodo_id;
end;
$function$;

comment on function cerrar_periodo(uuid, uuid) is
  'X1 — cierra un período con validación: rechaza si hay arqueos sin '
  'entregar a central dentro de ese mes. El bloqueo de escritura en '
  'período cerrado ya existe (periodo_de_fecha); esta función agrega la '
  'validación al momento de cerrar.';