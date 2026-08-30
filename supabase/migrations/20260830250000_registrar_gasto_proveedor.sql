-- ═══════════════════════════════════════════════════════════════════════════
-- registrar_gasto + proveedor_id
-- APLICADA el 30/08/2026.
--
-- `gasto.proveedor_id` existe desde 20260830160000_proveedor.sql, pero
-- quedó sin puerta: `registrar_gasto` no lo recibía, así que no había forma
-- de cargarlo al crear un gasto. Parámetro nuevo, aditivo, AL FINAL de la
-- firma (default null) — los llamadores existentes, que llaman por nombre,
-- no cambian.
--
-- El `drop` va primero, y no es prolijidad: un `create or replace` que
-- AGREGA un parámetro no reemplaza la función vieja, crea una sobrecarga —
-- la de 11 argumentos conviviendo con la de 12 — y las llamadas quedan
-- ambiguas. Es el mismo error que se coló en `arca_ticket_por_ambiente` la
-- primera vez que se aplicó (quedó registrado en esa migración). Apunta a
-- la firma que hoy tiene producción.
--
-- Verificado contra la base real (30/08) que el cuerpo de acá coincide con
-- el aplicado: se llamó registrar_gasto con p_arancel=-1 y devolvió
-- exactamente "El arancel del gasto debe ser positivo (se recibió -1)",
-- el mismo texto que este archivo. El resto del cuerpo es transcripción
-- literal de 20260816184239_ruteo_inversion_bienes_uso.sql, con dos
-- agregados: el parámetro nuevo y su columna en el insert.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.registrar_gasto(uuid, numeric, numeric, date, uuid, text, uuid, uuid, uuid, uuid, uuid);

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
  p_created_by    uuid default null,
  p_proveedor_id  uuid default null
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
    torneo_id, jornada_id, predio_id, activo_id, proveedor_id,
    arancel, cantidad, devengado_at
  ) values (
    p_cat_gasto_id, p_concepto_id, p_concepto_libre,
    p_torneo_id, p_jornada_id, p_predio_id, p_activo_id, p_proveedor_id,
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

comment on function public.registrar_gasto(uuid, numeric, numeric, date, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid) is
  'Carga un gasto y genera su asiento de devengo. No paga: pagado_at queda '
  'null y el pago lo hace pagar_gasto(). Exige responsable sin fallback y lo '
  'propaga al asiento. Las categorías de naturaleza `inversion` se activan '
  'contra BIENES_USO en vez de imputarse a resultado. proveedor_id es '
  'opcional: a quién se le paga, cuando se sabe al cargar.';
