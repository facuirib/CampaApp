-- ─────────────────────────────────────────────────────────────────────────────
-- desglose_iva: el neto y el IVA de un bruto, en numeric puro
--
-- Del diagnóstico del 11/09 (regla 2). El desglose neto/IVA de la factura se
-- calculaba en TypeScript con floats:
--
--   impNeto = Math.round((montoConIva / 1.21) * 100) / 100
--   impIva  = monto - impNeto
--
-- El cálculo de dinero más sensible del repo —va a la base Y a ARCA— viviendo
-- en el único lugar donde la aritmética no es exacta. Acá es numeric(16,2) de
-- punta a punta, con la misma convención: el neto se redondea y el IVA es la
-- resta, así neto + iva = bruto EXACTO siempre.
--
-- La alícuota es parámetro con default 21: si mañana una factura sale con
-- otra, la función no cambia.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function desglose_iva(
  p_bruto    numeric,
  p_alicuota numeric default 21
) returns table (neto numeric, iva numeric)
language sql
immutable
as $$
  select round(p_bruto / (1 + p_alicuota / 100), 2)            as neto,
         p_bruto - round(p_bruto / (1 + p_alicuota / 100), 2)  as iva;
$$;

comment on function desglose_iva(numeric, numeric) is
  'Neto e IVA de un importe bruto, en numeric exacto: neto redondeado a 2 '
  'decimales, IVA por resta — neto + iva = bruto siempre. Reemplaza el cálculo '
  'con float que vivía en lib/arca-fecaesolicitar.ts (regla 2).';
