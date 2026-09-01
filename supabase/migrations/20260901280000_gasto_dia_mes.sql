-- ─────────────────────────────────────────────────────────────────────────────
-- Cuándo sale la plata de los gastos, día por día
--
-- Ola 4 · alineación del dashboard con el mockup.
--
-- ── 🔴 Por qué NO se llama «día de vencimiento» ────────────────────────────
--
-- El mockup rotula este gráfico «cómo se distribuyen los gastos en el mes» y lo
-- explica con «los gastos caen en su día de vencimiento real».
--
-- **En CAMPA un gasto NO tiene fecha de vencimiento.** La tabla `gasto` tiene
-- `devengado_at` —cuándo se reconoce— y `pagado_at` —cuándo se pagó—, y nada
-- más. No hay una fecha pactada de pago que se pueda incumplir.
--
-- Copiar esa etiqueta sería inventar un concepto que el modelo no tiene, y de
-- los peores: uno que suena a compromiso con un tercero. Alguien leería «vence
-- el 25» y entendería que hay una obligación con fecha, cuando lo único que
-- hay es que ese día se pagó.
--
-- Así que la vista contesta la pregunta que SÍ se puede contestar: qué días del
-- mes sale la plata. Y distingue las dos formas en que eso se sabe:
--
--   `pagado`       ya salió. Sale de `gasto.pagado_at`, que es un hecho.
--   `comprometido` todavía no salió y hay fecha esperada. Sale del cashflow
--                  comprometido — hoy son los sueldos de socios devengados.
--
-- Son cosas distintas y no se suman en una sola barra sin decirlo: una es
-- historia y la otra es previsión.
--
-- ── La inversión no es gasto ───────────────────────────────────────────────
--
-- Se excluye `naturaleza = 'inversion'`, igual que el resto del módulo Gastos
-- desde la Ola 2: comprar un activo no toca el resultado.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_gasto_dia_mes as
with pagados as (
  select
    extract(year  from pagado_at)::integer as anio,
    extract(month from pagado_at)::integer as mes,
    extract(day   from pagado_at)::integer as dia,
    coalesce(sum(total), 0)::numeric(16,2) as pagado
  from v_gasto_detalle
  where estado = 'pagado'
    and naturaleza <> 'inversion'
    and pagado_at is not null
  group by 1, 2, 3
),
comprometidos as (
  select
    extract(year  from fecha)::integer as anio,
    extract(month from fecha)::integer as mes,
    extract(day   from fecha)::integer as dia,
    coalesce(sum(-monto), 0)::numeric(16,2) as comprometido
  from v_cashflow_comprometido
  where monto < 0
  group by 1, 2, 3
)
select
  coalesce(p.anio, c.anio) as anio,
  coalesce(p.mes,  c.mes)  as mes,
  coalesce(p.dia,  c.dia)  as dia,
  coalesce(p.pagado, 0)::numeric(16,2)        as pagado,
  coalesce(c.comprometido, 0)::numeric(16,2)  as comprometido,
  (coalesce(p.pagado, 0) + coalesce(c.comprometido, 0))::numeric(16,2) as total
from pagados p
full join comprometidos c on c.anio = p.anio and c.mes = p.mes and c.dia = p.dia;

comment on view v_gasto_dia_mes is
  'Salidas por día del mes: lo que ya se pagó (gasto.pagado_at) y lo comprometido con fecha esperada. NO es día de vencimiento — un gasto en CAMPA no tiene esa fecha.';
