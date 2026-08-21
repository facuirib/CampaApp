-- ═══════════════════════════════════════════════════════════════
-- check_gasto_coherente · predio_id obligatorio en por_dia_cancha
-- PROPUESTA, NO APLICAR sin revisión de Facu (regla 11 · motor).
--
-- Responde a la tarea que Facu dejó explícita en coordinacion.md (19/08,
-- dentro del fix de doble conteo): la exclusión NOT EXISTS de
-- v_cashflow_estimado para la rama por_dia_cancha compara contra
-- g.predio_id, pero check_gasto_coherente no lo exige — solo exige
-- jornada_id para naturaleza por_fecha. Los 3 gastos por_dia_cancha que
-- hay tienen predio_id NULL, así que la exclusión no dispara.
--
-- Sin predio_id obligatorio en estas categorías, el doble conteo (que
-- Facu ya blindó para por_partido) sigue latente para por_dia_cancha —
-- misma clase de bug ("rama que nunca se ejecutó") que ya mordió 3 veces
-- esta semana.
--
-- El cambio: dentro de la validación existente de naturaleza='por_fecha'
-- (que ya exige jornada_id), agregar que SI la categoría tiene
-- unidad_default='por_dia_cancha', también exija predio_id. No todas las
-- por_fecha lo necesitan (Arbitros/Operativos son por_partido, sin
-- predio) — el chequeo es específico a la unidad, no a toda la
-- naturaleza.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.check_gasto_coherente()
returns trigger
language plpgsql
as $function$
declare
  nat text;
  uni text;
begin
  select naturaleza, unidad_default into nat, uni from cat_gasto where id = new.cat_gasto_id;

  if nat = 'por_fecha' and new.jornada_id is null then
    raise exception 'Un gasto por fecha requiere jornada';
  end if;

  if nat = 'por_fecha' and uni = 'por_dia_cancha' and new.predio_id is null then
    raise exception
      'Un gasto por_dia_cancha requiere predio: sin él, el cashflow no '
      'puede saber qué caja de qué predio ya cubrió este gasto, y lo '
      'estimado se duplica con lo real.';
  end if;

  if nat <> 'por_fecha' and new.jornada_id is not null then
    raise exception 'Solo los gastos por fecha se anclan a una jornada';
  end if;

  if nat = 'inversion' and new.activo_id is null then
    raise exception 'Una inversión requiere un activo asociado';
  end if;

  if nat = 'recurrente' and new.torneo_id is not null then
    raise exception 'Los gastos recurrentes son de estructura, no de un torneo';
  end if;

  if nat = 'eventual'
     and new.torneo_id is null
     and new.predio_id is null
     and new.activo_id is null then
    raise exception
      'Un gasto eventual debe imputarse a un torneo, un predio o un activo';
  end if;

  return new;
end $function$;

comment on function check_gasto_coherente() is
  'Valida coherencia de gasto según naturaleza. Agregado 21/08: dentro de '
  'por_fecha, las categorías con unidad_default=por_dia_cancha exigen '
  'predio_id — sin eso, el fix de doble conteo de v_cashflow_estimado '
  '(19/08) no dispara para esta rama.';