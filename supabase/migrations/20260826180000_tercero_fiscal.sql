-- ═══════════════════════════════════════════════════════════════════════════
-- Facturación · los datos fiscales del tercero
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Completa `20260825210000_tercero_facturacion_default` (Horacio, sin aplicar).
-- **Se aplican las dos juntas y en orden**, igual que con `comprobante`: la de
-- él agrega los tres defaults, ésta suma lo que falta para poder imprimir una
-- Factura A y para que el dato no se pueda cargar mal.
--
-- ── De dónde sale este trabajo ─────────────────────────────────────────────
--
-- `tercero` tiene hoy seis columnas —id, tipo, nombre, email, contacto,
-- activo— y **ninguna es fiscal**. Sin eso no se puede armar el receptor de un
-- comprobante, que es el dato que `comprobante` congela al emitir.
--
-- Los campos de acá son la FUENTE; los de `comprobante` son la COPIA. Tienen
-- que alinear, y esta migración cierra el último desalineo (ver más abajo:
-- `receptor_domicilio`).
--
-- ── Qué exige ARCA, que no es lo mismo que qué exige el papel ──────────────
--
-- `FECAESolicitar` recibe **tres** datos del receptor: `DocTipo`, `DocNro` y
-- `CondicionIVAReceptorId`. Nada más. Ni razón social ni domicilio viajan al
-- webservice.
--
-- Pero el **comprobante impreso** de una Factura A sí los lleva. O sea que
-- razón social y domicilio no son «por las dudas»: sin ellos se puede pedir el
-- CAE y no se puede emitir el papel.
--
--   · **Factura A** — receptor Responsable Inscripto (condición 1). Exige CUIT
--     (`DocTipo` 80) válido y activo en ARCA; en el impreso, razón social y
--     domicilio.
--   · **Factura B** — todo el resto. Admite «Consumidor Final sin
--     identificar» (`DocTipo` 99, `DocNro` 0) por debajo del monto que fija la
--     resolución vigente; por encima hay que identificar al receptor.
--     **Ese monto no se escribe acá**: cambia por resolución y hay que
--     confirmarlo con el contador.
--
-- ── Todo nullable, a propósito ─────────────────────────────────────────────
--
-- Hay **304 equipos cargados y ninguno tiene un solo dato fiscal**, porque el
-- padrón se sembró con nombre y tipo nada más. Un `not null` acá dejaría la
-- base sin poder aceptar el seed que ya corrió.
--
-- La consecuencia hay que decirla: **hasta que se carguen, todos facturan como
-- Consumidor Final**. Eso es carga de datos del torneo, no código.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ① El catálogo de condiciones de IVA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Las once salieron de `FEParamGetCondicionIvaReceptor` **contra producción**
-- (Horacio, 25/08). Hoy viven en un `.md` y se le piden a ARCA en vivo, que
-- para dibujar un `<select>` es un round-trip a un organismo público.
--
-- Van a una tabla y no a un enum ni a un check, por dos razones. Una: el
-- `<select>` necesita la etiqueta —«Responsable Monotributo»—, y un enum sólo
-- tiene el código. Dos: si ARCA agrega una condición, una fila se inserta y un
-- enum se migra.
--
-- `id` es el código de ARCA, no un serial: es la clave que viaja en el XML.

create table condicion_iva_receptor (
  id          smallint primary key,
  descripcion text not null,
  activa      boolean not null default true
);

comment on table condicion_iva_receptor is
  'Las condiciones de IVA del receptor que acepta ARCA (FEParamGetCondicionIvaReceptor), confirmadas contra producción el 25/08. El id es el código de ARCA: es lo que viaja en el XML de FECAESolicitar.';

insert into condicion_iva_receptor (id, descripcion) values
  ( 1, 'IVA Responsable Inscripto'),
  ( 4, 'IVA Sujeto Exento'),
  ( 5, 'Consumidor Final'),
  ( 6, 'Responsable Monotributo'),
  ( 7, 'Sujeto No Categorizado'),
  ( 8, 'Proveedor del Exterior'),
  ( 9, 'Cliente del Exterior'),
  (10, 'IVA Liberado – Ley N° 19.640'),
  (13, 'Monotributista Social'),
  (15, 'IVA No Alcanzado'),
  (16, 'Monotributo Trabajador Independiente Promovido');

-- Catálogo: lo lee cualquiera, lo edita admin. No es dato operativo — se
-- sincroniza con ARCA, no se carga a mano en el día a día.
alter table condicion_iva_receptor enable row level security;

create policy condicion_iva_receptor_select on condicion_iva_receptor
  for select to authenticated using (true);

create policy condicion_iva_receptor_insert on condicion_iva_receptor
  for insert to authenticated with check (auth_rol() = 'admin');

create policy condicion_iva_receptor_update on condicion_iva_receptor
  for update to authenticated
  using (auth_rol() = 'admin') with check (auth_rol() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- ② El CUIT, validado en la base
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Un CUIT mal tipeado no falla al guardarlo: falla **al pedir el CAE**, con un
-- mensaje de ARCA, delante del equipo que está esperando su factura. El dígito
-- verificador se puede chequear acá y ahí el error aparece donde se cometió.
--
-- Valida la FORMA, no la existencia: que el CUIT exista y esté activo lo sabe
-- ARCA y sólo ARCA. Esto ataja el dedo, no la mentira.
--
-- `null` pasa: el campo es opcional y un `check` sobre NULL da NULL, que
-- Postgres acepta. Se deja explícito igual, porque leerlo despeja la duda.

create or replace function public.cuit_valido(p_cuit text)
returns boolean
language plpgsql
immutable
as $function$
declare
  v_limpio text;
  v_pesos  int[] := array[5,4,3,2,7,6,5,4,3,2];
  v_suma   int := 0;
  v_dv     int;
  i        int;
begin
  if p_cuit is null then return true; end if;

  -- Se aceptan guiones y puntos al cargar: pedirle a alguien que tipee once
  -- dígitos corridos es pedirle que se equivoque.
  v_limpio := regexp_replace(p_cuit, '[^0-9]', '', 'g');
  if length(v_limpio) <> 11 then return false; end if;

  for i in 1..10 loop
    v_suma := v_suma + (substr(v_limpio, i, 1))::int * v_pesos[i];
  end loop;

  v_dv := 11 - (v_suma % 11);
  if v_dv = 11 then v_dv := 0; end if;
  if v_dv = 10 then return false; end if;

  return v_dv = (substr(v_limpio, 11, 1))::int;
end;
$function$;

comment on function cuit_valido is
  'Valida el dígito verificador de un CUIT/CUIL. Acepta guiones y puntos. NULL da true: el campo es opcional. Valida la forma, no la existencia — que el CUIT exista y esté activo lo sabe ARCA.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ Los campos que faltan en `tercero`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- **Por qué `razon_social` va aparte de `nombre`, y no es un detalle.**
--
-- `nombre` es el nombre de fantasía: «Barcelo Fem», «Tercer Tiempo FC». Es lo
-- que se ve en la tabla de posiciones y en la pantalla de cobranza, y es el
-- que hay que seguir usando ahí.
--
-- Una Factura A lleva la **razón social del CUIT** — «Asociación Civil Barcelo»
-- o el apellido y nombre de la persona—, que casi nunca coincide. Un
-- comprobante fiscal a nombre de un apodo es un comprobante mal emitido.
--
-- Los 304 equipos tienen nombre de fantasía: ninguno tiene pinta de razón
-- social (medido: 0 con «SA», «SRL» ni similar). Así que no se puede derivar
-- uno del otro, y por eso son dos columnas.
--
-- **Por qué estas dos NO llevan el sufijo `_default` y las de Horacio sí.**
--
-- Los tres de él —tipo y número de documento, condición de IVA— son
-- **elecciones** que pueden cambiar por transacción: al mismo equipo se le
-- puede hacer una B a consumidor final una vez y una A a su CUIT otra. El
-- sufijo dice «esto es lo que la puerta propone».
--
-- Razón social y domicilio no son elecciones: son **atributos del CUIT**. Si
-- cambia el CUIT cambian los tres juntos, y si no cambia, no hay nada que
-- elegir.

alter table tercero
  add column razon_social     text,
  add column domicilio_fiscal text;

comment on column tercero.razon_social is
  'Razón social ante ARCA, distinta del nombre de fantasía que va en `nombre`. Necesaria para imprimir una Factura A. NULL mientras no se cargue.';
comment on column tercero.domicilio_fiscal is
  'Domicilio fiscal, en una línea. No viaja a ARCA —FECAESolicitar no lo pide— pero el comprobante impreso de una Factura A lo lleva.';

-- El default de condición de IVA queda amarrado al catálogo: un código que
-- ARCA no conoce no entra, y el `<select>` sale de la misma tabla.
alter table tercero
  add constraint tercero_condicion_iva_fk
    foreign key (condicion_iva_receptor_default) references condicion_iva_receptor(id);

-- El CUIT se valida sólo cuando el tipo de documento dice que ES un CUIT (80).
-- Un DNI (96) tiene otro largo y ningún dígito verificador, y el «consumidor
-- final sin identificar» (99) va con número 0.
alter table tercero
  add constraint tercero_cuit_valido check (
    doc_tipo_default is distinct from 80 or cuit_valido(doc_nro_default)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ El desalineo que quedaba entre la fuente y la copia
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `comprobante` congela nombre, tipo y número de documento y condición de IVA
-- del receptor —para que un comprobante reimpreso salga idéntico al
-- entregado—, pero **no congela el domicilio**, porque cuando se escribió esa
-- tabla el domicilio no existía en ningún lado.
--
-- Con el domicilio en `tercero` y no en el comprobante, el papel de una
-- Factura A reimpresa saldría con el domicilio de HOY sobre un documento de
-- AYER: exactamente lo que congelar el resto vino a evitar. Se cierra acá.

alter table comprobante add column receptor_domicilio text;

comment on column comprobante.receptor_domicilio is
  'Domicilio fiscal CON EL QUE SE EMITIÓ. Congelado, como el resto del receptor: no viaja a ARCA pero se imprime en la Factura A.';
