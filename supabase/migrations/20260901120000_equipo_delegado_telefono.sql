-- ─────────────────────────────────────────────────────────────────────────────
-- El delegado del equipo, y el teléfono llamado por su nombre
--
-- Commit 1 de A1 (la ficha del equipo como entidad central).
--
-- ── Por qué un rename y no un campo nuevo al lado ──────────────────────────
--
-- `tercero.contacto` guarda un TELÉFONO y se consume como teléfono: el label
-- del formulario dice «Teléfono del delegado, para WhatsApp», `ArmarReclamo`
-- lo pasa por `parsearTelefono()` y arma el link de wa.me con él, y
-- `BotonWhatsApp` hace lo mismo desde el comprobante.
--
-- O sea que el campo ya era el teléfono; lo único que faltaba era decirlo. Y
-- mientras se llamó «contacto» ocupó el lugar conceptual del delegado, así que
-- no había dónde poner a la persona sin que el modelo quedara con dos campos
-- que se pisan.
--
-- Son 2 filas de 304 con dato, así que el rename no arriesga nada de valor.
--
-- ── 🔴 Lo que NO se toca: proveedor.contacto ───────────────────────────────
--
-- `proveedor` tiene su propia columna `contacto`, y ahí el nombre es correcto:
-- `crear_proveedor` la usa como texto libre de contacto comercial, no como
-- número. Son dos columnas homónimas en tablas distintas y sólo se renombra la
-- de `tercero`. Un `update ... set contacto` sin calificar la tabla sería
-- exactamente el error que este comentario existe para evitar.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1 · El teléfono se llama teléfono ──────────────────────────────────────
alter table tercero rename column contacto to telefono;

comment on column tercero.telefono is
  'Teléfono de contacto, texto libre. Lo parsea lib/reclamo/contacto.ts para armar el link de WhatsApp.';

-- ── 2 · El delegado es una persona ─────────────────────────────────────────
alter table tercero add column delegado text;

comment on column tercero.delegado is
  'Nombre del delegado del equipo. Quién es, no cómo se lo llama: el teléfono va en telefono y el mail en email.';

-- ── 3 · v_cliente y v_cliente_kpi se DROPEAN y se recrean ──────────────────
--
-- `create or replace view` no permite renombrar una columna de salida, y
-- `contacto` es una de ellas: hay que dropear. El `drop` es seguro porque la
-- única vista que depende de `v_cliente` es `v_cliente_kpi` —verificado contra
-- pg_depend, no supuesto— y se recrea acá abajo.
--
-- Las dos quedan IDÉNTICAS salvo por las dos columnas: `contacto` pasa a
-- llamarse `telefono` y se suma `delegado`. La lógica de `facturable`, `falta`
-- y `estado_fiscal` no se toca.
drop view v_cliente_kpi;
drop view v_cliente;

create view v_cliente as
with base as (
  select
    t.id                                              as tercero_id,
    t.tipo,
    t.nombre,
    nullif(btrim(t.razon_social), '')                 as razon_social,
    t.doc_tipo_default                                as doc_tipo,
    nullif(btrim(t.doc_nro_default), '')              as doc_nro,
    t.condicion_iva_receptor_default                  as condicion_iva_id,
    c.descripcion                                     as condicion_iva,
    nullif(btrim(t.domicilio_fiscal), '')             as domicilio_fiscal,
    nullif(btrim(t.email), '')                        as email,
    nullif(btrim(t.telefono), '')                     as telefono,
    nullif(btrim(t.delegado), '')                     as delegado,
    t.activo,
    t.doc_tipo_default is not null
      and nullif(btrim(t.doc_nro_default), '') is not null  as tiene_documento,
    t.condicion_iva_receptor_default is not null           as tiene_condicion,
    t.condicion_iva_receptor_default = 1                   as es_responsable_inscripto
  from tercero t
  left join condicion_iva_receptor c on c.id = t.condicion_iva_receptor_default
  where t.tipo = any (array['equipo', 'sponsor'])
),
evaluado as (
  select
    b.*,
    b.tiene_documento
      and b.tiene_condicion
      and (not b.es_responsable_inscripto
           or (b.razon_social is not null and b.domicilio_fiscal is not null))  as facturable,
    array_remove(array[
      case when not b.tiene_condicion then 'condición de IVA' end,
      case when not b.tiene_documento then 'documento' end,
      case when b.es_responsable_inscripto and b.razon_social is null then 'razón social' end,
      case when b.es_responsable_inscripto and b.domicilio_fiscal is null then 'domicilio' end
    ], null) as falta
  from base b
)
select
  tercero_id, tipo, nombre, razon_social, doc_tipo, doc_nro,
  condicion_iva_id, condicion_iva, domicilio_fiscal,
  email, telefono, delegado, activo,
  tiene_documento, tiene_condicion, es_responsable_inscripto,
  facturable, falta,
  case
    when facturable then 'completo'
    when not tiene_documento and not tiene_condicion and razon_social is null then 'sin_datos'
    else 'incompleto'
  end as estado_fiscal,
  array_to_string(falta, ', ') as falta_texto
from evaluado e;

create view v_cliente_kpi as
select
  count(*)                                              as total,
  count(*) filter (where facturable)                    as facturables,
  count(*) filter (where estado_fiscal = 'sin_datos')   as sin_datos,
  count(*) filter (where estado_fiscal = 'incompleto')  as incompletos,
  count(*) filter (where tipo = 'equipo')               as equipos,
  count(*) filter (where tipo = 'sponsor')              as sponsors
from v_cliente;

-- ── 4 · crear_sponsor escribía tercero.contacto ────────────────────────────
--
-- Es la única función que escribe la columna, así que sin esto el rename la
-- rompe. Y ya que se toca, el parámetro se llama `p_telefono`: dejar
-- `p_contacto` escribiendo en `telefono` sería la mitad del rename, que es
-- justo la forma en que estas cosas vuelven como bug.
--
-- Va `drop` + `create` y no `create or replace` porque cambiar el NOMBRE de un
-- parámetro con replace levanta 42P13.
--
-- La guarda de rol se conserva palabra por palabra: es lo que declara
-- `sponsor.crear` en lib/permisos.ts, y el verificador la lee de acá.
drop function if exists crear_sponsor(text, text, text, text, smallint, text, smallint, text);

create function public.crear_sponsor(
  p_nombre                          text,
  p_email                           text default null,
  p_telefono                        text default null,
  p_razon_social                    text default null,
  p_doc_tipo_default                smallint default null,
  p_doc_nro_default                 text default null,
  p_condicion_iva_receptor_default  smallint default null,
  p_domicilio_fiscal                text default null
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas', 'operador'])) then
    raise exception
      'Crear un sponsor es de administrador, finanzas u operador. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El sponsor necesita un nombre';
  end if;

  insert into tercero (
    tipo, nombre, email, telefono, activo,
    razon_social, doc_tipo_default, doc_nro_default,
    condicion_iva_receptor_default, domicilio_fiscal
  ) values (
    'sponsor', btrim(p_nombre), p_email, p_telefono, true,
    p_razon_social, p_doc_tipo_default, p_doc_nro_default,
    p_condicion_iva_receptor_default, p_domicilio_fiscal
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function crear_sponsor(text, text, text, text, smallint, text, smallint, text) is
  'Alta de sponsor: crea el tercero tipo sponsor con sus datos fiscales. Guarda de rol adentro (sponsor.crear).';
