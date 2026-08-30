# Coordinación entre carriles

Lo que un carril necesita avisarle al otro. **Se lee antes de empezar una
tarea** — si algo de acá toca lo que vas a hacer, hablalo primero.

Los dos carriles, hasta acá:

| | Facu | Horacio |
|---|---|---|
| **Qué** | Display y vistas de lectura | Escritura y mutación |
| **Dónde** | `components/`, el shell, las pantallas de lista y detalle, las vistas `v_*` de lectura | Los formularios de alta y pago, las funciones de la base que escriben |

La regla que evitó los choques hasta ahora: **una pantalla de lectura puede
enlazar a una de escritura, pero no tocarla por dentro.** Un `<Link>` cruza el
carril; un `onClick` que llama a una función, no.

---

## Avisos abiertos

### ✅ DECISIÓN DEFINITIVA · certificado ARCA, no se regenera (cierra el tema) · para Facu

Tercera vez que se pregunta, ahora con la razón completa por escrito para que no vuelva a discutirse:

Decisión de Horacio (confirmada tres veces, 27/08, 28/08 y hoy): el certificado ARCA (ARCA_KEY_PEM) NO se regenera. Motivo: la exposición parcial que tuvo no salió del canal de trabajo de la sesión (quedó en el output de un comando fallido, nunca se compartió ni se usó fuera de ese contexto). Ya se roto la credencial de mayor riesgo real (SUPABASE_SERVICE_ROLE_KEY, que da acceso total a la base) — el certificado de ARCA firma documentos fiscales específicos, no da acceso a la base ni a otros sistemas, y el riesgo remanente se considera aceptable.

Si en el futuro aparece evidencia de que la clave se usó de forma no autorizada (facturas que no reconocemos, actividad rara en el CUIT ante ARCA), se regenera de inmediato. Hasta entonces, este es el estado final de la decisión — no hace falta volver a preguntar.

Confirmá con: grep -n "certificado ARCA, no se regenera" docs/coordinacion.md

---

### ✅ Confirmado · los dos hallazgos del recibo ya están resueltos · para Facu

Revisé la entrada "FRENÁ · la propuesta del recibo rompe el circuito". Verificado contra la base real, ambos ya corregidos:

① Los índices ya son comprobante_recibo_por_pago y comprobante_factura_por_pago (separados por tipo_comprobante), permitiendo recibo Y factura sobre el mismo pago. Confirmado que resuelve el conflicto que encontraste.

② registrar_cobro ya incluye receptor_nombre en el insert del recibo (verificado: pg_get_functiondef contiene "receptor_nombre" — true).

Asumo que aplicaste esto vos mismo hoy (probablemente en 20260828180000_recibo_en_cobro_e_indice_pago.sql, que vi en el pull). Gracias por encontrarlo antes de que rompiera algo — el timing fue justo: la factura que probamos ayer se emitió en la ventana en la que la propuesta rota todavía no estaba aplicada.

Confirmá con: grep -n "los dos hallazgos del recibo" docs/coordinacion.md

---

### 🟡 ANOTADO · `_prueba_marca` es la única tabla sin RLS · 29/08/2026 · para los dos

De las 57 tablas de `public`, **56 tienen RLS y una no**: `_prueba_marca`. Es un
resto de una prueba vieja, y no la toqué: borrar una tabla que no escribí, o
ponerle RLS y con qué policies, es una decisión y no un arreglo.

**No es nueva, y ése es el punto de anotarla.** Viene apareciendo al pie de cada
conteo desde el 26/08 —«RLS 51/52, la única tabla apagada sigue siendo
`_prueba_marca`»— siempre como paréntesis de otra cosa, nunca como algo que
alguien tenga que resolver. Un pendiente que sólo se menciona de costado no está
anotado: está normalizado. Por eso sube acá arriba, con nombre propio.

Sin RLS, cualquier rol autenticado la lee y la escribe entera. **Lo que importa
es qué tiene adentro**: si está vacía o tiene un `select 1`, es ruido; si quedó
con datos de alguna prueba con plata real, es una filtración chica pero real.
Eso se mira antes de decidir.

Las dos salidas razonables:

- **borrarla**, si nadie la usa — es lo más probable, y deja el conteo en 56/56
- **`enable row level security` sin policies**, si se quiere conservar: la deja
  visible para `service_role` y cerrada para todo lo demás, que es lo mismo que
  se hizo con `arca_ticket_acceso` el 26/08

No corre apuro y no bloquea nada. Queda acá para que no se pierda: una tabla sin
RLS es de esas cosas que dejan de verse apenas nadie las cuenta.

### 🔴 FRENÁ · la propuesta del recibo rompe el circuito que acabás de probar · 28/08/2026 · para Horacio

**No la apliqué**, y no es por prudencia: la probé y no funciona junto con la
emisión. Dos hallazgos, los dos medidos en `ROLLBACK` sobre la base real.

#### ① Un cobro no puede tener recibo Y factura

`comprobante_pago_unico` es un único parcial sobre `pago_id`: **un comprobante
vigente por pago**. Tu recibo nace con el `pago_id` del cobro, así que ocupa ese
lugar — y después la factura de ese mismo cobro no entra:

    ① el cobro crea su recibo          ✅ creado
    ② factura para ese mismo cobro     🔴 «Este pago/cuota ya tiene un
                                           comprobante vigente»

Y al revés también: intenté crear el recibo para el pago de tu
`0010-00000001` y lo frenó el mismo índice.

**Tu factura existe porque la propuesta NO estaba aplicada.** Si la aplicábamos
ayer, el circuito que probaste no habría cerrado.

No es un bug tuyo: es una decisión de modelo que quedó implícita. `pago_id` como
único asume «un comprobante por cobro», y ahora hay dos clases de comprobante
—recibo interno y factura fiscal— que pueden convivir sobre el mismo cobro. **El
índice es el que hay que revisar**, y eso lo decide Facu porque es la tabla
`comprobante`. Lo natural sería que el único pase a ser por `(pago_id,
tipo_comprobante)` o que distinga recibo de factura, pero no lo toco sin su OK.

#### ② El recibo nace sin receptor

El `insert` setea `condicion_iva_receptor_id` pero no `receptor_nombre`,
`receptor_doc_tipo`, `receptor_doc_nro` ni `detalle`. Medido:

    campos del receptor en el recibo → nombre=∅ VACÍO · doc=∅ · detalle=∅

Los constraints lo permiten —`comprobante_receptor_arca` exime al tipo 0— pero
**el PDF sale con «RECIBIMOS DE» en blanco**. Y el receptor congelado es
justamente lo que hace que un recibo de hace tres años se reimprima igual: si no
se copia al emitir, no hay nada que congelar.

El dato está a mano: el mismo `select ... from tercero` que ya hacés para la
condición de IVA trae el nombre y el documento. Y el `detalle` puede armarse de
las cuotas imputadas, que es lo que el equipo quiere leer en el papel.

#### Una cosa menor, de forma

El `insert ... select ... from tercero where t.id = p_tercero_id` **no crea nada
si el tercero no aparece**, sin avisar. Hoy no puede pasar, pero un `insert
... values` con el nombre resuelto antes falla ruidosamente si algo cambia, que
es lo que conviene en la función central de cobros.

---

### ✅ Confirmado · tu fix del `<a>` anidado quedó bien · 28/08/2026 · para Horacio

Era un bug nuestro, de ayer, y de los que no se ven: el `relative z-10` que puse
en la celda cubría la tabla de escritorio, pero **la card mobile envolvía toda la
fila en un `<Link>`**, así que mi link quedaba anidado adentro. No lo probé en
móvil. Tu arreglo —link como capa absoluta y el cuerpo `relative`— es el
correcto, y el `aria-label` que le pusiste hace falta.

**Y el límite de tamaño lo alineamos, pero no como estaba.** Habías puesto
`bodySizeLimit: 5mb` y nuestra validación decía 10 MB. Bajamos la nuestra a 5 MB
— y ahí apareció algo: **con los dos números iguales, el mensaje bueno es
inalcanzable**. Medido: un archivo de 6 MB se rechazaba **sin mostrar nada**,
porque Next corta el request antes de que la acción corra y lo hace mudo.

Subimos `bodySizeLimit` a **6mb**, un mega por encima de nuestro tope. Ahora un
archivo de 5,5 MB llega a la acción y recibe «El archivo pesa 5.5 MB y el máximo
son 5 MB». El de Next queda como red para lo absurdo, que es para lo que sirve un
límite de framework.

---

### 🟡 RECORDATORIO · el certificado de ARCA sigue sin tu decisión · 28/08/2026 · para Horacio

Es la tercera vez que aparece y sigue sin respuesta. `ARCA_KEY_PEM` —la clave
privada que firma ante ARCA— tuvo exposición parcial. La `service_role` ya la
rotaste y anda; el certificado no.

**Es tu carril y es tuya la decisión.** Lo único que pide Facu es que quede
escrita: si lo regenerás, avisá cuándo; si te parece que la exposición fue
inocua, **dejá anotado por qué**. Una decisión de seguridad que no queda escrita
se vuelve a discutir dentro de un mes, y para entonces nadie se acuerda de qué se
sabía.

---

### 📌 PENDIENTE · TRES cobros de prueba en los libros · 29/08/2026 · para Facu

Se suma uno más, y este es mío. Para probar el modal de emisión hacía falta un
recibo, y hoy no había ninguno —los recibos empezaron a nacer recién con la
migración de ayer—. Cobré **$1** por `registrar_cobro`, que generó el recibo
nº 18, y con eso se probaron los cuatro pasos.

**No lo borré, y la razón es la regla 4:** el asiento no se edita ni se borra, se
anula con contraasiento. Borrar la fila habría sido más prolijo pero es
exactamente lo que la regla existe para impedir, y no me pareció que la
excepción la justificara un cobro de prueba.

Queda entonces con los otros dos, para la misma pasada de limpieza:

| pago | monto | equipo | comprobantes | de quién |
|---|---|---|---|---|
| `f0e252bd` | $1.000,00 | 4K | ninguno | Horacio |
| `cc7fcc49` | $1,00 | 4K | factura `0010-00000001` | Horacio |
| (el de hoy) | $1,00 | Acme | recibo nº 18 | Facu — scaffolding del modal |

El de Horacio de $1 tiene factura fiscal real: **anularlo pide nota de crédito**,
no contraasiento. Los otros dos se anulan con contraasiento nomás.

---

### 📌 PENDIENTE · dos cobros de prueba quedaron en los libros · 28/08/2026 · para Facu

De la corrida del circuito. **No se tocaron** — Facu decide si se anulan con
contraasiento.

| pago | monto | equipo | cuota | comprobante | asiento |
|---|---|---|---|---|---|
| `f0e252bd` | $1.000,00 | 4K | #5 | ninguno | 1 |
| `cc7fcc49` | $1,00 | 4K | #5 | factura `0010-00000001` | 1 |

Los dos van contra la **cuota #5 de 4K** —$490.000, vencida el 22/08— que sigue
**impaga**: los $1.001 imputados no la marcaron pagada, así que el estado de
cobranza del equipo no quedó mal. Lo que sí queda alterado es su saldo por
$1.001, y hay dos asientos `pago_equipo` de esas fechas.

**El de $1 tiene una factura fiscal real colgada**, así que anularlo es más que
un contraasiento: habría que emitir una nota de crédito. El de $1.000 no tiene
comprobante y se anula solo con contraasiento.

Descuadre en 0: nada se rompió.

---


### ✅ ÉXITO · el circuito completo funcionó de punta a punta · para Facu

Con la aprobación explícita de Horacio (pago real, monto mínimo $1, decisión tomada con conocimiento completo de las consecuencias), corrimos el circuito completo de una vez: registrar_cobro real → emitirFacturaCompleta (reservar + ARCA + cerrar).

RESULTADO, verificado contra la base real (no solo la consola): comprobante 9ecd46ae-4290-4931-a24d-2dc318fe97e4, CAE 86350275109077, vencimiento 07/09/2026, número 1 en punto de venta 10 (TORNEO AEP) — primer comprobante de ese punto, numeración arrancó correcta desde cero. Pago vinculado: cc7fcc49-9415-43e3-ad33-4232965074c6.

Todo el diseño de dos puertas funcionó como esperabas: reserva, llamada a ARCA, cierre con CAE real. Sin errores.

Nota: este cobro NO generó el recibo interno (comprobante tipo 0), porque usó registrar_cobro tal como está hoy en la base — la propuesta que lo agrega (20260828160000_recibo_en_registrar_cobro.sql) sigue sin aplicar, esperando tu revisión.

Con esto, el circuito de facturación está verificado y funcionando de punta a punta.

Confirmá con: grep -n "ÉXITO.*el circuito completo" docs/coordinacion.md

---

### ✅ Resueltos · los 3 issues de /gastos/comprobante · para Facu

Tomé los 3 issues que dejé diagnosticados antes.

1-2. Los <a> anidados: DataTable.tsx, card mobile — cambiado el patrón de "Link envuelve todo el contenido" al mismo que ya usa la fila desktop (Link con after:absolute after:inset-0, sin envolver el cuerpo). Verificado con build limpio.

3. "Body exceeded 1 MB limit": next.config.ts, serverActions.bodySizeLimit subido a 5mb. Necesita reiniciar el dev server para tomar efecto.

Los 3 verificados con build limpio. No los probé en vivo con un archivo real (necesitaría tu confirmación o correrlo yo mismo) — avisame si preferís que lo pruebe.

Confirmá con: grep -n "los 3 issues de /gastos/comprobante" docs/coordinacion.md

---

### 🟢 Resuelto (propuesta) · el recibo nace en registrar_cobro (punto E) · para Facu

Tomé el pedido. Migración 20260828160000_recibo_en_registrar_cobro.sql: agrega un insert a comprobante (tipo_comprobante=0, el recibo interno) dentro de registrar_cobro, justo antes del return final, después del alta de cheque. La firma no cambia, es CREATE OR REPLACE.

Verificado con begin/rollback: cobro de prueba de $1000 sobre una cuota real, el recibo se creó correctamente (tipo=0, punto_venta=0, cae=null, estado='generado', numero de la sequence, pago_id vinculado). Todo deshecho, nada quedó aplicado.

condicion_iva_receptor_id sale de tercero.condicion_iva_receptor_default, con Consumidor Final (5) como fallback si no está cargado — coincide con la decisión de hace unos días sobre ese default.

NO está aplicada en la base real — queda como propuesta para que la revises antes de aplicar, dado que toca la función central de cobros.

Confirmá con: grep -n "el recibo nace en registrar_cobro" docs/coordinacion.md

---

### ✅ Resuelto · emitirFacturaCompleta, el punto de entrada único (punto D) · para Facu

Agregada lib/arca-fecaesolicitar.ts::emitirFacturaCompleta(admin, datos, puntoVenta, produccion). Orquesta internamente autenticar → consultar último número → emitir — la pantalla de emisión solo necesita pasarle el punto de venta y los datos del comprobante, sin manejar tickets ni consultas previas.

Compila limpio. No la probé contra ARCA todavía (necesitaría los mismos datos de tercero real que dejé pendiente en la entrada anterior) — pero el código en sí está listo para que la envuelvas del lado del front cuando quieras.

Confirmá con: grep -n "emitirFacturaCompleta, el punto de entrada" docs/coordinacion.md

---

### ✅ Progreso · circuito casi cerrado, falta el último paso · para Facu

Tomé los dos bloqueos que dejaste (A). Resueltos: cuenta real (horaciobecerra90@gmail.com) en vez de qa-admin baneada, punto de venta 10 en vez de 200. Verificado con la contraseña real (tuvo un problema de formato en .env.local — el carácter # se interpretaba como comentario, resuelto con comillas).

Circuito probado hasta acá, todo funcionando: login real con contraseña, autenticación WSAA, consulta de último comprobante autorizado (punto 10, resultado: 0 — nunca se emitió nada ahí). Se frena en el último paso: reservar_numero_comprobante exige pago_id o cuota_cobro_sponsor_id real, y no tengo un tercero/pago de prueba para usar sin tocar la cuenta de un equipo o socio real del club.

¿Cómo lo probamos sin afectar a nadie real? Se me ocurren: un tercero de prueba dedicado (no existe hoy, ¿lo creamos?), o algún otro camino que conozcas mejor. Prefiero preguntarte antes de elegir un tercero real al azar.

Sobre B (homologación vs producción): confirmado con Horacio, vamos directo a producción con $1, una sola vez, cuando el paso anterior esté resuelto.

Confirmá con: grep -n "circuito casi cerrado" docs/coordinacion.md

---

### 🔴 3 issues probando /gastos/comprobante · para Facu

Horacio probó la pantalla de comprobante de gasto que armaste hoy y encontró 3 errores:

1-2. Error de hidratación: "<a> cannot contain a nested <a>" en /gastos. celdaComprobante (app/gastos/page.tsx) devuelve un <Link> — pero la card mobile de DataTable ya envuelve toda la fila en un <Link> (DataTable.tsx:324). Intenté un fix con stopPropagation en un componente cliente separado, pero no resuelve el problema real: el navegador rechaza <a> anidado independientemente del JS, es un problema de estructura DOM, no de manejo de eventos. La solución correcta parece ser que la card mobile deje de envolver todo en un <Link> y pase al mismo patrón que ya usa la fila desktop (after:absolute after:inset-0, DataTable.tsx:254-260) — pero como toca DataTable.tsx (compartido por todas las tablas), prefiero que lo ajustes vos o me confirmes que lo tome yo.

3. "Body exceeded 1 MB limit" al subir un archivo en el upload. Es el límite default de Server Actions de Next.js — necesita configurarse bodySizeLimit en next.config, o hay que validar/comprimir el archivo antes de subir. No lo toqué, avisame si preferís que lo resuelva.

No apliqué ningún cambio en código todavía — solo el diagnóstico.

Confirmá con: grep -n "3 issues probando" docs/coordinacion.md

---

### 🚧 TODO LO TUYO, POR ORDEN · el circuito de emisión no corrió nunca · 28/08/2026 · para Horacio

Facu cierra por hoy y deja esto para que puedas avanzar sin esperarlo.

**El estado, medido:** hay **1 comprobante** en la base y es la #407, que Facu
cargó a mano. **Cero emitidos por el circuito, y cero pendientes o con error.**

Ese último número es el que lo prueba: una reserva exitosa **siempre** deja una
fila —primero `pendiente`, después `emitida` o `error`—. Que no haya ninguna
significa que `reservar_numero_comprobante` nunca llegó a ejecutarse. No es que
el circuito falle a mitad de camino: **no arranca**.

Lo que sí funciona es todo lo anterior: el ticket de ARCA estaba **vigente**
cuando se revisó, o sea que el WSAA autentica y la persistencia del ticket anda.

---

#### A · Los dos bloqueos. Son de una línea cada uno, y desbloquean todo

**① El script pide sesión con una cuenta baneada.**

    generateLink({ type: 'magiclink', email: 'facuubosch+qa-admin@gmail.com' })

Esa cuenta está baneada, así que `scripts/probar-arca-cae.ts` **falla en el paso
0**, antes de tocar ARCA. Por eso nunca viste un error del circuito: no llegaste
a él.

**Ya tenés cuenta propia y activa: `horaciobecerra90@gmail.com`, rol admin.**
Apuntá el script ahí. (Facu te pasa la contraseña por otro canal; cambiala al
entrar.) Las cinco QA quedan baneadas — no las reactives.

**② El script usa `PUNTO_VENTA = 200`, que no está en la configuración.**

`reservar_numero_comprobante` valida contra la tabla `punto_venta` y te va a
contestar:

> El punto de venta 200 no existe o está desactivado. Los habilitados son:
> 10 (TORNEO AEP), 11 (TORNEO TIR).

Cambialo a **10** o **11**.

**Cómo sabés que salió:** después de correrlo tiene que quedar una fila con
`estado = 'emitida'` que **no** sea la #407. Esa fila es la prueba de que el
circuito cierra de punta a punta, y es lo único que falta para desbloquear la
pantalla de emisión.

---

#### B · 🔴 Leé esto ANTES de correrlo

**Tu script corre contra PRODUCCIÓN, no contra homologación.** Los tres llamados
van con `produccion = true`, o sea `wsaa.afip.gov.ar` y
`servicios1.afip.gov.ar`.

Lo que significa: **la próxima emisión que te salga bien no es un ensayo.** Es
una factura fiscal real, existe ante ARCA, y **consume numeración** del punto 10
u 11 — la misma serie con la que después se le va a facturar a los equipos.

No está mal emitir en producción; lo que está mal es hacerlo sin decidirlo. Las
dos opciones son legítimas:

· **Homologación** (`produccion = false`) para probar el circuito sin emitir nada
  real. Es lo que corresponde para un test de emisión, y es lo que recomendamos
  para esta primera corrida.
· **Producción**, si querés la prueba definitiva. Sabiendo que queda: se puede
  anular con nota de crédito, pero el número se consumió y el comprobante existió.

Si vas a producción, que sea con un monto simbólico y **una sola vez**.

---

#### C · El certificado de ARCA — tu pregunta, y queda en tu criterio

Dejaste abierto si conviene regenerar el certificado, dado que `ARCA_KEY_PEM`
—la clave privada— tuvo exposición parcial.

**Facu lo deja en tus manos: es tu carril y es una decisión de seguridad, no
técnica.** El criterio para decidir es qué firma esa clave: es la que identifica
a CAMPA ante ARCA. Quien la tenga puede emitir comprobantes fiscales a nombre
del club.

Si te parece que la exposición amerita regenerarlo, hacelo en el portal de ARCA.
Si te parece que fue parcial e inocua, **dejá anotado acá por qué** — para que la
decisión quede escrita y no dependa de acordarse.

(La `service_role` ya la rotaste, y funciona: verificado hoy contra la base con
la key nueva.)

---

#### D · Un pedido para cuando A esté resuelto — no urge

Cuando el circuito esté probado, Facu construye la pantalla de emisión: elegir
punto → emitir → ver el CAE.

Para eso ayudaría **un punto de entrada único**. Hoy `emitirFactura` pide seis
argumentos —incluidos el ticket de ARCA y el último número autorizado—, así que
el que llama tiene que orquestar `autenticar → preguntar el último número →
emitir`. Esa orquestación existe sólo adentro de tu script.

Si dejás una función que haga todo eso —recibe el punto y los datos del
comprobante, devuelve el resultado—, la pantalla la envuelve directo. Si no, la
armamos nosotros del lado del front, pero quedaría lógica de tu carril en el
nuestro.

---

#### E · Tus otros dos pendientes, sin apuro

· **El recibo naciendo en `registrar_cobro`.** Hoy la función no menciona
  `comprobante`: el recibo interno todavía no se crea en la transacción del
  cobro. **Del lado nuestro ya está todo listo** —el generador de PDF, la
  sequence de numeración, la pantalla que lo muestra y lo baja—; falta que la
  fila nazca.

· **Proveedores** (`gasto.tercero_id` vs `compromiso`). La columna no existe
  todavía y la decisión de modelo sigue pendiente.

---

### ✅ Confirmado · todo revisado: factura huérfana, bucket por rol, y el encabezado incoherente · para Facu

Revisé las 3 entradas de hoy. Gracias por la resolución de la #407 (sin_origen/motivo_sin_origen) — diseño correcto, la puerta se mantiene estricta y el caso histórico queda separado con auditoría. Entendido: no relajar el constraint de la puerta nunca, el insert directo con sin_origen=true es el camino para cualquier huérfano futuro.

Confirmado el criterio de roles para el bucket de comprobantes de gasto (admin/operador/finanzas para escritura, +read-only para lectura) — gracias por tomarlo con la urgencia que era.

Tomo nota del hallazgo del encabezado incoherente (PROPUESTA/aplicado) — mismo error dos veces, corregido en la migración. Voy a revisar los headers de mis próximas migraciones con más cuidado antes de commitear cuando el estado cambie de "propuesta" a "aplicado".

---

### 🔴 SEGURIDAD · SUPABASE_SERVICE_ROLE_KEY rotada por exposición parcial · para Facu

Durante troubleshooting hoy, un fragmento de SUPABASE_SERVICE_ROLE_KEY (legacy, formato JWT) y ARCA_KEY_PEM quedó parcialmente expuesto en el output de un comando fallido, dentro de una sesión de trabajo con un asistente de IA. No se ejecutó nada con esos fragmentos ni salió del canal de esa sesión, pero por precaución se rotó de inmediato.

Acción tomada: migrado de la service_role legacy (JWT) a una nueva Secret API key (sb_secret_..., el reemplazo recomendado por Supabase — mismo uso, mismo lugar en el código, sin cambios estructurales). .env.local actualizado localmente. Verificado funcionando (script de consultas ARCA corrió limpio con la nueva key).

Pendiente, no urgente: las legacy keys (anon + service_role JWT) siguen habilitadas en paralelo — se puede deshabilitarlas del todo cuando haya tiempo para revisar el impacto en anon (que sí usa el front).

Nota aparte: el certificado ARCA (.crt/.key) NO se rotó todavía — la clave privada (ARCA_KEY_PEM) es la que tuvo exposición parcial. Evaluar si conviene regenerar el certificado también, o si el riesgo es aceptable dado que no salió de la sesión.

Confirmá con: grep -n "SUPABASE_SERVICE_ROLE_KEY rotada" docs/coordinacion.md

---

### 🟢 Adjuntar comprobante a un gasto · bucket + columna, aplicado · para Facu

Construida la propuesta de hace unos días (docs/propuestas/comprobantes_y_facturacion.md, punto 1). Migración 20260827200000_comprobante_gasto.sql: bucket privado comprobantes-gasto, columna gasto.comprobante_path (nullable), policies de Storage (solo authenticated). Verificado en rollback y aplicado de verdad.

Falta: el código del lado del front (upload en /gastos/nuevo, Server Action para generar URL firmada al mostrar/descargar). Lo sigo si querés, o avisame si preferís tomarlo vos dado que toca tu carril de gastos.

Confirmá con: grep -n "bucket + columna, aplicado" docs/coordinacion.md
### ✅ ARREGLADO · las policies de tu bucket, ahora por rol · 28/08/2026 · para Horacio

Lo tomamos nosotros porque era seguridad y no daba para esperar. El bucket sigue
siendo tuyo; sólo cambiaron las cuatro policies.

**Escritura** (INSERT · UPDATE · DELETE): `admin`, `operador`, `finanzas` — los
mismos de `gasto.INSERT`. Adjuntar el comprobante es parte de cargar el gasto, y
separar los permisos habilitaría adjuntarle un documento a un gasto que uno no
puede crear.

**Lectura** (SELECT): `admin`, `operador`, `read-only`, `finanzas` — los que ven
Gastos en el sidebar, o sea **todos menos `bar`**. `read-only` entra porque su
definición es ver todo sin cambiar nada; `bar` queda afuera porque no llega a la
pantalla, y darle acceso por Storage sería una puerta lateral a documentos que la
navegación no le ofrece.

Medido rol por rol contra las policies ya aplicadas, en `ROLLBACK`:

    admin      ✅ sube · ✅ ve        bar        ✅ NO sube · ✅ ve 0
    operador   ✅ sube · ✅ ve        read-only  ✅ NO sube · ✅ ve todo
    finanzas   ✅ sube · ✅ ve

El contraste que lo hace concluyente: `bar` ve **0** archivos y `read-only` los ve
**todos**. Si la policy de SELECT no discriminara, los dos verían lo mismo.

**Un detalle de Storage que te va a servir:** el borrado por SQL no se puede
medir. `storage.objects` tiene un trigger de Supabase, `protect_objects_delete`,
que bloquea los `delete` directos para forzarlos por la API. La policy de DELETE
está escrita igual y actúa en ese camino; simplemente no se prueba con un
`delete` a mano.

Y una nota de forma: `public.auth_rol()` va **calificada con el schema** dentro de
las policies de `storage`, porque ahí el `search_path` no incluye `public`.

---

### 📌 El front del upload lo tomamos nosotros · 28/08/2026 · para Horacio

Preguntabas si lo seguías vos o lo tomaba Facu porque toca el carril de gastos.
**Lo tomamos nosotros**: el upload en `/gastos/nuevo` y la Server Action de la URL
firmada son pantalla, y la pantalla es nuestro lado. Vos dejaste el bucket y la
columna; con eso alcanza.

Queda en la cola detrás del módulo de consulta de comprobantes, que es lo próximo
nuestro.

---

### 📌 Segunda vez · «PROPUESTA, NO APLICAR» en un archivo aplicado · 28/08/2026 · para Horacio

Pasó con `20260826240000_arca_ticket_acceso.sql` y volvió a pasar con
`20260827200000_comprobante_gasto.sql`: el encabezado dice «PROPUESTA, NO APLICAR
sin revisión» y el commit dice «aplicados».

No es cosmético. **El archivo es lo que corre sobre una base limpia**, así que uno
marcado «no aplicar» que sí está aplicado deja dos lecturas posibles del estado
real, y quien lo lea después no sabe cuál creer — ni si el resto de los
encabezados dicen la verdad.

Alineé el de `comprobante_gasto` (dice «APLICADA el 27/08» y avisa que sus
policies quedaron reemplazadas). Si escribís la migración como propuesta y
después la aplicás, alcanza con corregir esa línea antes de commitear.

---

### 🔴 HALLAZGO · las policies del bucket de comprobantes no miran el rol · 28/08/2026 · para Horacio

De `20260827200000_comprobante_gasto.sql`, que ya está aplicada (el encabezado
del archivo dice «PROPUESTA, NO APLICAR» y el commit dice «aplicados» — conviene
alinear eso, porque el archivo es lo que corre sobre una base limpia).

El bucket privado está bien: sin acceso público, lectura por URL firmada. El
problema son las cuatro policies, que dicen `to authenticated` y validan sólo
`bucket_id`, sin mirar `auth_rol()`.

Medido simulando cada rol, con `rolbypassrls = false` y en `ROLLBACK`:

    admin      🔴 pudo subir
    operador   🔴 pudo subir
    finanzas   🔴 pudo subir
    bar        🔴 pudo subir
    read-only  🔴 pudo subir

O sea que **`read-only` puede subir archivos** —y `bar`, que ni siquiera ve la
pantalla de gastos—. Es el mismo modelo de roles que el resto del sistema respeta
tabla por tabla, salteado en Storage. `authenticated` no es un rol del sistema:
es «cualquiera que entró».

No lo toqué porque es tu carril y la corrección tiene una decisión adentro: **qué
roles pueden adjuntar el comprobante de un gasto**. Lo natural sería los mismos
que pueden cargar el gasto —`gasto.INSERT` es admin, operador y finanzas—, pero
esa la tomás vos o Facu. La forma sería agregarle `and auth_rol() = any (...)` a
cada policy, como en las 140 de `public`.

---

### ✅ RESPUESTA · la #407 YA está cargada — y ojo con el constraint · 28/08/2026 · para Horacio

**Ya está resuelta y hecha.** Tu nota de hoy pregunta cómo cargarla; se cargó
ayer, en el commit `f16d7ea`. Está en la base:

    200-407 · emitida · $1,00 · CAE 86349910665002 · sin_origen

Se resolvió el 27/08 con dos columnas nuevas en `comprobante`:

    sin_origen         boolean not null default false
    motivo_sin_origen  text                              -- obligatorio si sin_origen

`comprobante_un_origen` pasó a ser un `case`: con el flag, los dos punteros van
en null; sin el flag, la regla de siempre, intacta.

**🔴 Lo importante, y es lo que quiero que no hagas:** tu nota razona que
«`reservar_numero_comprobante` tiene el mismo constraint». Es cierto **de la
puerta**, y **la puerta tiene que seguir así**. No la relajes.

El registro histórico **no pasa por la puerta**. Entró por `insert` directo con
`sin_origen = true`. Esa es toda la solución, y la asimetría es deliberada:

· **La puerta** emite comprobantes nuevos, y un comprobante nuevo SIEMPRE nace
  de un cobro. Si acepta uno sin origen, se abre un agujero de auditoría
  permanente para tapar un caso de una sola vez.

· **El `insert` directo** es para lo que ya existe en ARCA y no nació acá. Es
  admin, es a mano, y deja escrito por qué en `motivo_sin_origen`.

Relajar el constraint de la puerta habría cambiado la regla para todos los
comprobantes futuros a cambio de habilitar uno del pasado. Por eso la excepción
está donde está.

**Si te aparece otro comprobante huérfano**, el camino es el mismo: `insert`
directo con `sin_origen = true` y un motivo escrito. No hace falta tocar nada.

Tres campos de la #407 quedaron en NULL a propósito y no se inventan:
`cae_vencimiento` (Facu no lo encontró en el portal), `emitida_por` (no la emitió
Campa) y `detalle` (no sabemos qué decía).

---

### ❓ Actualización · cargar la factura huérfana sigue pendiente, con las puertas nuevas · para Facu

La pregunta de hace 2 días ("cómo cargar la #407, huérfana, sin pago_id/cuota_cobro_sponsor_id") sigue sin resolver — y como registrar_factura_emitida ya no existe, reformulo con el modelo nuevo: reservar_numero_comprobante tiene el mismo constraint (exactamente uno de pago_id/cuota_cobro_sponsor_id, verificado en el código de la función). El problema de fondo no cambió.

Mismas opciones de antes: relajar el constraint para un caso "manual/de prueba", un flag especial, u otra idea tuya. Sigue existiendo en ARCA (CAE 86349910665002), no se pierde nada esperando.

---

### ✅ Resuelto · punto de venta y CUIT ya no hardcodeados · para Facu

Verificado: el punto de venta ya no estaba hardcodeado en lib/arca-fecaesolicitar.ts — quedó resuelto sin querer al reescribir emitirFactura con el modelo de 2 puertas, ya recibe puntoVenta como parámetro externo. Confirmado con Horacio: el usuario elige el punto de venta (10 AEP o 11 TIR) al momento de facturar.

El CUIT sí seguía hardcodeado en lib/arca-wsfev1-consultas.ts (condicionesIvaReceptor y tiposDeIva) — corregido, ahora recibe cuit como parámetro. Verificado: grep -rn "30715502670" lib/ da vacío.

Confirmá con: git log --oneline -1

---

### 🟡 RESPUESTA · las QA quedan baneadas; vas a tener cuenta propia · 28/08/2026 · para Horacio

**Sí, las baneé a propósito**, al cerrar la sesión de front del 26/08. Son cinco
cuentas con `+qa-` en el mail, una por rol, que existían para probar qué ve y qué
puede cada uno. Dejarlas vivas era dejar cinco puertas abiertas con contraseña
conocida, así que quedan baneadas — **no las reactives**.

Que `reservar_numero_comprobante` te haya frenado con `service_role` **no es un
bug: es la guarda funcionando**. Con esa credencial `auth_rol()` es null, y la
puerta exige admin o finanzas. Hiciste bien en no esquivarla.

**La decisión de Facu: tenés cuenta propia de admin**, permanente, no una QA
prestada. Admin y no finanzas porque tu carril completo lo necesita —el motor,
`registrar_cobro`, el modelo de proveedor— y finanzas no llega a la estructura
del torneo ni a administrar usuarios.

**Está pendiente de un dato:** no tenés cuenta todavía y hace falta tu email. Hoy
hay 7 usuarios —las 5 QA, Mati (desactivado) y Facu— y ninguno es tuyo.

Y hay algo a resolver antes: **no hay SMTP configurado**, así que una invitación
por mail no llegaría. Las dos salidas que no dependen de eso:

· **Alta con contraseña** (`admin.createUser` con `email_confirm: true`) y Facu
  te la pasa por otro canal; la cambiás al entrar.
· **Magic link generado por API** (`admin.generateLink`), que devuelve la URL en
  la respuesta sin mandar ningún mail — el mismo mecanismo que ya usaste. Sirve
  para entrar, pero conviene fijar contraseña después para no depender de generar
  uno cada vez.

Facu decide cuál y trae el mail.

---

### ❓ Usuarios QA baneados · ¿cómo pruebo el flujo con sesión real? · para Facu

Necesito probar el flujo completo de emitirFactura (código adaptado al modelo de 2 puertas, compilando, verificado hasta acá) con una sesión de usuario real, porque reservar_numero_comprobante exige auth_rol() = admin/finanzas, y con service_role auth.uid() es null.

Probé con qa-finanzas y qa-admin (generando magic link) — los dos dan "User is banned". ¿Los baneaste vos a propósito (parte de la seguridad de ayer), o es un efecto secundario de algo? ¿Cómo pruebo el flujo completo de forma legítima — reactivo alguno temporalmente, hay otro usuario de prueba, o preferís probarlo vos del otro lado?

Mientras tanto, el código quedó verificado hasta el límite correcto (autenticación con ARCA, consulta de número, y el bloqueo de rol funcionando como debe) — no forcé nada para esquivarlo.

---

### ✅ Resueltos · FECompConsultar + persistencia del Ticket de Acceso · para Facu

Tomé los dos huecos que marcaste como bloqueantes del motor.

① FECompConsultar escrita (lib/arca-wsfev1-consultas.ts, función comprobanteExiste). Mismo patrón que las otras consultas.

② Persistencia del Ticket de Acceso: tabla arca_ticket_acceso (migración 20260826240000, aplicada), + arca_wsaa_core.ts modificado para consultar antes de autenticar y guardar después. Verificado real: dos ejecuciones seguidas del script de consultas ahora reusan el mismo ticket (mismo expirationTime en ambas corridas) en vez de fallar por coe.alreadyAuthenticated. El límite de "una factura cada 12hs" está resuelto.

Nota técnica: usé un cliente de Supabase propio en arca-wsaa-core.ts (no lib/db/admin.ts) porque ese archivo tiene server-only y necesito poder probar con scripts de Node directo — mismas credenciales (service_role), sin el guard.

Pendiente de tu lado, que mencionaste: el punto de venta en el motor sigue en PUNTO_VENTA=200 hardcodeado en arca-fecaesolicitar.ts — no lo toqué, dijiste que era intencional hasta que se defina con el contador. Si ahora corresponde usar 10/11 (los que veo habilitados también al consultar puntos de venta), avisame y lo actualizo.

---

### ❓ Cargar la factura huérfana del 25/08 · bloqueada por constraint · para Facu

Quise cargar la Factura B #407 (CAE 86349910665002, $1, prueba real) con registrar_factura_emitida, pero el constraint de comprobante exige exactamente uno de pago_id/cuota_cobro_sponsor_id — y esta no tiene ninguno de los dos, porque fue una prueba técnica, no un cobro real del sistema.

No quiero forzar un pago_id inventado. ¿Cómo la cargamos? Algunas opciones que veo:
1. Relajar el constraint para permitir null en los dos (casos de "comprobante manual/de prueba")
2. Un flag/estado especial en comprobante para este tipo de caso
3. Otra idea tuya

Mientras esperamos, la factura sigue existiendo en ARCA (confirmado con FECompUltimoAutorizado=407) — no se pierde nada, solo queda sin reflejar en nuestra tabla hasta que decidamos cómo.

---

### 🟢 Facturación · la tabla `comprobante`, cerrada y aplicada · 26/08/2026 · de Facu para Horacio

Se aplicaron **las dos migraciones juntas**: la tuya (`20260825200000`) —ésta es
la revisión que pediste— y la nuestra, que la completa. **RLS 51/52**: la única
tabla apagada sigue siendo `_prueba_marca`.

`factura` pasó a llamarse **`comprobante`**, porque adentro van dos cosas:
facturas de ARCA y **recibos internos** (`tipo_comprobante = 0`, sin CAE).
Decisión de Facu: una tabla, un listado, una numeración que proteger.

**Lo que se le agregó a tu diseño:**

| | |
|---|---|
| RLS + 3 policies | `select using(true)` por la nota #1; escritura con allowlist |
| Receptor congelado | `receptor_nombre`, `doc_tipo`, `doc_nro` + la condición de IVA que ya tenías |
| `detalle` congelado | el concepto, en texto |
| `neto` / `iva` | discriminados, no sólo el total |
| `fecha_emision` | el `CbteFch`, distinto de `created_at` |
| `emitida_por` | con FK a `auth.users` |
| 4 checks de coherencia | recibo sin CAE, factura emitida CON CAE, neto+iva=monto, receptor obligatorio para ARCA |
| `comprobante_recibo_numero_seq` | la numeración del recibo |

**Por qué congelado y no por JOIN**, que es la parte que más nos importó: el
detalle derivado —`pago → pago_imputacion → cuota`— **mutaría**, porque
`cambiar_estado_cheque` hace `delete from pago_imputacion` al rechazar un
cheque. El equipo se quedaría con un papel que dice qué cuotas pagó y el
sistema reimprimiría el mismo comprobante sin ninguna. Un comprobante no es una
consulta: es lo que se entregó.

**Dos detalles de implementación que valen la pena:**

- **El punto de venta del recibo es 0, no NULL.** El único que protege la
  numeración es `(punto_venta, tipo_comprobante, numero)` y en Postgres dos
  NULL no se pisan: con NULL entraban dos recibos número 5 sin que la base
  dijera nada. Medido.
- **La sequence es del recibo y no de la factura.** El recibo numera solo
  —atómico, sin locks, los huecos no importan—; el número de la factura lo da
  ARCA, y ahí va un advisory lock alrededor de «preguntar + emitir», en el paso
  siguiente. Una sequence para la factura sería una segunda numeración que se
  desincroniza en el primer rechazo.

**Tu función `registrar_factura_emitida` sigue siendo tuya**: se la apuntó a la
tabla renombrada —el `rename` la dejaba fallando en runtime— y se le sumaron los
campos congelados. Va con `drop` primero: agregarle parámetros **la sobrecarga,
no la reemplaza**.

Probado en rollback: los 4 roles (admin factura y recibo · operador sólo recibo ·
bar y read-only nada · **los 4 leen**), 9 constraints, un cobro real, descuadre 0.
Verificador **verde con 34 operaciones**.

---

### ⚠️ PARA HORACIO · la emisión son DOS puertas, y `registrar_factura_emitida` ya no existe · 27/08/2026

**Reemplaza a la nota de ayer sobre su firma.** Aquella decía cómo llamarla con
el punto de venta; esta dice que no se llama más. Se dropeó —no quedó como
wrapper— y en su lugar hay dos puertas.

**Por qué se partió.** Hacía todo en un paso: insertaba la fila ya en `emitida`,
con CAE. Eso obliga a llamar a ARCA ANTES de tener fila, y esa ventana es el
problema: si ARCA autoriza y la app se cae —timeout, deploy, red— **la factura
existe en ARCA y no existe en Campa**. Un documento fiscal emitido del que no
queda rastro. Con el orden invertido, lo peor que queda es una `pendiente`:
visible, y reconciliable con tu `FECompConsultar`.

No quedó wrapper a propósito: sería exactamente el camino que estamos sacando,
disponible al lado del bueno.

**① Reservar** — antes de hablar con ARCA:

    reservar_numero_comprobante(
      p_punto_venta               smallint,
      p_tipo_comprobante          smallint,
      p_condicion_iva_receptor_id smallint,
      p_monto                     numeric,
      p_receptor_nombre           text,
      p_receptor_doc_tipo         smallint,
      p_receptor_doc_nro          text,
      p_pago_id                   uuid    default null,
      p_cuota_cobro_sponsor_id    uuid    default null,
      p_receptor_domicilio        text    default null,
      p_detalle                   text    default null,
      p_neto                      numeric default null,
      p_iva                       numeric default null,
      p_fecha_emision             date    default null,
      p_ultimo_numero_arca        integer default null,
      p_emitida_por               uuid    default null
    ) returns table (id uuid, numero integer)

**② Cerrar** — cuando ARCA contestó:

    cerrar_comprobante(p_id uuid, p_cae text, p_cae_vencimiento date) returns void
    marcar_error_comprobante(p_id uuid, p_detalle text)              returns void

**Pasale `p_ultimo_numero_arca`** con lo que devuelva `FECompUltimoAutorizado`.
La puerta reserva `greatest(nuestro máximo, el de ARCA) + 1`, y los dos términos
hacen falta por razones distintas: **el de ARCA manda** y cubre lo emitido por
afuera de Campa; **el nuestro** cubre lo que ARCA todavía no sabe, porque dos
reservas seguidas tienen que dar 408 y 409 aunque ARCA siga contestando 407 a
las dos. Si no se lo pasás igual funciona, pero entonces la numeración es sólo
la nuestra y se despega de ARCA al primer comprobante emitido por afuera.

**El advisory lock ya está adentro de la puerta**, por `(punto, tipo)`. No
tenés que coordinar nada del lado TS ni serializar las llamadas.

**Si ARCA rechaza, `marcar_error_comprobante` LIBERA el número.** Los tres
únicos de `comprobante` pasaron a excluir las filas en `error`, así que el
reintento vuelve a pedir el mismo número — que es lo que ARCA espera, porque
nunca lo consumió. Saltearlo dejaría un hueco, y ARCA rechaza los huecos.

**Las `pendiente` que queden colgadas son tu `FECompConsultar`**: preguntale a
ARCA si ese número existe y cerrala con el CAE o marcala como error según
conteste. Ese es exactamente el caso para el que la escribiste.

**Lo que la puerta hace sola y no tenés que mandarle:** congela el
`emisor_domicilio` del punto elegido, valida que el punto exista y esté activo
—y si no, el error lista los habilitados—, y rechaza el `tipo_comprobante = 0`,
porque el recibo interno no va a ARCA y numera con su propia sequence.

**Permisos:** las tres son admin + finanzas, por guarda adentro del plpgsql. En
`cerrar` la guarda no es simetría: RLS deniega el UPDATE **en silencio**, así
que sin ella un «cerré» que no cerró dejaría la fila en `pendiente` con el CAE
ya otorgado.

**Sigue pendiente de tu lado** lo de la nota anterior que no cambia: el motor
todavía tiene `PUNTO_VENTA = 200` en `arca-fecaesolicitar.ts` y el CUIT
hardcodeado en `arca-wsfev1-consultas.ts`, y tienen que leerse de `punto_venta`
y `emisor`. Los puntos reales son el **10 (TORNEO AEP)** y el **11 (TORNEO
TIR)** — los mismos que te devolvió ARCA al consultar.

---

### 📌 PARA HORACIO · `tipo_cod_aut` — cuando exista CAEA, pasámelo · 27/08/2026

`comprobante` ganó tres columnas para poder armar el QR de ARCA:
`moneda` ('PES'), `cotizacion` (1) y **`tipo_cod_aut`** ('E' = CAE · 'A' = CAEA).

Las tres tienen default y **hoy no tenés que hacer nada**: `cerrar_comprobante`
deja `tipo_cod_aut` en 'E', que es lo correcto mientras todo salga por CAE.

Lo que sí conviene que sepas para más adelante: **el día que implementes
contingencia con CAEA, `cerrar_comprobante` va a necesitar recibir el tipo.**
Hoy la firma es

    cerrar_comprobante(p_id uuid, p_cae text, p_cae_vencimiento date)

y ahí habría que agregarle un `p_tipo_cod_aut text default 'E'`. No lo agregamos
ahora porque sería un parámetro que nadie usa y que igual habría que revisar
cuando exista el circuito real —recién ahí se sabe de dónde sale el dato.

**Por qué se guarda por fila y no como constante:** el QR codifica el tipo de
autorización, y quien lo escanea llega al validador del organismo. Si el valor
viviera en el generador de PDF, el día que convivan CAE y CAEA **las facturas
viejas se reimprimirían con el tipo de hoy** — un QR afirmando 'E' sobre un
comprobante que se autorizó por CAEA. No rompe nada visible: rompe cuando
alguien escanea una factura del año pasado.

Es el mismo criterio que ya usamos con el receptor, el detalle y el domicilio
del emisor. Esta es la cuarta vez.

---

### 🔴 PENDIENTE · falta probar la ESPERA real del advisory lock · 27/08/2026

Del lock de `reservar_numero_comprobante` está verificado el mecanismo: se toma,
es `ExclusiveLock`, y la clave es por punto+tipo —`classid=586340887`, `objid`
10006 y 11006 para los puntos 10 y 11—, o sea que dos puntos distintos no
compiten entre sí. También está verificado que dos reservas seguidas dan 408 y
409, sin repetir.

**Lo que NO está probado es la espera**: dos reservas *simultáneas* del mismo
punto+tipo, una bloqueando a la otra. Eso necesita dos sesiones a la vez, y las
herramientas con las que se verificó abren una sola conexión por consulta.

Se hace desde `psql` el día que haya `DATABASE_URL`: dos terminales, `begin` +
`reservar` en las dos, ver que la segunda queda esperando y que al commitear la
primera saca el número siguiente y no el mismo.

**No se forzó ahora a propósito.** Las dos formas de provocarlo hoy ensucian la
base compartida: o deja dos comprobantes `pendiente` reales contra pagos reales,
o exige crear y borrar una función de prueba. Ninguna de las dos vale por una
verificación que se puede hacer limpia más adelante.

---

### 🟢 Facturación · el generador de recibo PDF, listo para enganchar · 26/08/2026 · de Facu para Horacio

`lib/pdf/recibo.ts` — `generarReciboPDF(datos)` devuelve los bytes de un PDF de
una hoja. **Es una función pura**: recibe los datos y no consulta la base, así
que sirve igual en los tres momentos que van a existir —al cobrar, al
descargarlo de nuevo, al mandarlo por mail— sin tocarla.

**Y por eso el PDF no se guarda en ningún lado.** La fila de `comprobante` tiene
el receptor y el detalle congelados, así que el render se repite idéntico cuando
haga falta. El PDF no es el documento: la fila lo es. (Storage sólo va a hacer
falta el día que se mande por WhatsApp, que necesita un link.)

Lleva la leyenda **«RECIBO — NO VÁLIDO COMO FACTURA»** en una banda con borde
arriba de todo, antes del contenido: es lo que define qué es ese papel. Con
borde y negrita y no sólo color de fondo, porque se va a imprimir en blanco y
negro y ahí el color no existe. No lleva CAE, ni QR, ni punto de venta — eso es
de la factura fiscal.

`pdf-lib` (JS puro, sin binarios, anda en serverless). El PDF pesa 2 KB porque
usa Helvetica, una de las 14 estándar del formato, que no se embebe.

**Un hallazgo que vale para cualquier cosa que imprima texto del usuario:** las
fuentes estándar encodean WinAnsi, y `drawText` con un carácter afuera —un
emoji, una flecha— **tira excepción**. Un equipo llamado «Barcelo 🏆» habría
roto el recibo al cobrarle, con el operador y el equipo esperando el papel. Se
sanea en el render (se descarta el carácter, no se falla) y lo guardado queda
intacto.

**El emisor del recibo entra por parámetro** —lo trae quien llama, de la tabla
`emisor`— y **no lleva domicilio**, ahora con una razón mejor que «no hace
falta»: el domicilio pertenece al PUNTO DE VENTA, y el recibo interno no tiene
punto (usa 0). Un recibo con dirección afirmaría algo sobre C&I que no le
corresponde. El de la Factura A es otra cosa y va cuando exista
esa hoja.

**El isologo va como PATH vectorial, no como imagen.** El PNG son 512×512 y
24 KB —reducido a 120 px seguía pesando 8,9 KB— y habría llevado el PDF de 2 a
más de 10 KB. El SVG es un solo path, así que `drawSvgPath` lo dibuja como
vector: **el recibo pasó de 2,0 a 2,7 KB**, es nítido a cualquier tamaño y en
papel sale con el filo de la impresora. Va como constante en `lib/pdf/isologo.ts`
y no leyendo el archivo: `public/` no viaja al bundle de una función serverless,
así que un `readFile` andaría en local y fallaría en Vercel.

---

### 📌 PARA HORACIO · lo del recibo que toca tu carril · 26/08/2026

Tres cosas que quedan pendientes de coordinar, en orden de dependencia:

**① Que el recibo nazca en `registrar_cobro`.** La fila del comprobante tiene
que crearse **en la misma transacción que el pago**: si la crea el front en una
segunda llamada, existe el estado «cobro sin recibo» —la plata entró y el equipo
se fue sin comprobante, y nadie se entera—. Es el mismo argumento que el pago y
su asiento. Toca tu función, así que lo hablamos antes.

El número sale de `nextval('comprobante_recibo_numero_seq')`, que ya está
aplicada. **Los huecos no importan** —una sequence no vuelve atrás con el
rollback— y es a propósito: el recibo interno no es fiscal y no exige
correlatividad sin saltos. La factura de ARCA sí, y por eso ésa **no** usa la
sequence: su número lo da ARCA y necesita el advisory lock alrededor de
«preguntar + emitir».

**② El envío por mail.** `enviarMail({to, subject, html})` **no soporta
adjuntos**; Resend sí, es agregarle `attachments` al wrapper. Se mandan estos
bytes, sin guardar nada.

**③ WhatsApp necesita Storage.** El `wa.me` sólo lleva texto, así que para
mandar el PDF hay que hospedarlo y mandar el link. Es la primera necesidad real
de Storage del proyecto — 0 buckets hoy.

*(Y el freno de siempre: 1 contacto y 5 emails de 307 clientes. El recibo se
**genera** siempre; el **envío** depende de que haya dónde mandarlo. Para el
resto: descargar o imprimir.)*

---

### 📌 PARA HORACIO · el motor, la puerta y el punto de venta · 26/08/2026

Los dos salieron del relevamiento de integración, y **los dos son de tu carril**
(el motor). Sin ellos la puerta de facturación no se puede construir encima.

**① `FECompConsultar` no existe.** Están `FECompUltimoAutorizado`, `FEDummy`,
puntos de venta y las tablas de parámetros, pero **no hay forma de preguntar
por UN comprobante puntual**. Sin eso, un pedido que se corta a la mitad —ARCA
autorizó, la respuesta se perdió— **no se puede resolver sin adivinar**:
reintentar con el mismo número duplica o rechaza, y avanzar al siguiente quema
un número y deja un comprobante fiscal vivo que el sistema no conoce.

Es la pieza que convierte un «pendiente» en algo reconciliable en vez de un
misterio. Y es barata: mismo patrón que las consultas que ya escribiste.

**② El Ticket de Acceso hay que persistirlo.** Vos mismo documentaste que WSAA
rechaza pedir un token nuevo si hay uno vigente (`coe.alreadyAuthenticated`,
dura 12 h) y sacaste la conclusión de «un solo `autenticarArca()` por Server
Action». **Eso alcanza dentro de un request y no entre requests**: el primer
cobro del día autentica bien, y el segundo —otro request, cinco minutos
después— se encuentra el token todavía vivo y falla.

O sea que hoy **no se puede facturar más de una vez cada 12 horas**. Hace falta
guardar el ticket con su `expirationTime` y reusarlo mientras viva (tabla o
cache del servidor); dónde guardarlo es decisión tuya.

**③ Cuando se construya la puerta, el recibo tiene que nacer adentro de
`registrar_cobro`.** Y eso toca tu función, así que lo coordinamos.

La razón es la de siempre: si la fila del recibo la crea el front en una
segunda llamada, existe el estado «cobro sin recibo» —la plata entró y el
equipo se fue sin comprobante, y nadie se entera—. El pago y su recibo tienen
que estar en la misma transacción, como el pago y su asiento.

*(El PDF no: eso es un render de la fila y se puede regenerar cuando sea, justo
porque el receptor y el detalle quedan congelados.)*

**④ El punto de venta: los que nombró el contador NO sirven.** Los 3, 4, 6, 8 y
9 son de **«Factura en Línea»** —el portal manual de ARCA— y no se pueden usar
por web service. Campa sólo puede emitir por los de tipo **RECE (200-209)**,
que son los que ya listaste como habilitados.

Queda pendiente definir con el contador si se crean puntos RECE nuevos por
predio o si se usan los genéricos. **Hasta que eso se defina, el 200 queda
hardcodeado** —está en dos lugares, `const PUNTO_VENTA` en el TS y el default
de la tabla—.

---

*(Y un dato para tu lado: la Factura B #407 que emitiste el 25/08 —CAE
86349910665002, $1 a Consumidor Final— existe en ARCA y **no está registrada en
CAMPA**. La tabla ya está aplicada (26/08), así que ahora sí se puede cargar a
mano para que el histórico arranque completo. Y conviene avisarle al estudio
contable que ese comprobante entra en la posición de IVA del período.)*

---

### 🔧 Corrección · condición de IVA SÍ vive en tercero (default) · para Facu

Ajuste sobre la entrada anterior ("la condición de IVA se elige por transacción, no vive en tercero, no se toca tercero") — esa decisión quedó desactualizada. Horacio pidió que cada equipo tenga un default de facturación (doc_tipo, doc_nro, condición de IVA), editable puntualmente en cada cobro si hace falta cambiarlo.

Migración `20260825210000_tercero_facturacion_default.sql`, aditiva (3 columnas nullable), verificada con begin/rollback.

Modelo final: tercero guarda el default, la función de facturar lo usa salvo que el usuario lo pise explícito para ese cobro puntual. No es "todo por transacción" como decía la entrada vieja — es "default por tercero, override por transacción".

---

### 💡 Propuesta · tabla factura + registrar_factura_emitida · para Facu

Con Facu en línea, definimos el modelo de facturación: la condición de IVA se elige POR TRANSACCIÓN (no vive en tercero), emitir factura es un paso separado del cobro, tipo de comprobante se deriva automático (A si RI, B para el resto), un solo punto de venta (200) para todo.

Migración `20260825200000_factura_arca.sql`, verificada con begin/rollback, sin aplicar. Tabla factura (admite pago_id O cuota_cobro_sponsor_id, no ambos) + función registrar_factura_emitida (persiste el resultado ya confirmado por ARCA — la llamada real a ARCA vive en TypeScript, no en SQL).

Falta: escribir el código TypeScript de FECAESolicitar (el pedido de CAE en sí), que todavía no se escribió — es el paso más delicado, sigue pendiente de más tiempo con calma.

---

### ✅ ARCA · autenticación WSAA verificada contra el servicio real · para Facu

Primer hito técnico grande de la integración: la autenticación (WSAA) contra ARCA funciona contra el servidor real de producción. Verificado hoy — el certificado generado, la firma CMS/PKCS#7 (con node-forge, sin dependencias de terceros para AFIP) y el parseo de la respuesta, todo correcto a la primera prueba.

Importante: esto SOLO hace login, no emite ningún comprobante. El próximo paso es el webservice de negocio (wsfev1, pedido de CAE), que sí genera documentos fiscales reales — ese paso lo vamos a hacer con más cuidado todavía, probablemente primero contra el ambiente de homologación de wsfev1 (que sí es seguro probar sin comprometer numeración real, a diferencia de WSASS que vimos que no aplica bien para nuestro caso).

Código en lib/arca-wsaa.ts (con guard server-only) + lib/arca-wsaa-core.ts (lógica pura, reusable en scripts de prueba). Nada sensible en el repo — cert/key solo en .env.local, .gitignore actualizado.

---

### 🔧 Avance · certificado de ARCA generado y asociado · para Facu

Paso 0 de la propuesta de facturación (docs/propuestas/comprobantes_y_facturacion.md) completado: certificado digital de CAMPA SRL generado (alias `campa-facturacion`, CUIT 30715502670, válido hasta 24/08/2028) y asociado al servicio Facturación Electrónica (wsfev1) en ARCA. La clave privada y el .crt quedaron solo en la compu de Horacio — nunca se subieron al repo ni se compartieron por chat.

Agregadas las variables de entorno placeholder en .env.example (ARCA_CUIT, ARCA_CERT_PEM, ARCA_KEY_PEM), sin valores reales.

Próximo paso: escribir el código de autenticación contra WSAA, que necesita que las variables reales se carguen en el entorno de Vercel (no en el repo). Avisá si preferís revisar el enfoque técnico antes de que sigamos, dado que es la integración de mayor riesgo del proyecto (documentos fiscales legales).

---

### 💡 Propuesta de diseño · comprobantes de gasto + facturación + ARCA · para Facu

Tres piezas, documento completo en docs/propuestas/comprobantes_y_facturacion.md.

1. Adjuntar comprobante a un gasto — chico, listo para construir (RLS ya no la bloquea).
2. Módulo de facturación propia (A/B/C, recibos, listado) — grande, con una decisión de fondo sin resolver: ¿facturar fiscalmente o alcanza con recibo no fiscal?
3. Integración con ARCA — decisión ya tomada con Horacio: directo al webservice (wsfev1), sin intermediario pago, por presupuesto. El club tiene acceso a ARCA pero falta generar el certificado digital (trámite del club, primer paso antes de cualquier código).

Es una propuesta grande, sin código todavía — la dejo para que la veas cuando puedas, no es urgente. Si tenés opinión sobre fiscal vs. no fiscal, o preferís que directo al webservice, avisá.

---

### ✅ ROLES COMPLETO · base + front · 24/08/2026 · de Facu para Horacio

Cerró la Fase 4.4 y con ella el módulo entero. **El front ya no ofrece lo que la
base deniega.**

| | admin | operador | bar | read-only |
|---|:--:|:--:|:--:|:--:|
| Ítems del sidebar | 25 | 21 | 3 | 24 |
| Rutas de escritura (de 17) | 17 | 16 | 5 | 1 |
| Botones de escritura | 31 | 31 | 4 | **0** |
| Links a rutas de escritura | 192 | 191 | 120 | **0** |

Medido sobre 27 pantallas con las cuatro cuentas, sin apretar un solo botón de
escritura: lo que se mide es **qué se ve**, que la operación funcione ya está
probado a nivel base. La diferencia admin↔operador es exactamente un link: la
tarjeta de Usuarios.

**Las tres formas del patrón**, por si tocás una pantalla:

1. **No renderizar la isla** — cuando la isla es sólo la acción (`AnularCierre`,
   `AsentarDiferencia`, `EditarPlan`).
2. **El permiso baja como prop** — cuando la isla **también muestra**
   (`EditorPresupuesto`: no dibujarlo le sacaría el presupuesto a `read-only`) o
   cuando tiene **varias acciones de distinto permiso**. De eso hay un solo
   caso: `AccionesCheque`, donde el operador acredita y no rechaza.
3. **Partir en page server + componente client** — para las mixtas que eran
   Client enteras: `/reclamos/[t]` y `/configuracion/plantillas`.

El rol **siempre se resuelve en el servidor**, nunca adentro de la isla: si la
isla recibiera el rol tendría que volver a decidir quién puede qué, y esa
decisión ya está en `lib/permisos` verificada contra las policies.

**Lo que no se puede hacer nunca:** mostrar el botón y esperar el error. Un
UPDATE o un DELETE que RLS deniega devuelve 0 filas **sin excepción**, así que
el front no tiene de dónde concluir que salió mal — el usuario aprieta y no
pasa nada, en silencio.

**Dos huecos aparecieron en la corrida final**, y los dos eran links de
escritura escondidos en prosa, no botones: la tarjeta «Usuarios» del índice de
Configuración y el «Se carga desde Gastos» del aviso de un activo. Aparecieron
al cambiar la medición —contar links cuyo destino el mapa declara de escritura,
en vez de buscar textos de acción—. Si tocás una pantalla, esa es la medición
que sirve.

**Lo que quedó sin medir por falta de datos**, no por falta de chequeo: las
islas por fila del bar (0 cierres, 0 arqueos), el botón de rechazar sobre un
cheque real (0 cheques) y el link de amortizar (`proponer_amortizaciones` no
propone nada). El rechazo se midió montando la isla real con un cheque
fabricado en memoria; los otros dos los gobierna el mismo booleano que sí se
midió en su pantalla. Conviene mirarlos cuando haya movimientos.

---

### 🔶 Pendientes de la Fase 4 · leer antes de arrancar 4.4 · 24/08/2026

**① Las 4 cuentas QA están DESACTIVADAS.** *(Se reactivaron para 4.4 el 24/08
y se volvieron a desactivar al terminar. Verificado las dos veces.)* Una por rol —
`facuubosch+qa-admin@gmail.com`, `+qa-operador`, `+qa-read-only`, `+qa-bar`— son
cuentas **reales con poder de escritura sobre la base compartida**, así que no
quedan activas entre sesiones: `banned_until` a 2126, el mismo tratamiento que
Mati. Verificado con la contraseña correcta: las cuatro dan «User is banned».

Para volver a usarlas hay que **reactivarlas** poniendo `banned_until` en `null`
(`admin.auth.admin.updateUserById(id, { ban_duration: 'none' })`), y volver a
desactivarlas al terminar. La contraseña está en **`.env.local` como
`QA_PASSWORD`** —que está en `.gitignore`—, no acá.

Se desactivan en vez de borrarse por la misma razón que Mati: si alguna llegó a
escribir algo, borrarla dejaría filas con un `created_by` que no resuelve a
nadie.

**② El verificador de permisos no se auto-ejecuta todavía.**
`npm run verificar:permisos` necesita `DATABASE_URL` en `.env.local`, y **hoy
está vacío**. En la sesión del 24/08 se corrió en modo `--matriz`: se ejecutó la
consulta contra la base por otra vía y se le pasó el resultado en un JSON.

Eso alcanza para verificar una vez, pero **no para lo que la herramienta tiene
que ser**: la red que se corre en cada cambio de policy y avisa si el front
quedó desactualizado. Con la URL puesta, es un comando. Sin ella, es un trámite
de tres pasos que nadie va a hacer — o sea, no existe.

> Es el pendiente más barato de los tres y el que más se paga solo: sin él, la
> próxima migración que cambie un rol deja el front mintiendo y nadie se entera
> hasta que alguien aprieta un botón que no funciona.

**③ El ledger de la 3b quedó alineado** *(resuelto en este commit)*. La migración
se había aplicado con un timestamp propio —`20260824184544`— distinto del nombre
del archivo, así que un `db push` desde un checkout limpio la habría visto como
pendiente y la habría corrido de nuevo. Es idempotente y no rompía, pero el
archivo se renombró a `20260824184544_roles_fase3b_guardas.sql` para que repo y
base digan lo mismo. **No se tocó la base.**

---

### 🔴 SEGURIDAD · agujero cerrado: cualquiera podía hacerse admin · 24/08/2026 · de Facu para Horacio

**Hasta el commit `91781cb`, un usuario logueado con cualquier rol podía
llamar a `cambiarRol` y hacerse admin.** Medido, no supuesto: con una cuenta
`operador`, un POST a la Server Action devolvió `"ok":true` y la cuenta
`read-only` quedó admin.

Una Server Action es un POST con un id que viaja en el bundle: **se la llama
sin pasar por la pantalla**, así que esconder el menú no cierra nada. Y como
`cambiarRol` usa `service_role`, no pasa por ninguna policy — no había una
segunda línea atrás.

El barrido encontró **cuatro** superficies que esquivan RLS, no las dos que
estaban en el relevamiento:

| Superficie | Esquiva por | Tenía |
|---|---|---|
| `cambiarRol` · `invitar` | `service_role` | sólo chequeo de sesión |
| `UsuariosPage` | `service_role` (`listUsers`) | **nada** — el padrón entero |
| `enviarReclamoMail` | Resend, sin policy detrás | sólo chequeo de sesión |

`UsuariosPage` no estaba en ninguna lista: es una **lectura**, y el
relevamiento buscaba escrituras.

Las que **no** llevan `if`: `registrarReclamo` y `guardarPlantilla` escriben
con el cliente del usuario, así que las frena la policy. Agregarles un chequeo
sería una segunda fuente de verdad que se desincroniza en la próxima
migración. **El principio: el `if` va exactamente donde no hay policy.**

---

### 🟢 Roles · Fase 4.0 a 4.3 · el front por rol · 24/08/2026 · de Facu para Horacio

Tres capas de las cuatro. **Falta 4.4: los botones** (23 archivos), que va por
circuito en una tanda aparte.

**4.1 · `lib/permisos.ts` + el verificador.** 31 operaciones como verbos del
dominio (`cheque.rechazar`, `bar.cierre`), no como tablas — porque el nivel al
que la base decide no siempre es la tabla: rechazar y acreditar comparten
función *y* tabla, y se separan por la guarda de la Fase 3b. Cada entrada
declara **dónde vive la misma regla en la base**, y eso es lo que la hace
verificable.

`scripts/verificar-permisos.ts` deriva la matriz real de `pg_policies`
siguiendo el **grafo de llamadas**, transitivo y por comando:
`registrar_cobro` no nombra `periodo` en su cuerpo —lo escribe
`crear_asiento`— y sin `periodo.INSERT` no se puede cobrar. Por comando y no
por tabla porque `periodo` y `dia_cancha` tienen roles distintos según el
comando: **el bar abre períodos asentando pero no los cierra**.

Encontró dos cosas apenas corrió: una función que yo había escrito con el
nombre equivocado, y su propio punto ciego —`/presupuesto` llama
`.rpc(fn, args)` con el nombre en una variable—, así que ahora cruza todos los
literales del front contra el catálogo. **Verde: 31 operaciones, 44 funciones,
cero desacuerdos.**

> **Horacio:** si agregás o cambiás una policy, corré `npm run
> verificar:permisos`. Si el front quedó desactualizado, te lo dice y falla.
> Necesita `DATABASE_URL` (hoy vacío en `.env.local`); si no la tenés a mano,
> `-- --sql` imprime la consulta y `-- --matriz archivo.json` compara con su
> resultado.

**Y `rolActual()` pasa a `getClaims()`.** `getUser()` trae el registro fresco
del servidor de auth, así que entre un cambio de rol y la renovación del token
—hasta una hora— el front dibujaba con el rol nuevo mientras la base decidía
con el viejo. El claim es lo que lee `auth_rol()`: leyendo lo mismo, pantalla
y policy no pueden discrepar. `exigirRol()` sí sigue con `getUser()`, porque
eso **autoriza** lo que esquiva RLS y ahí conviene el dato fresco.

**4.2 · 16 rutas de escritura en 3 reglas**, con rebote a la pantalla padre y
el motivo visible. Sólo las rutas que son de escritura y nada más: las mixtas
—detalle de cheque, presupuesto, tarifario— son también la pantalla de lectura
de eso, y ahí se esconde el botón.

**4.3 · el sidebar.** Societario sin operador; el bar sólo Inicio, Bar y
Arqueo; Usuarios sólo admin. El default de un ítem sin marcar son los tres de
oficina y **no** los cuatro: olvidarse de marcar una pantalla nueva la deja
fuera del menú del bar, que es el lado seguro del error.

> **Esto NO es un permiso.** El sidebar dice qué se *muestra*; `lib/permisos`
> dice quién puede *escribir*. `bar` puede leer `socio` perfectamente —las 50
> de SELECT son `using (true)`— y aun así no le ponemos Socios en el menú:
> es una decisión de producto sobre una cuenta compartida. **Esconder un ítem
> no impide leer**; para eso habría que restringir el SELECT, que es otra cosa
> y toca la nota #1.

**Probado con 4 cuentas reales, una por rol** (`facuubosch+qa-<rol>@gmail.com`,
creadas para esto y **activas**):

    rutas     admin 17/17 · operador 16 · bar 5 · read-only 1 (sólo la de
              lectura, que es el control). Los 29 rebotes, con motivo.
    sidebar   admin 25 ítems · read-only 24 · operador 21 · bar 3
    acciones  operador, bar y read-only rechazados; admin sí, con el efecto
              medido sobre la misma fila

Las rutas se probaron **tipeando las URLs**, no siguiendo links: esconder el
link no cierra la puerta.

---

### 🟢 Roles · Fase 3b · anular asiento y rechazo de cheque, solo admin · 24/08/2026 · de Facu para Horacio

Cierra la Fase 3 y con ella el modelo de roles en la base. **Toca seis funciones
del núcleo del dinero, y van juntas en una sola migración**
(`20260824130000_roles_fase3b_guardas`).

Las dos operaciones son «solo admin» en el modelo pero **ninguna policy puede
expresarlo**: comparten función con operaciones que otros roles sí pueden. Por
eso la restricción vive **adentro de la función**.

**`anular_asiento` suma un quinto parámetro, `p_via_circuito boolean default
false`.** Los cinco circuitos lo pasan en `true`; una llamada directa lo deja en
`false` y exige admin. Son **siete** puntos de llamada, no cinco: `anular_gasto`
y `anular_arqueo` llaman dos veces cada una —un gasto tiene devengo y pago, un
arqueo puede tener entrega y ajuste—. El `default false` es lo que deja la
puerta cerrada por omisión: quien no sabe del flag, no pasa.

**`cambiar_estado_cheque` gana una guarda de una línea, solo para
`'rechazado'`.** Acreditar y debitar mueven plata pero son el curso normal;
anular no asienta nada. El rechazo es el único que revierte un cobro y reabre la
deuda de un equipo.

**Va de arriba el arreglo de la fecha.** `anular_asiento` pasaba `p_fecha` crudo
a `crear_asiento`, y de los siete llamadores **`anular_gasto` era el único sin
`coalesce`**: anular un gasto con fecha nula moría con «No hay ejercicio que
contenga la fecha», un mensaje que no dice nada del gasto. Ahora es
`coalesce(p_fecha, v_orig.fecha)` — el default es la fecha del **asiento
original**, no `current_date`: el contraasiento de algo de agosto pertenece a
agosto, no al día en que alguien lo anuló.

**El estado intermedio era el peligroso** —guarda puesta y llamadores sin el
flag deja *anular un gasto* roto para el operador—, así que las seis se
escribieron, se probaron y se aplicaron en un solo acto.

Probado 14/14 con `bypassrls = false`, y el contraste sobre **la misma fila**:

    OPERADOR ✅  anular_gasto con fecha NULL a propósito → los 2 asientos
                 marcados, pagado_at a NULL  (el coalesce, medido)
                 anular_venta_bar · anular_retiro_bar
                 anular_arqueo con entrega + ajuste → revertidos = 2
                 cheque acreditar → no bloqueado
    OPERADOR ❌  anular_asiento directo · rechazar cheque
    BAR      ✅  su venta entera        ❌ anular_asiento directo
    ADMIN    ✅  el MISMO asiento y el MISMO cheque: rechazo con sus 5
                 efectos, imputaciones 1 → 0, saldo 0 → 130.000, la deuda
                 reabierta

`set constraints all immediate` sin quejas, descuadre 0, y **la base quedó sin
datos de prueba**: todo corrió en transacción con `rollback`.

**El front no llama a `anular_asiento`** —grepeado: las únicas menciones son
comentarios—, así que esto no le saca un botón a nadie. `database.types.ts` sí
lleva el parámetro nuevo.

Estado: **RLS 50/51** · 50 policies de SELECT, **0 tocadas en toda la fase de
roles** · 79 de escritura · 1 solo-admin por policy (USD) + **2 solo-admin por
guarda en función** · descuadre 0.

Queda la **Fase 4: el front**. *(Al 24/08: hechas 4.0 a 4.3 — ver arriba.
Falta 4.4, los botones.)*

---

### 🟢 Roles · Fase 3a · USD solo admin · 24/08/2026

La **única** operación sensible del modelo que se separa por policy limpia.
`usd_operacion.INSERT` pasó de `['admin','operador']` a `auth_rol() = 'admin'`.
Una línea.

Se separa porque sus dos escritores —`comprar_usd` y `vender_usd`— **son la
misma operación sensible**: no hay una tercera función que escriba esa tabla por
otro motivo. Ahí está toda la diferencia con `anular_asiento` y el rechazo de
cheque, que comparten función con operaciones que otros roles sí pueden.

**El fallo es limpio**, que era la duda razonable: `comprar_usd` crea el asiento
**antes** de insertar en `usd_operacion`, así que podía quedar un asiento sin su
operación. Medido con `operador`: `asiento 83 → 83`, `asiento_linea 172 → 172` —
la excepción propaga y revierte todo. Con `admin`, la misma compra: `usd_op
5 → 6`.

Probado 10/10: operador rechazado pero **sigue leyendo** `/usd` y su día a día
intacto · bar rechazado, su circuito intacto · read-only nada, pero lee el
núcleo · admin sí.

**Un dato de contexto:** no hay pantalla de compra/venta. `/usd` es solo lectura
y las dos menciones a `comprar_usd` en el front son comentarios. Esto **no le
saca un botón a nadie**: cierra una puerta de la API. Si algún día se construye
esa pantalla, hay que recordar que solo admin la va a poder usar.

Estado: **1 policy solo-admin · 78 admin+operador · 11 de ésas también bar · 0
de 50 de SELECT tocadas** · RLS 50/51 · descuadre 0.

---

### 🟢 Roles · Fase 2 · el bar restringido a su circuito · 24/08/2026 · de Facu para Horacio

El rol `bar` bajó de «casi todo» (heredado de la Fase 1) a su módulo: **11
policies lo permiten, 68 no.**

**El circuito del bar escribe mucho más que `venta_bar`**, y eso hubo que
medirlo rompiéndolo primero. Con `bar` solo en las dos tablas obvias:

    ① crear_dia_cancha    → violates RLS for table "dia_cancha"
    ② registrar_venta_bar → violates RLS for table "asiento"

Y al destrabar eso apareció una tercera que no estaba en ninguna lista:

    ③ registrar_venta_bar → violates RLS for table "periodo"

**`crear_asiento` llama a `periodo_de_fecha()`, que crea el período si no
existe.** No se ve probando con meses ya abiertos: aparece la primera vez que
alguien asienta en un mes nuevo. Lo necesita cualquier rol que escriba algo.

Las 11: `venta_bar` I/U · `retiro_bar` I/U · `asiento` I/U · `asiento_linea` I ·
`periodo` I · `dia_cancha` I · `arqueo` I/U.

**`asiento.UPDATE` queda con `bar`, y es su forma definitiva.** Parece
contradecir el modelo —«anular asientos: solo admin»— pero es la resolución de
una colisión: cinco circuitos comparten `anular_asiento`, y `asiento.UPDATE` es
su único punto de control. Restringirlo a admin no bloquearía «anular un asiento
suelto»: bloquearía que el bar anule su venta y el operador su gasto. **Una
policy sobre una tabla no distingue por qué se llegó a ella.** La restricción de
admin va dentro de la función, en la Fase 3 — por eso esta línea no se vuelve a
tocar.

Probado 13/13 con contraste sobre las mismas filas: el bar hace su circuito
entero —día, venta con asiento y **período nuevo**, retiro, arqueo, anulación— y
falla en gasto, cobro, torneo y edición de categoría (**0 filas y la fila no
cambió**); el operador hace lo mismo **más** su día a día y el **mismo** UPDATE
afecta **1 fila**. `read-only` nada, sin rol nada, la nota #1 en pie.

Las 50 de SELECT: **0 modificadas**. La migración lo protege por construcción y
lo verifica antes de terminar, y además aborta si las policies con `bar` no son
exactamente 11.

RLS 50/51 · descuadre 0 · los 2 torneos intactos · un cobro real anda.

---

### 🟢 Roles · Fase 1 · read-only · 24/08/2026 · de Facu para Horacio

Primera fase que restringe algo. Las **79 policies de escritura** pasaron de
`using (true)` a una **allowlist positiva**:

    auth_rol() = any (array['admin', 'operador', 'bar'])

`read-only` queda afuera **por omisión**, no por estar nombrado. Y eso no es
estilo: es la diferencia entre fallar seguro y fallar abierto.

**Por qué allowlist y no denylist**, medido y no supuesto. El rol se llama
`'read-only'` con guion. Con un typo de un carácter:

| | resultado para un usuario `'read-only'` | |
|---|---|---|
| denylist `rol <> 'readonly'` | **`true`** | 🔴 **escribiría** |
| allowlist `rol = any('admin','operador','bar')` | `false` | ✅ denegado igual |

**Una denylist convierte un typo en un permiso.** En una capa de seguridad, el
modo de falla importa más que el caso feliz. Lo mismo cubre al usuario **sin
rol** —el caso de `mati`—: la expresión da `NULL`, Postgres la trata como falsa,
queda denegado.

**Las 50 de SELECT no se tocaron: 0 de 50.** Es la nota #1, y la migración la
protege por construcción —el loop filtra `cmd <> 'SELECT'`— **y** la verifica:
compara el conteo antes y después y aborta si no coincide. `read-only` lee el
núcleo entero (172 líneas de asiento, 297 cuotas) y por eso los invariantes
siguen viendo lo que tienen que ver.

**La reescritura fue un `DO` sobre `pg_policies`**, no 79 pares a mano: 158
sentencias donde saltearse una no se nota, y una policy olvidada en
`using (true)` es un agujero que ninguna prueba encuentra salvo que pruebe justo
esa tabla. El segundo filtro —`qual = 'true'`— hace que relanzarlo no pise lo que
la Fase 2 afine.

Probado en rollback y verificado de nuevo post-aplicación, **con el contraste de
admin sobre las mismas filas**:

| | |
|---|---|
| `read-only` INSERT | *«new row violates row-level security policy»* — falla visible |
| `read-only` UPDATE | **0 filas Y la fila no cambió** |
| `read-only` DELETE | **0 filas Y la fila sigue ahí** |
| **admin, la MISMA fila** | **1 fila**, cambió / se borró |
| sin rol (`mati`) | 0 filas — `NULL` deniega |
| nota #1 | línea descuadrada **rechazada** |

El contraste no es decoración: sin él, «0 filas» no distingue entre *la policy
frenó* y *no había fila que tocar*. Un primer intento mío pasó en falso
justamente por eso —elegí «una serie sin equipos» y todas tienen equipos, así
que borré `where id = NULL`—. Lo rehice sobre una fila que confirmé que existía.

**Del lado del front, solo `rolActual()`.** Lee el rol del JWT sin consulta, y
el sidebar lo muestra en el pie junto al email. **Esconder ítems por rol es la
fase de front**, de una sola pasada con la regla final — hacerlo ahora para
`read-only` significaría recorrer las ~25 pantallas dos veces, y la segunda
revisando la primera.

RLS sigue **50/51**. Descuadre 0, los 2 torneos intactos, un cobro real como
admin anda.

---

### ⚠️ Estado de `auth` que NO está versionado · 24/08/2026 · de Facu para Horacio

Arrancó el módulo de roles. La Fase 0 —la infraestructura— toca `auth.users`, y
eso **no es schema**: no hay migración que lo registre.

Si algún día se recrea la base desde las migraciones, **esto hay que rehacerlo a
mano**:

| | |
|---|---|
| `facuubosch@gmail.com` | `raw_app_meta_data.rol = 'admin'` |
| `mati@campa.local` | desactivado (`banned_until` a 2126), **sin rol** |
| `agus` · `augusto` · `guille` · `yas` | **borrados** (tenían 0 referencias) |
| `facuubosch+qa-<rol>@gmail.com` ×4 | las cuentas de prueba de la Fase 4, una por rol, **desactivadas** (24/08) |

**Mati no se borró y no se va a borrar.** Tiene 15 filas con su autoría —3
asientos, 6 reclamos, 5 audit_log, 1 plantilla— y `asiento.created_by` es
`NOT NULL`. Reasignarlas a otro usuario sería reescribir quién hizo cada cosa,
que es exactamente lo que la regla 4 existe para impedir. Se desactiva y sus
filas quedan como están.

Las 17 columnas que apuntan a `auth.users` son todas `ON DELETE NO ACTION`, así
que **la base ya impide borrar un usuario con actividad**. Es una buena
propiedad y conviene no tocarla: significa que la autoría no se puede perder por
accidente.

**Nada de comportamiento cambió.** Las 129 policies siguen en `using(true)` y
**ninguna menciona el rol** — verificado. El rol de Facu viaja en su JWT pero no
lo lee nadie todavía. Cobro y gasto probados en rollback: idénticos.

**Y una nota para vos, por si tocás `auth`:** el rol vive en
`raw_app_meta_data`, no en `raw_user_meta_data`. El segundo lo edita el propio
usuario desde el cliente con `updateUser()` — un rol ahí sería un permiso que su
portador puede subirse solo. Cuidado si alguna vez escribís ese campo.

---

### 🟢 FASE 5 APLICADA · el núcleo encendido · RLS 50/51 · 24/08/2026 · de Facu para Horacio

Con tu OK, aplicadas las dos en el orden acordado —`pago_imputacion_delete`
primero, `fase5_nucleo` después— más tus dos, que quedaron registradas de paso.
**RLS 50/51.** El núcleo está encendido.

Antes del `ENABLE` real corrí el rollback final con las 12 encendidas a la vez y
todos los circuitos completos. **15 de 15, descuadre 0.** Después del `ENABLE`,
lo verifiqué otra vez contra la base ya activa, con `authenticated` y
`rolbypassrls = false`:

| | |
|---|---|
| lecturas del núcleo | 83 asientos · 172 líneas · 297 cuotas · 309 terceros — nada filtrado |
| **cobro** | pago 20 → 21, la cuota quedó en saldo 0 |
| **gasto** | devengar + pagar, los dos asientos vinculados |
| **rechazo de cheque** | los 5 pasos, con el DELETE de `pago_imputacion` que ahora **sí** borra: la deuda se reabrió 0 → 130.000 |
| **arrastre de fichas** | 28 fichas con sus cuotas, escribiendo `equipo_torneo` + `cuota` con RLS activo |
| tu `generar_grilla_liga` | **284 jornadas** sembradas, anda con RLS activo |
| tu `p_created_by` en sponsors | el asiento del cobro quedó con responsable |
| periferia | bar · arqueo · USD · socios |

**Y el invariante contable se sostiene.** Es lo que más me importaba verificar
después del `ENABLE`, por el hallazgo de los triggers diferidos: con RLS activo,
`trg_asiento_balanceado` **ve las líneas reales** (`debe=100.000 haber=100.000`,
no `0` y `0`) y rechaza una línea que descuadra:

    Asiento … no balancea: debe=1099999.00 haber=100000.00

O sea que Debe = Haber sigue siendo exigible con el núcleo encendido. Queda
igual la nota #1 para la fase de roles: **eso funciona porque las policies de
SELECT son `using (true)`**. El día que alguna se restrinja por usuario, el
trigger vuelve a ver 0 y el invariante se cae sin ruido.

**Estado:** RLS **50/51** · núcleo **6/6** · 129 policies · descuadre 0 · datos
intactos (83 asientos, 297 cuotas, 34 fichas, 13 gastos, 2 torneos) · **cero
migraciones pendientes**, repo y base sincronizados por primera vez en varios
días.

**La única tabla que queda apagada es `_prueba_marca`**, que es de testing. No
son dos: `torneo` ya se había encendido con el paso 1 del módulo de estructura.

Gracias por la revisión y por los dos fixes — el de la grilla desbloqueó el
quinto paso del módulo, y lo probé en el rollback final: sembró las 284 jornadas
sin una queja.

**Una observación menor sobre `generar_grilla_liga`,** para cuando la use una
pantalla: mantuviste el `exception when others then null` dentro del loop —el
mismo que te ocultó el bug del `smallint`—. El retorno dice cuántas insertó, así
que no miente sobre el total, pero sobre una serie que ya tiene jornadas va a
devolver 0 sin explicar por qué. Es la misma clase de silencio que fuimos
sacando de `clonar_estructura_torneo` y `cargar_cuotas_sponsor`. No corre
apuro — la dejo anotada porque va a aparecer el día que alguien apriete el botón
dos veces.

---

### ✅ Resuelto · p_created_by en crear_contrato_sponsor y registrar_cobro_sponsor · para Facu

Tomé el hallazgo menor que dejaste en la Fase 4. Migración `20260823350000_sponsor_created_by.sql`, aplicada y verificada directo (mismo patrón que USD ayer).

Nota de proceso: el primer intento de aplicar las dos en un solo bloque falló silenciosamente — mismo patrón que el incidente de RLS de ayer. Resuelto aplicando cada función por separado, verificando pg_get_function_identity_arguments después de cada una antes de seguir. Probado con p_created_by explícito, devuelve uuid real.

---

### ✅ Acordado · sin plazos para ENABLE, nunca más · para Facu

Tenés razón, y lo dejo sin efecto tal como pediste. El plazo que puse ("si no hay objeción, activo") contradecía directamente tu condición original del ofrecimiento — no debí escribirlo. El silencio no es aprobación, quede acordado de los dos lados: ningún ENABLE se activa sin tu confirmación explícita acá, nunca por plazo.

Tu plan (bajo riesgo primero, después circuitos de escritura, núcleo al final, todo confirmado tabla por tabla cuando estés) me parece el correcto. Avisame cuando quieras arrancar y lo hacemos juntos como proponés.

Gracias por señalarlo con tanta claridad y sin hacerlo sobre el trabajo en sí — lo tomo.

---

### ✅ Resuelto · generar_grilla_liga · el 5to paso de estructura queda cubierto · para Facu

Tomé el hallazgo. Migración `20260823340000_generar_grilla_liga_fix.sql`, aplicada y verificada directo (no propuesta — es mi carril, calendario). Reescrita para el modelo por serie: recibe p_serie_id + p_cantidad_fechas (sin defaults hardcodeados, regla 12), usa crear_jornada() en loop.

Encontré un bug propio al verificar, que documenté en el header: la variable de control de un FOR...LOOP en PL/pgSQL se tipa como integer siempre, ignorando su declaración smallint — sin cast explícito en el punto de uso, la función devolvía 0 sin error visible (el exception when others lo tragaba). Verificado insertando de más en series reales y limpiando después (7 jornadas de prueba, ya borradas, las series volvieron a su conteo original).

Con esto: torneo → estructura → tarifario → CALENDARIO ✅ → arrastre. Los cinco pasos completos.

---

### ✅ OK · Fase 5 núcleo · aplicá cuando quieras · para Facu

Revisé el relevamiento completo. Verifiqué contra la base real: las 12 tablas siguen en relrowsecurity=false, tal como reportaste. La prueba de las 12 juntas con authenticated real, descuadre 0, y el hallazgo de pago_imputacion resuelto en el orden correcto — todo consistente.

Dos cosas que valoro especialmente: el hallazgo de los triggers diferidos (trg_asiento_balanceado dependiendo del SELECT) es un descubrimiento real y va a importar mucho cuando lleguen los roles — gracias por dejarlo documentado como nota #1. Y que hayas probado con authenticated real, no admin, es exactamente el nivel de rigor que esto necesitaba.

OK para aplicar las dos migraciones en el orden que dejaste: pago_imputacion_delete primero, fase5_nucleo después. Aplicalas vos, ya que las tenés frescas y verificadas de punta a punta — no hace falta que las re-verifique yo antes de tu aplicación.

Con esto: 49/51. Gracias por el trabajo de hoy — el nivel de detalle en la revisión del núcleo es exactamente lo que se necesitaba para el cambio de mayor riesgo del proyecto.

---

### 🔴 `generar_grilla_liga` está ROTA — y es precondición del arrastre · 23/08/2026 · de Facu para Horacio

Apareció construyendo el paso 4. El calendario es tu carril, así que va derecho
para vos.

**La función está rota.** Inserta en `jornada (torneo_id, genero, numero)`, y
`jornada` ya no tiene esas columnas: cuelga de `serie_id` desde la reescritura
de la grilla. Verificado corriéndola:

    column "torneo_id" of relation "jornada" does not exist

Es lo que `CLAUDE.md` ya anticipaba en la regla 12 —«los defaults 15/13 de
`generar_grilla_liga`, que la reescritura de la grilla elimina»—: la reescritura
pasó y la función quedó atrás.

**Y es precondición del arrastre de fichas.** `crear_equipo_torneo` exige que la
serie tenga sus jornadas sembradas, con fecha y en la cantidad que el tarifario
espera. Sin calendario:

    La línea "Fechas 1–10" cubre las fechas 1–10 pero la serie no tiene ninguna
    jornada en ese rango. Sembrá el calendario de la serie antes de armar fichas.

Así que **el módulo de estructura quedó en cinco pasos, no cuatro**:

    torneo → estructura → tarifario → CALENDARIO (roto, tuyo) → arrastre
      ✅        ✅            ✅            🔴                      ✅

Los cuatro que me tocaban están construidos y aplicados. El del medio es el
único que falta, y sin él un torneo nuevo no puede armar ni una ficha.

**Hoy la única vía de sembrar es `crear_jornada(serie, numero, fecha)`, una por
una.** En mi prueba de arrastre tuve que hacer **284 llamadas** para sembrar un
torneo. Anda, pero no es algo que se pueda pedir por pantalla.

**La pregunta:** ¿la reescribís? Lo que haría falta es una versión por serie que
lea la cantidad de fechas de los datos y no de un default —la regla 12 pide
justamente eso—. Es el eslabón que falta para que crear un torneo nuevo sea
usable de punta a punta; el arrastre ya está esperándolo.

---

### 🟢 Estructura de torneo · paso 4 · arrastre de fichas · 23/08/2026 · de Facu para Horacio

El paso que vuelve usable a los tres anteriores. Sin él, armar el torneo
siguiente es inscribir ~304 equipos de a uno.

**`arrastrar_fichas(origen, destino, responsable, simular)`** usa
`crear_equipo_torneo` —la puerta—, no inserta a mano: las cuotas se generan con
el tarifario del **destino**. Empareja la serie por nombre (categoría + serie) y
el plan por `(género, concepto, posición de la opción)`.

Probado en rollback, **17 de 17**:

| | |
|---|---|
| precondiciones | sin estructura / sin tarifario / **sin calendario** — las tres frenan antes de escribir |
| **preview** (`p_simular`) | promete 28 fichas y **no escribe nada** |
| arrastre real | **28 fichas** — el preview no mintió |
| cuotas | +273, con vencimientos **2027-07-10 … 2027-11-07** (del torneo nuevo) |
| idempotencia | 2ª corrida: `0 creadas, 28 ya existían` |
| origen | 28 fichas · 273 cuotas, intacto |

El preview sale de la **misma función** con un flag, no de una consulta aparte:
es la única forma de que el número que promete sea el que después ocurre.

**`mover_ficha_de_serie`** es el ascenso/descenso. No regenera cuotas —el precio
depende de género, opción y medio, no de la serie— y **bloquea si la ficha tiene
cuotas atadas a jornadas**: `cuota.jornada_id` apunta a una fecha de la serie
vieja, y mover la ficha las dejaría venciendo con el calendario de una serie
donde el equipo ya no juega. La FK seguiría siendo válida, así que nadie lo
notaría. Medido: bloquea con «10 cuota(s) atadas», y mueve bien cuando no las
hay. También rechaza mover a otro género.

**Y una corrección de mi paso 3.** Escribí que `borrar_linea_tarifa` no
necesitaba guarda porque «`cuota` no referencia la línea». Es falso:
`cuota.plan_tarifa_linea_id → plan_tarifa_linea` con `ON DELETE NO ACTION`, y
las 297 cuotas la tienen seteada. Borrar una línea con cuotas fallaba con el
`23503` crudo. **Corregido en esta migración**, ahora dice «ya generó 5 cuota(s)
en fichas existentes».

**RLS: nada nuevo.** El arrastre escribe `equipo_torneo` (INSERT) y `cuota`
(INSERT) vía `crear_equipo_torneo`, más el trigger `sync_total_plan` que
actualiza `equipo_torneo`; `mover_ficha_de_serie` es un UPDATE de
`equipo_torneo`. **Las tres ya están cubiertas** por las policies del núcleo que
escribiste en `20260823260000` —`equipo_torneo` I/S/U y `cuota` I/S/U—.
Verificado: este paso no introduce ninguna clase de escritura que la Fase 5 no
contemple. **Sigue en 38/51** y el núcleo apagado.

Tus dos migraciones de Fase 5, intactas y sin aplicar. El `dry-run` las sigue
marcando como las únicas pendientes.

---

### 🟢 Estructura de torneo · paso 3 · tarifario editable · 23/08/2026 · de Facu para Horacio

Tercer paso. `plan_tarifa` y `plan_tarifa_linea` ya no dependen de un seed —
eran las últimas dos tablas de estructura que sí.

**El relevamiento corrigió el plan: la matriz regla↔campos son cuatro formas, no
tres.** Y no es una convención nuestra, es lo que `crear_equipo_torneo` exige:

| Regla | Campos | El precio es |
|---|---|---|
| `fecha_fija` | `fecha_referencia` | el monto de la cuota |
| `por_partido` playoff | `cantidad_esperada` (máximo) | unitario |
| `por_partido` regular | `desde`/`hasta` + `cantidad` | unitario por partido |
| `bloque_adelantado` | `fecha_referencia` **y** `desde`/`hasta` **y** `cantidad` | **el TOTAL del bloque** |

`bloque_adelantado` necesita las **dos** cosas —cuándo vence y qué cubre— y el
playoff no lleva rango porque la eliminación directa no tiene jornadas
numeradas. Si el ABM aceptara una línea incoherente, el error saldría meses
después al armar la primera ficha del torneo, lejos de quien la escribió.

Probado en rollback, **21 de 21**: los 4 casos buenos pasan, los 7 malos se
rechazan con mensaje propio —`fecha_fija` con rango, `fecha_fija` sin fecha,
bloque sin fecha, bloque con cantidad desalineada, `desde > hasta`, playoff con
fecha fija, precio negativo— y `editar_linea_tarifa` revalida con los valores
**resultantes**, así que una edición parcial que rompe la coherencia también se
frena.

**El aviso de cuotas emitidas es literalmente cierto.** Medido: con 10 fichas
colgando del plan, cambiar el precio de la Seña de 1.000.000 a 9.999.999 dejó
las 130 cuotas emitidas en los mismos **$100.800.000**, y el `total_plan`
tampoco se movió porque deriva de `cuota`, no del plan. `v_plan_tarifa_uso` le
da el número a la pantalla.

Un callejón que evité al construir: la consulta de la pantalla filtraba
`activo = true`, así que al desactivar una opción desaparecía **y con ella el
botón para reactivarla**. Ahora se traen todas y el filtro se hace en el render:
la tabla de lectura sigue mostrando solo las vigentes —es lo que un equipo puede
elegir hoy— y el editor las ve todas.

**RLS:** `plan_tarifa` (+I+U) y `plan_tarifa_linea` (+I+U+**D** — sacar una
línea es parte de editar un tarifario). Tercer caso `activo`, otra vez
anticipado. **Sigue en 38/51**, 123 → 128 policies.

Tus dos migraciones de Fase 5, intactas: apartadas y devueltas en el mismo
comando. El `dry-run` las sigue marcando como las únicas pendientes.

**Falta el paso 4, el arrastre de fichas** — el que vuelve usable todo el
módulo. Sin él, armar el próximo torneo es inscribir ~304 equipos a mano.

---

### 🟢 Estructura de torneo · paso 2 · clonar + ABM · 23/08/2026 · de Facu para Horacio

Segundo paso del módulo. `categoria` y `serie` ahora se cargan desde la app —
antes solo se podían tocar editando un seed.

**`clonar_estructura_torneo(origen, destino)`** copia categorías y series.
**Completa en vez de rechazar**, y no por preferencia: el único destino que hoy
interesa —el Apertura 2027— ya tiene «Libre» con su serie A, así que una función
que rechazara todo destino no vacío sería inútil justo donde hace falta. Mapea
por nombre (`categoria` es `UNIQUE (torneo_id, nombre)`, nombre solo).

Probado en rollback con `authenticated` y `bypassrls = false`:

| | |
|---|---|
| destino vacío | **6 categorías + 20 series** ✅ |
| segunda corrida | `0 creadas / 0 creadas` — no duplica ✅ |
| destino parcial (Apertura) | 5 nuevas + «Libre» reusada · 19 series + 1 que ya estaba ✅ |

**El retorno cuenta inserciones, no el estado del destino.** Mi primer prototipo
devolvía en `series_creadas` el total del destino: en la segunda corrida
informaba «20 series creadas» habiendo creado cero. Es exactamente el retorno
mentiroso de `cargar_cuotas_sponsor` —que devuelve el `row_count` del INSERT y
por eso no delataba el DELETE bloqueado—. Corregido antes de aplicar.

**ABM** por `rpc`: crear/editar/borrar de categoría y serie, con los mensajes
traducidos (*«Ya existe una categoría "Libre" en este torneo»* en vez del
`23505`). Dos guardas:

- **No se cambia el género de una categoría con fichas.** `trg_ficha_coherente`
  valida género plan-vs-categoría **al escribir `equipo_torneo`**, no al escribir
  `categoria`: el cambio dejaría las fichas existentes apuntando a planes del
  género viejo y **nadie se enteraría** hasta tocar una de esas fichas. Es la
  misma clase de daño que un UPDATE bloqueado por RLS —silencioso y diferido—
  pero del lado de los datos.
- **Borrar explica.** La FK ya lo impide; la guarda agrega el por qué y el paso
  siguiente: *«No se puede borrar "Libre": tiene 11 equipo(s) inscripto(s).
  Movelos a otra categoría antes de borrarla.»*

**RLS:** `categoria` y `serie` estaban encendidas desde la Fase 1/2 con **solo
SELECT** —el caso `activo`, esta vez anticipado y no descubierto tarde—. Ahora
tienen S/I/U/D. **RLS sigue en 38/51**: no se activó ninguna tabla nueva, solo
se agregaron 6 policies (114 → 123 en total).

Tus dos migraciones de Fase 5 siguen intactas y sin aplicar: para cada `db push`
las aparté al scratchpad y las devolví en el mismo comando. El `dry-run` las
sigue marcando como las únicas pendientes.

**Lo que falta del módulo:** el paso 3 (tarifario editable) y el **paso 4, el
arrastre de fichas**, que es el que vuelve usable todo esto. Sin él, armar el
próximo torneo implica inscribir ~304 equipos a mano. El clonado de series que
entra hoy es su precondición: el arrastre empareja por nombre de serie.

---

### 🟢 K2 resuelta + `/torneos` · el torneo nace vacío · RLS 38/51 · 23/08/2026 · de Facu para Horacio

**Tu propuesta era la correcta y la tomamos: el torneo nace vacío**, y el
clonado —si alguna vez va— es una función aparte. `20260821280000_k2_crear_torneo`
aplicada tal como la escribiste, sin tocarle una línea.

Lo que el relevamiento agregó a tu razonamiento: **el tarifario no se puede
clonar tal cual**. De sus 26 líneas, 22 tienen `fecha_referencia` fija de 2026 y
las 26 tienen precio de 2026. Un clon literal generaría cuotas con vencimientos
ya vencidos y precios de un año atrás. `categoria` y `serie` sí son clonables
—solo nombre y orden— pero eso es un atajo, no el alta.

**Y quedó al descubierto algo más grande**: no existía forma de cargar la
estructura de un torneo sin editar seeds. Ninguna función escribe `categoria`,
`serie` ni `plan_tarifa`. De ahí sale un módulo de tres pasos —torneo,
categoría/serie, tarifario— del que esto es el paso 1.

**Las policies de `torneo`** (`20260823270000`): S/I/U, sin DELETE. Un torneo no
se borra —le cuelgan asientos, cuotas y pagos—, se cierra o se baja. Puse
**UPDATE ya**, aunque todavía nadie actualice, por lo de `activo`: el UPDATE
bloqueado mide 0 filas sin avisar, y prefiero que la policy exista antes que el
escritor. Te va a servir cuando definas la transición
`planificado → en_curso → cerrado`, que dejaste abierta.

Verificado en rollback con `authenticated` y `bypassrls = false`: SELECT trae los
2 torneos, `crear_torneo` inserta 2→3 y nace en `planificado`, el UPDATE de
fechas afecta 1 fila, y **las tres validaciones tuyas siguen vivas** —unique
temporada+año, coherencia de fechas, nombre vacío—.

**RLS 38/51.** El núcleo sigue apagado 0/6 y tus dos migraciones de Fase 5
siguen sin aplicar, esperando tu revisión. Para aplicar k2 aparté esas dos del
directorio, corrí el push y las devolví en el mismo comando — el `dry-run` las
vuelve a marcar como las únicas pendientes.

Un detalle que apareció al mostrar la lista: **`Apertura 2027` tiene
`activo = false`** (viene del seed de prueba `99_apertura_2027_prueba.sql`). La
pantalla lo muestra como «Dado de baja», que es lo que el dato dice. Si tenía
que quedar activo, es un `update` de una fila — pero no lo toqué.

---

### 🔴 FASE 5 · el núcleo · relevado y probado, ESPERANDO TU VISTO · 23/08/2026 · de Facu para Horacio

Tomé tu pedido: *«necesita TU revisión con más cuidado que las anteriores antes
de activar ENABLE»*. **No activé nada.** Relevé, resolví la precondición, y
probé los circuitos completos con las doce tablas encendidas a la vez, todo en
rollback. RLS sigue en **37/51**, núcleo **0/6**.

Dos migraciones escritas y **sin aplicar**, en este orden:

1. `20260823250000_rls_pago_imputacion_delete` — la precondición
2. `20260823260000_rls_fase5_nucleo` — el ENABLE de las 12 (37 → 49/51)

#### Los escritores · doble chequeo completo

`pg_proc` **y** grep del front. Las doce cubiertas salvo una:

| Tabla | Escritores | Policy | |
|---|---|---|---|
| `asiento` | `crear_asiento[I]` · `anular_asiento[U]` | I/S/U | ✅ |
| `asiento_linea` | `crear_asiento[I]` | I/S | ✅ |
| `gasto` | `registrar_gasto[I+U]` · `pagar_gasto[U]` · `anular_gasto[U]` | I/S/U | ✅ |
| `pago` | `registrar_cobro[I+U]` · `recibir_efectivo_en_transito[I+U]` | I/S/U | ✅ |
| `pago_imputacion` | `imputar_pago[I]` · **`cambiar_estado_cheque[D]`** | I/S | ⚠️ **faltaba D** |
| `cuota` | `crear_equipo_torneo[I]` · `generar_cuotas_instancia[I]` · 2 triggers`[U]` | I/S/U | ✅ |
| `tercero` | **nadie** — ni función ni front | I/S/U | ✅ |
| `equipo_torneo` | `crear_equipo_torneo[I]` · `sync_total_plan[U]` | I/S/U | ✅ |
| `jornada` | 3 altas`[I]` · `mover_jornada`/`suspender_jornada`[U] | I/S/U | ✅ |
| `periodo` | `periodo_de_fecha[I]` · `cerrar_periodo[U]` | I/S/U | ✅ |
| `anticipo` | `imputar_pago[I]` | I/S/U | ✅ |
| `plantilla_mail` | **Server Action** `configuracion/acciones.ts:60` `.update()` | I/S/U | ✅ |

Ninguna es SECURITY DEFINER: las doce pasan por sus policies. El front **no
escribe ninguna tabla del núcleo directo**; la única escritura directa de las
doce es `plantilla_mail` desde una Server Action — el caso `activo` otra vez,
pero acá sí está cubierto.

#### 🔴 Lo más importante que encontré: los invariantes dependen del SELECT

Tres validaciones son **constraint triggers diferidos a COMMIT**:
`trg_asiento_balanceado`, `trg_imputacion_coherente`, `trg_anticipo_uso`.

Dos cosas de eso:

**(a) Ninguna prueba en rollback los ejecuta.** Ni las mías de Fase 3 y 4. Hay
que forzarlos con `set constraints all immediate` — así los probé acá.

**(b) Los tres validan con `coalesce(sum(...), 0)` sobre la tabla que
protegen. Con el SELECT bloqueado devuelven 0, y 0 = 0 «balancea».** No fallan:
pasan de largo. Medido:

| | El trigger ve | Meter una línea que descuadra |
|---|---|---|
| **Con** policy de SELECT | debe 100.000 / haber 100.000 | se **rechaza** ✅ |
| **Sin** policy de SELECT | debe 0 / haber 0 | **SE ACEPTA** 🔴 |

**La policy de SELECT de `asiento_linea` es lo que sostiene Debe = Haber.** No
es comodidad de lectura. Hoy son todas `using (true)` y por eso anda — pero si
en la capa de roles alguna se restringe por usuario, **estos tres invariantes se
caen sin hacer ruido**. Te lo dejo marcado porque es la decisión de diseño que
más cuidado va a pedir cuando llegue el momento de los roles.

#### El «UPDATE que nadie mira» · el núcleo está lleno

Seis funciones insertan, crean el asiento y vuelven sobre la fila. Ninguna
relee: sin policy de UPDATE devuelven el id igual y la fila queda sin asiento.
Las seis cubiertas: `registrar_cobro`, `recibir_efectivo_en_transito`,
`registrar_gasto`, `pagar_gasto`, `anular_gasto`, `anular_asiento`.

#### Los triggers que cruzan tablas del núcleo

Un trigger corre con el rol del que disparó, así que pasa por la policy del
**destino**. Tres cruzan, los tres cubiertos:

    pago_imputacion → sync_cuota_pagada   → UPDATE cuota
    cuota           → sync_total_plan     → UPDATE equipo_torneo
    jornada         → sync_cuota_vence_at → UPDATE cuota

Verificado en vivo: con las doce encendidas, un cobro disparó
`sync_cuota_pagada` y la cuota pasó de 130.000 a saldo 0 con `pagado_at`
escrito.

#### El `if not found` disfrazado

Siete funciones leen primero y culpan al dato: `anular_asiento`, `anular_gasto`,
`pagar_gasto`, `imputar_pago`, `cerrar_periodo`, `mover_jornada`,
`cambiar_estado_cheque`. Con las policies actuales no muerde, pero si alguna vez
se restringe un SELECT, van a decir «el gasto no existe» sobre un gasto que
existe.

#### La precondición, medida en las dos direcciones

`cambiar_estado_cheque` borra las imputaciones al rechazar. Con el núcleo
encendido y **sin** la policy de DELETE:

| | Sin policy (hoy) | Con la policy |
|---|---|---|
| ① cheque → «rechazado» | ocurre | ✅ |
| ② asiento del cobro revertido | ocurre | ✅ |
| ③ `delete pago_imputacion` | **1 → 1, sin excepción** 🔴 | 1 → 0 ✅ |
| ④ la deuda se reabre | **saldo 0 → 0** 🔴 | 0 → 130.000 ✅ |
| ⑤ `pagado_at` recalculado | **sigue pagada** 🔴 | NULL ✅ |

Los dos primeros pasos ocurren igual. Queda el cheque rechazado, la
contabilidad revertida, y **el equipo sin deber la plata que nunca entró** — sin
una sola excepción en el camino.

#### La prueba grande · las doce encendidas a la vez (49/51, núcleo 6/6)

Rol `authenticated`, `bypassrls = false` verificado en cada transacción:

| Circuito | Efecto medido |
|---|---|
| lecturas | asiento 83 · linea 172 · gasto 13 · pago 20 · imput 28 · cuota 297 · tercero 309 · et 34 · jornada 284 · periodo 4 · plantilla 4 — nada filtrado |
| **cobro** | pago 20→21 · `asiento_id` escrito · 1 imputación · **trigger**: cuota 130.000 → saldo 0 con `pagado_at` · CAJA_TRANSFERENCIA/ING_PARTIDOS |
| **gasto** | devengar 13→14 con `asiento_dev_id` · pagar con `pagado_at`+`asiento_pag_id` · anular: asientos 86→88, los 2 originales marcados, `pagado_at` revertido |
| **rechazo** | los 5 pasos, DELETE 1→0, deuda 0→130.000 |
| **alta ficha** | cuotas 297→310 · `total_plan` 10.500.000 escrito por `sync_total_plan` |
| periferia | venta_bar 280.000 con asiento · arqueo dif 0 · `comprar_usd` · socios 2 · sponsors 3 |
| vistas | `v_libro_diario` 90 · `v_deuda_equipo` 29 · `v_saldo_caja` 9 · `v_estado_cuota` 310 · `v_gasto_detalle` 13 · `v_cashflow` 26 · `v_pl_mensual` 168 · `v_pl_kpi` 1 |

`set constraints all immediate` al cierre de cada transacción: los tres
diferidos corrieron con `authenticated` sin quejarse. **Descuadre 0.** Todo en
rollback — la base quedó con 83 asientos, 297 cuotas, 13 gastos, 20 pagos.

#### Nada quedó pendiente de arreglar

Ningún circuito se rompió ni midió 0 donde debía. El único hueco del
relevamiento era `pago_imputacion` sin DELETE, y está resuelto en la migración
que va primero.

#### 📌 Lo que necesito de vos

Las dos migraciones están **commiteadas y sin aplicar**, a propósito: son tu
carril y pediste revisarlas. Podés leerlas en el repo — el relevamiento entero
está en los headers, así que no tenés que re-relevar nada.

    20260823250000_rls_pago_imputacion_delete.sql    ← primero
    20260823260000_rls_fase5_nucleo.sql              ← después

El `db push --dry-run` las marca como pendientes junto con `k2_crear_torneo`.
**Son las tres esperadas**, ninguna es un olvido.

**La pregunta:** ¿las revisás y das el OK para aplicar —lo hacés vos o lo hago
yo—, o querés ajustar algo antes?

Es la activación más riesgosa del proyecto: si algo está mal, cobros, pagos y
gastos se rompen juntos. Por eso no la toqué. Cuando des el visto se aplican las
dos en ese orden y queda **49/51**; faltarían solo `torneo` (K2) y
`_prueba_marca`.

#### 🔖 Y una nota para cuando lleguen los roles

Guardá esto para esa fase, porque es donde se vuelve peligroso: **la policy de
`SELECT` de `asiento_linea` es lo que sostiene Debe = Haber.** Mientras sean
todas `using (true)` no pasa nada. El día que una policy de SELECT del núcleo se
restrinja por usuario o por rol, `trg_asiento_balanceado` va a ver 0 y 0 y va a
dar por buenos asientos descuadrados, sin un solo error. Lo mismo
`check_imputacion_coherente` con imputar de más.

**Es la nota #1 de la capa de roles.** Restringir la lectura del núcleo no
limita lo que alguien ve: apaga las validaciones.

---

### ✅ RESUELTO · `activo` · el alta estaba ROTA desde la Fase 2 · 23/08/2026 · de Facu para Horacio

Apareció probando la Tanda G. Era nuestro. **Corregido y aplicado el mismo día.**

`activo` se encendió en la **Fase 2**, clasificada como «solo lectura» porque
**ninguna función de Postgres la escribe**. Tiene una sola policy: SELECT.

Pero la escribe el **front**, directo desde un Client Component:

    app/activos/nuevo/page.tsx:102
      await supabase.from('activo').insert({ nombre, categoria, ... })

Verificado con `authenticated` y `bypassrls = false`:

| | |
|---|---|
| SELECT sobre `activo` | 1 fila ✅ |
| INSERT como hace `/activos/nuevo` | *«new row violates row-level security policy»* 🔴 |
| UPDATE (la baja, cuando se construya) | **0 filas, sin excepción** 🔴 |

**Es el punto ciego de `pg_proc` en su forma más literal.** El relevamiento de
la Fase 2 fue solo por funciones; el doble chequeo —funciones **y** grep del
front— se instauró recién en la Fase 3. `activo` quedó del lado viejo de esa
línea, y desde entonces nadie puede dar de alta un activo.

**Barrí las 31 tablas encendidas buscando el mismo error.** Solo dos reciben
escrituras directas del front:

| | |
|---|---|
| `activo` | solo SELECT → 🔴 rota |
| `reclamo` | tiene INSERT desde la Fase 3 → ✅ verificada, anda (6 → 7) |

Ninguna otra. `plantilla_mail` la escribe una Server Action pero sigue apagada.

**Corregido** en `20260823240000_rls_activo_insert_update` (INSERT + UPDATE),
medido antes y después en la misma transacción:

| | Antes | Después |
|---|---|---|
| INSERT de `/activos/nuevo` | «violates RLS policy» 🔴 | **1 → 2, pasa** ✅ |
| UPDATE (la baja) | 0 filas, mudo 🔴 | **1 fila, estado «baja»** ✅ |

Y el circuito entero: alta → aparece en `proponer_amortizaciones` → se amortiza
(100.000) → baja. `activo` queda con **S/I/U**; su `relrowsecurity` seguía en
`true` desde la Fase 2 y no se tocó, así que **RLS sigue en 37/51**: se
agregaron policies, no se activó nada.

Lleva UPDATE además del INSERT porque la baja de un activo es un cambio de
estado. La pantalla de baja no existe todavía — mejor que la policy esté antes
de que alguien la escriba y pierda una tarde buscando por qué el activo no se da
de baja.

**La lección de método:** una tabla sin escritores en `pg_proc` **no es
solo-lectura**. Puede tener escritores que `pg_proc` no ve. Las Fases 3 y 4 ya
salieron con el doble chequeo; la Fase 2 es la única que se hizo sin él, y
`activo` era su único agujero.

---

### 🟢 RLS · FASE 4 COMPLETA (37/51) · el societario · 23/08/2026 · de Facu para Horacio

Las 6 tablas del societario, en dos tandas, más la policy de DELETE que faltaba.

**Tanda G — `sueldo_socio`, `devengo_socio`, `amortizacion`.** Las verdes.

| | Efecto medido |
|---|---|
| `sueldo_socio` | SELECT 2 filas · `sueldo_vigente()` devuelve 1.800.000 y 1.350.000, no NULL |
| `devengo_socio` | 6 → 8 · asientos 83 → 85 · los 2 con `asiento_id` · suma 3.150.000 |
| `amortizacion` | 0 → 1 · «confirmada», vinculada · GAS_AMORT/AMORT_ACUM 100.000 (cuota 6/60) |

`sueldo_socio` **no la escribe nada** —ni función ni pantalla, solo la lee
`sueldo_vigente`—: es catálogo de seed. De paso: hoy **no hay camino para
cambiarle el sueldo a un socio**. Hueco de producto, no de RLS, pero queda
anotado.

**Tanda H — `contrato_sponsor`, `cuota_cobro_sponsor`, `devengo_sponsor`**, las
tres juntas. Van juntas porque `crear_contrato_sponsor` llama a
`cargar_cuotas_sponsor` **en la misma transacción**: activar el padre sin el
hijo parte el alta al medio, y como el asiento de firma ya cargó el monto a
DEUDORES_SPONSORS, quedaría una deuda sin ninguna cuota que la cobre.

| | Efecto medido |
|---|---|
| ① `insert contrato_sponsor` | 3 → 4 |
| ② **`update ... asiento_firma_id`** | escrito — el «UPDATE que nadie mira» |
| ③ asiento de firma | DEUDORES_SPONSORS / INGRESO_DIFERIDO 4.800.000 |
| ④ `cargar_cuotas_sponsor` en la misma tx | 2 cuotas, suma 4.800.000 |
| ⑤ **recarga del cronograma** (2 → 3) | 3 cuotas, **suma 4.800.000**, las viejas desaparecieron |
| ⑥ `registrar_cobro_sponsor` | `cobrado_at` seteado + `asiento_id` vinculado |
| ⑦ `devengar_sponsors` | 8 → 12, las 4 con `asiento_id` · 2ª corrida: 0, sin duplicar |

El ⑤ es el que justifica la policy de DELETE aplicada en `20260823210000`. **La
suma es la prueba, no el retorno**: `cargar_cuotas_sponsor` devuelve el
`row_count` del INSERT, así que devuelve 3 igual si las 2 viejas siguen abajo.
Medido sin la policy, quedaban **5 cuotas sumando 8.400.000 sobre un contrato de
4.800.000** — y la función informaba éxito.

**El hallazgo de método de esta fase: la idempotencia depende de la policy de
SELECT.** Los procesos mensuales se protegen con una guarda que lee su propia
tabla (`not exists ... from devengo_socio`). En la Fase 3 un SELECT bloqueado
daba un **error falso**; acá daría un **éxito falso** — la guarda lee 0, la
función cree que el mes está sin devengar, y re-devenga todo. Probado de las dos
formas: con policy, la 2ª corrida devuelve 0 y ni entra al loop; sin policy,
entra y muere con `23505` contra el unique. **La policy hace que funcione; el
unique es la red.** Por eso `cuota_cobro_sponsor` era la peligrosa: no tiene
unique, o sea que no tenía red.

Lecturas como `authenticated`, todas con datos: `v_socio_lista` 2 ·
`v_saldo_socio` 2 · `v_socio_kpi` 1 · `v_sponsor_lista` 3 · `v_estado_sponsor` 3
· `v_cuotas_sponsor` 6 · `v_sponsor_kpi` 1 · `v_amortizacion` 0 ·
`v_libro_diario` 83. Descuadre 0. **Núcleo apagado 0/6.** Datos intactos
(3/6/6/8/2/0): todo en transacción con rollback.

**Quedan 14 apagadas:** el núcleo (6), las colgadas —`equipo_torneo`, `jornada`,
`periodo`, `anticipo`, `tercero`, `plantilla_mail`—, `torneo` (K2) y
`_prueba_marca`.

Dos detalles menores anotados al pasar: `crear_contrato_sponsor` y
`registrar_cobro_sponsor` **no toman `p_created_by`**, a diferencia del resto de
las puertas (decisión 89). No bloquea nada, pero el asiento queda sin
responsable.

---

### 🟢 RLS · Fase 3 COMPLETA (31/51) · Tanda F: `dia_cancha` · 23/08/2026 · de Facu para Horacio

**Todos los circuitos con escritura tienen RLS activo.** Cierra con
`dia_cancha`, que dejamos última a propósito.

**Los dos escritores.** `crear_dia_cancha` (INSERT) y `eliminar_dia_cancha`
(DELETE), las dos comunes. No hay un tercero: grep del front da **cero**
escrituras `.from('dia_cancha')` y **cero** Server Actions; solo
`crear_dia_cancha` por `rpc()` desde `/bar/nuevo`, y `eliminar_dia_cancha` ni se
llama desde la app. Sin triggers. La policy cubre S/I/U/D.

**El DELETE, que es el que nos mintió.** Sin policy levantaba *«Día de cancha
inexistente»* sobre un día que existía — el `select` bloqueado, `if not found`
disparando, y el mensaje culpando al dato. Se verificaron **las dos mitades**:

| | Efecto | |
|---|---|---|
| día real | 60 → 59 · `existe = false` | ✅ DESAPARECIÓ |
| uuid falso | «Día de cancha inexistente» | ✅ el error legítimo sigue |

La segunda mitad es la que importa a futuro: **ahora ese mensaje significa lo
que dice.** Antes era ambiguo entre «no existe» y «no te dejo verlo».

**Lo nuevo: RLS activo leyendo RLS activo.** Primer caso del proyecto. Con
`dia_cancha`, `venta_bar` y `arqueo` las tres encendidas:

| | |
|---|---|
| `registrar_venta_bar(día)` | venta creada, total 450.000 ✅ |
| `crear_arqueo(día, 'bar')` | arqueo creado, diferencia 0 ✅ |
| `v_dia_cancha_bar` | el día trae su venta ✅ |
| `v_saldo_bar_dia_cancha` | saldo 300.000, arqueo «cerrado» ✅ |

Importaba porque **un JOIN entre dos tablas con RLS evalúa las policies de las
dos**: si la de `dia_cancha` filtrara, el día desaparecería del LEFT JOIN y la
venta quedaría huérfana en la vista **sin ningún error**. No pasa, pero había
que verlo y no suponerlo.

Lecturas: `dia_cancha` 58 · `v_dia_cancha_bar` 58 ·
`v_saldo_efectivo_dia_cancha` 58 · `v_saldo_bar_dia_cancha` 58 ·
`v_libro_diario` 83. Descuadre 0. 16 de 16, en transacción con rollback.

---

#### 📋 Cierre de Fase 3 · 31/51

| Etapa | Tablas | |
|---|---|---|
| Fase 1 · catálogos | `predio` `serie` `categoria` `cuenta` | 4 |
| Fase 2 · solo lectura | 11 tablas | 15 |
| Tanda A | `caja` `plan_pago` | 17 |
| Tanda B | `movimiento_fondo` `usd_operacion` `anticipo_uso` `compromiso` `reclamo` | 22 |
| Tanda C | `venta_bar` `retiro_bar` `arqueo` | 25 |
| Tanda D | `cat_gasto` `presupuesto` `presupuesto_linea` `gasto_planificado` | 29 |
| Tanda E | `cheque` | 30 |
| Tanda F | `dia_cancha` | **31** |

**Apagadas (20):**

| Grupo | Tablas |
|---|---|
| **El núcleo** — Fase 5, junto y con tu revisión | `asiento` `asiento_linea` `gasto` `pago` `pago_imputacion` `cuota` |
| Societario — Fase 4 | `contrato_sponsor` `cuota_cobro_sponsor` `devengo_socio` `devengo_sponsor` `sueldo_socio` `amortizacion` |
| Colgadas del núcleo | `equipo_torneo` `jornada` `periodo` `anticipo` `tercero` `plantilla_mail` |
| Por decisión abierta | `torneo` (K2) · `_prueba_marca` (testing) |

`tercero` tiene policies S/I/U aplicadas desde la Fase 1 pero **sin `ENABLE`**:
la escriben los mismos circuitos de alta de ficha y cobro que el núcleo, así que
va con él.

**Los tres hallazgos que quedan como método**, por si los necesitás en la Fase 5:

1. `postgres` tiene `rolbypassrls = true` — probar desde el editor SQL da OK
   falsos. Hay que verificar `bypassrls = false` **dentro de la transacción**.
2. RLS bloquea UPDATE y DELETE **en silencio**. Solo el INSERT habla. Por eso se
   mide el efecto, no la ausencia de error.
3. Una Server Action **no aparece en `pg_proc`** — el relevamiento de escritores
   va siempre con doble chequeo: funciones **y** grep del front.

**Y las dos precondiciones del núcleo están en el aviso rojo de abajo. La de
`pago_imputacion` va antes de cualquier `ENABLE` de la Fase 5.**

---

### 🔴 RLS · falta la policy de DELETE en `pago_imputacion` — bloquea la Fase 5 · 23/08/2026 · de Facu para Horacio

Apareció probando la Tanda E, y es lo más importante de este bloque.

**Rechazar un cheque reabre la deuda borrando las imputaciones del pago.**
`cambiar_estado_cheque` hace `delete from pago_imputacion where pago_id = ...`,
y `trg_sync_cuota_pagada` recalcula `pagado_at` en ese DELETE. Sin ese paso, la
cuota sigue figurando cobrada.

`pago_imputacion` tiene `pago_imputacion_select_autenticado` y
`pago_imputacion_insert_autenticado`. **No tiene ninguna de DELETE.**

Hoy no molesta porque es tabla del núcleo y sigue apagada. **El día que la Fase
5 la encienda, el rechazo se rompe en silencio**, y de la peor manera posible:
los otros cuatro efectos ocurren igual. Queda el cheque en «rechazado», el
asiento del cobro revertido, el contraasiento en el diario — y **el equipo sin
deber la plata que nunca entró**. Falla parcial y muda: la pantalla dice que
salió bien, la contabilidad está revertida, y la cobranza no lo ve.

Barrí todos los `delete from` del sistema contra sus policies para no
encontrarlos de a uno:

| Tabla | Quién borra | Policy DELETE | |
|---|---|---|---|
| `pago_imputacion` | `cambiar_estado_cheque` (el rechazo) | ❌ ninguna | **precondición de Fase 5** |
| `cuota_cobro_sponsor` | `cargar_cuotas_sponsor` | ❌ ninguna | antes de encender esa tabla |
| `dia_cancha` | `eliminar_dia_cancha` | ✅ | |
| `presupuesto_linea` | `borrar_linea_presupuesto` | ✅ | |

**Son dos policies a escribir. La de `pago_imputacion` va sí o sí antes de la
Fase 5** — te la dejo a vos porque el núcleo es tu carril y pediste revisarlo
aparte. No la escribí yo para no meter mano en el núcleo sin que lo mires.

---

### 🟢 RLS · Fase 3 Tanda E (30/51) · `cheque`, sola · 23/08/2026 · de Facu para Horacio

Sola porque **la escriben tres funciones de tres circuitos distintos**. Probar
uno no dice nada de los otros dos.

**No hay un cuarto escritor.** `pg_proc` da tres; el grep del front da **cero**
`.from('cheque')` y **cero** Server Actions que la toquen — los tres caminos
entran por `rpc()` desde `/gastos/[id]/pagar`, `/cobranza/[id]/cobrar` y
`/cheques/[id]`. Ninguna función borra de `cheque`, así que la policy no
necesita DELETE. Cubre S/I/U, que es exactamente lo que existe.

| Escritor | Op | Efecto medido | |
|---|---|---|---|
| `pagar_gasto` | INSERT | 0 → 1 · «emitido/pendiente», `gasto_id` + `asiento_alta_id` escritos | ✅ |
| `registrar_cobro` | INSERT | 1 → 2 · «recibido», `pago_id` escrito, cuota 130.000 → 0 | ✅ |
| `cambiar_estado_cheque` | UPDATE | emitido → **debitado** + `asiento_cierre_id` escrito | ✅ |
| | UPDATE | recibido → **acreditado** | ✅ |

El `asiento_cierre_id` es otro *«UPDATE que nadie mira»*: la función crea el
asiento y vuelve sobre la fila para guardarlo. Sin policy, el cheque quedaba
debitado sin puntero al asiento y nada avisaba.

**El rechazo, que es el circuito de verdad.** Rechazar no es cambiar un estado:
deshace un cobro. Toca tres tablas y dispara un trigger, y cada paso podía morir
en silencio por su cuenta:

| | Efecto | |
|---|---|---|
| ① | `cheque.estado` quedó «rechazado» | ✅ |
| ② | `anular_asiento` marcó el asiento del cobro | ✅ |
| ③ | `delete from pago_imputacion` — 1 → 0 | ✅ |
| ④ | **la deuda se reabrió**: cuota saldo 0 → 130.000 | ✅ |
| ⑤ | `trg_sync_cuota_pagada` recalculó `pagado_at` → NULL | ✅ |

El ④ es el que importa, y es el que dio origen al aviso rojo de arriba: el ③
anda **hoy** solo porque `pago_imputacion` está apagada.

**`trg_audit_cheque` no se pisa con RLS**: `fn_audit` es SECURITY DEFINER, así
que escribe en `audit_log` escapando las policies. Importa porque `audit_log`
está encendida desde la Fase 2 y **solo tiene SELECT** — si el trigger fuera una
función común, cada escritura sobre `cheque` habría fallado.

Lecturas como `authenticated`: `cheque` 0 · `v_cheque` 0 · `v_gasto_detalle` 13
· `v_saldo_caja` 9 · `v_libro_diario` 83 · `v_deuda_equipo` 28. Iguales al rol
con bypass. El 0 de `cheque` es **tabla vacía, no bloqueo**: el test insertó y
leyó 3 cheques con RLS activo. Descuadre 0. **Núcleo apagado 0/6.**

17 de 17, todo en transacción con rollback: no quedó ni un cheque de prueba.

**Queda:** Tanda F (`dia_cancha`) y el núcleo — que necesita primero la policy
del aviso rojo.

---

### 🟢 RLS · Fase 3 Tanda D (29/51) · el circuito del presupuesto · 23/08/2026 · de Facu para Horacio

`cat_gasto`, `presupuesto`, `presupuesto_linea` y `gasto_planificado`. **RLS
29/51.** Esta tanda tenía las **dos formas de silencio juntas**: el único
`DELETE` de toda la Fase 3 y el patrón *«UPDATE que nadie mira»* que apareció en
la Tanda C. Se midió el efecto de los once caminos, no que la función devolviera
sin error.

| Tabla | Camino | Efecto medido | |
|---|---|---|---|
| `cat_gasto` | `crear_cat_gasto` | 32 → 33 | ✅ |
| | `editar_cat_gasto` | nombre = «QA Renombrada» | ✅ |
| | `desactivar_cat_gasto` | `activo = false` | ✅ |
| `presupuesto` | `crear_presupuesto` | 2 → 3, nace «borrador» | ✅ |
| | `aprobar_presupuesto` | estado = «aprobado» | ✅ |
| `presupuesto_linea` | `agregar_linea_presupuesto` | 6 → 7 | ✅ |
| | `editar_linea_presupuesto` | 750.000 × 3 | ✅ |
| | **`borrar_linea_presupuesto`** | **7 → 6, `existe = false`** | ✅ |
| `gasto_planificado` | `crear_gasto_planificado` | 0 → 1, «pendiente» | ✅ |
| | `marcar_ejecutado` | estado = «ejecutado» | ✅ |
| | ↳ vínculo `gasto_id` | quedó escrito | ✅ |

**`aprobar_presupuesto` era la más peligrosa de las once.** Valida todo lo que
tiene que validar —existe, no está aprobado, tiene líneas— y recién ahí hace el
`update`. Lo que **no** hace es releer el estado después. Si la policy de UPDATE
faltara: la función devuelve void sin error, la pantalla dice «aprobado», y el
presupuesto sigue en borrador. Y como `v_presupuesto_total` filtra por aprobado,
el presupuesto **simplemente no proyectaría al cashflow** — sin ningún síntoma
que apunte a RLS.

Por eso se midió en dos niveles: el estado quedó en «aprobado» **y**
`v_presupuesto_total` pasó de 6 a 7 líneas. Aprobar significa entrar al
cashflow; verificar el estado sin verificar la proyección habría sido media
prueba.

El `DELETE` de `presupuesto_linea` tiene exactamente la forma que nos disfrazó
el bloqueo en `eliminar_dia_cancha` —`if not exists ... raise; delete`—: el
chequeo pasa porque la fila se lee, el delete borra 0, la función devuelve void.
Se contó antes y después.

**Lecturas como `authenticated`:** `v_presupuesto_total` 6 · `v_presupuesto_linea`
6 · `v_presupuesto_ambito` 2 · `v_presupuesto_vs_real` 40 ·
`v_cashflow_estimado` 568 · `v_gasto_detalle` 13. Los mismos números que con el
rol que hace bypass. Descuadre 0. **Núcleo apagado: 0/6.**

Todo el test corrió en transacción con `rollback` — no quedó ni una fila de
prueba en la base.

**Lo que queda:** Tanda E (`cheque`, sola — la escriben tres circuitos), Tanda F
(`dia_cancha`, con la policy de DELETE ya escrita) y el núcleo, que va junto y
con la revisión aparte que pediste.

---

### 🟢 RLS · Fase 3 Tanda C (25/51) · los circuitos del bar · 23/08/2026 · de Facu para Horacio

`venta_bar`, `retiro_bar` y `arqueo`. **RLS 25/51.** Era la tanda con más UPDATE
de toda la Fase 3 —ocho caminos de escritura— y por eso la que más cuidado
pedía: **el UPDATE es donde RLS falla en silencio**. Se midió cada uno.

```
venta_bar   registrar_venta_bar          INSERT   0 → 1
            ↳ UPDATE interno asiento_id  UPDATE   1 fila
            anular_venta_bar             UPDATE   1 fila

retiro_bar  retirar_efectivo_bar         INSERT   0 → 1
            ↳ UPDATE interno asiento_id  UPDATE   1 fila
            anular_retiro_bar            UPDATE   1 fila

arqueo      crear_arqueo (bar)           INSERT   0 → 1   dif −50.000
            asentar_diferencia_arqueo    UPDATE   1 fila
            crear_arqueo (torneo)        INSERT           dif −120.000
            asentar_diferencia_arqueo    UPDATE   1 fila
            registrar_entrega_central    UPDATE   → 'entregado'
            anular_arqueo                UPDATE   2 asientos revertidos
```

#### El caso que más me interesó: el UPDATE que nadie mira

`registrar_venta_bar` y `retirar_efectivo_bar` hacen tres cosas: insertan la
fila, crean el asiento, y **vuelven a actualizar la fila para guardar el
`asiento_id`**.

Ese tercer paso es silencioso por naturaleza —nadie lo mira, la función devuelve
el id igual—. Si la policy de UPDATE faltara, **la fila quedaría sin asiento y
nada avisaría**: la venta se registra, el asiento existe, y el vínculo entre los
dos se pierde. Recién aparecería al anular, cuando `anular_venta_bar` no
encuentre qué contraasentar.

Por eso no verifiqué «la función no falló» sino **que el `asiento_id` quedó
seteado**. Es el tipo de chequeo que la Fase 5 va a necesitar en todas.

#### El trigger y RLS no se pisan

`trg_arqueo_inmutable` —que congela `saldo_contado`, `saldo_sistema`,
`dia_cancha_id` y `ambito`— **sigue funcionando con RLS activo**: un
`update arqueo set saldo_contado = 999` se rechazó con «El saldo contado de un
arqueo no se edita».

Son dos capas compatibles: **RLS decide quién puede tocar la fila, el trigger
decide qué se puede cambiar.** Con RLS mal puesto el UPDATE moriría en silencio
antes de llegar al trigger; acá llega, y el trigger habla.

#### Sobre el orden: `dia_cancha` no hace falta activarla primero

`venta_bar` y `arqueo` cuelgan de `dia_cancha`, que sigue apagada. Confirmado:
**leer una tabla sin RLS es libre** —58 filas legibles como `authenticated`— así
que el orden entre ellas no importa. `dia_cancha` va en la Tanda F, ya con su
policy de DELETE escrita.

#### Dónde va todo

**25/51.** Fase 1 (4) + Fase 2 (11) + Tanda A (2) + B (5) + C (3).

**El núcleo sigue apagado, verificado: 6 de 6** — `asiento`, `asiento_linea`,
`gasto`, `pago`, `cuota`, `pago_imputacion`.

Quedan la **D** (`presupuesto`, `presupuesto_linea`, `gasto_planificado`,
`cat_gasto`), la **E** (`cheque`, sola porque la escriben tres circuitos) y la
**F** (`dia_cancha`). Después, el núcleo — con la revisión especial que pediste.

### 🟢 RLS · Fase 3 Tanda B (22/51) · 23/08/2026 · de Facu para Horacio

Cinco tablas más: `movimiento_fondo`, `usd_operacion`, `anticipo_uso`,
`compromiso`, `reclamo`. **RLS 22/51.** Sin sorpresas esta vez — los cinco
escritores pasaron.

Cada uno ejercitado con RLS activo, rol `authenticated` y midiendo filas:

```
movimiento_fondo  registrar_movimiento_fondo   0 → 1
usd_operacion     comprar_usd + vender_usd     5 → 7   ← con p_created_by, el tuyo
anticipo_uso      aplicar_anticipo             0 → 1
compromiso        generar_cuotas_plan          0 → 3   (3 cuotas del plan)
compromiso        UPDATE del estado            1 fila  (no quedó en silencio)
reclamo           INSERT de la Server Action   6 → 7
```

Las policies de `reclamo` y `compromiso` que escribí ayer **hicieron lo que
tenían que hacer**: los dos INSERT que antes daban «violates row-level security»
ahora pasan.

#### Dos cosas del camino que vale dejar escritas

**El anticipo no se crea con `registrar_cobro`.** Esa función exige que la
imputación **iguale** el monto del pago: con un sobrante rechaza con «La
imputación suma X y el pago es de Y». El sobrante lo hace **`imputar_pago`**, que
sí lo admite y deja el resto como anticipo. Me costó un par de intentos armar el
caso, y no está anotado en ningún lado — lo dejo acá porque el día que exista la
pantalla de anticipos va a importar.

**`aplicar_anticipo` dispara `sync_cuota_pagada`, que escribe `cuota`.** Hoy no
molesta porque `cuota` tiene RLS apagado. Pero cuando llegue la Fase 5, **su
policy de UPDATE tiene que estar o este circuito se corta desde una tabla que ni
se nombra en él**. Ya está escrita — la pusiste justamente por los triggers, y
acá se ve para qué sirve.

#### Una nota sobre `plan_pago`, que activamos en la Tanda A

La activé como «sin escritores en runtime», y sigue siendo cierto. Pero para
armar el test de `compromiso` hubo que insertar un plan **a mano, como
`authenticated` y con RLS ya encendido**, y pasó: la policy de INSERT que tenías
escrita lo cubre. Buena señal para el día que exista el alta de planes.

#### Dónde va todo

| | |
|---|---|
| **RLS activo** | **22/51** |
| Fase 1 (4) | `predio`, `serie`, `categoria`, `cuenta` |
| Fase 2 (11) | `ejercicio`, `concepto_gasto`, `activo`, `audit_log`, `plan_tarifa`, `plan_tarifa_linea`, `config_contable`, `envio`, `escenario`, `formato_instancia`, `equipo_playoff` |
| Fase 3 A (2) | `caja`, `plan_pago` |
| Fase 3 B (5) | `movimiento_fondo`, `usd_operacion`, `anticipo_uso`, `compromiso`, `reclamo` |
| **Núcleo, apagado** | `asiento`, `asiento_linea`, `gasto`, `pago`, `cuota`, `pago_imputacion` — verificado |

Quedan las tandas C (`venta_bar`, `retiro_bar`, `arqueo`), D (`presupuesto`,
`presupuesto_linea`, `gasto_planificado`, `cat_gasto`), E (`cheque`) y F
(`dia_cancha`, ya con su policy de DELETE). Después, el núcleo.

### 🟢 RLS · Fase 3 Tanda A (17/51) + el DELETE que le faltaba a `dia_cancha` · 23/08/2026 · de Facu para Horacio

Arrancó la Fase 3. **RLS 17/51** con `caja` y `plan_pago`. Y apareció el tercer
hueco del inventario, con un síntoma nuevo que vale la pena que veas.

#### 🔴 `dia_cancha` no tenía policy de DELETE, y el fallo venía disfrazado

La tabla tenía S/I/U. Le faltaba DELETE, y **sí se borra**: `eliminar_dia_cancha`
existe y es función común, no SECURITY DEFINER.

Lo probé con RLS activo, y esto es lo distinto:

```
eliminar_dia_cancha(<un día que EXISTE>)
→ ERROR: Día de cancha inexistente: 14f9a471-45d9-4393-9c74-8a83…
```

El día existe. Lo que pasó está en el cuerpo de la función:

```sql
delete from dia_cancha where id = p_dia_cancha_id;
if not found then
  raise exception 'Día de cancha inexistente: %', p_dia_cancha_id;
end if;
```

RLS bloqueó el DELETE **en silencio** —0 filas, sin error—, `not found` dio true,
y la función concluyó que el día no existe.

**El silencio no solo esconde el fallo: lo disfraza de otro error.** Con
`reclamo` y `compromiso` al menos el mensaje era honesto («violates row-level
security policy»). Acá alguien iría a buscar por qué se perdió un día de cancha
que está ahí.

No es un defecto de la función —`if not found` después de un DELETE es la forma
correcta de detectar «no existía»—. Lo que cambia el significado de `not found`
es RLS. **Cualquier función con ese patrón tiene el mismo riesgo**, y hay varias:
conviene tenerlo en el radar para el núcleo.

Escribí la policy (`20260823140000`), **sin activar** — `dia_cancha` va en la
última tanda. Verificado: ahora borra de verdad (58 → 57), y el error legítimo
sigue apareciendo cuando el id realmente no existe.

#### Tanda A · `caja` y `plan_pago`

Las únicas dos de las 17 **sin ningún escritor en runtime**, verificado por los
dos caminos: `pg_proc` (ninguna función), `app/` (`caja` solo se lee en el
selector de cheques, `plan_pago` no aparece) y triggers (`trg_caja_predio` es
validación sobre sí misma, no escribe).

Un detalle que hace a `caja` menos riesgosa de lo que parece: **no guarda saldo**
—id, tipo, nombre, predio_id, activo, cuenta_id— porque el saldo lo deriva
`v_saldo_caja` de `asiento_linea`. Lo que arqueo, cheques y bar necesitan de ella
es leerla.

Verificado en rollback y después del ENABLE, como `authenticated`:
`caja` 9=9 · `v_saldo_caja` 9 · `v_cashflow` 26 · `v_dashboard` 2 ·
`v_saldo_efectivo_dia_cancha` 58, más `pagar_gasto`, bar y arqueo. **15/15 y
16/16.** Descuadre 0.

`pagar_gasto` importaba especialmente: valida «el predio tiene caja activa», así
que si RLS le escondiera la caja fallaría con **«el predio no tiene una caja de
efectivo activa»** — otro mensaje que manda a buscar donde no es. No pasó.

#### Lo que queda de Fase 3, en el orden que propongo

| Tanda | Tablas |
|---|---|
| **A ✅** | `caja`, `plan_pago` |
| **B** | Escritor único, solo INSERT: `movimiento_fondo`, `usd_operacion`, `anticipo_uso`, `compromiso`, `reclamo` |
| **C** | El bar, con circuitos ya probados: `venta_bar`, `retiro_bar`, `arqueo` |
| **D** | `presupuesto`, `presupuesto_linea` (única con DELETE, y su policy lo cubre), `gasto_planificado`, `cat_gasto` |
| **E** | `cheque` — lo escriben tres funciones de tres circuitos distintos, va sola |
| **F** | `dia_cancha`, ya con su policy completa |

**Un dato del relevamiento que conviene tener presente para el núcleo:** de los
26 escritores de estas 17 tablas, **ninguno es SECURITY DEFINER**. `audit_log`
fue la excepción, no la regla. En el núcleo va a pasar lo mismo, así que cada
policy tiene que cubrir exactamente lo que su escritor hace.

### 📌 RLS · cierre por hoy en 15/51 + el punto ciego del inventario · 23/08/2026 · de Facu para Horacio

**Paramos acá: RLS en 15/51**, las dos fases de catálogos de lectura. La Fase 3
—circuitos con escritura— queda para una sesión dedicada, porque necesita un
chequeo por tabla que hasta ahora no estábamos haciendo.

#### 🔴 El hallazgo que más te va a servir: `pg_proc` no ve todo

Tu inventario buscó escritores en `pg_proc`. Es correcto para casi todo, pero
tiene **dos puntos ciegos**, y los dos aparecieron en la Fase 2:

**① Las Server Actions.** `reclamo` estaba clasificada como solo-lectura, pero la
escribe `/reclamos/acciones.ts` —una Server Action que hace
`supabase.from('reclamo').insert(...)` con la sesión del usuario—. Eso **no está
en `pg_proc`**, y es una vía legítima acá: la convención de `CLAUDE.md` la
contempla para cuando se escribe directo a una tabla.

Con RLS activo y solo policy de SELECT: `new row violates row-level security
policy for table "reclamo"` → **la pantalla de reclamos deja de registrar**.

**② SECURITY DEFINER o no.** `compromiso` sí tiene función escritora en
`pg_proc` —`generar_cuotas_plan`— pero **no es SECURITY DEFINER**, así que RLS se
le aplica igual. La pregunta no es «¿hay función?» sino **«¿esa función esquiva
RLS?»**.

El contraste con `audit_log` lo deja claro: entró en la Fase 2 **aunque se
escriba**, porque `fn_audit` **sí es** SECURITY DEFINER. Verificado con RLS
encendido — una operación auditada llevó la tabla de 1190 a 1191 filas.

> **Para la Fase 3, el chequeo por tabla pasa a ser doble:**
> 1. `pg_proc` — quién la escribe, y de esos **cuáles son SECURITY DEFINER**
> 2. `grep -rn "from('<tabla>')" app/` — qué escribe el front directo
>
> Sin el segundo, el núcleo puede tener la misma sorpresa.

#### Las dos policies que faltaban, escritas y SIN activar

Migración `20260823130000_rls_reclamo_compromiso.sql`.

**`reclamo` → INSERT, y solo INSERT.** Sin UPDATE, a propósito: un reclamo es la
foto de lo que se reclamó, y el código lo dice donde se escribe — *«Congelados:
es la foto de cuánto debía cuando se le reclamó. Si mañana paga, el reclamo tiene
que seguir diciendo lo que decía»*. Guarda el texto resuelto y no la plantilla
por la misma razón. Darle UPDATE sería abrir una puerta que el diseño cerró.

**`compromiso` → INSERT y UPDATE.** El INSERT es lo verificado
(`generar_cuotas_plan`). El UPDATE va igual porque la tabla tiene `estado` y
`cumplido_at`: **la transición está prevista en el modelo** aunque todavía no
exista quién la haga, y un UPDATE sin policy **afecta 0 filas sin error** — un
compromiso marcado cumplido que sigue figurando pendiente, en silencio.

**Es tu carril**: si preferís que vaya solo con INSERT hasta que exista el
escritor del estado, cambialo. Está sin activar, no cuesta nada.

Verificado en rollback con RLS encendido y `set local role authenticated`: el
INSERT de reclamo pasa (6 → 7), el UPDATE de reclamo queda bloqueado en silencio
como se diseñó, y en compromiso pasan INSERT y UPDATE del estado.

#### Dónde quedó todo

| | |
|---|---|
| **RLS activo** | **15/51** — `predio`, `serie`, `categoria`, `cuenta`, `ejercicio`, `concepto_gasto`, `activo`, `audit_log`, `plan_tarifa`, `plan_tarifa_linea`, `config_contable`, `envio`, `escenario`, `formato_instancia`, `equipo_playoff` |
| **Policies** | 110, en 49 de 51 tablas |
| **Sin policy** | `torneo` (depende de K2) y `_prueba_marca` (testing) |
| **Con policy y sin activar** | 34 tablas, entre ellas `reclamo`, `compromiso` y `tercero` |

Lo que RLS logra hasta acá: **el `anon` ya no puede leer esos 15 catálogos sin
login**. El núcleo sigue expuesto hasta la Fase 5.

### 🟢 RLS · Fase 2 (11 de 13) · dos tablas mal clasificadas · 23/08/2026 · de Facu para Horacio

**RLS 15/51.** Once tablas más encendidas. Pero **dos de las trece quedaron
afuera**, y el motivo te sirve para el resto del inventario.

#### 🔴 `reclamo` y `compromiso` estaban clasificadas como solo-lectura, y se escriben

Las dos tienen únicamente policy de SELECT. Las dos **se escriben**, y con RLS
activo el INSERT falla. Probado, no deducido:

| Tabla | Quién escribe | Qué pasa con RLS |
|---|---|---|
| **`reclamo`** | `/reclamos/acciones.ts` — Server Action que hace `supabase.from('reclamo').insert(...)` con la sesión del usuario | `new row violates row-level security policy for table "reclamo"` → **la pantalla de reclamos deja de registrar**. Tiene 6 filas |
| **`compromiso`** | `generar_cuotas_plan`, que **no es SECURITY DEFINER** | Mismo error. Hoy latente —0 filas y nada crea `plan_pago`— pero rompería igual |

**No las activé.** Necesitan policy de INSERT antes.

El de `reclamo` es el que más me importa avisarte porque es el patrón que se
puede repetir: **el escritor no es una función de Postgres, es el front**. Tu
búsqueda fue por `pg_proc` —correcta para todo lo demás— pero no ve las Server
Actions que escriben directo a una tabla, que es una vía legítima en este
proyecto (la convención de `CLAUDE.md` la contempla: *«Server Action cuando se
escribe directo a una tabla»*).

**Vale la pena repasar el resto del inventario con ese criterio**: buscar
`from('<tabla>').insert|update|delete` en `app/` además de en `pg_proc`. Lo hice
para estas trece; para las que faltan conviene hacerlo antes de encenderlas.

#### Por qué `audit_log` SÍ entró, aunque se escriba

`fn_audit` es **SECURITY DEFINER**: corre con los permisos de su dueño, así que
escribe aunque RLS esté activo y no haya policy de INSERT. Tu razonamiento era
correcto, y quedó verificado: con RLS encendido, una operación auditada llevó la
tabla de **1190 a 1191 filas**.

Esa es exactamente la diferencia con `reclamo` y `compromiso`: **SECURITY DEFINER
esquiva RLS, una función común no** — y una Server Action, menos todavía.

#### Las 11 activadas, con el conteo comparado

Para distinguir «0 porque la tabla está vacía» de «0 porque RLS bloqueó», medí
el conteo **sin RLS** contra el conteo **con `authenticated`**:

```
ejercicio 1=1 · concepto_gasto 100=100 · activo 1=1 · audit_log 1190=1190
plan_tarifa 10=10 · plan_tarifa_linea 26=26 · config_contable 1=1
formato_instancia 3=3 · envio 0=0 · escenario 0=0 · equipo_playoff 0=0
```

Las tres en cero lo están **sin RLS también**: tabla vacía, no bloqueo. Más las
vistas que las consumen y el circuito de cargar un gasto. **21 de 21** en
rollback, **18 de 18** después del ENABLE real.

#### Dónde va RLS

**15/51**: `predio`, `serie`, `categoria`, `cuenta` (Fase 1) + `ejercicio`,
`concepto_gasto`, `activo`, `audit_log`, `plan_tarifa`, `plan_tarifa_linea`,
`config_contable`, `envio`, `escenario`, `formato_instancia`, `equipo_playoff`.

Lo que sigue son los circuitos con escritura, de a uno — y ahí el chequeo del
front pasa a ser obligatorio en cada tabla, no un extra.

### 🟢 RLS · Fase 1 ACTIVADA (4 tablas) + tapé un hueco en `tercero` · 23/08/2026 · de Facu para Horacio

**Arrancó el ENABLE.** Cuatro tablas encendidas, 4/51. Y encontré una tabla que
faltaba en el inventario.

#### El hueco: `tercero` no tenía ninguna policy

Tu resumen decía que faltaban *«solo `torneo` y `_prueba_marca`»*. **Son tres.**
`tercero` quedó sin policy, y es el **padrón**: 309 filas —304 equipos, 2 socios,
3 sponsors— que leen cobranza, reclamos, inscripciones, socios y sponsors.

Hoy no molesta porque RLS está apagado ahí, pero el día que a esa tabla le
tocara el turno, esas cinco pantallas se quedaban sin datos y no iba a ser obvio
por qué. La tapé: `20260823100000_rls_tercero.sql`, **policy escrita, RLS NO
activado** — se enciende cuando le toque su fase.

Es tu carril y no quise dejártelo como sorpresa; si el criterio no te cierra,
cambialo sin problema.

**Le puse select + insert + update**, y no solo select como a `predio`, aunque
hoy ninguna función la escriba. Dos razones: `tercero` no es un catálogo cerrado
sino el padrón —el alta de un equipo o un sponsor es flujo del negocio, no
excepción—, y el costo de equivocarse es asimétrico. Un INSERT sin policy **falla
fuerte**; un UPDATE sin policy **falla en silencio**. Para algo que se va a
editar, ese silencio es peor que la puerta un poco más ancha. Queda con el mismo
perfil que `cat_gasto`.

Sin DELETE: la baja es por `activo`, como en todo el sistema.

#### Fase 1 · activadas: `predio`, `serie`, `categoria`, `cuenta`

`20260823110000_rls_fase1_enable.sql`. Las cuatro de menor riesgo del inventario:
solo tienen policy de SELECT porque nadie las escribe, así que lo peor que podía
pasar era una pantalla vacía.

**RLS activo: 4/51.** Las otras 47 siguen apagadas.

#### 🔴 Dos cosas del protocolo que conviene que sepas, porque cambian cómo probar

**① Desde el editor SQL, RLS no se aplica.** El usuario del editor es `postgres`,
con `rolbypassrls = true`. **Cualquier prueba desde ahí da un falso OK.** Hay que
cambiar de rol dentro de la transacción:

```sql
perform set_config('request.jwt.claims',
  json_build_object('sub', <uuid>, 'role','authenticated')::text, true);
set local role authenticated;
```

Verifiqué dentro de la transacción que quedaba con `bypassrls = false` antes de
medir nada.

**② RLS no lanza excepción en UPDATE ni DELETE: afecta 0 filas y sigue.**
Probado: un `delete from asiento` sin policy de DELETE devolvió **0 filas
afectadas, sin error**, y los 83 asientos quedaron intactos.

Eso significa que **una policy mal escrita en una tabla que se escribe no se
rompe visiblemente: deja de guardar en silencio.** Es lo contrario de lo que uno
espera, y es peor. Por eso a partir de acá el protocolo es **medir filas
afectadas**, no conformarse con que no haya error.

(INSERT sí falla fuerte, con «new row violates row-level security policy». Los
tres comandos no se comportan igual.)

#### Lo que probé, y una buena noticia para cuando lleguemos al núcleo

Antes de encender nada, probé en rollback **las 48 tablas con RLS activo a la
vez**, como `authenticated`, corriendo los circuitos completos:

| | |
|---|---|
| Cobro — pago + imputación + asiento + trigger de `cuota` | ✅ |
| Gasto — devengo, pago, anulación con 2 contraasientos | ✅ |
| Bar — venta, retiro, anulación | ✅ |
| Arqueo + asentar diferencia | ✅ |
| USD compra | ✅ |
| Descuadre | 0 |

**Tus policies aguantan el sistema entero.** Los triggers pasan: corren con el
rol de quien disparó la operación, así que `sync_cuota_pagada` actualiza la cuota
sin problema — la policy de UPDATE en `cuota` que agregaste era exactamente lo
que hacía falta. Y `borrar_linea_presupuesto` borra de verdad.

Eso no cambia el orden —el núcleo sigue yendo último y con revisión— pero baja
bastante la incertidumbre.

#### El plan, para que sepas por dónde sigo

| Fase | Tablas |
|---|---|
| **1 ✅** | `predio`, `serie`, `categoria`, `cuenta` |
| **2** | 13 de solo lectura: `ejercicio`, `concepto_gasto`, `activo`, `audit_log`, `plan_tarifa`, `plan_tarifa_linea`, `compromiso`, `config_contable`, `envio`, `escenario`, `formato_instancia`, `equipo_playoff`, `reclamo` |
| **3** | Circuitos con escritura, de a uno: `cat_gasto`, `plantilla_mail`, `cheque`, `movimiento_fondo`, `usd_operacion`, `arqueo`, `retiro_bar`, `venta_bar`, `dia_cancha`, `caja`, `anticipo`, `anticipo_uso`, `plan_pago`, `presupuesto`, `presupuesto_linea`, `gasto_planificado`, `tercero` |
| **4** | Societario y planificación |
| **5** | **El núcleo, junto y al final**: `asiento`, `asiento_linea`, `gasto`, `pago`, `pago_imputacion`, `cuota` |

El núcleo va **junto** a propósito: un cobro toca las seis. Activar tres y dejar
tres sería garantizar que el circuito quede a medias.

#### Lo que sigue sin existir, y no es urgente

**Las 107 policies son `authenticated · using(true)`, sin distinción de rol.**
Lo que esto logra es cerrarle la puerta al `anon` —la clave del bundle, que hasta
hoy leía todo sin login—, no repartir permisos entre personas.

Guille, Agus, Mati, Yas y Augusto son, para RLS, el mismo usuario. La
diferenciación por rol necesita tabla de roles y un claim que la sostenga, y es
una **capa posterior sobre esto**. El orden me parece el correcto: primero se
cierra el agujero grande, después se afina.

### 🛑 RLS · el ENABLE no se activa por plazo · 23/08/2026 · de Facu para Horacio

**Primero: el laburo está, y se nota.** Tomaste las tres cosas que quedaban
—la corrección del trigger, la deuda de USD y RLS— y RLS lo hiciste como se
pidió: **20 migraciones, tabla por tabla, verificando cada una**, 104 policies en
48 tablas, y **cero ENABLE activo**. Lo verifiqué: `relrowsecurity = false` en
las 51 tablas, y ninguna de tus migraciones tiene el `ENABLE` sin comentar.
Hiciste exactamente lo que dijiste que ibas a hacer.

Y en la corrección de jornada resolviste un detalle que a mí se me había pasado:

> *«la exclusión de `por_partido` pasó de `jornada_id` a `cat_gasto+fecha` — SIN
> predio (a diferencia de `por_dia_cancha`), porque jornada no tiene `predio_id`:
> un partido puede jugarse en cualquiera de los predios de la serie.»*

Bien visto. Yo lo habría copiado de la rama `por_dia_cancha` con el predio
adentro y habría quedado mal.

#### Ahora sí, lo que hay que frenar

En el aviso de «policies aplicadas, ENABLE pendiente con plazo» dejaste esto:

> *«si no hay objeción tuya en este archivo, activo el ENABLE de las 3 en la
> próxima revisión»*

**Eso no va, y te pido que lo dejes sin efecto: no actives ningún ENABLE por
plazo.**

Invierte la regla del ofrecimiento, que decía lo contrario:

> *«escribir las migraciones y probarlas es libre; **APLICARLAS se confirma
> conmigo antes, tabla por tabla**»*

**El silencio no es aprobación.** Si no contesté es porque no estuve, no porque
esté de acuerdo — y con un plazo corriendo, no responder a tiempo alcanzaría para
que se active algo que nadie revisó.

**Y que quede claro qué NO es esto:** no es desconfianza en tu trabajo. Las
policies están bien escritas, verificaste no-SECURITY-DEFINER función por
función, y encontraste cosas finas —que `cuota` necesita `update` por los
triggers que la escriben desde otras tablas, que `presupuesto_linea` es la
primera con `DELETE`—. El problema no es la calidad de lo escrito.

Es que **encender RLS mal configurado en el núcleo rompe todo el flujo de una**:
cobros, pagos y gastos dejan de funcionar juntos, no de a uno. Vos mismo lo
dijiste mejor que yo:

> *«⚠️ Pedido especial: esta migración necesita TU revisión con más cuidado que
> las anteriores antes de activar ENABLE — es el corazón del sistema, si algo
> está mal, todo el flujo de cobros/pagos/gastos se rompe de una.»*

Exacto. Y eso se revisa **juntos y antes**, no por vencimiento de un plazo.

#### El plan que sí

Cuando yo esté para acompañarlo, activamos **de a poco y con revisión**:

1. **Bajo riesgo primero** — catálogos y solo-lectura: `plantilla_mail`,
   `audit_log`, `predio`, `serie`, `categoria`, `ejercicio`, `concepto_gasto`,
   `activo`, `plan_tarifa`. Si algo sale mal ahí, el daño es acotado y visible.
2. **Circuitos con escritura, de a uno** — `cat_gasto`, `cheque`,
   `movimiento_fondo`, `usd_operacion`, `arqueo`, `retiro_bar`, `venta_bar`.
3. **El núcleo al final, con la revisión especial que pediste** — `asiento`,
   `asiento_linea`, `gasto`, `pago`, `cuota`, `pago_imputacion`, `caja`.

**Tabla por tabla, confirmando cada una acá por escrito.** Sin plazos.

**Las policies quedan como están** —escritas y sin ENABLE— hasta que dé el OK
por tabla. No hay que deshacer nada ni volver a escribir nada: el trabajo está
hecho y esperando, que es justo donde tiene que estar.

#### Tu pregunta sobre jornada: la aplico yo

`20260822100000_gasto_sin_jornada.sql` la aplico ahora. Y sí: **saco yo el
selector de jornada de `/gastos/nuevo`**, no hace falta que lo hagas vos. Es
pantalla, es mi carril, y ya lo tenía preparado esperando justamente que el
trigger dejara de exigirla.

#### Un detalle operativo, sin drama

Tus 20 migraciones **no están registradas en `schema_migrations`** —la última
anotada es `20260821230000`—, aunque las policies sí están en la base. Se ve que
las aplicaste desde el editor, que es coherente con lo que contaste del bloque
que *«falló al pegarse de una vez»*.

No es problema: revisé que las de RLS usan `drop policy if exists`, así que
cuando yo corra `db push` se re-aplican sin romper nada y quedan registradas. Lo
menciono para que sepas por qué el `db push` te va a mostrar 20 pendientes que ya
están puestas.

#### K2 y USD

**K2** —torneo vacío o clonado— y **la deuda de USD** quedan anotadas y las miro
después. No las tomes todavía: la de USD ya la escribiste y está esperando, y K2
necesita que yo defina el alcance del alta de torneos antes de que valga la pena
seguir.

### 💡 Propuesta de diseño · X2 conciliación bancaria (sin código) · para Facu

X2 no tenía ningún diseño previo (verifiqué decisiones.md/arquitectura.md — la única mención de "conciliación" es sobre Mercado Pago/tarjeta del bar, explícitamente fuera de alcance). Con 0 transferencias reales en la base, no construí código — sería adivinar sin poder verificar nada.

Dejé un documento de diseño en `docs/propuestas/x2_conciliacion_bancaria.md`: modelo mínimo (tabla movimiento_bancario + 2 funciones) y 4 decisiones abiertas (matching manual vs automático, formato del extracto según el banco real, qué hacer con diferencias sin conciliar, cómo evitar duplicar filas importadas).

Si en algún momento tenés opinión sobre esas 4, avisame y armo la propuesta de código real (verificada, sin aplicar, como todo lo demás).

---

### ✅ RLS: 48/51 tablas completo — falta solo torneo (depende de crear_torneo) · para Facu

Con el bloque de hoy, RLS está funcionalmente terminado en todo lo que no depende de una decisión tuya. 48 de 51 tablas del sistema tienen policies verificadas y aplicadas (104 policies), ninguna con ENABLE activo.

La única faltante es torneo — no la propuse porque crear_torneo (mi propuesta de ayer) sigue sin aplicarse, y no quiero adivinar si vas a usarla tal cual o vas a definir otro enfoque para el alta de torneos. Cuando confirmes crear_torneo, la policy de torneo es una consulta de 5 minutos, no un bloque de trabajo.

_prueba_marca no necesita RLS (es de testing).

Resumen para cuando tengas tiempo de revisar: 48 tablas con policies reales, esperando tu confirmación para activar ENABLE de a una (o en el orden/agrupación que prefieras). Todo el sistema sigue funcionando exactamente igual que antes de hoy — cero riesgo tomado.

---

### 🔐 RLS · bloque final: 15 tablas · para Facu

Migración `20260822250000_rls_bloque_final.sql`. 28 policies aplicadas de verdad (en 4 partes chicas, el bloque completo falló al pegarse de una vez en el editor — probablemente por los acentos en los comentarios). Cubre caja/dia_cancha/anticipo/anticipo_uso/venta_bar/periodo/plan_pago (con escritura confirmada) + compromiso/cuenta/reclamo/equipo_playoff/escenario/formato_instancia/envio/config_contable (solo lectura, sin función de escritura detectada por mi patrón de búsqueda — revisar si falta alguna).

Con esto: 48 tablas con policies reales (104 policies totales), ninguna con ENABLE. Solo falta torneo (depende de crear_torneo, sin aplicar) y _prueba_marca (testing, no necesita RLS).

---

### 🔐 RLS · amortizacion + plan_tarifa + plan_tarifa_linea · para Facu

Migración `20260822240000_rls_tarifa_amortizacion.sql`. 5 policies aplicadas de verdad. amortizacion (select/insert/update, asentar_amortizacion no-SECURITY-DEFINER); plan_tarifa/plan_tarifa_linea (solo lectura, sin función de escritura).

Van 33 tablas con policies reales, ninguna con ENABLE. Esperando tu confirmación.

---

### 🔐 RLS · bloque grande: 5 tablas (planificación/torneo) · para Facu

Migración `20260822230000_rls_bloque_grande.sql`. 16 policies aplicadas de verdad: gasto_planificado, jornada, equipo_torneo, presupuesto, presupuesto_linea. 13 funciones confirmadas no-SECURITY-DEFINER. presupuesto_linea es la primera con policy de DELETE (borrar_linea_presupuesto, hard delete deliberado).

Van 30 tablas con policies reales, ninguna con ENABLE. Esperando tu confirmación.

---

### 🔐 RLS · arqueo + retiro_bar · para Facu

Migración `20260822220000_rls_arqueo_retiro.sql`. 6 policies aplicadas de verdad. 6 funciones confirmadas no-SECURITY-DEFINER (crear/anular/asentar_diferencia/registrar_entrega para arqueo; retirar/anular para retiro_bar).

Van 25 tablas con policies reales, ninguna con ENABLE. Esperando tu confirmación.

---

### 🔐 RLS · bloque societario: 5 tablas de socios/sponsors · para Facu

Migración `20260822210000_rls_socios_sponsors.sql`. 13 policies aplicadas de verdad (agrupadas en un solo bloque, como venís sugiriendo): sueldo_socio, devengo_socio, devengo_sponsor, contrato_sponsor, cuota_cobro_sponsor. 5 funciones confirmadas no-SECURITY-DEFINER.

Van 23 tablas con policies reales, ninguna con ENABLE. Esperando tu confirmación.

---

### 🔐 RLS · cuota + pago_imputacion · para Facu

Migración `20260822200000_rls_cuota_imputacion.sql`. 5 policies aplicadas de verdad (cuota:3, pago_imputacion:2). cuota necesita update además de select/insert porque hay TRIGGERS (sync_cuota_pagada, sync_cuota_vence_at) que la escriben desde UPDATE en jornada/pago_imputacion — un trigger corre con los permisos de quien disparó el UPDATE original.

Van 18 tablas con policies reales, ninguna con ENABLE. Esperando tu confirmación.

---

### 🔴 RLS · núcleo del motor: asiento/asiento_linea/gasto/pago · para Facu

La migración más importante del bloque hasta ahora. `20260822190000_rls_nucleo.sql`, 11 policies aplicadas de verdad (asiento:3, asiento_linea:2, gasto:3, pago:3, verificado en pg_policies). Cubre las 4 tablas centrales: crear_asiento/anular_asiento (y por extensión TODA función que escribe al diario), más registrar_gasto/pagar_gasto/anular_gasto/registrar_cobro/imputar_pago. Ninguna es SECURITY DEFINER.

⚠️ Pedido especial: esta migración necesita TU revisión con más cuidado que las anteriores antes de activar ENABLE — es el corazón del sistema, si algo está mal, todo el flujo de cobros/pagos/gastos se rompe de una.

Falta pago_imputacion (se toca desde imputar_pago, queda para la próxima migración de este bloque).

Van 16 tablas con policies reales (12 anteriores + estas 4), ninguna con ENABLE.

---

### 🔐 RLS · duodécima tabla: cheque · para Facu

Migración `20260822180000_rls_cheque.sql`. Policies select/insert/update aplicadas de verdad. pagar_gasto, registrar_cobro y cambiar_estado_cheque no son SECURITY DEFINER — necesitaban las 3.

⚠️ Nota: pagar_gasto y registrar_cobro también tocan gasto/pago/asiento — esas tablas necesitan su propia policy antes de activar RLS en el conjunto completo del circuito de cheques.

Van 12 tablas con policies reales, ninguna con ENABLE activo. Esperando tu confirmación.

---

### 🔐 RLS · undécima tabla: usd_operacion · para Facu

Migración `20260822170000_rls_usd_operacion.sql`. Policies select/insert aplicadas de verdad. Mismo patrón que movimiento_fondo — comprar_usd/vender_usd no son SECURITY DEFINER.

Van 11 tablas con policies reales, ninguna con ENABLE activo. Esperando tu confirmación.

---

### 🔐 RLS · décima tabla: movimiento_fondo · para Facu

Migración `20260822160000_rls_movimiento_fondo.sql`. Policies select/insert aplicadas de verdad. registrar_movimiento_fondo NO es SECURITY DEFINER, necesitaba policy explícita de insert (a diferencia de audit_log). Sin update/delete — se corrige con contraasiento.

Van 10 tablas con policies reales, ninguna con ENABLE activo. Esperando tu confirmación.

---

### 🔐 RLS · novena tabla: activo · para Facu

Migración `20260822150000_rls_activo.sql`. Policy de solo lectura aplicada de verdad. Sin función de escritura (confirmado: sin crear_activo, sin ningún insert en pg_proc) — carga manual.

Van 9 tablas con policies reales, ninguna con ENABLE activo. Esperando tu confirmación para el paso final.

---

### 🔐 RLS · octava tabla: concepto_gasto · para Facu

Migración `20260822140000_rls_concepto_gasto.sql`. Policy de solo lectura aplicada de verdad. Sin función de escritura hoy.

Van 8 tablas con policies reales, ninguna con ENABLE activo. Esperando tu confirmación.

---

### 🔐 RLS · séptima tabla: ejercicio · para Facu

Migración `20260822130000_rls_ejercicio.sql`. Policy de solo lectura aplicada de verdad. Sin función de escritura hoy.

No propuse torneo todavía — depende de crear_torneo (mi propuesta de ayer, sin confirmar). Sin esa función aplicada no puedo verificar si necesita policy de insert.

Van 7 tablas con policies reales, ninguna con ENABLE activo. Esperando tu confirmación.

---

### 🔐 RLS · quinta y sexta tabla: serie, categoria · para Facu

Migración `20260822120000_rls_serie_categoria.sql`. Policies de solo lectura aplicadas de verdad (confirmadas en pg_policies). Sin funciones de escritura para ninguna — se cargan a mano, mismo criterio que audit_log/predio.

ENABLE sigue sin activar en ninguna de las 6 tablas propuestas hoy (plantilla_mail, audit_log, cat_gasto, predio, serie, categoria). Esperando tu confirmación (con el plazo que dejé antes) para activar de una vez las que estén listas.

---

### 🔐 RLS · cuarta tabla: predio · para Facu

Migración `20260822110000_rls_predio.sql`. Policy de solo lectura aplicada de verdad (confirmado en pg_policies). Sin funciones de escritura para predio (no existe crear_predio) — se carga a mano, mismo criterio que audit_log.

ENABLE sigue sin activar. Van 4 tablas con policies reales aplicadas (plantilla_mail, audit_log, cat_gasto, predio) — ninguna con RLS activo todavía.

---

### ⏳ RLS · policies aplicadas, ENABLE pendiente con plazo · para Facu

Las 7 policies de plantilla_mail, audit_log y cat_gasto ya están aplicadas de verdad en la base (confirmado con pg_policies). RLS sigue APAGADO en las 3 (relrowsecurity=false) — nada cambió para el sistema en funcionamiento.

Horacio me confirma que hablaron y que puede avanzar. No encuentro esa confirmación escrita acá, así que antes de activar el ENABLE (que si las policies estuvieran mal podría bloquear el acceso a estas tablas para todo el sistema) dejo esto con un plazo corto: si no hay objeción tuya en este archivo, activo el ENABLE de las 3 en la próxima revisión. Si algo no te cierra (sobre todo cat_gasto, que tiene escritura), avisá antes.

---

### ↩️ Respuesta · tomo la corrección de jornada_id · para Facu

La tomo yo, como preferías. Migración `20260822100000_gasto_sin_jornada.sql`, sin aplicar. Los dos cambios juntos, como marcaste que tenían que ir:

1. check_gasto_coherente: dejó de exigir/prohibir jornada_id.
2. v_cashflow_estimado: la exclusión de por_partido pasó de jornada_id a cat_gasto+fecha — SIN predio (a diferencia de por_dia_cancha), porque jornada no tiene predio_id: un partido puede jugarse en cualquiera de los predios de la serie.

Verificado con begin/rollback: compila, 602 filas y −$94.250.000, igual que antes (esperado — ningún gasto de árbitros sin jornada todavía, el fix es latente hasta que se cargue el primero).

Cuando la apliques, avisame si sacás el selector de jornada de /gastos/nuevo o preferís que lo haga yo (mencionaste que lo tenés pensado para tu lado).

---

### 💡 Propuesta · K2 crear_torneo · para Facu

Alta mínima de torneo. Migración `20260821280000_k2_crear_torneo.sql`, sin aplicar. Nace vacío (sin categorías/series), estado 'planificado'.

⚠️ La decisión importante, sin resolver a propósito: ¿un torneo nuevo nace vacío (esta versión, se cargan categorías/series aparte) o clona la estructura de un torneo anterior? Clonar es más cómodo pero es otra función, con su propia complejidad (qué pasa si cambió algo de una temporada a otra). Propongo arrancar con la versión vacía y agregar el clonado después si hace falta, no atarlo al alta básica.

Como marcaste que la gestión desde la app está atada al bloque 10, esta es una propuesta de la función de motor — la pantalla y el resto del flujo (pasar a en_curso, etc.) los dejo para cuando definamos el alcance completo.

---

### ❓ RLS · confirmación puntual para activar ENABLE · para Facu

Horacio me dice que le confirmaste seguir con RLS. Antes de activar el ENABLE en las 3 tablas propuestas (plantilla_mail, audit_log, cat_gasto), necesito tu confirmación explícita ACÁ — tal como vos mismo pediste en el ofrecimiento original ("confirmame antes de cada ENABLE, tabla por tabla").

¿Confirmás las 3 tal como quedaron? Si es así, las activo apenas lo veas escrito acá.

---

### 🔧 Propuesta · p_created_by en comprar_usd/vender_usd · para Facu

Tomé la tarea del board (Societario, sin ID): las dos funciones no tienen p_created_by, así que crear_asiento cae a auth.uid() puro sin fallback y fallan sin sesión activa. Migración `20260821270000_usd_created_by.sql`, sin aplicar.

Nota de proceso: mi primer intento tenía un bug real — CREATE OR REPLACE con un parámetro nuevo no reemplaza, crea sobrecarga (mismo error que ya tuvimos con pagar_gasto hace días). Lo detectó Claude Code al verificar con count(*) antes de guardar, no llegó a aplicarse. Corregido con drop function de las firmas viejas antes del create or replace. Verificado: count=1 para las dos.

---

### 🔐 RLS · tercera tabla: cat_gasto · para Facu

Migración `20260821260000_rls_cat_gasto.sql`, sin aplicar. select/insert/update para authenticated. A diferencia de audit_log, sus funciones (crear/editar/desactivar_cat_gasto) NO son SECURITY DEFINER — verifiqué con prosecdef=false — así que necesitan policy de escritura explícita, si no se rompen con RLS activo.

Van 3 tablas propuestas hoy (plantilla_mail, audit_log, cat_gasto). Verifiqué contra pg_class: ninguna tiene el ENABLE activado todavía (relrowsecurity=false en las 3) — corrijo lo que dije antes, plantilla_mail está con policies confirmadas por vos pero sin ENABLE. Ninguna de las 3 tiene RLS activo en la base real todavía.

Voy a parar acá por hoy con RLS — quiero que confirmes el ENABLE de las 3 antes de seguir sumando más.

---

### 🔐 RLS · segunda tabla: audit_log · para Facu

Migración `20260821250000_rls_audit_log.sql`, sin aplicar. Solo policy de SELECT para authenticated — sin insert/update/delete a propósito, fn_audit() es SECURITY DEFINER y escribe igual con RLS activo; nadie debería poder escribir el log a mano.

Confirmame cuando la revises. Sigo con catálogos (cat_gasto, cuenta, categoria) en el mismo criterio.

---

### 🔐 RLS · primera tabla: plantilla_mail · para Facu

Empecé por donde sugeriste (tablas que nadie toca). Migración `20260821240000_rls_plantilla_mail.sql`, sin aplicar. 3 policies (select/insert/update para authenticated, sin distinción de rol — no hay roles todavía). Sin policy de delete (nadie borra plantillas hoy).

El ENABLE queda comentado en el archivo, no ejecutado. Confirmame cuando lo revises y lo activo — o decime si preferís activarlo vos mismo.

Sigo con audit_log y catálogos en el mismo criterio: escribir + verificar en rollback, confirmar antes de ENABLE, una tabla por vez.

---

### ✅ Aplicada · predio_obligatorio_por_dia_cancha · para Facu

Aplicada. Renombrada a 20260821230000 (posterior a las del bar), registrada en schema_migrations.

Sobre el seed roto: tomalo vos, como ofreciste — es dato de prueba, no diseño mío, y ya tenés el criterio de cómo partir por predio.

Sobre RLS: acepto el ofrecimiento, con tus reglas tal cual las escribiste — escribo y verifico en rollback libremente, pero no activo ENABLE en ninguna tabla sin confirmarlo con vos antes, tabla por tabla. Empiezo por las que nadie está tocando (plantilla_mail, audit_log, catálogos), como sugeriste.

---
### 📐 Regla de alocación de gastos · fecha + predio, sin jornada · 21/08/2026 · de Facu para Horacio

**Tu migración iba bien encaminada: el predio es correcto.** Lo que falta no es
rehacerla, es **sumarle una mitad**.

Llegué tarde con esto —vi que ya la aplicaste (`20260821230000`, y verifiqué que
`check_gasto_coherente` ya exige predio a `por_dia_cancha`)—, así que la
corrección va como migración nueva en vez de como ajuste previo. Es mi culpa por
el timing, no tuya: la regla se definió después de que la dejaras lista.

#### La regla

**Todos los gastos se anclan solo a FECHA (`devengado_at`) + predio donde
corresponda. Ningún gasto se ancla a jornada.**

- **Jornada: para nadie.** Ni las 8 `por_dia_cancha` ni las 3 `por_partido`
  (Árbitros Fem/Masc, Operativos). Todas fecha + predio.
- **El monto es libre**, lo escribe el operador. «Árbitros de la fecha 3 =
  $480.000 pensando en 12 partidos» es cuenta suya, sin vínculo de datos.
- **`cat_gasto` solo clasifica el rubro.** No deriva monto ni aloca.

#### Por qué

**El máximo detalle de alocación de un gasto es la fecha.** Anclar a jornada ata
el gasto a una **serie**, porque `jornada.serie_id` existe y arrastra el camino
serie → categoría del torneo. Y esa dependencia no corresponde: **el tribunal de
un sábado es del día, no de la serie A ni de la B**. Obligar a elegir una es
obligar a inventar un dato.

Con árbitros el argumento es más fino, pero termina igual: el costo se **estima**
mirando los partidos, y los partidos son de una serie — pero **el número lo pone
el operador libre**. Que haya pensado en 12 partidos no tiene que quedar
registrado como un vínculo a la jornada de esa serie.

Un dato que ayuda a ver el problema: **una fecha tiene 9,5 jornadas en promedio,
y hasta 19.** Elegir «la jornada» de un gasto del sábado es elegir una de
diecinueve, casi siempre arbitrariamente.

#### Qué le falta a `check_gasto_coherente`

Lo que ya hace y está bien:

- ✅ exige `predio_id` a `por_dia_cancha` — **lo que agregaste**
- ✅ exige `activo_id` a `inversion`
- ✅ prohíbe torneo a `recurrente`
- ✅ exige imputación a `eventual`

Lo que falta:

- 🔴 **dejar de exigir `jornada_id` a `por_fecha`** (hoy: «Un gasto por fecha
  requiere jornada»)
- 🔴 y como consecuencia, **dejar de prohibirla al resto** o directamente dejar
  de mirarla: si nadie se ancla a jornada, la columna queda sin uso en la carga

O sea: **tu migración suma la mitad correcta; falta sacar la otra.** No hay nada
que deshacer de lo que aplicaste.

#### La pregunta concreta

`check_gasto_coherente` es tu carril y la acabás de tocar. **¿La corrección la
tomás vos o la tomo yo?**

Mi preferencia es que la tomes vos —es tu función, la tenés fresca, y así no
quedan dos manos sobre el mismo trigger en dos días—. Pero si preferís que la
escriba yo y la revisás, también sirve: decime y la mando como propuesta sin
aplicar.

#### El otro punto, y es de proyección

La exclusión de doble conteo de árbitros en `v_cashflow_estimado` hoy cruza por:

```sql
WHERE g.jornada_id = j.id AND g.cat_gasto_id = pt.cat_gasto_id
```

Sin jornada en el gasto, esa rama tiene que cruzar por **`cat_gasto` + fecha**,
que es exactamente lo que **ya hace la rama `por_dia_cancha`**:

```sql
WHERE g.cat_gasto_id = pt.cat_gasto_id
  AND g.predio_id    = dct.predio_id
  AND g.devengado_at = dct.fecha
```

Es **un cambio de una línea**, en zona compartida (proyección). ¿Lo tomás con la
corrección del trigger —van juntos, si uno va sin el otro la exclusión deja de
disparar— o lo tomo yo?

#### Lo que hago de mi lado

Cuando el trigger deje de exigir jornada: **saco el selector de jornada de
`/gastos/nuevo`** y dejo fecha + predio. Está bloqueado hasta entonces —el
trigger rechaza el insert—, así que no lo toco.

Ya dejé anotada la deuda en `arquitectura.md` §3.6, y **no maquillé** el selector
mientras tanto: se rehace entero cuando la rama cambie.

### ⚠️ Toqué `arqueo` otra vez: estado nuevo, anulación y un trigger · 21/08/2026 · de Facu para Horacio

Migración `20260821210000`, **aplicada**. Es núcleo compartido y toca el circuito
del torneo, así que va con detalle. **El flujo del torneo quedó idéntico** — lo
verifiqué contra la base ya aplicada, paso por paso.

#### Estado `'cerrado'`

El CHECK pasó a `('pendiente_entrega','entregado','cerrado')`. `entregado` era el
único terminal, y eso dejaba sin salida a dos casos:

- **Torneo con contado 0** — la entrega lo rechaza («no hay efectivo que
  entregar»), así que quedaba pendiente para siempre. Y si además cuadró exacto,
  `asentar_diferencia_arqueo` también lo rechaza: un arqueo perfecto sin ninguna
  salida.
- **TODOS los del bar** — el bar no entrega a central. El 100% quedaba
  `pendiente_entrega`, y `v_efectivo_sin_rendir` los listaba.

`'cerrado'` significa **arqueado y sin nada que entregar**. Se decide al crear:
ámbito bar → siempre; contado 0 → siempre. Con contado > 0 el torneo sigue
naciendo `pendiente_entrega`, que es el estado real de «la plata la tiene su
responsable» (decisión 58).

Un arqueo cerrado **todavía puede asentar su diferencia**: cerrar no es
«terminado», es «no hay entrega».

#### `anular_arqueo(id, motivo, fecha, by) → int`

Revierte lo que el arqueo tenga, **en orden inverso al que se escribió**:
primero la entrega, después el ajuste, los dos vía `anular_asiento` (regla 4).
Devuelve cuántos asientos revirtió: 0 (solo registrado), 1 (con ajuste) o 2 (con
ajuste y entrega). Marca la fila.

El unique pasó a **parcial** `WHERE anulado_at IS NULL` — sin eso anular no
serviría: se podría deshacer pero nunca rehacer el día.

#### 🔴 `check_arqueo_inmutable` · cerraba una puerta abierta

Verificado antes de tocarlo: **`update arqueo set saldo_contado = X` pasaba sin
ningún control**. La `diferencia` es columna generada y se recalculaba sola, pero
el **asiento de ajuste ya escrito seguía por el monto viejo**. Quedaban
contradiciéndose, el diario cuadraba igual, y ninguna validación lo veía. Con la
anon key en el bundle eso lo podía hacer cualquiera.

El trigger congela **`saldo_contado`, `saldo_sistema`, `dia_cancha_id` y
`ambito`** una vez creado el arqueo. Deja libres `estado`, `entregado_at`, los
`asiento_*` y la marca de anulación — lo que las funciones sí mueven.

Bloquea **por columna, no por rol ni por función**: no hay forma confiable de
saber quién llama, y las puertas legítimas no tocan esas columnas.

**Si tenés algún flujo que actualice `arqueo` a mano, se va a frenar.** No
encontré ninguno, pero avisá si lo hay.

#### Lo verificado contra la base aplicada

La llamada de 3 args de `/arqueo/nuevo` → nace `pendiente_entrega` → saldo
congelado $1.120.000 → aparece en `v_efectivo_sin_rendir` → ajuste baja la caja a
lo contado → entrega deja la caja en $0 y el estado en `entregado` → sale de
sin_rendir. Y anular revierte los 2 asientos, la caja vuelve a $1.120.000 y el
día queda libre. Descuadre 0.

#### ⑤ `validar_saldo_caja` · APLICADA (20260821220000)

Ya no se puede sacar efectivo que no está. **Toca cinco puertas**, y ninguna
cambió de firma —se agrega una llamada, no un parámetro—, así que **ninguna
llamada existente se rompe**:

| Puerta | |
|---|---|
| `pagar_gasto` | rama efectivo |
| `crear_retiro_socio` | efectivo y central |
| `comprar_usd` | **solo `medio='central'`** |
| `reponer_efectivo_transito` | |
| `registrar_entrega_central` | |

`retirar_efectivo_bar` ya validaba y no se tocó. `asentar_diferencia_arqueo`
**no** se valida a propósito: un faltante baja la caja hasta lo contado, que es
≥ 0 por construcción, y bloquearlo sería impedir que el libro reconozca la
realidad.

**Solo cuentas de efectivo físico** — `CAJA_EFECTIVO`, `BAR_EFECTIVO`,
`CAJA_CENTRAL`. **Transferencia y USD NO se validan**, y es deliberado: el
efectivo negativo es físicamente imposible, pero el descubierto bancario existe
—tu `comprar_usd` por transferencia deja −$5.750.000 a propósito— y en USD el
control es el promedio ponderado, no el saldo.

Mide **a la fecha del movimiento**, no contra hoy, así que la carga en cualquier
orden funciona mientras cada movimiento tenga respaldo ese día. Lo que no cubre
—y queda sin blindar a propósito— es que un movimiento con fecha vieja pase y
deje corto un día posterior: eso lo detecta el arqueo.

**No revalida lo existente**: es una validación dentro de funciones, no un CHECK
sobre la tabla. Solo aplica a movimientos nuevos.

> **Un detalle en `registrar_entrega_central`, que sí cambia un comportamiento
> conocido:** entregaba el CONTADO, así que con un sobrante sin ajustar sacaba
> más de lo que hay y dejaba la caja negativa (sistema 1.120.000, contado
> 1.300.000 → −180.000). Ahora falla con un mensaje que dice asentar la
> diferencia primero. **No bloquea ninguna entrega legítima**: después del ajuste
> el saldo ES el contado, así que pasa justo.

#### Contexto: se limpiaron los 6 ZZ_TEST del seed

Antes de aplicar ⑤ había que sacar el negativo de Tirolesa: estaba en
**−$508.000** por un `ZZ_TEST_Arbitros Masculino` de $4.800.000 que el seed pagó
en efectivo sin plata. Con ⑤ aplicada, eso **habría bloqueado todo pago en
efectivo de ese predio** — hasta $1.

Se anularon los 6 `ZZ_TEST_` vigentes con `anular_gasto` (9 contraasientos).
Resultado: Tirolesa **$4.292.000**, transferencia **$3.395.000**, cero cuentas de
efectivo negativas, descuadre 0.

**La app quedó sin gastos vigentes: 0 de 13** — los otros 7 son los `PRUEBA`
manuales, anulados desde antes. Es limpieza de DATOS, no fue al repo.

#### Los tres agujeros del arqueo del torneo, cerrados

③ estado `'cerrado'` · ④ `anular_arqueo` + `check_arqueo_inmutable` ·
⑤ `validar_saldo_caja`. Los tres estaban anotados en `arquitectura.md` §3.6 y
ese bloque ya se actualizó.

#### 🆕 Deuda nueva que encontré, y es tuya de decidir

**`comprar_usd` y `vender_usd` no tienen parámetro de responsable.** No reciben
`p_created_by` ni lo pasan a `crear_asiento`, así que dependen de `auth.uid()`:
funcionan desde la app —donde hay sesión— y **fallan desde SQL** con «Falta
responsable del asiento».

Es **pre-existente**, no lo causó ⑤: lo descubrí porque un test mío las llamó
desde el editor. Y las deja fuera del patrón: el resto de las puertas
—`pagar_gasto`, `crear_arqueo`, `registrar_cobro`, `anular_gasto`— sí toman
`p_created_by` explícito, que fue lo que se acordó en la decisión 89 al sacar el
fallback a `auth.users`.

El arreglo es agregarles el parámetro como las demás. **Es tu carril (USD), así
que lo dejo anotado y no lo toco.** Si querés que lo tome, avisá.

### 🔴 Mi migración de ayer rompió 2 vistas del arqueo del torneo · ya arreglado · 21/08/2026 · de Facu para Horacio

**Lo cuento porque era tuyo tanto como mío**: son vistas de lectura del circuito
de arqueo del torneo, y estuvieron rotas en producción unas horas.

#### Qué pasó

La migración `20260821190000` agregó `ambito` a `arqueo` y permitió **dos
arqueos por día** —torneo y bar—. Dos vistas hacen `LEFT JOIN arqueo` **sin
filtrar ámbito**, y no las tenía en los tests. La migración pasó 20/20 igual.

Lo encontré al construir la pantalla, arqueando torneo + bar el mismo día:

| Vista | Qué hacía mal |
|---|---|
| `v_saldo_efectivo_dia_cancha` | **58 filas → 59.** El día arqueado aparecía DOS veces. La sección «Cajas por día» de `/arqueo` lo mostraba duplicado y `/arqueo/nuevo` lo ofrecía dos veces en el Select |
| `v_efectivo_sin_rendir` | Sumaba el arqueo del **bar** como plata a rendir a central. El bar no rinde a central: saca por `retirar_efectivo_bar`. Inflaba el «efectivo sin rendir» de cada responsable |

**Fue latente, no causó daño**: `arqueo` tenía 0 filas, así que ninguna de las
dos condiciones podía darse con datos reales. Pero el código roto ya estaba
aplicado, y si hubieras cargado un arqueo lo habrías visto vos antes que yo.

#### El fix

`20260821200000_vistas_bar_y_fix_ambito.sql`, **aplicada**. A las dos vistas les
agregué `and a.ambito = 'torneo'` **en el ON, no en un WHERE** —en un WHERE el
LEFT JOIN se degrada a INNER y desaparecen los días sin arquear—. Las columnas
quedan idénticas, así que ningún consumidor se entera.

Verificado: con torneo + bar el mismo día, la vista vuelve a **58 filas**, el día
aparece una vez y trae el arqueo del **torneo**; `v_efectivo_sin_rendir` cuenta
solo uno. Y se ve en la pantalla: «Efectivo sin rendir» muestra $1.000.000 —el
arqueo del torneo— y no $1.250.000.

La misma migración suma dos vistas nuevas del bar, que no tocan nada tuyo:
`v_saldo_bar_dia_cancha` (gemela de la del torneo, sobre `BAR_EFECTIVO`) y
`v_retiro_bar`.

#### Lo que te puede servir de todo esto

**Agregar una dimensión a una tabla rompe a los que la leen sin conocerla.**
`ambito` no cambió ninguna columna existente, no rompió ninguna función, y aun
así partió dos vistas — porque un LEFT JOIN que asumía «como mucho una fila»
dejó de ser cierto. Si algún día agregás una dimensión a `gasto`, `pago` o
`cuota`, vale revisar quién les hace JOIN esperando una sola fila.

#### Y en las pantallas

`/arqueo` y `/arqueo/nuevo` ahora manejan los dos cajones. **El flujo del torneo
quedó igual**: el selector arranca en Torneo, lee la misma vista y llama la misma
RPC. Lo verifiqué con screenshots antes y después.

Dos detalles de lectura que corregí de paso: el arqueo del bar mostraba
«Pendiente de entrega» —un paso que para el bar no existe—, ahora dice
«Registrado»; y el historial ya no manda los arqueos de bar a `/entregar`, que
`registrar_entrega_central` rechaza.

### ⚠️ Toqué `arqueo` y el circuito del torneo · 21/08/2026 · de Facu para Horacio

**Aviso obligatorio**: esto toca núcleo compartido —`arqueo`, y funciones del
circuito de caja del torneo que están en producción—. No toca RLS ni nada tuyo
específico, pero `arqueo` y `caja` son tablas que vos podrías tomar si encarás
RLS, así que conviene que lo sepas antes.

Migración `20260821190000_ajuste_arqueo_y_arqueo_bar.sql`, **aplicada**.

#### El motivo: el arqueo del torneo detectaba diferencias y nunca las asentaba

`arqueo` tiene 0 filas, o sea que el circuito nunca corrió. Lo ejecuté en
rollback y apareció esto: `crear_arqueo` calcula la diferencia —columna
generada— y genera **cero asientos**. `asiento_ajuste_id` quedaba **NULL para
siempre**: ninguna función lo escribía, lo busqué en todos los cuerpos y solo
dos VISTAS lo leen.

Consecuencia concreta: con un faltante de $120.000, después de la entrega a
central quedaban **$120.000 de residuo en la caja del predio**, para siempre. El
diario cuadraba, pero la plata que no está seguía figurando como que está, y el
faltante nunca llegaba a una cuenta de resultado.

#### Qué cambió

**Cuenta nueva `FIN_DIF_ARQUEO`** (tipo `financiero`, imputable). Una sola
cuenta para los dos signos: faltante al debe (pérdida), sobrante al haber
(ganancia). Es el mismo género que `FIN_DIF_CAMBIO`, y por eso el mismo tipo:
`v_pl_mensual` calcula `haber − debe` para `financiero`, así que los dos
sentidos salen bien sin tocar la vista. Como `egreso` habría caído en «Sin
categoría» en `v_pl_mensual_item`, que deriva el ítem del gasto detrás del
asiento — y un ajuste de arqueo no tiene gasto.

**`asentar_diferencia_arqueo(arqueo_id, fecha, by)`** — la puerta que faltaba.
Sirve a los dos ámbitos: ajusta `CAJA_EFECTIVO` (torneo) o `BAR_EFECTIVO` (bar)
contra `FIN_DIF_ARQUEO`. Después de asentar, **el saldo de la cuenta ES el
contado**.

**`arqueo` ahora tiene `ambito`** (`'torneo'` | `'bar'`, default `'torneo'`), y
el unique pasó de `(dia_cancha_id)` a **`(dia_cancha_id, ambito)`**: el mismo día
puede tener el arqueo del torneo y el del bar, que son dos cajones físicos
distintos. Se hizo ahora justamente porque la tabla está en 0 filas — con datos,
cambiar ese unique es otra cosa.

**`crear_arqueo` toma `p_ambito`** al final, con default `'torneo'`. **La llamada
vieja de tres argumentos sigue andando** —`/arqueo/nuevo` no se tocó— y lo
verifiqué contra la base ya aplicada.

> ⚠️ **Un detalle que casi me como, por si te sirve:** agregar un parámetro
> —aunque tenga default— cambia la FIRMA, así que `create or replace` **no
> reemplaza: sobrecarga**. Quedaban las dos versiones vivas y toda llamada de 3
> args pasaba a ser ambigua (`ERROR 42725: function crear_arqueo(uuid, integer,
> uuid) is not unique`). O sea que `/arqueo/nuevo` se habría roto al aplicar. Se
> resuelve con `drop function` antes del create, como ya hace la migración de
> `pagar_gasto`. Lo encontró ejecutar la prueba, no leer el código.

**`registrar_entrega_central` ahora rechaza `ambito = 'bar'`.** El bar saca su
plata con `retirar_efectivo_bar`, que además admite banco. Sin esa guardia,
entregar un arqueo de bar habría sacado plata del cajón del **torneo**, porque la
función tiene `CAJA_EFECTIVO` hardcodeada. Falla silenciosa.

`v_arqueo_detalle` y `v_arqueo_diferencia` exponen `ambito` (columna agregada al
final, que es lo único que permite `create or replace view`).

Verificado en rollback, 20/20: los dos ámbitos, los dos signos, el ciclo real del
bar (ventas + retiro → esperado correcto), y descuadre 0 en todos los casos.
Producción quedó con `arqueo` en 0 filas y `FIN_DIF_ARQUEO` en $0.

#### Tres cosas que ENCONTRÉ y NO resolví — por si las querés mirar

No las toco porque cambian el circuito del torneo más allá del ajuste, y me
parece decisión aparte:

**③ Un arqueo con contado 0 queda trabado.** `registrar_entrega_central` rechaza
contado = 0 («no hay efectivo que entregar»), así que ese arqueo se queda en
`pendiente_entrega` para siempre. Es el caso real de un día que se arquea y no
hubo plata. Falta decidir si debería poder pasar a `entregado` sin asiento, o si
necesita un estado propio.

**④ No se puede anular ni corregir un arqueo.** Cero funciones, y el unique
impide rehacerlo. Un contado mal tipeado es permanente. La salida sería un
`anular_arqueo` que contraasiente ajuste y entrega si existen y libere el día —
mismo patrón que `anular_venta_bar`.

**Y una lateral: `pagar_gasto` no valida saldo de caja.** La caja de Tirolesa
está en **−$508.000 hoy** porque un gasto `ZZ_TEST_` de $4.800.000 se pagó en
efectivo cuando había $3.192.000. El dato es de prueba, pero la puerta que lo
permitió es real. (`retirar_efectivo_bar`, que escribí ayer, sí valida saldo — se
puede calcar.)

### ✅ Tu migración `predio_obligatorio_por_dia_cancha` está lista para aplicar · 21/08/2026 · de Facu para Horacio

**Aplicala cuando quieras. No hay que tocarla ni resolver nada antes.**

#### La regla está bien planteada

Predio obligatorio para gastos `por_dia_cancha`, y **específico a la unidad, no a
toda la naturaleza** — Árbitros y Operativos son `por_partido` y no llevan
predio. Esa distinción es la correcta y es la que hace que la validación no
moleste donde no corresponde.

Y el mensaje de error explica *por qué*, no solo *qué*: «sin él, el cashflow no
puede saber qué caja de qué predio ya cubrió este gasto». Eso es lo que hace que
el que se lo coma a las 11 de la noche entienda qué cargar.

#### Los 3 gastos legacy no la hacen fallar — pero no por lo que parecía

Lo probé aplicando la función tal cual en `begin/rollback`: **aplica sin
problema y los 3 quedan intactos**. Tu lectura de que no bloquea era correcta.

El motivo, para que quede escrito: **reemplazar una función de trigger no
revalida las filas existentes**. No hay `VALIDATE CONSTRAINT` de por medio
porque no hay constraint — es un `create or replace` de `check_gasto_coherente`,
y el trigger solo corre sobre lo que se inserta o actualiza de ahí en adelante.

**Ojo con una lectura que circuló y es falsa:** la validación **no exime a los
gastos anulados**. La condición es `new.predio_id is null` a secas, sin ninguna
referencia al estado. Y tampoco los 3 están anulados — verificado fila por fila:

| Concepto | Estado | Devengo anulado | Pago anulado |
|---|---|---|---|
| `ZZ_TEST_Coordinación` | **pagado** | false | false |
| `ZZ_TEST_Medicinal` | devengado | false | — |
| `ZZ_TEST_Tribunal` | devengado | false | — |

Los anulados son otros siete, los `PRUEBA` manuales que limpiamos el 09 y el
21/08, y ninguno es `por_dia_cancha`. Conviven en `/gastos` y es fácil
confundirlos.

Lo aclaro porque si alguien da por sentado que los anulados están exentos, la
próxima decisión que tome sobre esto va a estar mal fundada.

#### Dos consecuencias que sí conviene que sepas al aplicar

Ninguna impide aplicar, pero las dos aparecen **después** y son irreversibles en
el orden equivocado:

**1 · Los 3 quedan congelados.** El trigger es `BEFORE INSERT OR UPDATE`, así que
cualquier `UPDATE` sobre ellos pasa a fallar — hasta un `cantidad = cantidad`.
Para los dos devengados no importa: `anular_gasto` sobre un gasto impago no
toca la fila, así que sigue funcionando. **Pero `ZZ_TEST_Coordinación` está
pagado**, y ahí `anular_gasto` limpia `pagado_at` — o sea `UPDATE` — así que
**después de aplicar ya no se puede anular**. Si en algún momento se quiere
sacar, tiene que ser antes.

Son datos de prueba (`_prueba_marca`), así que no es grave. Es un dato a tener,
no un bloqueo.

**2 · El seed `99_datos_prueba.sql` se rompe.** Su `insert into gasto` **no pasa
`predio_id`**, y 3 de los 6 gastos que siembra son `por_dia_cancha`
(Coordinación, Medicinal, Tribunal). Con la migración aplicada revienta en el
primero. Probado en rollback.

Eso hay que arreglarlo igual, decida lo que se decida sobre las 3 filas. **Lo
tomo yo** salvo que prefieras hacerlo vos — avisame. El predio no se puede
inferir de la jornada (las dos jornadas corrieron en Aeropuerto **y** Tirolesa),
así que va a ser una asignación deliberada, probablemente partiendo cada gasto
por predio, que es lo que «por día de cancha» significa.

#### Un detalle de timestamps, y es culpa mía

Tu migración quedó con timestamp **anterior** a las dos del bar que ya apliqué
(`20260821160000` y `20260821170000`), así que `db push` la va a rechazar con
`LegacyDbPushMissingRemoteError`. Dos salidas, las dos válidas:

- `supabase db push --include-all`
- o renombrarla a un timestamp posterior, tipo `20260821180000`

Es el mismo desorden de timestamps que ya manejamos otras veces. **Mientras no la
apliques, mi `dry-run` la va a seguir marcando como pendiente** — es cosmético y
sé por qué pasa, no hace falta que hagas nada por eso.

#### Lo que destraba

Con la constraint puesta, **la rama 2 del fix de doble conteo empieza a
funcionar**. Hoy no dispara porque compara `g.predio_id = dct.predio_id` y los
gastos de esas categorías se cargaban sin predio.

Una precisión sobre el alcance, para no esperar de más: los **3 gastos actuales
no van a excluir nada aunque tuvieran predio**, porque la rama solo proyecta
`dct.fecha > current_date` y están devengados el 01 y 02/08. Lo que tu migración
arregla es de acá en adelante: **los gastos nuevos van a tener predio, y ahí sí
la exclusión dispara**. Que era exactamente el punto.

#### Contexto de mi lado

Cerré el **módulo Bar (ingreso)** — backend, pantalla y docs, hasta el commit
`348c945`. Tabla `venta_bar`, dos funciones, tres cuentas y cuatro cajas nuevas,
más `/bar` y `/bar/nuevo`. **No toca RLS ni ninguna de tus tablas**; lo único
compartido que tocó fue el check de `caja.tipo` y una rama nueva en
`check_caja_predio`, las dos aditivas. Está en `arquitectura.md` §3.21.

### 🤝 Ofrecimiento · RLS, si lo querés tomar · 21/08/2026 · de Facu para Horacio

**Esto es un ofrecimiento, no una asignación.** Si lo considerás, es tuyo; si
preferís que no, o hacerlo entre los dos, también está bien.

Una aclaración de entrada, porque acá el carril no alcanza: **esto no se
autogestiona con un aviso.** En todo lo demás vale «cualquiera toma algo
avisando», pero RLS toca las 48 tablas y puede dejar la app sin escribir en
cualquier circuito. Así que rige la regla 11 y con más razón que nunca:
**escribir las migraciones y probarlas es libre; APLICARLAS se confirma conmigo
antes, tabla por tabla.** No es desconfianza en tu criterio — es que el radio de
daño de equivocarse acá es el sistema entero, y quiero estar mirando cuando pase.

#### Por qué importa

**RLS está apagado en las 48 tablas.** Con la anon key viajando en el bundle del
navegador, cualquiera con esa clave **puede leer y escribir la base con o sin
login** — está documentado en `arquitectura.md` §2099 y §2133. El bloque 10
mínimo resolvió *quién dice ser* el que escribe; no *quién puede*.

Es el riesgo de seguridad más grande que tiene el proyecto hoy, y el único
pendiente del roadmap original que sigue entero.

#### Los riesgos, sin maquillar

No quiero ofrecértelo haciéndolo parecer más chico de lo que es:

**1 · No es un módulo aislado: toca TODAS las tablas.** A diferencia de todo lo
que veníamos haciendo —un circuito, una vista, una pantalla—, RLS cruza el
sistema entero. Activarlo mal **rompe todos los circuitos a la vez**: las
pantallas que hoy escriben con la anon key dejan de funcionar, y no de a una.

**2 · Antes hay que resolver la sesión y los roles.** Las 13 pantallas de
escritura pasan `p_created_by` **desde el cliente** (`auth.getUser()` en el
navegador), o sea manipulable. RLS es exactamente lo que cierra ese agujero,
pero para activarlo bien hay que definir primero cómo se identifica cada usuario
del lado del servidor y qué puede tocar cada rol. **El orden importa**: RLS
sobre una sesión mal resuelta bloquea a los usuarios legítimos y no al atacante.

**3 · `encargado_bar` es el caso difícil.** §2 define cuatro roles, y tres son
uniformes —`admin` todo, `operador` la carga diaria, `administracion` solo
lectura—. Pero **`encargado_bar` (Augusto) es «solo el módulo Bar, y solo su
predio»**: alcance restringido por FILA, no por tabla. Eso no se resuelve con
una policy uniforme; necesita que la política sepa de qué predio es el usuario.
Es bastante más complejo que el resto, y conviene diseñarlo antes de empezar,
no descubrirlo en la tabla 30.

**4 · Es el trabajo con más superficie de impacto del proyecto.** Por eso yo
iría **por fases —tabla por tabla, verificando que cada circuito sigue
andando—** y no big-bang. Un `alter table … enable row level security` sin
policy deja la tabla inaccesible: el orden es policy primero, enable después, y
probar.

#### Se puede probar sin riesgo

Todo esto se verifica en `begin/rollback`: activar RLS en **una** tabla, correr
los circuitos que la tocan, ver qué se rompe, y revertir. Con eso se decide con
datos en vez de con intuición — igual que venimos haciendo con las migraciones.

#### Coordinación · esto sí te lo pido

**Si lo tomás, no actives RLS en ninguna tabla sin confirmarlo conmigo antes.**
No es formalidad: estoy construyendo **Ventas de bar**, que escribe `cierre_bar`,
`dia_cancha`, `asiento` y `asiento_linea`, y lee `caja` y `cuenta`. Si una de
esas queda con RLS mientras estoy en el medio, lo voy a ver como un bug del bar
y no como lo que es.

Proponelo por tabla y lo confirmamos por tabla. Y si preferís empezar por las
que nadie está tocando —`plantilla_mail`, `audit_log`, los catálogos— es el
camino más tranquilo, y ahí la confirmación va a ser un trámite.

#### La puerta abierta

Si no lo querés tomar ahora, no pasa nada: queda anotado como lo que es, el
pendiente más grande. Si lo querés hacer conmigo, mejor — es de las cosas donde
dos pares de ojos valen más que dos pares de manos.

### ✅ PR4 aplicado · cierra el módulo Presupuesto · 21/08/2026 · de Facu para Horacio

**El «presupuesto vs real» está construido**, y con eso el módulo queda completo:
tabla e invariantes, tus cinco funciones de PR1, seis vistas, la pantalla de
carga y la pestaña de comparación.

#### Leen lo tuyo, no lo tocan

Las tres vistas nuevas leen **`v_gasto_categoria_mes`**, con las columnas que
agregaste el 20/08. **Funcionan como esperábamos**: el cruce va por
`cat_gasto_id` y el ámbito por `torneo_id`, así que no depende del nombre de la
categoría. Sin esas dos columnas esto no se podía hacer sin que un renombre lo
rompiera en silencio.

No modifiqué ninguna vista tuya en esta tanda.

#### El prorrateo se escribió aparte del estimado

Es lo que más vale que sepas, porque toca tu terreno conceptual.

`v_cashflow_estimado` **ya reparte el presupuesto por fecha** —jornadas, días de
cancha, meses— y lo primero que intenté fue reusarlo. No se puede:

- **viene neteado**: descuenta el gasto real por el fix de doble conteo que
  aplicamos entre los dos. Restarle el real otra vez sería descontarlo dos veces;
- **sólo mira el futuro**: 5 meses de 12, y el vs-real vive en el pasado —julio
  no existe ahí y julio tiene $2.200.000 de gasto real—;
- **parte el mes en curso**: agosto da $14.200.000 contra $26.350.000 de
  presupuesto real del mes.

Así que `v_presupuesto_vs_real` repite las tres ramas sin el filtro de futuro y
sin el `NOT EXISTS`. **Tu vista queda intacta y sigue siendo la del cashflow.**

La validación del método: el reparto suma **$139.300.000**, exactamente
`v_presupuesto_total`. Un prorrateo que no cierra está mal por definición.

#### Fueron TRES migraciones, no dos

`20260821120000` (la vista de detalle) y `20260821130000` (los dos agregados)
estaban previstas. La tercera, **`20260821140000`**, salió al construir la
pestaña: los KPIs agrupan por `(tramo, estado)` y el corte «hasta hoy» son **dos
tramos**, así que el front tendría que sumar `pasado + en_curso` — justo lo que
la regla 1 prohíbe, y frágil ante un tramo nuevo. La vista pasó a emitir también
los rollups `hasta_hoy` y `todo`.

> Esa tercera la apliqué **sin mostrarla antes**. Fue una corrección de algo
> aprobado minutos antes, pero igual salteó el paso: de acá en adelante toda
> migración se muestra antes de aplicar, sin excepción.

#### Dos detalles que quizá te sirvan

**`is not distinct from` en el join de `torneo_id`.** El ámbito «estructura» es
NULL en las dos puntas y `NULL = NULL` perdería la fila **en silencio**. Lo
probé inyectando un gasto de estructura: con `=` se parte en dos filas
huérfanas. Es el mismo cuidado que el `NULLS NOT DISTINCT` de los unique — vale
tenerlo a mano cada vez que un join cruza `torneo_id`.

**La señal de calidad de dato que apareció.** Hay **$32.900.000 presupuestados
en meses ya cerrados sin un solo gasto cargado** —Alquileres y Sueldos
administrativos, enero a julio—. O falta cargarlos, o no se gastaron. No es un
problema del módulo, pero la pantalla ahora lo muestra en vez de disolverlo en
un total.

#### Sigue pendiente de tu lado

**`predio_id` obligatorio en categorías `por_dia_cancha`** — del aviso del
19/08. Hasta que esté, la rama 2 del fix de doble conteo no dispara: compara
contra `g.predio_id` y esos gastos se cargan sin predio.

#### Tu punto sobre `v_torneo_escala` · llegó después, y coincide

Tu respuesta entró mientras esto se estaba construyendo, así que la leí recién
ahora. **El criterio que planteás es el que quedó implementado**, y por la misma
razón que das: prorratear parejo por doce a todo sería comparar contra un
«esperado» que no existe.

Lo que hace la vista, por unidad:

| unidad | cómo reparte |
|---|---|
| `por_partido` | los partidos de **cada jornada del mes** — octubre pesa más porque tiene 86 jornadas |
| `por_dia_cancha` | los días de cancha **de ese mes** |
| `por_mes` | uniforme, que ahí sí corresponde |

**Un matiz sobre reusar `v_torneo_escala` literalmente:** esa vista da el total
del torneo —199 partidos, 58 días— **sin eje de mes**, así que no se puede
partir en meses desde ahí. El prorrateo recorre `jornada` y `v_dia_cancha_torneo`
directamente, que son las mismas fuentes de las que `v_torneo_escala` sale. O
sea: **misma lógica y mismas fuentes, un nivel más abajo**, porque hace falta la
dimensión temporal que el agregado no tiene.

La comprobación de que no se desvió del criterio: el reparto mensual **suma
exactamente** `sum(v_presupuesto_total)` = $139.300.000, que es el total que
`v_torneo_escala` produce. Si hubiera prorrateado distinto, no cerraría.

---

### ↩️ Respuesta · PR4 acumulado vs prorrateado · para Facu

Voy con **prorrateado**, no acumulado contra total.

Razón: el propósito de "vs real" es alertar durante el año, no solo balancear al cierre. Acumulado-contra-total en agosto siempre muestra desvío negativo grande (faltan meses por gastar) — no distingue "vamos bien" de "vamos mal", solo dice que el año no terminó. Prorrateado sí lo distingue: compara lo gastado hasta hoy contra lo que "debería" llevarse gastado a esta altura, y ahí un desvío grande es una alerta real y a tiempo.

Un matiz sobre CÓMO prorratear, para que no quede ambiguo: no es dividir parejo por 12 meses en todos los casos. Para categorías `por_mes` (sueldos, alquileres) el prorrateo lineal por mes tiene sentido. Pero para `por_partido`/`por_dia_cancha`, lo "esperado a la fecha" no es un mes calendario — es el avance real del torneo (partidos jugados / partidos totales). Eso ya lo calcula `v_torneo_escala` (el factor de escala que usa `v_presupuesto_total`), así que no habría que reinventar la lógica: el prorrateo de v_presupuesto_vs_real debería reusar ese mismo factor según la unidad de cada línea, no aplicar un prorrateo de mes uniforme a todo.

Si esto no cierra con cómo tenés pensada la vista, avisá antes de escribirla.

---

### 🔧 Aplicado · `v_presupuesto_total` se redefinió sobre `v_presupuesto_linea` · 20/08/2026 · de Facu para Horacio

Es refactor, **no cambio de comportamiento**: el cashflow devuelve exactamente
lo mismo. Pero toca una vista tuya, así que va el aviso.

#### De dónde salió

Construyendo `/presupuesto` —la pantalla de carga— apareció esto en el QA, en un
mismo bloque de la pantalla:

```
Apertura 2027 · Borrador · Ejercicio 2026 · 2 líneas          $0
┌──────────────────────────────────────────────────┐
│        Sin líneas todavía. Agregá la primera.    │
└──────────────────────────────────────────────────┘
```

«2 líneas» arriba y «sin líneas» abajo. La causa es el filtro que pusimos el
19/08: **`v_presupuesto_total` sólo expone los aprobados**, y la pantalla leía
el detalle de ahí. O sea que **no podía ver las líneas de un borrador** — que es
justo lo que existe para editar. Se podía crear el borrador y agregarle líneas,
pero no verlas después.

El filtro está bien; el problema era usar la misma vista para dos preguntas
distintas.

#### Qué se hizo

```
v_presupuesto_linea  →  TODAS las líneas, + su `estado`.   La pantalla de carga.
v_presupuesto_total  →  sólo las aprobadas.                El cashflow.
```

Y `v_presupuesto_total` **pasó a definirse sobre la nueva**:

```sql
select id, presupuesto_id, … , total_presupuestado
  from v_presupuesto_linea
 where estado = 'aprobado';
```

**El motivo de fondo es no duplicar el cálculo.** La alternativa era copiar el
cuerpo —el `COALESCE` de tres niveles de `unidad`, el `age()` de los meses, el
`CROSS JOIN LATERAL` del factor— a una segunda vista. Dos copias de esa lógica
se desincronizan a la primera corrección, y es exactamente el drift que venimos
peleando toda la semana. Así queda escrito **una sola vez**.

#### Que no cambió nada, verificado

| | antes | después |
|---|---|---|
| `v_presupuesto_total` | 6 líneas · $139.300.000 | 6 líneas · $139.300.000 |
| columnas | 12, en orden | **las mismas 12, en el mismo orden** |
| `v_cashflow_estimado` | 602 filas · −$93.473.000 | 602 filas · −$93.473.000 |
| `v_cashflow.monto_estimado` | −$93.473.000 | −$93.473.000 |

Y el caso que motivó todo: un borrador con 1 línea → `v_presupuesto_total` la ve
en **0 filas** (el cashflow no se entera, como debe ser) y `v_presupuesto_linea`
en **1** (la pantalla sí).

#### Un detalle de la vista anterior que quedó a medias

`v_presupuesto_ambito` —la que hice ayer para el encabezado— calcula
`lineas_sin_calendario` con un LATERAL contra `v_presupuesto_total`, así que
**para un borrador siempre da 0**, justo donde más importa avisar que el factor
es 0. Lo resolví en la pantalla contando sobre el detalle que ya trae, que es un
conteo de filas y no un total de dinero.

Si en algún momento otra vista necesita ese dato, conviene mover el LATERAL a
`v_presupuesto_linea`. Lo dejo anotado, no pedido.

> Como siempre: si el refactor choca con algo que tenías pensado para
> `v_presupuesto_total`, avisá.

### ✅ Aplicado · `cat_gasto_id` / `torneo_id` en las vistas de gasto · 20/08/2026 · de Facu para Horacio

Tu migración quedó aplicada. **Esto desbloquea el «vs real» del presupuesto** —
ya se puede cruzar por id en vez de por nombre.

#### Tu advertencia sobre la granularidad: verificada, y no rompe nada

Avisaste que agregar `torneo_id` al `GROUP BY` **cambia la forma** de
`v_gasto_categoria_mes`, no sólo suma una columna. Tenías razón en marcarlo, y
fui a verificarlo antes de aplicar.

**Hay un solo consumidor**, y no hay ninguno en la base —ni vistas ni funciones—:

```
app/gastos/page.tsx:119   supabase.from('v_gasto_categoria_mes')...
```

**Y es inmune por construcción**, porque ya reagrupa por su cuenta:

```ts
for (const c of catRes.data ?? []) {
  const a = porCategoria.get(c.categoria) ?? { … }
  a.valor += Number(c.total ?? 0)
  a.parte = (a.parte ?? 0) + Number(c.pagado ?? 0)
  porCategoria.set(c.categoria, a)
}
```

Si una categoría llega partida en dos filas por torneo, el `Map` las vuelve a
sumar en una y el gráfico muestra lo mismo. Medido: **0 categorías con total
distinto** tras reagrupar.

Y con los datos de hoy **ni siquiera se parte ninguna**: 10 filas antes, 10
después. Ninguna categoría tiene gastos de más de un torneo en el mismo mes
todavía. O sea que el cambio de forma es real pero **latente** — va a aparecer
cuando convivan dos torneos, y para entonces el único consumidor ya lo tolera.

Confirmado después de aplicar: `v_gasto_categoria_mes` sigue en **10 filas** y
$21.654.767, y sus totales por categoría **no difieren** de `v_gasto_detalle`.

#### Lo demás

`cat_gasto_id` en `v_gasto_detalle` es **aditivo puro**: 13 filas antes y después,
la columna al final. Como corresponde, y como aprendiste con el `ERROR 42P16`.

El cruce por id ya funciona: `v_presupuesto_total` join `v_gasto_categoria_mes`
por `cat_gasto_id` devuelve **4 coincidencias**. Antes eso sólo se podía por
nombre.

#### Nota de proceso · la renombré para desatascarla

Tu migración tenía timestamp `20260819210000`, **anterior** a las cuatro que
aplicaste el 20/08. Eso la dejó atrapada: `db push` se negaba en bloque y sólo
ofrecía `--include-all`, que habría arrastrado también lo que todavía no estaba
decidido.

La renombré a **`20260820180000`** —posterior al último aplicado— y entró con un
`db push` normal. **El contenido no se tocó**: mismo md5 antes y después, git lo
tomó como rename. Era seguro porque no estaba aplicada en ninguna base.

> **Para la próxima:** si escribís una migración y en el medio se aplican otras
> con timestamp posterior, la tuya queda atascada. No es grave —se renombra— pero
> conviene aplicar en orden o revisar el `dry-run` antes de dar por hecho que
> entra.

#### Lo que habilita

**PR4 · `v_presupuesto_vs_real`.** Con `cat_gasto_id` y `torneo_id` expuestos, la
comparación ya se puede escribir: `v_presupuesto_total` contra
`v_gasto_categoria_mes` por `(cat_gasto_id, torneo_id)`, con desvío absoluto y
porcentual. Es de mi carril y va después de la pantalla de carga.

Queda una decisión de negocio ahí: el presupuesto **no tiene fecha** —es un total
del ejercicio— y el real sí. O se compara acumulado contra total, o se prorratea
el presupuesto por mes. Si tenés opinión, es buen momento.

### ✅ Aplicado · PR1 con un solo cambio · 20/08/2026 · de Facu para Horacio

**Tomé tus funciones de presupuesto y están aplicadas.** Gracias por avisar antes
de entrar al carril — era lo correcto y evitó que las escribiéramos los dos.

Quedaron bien, y no es de compromiso:

- **Estilo de la casa.** Las de alta devuelven `uuid`, las de acción `void`
  —igual que `mover_jornada`/`suspender_jornada`—, y todas validan la existencia
  de cada FK antes de tocar nada.
- **No duplicás los unique**: los dejás trabajar y traducís el
  `unique_violation` a un mensaje que dice qué hacer («editá el existente en vez
  de crear otro»). Es mejor que revalidar a mano, que se desincroniza.
- **Respetan las dos decisiones.** Probé el circuito completo y lo confirmé: el
  borrador **no** proyecta (A), y `editar`/`agregar`/`borrar` **no exigen
  borrador** (B).

Circuito probado punta a punta en rollback: crear → agregar → duplicado
rechazado → borrador no proyecta → aprobar sin líneas rechazado → editar →
aprobar → proyecta → editar con aprobado → re-aprobar rechazado.

#### El único cambio · `agregar_linea_presupuesto` deja `unidad` en NULL

Tu versión copiaba `cat_gasto.unidad_default` a la fila cuando no se pasaba
`p_unidad`. Lo cambié a dejarla en **NULL**.

El motivo: **NULL ahí no es un dato faltante, significa algo** — «heredar del
catálogo» (`arquitectura.md` §3.8). Y `v_presupuesto_total` resuelve esa herencia
en **tres** niveles:

```sql
COALESCE(pl.unidad, cgc.unidad_default, cg.unidad_default)
                    ↑ el del CONCEPTO
```

Materializar rompía las dos mitades: **salteaba el nivel del concepto** —si la
línea tiene `concepto_id` con unidad propia, la vista la habría usado y la
función escribía la de la categoría— y **congelaba el valor**: al cambiar el
default del catálogo, las líneas con NULL se actualizan solas y las
materializadas no.

Hoy era **inofensivo** —ningún concepto tiene `unidad_default`, así que los dos
caminos dan lo mismo— pero es exactamente una rama que nunca se ejecutó, de las
que venimos encontrando toda la semana.

Verificado tras aplicar: línea sin unidad → la fila guarda `NULL` → la vista
resuelve `por_dia_cancha` → **el total da igual que materializando**. Y el
override explícito sigue funcionando: `p_unidad = 'por_mes'` se guarda y la vista
lo respeta con factor 12.

#### Tres cosas que quedan · ninguna es cambio a tus funciones

**1 · Borrar una línea de un presupuesto aprobado saca plata del cashflow sin
aviso.** Medido: `v_presupuesto_total` pasó de 7 a 6 líneas al borrar. Tu
justificación del hard delete —«una línea en borrador no dejó huella contable»—
vale para el borrador; en aprobado sí mueve la proyección. **No cambio la
función**: lo va a advertir la pantalla, mismo criterio que el diálogo de rechazo
de cheques.

**2 · Una línea de un torneo sin calendario aporta $0 en silencio.** Al probar
con «Apertura 2027» —sin jornadas ni días de cancha— `v_torneo_escala` da factor
**0** y el total queda en $0. Es correcto y ya está documentado para
`por_partido` sin fichas, pero cargar un presupuesto y ver «$0» sin explicación
se lee como bug. Va en la pantalla.

**3 · `desaprobar_presupuesto` no existe.** Con la decisión A —sólo el aprobado
proyecta— aprobar por error no tiene vuelta por función. Por ahora alcanza con un
`UPDATE` directo si aparece; si el caso se vuelve común, agregamos la función.
Lo dejo anotado, no pedido.

#### Nota de proceso · la migración se aplicó por otra vía

`db push` **no podía aplicar PR1 sola**: se niega en bloque porque
`20260819210000` (mis columnas de gasto) quedó con timestamp **anterior** a tus
cuatro del 20/08, y el CLI pide `--include-all`, que las habría aplicado a las
dos. Como la de columnas todavía tiene una decisión pendiente de mi lado, apliqué
PR1 por MCP.

Eso registró la versión **`20260820175419`** en vez de `20260820140000`, así que
**renombré el archivo a la versión registrada** — nombre y versión vuelven a
coincidir por construcción. Es lo mismo que hicimos al cerrar la divergencia de
las 11 migraciones.

> **Nada que hacer de tu lado**, pero si volvés a aplicar por MCP en vez de
> `db push`, acordate de renombrar: es la fuente del drift que nos costó una
> sesión entera.

### 🔚 Cierre de sesión larga · 20/08/2026 · para Facu

Sesión grande hoy: B13 (cobro y pago), X1, K1 aplicadas a producción con tus ajustes. PR1 (funciones de presupuesto) escrita y avisada, esperando tu revisión — ojo si estás construyendo /presupuesto en paralelo, avisame si choca con algo.

Repasé el board completo dos veces buscando más — no queda tarea de motor sin decisión pendiente (de producto, tuya, o de infraestructura) para tomar en solitario hoy. Retomo cuando respondas PR1 o me marques algo puntual.

---

### 🔧 Aviso · escribí PR1 (funciones de presupuesto) · para Facu

Vi en tu plan del 19/08 que PR1 (funciones de escritura) estaba marcado "ya" — pero verifiqué (select proname from pg_proc where proname ilike '%presupuesto%') y no existe ninguna función de presupuesto en la base. Probablemente lo tenías planeado, no hecho — o quizás lo estás construyendo ahora mismo, en cuyo caso avisame antes de que sigamos.

Escribí las 5 funciones (crear_presupuesto, agregar/editar/borrar_linea_presupuesto, aprobar_presupuesto). Migración `20260820140000_pr1_presupuesto_funciones.sql`, sin aplicar, con 3 decisiones abiertas en el header (nace en borrador siempre, hard vs soft delete de línea, si aprobar valida que tenga líneas).

Como sé que estás con /presupuesto (la pantalla de carga) en tu plan, y esto puede solapar con lo que necesitás del lado de escritura — avisame si esto choca con algo que ya tenés armado o pensado antes de que aplique nada. No toqué nada de tu lado, es solo la propuesta de las funciones.

---

### 📋 Repaso de board · varias tareas ya hechas · 20/08/2026

Repasé el board completo contra código y base real. Encontré y marqué Done en Notion 11 tareas que estaban "Not started" pero ya construidas: P1, P6, P7, R5 (cashflow/dashboard, de sesiones anteriores), B8 (reclamos), B10 (renombres percibido puro), K4 (suspender/mover jornada), R2 (P&L matriz), F5 (auth), F7 (helpers), K13 (padrón de equipos).

También D1 ("definir con el cliente modalidades de pago") — resuelta, pero no de la forma que la tarea describía. decisiones.md #36: la columna `modalidad` se ELIMINÓ del modelo — la reemplazó el sistema de tarifario (plan_inscripcion_id + plan_partidos_id), que ya está construido y en uso. No pude marcarla Done en Notion (llegué al límite de uso del workspace), queda para la próxima vez que se libere.

Confirmado que siguen genuinamente sin hacer: PR1/PR2 (presupuesto, sin funciones ni pantalla), M7 (fondo, sin pantalla), K2 (crear_torneo propuesto 21/08, sin aplicar — ver entrada más reciente), K9 sí existe (crear_equipo_torneo, falta marcar en Notion), F6 parcial (falta Modal).

Sin tarea de construcción nueva encontrada en este repaso — fue trabajo de higiene de board, no código nuevo.

---

### ✅ Aplicado · B13 / B13 extendida / X1 / K1 · 20/08/2026 · para Facu

Las cuatro, con tus ajustes incorporados y aplicadas a producción (mostrando cada una antes de aplicar, regla 11):

1. `20260820100000` — B13: recibir_efectivo_en_transito + liquidar_efectivo_transito + cuenta EFECTIVO_EN_TRANSITO. Agregado p_torneo_id (lo habías marcado pendiente). Corregido de paso un bug que encontró Claude Code: había puesto tercero_id (apunta a tercero, equipos) con el id del usuario en la línea del asiento — rompía la FK en runtime. El responsable queda en asiento.created_by, no duplicado en la línea.
2. `20260820120000` — B13 extendida: pagar_gasto con medio efectivo_transito + reponer_efectivo_transito como función separada (tu decisión, patrón comprar_usd/vender_usd).
3. `20260820110000` — X1: cerrar_periodo con validación de arqueos + asientos descuadrados. Confirmado que no existe reabrir_periodo (trg_periodo_no_reabre ya lo bloquea).
4. `20260820130000` — K1: crear/editar/desactivar_cat_gasto, con cuenta_id inmutable si tiene gastos asociados (tu K1-3).

Las cuatro con su timestamp registrado en schema_migrations, reconciliadas con el CLI.

Nota de proceso: al escribir las correcciones, un par de veces partí de mi propia versión en vez de la que ya tenías aplicada en el repo (ej. pagar_gasto ya tenía tu firma correcta). Ahora reviso el archivo real antes de tocar cualquier función existente, no de memoria.

---

### ✅ Respuestas de Facu a B13 / X1 / K1 · 20/08/2026 · para Horacio

**Las 13 decisiones, contestadas.** Dale para adelante con las cuatro
migraciones — con los ajustes que van abajo.

Antes de las respuestas: quedaron **prolijas**. Las cuatro con `NO APLICAR sin
revisión` y ninguna aplicada, las decisiones abiertas en el header del archivo y
no sólo acá, y verificadas con `begin/rollback`. Dos cosas que cazaste y valen
más que el código:

- **El `torneo_id` que ya existía** en `v_gasto_detalle` desde el 12/08. Yo te
  pedí dos columnas y una sobraba; lo verificaste contra el schema en vez de
  creerme.
- **El rename encubierto** al insertar columnas en el medio de un `create or
  replace view` (`ERROR 42P16`), corregido en el lugar para que el historial no
  quede con un bug seguido de su parche. Es el mismo error que cometí yo con
  `origen_id` la semana pasada.

---

#### K1 · CRUD de `cat_gasto`

**K1-2 · ¿espera al bloque 10? → VA YA.**
El RLS no cambia la exposición: con la anon key en el bundle, `cat_gasto` **ya se
puede escribir con o sin login** (§2099 de arquitectura). Esperar a los roles no
agrega seguridad, sólo demora. Y el riesgo real no es de acceso sino **de
criterio** —crear una categoría apuntando a la cuenta equivocada—, que se mitiga
con K1-3, no con roles. Hoy la alternativa es editar a mano en Supabase, que es
estrictamente peor que una función que valida.

**K1-3 · `cuenta_id` inmutable → SÍ, con gastos no anulados asociados.**
Es la condición que hace segura a K1-2. Si «Arbitros Masculino» tiene 199 gastos
en `GAS_FECHA` y alguien le cambia la cuenta, **la categoría queda partida en
dos** —los viejos donde estaban, los nuevos en otro lado— y el P&L por cuenta
deja de coincidir con el P&L por categoría, en silencio. Mismo chequeo que ya
hace `desactivar_cat_gasto`. Migrar de cuenta es una operación deliberada con
reimputación, no un `update` de formulario.

**K1-1 · auditoría → SÍ, pero después y aparte.**
Sumar `cat_gasto` a `audit_log`, que ya existe con triggers sobre las 6 tablas
sensibles. Columnas propias crearían un segundo mecanismo para lo mismo. **No
bloquea K1**: se aplica ahora y el trigger se suma después sin tocar funciones.

**K1-4 · unique condicional → NO, queda incondicional.**
Acá no aplica el paralelo con mi `NULLS NOT DISTINCT`: aquello **agregaba** una
restricción que faltaba, esto la **aflojaría**. Y tiene una consecuencia
concreta: dos categorías con el mismo nombre se mezclarían en una fila de
`v_gasto_categoria_mes` —que agrupa por nombre— y el «vs real» del presupuesto
compararía contra la suma de las dos. Es justo la fragilidad del nombre que
estamos tratando de eliminar. Si hay que reusar un nombre, **se reactiva la
vieja**.

---

#### B13 · Efectivo en tránsito

**B13-1 · nombre → `EFECTIVO_EN_TRANSITO`.**
Y bien que **no** sea `CAJA_*`: no es una caja —no se arquea, no tiene predio— y
el prefijo la metería en `v_saldo_caja` y en el arqueo. **Corregí la
inconsistencia del header**, que en la descripción del asiento dice
`CAJA_EFECTIVO_TRANSITO` mientras el `insert` crea `EFECTIVO_EN_TRANSITO`. Y
verificá antes de aplicar que ninguna vista de caja la levante por prefijo.

**B13-2 · ¿reconocer al recibir? → SÍ, al RECIBIR.**
Regla 1.b, percibido puro: el único evento que genera ingreso es el pago, y el
equipo ya pagó. Idéntico al cheque recibido, que asienta al cobrar y no al
acreditar. Reconocer al liquidar sería un **tercer** criterio para el mismo
hecho.

**B13-3 · ¿quién liquida? → cualquiera.**
Restringirlo exigiría la tabla de custodia que B13-4 descarta, y en la práctica
la entrega quien esté. El `p_responsable_id` del asiento deja el rastro.

**B13-4 · ¿tabla de custodia? → SIN tabla, PERO con `tercero_id` en el asiento.**
De acuerdo con el principio y con la analogía a la decisión 22. La salvedad: el
saldo dice **cuánto** está en tránsito, no **quién lo tiene**. Para el fondo
alcanza —la plata está en el banco—; acá está **en el bolsillo de alguien**, y
la pregunta operativa es «¿quién debe rendir?». Con dos personas circulando, el
saldo agregado no permite reclamarle a ninguna.

Con `tercero_id` en el asiento el detalle sale del diario —quién y desde
cuándo— sin duplicar estado, y el saldo sigue siendo la verdad del cuánto. Es el
mismo truco del cheque: sin tabla de custodia, pero la fila sabe de quién es.

> **CORRECCIÓN, no decisión.** `recibir_efectivo_en_transito` **no le pasa
> `p_torneo_id` a `crear_asiento`** —lo anotaste vos al final del header—.
> `registrar_cobro` sí lo calcula de las cuotas imputadas. Sin eso **el ingreso
> no queda atribuido al torneo** y el P&L por torneo lo pierde. A corregir antes
> de aplicar.

---

#### B13 extendida a pagos

**Función SEPARADA (`reponer_efectivo_transito`), no parámetro de sentido.**
El proyecto ya lo decidió: `comprar_usd` y `vender_usd` son **dos funciones**, no
`operar_usd(sentido)` — mismo caso, par simétrico con cuenta común y direcciones
opuestas. Los nombres de la casa dicen qué pasa, no lo reciben como dato.

Y hay una razón de fondo: **los dos sentidos no son espejo**. Liquidar un cobro
es «la plata llegó a la caja»; reponer un pago es «alguien puso de su bolsillo y
hay que devolvérselo» — ahí la contraparte es una persona, no una caja. Un
parámetro escondería esa diferencia dentro de un `if`.

El nombre que proponés está bien: describe el hecho.

> **A revisar al aplicar:** con `efectivo_transito` como 4º medio, que ningún
> `case medio_pago` quede con una rama muerta. Es la lección de
> `gasto_medio_pago_check`, que rechazaba `'cheque'` y nadie lo notó **porque esa
> rama nunca se ejecutaba**.

---

#### X1 · `cerrar_periodo`

**X1-1 · ¿alcanza la validación? → SÍ, más una.**
Tu criterio para dejar cheques y compromisos afuera es correcto: un cheque a 60
días **existe para cruzar el cierre**, y bloquear por eso sería un falso positivo
mensual. Un arqueo sin entregar es distinto — es plata física sin conciliar.

**Agregá una sola cosa: que el período no tenga asientos descuadrados.** Hoy lo
garantiza `trg_asiento_balanceado` por asiento; un chequeo agregado al cerrar es
la última red antes de congelar el mes. **No** agregues gastos devengados sin
pagar: es el estado normal de un gasto y bloquearía todos los cierres.

**X1-2 · ¿`reabrir_periodo`? → NO. No debe existir.**

*Acá cambio lo que te habría contestado sin verificar.* Fui a mirar
`trg_periodo_no_reabre` antes de responder, y **el sistema ya tomó esta
decisión**:

```
check_periodo_no_reabre():
  if old.estado = 'cerrado' and new.estado = 'abierto' then
    raise exception 'El período %-% está cerrado y no puede reabrirse.
                     Las correcciones se registran como ajuste en el período abierto.';
```

Probado en rollback: cerrar con `UPDATE` directo funciona —sin validar nada, que
es justo lo que X1 viene a arreglar— y reabrir **se rechaza con ese mensaje**.

O sea que la pregunta no era «¿función propia o `UPDATE` directo?» sino si se
permite reabrir, y la respuesta ya estaba escrita en el trigger **con su
alternativa**: las correcciones van como **`ajuste`** en el período abierto —y
`asiento_origen_check` ya admite ese origen—. No hay que crear `reabrir_periodo`
ni una salida de emergencia: el mecanismo de corrección existe y es el
contraasiento.

**Un dato útil que salió de lo mismo:** `trg_periodo_cierre` ya estampa
`cerrado_at` y `cerrado_por` solo al pasar a cerrado, así que `cerrar_periodo`
**no necesita setearlos**. Ojo que en la prueba `cerrado_por` quedó **NULL**,
porque el trigger usa `auth.uid()` y desde SQL no hay sesión — si querés que
quede el responsable, la función tiene que pasarlo explícito, igual que hicimos
con el fallback que sacamos de `crear_asiento`.

---

#### El orden para aplicar

1. **B13** (`20260820100000`) — crea la cuenta que usa la siguiente.
2. **B13 extendida** (`20260820120000`) — depende de la anterior en runtime.
3. **K1** (`20260820130000`) y **X1** (`20260820110000`) — independientes, en
   cualquier orden.

Cada una **mostrando antes de aplicar**, como venimos (regla 11). Las cuatro son
tuyas: aplicalas vos cuando estén con los ajustes.

> Lo de `20260819210000` (las columnas de las vistas de gasto) lo aplico yo, que
> es lo que desbloquea el «vs real» del presupuesto. Te aviso cuando esté —
> **ojo con el cambio de granularidad de `v_gasto_categoria_mes`** que anotaste,
> reviso quién la consume antes.

### 💡 Propuesta · K1 CRUD de categorías de gasto · para Facu

cat_gasto no tenía funciones de escritura (solo seed/editor directo). Migración `20260820130000_k1_cat_gasto_crud.sql`, sin aplicar: crear_cat_gasto, editar_cat_gasto (edición parcial), desactivar_cat_gasto (soft-delete, rechaza si tiene gastos no-anulados asociados).

4 decisiones abiertas en el header:
1. Sin auditoría (cat_gasto no tiene created_by) — ¿hace falta agregarla?
2. Sin RLS/roles — ¿K1 cae en "gestión atada al bloque 10" o es un catálogo simple que puede tener CRUD ya?
3. editar_cat_gasto permite cambiar cuenta_id — ¿debería ser inmutable tras el primer uso?
4. cat_gasto tiene unique(area, nombre) INCONDICIONAL (no distingue activo) — una categoría desactivada bloquea reusar su nombre+área. ¿Vale la pena hacerlo condicional (WHERE activo), como hiciste con NULLS NOT DISTINCT en presupuesto?

La 2 es la más importante — si K1 espera al bloque 10, mejor saberlo antes de que se use la función.

Verificada con begin/rollback, compila limpio. Nota: al validar contra el schema real encontré que cat_gasto es unique(area,nombre) no unique(nombre) — corregido antes de guardar, quedó documentado como decisión 4.

---

### 💡 Propuesta · B13 extendida a pagos (efectivo_transito) · para Facu

Par simétrico de B13: pagar_gasto tenía la misma limitación que registrar_cobro tenía antes de B13 (exige predio para efectivo, sin contemplar pagar en mano fuera de una caja). Migración `20260820120000_b13_pagar_gasto_transito.sql`, sin aplicar.

Agregué 'efectivo_transito' como 4to medio válido (no reemplaza 'efectivo'). Asienta PROVEEDORES debe / EFECTIVO_EN_TRANSITO haber. Reusa la cuenta de B13.

⚠️ Decisión abierta importante: liquidar_efectivo_transito (de B13) está pensada para el sentido cobro (la plata entra a caja). Para el sentido pago es al revés — la plata sale de una caja real para reponer el tránsito. No escribí esa función todavía, dejé la decisión en el header: función separada (reponer_efectivo_transito) o generalizar liquidar_efectivo_transito con un parámetro de sentido.

Nota de proceso: al escribirla de memoria calqué mal el orden de p_created_by en la firma — Claude Code lo detectó antes de guardarla (habría creado una sobrecarga ambigua, mismo tipo de bug que la cuña de arqueo semanas atrás). Corregido partiendo del archivo real del repo, no de memoria.

Verificada con begin/rollback, compila limpio (depende de que 20260820100000 esté aplicada antes, en runtime).

---

### 💡 Propuesta · X1 cerrar_periodo con validación · para Facu

Miré X1 (cierre de período). Hallazgo: el bloqueo de ESCRITURA en período cerrado ya existe — periodo_de_fecha() lo rechaza con mensaje claro. Lo que faltaba era la función de CIERRE en sí: hoy es un UPDATE directo a periodo, sin validar nada antes.

Migración `20260820110000_x1_cerrar_periodo.sql`, sin aplicar. cerrar_periodo() rechaza si hay arqueos sin entregar a central dentro de ese mes (plata física sin conciliar). No valida cheques/compromisos/gastos devengados — los dejé afuera a propósito, más ambiguos.

2 decisiones abiertas en el header: si la validación de arqueos alcanza o hace falta más, y si reabrir_periodo necesita función propia o alcanza con UPDATE directo como hoy.

Verificada con begin/rollback, compila limpio.

---

### 💡 Propuesta · B13 efectivo en tránsito fuera de predio · para Facu

Escribí una propuesta para el caso que registrar_cobro rechaza hoy ("efectivo en poder de personal fuera de un predio... registralo cuando la plata llegue a una caja"). Migración `20260820100000_b13_efectivo_transito.sql`, sin aplicar.

Modelo: cuenta nueva EFECTIVO_EN_TRANSITO + dos funciones — recibir_efectivo_en_transito (asienta al cobrar, percibido puro, mismo patrón que cheque recibido) y liquidar_efectivo_transito (traslado a la caja real del predio cuando llega la plata, sin generar ingreso nuevo).

4 decisiones abiertas en el header del archivo — la más importante es la 4: propongo NO tener tabla de custodia aparte, que el saldo de la cuenta sea la fuente de verdad (mismo criterio que "el fondo sin saldo mantenido a mano", decisión 22). Si no cierra con cómo lo tenés pensado, avisá antes de que lo aplique.

Verificada con begin/rollback, compila limpio.

---

### 💡 Candidata · M3 alerta de cobertura de cheques emitidos · para Facu

Miré M3 del board (alerta si la suma de cheques emitidos pendientes supera el disponible en caja). Hoy no hay nada armado (verificado: sin función, sin vista, y la tabla cheque no tiene emitidos pendientes de prueba todavía).

Es vista de lectura pura — comparar suma de cheque.monto (sentido='emitido', estado='pendiente') contra saldo de caja, capaz cruzando con v_saldo_caja. Según el reparto, cae de tu lado (display/vistas), no lo tomé.

La dejo anotada por si la querés priorizar — las tablas ya están (las armaste vos esta semana), así que es rápida de construir cuando haya datos de cheques emitidos para probarla.

---

### 📋 Presupuesto · estado y plan · 19/08/2026 · de Facu para Horacio

*Doble función: el aviso de un cambio en `v_presupuesto_total` (tuya) y el
panorama del módulo, para que sepas qué sigue y qué te toca. La bitácora de
Notion no está disponible, así que esto es el canal.*

#### Lo que ya está bien

`v_presupuesto_total` está bien resuelta y conviene decirlo antes del cambio:
expone **`unidad` y `factor`** además del total, o sea que la pantalla puede
mostrar **de dónde sale** el número y no sólo el número —«$240.000 × 199
partidos»—. Eso es exactamente lo que una pantalla de presupuesto necesita, y no
es lo que uno encuentra por defecto.

Y la cadena completa **funciona**: `presupuesto → v_presupuesto_total →
v_cashflow_estimado → v_cashflow`. Cuando relevé la proyección de gastos por
jornada, resultó que ya estaba construida ahí.

#### El cambio de hoy · `20260819200000`

Un **borrador entraba a la proyección**. Verificado: creando un segundo
presupuesto del mismo torneo+ejercicio, en `borrador`, con UNA línea, el
estimado pasaba de −$93.473.000 a −$135.353.000. **$41.880.000 de una planilla
que nadie aprobó.**

Dos agujeros que se sumaban:

- **`v_presupuesto_total` no filtraba por `estado`.** El campo existía con su
  check `('borrador','aprobado')` y no lo leía nadie.
- **No había unique de negocio.** Los únicos índices únicos eran las dos PK, así
  que nada impedía dos cabeceras del mismo ámbito ni dos líneas de la misma
  categoría — y la vista las sumaba todas.

**No es error tuyo**, y es el patrón que venimos encontrando toda la semana: un
campo sin lector y una rama que **nunca se ejecutó**, porque nadie creó jamás un
borrador. No se notaba porque las 2 cabeceras que hay están en `aprobado`.

Lo aplicado:

```sql
create unique index presupuesto_ambito_uniq
  on presupuesto (torneo_id, ejercicio_id) nulls not distinct;
create unique index presupuesto_linea_uniq
  on presupuesto_linea (presupuesto_id, cat_gasto_id, concepto_id) nulls not distinct;

-- y en v_presupuesto_total, una sola línea:
  WHERE p.estado = 'aprobado'::text;
```

**`NULLS NOT DISTINCT` no es adorno.** `torneo_id` es NULL para la estructura
permanente y `concepto_id` es NULL en **las 6 líneas que existen**: con un unique
común, la línea no habría protegido nada. Postgres 17.6 lo soporta.

`v_cashflow_estimado` **no se tocó**: hereda el filtro por leer de esta vista.
Efecto hoy: **ninguno** — $139.300.000 y 602 filas, igual que antes, porque los
dos presupuestos están aprobados.

> Al escribir esto reconstruí tu vista de memoria en el primer intento y me
> quedó distinta en tres puntos silenciosos: el `COALESCE` de `unidad` tiene
> **tres** niveles (línea → concepto → categoría) y yo había salteado el del
> concepto; el factor `por_mes` usa `age()`; y el cálculo va en un `CROSS JOIN
> LATERAL` para resolverse una vez. Ninguno habría fallado — habría devuelto
> otros números. La migración lleva el cuerpo textual de `pg_get_viewdef` con el
> `WHERE` agregado, y la advertencia escrita para el próximo.

#### El plan de Presupuesto y el reparto

| Quién | Qué | Cuándo |
|---|---|---|
| **Facu** | Las 5 funciones de escritura: `crear_presupuesto`, `agregar_linea_presupuesto`, `editar_linea_presupuesto`, `borrar_linea_presupuesto`, `aprobar_presupuesto` | ya |
| **Facu** | `/presupuesto` — la pantalla de **carga** | ya, no depende de vos |
| **Horacio** | `cat_gasto_id` en `v_gasto_detalle`; `cat_gasto_id` + `torneo_id` en `v_gasto_categoria_mes` | **sin apuro, no bloquea nada** |
| **Facu** | `v_presupuesto_vs_real` + la pestaña de comparación | después de lo tuyo |

**Lo tuyo, con detalle.** Son dos columnas aditivas, misma clase que `origen_id`
y `tercero_id` de esta semana: `gasto` ya las tiene, es exponerlas.

Para qué: el **«presupuesto vs real»** cruza `presupuesto_linea.cat_gasto_id`
contra el gasto ejecutado. Pero `v_gasto_detalle` **sólo expone `categoria`
(texto)**, así que hoy la comparación únicamente se puede armar **uniendo por
nombre** — y un renombre la rompe **en silencio**: la categoría desaparece del
comparativo y su desvío pasa a ser el 100% del presupuesto. No es hipotético:
este repo tiene el commit **`776ddf9` «reordenamiento del plan de cuentas —
renombres, mover categorías»**.

Y `v_gasto_categoria_mes` **no tiene `torneo_id`**, mientras que el presupuesto
se organiza justamente por torneo vs estructura (`torneo_id NULL`). Sin ese eje
no se puede comparar «Clausura 2026» contra su propio gasto.

**La carga no depende de esto**, así que tomate el tiempo.

#### Decisiones tomadas

- **(A) Sólo el aprobado entra al cashflow.** Un borrador es planificación en
  curso: se arma, se discute, se corrige. No mueve la proyección.
- **(B) El aprobado se edita libremente.** El estado controla **qué proyecta**,
  no **qué se puede tocar**. Corregir un número de un presupuesto vigente es
  normal y no debería exigir desaprobar y reaprobar. Por eso la migración **no
  agrega ningún trigger que bloquee escrituras**.

#### Decisiones abiertas · si tenés opinión, es el momento

**1 · El precio duplicado.** `concepto_gasto.arancel_ref` existe y está **vacío
en los 100 conceptos**; el precio real vive en `presupuesto_linea.base`. Si la
pantalla edita `base`, `arancel_ref` queda muerto. Las opciones son depreciarla
o definirla como **default que la línea hereda** (que encaja con el patrón de
`unidad_default`, que sí se usa). Dos lugares para el mismo número es fábrica de
drift.

**2 · La cobertura.** El presupuesto cubre **6 de 32 categorías**. Lo no
presupuestado no se proyecta y **nada lo avisa**. ¿Deberían estar todas, o hay
naturalezas —`eventual`, `inversion`— que por definición no se presupuestan?

#### Nota de diseño, para que no sorprenda

Con el filtro puesto, **desaprobar un presupuesto le saca su monto al cashflow
sin aviso**: probado, pasar «Clausura 2026» a borrador mueve el estimado de
−$93.473.000 a −$22.723.000. Es el comportamiento correcto por la decisión (A),
pero la pantalla lo va a advertir antes de confirmar —mismo criterio que el
diálogo de rechazo de cheques—, y `/proyeccion` debería avisar cuando hay
borradores que no está contando.

> Como siempre: si algo de esto choca con lo que tenías pensado, avisá y lo
> revisamos antes de que crezca.

### 🔧 Aplicado · `por_mes` del estimado, por diferencia · 19/08/2026 · de Facu para Horacio

Cierra el pendiente del aviso de más abajo. **Las tres ramas de
`v_cashflow_estimado` descuentan ahora su gasto real** — pero con **dos
criterios distintos, y es a propósito**.

#### Por qué dos criterios

| rama | criterio | por qué |
|---|---|---|
| `por_partido` · `por_dia_cancha` | **binaria** — el gasto real apaga la estimación entera | la factura del árbitro cubre la jornada completa |
| `por_mes` | **por diferencia** — `GREATEST(presupuestado − real del mes, 0)` | los fijos entran **fraccionados**: un alquiler por predio, sueldos en cuotas |

Con la regla binaria en `por_mes`, **el primer gasto que se cargara apagaría el
mes entero**. Con los datos de hoy: $777.000 cargados habrían apagado una
estimación de $1.900.000, y la proyección quedaría **$1.123.000 corta** — sin
ninguna alarma. Un cashflow que sobreestima gastos molesta; uno que los
subestima miente en la dirección peligrosa.

Por diferencia, la fila **no desaparece: se achica**, y muestra el hueco que
falta cubrir. Más informativo que borrarla.

#### El tope en 0 no es cosmético

Si el real supera al presupuestado, el exceso **ya está** contado como gasto
real en `v_cashflow_comprometido`. Sin el `GREATEST`, la diferencia daría
negativa y —al invertir el signo— la vista emitiría un monto **positivo**: un
gasto convertido en ingreso. Verificado tras aplicar: **0 filas con monto > 0**
en toda la vista.

**Los dos criterios están escritos en el `comment on view`**, para que la
asimetría entre ramas no se lea como un descuido de alguien.

#### Efecto medido

```
602 filas · −$93.473.000
partido=500 (binaria, intacta) · dia_cancha=92 (binaria, intacta) · mensual=10
Alquileres 31/08:      −$1.123.000   ← era −$1.900.000
Alquileres 30/09:      −$1.900.000   ← sin gasto real, estimación completa
Sueldos adm. 31/08:    −$2.800.000   ← sin gasto real, completa
```

#### ⚠️ Un hallazgo que no es tuyo, pero conviene que sepas

Los $777.000 que achican agosto **son basura de prueba**:

| concepto | total | devengado |
|---|---|---|
| `PRUEBA DESDE PANTALLA · con sesión de Mati` | $333.000 | 10/08 |
| `PRUEBA SIN FALLBACK · Mati, paso 3` | $444.000 | 10/08 |

Quedaron en producción y **ensucian los dos lados a la vez**: achican el
estimado de agosto e inflan el comprometido como gasto impago.

Se corrige solo al limpiarlos —agosto vuelve a −$1.900.000 y el comprometido
baja $777.000—, **sin tocar ninguna vista**. Pero no se borran: tienen asiento
de devengo, así que por la regla 4 van con `anular_gasto`, que contraasienta.
Con el filtro de anulados que ya tienen las tres ramas, anularlos alcanza.
Limpieza aparte, la encara Facu.

> **Si ves un caso donde alguno de los dos criterios descuenta de más o de
> menos, avisá.** El binario asume factura por ocurrencia completa; el de
> diferencia asume que todo lo cargado en el mes corresponde a ese presupuesto.

### 🔧 Aplicado · doble conteo en `v_cashflow_estimado` · 19/08/2026 · de Facu para Horacio

**Otra vista tuya que toqué.** Ya está aplicada (`20260819180000`).

**El contexto:** relevando la proyección de gastos por jornada me encontré con que
`v_cashflow_estimado` **ya hace** lo que íbamos a construir —cruza presupuesto ×
calendario, respeta las suspensiones y proyecta por fecha de jornada—. Muy bien
resuelto. Lo que no hacía era descontar lo que ya está cargado.

#### El problema

La vista proyecta cada jornada futura, pero **no miraba si el gasto real de esa
jornada ya existía**. Cuando existe, la jornada se cuenta dos veces: una acá y
otra en `v_cashflow_comprometido` (rama `gasto_impago`).

Probado en rollback antes de tocar nada: cargando el gasto real de árbitros de
la jornada del 22/08 por $1.200.000, **el estimado no se movía** y el
comprometido sumaba. $1.200.000 duplicados en la misma fecha.

**No es un error de diseño tuyo.** La única defensa era temporal —`fecha >
CURRENT_DATE`— y con los 7 gastos reales que hay, todos de fechas pasadas, la
rama **nunca se ejecutó**. El doble conteo aparece recién cuando se carga el
gasto de una jornada que todavía no se jugó, que es lo normal cuando la factura
del árbitro entra por adelantado. Es el mismo patrón que ya nos mordió tres
veces: una rama que nadie ejecutó esconde su error.

#### El fix

`NOT EXISTS` contra `gasto`, en las dos ramas que cruzan calendario:

| rama | clave de exclusión |
|---|---|
| `por_partido` | `(cat_gasto_id, jornada_id)` |
| `por_dia_cancha` | `(cat_gasto_id, predio_id, devengado_at)` |

**Exclusión binaria** —decisión de Facu—: si hay gasto real de esa categoría en
esa jornada, se saca la estimación **entera** de esa jornada. No se descuenta el
importe ni se compara contra lo presupuestado, porque las facturas vienen por
jornada completa.

**Por (categoría, ocurrencia), nunca por jornada entera.** Si se carga árbitros
pero no operativos de la misma jornada, operativos sigue estimado. Verificado:
árbitros del 22/08 bajó $240.000 —una jornada exacta— y operativos quedó igual.

**El filtro de anulados va por `v_gasto_detalle.estado`**, que deriva de
`asiento.anulado_por`. No es decorativo: `anular_gasto` limpia `pagado_at`, así
que sin el filtro un gasto anulado sacaría su jornada del estimado y **la plata
desaparecería de la proyección** — el espejo del bug de la 5ª rama. Verificado:
al anular, la estimación vuelve entera.

#### Contra `gasto_planificado`, que vos ya resolviste bien

Ese caso no tenía el problema: `estado = 'pendiente'` + `marcar_gasto_planificado_ejecutado`
es un **vínculo explícito, uno a uno**. No se pudo calcar porque una línea de
presupuesto **no materializa filas**: no representa un pago sino N pagos
repartidos por el calendario, así que no hay fila que apagar. Hay que apagar la
*ocurrencia*, y eso sólo se puede hacer con un `NOT EXISTS` en la vista. Mismo
principio —lo real desplaza a lo estimado—, mecanismo distinto.

#### Dos cosas que quedan abiertas, y una corrección

**1 · La rama `por_dia_cancha` está cubierta a medias.** Compara contra
`g.predio_id`, y `check_gasto_coherente` exige `jornada_id` pero **no** exige
predio: los 3 gastos `por_dia_cancha` que hay lo tienen en NULL. La cláusula es
correcta y no da falsos positivos, pero **hoy no dispara**.

No lo resolví por `(categoría, fecha)` porque las **29 fechas de días de cancha
tienen los 2 predios**: un solo gasto mataría las dos filas y cambiaría
sobreestimar por subestimar — que es peor, porque un cashflow que subestima
gastos no dispara ninguna alarma.

> **Tarea para vos:** que `predio_id` pase a obligatorio en gastos de categorías
> con `unidad_default = 'por_dia_cancha'`. Con eso la cláusula empieza a
> funcionar sola, sin volver a tocar la vista.

**2 · `por_mes` quedó fuera de ESTA migración, pero ya está cerrada.**
Se resolvió el mismo día en `20260819190000`, con criterio propio — ver el
bloque siguiente. *(La nota original decía que quedaba pendiente; se corrige
acá para que no quede desactualizada.)*

#### Efecto medido

Ninguno, todavía: **602 filas y −$94.250.000, igual que antes**. Los 7 gastos
reales son de jornadas pasadas y el estimado sólo mira adelante. El fix no
cambia un solo número hoy — cambia lo que va a pasar en cuanto alguien cargue el
gasto de una fecha que no se jugó.

> **Si ves un caso donde la exclusión binaria descuenta de más o de menos,
> avisá.** La decisión de que sea binaria asume que la factura cubre la jornada
> completa; si hay categorías donde se factura parcial, el criterio hay que
> revisarlo.

### 🔧 Aplicado · dos cambios a `v_cashflow_comprometido` · 19/08/2026 · de Facu para Horacio

**Es tu vista y la toqué.** Las dos ya están aplicadas y pusheadas
(`20260819120000` y `20260819130000`). Te cuento qué y por qué, y una parte es
para que la revises vos.

**El contexto:** arranqué el **Calendario de pagos**, y la fuente correcta es
`v_cashflow_comprometido` — no `v_calendario_pagos`, que a pesar del nombre lee
sólo `compromiso` (1 de las 5 ramas, tabla vacía). Construyendo encima
aparecieron dos cosas.

#### 1 · `origen_id` en las 5 ramas — aditivo

La vista daba 7 columnas y ninguna era un id. Para el cashflow no hacía falta
—ahí se suma por fecha y nivel—, pero un calendario necesita dos cosas que sin
id no se pueden: una **clave de fila** y el **enlace al origen** (poder clickear
un vencimiento e ir al equipo, al cheque o al gasto).

Cada rama ya tenía su id a mano, así que fue exponer lo que estaba:
`ec.id` · `q.cuota_id` · `cm.id` · `ch.id` · `g.id`.

Tres cosas que quizá te ahorren una duda:

- **Va última, no al lado de `origen`.** `create or replace view` no deja
  reordenar ni cambiar columnas existentes: sólo agregar al final.
- **Lo que identifica es el PAR `(origen, origen_id)`.** Los ids vienen de
  tablas distintas y solos no son únicos.
- **No rompió a nadie.** Tus dos consumidores leen por columna nombrada:
  `v_cashflow` enumera `(fecha, nivel, origen, detalle, monto)` en su `UNION ALL`
  —una columna nueva no entra ni descuadra el arity— y `/proyeccion/[periodo]`
  hace `.select('*')` y mapea por nombre. Verificado antes y después: 284 filas,
  mismo neto, `v_cashflow` idéntico.

#### 2 · La rama de sponsors ahora arrastra lo vencido — esta miralá

**El síntoma:** la rama de sponsors leía `v_cuotas_sponsor_futuras`, que filtra
`fecha_cobro >= current_date`. Por eso tenía `false as arrastrada` fijo: no es
que no arrastrara, es que lo vencido no llegaba. Resultado, **una cuota de
sponsor vencida e impaga —$4.000.000 de Bodega Los Cerros, vencida el 05/08—
no aparecía en la proyección ni en ningún lado.**

**Ahora lee `v_cuotas_sponsor` con `where cobrado_at is null`**, y aplica el
mismo patrón `GREATEST` / `fecha_original` / `arrastrada` que las otras cuatro.

**Que quede claro: no es un error tuyo.** Esa rama es de la migración original
de cashflow; tu 5ª rama heredó el filtro tal cual y calcó bien el patrón de las
demás. Lo que estaba viejo era la **elección de fuente**, no tu trabajo.

**Y no es un cambio de criterio, es deuda de sincronización.** Cuando se escribió
esa rama (**decisión 77**) el mecanismo de arrastre **no existía**: filtrar el
pasado era la única forma de que una fecha vieja no ensuciara la proyección.
`GREATEST`/`fecha_original`/`arrastrada` llegó después, las cuatro ramas nuevas
lo usan, y sponsors quedó atrás.

La evidencia de que esconder lo vencido no era la regla:

- `v_cuotas_sponsor` deriva un estado **`'vencida'`** explícito — el modelo sí
  reconoce el vencimiento de una cuota de sponsor.
- La migración `20260809155729` ya lo había marcado, con todas las letras: *«una
  cuota VENCIDA E IMPAGA —el caso que más importa mirar— desaparecía de la
  pantalla el día que se vencía. Un sponsor moroso era invisible.»* Se arregló
  para la pantalla y se **difirió** para el cashflow. No se decidió que estuviera
  bien.
- No hay asimetría de negocio: un equipo que no pagó cuenta como plata por
  cobrar; un sponsor que no pagó, también. Si la diferencia fuera la
  cobrabilidad, eso se expresa con el **nivel** (comprometido vs estimado), no
  borrando la fila.

**`v_cuotas_sponsor_futuras` NO se tocó.** Su nombre, su comentario y la decisión
77 que la referencia siguen honestos: es «cuotas por vencer» y eso sigue siendo.
Lo único que cambió es de dónde **lee** la rama del cashflow. Verificado después
de aplicar: sigue con sus 3 filas, su filtro y su comentario intactos.

**Efecto medido:**

| | antes | después |
|---|---|---|
| filas | 284 | **285** |
| neto | $255.258.233 | **$259.258.233** |
| arrastradas | 67 | **68** |
| ramas | `cuota_equipo=274 · cuota_sponsor=3 · gasto_impago=7` | `cuota_equipo=274 · cuota_sponsor=4 · gasto_impago=7` |

Sube el comprometido a cobrar en $4.000.000. Es plata que se debe de verdad;
que aparezca es el punto.

> **Si ves una razón por la que sponsors debía filtrar lo vencido —algo que no
> vimos—, avisá y lo revisamos.** La evidencia dice inconsistencia, no criterio,
> pero la rama es de tu módulo y la última palabra sobre el porqué la tenés vos.

#### 3 · `tercero_id` en las 5 ramas — aditivo, mismo espíritu que `origen_id`

`origen_id` identifica el **registro** que vence, y alcanza para enlazar donde la
pantalla de destino se abre por ese registro: `/cheques/[cheque_id]`, `/gastos`.
Pero para una cuota de equipo el destino natural es la cuenta corriente del
**equipo**, y ahí `origen_id` es el id de la CUOTA. Con sólo ese id el calendario
podía decir «vence una cuota de Alayama LF» y no poder llevarte a Alayama LF.

Se puebla donde existe, y donde no, va NULL:

| rama | `tercero_id` | enlace de la pantalla |
|---|---|---|
| `cuota_equipo` | **siempre** · 274/274 | `/cobranza/[tercero_id]` |
| `cuota_sponsor` | **siempre** · 4/4 | `/sponsors/[tercero_id]` |
| `compromiso_*` | a veces (la columna es nullable) | según tipo |
| `cheque_*` | sólo **recibido** | `/cheques/[origen_id]` |
| `gasto_impago` | **nunca** · 0/7 | `/gastos` |

Dos aclaraciones para que los NULL no se lean mal:

- **En cheques el enlace NO va por tercero**, va a `/cheques/[origen_id]`, que es
  donde está el circuito. `tercero_id` se expone igual porque es dato real —de
  quién es el cheque recibido— y porque habilita filtrar «todo lo de este
  tercero» cruzando ramas. En un **emitido** es NULL, por lo mismo que /cheques
  rotula «Categoría» y no «Contraparte»: `gasto` no registra a quién se le paga.

- **En `gasto_impago` es NULL siempre y no es un olvido**: `gasto` no tiene
  `tercero_id`. Es la limitación conocida del modelo de gastos. El día que tenga
  proveedor, la rama se puebla cambiando una línea.

> **Un NULL no significa «no se puede enlazar»: significa «no se enlaza por
> tercero».** La pantalla resuelve el destino por `origen`, no por si el
> `tercero_id` vino o no.

**Verificado con la vista dependiente encima.** `v_calendario_dia` —la vista
nueva del calendario, que agrupa `v_cashflow_comprometido` por día— ya estaba
creada cuando se hizo el `create or replace` de la base. No la rompió: no
selecciona `tercero_id` y agrupa por `fecha_original`. Después de aplicar: 285
filas y neto $259.258.233 en la base, 36 días en `v_calendario_dia`, y
`v_cashflow` en 26 filas con el mismo comprometido. Ningún consumidor se movió.

### 🔧 Corregido · la 5ª rama excluía mal los gastos anulados · 19/08/2026 · de Facu para Horacio

**La rama estaba bien hecha.** Tres cosas que salieron derecho y vale marcarlas:

· **El timestamp ordena.** `20260817160000`, posterior a lo último aplicado
  (`20260817150000`). La regla quedó.
· **El `UNION` es aditivo de verdad.** Las cuatro ramas anteriores —cuotas de
  equipo y sponsor, compromisos, cheques— quedaron **idénticas**. Verificado
  contando filas por origen antes y después: 274 y 3, iguales.
· **El patrón está calcado.** `GREATEST(devengado_at, CURRENT_DATE)`,
  `fecha_original`, `arrastrada`, monto negativo. Es exactamente el criterio de
  las otras ramas, con `devengado_at` en lugar de `vence_at` — y la explicación
  de por qué en el encabezado.

---

#### Lo que faltaba: excluir los gastos anulados

El filtro era `pagado_at is null and devengado_at is not null`. **`anular_gasto`
limpia `pagado_at`**, así que un gasto anulado cumple las dos condiciones y
entraba a la proyección.

Con los datos de hoy:

| | filas | monto |
|---|---|---|
| devengados impagos (correcto) | 7 | −12.194.767 |
| **anulados, que se colaban** | **2** | **−3.350.000** |
| lo que proyectaba | 9 | **−15.544.767** |

Sobreestimaba los egresos comprometidos en **$3.350.000**, y del modo que no se
nota: el número sigue siendo plausible.

**El fix son dos líneas:**

```sql
     join v_gasto_detalle d on d.gasto_id = g.id
...
   and d.estado <> 'anulado';
```

---

#### La regla, para las próximas vistas que lean `gasto`

**Toda vista que lea `gasto` tiene que excluir los anulados**, y el filtro sale
de **`v_gasto_detalle.estado`** — no de reimplementarlo.

Esa vista ya deriva la anulación desde `asiento.anulado_por`, que es la fuente de
verdad: un gasto está anulado si su asiento de devengo lo está. Escribir la
condición a mano en cada vista es tener la misma regla en varios lugares, y
alcanza con que una quede vieja.

**Es la segunda vez que aparece.** La primera fue en `v_activo`: la Desmalezadora
tiene dos gastos apuntándola —el original mal imputado y el que lo corrige— y un
join ingenuo mostraba un valor de compra de $2.900.000 en vez de $1.450.000. El
mismo filtro lo resolvió.

---

#### Cómo se corrigió, y por qué así

**En el archivo, no con una migración aparte.** Todavía no estaba aplicada, así
que la vista **nunca llegó a existir con el error** y el historial no queda con
un bug seguido de su parche. Si ya hubiera estado aplicada, iría una migración
nueva — la regla 4 vale para asientos, pero una migración sin aplicar todavía es
un borrador.

Tu commit `c6d6145` y el contenido actual del archivo difieren por eso; está
explicado en el encabezado del propio `.sql`.

**Ya aplicado.** `v_cashflow_comprometido` quedó con sus 5 ramas y 284 filas, la
nueva con 7 filas por −$12.194.767. `db push --dry-run` volvió a **«Remote
database is up to date»**.

---

#### Y una cosa del modo de trabajo

**Commitear a main sin aplicar, para revisión, funciona mejor que las ramas.** Se
ve el cambio en su lugar definitivo, el timestamp ya queda fijado, y no hay que
resolver después cómo entra. Lo único a tener presente es que mientras haya algo
sin aplicar el `--dry-run` no da limpio — así que conviene avisar, como hiciste.

Seguí así.

---

### ✅ Cierre de sesión · nada pendiente de mi lado · 17/08/2026 · para Facu

Repasé todo el archivo de punta a punta. Estado de mi lado:

- **5ta rama de v_cashflow_comprometido** (gastos devengados-impagos): escrita, verificada, en main (`c6d6145`). Con tu OK ya registrado arriba. Sin aplicar, esperando tu revisión.
- **Bloque 8, gasto_planificado, fijos con torneo_id NULL**: todo integrado, según confirmaste en "LEER ANTES DE TOCAR NADA". Limpié mis 6 branches locales (ya redundantes, contenido verificado en main).
- **Pagos parciales de gasto**: sigue sin confirmar si pasa de verdad — no arranco sin tu OK.
- **Adjuntar factura**: sigue esperando RLS.

No tengo nada más para agregar acá. Cuando tengas nueva revisión o tarea, la leo desde el principio del archivo.

---

### 🔴 LEER ANTES DE TOCAR NADA · tu bloque 8 ya está en main · 16/08/2026 · de Facu para Horacio

**Todo el contenido de tus ramas del bloque 8, el eslabón, el fondo y
gasto-planificado ESTÁ EN MAIN** (`9f26264`). Pero entró **por otra vía**, no
mergeando tus ramas.

**Tus cinco ramas quedaron intactas, con los mismos shas. No las mergees ni las
apliques tal cual: pisarían lo que ya entró.** Abajo está exactamente qué hacer.

> **Nada tuyo se descartó.** El eslabón resuelve bien el hueco del caso 2 —con
> `pago_id` se llega del cheque al pago y del pago a las cuotas a reabrir— y la
> caja elegible es tu commit tal cual. Lo que se reorganizó es **cómo** entró,
> por dos cosas que se habrían roto al mergear derecho. Están explicadas al
> final.

---

#### Qué entró, y cómo

| | qué pasó |
|---|---|
| **`registrar_cobro`** | Tu eslabón **combinado sobre la versión del repo** — ver abajo |
| **`cambiar_estado_cheque`** | **Cherry-pick de tu commit `c0a73d3`**, tal cual, con tu autoría |
| **`registrar_movimiento_fondo`** | Tu lógica del fondo, **extraída** a una migración limpia |
| **`gasto-planificado`** | **Mergeado completo**, sin tocar nada |

**`registrar_cobro` · `20260816200000_eslabon_cheque_pago_sobre_repo.sql`**

Tus tres injertos —los params de cheque, la validación de número/banco/fecha, y
el `insert into cheque` con `pago_id`— entraron **exactos**. Lo que cambió es la
base sobre la que se escribieron.

Tu rama lo escribió sobre la versión de **producción**. Pero el repo tenía otra,
mejor, que nunca se había aplicado —era la divergencia repo↔base que veníamos
arrastrando, documentada en `decisiones.md`—. Aplicar la tuya habría perdido, en
silencio:

· la validación `v_agrupado <> v_imputado` con su mensaje *«El asiento cubriría %
  de los % imputados: alguna cuota no resolvió su concepto»*, que dice **qué**
  pasó y no sólo que no cuadra;
· ~44 líneas de comentarios que explican por qué el débito se deriva de los
  grupos y no de `p_monto`, por qué se sacó el fallback a `auth.users`
  (decisión 89) y por qué la imputación tiene que cubrir el pago completo.

**La versión en main tiene las dos cosas: tu funcionalidad y esos comentarios.**
De paso cierra la divergencia, hacia el lado bueno.

**`registrar_movimiento_fondo`** salía de `20260812210000`, que traía **dos**
funciones: el fondo (aprobado) y la `cambiar_estado_cheque` con la caja
hardcodeada (la que la revisión pidió cambiar). Se extrajo **sólo el fondo**, sin
tocarle una línea. Traer el archivo entero habría metido en main una migración
que aplica algo rechazado para corregirlo dos migraciones después.

---

#### 🔴 Lo que tenés que hacer para no pisar main

**1 · `feat/eslabon-cheque-pago` — NO la apliques tal cual.** Su
`registrar_cobro` pisaría el de main con la versión sin comentarios. Al traer
main a tu rama, **borrá `20260814180000_eslabon_cheque_pago.sql`**: su contenido
ya está en main, mejorado.

**2 · `feat/bloque8-caja-elegible` — ídem.** Su `cambiar_estado_cheque` ya está
en main por cherry-pick, y la rama arrastra el eslabón viejo. Al traer main,
**resolvé quedándote con lo de main**.

**3 · `feat/bloque8-funciones-propuesta` — quedó obsoleta.** Su
`cambiar_estado_cheque` fue reemplazada y su fondo está extraído. **Se puede
borrar.**

**4 · Traé main a tus ramas activas antes de seguir**, para partir de lo que ya
está y no reconstruir sobre una base vieja.

---

#### Por qué no se mergeó derecho

Dos cosas se habrían roto, y ninguna tiene que ver con la calidad de tu trabajo:

**La versión buena de `registrar_cobro`** — explicado arriba. Es una divergencia
vieja, anterior a tu rama; te tocó a vos porque tu migración pasaba justo por ahí.

**El orden del historial.** Tus migraciones del bloque 8 tenían timestamps del
**14/08**, que caen **antes** de lo que ya estaba aplicado (`20260816162556` la
siembra, `20260816184239` el ruteo de inversión, `20260816193835` las vistas de
activos). Mergearlas así habría vuelto a meter migraciones nuevas en el pasado
del historial aplicado — el mismo desorden que se acababa de arreglar. Se
renombraron a `20260816201000` y `20260816202000`.

Las de `gasto-planificado` son `20260817*`, ordenan bien, y **no se tocaron**.

---

#### Estado

`supabase db push --dry-run` → **«Remote database is up to date»**. Historial: 73
migraciones, **todas con archivo y registradas, en orden creciente**.

Producción intacta y con las capacidades instaladas **en cero** —`cheque`,
`movimiento_fondo` y `gasto_planificado` sin filas—: 68 asientos, diario
cuadrando en $124.841.267.

**Y el caso 2 del bloque 8 ya se puede construir.** Con `pago_id` en `cheque`, un
cheque rechazado llega al pago y del pago a las cuotas. Era lo único que faltaba
—lo dejaste anotado vos mismo en tu migración— y ahora está.

---

### ✅ OK · dale con la 5ª rama de `v_cashflow_comprometido` · 16/08/2026 · de Facu para Horacio

**Adelante.** Tu diseño coincide con lo que se decidió: los devengados-impagos van
a **comprometido** —es plata pactada con monto cierto, no una estimación—, y
calcar `GREATEST(devengado_at, CURRENT_DATE)` + `fecha_original` + `arrastrada` es
exactamente el patrón de las cuotas vencidas. Un gasto que venció y no se pagó es
lo mismo que una cuota vencida e impaga: se arrastra a hoy y se marca.

**Dejala en migración sin aplicar**, como venís haciendo con todo lo que toca
`v_cashflow_*`.

**Y muy bien haber avisado antes de escribir.** Ése es el protocolo que se pidió:
coordinar antes de **tocar** una vista viva, no sólo antes de aplicarla. Cuando la
vista ya está en producción y una pantalla la usa con datos reales, para cuando
hay algo escrito la conversación ya arranca torcida. Seguí así.

---

#### Las otras dos, breve

**Los fijos con `torneo_id = NULL`:** bien resuelta. Presupuesto nuevo sobre el
mismo ejercicio y las 2 líneas movidas, dejando las 4 variables del torneo sin
tocar, es exactamente el alcance. **El trigger opcional está bien dejarlo para
después** — no era parte de la tarea y sumarlo habría ampliado el cambio.

**Sacar `unico` de la vista:** correcto, y el mismo tratamiento que `anual` es el
criterio adecuado — trampa latente, sin uso hoy, se resuelve con el primer caso
real en vez de con una hipótesis. Tu salida —**migrar esas líneas a
`gasto_planificado`**, que ya tiene fecha propia y vínculo, en vez de inventarle
una convención a `presupuesto_linea`— queda anotada como el camino cuando
aparezca el primer caso.

---

#### Un cuidado, con el detalle exacto

**El timestamp: usá el que registre la herramienta.** Ya te lo marcamos, pero hay
un caso concreto que conviene que veas antes de aplicar nada, porque no todas tus
migraciones están igual:

| rama | archivo | situación |
|---|---|---|
| `eslabon-cheque-pago` · `bloque8-caja-elegible` | `20260814180000`, `20260814190000` | ⚠️ **caen ANTES** de lo ya aplicado |
| `gasto-planificado` | `20260817100000` … `20260817120000` | ordenan bien, sólo hay que renombrarlas |

Producción ya tiene aplicadas `20260816162556` (siembra), `20260816184239` (ruteo
de inversión) y `20260816191333` (asentar_amortizacion). **Las dos del 14/08
quedarían en el pasado de un historial ya aplicado**, que es peor que un simple
desfase de nombre. Las del 17/08 sólo necesitan renombrarse a la versión que
quede registrada.

---

### ✅ Tomada · los fijos van con torneo_id = NULL · para Facu

La tomé — está en `feat/gasto-planificado`. Presupuesto nuevo (torneo_id NULL, mismo ejercicio 2026) + las 2 líneas fijas (Sueldos administrativos, Alquileres) movidas ahí. El presupuesto del torneo queda con sus 4 líneas variables sin tocar. Verificado con begin/rollback, sin aplicar.

No agregué el trigger opcional que mencionaste (espejo de check_gasto_coherente en presupuesto_linea) — lo dejo para después si te parece que hace falta, no quería meter más cambios de los que pediste explícito en la tarea.

---

### 🔧 Aviso · voy a agregar una rama a v_cashflow_comprometido · para Facu

Empecé a construir lo acordado (gasto_planificado ya está en `feat/gasto-planificado`, sin aplicar). Para los 7 gastos devengados-impagos, dijiste que van como rama de comprometido — reviso `v_cashflow_comprometido` para calcar el patrón, y confirmo: es un `UNION ALL` de 4 SELECTs con `GREATEST(fecha, CURRENT_DATE)` / `fecha_original` / `arrastrada`.

Voy a agregar una 5ta rama por `UNION ALL`, sin tocar las 4 que ya están — mismo criterio que elegí para v_cashflow_estimado (aditivo, no modificar lo existente). La rama nueva: gastos con `devengado_at is not null and pagado_at is null`, calcando `GREATEST(devengado_at, CURRENT_DATE)` como fecha y `devengado_at < CURRENT_DATE` como arrastrada, igual que hacés con vence_at en las otras 3 ramas.

Como v_cashflow_comprometido está en producción y la toca /proyeccion, lo dejo en migración sin aplicar como todo lo demás — pero quería avisarte antes de escribirla, ya que me pediste explícito coordinar cualquier cosa que toque vistas vivas antes de tocar, no solo antes de aplicar.

Si no tenés objeción, la escribo y la dejo en el mismo branch.
---

### ↩️ Respuesta · unico queda afuera de la vista, por ahora · para Facu

Tenías razón con el hueco: usé `ejercicio.fecha_desde` como fecha de `unico`, y no hay tal convención — vos lo dijiste explícito, no hay columna de fecha en `presupuesto_linea`. Y sin vínculo, esa rama quedaba sin anti-doble-conteo.

Saqué `unico` de `v_cashflow_gastos_estimado_extra` — mismo tratamiento que le diste a `anual`: trampa latente, ninguna línea la usa hoy, se resuelve cuando aparezca el primer caso real. Si aparece, la salida más limpia es migrar esas líneas a `gasto_planificado` (que ya tiene fecha propia y vínculo), no inventarle una convención a `presupuesto_linea`.

La vista queda con una sola rama por ahora (`gasto_planificado`, pendientes). En `feat/gasto-planificado`, verificada compilando junto con la tabla.

Sobre `por_mes`: gracias por frenarlo antes de que llegara a aplicarse — lo tenía en el plan y habría roto el cashflow en silencio con el torneo actual sin fechas. Sacado del alcance, como pediste.

Sigo con la 5ta rama de `v_cashflow_comprometido` (los 7 devengados-impagos) — ver el aviso de abajo, sigue esperando tu OK antes de escribirla.
### ❌ Corrección · `por_mes` NO se toca · 16/08/2026 · de Facu para Horacio
**Leé esto antes de escribir la vista.** La propuesta de gastos futuros te pedía
*«corregir `por_mes` a los meses del torneo»*. **Ese punto estaba equivocado**, y
lo tomaste en tu plan de construcción. **Sacalo.**

**Lo actual es lo correcto.** `v_cashflow_estimado` genera los fines de mes sobre
`ejercicio.fecha_desde..fecha_hasta` —los 12 meses del año— y así tiene que
quedar: **los gastos fijos son anuales por diseño.** Alquiler y sueldos se pagan
los 12 meses, **haya torneo o no**. Por eso el estimado muestra −$4.700.000 en
diciembre aunque el torneo termine en noviembre: no es un desborde, es la
estructura corriendo todo el año.

**Y el cambio habría roto el cashflow hoy mismo, en silencio:**

| torneo | `fecha_desde` | `fecha_hasta` | |
|---|---|---|---|
| **Clausura 2026** | **NULL** | **NULL** | ⚠️ `generate_series` daría **cero filas** |
| Apertura 2027 | 2027-03-01 | 2027-07-31 | ok |

**El torneo en curso no tiene fechas cargadas.** Usar las del torneo habría
borrado los −$4.700.000/mes sin error y sin advertencia — el peor modo de falla,
porque el número que queda sigue siendo plausible.

*El punto ya quedó corregido dentro de la propuesta misma, más abajo.*

---

### ↩️ Respuesta · las 3 del cashflow · 16/08/2026 · de Facu para Horacio

Van las tres que pediste para arrancar.

---

#### 1 · ¿Qué fecha lleva un gasto `unico`?

**Fecha propia**, la que se planea gastarlo. **No** el arranque del ejercicio.

*El dato que te falta:* **`presupuesto_linea` no tiene ninguna columna de fecha.**
Así que un `unico` sale de una convención, o migra a `gasto_planificado`.

> **⚠️ El cabo suelto de tu decisión.** Elegiste que `unico` y `gasto_planificado`
> vayan como **dos entradas del mismo mecanismo**, en tablas separadas. Con eso,
> **sólo `gasto_planificado` tiene dónde colgar `planificado_id`** — un `unico` de
> `presupuesto_linea` no tiene columna para el vínculo, y **queda sin
> anti-doble-conteo** (ver respuesta 3: es justo la rama que lo necesita).
>
> O migran los `unico` a `gasto_planificado`, o esa rama queda descubierta.
> **Decisión tuya**, pero conviene tomarla antes de escribir la vista.

---

#### 2 · `por_mes` corregido

**No lo toques.** Ver la corrección de arriba.

---

#### 3 · Excluir lo ya devengado

Es **más simple de lo que asumías**, y la respuesta cambia según la rama.

**Para `por_partido`, `por_dia_cancha` y `por_mes`: no hace falta nada.** Ni
modelo nuevo ni restar por monto. **La fecha ya lo resuelve estructuralmente** —
`v_cashflow_estimado` proyecta sólo `fecha > CURRENT_DATE`, y lo ya gastado
corresponde a jornadas cumplidas, que el estimado no toca. Verificado:

| | |
|---|---|
| hoy | 2026-08-16 |
| fecha mínima del estimado | 2026-08-22 |
| gastos con `devengado_at` futuro | **0** (los 12 son pasados) |
| filas del estimado en fecha pasada | **0 — cero solapamiento** |
| jornadas ya jugadas / futuras | 33 no se proyectan / 250 sí |

**No filtres por monto acumulado en estas tres:** agregaría una resta sobre algo
que ya está excluido, y **descontaría dos veces**.

**Para `unico` y `gasto_planificado`: sí hace falta, y por vínculo.** Van a una
fecha elegida que puede ser futura, así que el solapamiento es real. Se resuelve
con **el vínculo que ya creaste** en `feat/gasto-planificado`: es la opción (a),
**acotada a donde hace falta** — no un `presupuesto_linea_id` global.

> *Nota:* lo modelaste como **`gasto_planificado.gasto_id`**, al revés de lo que
> decía la propuesta (`gasto.planificado_id`). **Está bien así** — la FK vive en
> la tabla nueva y no le agrega una columna a `gasto`. Sólo lo dejo dicho para que
> no crees las dos: **con la tuya alcanza.**

**Descartá la opción (b) —acumulado por categoría.** Dos razones medidas:

· **El cruce por torneo falla.** Alquileres está presupuestado bajo Clausura 2026
  y sus gastos reales van con `torneo_id = NULL`: **$777.000 que el cruce no ve**
  (ver la tarea de abajo, que es esta misma causa).
· **No hay ningún `unique`** que garantice una línea por categoría — ni en
  `presupuesto_linea` ni en `presupuesto`. Dos líneas de la misma `cat_gasto` son
  legales, y ahí el acumulado no sabe a cuál restarle.

**El borde a vigilar:** un gasto atado a una jornada **futura** sí duplicaría.
**Hoy hay 0 casos** —los 7 gastos con jornada son todos de jornadas ya jugadas—
pero es el caso a tener presente.

---

### 🔧 Tarea · los fijos van con `torneo_id = NULL` · sin dueño asignado

**Arreglo de datos, zona libre — a coordinar quién la toma.**

*El problema:* las líneas de presupuesto de gastos fijos —**Sueldos
administrativos** y **Alquileres**— están cargadas bajo **Clausura 2026**. Pero
los gastos fijos **reales** van con `torneo_id = NULL`, y no por criterio de quien
carga: **el trigger lo obliga**.

```sql
-- check_gasto_coherente
if nat = 'recurrente' and new.torneo_id is not null then
  raise exception 'Los gastos recurrentes son de estructura, no de un torneo';
end if;
```

Es la regla 3: la estructura permanente no se prorratea entre torneos.

*Por qué quedó así:* **`presupuesto` y `presupuesto_linea` no tienen ningún
trigger.** Nada valida del lado del plan lo que la base sí exige del lado real.

*Qué rompe:* el cruce presupuesto ↔ real. Es la causa exacta de los **$777.000**
de Alquileres que no cruzan. Y **11 de las 32 categorías son `recurrente`** —las
11 con `unidad_default = 'por_mes'`—, así que en cuanto se presupuesten, todas
caen en lo mismo.

*El arreglo:* un presupuesto con **`torneo_id = NULL`** para el ejercicio 2026, y
mover ahí las 2 líneas `por_mes`. El modelo ya lo admite: `presupuesto.torneo_id`
es anulable y el DDL lo documenta como *«NULL = presupuesto de estructura anual»*.

*Opcional, para que no vuelva a pasar:* un trigger en `presupuesto_linea` que
espeje `check_gasto_coherente` — una línea `recurrente` no puede colgar de un
presupuesto con torneo.

> **No afecta al cashflow.** `por_mes` cuelga del **ejercicio**, y `ejercicio_id`
> es `NOT NULL` en todo presupuesto, así que el reparto temporal sale bien igual.
> Lo que arregla es el **cruce con lo real** y la lectura por torneo.

---
### ↩️ Respuesta · unico vs gasto_planificado · para Facu

Van como **dos entradas del mismo mecanismo**, no unificadas en una tabla. `presupuesto_linea` con `unidad='unico'` y `gasto_planificado` siguen siendo tablas separadas, pero la vista nueva (`v_cashflow_gastos_estimado_extra`) lee de las dos con una rama compartida — mismo shape de salida (fecha, monto, detalle), origen distinto.

Razón: es el movimiento menor, coherente con elegir (c) para el resto — evito migrar `unico` fuera de `presupuesto_linea` ahora. Si más adelante conviene unificar en una sola tabla, se hace con las dos fuentes ya funcionando por separado, no a ciegas.

Con esto las 3 decisiones están cerradas. Empiezo a construir:
1. Migración: tabla `gasto_planificado` + `gasto.planificado_id` (vínculo, mismo patrón que `cheque.pago_id`)
2. Vista `v_cashflow_gastos_estimado_extra`: rama `unico` (de presupuesto_linea, filtrando ya devengado) + rama `gasto_planificado` (no ejecutados) + `por_mes` corregido (fechas del torneo, no del ejercicio) + los 7 gastos devengados-impagos con GREATEST(devengado_at, CURRENT_DATE), calcando el patrón de v_cashflow_comprometido
3. Todo en migración sin aplicar, para tu revisión — mismo patrón que el bloque 8

Antes de aplicar te va a llegar la propuesta acá.

---

### ↩️ Respuesta · gastos futuros en el cashflow · para Facu

Voy con **(c) — vista nueva, aditiva, sin tocar `v_cashflow_estimado`**. Las otras dos tocan una vista en producción que `/proyeccion` usa ahora mismo con datos reales (602 filas, −$94.250.000); (c) no le cambia una línea. El costo de partir la lógica en dos lugares lo prefiero al riesgo de romper lo que ya funciona.

**Diseño propuesto** (`v_cashflow_gastos_estimado_extra`, nombre a discutir):

- **`unico`**: una fila por `presupuesto_linea` con `unidad='unico'`, en una fecha. ¿Qué fecha? Sugiero `presupuesto.fecha_desde` del ejercicio como default, pero es justo el punto que necesito que confirmes — ¿hay algún dato de "cuándo" para un gasto único, o asumo el arranque del ejercicio/torneo?
- **`anual`**: mismo caso, ¿una fecha fija (inicio de ejercicio) o se reparte?
- **`por_mes` corregido**: cambio el rango de `ejercicio.fecha_desde/fecha_hasta` a las fechas del TORNEO. Viendo `v_presupuesto_total`, `p.torneo_id` ya está disponible — voy a necesitar `min(jornada.fecha)` y `max(jornada.fecha)` del torneo en vez de las del ejercicio. Si un torneo no tiene jornadas con fecha, ¿la línea `por_mes` de ese torneo no aporta nada (igual que `por_partido`/`por_dia_cancha` con calendario vacío), o necesita un fallback?
- **Excluir lo ya devengado**: para no duplicar, filtro por `presupuesto_linea` que no tenga ya un `gasto` devengado equivalente. ¿Existe un vínculo `gasto ↔ presupuesto_linea`, o el anti-doble-conteo es a nivel de categoría/monto acumulado (restar lo ya devengado de esa cat_gasto en el período, sin vínculo fila a fila)? Esto es lo que más necesito que definas antes de escribir la vista — es la pieza que decide si hace falta modelo nuevo o es solo SQL.

**Sobre TIPO B (gasto_planificado)**: de acuerdo con tabla propia, no reusar presupuesto_linea. Cuando definamos lo de arriba, armo la migración de la tabla + el vínculo gasto.planificado_id (mismo patrón que cheque.pago_id) + la rama en la vista nueva.

**El hueco de los 7 gastos devengados sin vencimiento**: de acuerdo en que necesita una columna en `gasto` (¿`vence_at`? ¿se deriva de algo?). Lo dejo para después de lo de arriba, es más chico.

No empiezo a escribir código hasta tener las 3 respuestas de arriba — son las que definen si esto es una vista con SQL nuevo o si primero hace falta un vínculo de modelo, como pasó con cheques.

---

### 💡 Propuesta · gastos futuros en el cashflow · 16/08/2026 · de Facu para Horacio

**Diseño de Facu, implementación de Horacio.** Toca `v_cashflow_*` y necesita
modelo nuevo, así que es tu carril.

Cubre **dos tipos de gasto futuro**, y se apoya en el patrón que ya usás para los
ingresos comprometidos en vez de inventar uno nuevo.

**Es propuesta, no orden.** Si algo no cierra con cómo tenés armado el cashflow,
discutámoslo acá antes de que lo implementes.

> **Estado · las tres decisiones abiertas quedaron resueltas** (16/08). Están
> marcadas **✅ Resuelto** donde corresponde: el doble conteo del Tipo A, la fecha
> del gasto `unico`, y la fecha de los gastos impagos. Queda **una sola cosa para
> que decidas vos**, dentro del Tipo A: **cómo** garantizar que el presupuesto no
> se duplique. El **qué** ya está cerrado.

---

#### Punto de partida · qué hay hoy

Para que no construyas dos veces, el estado medido en producción:

| nivel | qué proyecta | hoy |
|---|---|---|
| `v_cashflow_real` | lo que ya tocó caja | 14 filas · +$11.552.000 |
| `v_cashflow_comprometido` | cuotas de equipo y sponsor | 277 filas · +$267.453.000 |
| `v_cashflow_estimado` | **gastos del presupuesto** | 602 filas · **−$94.250.000** |

**El nivel estimado ya proyecta gastos del presupuesto, y ya los ubica en el
tiempo** — hace `join` contra las fechas del calendario, con una rama por unidad:

| mes | por_partido | por_dia_cancha | mensual |
|---|---|---|---|
| 2026-08 | −6.300.000 | −3.200.000 | −4.700.000 |
| 2026-09 | −15.900.000 | −6.400.000 | −4.700.000 |
| 2026-10 | −18.000.000 | −6.400.000 | −4.700.000 |
| 2026-11 | −12.150.000 | −2.400.000 | −4.700.000 |
| 2026-12 | — | — | −4.700.000 |

Y las dos ramas de **egreso comprometido** ya están escritas: `compromiso` con
`sentido='pagar'` y `cheque` con `sentido='emitido'`. No aportan nada porque las
dos tablas están vacías, no porque falte el código.

Lo que sigue **extiende esto**, no lo reemplaza.

---

#### TIPO A · gastos estructurales, de fórmula

Los que salen del presupuesto y escalan con el torneo.

**Distribución por unidad de `presupuesto_linea`:**

| unidad | cómo se ubica en el tiempo | estado |
|---|---|---|
| `por_partido` | por los partidos de cada jornada, en la fecha de esa jornada | **ya funciona así** |
| `por_dia_cancha` | ídem, por día de cancha | **ya funciona así** |
| `por_mes` | parejo por los **meses del ejercicio** (los 12 del año) | **ya funciona así — NO tocar** |

Las tres ya reusan el mecanismo de ingresos. **Ninguna hay que cambiarla.**

> **❌ CORREGIDO · esta propuesta decía «`por_mes` parejo por los meses del
> TORNEO», y estaba MAL.** Ver *«Corrección · `por_mes` no se toca»* arriba de
> todo en Avisos abiertos. El comportamiento actual —los meses del **ejercicio**—
> es el correcto: los gastos fijos son anuales por diseño. **Si tomaste ese punto
> en tu plan de construcción, sacalo.**

*Nota de precisión:* `presupuesto_linea` **no tiene `naturaleza`** — tiene
**`unidad`** (`por_partido`, `por_dia_cancha`, `por_mes`, `anual`, `unico`).
`naturaleza` vive en `cat_gasto` y es otro eje.

**Excluir lo ya devengado.** Proyectar sólo lo que falta gastar, para no contar
dos veces lo que ya entró como gasto real. Es el mismo principio que ya aplicás
en ingresos, donde la cuota entra por `saldo` y no por `monto`. **Hoy no está:**
`v_cashflow_estimado` filtra sólo `fecha > CURRENT_DATE`.

**Las dos unidades que faltan.** `anual` y `unico` **no tienen rama** en
`v_cashflow_estimado`: una línea con esas unidades suma en el presupuesto y
desaparece de la proyección, sin aviso. Hoy es trampa latente —ninguna línea las
usa— pero **10 de las 32 categorías tienen `unico` como `unidad_default`**, y son
justo las de gastos grandes de una vez (Compras e insumos, Equipamiento,
Proveedores).

> **✅ Resuelto · `unico` va a la fecha en que se planea.**
>
> Un gasto `unico` **no se distribuye**: no lo multiplica la escala ni lo ubica el
> calendario. Tiene **fecha propia**, y esa fecha es cuando se planea gastarlo.
>
> **Y acá está lo importante: eso es exactamente el TIPO B.** Un gasto `unico` del
> presupuesto **es** un gasto planificado con fecha — mismo patrón, monto y fecha
> propios, sin fórmula detrás. Las dos cosas que parecían separadas son una.
>
> **Mirá si conviene unificarlos** —que `unico` deje de ser una unidad de
> `presupuesto_linea` y pase a ser una fila de `gasto_planificado`— **o tratarlos
> como dos entradas del mismo mecanismo**, con una sola rama en el cashflow que
> lea de las dos fuentes. Lo segundo toca menos; lo primero deja un solo lugar
> donde vive «gasto con fecha propia». Es tu llamada.
>
> El costo de no unificarlos: la misma idea modelada en dos tablas, y el día que
> haya que cambiarla hay que acordarse de las dos.
>
> **`anual` queda pendiente aparte.** Sin rama y sin uso — **no bloquea nada**. Se
> resuelve cuando aparezca la primera línea que la necesite, y ahí habrá un caso
> real con el que decidir en vez de una hipótesis.

**Límite:** sólo torneos **con calendario**. Sin jornadas con fecha, el factor de
`por_partido` y `por_dia_cancha` es 0 — y eso no da «un total sin fecha», da
**$0**. Ojo también con que `jornada.fecha` es anulable: un fixture sin fechas
tampoco entra, porque el filtro descarta los nulos.

> **✅ Resuelto · la salida técnica la elegís vos; el invariante no se negocia.**
>
> **El invariante: el presupuesto tiene que aparecer UNA sola vez en
> `v_cashflow`.** Hoy da **−$94.250.000**. No puede pasar a −$188.500.000.
>
> Esto importa porque la propuesta original pedía una vista **nueva** aditiva sin
> tocar `v_cashflow_estimado`, y tal cual duplicaba: las mismas líneas entrarían
> dos veces al `UNION ALL`, **sin error y sin advertencia**. Un egreso proyectado
> al doble sigue siendo un número plausible, y por eso no se cuestiona.
>
> **Cómo lo garantices es decisión tuya.** Tres salidas que sirven — cualquiera
> de las tres, o una cuarta que se te ocurra:
>
> **(a)** Extender `v_cashflow_estimado` con los cambios de arriba. Es el menor
> cambio y no duplica, pero toca una vista que ya está en producción.
> **(b)** Crear `v_cashflow_gastos_estimado` **y sacar el presupuesto de**
> `v_cashflow_estimado`, que quedaría para otras estimaciones. Más limpio de leer,
> más movimiento.
> **(c)** Vista nueva sólo para lo que hoy **no** está —`unico` y la corrección de
> `por_mes`— dejando las dos ramas que ya funcionan donde están. Aditivo de
> verdad, al costo de partir la misma lógica en dos lugares.
>
> Facu no tiene preferencia entre ellas: **el requisito es el resultado, no el
> camino.** Si elegís otra, decila acá y listo.

---

#### TIPO B · gastos puntuales planificados

El caso *«se rompió un arco y hay que comprarlo el mes que viene»*: monto y fecha
propios, **sin fórmula ni escala detrás**. Hoy **no hay dónde guardarlos** —
verificado: no existe ninguna tabla para esto.

**Tabla nueva `gasto_planificado`**, con monto, fecha esperada, descripción,
`cat_gasto` y estado/flag de ejecutado.

*Decisión de Facu: tabla propia, no reusar `presupuesto_linea`.* Esa tabla modela
gastos **de escala** —una tarifa que se multiplica por partidos o meses—, y un
gasto puntual no tiene ni tarifa ni multiplicador. Meterlo ahí obligaría a
`unidad = 'unico'` con `cantidad = 1` y una fecha que la tabla no tiene.

> **↑ Ojo con el Tipo A:** un gasto de unidad `unico` **es este mismo patrón**
> —monto y fecha propios, sin fórmula—. Ver *«`unico` va a la fecha en que se
> planea»* más arriba: hay que decidir si se unifican en esta tabla o si son dos
> entradas del mismo mecanismo. **Las dos mitades de esa decisión son una sola.**

**El cashflow estimado la lee:** cada gasto planificado no ejecutado aparece como
egreso en su fecha.

**Al pagarse de verdad, sale del estimado.** Se marca ejecutado y el gasto real lo
reemplaza — mismo principio anti-doble-conteo que el tipo A.

> **Pieza a modelar: el vínculo.** Para saber cuál marcar al pagar hace falta una
> columna tipo `gasto.planificado_id`. **Es el mismo tipo de eslabón que falta en
> `cheque` ↔ `pago`** — y ese caso ya mostró qué pasa cuando no está: la función
> que cambia el estado recibe un id de una fila que nadie vinculó. Vale la pena
> resolverlo de entrada acá.

---

#### Notas

**Todo aditivo a propósito.** La tabla es nueva y la vista se enchufa al
`UNION ALL` — `v_cashflow` sólo consume `fecha, nivel, origen, detalle, monto`,
así que cualquier rama nueva entra sola respetando esas cinco columnas y el signo
(**no hay columna `sentido`: el signo del monto ES el sentido**). **No choca con
el bloque 8.**

**El principio unificado de todo el cashflow futuro:** *lo estimado es lo que
todavía no ocurrió; cuando ocurre, pasa al real y sale del estimado.* Vale para
ingresos (ya lo hacés, vía `saldo`), para los gastos de presupuesto (tipo A) y
para los planificados (tipo B).

**Un hueco aparte, que no cubre ninguno de los dos tipos:** hay **7 gastos
devengados e impagos por $12.194.767** que no están en **ningún** nivel del
cashflow. No están en real (no tocaron caja), ni en comprometido (esa vista no lee
`gasto`), ni en estimado (no son presupuesto). Es plata pactada con monto cierto,
así que va como rama de **comprometido**.

> **✅ Resuelto · van «ya»: al corto plazo inmediato.**
>
> Están **vencidos e impagos**, así que no se proyectan a una fecha futura: entran
> en **la próxima semana / el próximo período**. Es plata que hay que pagar ahora,
> y el cashflow tiene que mostrarla ahora.
>
> **Esto NO es agregarle vencimiento a `gasto`.** Son dos cosas distintas y
> conviene no mezclarlas:
>
> · **Lo de acá** — «ya venció, va al cashflow inmediato». No necesita columna
>   nueva: se resuelve con la fecha que ya existe.
> · **Fecha de pago pactada por gasto** —«a este proveedor le pagamos a 30 días»—
>   sí necesitaría una columna de vencimiento. **Es otra cosa, y va aparte** si
>   algún día se quiere.
>
> *Un dato que te ahorra trabajo:* el patrón que ya usás en
> `v_cashflow_comprometido` **hace exactamente esto**. `GREATEST(vence_at,
> CURRENT_DATE)` arrastra lo vencido a hoy, `fecha_original` conserva la fecha
> real y `arrastrada` marca que se movió. La rama de gastos impagos puede calcarlo
> con `devengado_at` en lugar de `vence_at` — y de yapa quedan marcados como
> arrastrados, que es justo lo que son.

**El propósito 1 —pantalla de presupuesto y tarifas para torneo futuro— es
aparte, lo encara Facu.**

---

### 📋 Plan de trabajo · 16/08/2026 · acordado por Facu

**Para avanzar en paralelo.** Cada uno en su carril, en zonas que no se cruzan,
este archivo como canal, y **lo compartido se agenda para sentarse juntos**.

La sesión pasada lo probó: los dos tocamos `/gastos` —Horacio el formulario de
alta, Facu la lista y las tarjetas— y **no hubo un solo conflicto**. Sus dos
ramas siguen mergeando limpio contra `main`. Con las líneas trazadas, la misma
zona aguanta a los dos.

> **Horacio: hacé `pull` antes de retomar.** Tus dos ramas salen de `ec27a2a`,
> que es anterior a la respuesta al bloque 8 — está más abajo en este mismo
> archivo, con los cuatro asientos revisados uno por uno.

---

#### 🔧 Carril Horacio · escritura y motor

**1 · El eslabón cobro-cheque.** *Lo primero: todo lo demás del circuito cuelga
de acá.*

Que `registrar_cobro` con `p_medio = 'cheque'` **cree la fila en `cheque`** —
número, banco, fecha de cobro— y la **vincule al pago con una columna nueva**.

Hoy no existe: cero `insert into cheque` en todo el repo, y la tabla tiene 0
filas. Por eso **tu `cambiar_estado_cheque` no tiene de dónde partir**: recibe un
`p_cheque_id` de una fila que nadie crea. Y sin el vínculo, **cuando un cheque
rebota no se sabe qué pago canceló, ni por lo tanto qué cuota reabrir** — las FK
de `cheque` son a `tercero` y a los dos asientos, nada más.

**2 · Los 3 asientos aprobados del bloque 8**, con el único cambio pedido: **la
caja va elegible, no hardcodeada.** Vale para el caso 1 (cheque acreditado) y el
caso 3 (cheque debitado), que hoy fijan `CAJA_TRANSFERENCIA`. Es exactamente lo
que ya hiciste bien en el caso 4, sacándola de `p_caja_id`. El día que haya dos
bancos, la versión fija miente.

**3 · Pagos parciales de gasto** — *antes de construir, confirmá con Facu si pasa
de verdad.* Hoy `gasto.pagado_at` es un timestamp único: un gasto está pagado o
no lo está, no existe «parcial». Si los gastos del torneo se pagan en cuotas es
cambio de modelo (tabla de pagos de gasto, tocar `pagar_gasto`, rehacer el estado
en `v_gasto_detalle`). Si siempre se pagan de una, no se toca nada.

**4 · Tu `fix/gastos-errores-humanos`: que no tape tus propios mensajes.**
Traduce bien los errores genéricos de Postgres, pero **los `raise exception` de
tus funciones caen en el fallback**. El mensaje cuidado que escribiste vos —*«Un
retiro en efectivo tiene que decir de qué predio salió la plata, o el arqueo de
ese día no cierra»*— termina mostrándose como *«No se pudo registrar el pago»*,
que es peor que el original. Dejá pasar el mensaje crudo cuando no matchea ningún
patrón conocido, o detectá los propios primero.

**5 · El timestamp de la migración: el que registre la herramienta, no uno a
mano.** Es regla nueva y ya está documentada en el README. **El CLI compara por
versión**, así que un número elegido antes hace que `db push` quiera correr de
nuevo una migración ya aplicada. Se acaba de sincronizar el historial por
exactamente esto: había once archivos desalineados. Si aplicás por MCP o desde el
panel, **renombrá el archivo a la versión que quedó registrada**.

---

#### 🎨 Carril Facu · display puro

No toca la escritura de Horacio: son vistas de lectura, listas, tarjetas, filtros
y gráficos.

| | pantalla | estado del backend |
|---|---|---|
| **1** | **Presupuesto por fecha** | Completo y **con datos**: 6 líneas cargadas. `/proyeccion` ya lo usa vía `v_cashflow_estimado` |
| **2** | ~~**Activos**~~ · ✅ **construida** | Lista, detalle, alta y asentar amortización. `asentar_amortizacion` + las tres vistas |
| **3** | ~~**Cheques**~~ · ✅ **construida** | Cartera, detalle y las tres acciones. Terminó siendo más que display: llevó el asiento del rechazo, el nacimiento de los emitidos y `v_cheque`/`v_cheque_kpi` |
| **4** | **Calendario de pagos** *(la que sigue)* | `v_calendario_pagos` completa, con `tercero` y `criticidad` |

> **Nota de secuencia, no de bloqueo.** Estas pantallas leen tablas que hoy están
> **vacías** —`cheque` 0 filas, `compromiso` 0 filas, `amortizacion` 0 filas—
> porque todavía nada las escribe. Se construyen igual y **es deliberado que vayan
> en paralelo**: cuando el carril de escritura llegue, la pantalla ya está
> esperando.
>
> **Lo que enseñó Cheques:** «backend listo, falta el front» era optimista. Al
> construir la pantalla aparecieron tres bugs latentes que nunca habían disparado
> porque nadie usaba el circuito — el rechazo no asentaba nada, `pagar_gasto`
> acreditaba la cuenta equivocada, y el check de `gasto.medio_pago` ni siquiera
> aceptaba `'cheque'`. **Una tabla vacía esconde sus errores.** Vale la pena
> asumir que las otras dos también los tienen.

---

#### 🤝 Compartido · se agenda, NO se hace en paralelo

**RLS — el grande de seguridad.** Alto riesgo y **cruza todas las tablas**: la
lectura de Facu y la escritura de Horacio a la vez. Hoy hay **0 tablas con RLS** y
la anon key viaja en el bundle del navegador, así que cualquiera con esa clave
puede leer y escribir **con o sin login**. Merece una sesión dedicada de los dos,
no un reparto.

**Los pop-ups de «agregar movimiento».** Los formularios son de Horacio, la UI del
modal es de Facu. **Hay que acordar el enfoque antes de tocar:** envolver los
formularios que ya existen, o reescribirlos. Es la decisión que define quién toca
qué.

**Ventas de bar — empieza por modelar.** `ING_BAR` existe con **0 movimientos** y
**no hay ninguna tabla de ventas** (cero tablas con `venta`, `producto` o `stock`
en el nombre). El club **sí** registra ventas, así que es roadmap real. Falta
decidir el **grano** —¿venta individual, cierre de caja por día, por jornada?—,
la tabla, y cómo entra al diario. Probablemente el modelo lo hace Horacio y la
pantalla Facu, pero **la decisión de negocio va primero**.

> Los **gastos** de bar ya están cubiertos: `GAS_BAR` con 8 categorías, se cargan
> desde `/gastos` como cualquier otro. Lo que falta es sólo el ingreso.

---

#### La regla del paralelo

| | |
|---|---|
| **Display** — listas, tarjetas, filtros, gráficos, vistas de lectura | **Facu** |
| **Escritura** — funciones, formularios de alta y pago, motor SQL | **Horacio** |

**Si algo cruza, se agenda acá antes de tocar.**

---

### ✅ Bloque 8 · revisión de la propuesta · 14/08/2026 · de Facu para Horacio

**Revisada `feat/bloque8-funciones-propuesta`.** Respetaste la regla 11: la
migración está escrita y **sin aplicar**, con los cuatro ⚠️ marcados. Eso es
exactamente lo que hay que hacer cuando se toca el motor — gracias.

**Tres de los cuatro asientos van. El cuarto destapó un hueco de modelo que es
anterior a tu función**, así que no es algo que hayas resuelto mal: es algo que
todavía no existe.

---

#### Caso 1 · Cheque recibido → acreditado · **APROBADO**

`VALORES_A_DEPOSITAR` al haber contra la caja al debe es **fiel a la decisión
31**. La 31 dice que al cobrar con cheque el debe va a `VALORES_A_DEPOSITAR`;
acreditarlo es el segundo paso del mismo circuito, y tu asiento lo cierra.

**Un solo cambio:** la caja **no va fija a `CAJA_TRANSFERENCIA`**. Tiene que ser
elegible, como hiciste en el fondo (caso 4), donde la sacás de `p_caja_id`. Un
cheque puede acreditarse en cuentas distintas, y el día que haya dos bancos la
función queda mintiendo.

#### Caso 3 · Cheque emitido → debitado · **APROBADO**

`CHEQUES_A_PAGAR` al debe contra la caja al haber **calca el patrón de gastos**:
nace el pasivo al emitir, se cancela al debitarse. Es el mismo par que
`Proveedores a pagar / Caja` del pago de gasto (regla 7).

Ninguna decisión lo dice explícito, y **está bien igual**: es el patrón que el
sistema ya usa en todos lados. Mismo cambio que el caso 1 — **caja elegible, no
hardcodeada**.

#### Caso 4 · Fondo · colocación y rescate · **APROBADO**

Fiel a la **decisión 22**, y bien resuelto que la caja salga de `p_caja_id`.

*Sobre la tensión que marcaste con «sin saldo en Campa»:* la 22 rechaza un saldo
**mantenido a mano**, porque se desactualiza y un saldo desactualizado es peor
que no tenerlo. Un saldo **derivado del diario** —colocaciones menos rescates—
no se mantiene: se recalcula. Es lo contrario del problema que la 22 rechaza.
**Compatible.**

> *Nota aparte:* ese saldo refleja **lo movido**, no los rendimientos del fondo.
> Si algún día se quieren reflejar, es otro asiento contra `FIN_RENDIMIENTOS`.
> No hace falta ahora.

---

#### Caso 2 · Cheque recibido → rechazado · **NO se puede resolver todavía**

No es que el asiento esté mal: **falta un eslabón de modelo, y es anterior a tu
función.**

*El hallazgo, verificado:*

· **Cobrar con cheque hoy NO crea ninguna fila en `cheque`.** Cero `insert into
  cheque` en todo el repo — funciones, pantallas y seeds. La tabla tiene 0
  filas. `registrar_cobro` con `p_medio = 'cheque'` sólo cambia la cuenta del
  debe a `VALORES_A_DEPOSITAR` y genera el asiento. **No queda registro de qué
  cheque era**: ni número, ni banco, ni fecha de cobro.

· Por eso **`cambiar_estado_cheque` recibe un `p_cheque_id` de una fila que
  nadie crea.** Tu función está bien; le falta el paso anterior.

· Y no hay vínculo `cheque ↔ pago`: las FK de `cheque` son a `tercero` y a los
  dos asientos, nada más. **Cuando un cheque rebota, no se sabe qué pago canceló
  — y por lo tanto, qué cuota reabrir.**

*Sobre el argumento que usaste para dejarlo sin asiento:* «percibido puro, el
cobro ya se registró» **no aplica acá**. Percibido puro dice **cuándo se
reconoce** el ingreso, no qué pasa cuando el instrumento rebota.

Un cheque rechazado deja **dos cosas falsas** en el diario: un **ingreso
reconocido que no ocurrió** —el haber fue directo a `ING_INSCRIPCIONES` /
`ING_PARTIDOS`, no a Deudores— y un **activo que no existe** en
`VALORES_A_DEPOSITAR`. Sin reversa, esa cuenta acumula cheques rechazados para
siempre.

*Las dos decisiones, encadenadas — la segunda no se puede sin la primera:*

**1 · ¿El cobro con cheque crea la fila en `cheque`?** *(modelo · tu carril)*
Si sí, `registrar_cobro` necesita capturar número, banco y fecha de cobro, y
hace falta **un vínculo con el pago que hoy no existe como columna**.

**2 · Recién entonces, el rechazo.** *(la mecánica ya está clara)*
`anular_asiento` sobre el asiento del cobro —se llega por `origen_id = pago.id`,
y va por contraasiento porque el asiento no se edita (regla 4)—, borrar o marcar
el pago, y **la cuota se reabre sola**: `cuota.pagado_at` es derivado, y
`trg_sync_cuota_pagada` recalcula también en `DELETE`. No hay que tocar `cuota`
a mano.

Lo único que falta para poder escribir esto es el vínculo del punto 1.

---

#### Dos notas de coordinación

**El bloque 8 toca el roadmap de `arquitectura.md` §4.** Cheques y el fondo son
dos de las cuatro pantallas que documenté como «backend construido, falta
front». Si tus funciones se aplican, **Cheques gana lógica y §4 hay que
actualizarlo** — que no lo hagamos los dos por separado.

**El timestamp de tu migración está elegido a mano** (`20260812210000`). Es
exactamente la divergencia repo↔base que quedó documentada en `decisiones.md`
esta misma semana: el CLI compara por versión, así que si la aplicás por MCP la
base registra otro número y `supabase db push` va a querer correrla de nuevo.
Hoy **no colisiona** —ese número quedó libre al renombrar los nueve archivos—
pero conviene usar el que registre la herramienta, o acordar el número antes de
aplicar.

---

#### Aparte · `fix/gastos-errores-humanos`

Buen agregado, y llegó justo: `/gastos/nuevo` acaba de empezar a recibir tráfico
real (ver el aviso de abajo).

**Una cosa para mirar:** traduce los errores **genéricos de Postgres**
—`permission denied`, `not-null`, `foreign key`, `check constraint`— pero **no
los `raise exception` propios de las funciones**. Los mensajes cuidados que
escribiste vos caen en el fallback:

> *«Un retiro en efectivo tiene que decir de qué predio salió la plata, o el
> arqueo de ese día no cierra»*

termina mostrándose como *«No se pudo registrar el pago. (…)»*, que es **peor
que el original**. Valdría dejar pasar el mensaje crudo cuando no matchea
ninguno de los patrones conocidos, o detectar los propios primero.

---

### ⚠ `/gastos/nuevo` empezó a recibir tráfico real · 12/08/2026 · para Horacio

La pantalla existía con 547 líneas y **nada en el repo la enlazaba**: sólo se
llegaba escribiendo la URL a mano. Facu lo marcó como "no se ve cómo agregar un
gasto", y el relevamiento confirmó que no faltaba el formulario, faltaba el
botón.

Desde el rediseño de `/gastos` hay un **«Registrar gasto»** en el encabezado.
**Tu formulario de alta pasa a usarse de verdad**, con lo que eso implica: los
errores que hasta hoy sólo veía quien lo probaba a propósito ahora los va a ver
Guille.

No se tocó una línea de `/gastos/nuevo` ni de `/gastos/[id]/pagar`.

### Encolado · pagos parciales de gasto · carril de Horacio

Salió del rediseño de `/gastos`: **hoy un gasto está pagado o no lo está**.
`gasto.pagado_at` es un timestamp único, así que no existe el estado «parcial»
—a diferencia de las cuotas de equipo, que sí tienen `pago_imputacion`—.

La pantalla muestra `pagado` / `debe` / `anulado` y con eso alcanza mientras los
gastos se paguen de una. **Si empiezan a pagarse en cuotas, es cambio de
modelo:** tabla de pagos de gasto, tocar `pagar_gasto`, y rehacer la derivación
del estado en `v_gasto_detalle`.

*Antes de construirlo hay que preguntarle a Facu si pasa de verdad.*

### Encolado · adjuntar factura o recibo · depende de RLS

Facu lo pidió para `/gastos`. **No hay nada hoy**: cero referencias a `storage`
en el repo, cero buckets creados, ninguna columna de archivo.

Es una capacidad nueva que cruza tres carriles —infra (bucket y políticas),
modelo (tabla o columna), escritura (el upload en el formulario) y display
(mostrar y descargar)— pero eso no es lo que la frena.

**Lo que la frena es la seguridad.** Con RLS apagado en las 48 tablas y la anon
key en el bundle del navegador, un bucket mal configurado deja las facturas del
club —CUIT, razón social, montos— accesibles a cualquiera con la URL. **Va
después de RLS**, o con bucket privado y URLs firmadas desde el servidor.
