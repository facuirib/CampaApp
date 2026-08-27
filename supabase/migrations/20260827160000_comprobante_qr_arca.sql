-- ═══════════════════════════════════════════════════════════════════════════
-- moneda · cotizacion · tipo_cod_aut — los tres datos del QR que faltaban
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El QR de ARCA (RG 4892) codifica 13 campos. Diez salen de la fila o de la
-- configuración del emisor; tres no estaban en ningún lado:
--
--     moneda        "PES"
--     ctz           1
--     tipoCodAut    "E"
--
-- Los tres son constantes hoy. La razón de guardarlos igual es la misma que ya
-- aplicamos con el receptor, el detalle y el domicilio del emisor, y esta es la
-- cuarta: **el QR tiene que poder reconstruirse desde la fila para siempre**.
-- Un comprobante es un documento, y reimprimirlo tiene que dar exactamente lo
-- mismo que la primera vez, aunque el sistema haya cambiado en el medio.
--
-- ── Por qué `tipo_cod_aut` no es como los otros dos ───────────────────────
--
-- `moneda` y `cotizacion` son constantes plausibles: el club factura en pesos y
-- nada indica que eso vaya a cambiar. Guardarlas es barato y prolijo.
--
-- `tipo_cod_aut` es otra cosa. Vale 'E' para CAE y 'A' para CAEA — el código
-- ANTICIPADO, que se usa justamente cuando el web service de ARCA está caído.
-- Es un escenario operativo real de la facturación electrónica, no una
-- hipótesis: el día que Horacio implemente contingencia van a convivir
-- comprobantes de los dos tipos.
--
-- Con el valor como constante en el generador, ese día **las facturas viejas
-- empezarían a reimprimirse con el tipo de autorización de hoy**, y un QR que
-- declara 'E' sobre un comprobante autorizado por CAEA está afirmando algo
-- falso sobre un documento fiscal. No rompe nada visible: rompe en silencio, y
-- se descubre cuando alguien escanea el QR de una factura del año pasado.
--
-- Por eso entra ahora, con default 'E', aunque todavía no haya CAEA. La columna
-- es barata; agregarla después de tener comprobantes emitidos con dos tipos
-- distintos ya no permitiría saber cuál fue cuál.
--
-- ── Los defaults ──────────────────────────────────────────────────────────
--
-- No rompen nada: hay 0 comprobantes, así que no hay filas viejas a las que
-- inventarles un valor, y las que vengan lo heredan. `reservar_numero_comprobante`
-- no se toca — reserva con los defaults, que es lo correcto mientras el único
-- circuito sea CAE en pesos.
--
-- El check de `tipo_cod_aut` es allowlist: 'E' o 'A' y nada más. Si mañana
-- alguien escribe 'CAE' en vez de 'E', el QR saldría mal y ARCA lo daría por
-- inválido; mejor que no entre.
-- ═══════════════════════════════════════════════════════════════════════════

alter table comprobante
  add column moneda       text    not null default 'PES',
  add column cotizacion   numeric not null default 1,
  add column tipo_cod_aut text    not null default 'E';

alter table comprobante
  add constraint comprobante_tipo_cod_aut check (tipo_cod_aut in ('E', 'A'));

alter table comprobante
  add constraint comprobante_cotizacion_positiva check (cotizacion > 0);

comment on column comprobante.moneda is
  'Moneda del comprobante, código de ARCA de 3 letras (PES). Va en el campo «moneda» del QR. Se guarda por fila y no como constante porque el QR tiene que poder reconstruirse igual dentro de diez años.';

comment on column comprobante.cotizacion is
  'Cotización a pesos. 1 para PES. Va en el campo «ctz» del QR.';

comment on column comprobante.tipo_cod_aut is
  'Tipo de código de autorización: E = CAE, A = CAEA (anticipado, para cuando el web service de ARCA no responde). Va en el campo «tipoCodAut» del QR. Hoy siempre E; se guarda por fila para que el día que exista CAEA las facturas viejas sigan reimprimiéndose con el tipo que realmente tuvieron.';

-- ═══════════════════════════════════════════════════════════════════════════
-- neto + iva = monto, dicho sin rodeos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El constraint decía `round(neto + iva, 2) = monto`. Como las tres columnas
-- son numeric(16,2), la suma de dos de ellas YA tiene dos decimales y ese
-- round() nunca hizo nada. O sea que el comportamiento no cambia.
--
-- Cambia lo que el constraint DICE. Un `round()` ahí se lee como una
-- tolerancia —«cerramos al centavo, con holgura»— y no la hay. Alguien que lo
-- lea así puede escribir un cálculo que se apoye en un margen inexistente y
-- descubrirlo cuando la fila no entra. La regla real es exacta y conviene que
-- el constraint la diga con esas palabras.
--
-- ── La regla del cálculo, que esto protege ────────────────────────────────
--
-- El total es el dato duro: es lo que se cobró. De ahí:
--
--     neto = round(total / 1.21, 2)
--     iva  = total - neto          ← la DIFERENCIA, no round(neto * 0.21)
--
-- Redondear las dos partes por separado es lo que descuadra: cada una arrastra
-- su propio error de medio centavo y la suma puede dar 9.999,99 o 10.000,01
-- sobre un cobro de 10.000. Calculando el IVA como diferencia, la identidad se
-- cumple por construcción, sin depender de cómo caiga el redondeo.
--
-- `reservar_numero_comprobante` ya calcula así cuando no se le pasan neto e
-- iva. Este constraint es la red por si alguien los pasa a mano mal.
--
-- Vale igual para A y para B: las dos guardan neto e iva. La diferencia es de
-- impresión —la A los discrimina, la B muestra sólo el total—, no de datos.
-- ═══════════════════════════════════════════════════════════════════════════

alter table comprobante drop constraint comprobante_neto_iva;

alter table comprobante
  add constraint comprobante_neto_iva check (
    tipo_comprobante = 0
    or (neto is not null and iva is not null and neto + iva = monto)
  );
