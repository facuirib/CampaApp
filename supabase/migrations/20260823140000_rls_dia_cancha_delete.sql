-- ═══════════════════════════════════════════════════════════════════════════
-- RLS · la policy de DELETE que le faltaba a `dia_cancha`
-- NO ACTIVA RLS en la tabla: solo completa la policy.
--
-- `dia_cancha` tenía SELECT, INSERT y UPDATE. Le falta DELETE, y **sí se
-- borra**: `eliminar_dia_cancha(id)` existe y es una función común, no SECURITY
-- DEFINER, así que RLS se le aplica.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Por qué esta faltante es peor que las otras dos ────────────────────────
--
-- Con `reclamo` y `compromiso`, el INSERT sin policy fallaba FUERTE: «new row
-- violates row-level security policy». Feo, pero honesto — dice qué pasó.
--
-- Acá no. Probado con RLS activo y rol `authenticated`:
--
--     eliminar_dia_cancha(<un día que existe>)
--     → ERROR: Día de cancha inexistente: 14f9a471-45d9-4393-9c74-8a83…
--
-- **El día existe.** Lo que pasó está en el cuerpo de la función:
--
--     delete from dia_cancha where id = p_dia_cancha_id;
--     if not found then
--       raise exception 'Día de cancha inexistente: %', p_dia_cancha_id;
--     end if;
--
-- RLS bloqueó el DELETE **en silencio** —0 filas, sin error—, `not found` dio
-- true, y la función concluyó que el día no existe.
--
-- O sea: el silencio de RLS no solo esconde el fallo, **lo disfraza de otro
-- error**. Y de uno que manda a buscar el problema al lugar equivocado: alguien
-- iría a revisar por qué se perdió un día de cancha que está ahí.
--
-- Es el argumento más fuerte que encontramos para el protocolo de medir filas
-- afectadas: acá ni siquiera hubo silencio que notar — hubo un mensaje seguro y
-- equivocado.
--
-- (No es un defecto de `eliminar_dia_cancha`: `if not found` después de un
-- DELETE es la forma correcta de detectar «no existía». Lo que cambia el
-- significado de `not found` es RLS.)

drop policy if exists "dia_cancha_delete_autenticado" on dia_cancha;
create policy "dia_cancha_delete_autenticado"
  on dia_cancha for delete
  to authenticated
  using (true);

-- Con esto `dia_cancha` queda completa: S / I / U / D.
--
-- El borrado sigue protegido por donde corresponde: las FK de `arqueo` y
-- `venta_bar` bloquean quitar un día que ya tiene caja contada o un cierre de
-- bar cargado. Eso es integridad referencial, no permisos, y no lo toca RLS.

-- ⚠️ NO SE ACTIVA ACÁ. `dia_cancha` va en la última tanda de la Fase 3, con su
-- circuito probado:
-- alter table dia_cancha enable row level security;

comment on table dia_cancha is
  'Día de operación de un predio: ancla del arqueo y del cierre de bar, y '
  'unidad de conteo del presupuesto. RLS con policies select/insert/update/'
  'delete para authenticated — el delete se agregó el 23/08 porque faltaba y '
  'eliminar_dia_cancha lo necesita. ENABLE pendiente de su tanda.';
