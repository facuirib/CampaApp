-- ─────────────────────────────────────────────────────────────────────────────
-- El check de gasto.medio_pago aprende `efectivo_transito`
--
-- Bug del motor, encontrado al darle pantalla al circuito de tránsito:
-- `pagar_gasto` valida y acepta el medio `efectivo_transito` —su propio
-- mensaje lo lista entre los válidos— pero el check de la tabla quedó con los
-- tres medios originales y rechazaba el insert. Consecuencia:
-- `reponer_efectivo_transito` era INALCANZABLE — exige un gasto con ese medio,
-- y ningún gasto podía tenerlo. La función, la validación de la función y la
-- reposición existían; el circuito completo estaba muerto en el check.
--
-- El arreglo es alinear el check con lo que la puerta ya prometía.
-- ─────────────────────────────────────────────────────────────────────────────

alter table gasto drop constraint gasto_medio_pago_check;
alter table gasto add constraint gasto_medio_pago_check
  check (medio_pago = any (array['efectivo'::text, 'transferencia'::text, 'cheque'::text, 'efectivo_transito'::text]));
