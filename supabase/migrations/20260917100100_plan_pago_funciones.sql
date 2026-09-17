-- ═══════════════════════════════════════════════════════════════════════════
-- Gasto en cuotas · funciones
-- APLICADA el 17/09/2026 — depende de 20260917100000 (plan_pago.cat_gasto_id),
-- aplicada primero. Probada de punta a punta con begin/rollback: plan de 3
-- cuotas, primera cuota devengada, gasto real generado y vinculado; caso
-- 'eventual' sin torneo rechazado correctamente.
--
-- Un `drop function` de más abajo que no estaba en la propuesta original:
-- `generar_cuotas_plan(uuid)` —la de un solo parámetro, viva desde
-- 001_schema.sql— seguía en la base. `create or replace function
-- generar_cuotas_plan(uuid, uuid)` no la reemplaza, crea una SOBRECARGA — el
-- mismo error que ya está documentado en
-- 20260830250000_registrar_gasto_proveedor.sql y que acá, al escribir esto,
-- no se aplicó a sí mismo. Apareció recién al aplicar de verdad (la
-- propuesta original decía "cero llamadores en runtime, no hay nada que
-- romper", que es cierto pero no es lo mismo que "no hay una firma vieja
-- que sacar"). Se corrigió a mano en la base al aplicar; el `drop` queda acá
-- para que el archivo sea correcto si alguna vez se corre de nuevo sobre un
-- entorno limpio.
--
-- Patrón elegido: "botón mensual", como devengar_sueldos_socios — NO
-- generación anticipada del gasto real. Lo que SÍ se genera de una, al dar
-- de alta el plan, son las N filas de `compromiso`: eso es lo que
-- v_cashflow_comprometido necesita para mostrar el plan completo desde el
-- día 1, sin que exista todavía ningún `gasto`.
--
-- Tres funciones:
--   1. generar_cuotas_plan(plan_id, torneo_id?)   — REDISEÑADA. Le cierra la
--      falta de validación (plan inexistente, cuotas_total/monto_cuota <= 0)
--      y agrega la propagación de torneo_id a cada compromiso (columna que
--      ya existía en `compromiso`, sin escritor).
--   2. crear_plan_pago(...)                        — NUEVA. El alta que
--      faltaba. Valida que la categoría sea compatible con lo que
--      devengar_cuota_plan va a poder ofrecerle a registrar_gasto meses
--      después — solo cat_gasto_id, monto, fecha, concepto_libre y
--      opcionalmente torneo_id; nunca predio_id ni activo_id — para las
--      cuatro naturalezas de cat_gasto: rechaza 'por_fecha' e 'inversion'
--      siempre, 'recurrente' si el plan tiene torneo, y 'eventual' si el
--      plan NO tiene torneo (es la única de las tres anclas que
--      devengar_cuota_plan puede darle). Si no se valida acá, el plan se
--      arma hoy y explota en el peor momento: al intentar devengar la
--      cuota 3, con la 1 y la 2 ya pagadas. (El caso 'eventual' se sumó
--      después de probar con begin/rollback y encontrarlo en carne propia.)
--   3. devengar_cuota_plan(compromiso_id, created_by?) — NUEVA. El botón
--      mensual. Toma UN compromiso pendiente, llama registrar_gasto, y
--      cierra el círculo: compromiso.gasto_id + estado='cumplido'.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · generar_cuotas_plan, redefinida ─────────────────────────────────────
--
-- Firma nueva: gana p_torneo_id. Cero llamadores en runtime hoy, así que no
-- hay nada que "romper" en el SENTIDO de código que deje de andar — pero la
-- firma vieja, de un solo parámetro, seguía viva en la base desde
-- 001_schema.sql, y `create or replace` con otra firma no la pisa: crea una
-- sobrecarga. El `drop` de acá abajo la saca primero, mismo patrón que
-- `20260830250000_registrar_gasto_proveedor.sql` ya usó para este error
-- exacto — y que la primera versión de este archivo no se aplicó a sí misma.
--
-- Guarda de no-reprocesar: sin `unique` en `compromiso` que lo impida a nivel
-- de constraint, se verifica con un `exists` antes de insertar. No es un
-- candado a prueba de carreras concurrentes (dos clicks simultáneos podrían
-- colarse los dos), pero para una herramienta de 5 usuarios de oficina alcanza
-- — es el mismo nivel de rigor que el resto de las altas de este proyecto.

drop function if exists public.generar_cuotas_plan(uuid);

create or replace function public.generar_cuotas_plan(
  p_plan_id   uuid,
  p_torneo_id uuid default null
)
returns int
language plpgsql
as $function$
declare
  p       record;
  i       int;
  v_fecha date;
  v_count int := 0;
begin
  select * into p from plan_pago where id = p_plan_id;

  if not found then
    raise exception 'El plan de pago % no existe', p_plan_id;
  end if;

  if p.cuotas_total is null or p.cuotas_total <= 0 then
    raise exception 'El plan necesita una cantidad de cuotas positiva (recibido: %)', p.cuotas_total;
  end if;

  if p.monto_cuota is null or p.monto_cuota <= 0 then
    raise exception 'El monto de cada cuota debe ser positivo (recibido: %)', p.monto_cuota;
  end if;

  if p.dia_vencimiento is null or p.dia_vencimiento not between 1 and 28 then
    raise exception 'El día de vencimiento debe estar entre 1 y 28 (recibido: %)', p.dia_vencimiento;
  end if;

  if exists (select 1 from compromiso where plan_id = p_plan_id) then
    raise exception
      'El plan % ya tiene compromisos generados. generar_cuotas_plan no se '
      'corre dos veces sobre el mismo plan.', p_plan_id;
  end if;

  for i in 1..p.cuotas_total loop
    v_fecha := (date_trunc('month', p.fecha_inicio + (i - 1) * interval '1 month')
                + (p.dia_vencimiento - 1) * interval '1 day')::date;

    insert into compromiso (tipo, sentido, descripcion, vence_at, monto, plan_id, torneo_id)
    values (
      'cuota_plan', 'pagar',
      p.nombre || ' · cuota ' || i || '/' || p.cuotas_total,
      v_fecha, p.monto_cuota, p_plan_id, p_torneo_id
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end
$function$;

comment on function public.generar_cuotas_plan(uuid, uuid) is
  'Genera de una las N filas de compromiso (tipo=cuota_plan, sentido=pagar) '
  'de un plan de pago — todo el plan visible en v_cashflow_comprometido desde '
  'el alta. No toca gasto ni asiento: el devengo real es mensual, vía '
  'devengar_cuota_plan. No es idempotente por diseño explícito (falla si el '
  'plan ya tiene compromisos) en vez de silencioso: una llamada duplicada '
  'duplicaría el plan entero, y hay que verlo.';

-- ── 2 · crear_plan_pago ──────────────────────────────────────────────────────

create or replace function public.crear_plan_pago(
  p_nombre          text,
  p_organismo       text,
  p_fecha_inicio    date,
  p_cuotas_total    int,
  p_monto_cuota     numeric,
  p_cat_gasto_id    uuid,
  p_dia_vencimiento int default 15,
  p_torneo_id       uuid default null
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
    dia_vencimiento, cat_gasto_id, estado
  ) values (
    trim(p_nombre),
    nullif(trim(coalesce(p_organismo, '')), ''),
    p_fecha_inicio, p_cuotas_total, p_monto_cuota,
    p_dia_vencimiento, p_cat_gasto_id, 'vigente'
  ) returning id into v_plan_id;

  -- Genera las N filas de `compromiso` de una — el plan entero entra a
  -- v_cashflow_comprometido hoy mismo — pero sin tocar `gasto`: eso es
  -- devengar_cuota_plan, mes a mes.
  perform generar_cuotas_plan(v_plan_id, p_torneo_id);

  return v_plan_id;
end
$function$;

comment on function public.crear_plan_pago(text, text, date, int, numeric, uuid, int, uuid) is
  'Alta de un plan de pago en cuotas (moratoria, financiación, etc.). Genera '
  'de una las N filas de compromiso —todo el plan visible en el cashflow '
  'desde hoy— pero ningún gasto: eso lo hace devengar_cuota_plan, mes a mes. '
  'Valida que cat_gasto_id sea compatible con un devengo que solo puede '
  'ofrecer torneo_id (nunca predio_id ni activo_id): rechaza por_fecha e '
  'inversion siempre, recurrente con torneo y eventual sin torneo — para no '
  'descubrir la incompatibilidad recién al devengar.';

-- ── 3 · devengar_cuota_plan ──────────────────────────────────────────────────
--
-- El botón mensual, patrón devengar_sueldos_socios: no propone, ejecuta
-- directo — el monto y la fecha de la cuota ya están decididos desde el
-- alta del plan, no hay nada que revisar como si fuera una estimación.
--
-- Idempotente por el mismo mecanismo que pagar_gasto usa contra pagar dos
-- veces: primero mira si compromiso.gasto_id ya está seteado, y si lo está,
-- rechaza con el gasto que ya existe en el mensaje — no lo reprocesa, y no
-- inserta un segundo gasto para la misma cuota.

create or replace function public.devengar_cuota_plan(
  p_compromiso_id uuid,
  p_created_by    uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_user_id    uuid;
  v_compromiso record;
  v_plan       record;
  v_gasto_id   uuid;
begin
  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable del devengo: se requiere p_created_by o sesión autenticada.';
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

  -- registrar_gasto exige concepto_id (del catálogo) XOR concepto_libre
  -- (texto). El plan no tiene catálogo de conceptos propio, así que va con
  -- concepto_libre — la misma descripción que ya identifica a esta cuota en
  -- el cashflow ("Moratoria X · cuota 3/12"), para que el gasto real se lea
  -- igual que se leía comprometido.
  v_gasto_id := registrar_gasto(
    p_cat_gasto_id   => v_plan.cat_gasto_id,
    p_arancel        => v_compromiso.monto,
    p_cantidad       => 1,
    p_devengado_at   => v_compromiso.vence_at,
    p_concepto_libre => v_compromiso.descripcion,
    p_torneo_id      => v_compromiso.torneo_id,
    p_created_by     => v_user_id
  );

  update compromiso
     set gasto_id    = v_gasto_id,
         estado      = 'cumplido',
         cumplido_at = current_date
   where id = p_compromiso_id;

  return v_gasto_id;
end
$function$;

comment on function public.devengar_cuota_plan(uuid, uuid) is
  'El botón mensual (patrón devengar_sueldos_socios): toma UN compromiso '
  'pendiente de tipo=cuota_plan, carga el gasto real vía registrar_gasto '
  '(categoría y torneo del plan, monto y fecha de la cuota) y cierra el '
  'compromiso (gasto_id + cumplido). Idempotente por compromiso.gasto_id: '
  'una cuota ya devengada se rechaza, no se reprocesa. No paga — pagar_gasto '
  'sigue siendo un paso aparte, igual que con cualquier otro gasto.';
