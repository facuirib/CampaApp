-- ============================================================================
-- CAMPA · total_facturado → total_plan, de raíz
--
-- Bajo percibido puro (decisión 1) no se factura nada: no hay factura, no hay
-- devengo, y la cuota NO genera asiento. Esa columna es la suma de `cuota.monto`
-- —lo que el equipo se comprometió a pagar según su plan del tarifario— y por
-- eso pasa a llamarse `total_plan`.
--
-- El nombre viejo ya había causado confusión: su propio comentario tenía que
-- aclarar "NO es la deuda", y CLAUDE.md repite la advertencia. Un nombre que
-- necesita una nota al pie para no engañar es un nombre mal puesto.
--
-- ── Alcance: TODO lo que la nombra ──────────────────────────────────────────
--
-- Relevado en el catálogo completo. La columna la toca exactamente esto:
--
--   ESCRIBE   sync_total_facturado()          (única escritura del sistema)
--   LEE       v_cuenta_corriente_equipo       (3 referencias en su cuerpo)
--   NADIE MÁS. crear_equipo_torneo (B0) no la toca: la deja en su default 0 y
--             confía en el trigger. Sin constraints, sin índices, sin RLS.
--
-- Se renombran también la función y el trigger: dejarlos como
-- sync_total_facturado / trg_sync_total_facturado sería que sigan nombrando una
-- columna que ya no existe, y en tres meses alguien busca "total_facturado",
-- encuentra el trigger y se confunde.
--
-- ── Orden de las operaciones ────────────────────────────────────────────────
--
-- Se dropea todo lo que depende de la columna ANTES de renombrarla, y se recrea
-- después. Postgres actualizaría solo las referencias internas de la vista al
-- renombrar la columna base, pero la vista seguiría EXPONIENDO una columna
-- llamada `total_facturado` —el nombre de salida se fija al crearla—, que es
-- justo lo que hay que corregir. Recrearla es obligatorio, no cosmético.
--
-- `create or replace view` no sirve: no puede renombrar columnas de salida.
--
-- Producción con 0 filas en equipo_torneo: no migra ningún dato.
-- ============================================================================


-- 1 · Sacar lo que depende de la columna ------------------------------------

drop trigger trg_sync_total_facturado on cuota;
drop function sync_total_facturado();
drop view v_cuenta_corriente_equipo;


-- 2 · El renombre ------------------------------------------------------------

alter table equipo_torneo rename column total_facturado to total_plan;

comment on column equipo_torneo.total_plan is
  'Suma de las cuotas del plan, mantenida por trigger. Es lo que el equipo se '
  'comprometió a pagar, NO la deuda: la deuda es la mora, cuotas vencidas e '
  'impagas. Tampoco es facturación ni devengo — bajo percibido puro la cuota no '
  'genera asiento (decisión 1).';


-- 3 · El trigger, con el nombre nuevo ----------------------------------------
--
-- Cuerpo idéntico al anterior salvo la columna que escribe. Sigue viviendo
-- sobre `cuota`, no sobre `equipo_torneo`: se dispara cuando cambian las cuotas
-- y recalcula el total de su ficha.

create or replace function sync_total_plan() returns trigger as $$
declare v_et_id uuid;
begin
  v_et_id := coalesce(new.equipo_torneo_id, old.equipo_torneo_id);

  update equipo_torneo
     set total_plan = coalesce(
       (select sum(monto) from cuota where equipo_torneo_id = v_et_id), 0)
   where id = v_et_id;

  return null;
end $$ language plpgsql;

create trigger trg_sync_total_plan
  after insert or delete or update on cuota
  for each row execute function sync_total_plan();


-- 4 · La vista ---------------------------------------------------------------
--
-- Cuerpo idéntico al anterior. Cambian SOLO las tres referencias a la columna
-- base (el select, el cálculo del saldo y el group by) y el nombre de la
-- columna de salida.
--
-- Las otras 12 columnas de salida quedan iguales en nombre, tipo y POSICIÓN:
--   1 equipo_torneo_id   2 tercero_id    3 equipo      4 torneo
--   5 categoria          6 genero        7 serie       8 total_plan  ← única
--   9 total_pagado      10 saldo        11 cuotas_total
--  12 cuotas_pagadas    13 proximo_vencimiento

create view v_cuenta_corriente_equipo as
select et.id                                            as equipo_torneo_id,
       te.id                                            as tercero_id,
       te.nombre                                        as equipo,
       t.nombre                                         as torneo,
       cat.nombre                                       as categoria,
       cat.genero,
       s.nombre                                         as serie,
       et.total_plan,
       coalesce(sum(i.imputado), 0::numeric)            as total_pagado,
       et.total_plan - coalesce(sum(i.imputado), 0::numeric) as saldo,
       count(c.id)                                      as cuotas_total,
       count(c.pagado_at)                               as cuotas_pagadas,
       min(
         case
           when c.pagado_at is null
            and (j.id is null or j.estado <> 'suspendida'::text) then c.vence_at
           else null::date
         end)                                           as proximo_vencimiento
from equipo_torneo et
  join tercero te   on te.id = et.tercero_id
  join torneo t     on t.id = et.torneo_id
  join serie s      on s.id = et.serie_id
  join categoria cat on cat.id = s.categoria_id
  left join cuota c   on c.equipo_torneo_id = et.id
  left join jornada j on j.id = c.jornada_id
  left join (
    select pago_imputacion.cuota_id,
           sum(pago_imputacion.monto) as imputado
      from pago_imputacion
     group by pago_imputacion.cuota_id
  ) i on i.cuota_id = c.id
group by et.id, te.id, te.nombre, t.nombre, cat.nombre, cat.genero, s.nombre,
         et.total_plan;

comment on view v_cuenta_corriente_equipo is
  'Cuenta corriente del equipo en un torneo. `total_plan` es lo comprometido '
  'según el tarifario, no facturación: bajo percibido puro la cuota no genera '
  'asiento (decisión 1).';
