-- Formato del cuadro de playoff
--
-- Decisión 64. Arquitectura §3.5.
--
-- Es dato de CATÁLOGO, no del Clausura: el formato se repite entre torneos y es
-- igual en las dos ramas de género. Por eso no lleva prefijo `clausura_2026_`.
--
-- Editable y extensible SIN migración (regla 12). Agregar octavos, repechaje o
-- tercer puesto es un insert acá; `crear_playoff` los acepta al instante porque
-- valida contra esta tabla por FK, no contra un CHECK con literales.
--
-- Los EQUIPOS no se guardan: son cantidad_partidos × 2 (cuartos 8, semifinal 4,
-- final 2). Guardar los dos permitiría que se contradigan.

insert into formato_instancia (nombre, cantidad_partidos, orden) values
  ('cuartos',   4, 1),
  ('semifinal', 2, 2),
  ('final',     1, 3)
on conflict (nombre) do nothing;

do $$
declare
  v_n int;
  v_p int;
begin
  select count(*), sum(cantidad_partidos) into v_n, v_p from formato_instancia;

  if (v_n, v_p) is distinct from (3, 7) then
    raise exception
      'Formato de instancia inesperado: % filas, % partidos (esperado 3 / 7)',
      v_n, v_p;
  end if;

  raise notice 'Formato: % instancias, % partidos por serie que llegue a la final',
    v_n, v_p;
end $$;
