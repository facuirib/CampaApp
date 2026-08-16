-- registrar_entrega_central · el responsable entra por parámetro
--
-- ⚠ ARCHIVO RECUPERADO DE LA BASE, no escrito de nuevo.
--
-- Esta migración estaba **aplicada en producción y sin archivo en el repo**:
-- `supabase_migrations.schema_migrations` la registra como `20260810120000
-- registrar_entrega_central_responsable`, y no existía el `.sql` correspondiente.
-- El cuerpo de acá salió de `pg_get_functiondef()` sobre la función viva.
--
-- Es peor que un desfase de nombres: la única definición que quedaba en el repo
-- era la de `20260802095023_arqueo_dia_cancha.sql`, **con dos parámetros**. Una
-- base reconstruida desde `migrations/` quedaba con una `registrar_entrega_central`
-- distinta de la de producción — sin `p_responsable_id`, o sea con el asiento de
-- la entrega atribuido a nadie.
--
-- Apareció barriendo firmas de producción contra el repo al cerrar la
-- reproducibilidad. Fue el único drift de firma en 41 funciones, y las 53 vistas
-- dieron limpias.
--
-- **No hay que aplicarla**: producción ya la tiene registrada, así que ni el CLI
-- ni el MCP la van a correr de nuevo. Existe para que una base limpia llegue al
-- mismo lugar.
--
-- Cambio respecto de `20260802095023`: se agrega `p_responsable_id` y se lo pasa
-- como noveno argumento de `crear_asiento` (`p_created_by`), en línea con la
-- decisión 89 — un dato de auditoría inventado es peor que la ausencia del dato.
--
-- El `drop` de abajo no es opcional: agregar un parámetro **crea una función
-- nueva en vez de reemplazar la anterior**, y una llamada de un argumento
-- quedaría ambigua. Es el mismo cuidado que ya tienen `anular_asiento`,
-- `devengar_sponsors` y `devengar_sueldos_socios` en sus migraciones. Producción
-- tiene una sola versión de la función, así que la migración original lo hacía;
-- se reconstruye acá.

drop function if exists public.registrar_entrega_central(uuid, date);

create or replace function registrar_entrega_central(
  p_arqueo_id      uuid,
  p_fecha          date default null,
  p_responsable_id uuid default null
) returns uuid
language plpgsql
as $function$
declare
  v_arq     record;
  v_fecha   date;
  v_asiento uuid;
begin
  select a.id, a.estado, a.saldo_contado, dc.fecha as fecha_dia, dc.predio_id, p.codigo as predio
    into v_arq
  from arqueo a
  join dia_cancha dc on dc.id = a.dia_cancha_id
  join predio p on p.id = dc.predio_id
  where a.id = p_arqueo_id;

  if not found then
    raise exception 'El arqueo % no existe', p_arqueo_id;
  end if;

  if v_arq.estado <> 'pendiente_entrega' then
    raise exception 'El arqueo % ya fue entregado', p_arqueo_id;
  end if;

  if v_arq.saldo_contado = 0 then
    raise exception
      'El arqueo % contó cero: no hay efectivo que entregar', p_arqueo_id;
  end if;

  v_fecha := coalesce(p_fecha, current_date);

  if v_fecha < v_arq.fecha_dia then
    raise exception
      'La entrega (%) no puede ser anterior al día arqueado (%)',
      v_fecha, v_arq.fecha_dia;
  end if;

  v_asiento := crear_asiento(
    v_fecha,
    'arqueo',
    'Entrega a central · ' || v_arq.predio || ' · ' || v_arq.fecha_dia,
    jsonb_build_array(
      jsonb_build_object('cuenta', 'CAJA_CENTRAL',  'debe',  v_arq.saldo_contado),
      jsonb_build_object('cuenta', 'CAJA_EFECTIVO', 'haber', v_arq.saldo_contado)
    ),
    null,
    null,
    v_arq.predio_id,
    p_arqueo_id,
    p_responsable_id
  );

  update arqueo
     set estado             = 'entregado',
         entregado_at       = now(),
         asiento_entrega_id = v_asiento
   where id = p_arqueo_id;

  return v_asiento;
end;
$function$;

comment on function registrar_entrega_central(uuid, date, uuid) is
  'Entrega el efectivo arqueado a caja central. El responsable entra por '
  'parámetro y va a crear_asiento como p_created_by (decisión 89).';
