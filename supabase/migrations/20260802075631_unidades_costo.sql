-- Pieza 5 · unidades de costo variable
--
-- Decisiones 52, 53, 55. Arquitectura §3.3 y §3.8.
--
-- Desarma la bomba de v_presupuesto_total: multiplicaba toda línea `por_jornada`
-- por el count de jornadas no suspendidas del torneo. Con jornadas por género
-- eso daba 28; con jornadas por serie da 284. Un presupuesto se habría mostrado
-- DIEZ VECES más grande sin error ni advertencia — el peor modo de falla,
-- porque un número plausible no se cuestiona.
--
-- presupuesto_linea, presupuesto y gasto tienen 0 filas: nunca llegó a existir
-- un número mal, y ningún dato migra.


-- 1 · La unidad es default en el catálogo (decisión 53) ----------------------
--
-- Un arbitraje es por partido siempre. No es una decisión que deba tomarse de
-- nuevo en cada línea de presupuesto: sin default, cada línea vuelve a resolver
-- algo ya resuelto y basta UNA mal cargada para que el total se corra.
--
-- También en concepto_gasto y no solo en cat_gasto porque Viáticos espeja a
-- otras categorías (Ballboys, Veedores, Guardias, Estacionamiento, Limpieza):
-- su unidad no es uniforme a nivel categoría — el viático de un ballboy escala
-- como el ballboy.

alter table cat_gasto      add column unidad_default text;
alter table concepto_gasto add column unidad_default text;

alter table cat_gasto add constraint cat_gasto_unidad_default_check
  check (unidad_default in
    ('por_partido','por_dia_cancha','por_mes','anual','unico'));

alter table concepto_gasto add constraint concepto_gasto_unidad_default_check
  check (unidad_default is null or unidad_default in
    ('por_partido','por_dia_cancha','por_mes','anual','unico'));

-- Backfill por naturaleza. Es una regla del modelo de gastos, no un dato de
-- ningún torneo (regla 12): lo recurrente escala con el mes; lo eventual, la
-- inversión y —por ahora— lo por_fecha no escalan.
--
-- `unico` acá NO es un placeholder: es el valor final correcto para las cinco
-- categorías que quedan aparte (las 4 de bar + Administración), que no escalan
-- ni con partidos ni con días de cancha. El seed del Clausura refina las 11 que
-- sí escalan; estas cinco se quedan como quedan.
update cat_gasto set unidad_default =
  case naturaleza when 'recurrente' then 'por_mes' else 'unico' end;

alter table cat_gasto alter column unidad_default set not null;

comment on column cat_gasto.unidad_default is
  'Unidad de costo por defecto de la categoría. La línea de presupuesto puede '
  'sobrescribirla; concepto_gasto.unidad_default se interpone entre ambas. '
  'OJO: una categoría por_fecha nueva nace como `unico` (no escala) — hay que '
  'clasificarla explícitamente si escala.';

comment on column concepto_gasto.unidad_default is
  'Override de la unidad a nivel concepto. NULL = heredar de cat_gasto. Existe '
  'por Viáticos, cuyos conceptos espejan categorías de unidades distintas.';


-- 2 · La línea pasa a ser override, y cambia de dominio (decisiones 52 y 53) --
--
-- `por_jornada` SALE del dominio. No se conserva por compatibilidad: era exacta
-- mientras la jornada era la fecha N de un género, y con jornadas por serie
-- pasó a ser ambigua —no dice si se refiere al partido o al día de operación—.
-- Dejarla disponible garantiza que alguien la elija y multiplique por 284.
--
-- La columna pasa a anulable: NULL significa "heredar del catálogo", no "sin
-- definir".

alter table presupuesto_linea alter column unidad drop not null;

alter table presupuesto_linea drop constraint presupuesto_linea_unidad_check;

alter table presupuesto_linea add constraint presupuesto_linea_unidad_check
  check (unidad is null or unidad in
    ('por_partido','por_dia_cancha','por_mes','anual','unico'));

comment on column presupuesto_linea.unidad is
  'Override de la unidad para esta línea. NULL = heredar del catálogo '
  '(concepto_gasto, si no cat_gasto).';


-- 3 · La escala del torneo ---------------------------------------------------
--
-- Los dos multiplicadores variables, derivados. Ninguno es una constante.

create view v_torneo_escala as
select t.id as torneo_id,
       -- Partidos = suma sobre las jornadas no suspendidas de (equipos de la
       -- serie / 2). Se deriva, no se carga: 16 equipos dan 8 partidos.
       -- Hoy da 0 porque no hay fichas cargadas — es correcto, no un bug: el
       -- presupuesto por partido existe recién cuando se sabe cuántos equipos
       -- hay.
       coalesce((
         select sum(se.equipos) / 2.0
         from jornada    j
         join serie      s on s.id = j.serie_id
         join categoria  c on c.id = s.categoria_id
         cross join lateral (
           select count(*)::numeric as equipos
           from equipo_torneo et
           where et.serie_id = s.id
         ) se
         where c.torneo_id = t.id
           and j.estado <> 'suspendida'
       ), 0) as partidos,

       -- Días de cancha = los (fecha, predio) EN QUE ESTE TORNEO JUGÓ.
       --
       -- Cuenta la vista, no la tabla, y la diferencia importa: `dia_cancha`
       -- también tiene días sin fútbol —bar abierto, evento— que el arqueo
       -- necesita y el presupuesto no. Un día de solo bar no lleva fotógrafo:
       -- contarlo inflaría el presupuesto del torneo con un día que no jugó.
       coalesce((
         select count(*)
         from v_dia_cancha_torneo dct
         where dct.torneo_id = t.id
       ), 0) as dias_cancha
from torneo t;

comment on view v_torneo_escala is
  'Multiplicadores variables de un torneo: partidos y días de cancha. Ambos '
  'derivados del calendario y del padrón, nunca cargados a mano. dias_cancha '
  'cuenta solo los días con fútbol (v_dia_cancha_torneo), no todos los días de '
  'operación — el arqueo mira la tabla completa.';


-- 4 · v_presupuesto_total, sin la bomba --------------------------------------
--
-- Se dropea y se recrea en vez de `create or replace`: la vista nueva expone
-- `unidad_linea` donde la vieja tenía `unidad`, y Postgres no deja renombrar
-- columnas con replace. Es seguro — se verificó que ninguna otra vista depende
-- de esta.

drop view v_presupuesto_total;

create view v_presupuesto_total as
select pl.id,
       pl.presupuesto_id,
       pl.cat_gasto_id,
       pl.concepto_id,
       pl.base,
       pl.cantidad,
       pl.unidad                                as unidad_linea,
       coalesce(pl.unidad, cgc.unidad_default, cg.unidad_default) as unidad,
       mult.factor                              as factor,
       p.torneo_id,
       p.ejercicio_id,
       -- Todas las ramas multiplican por `cantidad`. La versión anterior tenía
       -- `else pl.base` y se la comía para `anual` y `unico`: una línea de
       -- 500.000 × 3 mostraba 500.000. Segundo bug de la misma vista.
       pl.base * pl.cantidad * mult.factor      as total_presupuestado
from presupuesto_linea pl
join presupuesto     p   on p.id  = pl.presupuesto_id
join cat_gasto       cg  on cg.id = pl.cat_gasto_id
join ejercicio       e   on e.id  = p.ejercicio_id
left join concepto_gasto cgc on cgc.id = pl.concepto_id
left join v_torneo_escala esc on esc.torneo_id = p.torneo_id
cross join lateral (
  select case coalesce(pl.unidad, cgc.unidad_default, cg.unidad_default)
    when 'por_partido'    then coalesce(esc.partidos, 0)
    when 'por_dia_cancha' then coalesce(esc.dias_cancha, 0)
    -- Meses del ejercicio, derivados. Antes estaba escrito `* 12`.
    -- Un presupuesto de torneo no debería tener líneas por_mes: lo recurrente
    -- es estructura permanente y no se prorratea entre torneos (decisión 11).
    when 'por_mes'        then (
      (extract(year  from age(e.fecha_hasta + 1, e.fecha_desde)) * 12
     + extract(month from age(e.fecha_hasta + 1, e.fecha_desde)))::numeric
    )
    else 1                                    -- anual, unico
  end as factor
) mult;

comment on view v_presupuesto_total is
  'Total por línea de presupuesto = base × cantidad × el multiplicador de su '
  'unidad efectiva. La unidad efectiva sale de la línea, si no del concepto, si '
  'no de la categoría. Expone `unidad` y `factor` para que la pantalla pueda '
  'mostrar de dónde salió el número.';
