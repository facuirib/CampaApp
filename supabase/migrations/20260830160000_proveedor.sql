-- ═══════════════════════════════════════════════════════════════
-- proveedor + gasto.proveedor_id
-- APLICADA el 30/08/2026.
--
-- Hallazgo de Facu (30/08, punto tres del tablero): gasto.tercero_id
-- no existe, y los gastos no se pueden agrupar por a quien se le paga.
-- Decision de Horacio: proveedor es una tabla separada, no un tipo mas
-- de tercero (que hoy es equipo/socio/sponsor - todos cobran al club,
-- proveedor es la direccion opuesta: el club le paga a el).
--
-- Con datos fiscales completos (razon_social, condicion_iva_id via el
-- catalogo existente condicion_iva_receptor, domicilio) mas datos de
-- gestion (email, contacto) — pedido explicito de Horacio de tener
-- todos los datos pertinentes a un proveedor en Argentina, no solo
-- nombre/cuit.
--
-- Verificado con BEGIN...ROLLBACK contra la base real (30/08): alta de
-- proveedor de prueba ("Árbitros Zona Norte") con todos los campos,
-- se creó correctamente. Todo deshecho con rollback.
-- ═══════════════════════════════════════════════════════════════

create table proveedor (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  razon_social    text,
  cuit            text,
  condicion_iva_id smallint references condicion_iva_receptor(id),
  domicilio       text,
  email           text,
  contacto        text,
  activo          boolean not null default true
);

comment on table proveedor is
  'A quien se le paga un gasto - arbitros, canchas de terceros, imprentas, etc. Separado de tercero (que son equipo/socio/sponsor, todos flujos de cobro AL club, no del club hacia afuera).';

alter table gasto
  add column proveedor_id uuid references proveedor(id);

comment on column gasto.proveedor_id is
  'A quien se le pago este gasto. Nullable - un gasto puede no tener proveedor identificado. Aditivo, no rompe gastos existentes.';

alter table proveedor enable row level security;

create policy "proveedor_select_autenticado"
  on proveedor for select
  to authenticated
  using (true);
create policy "proveedor_insert_autenticado"
  on proveedor for insert
  to authenticated
  with check (true);
create policy "proveedor_update_autenticado"
  on proveedor for update
  to authenticated
  using (true) with check (true);

create or replace function public.crear_proveedor(
  p_nombre           text,
  p_razon_social     text default null,
  p_cuit             text default null,
  p_condicion_iva_id smallint default null,
  p_domicilio        text default null,
  p_email            text default null,
  p_contacto         text default null
)
returns uuid
language plpgsql
as $function$
declare
  v_id uuid;
begin
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El proveedor necesita un nombre';
  end if;

  insert into proveedor (nombre, razon_social, cuit, condicion_iva_id, domicilio, email, contacto)
  values (btrim(p_nombre), p_razon_social, p_cuit, p_condicion_iva_id, p_domicilio, p_email, p_contacto)
  returning id into v_id;

  return v_id;
end;
$function$;

comment on function crear_proveedor(text, text, text, smallint, text, text, text) is
  'Alta de un proveedor nuevo. Solo el nombre es obligatorio — el resto se completa cuando se tenga a mano.';
