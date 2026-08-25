# FECAESolicitar (pedido de CAE) — Notas técnicas antes de codear

No se escribió código de este paso todavía. El manual de ARCA (V4.6,
manual-desarrollador-ARCA-COMPG.pdf) muestra decenas de campos con
reglas condicionales cruzadas y +250 códigos de validación — necesita
revisión con calma antes de tocar el servidor real, incluso en
homologación.

## Lo que ya sabemos, para la Factura C (la más simple, se asumía que
CAMPA la usaría — VER CORRECCIÓN AL FINAL)

Campos obligatorios base:
- Concepto: 1=Productos, 2=Servicios, 3=Ambos
- DocTipo/DocNro: tipo y número de documento del receptor (80=CUIT,
  96=DNI, 99=Consumidor Final sin identificar)
- CbteDesde/CbteHasta: para tipo C, deben ser IGUALES (un solo
  comprobante por pedido)
- CbteFch: fecha, formato yyyymmdd. Si concepto=1, ventana de +-5 días
  respecto a hoy. Si concepto=2 o 3, +-10 días.
- ImpTotal: para tipo C, DEBE ser igual a ImpNeto + ImpTrib (no suma
  IVA, exento, ni neto no gravado - esos van en 0)
- ImpTotConc: DEBE ser 0 para tipo C
- ImpNeto: para tipo C, es el "Importe del Sub Total" (no es
  técnicamente "gravado", es el subtotal antes de tributos)
- ImpOpEx: DEBE ser 0 para tipo C
- ImpIVA: DEBE ser 0 para tipo C (no se informa el array de IVA)
- ImpTrib: suma de tributos, si hay
- MonId: código de moneda (PES para pesos)
- MonCotiz: 1 si MonId=PES

## Antes de escribir el código real, falta

1. Confirmar el número de próximo comprobante - llamando primero a
   FECompUltimoAutorizado (recupera el último autorizado para un tipo
   + punto de venta), NO se puede inventar el número - tiene que ser
   exactamente el último + 1, o ARCA rechaza.

2. Confirmar el punto de venta - CONFIRMADO, ver sección de datos
   reales al final.

3. CondicionIVAReceptorId - la RG 5616/2024 lo hizo obligatorio.
   Hay que consultar FEParamGetCondicionIvaReceptor para los valores
   válidos, y definir con qué condición se factura a un equipo.

4. Definir el tipo de comprobante real - VER CORRECCIÓN, probablemente
   NO es Factura C.

## Plan para la próxima sesión

1. Escribir primero los métodos de consulta (FEDummy,
   FECompUltimoAutorizado, FEParamGetPtosVenta,
   FEParamGetCondicionIvaReceptor) - HECHO PARCIALMENTE, ver abajo.
2. Con esos datos reales, recién ahí armar FECAESolicitar con
   valores reales y correctos, no inventados.
3. Probar con un monto mínimo simbólico antes de cualquier
   comprobante real del club.

## Datos reales confirmados (25/08, consulta a producción)

FEDummy: AppServer/DbServer/AuthServer todos OK — infraestructura de ARCA funcionando.

FEParamGetPtosVenta para CAMPA SRL (CUIT 30715502670): 10 puntos de venta habilitados, numerados 200 a 209, todos tipo "CAE - Ri Iva", ninguno bloqueado.

IMPORTANTE — esto corrige una suposición de las notas anteriores: "Ri Iva" significa que CAMPA SRL está inscripto como Responsable Inscripto en IVA, NO como monotributista ni exento. Esto probablemente significa que corresponde emitir Factura A o B, no Factura C como se había asumido — hay que confirmar esto con Facu o con el contador del club antes de armar FECAESolicitar, porque cambia varios campos obligatorios (con IVA discriminado, no en cero).

Nota técnica de infraestructura: para correr los scripts de Node contra los servidores de ARCA, hace falta el flag --tls-cipher-list='DEFAULT@SECLEVEL=1' (el servidor de ARCA usa una configuración TLS antigua que Node rechaza por defecto). Esto es solo para los scripts de prueba en Node directo — dentro de Next.js/Vercel puede no hacer falta (verificar cuando se despliegue).

Falta todavía: FECompUltimoAutorizado (elegir uno de los 10 puntos de venta y consultar el próximo número), FEParamGetCondicionIvaReceptor, y confirmar con Facu/contador el tipo de comprobante correcto (A o B) antes de armar FECAESolicitar.

## Condiciones de IVA de receptor — CONFIRMADAS (25/08)

Consultado FEParamGetCondicionIvaReceptor contra producción. Las 11 válidas:

- 1 — IVA Responsable Inscripto
- 4 — IVA Sujeto Exento
- 5 — Consumidor Final
- 6 — Responsable Monotributo
- 7 — Sujeto No Categorizado
- 8 — Proveedor del Exterior
- 9 — Cliente del Exterior
- 10 — IVA Liberado – Ley N° 19.640
- 13 — Monotributista Social
- 15 — IVA No Alcanzado
- 16 — Monotributo Trabajador Independiente Promovido

Confirma lo que Horacio dijo ("puede haber ambas"): un equipo puede ser Consumidor Final (5) o tener CUIT propio con cualquier otra condición (1, 6, etc).

## Pieza de modelo que falta, no técnica

El sistema (tabla tercero) NO tiene ningún campo hoy que registre la condición de IVA de un equipo/sponsor. Sin ese dato, no se puede armar CondicionIVAReceptorId al facturar. Hace falta:
1. Agregar una columna a tercero (ej. condicion_iva_id, o el texto directo)
2. Definir de dónde sale ese dato al cargar un equipo nuevo — ¿lo carga el operador a mano al alta? ¿tiene un default (Consumidor Final) hasta que se corrija?

Esto es una decisión de producto (con Facu), no algo que se resuelva solo con más consultas a ARCA — el dato lo tiene que decidir alguien del proyecto, no ARCA.

## Bug propio corregido durante la verificación

condicionesIvaReceptor no encontraba resultados por un problema de mayúsculas: el código buscaba <CondicionIVAReceptor> (IVA todo mayúscula) pero ARCA devuelve <CondicionIvaReceptor> (solo la I mayúscula). Corregido y verificado — las 11 condiciones se listan correctamente ahora.

## Nota operativa

ARCA avisó mantenimiento programado el lunes 31/08 ~22:00hs (~1 hora) — evitar pruebas en esa ventana.

## Alícuota de IVA — CONFIRMADA (25/08)

FEParamGetTiposIva contra producción: Id 5 = 21% (confirmado, coincidía con la suposición inicial pero ahora verificado, no asumido).

Lista completa: Id 3=0%, Id 4=10.5%, Id 5=21%, Id 6=27%, Id 8=5%, Id 9=2.5%.

## Hallazgo de diseño importante: reuso del Ticket de Acceso

El WSAA de ARCA RECHAZA pedir un token nuevo si ya hay uno vigente para el mismo servicio (error coe.alreadyAuthenticated: "El CEE ya posee un TA valido"). Un ticket dura 12hs.

Esto significa que el código real (no solo el script de prueba) NO puede llamar a autenticarArca() en cada función por separado — hay que autenticar UNA VEZ y reusar el mismo TicketAcceso en todas las llamadas de esa sesión/request. Ya corregido en lib/arca-wsfev1-consultas.ts (las funciones ahora reciben el ticket como parámetro, no lo piden ellas mismas).

Cuando se escriba FECAESolicitar, aplicar el mismo patrón: un solo autenticarArca() por Server Action, pasado a cualquier función de wsfev1 que se llame dentro de esa acción.

## TODAS las decisiones y datos técnicos confirmados — listo para escribir FECAESolicitar en la próxima sesión
