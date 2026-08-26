-- ═══════════════════════════════════════════════════════════════════════════
-- `v_cliente` — los terceros a los que se les factura, y qué les falta
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cliente es a quien se le COBRA: equipos y sponsors. La dirección de la plata
-- se midió en el diario, no se dedujo del nombre del tipo — el equipo mueve
-- `ING_INSCRIPCIONES` e `ING_PARTIDOS`, el sponsor `DEUDORES_SPONSORS` e
-- `ING_SPONSORS`, los dos del lado del ingreso.
--
-- `socio` queda afuera aunque cobre plata del club: se le paga un sueldo que se
-- devenga desde su propio padrón, y no emite comprobante hacia CAMPA. Tiene su
-- pantalla en `/socios`.
--
-- `proveedor` también queda afuera, y no por criterio sino porque **no existe**:
-- cero filas, y `gasto` no tiene `tercero_id`, así que hoy no hay forma de
-- saber quién emitió una factura de compra. Esa pantalla espera el modelo.
--
-- ── Por qué el estado fiscal se calcula ACÁ ────────────────────────────────
--
-- Regla 1: el front no deriva. «Este equipo puede facturarse» es una condición
-- con cuatro campos y un caso especial —el Responsable Inscripto necesita dos
-- más— y si la resuelve la pantalla, el día que cambie la regla va a haber dos
-- versiones: la de la lista y la de la ficha.
--
-- ── El caso especial del Responsable Inscripto ─────────────────────────────
--
-- Para una Factura B alcanza con tipo y número de documento y la condición de
-- IVA: es lo único que `FECAESolicitar` manda. Pero si el receptor es
-- Responsable Inscripto (condición 1) el comprobante es una **Factura A**, y el
-- papel impreso lleva razón social y domicilio. Sin ellos se consigue el CAE y
-- no se puede emitir el comprobante — así que a los efectos de esta pantalla,
-- ese cliente NO está listo.
-- ═══════════════════════════════════════════════════════════════════════════

create view v_cliente as
with base as (
  select
    t.id                             as tercero_id,
    t.tipo,
    t.nombre,
    nullif(btrim(t.razon_social), '')     as razon_social,
    t.doc_tipo_default                    as doc_tipo,
    nullif(btrim(t.doc_nro_default), '')  as doc_nro,
    t.condicion_iva_receptor_default      as condicion_iva_id,
    c.descripcion                         as condicion_iva,
    nullif(btrim(t.domicilio_fiscal), '') as domicilio_fiscal,
    nullif(btrim(t.email), '')            as email,
    nullif(btrim(t.contacto), '')         as contacto,
    t.activo,
    -- Los dos que ARCA exige siempre.
    (t.doc_tipo_default is not null
     and nullif(btrim(t.doc_nro_default), '') is not null) as tiene_documento,
    (t.condicion_iva_receptor_default is not null)         as tiene_condicion,
    (t.condicion_iva_receptor_default = 1)                 as es_responsable_inscripto
  from tercero t
  left join condicion_iva_receptor c on c.id = t.condicion_iva_receptor_default
  where t.tipo in ('equipo', 'sponsor')
),
evaluado as (
  select b.*,
    (b.tiene_documento and b.tiene_condicion
     and (not b.es_responsable_inscripto
          or (b.razon_social is not null and b.domicilio_fiscal is not null))) as facturable,
    -- Qué falta, en el orden en que conviene cargarlo. Es una lista y no un
    -- booleano porque la pantalla es una campaña de carga: decir «incompleto»
    -- obliga a abrir la ficha para averiguar qué.
    array_remove(array[
      case when not b.tiene_condicion then 'condición de IVA' end,
      case when not b.tiene_documento then 'documento' end,
      case when b.es_responsable_inscripto and b.razon_social is null
           then 'razón social' end,
      case when b.es_responsable_inscripto and b.domicilio_fiscal is null
           then 'domicilio' end
    ], null) as falta
  from base b
)
select e.*,
  case
    when e.facturable then 'completo'
    -- Sin un solo dato fiscal: es el estado de los 307 el día que se aplicó
    -- esta migración, y el que hay que poder filtrar para arrancar la carga.
    when not e.tiene_documento and not e.tiene_condicion and e.razon_social is null
      then 'sin_datos'
    else 'incompleto'
  end as estado_fiscal,
  array_to_string(e.falta, ', ') as falta_texto
from evaluado e;

comment on view v_cliente is
  'Los terceros a los que se les factura (equipo y sponsor) con su estado fiscal ya resuelto: si puede facturarse y qué le falta. El cálculo vive acá y no en la pantalla porque tiene un caso especial —el Responsable Inscripto necesita razón social y domicilio para la Factura A— y dos copias de esa regla se separan.';

-- ═══════════════════════════════════════════════════════════════════════════
-- `v_cliente_kpi` — el estado de la campaña de carga
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Los números del encabezado salen de acá y no de contar filas en el front
-- (regla 1). Una sola fila, como `v_socio_kpi` y `v_sponsor_kpi`.
--
-- El dato que hace falta ver de entrada: cuántos pueden facturarse de verdad.
-- El día que esto se aplicó eran **0 de 307**.

create view v_cliente_kpi as
select
  count(*)                                            as total,
  count(*) filter (where facturable)                  as facturables,
  count(*) filter (where estado_fiscal = 'sin_datos') as sin_datos,
  count(*) filter (where estado_fiscal = 'incompleto') as incompletos,
  count(*) filter (where tipo = 'equipo')             as equipos,
  count(*) filter (where tipo = 'sponsor')            as sponsors
from v_cliente;

comment on view v_cliente_kpi is
  'Una fila con el estado de carga fiscal de los clientes. Los números del encabezado de /clientes salen de acá: el front no cuenta.';
