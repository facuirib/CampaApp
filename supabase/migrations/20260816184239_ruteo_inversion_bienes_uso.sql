-- ═══════════════════════════════════════════════════════════════════════════
-- Ruteo de la cuenta del devengo · una inversión se activa, no se gasta
--
-- ⚠️ PROPUESTA · NO APLICADA. El nombre del archivo se define al aplicar, con
-- la versión que registre la herramienta (regla del README).
--
-- ── El bug ─────────────────────────────────────────────────────────────────
--
-- `registrar_gasto` resuelve la cuenta del devengo desde `cat_gasto.cuenta_id`
-- **sin mirar la naturaleza**. La única categoría `inversion` que existe
-- —Equipamiento— apunta a `GAS_PREDIO`, una cuenta de egreso. Resultado: la
-- compra de la Desmalezadora ($1.450.000) se asentó
--
--     GAS_PREDIO   debe   1.450.000
--       PROVEEDORES      haber  1.450.000
--
-- y **tocó el resultado entero en agosto**. Debía ir a `BIENES_USO`:
-- `arquitectura.md` §3.11 es explícito — «La compra no toca el resultado:
-- cambia un activo por otro. Lo que impacta el P&L es la cuota mensual».
--
-- `BIENES_USO`, `AMORT_ACUM` y `GAS_AMORT` están en el plan de cuentas con
-- **cero movimientos**, esperando este circuito.
--
-- ── Por qué en la función y no en el dato ──────────────────────────────────
--
-- La alternativa era repuntar `cat_gasto.cuenta_id` de Equipamiento a
-- `BIENES_USO`. Se descartó por dos razones:
--
--   · **Tapa este caso y sólo este.** La próxima categoría `inversion` que se
--     cree vuelve a nacer rota, porque nada obliga a apuntarla a BIENES_USO.
--   · **Rompe el significado de la columna.** `cat_gasto.cuenta_id` pasaría a
--     ser cuenta de gasto en 31 categorías y cuenta de activo en una, sin nada
--     que lo indique.
--
-- «Una inversión se activa» es una **regla contable**, no un atributo de una
-- categoría. Vive en la puerta, no en el catálogo.
--
-- ── Se tocan DOS funciones ─────────────────────────────────────────────────
--
-- `registrar_gasto` y `preview_gasto` **duplican la misma resolución de
-- cuenta**. Cambiar sólo la primera dejaría el preview mostrando `GAS_PREDIO`
-- mientras el asiento real va a `BIENES_USO` — y el preview existe justo para
-- que el operador vea lo que se va a asentar.
--
-- `preview_gasto` **no cambia de firma**: la naturaleza sale de `cat_gasto`.
--
-- **No se tocan** `pagar_gasto` —sus líneas son `PROVEEDORES / caja`,
-- independientes de la cuenta del devengo— ni `anular_gasto`, que delega en
-- `anular_asiento` y **invierte las líneas existentes** en vez de
-- reconstruirlas.
--
-- ── Cómo se garantiza que el camino viejo no cambia ────────────────────────
--
-- **La consulta de hoy no se bifurca: se ejecuta igual, siempre.** Sólo se le
-- agrega `cg.naturaleza` a la lista del select, y *después* —una vez pasada la
-- validación de null, tal cual está hoy— se sobrescribe la cuenta si la
-- naturaleza es `inversion`.
--
-- Es más fuerte que un `if/else` con la consulta repetida en la rama `else`:
-- ahí habría dos copias que pueden divergir. Acá **hay una sola consulta y es
-- la misma**, así que para las 31 categorías no-inversión el camino no es
-- «idéntico», es literalmente el mismo código.
--
-- Todo lo demás de las dos funciones queda sin tocar: validaciones, el insert,
-- `crear_asiento`, los totales derivados del preview.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1 · registrar_gasto ────────────────────────────────────────────────────

create or replace function public.registrar_gasto(
  p_cat_gasto_id  uuid,
  p_arancel       numeric,
  p_cantidad      numeric,
  p_devengado_at  date,
  p_concepto_id   uuid default null,
  p_concepto_libre text default null,
  p_torneo_id     uuid default null,
  p_jornada_id    uuid default null,
  p_predio_id     uuid default null,
  p_activo_id     uuid default null,
  p_created_by    uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_user_id       uuid;
  v_total         numeric(16,2);
  v_cuenta_codigo text;
  v_naturaleza    text;   -- NUEVO: para decidir si se activa
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

  -- La consulta de siempre. Lo ÚNICO que cambia es que además trae la
  -- naturaleza, para no hacer una segunda vuelta a la misma fila.
  select c.codigo, cg.naturaleza into v_cuenta_codigo, v_naturaleza
    from cat_gasto cg
    join cuenta c on c.id = cg.cuenta_id
   where cg.id = p_cat_gasto_id;

  if v_cuenta_codigo is null then
    raise exception 'La categoría de gasto % no existe o no tiene cuenta asociada', p_cat_gasto_id;
  end if;

  -- Una inversión no es gasto del período: se activa. El asiento cambia un
  -- activo (caja futura, vía Proveedores) por otro activo (el bien), y por eso
  -- NO toca el resultado. Lo que impacta el P&L es la amortización mensual
  -- (arquitectura.md §3.11).
  --
  -- Va después del chequeo de null a propósito: una categoría sin cuenta tiene
  -- que seguir fallando igual que antes, sea cual sea su naturaleza.
  if v_naturaleza = 'inversion' then
    v_cuenta_codigo := 'BIENES_USO';
  end if;

  v_total := p_arancel * p_cantidad;

  -- `total` es columna generada: no se inserta. El anclaje lo valida
  -- trg_gasto_coherente según la naturaleza de la categoría.
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
  'propaga al asiento. Las categorías de naturaleza `inversion` se activan '
  'contra BIENES_USO en vez de imputarse a resultado.';


-- ── 2 · preview_gasto ──────────────────────────────────────────────────────
-- Misma bifurcación, para que el preview no mienta. Sin cambio de firma.

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
  v_naturaleza    text;   -- NUEVO: para decidir si se activa
  v_lineas        jsonb;
  v_total_debe    numeric(16,2);
  v_total_haber   numeric(16,2);
  v_prov_nombre   text;
begin
  if p_total is null or p_total <= 0 then
    raise exception 'El total del gasto debe ser positivo (se recibió %)', p_total;
  end if;

  -- La consulta de siempre, más la naturaleza.
  select c.codigo, c.nombre, cg.naturaleza
    into v_cuenta_codigo, v_cuenta_nombre, v_naturaleza
    from cat_gasto cg
    join cuenta c on c.id = cg.cuenta_id
   where cg.id = p_cat_gasto_id;

  if v_cuenta_codigo is null then
    raise exception 'La categoría de gasto % no existe o no tiene cuenta asociada', p_cat_gasto_id;
  end if;

  -- Espeja a registrar_gasto: si no, el operador aprueba un asiento contra
  -- GAS_* y se registra otro contra BIENES_USO.
  if v_naturaleza = 'inversion' then
    select codigo, nombre into v_cuenta_codigo, v_cuenta_nombre
      from cuenta where codigo = 'BIENES_USO';

    if v_cuenta_codigo is null then
      raise exception
        'Falta la cuenta BIENES_USO en el plan de cuentas: no se puede '
        'previsualizar la activación de una inversión.';
    end if;
  end if;

  select nombre into v_prov_nombre from cuenta where codigo = 'PROVEEDORES';

  -- La clave es `nombre`, que es la que espera AsientoPreview. Contrato para
  -- toda preview_* que venga.
  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', v_cuenta_codigo, 'nombre', v_cuenta_nombre, 'debe', p_total),
    jsonb_build_object('cuenta', 'PROVEEDORES',   'nombre', v_prov_nombre,   'haber', p_total)
  );

  -- Totales DERIVADOS de las líneas y `balanceado` como comparación real.
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
  'Previsualiza el asiento de devengo de un gasto sin escribir nada. Espeja el '
  'ruteo de registrar_gasto: naturaleza `inversion` se previsualiza contra '
  'BIENES_USO.';
