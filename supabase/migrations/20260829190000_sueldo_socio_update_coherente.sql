-- ═══════════════════════════════════════════════════════════════════════════
-- `sueldo_socio_update_autenticado` se pone de acuerdo consigo misma
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La policy decía dos cosas distintas:
--
--   using      (auth_rol() = any (array['admin', 'finanzas']))
--   with check (auth_rol() = any (array['admin', 'finanzas', 'operador']))
--
-- **Hoy no abre nada, y eso es exactamente lo que la hace peligrosa.** En un
-- UPDATE el `using` corre PRIMERO: elige qué filas son visibles para modificar.
-- A `operador` no le queda ninguna, así que el `with check` —que juzga la fila
-- resultante— nunca llega a evaluarse. Medido antes de tocar nada: operador,
-- bar y lectura afectan 0 filas; admin y finanzas, 2. El `operador` del
-- `with check` es código muerto.
--
-- Muerto, pero **legible**. Y lo que se lee es una autorización: alguien que
-- necesite una policy de UPDATE va a copiar ésta —es la del módulo más
-- sensible, la plata de los dueños— y se va a llevar el `operador` puesto. En
-- la tabla que la copie, el `using` puede ser más ancho, y ahí el `with check`
-- sí decide. La incoherencia no es un bug acá: es un molde con un bug adentro,
-- esperando a que alguien lo use.
--
-- El arreglo es la coherencia, no el recorte: las dos mitades pasan a decir lo
-- mismo, `admin` y `finanzas`, que es lo que la policy siempre hizo y lo que
-- `PERMISOS['socio.sueldo']` declara. **Allowlist positiva en las dos mitades**
-- —una lista de quién puede, no de quién no—, que es la regla que el resto del
-- schema ya cumple: de las 37 policies de UPDATE, ésta era la única que no.
--
-- `alter policy` no toca datos ni filas: reemplaza la expresión y nada más.
-- ═══════════════════════════════════════════════════════════════════════════

alter policy sueldo_socio_update_autenticado
  on public.sueldo_socio
  using      (auth_rol() = any (array['admin', 'finanzas']))
  with check (auth_rol() = any (array['admin', 'finanzas']));
