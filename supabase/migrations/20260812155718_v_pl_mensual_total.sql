-- ── v_pl_mensual_total — las filas de TOTAL de la matriz ───────────────────
--
-- La matriz de /resultados tiene tres filas que no son cuentas: «Total
-- ingresos», «Total egresos» y «Resultado», una cifra por mes cada una.
--
-- Sin esta vista, la pantalla tendría que sumar las columnas de la tabla para
-- dibujarlas — exactamente el `.reduce()` que la regla 1 prohíbe. Y no es un
-- tecnicismo: el total de una columna de doce meses sumado en el cliente es
-- justo donde aparecen las diferencias de centavos contra el número que
-- muestra el encabezado.
--
-- Apareció construyendo la pantalla, no diseñando las vistas.
--
-- Grano anio × mes. Los 12 meses vienen garantizados porque sale de
-- v_pl_mensual, que ya los genera.
create or replace view public.v_pl_mensual_total as
select anio, mes,
       coalesce(sum(monto) filter (where tipo = 'ingreso'), 0)::numeric(16,2)    as ingresos,
       coalesce(sum(monto) filter (where tipo = 'egreso'), 0)::numeric(16,2)     as egresos,
       coalesce(sum(monto) filter (where tipo = 'financiero'), 0)::numeric(16,2) as financiero,
       (coalesce(sum(monto) filter (where tipo = 'ingreso'), 0)
      - coalesce(sum(monto) filter (where tipo = 'egreso'), 0)
      + coalesce(sum(monto) filter (where tipo = 'financiero'), 0))::numeric(16,2) as resultado
  from v_pl_mensual
 group by anio, mes;

comment on view public.v_pl_mensual_total is
  'Los totales del P&L por mes: ingresos, egresos, financiero y resultado. Son las filas de total de la matriz de /resultados, que si no la pantalla tendria que sumar en el cliente. Deriva de v_pl_mensual.';


-- ── v_pl_kpi — el encabezado ───────────────────────────────────────────────
--
-- Suma v_pl_mensual_total y no el diario, por el mismo argumento de
-- v_sponsor_kpi: el encabezado, las filas de total y la matriz salen de la
-- MISMA fuente y no pueden discrepar. Una sola definición de «resultado del
-- mes» para toda la pantalla.
create or replace view public.v_pl_kpi as
select anio,
       sum(ingresos)::numeric(16,2)   as ingresos_cobrados,
       sum(egresos)::numeric(16,2)    as egresos,
       sum(financiero)::numeric(16,2) as resultado_financiero,
       sum(resultado)::numeric(16,2)  as resultado,
       -- Sin ingresos el margen no existe: null, y la pantalla muestra un
       -- guion. Cero seria mentir -un margen de 0% es otra cosa-.
       case when sum(ingresos) > 0
            then round(sum(resultado) * 100 / sum(ingresos), 1) end as margen_pct,
       (array_agg(mes order by resultado desc, mes))[1] as mejor_mes,
       max(resultado)::numeric(16,2)                    as mejor_mes_resultado,
       count(*) filter (
         where ingresos <> 0 or egresos <> 0 or financiero <> 0) as meses_con_movimiento
  from v_pl_mensual_total
 group by anio;

comment on view public.v_pl_kpi is
  'Los totales del P&L por anio, sumando v_pl_mensual_total para que el encabezado, las filas de total y la matriz no puedan discrepar. margen_pct es null si no hubo ingresos -no cero-. El resultado ya incluye el financiero.';
