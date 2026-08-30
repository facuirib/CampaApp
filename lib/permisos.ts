import type { Rol } from './roles'

/**
 * Quién puede hacer qué. **Una sola fuente para las tres capas del front**:
 * el sidebar, las reglas de ruta del middleware y los botones de cada pantalla.
 *
 * ── Por qué existe este archivo ────────────────────────────────────────────
 *
 * La base ya decide: 79 policies y dos guardas adentro de funciones. Pero RLS
 * **no contesta «¿puedo?»** — contesta denegando, y para UPDATE y DELETE lo
 * hace en silencio, con 0 filas y sin excepción. O sea que el front no puede
 * preguntar antes de dibujar, ni deducir el permiso del resultado de intentar.
 *
 * Por eso el permiso se decide ANTES de renderizar, con el rol, y por eso hace
 * falta escribirlo de este lado. Lo que no puede pasar es que esta copia se
 * desincronice de la base: un botón escondido que la base permite le saca una
 * función a alguien; uno visible que la base deniega es un botón que falla.
 *
 * ── Cómo se mantiene honesto ───────────────────────────────────────────────
 *
 * Cada operación declara **dónde vive la misma regla en la base**, y eso lo
 * chequea `scripts/verificar-permisos.ts`, que deriva la matriz real desde
 * `pg_policies` siguiendo el grafo de llamadas de cada función —porque
 * `registrar_cobro` termina escribiendo `periodo` a través de `crear_asiento`,
 * y ese `periodo` es parte de su permiso—. Si algo acá no coincide con la
 * base, el script lo dice y falla.
 *
 * Las tres formas de `donde`:
 *
 *   `fns`     · lo protege una policy, sobre las tablas que esas funciones
 *               escriben. Es el caso normal.
 *   `tabla`   · el front escribe directo (sin función), y la policy de esa
 *               tabla es toda la regla.
 *   `guarda`  · NO hay policy que lo exprese: la función se comparte con
 *               operaciones que otros roles sí pueden, así que la restricción
 *               vive adentro del plpgsql. El verificador la busca en `prosrc`.
 *   `accion`  · no hay nada del lado de la base: corre con `service_role` o
 *               tiene un efecto externo. Acá el chequeo del front ES la
 *               seguridad, y vive en la propia Server Action.
 */

type Donde =
  | { fns: readonly string[] }
  | { tabla: string; cmd: 'INSERT' | 'UPDATE' | 'DELETE' }
  /**
   * Como `tabla`, pero la policy además discrimina **por columna**: el rol de
   * más amplio alcance puede todas las filas y otro sólo algunas. `soloSi` es
   * el pedazo de la condición que hace esa distinción, y el verificador
   * comprueba que siga estando en la policy — si alguien lo saca, la
   * restricción desaparece sin que cambie ningún rol y nadie se entera.
   */
  | { tabla: string; cmd: 'INSERT' | 'UPDATE' | 'DELETE'; soloSi: string }
  | { guarda: string }
  | { accion: string }

export interface Operacion {
  /** Qué es, en una línea, para el que lee el archivo sin abrir la pantalla. */
  que: string
  roles: readonly Rol[]
  donde: Donde
}

/**
 * El día a día: cobros, gastos, cheques, clientes, activos, presupuesto.
 *
 * `finanzas` entra en todo esto porque es **admin menos tres cosas**: el bar,
 * la estructura del torneo y la administración de usuarios.
 */
const CON_FINANZAS = ['admin', 'operador', 'finanzas'] as const

/**
 * Las sensibles y la facturación: admin y finanzas, no el operador.
 *
 * Rechazar un cheque reabre la deuda de un equipo, anular un asiento reescribe
 * el diario, comprar dólares mueve el promedio ponderado y emitir una factura
 * consume numeración fiscal. Son decisiones de quien responde por la plata.
 */
const SENSIBLE = ['admin', 'finanzas'] as const

/** El circuito del bar. Finanzas NO carga el bar. */
const CON_EL_BAR = ['admin', 'operador', 'bar'] as const

/** El arqueo es caja física del torneo: el bar lo hace, y finanzas también. */
const ARQUEO = ['admin', 'operador', 'bar', 'finanzas'] as const

/** La estructura del torneo: sin finanzas. */
const TODOS_MENOS_LECTURA = ['admin', 'operador'] as const

/** Repartir permisos no se delega. */
const SOLO_ADMIN = ['admin'] as const

export const PERMISOS = {
  // ── Torneo ───────────────────────────────────────────────────────────────
  'torneo.crear': {
    que: 'Crear un torneo nuevo',
    roles: TODOS_MENOS_LECTURA,
    donde: { fns: ['crear_torneo'] },
  },
  'torneo.estructura': {
    que: 'Clonar, crear, editar o borrar categorías y series',
    roles: TODOS_MENOS_LECTURA,
    donde: {
      fns: [
        'clonar_estructura_torneo',
        'crear_categoria',
        'editar_categoria',
        'borrar_categoria',
        'crear_serie',
        'editar_serie',
        'borrar_serie',
      ],
    },
  },
  'torneo.fichas': {
    que: 'Arrastrar fichas del torneo anterior y moverlas de serie',
    roles: TODOS_MENOS_LECTURA,
    donde: { fns: ['arrastrar_fichas', 'mover_ficha_de_serie'] },
  },
  'ficha.alta': {
    que: 'Dar de alta una ficha, que genera sus cuotas',
    roles: TODOS_MENOS_LECTURA,
    donde: { fns: ['crear_equipo_torneo'] },
  },
  'tarifario.editar': {
    que: 'Editar el tarifario: el plan y sus líneas',
    roles: TODOS_MENOS_LECTURA,
    donde: {
      fns: ['editar_plan_tarifa', 'crear_linea_tarifa', 'editar_linea_tarifa', 'borrar_linea_tarifa'],
    },
  },
  'calendario.editar': {
    que: 'Crear, mover o suspender una jornada',
    roles: TODOS_MENOS_LECTURA,
    donde: { fns: ['crear_jornada', 'mover_jornada', 'suspender_jornada'] },
  },

  // ── Cobranza ─────────────────────────────────────────────────────────────
  'cobro.registrar': {
    que: 'Registrar un cobro e imputarlo a cuotas',
    roles: CON_FINANZAS,
    donde: { fns: ['registrar_cobro', 'imputar_pago'] },
  },
  'cliente.editar': {
    // Los datos fiscales de un cliente: lo que después se congela en el
    // comprobante. Mismos roles que el resto de `tercero` —el que carga un CUIT
    // es el mismo que carga un cobro— y la policy de la tabla los gobierna sin
    // función de por medio: la validación ya vive en la base, como constraint.
    que: 'Editar los datos fiscales y de contacto de un cliente',
    roles: CON_FINANZAS,
    donde: { tabla: 'tercero', cmd: 'UPDATE' },
  },
  'reclamo.registrar': {
    que: 'Dejar registrado un reclamo hecho por WhatsApp o a mano',
    roles: CON_FINANZAS,
    donde: { tabla: 'reclamo', cmd: 'INSERT' },
  },
  'reclamo.mail': {
    // Mandar el mail NO pasa por RLS, y encima sale antes de registrar: cuando
    // la policy frena el INSERT, el mail ya está en la casilla del equipo.
    que: 'Mandar el reclamo por mail (Resend, sin policy detrás)',
    roles: CON_FINANZAS,
    donde: { accion: 'enviarReclamoMail' },
  },

  // ── Gastos ───────────────────────────────────────────────────────────────
  'gasto.registrar': {
    que: 'Cargar un gasto (devengo)',
    roles: CON_FINANZAS,
    donde: { fns: ['registrar_gasto'] },
  },
  'gasto.pagar': {
    que: 'Pagar un gasto cargado',
    roles: CON_FINANZAS,
    donde: { fns: ['pagar_gasto'] },
  },
  'gasto.adjuntar': {
    // Adjuntar el comprobante del proveedor. Es la única operación de `gasto`
    // que escribe DIRECTO en la tabla —las otras tres van por función de
    // Postgres— porque no hay invariante que proteger: se guarda un path.
    //
    // Mismos roles que cargar el gasto: adjuntar la factura del proveedor es
    // parte del mismo acto, y separarlos habilitaría adjuntarle un documento a
    // un gasto que uno no puede crear.
    que: 'Adjuntar el comprobante del proveedor a un gasto',
    roles: CON_FINANZAS,
    donde: { tabla: 'gasto', cmd: 'UPDATE' },
  },
  'gasto.anular': {
    // El bar NO puede, aunque anular sea «un circuito»: la función toca `gasto`
    // y esa tabla no lo tiene en su policy.
    que: 'Anular un gasto (contraasienta devengo y pago)',
    roles: CON_FINANZAS,
    donde: { fns: ['anular_gasto'] },
  },

  // ── Cheques ──────────────────────────────────────────────────────────────
  'cheque.mover': {
    que: 'Acreditar o debitar un cheque: el curso normal',
    roles: CON_FINANZAS,
    donde: { fns: ['cambiar_estado_cheque'] },
  },
  'cheque.rechazar': {
    // Solo admin, y no se puede expresar en una policy: es la MISMA función y
    // la MISMA tabla que acreditar. Rechazar revierte el cobro y reabre la
    // deuda del equipo — deshace plata que alguien ya dio por cobrada.
    que: 'Rechazar un cheque: revierte el cobro y reabre la deuda',
    roles: SENSIBLE,
    donde: { guarda: 'cambiar_estado_cheque' },
  },

  // ── Diario ───────────────────────────────────────────────────────────────
  'asiento.anular': {
    // Anular por circuito (gasto, bar, arqueo, cheque) lo hace cada función con
    // `p_via_circuito`. Esto es la llamada SUELTA, que no tiene pantalla y es
    // de admin. Tampoco se puede separar por policy: asiento.UPDATE es el único
    // punto de control de los cinco circuitos a la vez.
    que: 'Anular un asiento suelto, fuera de todo circuito',
    roles: SENSIBLE,
    donde: { guarda: 'anular_asiento' },
  },

  // ── Caja física y bar ────────────────────────────────────────────────────
  'arqueo.registrar': {
    que: 'Registrar un arqueo (contar la caja de un día)',
    roles: ARQUEO,
    donde: { fns: ['crear_arqueo'] },
  },
  'arqueo.diferencia': {
    que: 'Asentar la diferencia de un arqueo',
    roles: ARQUEO,
    donde: { fns: ['asentar_diferencia_arqueo'] },
  },
  'arqueo.entregar': {
    que: 'Entregar a central el efectivo de un arqueo del torneo',
    roles: ARQUEO,
    donde: { fns: ['registrar_entrega_central'] },
  },
  'arqueo.anular': {
    que: 'Anular un arqueo y sus asientos',
    roles: ARQUEO,
    donde: { fns: ['anular_arqueo'] },
  },
  'bar.cierre': {
    que: 'Cerrar la caja del bar de un día',
    roles: CON_EL_BAR,
    donde: { fns: ['crear_dia_cancha', 'registrar_venta_bar'] },
  },
  'bar.cierre.anular': {
    que: 'Anular un cierre de bar',
    roles: CON_EL_BAR,
    donde: { fns: ['anular_venta_bar'] },
  },
  'bar.retiro': {
    que: 'Retirar efectivo del bar',
    roles: CON_EL_BAR,
    donde: { fns: ['retirar_efectivo_bar'] },
  },
  'bar.retiro.anular': {
    que: 'Anular un retiro del bar',
    roles: CON_EL_BAR,
    donde: { fns: ['anular_retiro_bar'] },
  },

  // ── Activos y finanzas ───────────────────────────────────────────────────
  'activo.alta': {
    // La escribe el front directo, sin función: la policy de `activo` es toda
    // la regla. (Y estuvo rota en producción desde la Fase 2 justamente por
    // eso: ninguna función la escribe, así que el relevamiento no la vio.)
    que: 'Dar de alta un activo',
    roles: CON_FINANZAS,
    donde: { tabla: 'activo', cmd: 'INSERT' },
  },
  'activo.amortizar': {
    que: 'Asentar la amortización del período',
    roles: CON_FINANZAS,
    donde: { fns: ['asentar_amortizacion'] },
  },
  'presupuesto.editar': {
    que: 'Crear, aprobar y editar el presupuesto y sus líneas',
    roles: CON_FINANZAS,
    donde: {
      fns: [
        'crear_presupuesto',
        'aprobar_presupuesto',
        'agregar_linea_presupuesto',
        'editar_linea_presupuesto',
        'borrar_linea_presupuesto',
      ],
    },
  },
  'sponsor.cobrar': {
    // Cobrar es del día a día, así que va con `operador` — la misma lista que
    // `cobro.registrar`. Nada que ver con anular o retirar, que son SENSIBLE.
    //
    // Medido rol por rol contra la función: admin, finanzas y operador cobran;
    // `bar` lo frena la policy de `comprobante` (el recibo) y `lectura` la de
    // `asiento`. O sea que la lista de acá es la que la base ya aplicaba.
    que: 'Cobrar una cuota de patrocinio',
    roles: CON_FINANZAS,
    donde: { fns: ['registrar_cobro_sponsor'] },
  },
  'periodo.cerrar': {
    // El bar abre períodos sin querer —`crear_asiento` los crea— pero no los
    // cierra: `periodo` tiene roles distintos por comando, INSERT con bar y
    // UPDATE sin él.
    que: 'Cerrar un período contable',
    roles: CON_FINANZAS,
    donde: { fns: ['cerrar_periodo'] },
  },
  'fondo.movimiento': {
    que: 'Registrar un movimiento del fondo',
    roles: CON_FINANZAS,
    donde: { fns: ['registrar_movimiento_fondo'] },
  },
  // ── Societario ───────────────────────────────────────────────────────────
  //
  // Los tres van a SENSIBLE —admin y finanzas— porque son la plata de los
  // dueños. Antes de esto, `operador` podía cambiarles el sueldo y `bar` podía
  // retirarles plata: el sidebar escondía Societario, pero la base no.
  'socio.sueldo': {
    que: 'Fijar el sueldo acordado de un socio',
    roles: SENSIBLE,
    donde: { tabla: 'sueldo_socio', cmd: 'INSERT' },
  },
  'socio.ajuste_mes': {
    // La excepción de UN mes, que le gana a la vigencia. Va a SENSIBLE por lo
    // mismo que `socio.sueldo`: decide cuánto cobra un dueño. Que sea por un
    // mes y no permanente no la hace más chica — es la misma plata.
    que: 'Ajustar el sueldo de un socio en un mes puntual',
    roles: SENSIBLE,
    donde: { tabla: 'sueldo_socio_mes', cmd: 'INSERT' },
  },
  'socio.devengar': {
    // Proceso mensual idempotente: correrlo dos veces no duplica.
    que: 'Devengar los sueldos del mes a los socios',
    roles: SENSIBLE,
    donde: { fns: ['devengar_sueldos_socios'] },
  },
  'pago.anular': {
    // Mueve los libros: contraasiento del cobro y la deuda que se reabre. Va a
    // SENSIBLE por lo mismo que `anular_asiento` y `crear_retiro_socio` — y por
    // una razón propia: anular un cobro le vuelve a facturar la deuda a un
    // equipo que ya pagó. Es la clase de error que se descubre por el reclamo.
    //
    // La protege una guarda dentro de la función, no una policy: las tablas que
    // toca —`asiento`, `pago_imputacion`— las escribe medio sistema, así que
    // por RLS entrarían bar y operador. Medido: admin y finanzas pueden;
    // operador, bar y lectura los frena la guarda con su mensaje.
    que: 'Anular un pago con contraasiento y reabrir la deuda',
    roles: SENSIBLE,
    donde: { guarda: 'anular_pago' },
  },
  'sponsor.anular': {
    // El hermano de `pago.anular`, del lado sponsor: contraasiento y la cuota
    // vuelve a estar impaga. Misma allowlist y por la misma razón — anular un
    // cobro le vuelve a facturar la deuda a alguien que ya pagó.
    //
    // También la protege una guarda dentro de la función y no una policy: toca
    // `asiento` y `cuota_cobro_sponsor`, que por RLS alcanzan a operador.
    // Medido: admin y finanzas anulan; operador, bar y lectura frenados.
    que: 'Anular un cobro de patrocinio con contraasiento',
    roles: SENSIBLE,
    donde: { guarda: 'anular_cobro_sponsor' },
  },
  'socio.retirar': {
    // Por guarda y no por policy: la función no escribe ninguna tabla del
    // circuito societario —arma el movimiento con crear_asiento— así que
    // restringir sueldo_socio y devengo_socio no la alcanza.
    que: 'Retirar plata a cuenta del sueldo de un socio',
    roles: SENSIBLE,
    donde: { guarda: 'crear_retiro_socio' },
  },

  'usd.operar': {
    // La única sensible que SÍ se separa por policy limpia: sus dos escritores
    // son la misma operación, no hay una tercera función que escriba la tabla.
    que: 'Comprar o vender dólares',
    roles: SENSIBLE,
    donde: { fns: ['comprar_usd', 'vender_usd'] },
  },

  // ── Comprobantes ─────────────────────────────────────────────────────────
  'comprobante.emitir': {
    // Solo admin: emitir ante ARCA crea un documento legal y consume un número
    // de la numeración fiscal, que no se recupera. La policy deja escribir
    // `comprobante` a admin y operador, y lo que separa a uno del otro es la
    // condición por columna: el operador sólo puede filas con
    // `tipo_comprobante = 0`, que son las que NO van a ARCA.
    que: 'Emitir una factura ante ARCA (documento fiscal con CAE)',
    roles: SENSIBLE,
    donde: { tabla: 'comprobante', cmd: 'INSERT', soloSi: 'tipo_comprobante = 0' },
  },
  'comprobante.reservar': {
    // Primera de las dos puertas de emisión: saca el número y deja la fila en
    // «pendiente» ANTES de que se llame a ARCA. La policy de la tabla no
    // alcanza para declararlo —nombra también a operador, por el recibo—, así
    // que el permiso vive en una guarda adentro de la función.
    que: 'Reservar el número de una factura y dejarla pendiente',
    roles: SENSIBLE,
    donde: { guarda: 'reservar_numero_comprobante' },
  },
  'comprobante.cerrar': {
    // Segunda puerta: llegó el CAE. Mismo alcance que reservar, porque es el
    // segundo tiempo del mismo acto.
    //
    // La guarda acá no es simetría, es lo único que hace ruido: RLS deniega el
    // UPDATE en silencio, y un «cerré» que no cerró dejaría la fila en
    // pendiente con el CAE ya otorgado por ARCA.
    que: 'Cerrar una factura pendiente con el CAE de ARCA',
    roles: SENSIBLE,
    donde: { guarda: 'cerrar_comprobante' },
  },
  'comprobante.error': {
    // ARCA rechazó. Deja la fila como registro del intento y libera el número
    // para el reintento.
    que: 'Marcar como fallida una factura pendiente',
    roles: SENSIBLE,
    donde: { guarda: 'marcar_error_comprobante' },
  },
  'recibo.generar': {
    // El comprobante que se le da al equipo al cobrar. No es fiscal, no tiene
    // CAE y no consume numeración de ARCA, así que lo genera quien cobra.
    que: 'Generar un recibo interno (no fiscal, sin CAE)',
    roles: CON_FINANZAS,
    donde: { tabla: 'comprobante', cmd: 'INSERT' },
  },

  // ── Sistema ──────────────────────────────────────────────────────────────
  'comprobante.enviar': {
    // Mandar el comprobante por mail, con el PDF adjunto.
    //
    // Va con `operador` —es operación diaria, como cobrar— pero NO con
    // `lectura`, que sí puede bajar el PDF: mirar un comprobante y escribirle a
    // un tercero desde la casilla del club son cosas distintas.
    //
    // Es la única operación del catálogo cuya guarda no tiene NADA detrás:
    // Resend no pasa por RLS, así que el `exigirRol` de la acción no refuerza a
    // una policy, ES la autorización. Si se saca, no queda nada.
    que: 'Enviar un recibo o factura por mail',
    roles: CON_FINANZAS,
    donde: { accion: 'enviarComprobanteMail' },
  },
  'plantilla.editar': {
    que: 'Editar la plantilla de reclamos',
    roles: CON_FINANZAS,
    donde: { tabla: 'plantilla_mail', cmd: 'UPDATE' },
  },
  'emisor.editar': {
    // Los datos fiscales del club: razón social, CUIT, ingresos brutos. Solo
    // admin — `finanzas` factura, pero no cambia quién factura.
    que: 'Editar los datos fiscales del emisor',
    roles: SOLO_ADMIN,
    donde: { tabla: 'emisor', cmd: 'UPDATE' },
  },
  'punto_venta.crear': {
    // Un punto de venta nuevo se habilita primero en ARCA y después se carga
    // acá. Es configuración fiscal, no operación.
    que: 'Agregar un punto de venta',
    roles: SOLO_ADMIN,
    donde: { tabla: 'punto_venta', cmd: 'INSERT' },
  },
  'punto_venta.editar': {
    // Incluye desactivarlo, que es como se da de baja: borrarlo dejaría a los
    // comprobantes que emitió apuntando al vacío.
    que: 'Editar o desactivar un punto de venta',
    roles: SOLO_ADMIN,
    donde: { tabla: 'punto_venta', cmd: 'UPDATE' },
  },

  'usuario.gestionar': {
    // `service_role` no pasa por ninguna policy: el `if` de la Server Action no
    // es una comodidad de UI, es la única defensa que hay.
    que: 'Invitar usuarios y cambiar roles',
    roles: SOLO_ADMIN,
    donde: { accion: 'cambiarRol · invitar' },
  },
} as const satisfies Record<string, Operacion>

export type Op = keyof typeof PERMISOS

/**
 * Si un rol puede una operación.
 *
 * `null` —sin sesión o sin rol— no puede nada: allowlist positiva, igual que
 * las policies. Un rol que no está en la lista queda afuera, así que un typo
 * esconde el botón en vez de mostrarlo de más.
 */
export function puede(rol: Rol | null, op: Op): boolean {
  if (!rol) return false
  return (PERMISOS[op].roles as readonly Rol[]).includes(rol)
}

/**
 * Las rutas que son de escritura y nada más, con la operación que las gobierna.
 *
 * Sólo van acá las rutas **cuyo único propósito es escribir**. Las pantallas
 * mixtas —`/cheques/[id]`, `/presupuesto`, `/catalogos/tarifario`— también son
 * la pantalla de lectura de eso, así que se resuelven escondiendo el botón, no
 * cerrando la puerta.
 *
 * El orden importa: gana el prefijo más largo, para que `/torneos/x/fichas`
 * no lo agarre una regla de `/torneos`.
 */
export const RUTAS_PROTEGIDAS: ReadonlyArray<{ patron: RegExp; op: Op; padre: string }> = [
  { patron: /^\/configuracion\/usuarios/, op: 'usuario.gestionar', padre: '/configuracion' },
  { patron: /^\/torneos\/nuevo/, op: 'torneo.crear', padre: '/torneos' },
  { patron: /^\/torneos\/[^/]+\/estructura/, op: 'torneo.estructura', padre: '/torneos' },
  { patron: /^\/torneos\/[^/]+\/fichas/, op: 'torneo.fichas', padre: '/torneos' },
  { patron: /^\/gastos\/nuevo/, op: 'gasto.registrar', padre: '/gastos' },
  { patron: /^\/gastos\/[^/]+\/pagar/, op: 'gasto.pagar', padre: '/gastos' },
  { patron: /^\/gastos\/[^/]+\/comprobante/, op: 'gasto.adjuntar', padre: '/gastos' },
  { patron: /^\/cobranza\/[^/]+\/cobrar/, op: 'cobro.registrar', padre: '/cobranza' },
  { patron: /^\/sponsors\/[^/]+\/cobrar/, op: 'sponsor.cobrar', padre: '/sponsors' },
  { patron: /^\/activos\/nuevo/, op: 'activo.alta', padre: '/activos' },
  { patron: /^\/activos\/amortizar/, op: 'activo.amortizar', padre: '/activos' },
  { patron: /^\/calendario\/nueva/, op: 'calendario.editar', padre: '/calendario' },
  { patron: /^\/calendario\/[^/]+\/(mover|suspender)/, op: 'calendario.editar', padre: '/calendario' },
  { patron: /^\/arqueo\/nuevo/, op: 'arqueo.registrar', padre: '/arqueo' },
  { patron: /^\/arqueo\/[^/]+\/entregar/, op: 'arqueo.entregar', padre: '/arqueo' },
  { patron: /^\/bar\/nuevo/, op: 'bar.cierre', padre: '/bar' },
  { patron: /^\/bar\/retiro/, op: 'bar.retiro', padre: '/bar' },
]

/** La regla que aplica a una ruta, o `null` si es de lectura. */
export function reglaDeRuta(pathname: string) {
  return RUTAS_PROTEGIDAS.find((r) => r.patron.test(pathname)) ?? null
}
