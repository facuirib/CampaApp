-- dia_cancha · el día de operación de un predio
--
-- Decisión 54. Arquitectura §3.5.
--
-- Por qué es una tabla y no un `select distinct`: la entidad (fecha, predio) se
-- nombró en el Draft 15 pero no existía en ninguna parte. `jornada` NO tiene
-- predio —el modelo dice qué serie juega su fecha N, no dónde— y las únicas
-- tablas con `fecha` y `predio_id` son de movimiento: asiento, gasto, pago.
-- Derivarla de ahí sería circular: para presupuestar los días de cancha habría
-- que mirar los gastos ya cargados, que es justo lo que todavía no pasó.
--
-- Es compartida, y ese es el punto: el presupuesto la cuenta (líneas
-- `por_dia_cancha`, §3.3) y el arqueo cuelga de ella (§3.6, pieza 4). Dos
-- definiciones paralelas se desincronizarían.
--
-- Agnóstica del torneo (regla 12): ni fechas ni cantidades escritas acá.

create table dia_cancha (
  id         uuid primary key default gen_random_uuid(),
  fecha      date not null,
  predio_id  uuid not null references predio(id),
  created_at timestamptz not null default now(),
  unique (fecha, predio_id)                 -- identidad natural
);

create index dia_cancha_predio_idx on dia_cancha (predio_id);

comment on table dia_cancha is
  'Día de operación de un predio. Identidad (fecha, predio_id). Puede existir '
  'sin jornada: bar abierto, evento. El torneo NO se guarda, se deriva de las '
  'jornadas de esa fecha (v_dia_cancha_torneo), mismo criterio que jornada '
  '(decisión 36).';


-- Dos consumidores, dos lentes -----------------------------------------------
--
-- `dia_cancha` es compartida entre presupuesto y arqueo, pero NO la miran
-- igual, y es deliberado:
--
--   · ARQUEO (pieza 4) → la TABLA, todas las filas. Si hubo caja en un predio
--     un día, hay que contarla, haya habido fútbol o no. Un sábado de solo bar
--     tiene caja igual.
--
--   · PRESUPUESTO (§3.3, líneas por_dia_cancha) → esta VISTA, que hace inner
--     join contra jornada. Un día de solo bar no lleva fotógrafo ni árbitros:
--     contarlo inflaría el presupuesto del torneo con un día que el torneo no
--     jugó.
--
-- Por eso la validación de `crear_dia_cancha` no exige jornada. La distinción
-- entre "día de operación" y "día de torneo" es una lente de lectura, no una
-- restricción de escritura: ponerla en la escritura obligaría a elegir una de
-- las dos y romper al otro consumidor.
--
-- El torneo se deriva y no se guarda: guardarlo permitiría que contradiga al
-- calendario y obligaría a un trigger de coherencia para impedirlo.
--
-- Una fila por (día de cancha, torneo). En la práctica hoy es 1:1, pero la
-- forma de junction es la correcta: nada impide que dos torneos compartan una
-- fecha, y para contar días por torneo esta es exactamente la granularidad.
--
-- Las jornadas suspendidas no cuentan: si todas las jornadas de una fecha están
-- suspendidas, ese día no se jugó, y el presupuesto por día de cancha baja. El
-- arqueo de ese día, en cambio, sigue existiendo.

create view v_dia_cancha_torneo as
select distinct
       dc.id        as dia_cancha_id,
       dc.fecha,
       dc.predio_id,
       c.torneo_id
from dia_cancha dc
join jornada   j on j.fecha = dc.fecha and j.estado <> 'suspendida'
join serie     s on s.id = j.serie_id
join categoria c on c.id = s.categoria_id;

comment on view v_dia_cancha_torneo is
  'Lente de PRESUPUESTO sobre dia_cancha: solo los días en que el torneo jugó. '
  'El arqueo usa la tabla directamente, que incluye además los días sin fútbol.';


-- Gestión · una lógica, dos puertas (decisión 49, mismo patrón que jornada) ---
--
-- El seed que carga el Clausura y el módulo de calendario que vendrá después
-- llaman a esta misma función. No hay dos caminos que validen distinto.

create or replace function crear_dia_cancha(
  p_fecha     date,
  p_predio_id uuid
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_fecha is null then
    raise exception 'La fecha del día de cancha es obligatoria';
  end if;

  if not exists (select 1 from predio where id = p_predio_id and activo) then
    raise exception 'Predio inexistente o inactivo: %', p_predio_id;
  end if;

  -- NO se exige que haya jornada esa fecha. Un día de cancha puede existir sin
  -- fútbol: bar abierto, evento. Como `dia_cancha` ancla el arqueo (pieza 4),
  -- exigir jornada dejaría sin dónde colgar la caja de esos días.
  --
  -- Lo que ese día NO hace es inflar el presupuesto del torneo — de eso se
  -- ocupa la lente, no la restricción. Ver v_dia_cancha_torneo.

  -- Idempotente, para que el seed se pueda correr dos veces sin romper.
  insert into dia_cancha (fecha, predio_id)
  values (p_fecha, p_predio_id)
  on conflict (fecha, predio_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from dia_cancha
    where fecha = p_fecha and predio_id = p_predio_id;
  end if;

  return v_id;
end;
$$;

comment on function crear_dia_cancha(date, uuid) is
  'Alta validada de un día de operación de predio. Idempotente: devuelve el id '
  'existente si ya estaba. Única vía de alta — seed y app usan esta.';


create or replace function eliminar_dia_cancha(
  p_dia_cancha_id uuid
) returns void
language plpgsql
as $$
begin
  -- Las excepciones del calendario —un domingo con un solo predio abierto— se
  -- resuelven no creando el día, o quitándolo por acá.
  --
  -- Cuando la pieza 4 cuelgue `arqueo` de esta tabla, su FK va a bloquear el
  -- borrado de un día que ya tiene caja contada. Es el comportamiento correcto
  -- y no hay que agregar nada acá para conseguirlo.
  delete from dia_cancha where id = p_dia_cancha_id;

  if not found then
    raise exception 'Día de cancha inexistente: %', p_dia_cancha_id;
  end if;
end;
$$;
