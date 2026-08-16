-- ═══════════════════════════════════════════════════════════════════════════
-- Vistas de lectura de Cheques · v_cheque y v_cheque_kpi
--
-- ⚠️ PROPUESTA · NO APLICADA.
--
-- Con los dos eslabones construidos —recibidos que nacen del cobro, emitidos que
-- nacen del pago de un gasto— la tabla `cheque` ya se puede poblar. Faltaban las
-- vistas: hoy la única que la lee es `v_cashflow_comprometido`, y para proyectar,
-- no para mostrar.
--
-- ── Una sola vista para los dos sentidos ───────────────────────────────────
--
-- `sentido` es una columna, no dos vistas. La cartera responde una sola
-- pregunta —qué cheques hay dando vueltas— y separarlas obligaría a la pantalla
-- a unir dos consultas para sacar un total. La pantalla filtra por `sentido`,
-- igual que /gastos filtra por naturaleza.
--
-- ── Por qué los LEFT JOIN no multiplican ───────────────────────────────────
--
-- Un cheque tiene `pago_id` (si es recibido) O `gasto_id` (si es emitido), nunca
-- los dos. Los cuatro joins —tercero, gasto, cat_gasto, pago— son **FK a clave
-- primaria**, así que cada uno resuelve a lo sumo UNA fila. La vista tiene
-- exactamente una fila por cheque pase lo que pase con los datos.
--
-- (En v_activo hicieron falta subconsultas correlacionadas porque ahí el join
-- era a `gasto` por `activo_id`, que puede devolver varias. Acá no es el caso.)
--
-- ── Las derivadas, y por qué van en la vista ───────────────────────────────
--
-- `situacion` combina estado y fecha: un cheque `pendiente` con `fecha_cobro`
-- pasada es un problema operativo —nadie lo acreditó, o el banco no lo debitó—
-- y el estado solo no lo dice. Mismo patrón que `v_estado_cuota`.
--
-- `impacto` lleva el signo por sentido para que el front no escriba
-- `sentido === 'emitido' ? -monto : monto`. Es la convención de signo, no una
-- proyección: un cheque ya acreditado también lo trae.
--
-- `contraparte` resuelve el hueco del `tercero_id` NULL en emitidos: cae a la
-- categoría del gasto —«Operativos»— en vez de dejar la columna vacía. No es el
-- proveedor: `gasto` no registra a quién se le paga. Es lo mejor disponible
-- hasta que eso cambie, y es cambio de modelo aparte.
-- ═══════════════════════════════════════════════════════════════════════════


create or replace view v_cheque as
select
  ch.id                                   as cheque_id,
  ch.sentido,
  ch.numero,
  ch.banco,
  ch.monto,
  ch.estado,
  ch.fecha_emision,
  ch.fecha_cobro,
  ch.fecha_estado,
  ch.observaciones,

  -- Negativo = venció y sigue sin resolverse.
  (ch.fecha_cobro - current_date)::int    as dias_para_cobro,

  (ch.estado = 'pendiente' and ch.fecha_cobro < current_date)
                                          as vencido,

  case
    when ch.estado = 'pendiente' and ch.fecha_cobro < current_date then 'vencido'
    when ch.estado = 'pendiente'                                   then 'por_vencer'
    else ch.estado
  end                                     as situacion,

  -- Recibido suma, emitido resta: la misma convención que usa
  -- v_cashflow_comprometido para proyectarlos.
  case when ch.sentido = 'recibido' then ch.monto else -ch.monto end
                                          as impacto,

  -- ── El origen, unificado ─────────────────────────────────────────────────
  case
    when ch.pago_id  is not null then 'cobro'
    when ch.gasto_id is not null then 'gasto'
  end                                     as origen_tipo,

  coalesce(ch.pago_id, ch.gasto_id)       as origen_id,

  -- En recibidos, el equipo que pagó. En emitidos, la categoría del gasto,
  -- porque `gasto` no tiene tercero.
  coalesce(t.nombre, cg.nombre)           as contraparte,

  -- ── Trazabilidad ─────────────────────────────────────────────────────────
  ch.pago_id,
  ch.gasto_id,
  ch.asiento_alta_id,
  ch.asiento_cierre_id,
  ch.created_at

from cheque ch
left join tercero t    on t.id  = ch.tercero_id
left join gasto g      on g.id  = ch.gasto_id
left join cat_gasto cg on cg.id = g.cat_gasto_id;

comment on view v_cheque is
  'Un cheque por fila, recibidos y emitidos juntos con `sentido` como columna. '
  'Trae lo que la pantalla no puede calcular: días para el cobro, si venció, la '
  'situación derivada del estado y la fecha, y el impacto con signo. La '
  'contraparte es el tercero en recibidos y la categoría del gasto en emitidos, '
  'porque `gasto` no registra a quién se le paga.';


-- ── v_cheque_kpi ───────────────────────────────────────────────────────────
--
-- `en_cartera` y `a_pagar` están nombrados para espejar VALORES_A_DEPOSITAR y
-- CHEQUES_A_PAGAR: si divergen de esos saldos, hay un cheque cuyo asiento no se
-- hizo, o un asiento sin cheque. Sirve de control cruzado.
--
-- El `neto` va ADEMÁS de los dos, no en lugar de ellos. Tener $2.000.000 por
-- cobrar y $1.800.000 por pagar no es lo mismo que $200.000: son dos
-- movimientos en direcciones opuestas, y cada uno es una conversación distinta.
-- Mismo criterio que v_socio_kpi con los saldos a favor y en contra.

create or replace view v_cheque_kpi as
select
  coalesce(sum(monto) filter (where sentido = 'recibido' and estado = 'pendiente'), 0)::numeric(16,2)
                                          as en_cartera,
  coalesce(sum(monto) filter (where sentido = 'emitido'  and estado = 'pendiente'), 0)::numeric(16,2)
                                          as a_pagar,
  (coalesce(sum(monto) filter (where sentido = 'recibido' and estado = 'pendiente'), 0)
 - coalesce(sum(monto) filter (where sentido = 'emitido'  and estado = 'pendiente'), 0))::numeric(16,2)
                                          as neto,

  count(*) filter (where sentido = 'recibido' and estado = 'pendiente')::int
                                          as recibidos_pendientes,
  count(*) filter (where sentido = 'emitido'  and estado = 'pendiente')::int
                                          as emitidos_pendientes,

  -- Lo que hay que mirar hoy: pendiente y con la fecha pasada.
  count(*) filter (where vencido)::int    as vencidos,
  coalesce(sum(monto) filter (where vencido), 0)::numeric(16,2)
                                          as monto_vencido,

  -- Ventanas de 30 y 60 días, no de 7 y 30: los cheques del club son diferidos
  -- a 30/60, así que una ventana de una semana estaría casi siempre en cero y no
  -- diría nada. Éstas son las que se corresponden con cómo se emiten.
  count(*) filter (where estado = 'pendiente'
                     and fecha_cobro between current_date and current_date + 30)::int
                                          as proximos_30,
  count(*) filter (where estado = 'pendiente'
                     and fecha_cobro between current_date and current_date + 60)::int
                                          as proximos_60,

  count(*) filter (where estado = 'rechazado')::int
                                          as rechazados,
  count(*)::int                           as total

from v_cheque;

comment on view v_cheque_kpi is
  'Una fila siempre, también sin cheques: es una agregación sin group by. '
  'en_cartera y a_pagar deben coincidir con los saldos de VALORES_A_DEPOSITAR y '
  'CHEQUES_A_PAGAR — si divergen, hay un cheque sin asiento o al revés. El neto '
  'va además de los dos, no en lugar de ellos.';
