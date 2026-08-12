-- ═══════════════════════════════════════════════════════════════════════════
-- SOCIOS · las dos vistas que sostienen la lista
--
-- `/socios` nació como un bloque grande por socio —tres KpiCards y la tabla
-- mensual completa, apilados— y con DOS socios y TRES meses ya ocupa más de una
-- pantalla. Es la misma forma que tenía sponsors antes de partirse.
--
-- Con un agravante que sponsors no tenía: **la tabla mensual no tiene techo**.
-- Un contrato de sponsor se termina; el sueldo de un socio se devenga todos los
-- meses mientras sea socio. `devengar_sueldos_socios` corre una vez por mes y
-- `v_socio_detalle_mensual` agrupa por período, así que son 12 filas por socio
-- por año, para siempre. A los dos años de operación, encontrar a un socio es
-- scrollear a ciegas y comparar dos es imposible: nunca entran juntos.
--
-- Se parte en lista + detalle, el molde de cobranza y de sponsors. Estas dos
-- vistas son lo que la LISTA necesita, y existen por la regla 1: **el front no
-- suma**.
--
--   · v_socio_lista → una fila por SOCIO, con su sueldo vigente y su estado
--   · v_socio_kpi   → una sola fila con los totales de todos
--
-- Las dos son de sólo lectura y aditivas. `v_saldo_socio` y
-- `v_socio_detalle_mensual` **no se tocan**: el detalle las sigue usando tal
-- cual, y la tabla mensual se muda a `/socios/[socioId]` sin un cambio.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · v_socio_lista — una fila por socio
--
-- Arranca de `tercero` con LEFT JOIN y no de `v_saldo_socio`, así que un socio
-- recién cargado y todavía sin un solo asiento APARECE, con ceros y estado
-- `sin_sueldo`. Mismo criterio que `v_sponsor_lista` con `sin_contrato`: si se
-- cargó, alguien lo va a buscar, y una lista donde no está se lee como que no
-- existe.
--
-- ── El signo del saldo, que es de lo que depende el estado ──────────────────
--
-- `SOCIOS_A_PAGAR` es PASIVO: su saldo natural es haber − debe. El devengo va
-- al HABER —el club le reconoce el sueldo del mes— y el retiro va al DEBE —el
-- club le paga y cancela ese pasivo—. Entonces:
--
--   saldo > 0  →  el CLUB le debe al socio. Devengó más de lo que retiró.
--   saldo < 0  →  el SOCIO le debe al club. Retiró de más.
--
-- El que pide atención es el NEGATIVO, y por eso es el que gana el orden de
-- prioridad. `crear_retiro_socio` no valida saldo suficiente a propósito
-- (decisión 71): retirar de más es un caso previsto, no un error — pero tiene
-- que verse.
--
-- ── El sueldo vigente ───────────────────────────────────────────────────────
--
-- `sueldo_socio` es un historial versionado: `(socio_id, monto, vigente_desde)`
-- SIN `vigente_hasta`. Una fila nueva no cierra la anterior, la reemplaza de esa
-- fecha en adelante, y el vigente en un momento dado es el de `vigente_desde`
-- más alto que ya haya empezado. Un aumento pactado para el mes que viene está
-- cargado pero NO rige: `vigente_desde > current_date` no entra, que es lo
-- correcto — la lista dice lo que se cobra hoy, no lo que se va a cobrar.
--
-- Se resuelve con UN `left join lateral` del que salen el monto y la fecha
-- JUNTOS. Podría llamarse a `sueldo_vigente()` para el monto y buscar la fecha
-- aparte, pero entonces el monto y la fecha podrían venir de filas distintas si
-- alguna vez difirieran los criterios. Prefiero que dentro de la vista no
-- puedan discrepar.
--
-- > El precio de esa decisión: esto **repite la regla** de `sueldo_vigente()`,
-- > que es la que usa `devengar_sueldos_socios` para decidir cuánto asentar. Si
-- > la regla cambia, hay que cambiar las dos. Verificado que hoy coinciden en
-- > los dos socios; queda anotado como el punto a tocar en pareja.
--
-- Esto cierra la deuda anotada en decisiones.md § Abiertas ("El sueldo vigente
-- de un socio no está en ninguna vista"), que estaba fechada "cuando se
-- construya la escritura". La lista lo necesita antes: un saldo en cero no
-- distingue "todavía no se devengó nada" de "se retiró todo lo devengado".
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_socio_lista as
select
  t.id                                as socio_id,
  t.nombre                            as socio,
  t.activo,

  sv.monto                            as sueldo_vigente,
  sv.vigente_desde,

  coalesce(s.devengado, 0)            as devengado,
  coalesce(s.retirado,  0)            as retirado,
  coalesce(s.saldo,     0)            as saldo,

  -- Meses con movimiento, no meses transcurridos: es exactamente la cantidad
  -- de filas que va a tener la tabla del detalle. Sirve para saber, desde la
  -- lista, si entrar vale la pena.
  coalesce(m.meses, 0)                as meses_con_movimiento,

  -- El orden de los casos ES la definición del estado, del que más pide
  -- atención al que menos. Un socio con el saldo en contra que además no tiene
  -- sueldo acordado sigue siendo, antes que nada, un socio que retiró de más.
  case
    when coalesce(s.saldo, 0) < 0 then 'en_contra'
    when sv.monto is null         then 'sin_sueldo'
    when coalesce(s.saldo, 0) = 0 then 'al_dia'
    else                               'a_favor'
  end                                 as estado

from tercero t

left join v_saldo_socio s
       on s.socio_id = t.id

left join lateral (
  select sm.monto, sm.vigente_desde
    from sueldo_socio sm
   where sm.socio_id = t.id
     and sm.vigente_desde <= current_date
   order by sm.vigente_desde desc
   limit 1
) sv on true

left join lateral (
  select count(*) as meses
    from v_socio_detalle_mensual d
   where d.socio_id = t.id
) m on true

where t.tipo = 'socio';

comment on view public.v_socio_lista is
  'Una fila por socio, con su sueldo vigente y el estado derivado '
  '(en_contra / sin_sueldo / al_dia / a_favor). Base de la lista de /socios. '
  'saldo > 0 = el club le debe al socio; saldo < 0 = el socio retiró de más. '
  'Incluye socios sin ningún movimiento, con ceros.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · v_socio_kpi — los totales de arriba, en una fila
--
-- Los números del encabezado de /socios. Existe por la regla 1: sin ella la
-- pantalla tendría que sumar la columna de la tabla, y ese es exactamente el
-- `.reduce()` que no va. Hoy la pantalla directamente NO muestra totales entre
-- socios, por eso mismo.
--
-- Suma `v_socio_lista` y NO `v_saldo_socio`, aunque las dos darían lo mismo
-- hoy. Sumando la lista, el encabezado y la tabla que está debajo salen de la
-- MISMA fuente: no pueden discrepar ni siquiera si mañana la lista cambia de
-- criterio —si empezara a excluir socios inactivos, por ejemplo, el total de
-- arriba los excluiría solo—. Es el mismo argumento de `v_sponsor_kpi`.
--
-- `saldo_a_favor` y `saldo_en_contra` van SEPARADOS y no netos, a propósito.
-- Un club que le debe $3.400.000 a uno y al que otro le debe $450.000 no está
-- en la misma situación que uno con $2.950.000 netos a pagar: son dos
-- movimientos de plata distintos, en direcciones distintas, con dos
-- conversaciones distintas. El neto se puede leer restando; lo que no se puede
-- es recuperar las dos mitades de un neto.
--
-- Es una agregación sin `group by`, así que devuelve UNA fila siempre, también
-- con cero socios: la pantalla nunca se queda sin encabezado.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_socio_kpi as
select
  count(*)                                                as socios,
  count(*) filter (where activo)                          as socios_activos,
  count(*) filter (where estado = 'en_contra')            as socios_en_contra,
  count(*) filter (where estado = 'sin_sueldo')           as socios_sin_sueldo,

  -- La masa salarial mensual comprometida: lo que va a devengar el mes que
  -- viene si nadie cambia nada. Los socios sin sueldo acordado no suman.
  coalesce(sum(sueldo_vigente), 0)                        as sueldo_mensual,

  coalesce(sum(devengado), 0)                             as devengado,
  coalesce(sum(retirado),  0)                             as retirado,

  coalesce(sum(saldo) filter (where saldo > 0), 0)        as saldo_a_favor,
  -- En positivo, para que la pantalla lo muestre como un monto y no como un
  -- número negativo que hay que interpretar. El rótulo dice la dirección.
  coalesce(-sum(saldo) filter (where saldo < 0), 0)       as saldo_en_contra
from v_socio_lista;

comment on view public.v_socio_kpi is
  'Los totales de todos los socios, en una fila. Suma v_socio_lista para que el '
  'encabezado y la tabla de /socios no puedan discrepar. saldo_a_favor y '
  'saldo_en_contra van separados, no neteados: son dos direcciones de plata. '
  'Devuelve una fila siempre, también sin socios.';
