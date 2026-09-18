-- ═══════════════════════════════════════════════════════════════════════════
-- Gasto en cuotas · plan indexado: alta + monto real editable al devengar
-- APLICADA el 18/09/2026 — probada con begin/rollback: propagación a
-- cuotas futuras funciona con plan indexado, rechazo funciona sin indexar.
-- Depende de 20260917110000 (crear_plan_pago y devengar_cuota_plan tal como
-- quedaron aplicadas el 17/09), redefinidas acá.
--
-- `plan_pago.indexado` existe desde 001_schema.sql, pensado exactamente para
-- esto —"este plan ajusta de monto"— y hasta hoy nadie lo escribía ni lo
-- leía. Dos funciones se tocan porque las dos puntas del mismo circuito
-- viven en cada una: sin la primera nadie puede marcar un plan como
-- indexado; sin la segunda, marcarlo no cambiaría nada.
--
-- 1. `crear_plan_pago` gana `p_indexado` (default false) — lo escribe en
--    `plan_pago.indexado`. Default false y no true: un plan es fijo salvo
--    que alguien diga lo contrario, mismo criterio que el resto de los
--    booleanos de alta de este proyecto (`gasto_planificado`, `cat_gasto`).
-- 2. `devengar_cuota_plan` exige `plan_pago.indexado = true` para aceptar un
--    `p_monto_real` distinto del pactado — si no, un típo al tipear (uno de
--    más, una coma corrida) se confundiría con un ajuste real, y encima se
--    propagaría solo a las cuotas futuras (ver 20260918100000 original, la
--    propagación "futuras por fecha").
--
-- Los dos `drop function` son necesarios: las dos firmas cambian de aridad
-- —crear_plan_pago de 8 a 9 parámetros, devengar_cuota_plan de 2 a 3—, y
-- `create or replace function` con otra lista de tipos NO reemplaza, crea
-- una sobrecarga. Mismo error ya encontrado y corregido dos veces en este
-- mismo módulo (generar_cuotas_plan, 20260917100100; y esta migración lo
-- tiene presente desde el arranque en las dos funciones).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · crear_plan_pago ──────────────────────────────────────────────────

drop function if exists public.crear_plan_pago(text, text, date, int, numeric, uuid, int, uuid);

create or replace function public.crear_plan_pago(
  p_nombre          text,
  p_organismo       text,
  p_fecha_inicio    date,
  p_cuotas_total    int,
  p_monto_cuota     numeric,
  p_cat_gasto_id    uuid,
  p_dia_vencimiento int default 15,
  p_torneo_id       uuid default null,
  p_indexado        boolean default false
)
returns uuid
language plpgsql
as $function$
declare
  v_plan_id    uuid;
  v_naturaleza text;
begin
  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'El plan de pago necesita un nombre.';
  end if;

  if p_fecha_inicio is null then
    raise exception 'El plan necesita fecha de inicio: cuándo vence la primera cuota.';
  end if;

  if p_cuotas_total is null or p_cuotas_total <= 0 then
    raise exception 'La cantidad de cuotas debe ser positiva (recibido: %)', p_cuotas_total;
  end if;

  if p_monto_cuota is null or p_monto_cuota <= 0 then
    raise exception 'El monto de cada cuota debe ser positivo (recibido: %)', p_monto_cuota;
  end if;

  if p_dia_vencimiento is null or p_dia_vencimiento not between 1 and 28 then
    raise exception 'El día de vencimiento debe estar entre 1 y 28 (recibido: %)', p_dia_vencimiento;
  end if;

  select naturaleza into v_naturaleza from cat_gasto where id = p_cat_gasto_id;

  if v_naturaleza is null then
    raise exception 'La categoría de gasto % no existe.', p_cat_gasto_id;
  end if;

  -- devengar_cuota_plan va a llamar a registrar_gasto sin jornada_id ni
  -- activo_id (una cuota de plan no es ni una fecha de calendario ni un
  -- activo). trg_gasto_coherente exige ambos para 'por_fecha' e 'inversion'
  -- respectivamente — si la categoría fuera una de esas dos, el plan se
  -- arma hoy sin error y el primer devengo revienta meses después, con la
  -- plata ya comprometida. Se corta acá, no ahí.
  if v_naturaleza = 'por_fecha' then
    raise exception
      'Un plan de pago no puede usar una categoría "por_fecha": esas '
      'categorías exigen una jornada de calendario, y una cuota de plan no '
      'tiene una.';
  end if;

  if v_naturaleza = 'inversion' then
    raise exception
      'Un plan de pago no puede usar una categoría "inversión": esas '
      'categorías exigen un activo ya dado de alta, y el plan no crea '
      'ninguno. Si el plan financia la compra de un bien, dalo de alta en '
      'Activos primero (comprar_activo) y pagalo con un plan de otra forma '
      '— no con esta función.';
  end if;

  if v_naturaleza = 'recurrente' and p_torneo_id is not null then
    raise exception
      'Una categoría "recurrente" es de estructura permanente y no admite '
      'torneo (trg_gasto_coherente). Si el plan es de un torneo puntual, '
      'usá una categoría "eventual".';
  end if;

  -- Una categoría "eventual" exige imputarse a un torneo, un predio O un
  -- activo (trg_gasto_coherente) — al menos uno de los tres. Acá solo hay
  -- torneo_id disponible: devengar_cuota_plan nunca manda predio_id ni
  -- activo_id a registrar_gasto (no tiene de dónde sacarlos). Sin esta
  -- validación, un plan "eventual" sin torneo se da de alta sin error y
  -- explota recién al devengar la primera cuota — mismo problema que
  -- 'por_fecha' e 'inversion' arriba, encontrado probando con
  -- begin/rollback.
  if v_naturaleza = 'eventual' and p_torneo_id is null then
    raise exception
      'Una categoría "eventual" necesita imputarse a un torneo, un predio o '
      'un activo (trg_gasto_coherente), y devengar_cuota_plan solo puede '
      'darle torneo. Este plan necesita p_torneo_id, o una categoría '
      'distinta.';
  end if;

  insert into plan_pago (
    nombre, organismo, fecha_inicio, cuotas_total, monto_cuota,
    dia_vencimiento, cat_gasto_id, estado, indexado
  ) values (
    trim(p_nombre),
    nullif(trim(coalesce(p_organismo, '')), ''),
    p_fecha_inicio, p_cuotas_total, p_monto_cuota,
    p_dia_vencimiento, p_cat_gasto_id, 'vigente', coalesce(p_indexado, false)
  ) returning id into v_plan_id;

  -- Genera las N filas de `compromiso` de una — el plan entero entra a
  -- v_cashflow_comprometido hoy mismo — pero sin tocar `gasto`: eso es
  -- devengar_cuota_plan, mes a mes.
  perform generar_cuotas_plan(v_plan_id, p_torneo_id);

  return v_plan_id;
end
$function$;

comment on function public.crear_plan_pago(text, text, date, int, numeric, uuid, int, uuid, boolean) is
  'Alta de un plan de pago en cuotas (moratoria, financiación, etc.). Genera '
  'de una las N filas de compromiso —todo el plan visible en el cashflow '
  'desde hoy— pero ningún gasto: eso lo hace devengar_cuota_plan, mes a mes. '
  'Valida que cat_gasto_id sea compatible con un devengo que solo puede '
  'ofrecer torneo_id (nunca predio_id ni activo_id): rechaza por_fecha e '
  'inversion siempre, recurrente con torneo y eventual sin torneo. '
  'p_indexado (default false) marca si el monto de las cuotas puede ajustar '
  'mes a mes — sin esto, devengar_cuota_plan rechaza cualquier p_monto_real '
  'distinto del pactado.';

-- ── 2 · devengar_cuota_plan ──────────────────────────────────────────────

drop function if exists public.devengar_cuota_plan(uuid, uuid);

create or replace function public.devengar_cuota_plan(
  p_compromiso_id uuid,
  p_created_by    uuid default null,
  p_monto_real    numeric default null
)
returns uuid
language plpgsql
as $function$
declare
  v_user_id     uuid;
  v_compromiso  record;
  v_plan        record;
  v_monto_final numeric(16,2);
  v_gasto_id    uuid;
begin
  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable del devengo: se requiere p_created_by o sesión autenticada.';
  end if;

  if p_monto_real is not null and p_monto_real <= 0 then
    raise exception 'El monto real debe ser positivo (recibido: %)', p_monto_real;
  end if;

  select * into v_compromiso from compromiso where id = p_compromiso_id;

  if not found then
    raise exception 'El compromiso % no existe.', p_compromiso_id;
  end if;

  if v_compromiso.tipo <> 'cuota_plan' then
    raise exception
      'El compromiso % no es una cuota de plan de pago (tipo: %). '
      'devengar_cuota_plan solo procesa compromisos tipo=cuota_plan.',
      p_compromiso_id, v_compromiso.tipo;
  end if;

  if v_compromiso.gasto_id is not null then
    raise exception
      'Esta cuota ya se devengó: es el gasto %. No se procesa dos veces.',
      v_compromiso.gasto_id;
  end if;

  if v_compromiso.estado <> 'pendiente' then
    raise exception
      'La cuota está en estado "%", no "pendiente". No se puede devengar.',
      v_compromiso.estado;
  end if;

  select * into v_plan from plan_pago where id = v_compromiso.plan_id;

  if not found then
    raise exception 'La cuota % no tiene un plan de pago válido.', p_compromiso_id;
  end if;

  -- El monto que se devenga: el editado si vino, si no el que ya tenía la
  -- cuota. Se resuelve en una variable ANTES de llamar a registrar_gasto —
  -- registrar_gasto recibe el número por parámetro, no lo relee de la
  -- tabla, así que alcanza con usar v_monto_final acá Y en el UPDATE de
  -- compromiso de más abajo para que los dos queden con el mismo valor.
  v_monto_final := coalesce(p_monto_real, v_compromiso.monto);

  -- La guarda de indexado: un plan fijo (indexado=false, el default) no
  -- acepta un monto distinto del pactado. Sin esto, un typo al tipear el
  -- monto real de CUALQUIER plan se confundiría con un ajuste real — y
  -- encima se propagaría solo a las cuotas futuras, sin que nadie lo haya
  -- pedido. Va DESPUÉS de resolver v_monto_final (necesita comparar contra
  -- el valor final, no contra p_monto_real crudo, para no exigir que venga
  -- explícito cuando de hecho coincide con el que ya tenía la cuota) y
  -- ANTES de registrar_gasto (no se crea ningún gasto si la guarda frena).
  if v_monto_final <> v_compromiso.monto and not v_plan.indexado then
    raise exception
      'Este plan no está marcado como indexado: no se puede devengar con un '
      'monto distinto al pactado (%). Si el monto realmente cambia mes a '
      'mes, marcá el plan como indexado.', v_compromiso.monto;
  end if;

  -- registrar_gasto exige concepto_id (del catálogo) XOR concepto_libre
  -- (texto). El plan no tiene catálogo de conceptos propio, así que va con
  -- concepto_libre — la misma descripción que ya identifica a esta cuota en
  -- el cashflow ("Moratoria X · cuota 3/12").
  v_gasto_id := registrar_gasto(
    p_cat_gasto_id   => v_plan.cat_gasto_id,
    p_arancel        => v_monto_final,
    p_cantidad       => 1,
    p_devengado_at   => v_compromiso.vence_at,
    p_concepto_libre => v_compromiso.descripcion,
    p_torneo_id      => v_compromiso.torneo_id,
    p_created_by     => v_user_id
  );

  update compromiso
     set gasto_id    = v_gasto_id,
         estado      = 'cumplido',
         cumplido_at = current_date,
         monto       = v_monto_final
   where id = p_compromiso_id;

  -- ── El monto nuevo se propaga hacia adelante ──────────────────────────
  --
  -- Sólo si cambió de verdad: si no vino p_monto_real, o vino igual al que
  -- ya tenía la cuota, no hay nada que propagar y ninguna otra fila se toca
  -- (y la guarda de indexado de arriba ya garantiza que, si cambió, el plan
  -- es indexado).
  --
  -- `vence_at > v_compromiso.vence_at` — FUTURAS por fecha, no "lo que
  -- todavía no se procesó". Si alguien devenga fuera de orden —la cuota 3
  -- antes que la 1 y la 2, que siguen pendientes con vencimiento anterior—,
  -- esas dos NO se tocan acá: ya vencieron con el monto viejo, y
  -- cambiarlas reescribiría lo que el cashflow venía mostrando de ellas sin
  -- que nadie las haya devengado con el número nuevo.
  --
  -- Dos cuotas del mismo plan nunca comparten fecha —generar_cuotas_plan
  -- las separa un mes exacto entre sí—, así que el `>` estricto no dispara
  -- ambigüedad ni excluye por accidente una cuota que debería entrar.
  if v_monto_final <> v_compromiso.monto then
    update compromiso
       set monto = v_monto_final
     where plan_id = v_compromiso.plan_id
       and estado = 'pendiente'
       and vence_at > v_compromiso.vence_at;

    -- plan_pago.monto_cuota es lo que PlanesPago.tsx muestra en la columna
    -- "Por cuota" de cada plan, al lado de la próxima cuota real (que sí
    -- sale de compromiso, y por lo tanto ya reflejaría el ajuste). Sin este
    -- UPDATE, la misma fila diría dos montos distintos para "cuánto sale
    -- una cuota" de este plan.
    update plan_pago set monto_cuota = v_monto_final where id = v_compromiso.plan_id;
  end if;

  if not exists (
    select 1 from compromiso
     where plan_id = v_compromiso.plan_id
       and estado = 'pendiente'
  ) then
    update plan_pago set estado = 'finalizado' where id = v_compromiso.plan_id;
  end if;

  return v_gasto_id;
end
$function$;

comment on function public.devengar_cuota_plan(uuid, uuid, numeric) is
  'El botón mensual (patrón devengar_sueldos_socios): toma UN compromiso '
  'pendiente de tipo=cuota_plan, carga el gasto real vía registrar_gasto '
  '(categoría y torneo del plan; monto = p_monto_real si vino, si no el de '
  'la cuota) y cierra el compromiso (gasto_id + cumplido + monto real). '
  'p_monto_real distinto del pactado exige plan_pago.indexado = true, o '
  'rechaza antes de tocar nada. Si el monto cambió, se propaga a las cuotas '
  'PENDIENTES del plan cuyo vence_at es POSTERIOR a esta —no a las ya '
  'cumplidas, no a pendientes anteriores si se devengó fuera de orden— y a '
  'plan_pago.monto_cuota. Si esa era la última cuota pendiente del plan, '
  'plan_pago.estado pasa a ''finalizado'' solo. Idempotente por '
  'compromiso.gasto_id. No paga — pagar_gasto sigue siendo un paso aparte.';
