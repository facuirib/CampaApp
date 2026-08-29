-- ═══════════════════════════════════════════════════════════════════════════
-- SOCIOS · la excepción de sueldo por mes
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El sueldo de un socio es un acuerdo permanente que se versiona: `sueldo_socio`
-- guarda «desde el 01/07 cobra $1.800.000» y `sueldo_vigente()` resuelve cuál
-- rige en cada fecha. Eso alcanza para el caso normal, y para el aumento.
--
-- No alcanza para el caso que aparece todos los meses en un club: **este mes,
-- por algo puntual, se acordó otra cifra**. Un mes que se trabajó a medias, un
-- mes que se compensa con un gasto que puso el socio, un mes que se acuerda
-- pagar de menos porque no hubo torneo.
--
-- Hoy eso sólo se puede expresar de una manera, y es la mala: insertar una
-- vigencia nueva por el monto del mes y otra al mes siguiente para volver atrás.
-- Dos filas de historial permanente para decir algo que **no** es permanente.
-- El historial deja de contar la historia del acuerdo y pasa a contar la de los
-- meses raros, que es justo lo que hace ilegible un versionado.
--
--   sueldo_socio      «cuánto cobra, desde cuándo»   — el acuerdo. Permanente.
--   sueldo_socio_mes  «este mes, en cambio, $X»      — la excepción. Un mes.
--
-- ── La precedencia: excepción > vigencia ───────────────────────────────────
--
-- Y no al revés, ni «la más nueva gana». Una excepción es una decisión tomada
-- SOBRE un mes concreto, con nombre y motivo; una vigencia es la regla de
-- fondo. Lo puntual gana a lo general — es lo mismo que hace cualquier tarifa
-- con su lista de precios.
--
-- Eso vive en UNA sola función, `sueldo_acordado()`, y las tres bocas que
-- necesitan saber cuánto cobra un socio en un mes la llaman a ella:
--
--   · devengar_sueldos_socios  → el asiento del mes
--   · v_socio_lista            → la pantalla
--   · v_cashflow_comprometido  → la proyección
--
-- **Ninguna queda afuera, y eso es el punto.** Si el cashflow proyectara la
-- vigencia mientras el devengo asienta la excepción, la diferencia no se ve por
-- ningún lado: los dos números son plausibles y nadie los compara. La etapa
-- anterior sacó la última copia de la regla de vigencia justamente para que
-- este cambio tuviera un solo lugar donde entrar.
--
-- ── Por qué el mes ya devengado se bloquea ─────────────────────────────────
--
-- Si el mes ya se devengó, su asiento ya existe y ya movió el saldo del socio.
-- Cargar una excepción encima **no lo corrige**: cambiaría lo que dicen la
-- pantalla y la proyección, y dejaría al asiento diciendo otra cosa, sin que
-- nada avise. Un número mal que nadie contradice es peor que un error.
--
-- La corrección de un mes devengado es la de la regla 4 y no otra: anular el
-- asiento y volver a devengar. El trigger lo dice con esas palabras, para que
-- quien lo lea sepa qué hacer y no sólo que no puede.
--
-- ── Por qué el motivo es obligatorio ───────────────────────────────────────
--
-- Es lo único que distingue una excepción legítima de un número escrito de más.
-- La excepción rompe la regla a propósito; sin el porqué, dentro de seis meses
-- es indistinguible de un error de tipeo — y nadie se anima a tocarla.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1 · La tabla ───────────────────────────────────────────────────────────

create table if not exists public.sueldo_socio_mes (
  id          uuid primary key default gen_random_uuid(),
  socio_id    uuid not null references tercero(id),
  periodo_id  uuid not null references periodo(id),

  -- Cero es un valor con sentido: «este mes no cobra». Negativo no: un sueldo
  -- en contra sería un retiro, y para eso está `crear_retiro_socio`.
  monto       numeric(16,2) not null check (monto >= 0),

  motivo      text not null check (btrim(motivo) <> ''),

  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),

  -- Una excepción por socio y por mes. Dos serían dos respuestas a la misma
  -- pregunta, y `sueldo_acordado()` tendría que elegir.
  constraint sueldo_socio_mes_unico unique (socio_id, periodo_id)
);

comment on table public.sueldo_socio_mes is
  'La excepción de sueldo de UN mes, que le gana a la vigencia de sueldo_socio. '
  'Para el mes puntual que se acordó distinto, sin ensuciar el historial del '
  'acuerdo permanente con dos filas. Se resuelve en sueldo_acordado().';

comment on column public.sueldo_socio_mes.monto is
  'Lo acordado para ESE mes. Cero significa que no cobra; negativo no se admite.';
comment on column public.sueldo_socio_mes.motivo is
  'Obligatorio: es lo único que distingue una excepción de un error de tipeo.';

create index if not exists sueldo_socio_mes_socio_idx
  on public.sueldo_socio_mes (socio_id);


-- ── 2 · El bloqueo del mes ya devengado ────────────────────────────────────
--
-- Es un trigger y no un CHECK porque mira otra tabla: un CHECK no puede.

create or replace function public.check_sueldo_mes_no_devengado()
returns trigger
language plpgsql
as $$
declare
  v_fila   record;
  v_per    record;
  v_monto  numeric(16,2);
begin
  -- En un DELETE el que importa es OLD; en el resto, NEW. El DELETE se bloquea
  -- por la misma razón: borrar la excepción de un mes ya devengado también
  -- dejaría la pantalla diciendo una cosa y el asiento otra.
  v_fila := coalesce(new, old);

  select p.anio, p.mes, p.estado into v_per
    from periodo p where p.id = v_fila.periodo_id;

  if v_per.estado = 'cerrado' then
    raise exception
      'El período %/% está cerrado.',
      lpad(v_per.mes::text, 2, '0'), v_per.anio;
  end if;

  select d.monto into v_monto
    from devengo_socio d
   where d.socio_id   = v_fila.socio_id
     and d.periodo_id = v_fila.periodo_id;

  if found then
    raise exception
      'El período ya se devengó por $%. Para corregirlo hay que anular ese devengo y volver a correrlo.',
      -- Formato argentino: to_char agrupa con la coma del locale y después se
      -- dan vuelta los dos separadores. El mensaje va a pantalla tal cual.
      translate(to_char(v_monto, 'FM999G999G999G990D00'), ',.', '.,');
  end if;

  return v_fila;
end;
$$;

drop trigger if exists trg_sueldo_mes_no_devengado on public.sueldo_socio_mes;
create trigger trg_sueldo_mes_no_devengado
  before insert or update or delete on public.sueldo_socio_mes
  for each row execute function public.check_sueldo_mes_no_devengado();


-- ── 3 · RLS ────────────────────────────────────────────────────────────────
--
-- Escritura: admin y finanzas, la misma allowlist que `sueldo_socio` — es la
-- misma decisión (cuánto cobra un dueño), tomada sobre un mes en vez de sobre
-- el acuerdo. Sin política de DELETE: nadie la borra por la app.
--
-- SELECT `using (true)`, y no es pereza (nota #1). Esta tabla la lee
-- `sueldo_acordado()`, que a su vez alimenta `v_cashflow_comprometido` — que
-- mira `/proyeccion`, visible para toda la oficina. Un SELECT restringido no
-- daría error: haría que al operador la excepción le sea invisible y la
-- proyección le muestre en silencio la cifra vieja.

alter table public.sueldo_socio_mes enable row level security;

create policy sueldo_socio_mes_select_autenticado
  on public.sueldo_socio_mes for select
  to authenticated
  using (true);

create policy sueldo_socio_mes_insert_autenticado
  on public.sueldo_socio_mes for insert
  to authenticated
  with check (auth_rol() = any (array['admin', 'finanzas']));

create policy sueldo_socio_mes_update_autenticado
  on public.sueldo_socio_mes for update
  to authenticated
  using      (auth_rol() = any (array['admin', 'finanzas']))
  with check (auth_rol() = any (array['admin', 'finanzas']));


-- ── 4 · sueldo_acordado() — la única boca ──────────────────────────────────

create or replace function public.sueldo_acordado(p_socio_id uuid, p_fecha date)
returns numeric
language sql
stable
as $$
  select coalesce(
    -- La excepción del mes que contiene esa fecha. Si el período todavía no
    -- existe como fila —el cashflow proyecta meses que nadie abrió— el
    -- subselect no devuelve nada y manda la vigencia, que es lo correcto: no
    -- puede haber excepción cargada sobre un mes que no existe.
    (select m.monto
       from sueldo_socio_mes m
       join periodo p on p.id = m.periodo_id
      where m.socio_id = p_socio_id
        and p.anio = extract(year  from p_fecha)::int
        and p.mes  = extract(month from p_fecha)::int),
    sueldo_vigente(p_socio_id, p_fecha)
  );
$$;

comment on function public.sueldo_acordado(uuid, date) is
  'Cuánto cobra un socio en la fecha dada: la excepción de ese mes si existe, '
  'si no la vigencia de sueldo_socio. La excepción le gana a la vigencia. '
  'Es la ÚNICA boca: la llaman devengar_sueldos_socios, v_socio_lista y '
  'v_cashflow_comprometido. Devuelve NULL si no hay ni una ni otra.';

-- Compañera de la anterior: dice SI el monto vino de una excepción. Existe
-- porque la pantalla necesita distinguirlo —«$1.200.000 este mes» no es lo
-- mismo que «$1.800.000 desde el 01/07»— y sin esto tendría que averiguarlo
-- consultando la tabla por su cuenta, o sea repitiendo la regla otra vez.
create or replace function public.es_sueldo_excepcion(p_socio_id uuid, p_fecha date)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from sueldo_socio_mes m
      join periodo p on p.id = m.periodo_id
     where m.socio_id = p_socio_id
       and p.anio = extract(year  from p_fecha)::int
       and p.mes  = extract(month from p_fecha)::int
  );
$$;

comment on function public.es_sueldo_excepcion(uuid, date) is
  'Si el sueldo de ese mes sale de una excepción y no de la vigencia. Para que '
  'la pantalla lo pueda decir sin volver a consultar la tabla.';


-- ── 5 · Las tres bocas pasan a sueldo_acordado() ───────────────────────────

-- 5.a · el devengo
create or replace function public.devengar_sueldos_socios(
  p_periodo_id uuid,
  p_created_by uuid default null::uuid
)
returns integer
language plpgsql
as $$
declare
  v_per     record;
  v_fin     date;
  v_socio   record;
  v_monto   numeric(16,2);
  v_asiento uuid;
  v_n       int := 0;
begin
  select p.id, p.anio, p.mes, p.estado
    into v_per
  from periodo p where p.id = p_periodo_id;

  if not found then
    raise exception 'El período % no existe', p_periodo_id;
  end if;

  if v_per.estado = 'cerrado' then
    raise exception
      'El período %-% está cerrado: no se puede devengar sobre él.',
      v_per.anio, lpad(v_per.mes::text, 2, '0');
  end if;

  -- El devengo se asienta el último día del mes: es el mes completo lo que se
  -- devenga, no un día puntual.
  v_fin := (make_date(v_per.anio, v_per.mes, 1) + interval '1 month - 1 day')::date;

  for v_socio in
    select t.id, t.nombre
    from tercero t
    where t.tipo = 'socio'
      and t.activo
      -- idempotencia: lo ya devengado en este período no se vuelve a tocar
      and not exists (
        select 1 from devengo_socio d
        where d.socio_id = t.id and d.periodo_id = p_periodo_id
      )
    order by t.nombre
  loop
    -- Acá entra la excepción. Era `sueldo_vigente`; si se hubiera quedado así,
    -- el asiento del mes contradiría a la pantalla que muestra la excepción.
    v_monto := sueldo_acordado(v_socio.id, v_fin);

    -- Sin sueldo acordado vigente a fin de mes no hay nada que devengar. No es
    -- un error: un socio puede incorporarse a mitad de año. Con la excepción,
    -- el `= 0` cubre además el mes que se acordó en cero a propósito.
    continue when v_monto is null or v_monto = 0;

    -- torneo_id NULL = ESTRUCTURA PERMANENTE (decisión 5, §3.2).
    v_asiento := crear_asiento(
      v_fin,
      'socio',
      'Sueldo ' || v_socio.nombre || ' · ' ||
        lpad(v_per.mes::text, 2, '0') || '/' || v_per.anio,
      jsonb_build_array(
        jsonb_build_object('cuenta','GAS_SOCIOS',
                           'debe',  v_monto, 'tercero_id', v_socio.id),
        jsonb_build_object('cuenta','SOCIOS_A_PAGAR',
                           'haber', v_monto, 'tercero_id', v_socio.id)
      ),
      null,   -- torneo_id: estructura permanente
      null,   -- jornada_id
      null,   -- predio_id
      null,   -- origen_id
      p_created_by
    );

    insert into devengo_socio (socio_id, periodo_id, monto, asiento_id)
    values (v_socio.id, p_periodo_id, v_monto, v_asiento);

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

-- 5.b · la pantalla
--
-- La columna sigue llamándose `sueldo_vigente` porque es lo que la lista
-- rotula —«Sueldo vigente»— y renombrarla rompería `/socios` sin ganar nada.
-- Lo que cambió es de dónde sale. `es_excepcion` viaja al lado para que la
-- pantalla no diga «desde el 01/07» sobre un monto que rige sólo este mes.
create or replace view public.v_socio_lista as
select
  t.id                                as socio_id,
  t.nombre                            as socio,
  t.activo,

  sueldo_acordado(t.id, current_date)::numeric(16,2) as sueldo_vigente,

  (select max(sm.vigente_desde)
     from sueldo_socio sm
    where sm.socio_id = t.id
      and sm.vigente_desde <= current_date) as vigente_desde,

  coalesce(s.devengado, 0)            as devengado,
  coalesce(s.retirado,  0)            as retirado,
  coalesce(s.saldo,     0)            as saldo,

  coalesce(m.meses, 0)                as meses_con_movimiento,

  case
    when coalesce(s.saldo, 0) < 0                     then 'en_contra'
    when sueldo_acordado(t.id, current_date) is null  then 'sin_sueldo'
    when coalesce(s.saldo, 0) = 0                     then 'al_dia'
    else                                                   'a_favor'
  end                                 as estado,

  -- Va ÚLTIMA y no al lado del monto, aunque ahí se leería mejor: `create or
  -- replace view` sólo admite agregar columnas al final. Ponerla en el medio
  -- obliga a un `drop view`, y de esta cuelga `v_socio_kpi`.
  es_sueldo_excepcion(t.id, current_date) as es_excepcion

from tercero t

left join v_saldo_socio s
       on s.socio_id = t.id

left join lateral (
  select count(*) as meses
    from v_socio_detalle_mensual d
   where d.socio_id = t.id
) m on true

where t.tipo = 'socio';

comment on view public.v_socio_lista is
  'Una fila por socio, con lo acordado para el mes en curso y el estado '
  'derivado (en_contra / sin_sueldo / al_dia / a_favor). El monto sale de '
  'sueldo_acordado(): puede ser una excepción de este mes, y es_excepcion lo '
  'dice. saldo > 0 = el club le debe al socio; saldo < 0 = retiró de más.';

-- 5.c · la proyección
--
-- Sólo cambia el resolvedor del monto: `sueldo_vigente` → `sueldo_acordado`.
-- Todo lo demás —el neteo por socio, el horizonte hasta fin de ejercicio, las
-- otras seis fuentes— queda igual.
create or replace view public.v_cashflow_comprometido as
SELECT GREATEST(ec.vence_at, CURRENT_DATE) AS fecha,
    ec.vence_at AS fecha_original,
    'comprometido'::text AS nivel,
    'cuota_equipo'::text AS origen,
    t.nombre AS detalle,
    ec.saldo AS monto,
    ec.vence_at < CURRENT_DATE AS arrastrada,
    ec.id AS origen_id,
    et.tercero_id
   FROM v_estado_cuota ec
     JOIN equipo_torneo et ON et.id = ec.equipo_torneo_id
     JOIN tercero t ON t.id = et.tercero_id
  WHERE ec.saldo > 0::numeric AND ec.estado <> 'suspendida'::text
UNION ALL
 SELECT GREATEST(q.fecha_cobro, CURRENT_DATE) AS fecha,
    q.fecha_cobro AS fecha_original,
    'comprometido'::text AS nivel,
    'cuota_sponsor'::text AS origen,
    q.sponsor AS detalle,
    q.monto,
    q.fecha_cobro < CURRENT_DATE AS arrastrada,
    q.cuota_id AS origen_id,
    q.sponsor_id AS tercero_id
   FROM v_cuotas_sponsor q
  WHERE q.cobrado_at IS NULL
UNION ALL
 SELECT GREATEST(cm.vence_at, CURRENT_DATE) AS fecha,
    cm.vence_at AS fecha_original,
    'comprometido'::text AS nivel,
    'compromiso_'::text || cm.tipo AS origen,
    COALESCE(t.nombre, cm.descripcion) AS detalle,
        CASE
            WHEN cm.sentido = 'pagar'::text THEN - cm.monto
            ELSE cm.monto
        END AS monto,
    cm.vence_at < CURRENT_DATE AS arrastrada,
    cm.id AS origen_id,
    cm.tercero_id
   FROM compromiso cm
     LEFT JOIN tercero t ON t.id = cm.tercero_id
  WHERE cm.estado = 'pendiente'::text
UNION ALL
 SELECT GREATEST(ch.fecha_cobro, CURRENT_DATE) AS fecha,
    ch.fecha_cobro AS fecha_original,
    'comprometido'::text AS nivel,
    'cheque_'::text || ch.sentido AS origen,
    COALESCE(t.nombre, 'Cheque '::text || ch.numero) AS detalle,
        CASE
            WHEN ch.sentido = 'emitido'::text THEN - ch.monto
            ELSE ch.monto
        END AS monto,
    ch.fecha_cobro < CURRENT_DATE AS arrastrada,
    ch.id AS origen_id,
    ch.tercero_id
   FROM cheque ch
     LEFT JOIN tercero t ON t.id = ch.tercero_id
  WHERE ch.estado = 'pendiente'::text
UNION ALL
 SELECT GREATEST(g.devengado_at, CURRENT_DATE) AS fecha,
    g.devengado_at AS fecha_original,
    'comprometido'::text AS nivel,
    'gasto_impago'::text AS origen,
    cg.nombre AS detalle,
    - g.total AS monto,
    g.devengado_at < CURRENT_DATE AS arrastrada,
    g.id AS origen_id,
    NULL::uuid AS tercero_id
   FROM gasto g
     JOIN cat_gasto cg ON cg.id = g.cat_gasto_id
     JOIN v_gasto_detalle d ON d.gasto_id = g.id
  WHERE g.pagado_at IS NULL AND g.devengado_at IS NOT NULL AND d.estado <> 'anulado'::text
UNION ALL
 SELECT CURRENT_DATE AS fecha,
    CURRENT_DATE AS fecha_original,
    'comprometido'::text AS nivel,
    'sueldo_socio'::text AS origen,
    t.nombre || ' · saldo a favor'::text AS detalle,
    - GREATEST(v.saldo, 0::numeric) AS monto,
    true AS arrastrada,
    v.socio_id AS origen_id,
    v.socio_id AS tercero_id
   FROM v_saldo_socio v
     JOIN tercero t ON t.id = v.socio_id
  WHERE v.activo AND v.saldo > 0::numeric
UNION ALL
 SELECT f.fin AS fecha,
    f.fin AS fecha_original,
    'comprometido'::text AS nivel,
    'sueldo_socio'::text AS origen,
    (f.nombre || ' · sueldo '::text) || to_char(f.fin::timestamp with time zone, 'MM/YYYY'::text) AS detalle,
    - LEAST(f.sueldo, GREATEST(f.acumulado - f.adelanto, 0::numeric)) AS monto,
    false AS arrastrada,
    f.socio_id AS origen_id,
    f.socio_id AS tercero_id
   FROM ( SELECT t.id AS socio_id,
            t.nombre,
            sueldo_acordado(t.id, m.fin) AS sueldo,
            GREATEST(- v.saldo, 0::numeric) AS adelanto,
            m.fin,
            sum(sueldo_acordado(t.id, m.fin)) OVER (PARTITION BY t.id ORDER BY m.fin) AS acumulado
           FROM tercero t
             JOIN v_saldo_socio v ON v.socio_id = t.id
             CROSS JOIN ( SELECT (date_trunc('month'::text, d.d) + '1 mon -1 days'::interval)::date AS fin
                   FROM generate_series(date_trunc('month'::text, CURRENT_DATE + '1 mon'::interval)::timestamp with time zone, date_trunc('month'::text, (( SELECT max(ejercicio.fecha_hasta) AS max
                           FROM ejercicio))::timestamp with time zone), '1 mon'::interval) d(d)) m
          WHERE t.tipo = 'socio'::text AND t.activo) f
  WHERE LEAST(f.sueldo, GREATEST(f.acumulado - f.adelanto, 0::numeric)) > 0::numeric;
