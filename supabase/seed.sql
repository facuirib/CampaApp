-- ═══ SEED · datos iniciales ═══

-- Plan de cuentas mínimo
insert into cuenta (codigo,nombre,tipo) values
  ('CAJA_EFECTIVO','Caja Efectivo','activo'),
  ('CAJA_TRANSFERENCIA','Caja Transferencia','activo'),
  ('CAJA_USD','Caja USD','activo'),
  ('VALORES_A_DEPOSITAR','Valores a depositar','activo'),
  ('DEUDORES','Deudores por servicios','activo'),
  ('BIENES_USO','Bienes de uso','activo'),
  ('AMORT_ACUM','Amortización acumulada','activo'),
  ('FONDO_INVERSION','Fondo de inversión','activo'),
  ('PROVEEDORES','Proveedores a pagar','pasivo'),
  ('CHEQUES_A_PAGAR','Cheques a pagar','pasivo'),
  ('PLANES_PAGO','Planes de pago','pasivo'),
  ('ANTICIPOS','Anticipos de clientes','pasivo'),
  ('ING_PARTIDOS','Ingresos por partidos','ingreso'),
  ('ING_INSCRIPCIONES','Ingresos por inscripciones','ingreso'),
  ('ING_BAR','Ingresos bar','ingreso'),
  ('ING_SPONSORS','Ingresos sponsors','ingreso'),
  ('GAS_FECHA','Gastos operativos de fecha','egreso'),
  ('GAS_SUELDOS','Sueldos y cargas','egreso'),
  ('GAS_PREDIO','Gastos de predio','egreso'),
  ('GAS_IMPUESTOS','Impuestos','egreso'),
  ('GAS_BAR','Gastos de bar','egreso'),
  ('GAS_AMORT','Amortizaciones','egreso'),
  ('FIN_DIF_CAMBIO','Diferencia de cambio','financiero'),
  ('FIN_RENDIMIENTOS','Rendimientos financieros','financiero');

-- Cajas
-- Predios
insert into predio (codigo,nombre) values ('TIR','Tirolesa'), ('AEP','Aeropuerto');

-- Efectivo: una caja por predio (lo exige trg_caja_predio)
insert into caja (tipo,nombre,predio_id)
  select 'efectivo','Efectivo '||nombre,id from predio;
-- Transferencia y USD: globales, sin predio
insert into caja (tipo,nombre) values
  ('transferencia','Caja Transferencia'),
  ('usd','Caja USD');

-- Predios

-- Configuración contable
insert into config_contable (umbral_activacion) values (500000);

-- ═══ Catálogo de gastos ═══
-- Migrado desde gastos_campa.xlsx · normalizado a naturaleza + área

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Encargado de bar','recurrente','bar',id from cuenta where codigo='GAS_BAR';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Comisión' from cat_gasto where nombre='Encargado de bar' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Viáticos' from cat_gasto where nombre='Encargado de bar' and area='bar';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Personal','recurrente','bar',id from cuenta where codigo='GAS_BAR';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Semanal' from cat_gasto where nombre='Personal' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Sábados' from cat_gasto where nombre='Personal' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Viáticos' from cat_gasto where nombre='Personal' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Gastos para personal' from cat_gasto where nombre='Personal' and area='bar';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Productos','por_fecha','bar',id from cuenta where codigo='GAS_BAR';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Quilmes' from cat_gasto where nombre='Productos' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Coca' from cat_gasto where nombre='Productos' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Magnum' from cat_gasto where nombre='Productos' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Productos varios' from cat_gasto where nombre='Productos' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Parrillas' from cat_gasto where nombre='Productos' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Hielo' from cat_gasto where nombre='Productos' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Maquina de agua' from cat_gasto where nombre='Productos' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Descartables' from cat_gasto where nombre='Productos' and area='bar';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Limpieza','por_fecha','bar',id from cuenta where codigo='GAS_BAR';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Personal' from cat_gasto where nombre='Limpieza' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Movilidad' from cat_gasto where nombre='Limpieza' and area='bar';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Extras','por_fecha','bar',id from cuenta where codigo='GAS_BAR';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Sonido' from cat_gasto where nombre='Extras' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Productos de limpieza' from cat_gasto where nombre='Extras' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Contenedores' from cat_gasto where nombre='Extras' and area='bar';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Activaciones','eventual','bar',id from cuenta where codigo='GAS_BAR';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'DJ' from cat_gasto where nombre='Activaciones' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Personal extra' from cat_gasto where nombre='Activaciones' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Gastos activaciones' from cat_gasto where nombre='Activaciones' and area='bar';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Proveedores','por_fecha','bar',id from cuenta where codigo='GAS_BAR';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Rendición' from cat_gasto where nombre='Proveedores' and area='bar';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Sistema y equipamiento','eventual','bar',id from cuenta where codigo='GAS_BAR';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'José' from cat_gasto where nombre='Sistema y equipamiento' and area='bar';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Inversion' from cat_gasto where nombre='Sistema y equipamiento' and area='bar';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Arbitros Masculino','por_fecha','torneo',id from cuenta where codigo='GAS_FECHA';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'AADC' from cat_gasto where nombre='Arbitros Masculino' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'ACA' from cat_gasto where nombre='Arbitros Masculino' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'ACAF' from cat_gasto where nombre='Arbitros Masculino' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'AFUC' from cat_gasto where nombre='Arbitros Masculino' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'CAFUCC' from cat_gasto where nombre='Arbitros Masculino' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'UCAD' from cat_gasto where nombre='Arbitros Masculino' and area='torneo';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Arbitros Femenino','por_fecha','torneo',id from cuenta where codigo='GAS_FECHA';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Martin Fem' from cat_gasto where nombre='Arbitros Femenino' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'ACA Fem' from cat_gasto where nombre='Arbitros Femenino' and area='torneo';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Media','por_fecha','torneo',id from cuenta where codigo='GAS_FECHA';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Fotografía' from cat_gasto where nombre='Media' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Video' from cat_gasto where nombre='Media' and area='torneo';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Operativos','por_fecha','torneo',id from cuenta where codigo='GAS_FECHA';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Veedores Masculino' from cat_gasto where nombre='Operativos' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Veedores Femenino' from cat_gasto where nombre='Operativos' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Ballboys' from cat_gasto where nombre='Operativos' and area='torneo';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Coordinación','por_fecha','torneo',id from cuenta where codigo='GAS_FECHA';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Cesar' from cat_gasto where nombre='Coordinación' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Fer' from cat_gasto where nombre='Coordinación' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Angie' from cat_gasto where nombre='Coordinación' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Coordinadores ballboys' from cat_gasto where nombre='Coordinación' and area='torneo';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Administración','por_fecha','administracion',id from cuenta where codigo='GAS_SUELDOS';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Cobranzas' from cat_gasto where nombre='Administración' and area='administracion';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Tribunal','por_fecha','torneo',id from cuenta where codigo='GAS_FECHA';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Juanma' from cat_gasto where nombre='Tribunal' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Mateo' from cat_gasto where nombre='Tribunal' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Eliseo' from cat_gasto where nombre='Tribunal' and area='torneo';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Estacionamiento','por_fecha','predio',id from cuenta where codigo='GAS_PREDIO';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Encargados' from cat_gasto where nombre='Estacionamiento' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'General' from cat_gasto where nombre='Estacionamiento' and area='predio';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Guardias','por_fecha','predio',id from cuenta where codigo='GAS_PREDIO';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Aeropuerto' from cat_gasto where nombre='Guardias' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Tirolesa' from cat_gasto where nombre='Guardias' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Administración' from cat_gasto where nombre='Guardias' and area='predio';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Limpieza','por_fecha','predio',id from cuenta where codigo='GAS_PREDIO';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Berclean' from cat_gasto where nombre='Limpieza' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Aeropuerto' from cat_gasto where nombre='Limpieza' and area='predio';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Viáticos','por_fecha','torneo',id from cuenta where codigo='GAS_FECHA';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Veedores' from cat_gasto where nombre='Viáticos' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Ballboys' from cat_gasto where nombre='Viáticos' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Coordinación / Tribunal' from cat_gasto where nombre='Viáticos' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Limpieza - Berclean' from cat_gasto where nombre='Viáticos' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Limpieza - Roman' from cat_gasto where nombre='Viáticos' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Estacionamiento' from cat_gasto where nombre='Viáticos' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Guardias' from cat_gasto where nombre='Viáticos' and area='torneo';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Alquiler','recurrente','predio',id from cuenta where codigo='GAS_PREDIO';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Masculino' from cat_gasto where nombre='Alquiler' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Femenino' from cat_gasto where nombre='Alquiler' and area='predio';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Medicinal','por_fecha','torneo',id from cuenta where codigo='GAS_FECHA';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Kinesiologos' from cat_gasto where nombre='Medicinal' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Ecco' from cat_gasto where nombre='Medicinal' and area='torneo';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Extras','eventual','torneo',id from cuenta where codigo='GAS_FECHA';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Datos veedores' from cat_gasto where nombre='Extras' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Camión regador' from cat_gasto where nombre='Extras' and area='torneo';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Agua Tanques' from cat_gasto where nombre='Extras' and area='torneo';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Impositivos','recurrente','administracion',id from cuenta where codigo='GAS_SUELDOS';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'IVA' from cat_gasto where nombre='Impositivos' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'F931' from cat_gasto where nombre='Impositivos' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'UTEDYC' from cat_gasto where nombre='Impositivos' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'IIBB' from cat_gasto where nombre='Impositivos' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Comercio e Industria CBA' from cat_gasto where nombre='Impositivos' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Municipalidad TIR' from cat_gasto where nombre='Impositivos' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Créd / Déb bancarios' from cat_gasto where nombre='Impositivos' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Retencion IIBB' from cat_gasto where nombre='Impositivos' and area='administracion';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Planes de Pago','recurrente','administracion',id from cuenta where codigo='GAS_SUELDOS';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'ARCA' from cat_gasto where nombre='Planes de Pago' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Rentas' from cat_gasto where nombre='Planes de Pago' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Municipalidad' from cat_gasto where nombre='Planes de Pago' and area='administracion';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Sueldos administrativos','recurrente','administracion',id from cuenta where codigo='GAS_SUELDOS';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Agus' from cat_gasto where nombre='Sueldos administrativos' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Guille' from cat_gasto where nombre='Sueldos administrativos' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Mati' from cat_gasto where nombre='Sueldos administrativos' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Yas' from cat_gasto where nombre='Sueldos administrativos' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Rodri' from cat_gasto where nombre='Sueldos administrativos' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Estudio contable' from cat_gasto where nombre='Sueldos administrativos' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Jero' from cat_gasto where nombre='Sueldos administrativos' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Augusto' from cat_gasto where nombre='Sueldos administrativos' and area='administracion';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Mantenimiento - Personal','recurrente','administracion',id from cuenta where codigo='GAS_SUELDOS';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Fabio' from cat_gasto where nombre='Mantenimiento - Personal' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'General' from cat_gasto where nombre='Mantenimiento - Personal' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Agrónomo' from cat_gasto where nombre='Mantenimiento - Personal' and area='administracion';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Mantenimiento','recurrente','predio',id from cuenta where codigo='GAS_PREDIO';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Fertilizantes' from cat_gasto where nombre='Mantenimiento' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Nafta maquinaria' from cat_gasto where nombre='Mantenimiento' and area='predio';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Seguridad','recurrente','predio',id from cuenta where codigo='GAS_PREDIO';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Flaco' from cat_gasto where nombre='Seguridad' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Daniel' from cat_gasto where nombre='Seguridad' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Guardia Sábado' from cat_gasto where nombre='Seguridad' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Miguel' from cat_gasto where nombre='Seguridad' and area='predio';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Servicios','recurrente','predio',id from cuenta where codigo='GAS_PREDIO';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'EPEC' from cat_gasto where nombre='Servicios' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Luz Tirolesa' from cat_gasto where nombre='Servicios' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Aguas Cordobesas' from cat_gasto where nombre='Servicios' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Agua Tirolesa' from cat_gasto where nombre='Servicios' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Batcom' from cat_gasto where nombre='Servicios' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'All Solution' from cat_gasto where nombre='Servicios' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Cuenta Bancaria' from cat_gasto where nombre='Servicios' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Sancor' from cat_gasto where nombre='Servicios' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Berkley' from cat_gasto where nombre='Servicios' and area='predio';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Alquileres','recurrente','predio',id from cuenta where codigo='GAS_PREDIO';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Aeropuerto' from cat_gasto where nombre='Alquileres' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Estacionamiento AEP' from cat_gasto where nombre='Alquileres' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Tirolesa' from cat_gasto where nombre='Alquileres' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Oficina Tirolesa' from cat_gasto where nombre='Alquileres' and area='predio';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Patio' from cat_gasto where nombre='Alquileres' and area='predio';

insert into cat_gasto (nombre,naturaleza,area,cuenta_id) select 'Nafta','recurrente','administracion',id from cuenta where codigo='GAS_SUELDOS';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Nafta Agus' from cat_gasto where nombre='Nafta' and area='administracion';
insert into concepto_gasto (cat_gasto_id,nombre) select id,'Nafta Guille' from cat_gasto where nombre='Nafta' and area='administracion';

-- Categorías nuevas (gasto eventual e inversión)
insert into cat_gasto (nombre,naturaleza,area,cuenta_id,imputacion_default) select 'Mantenimiento eventual','eventual','predio',id,'estructura' from cuenta where codigo='GAS_PREDIO';
insert into cat_gasto (nombre,naturaleza,area,cuenta_id,imputacion_default) select 'Compras e insumos de predio','eventual','predio',id,'estructura' from cuenta where codigo='GAS_PREDIO';
insert into cat_gasto (nombre,naturaleza,area,cuenta_id,imputacion_default) select 'Equipamiento','inversion','predio',id,'estructura' from cuenta where codigo='GAS_PREDIO';

-- Plantillas de mail
insert into plantilla_mail (clave,asunto,cuerpo) values ('aviso_7dias','Tu cuota vence pronto · CAMPA','<p>Hola {{equipo}},</p>');
insert into plantilla_mail (clave,asunto,cuerpo) values ('reclamo_vencida','Cuota vencida · CAMPA','<p>Hola {{equipo}},</p>');
insert into plantilla_mail (clave,asunto,cuerpo) values ('reclamo_2','Segundo aviso · CAMPA','<p>Hola {{equipo}},</p>');
insert into plantilla_mail (clave,asunto,cuerpo) values ('recibo_pago','Recibo de pago · CAMPA','<p>Hola {{equipo}},</p>');