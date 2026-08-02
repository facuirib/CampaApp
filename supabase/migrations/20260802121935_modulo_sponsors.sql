-- Módulo de sponsors · devengo lineal, dos calendarios e ingreso diferido
--
-- Decisiones 73 a 77. Arquitectura §3.20.
--
-- Tercer patrón de reconocimiento: equipos por percibido puro, socios por
-- devengo mensual de un fijo, sponsors prorrateando el contrato en los meses que
-- cubre.


-- 1 · Las cuentas (decisión 76) -----------------------------------------------
--
-- ING_SPONSORS YA EXISTE en el plan desde el schema inicial, sin uso. Solo se
-- crean dos.
--
-- DEUDORES_SPONSORS propia y no la DEUDORES genérica: ésa se diseñó para
-- equipos y la decisión 1 la sacó de juego —bajo percibido puro, lo que un
-- equipo debe NO está en el diario—. Reusarla resucitaría un concepto retirado
-- a propósito y dejaría ambiguo "¿cuánto nos deben?".
--
-- INGRESO_DIFERIDO tampoco reusa ANTICIPOS: un anticipo es plata YA RECIBIDA;
-- el ingreso diferido es un contrato FIRMADO Y NO GANADO, que puede además
-- estar sin cobrar. Dos pasivos distintos.

insert into cuenta (codigo, nombre, tipo, imputable) values
  ('DEUDORES_SPONSORS', 'Deudores por sponsoreo', 'activo', true),
  ('INGRESO_DIFERIDO',  'Ingresos diferidos',     'pasivo', true)
on conflict (codigo) do nothing;


-- 2 · Estructura --------------------------------------------------------------

create table contrato_sponsor (
  id            uuid primary key default gen_random_uuid(),
  sponsor_id    uuid          not null references tercero(id),
  monto_total   numeric(16,2) not null check (monto_total > 0),
  vigente_desde date          not null,
  vigente_hasta date          not null,
  asiento_firma_id uuid references asiento(id),
  created_by    uuid references auth.users(id),
  created_at    timestamptz   not null default now(),
  check (vigente_hasta >= vigente_desde)
);

comment on table contrato_sponsor is
  'Contrato anual de sponsoreo. El rango define en cuántos meses se prorratea el '
  'reconocimiento. Reusa el patrón de vigencia de sueldo_socio (§3.19).';


-- El contrato es de un sponsor, no de un equipo. La FK sola no lo impide.
create or replace function check_contrato_sponsor() returns trigger
language plpgsql
as $$
declare
  v_tipo text;
begin
  select tipo into v_tipo from tercero where id = new.sponsor_id;

  if not found then
    raise exception 'El tercero % no existe', new.sponsor_id;
  end if;
  if v_tipo <> 'sponsor' then
    raise exception
      'El tercero % es de tipo "%": el contrato de sponsoreo es de un sponsor',
      new.sponsor_id, v_tipo;
  end if;

  return new;
end;
$$;

create trigger trg_contrato_sponsor_es_sponsor
  before insert or update on contrato_sponsor
  for each row execute function check_contrato_sponsor();


-- El calendario de COBRO, independiente del de reconocimiento (decisión 74).
create table cuota_cobro_sponsor (
  id          uuid primary key default gen_random_uuid(),
  contrato_id uuid          not null references contrato_sponsor(id) on delete cascade,
  monto       numeric(16,2) not null check (monto > 0),
  fecha_cobro date          not null,
  cobrado_at  date,
  asiento_id  uuid references asiento(id),
  created_at  timestamptz   not null default now()
);

create index cuota_cobro_sponsor_contrato_idx on cuota_cobro_sponsor (contrato_id);

comment on table cuota_cobro_sponsor is
  'Cronograma de cobros del contrato. NO se deriva del devengo: son dos '
  'calendarios distintos (decisión 74). Alimenta el cashflow.';


-- Anti-duplicado del devengo lineal, mismo patrón que devengo_socio.
create table devengo_sponsor (
  id          uuid primary key default gen_random_uuid(),
  contrato_id uuid          not null references contrato_sponsor(id),
  periodo_id  uuid          not null references periodo(id),
  monto       numeric(16,2) not null,
  asiento_id  uuid          not null references asiento(id),
  created_at  timestamptz   not null default now(),
  unique (contrato_id, periodo_id)
);


-- Meses que cubre un contrato: meses de calendario tocados, de punta a punta.
-- Ago-2026 a jul-2027 son 12, aunque el rango no empiece el día 1.
create or replace function meses_contrato(
  p_desde date,
  p_hasta date
) returns int
language sql
immutable
as $$
  select (extract(year from p_hasta)::int * 12 + extract(month from p_hasta)::int)
       - (extract(year from p_desde)::int * 12 + extract(month from p_desde)::int)
       + 1;
$$;


-- 3 · crear_contrato_sponsor · la firma (decisión 75) -------------------------
--
-- Registra la deuda y el ingreso todavía no ganado. NO toca el P&L: se firmó,
-- no se ganó nada aún.
--
-- p_cuotas es opcional: el cronograma de cobros suele acordarse después. Si
-- viene, se valida que sume el total.

create or replace function crear_contrato_sponsor(
  p_sponsor_id    uuid,
  p_monto_total   numeric,
  p_vigente_desde date,
  p_vigente_hasta date,
  p_cuotas        jsonb default null,   -- [{"monto":400000,"fecha":"2026-08-10"}, …]
  p_fecha_firma   date  default null
) returns uuid
language plpgsql
as $$
declare
  v_nombre    text;
  v_contrato  uuid;
  v_asiento   uuid;
  v_fecha     date;
begin
  select nombre into v_nombre from tercero where id = p_sponsor_id;
  if not found then
    raise exception 'El tercero % no existe', p_sponsor_id;
  end if;

  if p_monto_total is null or p_monto_total <= 0 then
    raise exception 'El monto del contrato debe ser positivo (recibido: %)', p_monto_total;
  end if;

  v_fecha := coalesce(p_fecha_firma, p_vigente_desde);

  insert into contrato_sponsor (sponsor_id, monto_total, vigente_desde, vigente_hasta)
  values (p_sponsor_id, p_monto_total, p_vigente_desde, p_vigente_hasta)
  returning id into v_contrato;

  -- torneo_id NULL: el contrato es anual y cubre los dos torneos. Imputarlo a
  -- uno exigiría el prorrateo que la decisión 5 prohíbe.
  --
  -- origen_id = contrato: es lo que permite que las vistas deriven todo del
  -- diario en vez de recalcular aparte.
  v_asiento := crear_asiento(
    v_fecha,
    'sponsor',
    'Firma contrato · ' || v_nombre || ' · ' ||
      to_char(p_vigente_desde,'MM/YYYY') || '–' || to_char(p_vigente_hasta,'MM/YYYY'),
    jsonb_build_array(
      jsonb_build_object('cuenta','DEUDORES_SPONSORS',
                         'debe',  p_monto_total, 'tercero_id', p_sponsor_id),
      jsonb_build_object('cuenta','INGRESO_DIFERIDO',
                         'haber', p_monto_total, 'tercero_id', p_sponsor_id)
    ),
    null, null, null,   -- torneo, jornada, predio
    v_contrato
  );

  update contrato_sponsor set asiento_firma_id = v_asiento where id = v_contrato;

  if p_cuotas is not null then
    perform cargar_cuotas_sponsor(v_contrato, p_cuotas);
  end if;

  return v_contrato;
end;
$$;


-- El cronograma de cobros, cargable después de firmar.
--
-- Reemplaza el cronograma entero y valida que sume el total: si no suma, el
-- cashflow proyecta plata que nunca va a entrar (o de menos) y
-- DEUDORES_SPONSORS nunca llegaría a cero.
create or replace function cargar_cuotas_sponsor(
  p_contrato_id uuid,
  p_cuotas      jsonb
) returns int
language plpgsql
as $$
declare
  v_total numeric(16,2);
  v_suma  numeric(16,2);
  v_n     int;
begin
  select monto_total into v_total from contrato_sponsor where id = p_contrato_id;
  if not found then
    raise exception 'El contrato % no existe', p_contrato_id;
  end if;

  if exists (select 1 from cuota_cobro_sponsor
              where contrato_id = p_contrato_id and cobrado_at is not null) then
    raise exception
      'El contrato ya tiene cuotas cobradas: no se puede reemplazar el cronograma.';
  end if;

  select coalesce(sum((x->>'monto')::numeric), 0) into v_suma
    from jsonb_array_elements(p_cuotas) x;

  if v_suma <> v_total then
    raise exception
      'Las cuotas suman % y el contrato es de %. El cronograma de cobro tiene que '
      'cubrir el total, o el cashflow proyecta mal y los deudores no cierran.',
      v_suma, v_total;
  end if;

  delete from cuota_cobro_sponsor where contrato_id = p_contrato_id;

  insert into cuota_cobro_sponsor (contrato_id, monto, fecha_cobro)
  select p_contrato_id, (x->>'monto')::numeric, (x->>'fecha')::date
    from jsonb_array_elements(p_cuotas) x;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;


-- 4 · devengar_sponsors · el proceso mensual (decisiones 73 y 75) -------------
--
-- Escribe solo e idempotente, mismo patrón que devengar_sueldos_socios.
--
-- EL ÚLTIMO PERÍODO ABSORBE EL REDONDEO. `total / meses` no siempre da exacto:
-- 1.000.000 en 12 meses da 83.333,33 y doce veces eso son 999.999,96 — los 0,04
-- quedarían PARA SIEMPRE en INGRESO_DIFERIDO, que nunca cerraría en cero.
--
-- El remanente se calcula como `total - cuota * (meses - 1)`, NO como
-- `total - lo ya devengado`: así es determinista y no depende del orden en que
-- se corran los períodos.

create or replace function devengar_sponsors(
  p_periodo_id uuid
) returns int
language plpgsql
as $$
declare
  v_per      record;
  v_fin      date;
  v_idx_per  int;
  v_con      record;
  v_meses    int;
  v_cuota    numeric(16,2);
  v_monto    numeric(16,2);
  v_asiento  uuid;
  v_n        int := 0;
begin
  select p.id, p.anio, p.mes, p.estado into v_per
    from periodo p where p.id = p_periodo_id;

  if not found then
    raise exception 'El período % no existe', p_periodo_id;
  end if;

  if v_per.estado = 'cerrado' then
    raise exception
      'El período %-% está cerrado: no se puede devengar sobre él.',
      v_per.anio, lpad(v_per.mes::text, 2, '0');
  end if;

  v_fin     := (make_date(v_per.anio, v_per.mes, 1) + interval '1 month - 1 day')::date;
  v_idx_per := v_per.anio * 12 + v_per.mes;

  for v_con in
    select c.id, c.sponsor_id, c.monto_total, c.vigente_desde, c.vigente_hasta,
           t.nombre
    from contrato_sponsor c
    join tercero t on t.id = c.sponsor_id
    where v_idx_per between
            (extract(year from c.vigente_desde)::int * 12 + extract(month from c.vigente_desde)::int)
        and (extract(year from c.vigente_hasta)::int * 12 + extract(month from c.vigente_hasta)::int)
      and not exists (
        select 1 from devengo_sponsor d
        where d.contrato_id = c.id and d.periodo_id = p_periodo_id
      )
    order by t.nombre
  loop
    v_meses := meses_contrato(v_con.vigente_desde, v_con.vigente_hasta);
    v_cuota := round(v_con.monto_total / v_meses, 2);

    if v_idx_per = (extract(year  from v_con.vigente_hasta)::int * 12
                  + extract(month from v_con.vigente_hasta)::int) then
      -- último mes: el remanente, para que INGRESO_DIFERIDO cierre exacto
      v_monto := v_con.monto_total - v_cuota * (v_meses - 1);
    else
      v_monto := v_cuota;
    end if;

    continue when v_monto = 0;

    v_asiento := crear_asiento(
      v_fin,
      'sponsor',
      'Devengo sponsor · ' || v_con.nombre || ' · ' ||
        lpad(v_per.mes::text,2,'0') || '/' || v_per.anio,
      jsonb_build_array(
        jsonb_build_object('cuenta','INGRESO_DIFERIDO',
                           'debe',  v_monto, 'tercero_id', v_con.sponsor_id),
        jsonb_build_object('cuenta','ING_SPONSORS',
                           'haber', v_monto, 'tercero_id', v_con.sponsor_id)
      ),
      null, null, null,   -- nivel empresa (decisión 76)
      v_con.id
    );

    insert into devengo_sponsor (contrato_id, periodo_id, monto, asiento_id)
    values (v_con.id, p_periodo_id, v_monto, v_asiento);

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

comment on function devengar_sponsors(uuid) is
  'Devenga la porción del mes de cada contrato vigente. Idempotente. El último '
  'período del contrato absorbe el redondeo para que INGRESO_DIFERIDO cierre '
  'exacto (decisión 75).';


-- 5 · registrar_cobro_sponsor (decisión 77) -----------------------------------
--
-- NO reusa registrar_cobro(): ésa imputa contra `cuota` de equipos y llama a
-- imputar_pago(). El sponsor cobra contra DEUDORES_SPONSORS y no tiene cuotas de
-- equipo. Mismo nombre coloquial, circuitos distintos.

create or replace function registrar_cobro_sponsor(
  p_cuota_id  uuid,
  p_medio     text,                   -- transferencia | central | efectivo
  p_fecha     date default null,
  p_predio_id uuid default null
) returns uuid
language plpgsql
as $$
declare
  v_c       record;
  v_cuenta  text;
  v_fecha   date;
  v_asiento uuid;
begin
  select q.id, q.monto, q.fecha_cobro, q.cobrado_at,
         c.id as contrato_id, c.sponsor_id, t.nombre
    into v_c
  from cuota_cobro_sponsor q
  join contrato_sponsor c on c.id = q.contrato_id
  join tercero t on t.id = c.sponsor_id
  where q.id = p_cuota_id;

  if not found then
    raise exception 'La cuota de cobro % no existe', p_cuota_id;
  end if;
  if v_c.cobrado_at is not null then
    raise exception 'La cuota % ya fue cobrada el %', p_cuota_id, v_c.cobrado_at;
  end if;

  v_cuenta := case p_medio
                when 'transferencia' then 'CAJA_TRANSFERENCIA'
                when 'central'       then 'CAJA_CENTRAL'
                when 'efectivo'      then 'CAJA_EFECTIVO'
              end;
  if v_cuenta is null then
    raise exception
      'Medio "%" desconocido. Usá transferencia, central o efectivo.', p_medio;
  end if;

  if p_medio = 'efectivo' and p_predio_id is null then
    raise exception
      'Un cobro en efectivo tiene que decir en qué predio entró la plata, o el '
      'arqueo de ese día no cierra.';
  end if;
  if p_medio <> 'efectivo' and p_predio_id is not null then
    raise exception 'Solo el cobro en efectivo de predio lleva predio_id.';
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  v_asiento := crear_asiento(
    v_fecha,
    'sponsor',
    'Cobro sponsor · ' || v_c.nombre || ' · ' || p_medio,
    jsonb_build_array(
      jsonb_build_object('cuenta', v_cuenta, 'debe', v_c.monto),
      jsonb_build_object('cuenta','DEUDORES_SPONSORS',
                         'haber', v_c.monto, 'tercero_id', v_c.sponsor_id)
    ),
    null, null, p_predio_id,
    v_c.contrato_id
  );

  update cuota_cobro_sponsor
     set cobrado_at = v_fecha, asiento_id = v_asiento
   where id = p_cuota_id;

  return v_asiento;
end;
$$;


-- 6 · Lo que se lee -----------------------------------------------------------
--
-- Los cuatro números salen del DIARIO, no de las tablas de control: "pendiente
-- de devengar" y "pendiente de cobrar" son literalmente saldos de cuenta. Por
-- eso los tres asientos llevan origen_id = contrato.
--
-- No filtran anulados, por lo mismo que en caja: original y contraasiento se
-- netean, y filtrar solo el original dejaría el contra huérfano.

create view v_estado_sponsor as
select c.id            as contrato_id,
       c.sponsor_id,
       t.nombre        as sponsor,
       c.monto_total,
       c.vigente_desde,
       c.vigente_hasta,
       meses_contrato(c.vigente_desde, c.vigente_hasta) as meses,
       coalesce(m.devengado, 0)            as devengado,
       coalesce(m.cobrado, 0)              as cobrado,
       coalesce(m.pend_devengar, 0)        as pendiente_devengar,
       coalesce(m.pend_cobrar, 0)          as pendiente_cobrar,
       (select count(*) from cuota_cobro_sponsor q where q.contrato_id = c.id) as cuotas,
       (select count(*) from cuota_cobro_sponsor q
         where q.contrato_id = c.id and q.cobrado_at is null)                  as cuotas_pendientes
from contrato_sponsor c
join tercero t on t.id = c.sponsor_id
left join lateral (
  select
    -- ganado: lo acreditado en ING_SPONSORS
    sum(case when cu.codigo = 'ING_SPONSORS'      then l.haber - l.debe else 0 end) as devengado,
    -- cobrado: lo acreditado en DEUDORES_SPONSORS (la firma lo debita)
    sum(case when cu.codigo = 'DEUDORES_SPONSORS' then l.haber           else 0 end) as cobrado,
    -- falta ganar: saldo del pasivo
    sum(case when cu.codigo = 'INGRESO_DIFERIDO'  then l.haber - l.debe else 0 end) as pend_devengar,
    -- falta cobrar: saldo del activo
    sum(case when cu.codigo = 'DEUDORES_SPONSORS' then l.debe  - l.haber else 0 end) as pend_cobrar
  from asiento a
  join asiento_linea l on l.asiento_id = a.id
  join cuenta cu on cu.id = l.cuenta_id
  where a.origen_id = c.id
) m on true;

comment on view v_estado_sponsor is
  'Estado de cada contrato de sponsoreo. Una fila por CONTRATO, no por sponsor: '
  'un sponsor puede tener contratos de años distintos y sumarlos borraría el '
  'sentido de "pendiente de devengar". Todo derivado del diario.';


create view v_cuotas_sponsor_futuras as
select q.id          as cuota_id,
       c.id          as contrato_id,
       c.sponsor_id,
       t.nombre      as sponsor,
       q.monto,
       q.fecha_cobro
from cuota_cobro_sponsor q
join contrato_sponsor c on c.id = q.contrato_id
join tercero t on t.id = c.sponsor_id
where q.cobrado_at is null
  and q.fecha_cobro >= current_date;

comment on view v_cuotas_sponsor_futuras is
  'Cuotas de cobro por vencer. ES LA QUE EL MÓDULO DE CASHFLOW CONSUME '
  '(decisión 77): la entrada de plata sale de acá, no del devengo, que es parejo '
  'y no dice cuándo entra.';
