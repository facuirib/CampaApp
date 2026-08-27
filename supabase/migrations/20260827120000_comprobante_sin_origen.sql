-- ═══════════════════════════════════════════════════════════════════════════
-- comprobante.sin_origen — la excepción explícita a «todo comprobante nace de
-- un cobro»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `comprobante_un_origen` exige exactamente uno de pago_id /
-- cuota_cobro_sponsor_id. Está bien y se queda: un comprobante fiscal que no
-- se puede rastrear hasta el cobro que lo originó es un agujero de auditoría.
--
-- Pero hay comprobantes reales que existen en ARCA y no nacieron de un cobro
-- del sistema. El caso concreto: la Factura B #407 del 25/08, $1, prueba
-- técnica del circuito con ARCA. Existe —confirmada con
-- FECompUltimoAutorizado— y hoy no se puede anotar. Y no anotarla no es
-- neutral: **el número queda como un hueco en nuestra numeración**, y la
-- primera factura de verdad va a pedirle a ARCA un número que ARCA ya usó.
--
-- ── Por qué un flag y no relajar el constraint ────────────────────────────
--
-- Relajarlo a «pueden ser los dos null» haría que un comprobante normal al que
-- se le olvidó el origen entre sin decir nada. La garantía se perdería para
-- todos, para habilitar un puñado de casos. El flag invierte eso: **el default
-- es false, así que quien no lo marca sigue bajo la regla vieja**, y quien lo
-- marca está declarando algo, no salteándose un chequeo.
--
-- ── Y por qué lleva motivo ────────────────────────────────────────────────
--
-- Un booleano solo es un casillero, y un casillero se tilda. El motivo
-- obligatorio es lo que hace que marcarlo sea un acto deliberado y lo que
-- vuelve útil el filtro del módulo de consulta: ver «3 comprobantes sin
-- origen» no dice nada; ver «prueba técnica del circuito ARCA, 25/08» sí.
--
-- ── La forma del constraint ───────────────────────────────────────────────
--
-- No es «uno de los dos O el flag». Es un case: con el flag, los dos tienen
-- que estar en null. Un comprobante que declara no tener origen y además
-- apunta a un pago se estaría contradiciendo, y esa fila mentiría en las dos
-- direcciones — aparecería en el listado de técnicos y también colgada de un
-- cobro real.
-- ═══════════════════════════════════════════════════════════════════════════

alter table comprobante
  add column sin_origen boolean not null default false,
  add column motivo_sin_origen text;

alter table comprobante drop constraint comprobante_un_origen;

alter table comprobante
  add constraint comprobante_un_origen check (
    case
      when sin_origen
        -- Declara que no tiene origen: entonces no puede tener ninguno.
        then pago_id is null and cuota_cobro_sponsor_id is null
      else
        -- La regla de siempre, intacta.
        (pago_id is not null and cuota_cobro_sponsor_id is null)
        or (pago_id is null and cuota_cobro_sponsor_id is not null)
    end
  );

alter table comprobante
  add constraint comprobante_motivo_sin_origen check (
    not sin_origen or motivo_sin_origen is not null
  );

comment on column comprobante.sin_origen is
  'El comprobante existe en ARCA pero no nació de un cobro del sistema (prueba técnica, factura anterior a Campa, carga manual). Es la ÚNICA excepción a comprobante_un_origen y hay que marcarla activamente: el default es false. Exige motivo_sin_origen.';

comment on column comprobante.motivo_sin_origen is
  'Por qué este comprobante no tiene origen. Obligatorio cuando sin_origen = true — sin él, el flag sería un casillero que se tilda sin pensar.';
