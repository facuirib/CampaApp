-- ═══════════════════════════════════════════════════════════════════════════
-- PROPUESTA, NO APLICAR — pendiente de revisión de Facu y de confirmar
-- cuentas con el contador del cliente.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ingreso extraordinario (2/3) · tabla, RLS y vista de detalle
--
-- ── Por qué tabla propia y no `pago` ─────────────────────────────────────
--
-- `pago.tercero_id` es NOT NULL, y buena parte de las vistas de cobranza
-- (`v_deuda_detalle`, `v_pl_mensual` indirectamente vía `asiento`, etc.) dan
-- por sentado que un `pago` tiene un tercero que debe algo. Una donación o
-- la venta de un bien no necesariamente tienen tercero —y si lo tienen, no
-- es alguien con una `cuota` pendiente—. Forzarlo en `pago` significaría
-- inventar un tercero_id falso o aflojar un NOT NULL que todo el resto del
-- sistema asume. Una tabla propia no tiene ese conflicto.
create table ingreso_extraordinario (
  id          uuid primary key default gen_random_uuid(),
  concepto    text not null,
  monto       numeric(16,2) not null check (monto > 0),
  -- Sólo efectivo y transferencia en esta versión: un cheque necesita alta en
  -- la tabla `cheque` (número, banco, fecha de cobro) y esa parte no está
  -- construida. Agregar cheque es un paso aparte, cuando haga falta.
  medio_pago  text not null check (medio_pago in ('efectivo', 'transferencia')),
  fecha       date not null,
  cuenta_id   uuid not null references cuenta(id),
  tercero_id  uuid references tercero(id),
  torneo_id   uuid references torneo(id),
  predio_id   uuid references predio(id),
  asiento_id  uuid not null references asiento(id),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

comment on table ingreso_extraordinario is
  'Un ingreso que no nace de una cuota de equipo, de sponsor ni de venta de '
  'bar — donación, venta de un bien, cualquier otro. Tabla propia y no '
  '`pago`: ver la nota de arriba. `asiento_id` nace completo en el mismo '
  'insert (ver registrar_ingreso_extraordinario en el archivo 3) — nunca hay '
  'una fila con asiento_id en null, por eso la columna es NOT NULL.';

alter table ingreso_extraordinario enable row level security;

-- Sólo admin y finanzas, select e insert. Mismo patrón que
-- 20260904160000_proveedor_policies_con_rol.sql.
create policy ingreso_extraordinario_select_rol on ingreso_extraordinario
  for select to authenticated
  using (auth_rol() = any (array['admin', 'finanzas']));

create policy ingreso_extraordinario_insert_rol on ingreso_extraordinario
  for insert to authenticated
  with check (auth_rol() = any (array['admin', 'finanzas']));

-- Sin policy de UPDATE ni DELETE, a propósito: la fila nace completa (ver
-- archivo 3) y nunca se edita — se anula por contraasiento, igual que un
-- asiento (regla 4). Un intento de UPDATE por fuera de la función afecta 0
-- filas EN SILENCIO bajo RLS sin ninguna policy que lo permita — exactamente
-- el motivo por el que `registrar_ingreso_extraordinario` genera el id
-- ANTES del asiento y hace un solo insert: un UPDATE posterior habría
-- quedado sin efecto, sin ningún error que lo delate.

-- ── `security_invoker = true`, y no es cosmético ─────────────────────────
--
-- Sin esta opción (PG15+), Postgres evalúa las RLS policies de
-- `ingreso_extraordinario` con los PRIVILEGIOS DE QUIEN CREÓ LA VISTA —el
-- rol que corre las migraciones, típicamente con BYPASSRLS— y no de quien
-- la consulta. Un operador vería TODAS las filas igual, porque la vista
-- resuelve el acceso como su dueño antes de que la policy de la tabla tenga
-- oportunidad de filtrar nada. Con el flag, se evalúa con los privilegios
-- de quien llama, y la policy aplica de verdad.
--
-- Ninguna otra vista del proyecto usa este flag today —`grep -rn
-- security_invoker supabase/migrations/*.sql` no encuentra nada— y hay un
-- comentario existente que afirma lo contrario (20260901290000_usuario_y_
-- diario_autor.sql:29, "Es SECURITY INVOKER como cualquier vista"), que es
-- impreciso para lo que hace falta acá. Queda anotado para la auditoría de
-- seguridad en docs/coordinacion.md — no se toca en esta migración.
create view v_ingreso_extraordinario_detalle
  with (security_invoker = true)
as
select
  ie.id, ie.concepto, ie.monto, ie.medio_pago, ie.fecha,
  c.codigo  as cuenta_codigo,
  c.nombre  as cuenta_nombre,
  t.nombre  as tercero,
  tt.nombre as torneo,
  p.nombre  as predio,
  case when a.anulado_por is not null then 'anulado' else 'vigente' end as estado,
  ie.created_at
from ingreso_extraordinario ie
  join cuenta c          on c.id = ie.cuenta_id
  left join tercero t    on t.id = ie.tercero_id
  left join torneo tt    on tt.id = ie.torneo_id
  left join predio p     on p.id = ie.predio_id
  left join asiento a    on a.id = ie.asiento_id
order by ie.fecha desc, ie.created_at desc;

comment on view v_ingreso_extraordinario_detalle is
  'CON security_invoker=true, a propósito — ver la nota en la tabla. Sin '
  'este flag un operador vería todas las filas igual, porque la vista '
  'resolvería el acceso con los privilegios de quien la creó, no de quien '
  'la consulta.';
