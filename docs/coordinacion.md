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

**Lo que la frena es la seguridad.** Con RLS apagado en las 47 tablas y la anon
key en el bundle del navegador, un bucket mal configurado deja las facturas del
club —CUIT, razón social, montos— accesibles a cualquiera con la URL. **Va
después de RLS**, o con bucket privado y URLs firmadas desde el servidor.
