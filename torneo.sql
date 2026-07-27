-- ============================================================================
-- CAMPA · Tabla torneo (raíz del árbol: tarifario, calendario, fichas cuelgan de acá)
-- Va ANTES de plan_pago.sql — plan_pago tiene FK a torneo(id).
-- ============================================================================

create type temporada as enum ('apertura', 'clausura');

create table torneo (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,                 -- "Apertura 2026"
  temporada   temporada not null,            -- apertura | clausura
  anio        smallint not null,             -- 2026
  activo      boolean not null default true, -- el torneo en curso
  created_at  timestamptz not null default now(),
  unique (temporada, anio)                   -- un solo Apertura por año
);

create index idx_torneo_activo on torneo(activo) where activo;

-- ── Seed: torneo en curso ────────────────────────────────────────────────────
insert into torneo (nombre, temporada, anio, activo)
values ('Apertura 2026', 'apertura', 2026, true);
