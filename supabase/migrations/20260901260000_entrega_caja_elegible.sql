-- ─────────────────────────────────────────────────────────────────────────────
-- La entrega del arqueo elige caja destino, y deja comentario
--
-- Ola 4, E3.
--
-- ── Qué estaba fijo ────────────────────────────────────────────────────────
--
-- `registrar_entrega_central` tenía CAJA_CENTRAL escrita adentro. En la
-- práctica el efectivo del cajón no siempre va a la central: puede depositarse,
-- ir a Mercado Pago, o quedar en otra caja de la empresa. Y no había dónde
-- anotar por qué.
--
-- ── Aditivo: el default es el de siempre ───────────────────────────────────
--
-- `p_caja_destino_id` en null resuelve a CAJA_CENTRAL, así que todo lo que ya
-- llamaba a la función se comporta exactamente igual. El nombre de la función
-- se conserva por lo mismo, aunque ya no sea sólo «a central»: renombrarla
-- obligaría a tocar el catálogo de permisos y las pantallas para no ganar nada.
--
-- ── 🔴 El freno: no se entrega a efectivo de OTRO predio ───────────────────
--
-- Es el mismo de `trasladar_entre_cajas`, y por la misma razón. Mover efectivo
-- entre predios es un traslado físico: alguien lleva los billetes en la mano.
-- Registrarlo como una entrega dejaría la plata contablemente en un predio y
-- físicamente en otro, y el arqueo del día siguiente no cerraría en ninguno de
-- los dos. Para eso está el circuito de efectivo en tránsito.
--
-- Entregar al MISMO predio sí se permite —del cajón del torneo a la caja de
-- efectivo de ese predio— porque ahí los billetes no se mueven de lugar.
--
-- ── Por qué drop y no replace ──────────────────────────────────────────────
-- Se agregan parámetros. `create or replace` con distinta cantidad crea una
-- sobrecarga en vez de reemplazar.
-- ─────────────────────────────────────────────────────────────────────────────

alter table arqueo add column if not exists entrega_comentario text;

comment on column arqueo.entrega_comentario is
  'Por qué se entregó a esa caja, o cualquier cosa que haga falta anotar. Se guarda acá y no en la descripción del asiento, donde no se podría consultar ni corregir.';

drop function if exists registrar_entrega_central(uuid, date, uuid);

create function public.registrar_entrega_central(
  p_arqueo_id       uuid,
  p_fecha           date default null,
  p_responsable_id  uuid default null,
  p_caja_destino_id uuid default null,
  p_comentario      text default null
) returns uuid
language plpgsql
as $$
declare
  v_arq record; v_fecha date; v_asiento uuid;
  v_destino record;
begin
  select a.id, a.estado, a.saldo_contado, a.ambito, a.anulado_at,
         dc.fecha as fecha_dia, dc.predio_id, p.codigo as predio
    into v_arq
  from arqueo a
  join dia_cancha dc on dc.id = a.dia_cancha_id
  join predio p on p.id = dc.predio_id
  where a.id = p_arqueo_id;

  if not found then
    raise exception 'El arqueo % no existe', p_arqueo_id;
  end if;
  if v_arq.anulado_at is not null then
    raise exception 'El arqueo % está anulado: no se entrega.', p_arqueo_id;
  end if;
  if v_arq.ambito <> 'torneo' then
    raise exception
      'La entrega a central es del arqueo del torneo. El efectivo del bar sale '
      'con retirar_efectivo_bar, que además admite banco como destino.';
  end if;
  if v_arq.estado = 'entregado' then
    raise exception 'El arqueo % ya fue entregado', p_arqueo_id;
  end if;
  if v_arq.estado = 'cerrado' then
    raise exception
      'El arqueo % está cerrado: contó cero, no hay efectivo que entregar.', p_arqueo_id;
  end if;

  -- ── El destino ───────────────────────────────────────────────────────────
  select c.id, c.nombre, c.predio_id, c.activo, cu.codigo as cuenta
    into v_destino
  from caja c join cuenta cu on cu.id = c.cuenta_id
  where c.id = coalesce(
    p_caja_destino_id,
    (select c2.id from caja c2 join cuenta cu2 on cu2.id = c2.cuenta_id
      where cu2.codigo = 'CAJA_CENTRAL' limit 1)
  );

  if not found then
    raise exception 'La caja destino % no existe', p_caja_destino_id;
  end if;
  if not v_destino.activo then
    raise exception 'La caja «%» está desactivada: no se puede entregar ahí.', v_destino.nombre;
  end if;
  if v_destino.cuenta = 'CAJA_EFECTIVO' and v_destino.predio_id is distinct from v_arq.predio_id then
    raise exception
      'No se entrega efectivo al predio de «%»: los billetes tendrían que viajar. '
      'Eso pasa por el circuito de efectivo en tránsito.', v_destino.nombre;
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  if v_fecha < v_arq.fecha_dia then
    raise exception 'La entrega (%) no puede ser anterior al día arqueado (%)',
      v_fecha, v_arq.fecha_dia;
  end if;

  -- ⑤ · no se entrega plata que la caja no tiene. Si hay sobrante sin asentar,
  -- acá se frena y el mensaje del validador dice cuánto hay de verdad.
  perform validar_saldo_caja('CAJA_EFECTIVO', v_arq.predio_id, v_fecha,
                             v_arq.saldo_contado,
                             'entrega a central · asentá la diferencia primero');

  v_asiento := crear_asiento(
    v_fecha, 'arqueo',
    'Entrega a ' || v_destino.nombre || ' · ' || v_arq.predio || ' · ' || v_arq.fecha_dia,
    jsonb_build_array(
      jsonb_build_object('cuenta', v_destino.cuenta,  'debe',  v_arq.saldo_contado),
      jsonb_build_object('cuenta', 'CAJA_EFECTIVO', 'haber', v_arq.saldo_contado)
    ),
    null, null, v_arq.predio_id, p_arqueo_id, p_responsable_id
  );

  update arqueo
     set estado = 'entregado', entregado_at = now(), asiento_entrega_id = v_asiento,
         entrega_comentario = nullif(btrim(p_comentario), '')
   where id = p_arqueo_id;

  return v_asiento;
end;
$$;

comment on function registrar_entrega_central(uuid, date, uuid, uuid, text) is
  'Entrega el efectivo arqueado a una caja de la empresa. Sin caja destino va a CAJA_CENTRAL. No admite efectivo de otro predio: eso es un traslado físico.';
