-- ============================================================================
-- CAMPA · Seed de PRODUCCIÓN · Clausura 2026 · 1/2 · Estructura
--
-- Torneo + categorías + series. Es la precondición de B0: sin serie no hay
-- a qué apuntar la ficha, y sin el género de la categoría no se encuentra
-- el tarifario.
--
-- Idempotente: se puede correr dos veces sin duplicar. Todas las inserciones
-- van con on conflict do nothing contra la clave natural.
--
-- Orden: este archivo va PRIMERO. El tarifario (2/2) necesita el torneo.
-- ============================================================================

-- ── Torneo ──────────────────────────────────────────────────────────────────
-- ejercicio_id queda null a propósito: por decisión operativa no se cargan
-- ejercicios con fechas fiscales hasta que el estudio externo lo pida
-- (arquitectura.md §3.1, nota de diseño).
--
-- cant_fechas queda en su default (10) y es vestigial: desde la reconciliación
-- del calendario cada género corre su propia cantidad (masc 15, fem 13) y eso
-- vive en jornada, no acá.

insert into torneo (nombre, temporada, anio, activo, estado)
values ('Clausura 2026', 'clausura', 2026, true, 'planificado')
on conflict (temporada, anio) do nothing;


-- ── Categorías ──────────────────────────────────────────────────────────────
-- El género es atributo de la categoría (decisión 35): Libre/+30/+35/+40 son
-- masculinas, Femenino/Flex femeninas. La ficha lo hereda subiendo desde la
-- serie, y es lo que resuelve qué plan_tarifa le aplica.

insert into categoria (torneo_id, nombre, genero, orden)
select t.id, c.nombre, c.genero::genero, c.orden
from torneo t
cross join (values
  ('Libre',     'masculino', 1),
  ('+30',       'masculino', 2),
  ('+35',       'masculino', 3),
  ('+40',       'masculino', 4),
  ('Femenino',  'femenino',  5),
  ('Flex',      'femenino',  6)
) as c(nombre, genero, orden)
where t.temporada = 'clausura' and t.anio = 2026
on conflict (torneo_id, nombre) do nothing;


-- ── Series ──────────────────────────────────────────────────────────────────
-- Cuelgan de la categoría, no del torneo: la "Serie A de Libre" y la "Serie A
-- de +30" son filas distintas (decisión 34).
--
--   Libre     A–F   (6)
--   +30       A–C   (3)
--   +35       A–B   (2)
--   +40       A     (1)
--   Femenino  A–G   (7)
--   Flex      A     (1)
--                   ── 20 series

insert into serie (categoria_id, nombre, orden)
select cat.id, s.nombre, s.orden
from categoria cat
join torneo t on t.id = cat.torneo_id
join (values
  ('Libre',    'A', 1), ('Libre',    'B', 2), ('Libre',    'C', 3),
  ('Libre',    'D', 4), ('Libre',    'E', 5), ('Libre',    'F', 6),
  ('+30',      'A', 1), ('+30',      'B', 2), ('+30',      'C', 3),
  ('+35',      'A', 1), ('+35',      'B', 2),
  ('+40',      'A', 1),
  ('Femenino', 'A', 1), ('Femenino', 'B', 2), ('Femenino', 'C', 3),
  ('Femenino', 'D', 4), ('Femenino', 'E', 5), ('Femenino', 'F', 6),
  ('Femenino', 'G', 7),
  ('Flex',     'A', 1)
) as s(categoria, nombre, orden) on s.categoria = cat.nombre
where t.temporada = 'clausura' and t.anio = 2026
on conflict (categoria_id, nombre) do nothing;


-- ── Verificación ────────────────────────────────────────────────────────────

do $$
declare v_torneo uuid; v_cat int; v_serie int; v_fallas text := '';
begin
  select id into v_torneo from torneo where temporada = 'clausura' and anio = 2026;
  if v_torneo is null then
    raise exception 'No se creó el torneo Clausura 2026';
  end if;

  select count(*) into v_cat from categoria where torneo_id = v_torneo;
  if v_cat <> 6 then
    v_fallas := v_fallas || format(E'\n  · categorías: %s, se esperaban 6', v_cat);
  end if;

  select count(*) into v_serie
    from serie s join categoria c on c.id = s.categoria_id
   where c.torneo_id = v_torneo;
  if v_serie <> 20 then
    v_fallas := v_fallas || format(E'\n  · series: %s, se esperaban 20', v_serie);
  end if;

  if exists (
    select 1 from categoria
     where torneo_id = v_torneo
       and ((nombre in ('Libre','+30','+35','+40')   and genero <> 'masculino')
         or (nombre in ('Femenino','Flex')           and genero <> 'femenino'))
  ) then
    v_fallas := v_fallas || E'\n  · alguna categoría quedó con el género cambiado';
  end if;

  if v_fallas <> '' then
    raise exception 'Seed de estructura incompleto:%', v_fallas;
  end if;

  raise notice 'Estructura Clausura 2026 OK · 6 categorías · 20 series';
end $$;
