-- ============================================================================
-- CAMPA · Calendario del torneo (motor de cashflow) — RECONCILIACIÓN
-- `jornada` YA EXISTE en el schema base (001) con forma: fecha × predio.
-- La reconciliamos a: fecha × género (el predio no es propiedad de la jornada;
-- se decide por equipo semana a semana y vive en las tablas de movimiento).
--
-- Estrategia: ALTER (no drop-recreate). La tabla está vacía pero tiene 4 FKs
-- vivas (asiento, pago, gasto, arqueo) que se preservan intactas.
-- Precondición verificada: jornada tiene 0 filas.
-- ============================================================================

-- ── 1. Nuevas columnas ───────────────────────────────────────────────────────
alter table jornada
  add column genero            genero,             -- se llena abajo; luego NOT NULL
  add column instancia         text,               -- 'cuartos'|'semi'|'final' (playoff)
  add column es_playoff        boolean not null default false,
  add column cantidad_esperada smallint;

comment on column jornada.genero is
  'Cada género corre su propio calendario (masc 1..15, fem 1..13). '
  'Parte de la identidad de la jornada.';
comment on column jornada.cantidad_esperada is
  'Base de estimación de ingreso: arancel del tarifario × cantidad_esperada. '
  'Liga: equipos del género que juegan la fecha. Playoff: equipos por instancia. '
  'Editable ahora; derivable de inscripciones cuando exista la ficha de equipo.';

-- ── 2. Sacar predio de la identidad de la jornada ────────────────────────────
-- El predio se decide por equipo semana a semana → no es atributo de la fecha.
-- Las tablas de movimiento (asiento/pago/gasto/arqueo) ya llevan su predio_id
-- propio, así que el calendario no lo necesita. Tabla vacía → drop seguro.
-- NOTA: confirmá el nombre real del unique viejo antes de aplicar (ver pedido).
alter table jornada drop constraint jornada_torneo_id_numero_predio_id_key;
alter table jornada drop column predio_id;

-- ── 3. Relajar numero y fecha ────────────────────────────────────────────────
alter table jornada alter column numero drop not null;   -- playoffs usan instancia
alter table jornada alter column fecha  drop not null;    -- grilla vacía: fecha al programar

-- ── 4. Nueva identidad + coherencia liga/playoff ─────────────────────────────
alter table jornada
  add constraint uq_jornada_liga unique (torneo_id, genero, numero);

alter table jornada
  add constraint chk_liga_o_playoff check (
    (es_playoff and instancia is not null and numero is null)
    or (not es_playoff and numero is not null and instancia is null)
  );

-- ── 5. genero NOT NULL (tabla vacía, no hay backfill) ────────────────────────
alter table jornada alter column genero set not null;

create index if not exists idx_jornada_torneo on jornada(torneo_id, genero);
create index if not exists idx_jornada_fecha   on jornada(fecha) where fecha is not null;
create index if not exists idx_jornada_estado  on jornada(estado);

-- ── 6. Puente con el tarifario ───────────────────────────────────────────────
alter table plan_tarifa_linea
  add column hito_jornada_id uuid references jornada(id) on delete set null;

alter table plan_tarifa_linea
  drop column if exists hito_calendario;

comment on column plan_tarifa_linea.hito_jornada_id is
  'Jornada cuyo día define el vencimiento de esta línea fecha_fija. '
  'Reprogramar la jornada (o su reprograma_a) recalcula el vencimiento. '
  'Sólo aplica a regla=fecha_fija; null en por_partido/bloque_adelantado.';

-- ============================================================================
-- Función: generar grilla vacía de liga al crear un torneo
-- 1 fila por (género, número), SIN fecha ni predio. 15 masc + 13 fem = 28.
-- Playoffs se agregan a mano al terminar la liga. Idempotente.
-- ============================================================================
create or replace function generar_grilla_liga(
  p_torneo_id   uuid,
  p_fechas_masc smallint default 15,
  p_fechas_fem  smallint default 13
) returns integer
language plpgsql
as $$
declare
  v_num        smallint;
  v_insertadas integer := 0;
begin
  for v_num in 1..p_fechas_masc loop
    insert into jornada (torneo_id, genero, numero, estado)
    values (p_torneo_id, 'masculino', v_num, 'programada')
    on conflict (torneo_id, genero, numero) do nothing;
    if found then v_insertadas := v_insertadas + 1; end if;
  end loop;
  for v_num in 1..p_fechas_fem loop
    insert into jornada (torneo_id, genero, numero, estado)
    values (p_torneo_id, 'femenino', v_num, 'programada')
    on conflict (torneo_id, genero, numero) do nothing;
    if found then v_insertadas := v_insertadas + 1; end if;
  end loop;
  return v_insertadas;
end;
$$;

comment on function generar_grilla_liga is
  'Siembra la grilla de liga (1..N por género) para un torneo, sin fecha. '
  '15 masc + 13 fem = 28 filas. Fecha al programar; predio por equipo en la '
  'asignación semanal. Playoffs a mano. Idempotente.';
