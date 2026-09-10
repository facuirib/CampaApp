# Checklist de diagnóstico end-to-end — toda la app

Para recorrer con sesión real, pantalla por pantalla. El objetivo no es "que
no tire error" — es que **cada número cuadre con la historia real de los
datos** y que cada botón/link haga lo que promete según el estado real.

Marcar con `[x]` a medida que se verifica. Lo que dice 🔴 es un patrón de
riesgo **ya confirmado en el código** (no una sospecha) — se prueba primero.

---

## 🔴 Alta prioridad — patrones de riesgo confirmados, antes de recorrer nada

Estos cinco ya están verificados contra el código y los tipos generados, no
son hipótesis. Son la clase de bug que Facu señaló: compila perfecto, rompe
en runtime.

### 1. `href` a `/equipos/null` — confirmado en tipos, no corregido

`v_cobranza_cola.tercero_id` está tipado **`string | null`**
(`lib/db/database.types.ts:6023`, columna `tercero_id`). Dos pantallas arman
el link SIN chequear ese null, mientras que **Inicio y `/equipos` sí lo
chequean para el mismo campo** — la inconsistencia es la prueba de que no es
intencional:

- [ ] `app/cobranza/page.tsx:445` — `rowHref={(f) => \`/equipos/${f.tercero_id}\`}`
      sobre la tabla principal de deudores. Si alguna fila de
      `v_cobranza_cola` viene con `tercero_id` null, el link real es
      `/equipos/null` (un template literal convierte `null` en la palabra
      "null", así que TypeScript no lo marca — string sigue siendo string).
- [ ] `app/cobranza/ColasAviso.tsx:220` — mismo patrón, mismo campo, en las
      tarjetas de "Por vencer / Vencido / etc." de `/cobranza?vista=avisos`.
- **Cómo probarlo**: no hace falta encontrar una fila rota a mano — alcanza
  con mirar si alguna vez `/cobranza` o `/cobranza?vista=avisos` muestra una
  fila cuyo click lleva a una URL con `null` en vez de un uuid. Si nunca pasa
  con los datos de hoy, igual vale la pena preguntarle a Facu (dueño de
  `v_cobranza_cola`) si esa columna puede ser null y en qué caso, para saber
  si el guard hace falta antes de que aparezca en producción.

### 2. Gastos vs. Activos — el bug real que ya se arregló, ahora es regresión

`app/gastos/page.tsx:184-193` documenta el caso medido: una compra de activo
a crédito de $12.000.000 se colaba en el total de Gastos. El fix
(`.neq('naturaleza', 'inversion')`) está en la vista de la TABLA, a
propósito no en `v_gasto_detalle` en sí —esa vista también alimenta el
cashflow y `v_activo.compra_registrada`, y filtrarla ahí la sacaría del
comprometido—.

- [ ] Cargar (o buscar) un gasto de naturaleza `inversion` (un activo con
      compra a crédito) y confirmar:
  - **No aparece** en la tabla ni en los totales de `/gastos` (ningún mes,
    ni "todo el año").
  - **Sí aparece** en `/activos` y en `/activos/[activoId]` con su plan de
    amortización.
  - **Sí impacta** el comprometido en `/proyeccion` y en `/calendario-pagos`
    (la plata igual sale, tiene que verse en el flujo de caja).
- **Dato de prueba**: dar de alta un activo con `/activos/nuevo`, financiado
  (no de contado), y seguirlo por las tres pantallas.

### 3. `rowKey="tercero_id"` sobre la misma columna nullable

Mismas dos pantallas que el punto 1 (`cobranza/page.tsx:441`,
`ColasAviso.tsx:218`) usan `rowKey="tercero_id"` — si hay más de una fila con
`tercero_id` null, React las trata como la misma key (warning en consola como
mínimo, filas que no re-renderizan bien como máximo). Revisar la consola del
navegador en `/cobranza` con la cola completa cargada.

### 4. Las sumas en el cliente — cuáles están documentadas y cuáles no

Barrido de todo `app/` por `.reduce(`. Tres están explícitamente documentadas
como excepción aceptada a la regla 1 (aritmética de presentación sobre datos
que ya vinieron calculados, no un total de negocio nuevo) — igual conviene
verificar que el número que muestran coincide con sumar a mano lo que se ve
en pantalla:

- [ ] `app/resultados/page.tsx:103,118` — el total anual de cada fila/columna
      de la matriz P&L es la suma de sus 12 meses. Sumar a mano una fila
      cualquiera y comparar contra la columna "Total".
- [ ] `app/proyeccion/page.tsx:197` — "ingresos sin gasto" (el tamaño de la
      cola incompleta). No sale de ninguna vista a propósito.

- [x] `app/cobranza/ColasAviso.tsx:135` — **revisado, no era un bug de acá.**
      El `.reduce()` suma `total_adeudado` de TODAS las filas de la etapa, sin
      filtrar por torneo — correcto, porque `filas` (la cola completa)
      tampoco viene filtrada por torneo. **El agujero real estaba en cómo
      Inicio consume `v_cobranza_etapa`** (`app/page.tsx:142`): esa vista
      agrupa por `torneo_id`, y `v_cobranza_momento` deja `torneo_id` en
      NULL a propósito cuando un equipo debe en más de un torneo (comentario
      en `20260830190000_cobranza_momento.sql:151`: "la deuda es del equipo,
      no del torneo"). El filtro `.eq('torneo_id', torneoElegido)` de Inicio
      nunca matchea NULL, así que esos equipos quedaban afuera del gráfico
      "Cobranza por vencimiento" — sin avisar. Arreglado con una nota (`pie`)
      en ese panel explicando el hueco, más un comentario en `ColasAviso.tsx`
      documentando por qué su número no tiene ese problema. Sin commitear
      todavía — ver `app/page.tsx` y `app/cobranza/ColasAviso.tsx`.

El resto de los `.reduce(` que aparecen (`activos/amortizar`,
`calendario/nueva`, `equipos/[terceroId]/ArmarReclamo.tsx`,
`equipos/[terceroId]/cobrar/page.tsx`, `sponsors/[sponsorId]/NuevoContrato.tsx`)
son totales de **selección en un formulario en curso** (cuánto sumé de lo que
tildé, antes de submitear) — no números que deban salir de una vista. Cuando
se llega a esas pantallas más abajo en este checklist, se marca igual, pero
no son sospecha de bug.

### 5. Rutas legacy — [x] verificado en código, las 8 apuntan a destino real

Ocho rutas son sólo `redirect()`, para links viejos guardados en favoritos o
mails. Verificado contra el código (no sólo que el archivo exista — que el
query param de cada destino sea uno que esa pantalla efectivamente reconoce,
no uno viejo que caería en el default en silencio):

- [x] `/clientes` → `/equipos` — existe `app/equipos/page.tsx`
- [x] `/clientes/[id]` → `/equipos/[id]?tab=datos` — existe
      `app/equipos/[terceroId]/page.tsx`, y `tab==='datos'` es un valor que
      esa pantalla reconoce (línea 169)
- [x] `/reclamos` → `/cobranza` — existe `app/cobranza/page.tsx`
- [x] `/reclamos/[id]` → `/equipos/[id]` — existe
      `app/equipos/[terceroId]/page.tsx`
- [x] `/cobranza/[id]` → `/equipos/[id]` — ídem
- [x] `/cobranza/[id]/cobrar` → `/equipos/[id]/cobrar` — existe
      `app/equipos/[terceroId]/cobrar/page.tsx`
- [x] `/movimientos` → `/auditoria?vista=diario` — existe
      `app/auditoria/page.tsx`, y `vista==='diario'` es reconocido (línea 123)
- [x] `/inscripciones` → `/cobranza?vista=inscripciones` — existe
      `app/cobranza/page.tsx`, y `vista==='inscripciones'` es reconocido
      (línea 140)

Falta la prueba con sesión real (que el redirect efectivamente navegue y no
quede un flash/loop) — el chequeo de código está cerrado.

---

## Inicio (`/`)

**Qué debería verse**: el estado de hoy — caja, cobranza del torneo en
curso, resultado del año — con seis KPIs y una decena de gráficos chicos.

- [ ] Los 6 KPIs cargan con datos reales (no guiones) cuando hay torneo en
      curso; con guion/"—" cuando corresponde (sin torneo, `valor: null`).
- [ ] **"En caja hoy"** coincide, centavo a centavo, con el total de `/caja`
      (misma vista `v_saldo_caja_total` en las dos).
- [ ] **"Dónde está la plata"** (por caja) — cada barra coincide con el
      saldo de esa caja en `/caja` y en `/caja/[cajaId]`.
- [ ] **"Resultado del torneo"** — el signo y el color (verde/rojo) tienen
      que coincidir con lo que muestra la ficha del torneo en curso.
- [ ] **"Evolución de la caja"** — la misma serie semanal que `/proyeccion`
      (vista `v_cashflow` en las dos). El tramo "real" tiene que coincidir
      con `/caja` hoy; el "proyectado", con `/proyeccion`.
- [ ] **"De lo comprometido a lo cobrado"** (waterfall) — Comprometido menos
      Por cobrar tiene que dar Cobrado, exacto (si no cierra, el puente lo
      muestra visualmente — el componente no lo fuerza).
- [ ] **"Deudas urgentes"** — las mismas filas de mayor atraso que la cola
      de `/cobranza`, mismo orden.
- [ ] Cambiar el selector de torneo (si hay más de uno activo) y confirmar
      que SOLO la banda de Cobranza cambia — Caja y Finanzas no deberían
      moverse (son de la empresa/año, no del torneo).
- **Datos de prueba**: un torneo con al menos una cuota vencida, un pago
  parcial (para tramo negativo si existe) y una caja en negativo (si hay
  alguna) para ver el `colorPorSigno` de "Dónde está la plata".

---

## Torneos

### `/torneos` — [x] verificado

Se investigó un caso concreto: la tabla mostraba solo "Clausura 2026" y no
"Apertura 2027" ni "Prueba Clon Clausura 2027". Revisado a fondo —
`app/torneos/page.tsx` (sin `.eq`/`.limit`, trae todo), `v_torneo_lista`
(sin WHERE, el propio comentario de la vista dice "sin filtro de activo: los
muestra todos") y la policy RLS de `torneo` (`torneo_select_autenticado`,
`using (true)`, sin restricción) — **ninguno de los tres filtra nada**. De
paso apareció algo real en `20260909100000_borrado_torneo_policies.sql`:
hasta el día anterior, borrar un torneo devolvía "borrado" sin haber policy
de DELETE —el borrado no pasaba, pero la UI decía que sí— y quedó arreglado
ahí mismo; el propio comentario de esa migración nombra a "Prueba Clon" como
el caso que lo destapó.

**Confirmado por Horacio**: los dos torneos que faltan eran de
prueba/desarrollo — la base real hoy tiene solo "Clausura 2026", y la tabla
está mostrando exactamente eso. No es un bug: la pantalla lee la base sin
ningún filtro raro de por medio, tal como se buscaba confirmar acá.

- [x] Lista todos los torneos con su estado (badge) correcto: PLANIFICADO,
      EN CURSO, CERRADO — el badge lee `estado`, no `activo` (`activo` es
      borrado lógico, los tres estados lo tienen en true — regla ya
      documentada arriba del archivo).
- [ ] Un solo torneo "en curso" a la vez — si hay dos, es un bug de datos,
      no de pantalla.

### `/torneos/nuevo`
- [ ] Crear un torneo y confirmar que aparece en la lista con estado
      PLANIFICADO.
- [ ] `ejercicio_id` no está en el formulario — confirmar que el torneo
      creado igual resuelve bien el ejercicio contable al primer asiento.

### `/torneos/[torneoId]`
- [ ] La "lista de control" (`v_torneo_listo`) refleja el estado real:
      estructura cargada, tarifario, calendario — cada ítem en verde/rojo
      según corresponda.
- [ ] Confirmar un torneo (`ConfirmarTorneo`) y verificar que pasa a EN
      CURSO y que **el selector de Inicio ahora lo ofrece**.
- [ ] `AccionesCiclo` — clonar torneo: la estructura del calendario se
      copia (Facu lo tocó, según coordinacion.md).
- [ ] Borrar torneo — sólo debería poder borrarse uno PLANIFICADO sin
      movimientos; confirmar que el botón está deshabilitado si no.

### `/torneos/[torneoId]/estructura` y `/torneos/[torneoId]/fichas`
- [ ] Series/categorías cargadas coinciden con lo que se ve en
      `/calendario` para ese torneo y en el tarifario.
- [ ] Inscribir un equipo (`InscribirEquipo`) — botón deshabilitado sin
      serie elegida (`!serieElegida`, línea 166/180) y sin plan
      seleccionado (línea 219). Confirmar que genera las cuotas según el
      tarifario (regla del proyecto: `crear_equipo_torneo` es la única
      puerta).
- **Dato de prueba**: un torneo PLANIFICADO sin equipos todavía.

---

## Calendario

### `/calendario`
- [ ] Las jornadas de la serie elegida coinciden con las que ve
      `/calendario-pagos` para ese mismo torneo.
- [ ] Crear jornada (`/calendario/nueva`) — el número sugerido
      (`numeroSugerido`, línea 96) es el máximo existente + 1; confirmar
      que no se pisa con una jornada movida a ese mismo número.

### `/calendario/[jornadaId]/mover` y `/suspender`
- [ ] Botón de confirmar deshabilitado sin fecha elegida (`!puedeConfirmar`,
      ambos archivos).
- [ ] Mover una jornada y verificar que **el cashflow comprometido de
      `/proyeccion` y `/calendario-pagos` se recalcula** con la fecha
      nueva, no con la vieja.
- **Dato de prueba**: mover una jornada del torneo en curso una semana
  para adelante y ver si el bulto en `/proyeccion` se corre con ella.

---

## Cobranza (`/cobranza`)

**Qué debería verse**: quién debe, cuánto, hace cuánto — con las colas por
etapa (al día / por vencer / vencido) y el worklist de avisos.

**[x] La pestaña "Avisos" sin selector de torneo — verificado, es a
propósito.** Se preguntó por qué "Cuenta corriente" e "Inscripciones" tienen
selector de torneo y "Avisos" no. Revisado el código: `app/cobranza/page.tsx`
lo dice en un comentario explícito arriba del branch de Avisos ("El filtro
por torneo, por ejemplo, no aplica acá — el aviso se le manda al equipo con
todo lo que arrastre, que es el concepto 5"), la consulta a `v_cobranza_cola`
no lleva `.eq('torneo_id', ...)`, y `<ColasAviso>` ni siquiera recibe
`torneoElegido` como prop —solo lo recibe `<Pestanas>`, para arrastrarlo al
cambiar de pestaña, no para filtrar Avisos—. Coherente además con
`v_cobranza_momento` (la vista de base): pone `torneo_id` en NULL a
propósito cuando un equipo debe en más de un torneo, así que filtrar Avisos
por uno específico excluiría justo a esos equipos de la cola de trabajo.
**No es un bug — confirmado por Horacio.**

- [ ] La cola completa (`v_cobranza_cola`) suma exactamente lo mismo que
      `v_cobranza_etapa` agrupada por etapa (ver punto 🔴4 de arriba).
- [ ] Filtrar por torneo — el link "Ver cuentas" desde Inicio entra
      derecho a la etapa correcta (`?vista=avisos&etapa=por_vencer`), no a
      la portada genérica.
- [ ] Un equipo con deuda en MÁS de un torneo aparece con su deuda total,
      no sólo la del torneo activo (regla 5 del dominio: la deuda es del
      equipo, no del torneo).
- [ ] **Registrar un cobro** (`/equipos/[terceroId]/cobrar`) desde acá y
      confirmar que la fila desaparece de la cola de deudores (o baja de
      etapa) sin recargar manualmente.
- **Dato de prueba**: un equipo con cuotas vencidas en dos torneos
  distintos (uno cerrado, uno en curso), para probar `sugerir_imputacion`.

### `/cobranza/avisos/historial`
- [ ] Cada aviso enviado tiene canal y fecha reales; el conteo total
      coincide con lo que se ve acumulado en las tarjetas de etapa.

---

## Equipos (ficha unificada)

### `/equipos`
- [ ] KPI de equipos al día / en mora coincide con Inicio.

### `/equipos/[terceroId]`
- [ ] Las **tres pestañas** (cuenta corriente, datos fiscales, torneos)
      muestran al mismo equipo sin contradecirse — la cuenta corriente no
      debería mostrar un saldo distinto del que suma la pestaña de torneos.
- [ ] `v_deuda_detalle` filtrado por `tercero_id` — la deuda que se ve acá
      es la MISMA que aparece en la fila de ese equipo en `/cobranza`.
- [ ] El link "Ver torneo" por cada torneo listado (`href={... ?torneo=...}`)
      no debería quedar vacío — el `tercero.id` que arma la URL es el de
      la ficha misma (`terceroId`, ya validado por el `params`), así que
      este caso concreto es más seguro que el de la cola.
- [ ] **Registrar un cobro** (botón "Cobrar") — si el equipo tiene deuda en
      más de un torneo, tiene que aparecer `sugerir_imputacion()` con la
      propuesta, no imputar solo. Confirmar el operador.
- [ ] `AplicarAnticipo` — sólo debería estar disponible si hay
      `saldo_a_favor` > 0.
- **Dato de prueba**: el mismo equipo con deuda en dos torneos usado arriba.

---

## Caja

### `/caja`
- [ ] La suma de las cajas individuales (`v_saldo_caja`) da exactamente
      `v_saldo_caja_total` — y ese total es el mismo que "En caja hoy" de
      Inicio.
- [ ] Cajas en tránsito (`v_transito_saldo`, pagos/gastos sin liquidar) se
      distinguen visualmente de las cajas con saldo firme.

### `/caja/[cajaId]`
- [ ] El detalle de movimientos de esa caja, sumado, da el saldo que
      `/caja` le atribuye a esa caja.
- [ ] Cada fila lleva a `/movimientos/[asientoId]` (asiento_id siempre
      presente en un movimiento real, bajo riesgo).

---

## Arqueo

### `/arqueo`
- [ ] `v_efectivo_sin_rendir` — cada predio con efectivo pendiente de
      rendir aparece, y desaparece al rendirlo.
- [ ] `v_arqueo_diferencia` — la diferencia mostrada es Real menos
      Esperado, con el signo correcto (sobrante positivo, faltante
      negativo).

### `/arqueo/nuevo`
- [ ] El saldo esperado viene CONGELADO al momento de arquear (regla del
      proyecto) — cambiar algo después de arquear no debería mover el
      esperado de un arqueo ya cerrado.

### `/arqueo/[arqueoId]/entregar`
- [ ] `registrar_entrega_central` — la plata entregada sale de la caja de
      origen y entra a Caja Central, visible en ambas en `/caja`.
- **Dato de prueba**: un día-cancha con venta de bar y de cancha mezcladas,
  para separar `v_saldo_efectivo_dia_cancha` de `v_saldo_bar_dia_cancha`.

---

## Bar

### `/bar`
- [ ] `v_bar_mes` / `v_bar_total` — el total del mes es la suma de los
      días de ese mes (verificar contra `v_venta_bar` filtrado al mismo
      rango).
- [ ] El costo de bar (`/bar/costo`) no debería aparecer duplicado en
      `/gastos` (mismo caso que activos/inversión — verificar naturaleza).

### `/bar/nuevo`, `/bar/retiro`
- [ ] Un retiro de bar reduce el saldo de la caja de bar de ese predio en
      `/caja`, no otra.
- **Dato de prueba**: un día-cancha con venta en dos predios distintos.

---

## USD

### `/usd`
- [ ] `v_tenencia_usd` — cantidad de USD en tenencia coincide con
      comprar menos vender acumulado.
- [ ] Comprar/vender USD (`comprar_usd`/`vender_usd`) — el promedio
      ponderado se recalcula solo; tocar `CAJA_USD` por afuera de estas dos
      funciones está prohibido por regla del proyecto — no hay forma de
      hacerlo desde la UI, así que esto es más para tener presente si algo
      se ve raro en el promedio.
- [ ] `v_resultado_cambio` — la diferencia de cambio realizada, sólo
      aparece al VENDER, no al comprar (comprar fija el costo, no genera
      resultado).
- **Dato de prueba**: comprar USD dos veces a cotizaciones distintas,
  vender una parte, y verificar que el promedio ponderado y la diferencia
  de cambio dan lo esperado a mano.

---

## Cheques

### `/cheques`
- [ ] Cada cheque en cartera tiene un asiento de alta
      (`asiento_alta_id`) que abre bien en `/movimientos/[id]`.
- [ ] Al depositar/rechazar un cheque, el `asiento_cierre_id` aparece y
      el saldo de la caja correspondiente se mueve.
- **Dato de prueba**: un cheque de terceros recibido como pago, después
  depositado.

---

## Gastos

### `/gastos`
- [ ] **Ver punto 🔴2** (arriba) antes que nada.
- [ ] El toggle "sólo impagos" ignora el filtro de mes a propósito —
      confirmar que trae gastos viejos sin pagar de meses anteriores, no
      sólo del mes elegido.
- [ ] Un gasto sigue el ciclo: se carga (devengo) → aparece "impago" →
      se paga (`/gastos/[gastoId]/pagar`) → pasa a "pagado", y el
      comprometido de `/proyeccion` baja en esa misma plata.
- **Dato de prueba**: cargar un gasto `por_fecha` (atado a una jornada) y
  uno `recurrente`, pagar uno y dejar el otro impago.

### `/gastos/[gastoId]/pagar` y `/comprobante`
- [ ] El comprobante adjunto (si lo hay) se puede ver/descargar
      (`comprobante_path`).

---

## Activos

### `/activos`
- [ ] **Ver punto 🔴2**. El activo cargado desde un gasto de inversión
      aparece acá con su valor de compra.

### `/activos/nuevo`
- [ ] Sólo ofrece categorías de gasto con `naturaleza='inversion'`
      (línea 70) — si aparece una categoría que no es de inversión, es un
      bug de la vista/tabla, no de la pantalla.

### `/activos/[activoId]`
- [ ] `v_amortizacion` — la suma de las cuotas de amortización ya
      corridas coincide con el valor contable actual del activo (valor de
      compra menos amortizado).
- [ ] El umbral de activación (`config_contable.umbral_activacion`) — un
      "activo" por debajo de ese monto debería haber ido a gasto directo,
      no acá.

### `/activos/amortizar`
- [ ] `devengar_sueldos_socios`/equivalente de amortización — correrlo dos
      veces en el mismo período NO debería duplicar la amortización
      (idempotencia, puerta del proyecto).
- **Dato de prueba**: un activo con vida útil corta (para ver varias
  cuotas de amortización sin esperar meses reales) si existe alguno de
  prueba.

---

## Presupuesto

### `/presupuesto`
- [ ] Las líneas de presupuesto por ámbito/año coinciden con lo
      efectivamente gastado en `/gastos` para esas mismas categorías —
      diferencia = ejecutado vs. presupuestado.
- [ ] `crear_ejercicio` — sólo lo puede correr un rol SOLO_ADMIN (hay una
      entrada de coordinacion.md con fecha límite sobre esto, revisar si
      ya se abrió el ejercicio 2027).

---

## Proveedores (`/proveedores`)
- [ ] Alta inline de proveedor desde un gasto/activo aparece reflejada
      acá también, sin duplicar el proveedor si ya existía.

---

## Catálogos — Tarifario (`/catalogos/tarifario`)

**[x] El botón "Crear" (`NuevaOpcion.tsx`) — verificado, no era un bug.**
Se investigó un caso reportado: al crear una opción de pago nueva, el botón
parecía no hacer nada al clickear. Revisado a fondo —`crear()`, el `onClick`,
y la función SQL `crear_plan_tarifa`— sin encontrar ningún camino silencioso.
La función crea la opción, pero **nace vacía a propósito** (documentado en el
comentario del propio componente: "las líneas se cargan después con el editor
que ya existía"). No había nada que ver en la tabla hasta cargarle una línea
con "Editar precios" (fecha + montos) — es el flujo esperado, no un bug.
**Confirmado por Horacio.**

Los dos ítems de abajo son otros, sin relación con lo anterior — siguen sin
probar:

- [ ] `v_plan_tarifa_uso` filtrado por `torneoElegido ?? ''` — si NO hay
      torneo elegido, confirmar que no muestra el uso de otro torneo por
      error (la query con `''` debería dar cero filas, pero vale
      confirmarlo con los ojos).
- [ ] Un plan de tarifa usado por un torneo YA confirmado no debería
      poder borrarse ni editarse en sus líneas base.

---

## Configuración
- [ ] `/configuracion/emisor` — datos fiscales correctos, usados por los
      comprobantes que se emiten (`/comprobantes`).
- [ ] `/configuracion/usuarios` — roles asignados coinciden con lo que
      cada usuario puede hacer en la práctica (`lib/permisos.ts` es la
      fuente; `npm run verificar:permisos` valida que no haya drift —
      correrlo si hay DATABASE_URL disponible).
- [ ] `/configuracion/plantillas` — la plantilla de mail de cobranza usada
      es la que efectivamente sale en un aviso real.
- [ ] `/configuracion/categorias` — una `cat_gasto` con área/naturaleza
      incoherente debería estar bloqueada por `trg_gasto_coherente` al
      guardar un gasto con ella, no sólo acá.

---

## Comprobantes

### `/comprobantes`
- [ ] `v_facturado_direccion_total` — coincide con la suma de comprobantes
      emitidos en el período.
- [ ] Un comprobante con CAE tiene su PDF descargable y su envío
      (mail/WhatsApp) con estado real (enviado/pendiente).

### `/comprobantes/[id]`
- [ ] El comprobante corresponde al cobro/gasto real que lo originó — el
      monto coincide centavo a centavo (achica a `formatMoneyExacto`, no
      `formatMoney`, por la regla de comprobantes con CAE).

---

## Auditoría (incluye el libro diario)

### `/auditoria` (`?vista=diario` es el ex-`/movimientos`)
- [ ] **El diario muestra TODOS los asientos, incluidos los anulados**,
      con el original tachado y un badge — nunca debería faltar un
      contraasiento sin su original al lado ni viceversa (regla 4 del
      proyecto).
- [ ] Cada asiento balancea Debe = Haber, sin excepción.
- [ ] `v_auditoria` — cada cambio de datos sensibles (quién tocó qué)
      queda con usuario y fecha reales.

### `/movimientos/[asientoId]`
- [ ] Anular un asiento (`anular_asiento`) — el original queda marcado
      `anulado_por`, aparece el contraasiento nuevo con fecha propia, y el
      saldo de la caja afectada vuelve a lo que era ANTES del asiento
      original (se compensan solos).
- **Dato de prueba**: anular un pago reciente y seguir el número en
  `/caja` antes y después.

---

## Socios

### `/socios`
- [ ] `v_socio_kpi` — total devengado del período coincide con la suma
      de `/socios/[socioId]` de cada socio.

### `/socios/[socioId]`
- [ ] `devengo_socio` vs `sueldo_socio_mes` — el devengado y lo
      efectivamente pagado son columnas separadas; no deberían mezclarse
      en un solo total sin aclarar cuál es cuál.
- [ ] `devengar_sueldos_socios(periodo)` corrido dos veces no duplica
      (idempotencia).
- [ ] `RegistrarRetiro` — un retiro de socio baja la caja elegida.

---

## Sponsors

### `/sponsors`
- [ ] `v_sponsor_kpi` coincide con la suma de `/sponsors/[sponsorId]` de
      cada sponsor.

### `/sponsors/[sponsorId]`
- [ ] `v_cuotas_sponsor` — igual criterio que las cuotas de equipo: son
      términos de pago, no generan asiento hasta que se cobran.
- [ ] `devengar_sponsors(periodo)` — idempotente, igual que socios.

### `/sponsors/nuevo`
- [ ] Un sponsor recién creado se factura como Consumidor Final (sin
      pedir datos fiscales), igual que un equipo nuevo — confirmar en el
      primer comprobante que le corresponda.

### `/sponsors/[sponsorId]/cobrar`
- [ ] Igual regla que cobrar equipo: `registrar_cobro` en una sola
      transacción (pago + imputación + asiento).

---

## Proyección (cashflow)

### `/proyeccion`
- [ ] La pestaña semanal y la mensual (`v_cashflow` / `v_cashflow_mensual`)
      dan el MISMO saldo proyectado al final del rango, aunque el
      granulado sea distinto.
- [ ] El tramo "real" (pasado) coincide con `/caja` hoy; no debería
      cambiar día a día como si fuera una proyección.
- [ ] La cola "incompleta" (ingresos comprometidos sin gasto presupuestado
      al lado) está marcada visualmente distinta del resto — y
      `ingresosSinGasto` (🔴4) es su medida.

### `/proyeccion/[periodo]`
- [ ] Desglose real/comprometido/estimado de una semana/mes puntual suma
      exactamente el punto que se ve en el gráfico de `/proyeccion`.

---

## Resultados (P&L)

### `/resultados`
- [ ] **Ver punto 🔴4** — el total anual de cada fila/columna de la
      matriz.
- [ ] El resultado del año coincide con Inicio SÓLO si Inicio está
      mostrando el mismo año — son alcances distintos (torneo vs. año),
      confirmar que la pantalla lo aclara y no invita a compararlos
      directo.
- [ ] `CerrarPeriodo` — botón deshabilitado sin período elegido o con un
      aviso de amortización pendiente (línea 141: `!periodoId || !!avisoAmort`).
      Cerrar un período y confirmar que NO se puede reabrir después
      (`trg_periodo_no_reabre`).
- **Dato de prueba**: un mes con gastos e ingresos de al menos tres
  cuentas distintas, para que la matriz tenga textura.

---

## Calendario de pagos

### `/calendario-pagos`
- [ ] `v_calendario_mes`/`v_calendario_dia` — el total de un día coincide
      con la suma de gastos comprometidos de ese día en `/gastos` +
      `gasto_planificado`.
- [ ] El link por día (`hrefBase & dia=...`) lleva al detalle correcto —
      no hay campo nullable involucrado acá, bajo riesgo.
- [ ] Un gasto planificado sin fecha definida no debería "perderse" —
      confirmar que aparece en algún lado (aunque sea "sin fecha"), no que
      desaparece de la cuenta.

---

## Housekeeping (baja prioridad, pero se marcan)

- [ ] `/login` — login con credenciales inválidas da un error claro, no un
      cuelgue; con válidas, redirige a `/` y NO dos veces.
- [ ] `/design` y `/design/mobile` — son la vidriera de componentes, no
      pantallas reales; alcanza con que compilen y se vean sin overlaps.

---

## Al terminar

Si algo de acá aparece roto: anotar la pantalla, el dato exacto que no
cuadra (no "algo está mal en Gastos", sino "el total de julio en /gastos
da $X y sumando las filas visibles da $Y"), y si compiló sin avisar nada
—eso es justamente el patrón que hace que valga la pena este barrido en
vez de confiar en `npm run build`.
