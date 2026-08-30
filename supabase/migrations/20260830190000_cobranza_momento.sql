-- ═══════════════════════════════════════════════════════════════════════════
-- COBRANZA · las tres etapas del aviso, y sus ventanas configurables
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hoy la cobranza tiene UNA lista: quién debe. Sirve para saber el tamaño del
-- problema y no para trabajarlo — es la misma lista todos los días, y el que
-- vence mañana se ve igual que el que vence hace dos meses.
--
-- Esto la parte en tres momentos, cada uno con su mensaje:
--
--   por_vencer     todavía no venció, vence dentro de N días  → aviso amable
--   recordatorio   venció hace entre X e Y días               → recordatorio
--   firme          venció hace Z o más                        → firme
--
-- ── Rangos y no días exactos ───────────────────────────────────────────────
--
-- El envío es MANUAL: lo dispara el operador cuando entra. Con «avisar el día 7»
-- el que cae domingo no se avisa nunca. Con «entre el 3 y el 9» la cola espera
-- a que alguien pase.
--
-- ── UNA etapa por equipo: la más severa ────────────────────────────────────
--
-- Medido antes de escribir esto: con las ventanas por default, **24 de 27
-- equipos caen en más de una etapa y 10 en las tres**. Un equipo con una cuota
-- vencida hace 22 días y otra que vence en 6 está, a la vez, en «firme» y en
-- «por vencer».
--
-- Si las colas fueran independientes, ese equipo recibiría el mismo día un mail
-- diciendo «regularizá para seguir participando» y otro diciendo «te
-- recordamos amablemente». Con 24 de 27 equipos así, no es un borde: es el
-- caso normal.
--
-- Entonces cada equipo aparece UNA vez, en la etapa más severa que le
-- corresponde, y el mensaje habla de **todas** sus cuotas. La etapa es del
-- AVISO —qué le toca hoy—, no una clasificación del equipo: el estado del
-- equipo es su ficha, que muestra toda su deuda sin etapas.
--
-- ── Qué entra en «todas sus cuotas» ────────────────────────────────────────
--
-- Las vencidas **y** las que vencen dentro de la ventana de aviso. NO las de
-- dentro de nueve meses: hay cuotas del Apertura 2027 a 289 días, y meterlas en
-- el total haría que un reclamo por $3.000.000 dijera $30.000.000. Se reclama
-- lo que es exigible ahora o está por serlo, que es de lo que trata el aviso.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1 · Las ventanas ───────────────────────────────────────────────────────
--
-- Fila única con `id boolean primary key check (id)`, el molde de `emisor`: no
-- se puede insertar una segunda ni por error. `config_contable` es de la época
-- anterior y usa uuid sin constraint, que es justo lo que permitió que
-- terminara con filas duplicadas en otras tablas.
--
-- Global y no por torneo: es una política de cobranza del club. Por torneo
-- habría que elegir ventana cuando un equipo arrastra deuda de dos, que es
-- exactamente el caso que el concepto 5 declara normal.

create table if not exists public.config_cobranza (
  id                boolean primary key default true check (id),

  -- Avisar cuando falten N días o menos para el vencimiento.
  dias_por_vencer   int not null default 7  check (dias_por_vencer   >= 0),
  -- Desde cuántos días de atraso corresponde el recordatorio.
  dias_recordatorio int not null default 3  check (dias_recordatorio >= 0),
  -- Desde cuántos días de atraso corresponde el reclamo firme.
  dias_firme        int not null default 10 check (dias_firme        >= 0),

  updated_by        uuid references auth.users(id),
  updated_at        timestamptz not null default now(),

  -- El firme tiene que estar DESPUÉS del recordatorio: al revés, la etapa
  -- intermedia no se alcanza nunca y la cola de recordatorio queda vacía para
  -- siempre sin que nadie entienda por qué.
  constraint config_cobranza_orden check (dias_firme > dias_recordatorio)
);

insert into config_cobranza (id) values (true) on conflict (id) do nothing;

comment on table public.config_cobranza is
  'Las ventanas de la gestión de cobranza, en días. Fila única. Global y no por '
  'torneo: es política del club, y un equipo puede arrastrar deuda de dos.';

alter table public.config_cobranza enable row level security;

-- Lectura para todos: la usa `v_cobranza_momento`, que mira toda la oficina.
-- Con un SELECT restringido la vista devolvería cero filas para quien no puede
-- leer la config, y la cola aparecería vacía en vez de dar un error (nota #1).
create policy config_cobranza_select_autenticado
  on public.config_cobranza for select to authenticated using (true);

create policy config_cobranza_update_autenticado
  on public.config_cobranza for update to authenticated
  using      (auth_rol() = 'admin')
  with check (auth_rol() = 'admin');


-- ── 2 · v_cobranza_momento ─────────────────────────────────────────────────
--
-- Una fila por equipo que necesita un aviso. Todo se calcula acá: la pantalla
-- no clasifica ni suma (regla 1).

create or replace view public.v_cobranza_momento as
with cfg as (
  select dias_por_vencer, dias_recordatorio, dias_firme from config_cobranza
),
relevante as (
  select
    d.tercero_id,
    d.equipo,
    d.torneo_id,
    d.cuota_id,
    d.vence_at,
    d.saldo,
    -- Positivo = ya venció; negativo = falta para vencer.
    (current_date - d.vence_at) as dias_atraso
  from v_deuda_detalle d
  cross join cfg
  where d.saldo > 0
    and not coalesce(d.jornada_suspendida, false)
    and d.estado <> 'suspendida'
    -- Vencidas, o por vencer dentro de la ventana. Lo de dentro de nueve meses
    -- no es materia de aviso.
    and (current_date - d.vence_at) >= -cfg.dias_por_vencer
)
select
  r.tercero_id,
  min(r.equipo) as equipo,

  -- La etapa más severa que le corresponde a este equipo.
  case
    when max(r.dias_atraso) >= (select dias_firme        from cfg) then 'firme'
    when max(r.dias_atraso) >= (select dias_recordatorio from cfg) then 'recordatorio'
    else 'por_vencer'
  end as etapa,

  sum(r.saldo)                                                as total_adeudado,
  sum(r.saldo) filter (where r.dias_atraso >= 0)              as total_vencido,
  sum(r.saldo) filter (where r.dias_atraso <  0)              as total_por_vencer,
  count(*)                                                    as cuotas,
  count(*) filter (where r.dias_atraso >= 0)                  as cuotas_vencidas,

  min(r.vence_at)                                             as vencimiento_mas_antiguo,
  min(r.vence_at) filter (where r.dias_atraso < 0)            as proximo_vencimiento,
  max(r.dias_atraso)                                          as dias_atraso_maximo,

  -- Las cuotas que cubre este aviso. Es lo que el candado de la etapa siguiente
  -- va a comparar contra `reclamo.cuota_ids` para saber si ya se avisó por
  -- éstas o si apareció alguna nueva.
  array_agg(r.cuota_id order by r.vence_at)                   as cuota_ids,

  -- Null significa «varios», igual que en `reclamo.torneo_id`: la deuda es del
  -- equipo, no del torneo (concepto 5).
  -- `min()` no existe para uuid: se toma el primero del agregado, que con un
  -- solo torneo distinto ES el único.
  case when count(distinct r.torneo_id) = 1 then (array_agg(r.torneo_id))[1] end as torneo_id

from relevante r
group by r.tercero_id;

comment on view public.v_cobranza_momento is
  'Una fila por equipo que necesita un aviso, con la etapa MÁS SEVERA que le '
  'corresponde: firme > recordatorio > por_vencer. Un equipo aparece una sola '
  'vez y el aviso habla de todas sus cuotas exigibles o por vencer — con colas '
  'independientes recibiría dos mensajes con tonos opuestos el mismo día. Las '
  'ventanas salen de config_cobranza.';
