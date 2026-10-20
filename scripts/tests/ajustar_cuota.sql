-- Prueba de ajustar_cuota (ajuste y condonación), autocontenida
-- (begin/rollback), roles reales. Nada de esto queda aplicado.
--
-- Cómo correrlo: pegar el archivo entero en el SQL Editor de Supabase (o
-- psql) y ejecutar de una vez. Cada RAISE EXCEPTION de un caso que falla
-- aborta la transacción en el acto, con el mensaje de qué caso fue. Si
-- todo pasa, el último RAISE EXCEPTION ('TODOS LOS CASOS OK') es el que se
-- ve — y como ya aborta la transacción él solo, el ROLLBACK final no deja
-- nada aplicado de todas formas.

begin;

-- ═══ La migración propuesta ═════════════════════════════════════════════
create table public.cuota_ajuste (
  id                uuid primary key default gen_random_uuid(),
  cuota_id          uuid not null references cuota(id),
  tipo              text not null default 'ajuste' check (tipo in ('ajuste', 'condonacion')),
  monto_anterior    numeric(16,2) not null,
  monto_nuevo       numeric(16,2) not null,
  vence_at_anterior date not null,
  vence_at_nuevo    date not null,
  motivo            text not null,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now()
);

alter table public.cuota_ajuste enable row level security;

create policy cuota_ajuste_select_rol on public.cuota_ajuste
  for select to authenticated using (auth_rol() = any (array['admin', 'finanzas']));

create policy cuota_ajuste_insert_admin on public.cuota_ajuste
  for insert to authenticated with check (auth_rol() = 'admin');

create or replace function public.ajustar_cuota(
  p_cuota_id   uuid,
  p_motivo     text,
  p_monto      numeric default null,
  p_vence_at   date default null,
  p_tipo       text default 'ajuste',
  p_created_by uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_user_id         uuid;
  v_monto_anterior  numeric(16,2);
  v_vence_anterior  date;
  v_pagado_at       date;
  v_jornada_id      uuid;
  v_imputado        numeric(16,2);
  v_monto_nuevo     numeric(16,2);
  v_vence_nuevo     date;
  v_pagado_at_nuevo date;
  v_fecha_pago      date;
  v_filas           int;
  v_ajuste_id       uuid;
begin
  if coalesce(auth_rol(), '') <> 'admin' then
    raise exception 'Ajustar una cuota es sólo de administrador. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'El ajuste necesita un motivo: por qué se cambia esta cuota.';
  end if;

  if p_tipo not in ('ajuste', 'condonacion') then
    raise exception 'Tipo de ajuste inválido: "%". Los válidos son ajuste y condonacion.', p_tipo;
  end if;

  if p_monto is null and p_vence_at is null then
    raise exception 'Indicá un monto nuevo, un vencimiento nuevo, o los dos — no hay nada para ajustar.';
  end if;

  select monto, vence_at, pagado_at, jornada_id
    into v_monto_anterior, v_vence_anterior, v_pagado_at, v_jornada_id
    from cuota
   where id = p_cuota_id;

  if not found then
    raise exception 'La cuota % no existe', p_cuota_id;
  end if;

  if v_pagado_at is not null then
    raise exception
      'La cuota % ya está pagada — no se ajusta; si fue un error, se anula el cobro.',
      p_cuota_id;
  end if;

  if p_vence_at is not null and v_jornada_id is not null then
    raise exception
      'Esta cuota vence con su jornada — el vencimiento no se edita a mano. '
      'Para correr la fecha, usá mover_jornada().';
  end if;

  v_pagado_at_nuevo := null;

  if p_monto is not null then
    select coalesce(sum(pi.monto), 0)
         + coalesce((select sum(au.monto) from anticipo_uso au where au.cuota_id = p_cuota_id), 0)
      into v_imputado
      from pago_imputacion pi
     where pi.cuota_id = p_cuota_id;

    if p_monto < v_imputado then
      raise exception
        'El monto nuevo (%) no puede ser menor que lo ya pagado de esta cuota (%).',
        p_monto, v_imputado;
    end if;

    if p_tipo = 'condonacion' then
      if p_monto <> v_imputado or p_vence_at is not null then
        raise exception
          'Una condonación lleva el monto exactamente a lo ya pagado (%) y no '
          'toca el vencimiento. Para otro cambio, usá un ajuste normal.',
          v_imputado;
      end if;

      select max(p.fecha) into v_fecha_pago
        from pago_imputacion pi
        join pago p on p.id = pi.pago_id
       where pi.cuota_id = p_cuota_id;
      select greatest(coalesce(v_fecha_pago, '1900-01-01'), coalesce(max(fecha), '1900-01-01'))
        into v_fecha_pago
        from anticipo_uso where cuota_id = p_cuota_id;
      v_pagado_at_nuevo := case when v_fecha_pago = '1900-01-01' then current_date else v_fecha_pago end;

    elsif p_monto = v_imputado then
      raise exception
        'Este ajuste deja la cuota saldada (monto nuevo = lo ya pagado, %) — '
        'usá "Condonar" en vez de un ajuste normal.',
        v_imputado;
    end if;
  elsif p_tipo = 'condonacion' then
    raise exception 'Una condonación necesita un monto — no hay nada que condonar sin eso.';
  end if;

  v_monto_nuevo := coalesce(p_monto, v_monto_anterior);
  v_vence_nuevo := coalesce(p_vence_at, v_vence_anterior);
  v_user_id := coalesce(p_created_by, auth.uid());

  if v_user_id is null then
    raise exception 'Falta responsable del ajuste: se requiere p_created_by o sesión autenticada.';
  end if;

  update cuota
     set monto = v_monto_nuevo,
         vence_at = v_vence_nuevo,
         pagado_at = v_pagado_at_nuevo
   where id = p_cuota_id
     and pagado_at is null;

  get diagnostics v_filas = row_count;

  if v_filas = 0 then
    raise exception
      'El ajuste no se aplicó (0 filas). La cuota % puede haberse pagado justo ahora — revisála de nuevo.',
      p_cuota_id;
  end if;

  insert into cuota_ajuste (
    cuota_id, tipo, monto_anterior, monto_nuevo, vence_at_anterior, vence_at_nuevo, motivo, created_by
  ) values (
    p_cuota_id, p_tipo, v_monto_anterior, v_monto_nuevo, v_vence_anterior, v_vence_nuevo, trim(p_motivo), v_user_id
  )
  returning id into v_ajuste_id;

  return v_ajuste_id;
end;
$function$;

-- ═══ Setup: un usuario real para los tres roles ════════════════════════
do $$
declare v_uid uuid;
begin
  select id into v_uid from auth.users limit 1;
  if v_uid is null then
    raise exception 'No hay usuarios en auth.users — no se puede simular un rol real.';
  end if;
  perform set_config('test.uid', v_uid::text, true);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.uid'), 'role', 'authenticated',
                     'app_metadata', json_build_object('rol', 'admin'))::text, true);
set local role authenticated;

-- ── Caso 1 · admin ajusta monto Y vencimiento de una cuota impaga sin pagos ──
do $$
declare
  v_cuota_id uuid; v_monto_viejo numeric; v_vence_viejo date;
  v_ajuste_id uuid; v_fila record;
begin
  select id, monto, vence_at into v_cuota_id, v_monto_viejo, v_vence_viejo
    from cuota
   where pagado_at is null
     and not exists (select 1 from pago_imputacion where cuota_id = cuota.id)
     and not exists (select 1 from anticipo_uso where cuota_id = cuota.id)
   limit 1;
  if v_cuota_id is null then
    raise exception 'No hay ninguna cuota impaga sin pagos para probar — sembrá datos antes.';
  end if;

  v_ajuste_id := ajustar_cuota(v_cuota_id, 'Prueba: corrección de monto y fecha',
                                v_monto_viejo + 1000, v_vence_viejo + 7);

  select * into v_fila from cuota_ajuste where id = v_ajuste_id;
  if v_fila.tipo <> 'ajuste' then
    raise exception 'FALLÓ caso 1: tipo quedó "%", esperaba "ajuste"', v_fila.tipo;
  end if;
  if v_fila.monto_anterior <> v_monto_viejo or v_fila.monto_nuevo <> v_monto_viejo + 1000 then
    raise exception 'FALLÓ caso 1: montos anterior/nuevo no coinciden';
  end if;
  if v_fila.vence_at_anterior <> v_vence_viejo or v_fila.vence_at_nuevo <> v_vence_viejo + 7 then
    raise exception 'FALLÓ caso 1: vencimientos anterior/nuevo no coinciden';
  end if;
  if v_fila.created_by is null then
    raise exception 'FALLÓ caso 1: created_by quedó null';
  end if;

  perform set_config('test.cuota1', v_cuota_id::text, true);
  raise notice 'OK caso 1: admin ajusta, cuota_ajuste queda con tipo/anterior/nuevo/usuario/fecha';
end $$;

-- ── Caso 2 · sin motivo, rechazado ──────────────────────────────────────────
do $$
declare v_fallo boolean := false;
begin
  begin
    perform ajustar_cuota(current_setting('test.cuota1')::uuid, '', 999999);
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%motivo%' then
      raise exception 'FALLÓ caso 2: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 2: aceptó sin motivo'; end if;
  raise notice 'OK caso 2: sin motivo, rechazado';
end $$;

-- ── Caso 3 · ni monto ni vencimiento, rechazado ──────────────────────────────
do $$
declare v_fallo boolean := false;
begin
  begin
    perform ajustar_cuota(current_setting('test.cuota1')::uuid, 'Motivo sin cambios');
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%no hay nada para ajustar%' then
      raise exception 'FALLÓ caso 3: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 3: aceptó sin cambios'; end if;
  raise notice 'OK caso 3: sin monto ni vencimiento, rechazado';
end $$;

-- ── Caso 4 · finanzas rechazado (rol) ────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.uid'), 'role', 'authenticated',
                     'app_metadata', json_build_object('rol', 'finanzas'))::text, true);
do $$
declare v_fallo boolean := false;
begin
  begin
    perform ajustar_cuota(current_setting('test.cuota1')::uuid, 'Intento de finanzas', 1);
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%sólo de administrador%' then
      raise exception 'FALLÓ caso 4: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 4: finanzas pudo ajustar'; end if;
  raise notice 'OK caso 4: finanzas rechazado al ajustar';
end $$;

-- ── Caso 5 · operador rechazado y ve 0 filas; finanzas SÍ ve filas ──────────
do $$
declare v_filas int;
begin
  select count(*) into v_filas from cuota_ajuste;
  if v_filas = 0 then
    raise exception 'FALLÓ caso 5: finanzas ve 0 filas en cuota_ajuste, esperaba al menos 1';
  end if;
  raise notice 'OK caso 5a: finanzas ve % fila(s) en cuota_ajuste', v_filas;
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.uid'), 'role', 'authenticated',
                     'app_metadata', json_build_object('rol', 'operador'))::text, true);
do $$
declare v_fallo boolean := false; v_filas int;
begin
  begin
    perform ajustar_cuota(current_setting('test.cuota1')::uuid, 'Intento de operador', 1);
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%sólo de administrador%' then
      raise exception 'FALLÓ caso 5b: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 5b: operador pudo ajustar'; end if;

  select count(*) into v_filas from cuota_ajuste;
  if v_filas <> 0 then raise exception 'FALLÓ caso 5b: operador ve % filas, esperaba 0', v_filas; end if;
  raise notice 'OK caso 5b: operador rechazado al ajustar, ve 0 filas en cuota_ajuste';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.uid'), 'role', 'authenticated',
                     'app_metadata', json_build_object('rol', 'admin'))::text, true);

-- ── Caso 6 · ajuste normal que coincide con lo pagado, rechazado ────────────
-- (pide usar Condonar) · y de paso, monto menor a lo pagado, también
-- rechazado · y el ajuste válido (mayor, no igual) sí se acepta.
do $$
declare
  v_cuota_id uuid; v_tercero_id uuid; v_monto numeric;
  v_pago_id uuid; v_fallo boolean := false;
begin
  select c.id, c.monto, et.tercero_id into v_cuota_id, v_monto, v_tercero_id
    from cuota c join equipo_torneo et on et.id = c.equipo_torneo_id
   where c.pagado_at is null and c.monto > 100
     and c.id <> current_setting('test.cuota1')::uuid
     and not exists (select 1 from pago_imputacion where cuota_id = c.id)
     and not exists (select 1 from anticipo_uso where cuota_id = c.id)
   limit 1;
  if v_cuota_id is null then raise exception 'No hay otra cuota impaga disponible para el caso 6'; end if;

  insert into pago (tercero_id, fecha, monto, medio_pago, registrado_por)
  values (v_tercero_id, current_date, v_monto / 2, 'transferencia', current_setting('test.uid')::uuid)
  returning id into v_pago_id;
  insert into pago_imputacion (pago_id, cuota_id, monto) values (v_pago_id, v_cuota_id, v_monto / 2);

  -- 6a · monto menor a lo pagado, rechazado
  begin
    perform ajustar_cuota(v_cuota_id, 'Intento de bajar por debajo de lo pagado', (v_monto / 2) - 10);
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%no puede ser menor que lo ya pagado%' then
      raise exception 'FALLÓ caso 6a: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 6a: aceptó un monto menor al pagado'; end if;

  -- 6b · ajuste normal que coincide con lo pagado, rechazado — pide Condonar
  v_fallo := false;
  begin
    perform ajustar_cuota(v_cuota_id, 'Ajuste que por error salda la cuota', v_monto / 2);
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%usá "Condonar"%' then
      raise exception 'FALLÓ caso 6b: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 6b: un ajuste normal pudo saldar la cuota'; end if;

  -- 6c · ajuste válido (mayor a lo pagado, no igual) — aceptado
  perform ajustar_cuota(v_cuota_id, 'Ajuste válido, mayor a lo pagado', (v_monto / 2) + 500);

  perform set_config('test.cuota2', v_cuota_id::text, true);
  perform set_config('test.cuota2_imputado', (v_monto / 2)::text, true);
  raise notice 'OK caso 6: menor a lo pagado rechazado; ajuste=lo pagado rechazado (pide Condonar); ajuste válido aceptado';
end $$;

-- ── Caso 7 · condonación con monto distinto a lo pagado, rechazada; con
--    vencimiento, rechazada ──────────────────────────────────────────────
do $$
declare v_cuota_id uuid; v_imputado numeric; v_fallo boolean := false;
begin
  v_cuota_id := current_setting('test.cuota2')::uuid;
  v_imputado := current_setting('test.cuota2_imputado')::numeric;

  begin
    perform ajustar_cuota(v_cuota_id, 'Condonación con monto incorrecto', v_imputado + 1, null, 'condonacion');
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%exactamente a lo ya pagado%' then
      raise exception 'FALLÓ caso 7a: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 7a: condonación con monto incorrecto fue aceptada'; end if;

  v_fallo := false;
  begin
    perform ajustar_cuota(v_cuota_id, 'Condonación que además mueve el vencimiento',
                           v_imputado, current_date + 30, 'condonacion');
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%exactamente a lo ya pagado%' then
      raise exception 'FALLÓ caso 7b: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 7b: condonación con vencimiento fue aceptada'; end if;

  raise notice 'OK caso 7: condonación con monto incorrecto y con vencimiento, ambas rechazadas';
end $$;

-- ── Caso 8 · condonación pura (sin ningún pago) ─────────────────────────────
do $$
declare
  v_cuota_id uuid; v_ajuste_id uuid; v_saldo numeric; v_pagado_at date;
begin
  select id into v_cuota_id
    from cuota
   where pagado_at is null
     and not exists (select 1 from pago_imputacion where cuota_id = cuota.id)
     and not exists (select 1 from anticipo_uso where cuota_id = cuota.id)
     and id not in (current_setting('test.cuota1')::uuid, current_setting('test.cuota2')::uuid)
   limit 1;
  if v_cuota_id is null then raise exception 'No hay otra cuota impaga sin pagos para el caso 8'; end if;

  v_ajuste_id := ajustar_cuota(v_cuota_id, 'Condonación pura, nunca se pagó nada', 0, null, 'condonacion');

  if (select tipo from cuota_ajuste where id = v_ajuste_id) <> 'condonacion' then
    raise exception 'FALLÓ caso 8: cuota_ajuste.tipo no quedó en condonacion';
  end if;

  select pagado_at into v_pagado_at from cuota where id = v_cuota_id;
  if v_pagado_at is distinct from current_date then
    raise exception 'FALLÓ caso 8: pagado_at quedó en %, esperaba hoy (%)', v_pagado_at, current_date;
  end if;

  select saldo into v_saldo from v_deuda_detalle where cuota_id = v_cuota_id;
  if v_saldo <> 0 then
    raise exception 'FALLÓ caso 8: v_deuda_detalle.saldo quedó en %, esperaba 0', v_saldo;
  end if;

  raise notice 'OK caso 8: condonación pura — pagado_at = hoy, saldo = 0 en v_deuda_detalle';
end $$;

-- ── Caso 9 · vencimiento sobre cuota de partido, rechazado ──────────────────
do $$
declare v_cuota_id uuid; v_fallo boolean := false;
begin
  select id into v_cuota_id
    from cuota
   where pagado_at is null and jornada_id is not null
   limit 1;
  if v_cuota_id is null then
    raise exception 'No hay ninguna cuota de partido (jornada_id not null) impaga para el caso 9';
  end if;

  begin
    perform ajustar_cuota(v_cuota_id, 'Intento de mover el vencimiento a mano', null, current_date + 10);
    v_fallo := true;
  exception when others then
    if sqlerrm not like '%vence con su jornada%' then
      raise exception 'FALLÓ caso 9: rechazó por otro motivo: %', sqlerrm;
    end if;
  end;
  if v_fallo then raise exception 'FALLÓ caso 9: se pudo mover el vencimiento de una cuota de partido'; end if;
  raise notice 'OK caso 9: vencimiento de cuota de partido rechazado';
end $$;

-- ── Caso 10 · condonar el remanente de un pago parcial REAL, y reabrir
--    anulando ese pago ──────────────────────────────────────────────────────
do $$
declare
  v_cuota_id uuid; v_tercero_id uuid; v_monto numeric;
  v_pago_id uuid; v_ajuste_id uuid;
  v_pagado_at date; v_saldo numeric;
begin
  select c.id, c.monto, et.tercero_id into v_cuota_id, v_monto, v_tercero_id
    from cuota c join equipo_torneo et on et.id = c.equipo_torneo_id
   where c.pagado_at is null and c.monto > 100
     and c.id not in (current_setting('test.cuota1')::uuid, current_setting('test.cuota2')::uuid)
     and not exists (select 1 from pago_imputacion where cuota_id = c.id)
     and not exists (select 1 from anticipo_uso where cuota_id = c.id)
   limit 1;
  if v_cuota_id is null then raise exception 'No hay otra cuota impaga disponible para el caso 10'; end if;

  -- Pago real, vía registrar_cobro (no un insert directo): necesita
  -- asiento_id para que anular_pago lo acepte después. Fecha distinta de
  -- hoy, a propósito, para distinguir "la fecha del pago real" de "hoy"
  -- cuando se verifique pagado_at más abajo.
  v_pago_id := registrar_cobro(
    p_tercero_id   => v_tercero_id,
    p_monto        => v_monto / 2,
    p_medio        => 'transferencia',
    p_fecha        => current_date - 5,
    p_imputaciones => jsonb_build_array(jsonb_build_object('cuota_id', v_cuota_id, 'monto', v_monto / 2)),
    p_responsable_id => current_setting('test.uid')::uuid
  );

  v_ajuste_id := ajustar_cuota(v_cuota_id, 'Condono el remanente de este pago parcial',
                                v_monto / 2, null, 'condonacion');

  select pagado_at into v_pagado_at from cuota where id = v_cuota_id;
  if v_pagado_at is distinct from (current_date - 5) then
    raise exception
      'FALLÓ caso 10a: pagado_at quedó en %, esperaba la fecha del pago real (%)',
      v_pagado_at, current_date - 5;
  end if;

  select saldo into v_saldo from v_deuda_detalle where cuota_id = v_cuota_id;
  if v_saldo <> 0 then
    raise exception 'FALLÓ caso 10a: v_deuda_detalle.saldo quedó en %, esperaba 0', v_saldo;
  end if;

  -- Reabrir: anular el pago real borra su pago_imputacion, y
  -- trg_sync_cuota_pagada recalcula sola —el monto de la cuota sigue en lo
  -- condonado, así que con 0 imputado el saldo vuelve a ser positivo.
  perform anular_pago(v_pago_id, 'Prueba: reabrir la cuota condonada');

  select pagado_at into v_pagado_at from cuota where id = v_cuota_id;
  if v_pagado_at is not null then
    raise exception 'FALLÓ caso 10b: pagado_at sigue en % después de anular el pago, esperaba null', v_pagado_at;
  end if;

  select saldo into v_saldo from v_deuda_detalle where cuota_id = v_cuota_id;
  if v_saldo <= 0 then
    raise exception 'FALLÓ caso 10b: v_deuda_detalle.saldo quedó en %, esperaba > 0', v_saldo;
  end if;

  raise notice
    'OK caso 10: condonación del remanente de un pago real queda saldada con la fecha del pago (%); '
    'anular ese pago la reabre (pagado_at null, saldo % > 0)',
    current_date - 5, v_saldo;
end $$;

reset role;

-- Si llegaste hasta acá sin que nada abortara antes, los 11 casos (1 a 10,
-- con el 5 y el 6 contando subcasos) pasaron.
do $$ begin raise exception 'TODOS LOS CASOS OK'; end $$;

rollback;
