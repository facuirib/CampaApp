-- ═══════════════════════════════════════════════════════════════════════════
-- Facturación · el emisor y sus puntos de venta
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Reemplaza el `200` hardcodeado por configuración. **Un emisor, dos puntos.**
--
-- CAMPA SRL es un solo CUIT, pero factura desde **dos domicilios distintos**, y
-- el domicilio no es un dato de adorno: determina **Comercio e Industria**, que
-- es un impuesto municipal por ubicación. Por eso el punto de venta se elige al
-- facturar, y por eso el modelo son dos niveles y no uno.
--
--     10 · TORNEO AEP — De los Latinos y Costa Canal 0, Córdoba Norte
--     11 · TORNEO TIR — Ruta 74 km 13.5, Colonia Tirolesa
--
-- Los dos son **RECE** (web services). Los que había nombrado el contador
-- —3, 4, 6, 8, 9— son de «Factura en Línea», el portal manual, y no sirven por
-- webservice: eso ya estaba anotado en `coordinacion.md`.
--
-- ── El acumulado por dirección, que es para qué se modela así ──────────────
--
-- El reporte de C&I completo es futuro. Lo que va a hacer falta antes es ver el
-- acumulado mensual facturado **por dirección**, y con este modelo eso es una
-- vista de cuatro líneas: `comprobante` ya guarda `punto_venta`, así que agrupar
-- por él y traer el domicilio es un JOIN.
--
-- Por eso el domicilio es **una columna propia y limpia**, no parte del nombre:
-- «TORNEO AEP» agrupa igual que su dirección hoy, pero el día que dos puntos
-- compartan domicilio —o que uno se mude— el que manda para C&I es el domicilio.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ① El emisor — una sola fila, y la base lo garantiza
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `id boolean primary key default true` + `check (id)` es el modo de decir
-- «acá hay exactamente una fila» sin depender de que nadie inserte otra: la PK
-- sobre un booleano que sólo puede valer `true` no admite una segunda.
--
-- Se modela como tabla y no como constante en el código porque la pantalla de
-- Configuración lo edita, y porque estos datos —ingresos brutos, inicio de
-- actividades— son los que van impresos en una Factura A.

create table emisor (
  id                  boolean primary key default true,
  razon_social        text not null,
  cuit                text not null,
  condicion_iva_id    smallint not null references condicion_iva_receptor(id),
  ingresos_brutos     text,
  inicio_actividades  date,

  constraint emisor_singleton check (id),
  constraint emisor_cuit_valido check (cuit_valido(cuit))
);

comment on table emisor is
  'Los datos del emisor de comprobantes. UNA sola fila, garantizado por la PK booleana. El domicilio NO vive acá: cada punto de venta tiene el suyo, y es el que determina Comercio e Industria.';
comment on column emisor.condicion_iva_id is
  'Condición del EMISOR frente al IVA. Usa el mismo catálogo de ARCA que el receptor: los códigos son los mismos, cambia de qué lado del comprobante está.';
comment on column emisor.ingresos_brutos is
  'Número de Ingresos Brutos o «Convenio Multilateral». Se imprime en la Factura A.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ② Los puntos de venta
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `numero` es la clave y es el número de ARCA: es lo que viaja en el XML y lo
-- que `comprobante.punto_venta` guarda. No hay un id sintético al lado porque
-- sería un segundo nombre para lo mismo.
--
-- Se agregan puntos insertando filas, sin tocar código.
--
-- **No hay policy de DELETE, a propósito.** Un punto que emitió comprobantes no
-- se borra: los comprobantes guardan su número y quedarían apuntando al vacío.
-- Se da de baja con `activo = false`, que lo saca del selector y lo deja en el
-- histórico. Misma regla que el asiento y el comprobante.

create table punto_venta (
  numero     smallint primary key,
  nombre     text not null,
  domicilio  text not null,
  activo     boolean not null default true,

  constraint punto_venta_numero_valido check (numero > 0)
);

comment on table punto_venta is
  'Los puntos de venta habilitados en ARCA (RECE). El domicilio de cada uno determina Comercio e Industria, que es un impuesto municipal por ubicación: por eso se elige el punto al facturar y por eso el domicilio es columna propia.';
comment on column punto_venta.numero is
  'El número de ARCA. Es lo que viaja en el XML y lo que guarda comprobante.punto_venta.';
comment on column punto_venta.activo is
  'Un punto que emitió no se borra —los comprobantes guardan su número— se desactiva.';

insert into punto_venta (numero, nombre, domicilio) values
  (10, 'TORNEO AEP', 'De los Latinos y Costa Canal 0, Ciudad de Córdoba Norte'),
  (11, 'TORNEO TIR', 'Ruta 74 km 13.5, Colonia Tirolesa');

insert into emisor (razon_social, cuit, condicion_iva_id) values
  ('CAMPA SRL', '30-71550267-0', 1);

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ El domicilio del emisor, congelado en el comprobante
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Es la misma lección que ya se aplicó dos veces —el receptor y el detalle— y
-- vale igual acá: si el domicilio se leyera por JOIN al reimprimir, una factura
-- del año pasado saldría con la dirección de hoy, y como el domicilio define
-- Comercio e Industria, esa reimpresión estaría diciendo que el impuesto
-- corresponde a otro municipio.
--
-- Se congela el domicilio; `punto_venta` sigue guardado por número, que es el
-- dato fiscal. Con los dos, el acumulado por dirección se puede hacer de las dos
-- formas: por el punto —para leerlo con su nombre— o por el domicilio congelado,
-- que es el que no cambia si alguien se muda.

alter table comprobante add column emisor_domicilio text;

comment on column comprobante.emisor_domicilio is
  'Domicilio del punto de venta CON EL QUE SE EMITIÓ. Congelado: define Comercio e Industria, así que una reimpresión no puede traer la dirección de hoy.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ Sacar el 200 de la base
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El default `200` en la columna era una trampa esperando: el punto de venta es
-- una **elección por comprobante** —determina el impuesto— y un default hace que
-- olvidarse de elegirlo no falle, sino que facture desde el lugar equivocado en
-- silencio. Sin default, el que inserta tiene que decir desde dónde emite.
--
-- El recibo interno sigue usando 0, que es lo que el check exige y lo que hace
-- que su numeración caiga en el mismo único.

alter table comprobante alter column punto_venta drop default;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑤ RLS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Lee cualquiera —el selector de puntos lo necesita al facturar, y el recibo
-- necesita el emisor— y escribe sólo admin: son los datos fiscales del club, no
-- operación diaria. `finanzas` factura pero no cambia desde dónde se factura.

alter table emisor enable row level security;
alter table punto_venta enable row level security;

create policy emisor_select on emisor
  for select to authenticated using (true);
create policy emisor_update on emisor
  for update to authenticated
  using (auth_rol() = 'admin') with check (auth_rol() = 'admin');

create policy punto_venta_select on punto_venta
  for select to authenticated using (true);
create policy punto_venta_insert on punto_venta
  for insert to authenticated with check (auth_rol() = 'admin');
create policy punto_venta_update on punto_venta
  for update to authenticated
  using (auth_rol() = 'admin') with check (auth_rol() = 'admin');

-- Sin INSERT en `emisor`: la fila ya está y no puede haber otra. Sin DELETE en
-- ninguna de las dos: ver el comentario de `punto_venta.activo`.

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑥ `registrar_factura_emitida` — el punto de venta pasa a ser parámetro
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Tenía el `200` escrito adentro, en el INSERT y en el mensaje de error. Se
-- parametriza **ahora que es gratis**: cero llamadores y cero comprobantes.
-- Dejarla con el número fijo sería una bomba para el día de la integración —
-- facturaría todo desde el Aeropuerto sin que nadie lo note, y con el domicilio
-- decidiendo Comercio e Industria eso es un error fiscal, no un bug de display.
--
-- Va con `drop` porque agregar un parámetro **sobrecarga en vez de reemplazar**.
--
-- **El domicilio se congela acá, leyéndolo del punto elegido.** Es el único
-- momento en que corresponde mirarlo: al emitir. Después la fila es el
-- documento y no se vuelve a preguntar.
--
-- Y valida que el punto exista y esté activo: emitir contra un punto que ARCA
-- no tiene habilitado falla del otro lado, con un mensaje de ARCA y el equipo
-- esperando. Mejor que falle acá y diga cuál es el problema.

drop function if exists public.registrar_factura_emitida(
  uuid, uuid, smallint, integer, smallint, numeric, text, date, uuid, text,
  smallint, text, numeric, numeric, date, text);

create function public.registrar_factura_emitida(
  p_pago_id                   uuid,
  p_cuota_cobro_sponsor_id    uuid,
  p_tipo_comprobante          smallint,
  p_punto_venta               smallint,
  p_numero                    integer,
  p_condicion_iva_receptor_id smallint,
  p_monto                     numeric,
  p_cae                       text,
  p_cae_vencimiento           date,
  p_emitida_por               uuid default null,
  p_receptor_nombre           text default null,
  p_receptor_doc_tipo         smallint default null,
  p_receptor_doc_nro          text default null,
  p_neto                      numeric default null,
  p_iva                       numeric default null,
  p_fecha_emision             date default null,
  p_detalle                   text default null
)
returns uuid
language plpgsql
as $function$
declare
  v_id         uuid;
  v_domicilio  text;
begin
  if (p_pago_id is null) = (p_cuota_cobro_sponsor_id is null) then
    raise exception
      'Hay que informar exactamente uno: pago_id o cuota_cobro_sponsor_id, no los dos ni ninguno.';
  end if;

  select pv.domicilio into v_domicilio
    from punto_venta pv
   where pv.numero = p_punto_venta and pv.activo;

  if not found then
    raise exception
      'El punto de venta % no existe o está desactivado. Los habilitados son: %.',
      p_punto_venta,
      (select string_agg(pv.numero || ' (' || pv.nombre || ')', ', ' order by pv.numero)
         from punto_venta pv where pv.activo);
  end if;

  insert into comprobante (
    pago_id, cuota_cobro_sponsor_id, tipo_comprobante, punto_venta,
    numero, condicion_iva_receptor_id, monto, cae, cae_vencimiento,
    estado, emitida_por,
    receptor_nombre, receptor_doc_tipo, receptor_doc_nro, detalle,
    neto, iva, fecha_emision, emisor_domicilio
  ) values (
    p_pago_id, p_cuota_cobro_sponsor_id, p_tipo_comprobante, p_punto_venta,
    p_numero, p_condicion_iva_receptor_id, p_monto, p_cae, p_cae_vencimiento,
    'emitida', coalesce(p_emitida_por, auth.uid()),
    p_receptor_nombre, p_receptor_doc_tipo, p_receptor_doc_nro, p_detalle,
    coalesce(p_neto, round(p_monto / 1.21, 2)),
    coalesce(p_iva,  p_monto - round(p_monto / 1.21, 2)),
    coalesce(p_fecha_emision, current_date),
    v_domicilio
  )
  returning id into v_id;

  return v_id;
exception when unique_violation then
  raise exception
    'Este pago/cuota ya tiene una factura emitida, o el número % ya existe para el punto de venta % tipo %. No se puede duplicar.',
    p_numero, p_punto_venta, p_tipo_comprobante;
end;
$function$;

comment on function registrar_factura_emitida(uuid, uuid, smallint, smallint, integer, smallint, numeric, text, date, uuid, text, smallint, text, numeric, numeric, date, text) is
  'Registra el resultado de una emisión YA CONFIRMADA por ARCA (con CAE real). No llama a ARCA. El punto de venta es parámetro —ya no el 200 fijo— y de él sale el domicilio, que se CONGELA en la fila porque determina Comercio e Industria.';
