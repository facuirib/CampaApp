-- v_activo_kpi · los totales de la posición en activos
--
-- Los tres números del encabezado de /activos —en activos, amortizado,
-- residual— son agregados ENTRE activos. v_activo da una fila por activo, así
-- que sumarlos en el front sería el .reduce() que la regla 1 prohíbe. Mismo
-- patrón que v_socio_kpi y v_gasto_kpi: cada pantalla con KPIs tiene su vista,
-- y sale de la MISMA fuente que la tabla de abajo para que no discrepen.
--
-- Tres decisiones:
--
-- · Todo filtra estado='activo'. Un bien dado de baja no forma parte de la
--   posición actual; los de baja se cuentan aparte en dados_de_baja.
--
-- · sin_compra cuenta los vigentes cuya compra todavía no se cargó. El alta del
--   bien y la carga de la compra son dos pasos (gasto tiene FK a activo, no al
--   revés), así que ese estado existe de verdad y la pantalla tiene que poder
--   avisarlo en vez de que pase desapercibido.
--
-- · cuota_mensual_total excluye los que ya terminaron su vida útil
--   (cuotas_restantes > 0). Es "cuánto va a impactar el P&L el mes que viene", y
--   un bien totalmente amortizado ya no impacta. Sin ese filtro el número
--   mentiría creciendo para siempre.

create or replace view v_activo_kpi as
select
  count(*) filter (where estado = 'activo')::int              as activos,
  count(*) filter (where estado = 'baja')::int                as dados_de_baja,
  count(*) filter (where estado = 'activo'
                     and not compra_registrada)::int          as sin_compra,

  coalesce(sum(valor_origen) filter (where estado = 'activo'), 0)::numeric(16,2)
                                                              as en_activos,
  coalesce(sum(amortizado)   filter (where estado = 'activo'), 0)::numeric(16,2)
                                                              as amortizado,
  coalesce(sum(residual)     filter (where estado = 'activo'), 0)::numeric(16,2)
                                                              as residual,

  round(100 * coalesce(sum(amortizado) filter (where estado = 'activo'), 0)
            / nullif(sum(valor_origen) filter (where estado = 'activo'), 0), 2)
                                                              as avance_pct,

  coalesce(sum(cuota_mensual) filter (where estado = 'activo'
                                        and cuotas_restantes > 0), 0)::numeric(16,2)
                                                              as cuota_mensual_total
from v_activo;

comment on view v_activo_kpi is
  'Una fila siempre, también sin activos: es una agregación sin group by. Los '
  'totales de la posición en activos, filtrando los dados de baja. '
  'cuota_mensual_total excluye los que ya terminaron su vida útil.';
