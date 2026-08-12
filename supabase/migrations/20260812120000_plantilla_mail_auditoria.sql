-- ─────────────────────────────────────────────────────────────────────────────
-- Quién cambió el texto que se le manda a 300 equipos, y cuándo.
--
-- `plantilla_mail` es configuración editable desde la app: cualquier usuario
-- con sesión puede reescribir el reclamo que sale firmado como CAMPA. Hasta
-- acá, ese cambio no dejaba rastro — la fila se sobrescribía y no quedaba nada
-- que dijera quién la tocó.
--
-- No es control de versiones: no guarda el texto anterior. Es la pregunta
-- mínima que hay que poder contestar cuando alguien dice "esto no lo escribí
-- yo": la última mano y la fecha.
--
-- Por qué no alcanza con `fn_audit`: la auditoría genérica registra el evento,
-- pero la pantalla de plantillas necesita mostrar "Última edición: … por …" al
-- lado del editor, y para eso tiene que leerlo de la propia fila. Dos columnas
-- en la tabla de config es más barato que una consulta a la auditoría en cada
-- render.
-- ─────────────────────────────────────────────────────────────────────────────

alter table plantilla_mail
  -- Nullable, y va a quedar en null para siempre en las cuatro filas
  -- sembradas: nadie las editó, las puso una migración. Un default acá sería
  -- inventar un autor que no existe.
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz;

comment on column plantilla_mail.updated_by is
  'Quién guardó la plantilla por última vez desde la app. Null = nunca se editó: '
  'la fila es la que sembró la migración.';

comment on column plantilla_mail.updated_at is
  'Cuándo se guardó por última vez. Null junto con updated_by, nunca sin él.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Y cómo se lee ese uuid.
--
-- Guardar `updated_by` no alcanza para mostrar "por Mati": `authenticated` NO
-- puede leer `auth.users` —da "permission denied for table users"— así que
-- desde la app un uuid de usuario es un uuid y nada más. Es la misma pared con
-- la que ya nos comimos el fallback de `crear_asiento`.
--
-- Por eso esta función, que es la única forma de cruzar esa pared sin darle a
-- nadie acceso a la tabla: SECURITY DEFINER, un solo dato de salida —el email—
-- y ejecutable sólo por quien tiene sesión.
--
-- Qué se está decidiendo acá, explícito: **cualquier usuario logueado puede
-- ver el email de cualquier otro.** Con cinco personas de la comisión
-- compartiendo el sistema, eso es exactamente lo que se quiere: la pregunta
-- "¿quién tocó esto?" no se contesta con "a1b2c3d4". Si algún día entran
-- usuarios que no son de la comisión, esto se revisa.
--
-- De paso destraba `/auditoria`, que hoy muestra los primeros 8 caracteres del
-- uuid por esta misma razón. **No lo cambio en este commit** —es otra pantalla
-- y otro carril—, pero queda la herramienta.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.email_usuario(p_usuario_id uuid)
returns text
language sql
stable
security definer
-- `set search_path` fijo: sin esto, un search_path manipulado podría hacer que
-- una función SECURITY DEFINER resuelva otro objeto con el mismo nombre.
set search_path = auth, public
as $$
  select u.email::text from auth.users u where u.id = p_usuario_id;
$$;

comment on function public.email_usuario(uuid) is
  'El email de un usuario, para mostrar quién hizo algo. SECURITY DEFINER porque '
  'authenticated no puede leer auth.users. Devuelve null si el id no existe.';

-- Los TRES revoke hacen falta, y el de `anon` es el que importa.
--
-- `revoke from public` NO alcanza: Supabase tiene default privileges que le
-- dan execute a `anon` y `authenticated` sobre toda función nueva del schema
-- public, y esos son grants directos a esos roles, no al pseudo-rol PUBLIC.
-- Sin el revoke explícito, cualquiera con la anon key —o sea cualquiera que
-- abra la app sin loguearse— podía pedir el email de un usuario por su uuid.
--
-- Verificado con has_function_privilege('anon', ...) después de aplicar: sin
-- esta línea daba true.
revoke all on function public.email_usuario(uuid) from public;
revoke all on function public.email_usuario(uuid) from anon;
grant execute on function public.email_usuario(uuid) to authenticated;

-- Sin trigger, a propósito.
--
-- Un `before update` que ponga `now()` sabría el CUÁNDO pero no el QUIÉN:
-- `auth.uid()` es null cuando la escritura no viene de una sesión, y ahí
-- quedaría una fecha sin autor — justo la mitad que no sirve. Las dos columnas
-- las escribe junto el Server Action de guardado, que es el único camino de
-- edición y sí tiene el usuario a mano.
--
-- Si mañana aparece un segundo camino de escritura, la decisión se revisa: ahí
-- el trigger empieza a valer más que la disciplina.
