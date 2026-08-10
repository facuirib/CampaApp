-- ═══════════════════════════════════════════════════════════════════════════
-- BLOQUE 10 MÍNIMO · sacar el fallback de usuario de crear_asiento
--
-- Cierra la deuda que la decisión 89 abrió: ahí se sacó el fallback de
-- `registrar_cobro`, pero quedó vivo en `crear_asiento`, que es **la única vía
-- de escritura al diario**. O sea que el problema seguía entero: sacarlo de una
-- función y dejarlo en el motor que esa función llama no cambia nada.
--
-- La línea era:
--
--     v_user_id := coalesce(p_created_by, auth.uid(), (select id from auth.users limit 1));
--
-- y hacía los mismos dos daños que la decisión 89 describe para el cobro:
--
--   1 · ROMPÍA DESDE EL NAVEGADOR. Sin sesión, `auth.uid()` es null y la
--       subconsulta se evalúa. Ni `anon` ni `authenticated` pueden leer
--       `auth.users` —verificado cambiando de rol: las dos dan «permission
--       denied for table users»— así que ese era el error que llegaba a
--       pantalla. No dice nada de lo que pasó.
--
--   2 · ESCRIBÍA UN RESPONSABLE FALSO, que es lo serio. Desde un rol que sí
--       puede leer la tabla —service_role, o sea todas nuestras pruebas por
--       SQL— el asiento quedaba atribuido AL PRIMER USUARIO DE auth.users, en
--       silencio. No falla: miente sobre quién lo hizo.
--
-- Ahora se puede sacar porque hay auth: con sesión, `auth.uid()` devuelve el
-- usuario y el coalesce corta ahí — el tercer término ni se evalúa, así que el
-- «permission denied» desaparece por no ejecutarse, no por permiso.
--
-- SECURITY INVOKER, como estaba. No se toca nada más de la función.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.crear_asiento(
  p_fecha       date,
  p_origen      text,
  p_descripcion text,
  p_lineas      jsonb,
  p_torneo_id   uuid default null,
  p_jornada_id  uuid default null,
  p_predio_id   uuid default null,
  p_origen_id   uuid default null,
  p_created_by  uuid default null
)
returns uuid
language plpgsql
as $function$
declare
  v_periodo_id uuid;
  v_asiento_id uuid;
  v_user_id    uuid;
  v_linea      jsonb;
  v_cuenta_id  uuid;
  v_codigo     text;
  v_debe       numeric(16,2);
  v_haber      numeric(16,2);
  v_suma_debe  numeric(16,2) := 0;
  v_suma_haber numeric(16,2) := 0;
  v_n          int := 0;
begin
  if p_lineas is null or jsonb_array_length(p_lineas) < 2 then
    raise exception 'Un asiento necesita al menos dos líneas';
  end if;

  -- Usuario: el parámetro o la sesión. SIN fallback (decisión 89).
  v_user_id := coalesce(p_created_by, auth.uid());
  if v_user_id is null then
    raise exception
      'Falta responsable del asiento: se requiere p_created_by o sesión '
      'autenticada.';
  end if;

  v_periodo_id := periodo_de_fecha(p_fecha);

  if p_predio_id is null and exists (
    select 1 from jsonb_array_elements(p_lineas) x
    where x->>'cuenta' = 'CAJA_EFECTIVO'
  ) then
    raise exception
      'Un movimiento de Caja Efectivo requiere predio_id: el arqueo es por predio';
  end if;

  insert into asiento (
    periodo_id, torneo_id, jornada_id, predio_id,
    fecha, origen, origen_id, descripcion, created_by
  ) values (
    v_periodo_id, p_torneo_id, p_jornada_id, p_predio_id,
    p_fecha, p_origen, p_origen_id, p_descripcion, v_user_id
  ) returning id into v_asiento_id;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    v_n      := v_n + 1;
    v_codigo := v_linea->>'cuenta';
    v_debe   := coalesce((v_linea->>'debe')::numeric,  0);
    v_haber  := coalesce((v_linea->>'haber')::numeric, 0);

    select id into v_cuenta_id from cuenta where codigo = v_codigo;
    if v_cuenta_id is null then
      raise exception 'La cuenta % no existe (línea %)', v_codigo, v_n;
    end if;

    if v_debe = 0 and v_haber = 0 then
      raise exception 'La línea % no tiene importe', v_n;
    end if;
    if v_debe > 0 and v_haber > 0 then
      raise exception 'La línea % tiene debe y haber a la vez', v_n;
    end if;
    if v_debe < 0 or v_haber < 0 then
      raise exception 'La línea % tiene un importe negativo. Para revertir, usá anular_asiento()', v_n;
    end if;

    insert into asiento_linea (asiento_id, cuenta_id, debe, haber, tercero_id)
    values (v_asiento_id, v_cuenta_id, v_debe, v_haber,
            (v_linea->>'tercero_id')::uuid);

    v_suma_debe  := v_suma_debe  + v_debe;
    v_suma_haber := v_suma_haber + v_haber;
  end loop;

  if v_suma_debe <> v_suma_haber then
    raise exception
      'El asiento no balancea: debe % · haber % · diferencia %',
      v_suma_debe, v_suma_haber, abs(v_suma_debe - v_suma_haber);
  end if;

  return v_asiento_id;
end $function$;

comment on function public.crear_asiento(date, text, text, jsonb, uuid, uuid, uuid, uuid, uuid) is
  'Única vía de escritura en el diario. Resuelve el período, valida las líneas '
  'y garantiza Debe = Haber. Exige responsable: p_created_by o sesión. Sin '
  'fallback a auth.users (decisión 89).';
