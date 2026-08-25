-- ═══════════════════════════════════════════════════════════════
-- factura + registrar_factura_emitida — PROPUESTA, NO APLICAR sin
-- revisión (regla 11 · toca ARCA/documentos fiscales reales, el paso
-- de mayor riesgo del proyecto).
--
-- Decisiones tomadas con Horacio (25/08):
--  - La condición de IVA del receptor se elige POR TRANSACCIÓN, no es
--    un atributo fijo de tercero. No se toca la tabla tercero.
--  - Emitir factura es un paso SEPARADO del cobro — primero se cobra
--    (registrar_cobro / registrar_cobro_sponsor, sin cambios), después
--    en otro momento se emite la factura sobre ese pago ya existente.
--  - Tipo de comprobante se deriva de la condición de IVA del receptor:
--    Factura A si es Responsable Inscripto (id=1), Factura B para el
--    resto. Códigos de tipo de comprobante según FEParamGetTiposCbte:
--    01=Factura A, 06=Factura B (confirmado en manual ARCA).
--  - Un solo punto de venta para todo: 200 (de los 10 habilitados,
--    200-209, elegido el primero por simplicidad).
--
-- Verificado con BEGIN...ROLLBACK contra la base real (25/08): compila
-- y corre sin error, count(*) de information_schema.tables volvió a 0
-- después del rollback.
--
-- La tabla admite pago_id O cuota_cobro_sponsor_id (uno de los dos, no
-- ambos).
-- ═══════════════════════════════════════════════════════════════

create table factura (
  id                        uuid primary key default gen_random_uuid(),
  pago_id                   uuid references pago(id),
  cuota_cobro_sponsor_id    uuid references cuota_cobro_sponsor(id),
  tipo_comprobante          smallint not null,
  punto_venta               smallint not null default 200,
  numero                    integer not null,
  condicion_iva_receptor_id smallint not null,
  monto                     numeric(16,2) not null,
  cae                       text,
  cae_vencimiento           date,
  estado                    text not null default 'pendiente',
  error_detalle             text,
  emitida_por               uuid,
  created_at                timestamptz not null default now(),

  constraint factura_un_origen check (
    (pago_id is not null and cuota_cobro_sponsor_id is null)
    or (pago_id is null and cuota_cobro_sponsor_id is not null)
  ),
  constraint factura_estado_check check (
    estado in ('pendiente', 'emitida', 'error')
  ),
  constraint factura_pto_vta_numero_unique unique (punto_venta, tipo_comprobante, numero)
);

comment on table factura is
  'Comprobantes fiscales emitidos ante ARCA. La condición de IVA se registra por transacción, no vive en tercero — decisión de Horacio, 25/08.';

create unique index factura_pago_unico on factura(pago_id) where pago_id is not null;
create unique index factura_cuota_sponsor_unica on factura(cuota_cobro_sponsor_id) where cuota_cobro_sponsor_id is not null;

create or replace function public.registrar_factura_emitida(
  p_pago_id                   uuid,
  p_cuota_cobro_sponsor_id    uuid,
  p_tipo_comprobante          smallint,
  p_numero                    integer,
  p_condicion_iva_receptor_id smallint,
  p_monto                     numeric,
  p_cae                       text,
  p_cae_vencimiento           date,
  p_emitida_por               uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_id uuid;
begin
  if (p_pago_id is null) = (p_cuota_cobro_sponsor_id is null) then
    raise exception
      'Hay que informar exactamente uno: pago_id o cuota_cobro_sponsor_id, no los dos ni ninguno.';
  end if;

  insert into factura (
    pago_id, cuota_cobro_sponsor_id, tipo_comprobante, punto_venta,
    numero, condicion_iva_receptor_id, monto, cae, cae_vencimiento,
    estado, emitida_por
  ) values (
    p_pago_id, p_cuota_cobro_sponsor_id, p_tipo_comprobante, 200,
    p_numero, p_condicion_iva_receptor_id, p_monto, p_cae, p_cae_vencimiento,
    'emitida', coalesce(p_emitida_por, auth.uid())
  )
  returning id into v_id;

  return v_id;
exception when unique_violation then
  raise exception
    'Este pago/cuota ya tiene una factura emitida, o el número % ya existe para punto de venta 200 tipo %. No se puede duplicar.',
    p_numero, p_tipo_comprobante;
end;
$function$;

comment on function registrar_factura_emitida is
  'Registra el resultado de una emisión de factura YA CONFIRMADA por ARCA (con CAE real). No llama a ARCA — eso lo hace el código TypeScript. Esta función solo persiste el resultado.';
