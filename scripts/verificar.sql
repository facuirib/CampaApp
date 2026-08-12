-- Verificación post-instalación
-- psql $DATABASE_URL -f scripts/verificar.sql

\echo '=== Objetos creados ==='
select 'tablas'    as objeto, count(*) from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE'
union all select 'vistas', count(*) from information_schema.views where table_schema='public'
union all select 'triggers', count(distinct tgname) from pg_trigger where not tgisinternal;

\echo ''
\echo '=== Datos semilla ==='
select 'cuentas'    as dato, count(*)::text from cuenta
union all select 'predios', count(*)::text from predio
union all select 'cajas', count(*)::text from caja
union all select 'categorías de gasto', count(*)::text from cat_gasto
union all select 'conceptos', count(*)::text from concepto_gasto;

\echo ''
\echo '=== Cajas (efectivo debe tener predio) ==='
select c.tipo, c.nombre, coalesce(p.codigo,'global') as predio
  from caja c left join predio p on p.id = c.predio_id order by c.tipo;

\echo ''
\echo '=== Categorías por naturaleza ==='
select naturaleza, area, count(*) from cat_gasto group by naturaleza, area order by naturaleza, area;

\echo ''
\echo '=== Vistas responden ==='
select 'v_saldo_caja' as vista, count(*)::text as filas from v_saldo_caja
union all select 'v_deuda_equipo', count(*)::text from v_deuda_equipo
union all select 'v_cobranza_kpi', count(*)::text from v_cobranza_kpi
-- v_resultado_producto se dropeó: partía el resultado por torneo, y el negocio
-- es unificado. La reemplaza v_pl_mensual, a nivel empresa.
union all select 'v_pl_mensual', count(*)::text from v_pl_mensual;

\echo ''
\echo 'Si llegaste hasta acá sin errores, el esquema está bien instalado.'
