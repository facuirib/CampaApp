-- Módulo USD · caja de cobertura por promedio ponderado
--
-- Decisiones 78 a 82. Arquitectura §3.7.
--
-- El más liviano: NO se crea estructura. La tabla usd_operacion, la caja usd y
-- las cuentas CAJA_USD y FIN_DIF_CAMBIO ya existen desde el schema inicial, sin
-- uso. Solo falta la lógica.


-- 1 · La poda (decisión 80) ---------------------------------------------------
--
-- `revaluacion` sale del dominio. Con diferencia solo realizada la revaluación
-- no existe, y un valor del dominio que el modelo no usa es una trampa: alguien
-- lo va a elegir y va a asentar una ganancia que no ocurrió. Misma limpieza que
-- por_jornada en la decisión 52.
--
-- 0 filas: no migra ningún dato.

alter table usd_operacion drop constraint usd_operacion_tipo_check;

alter table usd_operacion add constraint usd_operacion_tipo_check
  check (tipo in ('compra','venta'));

-- La cantidad es positiva en compra y negativa en venta (§3.7). Dejarlo en el
-- schema evita que una carga a mano invierta el signo y corra el promedio.
alter table usd_operacion add constraint usd_operacion_signo_check
  check ((tipo = 'compra' and cantidad > 0) or (tipo = 'venta' and cantidad < 0));

comment on table usd_operacion is
  'Operaciones de la caja de cobertura en dólares. LA CANTIDAD DE DÓLARES VIVE '
  'ACÁ: el diario es monomoneda (decisión 78). cantidad positiva en compra, '
  'negativa en venta.';


-- 2 · comprar_usd -------------------------------------------------------------
--
-- Permuta pura: no hay resultado. Entran dólares, salen pesos.

create or replace function comprar_usd(
  p_fecha    date,
  p_cantidad numeric,
  p_tc       numeric,
  p_motivo   text default null,
  p_medio    text default 'transferencia'   -- transferencia | central
) returns uuid
language plpgsql
as $$
declare
  v_cuenta text;
  v_pesos  numeric(16,2);
  v_asiento uuid;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad de dólares debe ser positiva (recibido: %)', p_cantidad;
  end if;
  if p_tc is null or p_tc <= 0 then
    raise exception 'El tipo de cambio debe ser positivo (recibido: %)', p_tc;
  end if;

  v_cuenta := case p_medio
                when 'transferencia' then 'CAJA_TRANSFERENCIA'
                when 'central'       then 'CAJA_CENTRAL'
              end;
  if v_cuenta is null then
    raise exception
      'Medio "%" desconocido. La compra de dólares sale de transferencia o de '
      'caja central — no de la caja de un predio.', p_medio;
  end if;

  v_pesos := round(p_cantidad * p_tc, 2);

  -- torneo_id NULL: la cobertura cambiaria no es de ningún torneo (decisión 81).
  v_asiento := crear_asiento(
    p_fecha,
    'usd',
    'Compra USD ' || p_cantidad || ' @ ' || p_tc ||
      coalesce(' · ' || p_motivo, ''),
    jsonb_build_array(
      jsonb_build_object('cuenta','CAJA_USD', 'debe',  v_pesos),
      jsonb_build_object('cuenta', v_cuenta,  'haber', v_pesos)
    ),
    null, null, null, null
  );

  insert into usd_operacion (fecha, tipo, cantidad, tc, monto_pesos, motivo, asiento_id)
  values (p_fecha, 'compra', p_cantidad, p_tc, v_pesos, p_motivo, v_asiento);

  return v_asiento;
end;
$$;

comment on function comprar_usd(date, numeric, numeric, text, text) is
  'Compra de dólares: permuta sin resultado. Registra el asiento y la operación, '
  'que es donde vive la cantidad de dólares.';


-- 3 · vender_usd · el PPP (decisiones 79 y 80) --------------------------------
--
-- Los dólares salen al PROMEDIO PONDERADO, y la diferencia contra lo recibido es
-- la ganancia o pérdida REALIZADA.
--
-- El promedio no se guarda: se deriva de las dos fuentes —tenencia de
-- usd_operacion, costo en libros del diario— en el momento de vender. Y se
-- mantiene solo, porque CAJA_USD baja exactamente por el costo de salida.

create or replace function vender_usd(
  p_fecha    date,
  p_cantidad numeric,                       -- positiva: cuántos dólares se venden
  p_tc       numeric,
  p_motivo   text default null,
  p_medio    text default 'transferencia'
) returns uuid
language plpgsql
as $$
declare
  v_cuenta   text;
  v_tenencia numeric(14,2);
  v_costo    numeric(16,2);
  v_ppp      numeric;
  v_salida   numeric(16,2);
  v_recibido numeric(16,2);
  v_dif      numeric(16,2);
  v_lineas   jsonb;
  v_asiento  uuid;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a vender debe ser positiva (recibido: %)', p_cantidad;
  end if;
  if p_tc is null or p_tc <= 0 then
    raise exception 'El tipo de cambio debe ser positivo (recibido: %)', p_tc;
  end if;

  v_cuenta := case p_medio
                when 'transferencia' then 'CAJA_TRANSFERENCIA'
                when 'central'       then 'CAJA_CENTRAL'
              end;
  if v_cuenta is null then
    raise exception 'Medio "%" desconocido. Usá transferencia o central.', p_medio;
  end if;

  -- Las dos fuentes del promedio.
  select coalesce(sum(cantidad), 0) into v_tenencia from usd_operacion;

  select coalesce(sum(l.debe - l.haber), 0) into v_costo
    from asiento_linea l
    join cuenta c on c.id = l.cuenta_id
   where c.codigo = 'CAJA_USD';

  if v_tenencia <= 0 then
    raise exception 'No hay dólares en caja: no se puede vender.';
  end if;
  if p_cantidad > v_tenencia then
    raise exception
      'Se quieren vender % USD y en caja hay %.', p_cantidad, v_tenencia;
  end if;

  v_ppp := v_costo / v_tenencia;

  if p_cantidad = v_tenencia then
    -- Vender TODO saca exactamente el costo en libros. Calcularlo por el
    -- promedio redondeado podría dejar centavos huérfanos en CAJA_USD, que
    -- entonces tendría saldo sin un solo dólar detrás. Mismo criterio que el
    -- remanente del último devengo de sponsors (decisión 75).
    v_salida := v_costo;
  else
    v_salida := round(p_cantidad * v_ppp, 2);
  end if;

  v_recibido := round(p_cantidad * p_tc, 2);
  v_dif      := v_recibido - v_salida;

  v_lineas := jsonb_build_array(
    jsonb_build_object('cuenta', v_cuenta,   'debe',  v_recibido),
    jsonb_build_object('cuenta','CAJA_USD',  'haber', v_salida)
  );

  -- La diferencia va al haber si es ganancia y al debe si es pérdida. Si el
  -- dólar no se movió respecto del promedio, no hay tercera línea.
  if v_dif > 0 then
    v_lineas := v_lineas || jsonb_build_array(
      jsonb_build_object('cuenta','FIN_DIF_CAMBIO','haber', v_dif));
  elsif v_dif < 0 then
    v_lineas := v_lineas || jsonb_build_array(
      jsonb_build_object('cuenta','FIN_DIF_CAMBIO','debe', -v_dif));
  end if;

  v_asiento := crear_asiento(
    p_fecha,
    'usd',
    'Venta USD ' || p_cantidad || ' @ ' || p_tc ||
      ' (PPP ' || round(v_ppp, 2) || ')' || coalesce(' · ' || p_motivo, ''),
    v_lineas,
    null, null, null, null
  );

  insert into usd_operacion (fecha, tipo, cantidad, tc, monto_pesos, motivo, asiento_id)
  values (p_fecha, 'venta', -p_cantidad, p_tc, v_recibido, p_motivo, v_asiento);

  return v_asiento;
end;
$$;

comment on function vender_usd(date, numeric, numeric, text, text) is
  'Venta de dólares al promedio ponderado. La diferencia contra lo recibido es '
  'la ganancia o pérdida REALIZADA (FIN_DIF_CAMBIO). Vender todo saca el costo '
  'en libros exacto, para no dejar centavos sin dólares detrás.';


-- 4 · Lo que se lee -----------------------------------------------------------

create view v_tenencia_usd as
select coalesce((select sum(cantidad) from usd_operacion), 0)          as tenencia_usd,
       coalesce((select sum(l.debe - l.haber)
                   from asiento_linea l join cuenta c on c.id = l.cuenta_id
                  where c.codigo = 'CAJA_USD'), 0)                     as costo_libros,
       case when coalesce((select sum(cantidad) from usd_operacion), 0) > 0
            then round(
                   (select sum(l.debe - l.haber)
                      from asiento_linea l join cuenta c on c.id = l.cuenta_id
                     where c.codigo = 'CAJA_USD')
                 / (select sum(cantidad) from usd_operacion), 2)
       end                                                             as promedio_ponderado;

comment on view v_tenencia_usd is
  'Cuántos dólares hay (de usd_operacion), cuánto valen en libros (del diario) y '
  'el promedio ponderado, que se deriva y no se guarda. El promedio es NULL si '
  'no hay tenencia.';


-- La diferencia de cambio realizada. Existe porque HOY NO SE VE: FIN_DIF_CAMBIO
-- es de tipo `financiero` y v_resultado_producto filtra ingreso/egreso, así que
-- el resultado de cambio se registraría sin aparecer en ninguna pantalla
-- (decisión 82).
--
-- Que no entre al resultado operativo es correcto y deliberado (decisión 12):
-- una suba del dólar no debe leerse como que el torneo funcionó mejor. Por eso
-- se muestra aparte y no se mete en aquella vista.
create view v_resultado_cambio as
select p.anio,
       p.mes,
       sum(l.haber - l.debe)                                    as resultado,
       sum(case when l.haber > 0 then l.haber else 0 end)       as ganancias,
       sum(case when l.debe  > 0 then l.debe  else 0 end)       as perdidas
from asiento_linea l
join cuenta  c on c.id = l.cuenta_id and c.codigo = 'FIN_DIF_CAMBIO'
join asiento a on a.id = l.asiento_id
join periodo p on p.id = a.periodo_id
group by p.anio, p.mes;

comment on view v_resultado_cambio is
  'Diferencia de cambio realizada, por mes. Positivo = ganancia. Va aparte del '
  'resultado operativo a propósito (decisión 12).';


-- 5 · La red de seguridad (decisión 79) ---------------------------------------
--
-- El promedio cruza DOS FUENTES y nada las mantiene sincronizadas: la cantidad
-- sale de usd_operacion y los pesos del diario. Si alguien asienta contra
-- CAJA_USD sin registrar la operación —un crear_asiento directo, un ajuste— el
-- promedio queda mal EN SILENCIO y todas las ventas posteriores salen a un costo
-- equivocado.
--
-- El costo esperado NO es la suma de monto_pesos: en una venta, monto_pesos es
-- lo RECIBIDO, pero de CAJA_USD sale el COSTO AL PPP. Son dos números distintos,
-- y el PPP de cada venta dependía del estado en ese momento. Por eso hay que
-- reconstruirlo: se recorre la historia rehaciendo el promedio.
--
-- Se ordena por asiento.created_at y NO por fecha: vender_usd calcula el PPP
-- sobre el estado real del diario al ejecutar, así que replicar por fecha daría
-- distinto si alguien registra una compra con fecha vieja después de una venta.

create or replace function usd_costo_esperado() returns numeric
language plpgsql
stable
as $$
declare
  r        record;
  v_costo  numeric(16,2) := 0;
  v_ten    numeric(14,2) := 0;
  v_salida numeric(16,2);
begin
  for r in
    select o.tipo, o.cantidad, o.monto_pesos
      from usd_operacion o
      left join asiento a on a.id = o.asiento_id
     order by coalesce(a.created_at, o.fecha::timestamptz), o.id
  loop
    if r.tipo = 'compra' then
      v_costo := v_costo + r.monto_pesos;
      v_ten   := v_ten   + r.cantidad;
    else
      if v_ten <= 0 then
        -- Historia incoherente: una venta sin tenencia. No se aborta —esta
        -- función alimenta una vista— y la discrepancia queda visible.
        v_salida := 0;
      elsif abs(r.cantidad) = v_ten then
        v_salida := v_costo;                                  -- vendió todo
      else
        v_salida := round(abs(r.cantidad) * (v_costo / v_ten), 2);
      end if;
      v_costo := v_costo - v_salida;
      v_ten   := v_ten   + r.cantidad;                        -- cantidad negativa
    end if;
  end loop;

  return v_costo;
end;
$$;

comment on function usd_costo_esperado() is
  'Reconstruye el costo en libros que CAJA_USD debería tener según '
  'usd_operacion, rehaciendo el promedio ponderado en orden de ejecución.';


create view v_usd_sincronia as
select l.costo_libros,
       e.costo_esperado,
       l.costo_libros - e.costo_esperado        as diferencia,
       l.lineas_caja_usd,
       o.operaciones,
       case
         when l.costo_libros = e.costo_esperado
          and l.lineas_caja_usd = o.operaciones then 'OK'
         when l.lineas_caja_usd <> o.operaciones then
           'DESINCRONIZADO: hay ' || l.lineas_caja_usd || ' líneas en CAJA_USD y '
           || o.operaciones || ' operaciones registradas'
         else
           'DESINCRONIZADO: el diario dice ' || l.costo_libros ||
           ' y las operaciones dan ' || e.costo_esperado
       end                                      as estado
from (
  select coalesce(sum(al.debe - al.haber), 0) as costo_libros,
         count(*)                             as lineas_caja_usd
    from asiento_linea al
    join cuenta c on c.id = al.cuenta_id
   where c.codigo = 'CAJA_USD'
) l
cross join (select count(*) as operaciones from usd_operacion) o
cross join lateral (select usd_costo_esperado() as costo_esperado) e;

comment on view v_usd_sincronia is
  'Red de seguridad del PPP: compara el costo en libros contra el que se '
  'reconstruye desde usd_operacion. Si no coinciden, alguien tocó CAJA_USD sin '
  'registrar la operación y el promedio está mal.';
