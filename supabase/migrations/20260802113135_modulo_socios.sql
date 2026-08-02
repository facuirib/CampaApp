-- Módulo de socios · sueldo devengado y retiros
--
-- Decisiones 68 a 72. Arquitectura §3.19.
--
-- Forma B: el sueldo del socio SE DEVENGA. Es la excepción deliberada al
-- percibido puro de la decisión 1 — un ingreso de equipo puede no ocurrir nunca,
-- el sueldo del socio existe cada mes se retire o no.


-- 1 · Las dos cuentas (decisión 69) -------------------------------------------
--
-- `egreso` y no `patrimonio`: el sueldo de socios es COSTO DEL NEGOCIO, no
-- distribución de utilidad. El tipo de cuenta decide el P&L solo, porque
-- v_resultado_producto filtra `c.tipo in ('ingreso','egreso')`. No se toca
-- ninguna vista.
--
-- Cuenta propia y no GAS_SUELDOS (empleados): el total del P&L es el mismo,
-- pero separarlas permite leer el sueldo operativo aparte del de los dueños.

insert into cuenta (codigo, nombre, tipo, imputable) values
  ('GAS_SOCIOS',     'Sueldos de socios', 'egreso', true),
  ('SOCIOS_A_PAGAR', 'Socios a pagar',    'pasivo', true)
on conflict (codigo) do nothing;


-- 2 · El sueldo acordado, versionado (decisión 70) ----------------------------
--
-- Primer parámetro versionado de verdad del sistema. `config_contable` tiene
-- vigente_desde pero es UNA SOLA FILA sin historial —y no la lee nadie—, así
-- que no servía de molde.
--
-- Cambiar el sueldo es INSERTAR una fila, no editar la que hay: es lo que
-- permite recalcular un mes viejo con el sueldo que regía entonces.

create table sueldo_socio (
  id            uuid primary key default gen_random_uuid(),
  socio_id      uuid          not null references tercero(id),
  monto         numeric(16,2) not null check (monto >= 0),
  vigente_desde date          not null,
  created_by    uuid references auth.users(id),
  created_at    timestamptz   not null default now(),
  -- dos sueldos que arrancan el mismo día serían ambiguos: no se sabría cuál rige
  unique (socio_id, vigente_desde)
);

comment on table sueldo_socio is
  'Sueldo mensual acordado con cada socio, versionado. El vigente en un mes es '
  'el de mayor vigente_desde <= fin de ese mes. Se cambia insertando, no '
  'editando (decisión 70).';


-- El sueldo se le asigna a un socio, no a un equipo. La FK sola no lo impide.
create or replace function check_sueldo_socio() returns trigger
language plpgsql
as $$
declare
  v_tipo text;
begin
  select tipo into v_tipo from tercero where id = new.socio_id;

  if not found then
    raise exception 'El tercero % no existe', new.socio_id;
  end if;

  if v_tipo <> 'socio' then
    raise exception
      'El tercero % es de tipo "%": solo los socios tienen sueldo acordado',
      new.socio_id, v_tipo;
  end if;

  return new;
end;
$$;

create trigger trg_sueldo_socio_es_socio
  before insert or update on sueldo_socio
  for each row execute function check_sueldo_socio();


create or replace function sueldo_vigente(
  p_socio_id uuid,
  p_fecha    date
) returns numeric
language sql
stable
as $$
  select s.monto
  from sueldo_socio s
  where s.socio_id = p_socio_id
    and s.vigente_desde <= p_fecha
  order by s.vigente_desde desc
  limit 1;
$$;

comment on function sueldo_vigente(uuid, date) is
  'Sueldo que regía para ese socio en esa fecha. NULL si todavía no había '
  'ninguno acordado.';


-- 3 · El devengo mensual (decisión 71) ----------------------------------------
--
-- Marca de lo ya devengado. Misma forma que `amortizacion` (activo_id,
-- periodo_id, monto, asiento_id): es lo que hace la función idempotente.

create table devengo_socio (
  id         uuid primary key default gen_random_uuid(),
  socio_id   uuid          not null references tercero(id),
  periodo_id uuid          not null references periodo(id),
  monto      numeric(16,2) not null,
  asiento_id uuid          not null references asiento(id),
  created_at timestamptz   not null default now(),
  unique (socio_id, periodo_id)
);

comment on table devengo_socio is
  'Un devengo por socio y período. El unique es lo que impide duplicar si el '
  'proceso se corre dos veces.';


-- ESCRIBE SOLO, y rompe con el único precedente a propósito.
--
-- `proponer_amortizaciones` propone y el operador confirma (decisión 23) porque
-- una amortización es una ESTIMACIÓN. El sueldo del socio es un monto ACORDADO
-- y conocido: no hay nada que revisar antes de asentarlo.
--
-- No es un cron invisible: alguien la corre al procesar el mes.

create or replace function devengar_sueldos_socios(
  p_periodo_id uuid
) returns int
language plpgsql
as $$
declare
  v_per     record;
  v_fin     date;
  v_socio   record;
  v_monto   numeric(16,2);
  v_asiento uuid;
  v_n       int := 0;
begin
  select p.id, p.anio, p.mes, p.estado
    into v_per
  from periodo p where p.id = p_periodo_id;

  if not found then
    raise exception 'El período % no existe', p_periodo_id;
  end if;

  if v_per.estado = 'cerrado' then
    raise exception
      'El período %-% está cerrado: no se puede devengar sobre él.',
      v_per.anio, lpad(v_per.mes::text, 2, '0');
  end if;

  -- El devengo se asienta el último día del mes: es el mes completo lo que se
  -- devenga, no un día puntual.
  v_fin := (make_date(v_per.anio, v_per.mes, 1) + interval '1 month - 1 day')::date;

  for v_socio in
    select t.id, t.nombre
    from tercero t
    where t.tipo = 'socio'
      and t.activo
      -- idempotencia: lo ya devengado en este período no se vuelve a tocar
      and not exists (
        select 1 from devengo_socio d
        where d.socio_id = t.id and d.periodo_id = p_periodo_id
      )
    order by t.nombre
  loop
    v_monto := sueldo_vigente(v_socio.id, v_fin);

    -- Sin sueldo acordado vigente a fin de mes no hay nada que devengar. No es
    -- un error: un socio puede incorporarse a mitad de año.
    continue when v_monto is null or v_monto = 0;

    -- torneo_id NULL = ESTRUCTURA PERMANENTE (decisión 5, §3.2).
    --
    -- El sueldo del socio existe todos los meses, haya torneo o no. Imputarlo a
    -- un torneo exigiría prorratearlo entre los que corren ese mes, que es
    -- exactamente el criterio arbitrario que la decisión 5 prohíbe.
    --
    -- Consecuencia visible: en v_resultado_producto aparece bajo "Estructura
    -- permanente", no bajo el torneo. Baja el resultado de la EMPRESA, no la
    -- contribución del torneo.
    v_asiento := crear_asiento(
      v_fin,
      'socio',
      'Sueldo ' || v_socio.nombre || ' · ' ||
        lpad(v_per.mes::text, 2, '0') || '/' || v_per.anio,
      jsonb_build_array(
        jsonb_build_object('cuenta','GAS_SOCIOS',
                           'debe',  v_monto, 'tercero_id', v_socio.id),
        jsonb_build_object('cuenta','SOCIOS_A_PAGAR',
                           'haber', v_monto, 'tercero_id', v_socio.id)
      ),
      null,   -- torneo_id: estructura permanente
      null,   -- jornada_id
      null,   -- predio_id
      null    -- origen_id
    );

    insert into devengo_socio (socio_id, periodo_id, monto, asiento_id)
    values (v_socio.id, p_periodo_id, v_monto, v_asiento);

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

comment on function devengar_sueldos_socios(uuid) is
  'Devenga el sueldo de cada socio para un período. Idempotente: correrla dos '
  'veces no duplica. Escribe sola (decisión 71). Imputa a estructura '
  'permanente, no a un torneo (decisión 5).';


-- 4 · El retiro (decisión 72) -------------------------------------------------
--
-- Cancela el pasivo devengado. NO es un rescate del fondo de inversión: ése
-- mueve respaldo contra FONDO_INVERSION y no toca resultado. Cuentas y
-- conceptos separados, o v_dependencia_fondo deja de significar lo que dice.
--
-- NO valida que haya saldo suficiente, a propósito: retirar de más deja el
-- saldo en contra, que es el comportamiento acordado.

create or replace function crear_retiro_socio(
  p_socio_id  uuid,
  p_monto     numeric,
  p_medio     text,                    -- transferencia | central | efectivo
  p_fecha     date default null,
  p_predio_id uuid default null
) returns uuid
language plpgsql
as $$
declare
  v_tipo   text;
  v_nombre text;
  v_cuenta text;
  v_fecha  date;
begin
  select tipo, nombre into v_tipo, v_nombre from tercero where id = p_socio_id;

  if not found then
    raise exception 'El tercero % no existe', p_socio_id;
  end if;
  if v_tipo <> 'socio' then
    raise exception
      'El tercero % es de tipo "%": el retiro de sueldo es de un socio',
      p_socio_id, v_tipo;
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del retiro debe ser positivo (recibido: %)', p_monto;
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

  -- crear_asiento ya exige predio para CAJA_EFECTIVO, pero el mensaje de acá
  -- dice qué hacer: si un socio se lleva efectivo de un predio y el asiento no
  -- lo declara, el arqueo de ese día no cuadra (§3.6).
  if p_medio = 'efectivo' and p_predio_id is null then
    raise exception
      'Un retiro en efectivo tiene que decir de qué predio salió la plata, o el '
      'arqueo de ese día no cierra. Para transferencia o caja central no hace falta.';
  end if;
  if p_medio <> 'efectivo' and p_predio_id is not null then
    raise exception
      'Solo el retiro en efectivo de predio lleva predio_id.';
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  return crear_asiento(
    v_fecha,
    'socio',
    'Retiro ' || v_nombre || ' · ' || p_medio,
    jsonb_build_array(
      jsonb_build_object('cuenta','SOCIOS_A_PAGAR',
                         'debe',  p_monto, 'tercero_id', p_socio_id),
      jsonb_build_object('cuenta', v_cuenta, 'haber', p_monto)
    ),
    null,           -- torneo_id: estructura permanente, igual que el devengo
    null,           -- jornada_id
    p_predio_id,
    null
  );
end;
$$;

comment on function crear_retiro_socio(uuid, numeric, text, date, uuid) is
  'Retiro de sueldo: cancela el pasivo contra la caja elegida. No valida saldo '
  'suficiente — retirar de más deja el saldo en contra, que es lo acordado.';


-- 5 · Lo que se lee -----------------------------------------------------------
--
-- Ninguna de las dos filtra anulados, y es deliberado: `anular_asiento` marca el
-- original pero deja el contraasiento con anulado_por NULL. Para un SALDO,
-- incluir los dos los netea a cero; filtrar solo el original dejaría el contra
-- huérfano. La regla 4 vale para vistas que LISTAN asientos, no para las que
-- SUMAN saldos.

create view v_saldo_socio as
select t.id     as socio_id,
       t.nombre,
       t.activo,
       coalesce(sum(l.haber), 0)            as devengado,
       coalesce(sum(l.debe),  0)            as retirado,
       -- SOCIOS_A_PAGAR es pasivo: su saldo natural es haber - debe.
       -- Positivo = a favor del socio; negativo = retiró de más.
       coalesce(sum(l.haber - l.debe), 0)   as saldo
from tercero t
left join asiento_linea l
       on l.tercero_id = t.id
      and l.cuenta_id  = (select id from cuenta where codigo = 'SOCIOS_A_PAGAR')
where t.tipo = 'socio'
group by t.id, t.nombre, t.activo;

comment on view v_saldo_socio is
  'Saldo actual de cada socio, derivado de SOCIOS_A_PAGAR. Positivo = a favor '
  'del socio; negativo = retiró de más.';


create view v_socio_detalle_mensual as
with mov as (
  select t.id      as socio_id,
         t.nombre,
         p.id      as periodo_id,
         p.anio,
         p.mes,
         sum(l.haber) as devengado,
         sum(l.debe)  as retirado
  from tercero t
  join asiento_linea l on l.tercero_id = t.id
  join cuenta  c on c.id = l.cuenta_id and c.codigo = 'SOCIOS_A_PAGAR'
  join asiento a on a.id = l.asiento_id
  join periodo p on p.id = a.periodo_id
  where t.tipo = 'socio'
  group by t.id, t.nombre, p.id, p.anio, p.mes
)
select socio_id, nombre, periodo_id, anio, mes,
       devengado, retirado,
       devengado - retirado as neto,
       sum(devengado - retirado) over (
         partition by socio_id
         order by anio, mes
         rows between unbounded preceding and current row
       ) as saldo_acumulado
from mov;

comment on view v_socio_detalle_mensual is
  'Mes a mes por socio: devengado, retirado y saldo acumulado. El acumulado es '
  'una ventana sobre los períodos con movimiento — el saldo al cierre de cada mes.';
