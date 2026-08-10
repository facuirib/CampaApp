-- ═══════════════════════════════════════════════════════════════════════════
-- Los dos devengos automáticos aprenden a recibir responsable
--
-- Son las únicas dos funciones que llaman a crear_asiento sin operador detrás:
-- un proceso mensual no lo tiene. Sin este parámetro, al sacar el fallback
-- quedarían sin forma de escribir.
--
-- `p_created_by` acá es TRANSITORIO. Lo correcto para un proceso que decide el
-- sistema es un usuario de sistema —ver la nota en decisiones.md— y eso depende
-- del modelo de roles del bloque 10 completo. Mientras tanto lo pasa quien
-- dispara el proceso, que es honesto: hoy alguien aprieta el botón.
--
-- Hace falta `drop` antes: agregar un parámetro con default crea una SEGUNDA
-- función en vez de reemplazar la anterior, y una llamada de un solo argumento
-- quedaría ambigua. Mismo cuidado que con anular_asiento.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.devengar_sueldos_socios(uuid);
drop function if exists public.devengar_sponsors(uuid);

create or replace function devengar_sueldos_socios(
  p_periodo_id uuid,
  p_created_by uuid default null
) returns int
language plpgsql
as $$
declare
  v_per     record;
  v_fin     date;
  v_socio   record;
  v_monto   numeric(16,2);
  v_asiento uuid;
  v_n       int := 0;
begin
  select p.id, p.anio, p.mes, p.estado
    into v_per
  from periodo p where p.id = p_periodo_id;

  if not found then
    raise exception 'El período % no existe', p_periodo_id;
  end if;

  if v_per.estado = 'cerrado' then
    raise exception
      'El período %-% está cerrado: no se puede devengar sobre él.',
      v_per.anio, lpad(v_per.mes::text, 2, '0');
  end if;

  -- El devengo se asienta el último día del mes: es el mes completo lo que se
  -- devenga, no un día puntual.
  v_fin := (make_date(v_per.anio, v_per.mes, 1) + interval '1 month - 1 day')::date;

  for v_socio in
    select t.id, t.nombre
    from tercero t
    where t.tipo = 'socio'
      and t.activo
      -- idempotencia: lo ya devengado en este período no se vuelve a tocar
      and not exists (
        select 1 from devengo_socio d
        where d.socio_id = t.id and d.periodo_id = p_periodo_id
      )
    order by t.nombre
  loop
    v_monto := sueldo_vigente(v_socio.id, v_fin);

    -- Sin sueldo acordado vigente a fin de mes no hay nada que devengar. No es
    -- un error: un socio puede incorporarse a mitad de año.
    continue when v_monto is null or v_monto = 0;

    -- torneo_id NULL = ESTRUCTURA PERMANENTE (decisión 5, §3.2).
    --
    -- El sueldo del socio existe todos los meses, haya torneo o no. Imputarlo a
    -- un torneo exigiría prorratearlo entre los que corren ese mes, que es
    -- exactamente el criterio arbitrario que la decisión 5 prohíbe.
    --
    -- Consecuencia visible: en v_resultado_producto aparece bajo "Estructura
    -- permanente", no bajo el torneo. Baja el resultado de la EMPRESA, no la
    -- contribución del torneo.
    v_asiento := crear_asiento(
      v_fin,
      'socio',
      'Sueldo ' || v_socio.nombre || ' · ' ||
        lpad(v_per.mes::text, 2, '0') || '/' || v_per.anio,
      jsonb_build_array(
        jsonb_build_object('cuenta','GAS_SOCIOS',
                           'debe',  v_monto, 'tercero_id', v_socio.id),
        jsonb_build_object('cuenta','SOCIOS_A_PAGAR',
                           'haber', v_monto, 'tercero_id', v_socio.id)
      ),
      null,   -- torneo_id: estructura permanente
      null,   -- jornada_id
      null,   -- predio_id
      null,   -- origen_id
      p_created_by
    );

    insert into devengo_socio (socio_id, periodo_id, monto, asiento_id)
    values (v_socio.id, p_periodo_id, v_monto, v_asiento);

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

create or replace function devengar_sponsors(
  p_periodo_id uuid,
  p_created_by uuid default null
) returns int
language plpgsql
as $$
declare
  v_per      record;
  v_fin      date;
  v_idx_per  int;
  v_con      record;
  v_meses    int;
  v_cuota    numeric(16,2);
  v_monto    numeric(16,2);
  v_asiento  uuid;
  v_n        int := 0;
begin
  select p.id, p.anio, p.mes, p.estado into v_per
    from periodo p where p.id = p_periodo_id;

  if not found then
    raise exception 'El período % no existe', p_periodo_id;
  end if;

  if v_per.estado = 'cerrado' then
    raise exception
      'El período %-% está cerrado: no se puede devengar sobre él.',
      v_per.anio, lpad(v_per.mes::text, 2, '0');
  end if;

  v_fin     := (make_date(v_per.anio, v_per.mes, 1) + interval '1 month - 1 day')::date;
  v_idx_per := v_per.anio * 12 + v_per.mes;

  for v_con in
    select c.id, c.sponsor_id, c.monto_total, c.vigente_desde, c.vigente_hasta,
           t.nombre
    from contrato_sponsor c
    join tercero t on t.id = c.sponsor_id
    where v_idx_per between
            (extract(year from c.vigente_desde)::int * 12 + extract(month from c.vigente_desde)::int)
        and (extract(year from c.vigente_hasta)::int * 12 + extract(month from c.vigente_hasta)::int)
      and not exists (
        select 1 from devengo_sponsor d
        where d.contrato_id = c.id and d.periodo_id = p_periodo_id
      )
    order by t.nombre
  loop
    v_meses := meses_contrato(v_con.vigente_desde, v_con.vigente_hasta);
    v_cuota := round(v_con.monto_total / v_meses, 2);

    if v_idx_per = (extract(year  from v_con.vigente_hasta)::int * 12
                  + extract(month from v_con.vigente_hasta)::int) then
      -- último mes: el remanente, para que INGRESO_DIFERIDO cierre exacto
      v_monto := v_con.monto_total - v_cuota * (v_meses - 1);
    else
      v_monto := v_cuota;
    end if;

    continue when v_monto = 0;

    v_asiento := crear_asiento(
      v_fin,
      'sponsor',
      'Devengo sponsor · ' || v_con.nombre || ' · ' ||
        lpad(v_per.mes::text,2,'0') || '/' || v_per.anio,
      jsonb_build_array(
        jsonb_build_object('cuenta','INGRESO_DIFERIDO',
                           'debe',  v_monto, 'tercero_id', v_con.sponsor_id),
        jsonb_build_object('cuenta','ING_SPONSORS',
                           'haber', v_monto, 'tercero_id', v_con.sponsor_id)
      ),
      null, null, null,   -- nivel empresa (decisión 76)
      v_con.id,
      p_created_by
    );

    insert into devengo_sponsor (contrato_id, periodo_id, monto, asiento_id)
    values (v_con.id, p_periodo_id, v_monto, v_asiento);

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

comment on function public.devengar_sueldos_socios(uuid, uuid) is
  'Devenga el sueldo de cada socio para un período. Idempotente. p_created_by '
  'es transitorio hasta que exista el usuario de sistema (bloque 10 completo).';

comment on function public.devengar_sponsors(uuid, uuid) is
  'Devengo lineal mensual de los contratos de sponsor. Idempotente. '
  'p_created_by es transitorio hasta el usuario de sistema (bloque 10 completo).';
