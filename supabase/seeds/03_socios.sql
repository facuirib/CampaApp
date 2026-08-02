-- Socios
--
-- Decisiones 68-72. Arquitectura §3.19.
--
-- Se cargan como `tercero` de tipo `socio`: el tipo ya existía en el CHECK y no
-- hace falta tabla propia — §3.4 establece que equipos, sponsors y socios
-- comparten la misma mecánica y se modelan con un discriminante.
--
-- Solo nombre y tipo. Datos de contacto no se cargan hasta RLS (igual criterio
-- que el padrón de equipos).
--
-- EL SUELDO NO SE SIEMBRA ACÁ. `sueldo_socio` es un parámetro versionado del
-- negocio, no un dato de catálogo: los montos y sus vigencias se cargan desde la
-- app (o a mano) cuando estén acordados. Sembrar un monto inventado haría que el
-- primer devengo asiente plata que nadie acordó.

-- Idempotente por `where not exists` y no por `on conflict`: `tercero` no tiene
-- unique en nombre —solo la PK— así que `on conflict do nothing` nunca
-- dispararía y correr esto dos veces duplicaría los socios. Mismo patrón que el
-- padrón de equipos.
insert into tercero (nombre, tipo, activo)
select v.nombre, 'socio', true
from (values ('Guille'), ('Agus')) as v(nombre)
where not exists (
  select 1 from tercero t where t.nombre = v.nombre and t.tipo = 'socio'
);

do $$
declare
  v_socios int;
  v_con_sueldo int;
begin
  select count(*) into v_socios from tercero where tipo = 'socio';
  select count(distinct socio_id) into v_con_sueldo from sueldo_socio;

  if v_socios < 2 then
    raise exception 'Se esperaban al menos 2 socios, hay %', v_socios;
  end if;

  raise notice
    'Socios: % · con sueldo acordado: % · devengar_sueldos_socios() no va a '
    'asentar nada para los que no tengan sueldo vigente.',
    v_socios, v_con_sueldo;
end $$;
