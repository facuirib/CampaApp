-- ═══════════════════════════════════════════════════════════════════════════
-- COBRANZA · el candado: no volver a avisar lo mismo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sin esto, la cola muestra a los mismos 28 equipos todos los días. El operador
-- que avisó ayer no tiene cómo saberlo, y termina mandando el mismo mensaje dos
-- veces — que es peor que no mandarlo: al tercero le llega ruido y deja de
-- leerlos.
--
-- ── Por qué hace falta una columna `etapa` en `reclamo` ────────────────────
--
-- `reclamo` guarda `canal` —mail, whatsapp, manual— pero eso es el MEDIO, no el
-- momento. Con lo que hay hoy no se puede distinguir «ya le mandé el aviso
-- preventivo» de «ya le mandé el reclamo firme», que son mensajes distintos y
-- se mandan los dos.
--
-- Es NULLABLE, y no se rellena hacia atrás: los siete reclamos ya registrados
-- son de antes de que las etapas existieran y **no se puede saber cuál les
-- correspondía**. Inventarles una sería escribir historia que no pasó — y como
-- el candado los ignora, esos equipos vuelven a aparecer una vez. Es el
-- comportamiento correcto: no consta que se les haya avisado ESTO.
--
-- ── El criterio: la etapa Y las cuotas ─────────────────────────────────────
--
-- No alcanza con «ya se le reclamó en esta etapa». Si un equipo recibió el
-- firme por sus tres cuotas y a la semana le vence una cuarta, tiene que volver
-- a aparecer: hay algo nuevo que avisar.
--
-- Por eso el candado compara el conjunto de cuotas. Un equipo sale de la cola
-- sólo si existe un reclamo de ESA etapa cuyas `cuota_ids` **contengan a todas**
-- las que el aviso de hoy cubriría. Apenas asoma una cuota no cubierta, el
-- equipo reaparece — y el mensaje ya la incluye, porque el detalle se arma en
-- el momento.
--
-- `@>` sobre el array es exactamente esa pregunta, y no hay que ordenar nada:
-- «¿este conjunto contiene a aquél?».
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.reclamo
  add column if not exists etapa text
  check (etapa in ('por_vencer', 'recordatorio', 'firme'));

comment on column public.reclamo.etapa is
  'En qué momento de la cobranza se mandó este aviso. NULL en los reclamos '
  'anteriores a las etapas: no se puede saber cuál les correspondía, y '
  'rellenarlo sería inventar historia.';

-- Índice para la pregunta del candado: «¿hay un reclamo de esta etapa para este
-- equipo?». Sin él, cada fila de la cola escanea la tabla entera.
create index if not exists reclamo_tercero_etapa_idx
  on public.reclamo (tercero_id, etapa);


-- ── La cola, ya filtrada ───────────────────────────────────────────────────
--
-- Se envuelve `v_cobranza_momento` en vez de meterle el filtro adentro. Son dos
-- preguntas distintas y conviene poder hacer cada una por su lado:
--
--   v_cobranza_momento  «¿en qué momento está cada equipo?»  — el estado
--   v_cobranza_cola     «¿a quién le toca un aviso HOY?»     — el trabajo
--
-- La primera sirve para mirar la cartera aunque ya se haya avisado todo; la
-- segunda es la cola de trabajo. Fundidas en una sola, no habría forma de ver
-- la foto completa sin desarmar el candado.

create or replace view public.v_cobranza_cola as
select m.*
  from v_cobranza_momento m
 where not exists (
   select 1
     from reclamo r
    where r.tercero_id = m.tercero_id
      and r.etapa      = m.etapa
      -- ¿Las cuotas ya reclamadas cubren TODAS las de este aviso? Si falta
      -- alguna —una que venció después— el equipo vuelve a la cola.
      and r.cuota_ids @> m.cuota_ids
 );

comment on view public.v_cobranza_cola is
  'La cola de trabajo: los equipos de v_cobranza_momento a los que TODAVÍA no '
  'se les mandó el aviso de su etapa por estas cuotas. Un equipo sale al '
  'reclamársele y vuelve apenas le vence una cuota nueva. Los reclamos con '
  'etapa NULL —anteriores a las etapas— no tapan nada, a propósito.';
