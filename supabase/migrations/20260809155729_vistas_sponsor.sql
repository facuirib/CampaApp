-- ═══════════════════════════════════════════════════════════════════════════
-- SPONSORS · las dos vistas que faltaban para ver los dos calendarios
--
-- El módulo (§3.20) lleva DOS líneas de tiempo separadas a propósito: el
-- reconocimiento —parejo, mensual, responde "cuánto ganó el negocio"— y el
-- cobro —las cuotas en sus fechas, responde "cuándo entra la plata"—. Hasta
-- acá la app no podía mostrar ninguno de los dos completo:
--
--   · del reconocimiento sólo existía el AGREGADO (v_estado_sponsor.devengado);
--     el mes a mes no tenía vista, aunque los asientos estaban.
--
--   · del cobro sólo existía v_cuotas_sponsor_futuras, que filtra
--     `cobrado_at is null and fecha_cobro >= current_date`. O sea que una
--     cuota VENCIDA E IMPAGA —el caso que más importa mirar— desaparecía de
--     la pantalla el día que se vencía. Un sponsor moroso era invisible.
--
-- Las dos son de sólo lectura y aditivas: no tocan el diario, ni las tablas,
-- ni las vistas que ya existen. v_cuotas_sponsor_futuras se deja como está —
-- tiene su uso, que es el cashflow por venir— y la nueva la contiene.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · v_cuotas_sponsor — el calendario de COBRO, entero
--
-- Todas las cuotas de cada contrato, con el estado derivado de los datos:
-- cobrada / vencida / por_vencer. Deriva de `cuota_cobro_sponsor`, que es el
-- cronograma, y NO del diario: es un número OPERATIVO —cuándo entra la plata—
-- y por §2 eso sale de la tabla de cuotas, igual que la cobranza de equipos
-- sale de `cuota` y no del libro diario.
--
-- El `numero` es un ordinal de presentación, no una columna de la tabla:
-- `cuota_cobro_sponsor` no numera sus filas. Se deriva con row_number sobre la
-- fecha, con desempate por id para que dos cuotas del mismo día no se
-- intercambien entre dos consultas.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_cuotas_sponsor as
select
  q.id            as cuota_id,
  c.id            as contrato_id,
  c.sponsor_id,
  t.nombre        as sponsor,
  row_number() over (partition by c.id order by q.fecha_cobro, q.id) as numero,
  q.fecha_cobro,
  q.monto,
  q.cobrado_at,
  -- El orden de los casos es el que manda: una cuota cobrada NO es vencida
  -- aunque se haya cobrado tarde. Lo primero que se pregunta es si entró.
  case
    when q.cobrado_at is not null      then 'cobrada'
    when q.fecha_cobro < current_date  then 'vencida'
    else                                    'por_vencer'
  end             as estado
from cuota_cobro_sponsor q
join contrato_sponsor c on c.id = q.contrato_id
join tercero t          on t.id = c.sponsor_id;

comment on view public.v_cuotas_sponsor is
  'Calendario de cobro de sponsors: TODAS las cuotas de cada contrato con su '
  'estado (cobrada / vencida / por_vencer). Reemplaza a '
  'v_cuotas_sponsor_futuras en pantalla, que esconde las vencidas impagas.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · v_sponsor_detalle_mensual — el calendario de RECONOCIMIENTO
--
-- El mes a mes del P&L, espejo de v_socio_detalle_mensual.
--
-- Deriva de `asiento_linea` sobre ING_SPONSORS y NO de la tabla
-- `devengo_sponsor`, y eso es deliberado:
--
--   · el reconocimiento es un número CONTABLE, y por §2 lo contable sale del
--     diario sin excepción. `v_socio_detalle_mensual` ya lo hace así;
--
--   · `v_estado_sponsor.devengado` también sale del diario. Si el mes a mes
--     saliera de la tabla, las dos podrían DIVERGIR: un devengo contraasentado
--     desaparece del diario pero su fila de `devengo_sponsor` sobrevive —el
--     mismo desfasaje que le pasaba a `gasto` antes de v_gasto_detalle—. Yendo
--     las dos al diario, la fila de total de la pantalla reconcilia por
--     construcción y no por casualidad.
--
-- Se engancha por `a.origen_id = contrato.id`, que es lo que deja
-- `devengar_sponsors` y lo que ya usa `v_estado_sponsor`.
--
-- NO filtra `anulado_por is null`, y es a propósito (regla 4): esta vista SUMA.
-- El asiento original y su contraasiento se compensan solos; excluir el
-- original dejaría el contraasiento huérfano y el mes daría negativo en vez de
-- cero. Y como el contraasiento tiene fecha propia, incluir los dos es además
-- lo correcto con corte temporal: cada mes muestra lo que el diario decía.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_sponsor_detalle_mensual as
with mov as (
  select
    c.id           as contrato_id,
    c.sponsor_id,
    t.nombre       as sponsor,
    c.monto_total,
    p.id           as periodo_id,
    p.anio,
    p.mes,
    sum(l.haber - l.debe) as devengado
  from contrato_sponsor c
  join tercero t         on t.id = c.sponsor_id
  join asiento a         on a.origen_id = c.id
  join asiento_linea l   on l.asiento_id = a.id
  join cuenta cu         on cu.id = l.cuenta_id and cu.codigo = 'ING_SPONSORS'
  join periodo p         on p.id = a.periodo_id
  group by c.id, c.sponsor_id, t.nombre, c.monto_total, p.id, p.anio, p.mes
)
select
  contrato_id,
  sponsor_id,
  sponsor,
  periodo_id,
  anio,
  mes,
  devengado,
  sum(devengado) over v as devengado_acumulado,
  -- Cuánto del contrato quedaba por ganar al cerrar ese mes. Es la contracara
  -- de INGRESO_DIFERIDO y el número que hace legible la tabla: sin él, una
  -- columna de montos iguales no dice en qué punto del contrato está.
  monto_total - sum(devengado) over v as pendiente_devengar
from mov
window v as (partition by contrato_id order by anio, mes
             rows between unbounded preceding and current row);

comment on view public.v_sponsor_detalle_mensual is
  'Reconocimiento mes a mes de cada contrato de sponsor, derivado del diario '
  '(ING_SPONSORS). Espejo de v_socio_detalle_mensual. No filtra anulado_por '
  'porque suma: original y contraasiento se compensan (regla 4).';
