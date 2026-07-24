import { createClient } from '@/lib/db/server'

export default async function Home() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cat_gasto')
    .select('nombre, naturaleza, area')
    .order('nombre')
    .limit(10)

  return (
    <main className="p-8 font-sans">
      <h1 className="text-2xl font-bold mb-1">Campa</h1>
      <p className="text-sm text-gray-500 mb-6">Conexión a Supabase</p>
      {error && (
        <pre className="text-red-600 text-sm bg-red-50 p-3 rounded mb-4">{error.message}</pre>
      )}
      <ul className="space-y-1">
        {data?.map((c) => (
          <li key={c.nombre} className="text-sm">
            <strong>{c.nombre}</strong>
            <span className="text-gray-500"> · {c.naturaleza} · {c.area}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}