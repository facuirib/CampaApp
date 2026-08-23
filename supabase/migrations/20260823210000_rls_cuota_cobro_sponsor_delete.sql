-- ═══════════════════════════════════════════════════════════════════════════
-- RLS · la policy de DELETE que le falta a `cuota_cobro_sponsor`
-- SIN `ENABLE`. Precondición de la Fase 4.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `cuota_cobro_sponsor` tiene SELECT, INSERT y UPDATE. Le falta DELETE, y
-- `cargar_cuotas_sponsor` **borra**: reemplaza el cronograma entero de un
-- contrato —borra las cuotas viejas y carga las nuevas— en una sola operación.
--
--     delete from cuota_cobro_sponsor where contrato_id = p_contrato_id;
--     insert into cuota_cobro_sponsor (contrato_id, monto, fecha_cobro) ...
--
-- ── Por qué acá el silencio es PEOR que en `dia_cancha` ────────────────────
--
-- En `eliminar_dia_cancha` el DELETE bloqueado no hacía nada: el día seguía
-- ahí. Acá **el INSERT que viene después sí tiene policy**, así que corre igual
-- — y las cuotas nuevas se apilan sobre las viejas.
--
-- No hay unique que lo frene: `cuota_cobro_sponsor` tiene **solo la PK sobre
-- `id`**. Ningún índice sobre `(contrato_id, fecha_cobro)`.
--
-- El resultado no es «no pasó nada», es **el contrato con el cronograma
-- duplicado**: el doble de cuotas, el doble de monto proyectado al cashflow, y
-- la deuda del sponsor al doble. Corrupción de datos, no un no-op.
--
-- Y la función **devuelve el número correcto**: `get diagnostics v_n = row_count`
-- se ejecuta después del INSERT, así que mide las filas insertadas. Si se
-- cargan 6 cuotas devuelve 6, estén o no las 6 viejas debajo. Ni la función ni
-- la pantalla tienen cómo notarlo.
--
-- ── Verificado en rollback ─────────────────────────────────────────────────
--
-- Con RLS activo sobre `cuota_cobro_sponsor` + esta policy, rol `authenticated`
-- y `bypassrls = false` dentro de la transacción: `cargar_cuotas_sponsor`
-- reemplaza el cronograma de 3 cuotas por otro de 2 y la tabla **queda en 2**,
-- no en 5. Sin la policy quedaba en 5. Ver `coordinacion.md`.
--
-- ── NO activa RLS ─────────────────────────────────────────────────────────
--
-- Igual que el resto de las policies: escribirla y activarla son dos actos
-- distintos. Esta migración deja la policy inerte; el `ENABLE` de
-- `cuota_cobro_sponsor` va con la Fase 4, con confirmación previa.

create policy cuota_cobro_sponsor_delete_autenticado
  on cuota_cobro_sponsor for delete
  to authenticated
  using (true);

comment on policy cuota_cobro_sponsor_delete_autenticado on cuota_cobro_sponsor is
  'Fase 4 · cargar_cuotas_sponsor reemplaza el cronograma completo: borra las cuotas viejas antes de insertar las nuevas. Sin esta policy el DELETE se bloquea en silencio, el INSERT corre igual y las cuotas se DUPLICAN (no hay unique sobre contrato_id+fecha_cobro), con el cashflow y la deuda del sponsor al doble.';
