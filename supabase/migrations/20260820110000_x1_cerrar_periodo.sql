-- ═══════════════════════════════════════════════════════════════
-- X1 · cerrar_periodo — PROPUESTA, NO APLICAR sin revisión de Facu
--
-- Hallazgo: el bloqueo de ESCRITURA en período cerrado YA EXISTE
-- (periodo_de_fecha lo rechaza con mensaje claro). Lo que faltaba es la
-- función de CIERRE en sí — hoy se hace con un UPDATE directo a
-- `periodo`, sin ninguna validación.
--
-- ✅ RESPUESTAS DE FACU (20/08, en coordinacion.md):
--  X1-1 ¿alcanza la validación de arqueos? → SÍ, más una: que el período
--    no tenga asientos descuadrados (última red antes de congelar el
--    mes; trg_asiento_balanceado ya lo previene por asiento, esto es
--    una verificación agregada al cerrar). NO agregar gastos devengados
--    sin pagar — es el estado normal de un gasto, bloquearía todos los
--    cierres.
--  X1-2 ¿reabrir_periodo? → NO debe existir. trg_periodo_no_reabre YA
--    rechaza reabrir con mensaje explícito ("las correcciones se
--    registran como ajuste en el período abierto"). El mecanismo de
--    corrección es el contraasiento (origen 'ajuste', ya admitido por
--    asiento_origen_check). No se escribe reabrir_periodo.
--
-- cerrado_at/cerrado_por: trg_periodo_cierre ya los estampa al pasar a
-- cerrado, PERO usa auth.uid() — desde SQL sin sesión queda NULL. Si
-- querés que quede el responsable, pasalo explícito (mismo patrón que
-- el fallback que se sacó de crear_asiento). Por eso cerrar_periodo
-- recibe p_responsable_id y lo pasa al UPDATE.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.cerrar_periodo(
  p_periodo_id     uuid,
  p_responsable_id uuid default null
)
returns void
language plpgsql
as $function$
declare
  v_periodo     record;
  v_pendiente   int;
  v_descuadrado int;
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

  select count(*)
    into v_descuadrado
  from (
    select l.asiento_id
      from asiento_linea l
      join asiento a on a.id = l.asiento_id
     where a.periodo_id = p_periodo_id
     group by l.asiento_id
    having sum(l.debe) <> sum(l.haber)
  ) x;

  if v_descuadrado > 0 then
    raise exception
      'No se puede cerrar %-%: hay % asiento(s) descuadrado(s) en el período. '
      'Esto no debería pasar (trg_asiento_balanceado lo previene) — revisar '
      'antes de cerrar.',
      v_periodo.anio, lpad(v_periodo.mes::text, 2, '0'), v_descuadrado;
  end if;

  update periodo
     set estado = 'cerrado',
         cerrado_por = coalesce(p_responsable_id, auth.uid())
   where id = p_periodo_id;
end;
$function$;

comment on function cerrar_periodo(uuid, uuid) is
  'X1 — cierra un período con dos validaciones: arqueos sin entregar y '
  'asientos descuadrados (última red). El bloqueo de escritura en período '
  'cerrado ya existe (periodo_de_fecha); esta función agrega la '
  'validación al momento de cerrar. NO existe reabrir_periodo — '
  'trg_periodo_no_reabre lo bloquea a propósito; las correcciones van '
  'como contraasiento (origen ajuste) en el período abierto.';