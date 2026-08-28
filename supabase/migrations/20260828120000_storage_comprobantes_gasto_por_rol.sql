-- ═══════════════════════════════════════════════════════════════════════════
-- Las policies del bucket comprobantes-gasto, por rol
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La migración 20260827200000 creó el bucket con cuatro policies que dicen
-- `to authenticated` y validan sólo `bucket_id`. **`authenticated` no es un rol
-- del sistema: es «cualquiera que entró».** El resultado, medido rol por rol
-- con rolbypassrls = false y en ROLLBACK, fue que los cinco podían subir:
--
--     admin 🔴 · operador 🔴 · finanzas 🔴 · bar 🔴 · read-only 🔴
--
-- O sea que `read-only` —el rol que existe para no escribir nada— podía subir
-- archivos, y `bar` también, que ni siquiera ve la pantalla de Gastos.
--
-- No es un descuido menor: es el modelo de roles que las 140 policies de
-- `public` respetan tabla por tabla, salteado entero en Storage. Y salteado
-- justo donde el objeto es un documento de un proveedor.
--
-- ── Quién escribe ─────────────────────────────────────────────────────────
--
-- Los mismos que pueden cargar el gasto: `gasto.INSERT` es admin, operador y
-- finanzas. Adjuntar el comprobante es parte del mismo acto —cargar el gasto—,
-- así que separar los permisos abriría la puerta a que alguien pueda adjuntar
-- un documento a un gasto que no puede crear.
--
-- ── Quién lee ─────────────────────────────────────────────────────────────
--
-- Los que ven Gastos, que en el sidebar es el grupo por defecto: admin,
-- operador, read-only y finanzas. **Todos menos `bar`.**
--
-- `read-only` entra porque su definición es ver todo sin cambiar nada, y un
-- comprobante adjunto es parte de lo que hay para ver. `bar` queda afuera
-- porque no llega a la pantalla: darle acceso por Storage sería una puerta
-- lateral a documentos que la navegación no le ofrece.
--
-- Acá NO aplica la nota #1 —la que obliga a dejar los SELECT en `using (true)`
-- para que los invariantes contables no pasen vacuamente—: esa regla existe
-- porque hay funciones plpgsql que validan con `coalesce(sum(...), 0)` sobre
-- esas tablas. Ninguna función lee `storage.objects`. Sin ese riesgo, el SELECT
-- puede y debe restringirse.
--
-- ── La forma ──────────────────────────────────────────────────────────────
--
-- `storage.objects` tiene su propia RLS, encendida, y la tabla es de
-- `supabase_storage_admin`. Las policies se escriben igual que las de `public`;
-- lo único distinto es calificar `public.auth_rol()` con el schema, porque el
-- search_path acá no incluye `public`.
--
-- Se dropean y se recrean en vez de alterarse: los nombres viejos decían
-- «_autenticado», que era exactamente la afirmación equivocada.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "comprobantes_gasto_select_autenticado" on storage.objects;
drop policy if exists "comprobantes_gasto_insert_autenticado" on storage.objects;
drop policy if exists "comprobantes_gasto_update_autenticado" on storage.objects;
drop policy if exists "comprobantes_gasto_delete_autenticado" on storage.objects;

-- Lectura: los que ven Gastos (todos menos bar).
create policy "comprobantes_gasto_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'comprobantes-gasto'
    and public.auth_rol() = any (array['admin', 'operador', 'read-only', 'finanzas'])
  );

-- Escritura: los mismos que gasto.INSERT.
create policy "comprobantes_gasto_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'comprobantes-gasto'
    and public.auth_rol() = any (array['admin', 'operador', 'finanzas'])
  );

create policy "comprobantes_gasto_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'comprobantes-gasto'
    and public.auth_rol() = any (array['admin', 'operador', 'finanzas'])
  )
  with check (
    bucket_id = 'comprobantes-gasto'
    and public.auth_rol() = any (array['admin', 'operador', 'finanzas'])
  );

create policy "comprobantes_gasto_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'comprobantes-gasto'
    and public.auth_rol() = any (array['admin', 'operador', 'finanzas'])
  );
