-- ═══════════════════════════════════════════════════════════════
-- arca_ticket_acceso distingue ambiente
-- ⚠️ APLICADA el 30/08/2026, fuera del flujo normal de migraciones —
-- se aplicó directo en el SQL Editor de Supabase antes de commitear
-- este archivo (primero en rollback, después de verdad). Este
-- archivo documenta lo que ya está aplicado, no propone un cambio
-- nuevo.
--
-- Hallazgo de Facu (30/08, "A REVISAR · el ticket de ARCA se cachea
-- sin distinguir el ambiente"): `arca_ticket_acceso` tiene `servicio`
-- como única clave, así que un ticket sacado en producción se le
-- entrega a una llamada de homologación, y al revés. `produccion`
-- decidía a qué URL se postea, pero no con qué credencial se firmó
-- el ticket que se reutiliza.
--
-- No rompió nada hasta ahora porque el único ticket vigente era de
-- producción y venció — pero deja el flag de ambiente sin ser
-- autoritativo en la mitad que más importa, la autenticación.
--
-- Arreglo natural, como lo dejó planteado Facu: la clave pasa a ser
-- (servicio, produccion).
--
-- Tabla: TRUNCATE primero, no backfill. La fila que había podía tener
-- ambigüedad de ambiente bajo el modelo viejo (una sola clave para
-- los dos), así que se vació en vez de asumirle un ambiente. La
-- columna se agrega NOT NULL DEFAULT true solo para poder crearla
-- sobre una tabla ya vacía sin fricción, y el default se saca después
-- — no queda persistente: todo insert real pasa produccion explícito
-- desde arca_guardar_ticket, así que un default que sobreviva sería
-- una fuente de ambigüedad silenciosa, la misma clase de bug que esta
-- migración cierra.
--
-- Función: el `drop function if exists` con las firmas viejas hace
-- falta de verdad, y no por prolijidad — se aplicó primero con
-- `create or replace` sin drop y quedó SOBRECARGA (count=2 en
-- pg_proc para las dos funciones: la firma vieja de 1/4 argumentos
-- conviviendo con la nueva de 2/5). Corregido con el drop explícito
-- antes de recrear; count=1 verificado después.
--
-- Verificado con BEGIN...ROLLBACK contra la base real (30/08), y
-- después aplicado de verdad y reverificado.
-- ═══════════════════════════════════════════════════════════════

truncate table arca_ticket_acceso;

alter table arca_ticket_acceso
  add column produccion boolean not null default true;

alter table arca_ticket_acceso
  alter column produccion drop default;

alter table arca_ticket_acceso drop constraint arca_ticket_acceso_pkey;
alter table arca_ticket_acceso add primary key (servicio, produccion);

comment on column arca_ticket_acceso.produccion is
  'true = ticket contra el WSAA de producción, false = homologación. Parte de la clave: un ticket de un ambiente no sirve para el otro, aunque el servicio sea el mismo.';

drop function if exists public.arca_ticket_vigente(text);

create or replace function public.arca_ticket_vigente(
  p_servicio   text,
  p_produccion boolean
)
returns table (token text, sign text, expira_at timestamptz)
language sql
as $function$
  select t.token, t.sign, t.expira_at
  from arca_ticket_acceso t
  where t.servicio = p_servicio
    and t.produccion = p_produccion
    and t.expira_at > now() + interval '5 minutes';
$function$;

comment on function arca_ticket_vigente(text, boolean) is
  'Devuelve el ticket de acceso vigente para un servicio Y AMBIENTE, si existe y no está por vencer (margen de 5 min). Sin filas = hay que autenticar de nuevo. El ambiente es parte de la clave: no mezcla tickets de producción con los de homologación.';

drop function if exists public.arca_guardar_ticket(text, text, text, timestamptz);

create or replace function public.arca_guardar_ticket(
  p_servicio   text,
  p_produccion boolean,
  p_token      text,
  p_sign       text,
  p_expira_at  timestamptz
)
returns void
language plpgsql
as $function$
begin
  insert into arca_ticket_acceso (servicio, produccion, token, sign, expira_at, updated_at)
  values (p_servicio, p_produccion, p_token, p_sign, p_expira_at, now())
  on conflict (servicio, produccion) do update
    set token = excluded.token,
        sign = excluded.sign,
        expira_at = excluded.expira_at,
        updated_at = now();
end;
$function$;

comment on function arca_guardar_ticket(text, boolean, text, text, timestamptz) is
  'Guarda o actualiza el ticket de acceso de un servicio, para el ambiente (producción/homologación) que lo autenticó.';
