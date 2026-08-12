-- ═══════════════════════════════════════════════════════════════════════════
-- RECLAMOS · historial de lo que se reclamó, a quién y por qué canal
--
-- La fase 1 arma el TEXTO del reclamo y lo copia al portapapeles, pero no deja
-- rastro: no hay forma de responder "¿a quién le reclamé?", "¿cuándo fue el
-- último?" ni "¿cuántas veces?". Sin eso la lista de deudores no es una cola de
-- trabajo — es la misma lista todos los días, sin saber qué ya se hizo.
--
-- Esta migración agrega lo mínimo para que el reclamo deje registro:
--
--   · tabla `reclamo`            — un reclamo efectivamente hecho
--   · `plantilla_mail.cuerpo_texto` — la versión en texto plano, para WhatsApp
--   · vista `v_reclamo_equipo`   — último y conteo por equipo, para la lista
--
-- NO se agrega `telefono` a `tercero`: el número se parsea de `contacto`, y si
-- el parseo no da algo válido el canal de WhatsApp se deshabilita en pantalla.
-- Un wa.me armado con basura abre WhatsApp con un número inexistente, que es
-- peor que no ofrecer el botón.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · reclamo
--
-- Un reclamo es un HECHO, no un estado: se hizo o no se hizo. Por eso la tabla
-- es de sólo-inserción y no tiene columna de "estado" ni de "respondido": si el
-- equipo paga, eso se ve en la cuota, no acá.
--
-- Y por eso tampoco lleva trigger de `audit_log`. Ese trigger existe para
-- tablas que CAMBIAN —cuota, gasto, equipo_torneo—, donde el registro está en
-- el diff. Acá la fila ya es el registro: tiene fecha, responsable, canal y el
-- texto exacto que se mandó. Auditar una tabla inmutable duplicaría la
-- información y sumaría ruido a un log que ya tiene 727 eventos vacíos.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists reclamo (
  id              uuid primary key default gen_random_uuid(),
  tercero_id      uuid not null references tercero(id),

  -- El torneo, SI el reclamo abarca uno solo. Null significa "varios", no
  -- "ninguno": la deuda es del equipo y no del torneo (concepto 5), así que un
  -- equipo puede arrastrar cuotas vencidas de dos torneos y reclamarse todo
  -- junto. Hoy no pasa —los 25 deudores tienen deuda de un solo torneo, porque
  -- hay un solo torneo— pero el modelo lo permite y la columna no puede mentir
  -- cuando ocurra. El detalle fino siempre está en `cuota_ids`.
  torneo_id       uuid references torneo(id),

  fecha           date not null default current_date,
  canal           text not null check (canal in ('mail', 'whatsapp', 'manual')),

  -- CONGELADOS al reclamar, como `arqueo.saldo_sistema` (decisión 59): es la
  -- foto de cuánto debía ese día. Si mañana paga, el reclamo tiene que seguir
  -- diciendo lo que decía — si se recalculara, el historial mostraría "le
  -- reclamé $0" y no se entendería por qué se le reclamó.
  monto_reclamado numeric(16,2) not null check (monto_reclamado > 0),
  cuotas          integer       not null check (cuotas > 0),
  cuota_ids       uuid[]        not null,

  -- El texto tal como salió. Sin esto, editar una plantilla reescribe la
  -- historia: los reclamos viejos se leerían con las palabras nuevas.
  texto           text,

  -- A dónde se mandó: el mail o el número. Null en 'manual', que es el canal
  -- de "le avisé por teléfono" o "se lo dije en la cancha".
  destino         text,

  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now()
);

-- La consulta que corre en las dos pantallas: los reclamos de un equipo, del
-- más nuevo al más viejo. Y es la que resuelve `v_reclamo_equipo`.
create index if not exists reclamo_tercero_fecha_idx
  on reclamo (tercero_id, fecha desc);

comment on table reclamo is
  'Historial de reclamos de deuda. Sólo-inserción: un reclamo es un hecho, no '
  'un estado. monto_reclamado y cuotas quedan congelados al momento de '
  'reclamar. Sin audit_log: la fila ya es el registro.';

comment on column reclamo.torneo_id is
  'El torneo si el reclamo abarca uno solo; NULL si abarca varios. El detalle '
  'por cuota está en cuota_ids.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · plantilla_mail.cuerpo_texto
--
-- La tabla ya existe y ya está sembrada con cuatro plantillas HTML
-- (aviso_7dias, reclamo_vencida, reclamo_2, recibo_pago). Lo que falta es la
-- versión PLANA: WhatsApp no renderiza HTML, y mandar `<p>Hola</p>` por chat es
-- exactamente lo que se ve.
--
-- Va como columna y no como fila aparte con clave `reclamo_whatsapp`: es el
-- MISMO reclamo en dos formatos. Con dos filas, cambiar el texto obligaría a
-- acordarse de editar las dos, y la primera vez que alguien edite una sola, el
-- mail y el WhatsApp van a decir cosas distintas.
--
-- Nullable: las plantillas que sólo se mandan por mail no necesitan versión
-- plana, y obligar a escribirla sería pedir trabajo para nada.
-- ═══════════════════════════════════════════════════════════════════════════

alter table plantilla_mail add column if not exists cuerpo_texto text;

comment on column plantilla_mail.cuerpo_texto is
  'La misma plantilla en texto plano, para WhatsApp. Null si esa plantilla '
  'sólo se manda por mail.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · v_reclamo_equipo — qué se le reclamó a cada equipo
--
-- Una fila por equipo QUE TIENE reclamos. Es un lookup, no una lista: la lista
-- de a quién reclamar sale de `v_deuda_equipo`, y la pantalla cruza las dos.
-- Un equipo sin reclamos simplemente no está acá, y eso es "nunca reclamado".
--
-- `dias_desde_ultimo` es lo que convierte la lista en cola de trabajo: no
-- importa tanto cuántas veces se reclamó como hace cuánto fue la última.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_reclamo_equipo as
select
  r.tercero_id,
  count(*)                    as reclamos,
  max(r.fecha)                as ultimo_reclamo,
  current_date - max(r.fecha) as dias_desde_ultimo,
  -- El canal y el monto del ÚLTIMO, desempatando por created_at para que dos
  -- reclamos del mismo día no devuelvan cualquiera de los dos.
  (array_agg(r.canal           order by r.fecha desc, r.created_at desc))[1] as ultimo_canal,
  (array_agg(r.monto_reclamado order by r.fecha desc, r.created_at desc))[1] as ultimo_monto
from reclamo r
group by r.tercero_id;

comment on view public.v_reclamo_equipo is
  'Por equipo con reclamos: cuántos, el último y hace cuántos días. Lookup '
  'para la lista de /reclamos; un equipo ausente es uno nunca reclamado.';
