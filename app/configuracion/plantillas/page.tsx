import { puede } from '@/lib/permisos'
import { rolActual } from '@/lib/rol-actual'
import EditorPlantillas from './EditorPlantillas'
import EditorComprobantes from './EditorComprobantes'

/**
 * Server Component delgado: lee el rol y pasa el permiso resuelto.
 *
 * El editor era la página entera y es Client —tiene diez `useState`—, así que
 * no podía preguntar por el rol: `rolActual()` lee la sesión del servidor. Esta
 * página existe sólo para eso.
 *
 * La alternativa era meter la ruta en `RUTAS_PROTEGIDAS` y cortarla entera.
 * Habría sido una línea en vez de un archivo, y habría estado mal: la pantalla
 * es mixta, y ver qué texto se le manda a los equipos es lectura que
 * `read-only` conserva.
 */
export default async function PlantillasPage() {
  const puedeEditar = puede(await rolActual(), 'plantilla.editar')

  return (
    <>
      <EditorPlantillas puedeEditar={puedeEditar} />
      {/* Aparte y no adentro del editor de reclamos: son otro mensaje, con otros
          placeholders y sin canal de WhatsApp. Meterlos en el mismo formulario
          obligaría a que cada campo pregunte de qué plantilla está hablando. */}
      <EditorComprobantes puedeEditar={puedeEditar} />
    </>
  )
}
