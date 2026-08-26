-- ═══════════════════════════════════════════════════════════════
-- arca_ticket_acceso — persistencia del Ticket de Acceso entre requests
-- PROPUESTA, NO APLICAR sin revisión.
--
-- Hallazgo de Facu (26/08): el WSAA rechaza pedir un token nuevo si ya
-- hay uno vigente (coe.alreadyAuthenticated, dura 12hs). Un solo
-- autenticarArca() por Server Action alcanza DENTRO de un request, pero
-- no entre requests — sin persistir, el primer cobro del día autentica
-- bien y el segundo (otro request, minutos después) encuentra el token
-- todavía vivo en ARCA y falla.
--
-- Solución: guardar token/sign/expiración en una tabla de una sola fila
-- por servicio (hoy solo 'wsfe').
--
-- No lleva RLS por ahora — tabla técnica de infraestructura, no de
-- datos del negocio.
--
-- Verificado con BEGIN...ROLLBACK contra la base real (26/08).
-- ═══════════════════════════════════════════════════════════════

create table arca_ticket_acceso (
  servicio    text primary key,
  token       text not null,
  sign        text not null,
  expira_at   timestamptz not null,
  updated_at  timestamptz not null default now()
);

comment on table arca_ticket_acceso is
  'Cache del Ticket de Acceso de WSAA (ARCA), una fila por servicio. El WSAA rechaza pedir un token nuevo si ya hay uno vigente — esta tabla evita ese error entre requests distintos.';

create or replace function public.arca_ticket_vigente(
  p_servicio text
)
returns table (token text, sign text, expira_at timestamptz)
language sql
as $function$
  select t.token, t.sign, t.expira_at
  from arca_ticket_acceso t
  where t.servicio = p_servicio
    and t.expira_at > now() + interval '5 minutes';
$function$;

comment on function arca_ticket_vigente(text) is
  'Devuelve el ticket de acceso vigente para un servicio, si existe y no está por vencer (margen de 5 min). Sin filas = hay que autenticar de nuevo.';

create or replace function public.arca_guardar_ticket(
  p_servicio  text,
  p_token     text,
  p_sign      text,
  p_expira_at timestamptz
)
returns void
language plpgsql
as $function$
begin
  insert into arca_ticket_acceso (servicio, token, sign, expira_at, updated_at)
  values (p_servicio, p_token, p_sign, p_expira_at, now())
  on conflict (servicio) do update
    set token = excluded.token,
        sign = excluded.sign,
        expira_at = excluded.expira_at,
        updated_at = now();
end;
$function$;

comment on function arca_guardar_ticket(text, text, text, timestamptz) is
  'Guarda o actualiza el ticket de acceso de un servicio.';
