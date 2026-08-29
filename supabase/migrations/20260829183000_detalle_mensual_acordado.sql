-- ═══════════════════════════════════════════════════════════════════════════
-- El detalle mensual del socio dice qué se había ACORDADO para ese mes
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `v_socio_detalle_mensual` muestra devengado, retirado, neto y saldo
-- acumulado: todo lo que PASÓ. Le falta lo que se había pactado — y sin eso, un
-- mes devengado por $1.200.000 no se distingue de un error, porque no hay con
-- qué compararlo. Con la excepción por mes ya en la base, la comparación deja
-- de ser cosmética: es exactamente la que dice si el mes salió como se acordó.
--
--   acordado      lo que correspondía ese mes, según sueldo_acordado()
--   es_excepcion  si ese monto vino de una excepción y no de la vigencia
--
-- La fecha con la que se resuelve es **fin de mes**, la misma que usa
-- `devengar_sueldos_socios` para asentar. Cualquier otra —el día 1, hoy— haría
-- que la columna dijera algo distinto de lo que se devengó, que es justo lo
-- contrario de para qué está.
--
-- `acordado` y `devengado` van a coincidir casi siempre, y esa es la idea: la
-- fila que importa es la que NO coincide. Pueden diferir por tres razones
-- legítimas, y las tres se leen mejor con las dos columnas al lado:
--
--   · el mes no se devengó todavía  → acordado con devengado en cero
--   · el socio entró a mitad de año → acordado en blanco en los meses previos
--   · se anuló y rehízo el devengo  → el asiento manda, y se ve la diferencia
--
-- Las dos columnas van AL FINAL: `create or replace view` no admite meterlas en
-- el medio, y de esta vista cuelga el `meses_con_movimiento` de la lista.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_socio_detalle_mensual as
with mov as (
  select
    t.id      as socio_id,
    t.nombre,
    p.id      as periodo_id,
    p.anio,
    p.mes,
    sum(l.haber) as devengado,
    sum(l.debe)  as retirado
  from tercero t
  join asiento_linea l on l.tercero_id = t.id
  join cuenta c        on c.id = l.cuenta_id and c.codigo = 'SOCIOS_A_PAGAR'
  join asiento a       on a.id = l.asiento_id
  join periodo p       on p.id = a.periodo_id
  where t.tipo = 'socio'
  group by t.id, t.nombre, p.id, p.anio, p.mes
)
select
  socio_id,
  nombre,
  periodo_id,
  anio,
  mes,
  devengado,
  retirado,
  devengado - retirado as neto,
  sum(devengado - retirado) over (
    partition by socio_id order by anio, mes
    rows between unbounded preceding and current row
  ) as saldo_acumulado,

  -- Fin de mes, la misma fecha con la que devenga la función.
  sueldo_acordado(
    socio_id,
    (make_date(anio, mes, 1) + interval '1 month - 1 day')::date
  )::numeric(16,2) as acordado,

  es_sueldo_excepcion(
    socio_id,
    (make_date(anio, mes, 1) + interval '1 month - 1 day')::date
  ) as es_excepcion
from mov;

comment on view public.v_socio_detalle_mensual is
  'Un mes por fila para cada socio: lo acordado, lo devengado, lo retirado, el '
  'neto y el saldo acumulado. `acordado` sale de sueldo_acordado() a fin de mes '
  '—la misma fecha con la que devenga la función— y `es_excepcion` dice si ese '
  'monto vino de una excepción. La fila que importa es la que no coincide.';
