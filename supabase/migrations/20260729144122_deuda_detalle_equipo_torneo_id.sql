-- ============================================================================
-- CAMPA · v_deuda_detalle expone equipo_torneo_id
--
-- La cuenta corriente cruza v_cuenta_corriente_equipo con v_deuda_detalle para
-- mostrar, bajo la ficha de cada torneo, sus cuotas. Ese cruce se hacía por
-- NOMBRE de torneo, que no es clave: dos torneos de años distintos pueden
-- llamarse igual y las cuotas se mezclarían entre fichas.
--
-- El grano real de las dos vistas es la ficha del equipo en el torneo, o sea
-- equipo_torneo. v_cuenta_corriente_equipo ya expone equipo_torneo_id; esta no.
-- Se agrega para que el cruce sea por clave.
--
-- Se elige equipo_torneo_id y no torneo_id (que ya está) porque es el grano
-- exacto de ambas vistas. Hoy equipo_torneo tiene unique (tercero_id,
-- torneo_id), así que por torneo alcanzaría; pero si algún día un club entra
-- al mismo torneo en dos categorías, ese unique cae y torneo_id vuelve a ser
-- ambiguo. equipo_torneo_id no.
--
-- create or replace view solo admite columnas NUEVAS al final: no se puede
-- insertar en el medio ni reordenar sin drop. Por eso equipo_torneo_id queda
-- como última columna, aunque por afinidad iría junto a torneo_id.
--
-- Aditiva: ninguna columna existente cambia de nombre, tipo ni posición.
-- La vista no agrega (no tiene group by), así que sumar la columna no altera
-- ninguna fila ni ningún total.
-- ============================================================================

create or replace view v_deuda_detalle as
select
  t.id                as tercero_id,
  t.nombre            as equipo,
  tt.id               as torneo_id,
  tt.nombre           as torneo,
  tt.estado           as torneo_estado,
  et.categoria,
  c.id                as cuota_id,
  c.numero            as cuota_numero,
  c.vence_at,
  c.monto,
  coalesce(imp.monto, 0) + coalesce(ant.monto, 0)  as pagado,
  c.monto - coalesce(imp.monto, 0) - coalesce(ant.monto, 0) as saldo,
  coalesce(ant.monto, 0)                  as pagado_con_anticipo,
  case
    when c.pagado_at is not null                          then 'pagada'
    when coalesce(imp.monto,0) + coalesce(ant.monto,0) > 0
         and c.vence_at < current_date                    then 'parcial_vencida'
    when coalesce(imp.monto,0) + coalesce(ant.monto,0) > 0 then 'parcial'
    when c.vence_at < current_date                        then 'vencida'
    when c.vence_at <= current_date + 7                   then 'por_vencer'
    else 'al_dia'
  end                                     as estado,
  current_date - c.vence_at               as dias_atraso,
  c.pagado_at,
  et.id               as equipo_torneo_id   -- nueva, al final por lo dicho arriba
from tercero t
join equipo_torneo et  on et.tercero_id = t.id
join torneo tt         on tt.id = et.torneo_id
join cuota c           on c.equipo_torneo_id = et.id
left join lateral (
  select sum(monto) as monto from pago_imputacion where cuota_id = c.id
) imp on true
left join lateral (
  select sum(monto) as monto from anticipo_uso where cuota_id = c.id
) ant on true
where t.tipo = 'equipo';

comment on column v_deuda_detalle.equipo_torneo_id is
  'Ficha del equipo en el torneo. Es la clave por la que la cuenta corriente '
  'empareja cada cuota con su ficha; antes se cruzaba por nombre de torneo.';
