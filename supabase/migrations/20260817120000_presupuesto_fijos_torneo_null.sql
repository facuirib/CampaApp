-- ═══════════════════════════════════════════════════════════════
-- Presupuesto: los gastos fijos (recurrente) van con torneo_id NULL
-- PROPUESTA, NO APLICAR sin revisión — arreglo de DATOS, no de schema.
--
-- Responde a la tarea en coordinacion.md ("los fijos van con torneo_id =
-- NULL · sin dueño asignado"), tomada por Horacio.
--
-- El problema: Sueldos administrativos y Alquileres (naturaleza recurrente,
-- unidad_default por_mes) están presupuestados bajo el torneo Clausura 2026
-- (presupuesto_id 7e531ffe-e90c-43d7-840c-7e30ae7ab3db), pero los gastos
-- REALES de esa naturaleza van con torneo_id = NULL (lo exige el trigger
-- check_gasto_coherente: "los gastos recurrentes son de estructura, no de
-- un torneo"). Por eso el cruce presupuesto↔real falla — $777.000 de
-- Alquileres no cruzan.
--
-- El arreglo: un presupuesto nuevo con torneo_id = NULL para el mismo
-- ejercicio (2026), y mover ahí las 2 líneas fijas. El presupuesto
-- original queda con sus 4 líneas de torneo (Coordinación, Guardias,
-- Arbitros Masculino, Operativos) — no se toca.
--
-- Verificado con BEGIN/ROLLBACK contra la base real: el INSERT + UPDATE
-- corren sin error de FK ni constraint, las 2 líneas quedan con
-- torneo_id NULL vía su nuevo presupuesto.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  v_presupuesto_estructura_id uuid;
begin
  insert into presupuesto (torneo_id, ejercicio_id, estado)
  values (null, '9a06fcec-2bbb-4cbc-bffe-1a8f3a27aada', 'aprobado')
  returning id into v_presupuesto_estructura_id;

  update presupuesto_linea
     set presupuesto_id = v_presupuesto_estructura_id
   where id in (
     'dec30ced-78f1-46e7-9e47-7867bd859f41',  -- Sueldos administrativos
     'f48ebb1c-2956-4562-9136-2deac7f152cc'   -- Alquileres
   );

  raise notice 'Presupuesto de estructura creado: %', v_presupuesto_estructura_id;
end $$;