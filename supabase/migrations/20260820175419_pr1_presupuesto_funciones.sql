-- ═══════════════════════════════════════════════════════════════
-- PR1 · Funciones de escritura de presupuesto
-- PROPUESTA, NO APLICAR sin revisión de Facu (regla 11 · motor, y
-- zona donde Facu puede estar construyendo /presupuesto en paralelo
-- — avisado en coordinacion.md antes de escribir esto).
--
-- presupuesto: id, torneo_id (null=estructura), ejercicio_id, estado
--   (borrador|aprobado, check existente).
-- presupuesto_linea: id, presupuesto_id, cat_gasto_id, concepto_id,
--   base, cantidad, unidad.
--
-- Decisiones ya tomadas por Facu (16-19/08, en coordinacion.md), que
-- estas funciones respetan:
--  - Solo 'aprobado' proyecta al cashflow (v_presupuesto_total ya
--    filtra por esto) — el estado controla QUÉ proyecta, no qué se
--    puede editar.
--  - El aprobado se edita libremente (decisión B: no hay trigger que
--    bloquee escrituras sobre un presupuesto aprobado).
--  - unique(torneo_id, ejercicio_id) NULLS NOT DISTINCT en presupuesto,
--    y unique(presupuesto_id, cat_gasto_id, concepto_id) NULLS NOT
--    DISTINCT en presupuesto_linea — ya existen (aplicados por Facu,
--    20260819200000). Estas funciones respetan esos unique, no los
--    duplican con su propia validación redundante — dejan que el
--    constraint haga el trabajo y traducen el error si salta.
--
-- ⚠️ DECISIONES PARA FACU:
--  1. crear_presupuesto: ¿nace en 'borrador' siempre, o puede nacer
--     'aprobado' directo? Propongo: siempre borrador — aprobar es un
--     paso deliberado (aprobar_presupuesto), no un default del alta.
--  2. borrar_linea_presupuesto: ¿hard delete, o hace falta soft-delete
--     como en cat_gasto? Propongo hard delete — presupuesto_linea no
--     tiene rastro de uso real (a diferencia de gasto/cheque), y una
--     línea de un presupuesto en borrador no dejó huella contable.
--  3. aprobar_presupuesto: ¿valida algo antes de aprobar (ej. que
--     tenga al menos una línea), o alcanza con el cambio de estado?
--     Propongo: al menos una línea — un presupuesto vacío aprobado no
--     aporta nada y podría confundirse con "no hay presupuesto".
-- ═══════════════════════════════════════════════════════════════

create or replace function public.crear_presupuesto(
  p_ejercicio_id   uuid,
  p_torneo_id      uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_id uuid;
begin
  if not exists (select 1 from ejercicio where id = p_ejercicio_id) then
    raise exception 'El ejercicio % no existe', p_ejercicio_id;
  end if;

  if p_torneo_id is not null and not exists (select 1 from torneo where id = p_torneo_id) then
    raise exception 'El torneo % no existe', p_torneo_id;
  end if;

  begin
    insert into presupuesto (torneo_id, ejercicio_id, estado)
    values (p_torneo_id, p_ejercicio_id, 'borrador')
    returning id into v_id;
  exception when unique_violation then
    raise exception
      'Ya existe un presupuesto para este ejercicio y torneo (o estructura, '
      'si torneo_id es null). Editá el existente en vez de crear otro.';
  end;

  return v_id;
end;
$function$;


create or replace function public.agregar_linea_presupuesto(
  p_presupuesto_id  uuid,
  p_cat_gasto_id    uuid,
  p_base            numeric,
  p_cantidad        numeric default 1,
  p_concepto_id     uuid default null,
  p_unidad          text default null
)
returns uuid
language plpgsql
as $function$
declare
  v_id uuid;
begin
  if not exists (select 1 from presupuesto where id = p_presupuesto_id) then
    raise exception 'El presupuesto % no existe', p_presupuesto_id;
  end if;

  if not exists (select 1 from cat_gasto where id = p_cat_gasto_id) then
    raise exception 'La categoría de gasto % no existe', p_cat_gasto_id;
  end if;

  if p_base is null or p_base <= 0 then
    raise exception 'El monto base debe ser positivo (recibido: %)', p_base;
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser positiva (recibida: %)', p_cantidad;
  end if;

  -- ── unidad se deja en NULL a propósito (corrección de Facu, 20/08) ──────
  --
  -- `presupuesto_linea.unidad` es nullable porque NULL **significa algo**:
  -- «heredar del catálogo» (arquitectura.md §3.8). No es un dato faltante.
  --
  -- `v_presupuesto_total` resuelve la herencia en TRES niveles:
  --
  --     COALESCE(pl.unidad, cgc.unidad_default, cg.unidad_default)
  --                         ↑ el del CONCEPTO
  --
  -- Copiar acá `cat_gasto.unidad_default` rompía las dos mitades de eso:
  -- **salteaba el nivel del concepto** —si la línea tiene concepto_id con
  -- unidad propia, la vista la habría usado y la función escribía la de la
  -- categoría— y **congelaba el valor**: al cambiar el default del catálogo,
  -- las líneas con NULL se actualizan solas y las materializadas no.
  --
  -- Hoy es inofensivo —ningún concepto tiene unidad_default— pero es
  -- exactamente una rama que nunca se ejecutó.
  --
  -- Si se pasa `p_unidad` explícito se respeta: ése es el override deliberado.

  begin
    insert into presupuesto_linea (presupuesto_id, cat_gasto_id, concepto_id, base, cantidad, unidad)
    values (p_presupuesto_id, p_cat_gasto_id, p_concepto_id, p_base, p_cantidad, p_unidad)
    returning id into v_id;
  exception when unique_violation then
    raise exception
      'Ya hay una línea para esa categoría/concepto en este presupuesto. '
      'Editá la existente en vez de duplicarla.';
  end;

  return v_id;
end;
$function$;


create or replace function public.editar_linea_presupuesto(
  p_linea_id   uuid,
  p_base       numeric default null,
  p_cantidad   numeric default null,
  p_unidad     text default null
)
returns void
language plpgsql
as $function$
begin
  if not exists (select 1 from presupuesto_linea where id = p_linea_id) then
    raise exception 'La línea de presupuesto % no existe', p_linea_id;
  end if;

  if p_base is not null and p_base <= 0 then
    raise exception 'El monto base debe ser positivo (recibido: %)', p_base;
  end if;

  if p_cantidad is not null and p_cantidad <= 0 then
    raise exception 'La cantidad debe ser positiva (recibida: %)', p_cantidad;
  end if;

  update presupuesto_linea
     set base     = coalesce(p_base, base),
         cantidad = coalesce(p_cantidad, cantidad),
         unidad   = coalesce(p_unidad, unidad)
   where id = p_linea_id;
end;
$function$;


create or replace function public.borrar_linea_presupuesto(
  p_linea_id uuid
)
returns void
language plpgsql
as $function$
begin
  if not exists (select 1 from presupuesto_linea where id = p_linea_id) then
    raise exception 'La línea de presupuesto % no existe', p_linea_id;
  end if;

  delete from presupuesto_linea where id = p_linea_id;
end;
$function$;


create or replace function public.aprobar_presupuesto(
  p_presupuesto_id uuid
)
returns void
language plpgsql
as $function$
declare
  v_estado    text;
  v_n_lineas  int;
begin
  select estado into v_estado from presupuesto where id = p_presupuesto_id;

  if not found then
    raise exception 'El presupuesto % no existe', p_presupuesto_id;
  end if;

  if v_estado = 'aprobado' then
    raise exception 'El presupuesto % ya está aprobado', p_presupuesto_id;
  end if;

  select count(*) into v_n_lineas from presupuesto_linea where presupuesto_id = p_presupuesto_id;

  if v_n_lineas = 0 then
    raise exception
      'No se puede aprobar un presupuesto sin líneas. Agregá al menos una '
      'antes de aprobar.';
  end if;

  update presupuesto set estado = 'aprobado' where id = p_presupuesto_id;
end;
$function$;

comment on function crear_presupuesto(uuid, uuid) is
  'PR1 — alta de presupuesto, nace en borrador. Rechaza duplicado de torneo+ejercicio (unique existente).';
comment on function agregar_linea_presupuesto(uuid, uuid, numeric, numeric, uuid, text) is
  'PR1 — agrega una línea a un presupuesto existente. Rechaza duplicado de categoría/concepto (unique existente). Si no se pasa p_unidad, la línea queda con unidad NULL — que NO es un dato faltante sino "heredar del catálogo": v_presupuesto_total resuelve la herencia en 3 niveles (línea, concepto, categoría). Pasar p_unidad es el override deliberado.';
comment on function editar_linea_presupuesto(uuid, numeric, numeric, text) is
  'PR1 — edición parcial de una línea (monto, cantidad, unidad).';
comment on function borrar_linea_presupuesto(uuid) is
  'PR1 — hard delete de una línea. Ver decisión 2 del header sobre por qué no es soft-delete.';
comment on function aprobar_presupuesto(uuid) is
  'PR1 — pasa un presupuesto de borrador a aprobado. Rechaza si no tiene líneas. Solo aprobado proyecta al cashflow (v_presupuesto_total ya filtra).';