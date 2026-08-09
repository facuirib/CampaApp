-- ═══════════════════════════════════════════════════════════════════════════
-- ESCRITURA DE GASTOS — preview_gasto · registrar_gasto · pagar_gasto ·
--                       preview_pago_gasto · anular_gasto
--
-- El circuito de escritura del módulo de gastos. Autoría de Horacio; este
-- archivo es su versión con las correcciones de la revisión aplicadas en el
-- lugar (un solo archivo, sin duplicado).
--
-- El gasto son DOS asientos (concepto 5 del modelo):
--   · registrar_gasto → DEVENGO (cuenta del gasto / PROVEEDORES) al cargar
--   · pagar_gasto     → PAGO    (PROVEEDORES / caja)             al pagar
--   · anular_gasto    → contraasienta los dos, en orden inverso
--
-- Lo que ya venía bien y no se tocó: el patrón de dos asientos, la cuenta que
-- sale de cat_gasto.cuenta_id, las dos preview_ derivando totales de las
-- líneas reales (sin el `true` literal de preview_cobro), el rechazo de pagar
-- dos veces, y el orden pago→devengo de la anulación con la limpieza de
-- pagado_at/medio_pago/asiento_pag_id que resuelve el caso espejo.
--
-- ── Correcciones aplicadas ─────────────────────────────────────────────────
--
-- 1 · p_origen invertido. Decía 'devengo_gasto'/'pago_gasto' y el CHECK de
--     asiento.origen acepta 'gasto_devengo'/'gasto_pago'. Copiaba la forma de
--     'devengo_equipo'/'pago_equipo', donde el verbo va primero, pero en
--     gastos el orden es al revés. Toda llamada habría fallado al insertar.
--
-- 2 · El responsable no llegaba al contraasiento. registrar_gasto y
--     pagar_gasto sí lo propagaban; anular_gasto no podía, porque
--     anular_asiento no aceptaba responsable y llamaba a crear_asiento sin él,
--     cayendo en el fallback a auth.users que sigue vivo ahí. Ver la sección 0.
--
-- 3 · pagar_gasto no verificaba que el predio tuviera caja de efectivo. Sin
--     esa guarda el asiento se crea igual y el movimiento queda INVISIBLE en
--     v_saldo_caja, que joinea contra `caja`. Se replica la de registrar_cobro.
--
-- 4 · registrar_gasto no aceptaba activo_id, así que la naturaleza `inversion`
--     era incargable: su trigger exige activo. Se agrega el parámetro.
--
-- 5 · pagar_gasto silenciaba el predio con transferencia/cheque (lo ponía
--     null). Ahora rechaza, como registrar_cobro: un llamador que se equivocó
--     tiene que enterarse.
--
-- 6 · Las preview_ devolvían `cuenta_nombre` y el componente AsientoPreview
--     espera `nombre`, así que las pantallas mapeaban. Ahora devuelven
--     `nombre` directo. Queda fijado el contrato para las preview_* futuras.
--
-- Se dejó COMO ESTABA el fallback por comodidad del efectivo —si no viene
-- p_predio_id, se usa el del gasto—: es defendible y no rompe nada.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 0 · anular_asiento acepta responsable
--
-- Único cambio de este archivo que sale del carril de gastos, y no hay forma
-- de evitarlo: `anular_gasto` contraasienta con `anular_asiento`, y mientras
-- ésta no acepte responsable, sus contraasientos se anotan con el fallback de
-- crear_asiento — un usuario cualquiera de auth.users. Es exactamente la
-- auditoría falsa que sacamos de registrar_cobro (decisión 89).
--
-- El cambio es ADITIVO: un parámetro opcional al final, con default null. Un
-- llamador de tres argumentos sigue funcionando igual, y el comportamiento sin
-- responsable es el de siempre. Hace falta `drop` porque agregar un parámetro
-- con default crea una SEGUNDA función en vez de reemplazar la anterior, y
-- entonces una llamada de tres argumentos quedaría ambigua.
--
-- NO se toca el fallback de crear_asiento: eso es del bloque 10, donde hay que
-- resolver qué responsable llevan los nueve procesos automáticos que la
-- llaman. Acá solo se abre el camino para que el que ya existe pueda pasar.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.anular_asiento(uuid, text, date);

create or replace function public.anular_asiento(
  p_asiento_id uuid,
  p_motivo     text,
  p_fecha      date default current_date,
  p_created_by uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_orig    record;
  v_nuevo   uuid;
  v_lineas  jsonb;
begin
  select * into v_orig from asiento where id = p_asiento_id;

  if not found then
    raise exception 'El asiento % no existe', p_asiento_id;
  end if;

  if v_orig.anulado_por is not null then
    raise exception 'El asiento % ya fue anulado', p_asiento_id;
  end if;

  -- ¿Es este un contraasiento de otro?
  if exists (select 1 from asiento where anulado_por = p_asiento_id) then
    raise exception
      'El asiento % es un contraasiento y no se puede anular', p_asiento_id;
  end if;

  -- Invertir: lo que estaba al debe va al haber y viceversa
  select jsonb_agg(jsonb_build_object(
           'cuenta',     c.codigo,
           'debe',       l.haber,
           'haber',      l.debe,
           'tercero_id', l.tercero_id
         ))
    into v_lineas
    from asiento_linea l
    join cuenta c on c.id = l.cuenta_id
   where l.asiento_id = p_asiento_id;

  v_nuevo := crear_asiento(
    p_fecha,
    'ajuste',
    'Anulación: ' || v_orig.descripcion || ' · ' || p_motivo,
    v_lineas,
    v_orig.torneo_id,
    v_orig.jornada_id,
    v_orig.predio_id,
    p_asiento_id,
    p_created_by
  );

  update asiento set anulado_por = v_nuevo where id = p_asiento_id;

  return v_nuevo;
end $function$;

comment on function public.anular_asiento(uuid, text, date, uuid) is
  'Anula un asiento por contraasiento: crea uno nuevo con las líneas '
  'invertidas y marca el original. p_created_by es opcional y se propaga al '
  'contraasiento; sin él, crear_asiento resuelve el responsable como siempre.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · preview_gasto — el asiento de devengo, en vivo
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.preview_gasto(
  p_cat_gasto_id uuid,
  p_total        numeric
)
returns jsonb
language plpgsql
stable
as $function$
declare
  v_cuenta_codigo text;
  v_cuenta_nombre text;
  v_lineas        jsonb;
  v_total_debe    numeric(16,2);
  v_total_haber   numeric(16,2);
  v_prov_nombre   text;
begin
  if p_total is null or p_total <= 0 then
    raise exception 'El total del gasto debe ser positivo (se recibió %)', p_total;
  end if;

  select c.codigo, c.nombre
    into v_cuenta_codigo, v_cuenta_nombre
    from cat_gasto cg
    join cuenta c on c.id = cg.cuenta_id
   where cg.id = p_cat_gasto_id;

  if v_cuenta_codigo is null then
    raise exception 'La categoría de gasto % no existe o no tiene cuenta asociada', p_cat_gasto_id;
  end if;

  select nombre into v_prov_nombre from cuenta where codigo = 'PROVEEDORES';

  -- La clave es `nombre`, que es la que espera el componente AsientoPreview.
  -- Contrato para toda preview_* que venga.
  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', v_cuenta_codigo, 'nombre', v_cuenta_nombre, 'debe', p_total),
    jsonb_build_object('cuenta', 'PROVEEDORES',   'nombre', v_prov_nombre,   'haber', p_total)
  );

  -- Totales DERIVADOS de las líneas, y `balanceado` como comparación: si algún
  -- día las líneas no cuadran, el badge lo dice. preview_cobro devuelve la
  -- misma variable dos veces y un `true` literal — acá no.
  select
    coalesce(sum((l->>'debe')::numeric),  0),
    coalesce(sum((l->>'haber')::numeric), 0)
    into v_total_debe, v_total_haber
    from jsonb_array_elements(v_lineas) l;

  return jsonb_build_object(
    'lineas', v_lineas,
    'total_debe', v_total_debe,
    'total_haber', v_total_haber,
    'balanceado', v_total_debe = v_total_haber
  );
end $function$;

comment on function public.preview_gasto(uuid, numeric) is
  'Preview del asiento de devengo de un gasto. STABLE, solo lee. Devuelve el '
  'nombre de cuenta y los totales derivados de las líneas. Espeja registrar_gasto.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · registrar_gasto — carga el gasto y su asiento de devengo
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.registrar_gasto(
  p_cat_gasto_id   uuid,
  p_arancel        numeric,
  p_cantidad       numeric,
  p_devengado_at   date,
  p_concepto_id    uuid   default null,
  p_concepto_libre text   default null,
  p_torneo_id      uuid   default null,
  p_jornada_id     uuid   default null,
  p_predio_id      uuid   default null,
  p_activo_id      uuid   default null,
  p_created_by     uuid   default null
)
returns uuid
language plpgsql
as $function$
declare
  v_user_id       uuid;
  v_total         numeric(16,2);
  v_cuenta_codigo text;
  v_gasto_id      uuid;
  v_asiento_id    uuid;
  v_lineas        jsonb;
begin
  if p_arancel is null or p_arancel <= 0 then
    raise exception 'El arancel del gasto debe ser positivo (se recibió %)', p_arancel;
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad del gasto debe ser positiva (se recibió %)', p_cantidad;
  end if;

  if p_devengado_at is null then
    raise exception 'El gasto necesita fecha de devengado (cuándo se reconoce)';
  end if;

  if (p_concepto_id is null) = (p_concepto_libre is null) then
    raise exception 'El gasto necesita concepto_id (del catálogo) o concepto_libre (texto), exactamente uno.';
  end if;

  -- Responsable sin fallback a auth.users (decisión 89).
  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable del gasto: se requiere p_created_by o sesión autenticada.';
  end if;

  select c.codigo into v_cuenta_codigo
    from cat_gasto cg
    join cuenta c on c.id = cg.cuenta_id
   where cg.id = p_cat_gasto_id;

  if v_cuenta_codigo is null then
    raise exception 'La categoría de gasto % no existe o no tiene cuenta asociada', p_cat_gasto_id;
  end if;

  v_total := p_arancel * p_cantidad;

  -- `total` es columna generada (arancel * cantidad): no se inserta.
  -- El anclaje lo valida trg_gasto_coherente según la naturaleza de la
  -- categoría: por_fecha exige jornada, inversion exige activo, recurrente
  -- prohíbe torneo, eventual exige alguno de los tres.
  insert into gasto (
    cat_gasto_id, concepto_id, concepto_libre,
    torneo_id, jornada_id, predio_id, activo_id,
    arancel, cantidad, devengado_at
  ) values (
    p_cat_gasto_id, p_concepto_id, p_concepto_libre,
    p_torneo_id, p_jornada_id, p_predio_id, p_activo_id,
    p_arancel, p_cantidad, p_devengado_at
  ) returning id into v_gasto_id;

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', v_cuenta_codigo, 'debe', v_total),
    jsonb_build_object('cuenta', 'PROVEEDORES', 'haber', v_total)
  );

  v_asiento_id := crear_asiento(
    p_fecha       => p_devengado_at,
    p_origen      => 'gasto_devengo',
    p_descripcion => 'Devengo de gasto',
    p_lineas      => v_lineas,
    p_torneo_id   => p_torneo_id,
    p_jornada_id  => p_jornada_id,
    p_predio_id   => p_predio_id,
    p_origen_id   => v_gasto_id,
    p_created_by  => v_user_id
  );

  update gasto set asiento_dev_id = v_asiento_id where id = v_gasto_id;

  return v_gasto_id;
end $function$;

comment on function public.registrar_gasto(uuid, numeric, numeric, date, uuid, text, uuid, uuid, uuid, uuid, uuid) is
  'Carga un gasto y genera su asiento de devengo. No paga: pagado_at queda '
  'null y el pago lo hace pagar_gasto(). Exige responsable sin fallback y lo '
  'propaga al asiento.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · pagar_gasto — el asiento de pago
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.pagar_gasto(
  p_gasto_id    uuid,
  p_medio       text,
  p_pagado_at   date,
  p_predio_id   uuid default null,
  p_created_by  uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_user_id      uuid;
  v_total        numeric(16,2);
  v_pagado_at    date;
  v_torneo_id    uuid;
  v_jornada_id   uuid;
  v_gasto_predio uuid;
  v_predio_pago  uuid;
  v_cuenta_caja  text;
  v_asiento_id   uuid;
  v_lineas       jsonb;
begin
  select g.total, g.pagado_at, g.torneo_id, g.jornada_id, g.predio_id
    into v_total, v_pagado_at, v_torneo_id, v_jornada_id, v_gasto_predio
    from gasto g
   where g.id = p_gasto_id;

  if not found then
    raise exception 'El gasto % no existe', p_gasto_id;
  end if;

  if v_pagado_at is not null then
    raise exception 'El gasto % ya está pagado (el %). No se paga dos veces.', p_gasto_id, v_pagado_at;
  end if;

  if p_pagado_at is null then
    raise exception 'El pago necesita fecha (p_pagado_at)';
  end if;

  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable del pago: se requiere p_created_by o sesión autenticada.';
  end if;

  -- ── Caja de destino y regla del predio ─────────────────────────────────
  -- Mismo criterio que registrar_cobro, incluida la verificación de que el
  -- predio tenga caja: sin ella el asiento se crea pero el movimiento no
  -- aparece en v_saldo_caja, que joinea contra `caja`. Plata que sale del
  -- diario y de ningún cajón.
  if p_medio = 'efectivo' then
    -- Comodidad deliberada: si no se indica predio, se usa el del gasto.
    v_predio_pago := coalesce(p_predio_id, v_gasto_predio);

    if v_predio_pago is null then
      raise exception 'El pago en efectivo requiere predio (para saber de qué caja sale).';
    end if;

    if not exists (
      select 1 from caja k
       where k.tipo = 'efectivo' and k.activo and k.predio_id = v_predio_pago
    ) then
      raise exception
        'El predio % no tiene una caja de efectivo activa. Sin caja, el pago '
        'quedaría en el diario pero invisible en el saldo de caja.', v_predio_pago;
    end if;

    v_cuenta_caja := 'CAJA_EFECTIVO';
  else
    -- Rechaza en vez de silenciar: quien mandó predio con transferencia se
    -- equivocó, y tiene que enterarse.
    if p_predio_id is not null then
      raise exception 'Solo el efectivo lleva predio. % es una caja global.', p_medio;
    end if;

    v_predio_pago := null;

    if p_medio = 'transferencia' then
      v_cuenta_caja := 'CAJA_TRANSFERENCIA';
    elsif p_medio = 'cheque' then
      v_cuenta_caja := 'VALORES_A_DEPOSITAR';
    else
      raise exception
        'Medio de pago inválido: "%". Los válidos son efectivo, transferencia y cheque.', p_medio;
    end if;
  end if;

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', 'PROVEEDORES', 'debe', v_total),
    jsonb_build_object('cuenta', v_cuenta_caja, 'haber', v_total)
  );

  v_asiento_id := crear_asiento(
    p_fecha       => p_pagado_at,
    p_origen      => 'gasto_pago',
    p_descripcion => 'Pago de gasto',
    p_lineas      => v_lineas,
    p_torneo_id   => v_torneo_id,
    p_jornada_id  => v_jornada_id,
    p_predio_id   => v_predio_pago,
    p_origen_id   => p_gasto_id,
    p_created_by  => v_user_id
  );

  update gasto
     set pagado_at = p_pagado_at,
         medio_pago = p_medio,
         asiento_pag_id = v_asiento_id
   where id = p_gasto_id;

  return v_asiento_id;
end $function$;

comment on function public.pagar_gasto(uuid, text, date, uuid, uuid) is
  'Paga un gasto ya devengado: PROVEEDORES al debe, caja al haber. Verifica '
  'que el predio tenga caja de efectivo activa. Falla si ya está pagado. '
  'Exige responsable sin fallback y lo propaga al asiento.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · preview_pago_gasto — el asiento de pago, en vivo
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.preview_pago_gasto(
  p_gasto_id uuid,
  p_medio    text
)
returns jsonb
language plpgsql
stable
as $function$
declare
  v_total        numeric(16,2);
  v_pagado_at    date;
  v_cuenta_caja  text;
  v_caja_nombre  text;
  v_prov_nombre  text;
  v_lineas       jsonb;
  v_total_debe   numeric(16,2);
  v_total_haber  numeric(16,2);
begin
  select g.total, g.pagado_at
    into v_total, v_pagado_at
    from gasto g
   where g.id = p_gasto_id;

  if not found then
    raise exception 'El gasto % no existe', p_gasto_id;
  end if;

  if v_pagado_at is not null then
    raise exception 'El gasto % ya está pagado (el %)', p_gasto_id, v_pagado_at;
  end if;

  v_cuenta_caja := case p_medio
                     when 'efectivo'      then 'CAJA_EFECTIVO'
                     when 'transferencia' then 'CAJA_TRANSFERENCIA'
                     when 'cheque'        then 'VALORES_A_DEPOSITAR'
                   end;

  if v_cuenta_caja is null then
    raise exception 'Medio de pago inválido: "%". Los válidos son efectivo, transferencia y cheque.', p_medio;
  end if;

  select nombre into v_prov_nombre from cuenta where codigo = 'PROVEEDORES';
  select nombre into v_caja_nombre from cuenta where codigo = v_cuenta_caja;

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', 'PROVEEDORES', 'nombre', v_prov_nombre, 'debe', v_total),
    jsonb_build_object('cuenta', v_cuenta_caja, 'nombre', v_caja_nombre, 'haber', v_total)
  );

  select
    coalesce(sum((l->>'debe')::numeric),  0),
    coalesce(sum((l->>'haber')::numeric), 0)
    into v_total_debe, v_total_haber
    from jsonb_array_elements(v_lineas) l;

  return jsonb_build_object(
    'lineas', v_lineas,
    'total_debe', v_total_debe,
    'total_haber', v_total_haber,
    'balanceado', v_total_debe = v_total_haber
  );
end $function$;

comment on function public.preview_pago_gasto(uuid, text) is
  'Preview del asiento de pago de un gasto (PROVEEDORES al debe, caja al '
  'haber). STABLE. Devuelve nombre de cuenta y totales derivados. Espeja '
  'pagar_gasto.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 5 · anular_gasto — da de baja el gasto entero
--
-- Contraasienta PAGO primero y DEVENGO después —orden inverso al de creación—
-- y limpia pagado_at, medio_pago y asiento_pag_id. Así nunca queda un
-- pagado_at huérfano sin su asiento: ése era el caso espejo anotado en
-- decisiones.md.
--
-- No limpia asiento_dev_id a propósito: el asiento de devengo sigue existiendo,
-- anulado, y v_gasto_detalle lee su `anulado_por` para mostrar el gasto como
-- 'anulado'. Borrar el vínculo sería perder el rastro.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.anular_gasto(
  p_gasto_id   uuid,
  p_motivo     text,
  p_fecha      date default current_date,
  p_created_by uuid default null
)
returns void
language plpgsql
as $function$
declare
  v_user_id      uuid;
  v_asiento_dev  uuid;
  v_asiento_pag  uuid;
  v_pagado_at    date;
  v_dev_anulado  uuid;
begin
  select g.asiento_dev_id, g.asiento_pag_id, g.pagado_at, adev.anulado_por
    into v_asiento_dev, v_asiento_pag, v_pagado_at, v_dev_anulado
    from gasto g
    left join asiento adev on adev.id = g.asiento_dev_id
   where g.id = p_gasto_id;

  if not found then
    raise exception 'El gasto % no existe', p_gasto_id;
  end if;

  if v_dev_anulado is not null then
    raise exception 'El gasto % ya está anulado', p_gasto_id;
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'La anulación necesita un motivo';
  end if;

  -- Mismo criterio que las otras dos puertas: sin responsable no se escribe.
  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception 'Falta responsable de la anulación: se requiere p_created_by o sesión autenticada.';
  end if;

  -- Un gasto sin asiento de devengo no se puede anular por esta vía: no
  -- habría qué contraasentar, y marcarlo igual dejaría un gasto que la vista
  -- sigue mostrando como vigente. Se avisa en vez de fingir que se hizo.
  if v_asiento_dev is null then
    raise exception
      'El gasto % no tiene asiento de devengo, así que no hay qué '
      'contraasentar. Si se cargó por fuera de registrar_gasto, revisalo a mano.',
      p_gasto_id;
  end if;

  if v_pagado_at is not null then
    if v_asiento_pag is not null then
      perform anular_asiento(
        v_asiento_pag, 'Anulación de gasto (pago) · ' || p_motivo, p_fecha, v_user_id);
    end if;

    update gasto
       set pagado_at = null, medio_pago = null, asiento_pag_id = null
     where id = p_gasto_id;
  end if;

  perform anular_asiento(
    v_asiento_dev, 'Anulación de gasto (devengo) · ' || p_motivo, p_fecha, v_user_id);
end $function$;

comment on function public.anular_gasto(uuid, text, date, uuid) is
  'Anula un gasto entero: contraasienta el pago (si estaba pagado) y después '
  'el devengo, y limpia pagado_at/medio_pago/asiento_pag_id. Resuelve el caso '
  'espejo. Falla si ya está anulado o si no hay asiento de devengo. Exige '
  'responsable sin fallback y lo propaga a los contraasientos.';
