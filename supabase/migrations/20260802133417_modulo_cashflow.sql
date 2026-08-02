-- Módulo Cashflow · flujo de fondos con niveles de certeza
--
-- Decisiones 83 a 88. Arquitectura §3.10.
--
-- Sin estructura nueva: son cuatro vistas que integran lo que los módulos
-- anteriores ya producen. El cashflow LEE lo que cada patrón de reconocimiento
-- generó; no cambia cómo se reconoce nada.
--
-- Convención de signo: `monto` positivo = ENTRA, negativo = SALE.
--
-- EL CORTE POR FECHA (decisión 86, resuelta):
--   REAL          fecha <= hoy   los hechos son hechos
--   COMPROMETIDO  fecha >= hoy   + las vencidas impagas arrastradas a hoy
--   ESTIMADO      fecha >  hoy   estrictamente futuro
--
-- El corte existe porque la anti-duplicación NO alcanza del lado de egresos:
-- ESTIMADO sale del presupuesto, no de los gastos, y pagar un gasto no achica el
-- presupuesto. Con el corte, la exclusión es estructural — una fecha es pasada o
-- futura, nunca las dos— y no depende de emparejar líneas de presupuesto con
-- gastos.
--
-- El corte se aplica entre REAL y ESTIMADO, que es donde está el riesgo.
-- COMPROMETIDO se autoexcluye por estado: la cuota cobrada tiene saldo 0 y la de
-- sponsor cobrada tiene cobrado_at.


-- 1 · REAL · el movimiento de las cajas (decisión 84) -------------------------
--
-- Sale de las cuentas que apunta caja.cuenta_id, por asiento.fecha.
--
-- POR CAJA Y NO POR tipo ingreso/egreso: los gastos van por devengo y los
-- sueldos de socios también, así que GAS_* y SOCIOS_A_PAGAR no son caja. Solo
-- los ingresos de equipos coinciden, por percibido puro. Se cuenta lo que tocó
-- caja.
--
-- TODAS LAS CAJAS AGREGADAS, y eso resuelve un problema solo: los traslados
-- predio->central y las compras de USD mueven plata ENTRE dos cuentas de caja,
-- así que al agrupar por fecha suman cero y no ensucian el flujo. El flujo real
-- es el movimiento de la POSICIÓN de caja, no de cada caja por separado.
--
-- No filtra anulados: original y contraasiento se netean solos, y filtrar solo
-- el original dejaría el contra huérfano (mismo criterio que v_saldo_caja).

create view v_cashflow_real as
select a.fecha,
       'real'::text                 as nivel,
       a.origen,
       sum(l.debe - l.haber)        as monto
from asiento_linea l
join asiento a on a.id = l.asiento_id
join cuenta  c on c.id = l.cuenta_id
where c.id in (select cuenta_id from caja where activo)
  and a.fecha <= current_date
group by a.fecha, a.origen
having sum(l.debe - l.haber) <> 0;

comment on view v_cashflow_real as
  'Movimiento neto de la posición de caja por fecha. Agrega TODAS las cajas, así '
  'los traslados internos (predio->central, compra/venta USD) se netean solos.';


-- 2 · COMPROMETIDO · lo pactado con fecha (decisión 83) -----------------------
--
-- Se autoexcluye por estado, así que no necesita el corte para no duplicar: la
-- cuota cobrada tiene saldo 0 y desaparece sola.
--
-- LAS VENCIDAS IMPAGAS SE ARRASTRAN A HOY. Tienen vence_at pasado y se siguen
-- esperando: mostrarlas en su fecha vieja pondría plata futura en el pasado y
-- rompería la lectura de la proyección. Se reubican en la semana en curso —
-- fechándolas hoy, que cae en la semana en curso por construcción— y se conserva
-- `fecha_original` para el drill-down.

create view v_cashflow_comprometido as

-- Cuotas de equipos: el SALDO pendiente, no el monto (hay parciales).
-- v_estado_cuota ya excluye las de jornada suspendida vía su columna de estado
-- (decisión 51): no se proyecta lo que nadie va a reclamar.
select greatest(ec.vence_at, current_date)  as fecha,
       ec.vence_at                          as fecha_original,
       'comprometido'::text                 as nivel,
       'cuota_equipo'::text                 as origen,
       t.nombre                             as detalle,
       ec.saldo                             as monto,
       ec.vence_at < current_date           as arrastrada
from v_estado_cuota ec
join equipo_torneo et on et.id = ec.equipo_torneo_id
join tercero t        on t.id = et.tercero_id
where ec.saldo > 0
  and ec.estado <> 'suspendida'

union all

-- Cuotas de sponsors: la fuente más limpia del sistema. v_cuotas_sponsor_futuras
-- ya filtra cobrado_at null y fecha >= hoy.
select q.fecha_cobro,
       q.fecha_cobro,
       'comprometido',
       'cuota_sponsor',
       q.sponsor,
       q.monto,
       false
from v_cuotas_sponsor_futuras q

union all

-- Egresos comprometidos con fecha. `compromiso` es genérica y lleva sentido:
-- 'pagar' sale (negativo), 'cobrar' entra. Hoy está casi vacía —solo la escribe
-- generar_cuotas_plan— así que se suma lo que haya.
select greatest(cm.vence_at, current_date),
       cm.vence_at,
       'comprometido',
       'compromiso_' || cm.tipo,
       coalesce(t.nombre, cm.descripcion),
       case when cm.sentido = 'pagar' then -cm.monto else cm.monto end,
       cm.vence_at < current_date
from compromiso cm
left join tercero t on t.id = cm.tercero_id
where cm.estado = 'pendiente'

union all

-- Cheques pendientes, por su fecha de cobro.
select greatest(ch.fecha_cobro, current_date),
       ch.fecha_cobro,
       'comprometido',
       'cheque_' || ch.sentido,
       coalesce(t.nombre, 'Cheque ' || ch.numero),
       case when ch.sentido = 'emitido' then -ch.monto else ch.monto end,
       ch.fecha_cobro < current_date
from cheque ch
left join tercero t on t.id = ch.tercero_id
where ch.estado = 'pendiente';

comment on view v_cashflow_comprometido as
  'Lo pactado con fecha. Las cuotas usan el SALDO pendiente, no el monto. Las '
  'vencidas impagas se arrastran a hoy —se siguen esperando— conservando '
  'fecha_original para el drill-down.';


-- 3 · ESTIMADO · el presupuesto distribuido por el calendario (decisión 85) ---
--
-- v_presupuesto_total da un TOTAL sin dimensión temporal. Se reparte con el
-- calendario que ya existe, para que el costo caiga donde la actividad ocurre y
-- no en un bulto mensual.
--
-- SOLO FECHAS FUTURAS (> hoy). Es el corte que impide duplicar con lo real ya
-- pagado: si agosto ya pasó, lo de agosto lo cuenta REAL y el estimado no lo
-- toca.
--
-- Todo en negativo: el presupuesto es de egresos.
--
-- NOTA: las unidades `anual` y `unico` NO ENTRAN. No tienen fecha natural —su
-- factor es 1 y el presupuesto no dice cuándo se pagan— e inventarles una sería
-- ubicar plata donde no se sabe que ocurre. Quedan fuera de la línea de tiempo y
-- hay que darles fecha para proyectarlas.

create view v_cashflow_estimado as

-- por_partido: cae en las fechas de las jornadas, cada una con SUS partidos.
-- Liga = equipos de la serie / 2 (decisión 45); playoff = cantidad_partidos, que
-- es dato (decisión 67).
select j.fecha,
       'estimado'::text          as nivel,
       'presupuesto_partido'::text as origen,
       cg.nombre                 as detalle,
       -(pt.base * pt.cantidad *
          case when j.es_playoff then j.cantidad_partidos::numeric
               else (select count(*)::numeric / 2
                       from equipo_torneo et where et.serie_id = j.serie_id)
          end)                   as monto
from v_presupuesto_total pt
join cat_gasto cg on cg.id = pt.cat_gasto_id
join categoria c  on c.torneo_id = pt.torneo_id
join serie s      on s.categoria_id = c.id
join jornada j    on j.serie_id = s.id
where pt.unidad = 'por_partido'
  and j.estado <> 'suspendida'
  and j.fecha > current_date

union all

-- por_dia_cancha: uno por cada día de operación del torneo.
select dct.fecha,
       'estimado',
       'presupuesto_dia_cancha',
       cg.nombre,
       -(pt.base * pt.cantidad)
from v_presupuesto_total pt
join cat_gasto cg on cg.id = pt.cat_gasto_id
join v_dia_cancha_torneo dct on dct.torneo_id = pt.torneo_id
where pt.unidad = 'por_dia_cancha'
  and dct.fecha > current_date

union all

-- por_mes: parejo, al cierre de cada mes del ejercicio.
select m.fin,
       'estimado',
       'presupuesto_mensual',
       cg.nombre,
       -(pt.base * pt.cantidad)
from v_presupuesto_total pt
join cat_gasto cg on cg.id = pt.cat_gasto_id
join ejercicio e  on e.id = pt.ejercicio_id
cross join lateral (
  select (d + interval '1 month - 1 day')::date as fin
  from generate_series(date_trunc('month', e.fecha_desde),
                       date_trunc('month', e.fecha_hasta),
                       interval '1 month') d
) m
where pt.unidad = 'por_mes'
  and m.fin > current_date;

comment on view v_cashflow_estimado as
  'Presupuesto distribuido por el calendario, SOLO a futuro. El corte por fecha '
  'es lo que impide duplicar con lo real ya pagado (decisión 86). Las unidades '
  'anual y unico no entran: no tienen fecha natural.';


-- 4 · v_cashflow · la línea de tiempo (decisiones 83 y 87) --------------------
--
-- La semana se DERIVA con date_trunc: no hay tabla de semanas, y no debe
-- haberla — una semana no es un período contable.
--
-- El saldo acumulado arranca del saldo de caja de hoy y va sumando el flujo
-- futuro: es la respuesta a "¿cuánta plata voy a tener?", que es la pregunta.

create view v_cashflow as
with flujo as (
  select fecha, nivel, origen, null::text as detalle, monto from v_cashflow_real
  union all
  select fecha, nivel, origen, detalle, monto from v_cashflow_comprometido
  union all
  select fecha, nivel, origen, detalle, monto from v_cashflow_estimado
),
por_semana as (
  select date_trunc('week', fecha)::date as semana,
         date_trunc('month', fecha)::date as mes,
         -- `real` es nombre de tipo en Postgres: las columnas van con prefijo.
         sum(monto) filter (where nivel = 'real')          as monto_real,
         sum(monto) filter (where nivel = 'comprometido')  as monto_comprometido,
         sum(monto) filter (where nivel = 'estimado')      as monto_estimado,
         sum(monto)                                        as flujo_neto,
         sum(monto) filter (where monto > 0)               as entradas,
         sum(monto) filter (where monto < 0)               as salidas
  from flujo
  group by 1, 2
)
select s.semana,
       s.mes,
       coalesce(s.monto_real, 0)         as monto_real,
       coalesce(s.monto_comprometido, 0) as monto_comprometido,
       coalesce(s.monto_estimado, 0)     as monto_estimado,
       coalesce(s.entradas, 0)     as entradas,
       coalesce(s.salidas, 0)      as salidas,
       s.flujo_neto,
       -- Saldo proyectado: la caja de hoy más el flujo futuro acumulado. Las
       -- semanas pasadas no acumulan, porque su plata ya está en el saldo.
       (select coalesce(sum(saldo), 0) from v_saldo_caja)
         + sum(case when s.semana >= date_trunc('week', current_date)::date
                    then s.flujo_neto else 0 end)
           over (order by s.semana rows between unbounded preceding and current row)
                                   as saldo_proyectado,
       s.semana >= date_trunc('week', current_date)::date as futura
from por_semana s;

comment on view v_cashflow as
  'Línea de tiempo semanal con los tres niveles, el flujo neto y el saldo '
  'proyectado (caja de hoy + flujo futuro acumulado). La semana se deriva con '
  'date_trunc; no hay tabla de semanas (decisión 87).';


-- El quiebre: la alerta más valiosa del sistema (§3.16). Avisar en julio que en
-- septiembre falta plata es para lo que se construyó todo esto.
create view v_cashflow_quiebre as
select semana, mes, saldo_proyectado, flujo_neto
from v_cashflow
where futura
  and saldo_proyectado < 0
order by semana;

comment on view v_cashflow_quiebre as
  'Semanas futuras en las que el saldo proyectado perfora cero. Vacía = no hay '
  'quiebre previsto.';
