-- Prueba de "ingreso extraordinario" antes de aplicar nada.
--
-- Corre las migraciones propuestas (supabase/migrations/20260918110000,
-- 20260918120000, 20260918130000 — el mismo SQL, copiado acá para que el
-- script sea autocontenido) DENTRO de una transacción que se revierte al
-- final: no deja nada escrito en la base, sea cual sea el resultado.
--
-- Cómo correrlo: pegar el archivo entero en el SQL Editor de Supabase (o
-- psql) y ejecutar de una vez. Si algo falla, un RAISE EXCEPTION aborta la
-- transacción en el acto —con el mensaje de qué caso falló— y como ya
-- estaba todo adentro de un BEGIN, no hace falta un ROLLBACK aparte: queda
-- revertido solo. Si todo pasa, se ve una fila "NOTICE: OK caso N: ..." por
-- cada uno de los 7 y el ROLLBACK final al pie es el que de verdad no deja
-- nada aplicado.
--
-- Antes de correr esto: confirmar que la lista de abajo sigue siendo la que
-- devuelve `pg_get_constraintdef` para `asiento_origen_check` en la base real
-- (punto 1 del checklist en docs/coordinacion.md). Si cambió, hay que correr
-- esta prueba con la lista actualizada, no con esta.

begin;

-- ═══ Archivo 1 · cuentas ═══════════════════════════════════════════════════
insert into cuenta (id, codigo, nombre, tipo, imputable, padre_id)
values
  (gen_random_uuid(), 'ING_DONACIONES', 'Donaciones',           'ingreso', true, null),
  (gen_random_uuid(), 'ING_SERVICIOS',  'Servicios a terceros', 'ingreso', true, null),
  (gen_random_uuid(), 'ING_OTROS',      'Otros ingresos',       'ingreso', true, null)
on conflict (codigo) do nothing;

-- ═══ Archivo 2 · tabla + RLS + vista ═══════════════════════════════════════
create table ingreso_extraordinario (
  id          uuid primary key default gen_random_uuid(),
  concepto    text not null,
  monto       numeric(16,2) not null check (monto > 0),
  medio_pago  text not null check (medio_pago in ('efectivo', 'transferencia')),
  fecha       date not null,
  cuenta_id   uuid not null references cuenta(id),
  tercero_id  uuid references tercero(id),
  torneo_id   uuid references torneo(id),
  predio_id   uuid references predio(id),
  asiento_id  uuid not null references asiento(id),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

alter table ingreso_extraordinario enable row level security;

create policy ingreso_extraordinario_select_rol on ingreso_extraordinario
  for select to authenticated
  using (auth_rol() = any (array['admin', 'finanzas']));

create policy ingreso_extraordinario_insert_rol on ingreso_extraordinario
  for insert to authenticated
  with check (auth_rol() = any (array['admin', 'finanzas']));

create view v_ingreso_extraordinario_detalle
  with (security_invoker = true)
as
select
  ie.id, ie.concepto, ie.monto, ie.medio_pago, ie.fecha,
  c.codigo  as cuenta_codigo,
  c.nombre  as cuenta_nombre,
  t.nombre  as tercero,
  tt.nombre as torneo,
  p.nombre  as predio,
  case when a.anulado_por is not null then 'anulado' else 'vigente' end as estado,
  ie.created_at
from ingreso_extraordinario ie
  join cuenta c          on c.id = ie.cuenta_id
  left join tercero t    on t.id = ie.tercero_id
  left join torneo tt    on tt.id = ie.torneo_id
  left join predio p     on p.id = ie.predio_id
  left join asiento a    on a.id = ie.asiento_id
order by ie.fecha desc, ie.created_at desc;

-- ═══ Archivo 3 · constraint + funciones ═════════════════════════════════════
alter table public.asiento drop constraint asiento_origen_check;

alter table public.asiento add constraint asiento_origen_check
  check (origen = any (array[
    'devengo_equipo', 'pago_equipo', 'gasto_devengo', 'gasto_pago',
    'bar', 'arqueo', 'sponsor', 'socio', 'usd', 'amortizacion',
    'cheque', 'fondo', 'ajuste', 'apertura', 'traslado',
    'ingreso_extraordinario'
  ]));

create or replace function public.registrar_ingreso_extraordinario(
  p_monto          numeric,
  p_medio          text,
  p_fecha          date,
  p_concepto       text,
  p_cuenta_ingreso uuid,
  p_tercero_id     uuid default null,
  p_torneo_id      uuid default null,
  p_predio_id      uuid default null,
  p_created_by     uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_user_id       uuid;
  v_cuenta_tipo   text;
  v_cuenta_imp    boolean;
  v_cuenta_codigo text;
  v_cuenta_caja   text;
  v_ingreso_id    uuid;
  v_asiento_id    uuid;
  v_lineas        jsonb;
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas'])) then
    raise exception
      'Registrar un ingreso extraordinario es de administrador o finanzas. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser positivo (recibido: %)', p_monto;
  end if;

  if p_concepto is null or trim(p_concepto) = '' then
    raise exception 'El ingreso extraordinario necesita un concepto: qué es esta plata.';
  end if;

  if p_fecha is null then
    raise exception 'El ingreso necesita fecha.';
  end if;

  if p_medio not in ('efectivo', 'transferencia') then
    raise exception
      'Medio de pago inválido: "%". Los válidos son efectivo y transferencia '
      '— cheque no está soportado todavía en un ingreso extraordinario.', p_medio;
  end if;

  select tipo, imputable, codigo into v_cuenta_tipo, v_cuenta_imp, v_cuenta_codigo
    from cuenta where id = p_cuenta_ingreso;

  if v_cuenta_tipo is null then
    raise exception 'La cuenta % no existe.', p_cuenta_ingreso;
  end if;

  if v_cuenta_tipo <> 'ingreso' or not v_cuenta_imp then
    raise exception 'La cuenta "%" no es una cuenta de ingreso imputable.', v_cuenta_codigo;
  end if;

  if v_cuenta_codigo in ('ING_INSCRIPCIONES', 'ING_PARTIDOS', 'ING_SPONSORS', 'ING_BAR') then
    raise exception
      'La cuenta "%" tiene su propio circuito de cobro — usá ese, no un ingreso extraordinario.',
      v_cuenta_codigo;
  end if;

  if p_medio = 'efectivo' then
    if p_predio_id is null then
      raise exception 'El efectivo requiere predio: sin él no se puede cuadrar el arqueo.';
    end if;
    if not exists (
      select 1 from caja k where k.tipo = 'efectivo' and k.activo and k.predio_id = p_predio_id
    ) then
      raise exception 'El predio % no tiene una caja de efectivo activa.', p_predio_id;
    end if;
    v_cuenta_caja := 'CAJA_EFECTIVO';
  else
    if p_predio_id is not null then
      raise exception 'Solo el efectivo lleva predio. % es una caja global.', p_medio;
    end if;
    v_cuenta_caja := 'CAJA_TRANSFERENCIA';
  end if;

  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable: se requiere p_created_by o sesión autenticada.';
  end if;

  v_ingreso_id := gen_random_uuid();

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', v_cuenta_caja, 'debe', p_monto),
    jsonb_build_object('cuenta', v_cuenta_codigo, 'haber', p_monto, 'tercero_id', p_tercero_id)
  );

  v_asiento_id := crear_asiento(
    p_fecha       => p_fecha,
    p_origen      => 'ingreso_extraordinario',
    p_descripcion => p_concepto,
    p_lineas      => v_lineas,
    p_torneo_id   => p_torneo_id,
    p_predio_id   => p_predio_id,
    p_origen_id   => v_ingreso_id,
    p_created_by  => v_user_id
  );

  insert into ingreso_extraordinario (
    id, concepto, monto, medio_pago, fecha, cuenta_id,
    tercero_id, torneo_id, predio_id, asiento_id, created_by
  ) values (
    v_ingreso_id, trim(p_concepto), p_monto, p_medio, p_fecha, p_cuenta_ingreso,
    p_tercero_id, p_torneo_id, p_predio_id, v_asiento_id, v_user_id
  );

  return v_ingreso_id;
end
$function$;

create or replace function public.anular_ingreso_extraordinario(
  p_ingreso_id uuid,
  p_motivo     text,
  p_created_by uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_asiento_id       uuid;
  v_anulado_por      uuid;
  v_nuevo_asiento_id uuid;
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas'])) then
    raise exception
      'Anular un ingreso extraordinario es de administrador o finanzas. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  select ie.asiento_id, a.anulado_por into v_asiento_id, v_anulado_por
    from ingreso_extraordinario ie
    join asiento a on a.id = ie.asiento_id
   where ie.id = p_ingreso_id;

  if not found then
    raise exception 'El ingreso extraordinario % no existe', p_ingreso_id;
  end if;

  if v_anulado_por is not null then
    raise exception 'El ingreso % ya está anulado', p_ingreso_id;
  end if;

  v_nuevo_asiento_id := anular_asiento(v_asiento_id, p_motivo, null, coalesce(p_created_by, auth.uid()), true);

  return v_nuevo_asiento_id;
end;
$function$;

-- ═══ Las pruebas ════════════════════════════════════════════════════════════
--
-- Un solo usuario real de auth.users hace de "admin", "finanzas" y
-- "operador" por turnos — sólo cambia el claim `app_metadata.rol`, como
-- `comoRol()` en scripts/tests/comun.ts. El rol de Postgres (`authenticated`)
-- es el mismo siempre: lo que decide qué deja pasar RLS es `auth_rol()`
-- leyendo el claim, no el rol de la conexión.
do $$
declare
  v_uid uuid;
begin
  select id into v_uid from auth.users limit 1;
  if v_uid is null then
    raise exception 'No hay usuarios en auth.users — no se puede simular un rol real.';
  end if;
  perform set_config('test.uid', v_uid::text, true);
end $$;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.uid'),
    'role', 'authenticated',
    'app_metadata', json_build_object('rol', 'admin')
  )::text,
  true
);
set local role authenticated;

-- ── Caso 1 · admin registra: asiento_id completo, 2 líneas, 50.000/50.000 ──
do $$
declare
  v_ingreso_id uuid;
  v_asiento_id uuid;
  v_lineas     int;
begin
  v_ingreso_id := registrar_ingreso_extraordinario(
    50000, 'efectivo', current_date, 'Donación de prueba',
    (select id from cuenta where codigo = 'ING_DONACIONES'),
    null, null, (select id from predio limit 1)
  );

  select asiento_id into v_asiento_id from ingreso_extraordinario where id = v_ingreso_id;
  if v_asiento_id is null then
    raise exception 'FALLÓ caso 1: asiento_id quedó null';
  end if;

  select count(*) into v_lineas from asiento_linea where asiento_id = v_asiento_id;
  if v_lineas <> 2 then
    raise exception 'FALLÓ caso 1: el asiento tiene % líneas, esperaba 2', v_lineas;
  end if;

  if not exists (select 1 from asiento_linea where asiento_id = v_asiento_id and debe = 50000)
     or not exists (select 1 from asiento_linea where asiento_id = v_asiento_id and haber = 50000)
  then
    raise exception 'FALLÓ caso 1: las líneas no son 50.000/50.000';
  end if;

  perform set_config('test.ingreso_id', v_ingreso_id::text, true);
  raise notice 'OK caso 1: admin registra, asiento_id=%, 2 líneas balanceadas (50.000/50.000)', v_asiento_id;
end $$;

-- ── Caso 2 · aparece en v_pl_mensual: 12 filas para ING_DONACIONES, y la
--    del mes de la fecha de hoy trae el monto. ───────────────────────────
do $$
declare
  v_filas int;
  v_monto numeric;
begin
  select count(*) into v_filas
    from v_pl_mensual
   where codigo = 'ING_DONACIONES' and anio = extract(year from current_date);
  if v_filas <> 12 then
    raise exception 'FALLÓ caso 2: v_pl_mensual tiene % filas para ING_DONACIONES, esperaba 12', v_filas;
  end if;

  select monto into v_monto
    from v_pl_mensual
   where codigo = 'ING_DONACIONES'
     and anio = extract(year from current_date)
     and mes = extract(month from current_date);
  if v_monto <> 50000 then
    raise exception 'FALLÓ caso 2: el mes de hoy muestra %, esperaba 50000', v_monto;
  end if;

  raise notice 'OK caso 2: v_pl_mensual trae 12 filas para ING_DONACIONES y 50.000 en el mes de hoy';
end $$;

-- ── Caso 3 · operador rechazado al registrar ────────────────────────────
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.uid'),
    'role', 'authenticated',
    'app_metadata', json_build_object('rol', 'operador')
  )::text,
  true
);

do $$
declare
  v_fallo boolean := false;
begin
  begin
    perform registrar_ingreso_extraordinario(
      10000, 'efectivo', current_date, 'Intento de operador',
      (select id from cuenta where codigo = 'ING_OTROS'),
      null, null, (select id from predio limit 1)
    );
    v_fallo := true;
  exception
    when others then
      if sqlerrm not like '%administrador o finanzas%' then
        raise exception 'FALLÓ caso 3: el operador fue rechazado por un motivo inesperado: %', sqlerrm;
      end if;
  end;
  if v_fallo then
    raise exception 'FALLÓ caso 3: el operador pudo registrar, y no debería';
  end if;
  raise notice 'OK caso 3: operador rechazado al registrar';
end $$;

-- ── Caso 4 · operador ve 0 filas, en la tabla y en la vista ─────────────
do $$
declare
  v_tabla int;
  v_vista int;
begin
  select count(*) into v_tabla from ingreso_extraordinario;
  select count(*) into v_vista from v_ingreso_extraordinario_detalle;
  if v_tabla <> 0 then
    raise exception 'FALLÓ caso 4: el operador ve % filas en la tabla, esperaba 0', v_tabla;
  end if;
  if v_vista <> 0 then
    raise exception 'FALLÓ caso 4: el operador ve % filas en la vista, esperaba 0', v_vista;
  end if;
  raise notice 'OK caso 4: operador ve 0 filas en tabla y vista';
end $$;

-- ── Caso 5 · finanzas anula, y la segunda anulación se rechaza ──────────
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.uid'),
    'role', 'authenticated',
    'app_metadata', json_build_object('rol', 'finanzas')
  )::text,
  true
);

do $$
declare
  v_ingreso_id uuid := current_setting('test.ingreso_id')::uuid;
  v_fallo      boolean := false;
begin
  perform anular_ingreso_extraordinario(v_ingreso_id, 'Prueba de rollback — caso 5');

  begin
    perform anular_ingreso_extraordinario(v_ingreso_id, 'Segundo intento');
    v_fallo := true;
  exception
    when others then
      if sqlerrm not like '%ya está anulado%' then
        raise exception 'FALLÓ caso 5: la segunda anulación rechazó por un motivo inesperado: %', sqlerrm;
      end if;
  end;
  if v_fallo then
    raise exception 'FALLÓ caso 5: se pudo anular dos veces el mismo ingreso';
  end if;

  raise notice 'OK caso 5: finanzas anula, y la segunda anulación se rechaza';
end $$;

-- ── Caso 6 · cuenta protegida rechazada (como finanzas, sigue siendo
--    sobre la cuenta — no sobre el rol) ─────────────────────────────────
do $$
declare
  v_fallo boolean := false;
begin
  begin
    perform registrar_ingreso_extraordinario(
      10000, 'transferencia', current_date, 'Intento sobre cuenta protegida',
      (select id from cuenta where codigo = 'ING_SPONSORS'),
      null, null, null
    );
    v_fallo := true;
  exception
    when others then
      if sqlerrm not like '%tiene su propio circuito de cobro%' then
        raise exception 'FALLÓ caso 6: rechazó por un motivo inesperado: %', sqlerrm;
      end if;
  end;
  if v_fallo then
    raise exception 'FALLÓ caso 6: se pudo registrar contra una cuenta protegida';
  end if;
  raise notice 'OK caso 6: cuenta protegida rechazada';
end $$;

-- ── Caso 7 · cheque rechazado ────────────────────────────────────────────
do $$
declare
  v_fallo boolean := false;
begin
  begin
    perform registrar_ingreso_extraordinario(
      10000, 'cheque', current_date, 'Intento con cheque',
      (select id from cuenta where codigo = 'ING_OTROS'),
      null, null, null
    );
    v_fallo := true;
  exception
    when others then
      if sqlerrm not like '%cheque no está soportado%' then
        raise exception 'FALLÓ caso 7: rechazó por un motivo inesperado: %', sqlerrm;
      end if;
  end;
  if v_fallo then
    raise exception 'FALLÓ caso 7: se pudo registrar con cheque, y no debería';
  end if;
  raise notice 'OK caso 7: cheque rechazado';
end $$;

reset role;

-- Si llegaste hasta acá sin que nada abortara la transacción, los 7 casos
-- pasaron. Este ROLLBACK es el que de verdad no deja nada aplicado — todo
-- lo de arriba, incluidas las migraciones de los archivos 1 a 3, se revierte.
rollback;
