-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ ANDAMIO DE PRUEBA · DESCARTABLE · NO es una corrección de datos reales
-- ═══════════════════════════════════════════════════════════════════════════
--
-- **Todo lo que esta migración toca es data de prueba.** Los dos torneos que
-- hay cargados son de desarrollo y se van a borrar; esto no arregla nada del
-- negocio, sólo deja el tablero en un estado desde el cual se puede EJERCITAR
-- el ciclo que introdujo `20260830220000`.
--
-- Va separada del modelo a propósito. Las cuatro migraciones anteriores son
-- estructura y quedan para siempre; ésta se puede tirar entera el día que entre
-- data de verdad, sin que nada se rompa.
--
-- ── Por qué hacía falta ────────────────────────────────────────────────────
--
-- Con `estado` muerto, los dos torneos quedaron en `planificado` —incluido el
-- que se está jugando— y `activo` se había usado como «el actual», con el
-- Apertura 2027 en `false`. O sea que, tal como estaba:
--
--   · `v_torneo_actual` devolvía CERO filas: no había ningún `en_curso`
--   · el Apertura 2027 se mostraba como «Dado de baja» siendo un torneo futuro
--     con 6 fichas y $66.600.000 en cuotas
--
-- Nada de eso es un dato que valga la pena salvar: es el resultado de que el
-- ciclo no existiera. Se acomoda para poder probar iniciar / cerrar / reabrir.
--
-- ── Lo que NO hace ─────────────────────────────────────────────────────────
--
-- No toca una sola cuota, ni un asiento, ni una ficha. Sólo dos columnas de dos
-- filas de `torneo`.
-- ═══════════════════════════════════════════════════════════════════════════

-- El que se está jugando pasa a estar en curso, que es lo que siempre fue de
-- hecho. A partir de acá `v_torneo_actual` devuelve una fila.
update torneo set estado = 'en_curso'
 where nombre = 'Clausura 2026' and estado = 'planificado';

-- El Apertura vuelve a estar vigente: `activo = false` significaba «no es el
-- actual» en la lectura vieja, y en la nueva significa «dado de baja», que es
-- falso. Queda `planificado`, que es lo que es.
update torneo set activo = true
 where nombre = 'Apertura 2027';
