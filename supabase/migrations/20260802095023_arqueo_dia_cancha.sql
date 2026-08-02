-- Pieza 4 · el arqueo cuelga de dia_cancha, y la consolidación de efectivo
--
-- Decisiones 57 a 61. Arquitectura §3.6.
--
-- Migrar es gratis: `arqueo` tiene 0 filas, ninguna FK entrante, ninguna vista
-- que la lea y ningún código de app que la toque. Sin backfill.


-- 1 · Recolgado ---------------------------------------------------------------
--
-- (jornada_id, predio_id) -> dia_cancha_id. Dos columnas se vuelven una FK.
--
-- El arqueo controla la caja física de un predio EN UN DÍA. Con jornadas por
-- serie, atarlo a "la jornada de una serie" pierde sentido: ese día jugaron
-- varias series y la plata no distingue de cuál vino.
--
-- La decisión 56 es precondición: como un día de cancha puede existir SIN
-- jornada, el arqueo de un sábado de solo bar tiene dónde colgar.

alter table arqueo drop column jornada_id;
alter table arqueo drop column predio_id;

alter table arqueo add column dia_cancha_id uuid not null references dia_cancha(id);

-- Cierra un agujero que existía: hoy nada impide dos arqueos del mismo predio
-- y fecha.
alter table arqueo add constraint arqueo_dia_cancha_id_key unique (dia_cancha_id);

-- El estado ES el estado contable (decisión 58): un arqueo pendiente significa
-- que la plata la tiene su responsable. No hay cuenta "a rendir".
alter table arqueo add column estado text not null default 'pendiente_entrega'
  check (estado in ('pendiente_entrega', 'entregado'));

alter table arqueo add column entregado_at timestamptz;

-- Dos asientos posibles, y significan cosas distintas. Tenerlos en una sola
-- columna sería ambiguo justo donde importa.
alter table arqueo rename column asiento_id to asiento_ajuste_id;
alter table arqueo add column asiento_entrega_id uuid references asiento(id);

comment on column arqueo.saldo_sistema is
  'Saldo esperado, CONGELADO al arquear (decisión 59). Si mañana se corrige un '
  'asiento viejo, este número no cambia: el arqueo es un acta histórica.';
comment on column arqueo.asiento_ajuste_id is
  'Asiento que resuelve la diferencia. NULL mientras no se resuelva — y puede '
  'no resolverse nunca (decisión 61).';
comment on column arqueo.asiento_entrega_id is
  'Asiento del traslado predio -> central. NULL mientras esté pendiente.';
comment on column arqueo.responsable_id is
  'Quién contó, y quién TIENE la plata mientras el arqueo esté pendiente de '
  'entrega (decisión 58).';


-- 2 · El saldo esperado -------------------------------------------------------
--
-- Lo que no existía: v_saldo_caja da el acumulado a hoy, sin corte por fecha, y
-- no puede responder "cuánto efectivo debería haber en TIR al cierre del 8/8".
--
-- Se deriva del libro diario y de nada más. No enumera casos —cobros, gastos,
-- entregas—: todos son líneas de CAJA_EFECTIVO de ese predio, y sumarlas es
-- exactamente la respuesta. Enumerar categorías sería una segunda fuente que se
-- desactualiza cada vez que aparece un tipo de movimiento nuevo.
--
-- NO FILTRA ANULADOS, Y ES DELIBERADO. `anular_asiento` marca el original pero
-- deja el contraasiento con `anulado_por is null`. Para un SALDO:
--   · incluyendo los dos            -> +X y -X se netean -> 0    CORRECTO
--   · filtrando anulado_por is null -> excluye el original y deja el
--                                      contraasiento huerfano -> -X   MAL
-- Además el contraasiento tiene FECHA PROPIA, que puede ser posterior: con
-- corte temporal, incluir ambos da la foto fiel de lo que el diario decía ese
-- día, que es justo lo que un acta necesita.

create or replace function saldo_efectivo_predio(
  p_predio_id uuid,
  p_hasta     date
) returns numeric
language sql
stable
as $$
  select coalesce(sum(l.debe - l.haber), 0)::numeric(16,2)
  from asiento_linea l
  join asiento a on a.id = l.asiento_id
  join cuenta  c on c.id = l.cuenta_id
  where c.codigo    = 'CAJA_EFECTIVO'
    and a.predio_id = p_predio_id
    and a.fecha    <= p_hasta;
$$;

comment on function saldo_efectivo_predio(uuid, date) is
  'Efectivo que debería haber en un predio al cierre de una fecha, derivado del '
  'libro diario. Es la base del saldo_sistema del arqueo.';


-- La misma cuenta, por día de cancha: lo que la pantalla de arqueo necesita
-- mostrar antes de contar.
create view v_saldo_efectivo_dia_cancha as
select dc.id      as dia_cancha_id,
       dc.fecha,
       dc.predio_id,
       p.codigo   as predio,
       p.nombre   as predio_nombre,
       saldo_efectivo_predio(dc.predio_id, dc.fecha) as saldo_sistema,
       a.id       as arqueo_id,
       a.estado   as arqueo_estado
from dia_cancha dc
join predio p on p.id = dc.predio_id
left join arqueo a on a.dia_cancha_id = dc.id;

comment on view v_saldo_efectivo_dia_cancha is
  'Cuánto efectivo debería haber en cada día de operación de predio, y si ya se '
  'arqueó. El saldo es en vivo; el del arqueo, una vez hecho, está congelado.';


-- 3 · crear_arqueo · la puerta del control ------------------------------------
--
-- Agnóstica del torneo (regla 12): recibe día de cancha, monto y responsable.
--
-- NO mueve plata (decisión 60, Escenario A). Es control puro.

create or replace function crear_arqueo(
  p_dia_cancha_id  uuid,
  p_saldo_contado  numeric,
  p_responsable_id uuid default null
) returns uuid
language plpgsql
as $$
declare
  v_dia         record;
  v_responsable uuid;
  v_sistema     numeric(16,2);
  v_id          uuid;
begin
  select dc.id, dc.fecha, dc.predio_id
    into v_dia
  from dia_cancha dc
  where dc.id = p_dia_cancha_id;

  if not found then
    raise exception 'El día de cancha % no existe', p_dia_cancha_id;
  end if;

  if p_saldo_contado is null or p_saldo_contado < 0 then
    raise exception 'El saldo contado debe ser un importe no negativo (recibido: %)',
      p_saldo_contado;
  end if;

  if exists (select 1 from arqueo where dia_cancha_id = p_dia_cancha_id) then
    raise exception 'Ese día de cancha ya tiene un arqueo. Un arqueo por día y predio.';
  end if;

  -- Mismo criterio que crear_asiento: el parámetro, la sesión, o el primer
  -- usuario. El último caso es solo para pruebas desde el SQL Editor.
  v_responsable := coalesce(p_responsable_id, auth.uid(), (select id from auth.users limit 1));
  if v_responsable is null then
    raise exception 'No hay usuario. Creá uno en Authentication o pasá p_responsable_id.';
  end if;

  -- Acá se CONGELA (decisión 59): se calcula una vez y se guarda.
  v_sistema := saldo_efectivo_predio(v_dia.predio_id, v_dia.fecha);

  insert into arqueo (dia_cancha_id, saldo_sistema, saldo_contado,
                      estado, responsable_id)
  values (p_dia_cancha_id, v_sistema, p_saldo_contado,
          'pendiente_entrega', v_responsable)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function crear_arqueo(uuid, numeric, uuid) is
  'Registra el control de caja de un día de cancha. Congela el saldo esperado, '
  'guarda lo contado, la diferencia se calcula sola. NO mueve plata: el '
  'traslado ocurre al entregar (decisión 60).';


-- 4 · registrar_entrega_central · el único movimiento -------------------------
--
-- Escenario A: el efectivo del predio baja ACÁ, no al arquear.
--
-- Se traslada lo CONTADO, no lo esperado: es la plata que el responsable tiene
-- en la mano. Si hubo diferencia, el residuo queda en la caja del predio y ES
-- la diferencia sin resolver — visible en el saldo hasta que alguien la impute
-- (decisión 61). No hace falta hacer nada extra para que eso pase: sale solo.

create or replace function registrar_entrega_central(
  p_arqueo_id uuid,
  p_fecha     date default null
) returns uuid
language plpgsql
as $$
declare
  v_arq     record;
  v_fecha   date;
  v_asiento uuid;
begin
  select a.id, a.estado, a.saldo_contado, dc.fecha as fecha_dia, dc.predio_id, p.codigo as predio
    into v_arq
  from arqueo a
  join dia_cancha dc on dc.id = a.dia_cancha_id
  join predio p on p.id = dc.predio_id
  where a.id = p_arqueo_id;

  if not found then
    raise exception 'El arqueo % no existe', p_arqueo_id;
  end if;

  if v_arq.estado <> 'pendiente_entrega' then
    raise exception 'El arqueo % ya fue entregado', p_arqueo_id;
  end if;

  if v_arq.saldo_contado = 0 then
    raise exception
      'El arqueo % contó cero: no hay efectivo que entregar', p_arqueo_id;
  end if;

  -- La entrega es posterior al arqueo (el lunes, típicamente). Por defecto hoy.
  v_fecha := coalesce(p_fecha, current_date);

  if v_fecha < v_arq.fecha_dia then
    raise exception
      'La entrega (%) no puede ser anterior al día arqueado (%)',
      v_fecha, v_arq.fecha_dia;
  end if;

  -- Las dos líneas difieren por CUENTA, no por predio: es lo que impide que se
  -- neteen. El predio va en la cabecera y es el de origen, que es lo que hace
  -- bajar el saldo de esa caja.
  v_asiento := crear_asiento(
    v_fecha,
    'arqueo',
    'Entrega a central · ' || v_arq.predio || ' · ' || v_arq.fecha_dia,
    jsonb_build_array(
      jsonb_build_object('cuenta', 'CAJA_CENTRAL',  'debe',  v_arq.saldo_contado),
      jsonb_build_object('cuenta', 'CAJA_EFECTIVO', 'haber', v_arq.saldo_contado)
    ),
    null,                 -- torneo_id: el traslado no es de un torneo
    null,                 -- jornada_id
    v_arq.predio_id,      -- predio de ORIGEN, en la cabecera
    p_arqueo_id           -- origen_id
  );

  update arqueo
     set estado             = 'entregado',
         entregado_at       = now(),
         asiento_entrega_id = v_asiento
   where id = p_arqueo_id;

  return v_asiento;
end;
$$;

comment on function registrar_entrega_central(uuid, date) is
  'Traslada a la caja central el efectivo contado en un arqueo. Un solo asiento '
  '(decisión 60). Si hubo diferencia, el residuo queda en la caja del predio '
  'como la diferencia sin resolver.';


-- 5 · Las consultas -----------------------------------------------------------

-- Quién tiene plata sin rendir. Sale de los arqueos, no de una cuenta contable
-- (decisión 58).
create view v_efectivo_sin_rendir as
select a.responsable_id,
       count(*)                as arqueos_pendientes,
       sum(a.saldo_contado)    as monto_sin_rendir,
       min(dc.fecha)           as desde,
       max(dc.fecha)           as hasta
from arqueo a
join dia_cancha dc on dc.id = a.dia_cancha_id
where a.estado = 'pendiente_entrega'
group by a.responsable_id;

comment on view v_efectivo_sin_rendir is
  'Saldo sin rendir por responsable = suma de sus arqueos pendientes de '
  'entrega. No hay cuenta contable de esto a propósito (decisión 58).';


-- La cola de trabajo del control de caja.
create view v_arqueo_diferencia as
select a.id as arqueo_id,
       dc.fecha,
       p.codigo as predio,
       a.saldo_sistema,
       a.saldo_contado,
       a.diferencia,
       case when a.diferencia < 0 then 'faltante' else 'sobrante' end as clase,
       a.estado,
       a.responsable_id
from arqueo a
join dia_cancha dc on dc.id = a.dia_cancha_id
join predio p on p.id = dc.predio_id
where a.diferencia <> 0
  and a.asiento_ajuste_id is null;

comment on view v_arqueo_diferencia is
  'Diferencias de caja registradas y todavía sin resolver. La resolución es un '
  'paso posterior y puede no ocurrir (decisión 61).';


-- Historial.
create view v_arqueo_detalle as
select a.id as arqueo_id,
       dc.fecha,
       dc.predio_id,
       p.codigo as predio,
       a.saldo_sistema,
       a.saldo_contado,
       a.diferencia,
       a.estado,
       a.responsable_id,
       a.entregado_at,
       a.asiento_entrega_id,
       a.asiento_ajuste_id,
       a.created_at
from arqueo a
join dia_cancha dc on dc.id = a.dia_cancha_id
join predio p on p.id = dc.predio_id;
