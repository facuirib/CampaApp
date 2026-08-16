-- ═══════════════════════════════════════════════════════════════════════════
-- asentar_amortizacion · cierra el circuito de activos
--
-- ⚠️ PROPUESTA · NO APLICADA. El nombre del archivo se define al aplicar, con
-- la versión que registre la herramienta.
--
-- ── Qué cierra ─────────────────────────────────────────────────────────────
--
--   compra        BIENES_USO / PROVEEDORES   ✅ (ruteo de inversión)
--   pago          PROVEEDORES / CAJA         ✅ (pagar_gasto, sin cambios)
--   amortización  GAS_AMORT  / AMORT_ACUM    ← esto
--
-- `proponer_amortizaciones()` ya calcula las cuotas del mes, pero es **lectura
-- pura**: no escribe nada. Por eso `amortizacion` tiene 0 filas y las dos
-- cuentas 0 movimientos, esperando esta función.
--
-- ── Calcada al precedente ──────────────────────────────────────────────────
--
-- `devengar_sueldos_socios(p_periodo_id, p_created_by) returns int` tiene la
-- misma forma: tabla de apoyo con `unique(x_id, periodo_id)`, loop idempotente,
-- asiento por fila, retorno con el conteo. Se copia esa forma —validación de
-- período, `v_fin`, torneo_id NULL, orden asiento→insert— para que las dos se
-- lean igual.
--
-- **La diferencia con el precedente es de dominio, no de forma** (decisión 23):
-- un sueldo es un monto acordado y se devenga directo; una amortización es una
-- **estimación** y lleva revisión previa. Acá la revisión ocurre en la pantalla
-- —muestra lo que propone `proponer_amortizaciones` y el operador confirma—, y
-- recién entonces se escribe, ya como `'confirmada'`.
--
-- *Por qué un solo paso y no materializar propuestas primero:* una fila
-- `'propuesta'` abandonada **bloquearía al activo para siempre**, porque
-- `proponer_amortizaciones` deja de proponerlo (ya tiene fila en ese período) y
-- el `unique` impide reintentar limpio. El estado intermedio persistido crea un
-- problema que el flujo de un paso no tiene. Queda como consecuencia asumida
-- que `estado = 'propuesta'` es vestigial.
--
-- ── El filtro no se reimplementa ───────────────────────────────────────────
--
-- La función **llama** a `proponer_amortizaciones(p_periodo_id)` en vez de
-- repetir sus cuatro condiciones —dado de baja, no había nacido a fin de mes,
-- vida útil terminada, ya amortizado en el período—. Duplicarlas garantizaría
-- que algún día diverjan y que la pantalla proponga una cosa y la función
-- asiente otra.
--
-- ── Idempotencia, en tres capas ────────────────────────────────────────────
--
--   1. `proponer_amortizaciones` ya descarta lo que tiene amortización.
--   2. `unique (activo_id, periodo_id)` es la red en la base.
--   3. El loop no toca lo ya asentado.
--
-- Correrla dos veces devuelve **0**, no error: quien corre un proceso mensual
-- no siempre sabe si ya se corrió, y fallar lo obligaría a averiguarlo antes.
--
-- ── Lo que NO hace ─────────────────────────────────────────────────────────
--
-- **No modifica `crear_asiento`: sólo lo llama.** Modificarlo sería zona
-- compartida.
--
-- **No contempla la reversa.** Anular una amortización sería `anular_asiento` +
-- marcar la fila, pero `amortizacion.estado` sólo admite `propuesta|confirmada`
-- —no hay `anulada`— así que implicaría tocar el modelo. No hay precedente:
-- `devengo_socio` tiene 6 filas y ninguna función que lo anule. Queda aparte.
--
-- **No valida el responsable.** Se propaga a `crear_asiento`, que ya falla
-- explícito si falta (decisión 89). Duplicarlo daría dos mensajes distintos
-- para el mismo problema.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.asentar_amortizacion(
  p_periodo_id uuid,
  p_created_by uuid default null,
  p_activo_id  uuid default null   -- opcional: confirmar un activo puntual
)
returns int
language plpgsql
as $function$
declare
  v_per     record;
  v_fin     date;
  v_prop    record;
  v_asiento uuid;
  v_n       int := 0;
begin
  select p.id, p.anio, p.mes, p.estado
    into v_per
  from periodo p where p.id = p_periodo_id;

  if not found then
    raise exception 'El período % no existe', p_periodo_id;
  end if;

  -- Mensaje propio antes de que lo tire trg_periodo_abierto desde adentro de
  -- crear_asiento: dice qué período y qué se estaba intentando.
  if v_per.estado = 'cerrado' then
    raise exception
      'El período %-% está cerrado: no se puede amortizar sobre él.',
      v_per.anio, lpad(v_per.mes::text, 2, '0');
  end if;

  -- La amortización se asienta el último día del mes: es el mes completo lo que
  -- se amortiza, no un día puntual.
  v_fin := (make_date(v_per.anio, v_per.mes, 1) + interval '1 month - 1 day')::date;

  for v_prop in
    select pa.activo_id, pa.nombre, pa.monto, pa.cuota, pa.cuotas_total
      from proponer_amortizaciones(p_periodo_id) pa
     where p_activo_id is null or pa.activo_id = p_activo_id
     order by pa.nombre
  loop
    -- torneo_id NULL = ESTRUCTURA PERMANENTE (decisión 24, §3.11). El bien
    -- sirve a todos los torneos que dura, así que no se prorratea entre ellos.
    v_asiento := crear_asiento(
      v_fin,
      'amortizacion',
      'Amortización ' || v_prop.nombre || ' · cuota ' || v_prop.cuota ||
        '/' || v_prop.cuotas_total || ' · ' ||
        lpad(v_per.mes::text, 2, '0') || '/' || v_per.anio,
      jsonb_build_array(
        jsonb_build_object('cuenta', 'GAS_AMORT',  'debe',  v_prop.monto),
        jsonb_build_object('cuenta', 'AMORT_ACUM', 'haber', v_prop.monto)
      ),
      null,               -- torneo_id: estructura permanente
      null,               -- jornada_id
      null,               -- predio_id
      v_prop.activo_id,   -- origen_id: el activo que se amortiza
      p_created_by
    );

    insert into amortizacion (activo_id, periodo_id, monto, asiento_id, estado)
    values (v_prop.activo_id, p_periodo_id, v_prop.monto, v_asiento, 'confirmada');

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;

comment on function public.asentar_amortizacion(uuid, uuid, uuid) is
  'Asienta las amortizaciones del período: GAS_AMORT / AMORT_ACUM, una por '
  'activo, a estructura permanente (torneo_id NULL, decisión 24). Las cuotas '
  'salen de proponer_amortizaciones(), no de un filtro propio. Idempotente: '
  'correrla dos veces devuelve 0. Con p_activo_id confirma uno solo.';
