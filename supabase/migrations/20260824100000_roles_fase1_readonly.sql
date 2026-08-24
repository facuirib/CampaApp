-- ═══════════════════════════════════════════════════════════════════════════
-- Roles · Fase 1 · read-only — allowlist positiva sobre las 79 de escritura
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Primera fase que restringe algo. Las 79 policies de escritura pasan de
-- `using (true)` a nombrar **qué roles permiten**. `read-only` queda afuera por
-- omisión, no por estar nombrado.
--
-- Las 50 de SELECT **no se tocan**, y eso no es una preferencia: es la
-- restricción dura del diseño. Quince funciones del sistema validan con
-- `coalesce(sum(...))` sobre tablas del núcleo —`check_asiento_balanceado`
-- entre ellas— y nueve **rechazan** según ese resultado. Con el SELECT
-- restringido verían `0`, la guarda pasaría de largo y Debe = Haber quedaría
-- desactivado sin un solo error. `read-only` lee todo, incluido el núcleo, y
-- eso es lo que mantiene los invariantes exigibles.
--
-- ── Por qué allowlist y no denylist ───────────────────────────────────────
--
-- La forma obvia era negar: `auth_rol() <> 'read-only'`. Se descartó por lo que
-- pasa cuando el nombre del rol y el de la policy no coinciden — un guion de
-- más, una fase futura que renombra, un typo:
--
--     rol del usuario = 'read-only'
--     denylist  rol <> 'readonly'                    → TRUE  → ESCRIBE
--     allowlist rol = any('admin','operador','bar')  → FALSE → denegado
--
-- Medido, no supuesto. **Una denylist convierte un typo en un permiso; una
-- allowlist lo convierte en una negación.** En una capa de seguridad, el modo
-- de falla importa más que el caso feliz.
--
-- El mismo argumento cubre al usuario **sin rol**: la expresión da NULL,
-- Postgres la trata como falsa, y queda denegado. Es el caso de `mati`, que
-- quedó desactivado y sin rol en la Fase 0.
--
-- ── Por qué un loop y no 79 policies escritas a mano ──────────────────────
--
-- El cambio es idéntico en las 79. Escribirlas una por una son 158 sentencias
-- donde saltearse una no se nota — y una policy olvidada en `using (true)` es
-- un agujero que ninguna prueba de "read-only no puede escribir" encuentra, a
-- menos que pruebe justo esa tabla.
--
-- El filtro del loop es lo que garantiza el alcance: `cmd <> 'SELECT'` protege
-- las 50 **por construcción**, y `qual = 'true'` asegura que solo toca las que
-- todavía no fueron restringidas —así relanzarlo tras la Fase 2 no pisaría lo
-- que esa fase haya afinado—.

create or replace function public.auth_rol()
returns text
language sql
stable
as $function$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'rol', '')
$function$;

comment on function auth_rol() is
  'El rol del usuario actual, leído de app_metadata en el JWT. Vive ahí y no en user_metadata porque el segundo lo edita el propio usuario con updateUser(): un rol ahí sería un permiso que su portador puede subirse solo. Devuelve NULL si no tiene rol — y en una allowlist, NULL deniega.';


do $fase1$
declare
  p          record;
  v_cond     text := 'auth_rol() = any (array[''admin'',''operador'',''bar''])';
  v_escritas int := 0;
  v_select   int;
begin
  select count(*) into v_select from pg_policies where schemaname = 'public' and cmd = 'SELECT';

  for p in
    select schemaname, tablename, policyname, cmd
      from pg_policies
     where schemaname = 'public'
       and cmd <> 'SELECT'                                   -- protege las 50
       and coalesce(qual, 'true') = 'true'                   -- solo las no restringidas
       and coalesce(with_check, 'true') = 'true'
     order by tablename, policyname
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);

    if p.cmd = 'INSERT' then
      execute format(
        'create policy %I on %I.%I for insert to authenticated with check (%s)',
        p.policyname, p.schemaname, p.tablename, v_cond);
    elsif p.cmd = 'UPDATE' then
      -- Las dos mitades: `using` decide qué filas puede tocar, `with check` qué
      -- puede dejar escrito. Sin la segunda, un rol podría tomar una fila que
      -- sí ve y dejarla en un estado que no le corresponde.
      execute format(
        'create policy %I on %I.%I for update to authenticated using (%s) with check (%s)',
        p.policyname, p.schemaname, p.tablename, v_cond, v_cond);
    else
      execute format(
        'create policy %I on %I.%I for delete to authenticated using (%s)',
        p.policyname, p.schemaname, p.tablename, v_cond);
    end if;

    v_escritas := v_escritas + 1;
  end loop;

  -- El conteo de SELECT antes y después: si el filtro fallara y el loop tocara
  -- una, se nota acá y la migración aborta en vez de dejar el núcleo cerrado.
  if v_select <> (select count(*) from pg_policies where schemaname='public' and cmd='SELECT') then
    raise exception 'El loop tocó policies de SELECT. Abortado: la nota #1 no se negocia.';
  end if;

  raise notice 'Fase 1: % policies de escritura restringidas, % de SELECT intactas',
    v_escritas, v_select;
end $fase1$;
