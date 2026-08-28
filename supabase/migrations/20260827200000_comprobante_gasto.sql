-- ═══════════════════════════════════════════════════════════════
-- Adjuntar comprobante a un gasto — bucket + columna + RLS de Storage
-- APLICADA el 27/08/2026.
--
-- El encabezado decía «PROPUESTA, NO APLICAR» y la migración estaba aplicada.
-- Se alinea con la realidad: el archivo es lo que corre sobre una base limpia,
-- y uno marcado «no aplicar» que sí está aplicado hace dudar de todo el resto.
--
-- ⚠️ Las cuatro policies de Storage de más abajo quedaron REEMPLAZADAS por
-- 20260828120000_storage_comprobantes_gasto_por_rol.sql. Decían `to
-- authenticated` validando sólo el bucket, sin mirar auth_rol(), y con eso los
-- cinco roles podían subir —incluidos read-only y bar—. Se dejan acá porque una
-- migración es historia y no se reescribe; la que manda es la posterior.
--
-- Diseño de hace unos días (docs/propuestas/comprobantes_y_facturacion.md,
-- punto 1), construido ahora. Bucket privado, sin acceso público —
-- la lectura pasa siempre por URL firmada desde el servidor, nunca
-- por URL directa.
--
-- Un comprobante por gasto (decisión ya tomada) — columna simple, no
-- tabla aparte.
--
-- Verificado con BEGIN...ROLLBACK contra la base real (27/08).
-- ═══════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('comprobantes-gasto', 'comprobantes-gasto', false);

alter table gasto
  add column comprobante_path text;

comment on column gasto.comprobante_path is
  'Ruta del comprobante (factura/recibo del proveedor) dentro del bucket comprobantes-gasto. NULL si no se cargó. Un comprobante por gasto. La lectura pasa siempre por URL firmada, nunca acceso directo.';

create policy "comprobantes_gasto_select_autenticado"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'comprobantes-gasto');

create policy "comprobantes_gasto_insert_autenticado"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'comprobantes-gasto');

create policy "comprobantes_gasto_update_autenticado"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'comprobantes-gasto')
  with check (bucket_id = 'comprobantes-gasto');

create policy "comprobantes_gasto_delete_autenticado"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'comprobantes-gasto');
