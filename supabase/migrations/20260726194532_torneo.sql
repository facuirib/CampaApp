-- ============================================================================
-- CAMPA · Extiende torneo con la dimensión temporada/año
-- El schema base (001) ya define torneo (ejercicio_id, fechas, estado) y 7 FKs
-- cuelgan de él. NO se recrea: se le agrega la clasificación temporada+año+activo
-- que necesita el tarifario (plan_tarifa cuelga de torneo).
--
-- El seed de "Apertura 2026" NO va acá: crear un torneo exige un ejercicio
-- (ejercicio_id NOT NULL) y ese es dato de negocio. Vive en supabase/seed.sql.
-- ============================================================================

create type temporada as enum ('apertura', 'clausura');

alter table torneo
  add column temporada temporada not null,   -- apertura | clausura
  add column anio      smallint  not null,   -- 2026
  add column activo    boolean   not null default true;  -- el torneo en curso

-- un solo Apertura por año
alter table torneo add constraint torneo_temporada_anio_key unique (temporada, anio);

create index idx_torneo_activo on torneo(activo) where activo;
