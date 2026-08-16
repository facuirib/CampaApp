-- ═══════════════════════════════════════════════════════════════════════════
-- Eslabón cheque emitido · nace al pagar un gasto con cheque
--
-- ⚠️ PROPUESTA · NO APLICADA.
--
-- ── Tres problemas del mismo circuito, que se arreglan juntos ──────────────
--
-- Nada creaba cheques emitidos: el único `insert into cheque` del repo es el de
-- `registrar_cobro`, y siempre pone `'recibido'`. Es el espejo del hueco que
-- tenía el lado de cobros antes del eslabón. Pero además había dos cosas rotas
-- esperando al primer uso:
--
-- **1 · La cuenta.** `pagar_gasto` con `medio = 'cheque'` acreditaba
-- `VALORES_A_DEPOSITAR`, que es la cuenta de cheques RECIBIDOS —un activo—.
-- Acreditarla la dejaba negativa, y no conectaba con el `CHEQUES_A_PAGAR` que
-- `cambiar_estado_cheque` debita al debitarse el cheque: las dos puntas del
-- circuito no se tocaban.
--
-- **2 · El check de la tabla.** `gasto_medio_pago_check` sólo admitía
-- `efectivo` y `transferencia`, mientras `pagar_gasto` validaba también
-- `cheque`. O sea que pagar un gasto con cheque **fallaba siempre**, en el
-- `update gasto`, después de haber creado el asiento. `pago` ya tenía los tres
-- valores; esto empareja `gasto` con él.
--
-- Ninguno se había notado porque hay 0 gastos pagados con cheque.
--
-- ── El circuito ────────────────────────────────────────────────────────────
--
--   devengo    GAS_x            debe / PROVEEDORES      haber   (ya existía)
--   emisión    PROVEEDORES      debe / CHEQUES_A_PAGAR  haber   ← esto
--   debitado   CHEQUES_A_PAGAR  debe / caja             haber   (ya existía)
--
-- Los dos pasivos se cancelan contra sí mismos: el neto es `GAS_x / caja`.
-- Emitir un cheque **cambia una deuda por otra**; la plata sale recién cuando el
-- banco lo debita.
--
-- ── La columna nueva, y la que NO se agrega ────────────────────────────────
--
-- `gasto_id` es el espejo de `pago_id`: qué gasto pagó este cheque. Sirve para
-- que, el día que se construya el rechazo de un emitido, se sepa qué gasto
-- vuelve a deberse.
--
-- Va con **`on delete set null`** y no `NO ACTION`. `cheque_pago_id_fkey` quedó
-- NO ACTION y eso es lo que impidió borrar el pago al resolver el rechazo de
-- cobros; acá se evita de entrada.
--
-- **No se agrega una `fecha_debito_esperada`.** La fecha de débito de un cheque
-- diferido va en `fecha_cobro`, que ya existe y es NOT NULL: es el mismo hecho
-- visto de los dos lados —para un recibido, cuándo entra la plata; para un
-- emitido, cuándo sale—. Y es la que **`v_cashflow_comprometido` ya lee** para
-- proyectar, con el signo invertido por `sentido`. Una columna aparte guardaría
-- el mismo dato dos veces y obligaría a tocar esa vista.
--
-- ── Lo que NO cambia ───────────────────────────────────────────────────────
--
-- La rama de pago normal —efectivo y transferencia— queda **idéntica**: los tres
-- parámetros nuevos van al final con default null, y todo lo agregado está
-- dentro de `if p_medio = 'cheque'`.
--
-- El fix de errores de Horacio vive en el front (`app/gastos/…`), no en esta
-- función. Y juega a favor: gracias a él los `raise exception` propios llegan
-- crudos al operador en vez de caer en el fallback genérico, así que el mensaje
-- nuevo se va a leer bien.
--
-- `crear_asiento` sólo se llama, no se modifica.
-- ═══════════════════════════════════════════════════════════════════════════


-- 1 · El check, emparejado con el de `pago`. Aditivo: no invalida ninguna fila
--     existente (hoy hay 0 gastos con medio_pago = 'cheque', justamente porque
--     el check lo impedía).
alter table gasto drop constraint gasto_medio_pago_check;
alter table gasto add constraint gasto_medio_pago_check
  check (medio_pago = any (array['efectivo'::text, 'transferencia'::text, 'cheque'::text]));


-- 2 · El vínculo, espejo de pago_id.
alter table cheque add column if not exists gasto_id uuid
  references gasto(id) on delete set null;

comment on column cheque.gasto_id is
  'El gasto que este cheque emitido pagó. Espejo de pago_id del lado de cobros: '
  'es lo que permitiría, si el banco no paga el cheque, saber qué gasto vuelve a '
  'deberse. Nulo en cheques recibidos.';


-- 3 · La función. La firma cambia (3 params nuevos), así que sin el drop
--     quedaría una sobrecarga de 5 argumentos conviviendo con la de 8.
drop function if exists pagar_gasto(uuid, text, date, uuid, uuid);

create or replace function public.pagar_gasto(
  p_gasto_id   uuid,
  p_medio      text,
  p_pagado_at  date,
  p_predio_id  uuid default null,
  p_created_by uuid default null,
  -- ── El eslabón del cheque emitido ────────────────────────────────────────
  -- Al final y con default null: la firma es aditiva y el pago normal no cambia.
  p_cheque_numero  text default null,
  p_cheque_banco   text default null,
  p_cheque_debito  date default null
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

  -- El medio se valida ANTES que el predio, como en registrar_cobro.
  if p_medio not in ('efectivo', 'transferencia', 'cheque') then
    raise exception
      'Medio de pago inválido: "%". Los válidos son efectivo, transferencia y cheque.', p_medio;
  end if;

  -- Un cheque sin número, banco y fecha de débito es un cheque que después no se
  -- puede seguir: no se sabe cuál se debitó, ni cuándo esperar que salga la
  -- plata. Se exige al pagar, que es cuando alguien tiene la chequera delante.
  if p_medio = 'cheque' then
    if p_cheque_numero is null or p_cheque_banco is null or p_cheque_debito is null then
      raise exception
        'Un pago con cheque necesita número, banco y fecha de débito esperada: '
        'sin esos datos no se puede seguir el cheque ni proyectar cuándo sale la plata.';
    end if;
  end if;

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
        'El predio % no tiene una caja de efectivo activa. Sin caja, el pago quedaría en el diario pero invisible en el saldo de caja.', v_predio_pago;
    end if;

    v_cuenta_caja := 'CAJA_EFECTIVO';
  else
    if p_predio_id is not null then
      raise exception 'Solo el efectivo lleva predio. % es una caja global.', p_medio;
    end if;

    v_predio_pago := null;

    -- CHEQUES_A_PAGAR y no VALORES_A_DEPOSITAR: emitir un cheque cambia una
    -- deuda por otra. VALORES_A_DEPOSITAR es de cheques RECIBIDOS, y acreditarla
    -- acá la dejaba negativa. Además es la cuenta que cambiar_estado_cheque
    -- debita al debitarse el cheque: así las dos puntas conectan.
    v_cuenta_caja := case p_medio
                       when 'transferencia' then 'CAJA_TRANSFERENCIA'
                       when 'cheque'        then 'CHEQUES_A_PAGAR'
                     end;
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

  -- ── El alta del cheque ───────────────────────────────────────────────────
  -- `fecha_emision` es cuándo se entregó (la fecha del pago) y `fecha_cobro`
  -- cuándo se espera que el banco lo debite: es la que lee
  -- v_cashflow_comprometido para proyectar el egreso.
  --
  -- `tercero_id` queda NULL: `gasto` no registra a quién se le paga. Es una
  -- limitación del modelo de gastos, no de este eslabón — el cashflow cae al
  -- fallback 'Cheque <numero>'.
  if p_medio = 'cheque' then
    insert into cheque (
      sentido, numero, banco, fecha_emision, fecha_cobro,
      monto, estado, gasto_id, asiento_alta_id
    ) values (
      'emitido', p_cheque_numero, p_cheque_banco, p_pagado_at, p_cheque_debito,
      v_total, 'pendiente', p_gasto_id, v_asiento_id
    );
  end if;

  return v_asiento_id;
end $function$;

comment on function public.pagar_gasto(uuid, text, date, uuid, uuid, text, text, date) is
  'Paga un gasto y genera su asiento. Con medio=cheque exige número, banco y '
  'fecha de débito, acredita CHEQUES_A_PAGAR en vez de una caja —la plata sale '
  'cuando el banco lo debita— y da de alta la fila en `cheque` con sentido '
  'emitido, vinculada por gasto_id. El cheque emitido pendiente se proyecta solo '
  'como egreso futuro en v_cashflow_comprometido, por su fecha_cobro.';
