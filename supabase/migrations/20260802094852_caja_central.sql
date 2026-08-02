-- Caja central · desbloqueo de la consolidación de efectivo (Vía A)
--
-- Decisión 62, y precondición de la 60. Arquitectura §3.6.
--
-- El asiento predio → central NO se puede expresar con el modelo actual:
-- `asiento_linea` no tiene `predio_id` —el predio vive en la cabecera del
-- asiento— así que con una sola cuenta CAJA_EFECTIVO las dos líneas del
-- traslado caen en el mismo balde (cuenta, predio) y SE NETEAN A CERO. El
-- traslado sería invisible y el saldo del predio no bajaría.
--
-- Vía A: una cuenta propia para la central. Las dos líneas pasan a diferir por
-- CUENTA y no por predio, y el neteo desaparece.


-- 1 · La cuenta ---------------------------------------------------------------

insert into cuenta (codigo, nombre, tipo, imputable)
values ('CAJA_CENTRAL', 'Caja Central', 'activo', true)
on conflict (codigo) do nothing;


-- 2 · La caja apunta a su cuenta ----------------------------------------------
--
-- Hoy `v_saldo_caja` mapea tipo → código de cuenta con un `case` escrito a mano.
-- Ese case no puede distinguir dos cajas de efectivo con cuentas distintas: la
-- central mapearía a CAJA_EFECTIVO y su saldo se mezclaría con el de los
-- predios. Además es un hardcode del plan de cuentas dentro de una vista.
--
-- La relación caja → cuenta pasa a ser un dato, que es lo que siempre fue.

alter table caja add column cuenta_id uuid references cuenta(id);

update caja set cuenta_id = c.id
from cuenta c
where c.codigo = case caja.tipo
                   when 'efectivo'      then 'CAJA_EFECTIVO'
                   when 'transferencia' then 'CAJA_TRANSFERENCIA'
                   when 'usd'           then 'CAJA_USD'
                 end;

alter table caja alter column cuenta_id set not null;

comment on column caja.cuenta_id is
  'Cuenta contable de la caja. Reemplaza el mapeo tipo → código que estaba '
  'escrito a mano en v_saldo_caja. Es lo que permite que dos cajas de efectivo '
  '(predio y central) tengan cuentas distintas.';


-- 3 · El trigger admite la central --------------------------------------------
--
-- Regla vieja: toda caja de efectivo exige predio. Eso rechaza exactamente lo
-- que la central es.
--
-- Regla nueva: las cajas de efectivo DE PREDIO siguen exigiendo predio —no se
-- afloja nada de eso, es lo que hace cuadrable el arqueo—; la central es la
-- única excepción, y se reconoce por su cuenta, no por su nombre.

create or replace function check_caja_predio() returns trigger
language plpgsql
as $$
declare
  v_codigo text;
begin
  select codigo into v_codigo from cuenta where id = new.cuenta_id;

  if v_codigo is null then
    raise exception 'La caja debe apuntar a una cuenta existente';
  end if;

  if new.tipo = 'efectivo' then
    if v_codigo = 'CAJA_CENTRAL' then
      -- La central es el destino del efectivo, no un punto de cobro.
      if new.predio_id is not null then
        raise exception 'La caja central no se asigna a un predio';
      end if;
    elsif new.predio_id is null then
      raise exception 'Una caja de efectivo de predio debe asignarse a un predio';
    end if;
  elsif new.predio_id is not null then
    raise exception 'Solo las cajas de efectivo se asignan a un predio';
  end if;

  return new;
end;
$$;


-- 4 · La caja central ---------------------------------------------------------

insert into caja (tipo, nombre, predio_id, cuenta_id, activo)
select 'efectivo', 'Caja Central', null, c.id, true
from cuenta c
where c.codigo = 'CAJA_CENTRAL'
  and not exists (select 1 from caja k where k.cuenta_id = c.id);


-- 5 · v_saldo_caja sin el mapeo a mano ----------------------------------------
--
-- Mismas columnas y mismo orden que la versión anterior, así que `replace`
-- alcanza.
--
-- NO filtra `anulado_por`, y es deliberado. `anular_asiento` marca el original
-- pero deja el contraasiento con `anulado_por is null`. Para un SALDO:
--   · incluyendo los dos            -> +X y -X se netean -> 0    CORRECTO
--   · filtrando anulado_por is null -> excluye el original y deja el
--                                      contraasiento huerfano -> -X   MAL
-- Aplicar la regla 4 al pie de la letra acá ROMPERÍA la vista. La regla vale
-- para vistas que listan asientos, no para las que suman saldos.

create or replace view v_saldo_caja as
select cj.id        as caja_id,
       cj.tipo,
       cj.nombre,
       cj.predio_id,
       p.nombre     as predio,
       coalesce(mov.saldo, 0::numeric) as saldo
from caja cj
left join predio p on p.id = cj.predio_id
left join lateral (
  select sum(l.debe - l.haber) as saldo
  from asiento_linea l
  join asiento a on a.id = l.asiento_id
  where l.cuenta_id = cj.cuenta_id
    and (cj.predio_id is null or a.predio_id = cj.predio_id)
) mov on true
where cj.activo;

comment on view v_saldo_caja is
  'Saldo de cada caja, derivado del diario. La caja resuelve su cuenta por '
  'cuenta_id; las de predio filtran además por asiento.predio_id. No filtra '
  'anulados a propósito: original y contraasiento se netean solos, y filtrar '
  'solo el original dejaría el contra huérfano.';
