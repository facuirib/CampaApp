-- ─────────────────────────────────────────────────────────────────────────────
-- Quién hizo cada movimiento
--
-- Ola 4 · F3, movimientos dentro de Auditoría.
--
-- ── El dato ya estaba, y no se veía ────────────────────────────────────────
--
-- `asiento.created_by` existe desde siempre —`crear_asiento` lo exige— pero
-- `v_libro_diario` no lo exponía. O sea que el sistema sabía quién asentó cada
-- cosa y la pantalla del diario no lo mostraba: la trazabilidad estaba escrita
-- y muerta.
--
-- ── Y `v_auditoria` mostraba un UUID cortado ───────────────────────────────
--
-- La pantalla de auditoría venía haciendo `usuario_id.slice(0, 8)`, o sea ocho
-- caracteres de un uuid. Sirve para distinguir a dos personas entre sí y para
-- nada más: nadie sabe quién es `a3f9c210`.
--
-- `email_usuario(uuid)` ya resolvía uno por vez —es SECURITY DEFINER, porque
-- `auth.users` no se lee desde la app— pero llamarla por fila serían 50 RPC
-- para una tabla de 50 filas. `v_usuario` la resuelve en lote.
--
-- ── Por qué una vista y no ampliar la función ──────────────────────────────
--
-- Porque lo que hace falta es un JOIN, no una consulta puntual: el diario y la
-- auditoría quieren el nombre de MUCHOS usuarios a la vez, y una vista se
-- cruza con ellos en la misma query.
--
-- Es SECURITY INVOKER como cualquier vista, pero lee `auth.users`, que el rol
-- `authenticated` no alcanza. Por eso se apoya en la misma función SECURITY
-- DEFINER que ya existía y estaba aceptada: no se abre ninguna puerta nueva,
-- se usa la que había.
-- ─────────────────────────────────────────────────────────────────────────────

-- Los ids que aparecen como autor en algún lado. No es «todos los usuarios»:
-- es «los que dejaron rastro», que es lo que las dos pantallas necesitan.
create or replace view v_usuario as
select distinct
  u.id,
  email_usuario(u.id) as email,
  -- El nombre corto para el avatar: lo que va antes del @, capitalizado.
  initcap(split_part(coalesce(email_usuario(u.id), ''), '@', 1)) as nombre
from (
  select created_by as id from asiento where created_by is not null
  union
  select usuario_id from audit_log where usuario_id is not null
) u;

comment on view v_usuario is
  'Los usuarios que dejaron rastro (asientos o auditoría), con su email resuelto por email_usuario(). Para poder mostrar QUIÉN sin un RPC por fila.';

-- ── El autor, al final del diario ──────────────────────────────────────────
--
-- Copia EXACTA de la definición que había, con `a.created_by` agregado al final
-- y al `group by`. Se transcribe entera y no se reescribe «mejor»: cambiar de
-- paso el tipo de `total_debe` —que es `numeric` a secas— hacía fallar el
-- replace, y ése es el aviso de que una vista en uso no es lugar para mejoras
-- de paso.
create or replace view v_libro_diario as
select
  a.id as asiento_id,
  a.fecha,
  a.origen,
  a.origen_id,
  a.descripcion,
  t.nombre as torneo,
  p.codigo as predio,
  j.numero as jornada,
  per.anio,
  per.mes,
  per.estado as periodo_estado,
  a.anulado_por is not null as anulado,
  a.created_at,
  sum(l.debe) as total_debe,
  sum(l.haber) as total_haber,
  count(l.id) as lineas,
  a.created_by
from asiento a
  join periodo per on per.id = a.periodo_id
  join asiento_linea l on l.asiento_id = a.id
  left join torneo t on t.id = a.torneo_id
  left join predio p on p.id = a.predio_id
  left join jornada j on j.id = a.jornada_id
group by a.id, a.fecha, a.origen, a.origen_id, a.descripcion, t.nombre, p.codigo,
         j.numero, per.anio, per.mes, per.estado, a.anulado_por, a.created_at, a.created_by;
