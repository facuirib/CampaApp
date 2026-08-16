-- ═══════════════════════════════════════════════════════════════════════════
-- SIEMBRA DE ESTRUCTURA · lo que el sistema necesita para arrancar
--
-- Hasta acá la base NO se podía reconstruir desde `supabase/migrations/`.
-- Corriendo las 60 migraciones sobre una base vacía, el plan de cuentas quedaba
-- con **5 cuentas de 28**: las otras 23 vivían sólo en `supabase/seed.sql`, que
-- ningún automatismo ejecutaba. Y faltaban además los predios, las cajas, el
-- catálogo de gastos entero y el ejercicio.
--
-- **La falla era silenciosa**, que es lo peor: aplicar no daba error. Rompía
-- después, en el primer `crear_asiento`, con "cuenta no encontrada" — un
-- mensaje que habla de una cuenta y no de que falta media base.
--
-- ── Por qué esta migración no toca la base actual ──────────────────────────
--
-- **Todo va con `on conflict do nothing` o con `where not exists`.** Sobre la
-- base de producción, donde las filas ya están, no hace absolutamente nada.
-- Sobre una vacía, la deja usable. Es aditiva por construcción, no por cuidado.
--
-- `caja` y `config_contable` NO tienen constraint único, así que ahí
-- `on conflict do nothing` no serviría —no habría conflicto que detectar y
-- reinsertaría duplicados en cada corrida—. Esas dos van con `where not
-- exists`, que es idempotente sin depender de un constraint.
--
-- ── De dónde salieron estos datos ──────────────────────────────────────────
--
-- **De la base, no de `seed.sql`.** El seed quedó con el catálogo ANTERIOR al
-- reordenamiento del plan de cuentas: tiene «Extras» dos veces, «Alquiler» y
-- «Alquileres» como categorías distintas, «Mantenimiento eventual» y los
-- conceptos «Agus» y «Guille» que duplicaban a los socios. Sembrar desde ahí
-- habría recreado justo lo que se acaba de limpiar.
--
-- Lo que sigue es la foto de la base **después** del reordenamiento: 32
-- categorías con los nombres nuevos —«Otros Gastos Fecha», «Extras Bar»,
-- «Mantenimiento Predio», «Sueldos Predio»— y 100 conceptos.
--
-- ── Qué NO está acá, a propósito ───────────────────────────────────────────
--
-- · **Datos de prueba.** Viven en `supabase/seeds/99_*` y quedan marcados en
--   `_prueba_marca`.
-- · **El torneo «Apertura 2026»** que `seed.sql` creaba: no existe en la base
--   —hoy hay Clausura 2026 y Apertura 2027— y un torneo no es estructura.
-- · **Los datos de un torneo concreto** —categorías, series, padrón, grilla—:
--   están en `supabase/seeds/clausura_2026_*`, que es donde corresponde. El
--   schema es agnóstico del torneo (regla 12).
--
-- ── El orden importa, por las FK ───────────────────────────────────────────
--
--   cuenta → predio → caja        (caja apunta a las dos)
--   cuenta → cat_gasto → concepto_gasto
--   ejercicio · formato_instancia · config_contable · plantilla_mail  (sueltas)
--
-- Las cinco cuentas que ya crean otras migraciones —CAJA_CENTRAL, GAS_SOCIOS,
-- SOCIOS_A_PAGAR, DEUDORES_SPONSORS, INGRESO_DIFERIDO— se incluyen igual: con
-- `on conflict` no molestan, y así este archivo es el plan de cuentas completo
-- en un solo lugar en vez de cinco.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1 · Plan de cuentas · 28 ───────────────────────────────────────────────
insert into cuenta (codigo, nombre, tipo, imputable) values
  ('AMORT_ACUM', 'Amortización acumulada', 'activo', true),
  ('BIENES_USO', 'Bienes de uso', 'activo', true),
  ('CAJA_CENTRAL', 'Caja Central', 'activo', true),
  ('CAJA_EFECTIVO', 'Caja Efectivo', 'activo', true),
  ('CAJA_TRANSFERENCIA', 'Caja Transferencia', 'activo', true),
  ('CAJA_USD', 'Caja USD', 'activo', true),
  ('DEUDORES_SPONSORS', 'Deudores por sponsoreo', 'activo', true),
  ('FONDO_INVERSION', 'Fondo de inversión', 'activo', true),
  ('VALORES_A_DEPOSITAR', 'Valores a depositar', 'activo', true),
  ('GAS_AMORT', 'Amortizaciones', 'egreso', true),
  ('GAS_BAR', 'Gastos de bar', 'egreso', true),
  ('GAS_FECHA', 'Gastos operativos de fecha', 'egreso', true),
  ('GAS_IMPUESTOS', 'Impuestos', 'egreso', true),
  ('GAS_PREDIO', 'Gastos de predio', 'egreso', true),
  ('GAS_SOCIOS', 'Sueldos de socios', 'egreso', true),
  ('GAS_SUELDOS', 'Sueldos y cargas', 'egreso', true),
  ('FIN_DIF_CAMBIO', 'Diferencia de cambio', 'financiero', true),
  ('FIN_RENDIMIENTOS', 'Rendimientos financieros', 'financiero', true),
  ('ING_BAR', 'Ingresos bar', 'ingreso', true),
  ('ING_INSCRIPCIONES', 'Ingresos por inscripciones', 'ingreso', true),
  ('ING_PARTIDOS', 'Ingresos por partidos', 'ingreso', true),
  ('ING_SPONSORS', 'Ingresos sponsors', 'ingreso', true),
  ('ANTICIPOS', 'Anticipos de clientes', 'pasivo', true),
  ('CHEQUES_A_PAGAR', 'Cheques a pagar', 'pasivo', true),
  ('INGRESO_DIFERIDO', 'Ingresos diferidos', 'pasivo', true),
  ('PLANES_PAGO', 'Planes de pago', 'pasivo', true),
  ('PROVEEDORES', 'Proveedores a pagar', 'pasivo', true),
  ('SOCIOS_A_PAGAR', 'Socios a pagar', 'pasivo', true)
on conflict (codigo) do nothing;


-- ── 2 · Predios ────────────────────────────────────────────────────────────
insert into predio (codigo, nombre, activo) values
  ('AEP', 'Aeropuerto', true),
  ('TIR', 'Tirolesa', true)
on conflict (codigo) do nothing;


-- ── 3 · Cajas ──────────────────────────────────────────────────────────────
-- Cuelgan de predio Y de cuenta, así que van después de las dos.
--
-- `where not exists` y no `on conflict`: `caja` no tiene constraint único, así
-- que no habría nada que detectar y cada corrida agregaría duplicados.
--
-- El predio va por su código, no por uuid: los uuid se generan en cada base y
-- una migración con uuid literales no reproduce nada.
insert into caja (tipo, nombre, predio_id, cuenta_id, activo)
select v.tipo, v.nombre,
       (select p.id from predio p where p.codigo = nullif(v.predio_codigo, '')),
       (select c.id from cuenta c where c.codigo = v.cuenta_codigo),
       v.activo
  from (values
    ('efectivo',      'Caja Central',        '',    'CAJA_CENTRAL',       true),
    ('efectivo',      'Efectivo Aeropuerto', 'AEP', 'CAJA_EFECTIVO',      true),
    ('efectivo',      'Efectivo Tirolesa',   'TIR', 'CAJA_EFECTIVO',      true),
    ('transferencia', 'Caja Transferencia',  '',    'CAJA_TRANSFERENCIA', true),
    ('usd',           'Caja USD',            '',    'CAJA_USD',           true)
  ) as v(tipo, nombre, predio_codigo, cuenta_codigo, activo)
 where not exists (select 1 from caja k where k.nombre = v.nombre);


-- ── 4 · Configuración contable ─────────────────────────────────────────────
-- Umbral de activación: por debajo de esto un bien va a gasto, no se activa.
-- Sin constraint único, así que `where not exists` sobre la tabla entera: es
-- una sola fila de configuración, no una lista.
insert into config_contable (umbral_activacion, vigente_desde)
select 500000.00, '2026-07-24'::date
 where not exists (select 1 from config_contable);


-- ── 5 · Ejercicio ──────────────────────────────────────────────────────────
-- **Tan bloqueante como las cuentas.** `periodo_de_fecha()` aborta si no
-- encuentra un ejercicio que contenga la fecha, y `crear_asiento` la llama:
-- sin ejercicio no se puede asentar nada.
--
-- Se siembra 2026 porque es el que la base tiene. La política de los ejercicios
-- siguientes —un seed por año a mano, o autocrearlos en `periodo_de_fecha`—
-- sigue abierta en `decisiones.md`; esto no la cierra, destraba el arranque.
insert into ejercicio (anio, fecha_desde, fecha_hasta, estado) values
  (2026, '2026-01-01'::date, '2026-12-31'::date, 'abierto')
on conflict (anio) do nothing;


-- ── 6 · Formatos de instancia (playoffs) ───────────────────────────────────
insert into formato_instancia (nombre, cantidad_partidos, orden) values
  ('cuartos',   4, 1),
  ('semifinal', 2, 2),
  ('final',     1, 3)
on conflict (nombre) do nothing;


-- ── 7 · Catálogo de gastos · 32 categorías ─────────────────────────────────
-- Cuelgan de `cuenta`, así que van después del plan.
--
-- Es la foto POSTERIOR al reordenamiento: «Otros Gastos Fecha» y «Extras Bar»
-- —que antes eran dos «Extras» indistinguibles—, «Mantenimiento Predio»,
-- «Sueldos Predio», «Alquileres» sin su duplicado «Alquiler», y sin
-- «Mantenimiento eventual». Los impuestos ya cuelgan de GAS_IMPUESTOS y la
-- nafta de GAS_PREDIO.
--
-- `unidad_default` viene incluida, así que el seed de unidades de costo
-- (`seeds/01_catalogo_unidades_costo.sql`) queda cubierto por esta migración.
insert into cat_gasto (nombre, naturaleza, area, cuenta_id, imputacion_default, unidad_default, activo)
select v.nombre, v.naturaleza, v.area,
       (select c.id from cuenta c where c.codigo = v.cuenta_codigo),
       v.imputacion_default, v.unidad_default, v.activo
  from (values
    ('Administración',              'por_fecha',  'administracion', 'GAS_SUELDOS',   'torneo',     'unico',          true),
    ('Impositivos',                 'recurrente', 'administracion', 'GAS_IMPUESTOS', 'torneo',     'por_mes',        true),
    ('Planes de Pago',              'recurrente', 'administracion', 'GAS_IMPUESTOS', 'torneo',     'por_mes',        true),
    ('Sueldos administrativos',     'recurrente', 'administracion', 'GAS_SUELDOS',   'torneo',     'por_mes',        true),
    ('Sueldos Predio',              'recurrente', 'administracion', 'GAS_SUELDOS',   'torneo',     'por_mes',        true),
    ('Activaciones',                'eventual',   'bar',            'GAS_BAR',       'torneo',     'unico',          true),
    ('Encargado de bar',            'recurrente', 'bar',            'GAS_BAR',       'torneo',     'por_mes',        true),
    ('Extras Bar',                  'por_fecha',  'bar',            'GAS_BAR',       'torneo',     'unico',          true),
    ('Limpieza',                    'por_fecha',  'bar',            'GAS_BAR',       'torneo',     'unico',          true),
    ('Personal',                    'recurrente', 'bar',            'GAS_BAR',       'torneo',     'por_mes',        true),
    ('Productos',                   'por_fecha',  'bar',            'GAS_BAR',       'torneo',     'unico',          true),
    ('Proveedores',                 'por_fecha',  'bar',            'GAS_BAR',       'torneo',     'unico',          true),
    ('Sistema y equipamiento',      'eventual',   'bar',            'GAS_BAR',       'torneo',     'unico',          true),
    ('Alquileres',                  'recurrente', 'predio',         'GAS_PREDIO',    'torneo',     'por_mes',        true),
    ('Compras e insumos de predio', 'eventual',   'predio',         'GAS_PREDIO',    'estructura', 'unico',          true),
    ('Equipamiento',                'inversion',  'predio',         'GAS_PREDIO',    'estructura', 'unico',          true),
    ('Estacionamiento',             'por_fecha',  'predio',         'GAS_PREDIO',    'torneo',     'por_dia_cancha', true),
    ('Guardias',                    'por_fecha',  'predio',         'GAS_PREDIO',    'torneo',     'por_dia_cancha', true),
    ('Limpieza',                    'por_fecha',  'predio',         'GAS_PREDIO',    'torneo',     'por_dia_cancha', true),
    ('Mantenimiento Predio',        'recurrente', 'predio',         'GAS_PREDIO',    'torneo',     'por_mes',        true),
    ('Nafta',                       'recurrente', 'predio',         'GAS_PREDIO',    'torneo',     'por_mes',        true),
    ('Seguridad',                   'recurrente', 'predio',         'GAS_PREDIO',    'torneo',     'por_mes',        true),
    ('Servicios',                   'recurrente', 'predio',         'GAS_PREDIO',    'torneo',     'por_mes',        true),
    ('Arbitros Femenino',           'por_fecha',  'torneo',         'GAS_FECHA',     'torneo',     'por_partido',    true),
    ('Arbitros Masculino',          'por_fecha',  'torneo',         'GAS_FECHA',     'torneo',     'por_partido',    true),
    ('Coordinación',                'por_fecha',  'torneo',         'GAS_FECHA',     'torneo',     'por_dia_cancha', true),
    ('Media',                       'por_fecha',  'torneo',         'GAS_FECHA',     'torneo',     'por_dia_cancha', true),
    ('Medicinal',                   'por_fecha',  'torneo',         'GAS_FECHA',     'torneo',     'por_dia_cancha', true),
    ('Operativos',                  'por_fecha',  'torneo',         'GAS_FECHA',     'torneo',     'por_partido',    true),
    ('Otros Gastos Fecha',          'eventual',   'torneo',         'GAS_FECHA',     'torneo',     'unico',          true),
    ('Tribunal',                    'por_fecha',  'torneo',         'GAS_FECHA',     'torneo',     'por_dia_cancha', true),
    ('Viáticos',                    'por_fecha',  'torneo',         'GAS_FECHA',     'torneo',     'por_dia_cancha', true)
  ) as v(nombre, naturaleza, area, cuenta_codigo, imputacion_default, unidad_default, activo)
on conflict (area, nombre) do nothing;


-- ── 8 · Conceptos de gasto · 100 ───────────────────────────────────────────
-- Cuelgan de `cat_gasto`, que se referencia por su clave natural `(area,
-- nombre)` — no por uuid, por lo mismo que las cajas.
--
-- «Viáticos» de torneo no tiene conceptos a propósito: los siete que tenía
-- duplicaban categorías que ya existen por su cuenta (Estacionamiento,
-- Guardias, Limpieza) y se sacaron en el reordenamiento.
--
-- Tampoco están «Agus» ni «Guille» en «Sueldos administrativos»: eran los dos
-- socios cargados dos veces, y un gasto contra ese concepto habría contado su
-- sueldo por segunda vez. El sueldo de un socio sale de `tercero_id`.
insert into concepto_gasto (cat_gasto_id, nombre)
select (select cg.id from cat_gasto cg where cg.area = v.area and cg.nombre = v.categoria),
       v.concepto
  from (values
    ('administracion', 'Administración',          'Cobranzas'),
    ('administracion', 'Impositivos',             'Comercio e Industria CBA'),
    ('administracion', 'Impositivos',             'Créd / Déb bancarios'),
    ('administracion', 'Impositivos',             'F931'),
    ('administracion', 'Impositivos',             'IIBB'),
    ('administracion', 'Impositivos',             'IVA'),
    ('administracion', 'Impositivos',             'Municipalidad TIR'),
    ('administracion', 'Impositivos',             'Retencion IIBB'),
    ('administracion', 'Impositivos',             'UTEDYC'),
    ('administracion', 'Planes de Pago',          'ARCA'),
    ('administracion', 'Planes de Pago',          'Municipalidad'),
    ('administracion', 'Planes de Pago',          'Rentas'),
    ('administracion', 'Sueldos administrativos', 'Augusto'),
    ('administracion', 'Sueldos administrativos', 'Estudio contable'),
    ('administracion', 'Sueldos administrativos', 'Jero'),
    ('administracion', 'Sueldos administrativos', 'Mati'),
    ('administracion', 'Sueldos administrativos', 'Rodri'),
    ('administracion', 'Sueldos administrativos', 'Yas'),
    ('administracion', 'Sueldos Predio',          'Agrónomo'),
    ('administracion', 'Sueldos Predio',          'Fabio'),
    ('administracion', 'Sueldos Predio',          'General'),
    ('bar',            'Activaciones',            'DJ'),
    ('bar',            'Activaciones',            'Gastos activaciones'),
    ('bar',            'Activaciones',            'Personal extra'),
    ('bar',            'Encargado de bar',        'Comisión'),
    ('bar',            'Encargado de bar',        'Viáticos'),
    ('bar',            'Extras Bar',              'Contenedores'),
    ('bar',            'Extras Bar',              'Productos de limpieza'),
    ('bar',            'Extras Bar',              'Sonido'),
    ('bar',            'Limpieza',                'Movilidad'),
    ('bar',            'Limpieza',                'Personal'),
    ('bar',            'Personal',                'Gastos para personal'),
    ('bar',            'Personal',                'Sábados'),
    ('bar',            'Personal',                'Semanal'),
    ('bar',            'Personal',                'Viáticos'),
    ('bar',            'Productos',               'Coca'),
    ('bar',            'Productos',               'Descartables'),
    ('bar',            'Productos',               'Hielo'),
    ('bar',            'Productos',               'Magnum'),
    ('bar',            'Productos',               'Maquina de agua'),
    ('bar',            'Productos',               'Parrillas'),
    ('bar',            'Productos',               'Productos varios'),
    ('bar',            'Productos',               'Quilmes'),
    ('bar',            'Proveedores',             'Rendición'),
    ('bar',            'Sistema y equipamiento',  'Inversion'),
    ('bar',            'Sistema y equipamiento',  'José'),
    ('predio',         'Alquileres',              'Aeropuerto'),
    ('predio',         'Alquileres',              'Estacionamiento AEP'),
    ('predio',         'Alquileres',              'Oficina Tirolesa'),
    ('predio',         'Alquileres',              'Patio'),
    ('predio',         'Alquileres',              'Tirolesa'),
    ('predio',         'Estacionamiento',         'Encargados'),
    ('predio',         'Estacionamiento',         'General'),
    ('predio',         'Guardias',                'Administración'),
    ('predio',         'Guardias',                'Aeropuerto'),
    ('predio',         'Guardias',                'Tirolesa'),
    ('predio',         'Limpieza',                'Aeropuerto'),
    ('predio',         'Limpieza',                'Berclean'),
    ('predio',         'Mantenimiento Predio',    'Fertilizantes'),
    ('predio',         'Mantenimiento Predio',    'Nafta maquinaria'),
    ('predio',         'Nafta',                   'Nafta Agus'),
    ('predio',         'Nafta',                   'Nafta Guille'),
    ('predio',         'Seguridad',               'Daniel'),
    ('predio',         'Seguridad',               'Flaco'),
    ('predio',         'Seguridad',               'Guardia Sábado'),
    ('predio',         'Seguridad',               'Miguel'),
    ('predio',         'Servicios',               'Agua Tirolesa'),
    ('predio',         'Servicios',               'Aguas Cordobesas'),
    ('predio',         'Servicios',               'All Solution'),
    ('predio',         'Servicios',               'Batcom'),
    ('predio',         'Servicios',               'Berkley'),
    ('predio',         'Servicios',               'Cuenta Bancaria'),
    ('predio',         'Servicios',               'EPEC'),
    ('predio',         'Servicios',               'Luz Tirolesa'),
    ('predio',         'Servicios',               'Sancor'),
    ('torneo',         'Arbitros Femenino',       'ACA Fem'),
    ('torneo',         'Arbitros Femenino',       'Martin Fem'),
    ('torneo',         'Arbitros Masculino',      'AADC'),
    ('torneo',         'Arbitros Masculino',      'ACA'),
    ('torneo',         'Arbitros Masculino',      'ACAF'),
    ('torneo',         'Arbitros Masculino',      'AFUC'),
    ('torneo',         'Arbitros Masculino',      'CAFUCC'),
    ('torneo',         'Arbitros Masculino',      'UCAD'),
    ('torneo',         'Coordinación',            'Angie'),
    ('torneo',         'Coordinación',            'Cesar'),
    ('torneo',         'Coordinación',            'Coordinadores ballboys'),
    ('torneo',         'Coordinación',            'Fer'),
    ('torneo',         'Media',                   'Fotografía'),
    ('torneo',         'Media',                   'Video'),
    ('torneo',         'Medicinal',               'Ecco'),
    ('torneo',         'Medicinal',               'Kinesiologos'),
    ('torneo',         'Operativos',              'Ballboys'),
    ('torneo',         'Operativos',              'Veedores Femenino'),
    ('torneo',         'Operativos',              'Veedores Masculino'),
    ('torneo',         'Otros Gastos Fecha',      'Agua Tanques'),
    ('torneo',         'Otros Gastos Fecha',      'Camión regador'),
    ('torneo',         'Otros Gastos Fecha',      'Datos veedores'),
    ('torneo',         'Tribunal',                'Eliseo'),
    ('torneo',         'Tribunal',                'Juanma'),
    ('torneo',         'Tribunal',                'Mateo')
  ) as v(area, categoria, concepto)
on conflict (cat_gasto_id, nombre) do nothing;


-- ── 9 · Plantillas de mensaje ──────────────────────────────────────────────
-- Sólo `reclamo_vencida` se manda hoy; las otras tres están sembradas y
-- ninguna función las lee. Se incluyen las cuatro porque `/configuracion/
-- plantillas` las lista, y una base reconstruida sin ellas dejaría la pantalla
-- vacía sin explicar por qué.
--
-- Van con `$plantilla$` en vez de comillas simples: el HTML tiene comillas
-- adentro y escaparlas a mano es la forma más rápida de romper un mail.
insert into plantilla_mail (clave, asunto, cuerpo, cuerpo_texto) values
  ('aviso_7dias',
   'Tu cuota vence pronto · CAMPA',
   $plantilla$<p>Hola {{equipo}},</p>$plantilla$,
   null),
  ('recibo_pago',
   'Recibo de pago · CAMPA',
   $plantilla$<p>Hola {{equipo}},</p>$plantilla$,
   null),
  ('reclamo_2',
   'Segundo aviso · CAMPA',
   $plantilla$<p>Hola {{equipo}},</p>$plantilla$,
   null),
  ('reclamo_vencida',
   '{{equipo}} · tenés cuotas vencidas en CAMPA',
   $plantilla$<div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; color: #0b1524;"><div style="padding: 16px 0; border-bottom: 2px solid #0b1524;"><strong style="font-size: 18px; letter-spacing: .4px;">CAMPA</strong></div><div style="padding: 24px 0; font-size: 14px; line-height: 1.55;"><p>Hola <strong>{{equipo}}</strong>,</p><p>Te escribimos porque figuran <strong>{{cantidad}}</strong> a tu nombre, por un total de <strong>{{monto}}</strong>.</p><div style="background: #f4f6fa; border-radius: 10px; padding: 14px 16px; white-space: pre-wrap; font-size: 13px; line-height: 1.7; margin: 18px 0;">{{detalle}}</div><p>Te pedimos regularizarlo para que el equipo siga participando sin inconvenientes. Si ya lo pagaste, avisanos y lo verificamos.</p><p>¡Gracias y nos vemos en la cancha!</p></div><div style="padding: 16px 0; border-top: 1px solid #e7eaf0; font-size: 12px; color: #6b7686;">Este mensaje lo generó CAMPA. Respondé este mail ante cualquier duda.</div></div>$plantilla$,
   $plantilla$Hola {{equipo}}!

Te escribimos de CAMPA: figuran {{cantidad}} a tu nombre, por un total de {{monto}}.

{{detalle}}

Te pedimos regularizarlo para seguir participando sin inconvenientes. Si ya lo pagaste, avisanos y lo verificamos.

¡Gracias y nos vemos en la cancha!$plantilla$)
on conflict (clave) do nothing;
