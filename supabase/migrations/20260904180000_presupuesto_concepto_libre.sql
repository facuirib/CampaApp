-- ─────────────────────────────────────────────────────────────────────────────
-- Una nota en texto libre por línea de presupuesto
--
-- Nivel C, tanda 2 (punto 15).
--
-- ── Qué había ──────────────────────────────────────────────────────────────
--
-- `presupuesto_linea` tiene `concepto_id`, que apunta al catálogo de conceptos
-- y ya es nuleable. Pero al presupuestar hay cosas que no son un concepto del
-- catálogo: «los 3 primeros meses», «suponiendo dos predios», «pendiente de
-- confirmar con el proveedor». Hoy eso se anota afuera del sistema, o no se
-- anota.
--
-- ── Por qué una columna nueva y no reusar concepto_id ──────────────────────
--
-- Porque son dos cosas distintas y `gasto` ya resolvió el mismo problema así:
-- `concepto_id` para el catálogo y `concepto_libre` para el texto. Se copia esa
-- forma, que además es la que la gente ya conoce de cargar un gasto.
--
-- 🔴 Con una diferencia deliberada: en `gasto` los dos son excluyentes —hay un
-- check que exige exactamente uno—. Acá NO. El texto es una NOTA que acompaña,
-- no un reemplazo: una línea puede tener su concepto del catálogo y además una
-- aclaración de por qué se presupuestó así. Poner el XOR obligaría a elegir
-- entre clasificar y explicar.
--
-- ── Las dos funciones ──────────────────────────────────────────────────────
--
-- Va `drop` + `create` porque se agrega un parámetro: `create or replace` con
-- distinta cantidad crea una sobrecarga en vez de reemplazar. El default deja
-- compatible a todo lo que ya las llama.
-- ─────────────────────────────────────────────────────────────────────────────

alter table presupuesto_linea add column if not exists concepto_libre text;

comment on column presupuesto_linea.concepto_libre is
  'Nota en texto libre de la línea. Acompaña a concepto_id, no lo reemplaza: se puede clasificar Y explicar.';

drop function if exists agregar_linea_presupuesto(uuid, uuid, numeric, numeric, uuid, text);

create function public.agregar_linea_presupuesto(
  p_presupuesto_id uuid,
  p_cat_gasto_id   uuid,
  p_base           numeric,
  p_cantidad       numeric default 1,
  p_concepto_id    uuid default null,
  p_unidad         text default null,
  p_concepto_libre text default null
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from presupuesto where id = p_presupuesto_id) then
    raise exception 'El presupuesto % no existe', p_presupuesto_id;
  end if;

  if not exists (select 1 from cat_gasto where id = p_cat_gasto_id) then
    raise exception 'La categoría de gasto % no existe', p_cat_gasto_id;
  end if;

  if p_base is null or p_base <= 0 then
    raise exception 'El monto base debe ser positivo (recibido: %)', p_base;
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser positiva (recibida: %)', p_cantidad;
  end if;

  -- unidad se deja en NULL a propósito: NULL significa «heredar del catálogo»
  -- (arquitectura.md §3.8), no es un dato faltante. v_presupuesto_total
  -- resuelve la herencia en TRES niveles —línea, concepto, categoría— y
  -- materializarla acá salteaba el nivel del concepto y congelaba el valor.
  -- Pasar p_unidad explícito es el override deliberado.

  begin
    insert into presupuesto_linea (
      presupuesto_id, cat_gasto_id, concepto_id, base, cantidad, unidad, concepto_libre)
    values (
      p_presupuesto_id, p_cat_gasto_id, p_concepto_id, p_base, p_cantidad, p_unidad,
      nullif(btrim(p_concepto_libre), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception
      'Ya hay una línea para esa categoría/concepto en este presupuesto. '
      'Editá la existente en vez de duplicarla.';
  end;

  return v_id;
end;
$$;

drop function if exists editar_linea_presupuesto(uuid, numeric, numeric, text);

create function public.editar_linea_presupuesto(
  p_linea_id       uuid,
  p_base           numeric default null,
  p_cantidad       numeric default null,
  p_unidad         text default null,
  p_concepto_libre text default null
) returns void
language plpgsql
as $$
begin
  if not exists (select 1 from presupuesto_linea where id = p_linea_id) then
    raise exception 'La línea de presupuesto % no existe', p_linea_id;
  end if;

  if p_base is not null and p_base <= 0 then
    raise exception 'El monto base debe ser positivo (recibido: %)', p_base;
  end if;

  if p_cantidad is not null and p_cantidad <= 0 then
    raise exception 'La cantidad debe ser positiva (recibida: %)', p_cantidad;
  end if;

  update presupuesto_linea
     set base     = coalesce(p_base, base),
         cantidad = coalesce(p_cantidad, cantidad),
         unidad   = coalesce(p_unidad, unidad),
         -- 🔴 La nota se BORRA con cadena vacía, no con null. null acá
         -- significa «no la estoy tocando», igual que los otros tres campos;
         -- sin esta distinción no habría forma de sacar una nota escrita.
         concepto_libre = case
           when p_concepto_libre is null then concepto_libre
           when btrim(p_concepto_libre) = '' then null
           else btrim(p_concepto_libre)
         end
   where id = p_linea_id;
end;
$$;
