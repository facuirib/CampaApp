-- ============================================================================
-- CAMPA · Tarifario versionado por torneo (plan_tarifa)
-- Capa: catálogos / tarifario. No es data entry contable — es plantilla.
-- La ficha de equipo referencia UNA opción por concepto (inscripción + partidos).
--
-- NOTA de nombre: se llama plan_tarifa (no plan_pago) porque plan_pago ya existe
-- en el schema base como la MORATORIA de deuda (la que usa generar_cuotas_plan).
-- Son conceptos distintos: acá es la lista de precios del torneo.
--
-- Solo DDL. El seed del tarifario Apertura 2026 vive en supabase/seed.sql.
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────
create type genero           as enum ('masculino', 'femenino');
create type concepto_pago     as enum ('inscripcion', 'partidos');
create type medio_pago        as enum ('efectivo', 'transferencia');

-- Regla que define CÓMO vence/devenga cada línea. Es el corazón del modelo:
--   fecha_fija        importe fijo que vence en una fecha calendario resuelta
--                     contra el calendario del torneo (señas, restantes, cuotas)
--   por_partido       arancel unitario devengado por partido jugado
--                     (fechas 1–10, playoffs). total = arancel × cantidad
--   bloque_adelantado rango de fechas cobrado de una vez por adelantado.
--                     el importe cargado YA ES el total del bloque, no unitario
create type regla_vencimiento as enum ('fecha_fija', 'por_partido', 'bloque_adelantado');

-- ── plan_tarifa ──────────────────────────────────────────────────────────────
-- Una plantilla = (torneo, género, concepto, opción). Se clona por torneo.
create table plan_tarifa (
  id           uuid primary key default gen_random_uuid(),
  torneo_id    uuid not null references torneo(id) on delete cascade,
  genero       genero not null,
  concepto     concepto_pago not null,
  opcion_orden smallint not null,          -- 1, 2, … orden de presentación
  opcion_nombre text not null,             -- "Pago único", "Cuotas", "Pago por fecha"
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (torneo_id, genero, concepto, opcion_orden)
);

-- ── plan_tarifa_linea ──────────────────────────────────────────────────────────
-- Los renglones de cada opción. Precio diferenciado ef/trf.
-- La regla determina qué parámetros aplican (ver CHECKs).
create table plan_tarifa_linea (
  id                    uuid primary key default gen_random_uuid(),
  plan_tarifa_id        uuid not null references plan_tarifa(id) on delete cascade,
  linea_orden           smallint not null,           -- orden dentro de la opción
  concepto_label        text not null,               -- "Seña", "Cuota 1", "Fechas 1–10"…
  precio_efectivo       numeric(14,2) not null,
  precio_transferencia  numeric(14,2) not null,
  regla                 regla_vencimiento not null,

  -- fecha_fija: vencimiento resuelto vs. calendario del torneo.
  -- Se guarda como referencia lógica (jornada/hito), no fecha plana hardcodeada.
  -- Nullable: sólo aplica a fecha_fija y bloque_adelantado.
  hito_calendario       text,                         -- ej. 'jornada_8', 'cierre_inscripcion'
  fecha_referencia      date,                         -- snapshot informativo del tarifario original

  -- por_partido / bloque_adelantado: rango de fechas que cubre la línea.
  fecha_desde           smallint,                     -- nº de fecha inicial (inclusive)
  fecha_hasta           smallint,                     -- nº de fecha final (inclusive)
  cantidad_esperada     smallint,                     -- partidos/fechas esperados (para devengo)
  es_playoff            boolean not null default false, -- eliminación directa, no rango de liga

  observacion           text,
  created_at            timestamptz not null default now(),
  unique (plan_tarifa_id, linea_orden),

  -- Coherencia por regla ----------------------------------------------------
  -- por_partido de liga necesita rango; por_partido de playoff no (elim. directa)
  constraint chk_por_partido check (
    regla <> 'por_partido'
    or es_playoff
    or (fecha_desde is not null and fecha_hasta is not null)
  ),
  constraint chk_bloque check (
    regla <> 'bloque_adelantado' or (fecha_desde is not null and fecha_hasta is not null)
  ),
  constraint chk_precios check (precio_efectivo >= 0 and precio_transferencia >= 0)
);

create index idx_plan_tarifa_torneo on plan_tarifa(torneo_id, genero, concepto);
create index idx_tarifa_linea_plan   on plan_tarifa_linea(plan_tarifa_id, linea_orden);
