-- ═══════════════════════════════════════════════════════════════════════════
-- registrar_movimiento_fondo · el caso 4 del bloque 8
--
-- ⚠️ PROPUESTA · NO APLICADA. El archivo se renombra al aplicar.
--
-- ── De dónde sale ──────────────────────────────────────────────────────────
--
-- Es la función de Horacio, **extraída tal cual** de
-- `20260812210000_bloque8_funciones_fondo_cheque.sql` (rama
-- `feat/bloque8-funciones-propuesta`). No se le cambió una línea de lógica:
-- Facu la aprobó así en la revisión del 14/08 —caso 4, colocación y rescate—.
--
-- **Se extrae porque ese archivo traía DOS funciones**, y la otra era la
-- `cambiar_estado_cheque` con la caja hardcodeada a CAJA_TRANSFERENCIA, que es
-- justo lo que la revisión rechazó. Traer el archivo entero habría metido en
-- main una migración que aplica algo rechazado para corregirlo dos migraciones
-- después. La versión buena de `cambiar_estado_cheque` —con caja elegible—
-- entra por su propia migración, la de `feat/bloque8-caja-elegible`.
--
-- ── Los asientos (decisión 22, §3.15) ──────────────────────────────────────
--
-- | Movimiento  | Debe              | Haber             |
-- |-------------|-------------------|-------------------|
-- | colocación  | `FONDO_INVERSION` | la caja elegida   |
-- | rescate     | la caja elegida   | `FONDO_INVERSION` |
--
-- **La caja sale de `p_caja_id`, no está hardcodeada** — es el patrón que la
-- revisión pidió para los casos 1 y 3, y que esta función ya traía bien.
--
-- Ninguno de los dos toca el resultado: mueven plata entre dos activos. El
-- saldo del fondo se deriva del diario —colocaciones menos rescates— y por eso
-- no hay columna de saldo que mantener: la decisión 22 rechaza un saldo
-- mantenido a mano, no uno recalculado.
--
-- `torneo_id` es opcional y llega a `crear_asiento`: un rescate puede o no ser
-- imputable a un torneo.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.registrar_movimiento_fondo(
  p_tipo text, p_monto numeric, p_caja_id uuid, p_motivo text,
  p_fecha date default null, p_torneo_id uuid default null, p_responsable_id uuid default null
) returns uuid language plpgsql as $function$
declare v_fecha date; v_cuenta_caja text; v_lineas jsonb; v_asiento uuid; v_id uuid;
begin
  if p_tipo not in ('rescate','colocacion') then raise exception 'Tipo inválido: %', p_tipo; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser positivo (recibido: %)', p_monto; end if;
  select cu.codigo into v_cuenta_caja from caja c join cuenta cu on cu.id = c.cuenta_id where c.id = p_caja_id;
  if not found then raise exception 'La caja % no existe o no tiene cuenta asociada', p_caja_id; end if;
  v_fecha := coalesce(p_fecha, current_date);
  if p_tipo = 'colocacion' then
    v_lineas := jsonb_build_array(
      jsonb_build_object('cuenta','FONDO_INVERSION','debe',p_monto),
      jsonb_build_object('cuenta',v_cuenta_caja,'haber',p_monto));
  else
    v_lineas := jsonb_build_array(
      jsonb_build_object('cuenta',v_cuenta_caja,'debe',p_monto),
      jsonb_build_object('cuenta','FONDO_INVERSION','haber',p_monto));
  end if;
  v_asiento := crear_asiento(v_fecha,'fondo','Fondo · '||p_tipo||coalesce(' · '||p_motivo,''),v_lineas,p_torneo_id,null,null,null,p_responsable_id);
  insert into movimiento_fondo (fecha,tipo,monto,caja_id,motivo,asiento_id,created_by,torneo_id)
  values (v_fecha,p_tipo,p_monto,p_caja_id,p_motivo,v_asiento,p_responsable_id,p_torneo_id) returning id into v_id;
  return v_id;
end; $function$;

comment on function public.registrar_movimiento_fondo(text, numeric, uuid, text, date, uuid, uuid) is
  'Colocación y rescate del fondo de inversión (decisión 22). Mueve plata entre '
  'dos activos: no toca el resultado. La caja es elegible por p_caja_id. El '
  'saldo del fondo se deriva del diario, no se mantiene.';
