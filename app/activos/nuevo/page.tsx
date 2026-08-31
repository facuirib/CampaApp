"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/db/client'
import { formatMoney } from '@/lib/format'
import { Button, Field, Input, Select } from '@/components/ui'

const CATEGORIAS = [
  { valor: 'herramientas', label: 'Herramientas' },
  { valor: 'maquinaria', label: 'Maquinaria' },
  { valor: 'equipamiento_bar', label: 'Equipamiento de bar' },
  { valor: 'infraestructura', label: 'Infraestructura' },
  { valor: 'otro', label: 'Otro' },
]

/** El umbral de `config_contable`. Se muestra como referencia, no se fuerza. */
const UMBRAL = 500000

interface Predio {
  id: string
  codigo: string
}

interface Opcion {
  id: string
  nombre: string
}

/** Hoy en Córdoba, para el default de la fecha de alta. */
function hoyEnCordoba(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default function ActivoNuevoPage() {
  const [predios, setPredios] = useState<Predio[]>([])
  const [categoriasGasto, setCategoriasGasto] = useState<Opcion[]>([])
  const [proveedores, setProveedores] = useState<Opcion[]>([])
  const [cargando, setCargando] = useState(true)

  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('maquinaria')
  const [predioId, setPredioId] = useState('')
  const [fechaAlta, setFechaAlta] = useState(hoyEnCordoba())
  const [valorOrigen, setValorOrigen] = useState(0)
  const [vidaUtil, setVidaUtil] = useState(60)
  const [descripcion, setDescripcion] = useState('')
  const [catGastoId, setCatGastoId] = useState('')
  const [proveedorId, setProveedorId] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  /** El activo recién creado: habilita el paso siguiente. */
  const [creado, setCreado] = useState<{ id: string; nombre: string } | null>(null)

  useEffect(() => {
    let cancelado = false
    const supabase = createClient()
    Promise.all([
      supabase.from('predio').select('id, codigo').order('codigo'),
      // Sólo las de inversión: `comprar_activo` rechaza cualquier otra, porque
      // es la naturaleza lo que manda el asiento a BIENES_USO en vez de al
      // resultado. Ofrecer una categoría de gasto común sería ofrecer un error.
      supabase.from('cat_gasto').select('id, nombre').eq('naturaleza', 'inversion').eq('activo', true).order('nombre'),
      supabase.from('proveedor').select('id, nombre').eq('activo', true).order('nombre'),
    ]).then(([pred, cat, prov]) => {
      if (cancelado) return
      setPredios(pred.data ?? [])
      setCategoriasGasto(cat.data ?? [])
      setProveedores(prov.data ?? [])
      if (cat.data?.length === 1) setCatGastoId(cat.data[0].id)
      setCargando(false)
    })
    return () => {
      cancelado = true
    }
  }, [])

  // Las mismas validaciones que la base: vida_util_meses > 0 es un `check` de la
  // tabla. Se revisan acá para dar un mensaje entendible en vez del error crudo
  // de Postgres, no para reemplazar la garantía —que sigue estando abajo—.
  const errorNombre = nombre.trim() === '' ? 'El activo necesita un nombre.' : null
  const errorCategoriaGasto =
    catGastoId === '' ? 'Elegí la categoría de inversión a la que se imputa la compra.' : null
  const errorValor =
    valorOrigen <= 0 ? 'El valor de origen tiene que ser mayor a cero.' : null
  const errorVida =
    vidaUtil <= 0
      ? 'La vida útil tiene que ser de al menos un mes.'
      : !Number.isInteger(vidaUtil)
        ? 'La vida útil se cuenta en meses enteros.'
        : null

  const hayErrores = Boolean(errorNombre || errorValor || errorVida || errorCategoriaGasto)
  const cuota = vidaUtil > 0 ? valorOrigen / vidaUtil : 0

  async function guardar() {
    if (hayErrores) return

    setGuardando(true)
    setErrorGuardar(null)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setGuardando(false)
      setErrorGuardar('Sesión vencida. Volvé a entrar para dar de alta el activo.')
      return
    }

    // 🔴 `comprar_activo` y no un `insert`: el activo y su capitalización pasan
    // en la misma transacción. Antes esto insertaba la fila sola y la compra se
    // cargaba después, en otra pantalla — y nada obligaba a que se cargara.
    // Un activo sin su compra se amortizaría igual: gasto en el resultado por
    // un bien que nunca entró a los libros.
    const { data, error } = await supabase.rpc('comprar_activo', {
      p_nombre: nombre.trim(),
      p_categoria: categoria,
      p_valor: valorOrigen,
      p_vida_util_meses: vidaUtil,
      p_cat_gasto_id: catGastoId,
      p_fecha: fechaAlta,
      p_predio_id: predioId || undefined,
      p_proveedor_id: proveedorId || undefined,
      p_descripcion: descripcion.trim() || undefined,
      p_created_by: user.id,
    })

    setGuardando(false)

    if (error) {
      setErrorGuardar(error.message)
      return
    }

    setCreado({ id: data as string, nombre: nombre.trim() })
  }

  return (
    <div className="pb-10">
      <Link href="/activos" className="text-[11px] font-semibold text-blue-d hover:underline">
        ← Volver a activos
      </Link>

      <header className="mb-6 mt-2">
        <h1 className="text-xl font-extrabold tracking-[-.4px] text-ink">Dar de alta un activo</h1>
        <p className="mt-1 max-w-[70ch] text-[12px] text-muted">
          Un bien que dura y se amortiza mes a mes en vez de impactar entero en el mes que se
          compra. Por debajo de {formatMoney(UMBRAL)} suele convenir cargarlo como gasto común.
        </p>
      </header>

      {/* ── El paso siguiente ──────────────────────────────────────────────
          El alta NO genera asiento, y eso no es una omisión: `gasto` apunta al
          activo y no al revés, así que el bien tiene que existir ANTES de que
          se pueda cargar su compra. Mientras el gasto no entre, el activo no
          figura en BIENES_USO.

          Por eso el éxito no es "listo": es "falta esto otro", con el enlace.
          El formulario de gastos es de Horacio y no se toca — se enlaza. */}
      {creado ? (
        <div className="rounded-md border border-line bg-white px-5 py-6">
          <p className="text-[13px] font-bold text-ink">
            {creado.nombre} quedó dado de alta
          </p>
          <p className="mt-2 max-w-[62ch] text-[12px] text-muted">
            Falta un paso: el bien está registrado pero su{' '}
            <strong className="font-semibold">compra todavía no se cargó</strong>, así que no figura
            en Bienes de uso y no se puede amortizar. La compra se carga como gasto, con una
            categoría de naturaleza inversión y eligiendo este activo.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/gastos/nuevo">
              <Button>Registrar la compra</Button>
            </Link>
            <Link href={`/activos/${creado.id}`}>
              <Button variant="secondary">Ver el activo</Button>
            </Link>
            <Button
              variant="secondary"
              onClick={() => {
                setCreado(null)
                setNombre('')
                setValorOrigen(0)
              }}
            >
              Dar de alta otro
            </Button>
          </div>
        </div>
      ) : (
        <div className="max-w-[640px] rounded-md border border-line bg-white px-5 py-5">
          {errorGuardar && (
            <p className="mb-4 rounded-md bg-errbg px-4 py-3 text-[11px] text-errtx">
              {errorGuardar}
            </p>
          )}

          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            <Field label="Nombre" required error={nombre !== '' ? errorNombre : null}>
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Desmalezadora, arcos, heladera…"
              />
            </Field>

            <Field label="Categoría" required>
              <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {CATEGORIAS.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Predio"
              hint="Dónde está el bien. Opcional: no todo tiene una sede."
            >
              <Select
                value={predioId}
                onChange={(e) => setPredioId(e.target.value)}
                disabled={cargando}
              >
                <option value="">Sin predio</option>
                {predios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Fecha de alta" required hint="Desde cuándo se empieza a amortizar.">
              <Input
                type="date"
                value={fechaAlta}
                onChange={(e) => setFechaAlta(e.target.value)}
              />
            </Field>

            <Field label="Valor de origen" required error={valorOrigen !== 0 ? errorValor : null}>
              <Input
                type="number"
                min={0}
                step={1000}
                value={valorOrigen || ''}
                onChange={(e) => setValorOrigen(Number(e.target.value))}
              />
            </Field>

            <Field
              label="Vida útil (meses)"
              required
              error={errorVida}
              hint="En cuántos meses se consume. 60 meses son 5 años."
            >
              <Input
                type="number"
                min={1}
                step={1}
                value={vidaUtil || ''}
                onChange={(e) => setVidaUtil(Number(e.target.value))}
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {/* La categoría de gasto es lo que decide que el asiento vaya a
                BIENES_USO. Se elige acá y no se adivina: si mañana hay más de
                una categoría de inversión —equipamiento de bar, infraestructura—
                cada una puede tener su propia cuenta. */}
            <Field
              label="Categoría de la compra"
              required
              error={catGastoId !== '' ? null : null}
              hint="A qué categoría de inversión se imputa. Define la cuenta del asiento."
            >
              <Select value={catGastoId} onChange={(e) => setCatGastoId(e.target.value)}>
                <option value="">Elegí una…</option>
                {categoriasGasto.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Proveedor" hint="A quién se le compró. Opcional.">
              <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                <option value="">Sin proveedor</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-4">
            <Field
              label="Descripción"
              hint="Qué es, dónde está, número de serie — lo que haga falta para reconocerlo."
            >
              <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </Field>
          </div>

          {/* La cuota se muestra al cargar, no después: es el número que va a
              impactar el P&L todos los meses, y verlo antes de guardar es lo
              que hace que una vida útil mal puesta se note. */}
          {valorOrigen > 0 && vidaUtil > 0 && (
            <p className="mt-4 rounded-md bg-panel px-4 py-3 text-[11px] text-muted">
              Se va a amortizar en <strong className="font-semibold text-ink">{vidaUtil} cuotas</strong>{' '}
              de <strong className="font-semibold text-ink">{formatMoney(cuota)}</strong> por mes.
              {valorOrigen < UMBRAL && (
                <>
                  {' '}
                  Está por debajo del umbral de {formatMoney(UMBRAL)}: si no es un bien que dure,
                  conviene cargarlo como gasto común.
                </>
              )}
            </p>
          )}

          <div className="mt-5 flex items-center gap-3">
            <Button onClick={guardar} disabled={hayErrores || guardando}>
              {guardando ? 'Guardando…' : 'Dar de alta'}
            </Button>
            <span className="text-[11px] text-muted">
              Se registra la compra completa: el activo, su gasto de inversión y el asiento
              contra Bienes de uso. <strong>No impacta en el resultado</strong> — al P&amp;L va la
              amortización, mes a mes.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
