-- ═══════════════════════════════════════════════════════════════════════════
-- Facturación · cerrar la tabla: RLS, recibo interno y receptor congelado
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Completa `20260825200000_factura_arca` (Horacio, sin aplicar). **Se aplican
-- las dos juntas y en orden**: la de él crea la tabla, ésta la termina. Se
-- eligió extender y no reescribir para que su archivo quede como está y el
-- historial muestre de dónde salió cada decisión.
--
-- ── Por qué `comprobante` y no `factura` ───────────────────────────────────
--
-- Porque acá adentro va a haber dos cosas: **facturas** —con CAE, numeradas
-- ante ARCA— y **recibos internos**, que no son fiscales. Decisión de Facu:
-- van en la misma tabla, con `tipo_comprobante = 0` para el recibo. Una tabla,
-- un módulo de consulta, una numeración que proteger.
--
-- Que compartan tabla no es comodidad: comparten TODO salvo el CAE y el punto
-- de venta —origen, receptor, monto, quién lo emitió, cuándo—. Separarlas
-- obligaría a unir dos listados en el front, que es justo donde este proyecto
-- no quiere sumar lógica.
--
-- ── Los cinco huecos que cierra ────────────────────────────────────────────
--
--   ① RLS + policies      · nacía apagada: sería la única tabla sin RLS
--                           además de `_prueba_marca`
--   ② Receptor congelado  · se COPIA el dato, no se referencia al tercero
--   ③ Neto e IVA          · discriminados, no sólo el total
--   ④ Fecha de emisión    · la que se le manda a ARCA, no `created_at`
--   ⑤ `emitida_por`       · con FK a `auth.users`, como el resto del sistema
--
-- Lo que NO hace, a propósito: las puertas de emisión (`reservar` / `cerrar`,
-- el flujo pendiente-primero) y el motor de ARCA. Lo primero es el paso
-- siguiente de este carril; lo segundo es de Horacio.
-- ═══════════════════════════════════════════════════════════════════════════

alter table factura rename to comprobante;

alter index factura_pago_unico            rename to comprobante_pago_unico;
alter index factura_cuota_sponsor_unica   rename to comprobante_cuota_sponsor_unica;
alter table comprobante rename constraint factura_un_origen  to comprobante_un_origen;
alter table comprobante rename constraint factura_estado_check to comprobante_estado_check;
alter table comprobante rename constraint factura_pto_vta_numero_unique
                                       to comprobante_pto_vta_numero_unique;

-- ═══════════════════════════════════════════════════════════════════════════
-- ② El receptor, congelado
-- ═══════════════════════════════════════════════════════════════════════════
--
-- **Se copia, no se referencia.** Un comprobante tiene que poder reimprimirse
-- idéntico dentro de cinco años, y el tercero de al lado puede haber cambiado
-- de nombre, de CUIT o de condición de IVA —o haberse dado de baja—. Un JOIN
-- vivo devolvería el dato de HOY sobre un documento de AYER, que en un papel
-- fiscal es lisa y llanamente otro documento.
--
-- Son cuatro campos y viajan juntos: `condicion_iva_receptor_id` —que ya
-- existía— es el cuarto. El vínculo a `pago` sigue existiendo, pero para
-- saber QUÉ se cobró, no para saber a quién se le facturó.

alter table comprobante
  add column receptor_nombre   text,
  add column receptor_doc_tipo smallint,
  add column receptor_doc_nro  text,
  add column detalle           text;

comment on column comprobante.receptor_nombre is
  'Razón social o nombre CON EL QUE SE EMITIÓ. Copiado del tercero al emitir, nunca leído por JOIN: el tercero puede cambiar y el comprobante no.';
comment on column comprobante.receptor_doc_tipo is
  'Tipo de documento con el que se emitió (80=CUIT, 96=DNI, 99=Consumidor Final sin identificar). Congelado.';
comment on column comprobante.receptor_doc_nro is
  'Número de documento con el que se emitió. Congelado.';
comment on column comprobante.condicion_iva_receptor_id is
  'Condición de IVA del receptor con la que se emitió (1=RI, 5=Consumidor Final, 6=Monotributo…). Congelada: es la que determinó A o B.';

-- ── El concepto, congelado por la misma razón y con un caso concreto ───────
--
-- «Cuotas 3 y 4 del Clausura» se podría derivar por JOIN —pago →
-- pago_imputacion → cuota → torneo— y sería un error, porque **ese camino se
-- borra**: `cambiar_estado_cheque` hace `delete from pago_imputacion` cuando
-- se rechaza un cheque. El equipo se quedaría con un papel que dice qué cuotas
-- pagó y el sistema reimprimiría el mismo comprobante sin ninguna.
--
-- Un comprobante no es una consulta: es lo que se entregó.
comment on column comprobante.detalle is
  'Concepto con el que se emitió, en texto — «Cuotas 3 y 4 · Clausura 2026». Congelado: se copia al emitir y no se deriva por JOIN, porque las imputaciones que lo explican se borran si se rechaza el cheque.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ Neto e IVA · ④ fecha de emisión · ⑤ el autor
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El neto y el IVA se guardan, no se recalculan. Hoy sale de dividir por 1,21
-- y da igual; el día que haya una alícuota distinta —o un comprobante exento—
-- ese ÷1.21 devuelve mal el histórico ya emitido, y encima en silencio.
--
-- `fecha_emision` es el `CbteFch` que se le manda a ARCA. `created_at` dice
-- cuándo se insertó la fila: casi siempre coinciden, y cuando no coinciden la
-- que vale es ésta.

alter table comprobante
  add column neto          numeric(16,2),
  add column iva           numeric(16,2),
  add column fecha_emision date not null default current_date;

alter table comprobante
  add constraint comprobante_emitida_por_fk
    foreign key (emitida_por) references auth.users(id);

comment on column comprobante.neto is
  'Importe neto gravado. NULL en el recibo interno, que no discrimina IVA.';
comment on column comprobante.iva is
  'IVA. NULL en el recibo interno.';
comment on column comprobante.fecha_emision is
  'El CbteFch que se le informó a ARCA. Es el dato fiscal; created_at es cuándo se insertó la fila.';

-- ═══════════════════════════════════════════════════════════════════════════
-- El recibo interno: tipo 0, y por qué el punto de venta también es 0
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `tipo_comprobante = 0` no existe en ARCA —sus códigos arrancan en 1— así que
-- el 0 es seguro para lo que no es de ARCA.
--
-- **El punto de venta del recibo es 0 y no NULL, y esto importa.** El único
-- que protege la numeración es `(punto_venta, tipo_comprobante, numero)`, y en
-- Postgres **dos NULL no se pisan**: con `punto_venta` en NULL se podrían
-- cargar dos recibos número 5 sin que la base dijera nada. Un 0 explícito los
-- mete en el mismo único que las facturas, y la numeración del recibo queda
-- protegida por el mismo mecanismo — que es lo que se pidió.

alter table comprobante drop constraint comprobante_estado_check;

alter table comprobante
  add constraint comprobante_coherente check (
    case
      when tipo_comprobante = 0
        -- Recibo interno: se genera y listo. No hay pendiente ni error porque
        -- no hay nadie afuera de quien depender.
        then estado = 'generado' and cae is null and cae_vencimiento is null
             and punto_venta = 0
      else
        -- Comprobante de ARCA: los tres estados del circuito.
        estado in ('pendiente', 'emitida', 'error') and punto_venta > 0
    end
  );

-- El CAE y el estado no pueden contradecirse: una factura «emitida» sin CAE es
-- una que en realidad no se emitió, y un CAE sobre una «pendiente» es una que
-- sí se emitió y quedó mal anotada. Las dos mienten sobre un documento fiscal.
alter table comprobante
  add constraint comprobante_cae_coherente check ((estado = 'emitida') = (cae is not null));

-- Lo que ARCA exige sí o sí, y el recibo no.
alter table comprobante
  add constraint comprobante_receptor_arca check (
    tipo_comprobante = 0
    or (receptor_doc_tipo is not null and receptor_doc_nro is not null
        and receptor_nombre is not null)
  );

alter table comprobante
  add constraint comprobante_neto_iva check (
    tipo_comprobante = 0
    or (neto is not null and iva is not null and round(neto + iva, 2) = monto)
  );

comment on table comprobante is
  'Comprobantes emitidos: facturas de ARCA (con CAE) y recibos internos (tipo_comprobante = 0, sin CAE, punto de venta 0). El receptor está CONGELADO en la fila —se copia al emitir— porque un comprobante no cambia cuando cambia el tercero.';

-- ═══════════════════════════════════════════════════════════════════════════
-- La numeración del recibo: una sequence, y la asimetría con la factura
-- ═══════════════════════════════════════════════════════════════════════════
--
-- **El recibo numera solo; la factura numera contra ARCA.** No es un detalle
-- de implementación, son dos problemas distintos:
--
--   · **Recibo interno** — el número lo decidimos nosotros y a nadie le
--     importa si hay huecos. Una `sequence` lo resuelve entero: es atómica,
--     no toma locks y dos cobros simultáneos sacan números distintos sin
--     coordinarse. Un `max(numero) + 1` en cambio hace que dos cobros a la vez
--     saquen el mismo y uno falle — el único lo frenaría, pero el cobro se
--     caería por algo que no tiene nada que ver con el cobro.
--
--   · **Factura ARCA** — el número NO es nuestro: sale de preguntarle a ARCA
--     cuál fue el último autorizado. Una sequence acá sería una segunda
--     numeración que se desincroniza de la de ARCA en el primer rechazo. Eso
--     necesita un advisory lock alrededor de «preguntar + emitir», y va con
--     las puertas de emisión, en el paso siguiente.
--
-- La sequence no se cuelga como `default` de la columna a propósito: la
-- columna la comparten los dos tipos, y un default que aplica a uno solo es
-- una trampa esperando a la primera factura que se inserte sin número.

create sequence comprobante_recibo_numero_seq as integer start 1;

comment on sequence comprobante_recibo_numero_seq is
  'Numeración correlativa del recibo interno (tipo_comprobante = 0). Se usa con nextval() al generar el recibo. NO la usan las facturas de ARCA: ese número lo da ARCA.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ① RLS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- **El SELECT es `using (true)` y no es un descuido.** Es la nota #1 del
-- proyecto: las funciones que validan leen la tabla que protegen, y con el
-- SELECT restringido leen 0 y el chequeo pasa de largo. Acá además lo necesita
-- el módulo de consulta, que es de lectura para todos.
--
-- La escritura, allowlist positiva —un typo deniega, no permite—:
--
--   · **Factura de ARCA: sólo admin.** Emite un documento legal con
--     numeración que se consume aunque después nos arrepintamos.
--   · **Recibo interno: admin y operador.** Es el comprobante que se le da al
--     equipo al cobrar; el que cobra tiene que poder generarlo.
--
-- El rol `finanzas` todavía no existe. Cuando exista se agrega a estas dos
-- listas y a `lib/permisos.ts`, y el verificador exige que coincidan.
--
-- Que un rol pueda escribir SÓLO ciertas filas se expresa acá, en la policy,
-- con `tipo_comprobante = 0`. Es la primera policy del sistema que discrimina
-- por columna y no sólo por rol.

alter table comprobante enable row level security;

create policy comprobante_select on comprobante
  for select to authenticated using (true);

create policy comprobante_insert on comprobante
  for insert to authenticated
  with check (
    auth_rol() = 'admin'
    or (auth_rol() = 'operador' and tipo_comprobante = 0)
  );

-- El UPDATE es el que cierra un `pendiente`: pendiente → emitida/error cuando
-- ARCA contesta. Sólo admin, porque hoy sólo admin emite ante ARCA. El recibo
-- no se actualiza: nace `generado` y no tiene a dónde ir.
create policy comprobante_update on comprobante
  for update to authenticated
  using (auth_rol() = 'admin')
  with check (auth_rol() = 'admin');

-- Sin policy de DELETE, a propósito: un comprobante no se borra. Una factura
-- se anula con una nota de crédito —que es otro comprobante— y un recibo mal
-- hecho se reemplaza por otro. Es la misma regla que el asiento.

-- ═══════════════════════════════════════════════════════════════════════════
-- La función de Horacio, apuntada a la tabla nueva
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Se recrea porque el `rename` la dejaría fallando en tiempo de ejecución: el
-- cuerpo dice `insert into factura`. Es su función, con el mismo
-- comportamiento, más los campos nuevos.
--
-- Sigue siendo «persistir lo que ARCA ya confirmó», así que sólo escribe
-- `emitida`. **El flujo pendiente-primero —reservar el número, llamar a ARCA,
-- cerrar— es el paso siguiente de este carril** y va a reemplazarla.

-- Va con `drop` primero: agregarle parámetros a una función **la sobrecarga,
-- no la reemplaza**, y quedarían dos versiones —la vieja apuntando a una tabla
-- que ya no existe— más un `comment on function` que no sabe a cuál referirse.
drop function if exists public.registrar_factura_emitida(
  uuid, uuid, smallint, integer, smallint, numeric, text, date, uuid);

create function public.registrar_factura_emitida(
  p_pago_id                   uuid,
  p_cuota_cobro_sponsor_id    uuid,
  p_tipo_comprobante          smallint,
  p_numero                    integer,
  p_condicion_iva_receptor_id smallint,
  p_monto                     numeric,
  p_cae                       text,
  p_cae_vencimiento           date,
  p_emitida_por               uuid default null,
  p_receptor_nombre           text default null,
  p_receptor_doc_tipo         smallint default null,
  p_receptor_doc_nro          text default null,
  p_neto                      numeric default null,
  p_iva                       numeric default null,
  p_fecha_emision             date default null,
  p_detalle                   text default null
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

  insert into comprobante (
    pago_id, cuota_cobro_sponsor_id, tipo_comprobante, punto_venta,
    numero, condicion_iva_receptor_id, monto, cae, cae_vencimiento,
    estado, emitida_por,
    receptor_nombre, receptor_doc_tipo, receptor_doc_nro, detalle,
    neto, iva, fecha_emision
  ) values (
    p_pago_id, p_cuota_cobro_sponsor_id, p_tipo_comprobante, 200,
    p_numero, p_condicion_iva_receptor_id, p_monto, p_cae, p_cae_vencimiento,
    'emitida', coalesce(p_emitida_por, auth.uid()),
    p_receptor_nombre, p_receptor_doc_tipo, p_receptor_doc_nro, p_detalle,
    coalesce(p_neto, round(p_monto / 1.21, 2)),
    coalesce(p_iva,  p_monto - round(p_monto / 1.21, 2)),
    coalesce(p_fecha_emision, current_date)
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
  'Registra el resultado de una emisión de factura YA CONFIRMADA por ARCA (con CAE real). No llama a ARCA — eso lo hace el código TypeScript. De Horacio; acá sólo se la apuntó a la tabla renombrada y se le sumaron los campos congelados del receptor.';
