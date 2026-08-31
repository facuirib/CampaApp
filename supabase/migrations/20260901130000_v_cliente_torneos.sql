-- ─────────────────────────────────────────────────────────────────────────────
-- Cuántos torneos jugó cada equipo
--
-- Commit 2 de A1: la lista de equipos muestra «Torneos», que es lo que vuelve
-- visible la idea de fondo — el equipo es más grande que un torneo.
--
-- Va en la vista y no en la pantalla porque es un conteo, y ningún número
-- visible se calcula en el front (regla 1). `create or replace` alcanza:
-- la columna se agrega AL FINAL, que es lo único que Postgres permite sin
-- dropear.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_cliente as
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
      and nullif(btrim(t.doc_nro_default), '') is not null as tiene_documento,
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
  array_to_string(falta, ', ') as falta_texto,
  -- ── La columna nueva, al final ────────────────────────────────────────────
  -- Cuenta fichas, no torneos distintos: un equipo tiene a lo sumo una ficha
  -- por torneo (lo garantiza la unicidad de equipo_torneo), así que son lo
  -- mismo — y contar fichas no necesita el distinct.
  (select count(*) from equipo_torneo et where et.tercero_id = e.tercero_id)::int as torneos
from evaluado e;
