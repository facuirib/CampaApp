-- usd_operacion gana una clave de orden de ejecución
--
-- Corrige `usd_costo_esperado()` de la migración anterior. Lo detectó el test del
-- circuito PPP: la verificación de sincronía daba DESINCRONIZADO después de
-- operaciones perfectamente correctas.
--
-- El replay del PPP necesita recorrer las operaciones en el ORDEN EN QUE SE
-- EJECUTARON, porque el costo de salida de cada venta dependió del promedio
-- vigente en ese momento. Ninguna de las claves disponibles servía:
--
--   · `fecha` NO: vender_usd calcula el PPP sobre el estado real del diario al
--     ejecutar, así que una compra registrada con fecha vieja después de una
--     venta daría un replay distinto del que efectivamente ocurrió.
--
--   · `asiento.created_at` TAMPOCO: `now()` devuelve la hora de la TRANSACCIÓN,
--     no de la sentencia. Varias operaciones hechas en una misma transacción
--     quedan con timestamp idéntico y el desempate cae en un uuid aleatorio —
--     en el test, las ventas se replicaban antes que las compras y el costo
--     esperado salía igual a la suma de las compras, sin restar nada.
--
-- Una secuencia sí avanza dentro de la transacción y da el orden exacto.

alter table usd_operacion
  add column orden bigint generated always as identity;

comment on column usd_operacion.orden is
  'Orden de ejecución. Es la clave con la que se reconstruye el promedio '
  'ponderado: ni fecha ni created_at sirven (ver usd_costo_esperado).';


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
     order by o.orden
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
  'usd_operacion, rehaciendo el promedio ponderado en orden de EJECUCIÓN '
  '(columna orden).';
