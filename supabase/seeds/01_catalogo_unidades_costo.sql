-- Clasificación inicial de las categorías de gasto por unidad de costo
--
-- Decisión 55. Arquitectura §3.3.
--
-- Es dato de CATÁLOGO, no del Clausura: el catálogo de gastos es compartido
-- entre torneos. Por eso no lleva prefijo `clausura_2026_`.
--
-- Es punto de partida, no verdad de schema: se corrige con un update, sin
-- migración.
--
-- La migración `unidades_costo` ya dejó todas las categorías en su unidad por
-- naturaleza (recurrente → por_mes, el resto → unico). Este seed refina las 11
-- categorías `por_fecha` que SÍ escalan con el torneo. Las otras 5 —las 4 de
-- bar y Administración— se quedan en `unico`, que es su valor correcto:
--
--   · El bar no escala con partidos ni con días de cancha: escala con CONSUMO.
--     Un sábado de mucha venta cuesta más que uno de poca, y la cantidad de
--     partidos no lo predice. Su tratamiento propio está pendiente.
--   · Administración es estructura permanente, y la estructura permanente no se
--     prorratea entre torneos (decisión 11).
--
-- OJO al leer esto: hay DOS categorías llamadas "Limpieza", una de área
-- `predio` y otra de área `bar`. Son filas distintas bajo unique (area, nombre)
-- y se clasifican distinto. Por eso cada update discrimina por área.

begin;

-- Por partido · 3 — cada partido tiene los suyos
update cat_gasto set unidad_default = 'por_partido'
where area = 'torneo'
  and nombre in ('Arbitros Femenino', 'Arbitros Masculino', 'Operativos');

-- Por día de cancha · 8 — el servicio va un día a un predio, y va una sola vez
-- sin importar cuántas series o partidos jueguen ahí
update cat_gasto set unidad_default = 'por_dia_cancha'
where (area = 'torneo'
       and nombre in ('Coordinación', 'Media', 'Medicinal', 'Tribunal', 'Viáticos'))
   or (area = 'predio'
       and nombre in ('Estacionamiento', 'Guardias', 'Limpieza'));

-- Verificación: la clasificación tiene que cerrar en 3 / 8 / 5 sobre las 16
-- categorías por_fecha. Si no cierra, algún nombre no matcheó —un acento, un
-- área equivocada— y el update pasó silencioso sin tocar nada.
do $$
declare
  v_partido integer;
  v_dia     integer;
  v_aparte  integer;
  v_total   integer;
begin
  select count(*) filter (where unidad_default = 'por_partido'),
         count(*) filter (where unidad_default = 'por_dia_cancha'),
         count(*) filter (where unidad_default = 'unico'),
         count(*)
    into v_partido, v_dia, v_aparte, v_total
  from cat_gasto
  where naturaleza = 'por_fecha';

  if (v_partido, v_dia, v_aparte, v_total) is distinct from (3, 8, 5, 16) then
    raise exception
      'Clasificación por_fecha no cierra: partido=% dia=% aparte=% total=% '
      '(esperado 3/8/5/16)', v_partido, v_dia, v_aparte, v_total;
  end if;
end $$;

commit;

-- PENDIENTE · overrides a nivel concepto para Viáticos.
--
-- Viáticos quedó en `por_dia_cancha` a nivel categoría, pero sus conceptos
-- espejan categorías de unidades distintas: el viático de un ballboy escala
-- como el ballboy (por partido), el de un guardia como el guardia (por día).
-- Candidatos a override en concepto_gasto.unidad_default:
--
--   Ballboys              → por_partido?   (Operativos es por_partido)
--   Veedores              → por_partido?   (Operativos es por_partido)
--   Guardias              → por_dia_cancha (ya lo hereda)
--   Estacionamiento       → por_dia_cancha (ya lo hereda)
--   Limpieza-Berclean     → por_dia_cancha (ya lo hereda)
--   Limpieza-Roman        → por_dia_cancha (ya lo hereda)
--   Coordinación/Tribunal → por_dia_cancha (ya lo hereda)
--
-- No se cargan acá: el mapeo concepto→unidad de Viáticos no está decidido, y
-- adivinarlo es exactamente lo que esta pieza vino a evitar. Se define con
-- Facu y se agrega con un update.
