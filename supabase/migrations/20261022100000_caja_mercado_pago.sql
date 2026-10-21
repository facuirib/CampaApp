-- ═══════════════════════════════════════════════════════════════════════════
-- PROPUESTA — NO APLICAR SIN OK DE FACU (regla 11) Y COORDINACIÓN CON HORACIO
-- (toca registrar_cobro y registrar_ingreso_extraordinario, motor de su carril)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Caja MERCADO PAGO: plata disponible al instante, caja global sin predio —
-- el mismo comportamiento que Transferencia. Entra como medio en COBROS e
-- INGRESOS EXTRAORDINARIOS (los gastos siguen con sus medios de siempre).
--
-- Qué NO es: un arqueo físico. El arqueo del sistema es fecha+predio sobre
-- efectivo; MP se reconcilia como Transferencia — contra el saldo derivado
-- del diario (v_saldo_caja la lista sola: la vista recorre `caja` y suma su
-- cuenta en asiento_linea).
--
-- ⚠️ DOS VERIFICACIONES EN EL MOMENTO DE APLICAR (no pude cerrarlas en el
-- borrador): (1) el cuerpo vigente de registrar_cobro en la base puede ser
-- posterior a la migración 20260816200000 (el eslabón cheque-pago de
-- Horacio) — el create or replace de abajo tiene que partir del VIGENTE, no
-- de una copia vieja: se regenera con pg_get_functiondef antes de editar.
-- (2) cómo liga `caja.tipo` ↔ cuenta en v_saldo_caja (join por código o por
-- caja.cuenta_id) — ajustar el insert según eso.

-- 1 · La cuenta del plan: disponibilidades, junto a CAJA_TRANSFERENCIA.
insert into cuenta (codigo, nombre, tipo, imputable, padre_id)
select 'CAJA_MP', 'Mercado Pago', c.tipo, true, c.padre_id
  from cuenta c where c.codigo = 'CAJA_TRANSFERENCIA'
on conflict (codigo) do nothing;

-- 2 · La caja: global, sin predio (check_caja_predio exige predio SOLO para
--     efectivo, así que pasa sin tocar el trigger). El check de caja.tipo
--     hoy es ('efectivo','transferencia','usd'): se amplía.
alter table caja drop constraint caja_tipo_check;
alter table caja add constraint caja_tipo_check
  check (tipo in ('efectivo', 'transferencia', 'usd', 'mercado_pago'));
insert into caja (tipo, nombre) values ('mercado_pago', 'Mercado Pago')
on conflict (tipo) do nothing;

-- 3 · pago.medio_pago acepta el medio nuevo.
alter table pago drop constraint pago_medio_pago_check;
alter table pago add constraint pago_medio_pago_check
  check (medio_pago in ('efectivo', 'transferencia', 'cheque', 'mercado_pago'));

-- 4 · registrar_cobro: medio 'mercado_pago' → cuenta CAJA_MP, sin predio.
--     (create or replace del cuerpo VIGENTE con dos ediciones: el `if p_medio
--     not in (...)` suma 'mercado_pago', y el case de v_cuenta_caja gana
--     `when 'mercado_pago' then 'CAJA_MP'`. Se redacta sobre
--     pg_get_functiondef al aplicar — ver ⚠️ arriba.)

-- 5 · registrar_ingreso_extraordinario: ídem — su check de medio
--     ('efectivo','transferencia') suma 'mercado_pago', que es caja global:
--     como transferencia, el predio viaja como dimensión y no al asiento.

-- 6 · ingreso_extraordinario.medio_pago: ampliar su check igual que pago.

-- 7 · UI (mismo commit que aplique esto): mediosPago en lib/domain/medio-pago
--     gana la clave mercado_pago con su etiqueta «Mercado Pago»; los selects
--     de cobro (FormularioCobro/modal) e ingreso (NuevoIngreso) la listan.
--     Tipos a mano. Sin cambios en arqueo ni en gastos.
