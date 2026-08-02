-- Pieza 6 · playoffs por serie (backend)
--
-- Decisiones 63 a 67. Arquitectura §3.5.
--
-- Los playoffs YA colgaban de serie: la pieza 1 movió toda `jornada` a
-- `serie_id`, no solo la liga. Esta pieza NO mueve nada. Cierra los tres
-- agujeros que quedaron abiertos porque la rama `es_playoff` nunca se ejercitó,
-- y construye la gestión.


-- 1 · El formato es una tabla, no un CHECK (decisión 64) ----------------------
--
-- Cerrar el dominio con `check (instancia in ('cuartos','semifinal','final'))`
-- sería violar la regla 12: ese es el formato de ESTE torneo. Otro puede tener
-- octavos, repechaje, tercer puesto, o final a ida y vuelta.
--
-- Los EQUIPOS no se guardan: son partidos × 2. Guardar los dos permitiría que
-- se contradigan, y el que hace falta para presupuestar es el de partidos.

create table formato_instancia (
  id                uuid primary key default gen_random_uuid(),
  nombre            text     not null unique,
  cantidad_partidos smallint not null check (cantidad_partidos > 0),
  orden             smallint not null
);

comment on table formato_instancia is
  'Formato del cuadro de playoff: qué instancias existen y cuántos partidos '
  'tiene cada una. Es DATO, editable y extensible sin migración (regla 12). '
  'Los equipos de una instancia son cantidad_partidos × 2, derivados.';


-- 2 · La jornada de playoff guarda sus partidos (decisión 67) -----------------
--
-- En liga los partidos se derivan del tamaño de la serie (decisión 45). En
-- playoff NO: dependen del formato del cuadro. Una semifinal a partido único y
-- otra a ida y vuelta tienen que poder diferir, así que el valor efectivo vive
-- en la jornada y el formato solo aporta el default.

alter table jornada add column cantidad_partidos smallint
  check (cantidad_partidos > 0);

-- Estructural: exactamente las jornadas de playoff tienen cantidad de partidos.
-- Una de liga con el dato cargado sería un segundo origen para algo derivable;
-- una de playoff sin el dato rompería el presupuesto en silencio.
alter table jornada add constraint chk_partidos_solo_playoff
  check (es_playoff = (cantidad_partidos is not null));

-- El dominio de `instancia`, por FK. Declarativo y dinámico a la vez: no hay
-- literales en el schema y la lista se edita como dato. Las jornadas de liga
-- tienen instancia NULL y la FK no las toca.
alter table jornada add constraint jornada_instancia_fkey
  foreign key (instancia) references formato_instancia(nombre)
  on update cascade;

-- El agujero del unique: `uq_jornada_liga (serie_id, numero)` no protege los
-- playoffs porque `numero` es NULL y Postgres considera cada NULL distinto —
-- se podían crear infinitas finales de Libre A. Esta es la identidad natural
-- que faltaba. Las de liga tienen instancia NULL y quedan fuera, igual que
-- antes.
alter table jornada add constraint uq_jornada_playoff
  unique (serie_id, instancia);

comment on column jornada.cantidad_partidos is
  'Partidos de la instancia. Solo en playoff: en liga se deriva de los equipos '
  'de la serie (decisión 45, acotada a liga por la 67).';


-- 3 · crear_playoff · la cuarta puerta (decisión 65) --------------------------
--
-- Extiende la decisión 49 —una lógica, dos puertas— al playoff. El seed y la
-- pantalla de bracket que venga después llaman a esta misma función.
--
-- Agnóstica del torneo (regla 12): recibe serie e instancia, y lee el formato
-- de la base.

create or replace function crear_playoff(
  p_serie_id          uuid,
  p_instancia         text,
  p_fecha             date     default null,
  p_cantidad_partidos smallint default null
) returns uuid
language plpgsql
as $$
declare
  v_default smallint;
  v_cant    smallint;
  v_id      uuid;
begin
  if not exists (select 1 from serie where id = p_serie_id) then
    raise exception 'La serie % no existe', p_serie_id;
  end if;

  select cantidad_partidos into v_default
    from formato_instancia where nombre = p_instancia;

  if not found then
    raise exception
      'La instancia "%" no está en el formato. Instancias disponibles: %. '
      'Para agregar una, insertá en formato_instancia — no hace falta migración.',
      p_instancia,
      coalesce((select string_agg(nombre, ', ' order by orden) from formato_instancia),
               '(ninguna: falta sembrar el formato)');
  end if;

  v_cant := coalesce(p_cantidad_partidos, v_default);

  insert into jornada (serie_id, numero, instancia, es_playoff,
                       fecha, estado, cantidad_partidos)
  values (p_serie_id, null, p_instancia, true,
          p_fecha, 'programada', v_cant)
  returning id into v_id;

  return v_id;

exception when unique_violation then
  raise exception
    'La serie ya tiene su "%". Hay una sola instancia de cada tipo por serie: '
    'para cambiarle el día usá mover_jornada().', p_instancia;
end;
$$;

comment on function crear_playoff(uuid, text, date, smallint) is
  'Alta validada de una jornada de playoff. La fecha puede ser NULL: cantidad e '
  'instancias se definen al terminar la liga y se programan después con '
  'mover_jornada(), que ya sirve para playoffs porque opera por id.';


-- 4 · equipo_playoff · quién juega cada instancia (decisión 66) ---------------
--
-- En la liga no hace falta: juegan todos los equipos de la serie, siempre. En
-- playoff la CLASIFICACIÓN es un dato que no se deriva de nada — quién llegó a
-- semifinal no está en ninguna parte del sistema. Sin esta tabla no hay a quién
-- cobrarle.
--
-- Es lo que la pantalla de bracket va a llenar.

create table equipo_playoff (
  id                 uuid primary key default gen_random_uuid(),
  equipo_torneo_id   uuid not null references equipo_torneo(id) on delete cascade,
  jornada_playoff_id uuid not null references jornada(id)       on delete cascade,
  created_at         timestamptz not null default now(),
  unique (equipo_torneo_id, jornada_playoff_id)
);

create index equipo_playoff_jornada_idx on equipo_playoff (jornada_playoff_id);

comment on table equipo_playoff is
  'Qué equipos juegan cada instancia de playoff. La clasificación es dato, no '
  'derivable. De acá salen las cuotas de playoff.';


-- Dos cosas que la FK sola no impide y conviene que la base rechace:
-- anotar un equipo en una jornada de LIGA, y anotarlo en el playoff de OTRA
-- serie. Lo segundo es el error silencioso peligroso: la cuota se generaría
-- igual, con el arancel del género equivocado.

create or replace function check_equipo_playoff() returns trigger
language plpgsql
as $$
declare
  v_es_playoff  boolean;
  v_serie_jorn  uuid;
  v_serie_eq    uuid;
begin
  select j.es_playoff, j.serie_id into v_es_playoff, v_serie_jorn
    from jornada j where j.id = new.jornada_playoff_id;

  if not found then
    raise exception 'La jornada % no existe', new.jornada_playoff_id;
  end if;

  if not v_es_playoff then
    raise exception
      'La jornada % es de liga. En liga juegan todos los equipos de la serie: '
      'equipo_playoff es solo para playoffs.', new.jornada_playoff_id;
  end if;

  select et.serie_id into v_serie_eq
    from equipo_torneo et where et.id = new.equipo_torneo_id;

  if v_serie_eq is distinct from v_serie_jorn then
    raise exception
      'El equipo juega en otra serie que la jornada de playoff. El cuadro es de '
      'la serie: las series no se mezclan.';
  end if;

  return new;
end;
$$;

create trigger trg_equipo_playoff_coherente
  before insert or update on equipo_playoff
  for each row execute function check_equipo_playoff();


-- 5 · generar_cuotas_instancia (decisión 66) ---------------------------------
--
-- Paso POSTERIOR a la ficha. B0 sigue excluyendo los playoffs y está bien: al
-- armar la ficha no existen las jornadas de playoff, no hay fechas, y sobre
-- todo no se sabe si el equipo va a clasificar. Facturarle a los 16 equipos de
-- la serie una final que juegan 2 sería inventar deuda.
--
-- Se cobra POR INSTANCIA JUGADA, no un paquete al clasificar: juega cuartos ->
-- cuota de cuartos; pasa a semifinal -> cuota de semifinal. Un equipo eliminado
-- en cuartos no debe la semi.

create or replace function generar_cuotas_instancia(
  p_jornada_playoff_id uuid
) returns int
language plpgsql
as $$
declare
  v_jor    record;
  v_creadas int;
begin
  select j.id, j.es_playoff, j.fecha, j.instancia, j.estado
    into v_jor
  from jornada j where j.id = p_jornada_playoff_id;

  if not found then
    raise exception 'La jornada % no existe', p_jornada_playoff_id;
  end if;

  if not v_jor.es_playoff then
    raise exception
      'La jornada % es de liga. Sus cuotas las genera crear_equipo_torneo al '
      'armar la ficha.', p_jornada_playoff_id;
  end if;

  -- cuota.vence_at es NOT NULL y el vencimiento se DERIVA de la jornada
  -- (decisión 50). Sin fecha no hay vencimiento que derivar.
  if v_jor.fecha is null then
    raise exception
      'La % todavía no tiene fecha. La cuota de playoff vence cuando se juega: '
      'programala con mover_jornada() antes de generar cuotas.', v_jor.instancia;
  end if;

  if not exists (select 1 from equipo_playoff where jornada_playoff_id = p_jornada_playoff_id) then
    raise exception
      'No hay equipos registrados en la %. Cargá quiénes la juegan antes de '
      'generar cuotas.', v_jor.instancia;
  end if;

  -- Una cuota por equipo registrado, con el arancel de la línea es_playoff DEL
  -- PLAN QUE ESE EQUIPO ELIGIÓ.
  --
  -- Los equipos con plan "Cuotas" no tienen línea es_playoff y quedan afuera:
  -- su total plano ya la incluye. No es un salteo silencioso sino la regla del
  -- tarifario — por eso la función devuelve cuántas creó.
  with candidatos as (
    select ep.equipo_torneo_id,
           l.id  as linea_id,
           case et.medio_previsto
             when 'efectivo' then l.precio_efectivo
             else                 l.precio_transferencia
           end   as monto
      from equipo_playoff ep
      join equipo_torneo  et on et.id = ep.equipo_torneo_id
      join plan_tarifa_linea l on l.plan_tarifa_id = et.plan_partidos_id
                              and l.es_playoff
     where ep.jornada_playoff_id = p_jornada_playoff_id
       -- idempotente: no regenera lo que ya existe
       and not exists (
         select 1 from cuota c
          where c.equipo_torneo_id = ep.equipo_torneo_id
            and c.jornada_id       = p_jornada_playoff_id
       )
  )
  insert into cuota (equipo_torneo_id, numero, vence_at, monto,
                     plan_tarifa_linea_id, jornada_id)
  select c.equipo_torneo_id,
         -- cuota.numero es único por ficha: sigue desde el máximo que ya tenga
         coalesce((select max(x.numero) from cuota x
                    where x.equipo_torneo_id = c.equipo_torneo_id), 0) + 1,
         v_jor.fecha,
         c.monto,
         c.linea_id,
         p_jornada_playoff_id
    from candidatos c;

  get diagnostics v_creadas = row_count;

  return v_creadas;
end;
$$;

comment on function generar_cuotas_instancia(uuid) is
  'Genera la cuota de playoff de cada equipo registrado en la instancia. '
  'Idempotente. Los equipos con plan "Cuotas" no llevan cuota de playoff: su '
  'total plano ya la incluye. Devuelve cuántas creó.';


-- 6 · v_torneo_escala sin inflarse con los playoffs (decisión 67) -------------
--
-- Antes: `equipos de la serie / 2` por CADA jornada no suspendida, playoffs
-- incluidos. La final de Libre A daba 8 partidos en vez de 1, y con 3
-- instancias × 20 series el presupuesto por_partido se inflaba mucho y EN
-- SILENCIO — misma clase que la bomba del 284.
--
-- Mismas columnas y tipos, así que `replace` alcanza.

create or replace view v_torneo_escala as
select t.id as torneo_id,
       coalesce((
         select sum(
                  case when j.es_playoff
                       -- playoff: es DATO, depende del formato del cuadro
                       then j.cantidad_partidos::numeric
                       -- liga: se deriva del tamaño de la serie (decisión 45)
                       else se.equipos / 2.0
                  end)
         from jornada    j
         join serie      s on s.id = j.serie_id
         join categoria  c on c.id = s.categoria_id
         cross join lateral (
           select count(*)::numeric as equipos
           from equipo_torneo et
           where et.serie_id = s.id
         ) se
         where c.torneo_id = t.id
           and j.estado <> 'suspendida'
       ), 0) as partidos,

       coalesce((
         select count(*)
         from v_dia_cancha_torneo dct
         where dct.torneo_id = t.id
       ), 0) as dias_cancha
from torneo t;

comment on view v_torneo_escala is
  'Multiplicadores variables de un torneo: partidos y días de cancha. Los '
  'partidos de liga se derivan (equipos/2); los de playoff son dato de la '
  'jornada. dias_cancha cuenta solo los días con fútbol — el arqueo mira la '
  'tabla completa.';
