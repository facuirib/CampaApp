'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'

/**
 * Guardar los datos fiscales y de contacto de un cliente.
 *
 * ── Por qué no hay función de Postgres ─────────────────────────────────────
 *
 * Porque no protegería nada que no esté ya protegido. `tercero` tiene su
 * policy de UPDATE con las dos mitades —`using` y `with_check`, admin y
 * operador— así que RLS gobierna esta escritura de punta a punta, y la
 * validación del dato vive en la base como constraint: el dígito verificador
 * del CUIT (`tercero_cuit_valido`) y la condición de IVA contra su catálogo
 * (`tercero_condicion_iva_fk`).
 *
 * Una función plpgsql en el medio sería una capa más sin un invariante propio
 * que cuidar. CLAUDE.md ya lo dice: Server Action cuando se escribe directo a
 * una tabla.
 *
 * ── 🔴 La allowlist de columnas: esto SÍ es una defensa ────────────────────
 *
 * **RLS es por FILA, no por columna.** La policy dice «admin y operador pueden
 * tocar esta fila» — no dice *qué* pueden cambiar de ella. Si esta acción
 * recibiera un objeto y lo derramara en el `.update()`, un operador podría
 * mandar `tipo: 'socio'` y sacar al equipo de la lista de clientes, o
 * `activo: false` y hacerlo desaparecer de la cobranza. RLS lo dejaría pasar,
 * porque la fila sí la puede tocar.
 *
 * Por eso el objeto se arma **campo por campo** con los siete permitidos, y lo
 * que venga de más se ignora por construcción: no hay spread, no hay
 * `Object.assign`, no hay forma de que una clave nueva entre sin que alguien la
 * escriba acá.
 *
 * `nombre` no está en la lista a propósito: es la clave con la que se sembró el
 * padrón y con la que se lo reconoce en cobranza y en el diario. Cambiarlo es
 * otra operación, con otra conversación.
 */

interface Resultado {
  ok: boolean
  error?: string
}

export interface DatosFiscales {
  razon_social: string | null
  doc_tipo_default: number | null
  doc_nro_default: string | null
  condicion_iva_receptor_default: number | null
  domicilio_fiscal: string | null
  email: string | null
  telefono: string | null
  delegado: string | null
}

/** Vacío es NULL, no cadena vacía: un dato que no está no es un dato en blanco. */
function limpiar(v: string | null): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

export async function guardarDatosFiscales(
  terceroId: string,
  datos: DatosFiscales,
): Promise<Resultado> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión vencida. Volvé a entrar.' }

  // ── Las SIETE columnas editables, uno por uno ────────────────────────────
  const campos = {
    razon_social: limpiar(datos.razon_social),
    doc_tipo_default: datos.doc_tipo_default,
    doc_nro_default: limpiar(datos.doc_nro_default),
    condicion_iva_receptor_default: datos.condicion_iva_receptor_default,
    domicilio_fiscal: limpiar(datos.domicilio_fiscal),
    email: limpiar(datos.email),
    telefono: limpiar(datos.telefono),
    delegado: limpiar(datos.delegado),
  }

  const { data, error } = await supabase
    .from('tercero')
    .update(campos)
    .eq('id', terceroId)
    .select('id')

  if (error) {
    // Los constraints de la base hablan en su idioma; acá se traduce a lo que
    // hay que hacer. El chequeo del CUIT ya corrió en la pantalla —contra la
    // MISMA función— así que llegar hasta acá con uno inválido significa que
    // alguien se saltó el formulario.
    if (error.message.includes('tercero_cuit_valido')) {
      return { ok: false, error: 'El CUIT no es válido: revisá el dígito verificador.' }
    }
    if (error.message.includes('tercero_condicion_iva_fk')) {
      return { ok: false, error: 'Esa condición de IVA no existe en el catálogo de ARCA.' }
    }
    return { ok: false, error: error.message }
  }

  // ── El UPDATE denegado por RLS no falla: afecta 0 filas ──────────────────
  //
  // Si el rol no puede escribir `tercero`, Postgres no levanta ninguna
  // excepción: devuelve 0 filas y sigue. Sin este chequeo la pantalla diría
  // «guardado» sobre algo que no se guardó — el modo de falla silencioso que
  // el proyecto ya se comió una vez.
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: 'No se guardó: tu rol no puede editar clientes, o el cliente ya no existe.',
    }
  }

  revalidatePath('/clientes')
  revalidatePath(`/clientes/${terceroId}`)
  return { ok: true }
}
