-- ═══════════════════════════════════════════════════════════════
-- crear_sponsor
-- G3 del plan de pulido: crear_contrato_sponsor ya existe pero exige
-- que el tercero (sponsor) ya exista - no habia ninguna funcion para
-- crearlo, ni generica de tercero ni especifica de sponsor.
--
-- Rol confirmado contra la policy real de tercero_insert_autenticado
-- (admin, finanzas, operador) - no inventado, verificado con
-- pg_get_expr(polwithcheck, polrelid) antes de escribir el chequeo.
--
-- Datos fiscales opcionales (pueden completarse despues desde la
-- ficha) - el alta minima es solo nombre.
--
-- Verificado con BEGIN...ROLLBACK: compila, rechaza sin rol.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.crear_sponsor(
  p_nombre                          text,
  p_email                           text default null,
  p_contacto                        text default null,
  p_razon_social                    text default null,
  p_doc_tipo_default                smallint default null,
  p_doc_nro_default                 text default null,
  p_condicion_iva_receptor_default  smallint default null,
  p_domicilio_fiscal                text default null
)
returns uuid
language plpgsql
as $function$
declare
  v_id uuid;
begin
  if not (coalesce(auth_rol(), '') = any (array['admin', 'finanzas', 'operador'])) then
    raise exception
      'Crear un sponsor es de administrador, finanzas u operador. Tu rol es «%».',
      coalesce(auth_rol(), 'sin rol');
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El sponsor necesita un nombre';
  end if;

  insert into tercero (
    tipo, nombre, email, contacto, activo,
    razon_social, doc_tipo_default, doc_nro_default,
    condicion_iva_receptor_default, domicilio_fiscal
  ) values (
    'sponsor', btrim(p_nombre), p_email, p_contacto, true,
    p_razon_social, p_doc_tipo_default, p_doc_nro_default,
    p_condicion_iva_receptor_default, p_domicilio_fiscal
  )
  returning id into v_id;

  return v_id;
end;
$function$;

comment on function crear_sponsor(text, text, text, text, smallint, text, smallint, text) is
  'Alta de un sponsor (tercero tipo=sponsor). Solo el nombre es obligatorio. Es la pieza que faltaba: crear_contrato_sponsor ya exige que el sponsor exista.';
