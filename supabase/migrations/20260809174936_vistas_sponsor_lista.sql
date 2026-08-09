-- ═══════════════════════════════════════════════════════════════════════════
-- SPONSORS · las dos vistas que sostienen la lista
--
-- La pantalla de sponsors nació como un bloque grande por contrato —cuatro
-- KpiCards y dos tablas cada uno— y con tres contratos de prueba ya ocupa tres
-- pantallas. Con quince o veinte sponsors reales es un scroll infinito y no hay
-- forma de comparar dos: hay que recordarlos.
--
-- Se parte en lista + detalle, el molde de cobranza. Estas vistas son lo que la
-- LISTA necesita, y las dos existen por la misma razón: **el front no suma**.
--
--   · v_sponsor_lista  → una fila por SPONSOR, agregando sus contratos
--   · v_sponsor_kpi    → una sola fila con los totales de todos
--
-- Las dos son de sólo lectura y aditivas: derivan de `v_estado_sponsor` y
-- `v_cuotas_sponsor`, que ya existen, y no tocan nada.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · v_sponsor_lista — una fila por sponsor
--
-- El grano de `v_estado_sponsor` es el CONTRATO, y un sponsor puede tener más
-- de uno: un contrato anual que se renueva, o dos por conceptos distintos. Una
-- lista con una fila por contrato mostraría el mismo sponsor dos veces con
-- cifras parciales, y al operador que pregunta "cuánto nos debe Bodega" hay que
-- contestarle una vez.
--
-- Con un solo contrato —el caso normal— la fila coincide exactamente con la del
-- contrato. Con dos, suma los dos. Esa suma se hace ACÁ y no en la pantalla.
--
-- Arranca de `tercero` con LEFT JOIN y no de `v_estado_sponsor`, así que un
-- sponsor cargado y todavía sin contrato APARECE, con ceros y estado
-- `sin_contrato`. Es deliberado: si se cargó, alguien lo va a buscar, y una
-- lista donde no está se lee como que no existe.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_sponsor_lista as
with agregado as (
  select
    t.id                                    as sponsor_id,
    t.nombre                                as sponsor,
    t.activo,
    t.email,
    count(e.contrato_id)                    as contratos,
    coalesce(sum(e.monto_total), 0)         as contratado,
    coalesce(sum(e.devengado), 0)           as reconocido,
    coalesce(sum(e.pendiente_devengar), 0)  as pendiente_devengar,
    coalesce(sum(e.cobrado), 0)             as cobrado,
    coalesce(sum(e.pendiente_cobrar), 0)    as pendiente_cobrar,
    coalesce(sum(e.cuotas), 0)              as cuotas,
    coalesce(sum(e.cuotas_pendientes), 0)   as cuotas_pendientes,
    -- La vigencia del sponsor es la envolvente de sus contratos: desde el
    -- primero que empezó hasta el último que termina.
    min(e.vigente_desde)                    as vigente_desde,
    max(e.vigente_hasta)                    as vigente_hasta
  from tercero t
  left join v_estado_sponsor e on e.sponsor_id = t.id
  where t.tipo = 'sponsor'
  group by t.id, t.nombre, t.activo, t.email
)
select
  a.*,
  (select count(*)
     from v_cuotas_sponsor q
    where q.sponsor_id = a.sponsor_id and q.estado = 'vencida') as cuotas_vencidas,
  -- El orden de los casos ES la definición del estado, de lo más urgente a lo
  -- más tranquilo. Un sponsor en mora que además tiene todo lo demás al día
  -- sigue siendo un sponsor en mora: la deuda vencida gana sobre el resto.
  case
    when a.contratos = 0 then 'sin_contrato'
    when exists (select 1 from v_cuotas_sponsor q
                  where q.sponsor_id = a.sponsor_id and q.estado = 'vencida') then 'en_mora'
    when a.pendiente_cobrar = 0 then 'saldado'
    else 'al_dia'
  end as estado
from agregado a;

comment on view public.v_sponsor_lista is
  'Una fila por sponsor, agregando todos sus contratos, con el estado derivado '
  '(sin_contrato / en_mora / saldado / al_dia). Base de la lista de /sponsors. '
  'Incluye sponsors sin contrato, con ceros.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · v_sponsor_kpi — los totales de arriba, en una fila
--
-- Los cuatro números del encabezado de /sponsors. Existe por la regla 1: sin
-- ella la pantalla tendría que sumar la columna de la tabla para mostrarlos, y
-- ese es exactamente el `.reduce()` que no va.
--
-- Suma `v_sponsor_lista` y NO `v_estado_sponsor`, aunque las dos darían lo
-- mismo hoy. Sumando la lista, el encabezado y la tabla que está debajo salen
-- de la MISMA fuente: no pueden discrepar ni siquiera si mañana la lista cambia
-- de criterio —si empezara a excluir sponsors inactivos, por ejemplo, el total
-- de arriba los excluiría solo—. Es el mismo argumento por el que
-- v_sponsor_detalle_mensual deriva del diario y no de devengo_sponsor.
--
-- Es una agregación sin `group by`, así que devuelve UNA fila siempre, también
-- con cero sponsors: la pantalla nunca se queda sin encabezado.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_sponsor_kpi as
select
  count(*)                                        as sponsors,
  count(*) filter (where estado = 'en_mora')      as sponsors_en_mora,
  coalesce(sum(contratos), 0)                     as contratos,
  coalesce(sum(contratado), 0)                    as contratado,
  coalesce(sum(reconocido), 0)                    as reconocido,
  coalesce(sum(pendiente_devengar), 0)            as pendiente_devengar,
  coalesce(sum(cobrado), 0)                       as cobrado,
  coalesce(sum(pendiente_cobrar), 0)              as pendiente_cobrar,
  coalesce(sum(cuotas_vencidas), 0)               as cuotas_vencidas
from v_sponsor_lista;

comment on view public.v_sponsor_kpi is
  'Los totales de todos los sponsors, en una fila. Suma v_sponsor_lista para '
  'que el encabezado y la tabla de /sponsors no puedan discrepar. Devuelve una '
  'fila siempre, también sin sponsors.';
