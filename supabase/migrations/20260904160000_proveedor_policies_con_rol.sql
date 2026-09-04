-- ─────────────────────────────────────────────────────────────────────────────
-- Las policies de proveedor nombran su rol
--
-- Nivel C, tanda 1.
--
-- ── Lo que había, y por qué no era lo que parecía ──────────────────────────
--
-- El verificador venía diciendo que `crear_proveedor` derivaba a «(NADIE)», y
-- lo interpretamos como que ni admin podía ejecutarla. Horacio probó en vivo con
-- admin, funcionó, y concluyó que la función validaba el rol internamente.
--
-- **Las dos lecturas estaban mal, y la realidad es peor que cualquiera de las
-- dos.** Medido:
--
--   · `crear_proveedor` NO tiene guarda de rol. Su único `raise` es por el
--     nombre vacío.
--   · las tres policies son `using(true)` / `check(true)`.
--   · resultado, probado rol por rol: **admin, finanzas, operador, bar y
--     lectura pueden crear un proveedor.** Incluido `lectura`.
--
-- El «(NADIE)» del verificador era su punto ciego —extrae roles del TEXTO de la
-- policy, y un `true` no nombra ninguno— pero el efecto real era el opuesto:
-- abierto a todos.
--
-- ── Quién debe poder ───────────────────────────────────────────────────────
--
-- Un proveedor se da de alta cuando se carga un gasto o se compra un activo:
-- es del día a día. Va con la misma lista que `gasto.registrar` —admin,
-- operador y finanzas— porque quien puede cargar el gasto tiene que poder
-- nombrar a quién se le compró, sin pedirle a otro que cree la ficha.
--
-- `bar` queda afuera: sus compras se cargan como costos del bar, que ya tienen
-- su circuito. Y `lectura` es de lectura.
--
-- ── Por qué en la policy y no en una guarda ────────────────────────────────
--
-- Porque la escritura no pasa sólo por `crear_proveedor`: la pantalla de
-- edición escribe la tabla directo, como Clientes o Emisor. Una guarda dentro
-- de la función dejaría el UPDATE abierto. La policy cubre las dos puertas.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists proveedor_insert_autenticado on proveedor;
drop policy if exists proveedor_update_autenticado on proveedor;

create policy proveedor_insert_rol on proveedor
  for insert to authenticated
  with check (auth_rol() = any (array['admin', 'operador', 'finanzas']));

create policy proveedor_update_rol on proveedor
  for update to authenticated
  using      (auth_rol() = any (array['admin', 'operador', 'finanzas']))
  with check (auth_rol() = any (array['admin', 'operador', 'finanzas']));

-- El SELECT queda como estaba, abierto a cualquier autenticado: es la nota #1
-- del proyecto — restringir la LECTURA de las tablas del núcleo rompe las
-- vistas que las cruzan, y un proveedor no tiene nada que esconder.
