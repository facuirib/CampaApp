-- ═══════════════════════════════════════════════════════════════
-- Gastos planificados (Tipo B) · funciones
-- PROPUESTA, NO APLICAR sin revisión de Facu — depende de la tabla
-- gasto_planificado (migración 20260817100000, aplicar primero).
-- ═══════════════════════════════════════════════════════════════

create or replace function public.crear_gasto_planificado(
  p_cat_gasto_id    uuid,
  p_descripcion     text,
  p_monto           numeric,
  p_fecha_esperada  date,
  p_torneo_id       uuid default null,
  p_responsable_id  uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_id uuid;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto planificado debe ser positivo (recibido: %)', p_monto;
  end if;

  if p_descripcion is null or trim(p_descripcion) = '' then
    raise exception 'Un gasto planificado necesita una descripción';
  end if;

  if not exists (select 1 from cat_gasto where id = p_cat_gasto_id) then
    raise exception 'La categoría de gasto % no existe', p_cat_gasto_id;
  end if;

  insert into gasto_planificado (cat_gasto_id, torneo_id, descripcion, monto, fecha_esperada, estado, created_by)
  values (p_cat_gasto_id, p_torneo_id, p_descripcion, p_monto, p_fecha_esperada, 'pendiente', p_responsable_id)
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.marcar_gasto_planificado_ejecutado(
  p_planificado_id  uuid,
  p_gasto_id        uuid
)
returns void
language plpgsql
as $function$
declare
  v_estado text;
begin
  select estado into v_estado from gasto_planificado where id = p_planificado_id;

  if not found then
    raise exception 'El gasto planificado % no existe', p_planificado_id;
  end if;

  if v_estado <> 'pendiente' then
    raise exception 'El gasto planificado ya está en estado %', v_estado;
  end if;

  if not exists (select 1 from gasto where id = p_gasto_id) then
    raise exception 'El gasto % no existe', p_gasto_id;
  end if;

  update gasto_planificado
     set estado = 'ejecutado',
         gasto_id = p_gasto_id
   where id = p_planificado_id;
end;
$function$;

comment on function crear_gasto_planificado(uuid, text, numeric, date, uuid, uuid) is
  'Alta de un gasto planificado (Tipo B del cashflow). No genera asiento — '
  'es dato de planificación hasta que se ejecuta.';

comment on function marcar_gasto_planificado_ejecutado(uuid, uuid) is
  'Vincula un gasto planificado con el gasto real que lo pagó. Se llama '
  'después de registrar_gasto/pagar_gasto, no los reemplaza. Sin este '
  'vínculo el planificado sigue proyectándose en el cashflow aunque ya se '
  'haya pagado (mismo problema que cheque↔pago sin vínculo).';