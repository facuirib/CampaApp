-- ============================================================================
-- CAMPA · Seed de infraestructura · Ejercicio 2026
--
-- Va PRIMERO (por eso el 00): es prerequisito de todo lo que asienta.
--
-- El ejercicio es el marco temporal del motor contable, no contabilidad
-- formal. periodo_de_fecha() busca el ejercicio que contiene la fecha del
-- movimiento y, si lo encuentra, crea el período del mes bajo demanda. Si NO
-- lo encuentra, aborta:
--
--   'No hay ejercicio que contenga la fecha X. Crealo antes de registrar
--    movimientos.'
--
-- Y como crear_asiento() llama a periodo_de_fecha(), sin ejercicio no hay
-- asiento; y con percibido puro (Draft 12) sin asiento no se puede cobrar.
-- De ahí que esto sea infraestructura y no un dato más: es lo primero que
-- tiene que existir en una base recién levantada.
--
-- No contradice §3.1 ("por decisión operativa no se cargan ejercicios con
-- fechas fiscales hasta que el estudio contable externo lo requiera"): eso
-- habla del ejercicio como unidad de la contabilidad formal. Este es el año
-- calendario que el motor necesita para ubicar los períodos.
--
-- Idempotente: on conflict contra unique (anio).
--
-- Los períodos NO se crean acá. Los crea periodo_de_fecha() a medida que se
-- opera en cada mes, que es el diseño del motor.
-- ============================================================================

insert into ejercicio (anio, fecha_desde, fecha_hasta, estado)
values (2026, '2026-01-01', '2026-12-31', 'abierto')
on conflict (anio) do nothing;


-- ── Verificación ────────────────────────────────────────────────────────────

do $$
declare v_id uuid;
begin
  select id into v_id from ejercicio where anio = 2026;
  if v_id is null then
    raise exception 'No se creó el ejercicio 2026';
  end if;

  if not exists (
    select 1 from ejercicio
     where anio = 2026
       and fecha_desde = '2026-01-01'
       and fecha_hasta = '2026-12-31'
       and estado = 'abierto'
  ) then
    raise exception 'El ejercicio 2026 existe pero con otros valores';
  end if;

  -- La prueba que importa: que el motor pueda ubicar un período de 2026.
  -- Esto CREA el período si no existía, que es el comportamiento esperado.
  perform periodo_de_fecha('2026-07-01'::date);

  raise notice 'Ejercicio 2026 OK · periodo_de_fecha resuelve';
end $$;
