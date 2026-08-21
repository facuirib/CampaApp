-- ═══════════════════════════════════════════════════════════════════════════
-- Vistas de lectura del bar + FIX de dos vistas que rompí ayer
-- PROPUESTA, NO APLICAR sin revisión (regla 11)
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 0 · 🔴 Lo que rompió `ambito` sin que nadie lo notara ──────────────────
--
-- La migración de ayer (20260821190000) permitió DOS arqueos por día —torneo y
-- bar—. Dos vistas del circuito del torneo hacen LEFT JOIN a `arqueo` **sin
-- filtrar ámbito**, y ninguna prueba lo tocó porque `arqueo` tiene 0 filas.
--
-- Verificado en rollback, arqueando torneo + bar el mismo día:
--
--   v_saldo_efectivo_dia_cancha:  58 filas → 59.  El día arqueado aparece DOS
--   VECES. La sección «Cajas por día de operación» de /arqueo lo mostraría
--   duplicado, y /arqueo/nuevo lo ofrecería dos veces en el Select.
--
--   v_efectivo_sin_rendir: suma `saldo_contado` de TODOS los arqueos
--   pendientes, así que contaría el arqueo del bar como plata a rendir a
--   central — cuando el bar no rinde a central: saca por retirar_efectivo_bar.
--   Inflaría el «efectivo sin rendir» de cada responsable.
--
-- Las dos son del TORNEO y filtran a 'torneo'. El bar tiene las suyas abajo.
--
-- Es la sexta vez que «una tabla que nadie escribe esconde sus errores», y esta
-- vez el que la escondía era yo: la migración de ayer pasó 20/20 porque ninguna
-- de esas dos vistas estaba en los tests.


-- ── 1 · v_saldo_efectivo_dia_cancha · solo el arqueo del torneo ────────────
-- Cambia SOLO la condición del JOIN. Las columnas quedan idénticas, así que
-- ningún consumidor se entera — /arqueo y /arqueo/nuevo siguen leyendo lo mismo.

create or replace view v_saldo_efectivo_dia_cancha as
 SELECT dc.id AS dia_cancha_id,
    dc.fecha,
    dc.predio_id,
    p.codigo AS predio,
    p.nombre AS predio_nombre,
    saldo_efectivo_predio(dc.predio_id, dc.fecha) AS saldo_sistema,
    a.id AS arqueo_id,
    a.estado AS arqueo_estado
   FROM dia_cancha dc
     JOIN predio p ON p.id = dc.predio_id
     LEFT JOIN arqueo a ON a.dia_cancha_id = dc.id AND a.ambito = 'torneo';

comment on view v_saldo_efectivo_dia_cancha is
  'Días de cancha con el saldo de efectivo del TORNEO y su arqueo, si lo tiene. '
  'El filtro a.ambito = ''torneo'' va en el ON: desde que un día admite dos '
  'arqueos, sin él la vista devolvía el día duplicado.';


-- ── 2 · v_efectivo_sin_rendir · solo el torneo ─────────────────────────────
-- El bar no rinde a central, así que sus arqueos pendientes no son «efectivo
-- sin rendir»: su salida es retirar_efectivo_bar, que ya movió la plata.

create or replace view v_efectivo_sin_rendir as
 SELECT a.responsable_id,
    count(*) AS arqueos_pendientes,
    sum(a.saldo_contado) AS monto_sin_rendir,
    min(dc.fecha) AS desde,
    max(dc.fecha) AS hasta
   FROM arqueo a
     JOIN dia_cancha dc ON dc.id = a.dia_cancha_id
  WHERE a.estado = 'pendiente_entrega' AND a.ambito = 'torneo'
  GROUP BY a.responsable_id;

comment on view v_efectivo_sin_rendir is
  'Lo que cada responsable arqueó y todavía no entregó a central. Solo ámbito '
  'torneo: el bar no rinde a central, saca por retirar_efectivo_bar.';


-- ── 3 · v_saldo_bar_dia_cancha · el gemelo del bar ─────────────────────────
-- Calcado de v_saldo_efectivo_dia_cancha pero sobre el cajón del bar. Es lo que
-- lee la pantalla para ofrecer los días arqueables (`arqueo_id is null`) y
-- mostrar el saldo esperado antes de contar.

create or replace view v_saldo_bar_dia_cancha as
 SELECT dc.id AS dia_cancha_id,
    dc.fecha,
    dc.predio_id,
    p.codigo AS predio,
    p.nombre AS predio_nombre,
    saldo_bar_predio(dc.predio_id, dc.fecha) AS saldo_sistema,
    a.id AS arqueo_id,
    a.estado AS arqueo_estado
   FROM dia_cancha dc
     JOIN predio p ON p.id = dc.predio_id
     LEFT JOIN arqueo a ON a.dia_cancha_id = dc.id AND a.ambito = 'bar';

comment on view v_saldo_bar_dia_cancha is
  'Días de cancha con el saldo del cajón del BAR y su arqueo, si lo tiene. '
  'Gemela de v_saldo_efectivo_dia_cancha. El saldo sale de saldo_bar_predio, o '
  'sea del diario: es entró (ventas) − retirado.';


-- ── 4 · v_retiro_bar · la lista de retiros ─────────────────────────────────
-- `retiro_bar` sola no alcanza: el nombre del predio vive en `predio`, y el
-- estado se deriva de `anulado_at`. Mismo patrón que v_venta_bar.
--
-- MUESTRA TODOS, incluidos los anulados, marcados con `estado`. Lista retiros,
-- no asientos, así que la nota de la regla 4 sobre contraasientos huérfanos no
-- aplica.
--
-- `destino_nombre` traduce el código a algo legible una sola vez, acá, para que
-- no lo haga cada pantalla con su propio diccionario.

create or replace view v_retiro_bar as
 SELECT r.id AS retiro_bar_id,
    r.fecha,
    r.predio_id,
    p.codigo AS predio,
    p.nombre AS predio_nombre,
    r.monto,
    r.destino,
    CASE r.destino
      WHEN 'central' THEN 'Caja central'
      WHEN 'banco'   THEN 'Banco'
      ELSE r.destino
    END AS destino_nombre,
    r.motivo,
    CASE WHEN r.anulado_at IS NULL THEN 'vigente' ELSE 'anulado' END AS estado,
    r.anulado_at,
    r.anulado_motivo,
    r.asiento_id,
    r.created_by,
    r.created_at
   FROM retiro_bar r
     JOIN predio p ON p.id = r.predio_id;

comment on view v_retiro_bar is
  'Los retiros de efectivo del bar con su predio y destino legible. Muestra '
  'TODOS y marca el anulado en `estado` — no filtra.';
