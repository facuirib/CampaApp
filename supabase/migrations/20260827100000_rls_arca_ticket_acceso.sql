-- ═══════════════════════════════════════════════════════════════
-- RLS en arca_ticket_acceso — el Ticket de Acceso no es público
--
-- La tabla entró sin RLS (migración 20260826240000). El comentario que
-- lo justificaba —«tabla técnica de infraestructura, no de datos del
-- negocio»— es cierto sobre QUÉ guarda, pero no sobre QUIÉN llega:
-- en Supabase, una tabla de `public` sin RLS queda expuesta por
-- PostgREST igual, y los grants por defecto le dan a `anon` los siete
-- privilegios. La anon key viaja en el bundle del navegador, así que
-- es pública por diseño.
--
-- Medido antes de este arreglo, simulando el rol con rolbypassrls =
-- false y dentro de un ROLLBACK:
--
--   anon → 1 fila visible, token de 764 chars legible
--   anon → UPDATE del token: 1 fila pisada
--   anon → DELETE: tabla vacía
--   (mismo anon, misma transacción: emisor 0 filas, comprobante 0 filas)
--
-- Ese contraste es lo que lo vuelve concluyente: no es que la
-- simulación no funcione, es esa tabla.
--
-- Con `token` + `sign` se factura a nombre de CAMPA contra ARCA
-- mientras el ticket viva. El guardado hoy está vencido, pero va a
-- haber uno vivo 12 horas después de cada emisión.
--
-- ── Por qué NINGUNA policy ──────────────────────────────────────
--
-- No es un olvido. `service_role` tiene rolbypassrls, y es con esa
-- credencial que entra el motor (arca-wsaa-core.ts arma su propio
-- cliente con SUPABASE_SERVICE_ROLE_KEY). O sea que RLS sin policies
-- deja adentro exactamente a quien tiene que estar y afuera a todo el
-- resto: `anon` y `authenticated` se quedan sin ninguna policy que los
-- deje pasar, y sin policy no pasa nadie.
--
-- Es el único caso del sistema donde corresponde. En las otras 54
-- tablas el SELECT tiene que quedar `using (true)` —los invariantes
-- contables validan con coalesce(sum(...),0) y un SELECT restringido
-- los haría pasar vacuamente (nota #1)—. Acá no hay invariante que
-- consulte esta tabla desde plpgsql: la lee el motor, por RPC, con
-- service_role. Nada más.
--
-- No cambia el comportamiento del motor. Cambia quién más puede mirar.
-- ═══════════════════════════════════════════════════════════════

alter table arca_ticket_acceso enable row level security;

comment on table arca_ticket_acceso is
  'Cache del Ticket de Acceso de WSAA (ARCA), una fila por servicio. El WSAA rechaza pedir un token nuevo si ya hay uno vigente — esta tabla evita ese error entre requests distintos. RLS encendida SIN policies a propósito: sólo service_role (que la bypasea) tiene que llegar; token y sign permiten facturar a nombre de CAMPA.';
