-- ═══════════════════════════════════════════════════════════════════════════
-- TORNEO · el ciclo de vida, y separar «estado» de «activo»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Los tres estados —`planificado`, `en_curso`, `cerrado`— están declarados en
-- un check desde el schema inicial y **nunca los movió nadie**: no existía
-- ninguna función que los cambiara. `crear_torneo` inserta `planificado` y ahí
-- se quedan para siempre.
--
-- Con el ciclo muerto, `activo` terminó ocupando su lugar. Y quedó
-- significando dos cosas incompatibles según quién lo lea:
--
--     -- la migración que lo creó (20260726194532):
--     add column activo boolean not null default true;  -- el torneo en curso
--
--     /cobranza      torneos.find(t => t.activo)     → «es el actual»
--     /torneos       activo === false → «Dado de baja» → «está vigente»
--
-- Las dos lecturas son razonables y sólo una puede ser cierta. Peor: `activo`
-- es `default true` **sin ningún unique**, así que cada torneo nuevo nace
-- «actual» y puede haber varios a la vez. «Cuál es el torneo actual» no tiene
-- hoy una respuesta confiable.
--
-- Esta migración separa los dos conceptos y le da al ciclo las funciones que
-- nunca tuvo.
--
--     estado   dónde está en el ciclo      lo mueven iniciar/cerrar/reabrir
--     activo   SÓLO «no dado de baja»      lo mueve el alta/baja
--
-- Son ortogonales de verdad: un torneo cerrado sigue `activo` —existió y su
-- historia vale— y uno dado de baja puede estar en cualquier estado.
--
-- ── 🔴 Cerrar un torneo NO toca su deuda ───────────────────────────────────
--
-- `cerrar_torneo` cambia una columna de `torneo` y **nada más**. No marca
-- cuotas pagadas, no las anula, no las esconde. Cerrar es un hecho DEPORTIVO
-- —se terminó de jugar—; lo que se debe se sigue debiendo.
--
-- Eso funciona porque **ninguna de las ocho vistas de deuda y cobranza filtra
-- por el estado ni por el `activo` del torneo**. Verificado una por una antes
-- de escribir esto: v_deuda_detalle, v_deuda_equipo, v_deuda_equipo_torneo,
-- v_estado_cuota, v_cuenta_corriente_equipo, v_cobranza_kpi,
-- v_cobranza_momento y v_cobranza_cola. Un equipo con deuda de un torneo
-- cerrado sigue apareciendo en las colas como cualquier otro.
--
-- **Esa propiedad hay que cuidarla.** El día que alguien le agregue un
-- `where t.estado <> 'cerrado'` a una vista de deuda, la plata de los torneos
-- viejos desaparece de la pantalla sin que nadie se entere. Se cierra la
-- competencia, no la cuenta.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1 · Qué significa cada columna, escrito donde se lee ───────────────────

comment on column public.torneo.estado is
  'Dónde está el torneo en su ciclo: planificado → en_curso → cerrado. Lo '
  'mueven iniciar_torneo / cerrar_torneo / reabrir_torneo, nunca un UPDATE '
  'suelto. EL TORNEO ACTUAL ES EL ÚNICO en_curso — ver v_torneo_actual.';

comment on column public.torneo.activo is
  'Sólo «no dado de baja»: es el borrado lógico, NO el ciclo. Un torneo '
  'cerrado sigue activo —existió y su historia vale—. NO usar para saber cuál '
  'es el torneo actual: para eso está estado = en_curso.';


-- ── 2 · Un solo torneo en curso, garantizado por la base ───────────────────
--
-- El índice viejo se va: su comentario decía «el torneo en curso», que es
-- exactamente la confusión que esta migración deshace. Y no era único, así que
-- no garantizaba nada.
--
-- `((true))` como expresión: el índice es sobre una constante, así que todas
-- las filas que pasan el `where` colisionan entre sí. Es la forma canónica de
-- «a lo sumo una fila que cumpla esto».

drop index if exists idx_torneo_activo;

create unique index if not exists torneo_un_solo_en_curso
  on public.torneo ((true))
  where estado = 'en_curso' and activo;

-- Los que están dados de baja no compiten por el lugar, pero igual conviene
-- poder buscarlos rápido.
create index if not exists torneo_activo_idx on public.torneo (activo) where activo;


-- ── 3 · v_torneo_actual — UNA definición ───────────────────────────────────
--
-- Cero o una fila. Existe para que «cuál es el actual» no se vuelva a escribir
-- en cada pantalla: hoy la regla `find(t => t.activo)` está copiada en
-- /cobranza y en el tarifario, y las dos copias envejecen por separado.
--
-- Cuando no hay ninguno en curso devuelve CERO FILAS, y eso es la respuesta:
-- no hay torneo actual. No cae al último cerrado ni al próximo planificado —
-- los dos serían un torneo que no se está jugando, presentado como si lo
-- estuviera.

create or replace view public.v_torneo_actual as
select t.id, t.nombre, t.temporada, t.anio, t.estado,
       t.fecha_desde, t.fecha_hasta, t.ejercicio_id
  from torneo t
 where t.estado = 'en_curso' and t.activo;

comment on view public.v_torneo_actual is
  'El torneo actual: el único con estado = en_curso y activo. Cero filas '
  'significa que no hay ninguno en curso, y ésa es la respuesta — no se '
  'inventa un reemplazo. El unique index garantiza que nunca haya dos.';


-- ── 4 · Las tres puertas del ciclo ─────────────────────────────────────────

create or replace function public.iniciar_torneo(p_torneo_id uuid)
returns void
language plpgsql
as $$
declare
  v_t     record;
  v_otro  text;
begin
  if not (coalesce(auth_rol(), '') = 'admin') then
    raise exception
      'Iniciar un torneo es de administrador. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  select * into v_t from torneo where id = p_torneo_id;
  if not found then raise exception 'El torneo % no existe', p_torneo_id; end if;

  if not v_t.activo then
    raise exception 'El torneo «%» está dado de baja: no se puede iniciar.', v_t.nombre;
  end if;
  if v_t.estado = 'en_curso' then
    raise exception 'El torneo «%» ya está en curso.', v_t.nombre;
  end if;
  if v_t.estado = 'cerrado' then
    raise exception
      'El torneo «%» está cerrado. Para volver a abrirlo usá reabrir_torneo, que pide motivo.',
      v_t.nombre;
  end if;

  -- El índice lo garantiza igual; esto existe para que el mensaje diga CUÁL es
  -- el otro, que es lo que hace falta para resolverlo.
  select nombre into v_otro from torneo where estado = 'en_curso' and activo limit 1;
  if v_otro is not null then
    raise exception
      'Ya hay un torneo en curso: «%». Hay que cerrarlo antes de iniciar otro.', v_otro;
  end if;

  -- Sin fichas no está empezando nada, y como «el actual» alimenta defaults en
  -- media app, arrancar uno vacío deja las pantallas apuntando a la nada.
  --
  -- NO se valida el fixture a propósito: se puede arrancar con el calendario a
  -- medias, y exigirlo obligaría a cargar jornadas falsas para poder trabajar.
  if not exists (select 1 from equipo_torneo where torneo_id = p_torneo_id) then
    raise exception
      'El torneo «%» no tiene ninguna ficha cargada. Cargá los equipos antes de iniciarlo.',
      v_t.nombre;
  end if;

  update torneo set estado = 'en_curso' where id = p_torneo_id;
end;
$$;

comment on function public.iniciar_torneo(uuid) is
  'planificado → en_curso. Valida que no haya otro en curso, que tenga al menos '
  'una ficha y que no esté dado de baja. NO exige fixture. Sólo admin.';


create or replace function public.cerrar_torneo(p_torneo_id uuid, p_motivo text default null)
returns void
language plpgsql
as $$
declare
  v_t record;
begin
  if not (coalesce(auth_rol(), '') = 'admin') then
    raise exception
      'Cerrar un torneo es de administrador. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  select * into v_t from torneo where id = p_torneo_id;
  if not found then raise exception 'El torneo % no existe', p_torneo_id; end if;

  if v_t.estado <> 'en_curso' then
    raise exception 'El torneo «%» no está en curso (está «%»).', v_t.nombre, v_t.estado;
  end if;

  -- ── 🔴 Acá NO se toca ninguna cuota, y es el punto de esta función ──────
  --
  -- Cerrar es deportivo: se terminó de jugar. La deuda impaga sigue exigible,
  -- sigue en `v_deuda_detalle` y sigue en las colas de cobranza —que no miran
  -- el torneo—. Se cierra la competencia, no la cuenta.
  --
  -- Y se puede cerrar CON deuda a propósito. Bloquearlo dejaría torneos
  -- abiertos para siempre —siempre queda alguno que no pagó— y el estado
  -- dejaría de significar nada. La pantalla avisa cuánto queda; decidir es de
  -- quien cierra.
  update torneo set estado = 'cerrado' where id = p_torneo_id;
end;
$$;

comment on function public.cerrar_torneo(uuid, text) is
  'en_curso → cerrado. NO toca ninguna cuota: la deuda impaga sigue exigible y '
  'sigue apareciendo en las colas de cobranza. Se puede cerrar con deuda — la '
  'pantalla avisa cuánto. Sólo admin.';


create or replace function public.reabrir_torneo(p_torneo_id uuid, p_motivo text)
returns void
language plpgsql
as $$
declare
  v_t    record;
  v_otro text;
begin
  if not (coalesce(auth_rol(), '') = 'admin') then
    raise exception
      'Reabrir un torneo es de administrador. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  -- El motivo es obligatorio y el de las otras dos no: cerrar y arrancar son
  -- el curso normal de las cosas; reabrir es deshacer algo, y dentro de tres
  -- meses alguien va a querer saber por qué.
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Reabrir un torneo pide un motivo.';
  end if;

  select * into v_t from torneo where id = p_torneo_id;
  if not found then raise exception 'El torneo % no existe', p_torneo_id; end if;

  if v_t.estado <> 'cerrado' then
    raise exception 'El torneo «%» no está cerrado (está «%»).', v_t.nombre, v_t.estado;
  end if;
  if not v_t.activo then
    raise exception 'El torneo «%» está dado de baja.', v_t.nombre;
  end if;

  select nombre into v_otro from torneo where estado = 'en_curso' and activo limit 1;
  if v_otro is not null then
    raise exception
      'Ya hay un torneo en curso: «%». Hay que cerrarlo antes de reabrir otro.', v_otro;
  end if;

  update torneo set estado = 'en_curso' where id = p_torneo_id;
end;
$$;

comment on function public.reabrir_torneo(uuid, text) is
  'cerrado → en_curso, con motivo obligatorio. Misma regla de uno-por-vez. '
  'Existe porque cerrar es un clic y equivocarse es barato: la alternativa es '
  'tocar la base a mano. Sólo admin.';
