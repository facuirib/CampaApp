-- ═══════════════════════════════════════════════════════════════════════════
-- v_deuda_equipo_torneo · la deuda de un equipo EN UN TORNEO
--
-- `v_deuda_equipo` tiene grano EQUIPO: suma todos sus torneos en una fila. Es
-- lo correcto para la pregunta "cuánto debe este equipo", que es la que hace
-- quien reclama — la deuda es del equipo, no del torneo (concepto 5).
--
-- Pero por eso mismo **no se puede filtrar por torneo**. Un `where torneo_id =
-- X` sobre esa vista no existe (no tiene la columna), y agregársela sería peor:
-- filtraría las FILAS sin recalcular los MONTOS. Un equipo que debe $10.500.000
-- en Clausura y $11.100.000 en Apertura aparecería, filtrado por Clausura,
-- mostrando $21.600.000. Es decir, mentiría — y de la peor manera, porque el
-- número es plausible.
--
-- Esta vista es la misma pregunta con el otro grano: **una fila por equipo y
-- torneo**, con los montos restringidos a ese torneo. `/cobranza` la usa cuando
-- hay filtro; sin filtro sigue usando `v_deuda_equipo`.
--
-- Los criterios se copian de `v_deuda_equipo` línea por línea —qué cuenta como
-- impago, qué como vencido, cómo se descuenta lo imputado y lo usado de
-- anticipo, y que una cuota de jornada suspendida no vence— para que las dos
-- vistas no puedan discrepar en nada que no sea el corte por torneo.
--
-- ── La excepción, que es de fondo: `saldo_a_favor` NO se restringe ──────────
--
-- Un anticipo es del EQUIPO y no tiene torneo. Es la definición misma del
-- concepto 5: el sobrante de un cobro no se pierde ni se ata a nada, queda a
-- favor del equipo para imputarlo donde haga falta — incluso a un torneo que
-- todavía no empezó.
--
-- Así que esta columna repite, en cada fila del equipo, su saldo a favor total.
-- **Sumar la columna entre filas lo cuenta de más**: un equipo con $50.000 a
-- favor y fichas en dos torneos daría $100.000. La pantalla la muestra por fila
-- —donde es correcta— y NUNCA la totaliza. Es la única columna de la vista que
-- no responde "en este torneo".
--
-- Se deja igual, y no se omite, porque al operador que filtró por un torneo y
-- va a reclamar le importa saber que el equipo tiene plata a favor. Esconderla
-- ahorraría un error de suma a costa de un reclamo mal hecho.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_deuda_equipo_torneo as
select
  t.id                                  as tercero_id,
  t.nombre                              as equipo,
  t.email,
  et.torneo_id,
  tor.nombre                            as torneo,

  -- Reemplaza a `torneos_con_deuda`, que en este grano sería siempre 1 y no
  -- diría nada. Cuántas cuotas quedan impagas sí ubica el tamaño del reclamo.
  count(*) filter (
    where c.pagado_at is null
      and c.monto > coalesce(imp.imputado, 0)
  )                                     as cuotas_impagas,

  coalesce(sum(c.monto - coalesce(imp.imputado, 0))
    filter (where c.pagado_at is null), 0)                     as deuda_total,

  -- Una cuota de jornada suspendida no vence: el partido no se jugó.
  coalesce(sum(c.monto - coalesce(imp.imputado, 0)) filter (
    where c.pagado_at is null
      and c.vence_at < current_date
      and (j.id is null or j.estado <> 'suspendida')
  ), 0)                                                        as deuda_vencida,

  min(c.vence_at) filter (
    where c.pagado_at is null
      and (j.id is null or j.estado <> 'suspendida')
  )                                                            as vencimiento_mas_antiguo,

  -- Del EQUIPO, no del torneo. Ver la nota de arriba: no se suma entre filas.
  coalesce(anticipo.saldo, 0)                                  as saldo_a_favor

from tercero t
join equipo_torneo et on et.tercero_id = t.id
join torneo tor       on tor.id = et.torneo_id
join cuota c          on c.equipo_torneo_id = et.id
left join jornada j   on j.id = c.jornada_id

left join lateral (
  select coalesce(sum(pi.monto), 0)
       + coalesce((select sum(au.monto) from anticipo_uso au where au.cuota_id = c.id), 0)
         as imputado
    from pago_imputacion pi
   where pi.cuota_id = c.id
) imp on true

left join lateral (
  select sum(a.monto) - coalesce(sum(au.monto), 0) as saldo
    from anticipo a
    left join anticipo_uso au on au.anticipo_id = a.id
   where a.tercero_id = t.id
) anticipo on true

where t.tipo = 'equipo'
group by t.id, t.nombre, t.email, et.torneo_id, tor.nombre, anticipo.saldo;

comment on view public.v_deuda_equipo_torneo is
  'Una fila por equipo Y TORNEO, con los montos restringidos a ese torneo. La '
  'usa /cobranza cuando hay filtro por torneo; sin filtro va v_deuda_equipo, '
  'que suma todos. Mismos criterios de impago y vencido. EXCEPCIÓN: '
  'saldo_a_favor es del equipo y no del torneo —un anticipo no tiene torneo—, '
  'así que se repite en cada fila y NO se suma entre filas.';
