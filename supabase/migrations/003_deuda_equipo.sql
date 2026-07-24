-- ═══════════════════════════════════════════════════════════════
-- CAMPA · Migración 02
-- Deuda por equipo · imputación elegida · anticipos
-- ═══════════════════════════════════════════════════════════════
-- Se aplica después de campa_migracion_01.sql
--
-- Resuelve:
--   A. La imputación automática decidía sola en casos ambiguos y podía
--      dejar a un equipo impago en el torneo en curso.
--   B. El sobrante de un pago no se registraba: la caja tenía plata que
--      el libro no explicaba.
--
-- Principio: la deuda es del EQUIPO, no del torneo. El torneo es una
-- dimensión de esa deuda, no su contenedor.
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- A. ANTICIPOS (pago a cuenta)
-- ───────────────────────────────────────────────────────────────
-- Cuando un equipo paga más de lo que debe, el sobrante queda como
-- saldo a favor. Sin esto, la caja tiene plata que el libro no explica.

create table if not exists anticipo (
  id          uuid primary key default gen_random_uuid(),
  tercero_id  uuid not null references tercero(id),
  pago_id     uuid not null references pago(id) on delete cascade,
  monto       numeric(16,2) not null check (monto > 0),
  fecha       date not null,
  asiento_id  uuid references asiento(id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_anticipo_tercero on anticipo(tercero_id);

comment on table anticipo is
  'Saldo a favor del equipo: lo que pagó de más. Se imputa a cuotas '
  'futuras. No expira ni se pierde al cambiar de torneo.';

create table if not exists anticipo_uso (
  id           uuid primary key default gen_random_uuid(),
  anticipo_id  uuid not null references anticipo(id) on delete cascade,
  cuota_id     uuid not null references cuota(id) on delete restrict,
  monto        numeric(16,2) not null check (monto > 0),
  fecha        date not null default current_date,
  asiento_id   uuid references asiento(id)
);

create index if not exists idx_anticipo_uso_anticipo on anticipo_uso(anticipo_id);
create index if not exists idx_anticipo_uso_cuota    on anticipo_uso(cuota_id);

comment on table anticipo_uso is
  'Aplicación de un anticipo a una cuota concreta.';


-- El uso de un anticipo no puede exceder su saldo disponible.

create or replace function check_anticipo_uso() returns trigger as $$
declare
  v_monto     numeric(16,2);
  v_usado     numeric(16,2);
begin
  select monto into v_monto from anticipo where id = new.anticipo_id;

  select coalesce(sum(monto), 0) into v_usado
    from anticipo_uso where anticipo_id = new.anticipo_id;

  if v_usado > v_monto then
    raise exception
      'El uso del anticipo (%) excede su monto (%)', v_usado, v_monto;
  end if;

  return new;
end $$ language plpgsql;

drop trigger if exists trg_anticipo_uso on anticipo_uso;
create constraint trigger trg_anticipo_uso
  after insert or update on anticipo_uso
  deferrable initially deferred
  for each row execute function check_anticipo_uso();


-- Saldo disponible de anticipos por equipo

create or replace view v_anticipo_saldo as
select
  a.tercero_id,
  t.nombre as equipo,
  sum(a.monto)                              as total_anticipado,
  coalesce(sum(u.usado), 0)                 as total_usado,
  sum(a.monto) - coalesce(sum(u.usado), 0)  as saldo_disponible
from anticipo a
join tercero t on t.id = a.tercero_id
left join lateral (
  select sum(monto) as usado from anticipo_uso au where au.anticipo_id = a.id
) u on true
group by a.tercero_id, t.nombre
having sum(a.monto) - coalesce(sum(u.usado), 0) > 0;


-- ───────────────────────────────────────────────────────────────
-- B. DEUDA CONSOLIDADA POR EQUIPO
-- ───────────────────────────────────────────────────────────────
-- Un equipo (tercero) puede tener deuda en varios torneos a la vez.
-- Esta es la vista que alimenta la pantalla de cobranza y el modal
-- de registro de pago.

create or replace view v_deuda_equipo as
select
  t.id                as tercero_id,
  t.nombre            as equipo,
  t.email,
  count(distinct et.torneo_id) filter (
    where c.pagado_at is null and c.monto > coalesce(imp.imputado, 0)
  )                   as torneos_con_deuda,
  coalesce(sum(c.monto - coalesce(imp.imputado, 0)) filter (
    where c.pagado_at is null
  ), 0)               as deuda_total,
  coalesce(sum(c.monto - coalesce(imp.imputado, 0)) filter (
    where c.pagado_at is null and c.vence_at < current_date
  ), 0)               as deuda_vencida,
  min(c.vence_at) filter (
    where c.pagado_at is null
  )                   as vencimiento_mas_antiguo,
  coalesce(anticipo.saldo, 0) as saldo_a_favor
from tercero t
join equipo_torneo et on et.tercero_id = t.id
join cuota c          on c.equipo_torneo_id = et.id
left join lateral (
  select coalesce(sum(pi.monto),0)
       + coalesce((select sum(monto) from anticipo_uso au where au.cuota_id = c.id), 0)
      as imputado
  from pago_imputacion pi where pi.cuota_id = c.id
) imp on true
left join lateral (
  select sum(a.monto) - coalesce(sum(au.monto), 0) as saldo
  from anticipo a
  left join anticipo_uso au on au.anticipo_id = a.id
  where a.tercero_id = t.id
) anticipo on true
where t.tipo = 'equipo'
group by t.id, t.nombre, t.email, anticipo.saldo;


-- Detalle: qué debe el equipo, cuota por cuota, en todos sus torneos.
-- Es la lista que se muestra al registrar un pago para elegir imputación.

create or replace view v_deuda_detalle as
select
  t.id                as tercero_id,
  t.nombre            as equipo,
  tt.id               as torneo_id,
  tt.nombre           as torneo,
  tt.estado           as torneo_estado,
  et.categoria,
  c.id                as cuota_id,
  c.numero            as cuota_numero,
  c.vence_at,
  c.monto,
  coalesce(imp.monto, 0) + coalesce(ant.monto, 0)  as pagado,
  c.monto - coalesce(imp.monto, 0) - coalesce(ant.monto, 0) as saldo,
  coalesce(ant.monto, 0)                  as pagado_con_anticipo,
  case
    when c.pagado_at is not null                          then 'pagada'
    when coalesce(imp.monto,0) + coalesce(ant.monto,0) > 0
         and c.vence_at < current_date                    then 'parcial_vencida'
    when coalesce(imp.monto,0) + coalesce(ant.monto,0) > 0 then 'parcial'
    when c.vence_at < current_date                        then 'vencida'
    when c.vence_at <= current_date + 7                   then 'por_vencer'
    else 'al_dia'
  end                                     as estado,
  current_date - c.vence_at               as dias_atraso,
  c.pagado_at
from tercero t
join equipo_torneo et  on et.tercero_id = t.id
join torneo tt         on tt.id = et.torneo_id
join cuota c           on c.equipo_torneo_id = et.id
left join lateral (
  select sum(monto) as monto from pago_imputacion where cuota_id = c.id
) imp on true
left join lateral (
  select sum(monto) as monto from anticipo_uso where cuota_id = c.id
) ant on true
where t.tipo = 'equipo';

comment on view v_deuda_detalle is
  'Deuda del equipo cuota por cuota, en todos sus torneos. Alimenta el '
  'selector de imputación al registrar un pago.';


-- ───────────────────────────────────────────────────────────────
-- C. IMPUTACIÓN ELEGIDA
-- ───────────────────────────────────────────────────────────────
-- Reemplaza a imputar_pago_automatico como camino principal.
-- El operador decide a qué cuotas va el pago; el sistema valida
-- y registra el sobrante como anticipo.
--
-- Recibe: [{"cuota_id": "...", "monto": 123456.00}, ...]
-- Devuelve: monto que quedó como anticipo.

create or replace function imputar_pago(
  p_pago_id      uuid,
  p_imputaciones jsonb
) returns numeric as $$
declare
  v_pago       record;
  v_item       jsonb;
  v_cuota_id   uuid;
  v_monto      numeric(16,2);
  v_total_imp  numeric(16,2) := 0;
  v_saldo      numeric(16,2);
  v_tercero    uuid;
  v_sobrante   numeric(16,2);
begin
  select * into v_pago from pago where id = p_pago_id;
  if not found then
    raise exception 'El pago % no existe', p_pago_id;
  end if;

  -- Validar cada imputación antes de escribir nada
  for v_item in select * from jsonb_array_elements(p_imputaciones)
  loop
    v_cuota_id := (v_item->>'cuota_id')::uuid;
    v_monto    := (v_item->>'monto')::numeric;

    if v_monto <= 0 then
      raise exception 'El monto imputado debe ser positivo (cuota %)', v_cuota_id;
    end if;

    -- La cuota tiene que ser de un equipo_torneo del mismo tercero
    select et.tercero_id into v_tercero
      from cuota c
      join equipo_torneo et on et.id = c.equipo_torneo_id
     where c.id = v_cuota_id;

    if v_tercero is null then
      raise exception 'La cuota % no existe', v_cuota_id;
    end if;

    if v_tercero <> v_pago.tercero_id then
      raise exception
        'La cuota % pertenece a otro equipo. Un pago solo se imputa a '
        'cuotas del mismo equipo.', v_cuota_id;
    end if;

    -- No imputar más que el saldo de la cuota
    select c.monto - coalesce(sum(pi.monto), 0) into v_saldo
      from cuota c
      left join pago_imputacion pi on pi.cuota_id = c.id
     where c.id = v_cuota_id
     group by c.monto;

    if v_monto > v_saldo then
      raise exception
        'Se intenta imputar % a la cuota % pero su saldo es %',
        v_monto, v_cuota_id, v_saldo;
    end if;

    v_total_imp := v_total_imp + v_monto;
  end loop;

  if v_total_imp > v_pago.monto then
    raise exception
      'La suma imputada (%) excede el monto del pago (%)',
      v_total_imp, v_pago.monto;
  end if;

  -- Escribir las imputaciones
  for v_item in select * from jsonb_array_elements(p_imputaciones)
  loop
    insert into pago_imputacion (pago_id, cuota_id, monto)
    values (p_pago_id,
            (v_item->>'cuota_id')::uuid,
            (v_item->>'monto')::numeric)
    on conflict (pago_id, cuota_id)
      do update set monto = pago_imputacion.monto + excluded.monto;
  end loop;

  -- El sobrante queda como anticipo
  v_sobrante := v_pago.monto - v_total_imp;

  if v_sobrante > 0 then
    insert into anticipo (tercero_id, pago_id, monto, fecha)
    values (v_pago.tercero_id, p_pago_id, v_sobrante, v_pago.fecha);
  end if;

  return v_sobrante;
end $$ language plpgsql;

comment on function imputar_pago is
  'Imputa un pago a las cuotas que indique el operador. Valida que las '
  'cuotas sean del mismo equipo y que no se impute de más. El sobrante '
  'se registra como anticipo. Es el camino principal de imputación.';


-- Sugerencia de imputación: qué propondría el sistema.
-- NO escribe nada. La UI la usa para precargar el modal, el operador
-- ajusta y recién ahí se llama a imputar_pago().
--
-- Criterio: primero el torneo en curso (para que el equipo quede
-- habilitado), después el resto por antigüedad.

create or replace function sugerir_imputacion(p_pago_id uuid)
returns jsonb as $$
declare
  v_tercero   uuid;
  v_restante  numeric(16,2);
  v_cuota     record;
  v_aplicar   numeric(16,2);
  v_result    jsonb := '[]'::jsonb;
begin
  select tercero_id, monto into v_tercero, v_restante
    from pago where id = p_pago_id;

  v_restante := v_restante - coalesce(
    (select sum(monto) from pago_imputacion where pago_id = p_pago_id), 0);

  for v_cuota in
    select c.id, c.numero, c.vence_at,
           c.monto - coalesce(sum(pi.monto), 0) as saldo,
           tt.nombre as torneo, tt.estado as torneo_estado
      from cuota c
      join equipo_torneo et on et.id = c.equipo_torneo_id
      join torneo tt        on tt.id = et.torneo_id
      left join pago_imputacion pi on pi.cuota_id = c.id
     where et.tercero_id = v_tercero
       and c.pagado_at is null
     group by c.id, c.numero, c.vence_at, c.monto, tt.nombre, tt.estado
    having c.monto - coalesce(sum(pi.monto), 0) > 0
     order by
       case when tt.estado = 'en_curso' then 0 else 1 end,  -- torneo activo primero
       c.vence_at,
       c.numero
  loop
    exit when v_restante <= 0;

    v_aplicar := least(v_restante, v_cuota.saldo);

    v_result := v_result || jsonb_build_object(
      'cuota_id',  v_cuota.id,
      'monto',     v_aplicar,
      'torneo',    v_cuota.torneo,
      'cuota',     v_cuota.numero,
      'vence_at',  v_cuota.vence_at,
      'saldo',     v_cuota.saldo
    );

    v_restante := v_restante - v_aplicar;
  end loop;

  return jsonb_build_object(
    'imputaciones', v_result,
    'sobrante',     v_restante
  );
end $$ language plpgsql;

comment on function sugerir_imputacion is
  'Propone una imputación sin escribirla: torneo en curso primero, '
  'después por antigüedad. La UI la usa para precargar el modal.';


-- Aplicar un anticipo existente a una cuota

create or replace function aplicar_anticipo(
  p_tercero_id uuid,
  p_cuota_id   uuid,
  p_monto      numeric
) returns numeric as $$
declare
  v_disponible numeric(16,2);
  v_saldo      numeric(16,2);
  v_restante   numeric(16,2);
  v_ant        record;
  v_aplicar    numeric(16,2);
begin
  select saldo_disponible into v_disponible
    from v_anticipo_saldo where tercero_id = p_tercero_id;

  if coalesce(v_disponible, 0) < p_monto then
    raise exception
      'Saldo a favor insuficiente: disponible %, se intenta aplicar %',
      coalesce(v_disponible, 0), p_monto;
  end if;

  select c.monto - coalesce(sum(pi.monto), 0)
       - coalesce((select sum(monto) from anticipo_uso where cuota_id = p_cuota_id), 0)
    into v_saldo
    from cuota c
    left join pago_imputacion pi on pi.cuota_id = c.id
   where c.id = p_cuota_id
   group by c.monto;

  if p_monto > v_saldo then
    raise exception 'La cuota tiene saldo % y se intenta aplicar %', v_saldo, p_monto;
  end if;

  v_restante := p_monto;

  -- Consumir anticipos del más antiguo al más nuevo
  for v_ant in
    select a.id, a.monto - coalesce(sum(au.monto), 0) as disponible
      from anticipo a
      left join anticipo_uso au on au.anticipo_id = a.id
     where a.tercero_id = p_tercero_id
     group by a.id, a.monto, a.fecha
    having a.monto - coalesce(sum(au.monto), 0) > 0
     order by a.fecha, a.id
  loop
    exit when v_restante <= 0;
    v_aplicar := least(v_restante, v_ant.disponible);

    insert into anticipo_uso (anticipo_id, cuota_id, monto)
    values (v_ant.id, p_cuota_id, v_aplicar);

    v_restante := v_restante - v_aplicar;
  end loop;

  return p_monto - v_restante;
end $$ language plpgsql;


-- ───────────────────────────────────────────────────────────────
-- D. sync_cuota_pagada CONTEMPLA ANTICIPOS
-- ───────────────────────────────────────────────────────────────
-- Sin esto, una cuota cancelada con saldo a favor nunca se marcaría
-- como pagada: el trigger solo miraba pago_imputacion.

create or replace function sync_cuota_pagada() returns trigger as $$
declare
  v_cuota_id  uuid;
  v_monto     numeric(16,2);
  v_imputado  numeric(16,2);
  v_anticipo  numeric(16,2);
  v_ultimo    date;
begin
  v_cuota_id := coalesce(new.cuota_id, old.cuota_id);

  select monto into v_monto from cuota where id = v_cuota_id;

  select coalesce(sum(pi.monto), 0), max(p.fecha)
    into v_imputado, v_ultimo
    from pago_imputacion pi
    join pago p on p.id = pi.pago_id
   where pi.cuota_id = v_cuota_id;

  select coalesce(sum(monto), 0), greatest(coalesce(max(fecha), '1900-01-01'), coalesce(v_ultimo, '1900-01-01'))
    into v_anticipo, v_ultimo
    from anticipo_uso where cuota_id = v_cuota_id;

  if v_imputado + v_anticipo >= v_monto then
    update cuota set pagado_at = nullif(v_ultimo, '1900-01-01') where id = v_cuota_id;
  else
    update cuota set pagado_at = null where id = v_cuota_id;
  end if;

  return null;
end $$ language plpgsql;

drop trigger if exists trg_sync_cuota_pagada on pago_imputacion;
create trigger trg_sync_cuota_pagada
  after insert or update or delete on pago_imputacion
  for each row execute function sync_cuota_pagada();

-- El mismo trigger sobre anticipo_uso
drop trigger if exists trg_sync_cuota_anticipo on anticipo_uso;
create trigger trg_sync_cuota_anticipo
  after insert or update or delete on anticipo_uso
  for each row execute function sync_cuota_pagada();


-- ───────────────────────────────────────────────────────────────
-- E. imputar_pago_automatico QUEDA DEPRECADA
-- ───────────────────────────────────────────────────────────────
-- Decidía sola en casos ambiguos. Se conserva para no romper nada,
-- pero avisa y delega en el criterio de sugerir_imputacion.

create or replace function imputar_pago_automatico(p_pago_id uuid)
returns numeric as $$
declare
  v_sug jsonb;
begin
  raise warning
    'imputar_pago_automatico está deprecada. Usá sugerir_imputacion() '
    'para proponer y imputar_pago() para confirmar.';

  v_sug := sugerir_imputacion(p_pago_id);
  return imputar_pago(p_pago_id, v_sug->'imputaciones');
end $$ language plpgsql;


-- ───────────────────────────────────────────────────────────────
-- F. pago.cuota_id DEPRECADA POR CONTRATO
-- ───────────────────────────────────────────────────────────────
-- Ahora que existe pago_imputacion hay dos caminos para lo mismo.
-- No se borra todavía para no romper código en desarrollo, pero
-- queda marcada: no se escribe.

comment on column pago.cuota_id is
  'DEPRECADA · No escribir. La imputación vive en pago_imputacion. '
  'Se elimina cuando el bloque 3 (Cobranza) esté terminado.';


-- ───────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ───────────────────────────────────────────────────────────────

do $$
declare n int;
begin
  select count(*) into n from information_schema.tables
   where table_name in ('anticipo','anticipo_uso');
  if n <> 2 then raise exception 'Faltan tablas de anticipos (% de 2)', n; end if;

  select count(*) into n from information_schema.views
   where table_name in ('v_deuda_equipo','v_deuda_detalle','v_anticipo_saldo');
  if n <> 3 then raise exception 'Faltan vistas (% de 3)', n; end if;

  select count(*) into n from pg_proc
   where proname in ('imputar_pago','sugerir_imputacion','aplicar_anticipo');
  if n <> 3 then raise exception 'Faltan funciones (% de 3)', n; end if;

  raise notice 'Migración 02 aplicada correctamente';
end $$;
