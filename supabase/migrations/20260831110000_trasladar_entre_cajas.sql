-- ═══════════════════════════════════════════════════════════════════════════
-- CAJA · traslados entre cajas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Mover plata de una caja a otra —de la central a transferencia para pagar
-- proveedores, del efectivo del predio a la central— no tenía función: se hacía
-- con dos asientos a mano, o no se hacía.
--
-- ── Un asiento de dos líneas ───────────────────────────────────────────────
--
-- Destino al debe, origen al haber, el mismo monto. **Imposible de descuadrar
-- por construcción**, y `crear_asiento` lo valida igual. Dos asientos separados
-- —uno que saca y otro que pone— habrían dejado la puerta abierta a que el
-- segundo falle y la plata quede en el limbo.
--
-- ── 🔴 El predio, que es la parte delicada ─────────────────────────────────
--
-- `crear_asiento` exige `predio_id` ante cualquier línea de CAJA_EFECTIVO, y un
-- asiento tiene UN predio. Con las dos cajas en efectivo y en predios distintos
-- el asiento tendría que declarar dos, y no puede.
--
-- No se resuelve inventando una excepción: **la plata no viaja de un predio al
-- otro por arte de magia.** Físicamente son dos movimientos —sale de un predio,
-- llega a central, va al otro— y el arqueo de cada predio tiene que poder
-- cuadrar por separado. Ese circuito ya existe y es `registrar_entrega_central`;
-- el mensaje de error manda ahí.
--
-- Para los casos permitidos, el predio del asiento es el de la caja que lo
-- tenga: con las dos en el mismo predio es ése, con una sola es la que tiene.
--
-- ── Saldo suficiente ───────────────────────────────────────────────────────
--
-- Trasladar plata que no está deja la caja en rojo, y una caja en rojo no
-- significa nada: es plata que no existe. Se lee de `v_saldo_caja`, la misma
-- fuente que muestra la pantalla.
--
-- ── El rol ─────────────────────────────────────────────────────────────────
--
-- admin, finanzas y **operador**: es tesorería del día a día —mover plata entre
-- cajas propias del club— y no plata de los dueños. La guarda va adentro porque
-- por RLS `asiento` alcanza también a `bar`, que no tiene por qué mover cajas.
-- ═══════════════════════════════════════════════════════════════════════════

-- El traslado es un origen propio. Reusar 'ajuste' habría sido más barato y
-- habría mentido: un ajuste corrige un error, un traslado mueve plata que está
-- bien donde está. Con los dos bajo la misma etiqueta, el día que alguien
-- filtre el diario por ajustes para revisar correcciones se encuentra con todos
-- los movimientos de tesorería.
--
-- Ensanchar un check es aditivo: ninguna fila existente puede volverse inválida.
alter table public.asiento drop constraint asiento_origen_check;

alter table public.asiento add constraint asiento_origen_check
  check (origen = any (array[
    'devengo_equipo', 'pago_equipo', 'gasto_devengo', 'gasto_pago',
    'bar', 'arqueo', 'sponsor', 'socio', 'usd', 'amortizacion',
    'cheque', 'fondo', 'ajuste', 'apertura',
    'traslado'
  ]));

create or replace function public.trasladar_entre_cajas(
  p_origen_id  uuid,
  p_destino_id uuid,
  p_monto      numeric,
  p_fecha      date default null,
  p_motivo     text default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_o      record;
  v_d      record;
  v_fecha  date := coalesce(p_fecha, current_date);
  v_predio uuid;
  v_saldo  numeric;
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas', 'operador'])) then
    raise exception
      'Trasladar entre cajas es de administración, finanzas u operación. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del traslado debe ser positivo (se recibió %).', p_monto;
  end if;

  if p_origen_id = p_destino_id then
    raise exception 'El origen y el destino son la misma caja.';
  end if;

  select cj.*, c.codigo into v_o from caja cj join cuenta c on c.id = cj.cuenta_id where cj.id = p_origen_id;
  if not found then raise exception 'La caja de origen no existe.'; end if;
  if not v_o.activo then raise exception 'La caja «%» está dada de baja.', v_o.nombre; end if;

  select cj.*, c.codigo into v_d from caja cj join cuenta c on c.id = cj.cuenta_id where cj.id = p_destino_id;
  if not found then raise exception 'La caja de destino no existe.'; end if;
  if not v_d.activo then raise exception 'La caja «%» está dada de baja.', v_d.nombre; end if;

  -- Ver el header: efectivo entre predios distintos son DOS movimientos y van
  -- por `registrar_entrega_central`.
  if v_o.predio_id is not null and v_d.predio_id is not null
     and v_o.predio_id <> v_d.predio_id then
    raise exception
      'No se puede trasladar efectivo directo entre dos predios: «%» y «%». '
      'La plata pasa por la caja central — usá la entrega a central.',
      v_o.nombre, v_d.nombre;
  end if;

  v_predio := coalesce(v_o.predio_id, v_d.predio_id);

  select saldo into v_saldo from v_saldo_caja where caja_id = p_origen_id;
  if coalesce(v_saldo, 0) < p_monto then
    raise exception
      'La caja «%» tiene % y se quieren trasladar %.',
      v_o.nombre, coalesce(v_saldo, 0), p_monto;
  end if;

  return crear_asiento(
    v_fecha,
    'traslado',
    'Traslado ' || v_o.nombre || ' → ' || v_d.nombre ||
      coalesce(' · ' || nullif(btrim(p_motivo), ''), ''),
    jsonb_build_array(
      jsonb_build_object('cuenta', v_d.codigo, 'debe',  p_monto),
      jsonb_build_object('cuenta', v_o.codigo, 'haber', p_monto)
    ),
    null, null, v_predio, null, p_created_by
  );
end;
$$;

comment on function public.trasladar_entre_cajas(uuid, uuid, numeric, date, text, uuid) is
  'Mueve plata de una caja a otra con UN asiento de dos líneas: destino al debe, '
  'origen al haber. Valida cajas activas, distintas, monto positivo y saldo '
  'suficiente en el origen. NO permite efectivo directo entre predios distintos: '
  'eso son dos movimientos y va por registrar_entrega_central.';
