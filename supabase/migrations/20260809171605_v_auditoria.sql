-- ═══════════════════════════════════════════════════════════════════════════
-- v_auditoria — el log de cambios, con el diff contado en SQL
--
-- `audit_log` guarda dos snapshots jsonb por evento y nada más: para saber si
-- un evento cambió algo hay que compararlos. Hecho en el front eso serviría
-- para pintar la fila, pero NO para filtrar —PostgREST no puede filtrar por
-- algo que no es una columna—, así que la pantalla tendría que traerse los
-- 1.134 eventos para mostrar los que importan.
--
-- La vista agrega `campos_cambiados` y con eso el filtro "sólo con cambios" es
-- un `> 0` que viaja a la base.
--
-- Es de sólo lectura y aditiva: no toca `audit_log`, ni el trigger, ni nada.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Qué cuenta `campos_cambiados`, operación por operación ─────────────────
--
-- La fórmula es una sola —claves de `anterior` unidas a las de `nuevo`, contando
-- las que difieren— y da lo correcto en los tres casos sin ningún caso especial.
-- Vale la pena dejar escrito qué significa en cada uno, porque el número se usa
-- para decidir qué se muestra:
--
--   · UPDATE → los campos que efectivamente cambiaron. Cero significa que el
--     evento no auditó nada: alguien reescribió la fila con los mismos valores.
--     Es el caso que motivó la vista y hoy son 727 de 865.
--
--   · DELETE → todos los campos del registro borrado. `fn_audit` guarda
--     `nuevo = null` a propósito en un DELETE, así que cada clave de `anterior`
--     difiere de null y se cuenta. Es lo que se quiere: **un DELETE nunca es un
--     no-op**, borró una fila. Si diera cero, el filtro "sólo con cambios"
--     escondería los 269 borrados, que son justamente lo que más se mira en una
--     auditoría. Sale así solo, sin `case`.
--
--   · INSERT → hoy no existe: el trigger sólo cubre UPDATE y DELETE. Si algún
--     día se agrega, `fn_audit` tiene que guardar `nuevo` —hoy sólo lo hace en
--     UPDATE—, y entonces la fórmula cuenta todos los campos del registro nuevo.
--     Con el `fn_audit` actual un INSERT quedaría con los dos snapshots en null
--     y contaría cero; eso es un bug del trigger, no de esta vista.

create or replace view public.v_auditoria as
select
  a.id,
  a.created_at,
  a.tabla,
  a.registro_id,
  a.operacion,
  a.usuario_id,
  a.anterior,
  a.nuevo,
  (
    select count(*)
      from (
        select jsonb_object_keys(coalesce(a.anterior, '{}'::jsonb)) as clave
        union
        select jsonb_object_keys(coalesce(a.nuevo, '{}'::jsonb))
      ) c
     where a.anterior -> c.clave is distinct from a.nuevo -> c.clave
  ) as campos_cambiados
from audit_log a;

comment on view public.v_auditoria is
  'El log de auditoría con campos_cambiados contado en SQL, para poder filtrar '
  'por él. En UPDATE son los campos que cambiaron (cero = el evento no auditó '
  'nada); en DELETE, todos los del registro borrado, para que un borrado nunca '
  'cuente como no-op.';
