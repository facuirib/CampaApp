# Comprobantes y facturación — Propuesta de diseño (sin código)

Tres piezas de tamaño muy distinto, agrupadas porque comparten el tema pero
NO comparten alcance ni riesgo.

## 1 · Adjuntar comprobante a un gasto — chico, listo para construir

Al cargar un gasto, adjuntar el comprobante (factura/recibo del proveedor)
como archivo, guardado en el mismo registro de gasto (un comprobante por
gasto, confirmado).

**Modelo:**
- Bucket privado en Supabase Storage (`comprobantes-gasto`), sin acceso público
- Columna `comprobante_path` (text, nullable) en `gasto`
- Políticas de Storage: solo `authenticated` sube/lee
- URLs firmadas: el front pide una URL temporal a una Server Action, nunca
  accede al archivo directo

**Estaba encolada esperando RLS** — con RLS en 50/51, ya no está bloqueada.
Este punto está listo para pasar a código en cuanto se confirme.

**Decisiones menores:** formatos (PDF + JPG/PNG cubren todo), tamaño máximo,
sin validación de contenido.

---

## 2 · Módulo de facturación propia (emitir A/B/C, recibos, listado) — grande

Módulo nuevo completo: emitir documentos con numeración correlativa,
formato fiscal, y un lugar donde verlos todos juntos.

**Lo que implica:**
- Modelo de datos nuevo: tabla factura (tipo A/B/C/recibo no fiscal,
  numeración, punto de venta, CAE, vencimiento del CAE, estado)
- Numeración correlativa por tipo y punto de venta — invariante que hay
  que proteger igual de estricto que "Debe=Haber": dos facturas con el
  mismo número es un problema legal, no solo un bug
- Generación de PDF con el formato que exige ARCA (QR, CAE, leyendas)
- La pantalla "todas las facturas juntas" es la parte más simple, una vez
  que el resto existe

**Decisión de fondo, antes de diseñar nada:** ¿el club necesita facturar
fiscalmente (A/B/C, con CAE) los cobros de cuotas/inscripciones, o alcanza
con un recibo no fiscal (comprobante interno, sin validez ante ARCA)? Esto
cambia todo el alcance: un recibo no fiscal es un PDF simple sin
integración externa; una factura fiscal requiere el punto 3 completo.

---

## 3 · Integración con ARCA (ex AFIP) — decisión tomada: directo, sin costo

Con presupuesto ajustado, se descarta el intermediario de pago (~US$23/mes
el plan de entrada de TusFacturasAPP, verificado hoy) — se va directo al
webservice de ARCA (wsfev1), que no tiene costo de licencia.

**Lo que esto implica, siendo honesto:**
- Más tiempo de desarrollo que con un intermediario (SOAP, autenticación
  con certificado, tokens que expiran cada 12hs y hay que renovar)
- Mantenimiento no es continuo ni calendarizado, es reactivo a cambios
  normativos de ARCA (la última fue la RG 5.616/2024) — alguien tiene que
  enterarse cuando ARCA cambia algo, no hay un tercero avisando
  automáticamente
- Sin costo mensual

**Paso 0, antes de cualquier código — el certificado digital:**
El club tiene acceso al portal de ARCA (clave fiscal) pero todavía no
generó el certificado digital para el webservice. Esto se hace desde el
propio sitio de ARCA (Administración de Certificados Digitales) — es un
trámite que solo puede hacer alguien con la clave fiscal del club, no es
delegable a código ni a mí. Una vez generado, el archivo (.crt/.key) se
sube al servidor como variable de entorno segura, nunca al repositorio.

**Con el certificado ya generado, el desarrollo sería:**
1. Función de autenticación contra el WSAA (servicio de autenticación de
   ARCA) — obtiene un token válido por 12hs, usando el certificado
2. Función que arma y envía el pedido de CAE al WSFEv1 (webservice de
   facturación) — recibe los datos del comprobante, devuelve el CAE
3. Generación del PDF con el formato que exige ARCA (QR, CAE, leyendas)
4. Guardado del comprobante emitido en la tabla factura (punto 2)

Esto es trabajo real de varios días, no una tarea de una sesión — hay que
armar los XML del webservice SOAP con precisión, manejar los errores que
devuelve ARCA (que no siempre son claros), y probarlo contra el ambiente
de homologación antes de ir a producción.

---

## Orden sugerido, si se avanza

1. Comprobante de gasto (punto 1) — chico, ya destrabado, se puede hacer
   ahora, sin depender de nada más
2. Generar el certificado digital en ARCA — trámite del club, no técnico,
   puede hacerse en paralelo a cualquier otra cosa
3. Definir fiscal vs. recibo no fiscal — conversación de negocio
4. Recién con eso resuelto, diseñar el módulo de facturación (punto 2) y
   la integración con ARCA (punto 3) en detalle

El certificado (paso 2) no depende de definir nada de producto — se puede
generar ya mismo, en paralelo, así cuando se decida avanzar con el módulo
de facturación, esa pieza ya está lista.