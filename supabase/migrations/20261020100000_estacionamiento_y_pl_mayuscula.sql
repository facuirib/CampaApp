-- ─────────────────────────────────────────────────────────────────────────────
-- Estacionamiento + el P&L con Mayúscula
--
-- Completa la revisión de Facu del paquete de ingreso extraordinario:
--
-- 1 · ING_ESTACIONAMIENTO. Facu lo quiere como categoría PROPIA del P&L, no
--     escondido en «Servicios a terceros»: es un ingreso recurrente del club
--     y merece su fila. Como v_pl_mensual es genérica por cuenta, aparece
--     solo en Resultados y en las donas del Inicio — la regla «si ingresa
--     plata, se ve» queda garantizada por construcción, no por disciplina.
--
-- 2 · Los renombres. Los nombres de las cuentas de ingreso salen a pantalla
--     tal cual (P&L, composiciones del Inicio, exportes) y decían «Ingresos
--     por inscripciones», «Ingresos bar»… El «Ingresos» sobra —la sección ya
--     dice que son ingresos— y Facu fijó la regla: Mayúscula inicial, el
--     nombre pelado. cuenta.nombre es fuente única: se corrige acá y cambia
--     en todas las pantallas a la vez. Los códigos NO cambian — son el ancla
--     de funciones y vistas.
-- ─────────────────────────────────────────────────────────────────────────────

insert into cuenta (id, codigo, nombre, tipo, imputable, padre_id)
values (gen_random_uuid(), 'ING_ESTACIONAMIENTO', 'Estacionamiento', 'ingreso', true, null)
on conflict (codigo) do nothing;

update cuenta set nombre = 'Inscripciones' where codigo = 'ING_INSCRIPCIONES';
update cuenta set nombre = 'Partidos'      where codigo = 'ING_PARTIDOS';
update cuenta set nombre = 'Sponsors'      where codigo = 'ING_SPONSORS';
update cuenta set nombre = 'Bar'           where codigo = 'ING_BAR';
