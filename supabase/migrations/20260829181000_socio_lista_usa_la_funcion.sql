-- ═══════════════════════════════════════════════════════════════════════════
-- `v_socio_lista` llama a la función en vez de repetir la regla
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La vista resolvía el sueldo vigente con un `left join lateral` propio —el de
-- 20260812111231—, que es **la misma regla** que ya vive en `sueldo_vigente()`:
-- la fila de mayor `vigente_desde <= fecha`. La migración original lo anotó
-- como precio consciente («queda anotado como el punto a tocar en pareja»),
-- con un argumento razonable: del lateral salen el monto y la fecha JUNTOS, de
-- la misma fila, así que no pueden discrepar entre sí.
--
-- Ese precio se termina de pagar ahora. La etapa que viene mete un tercer
-- jugador —la excepción por mes— y con tres copias de la regla, «tocar en
-- pareja» pasa a ser «acordarse de tres lugares». La copia que se olvide no
-- avisa: muestra otro número.
--
-- Y el argumento del lateral se sostiene igual. El monto sale de la función; la
-- fecha, de un `max(vigente_desde <= hoy)`, que **es el mismo selector escrito
-- como agregado**: la fila que elige la función es, por definición, la de ese
-- `max`. No son dos criterios que puedan divergir en el monto — son el mismo
-- criterio, y sólo uno de los dos decide plata.
--
-- Nada más cambia. `v_socio_kpi` suma esta vista y no se toca.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_socio_lista as
select
  t.id                                as socio_id,
  t.nombre                            as socio,
  t.activo,

  -- Una llamada, no una copia de la regla.
  --
  -- El `::numeric(16,2)` no es cosmético: la función declara `numeric` a secas y
  -- la columna de la vista venía tipada por `sueldo_socio.monto`, que es
  -- `numeric(16,2)`. Sin el cast, el `create or replace` no compila —«cannot
  -- change data type of view column»— y, si compilara, la vista dejaría de
  -- respetar la regla 2 sobre el tipo de la plata.
  sueldo_vigente(t.id, current_date)::numeric(16,2) as sueldo_vigente,

  -- La fecha desde la que rige ese monto. Es un rótulo de pantalla —«$X por mes
  -- desde el 01/03»—, no un número que se sume: el `max` es el mismo selector
  -- de la función, dicho como agregado.
  (select max(sm.vigente_desde)
     from sueldo_socio sm
    where sm.socio_id = t.id
      and sm.vigente_desde <= current_date) as vigente_desde,

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
    when coalesce(s.saldo, 0) < 0                    then 'en_contra'
    when sueldo_vigente(t.id, current_date) is null  then 'sin_sueldo'
    when coalesce(s.saldo, 0) = 0                    then 'al_dia'
    else                                                  'a_favor'
  end                                 as estado

from tercero t

left join v_saldo_socio s
       on s.socio_id = t.id

left join lateral (
  select count(*) as meses
    from v_socio_detalle_mensual d
   where d.socio_id = t.id
) m on true

where t.tipo = 'socio';

comment on view public.v_socio_lista is
  'Una fila por socio, con su sueldo vigente y el estado derivado '
  '(en_contra / sin_sueldo / al_dia / a_favor). Base de la lista de /socios. '
  'El sueldo sale de la función, no de una copia de la regla. '
  'saldo > 0 = el club le debe al socio; saldo < 0 = el socio retiró de más. '
  'Incluye socios sin ningún movimiento, con ceros.';
