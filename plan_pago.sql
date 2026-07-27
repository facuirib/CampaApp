-- ============================================================================
-- CAMPA · Modalidades de pago (tarifario versionado por torneo)
-- Capa: catálogos / tarifario. No es data entry contable — es plantilla.
-- La ficha de equipo referencia UNA opción por concepto (inscripción + partidos).
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────
create type genero          as enum ('masculino', 'femenino');
create type concepto_pago    as enum ('inscripcion', 'partidos');
create type medio_pago       as enum ('efectivo', 'transferencia');

-- Regla que define CÓMO vence/devenga cada línea. Es el corazón del modelo:
--   fecha_fija        importe fijo que vence en una fecha calendario resuelta
--                     contra el calendario del torneo (señas, restantes, cuotas)
--   por_partido       arancel unitario devengado por partido jugado
--                     (fechas 1–10, playoffs). total = arancel × cantidad
--   bloque_adelantado rango de fechas cobrado de una vez por adelantado.
--                     el importe cargado YA ES el total del bloque, no unitario
create type regla_vencimiento as enum ('fecha_fija', 'por_partido', 'bloque_adelantado');

-- ── plan_pago ────────────────────────────────────────────────────────────────
-- Una plantilla = (torneo, género, concepto, opción). Se clona por torneo.
create table plan_pago (
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

-- ── plan_pago_linea ──────────────────────────────────────────────────────────
-- Los renglones de cada opción. Precio diferenciado ef/trf.
-- La regla determina qué parámetros aplican (ver CHECKs).
create table plan_pago_linea (
  id                    uuid primary key default gen_random_uuid(),
  plan_pago_id          uuid not null references plan_pago(id) on delete cascade,
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
  unique (plan_pago_id, linea_orden),

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

create index idx_plan_pago_torneo   on plan_pago(torneo_id, genero, concepto);
create index idx_linea_plan         on plan_pago_linea(plan_pago_id, linea_orden);

-- ============================================================================
-- SEED · Torneo Apertura 2026 — 8 combinaciones (2 géneros × 2 conceptos × 2 op.)
-- Reemplazá :torneo_id por el uuid real del torneo.
-- ============================================================================
\set torneo_id '00000000-0000-0000-0000-000000000000'

-- Helper CTE-free approach: insertamos plan y luego líneas por referencia.

-- ── MASCULINO · INSCRIPCIÓN ─────────────────────────────────────────────────
with p as (
  insert into plan_pago (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
  values (:'torneo_id','masculino','inscripcion',1,'Pago único') returning id)
insert into plan_pago_linea (plan_pago_id,linea_orden,concepto_label,precio_efectivo,precio_transferencia,regla,fecha_referencia)
select id,1,'Seña',800000,1000000,'fecha_fija','2026-07-10' from p
union all select id,2,'Restante',1700000,2000000,'fecha_fija','2026-08-08' from p;

with p as (
  insert into plan_pago (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
  values (:'torneo_id','masculino','inscripcion',2,'Cuotas') returning id)
insert into plan_pago_linea (plan_pago_id,linea_orden,concepto_label,precio_efectivo,precio_transferencia,regla,fecha_referencia)
select id,1,'Seña',800000,1000000,'fecha_fija','2026-07-10' from p
union all select id,2,'Cuota 1',1000000,1200000,'fecha_fija','2026-08-08' from p
union all select id,3,'Cuota 2',1000000,1200000,'fecha_fija','2026-09-05' from p;

-- ── MASCULINO · PARTIDOS ────────────────────────────────────────────────────
with p as (
  insert into plan_pago (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
  values (:'torneo_id','masculino','partidos',1,'Pago por fecha') returning id)
insert into plan_pago_linea (plan_pago_id,linea_orden,concepto_label,precio_efectivo,precio_transferencia,regla,fecha_desde,fecha_hasta,cantidad_esperada,es_playoff,fecha_referencia,observacion)
select id,1,'Fechas 1–10',430000,490000,'por_partido',1,10,10,false,null,'Van pagando partido a partido' from p
union all select id,2,'Fechas 11–15 (bloque)',2300000,2600000,'bloque_adelantado',11,15,5,false,'2026-11-07','5 fechas juntas por adelantado (460k/520k × 5)' from p
union all select id,3,'Playoffs',470000,530000,'por_partido',null,null,3,true,null,'Eliminación directa, máx 3: cuartos, semi, final' from p;

with p as (
  insert into plan_pago (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
  values (:'torneo_id','masculino','partidos',2,'Cuotas') returning id)
insert into plan_pago_linea (plan_pago_id,linea_orden,concepto_label,precio_efectivo,precio_transferencia,regla,fecha_referencia)
select id,1,'Cuota 1',2100000,2400000,'fecha_fija','2026-09-05' from p
union all select id,2,'Cuota 2',2100000,2400000,'fecha_fija','2026-10-03' from p
union all select id,3,'Cuota 3',2100000,2400000,'fecha_fija','2026-11-07' from p;

-- ── FEMENINO · INSCRIPCIÓN ──────────────────────────────────────────────────
with p as (
  insert into plan_pago (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
  values (:'torneo_id','femenino','inscripcion',1,'Pago único') returning id)
insert into plan_pago_linea (plan_pago_id,linea_orden,concepto_label,precio_efectivo,precio_transferencia,regla,fecha_referencia)
select id,1,'Seña',270000,300000,'fecha_fija','2026-07-10' from p
union all select id,2,'Restante',370000,400000,'fecha_fija','2026-08-08' from p;

with p as (
  insert into plan_pago (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
  values (:'torneo_id','femenino','inscripcion',2,'Cuotas') returning id)
insert into plan_pago_linea (plan_pago_id,linea_orden,concepto_label,precio_efectivo,precio_transferencia,regla,fecha_referencia)
select id,1,'Seña',270000,300000,'fecha_fija','2026-07-10' from p
union all select id,2,'Cuota 1',230000,250000,'fecha_fija','2026-08-08' from p
union all select id,3,'Cuota 2',230000,250000,'fecha_fija','2026-09-05' from p;

-- ── FEMENINO · PARTIDOS ─────────────────────────────────────────────────────
with p as (
  insert into plan_pago (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
  values (:'torneo_id','femenino','partidos',1,'Pago por fecha') returning id)
insert into plan_pago_linea (plan_pago_id,linea_orden,concepto_label,precio_efectivo,precio_transferencia,regla,fecha_desde,fecha_hasta,cantidad_esperada,es_playoff,fecha_referencia,observacion)
select id,1,'Fechas 1–10',130000,150000,'por_partido',1,10,10,false,null,'Van pagando partido a partido' from p
union all select id,2,'Fechas 11–13 (bloque)',435000,510000,'bloque_adelantado',11,13,3,false,'2026-11-07','3 fechas juntas por adelantado — importe total del bloque' from p
union all select id,3,'Playoffs',150000,180000,'por_partido',null,null,3,true,null,'Eliminación directa, máx 3: cuartos, semi, final' from p;

with p as (
  insert into plan_pago (torneo_id, genero, concepto, opcion_orden, opcion_nombre)
  values (:'torneo_id','femenino','partidos',2,'Cuotas') returning id)
insert into plan_pago_linea (plan_pago_id,linea_orden,concepto_label,precio_efectivo,precio_transferencia,regla,fecha_referencia)
select id,1,'Cuota 1',600000,700000,'fecha_fija','2026-09-05' from p
union all select id,2,'Cuota 2',600000,700000,'fecha_fija','2026-10-03' from p
union all select id,3,'Cuota 3',360000,420000,'fecha_fija','2026-11-07' from p;
