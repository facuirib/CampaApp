# Campa — Arquitectura

**Versión:** Draft 22 · agosto 2026 · cashflow con tres niveles de certeza (real / comprometido / estimado), anti-duplicación por estado, y §3.10 reemplazada
**Referencias:** `supabase/migrations/` (esquema ejecutable) · `CLAUDE.md` (reglas) · `docs/decisiones.md`
**Stack:** Next.js 15 (App Router + TypeScript) · Tailwind · Supabase (Postgres + Auth + RLS) · Vercel

**Alcance.** Campa es una herramienta de **gestión financiera** para la operación de un torneo de fútbol amateur. Reemplaza cinco planillas de Excel por una fuente única de datos.

**Lo que Campa no es.** No es un sistema contable. La contabilidad formal —balance, liquidación de IVA, amortizaciones fiscales— la hace un estudio externo. Campa incorpora los criterios contables que **afectan la lectura financiera** y descarta los que solo sirven para el balance.

La partida doble está por debajo de todo el sistema, pero como **garantía de consistencia**, no como producto: es lo que impide que dos pantallas muestren números distintos.


> **El historial de cambios entre drafts está al final**, en «Historial de
> drafts». Son catorce bloques que ocupaban las primeras 240 líneas de este
> archivo: quien abría el doc leía catorce changelogs antes de llegar al
> modelo. **No se borró nada** — se movió, porque explica por qué el modelo es
> como es y eso hace falta al cambiarlo, no al conocerlo.

## 1. Principios de diseño

**a. La Fecha es la unidad operativa central, no el mes.** Cada jornada (`Fecha 9 · Libre A · 14-jun`) es la unidad contra la que se cargan ingresos de equipos y egresos operativos. El mes es una vista derivada, no la unidad de trabajo.

**b. El ingreso se reconoce al cobrar (percibido puro).** El único evento que genera ingreso contable es el pago: `Caja` —efectivo, transferencia o valores a depositar— al debe, la cuenta de `Ingresos` que corresponda al haber. Las `cuota` **no generan ningún asiento**: son términos de pago —cronograma, base de la mora y del cashflow (§3.10)—, no hechos contables. No interviene `Deudores`: lo que un equipo debe no vive en el libro diario, vive en `cuota`. La cuota hereda de la línea del plan el concepto (inscripción / partidos), y de ahí se resuelve a qué cuenta de ingreso se imputa el cobro. **La deuda de un equipo es su mora**: cuotas vencidas e impagas — cifra operativa, para reclamar, no un saldo contable. **Asimetría deliberada:** esto vale para ingresos; los **gastos siguen por devengo**, con dos asientos (§3.3). Por eso, para ingresos el P&L y la caja muestran lo mismo, y para gastos siguen contando cosas distintas. *Reemplaza al devengo progresivo del Draft 11, que a su vez había reemplazado a la Opción A — las dos vueltas y su razonamiento están en §8.*

**c. Una sola fuente de verdad — dos dominios, una fuente en cada uno.** Ninguna pantalla calcula su propio número: toda cifra visible sale de una vista, nunca del front. De dónde sale esa vista depende de qué clase de número es.

**Lo contable —resultado, P&L, caja, saldos de cuenta— deriva de `asiento_linea`, sin excepción.** Es la regla más importante de la arquitectura: es lo que hace que el sistema no reproduzca el problema del Excel, donde cada planilla llegaba a un total distinto. Ningún número contable se calcula por fuera del diario, ni siquiera "solo para mostrar".

**Lo operativo —mora, cronograma de pagos, cartera por vencer, tasa de cobranza, cashflow proyectado— deriva de `cuota`.** Es planificación, no contabilidad: describe qué se acordó cobrar y cuándo, que es un hecho comercial. Con ingresos por percibido (principio b) la cuota no genera asiento, así que buscar esos números en el diario no sería más riguroso — sería buscarlos donde no están.

Esto no es una excepción al principio ni un permiso para calcular por fuera. **Cada dominio tiene una fuente y solo una, y no se cruzan:** un número contable jamás se deriva de `cuota`, y uno operativo jamás se reconstruye desde el diario. Lo que estaría mal —y es exactamente el problema del Excel— es que un mismo número tuviera dos orígenes posibles.

**d. El negocio es unificado; los predios son logística.** No hay rentabilidad por predio ni por categoría. Repartir costos compartidos exigiría un criterio arbitrario. Los predios se usan para arqueo de caja y organización operativa, no como centros de resultado.

**e. Terminología: Efectivo y Transferencia.** Nunca "declarable/no declarable", "blanco/negro" ni equivalentes, ni en UI ni en comunicación ni en nombres de tablas.

**f. La empresa es la entidad contable; los torneos son centros de resultado.** Todo asiento pertenece a un ejercicio; algunos además pertenecen a un torneo. Lo que no pertenece a ninguno es **estructura permanente** y se resta una sola vez del resultado de la empresa. Prorratearla entre torneos volvería a introducir números que nadie puede defender.

**g. El catálogo de gastos es infraestructura, no configuración cosmética.** Categoría obligatoria, concepto opcional (del catálogo o texto libre). Presupuesto y gasto real comparten categoría, y por eso el desvío se calcula solo. La categoría tiene **dos ejes**: naturaleza (cómo se carga y presupuesta) y área (a quién se imputa).

**h. La previsión distingue hechos de supuestos.** Comprometido (cuota impaga con vencimiento) y recurrente (gasto fijo mensual) son hechos. Estimado (proyección de presupuesto y calendario) es supuesto. Se muestran diferenciados. Que la cuota no genere asiento (principio b) no la vuelve un supuesto: el compromiso existe aunque no esté en el diario.

**i. El calendario es el motor de la previsión.** Suspender o mover una jornada recalcula el bloque estimado de esa fecha, sin tocar lo comprometido ni lo recurrente.

**j. Los compromisos de pago son más ciertos que los de cobro.** Un cheque emitido se debita sí o sí en su fecha; una cuota de equipo puede pagarse tarde. La proyección no aplica la misma tasa de cumplimiento a los dos lados.

**k. La contabilidad de Campa es de gestión, no fiscal.** Si el estudio amortiza un bien en 10 años por tabla fiscal pero en la cancha dura 5, en Campa se usan 5. Los dos sistemas son paralelos y no necesitan cuadrar entre sí.

---

## 2. Roles

**Construidos y activos** desde el 24/08. Son cuatro, y el rol vive en
`raw_app_meta_data.rol` de `auth.users` —o sea, en el JWT, escribible solo con
`service_role`—, no en una tabla. La base lo lee con `auth_rol()`.

| Rol | Alcance |
|---|---|
| `admin` | Todo. Los socios/dueños. |
| `operador` | El día a día: cobros, gastos, arqueos, cierre de períodos, torneos, tarifario. |
| `read-only` | Lee todo, no escribe nada. El perfil de control. |
| `bar` | Solo el circuito del bar, en las 11 tablas que ese circuito toca. |

**Las policies usan allowlist positiva, nunca denylist** —`auth_rol() = any
(array[...])`—, para que un typo deniegue en vez de permitir: con el rol
`'read-only'` y el typo `'readonly'`, un `rol <> 'readonly'` da `true` y deja
escribir. Un rol nulo también queda afuera.

**Lo que NO se puede separar por policy va adentro de la función.** Una policy
sobre una tabla no distingue *por qué* se llegó a ella, y tres operaciones
sensibles comparten función con operaciones que otros roles sí pueden hacer:

| Operación | Solo admin, por |
|---|---|
| Comprar / vender USD | policy — `usd_operacion.INSERT` |
| Anular un asiento suelto | guarda en `anular_asiento` (`p_via_circuito`) |
| Rechazar un cheque | guarda en `cambiar_estado_cheque` |

Falta la parte del front: esconder menús, botones y rutas por rol. Hoy la base
deniega, pero la pantalla todavía ofrece.

---

## 3. Modelo de datos

### 3.1 Núcleo contable

> **Nota de ejecución.** Los bloques SQL están ordenados por concepto, no por dependencia. Al crear el esquema, el orden correcto es: `ejercicio` → `predio` → `torneo` → `jornada` → `periodo` → `cuenta` → `tercero` → `asiento` → `asiento_linea` → resto. Alternativamente, crear las tablas sin FK y agregarlas después con `alter table ... add constraint`.


Es el cimiento. Todo lo demás escribe acá y lee de acá.

```sql
create table ejercicio (
  id            uuid primary key default gen_random_uuid(),
  anio          int not null unique,
  fecha_desde   date not null,
  fecha_hasta   date not null,
  estado        text not null default 'abierto'   -- abierto | cerrado
);

create table torneo (
  id            uuid primary key default gen_random_uuid(),
  ejercicio_id  uuid references ejercicio(id),    -- nullable — un ejercicio contiene varios torneos (Apertura+Clausura); un torneo puede sembrarse sin ejercicio asignado
  nombre        text not null,                    -- 'Apertura 2026'
  temporada     temporada not null,               -- apertura | clausura
  anio          smallint not null,                -- 2026
  activo        boolean not null default true,    -- el torneo en curso
  fecha_desde   date,
  fecha_hasta   date,
  cant_fechas   int  not null default 10,
  estado        text not null default 'planificado', -- planificado | en_curso | cerrado
  unique (temporada, anio)                        -- un solo Apertura por año
);

create table periodo (
  id            uuid primary key default gen_random_uuid(),
  ejercicio_id  uuid not null references ejercicio(id),
  anio          int not null,
  mes           int not null check (mes between 1 and 12),
  estado        text not null default 'abierto',  -- abierto | cerrado
  cerrado_por   uuid references auth.users(id),
  cerrado_at    timestamptz,
  unique (ejercicio_id, anio, mes)
);

create table cuenta (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,             -- '1.1.01', '5.1.01'
  nombre        text not null,
  tipo          text not null,                    -- activo|pasivo|patrimonio|ingreso|egreso|financiero
  imputable     boolean not null default true,
  padre_id      uuid references cuenta(id)
);

create table asiento (
  id            uuid primary key default gen_random_uuid(),
  periodo_id    uuid not null references periodo(id),
  torneo_id     uuid references torneo(id),       -- NULL = estructura permanente
  fecha         date not null,
  jornada_id    uuid references jornada(id),      -- opcional: ancla a una fecha del calendario
  predio_id     uuid references predio(id),
  origen        text not null,                    -- pago_equipo|gasto_fecha|gasto_fijo|bar|arqueo|sponsor|socio|usd|ajuste
  origen_id     uuid,                             -- id del registro que lo generó
  descripcion   text not null,
  anulado_por   uuid references asiento(id),
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);

create table asiento_linea (
  id            uuid primary key default gen_random_uuid(),
  asiento_id    uuid not null references asiento(id) on delete cascade,
  cuenta_id     uuid not null references cuenta(id),
  debe          numeric(16,2) not null default 0,
  haber         numeric(16,2) not null default 0,
  tercero_id    uuid references tercero(id),      -- equipo, sponsor o socio
  check (debe >= 0 and haber >= 0),
  check ((debe > 0 and haber = 0) or (haber > 0 and debe = 0))
);
```

**Ejercicio — nota de diseño.** El ejercicio se mantiene como columna vertebral contable (`periodo`, resultado y presupuesto dependen de él). Por decisión operativa actual no se cargan ejercicios con fechas fiscales manualmente; los cierres se hacen mensuales sobre año calendario derivados de la fecha del asiento. La creación formal de ejercicios con fechas se activa cuando el estudio contable externo lo requiera. Por eso `torneo.ejercicio_id` es nullable: un torneo puede vivir sin ejercicio asignado hasta entonces.

**Invariantes que deben forzarse en base, no en la app:**

```sql
-- Debe = Haber por asiento
create or replace function check_asiento_balanceado() returns trigger as $$
declare d numeric; h numeric;
begin
  select coalesce(sum(debe),0), coalesce(sum(haber),0) into d,h
  from asiento_linea where asiento_id = coalesce(new.asiento_id, old.asiento_id);
  if d <> h then
    raise exception 'Asiento % no balancea: debe=% haber=%', coalesce(new.asiento_id,old.asiento_id), d, h;
  end if;
  return null;
end $$ language plpgsql;

create constraint trigger trg_asiento_balanceado
  after insert or update or delete on asiento_linea
  deferrable initially deferred
  for each row execute function check_asiento_balanceado();

-- No se escribe sobre período cerrado
create or replace function check_periodo_abierto() returns trigger as $$
begin
  if (select estado from periodo where id = new.periodo_id) = 'cerrado' then
    raise exception 'El período está cerrado';
  end if;
  return new;
end $$ language plpgsql;

create trigger trg_periodo_abierto before insert or update on asiento
  for each row execute function check_periodo_abierto();
```

El asiento **nunca se borra ni se edita**: se anula con un contraasiento que apunta al original vía `anulado_por`. Es lo que hace auditable el sistema.

### 3.2 Ámbito: empresa vs. torneo

La distinción vive en una sola columna: `asiento.torneo_id`.

| `torneo_id` | Significado | Ejemplo |
|---|---|---|
| con valor | Imputable a ese torneo | Árbitros de la Fecha 9 |
| `NULL` | Estructura permanente | Alquiler de enero, sueldo administrativo |

`asiento.torneo_id` **sigue existiendo y sigue sirviendo** —para saber qué asiento pertenece a qué torneo, y para el drill-down de una jornada—. Lo que ya no existe es una vista que **parta el resultado** por esa columna.

> **`v_resultado_producto` y `v_comparador_torneos` se dropearon** con el rediseño de Resultados. Agrupaban por torneo con «Estructura permanente» como una fila más, y eso contradice el principio de negocio unificado (§1.d): no hay rentabilidad por torneo. `v_comparador_torneos` además multiplicaba los importes por la cantidad de equipos —factor 28— por un fan-out de join; no se arregló, se borró.

**El resultado se mira a nivel EMPRESA**, con cuatro vistas cuyo reparto responde a una regla: cada número que la pantalla muestra sale de una vista, **incluidas las filas de total**.

| Vista | Grano | Para qué |
|---|---|---|
| `v_pl_mensual` | año × mes × cuenta | La matriz de `/resultados`. Los 12 meses **generados**, con ceros donde no hubo movimiento |
| `v_pl_mensual_item` | + ítem | El desglose de cada cuenta de egreso |
| `v_pl_mensual_total` | año × mes | Las filas «Total ingresos», «Total egresos» y «Resultado» |
| `v_pl_kpi` | año | El encabezado. Suma `v_pl_mensual_total`, no el diario |

Tres cosas de `v_pl_mensual` que conviene saber antes de tocarla:

· **Incluye las cuentas de tipo `financiero`.** El signo se resuelve una sola vez, con un `case` sobre `tipo`: `debe − haber` para egreso, `haber − debe` para ingreso y financiero. De ahí en más el monto ya viene con el signo que suma al resultado.

· **Los 12 meses salen de `generate_series`, no de `periodo`.** Sólo existen los períodos que tuvieron movimiento, así que la matriz tendría columnas salteadas. Y el **año sale de `periodo.anio`, no de `ejercicio`**: hay un solo ejercicio cargado y no se crean más hasta que el estudio lo pida, así que por ahí el selector mostraría siempre lo mismo.

· **No filtra anulados**, según la regla 4: el asiento original y su contraasiento se compensan solos.

En `v_pl_mensual_item`, el ítem sale de `cat_gasto` para los gastos, del **tercero** para los sueldos de socios, y —para un contraasiento— del gasto del asiento anulado, **dos saltos**: `origen_id` de un `ajuste` apunta al asiento que anula, no al gasto. Sin ese rebote la anulación caería en «Sin categoría» y el desglose mostraría el gasto anulado como vigente.

**Regla:** la estructura permanente no se prorratea. Ni por cantidad de equipos, ni por meses, ni mitad y mitad. Se resta una sola vez del resultado de la empresa.

### 3.3 Catálogo de gastos — dos ejes

Sale de `gastos_campa.xlsx`: 34 categorías y 111 conceptos, remapeados a dos dimensiones independientes.

**Eje 1 · Naturaleza** — determina cómo se carga, se presupuesta y se proyecta al flujo:

| Naturaleza | Se ancla a | Presupuesto | Ejemplos |
|---|---|---|---|
| `por_fecha` | jornada + predio | según su unidad — ver abajo | Árbitros, veedores, ballboys, fotografía |
| `recurrente` | mes | monto mensual × meses | Alquileres, sueldos, EPEC |
| `eventual` | fecha calendario | monto anual por categoría | Mantenimiento, compras de predio |
| `inversion` | fecha + activo | monto + vida útil | Desmalezadora, arcos, heladera |

#### Las tres unidades del costo variable

No todos los gastos `por_fecha` escalan igual. Meterlos a todos en "× jornadas" era correcto mientras la jornada era la fecha N de un **género**; con jornadas por **serie** deja de serlo, y la distinción se vuelve obligatoria:

| Unidad | Escala con | De dónde sale el multiplicador | Ejemplos |
|---|---|---|---|
| **`por_partido`** | cada partido tiene los suyos | Σ sobre las jornadas no suspendidas de `equipos de la serie ÷ 2` | árbitros, veedores, ballboys |
| **`por_dia_cancha`** | el día de operación de un predio | `count(*) from dia_cancha` del torneo (§3.5) | fotografía, guardias, limpieza, estacionamiento |
| **`por_mes`** | el mes | meses del ejercicio | alquileres, sueldos |

`anual` y `unico` siguen como estaban: no escalan.

La diferencia entre las dos primeras es grande, no cosmética. Un sábado con 6 series jugando en un predio son **48 partidos** —48 arbitrajes— pero **un solo** servicio de fotografía.

**`por_jornada` sale del dominio.** No se conserva por compatibilidad. Era la unidad correcta bajo el modelo viejo y ahora es ambigua: "por jornada" no dice si se refiere al partido o al día. Dejarla disponible garantiza que alguien la elija y multiplique por 284.

**La unidad se hereda del catálogo; la línea puede sobrescribirla.**

| Dónde | Rol |
|---|---|
| `cat_gasto` / `concepto_gasto` | **default** — la unidad natural del concepto |
| `presupuesto_linea.unidad` | **override** — `null` = heredar; con valor = este caso es distinto |

Un arbitraje es por partido siempre; no es una decisión que deba tomarse de nuevo en cada línea de presupuesto. Sin default, cada línea vuelve a decidir algo ya decidido, y **basta una mal cargada para que el total se corra** sin que nada falle. El override existe porque el caso raro existe —un servicio que este torneo se contrata por día y el que viene por partido— y forzarlo a crear un concepto nuevo ensuciaría el catálogo.

**Clasificación inicial · las 16 categorías `por_fecha`**

Es punto de partida cargado como datos, no verdad de schema: se corrige con un `update`, sin migración.

| Unidad | # | Categorías |
|---|---|---|
| **`por_partido`** | 3 | Árbitros Femenino · Árbitros Masculino · Operativos *(todas de área `torneo`)* |
| **`por_dia_cancha`** | 8 | Coordinación · Media · Medicinal · Tribunal · Viáticos *(área `torneo`)* · Estacionamiento · Guardias · Limpieza *(área `predio`)* |
| **aparte** | 5 | Extras · Limpieza · Productos · Proveedores *(área `bar`)* · Administración *(área `administracion`)* |

Total 16 ✓ — `3 + 8 + 5`.

**Viáticos hereda del concepto que refleja.** La categoría espeja a otras —Ballboys, Veedores, Guardias, Estacionamiento, Limpieza— así que su unidad no es uniforme a nivel categoría: el viático de un ballboy escala como el ballboy. Se clasifica por **concepto**, no por categoría, y por eso la unidad vive también en `concepto_gasto` y no solo en `cat_gasto`.

**Dos categorías se llaman "Limpieza"** y son filas distintas: una de área `predio` y otra de área `bar`. Conviven bajo `unique (area, nombre)` y se clasifican distinto. Al cargar la clasificación hay que discriminar por área o se pisa una con la otra.

**El bar no escala con el torneo.** No con partidos y no con días de cancha: escala con **consumo**. Coca, hielo, descartables — un sábado de mucha venta cuesta más que uno de poca, y la cantidad de partidos no lo predice. Meterlo en cualquiera de las dos unidades de torneo daría un número con forma de presupuesto y sin relación con la realidad. Queda fuera de las unidades variables hasta que se defina su tratamiento propio. Lo mismo Administración, que es estructura permanente (§3.2) y no se prorratea entre torneos.

**Eje 2 · Área** — determina a quién se imputa: `torneo` · `predio` · `bar` · `administracion`.

**Por qué dos ejes y no uno.** El modelo anterior usaba `grupo ∈ {fecha, recurrente, bar}`, que mezclaba temporalidad con área. El sueldo del encargado de bar es recurrente y de área bar; el hielo de la jornada es por fecha y de área bar; una heladera es inversión y de área bar. Los tres caían en `grupo='bar'` y no se podían presupuestar con la lógica correcta.

Ver `001_schema.sql` para el DDL de `cat_gasto`. El **contenido** del catálogo —las 32 categorías y sus 100 conceptos— lo siembra `20260816162556_siembra_estructura.sql`, junto con el plan de cuentas: una base limpia queda con el catálogo completo.

> *Esta línea citaba un `campa_schema.sql` que **no existe** en el repo, y después dijo que el catálogo vivía repartido entre `seed.sql` y las migraciones. Lo primero se corrigió al reordenar el plan de cuentas; lo segundo, al cerrar la reproducibilidad — el catálogo ya no está partido.*

#### El plan de cuentas, después del reordenamiento

**28 cuentas**, en un árbol de **un solo nivel**: `cuenta.padre_id` existe y no se usa —ninguna fila lo tiene— y todas son `imputable`. La jerarquía de egresos no vive en `cuenta` sino en tablas satélite: `cuenta → cat_gasto → concepto_gasto`.

| Cuenta | Categorías (`cat_gasto`) |
|---|---|
| `GAS_FECHA` | 9 — Arbitros Femenino · Arbitros Masculino · Coordinación · Media · Medicinal · Operativos · **Otros Gastos Fecha** · Tribunal · Viáticos |
| `GAS_PREDIO` | 10 — **Alquileres** · Compras e insumos de predio · Equipamiento · Estacionamiento · Guardias · Limpieza · **Mantenimiento Predio** · **Nafta** · Seguridad · Servicios |
| `GAS_BAR` | 8 — Activaciones · Encargado de bar · **Extras Bar** · Limpieza · Personal · Productos · Proveedores · Sistema y equipamiento |
| `GAS_SUELDOS` | 3 — Administración · Sueldos administrativos · **Sueldos Predio** |
| `GAS_IMPUESTOS` | 2 — **Impositivos** · **Planes de Pago** |
| `GAS_SOCIOS` | **0** — su ítem es el socio, vía `tercero_id` (ver `decisiones.md`) |
| `GAS_AMORT` | **0** — espera el módulo de Activos |

*En negrita, lo que cambió en el reordenamiento.*

**Ingresos: 4 cuentas, sin segundo nivel.** `ING_PARTIDOS`, `ING_INSCRIPCIONES`, `ING_BAR`, `ING_SPONSORS`. Es una decisión, no un pendiente: con percibido puro no se distinguen sub-conceptos de ingreso, así que el expandible del P&L existe sólo en egresos.

**Financiero: 2 cuentas** —`FIN_DIF_CAMBIO`, `FIN_RENDIMIENTOS`— que **hoy quedan fuera del P&L** porque las vistas de resultado filtran `tipo in ('ingreso','egreso')`. Entran en el rediseño de Resultados.

**`DEUDORES` ya no existe.** Con percibido puro no hay devengo de ingresos: lo que un equipo debe vive en `cuota`, no en el diario.

**Normalizaciones aplicadas al importar:**

| En el Excel | En el catálogo | Motivo |
|---|---|---|
| `Augusto` | `Encargado de bar` | Era una persona donde iba una categoría |
| `Risata` | `Proveedores` | Ídem |
| `Sistema` | `Sistema y equipamiento` | Ambiguo |

**Categorías agregadas** (no existían en el Excel): `Mantenimiento eventual`, `Compras e insumos de predio`, `Equipamiento`.

**Carga de gasto:** categoría obligatoria; concepto opcional —del catálogo o texto libre—. Los cargados libres se marcan en la UI para poder promoverlos al catálogo si se repiten.

**Un gasto son dos asientos:**

| Momento | Debe | Haber |
|---|---|---|
| Cargar (devengo) | `Gasto` | `Proveedores a pagar` |
| Pagar | `Proveedores a pagar` | `Caja` |

Separarlos permite que el P&L y la caja cuenten cosas distintas sin contradecirse. **Esto vale para gastos y sigue vigente**: es la mitad devengada del modelo. Los ingresos van por el camino opuesto —se reconocen recién al cobrar (principio b)—, así que la distinción devengado/pagado aplica a esta tabla y no a los ingresos.

**Coherencia forzada en base.** El trigger `check_gasto_coherente` valida que la naturaleza y el anclaje sean consistentes: un gasto `por_fecha` exige jornada, uno `recurrente` no puede tener torneo, uno `inversion` exige activo.

#### Lo que se lee

| Vista | Grano | Para qué |
|---|---|---|
| `v_gasto_detalle` | el gasto | Un gasto por fila: categoría, estado, **la jornada a la que pertenece**, **quién lo pagó y de qué caja** |
| `v_gasto_kpi` | año · año×mes | Los KPIs y el filtro de período de `/gastos` |
| `v_gasto_naturaleza_mes` | año×mes×naturaleza | Las cuatro tarjetas y el gráfico por tipo |
| `v_gasto_categoria_mes` | + categoría | El gráfico por categoría |

**`v_gasto_kpi` devuelve la fila del año Y la de cada mes**, con `grouping sets`: `mes is null` es el año entero. La pantalla **elige** la fila según el filtro, en vez de sumar meses en el cliente.

**Las tres de totales excluyen los anulados; `v_gasto_detalle` no.** Un gasto anulado no puede sumar al total, pero tiene que seguir viéndose en la lista con su badge — esconderlo sería reescribir la historia (regla 4).

**El estado es binario: `pagado` o `devengado`** (más `anulado`). `gasto.pagado_at` es un timestamp único, así que **no existe «parcial»** — a diferencia de las cuotas de equipo, que sí tienen `pago_imputacion`. Un cuarto estado sería cambio de modelo; está encolado en `coordinacion.md`.

**`caja_pago` usa `string_agg`, no `limit 1`:** hoy un pago sale siempre de una caja, pero si algún día saliera de dos, la vista lo dice en vez de mostrar una como si fuera todo.

### 3.4 Terceros y cuentas corrientes

Equipos, sponsors y socios comparten la misma mecánica: débitos, créditos, saldo. Se modelan como un solo tipo con discriminante.

#### Estructura del torneo · categoría y serie

*Construido. Migración `20260730165451_estructura_categoria_serie.sql`.*

Capa de catálogos **por torneo**, igual que el tarifario: cada torneo tiene la suya y se clona del anterior al crearlo.

```
torneo → categoria → serie → equipo_torneo (la ficha)
```

**`categoria`** es la división que corre el equipo: Libre, +30, +40, Femenino, Flex.

**El género es atributo de la categoría** — no del equipo ni del tercero. Libre, +30 y +40 son masculinas; Femenino y Flex, femeninas. Un club que presenta equipo en Libre y otro en Femenino tiene dos fichas, cada una en su categoría, y el género de cada una sale de ahí. Ponerlo en `tercero` sería incorrecto: el mismo club juega en ambos.

**`serie`** es el nivel dentro de la categoría: A, B, C. **Cuelga de la categoría, no del torneo**: la "Serie A de Libre" y la "Serie A de +30" son filas distintas y no comparables. Las series crecen con el tiempo —una categoría que arranca con A y B puede sumar C—, por eso son datos y no un enum.

```sql
create table categoria (
  id        uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references torneo(id) on delete cascade,
  nombre    text not null,              -- 'Libre', '+30', '+40', 'Femenino', 'Flex'
  genero    genero not null,            -- lo heredan las fichas, subiendo desde la serie
  orden     smallint,
  unique (torneo_id, nombre)
);

create table serie (
  id           uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references categoria(id) on delete cascade,
  nombre       text not null,           -- 'A', 'B', 'C'
  orden        smallint,
  unique (categoria_id, nombre)
);
```

**Un equipo está en exactamente una categoría y una serie.** La ficha apunta a la **serie**, que es el nivel más específico; categoría y género se derivan subiendo por las FKs. No se duplican en `equipo_torneo`: si estuvieran, podrían contradecir a la serie.

**Se clonan al crear el torneo**, junto con el padrón y el tarifario (§5). El torneo nuevo arranca con la estructura del anterior y se ajusta: se agregan series, se mueven equipos.

**Ascensos y descensos no se modelan como evento.** Un equipo que sube de B a A en el torneo siguiente simplemente tiene otra ficha, en otro torneo, apuntando a otra serie. El historial queda por acumulación: se reconstruye el recorrido de un equipo leyendo sus `equipo_torneo` ordenados por torneo. No hace falta tabla de movimientos ni registro de ascensos.

> **Ojo con la palabra "categoría".** En este documento nombra dos cosas sin relación: la **categoría del torneo** (esta sección, la división que corre el equipo) y la **categoría de gasto** (`cat_gasto`, §3.3, el eje naturaleza/área). El prefijo de tabla las distingue; en prosa hay que leer el contexto.

#### Terceros, fichas y cuotas

```sql
create table tercero (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null,          -- equipo | sponsor | socio
  nombre      text not null,
  email       text,                   -- para reclamos y recibos
  contacto    text,
  activo      boolean not null default true
);

create table equipo_torneo (              -- la "ficha" del equipo en un torneo
  id             uuid primary key default gen_random_uuid(),
  tercero_id     uuid not null references tercero(id),
  torneo_id      uuid not null references torneo(id),
  serie_id       uuid not null references serie(id),  -- categoría y género se derivan subiendo
  plan_inscripcion_id uuid not null references plan_tarifa(id),  -- opción elegida, concepto='inscripcion'
  plan_partidos_id    uuid not null references plan_tarifa(id),  -- opción elegida, concepto='partidos'
  medio_previsto medio_pago not null,           -- congela precio_efectivo o precio_transferencia
  responsable_id uuid references auth.users(id),
  total_plan     numeric(16,2) not null default 0,  -- suma de las cuotas (trigger); NO es la deuda
  unique (tercero_id, torneo_id)
);

create table cuota (
  id                   uuid primary key default gen_random_uuid(),
  equipo_torneo_id     uuid not null references equipo_torneo(id) on delete cascade,
  numero               int not null,
  vence_at             date not null,          -- caché sincronizada (decisión 50)
  monto                numeric(16,2) not null,
  pagado_at            date,                   -- derivado por trigger (decisión 26)
  plan_tarifa_linea_id uuid not null references plan_tarifa_linea(id),  -- decisión 29
  jornada_id           uuid references jornada(id),  -- solo las de liga (decisión 39)
  unique (equipo_torneo_id, numero)
);
```

**`total_plan` no es la deuda.** Es la suma de las cuotas, mantenida por trigger (`sync_total_plan`, decisión 27). Mide el tamaño del plan de pago, no lo que el equipo debe hoy. **La deuda es la mora**: cuotas con `vence_at < current_date` y sin cancelar. Es el número que se reclama.

> *Se llamaba `total_facturado`. Bajo percibido puro no se factura nada al armar la ficha, así que el nombre heredado obligaba a aclarar en cada mención que no era ni deuda ni facturación — un nombre que necesita nota al pie para no engañar es un nombre mal puesto. Renombrado de raíz —columna, función, trigger y vista— en `20260805110059_total_plan.sql`.*

**`equipo_torneo.asiento_id` quedó sin uso.** Nació para apuntar al asiento del devengo total. Sin devengo de ingresos no hay ningún asiento que colgar de la ficha: el asiento del cobro pertenece a `pago`, que ya tiene su propia columna `asiento_id`. Nada la escribe hoy, así que no hay dato que migrar.

**La cuota lleva el concepto.** Como el cobro se imputa a una cuenta de ingreso concreta (`ING_INSCRIPCIONES` o `ING_PARTIDOS`), la cuota tiene que saber de qué concepto viene. Lo hereda de la línea del plan de tarifa que la originó (§3.18).

**Estado de cobranza — calculado, no almacenado:**

```sql
create or replace view v_estado_cuota as
select c.id, c.equipo_torneo_id, c.numero, c.vence_at, c.monto, c.pagado_at,
  coalesce(i.imputado, 0)            as pagado,
  c.monto - coalesce(i.imputado, 0)  as saldo,
  j.id is not null and j.estado = 'suspendida' as jornada_suspendida,
  case
    when c.pagado_at is not null                                  then 'pagada'
    when j.estado = 'suspendida'                                  then 'suspendida'
    when coalesce(i.imputado,0) > 0 and c.vence_at < current_date  then 'parcial_vencida'
    when coalesce(i.imputado,0) > 0                               then 'parcial'
    when c.vence_at < current_date                                then 'vencida'
    when c.vence_at <= current_date + 7                           then 'por_vencer'
    else                                                               'al_dia'
  end                                as estado,
  et.torneo_id, t.nombre             as torneo
from cuota c
join equipo_torneo et on et.id = c.equipo_torneo_id
join torneo t         on t.id  = et.torneo_id
left join jornada j   on j.id  = c.jornada_id
left join (select cuota_id, sum(monto) as imputado
             from pago_imputacion group by cuota_id) i on i.cuota_id = c.id;
```

No se usan tramos de antigüedad 30/60/90: el vencimiento lo define la modalidad de pago del equipo, así que la antigüedad genérica no significa nada acá.

Tres cosas que el boceto original de este bloque no tenía y la vista sí:

· **Los estados son siete, no tres.** Aparecieron `parcial` y `parcial_vencida` cuando se admitió imputación parcial, y `suspendida` con la gestión de jornadas (decisión 51): una cuota de un partido que no se jugó no vence.

· **`pagado` y `saldo`**, derivados de `pago_imputacion`. Sin ellos, "cuánto falta de esta cuota" había que calcularlo afuera.

· **`torneo_id` y `torneo`** (migración `20260812114422`). Era la base de toda la cobranza y no sabía de qué torneo era la cuota: había que joinear `equipo_torneo` para averiguarlo. Aditivo — las dos van al final, que es lo único que `create or replace view` permite, y su único consumidor SQL (`v_cashflow_comprometido`) selecciona por nombre.

#### De línea del tarifario a cuota · B0

*Construido: `crear_equipo_torneo()`, migración `20260731070827`, reescrita para jornada-por-serie en `20260801121708`. Es una de las puertas de CLAUDE.md.*

Armar la ficha genera todas sus cuotas, traduciendo las líneas de las dos opciones elegidas (`plan_inscripcion_id` y `plan_partidos_id`).

**El motor de generación mira la `regla` de la línea, no el concepto.** Es el principio que ordena toda la traducción:

| `regla` de la línea | `es_playoff` | Genera | Vencimiento |
|---|---|---|---|
| `fecha_fija` | — | **1 cuota por línea** | Fecha propia de la línea (`hito_jornada_id` / `fecha_referencia`), **independiente del calendario de juego** |
| `por_partido` | `false` | **1 cuota por fecha** del rango `fecha_desde`..`fecha_hasta` — 10 fechas, 10 cuotas del arancel unitario | **Atado a la jornada**: cada cuota vence con su fecha del calendario y **se mueve si la jornada se reprograma** |
| `bloque_adelantado` | — | **1 cuota** con el total del bloque (el importe cargado ya es el total, no unitario) | Fecha del bloque |
| `por_partido` | `true` | **ninguna** | — |

**Una línea `fecha_fija` de partidos se comporta igual que una de inscripción.** Las tres cuotas de "Partidos · Opción 2 · Cuotas" son `fecha_fija`: vencen en su fecha propia y **no** se atan a ninguna jornada, aunque sean de partidos. El vencimiento atado a jornada aplica **solo** a las líneas `por_partido`.

**El concepto no participa de la generación.** `inscripcion` / `partidos` se usa después, y para otra cosa: rutear el asiento del cobro a su cuenta de ingreso (decisión 31). Son dos responsabilidades separadas, y confundirlas lleva a atar al calendario cuotas que tienen fecha propia.

**Playoffs no generan cuota al armar la ficha.** Si el equipo clasifica no se sabe, y `cantidad_esperada = 3` es un máximo teórico —cuartos, semi, final—, no un hecho. Se cobran aparte cuando el equipo clasifica.

**Los dos orígenes de vencimiento**, que es lo que conecta cobranza con el calendario:

| Origen | Qué lo fija | Se mueve si… |
|---|---|---|
| **Fecha propia** (`fecha_fija`, `bloque_adelantado`) | la línea del tarifario | nunca: es compromiso de calendario, independiente del juego |
| **Jornada** (`por_partido` de liga) | `jornada.fecha` | se reprograma la jornada |

Mover una jornada recalcula el cashflow proyectado **y** los vencimientos de las cuotas de equipo, desde la misma fuente. Es el principio (i) —el calendario es el motor de la previsión— alcanzando también a la cobranza.

*Consecuencia de modelo:* una cuota `por_partido` tiene que saber de qué jornada depende, así que `cuota` gana una FK a `jornada`, nullable —las de fecha propia no la usan—. Cómo se mantiene `vence_at` sincronizado al reprogramarse la jornada se resuelve al implementar; hay precedente de triggers de sincronización (`sync_total_plan`, `sync_cuota_pagada`).

**El monto se copia, y desde ahí la cuota es autónoma.** Cada línea tiene `precio_efectivo` y `precio_transferencia`; la cuota tiene un solo `monto`. Al generarla se copia el que corresponde al `medio_previsto` de la ficha, y ahí termina el vínculo de importe: `cuota.monto` es un valor propio, no una lectura del tarifario.

**El tarifario es el molde; la cuota, la pieza ya fundida.** Tres consecuencias, todas deliberadas:

- **Editar el tarifario no recalcula cuotas ya generadas.** Corregir un precio afecta solo a las fichas que se armen después. Las cuotas vivas no se mueven — un equipo no se entera de que le cambiaron el precio a mitad de torneo.
- **Que el equipo pague por otro medio no reabre el importe.** El precio se fijó al armar la ficha; el medio de pago real, al cobrar, es otra cosa.
- **Una cuota puntual se puede ajustar a mano.** Es caso raro y no lleva marca especial: con editar `monto` alcanza. No hace falta ni un flag de "ajustada" ni una tabla de excepciones — el monto de la cuota ya es la fuente de verdad de lo que ese equipo debe pagar.

Esto es lo que permite que `total_plan` —suma de las cuotas por trigger— siga siendo correcto después de un ajuste manual: se recalcula solo, sin consultar el tarifario.

**La autonomía es parcial, y depende del tipo de cuota** *(refina lo anterior, no lo contradice)*. El **monto** se copia siempre. El **vencimiento** no:

| Tipo de cuota | Monto | Vencimiento | Autonomía |
|---|---|---|---|
| **Fija** — inscripción, bloque adelantado | copiado | copiado, `vence_at` propio | **total** |
| **De liga** — `por_partido` | copiado | **derivado de `jornada.fecha`** | **parcial** |

Las dos tienen naturaleza distinta. La inscripción vence **un día administrativo fijo**: se acordó esa fecha y no depende de que se juegue nada. La de liga vence **cuando se juega esa fecha** — y esa fecha puede moverse o suspenderse.

Por eso la cuota de liga guarda `jornada_id` y lee el vencimiento de ahí, en vivo. Mover la jornada mueve su vencimiento sin tocar la cuota; suspenderla la saca del circuito de cobro (§3.5). Es la decisión 39 funcionando de verdad, no solo declarada.

**Nota de nomenclatura — tres cosas parecidas que no se mezclan.**

| Tabla | Qué es | Sentido | Contraparte |
|---|---|---|---|
| `cuota` | Cronograma de pago de un equipo en un torneo | **cobrar** | el equipo |
| `compromiso` + `plan_pago` | Moratoria de Campa con un organismo | **pagar** | municipalidad, rentas |
| `plan_tarifa` | Catálogo de precios del torneo (§3.18) | — | ninguna: es plantilla |

Se parecen de nombre y no tienen relación. `generar_cuotas_plan()` genera **compromisos**, no cuotas, pese a cómo se llama; y `compromiso.tipo` admite el valor `'cuota_plan'`, que tampoco es una `cuota`.

**El modelo ya lo impide por estructura, no por convención.** `cuota.equipo_torneo_id` es `NOT NULL` con FK a `equipo_torneo`: toda fila de `cuota` cuelga de la ficha de un equipo en un torneo. Una moratoria no tiene ficha —`plan_pago` ni siquiera tiene `tercero_id`, tiene `organismo`—, así que no puede entrar. Y las vistas de cobranza llegan a `cuota` únicamente a través de `equipo_torneo`, con lo cual tampoco podrían contarla si estuviera.

No hay nada que refactorizar. Esta nota existe para que el parecido de los nombres no haga dudar de una separación que ya es correcta.

**El asiento lo dispara el pago, y nada más.** Armar la ficha, crear las cuotas y vencer una cuota no escriben en el libro diario. Quien implemente B0 (`crear_equipo_torneo`) no emite ningún asiento: la función arma la ficha y su cronograma, y ahí termina su responsabilidad contable.

#### El circuito de cobro — las cinco decisiones, ya construidas

*Las cinco están implementadas.* Se dejan escritas con su razón porque el
razonamiento sigue valiendo: es lo que hay que releer antes de cambiar algo del
circuito, no una lista de trabajo pendiente.

**1 · `cuota.plan_tarifa_linea_id`, FK `NOT NULL`.** Toda cuota de equipo nace de una línea del tarifario y hereda de ella el concepto (`inscripcion` / `partidos`), el precio y la regla de vencimiento. Es lo que resuelve a qué cuenta de ingreso se imputa el cobro.

`NOT NULL`, no opcional: **no existen cuotas de equipo sin tarifario**. Las cuotas de moratoria —que sí carecen de él— no viven en `cuota` sino en `compromiso` (ver la nota de nomenclatura al final de la sección), así que el caso que justificaría una FK nullable no existe.

Se prefiere la FK a copiar el enum dentro de `cuota`: mantiene fuente única y da acceso también al precio y a la regla, no solo al concepto.

**2 · `registrar_cobro()` atómica.** Una sola función registra el pago, imputa y asienta, en una transacción. El asiento **no** se cablea dentro de `imputar_pago()`, que hoy recibe un pago ya insertado: eso dejaría el registro y el asiento en dos pasos separables, y si el segundo falla queda plata registrada sin movimiento en el diario. `registrar_cobro()` reutiliza `imputar_pago()` tal como está, sin modificarla.

**3 · El asiento se deriva de la imputación**, no del pago en bruto. Cada imputación aporta una línea al haber, ruteada por el concepto de su cuota:

| Concepto de la cuota | Cuenta al haber |
|---|---|
| `inscripcion` | `ING_INSCRIPCIONES` |
| `partidos` | `ING_PARTIDOS` |

El debe es una sola línea, por el total del pago, en la caja del medio:

| `medio_pago` | Cuenta al debe |
|---|---|
| `efectivo` | `CAJA_EFECTIVO` — exige `predio_id` (principio: el arqueo es por predio) |
| `transferencia` | `CAJA_TRANSFERENCIA` |
| `cheque` | `VALORES_A_DEPOSITAR` |

Un pago repartido entre cuotas de conceptos distintos produce **un asiento con varias líneas al haber**, no varios asientos.

**4 · El excedente se imputa a la cuota siguiente.** Si un equipo paga más que la cuota corriente, el excedente reduce la próxima: paga 520 sobre una cuota de 500 y la siguiente baja 20. **No es un anticipo: es imputación normal**, resuelta por `imputar_pago()` tal como ya existe. La plata siempre tiene concepto —el de la cuota a la que se aplica—, y de ahí sale su cuenta de ingreso (decisión 3).

Por eso el anticipo prácticamente no ocurre: el excedente se absorbe en el cronograma. Un sobrante sin concepto solo aparecería si un pago excediera el total de **todas** las cuotas del equipo. Para ese borde: `ING_INSCRIPCIONES`, **por convención explícita para un caso improbable, no como mecanismo principal**. Si empezara a aparecer seguido, la regla está mal y hay que revisarla, no ampliarla. En ese caso raro el ingreso se reconoce al entrar, y aplicar el anticipo después **no genera asiento** —ya se reconoció—; `anticipo` y `anticipo_uso` siguen llevando el seguimiento operativo del saldo a favor.

*Dependencia de implementación.* La regla exige que `imputar_pago()` pueda imputar a cuotas **no vencidas**: cuando el excedente baja la cuota siguiente, esa cuota normalmente todavía no venció. Hoy la función no filtra por vencimiento, pero hay que confirmarlo contra el resto del circuito y ajustar al construir `registrar_cobro()`.

**5 · Orden de construcción: estructura → ficha → cobro.** *(Los tres bloques están construidos; queda como registro de por qué ese orden.)*

| # | Bloque | Qué incluye |
|---|---|---|
| **a** | **Catálogos de estructura** | `categoria` y `serie` por torneo, más el clonado al crear un torneo nuevo (§5) |
| **b** | **Ficha · B0 `crear_equipo_torneo`** | FK `cuota → plan_tarifa_linea` (decisión 1), generación de cuotas según la regla de cada línea, precio congelado por `medio_previsto` |
| **c** | **Cobro · `registrar_cobro()`** | pago + imputación + asiento |

El orden no es preferencia: cada bloque necesita al anterior. Sin `serie` la ficha no tiene a qué apuntar ni de dónde derivar el género, y sin género no se encuentra el tarifario. Sin fichas ni cuotas no hay nada que cobrar. Y la FK de la decisión 1 tiene que existir **antes** de que se escriba la primera cuota: agregarla después obligaría a reconstruir a mano de qué línea del tarifario salió cada una.

### 3.5 Calendario del torneo · `jornada` (capa transaccional, motor de cashflow)

Define qué día se juega cada fecha del torneo. Es el motor del cashflow: mover o suspender una jornada recalcula ingresos y costos de esa fecha; los costos fijos mensuales no se tocan.

```sql
create table predio (
  id      uuid primary key default gen_random_uuid(),
  codigo  text not null unique,        -- TIR | AEP
  nombre  text not null,
  activo  boolean not null default true
);

create table jornada (
  id                uuid primary key default gen_random_uuid(),
  serie_id          uuid not null references serie(id),  -- género y torneo se derivan subiendo
  numero            smallint,                      -- fecha de liga (null en playoff)
  instancia         text references formato_instancia(nombre),  -- solo playoff (pieza 6)
  es_playoff        boolean not null default false,
  fecha             date,                          -- null hasta programar
  estado            text not null default 'programada', -- programada | jugada | suspendida | reprogramada
  reprograma_a      uuid references jornada(id),   -- rastro de reprogramación
  cantidad_esperada smallint,                      -- base de estimación de ingreso
  cantidad_partidos smallint,                      -- solo playoff: es dato (decisión 67)
  unique (serie_id, numero),                       -- identidad de liga: fecha × serie
  unique (serie_id, instancia),                    -- identidad de playoff (pieza 6)
  check (
    (es_playoff and instancia is not null and numero is null)
    or (not es_playoff and numero is not null and instancia is null)
  ),
  check (es_playoff = (cantidad_partidos is not null))
);
```

*Construido* — migración `20260801121708_jornada_por_serie.sql`, con las 284 jornadas del Clausura sembradas.

**La jornada cuelga de la serie, no del género.** La identidad es `(serie_id, numero)`. El género y el torneo se derivan subiendo `serie → categoria`, el mismo patrón que la ficha (decisión 36): no se duplican, porque duplicarlos permitiría que contradigan a la serie.

**Por qué cambió.** El modelo anterior tenía identidad `(torneo_id, genero, numero)`: una jornada *era* la fecha N de un género, igual para todas las series de ese género — 28 jornadas por torneo. Pero **el calendario real es por serie**: distintas series del mismo género juegan la misma fecha en días distintos. Van casi siempre sincronizadas y se desfasan en fechas puntuales. Libre A juega su fecha 3 el 15/8 y +35 B la juega el 29/8; el modelo por género no puede representarlo, colapsa fechas que en la realidad difieren.

Consecuencia práctica: la cuota de liga de un equipo (decisión 39, vencimiento atado a la jornada) se ataba a una jornada genérica de género, con fecha aproximada. Ahora se ata a **la jornada real que ese equipo juega**, con su fecha correcta.

**Clausura 2026: 284 jornadas** — 12 series masculinas × 15 fechas + 8 femeninas × 13.

**La PK no cambia.** Sigue siendo `id` (uuid), así que las siete FKs que apuntan a `jornada.id` —`asiento`, `pago`, `gasto`, `arqueo`, `cuota`, `plan_tarifa_linea.hito_jornada_id` y el `reprograma_a` de la propia tabla— **no se tocan**. Lo que cambia es la identidad *natural* y la columna: sale `genero`, entra `serie_id`.

#### Fecha de calendario vs. jornada

Distinción central del modelo nuevo, y la que ordena todo lo demás:

| | Qué es | Cuántas en el Clausura |
|---|---|---|
| **Fecha** | un día concreto (sáb 8/8/2026). Ese día juegan muchas series | **29** |
| **Jornada** | la fecha N de **una** serie | **284** |

Una fecha agrupa muchas jornadas. Y de ahí emerge una entidad natural que antes no existía: **`(fecha, predio)` = el día de operación de un predio**. De ella cuelgan el arqueo y los costos por día de cancha — es la tabla `dia_cancha`, abajo.

**Cantidad de partidos por jornada: se deriva, no se carga.** Es `equipos de la serie / 2` — 16 equipos dan 8 partidos, 14 dan 7. Sin excepciones conocidas. Es la base de los costos por partido.

**Estado y reprogramación.** `estado` (programada/jugada/suspendida/reprogramada) + `reprograma_a` (rastro de la reprogramación). Suspender una jornada la saca de la proyección y del presupuesto de esa semana; reprogramar mueve el vencimiento atado. Es el punto donde el calendario deja de ser informativo y pasa a ser el motor de la previsión.

**Playoffs: también por serie.** La final de Libre A y la de Libre B son jornadas distintas, coherente con la liga. Misma tabla, flag `es_playoff`, campo `instancia` en lugar de `numero`. No se autogeneran —cantidad y fecha se desconocen hasta terminar la liga— y no están en el CSV de calendario validado. Detalle completo abajo.

**Estimación de ingreso automática.** Cada jornada proyecta ingreso estimado = arancel del tarifario (por género + regla) × `cantidad_esperada`. Vale igual para liga no jugada y para playoffs. El estimado se reemplaza por lo comprometido cuando se arman las fichas. Coherente con el principio (c) y con la proyección de caja por niveles de certeza (§3.16).

**Grilla.** `generar_grilla_liga()` pasa de sembrar 28 filas fecha × género a cargar las **284 desde el calendario validado por serie** (`supabase/seeds/clausura_2026_04_calendario.csv`). Sus parámetros `p_fechas_masc` / `p_fechas_fem` dejan de tener sentido: cada serie tiene su propia cantidad de fechas y sus propios días.

**Puente con el tarifario.** El placeholder `hito_calendario` (texto) fue reemplazado por el FK real `plan_tarifa_linea.hito_jornada_id → jornada(id)`. Cada línea `fecha_fija` apunta a la jornada que define su vencimiento; reprogramar la jornada recalcula el vencimiento.

#### `dia_cancha` · el día de operación de un predio

*Construido — migración `20260802075345_dia_cancha.sql`, con los 58 días del Clausura sembrados.*

```sql
create table dia_cancha (
  id        uuid primary key default gen_random_uuid(),
  fecha     date not null,
  predio_id uuid not null references predio(id),
  unique (fecha, predio_id)        -- identidad natural
);
```

**Por qué es una tabla y no un `select distinct`.** La entidad se nombró en el Draft 15 pero no existía en ninguna parte: `jornada` **no tiene predio** —una serie juega su fecha N, el modelo no dice dónde— y las únicas tablas con `fecha` *y* `predio_id` son de movimiento: `asiento`, `gasto`, `pago`. Derivarla de ahí sería circular: **para presupuestar los días de cancha habría que mirar los gastos ya cargados**, que es exactamente lo que todavía no pasó. El día de operación es un hecho del calendario, anterior al primer gasto.

**El torneo se deriva, no se guarda.** Mismo criterio que `jornada` (decisión 36): sale de las jornadas que se juegan esa fecha. Guardarlo permitiría que contradiga al calendario, y obligaría a un trigger de coherencia para impedirlo.

**Es compartida, y ese es el punto.** El presupuesto la **cuenta** —multiplicador de las líneas `por_dia_cancha` (§3.3)—; el arqueo **cuelga** de ella (§3.6). Son los dos usos que el Draft 15 había identificado por separado, y comparten la misma definición de "día de operación de un predio". Dos definiciones paralelas se desincronizarían: el presupuesto contando 58 días y el arqueo esperando 54.

**Un día de cancha puede no tener jornada.** El predio opera con el bar abierto, o con un evento, y no se juega. `crear_dia_cancha` **no exige jornada**: si la exigiera, la caja de esos días se quedaría sin dónde colgar, y el arqueo es justamente el otro consumidor de la tabla.

**Dos consumidores, dos lentes.** Comparten la tabla y la miran distinto, deliberadamente:

| | Qué mira | Por qué |
|---|---|---|
| **Arqueo** (§3.6) | la **tabla**, todas las filas | si hubo caja ese día en ese predio hay que contarla, haya habido fútbol o no |
| **Presupuesto** (§3.3) | la vista **`v_dia_cancha_torneo`**, que hace *inner join* contra `jornada` | un día de solo bar no lleva fotógrafo ni árbitros; contarlo inflaría el presupuesto con un día que el torneo no jugó |

La distinción entre "día de operación" y "día de torneo" es **una lente de lectura, no una restricción de escritura**. Ponerla en la escritura obligaría a elegir una de las dos y romper al otro consumidor. Es el mismo criterio de fuente única de §1.c: una sola tabla, y cada dominio la lee como le corresponde.

Las jornadas suspendidas no cuentan para la lente de presupuesto: si todas las de una fecha están suspendidas, esa fecha no se jugó y el presupuesto por día de cancha baja. El arqueo de ese día sigue existiendo.

**Se gestiona con funciones, igual que la jornada** — una lógica, dos puertas (abajo). El seed del Clausura y el módulo de calendario que vendrá después llaman a la misma función validada.

**Clausura 2026: 29 fechas × 2 predios activos = 58 días de cancha** como caso base. No es una constante del schema (regla 12): entra como datos. Las excepciones conocidas —domingos con un solo predio, semifinal y final— se cargan como tales, no se asumen.

#### Gestión de jornadas · una lógica, dos puertas

*Construido* — migración `20260801131425_gestion_jornadas.sql`.

Las jornadas se cargan y se editan por dos vías que comparten **la misma lógica validada**:

- **Seed** — hoy: carga el Clausura 2026 desde el CSV validado.
- **App** — más adelante: el módulo de calendario, desde pantalla.

Las dos llaman a las mismas funciones. **No hay dos caminos que validen distinto**, que es el error clásico: el seed carga algo que la pantalla habría rechazado, o al revés.

Las funciones son **agnósticas del torneo** (regla 12): reciben serie, número y fecha. No saben qué es "Clausura" ni cuántas fechas tiene una serie. Lo específico entra como datos.

| Función | Qué hace |
|---|---|
| `crear_jornada(serie_id, numero, fecha)` | Alta validada: la serie existe, el número no se repite en esa serie —respeta `unique (serie_id, numero)`—, la fecha es válida o `null` (se permite sembrar la grilla antes de programar los días) |
| `mover_jornada(jornada_id, nueva_fecha)` | Cambia la fecha. **Las cuotas de liga recalculan su vencimiento solas**, porque lo derivan de `jornada.fecha` en vez de tenerlo copiado |
| `suspender_jornada(jornada_id)` | La jornada pasa a `suspendida`. Sus cuotas de liga **salen del circuito de cobro** |

**Reprogramar es mover una suspendida.** Vuelve a `programada` con la fecha nueva, y sus cuotas vuelven al circuito con el vencimiento nuevo.

#### Estado de la jornada y efecto en su cuota de liga

| Estado de la jornada | Qué pasa con la cuota de liga |
|---|---|
| `programada`, con fecha | vencimiento = `jornada.fecha`, circuito normal |
| `programada`, sin fecha | sin vencimiento todavía — B0 no la genera hasta que haya fecha |
| **`suspendida`** | **fuera del circuito de cobro**: no es deuda vencida hasta que se reprograme |
| `jugada` | vencimiento = `jornada.fecha`, se cobra normalmente |

**Lo que más cuidado necesita: una cuota de liga cuya jornada está suspendida no debe aparecer como deuda.** Un equipo cuya fecha se suspendió **no es moroso de esa cuota** — no se jugó, no corresponde reclamarla. Si las vistas no lo contemplan, el equipo aparece debiendo algo que nadie le va a cobrar, y la pantalla de deudores pierde credibilidad.

#### Playoffs · el cuadro es de la serie

*Construido — pieza 6, migración `20260802103856_playoffs_por_serie.sql`. `formato_instancia` sembrado con cuartos / semifinal / final.*

**Los playoffs ya cuelgan de serie.** La pieza 1 movió *toda* `jornada`, no solo la liga: `serie_id` es `NOT NULL` y no queda rastro de `genero`. La final de Libre A y la de Libre B son jornadas distintas, y las series no se mezclan — `jornada.serie_id` es una sola, así que un cuadro cruzado no es representable ni por accidente.

Lo que faltaba no era el recolgado sino **tres agujeros**, que es lo que esta pieza cierra:

| Agujero | Hoy | Consecuencia |
|---|---|---|
| **Sin puerta** | `crear_jornada` **hardcodea `es_playoff = false`** y exige `numero` positivo | la única vía sería `insert` directo, justo lo que la decisión 49 vino a evitar |
| **`unique` que no protege** | `unique (serie_id, numero)`, y en playoff `numero` es `NULL` | Postgres considera cada `NULL` distinto: se pueden crear **infinitas finales de Libre A** sin que nada falle |
| **`instancia` sin dominio** | ningún CHECK | `'final'`, `'Final'`, `'semi'`, `'semifinal'` pasan todas, y después no agrupan |

`mover_jornada` y `suspender_jornada` no se tocan: operan por `id` y ya son agnósticas del tipo de jornada.

##### El formato es una tabla, no un CHECK

```sql
create table formato_instancia (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null unique,   -- cuartos | semifinal | final
  cantidad_partidos smallint not null,      -- 4 | 2 | 1
  orden             smallint not null
);
```

Estructura estándar, igual en todas las series de los dos géneros:

| Instancia | Equipos | Partidos |
|---|---|---|
| cuartos | 8 | **4** |
| semifinal | 4 | **2** |
| final | 2 | **1** |

**Los equipos no se guardan: son `partidos × 2`.** Guardar los dos permitiría que se contradigan, y el que hace falta para presupuestar es el de partidos.

**Cerrar el dominio con `check (instancia in ('cuartos','semifinal','final'))` sería violar la regla 12.** Ese es el formato de *este* torneo: otro puede tener octavos, repechaje, tercer puesto, o final a ida y vuelta. Un torneo nuevo tiene que entrar con sus datos, sin tocar código — y ese es el test.

`jornada.instancia` se valida **contra esta tabla**. Editable y extensible sin migración.

##### `crear_playoff` · la cuarta puerta

```sql
crear_playoff(serie_id, instancia, fecha default null,
              cantidad_partidos default <del formato>) → uuid
```

Extiende la decisión 49 —una lógica, dos puertas— al playoff. Crea la jornada con `es_playoff = true` y sin `numero`, valida que la serie exista, que la instancia esté en `formato_instancia`, y **la unicidad de `(serie_id, instancia)`**, que es la identidad natural que el `unique` roto no cubría.

`fecha` puede ser `null`: el playoff se crea cuando se define el cuadro y se programa después con `mover_jornada`. Cantidad y fecha se desconocen hasta que termina la liga, así que no se autogeneran ni están en el CSV de calendario.

##### `equipo_playoff` · quién juega cada instancia

```sql
create table equipo_playoff (
  id                 uuid primary key default gen_random_uuid(),
  equipo_torneo_id   uuid not null references equipo_torneo(id),
  jornada_playoff_id uuid not null references jornada(id),
  unique (equipo_torneo_id, jornada_playoff_id)
);
```

En la liga no hace falta —juegan todos los de la serie, siempre— pero en playoff **la clasificación es el dato**: quién llegó a semifinal no se deriva de nada que el sistema tenga. Sin esta tabla no hay a quién cobrarle.

##### La cuota de playoff se genera después, por instancia

**Hoy B0 excluye los playoffs de la generación de cuotas, y está bien.** Lo hace por triple partida: la validación los saltea y las dos ramas del CTE los dejan afuera. Los "0 cuotas de playoff" del test de B0 son deliberados.

**Al armar la ficha no se puede saber**: no existen las jornadas de playoff, no hay fechas, y sobre todo **no se sabe si el equipo va a clasificar**. Facturarle a los 16 equipos de la serie una final que juegan 2 sería inventar deuda.

**Se cobra por instancia jugada, no un paquete al clasificar.** El equipo juega cuartos → cuota de cuartos; pasa a semifinal → cuota de semifinal. Es el mismo criterio que la liga: se factura lo que se juega, a medida que se juega. Un equipo eliminado en cuartos no debe la semifinal.

```sql
generar_cuotas_instancia(jornada_playoff_id) → int
```

Genera **una cuota por equipo registrado en esa instancia**, con el arancel de la línea `es_playoff` del tarifario de su género, atada a la jornada de playoff. El vencimiento **se deriva de `jornada.fecha`**, mismo patrón que la cuota de liga (decisión 50) y sincronizado por el mismo trigger: reprogramar la final mueve el vencimiento de sus cuotas sin tocar ninguna cuota.

**Percibido puro intacto** (§1.b): la jornada de playoff no genera asiento y la cuota tampoco. El ingreso aparece al cobrar, igual que todo lo demás.

El tarifario ya tiene la línea, **solo en la opción "Pago por fecha"** — quien eligió "Cuotas" paga un total plano que ya la incluye:

| Género | Regla | Precio ef/tr | `cantidad_esperada` |
|---|---|---|---|
| masculino | `por_partido`, `es_playoff` | 470.000 / 530.000 | 3 |
| femenino | `por_partido`, `es_playoff` | 150.000 / 180.000 | 3 |

Sin `fecha_desde`/`fecha_hasta`, con carve-out explícito en `chk_por_partido`.

##### El playoff no infla el presupuesto

> **⚠ Bug latente que esta pieza destapa.** `v_torneo_escala.partidos` (§3.3) calcula `equipos de la serie ÷ 2` **por cada jornada no suspendida, sin excluir playoffs**. Para la liga es correcto. Para un playoff no: la final de Libre A es **1 partido**, no `16 ÷ 2 = 8`. Hoy no molesta porque hay 0 playoffs; en cuanto se creen, cada instancia infla el multiplicador `por_partido` del presupuesto — con 3 instancias × 20 series, mucho, y **en silencio**. Misma clase que la bomba del 284.

El arreglo separa los dos casos:

| Tipo de jornada | Partidos |
|---|---|
| **liga** | `equipos de la serie ÷ 2` — se deriva (decisión 45) |
| **playoff** | `jornada.cantidad_partidos` — **es dato** |

**La decisión 45 queda acotada a la liga.** "Los partidos se derivan del tamaño de la serie" vale mientras juegan todos contra todos; en un cuadro la cantidad depende del **formato**, no del tamaño de la serie. Por eso `formato_instancia` trae el default y `jornada` guarda el valor efectivo — una semifinal a partido único y otra a ida y vuelta son formatos distintos y el número tiene que poder diferir.

##### Alcance: el backend ahora, el bracket después

Esta pieza construye **solo el backend**: `formato_instancia`, `crear_playoff`, `equipo_playoff`, `generar_cuotas_instancia` y el arreglo de `v_torneo_escala`.

**La pantalla de bracket** —elegir los 8 que pasan a cuartos, los 4 a semifinal, los 2 a la final— es front, y va después. Invoca estas mismas funciones: una lógica, dos puertas, igual que en jornadas. Lo que la pantalla llena es `equipo_playoff`, y de ahí salen las cuotas.

#### Impacto en las vistas de deuda

Hoy "¿esta cuota está vencida?" se responde con el `vence_at` propio de la cuota. Para las de liga pasa a depender del **estado y la fecha de su jornada**. Toda vista que calcule deuda —`v_deuda_detalle`, `v_estado_cuota`, `v_cuenta_corriente_equipo`, `v_deuda_equipo`, `v_cobranza_kpi`— tiene que distinguir:

- **Cuota fija**: `vence_at` propio, como hoy.
- **Cuota de liga**: derivar de la jornada, y **excluir las de jornada suspendida** del cálculo de deuda vencida.

Se revisa vista por vista al construir.

> **Resuelto al construir la pieza 2.** `cuota.vence_at` **se mantuvo `NOT NULL`, como caché sincronizada por trigger** (`trg_sync_cuota_vence_at`), con el precedente de `sync_total_plan`. Dejarlo nulo habría roto los **ocho consumidores** que lo leen —cinco vistas más `generar_cuotas_plan`, `sugerir_imputacion` y `crear_equipo_torneo`—. El trigger va **sobre `jornada`**, no dentro de `mover_jornada`, para que un `update` directo también propague.

### 3.6 Caja, arqueo y consolidación de efectivo

#### El estado real de `caja`

```sql
create table caja (
  id        uuid primary key default gen_random_uuid(),
  tipo      text not null,               -- efectivo | transferencia | usd
  nombre    text not null,
  predio_id uuid references predio(id),
  activo    boolean not null default true,
  cuenta_id uuid not null references cuenta(id)   -- agregada por la pieza 4
);
```

*Hasta el Draft 16 esta sección documentaba `caja` como `(id, tipo unique)`. **La tabla real siempre fue ésta**, y es la correcta: `tipo` no es único, porque hay **una caja de efectivo por predio**. Corregido contra el schema.*

Filas hoy: `Efectivo Tirolesa` @ TIR · `Efectivo Aeropuerto` @ AEP · `Caja Transferencia` (global) · `Caja USD` (global). El trigger `check_caja_predio` garantiza que efectivo tenga predio y que el resto no.

**El efectivo se discrimina por `asiento.predio_id`, no por cuenta.** Hay una sola cuenta contable `CAJA_EFECTIVO`; el predio vive en la cabecera del asiento, y `v_saldo_caja` filtra por él. Esto importa para la consolidación, abajo.

Efectivo se cuenta (arqueo); transferencia se concilia contra el extracto.

#### El circuito real del efectivo

*Construido — pieza 4, migraciones `20260802094852_caja_central.sql` y `20260802095023_arqueo_dia_cancha.sql`.*

La plata cobrada en un predio el fin de semana no llega a la administración ese mismo día. Hay dos momentos, y **el modelo tiene que distinguirlos**:

```
COBRO (finde)          ARQUEO (finde)              ENTREGA (lunes)
efectivo entra    →    control: contado vs    →    plata del predio a central
a la caja del          sistema congelado;          un asiento de traslado;
predio                 registra diferencia         el arqueo pasa a 'entregado'
                       NO mueve plata
```

**No hay estado contable intermedio "en tránsito".** El arqueo mismo *es* el estado: un arqueo hecho y no entregado **significa** que la plata la tiene su responsable. El saldo sin rendir de una persona sale de sumar sus arqueos pendientes — no necesita cuenta propia, y agregarle una sería inventar un pasivo que se resuelve solo el lunes.

#### El arqueo cuelga de `dia_cancha`

```sql
create table arqueo (
  id             uuid primary key default gen_random_uuid(),
  dia_cancha_id  uuid not null unique references dia_cancha(id),
  saldo_sistema  numeric(16,2) not null,       -- congelado al arquear
  saldo_contado  numeric(16,2) not null,
  diferencia     numeric(16,2) generated always as (saldo_contado - saldo_sistema) stored,
  estado         text not null default 'pendiente_entrega'
                 check (estado in ('pendiente_entrega','entregado')),
  entregado_at   timestamptz,
  ambito         text not null default 'torneo'      -- 'torneo' | 'bar' (21/08)
                 check (ambito in ('torneo','bar')),
  asiento_ajuste_id  uuid references asiento(id),  -- lo escribe asentar_diferencia_arqueo
  asiento_entrega_id uuid references asiento(id),  -- el traslado predio → central
  responsable_id uuid not null references auth.users(id),
  created_at     timestamptz not null default now()
);
```

*Así es la tabla hoy. Hasta la pieza 4 tenía `jornada_id` + `predio_id`, ambos `NOT NULL`: la decisión 46 estaba escrita en presente sin estar construida, y `20260802095023_arqueo_dia_cancha.sql` la hizo realidad. El `asiento_id` único se desdobló en `asiento_ajuste_id` y `asiento_entrega_id`, y se agregó `entregado_at`.*

**`jornada_id` + `predio_id` → `dia_cancha_id`.** Dos columnas se vuelven una FK. El arqueo controla la caja física de un predio en un día; con jornadas por serie, atarlo a "la jornada de una serie" pierde sentido — ese día jugaron varias series y la plata no distingue de cuál vino.

**`unique (dia_cancha_id)`** corrige de paso un agujero: hoy nada impide dos arqueos del mismo predio y fecha.

**La decisión 56 es precondición de ésta.** Como un día de cancha puede existir **sin jornada**, el arqueo de un sábado de solo bar tiene dónde colgar. Si hubiéramos exigido jornada al crear el día, acá estaríamos desarmándolo.

Migrar es gratis: la tabla tiene **0 filas**, ninguna FK entrante, ninguna vista que la lea y ningún código de app que la toque. No hay backfill.

#### El saldo esperado, y por qué se congela

**Hoy no existe.** `v_saldo_caja` da el acumulado *a hoy*, sin corte por fecha, y no puede responder *"¿cuánto efectivo debería haber en TIR al cierre del 8/8?"*. Hace falta el cálculo con corte temporal, derivado del libro diario: lo cobrado en efectivo en ese predio hasta esa fecha, menos lo pagado en efectivo, menos lo ya entregado a central.

Es el trabajo con sustancia de la pieza. El recolgado es un `alter table`; esto es una vista nueva.

**`saldo_sistema` se congela.** Se calcula al arquear y se guarda. **El arqueo es un acta histórica**: si mañana se corrige un asiento viejo, el `saldo_sistema` de ese arqueo no cambia — decía lo que el sistema decía ese día, y ese es el punto de un acta. Mismo mecanismo que `total_plan` o `pagado_at`, pero acá el congelamiento es **el propósito**, no una caché.

Esto no contradice §1.c: el saldo esperado **se deriva del diario** al momento de calcularlo. Lo que se guarda es la foto, no una segunda fuente.

#### El movimiento contable: uno solo, al entregar

**Escenario A, decidido.** El efectivo del predio baja **al entregar**, no al arquear.

| Momento | Qué pasa contablemente |
|---|---|
| **Arqueo** (finde) | **nada**. Control puro: registra contado vs sistema y la diferencia |
| **Entrega** (lunes) | **un único asiento** predio → central. El arqueo pasa a `entregado` |

Entre los dos momentos la plata figura en la caja del predio, y *quién la tiene* lo dice el `responsable_id` del arqueo pendiente. Un solo asiento, sin cuenta intermedia "a rendir": el estado lo lleva el arqueo, no el plan de cuentas.

> **⚠ Este asiento no se puede expresar con el modelo actual.** Dos hallazgos del relevamiento, que la construcción tiene que resolver **antes** de escribir `registrar_entrega_central`:
>
> **1 · `asiento_linea` no tiene `predio_id`.** El predio vive en la **cabecera** del asiento. Un traslado TIR → central necesitaría dos ámbitos de predio en un mismo asiento, y no hay dónde ponerlos. Con una sola cuenta `CAJA_EFECTIVO`, las dos líneas caen en el mismo balde `(cuenta, predio)` y **se netean a cero**: el traslado sería invisible y el saldo de TIR no bajaría.
>
> **2 · No hay caja central posible hoy.** `check_caja_predio` **rechaza** una caja de efectivo sin predio, que es justo lo que sería la central.
>
> **Salida propuesta:** una cuenta propia **`CAJA_CENTRAL`**. El asiento queda `CAJA_CENTRAL` al debe / `CAJA_EFECTIVO` al haber, con `predio_id` = el predio de origen en la cabecera — las dos líneas difieren por **cuenta**, no por predio, y el saldo del predio baja correctamente. Arrastra dos cambios: `caja` gana `cuenta_id → cuenta(id)` (hoy `v_saldo_caja` mapea `tipo → código` con un `case` escrito a mano, que no puede distinguir dos cajas de efectivo), y `check_caja_predio` se ajusta para admitir la central. Se cierra al construir.

#### La diferencia: se registra, no se resuelve

`diferencia = saldo_contado - saldo_sistema`, columna generada.

Se registra **sin forzar resolución**. Faltante o sobrante quedan asentados como diferencia, y ahí se detienen. **Quién se hace cargo** —¿lo cubre el responsable? ¿es quebranto?— es un paso posterior, y puede no ocurrir nunca. `asiento_id` es nullable justamente para eso: es el ajuste **cuando se resuelva**.

> Reemplaza al criterio del Draft 16, que decía que la diferencia *"genera un asiento de ajuste y afecta el saldo real de la caja"* como parte del arqueo. Sigue siendo cierto que la resolución genera asiento y mueve caja; lo que cambia es **cuándo**: no al arquear. Forzar la imputación en el momento del conteo obliga a decidir sobre la marcha algo que necesita conversación.

#### Las puertas

Agnósticas del torneo (regla 12), una lógica para el seed y para la app que venga.

| Función | Qué hace |
|---|---|
| `crear_arqueo(dia_cancha_id, saldo_contado, responsable_id)` | Calcula y **congela** `saldo_sistema`, guarda lo contado, la diferencia sale sola, estado `pendiente_entrega`. Valida el `unique` |
| `registrar_entrega_central(arqueo_id, …)` | Genera el asiento predio → central y marca `entregado` |

#### Lo que se lee

| Vista | Qué devuelve | Deriva de |
|---|---|---|
| `v_saldo_efectivo_dia_cancha` | por cada día de operación: cuánto **debería** haber (`saldo_sistema`) y si ya se arqueó | `dia_cancha` × `saldo_efectivo_predio()` |
| `v_arqueo_detalle` | el historial: sistema, contado, diferencia, estado, responsable, y los dos asientos | `arqueo` + `dia_cancha` + `predio` |
| `v_arqueo_diferencia` | solo las diferencias **sin resolver**, con `clase` = faltante o sobrante | `arqueo` donde `diferencia <> 0` y `asiento_ajuste_id is null` |
| `v_efectivo_sin_rendir` | por responsable: cuántos arqueos pendientes, cuánto suman y desde cuándo | `arqueo` en `pendiente_entrega` |

**`v_saldo_efectivo_dia_cancha` es la que se mira antes de contar** — dice qué esperar. El saldo que expone es **en vivo**; el del arqueo, una vez hecho, queda congelado (decisión 59).

**`v_efectivo_sin_rendir` es el saldo sin rendir de cada persona**, y sale de los arqueos y no de una cuenta contable: es la decisión 58 hecha consulta. `v_arqueo_diferencia` es la cola de trabajo del control de caja — lo que falta resolver, que puede no resolverse nunca (decisión 61).

*Ninguna de las cuatro alimenta una pantalla todavía: el módulo de arqueo es front pendiente.*

#### El ajuste de diferencias · agregado el 21/08, para los dos ámbitos

**Hasta el 21/08 la diferencia se detectaba y NUNCA se asentaba.** `crear_arqueo`
la calcula —columna generada— y genera **cero asientos**; `asiento_ajuste_id`
quedaba NULL para siempre porque **ninguna función lo escribía**: solo dos vistas
lo leían. Con un faltante de $120.000, tras la entrega quedaban **$120.000 de
residuo en la caja del predio, para siempre**. El diario cuadraba, pero la plata
que no está seguía figurando como que está.

`arqueo` tenía 0 filas: el circuito nunca había corrido. Ejecutarlo en rollback
es lo que lo destapó.

**`FIN_DIF_ARQUEO`** (tipo `financiero`, imputable) absorbe los dos signos:
faltante al debe (pérdida), sobrante al haber (ganancia). Es `financiero` y no
`egreso` por dos razones: `FIN_DIF_CAMBIO` es exactamente el mismo género y ya lo
es; y `v_pl_mensual` calcula `haber − debe` para `financiero`, así que los dos
sentidos salen bien sin tocar la vista. Como `egreso` habría caído en «Sin
categoría» en `v_pl_mensual_item`, que deriva el ítem del gasto detrás del
asiento — y un ajuste no tiene gasto.

**`asentar_diferencia_arqueo(arqueo, fecha, by)`** ajusta `CAJA_EFECTIVO`
(torneo) o `BAR_EFECTIVO` (bar) contra `FIN_DIF_ARQUEO`. Después de asentar, **el
saldo de la cuenta ES el contado**.

**Conviene correrlo ANTES de la entrega.** Sin ajuste, un SOBRANTE deja la caja
NEGATIVA: `registrar_entrega_central` mueve el **contado**, así que con sistema
$1.120.000 y contado $1.300.000 la entrega saca más de lo que hay y el saldo
queda en −$180.000.

#### Los tres agujeros del arqueo del torneo · encontrados y RESUELTOS el 21/08

Aparecieron ejecutando el circuito, que hasta ese día nunca había corrido —
`arqueo` tenía 0 filas. Los tres están cerrados.

**③ Un arqueo sin salida → estado `'cerrado'`.** `entregado` era el único
terminal, así que quedaban trabados para siempre el torneo con contado 0 —la
entrega lo rechaza, y si además cuadró exacto el ajuste también— y **TODOS los
arqueos del bar**, que no entregan a central: el 100% quedaba
`pendiente_entrega` y `v_efectivo_sin_rendir` los listaba.

`'cerrado'` significa **arqueado y sin nada que entregar**, y se decide al crear:
ámbito bar siempre, contado 0 siempre. Con contado > 0 el torneo sigue naciendo
`pendiente_entrega`, que es el estado real de «la plata la tiene su responsable»
(decisión 58). Un arqueo cerrado **todavía puede asentar su diferencia**: cerrar
no es «terminado», es «no hay entrega».

**④ No se podía anular ni corregir → `anular_arqueo` + un trigger.** La función
revierte lo que el arqueo tenga **en orden inverso al que se escribió**: primero
la entrega, después el ajuste, los dos vía `anular_asiento` (regla 4). Devuelve
cuántos revirtió: 0, 1 o 2. El unique pasó a **parcial** `WHERE anulado_at IS
NULL` — sin eso se podría deshacer pero nunca rehacer el día.

Y había algo peor que «no se puede»: **`update arqueo set saldo_contado` pasaba
sin ningún control**. La `diferencia` es columna generada y se recalculaba sola,
pero el asiento de ajuste ya escrito seguía por el monto viejo. Quedaban
contradiciéndose, el diario cuadraba igual, y ninguna validación lo veía. Con la
anon key en el bundle, eso lo podía hacer cualquiera.

`check_arqueo_inmutable` congela `saldo_contado`, `saldo_sistema`,
`dia_cancha_id` y `ambito`; deja libres `estado`, `entregado_at`, los `asiento_*`
y la marca de anulación. **Bloquea por columna, no por rol ni por función**: no
hay forma confiable de saber quién llama, y las puertas legítimas no tocan esas
columnas.

**⑤ Ninguna puerta validaba saldo → `validar_saldo_caja`.** No era de
`pagar_gasto`: midiendo el diario en orden cronológico, `CAJA_EFECTIVO` tenía **2
de 3 salidas** dejando la caja negativa (peor: −$1.708.000) y
`CAJA_TRANSFERENCIA` **4 de 8** (peor: −$5.750.000). La única que validaba era
`retirar_efectivo_bar`.

`validar_saldo_caja(cuenta, predio, fecha, monto, contexto)` cubre **solo efectivo
físico** —`CAJA_EFECTIVO`, `BAR_EFECTIVO`, `CAJA_CENTRAL`— y se usa en cinco
puertas: `pagar_gasto`, `crear_retiro_socio`, `comprar_usd` (solo
`medio='central'`), `reponer_efectivo_transito` y `registrar_entrega_central`.
Ninguna cambió de firma.

**Transferencia y USD no se validan, y es deliberado.** El efectivo negativo es
físicamente imposible; el descubierto bancario existe —el peor caso es una compra
de dólares, decisión consciente— y en USD el control es el promedio ponderado.

Mide **a la fecha del movimiento**, no contra hoy. Lo que no cubre, y queda sin
blindar: un movimiento con fecha vieja puede pasar y dejar corto un día
posterior. Lo detecta el arqueo, que para eso existe.

> **Para aplicarlo hubo que limpiar el seed.** Tirolesa estaba en −$508.000 por
> un `ZZ_TEST_Arbitros Masculino` de $4.800.000 que el seed pagó en efectivo sin
> plata, y con ⑤ eso habría bloqueado **todo** pago en efectivo de ese predio.
> Se anularon los 6 `ZZ_TEST_` vigentes: Tirolesa quedó en $4.292.000,
> transferencia en $3.395.000, y la app sin gastos vigentes (0 de 13).

#### ✅ RESUELTO · la regla de alocación de gastos · 23/08

**Todos los gastos se anclan a FECHA (`devengado_at`) + predio donde corresponda.
Ningún gasto se ancla a jornada.** El monto es libre —lo escribe el operador— y
`cat_gasto` solo clasifica el rubro.

**Por qué la jornada no iba:** anclarla ataba el gasto a una **serie**
(`jornada.serie_id`), y esa dependencia no existe en el negocio — el tribunal de
un sábado es del día, no de la serie A ni de la B. Y no alcanzaba con pedir la
fecha para deducirla: **una fecha tiene 9,5 jornadas en promedio y hasta 19**, así
que elegir «la» jornada era elegir una de diecinueve.

Con árbitros el costo **se estima** mirando los partidos, pero el número lo pone
el operador libre. Que haya pensado en 12 partidos no queda como vínculo de datos.

Los tres cambios, todos aplicados:

| | |
|---|---|
| `check_gasto_coherente` | **Ya no exige jornada** a `por_fecha`. Sigue exigiendo predio a `por_dia_cancha` y activo a `inversion` |
| `v_cashflow_estimado` | La exclusión de doble conteo de `por_partido` pasó de `g.jornada_id = j.id` a **`cat_gasto` + fecha**, y **sin predio** —a diferencia de la rama `por_dia_cancha`— porque `jornada` no tiene `predio_id`: un partido puede jugarse en cualquiera de los predios de la serie |
| `/gastos/nuevo` | **Sin selector de jornada.** Categoría → concepto → arancel → cantidad → fecha → torneo → predio |

`gasto.jornada_id` **sigue existiendo y aceptando valor**: lo que cambió es que
nadie la exige y la pantalla no la pide. Verificado de punta a punta: un gasto de
árbitros cargado desde la pantalla queda con `jornada_id` NULL y su asiento de
devengo correcto.

> Migración `20260822100000_gasto_sin_jornada` (de Horacio, que tomó la
> corrección). La distinción `por_partido`/`por_dia_cancha`/`por_mes` **queda
> donde corresponde**: proyectar y presupuestar. Ya no condiciona la carga.

#### ✅ RESUELTO · `comprar_usd` y `vender_usd` sin responsable · 23/08

Ya toman `p_created_by` y lo pasan a `crear_asiento`, como el resto de las
puertas (decisión 89). Migración `20260821270000_usd_created_by`, con `drop
function` de las firmas viejas — agregar un parámetro **sobrecarga**, no
reemplaza.

#### RLS · 50 de 51 · COMPLETO · el núcleo encendido

Horacio escribió **20 migraciones, tabla por tabla**: 104 policies en 48 de 51
tablas, verificando función por función cuáles no son `SECURITY DEFINER` y por lo
tanto necesitan policy de escritura explícita. Faltan `torneo` —depende de K2— y
`_prueba_marca`, que es de testing.

**El `ENABLE` se activa tabla por tabla, con confirmación previa y sin plazos.**
Escribir la policy y activarla son dos actos distintos: la policy inerte no
cambia nada, el `ENABLE` sí.

| Etapa | Tablas | Acumulado |
|---|---|---|
| Fase 1 · catálogos | `predio` `serie` `categoria` `cuenta` | 4 |
| Fase 2 · solo lectura | 11 tablas de catálogo y config | 15 |
| Fase 3 · Tanda A | `caja` `plan_pago` | 17 |
| Fase 3 · Tanda B | `movimiento_fondo` `usd_operacion` `anticipo_uso` `compromiso` `reclamo` | 22 |
| Fase 3 · Tanda C | `venta_bar` `retiro_bar` `arqueo` | 25 |
| Fase 3 · Tanda D | `cat_gasto` `presupuesto` `presupuesto_linea` `gasto_planificado` | 29 |
| Fase 3 · Tanda E | `cheque` — sola: la escriben tres circuitos | 30 |
| Fase 3 · Tanda F | `dia_cancha` — cierra la Fase 3 | 31 |
| Fase 4 · Tanda G | `sueldo_socio` `devengo_socio` `amortizacion` | 34 |
| Fase 4 · Tanda H | `contrato_sponsor` `cuota_cobro_sponsor` `devengo_sponsor` | 37 |
| `torneo` (con K2) | `torneo` — el escritor lo crea `crear_torneo` | **38** |
| Fase 5 · el núcleo + colgadas (12) | `asiento` `asiento_linea` `gasto` `pago` `cuota` `pago_imputacion` `tercero` `equipo_torneo` `jornada` `periodo` `anticipo` `plantilla_mail` | **50** |

**RLS está terminado.** La única tabla apagada es `_prueba_marca`, que es de
testing.

La Fase 5 se aplicó el 24/08 con el OK de Horacio, en el orden que exigía la
precondición: `20260823250000` (policy DELETE de `pago_imputacion`) y después
`20260823260000` (el ENABLE de las 12).

Verificado después del `ENABLE` con `authenticated` y `bypassrls = false`:
cobro, gasto, rechazo de cheque completo —con la deuda reabriéndose 0 →
130.000—, arrastre de fichas, bar, arqueo, USD y socios. Descuadre 0, datos
intactos.

**Y el invariante se sostiene:** `trg_asiento_balanceado` ve las líneas reales
(`debe=100.000 haber=100.000`, no `0` y `0`) y rechaza una línea que descuadra.
Sigue valiendo la nota de abajo: eso funciona **porque las policies de SELECT
son `using (true)`**.

**Cómo se llegó.** Las Fases 3 y 4 encendieron los circuitos con escritura y
todo el societario; el núcleo y sus once colgadas fueron al final y **juntas**,
con revisión aparte: si esas seis están mal, todo el flujo de cobros, pagos y
gastos se rompe a la vez. `tercero` tenía policies escritas desde la Fase 1 pero
sin `ENABLE`, y esperó al núcleo porque la escriben los mismos circuitos de alta
de ficha y cobro.

##### ✅ RESUELTO · dos DELETE sin policy · eran la precondición de la Fase 5

Barrido de todos los `delete from` del sistema contra sus policies:

| Tabla | Quién borra | Policy DELETE | |
|---|---|---|---|
| `pago_imputacion` | `cambiar_estado_cheque` (el rechazo) | ❌ ninguna | **bloquea la Fase 5** |
| `cuota_cobro_sponsor` | `cargar_cuotas_sponsor` | ❌ ninguna | antes de encender esa tabla |
| `dia_cancha` | `eliminar_dia_cancha` | ✅ | |
| `presupuesto_linea` | `borrar_linea_presupuesto` | ✅ | |

`pago_imputacion` es la grave. **Rechazar un cheque reabre la deuda borrando sus
imputaciones**; sin policy de DELETE ese paso afecta 0 filas sin error, y los
otros cuatro efectos del rechazo ocurren normalmente: el cheque queda
«rechazado», el asiento del cobro revertido, y **el equipo sigue sin deber la
plata que nunca entró**. Falla parcial y muda — el peor modo posible.

No llegó a pasar: se detectó con `pago_imputacion` todavía apagada y la policy
entró **antes** del `ENABLE` (`20260823250000`, aplicada en ese orden). La de
`cuota_cobro_sponsor` fue igual, antes de la Tanda H. **Eran precondiciones, no
pendientes sueltos** — de ahí que el barrido de `delete from` se haga por tabla
antes de cada encendido.

##### El mensaje que mentía · resuelto en la Tanda F

`eliminar_dia_cancha` sin policy de DELETE levantaba *«Día de cancha
inexistente»* sobre un día que existía: el `select` previo se bloqueaba,
`if not found` disparaba, y el mensaje culpaba al dato en vez de a la policy.
**Un error que miente sobre su propia causa es peor que un error mudo**, porque
manda a buscar al lugar equivocado.

Con la policy puesta se verificaron las dos mitades: el día real desaparece
(60 → 59, `existe = false`) **y** con un uuid falso el error legítimo sigue
apareciendo. La segunda mitad es la que importa a futuro: ahora ese mensaje
significa lo que dice.

##### 🔴 Los invariantes dependen de la policy de SELECT · Fase 5

Tres validaciones del núcleo son **constraint triggers diferidos a COMMIT** —no
corren en el statement, corren al cerrar la transacción:

| Trigger | Sobre | Garantiza |
|---|---|---|
| `trg_asiento_balanceado` | `asiento_linea` | Debe = Haber |
| `trg_imputacion_coherente` | `pago_imputacion` | no imputar de más |
| `trg_anticipo_uso` | `anticipo_uso` | el anticipo no se usa dos veces |

**Ninguna prueba en transacción con `rollback` los ejecuta** — tampoco las de
las Fases 3 y 4. Hay que forzarlos con `set constraints all immediate`.

Y los tres validan con `coalesce(sum(...), 0)` sobre la tabla que protegen.
**Con el SELECT bloqueado devuelven 0 — y 0 = 0 «balancea».** El chequeo no
falla: pasa de largo. Medido con el trigger forzado a immediate:

| | El trigger ve | Una línea que descuadra |
|---|---|---|
| **Con** policy de SELECT | debe 100.000 / haber 100.000 | se **rechaza** ✅ |
| **Sin** policy de SELECT | debe 0 / haber 0 | **se acepta** 🔴 |

O sea: **la policy de SELECT de `asiento_linea` es lo que sostiene la regla
Debe = Haber.** No es comodidad de lectura. Hoy las policies son `using (true)`
y por eso funciona; **si algún día se restringen por usuario o por rol, estos
tres invariantes se caen en silencio.**

##### La idempotencia depende de la policy de SELECT · Fase 4

Los procesos mensuales —`devengar_sueldos_socios`, `devengar_sponsors`,
`asentar_amortizacion`— son idempotentes por una **guarda que lee su propia
tabla**: `and not exists (select 1 from devengo_socio where ...)`.

Eso invierte el modo de falla de la Fase 3. Un SELECT bloqueado allá producía un
**error falso** (`eliminar_dia_cancha` diciendo «día inexistente»). Acá produce
un **éxito falso**: la guarda lee 0, la función cree que el mes está sin
devengar, y **vuelve a devengar el mes entero**.

Probado de las dos formas: con la policy, la segunda corrida devuelve 0 y ni
entra al loop; sin la policy (simulado), entra y muere con `23505` contra el
unique. O sea: **la policy de SELECT hace que la idempotencia funcione, y el
unique es la red por si no funciona.**

Y eso explica por qué `cuota_cobro_sponsor` era la peligrosa: **no tiene
unique**, así que no hay red — su DELETE bloqueado duplicaba en silencio, con la
función devolviendo el número correcto.

##### ✅ RESUELTO · `activo` · el alta rota desde la Fase 2

`activo` se encendió en la Fase 2 como «solo lectura» porque ninguna función la
escribe — pero **la escribe el front**, `app/activos/nuevo/page.tsx:102`, con un
`.from('activo').insert()` directo. Con solo policy de SELECT, el alta falla con
*«new row violates row-level security policy»* y el UPDATE mide 0 filas sin
excepción.

Es el punto ciego de `pg_proc` en su forma más literal: el relevamiento de la
Fase 2 fue solo por funciones, y el doble chequeo se instauró en la Fase 3.
`activo` quedó del lado viejo de esa línea.

Se barrieron **las 31 tablas encendidas** buscando lo mismo: solo `activo` y
`reclamo` reciben escrituras directas del front, y `reclamo` tiene su policy de
INSERT desde la Fase 3 (verificada, anda).

Corregido en `20260823240000_rls_activo_insert_update`: INSERT + UPDATE. Medido
antes y después en la misma transacción — antes el INSERT levantaba *«new row
violates row-level security policy»* y el UPDATE medía 0 filas; después el alta
pasa (1 → 2), la baja afecta 1 fila y el estado queda en «baja». Verificado el
circuito completo: alta → aparece en `proponer_amortizaciones` → se amortiza
(100.000) → baja. `activo` queda con **S/I/U**; su `relrowsecurity` no se tocó.

Lleva UPDATE además de INSERT porque la baja de un activo es un cambio de
estado: la pantalla no está construida todavía, y sin la policy habría medido 0
filas en silencio cuando alguien la escriba.

##### RLS activo leyendo RLS activo · verificado en la Tanda F

`dia_cancha` se dejó para el final a propósito: de ella cuelgan `venta_bar` y
`arqueo`, encendidas en la Tanda C. Con las tres activas a la vez,
`registrar_venta_bar` y `crear_arqueo` escribieron leyendo el día, y
`v_dia_cancha_bar` / `v_saldo_bar_dia_cancha` resolvieron el JOIN sin perderlo.

Importaba porque **un JOIN entre dos tablas con RLS evalúa las policies de las
dos**: si la de `dia_cancha` filtrara, el día desaparecería del LEFT JOIN y la
venta quedaría huérfana en la vista, sin ningún error.

##### Los tres hallazgos que cambiaron cómo se prueba RLS

1. **`postgres` tiene `rolbypassrls = true`.** Probar desde el editor SQL da
   OK falsos: nunca se evaluó una policy. Hay que entrar con
   `set_config('request.jwt.claims', ...)` + `set local role authenticated`, y
   **verificar `rolbypassrls = false` dentro de la misma transacción**.

2. **RLS bloquea `UPDATE` y `DELETE` EN SILENCIO.** No hay excepción: afecta 0
   filas y la función sigue como si nada. Solo el `INSERT` habla
   (*«new row violates row-level security policy»*). Por eso el protocolo no
   mide «la función no falló» sino **el efecto**: el estado cambió, la fila
   desapareció, el vínculo quedó escrito.

3. **`if not found` disfraza el bloqueo.** `eliminar_dia_cancha` levantó
   *«Día de cancha inexistente»* sobre un día que existía: el `select` bloqueado
   devolvía cero filas y la función culpaba al dato. El mensaje de error
   miente sobre su propia causa.

Y un punto ciego de método: **una Server Action no aparece en `pg_proc`.**
Buscar escritores por `SECURITY DEFINER` los encuentra a todos menos a esos, que
escriben desde la app con el rol del usuario — o sea, justo los que sí necesitan
policy. Por eso cada tanda se releva con doble chequeo: funciones **y** grep del
front.

##### Roles · quién puede escribir · fases 0 a 3b · 24/08

RLS resolvió *que haya reglas*; los roles, *para quién*. Hasta la Fase 0 las 129
policies decían `authenticated`, o sea «cualquiera con sesión puede todo».

| Fase | Qué hizo | Estado |
|---|---|---|
| 0 | La infraestructura: `rol` en `raw_app_meta_data`, `/configuracion/usuarios`, invitación por email | — |
| 1 | `read-only`: las 79 policies de escritura pasan a allowlist positiva | 79 |
| 2 | `bar` acotado a su circuito | 11 sí / 68 no |
| 3a | USD solo admin, por policy | 1 |
| 3b | Anular asiento y rechazar cheque, por guarda en función | 6 funciones |
| 4 | El front: menús, botones y rutas por rol | **pendiente** |

**Las 50 policies de SELECT no se tocaron en ninguna fase, y no es un olvido.**
Los invariantes del núcleo dependen de que el SELECT sea `using (true)` — ver el
hallazgo de arriba: con el SELECT restringido, `trg_asiento_balanceado` ve
`debe 0 / haber 0` y **acepta** una línea que descuadra. Son 15 funciones sobre
5 tablas las que validan con `coalesce(sum(...), 0)`; 9 de ellas levantan
excepción. Restringir el SELECT del núcleo no produce un error: produce un
**éxito falso**.

**El circuito del bar escribe mucho más que `venta_bar`**, y eso se midió
rompiéndolo: además de `venta_bar` y `retiro_bar` necesita `asiento`,
`asiento_linea`, `dia_cancha`, `arqueo` y —la que no estaba en ninguna lista—
**`periodo`**, porque `crear_asiento` llama a `periodo_de_fecha()`, que crea el
período si no existe. No se ve probando con meses ya abiertos: aparece la
primera vez que alguien asienta en un mes nuevo.

**Y hay una tercera capa, la que no se puede expresar en una policy.** Cinco
circuitos comparten `anular_asiento` —gasto, venta de bar, retiro de bar, arqueo
y el rechazo de cheque— y `asiento.UPDATE` es su único punto de control:
restringirlo a admin no bloquearía «anular un asiento suelto», bloquearía que el
bar anule su venta. Lo mismo con `cambiar_estado_cheque`, que hace las cuatro
transiciones bajo un solo `cheque.UPDATE`. La restricción va **adentro de la
función** (§2), con `p_via_circuito boolean default false` en `anular_asiento` y
sus **siete** puntos de llamada pasándolo en `true`.

El `revoke execute` era el plan y no sirve: las cinco son `SECURITY INVOKER`, así
que sacarle `EXECUTE` a `authenticated` se lo saca también a ellas. (Y el primer
`revoke` no hizo nada, porque las funciones llevan un grant a **`PUBLIC`** del
que `authenticated` es miembro.)

#### ✅ RESUELTO · K2 `crear_torneo` · aplicada, el torneo nace vacío · 23/08

`20260821280000_k2_crear_torneo` está aplicada. **El torneo nace vacío**, sin
categorías ni series, en estado `planificado`.

La decisión se resolvió por relevamiento y no por preferencia: el tarifario
**no se puede clonar tal cual**. De sus 26 líneas, 22 tienen `fecha_referencia`
fija de 2026 y las 26 tienen precio de 2026 — un clon literal generaría cuotas
con vencimientos vencidos y precios de un año atrás. `categoria` y `serie` sí
son clonables (solo nombre y orden), pero eso queda como **atajo opcional**, no
como parte del alta.

Lo que sí quedó al descubierto es que el problema real no era K2: **no existía
forma de cargar la estructura de un torneo sin editar seeds.** De ahí sale el
módulo de estructura en tres pasos —torneo, categoría/serie, tarifario—, del
que esta migración es el paso 1.

#### `/torneos` · alta de torneo desde la app · paso 1 del módulo de estructura

`/torneos` lista con `v_torneo_lista` —que trae el conteo de fichas y del molde,
regla 1— y `/torneos/nuevo` llama a `crear_torneo` por `rpc`. El form **no
ofrece `ejercicio_id`**: la función lo sigue aceptando, pero los dos torneos
cargados lo tienen en NULL y nadie lo completa.

`tiene_estructura` en la vista resuelve lo que importa operativamente: un torneo
sin serie o sin plan de tarifa **no puede recibir una ficha**, porque
`crear_equipo_torneo` necesita las dos. La lista lo marca «Falta cargar» en vez
de dejar que se descubra al intentar inscribir.

#### Estructura de torneo · paso 2 · clonar categorías/series + ABM

`clonar_estructura_torneo(origen, destino)` copia categorías y series de un
torneo a otro. **Completa en vez de rechazar**: si el destino ya tiene una
categoría con ese nombre la reusa, y de sus series copia solo las que faltan.
Correrla dos veces no duplica nada.

No es preferencia: el único destino que hoy interesa —el Apertura 2027— ya tiene
«Libre» con su serie A. Una función que rechazara todo destino no vacío sería
inútil justo donde hace falta.

El mapeo origen→destino es por **nombre**: `categoria` tiene
`UNIQUE (torneo_id, nombre)` —nombre solo, no nombre+género— así que buscar por
nombre es exacto y no hace falta tabla auxiliar.

**El retorno cuenta inserciones, no el estado del destino.** Un prototipo
devolvía en `series_creadas` el total del destino: al correrlo por segunda vez
informaba «20 series creadas» habiendo creado cero. Es el mismo retorno
mentiroso de `cargar_cuotas_sponsor`, que devuelve el `row_count` del INSERT y
por eso no delataba el DELETE bloqueado.

ABM completo por `rpc`: `crear/editar/borrar` de categoría y de serie. Dos
guardas propias:

- **`editar_categoria` rechaza cambiar el género si hay fichas.**
  `trg_ficha_coherente` valida género plan-vs-categoría **al escribir
  `equipo_torneo`**, no al escribir `categoria`: el cambio dejaría las fichas
  existentes apuntando a planes del género viejo, y no se detectaría hasta que
  alguien tocara una de esas fichas. Daño silencioso y diferido, como un UPDATE
  bloqueado por RLS pero del lado de los datos.
- **`borrar_*` explica en vez de dejar salir el `23503`.** La FK ya impide el
  borrado; la guarda agrega el por qué y el paso siguiente: *«tiene 11 equipos
  inscriptos, movelos a otra categoría antes de borrarla»*.

`categoria` y `serie` estaban encendidas desde la Fase 1/2 **con policy de solo
SELECT** —el caso `activo`, esta vez anticipado—. Ahora tienen S/I/U/D. **RLS
sigue en 38/51**: no se activó ninguna tabla nueva, solo se agregaron policies.

Pantalla `/torneos/[id]/estructura` sobre `v_estructura_torneo`, con el clonado
destacado cuando el torneo está vacío y secundario cuando ya tiene.

#### Estructura de torneo · paso 3 · tarifario editable

`plan_tarifa` y `plan_tarifa_linea` eran las últimas dos tablas de estructura
que solo se podían cargar por seed. Con esto, un torneo se arma entero desde la
app.

**La matriz regla↔campos son CUATRO formas, no tres**, y no es una convención
elegida acá: es lo que `crear_equipo_torneo` exige al armar una ficha.

| Regla | Campos | El precio es |
|---|---|---|
| `fecha_fija` | `fecha_referencia` | el monto de la cuota |
| `por_partido` + `es_playoff` | `cantidad_esperada` (máximo) | unitario |
| `por_partido` regular | `desde`/`hasta` + `cantidad` | **unitario por partido** |
| `bloque_adelantado` | `fecha_referencia` **y** `desde`/`hasta` **y** `cantidad` | **el TOTAL del bloque** |

`validar_linea_tarifa` **rechaza también el campo que sobra**, no solo exige el
que falta: una línea `fecha_fija` con `fecha_desde` cargado es un dato que nadie
lee y que le miente al que lo mira. Y valida acá y no solo en
`crear_equipo_torneo` por una cuestión de lugar: si el ABM aceptara una línea
incoherente, el error aparecería meses después al armar la primera ficha del
torneo, lejos de quien la escribió.

Dos chequeos propios: `desde <= hasta`, y en `bloque_adelantado`
**`cantidad = hasta - desde + 1`** — ahí el precio es el total, así que una
cantidad desalineada factura de más o de menos sin que nadie lo note.

**La regla se elige al crear la línea y no se edita.** Cambiarla obliga a
completar tres campos y vaciar otro en una sola operación que puede quedar a
mitad de camino; para cambiarla se borra y se crea de nuevo.
`editar_linea_tarifa` revalida la matriz con los valores **resultantes**, no con
los recibidos: una edición parcial puede romper la coherencia aunque cada campo
suelto parezca válido.

**Editar un plan que ya emitió cuotas avisa, no bloquea.**
`crear_equipo_torneo` materializa las cuotas al crear la ficha, así que editar
el plan después no las toca. Verificado: con 10 fichas colgando, cambiar el
precio de la Seña de 1.000.000 a 9.999.999 dejó las 130 cuotas emitidas en los
mismos $100.800.000, y el `total_plan` tampoco se movió (deriva de `cuota`). El
aviso de la pantalla es literalmente cierto, y `v_plan_tarifa_uso` le da el
número.

**No hay `borrar_plan`**: un plan con fichas no se puede borrar por FK, y no
debería — es la referencia de lo que esas fichas pactaron. Se desactiva con
`activo = false`. La tabla de lectura sigue mostrando solo las opciones
vigentes, pero el editor las trae todas: filtrar en la consulta dejaba un
callejón sin salida —al desactivar una opción desaparecía, y con ella el botón
para reactivarla—.

`plan_tarifa` (+I+U) y `plan_tarifa_linea` (+I+U+**D**) eran el tercer caso
`activo`, otra vez anticipado. **RLS sigue en 38/51.**

#### Estructura de torneo · paso 4 · arrastre de fichas

`arrastrar_fichas(origen, destino, responsable, simular)` recrea las
inscripciones de un torneo en el siguiente. **Usa `crear_equipo_torneo`** —la
puerta—: las cuotas se generan con el tarifario del destino, no del origen.

El equipo es un `tercero` que persiste; lo que se recrea es la **inscripción**,
porque `equipo_torneo.serie_id` apunta a una `serie` que cuelga del torneo, y
`trg_ficha_coherente` exige que sea la del torneo propio.

Empareja la serie por nombre (categoría + serie) y el plan por
`(género, concepto, posición de la opción)`. **Saltea con detalle en vez de
abortar** —abortar en la ficha 200 de 300 dejaría el trabajo a medias sin decir
cuál falló— y es idempotente.

El **preview** sale de la misma función con `p_simular`, no de una consulta
aparte: es la única forma de que el número que la pantalla promete sea el que
después ocurre.

`mover_ficha_de_serie` es el ascenso/descenso. No regenera cuotas —el precio
depende de género, opción y medio, no de la serie— y **bloquea si la ficha tiene
cuotas con `jornada_id`**: esas cuotas vencen contra fechas de la serie vieja, y
moverlas las dejaría apuntando a un calendario donde el equipo ya no juega, sin
que la FK se queje.

##### ✅ Corregido · `borrar_linea_tarifa` sí necesitaba guarda

El paso 3 se escribió sobre una afirmación falsa mía: que `cuota` no
referenciaba la línea de tarifa. `cuota.plan_tarifa_linea_id → plan_tarifa_linea`
con `ON DELETE NO ACTION`, y las 297 cuotas la tienen seteada — borrar una línea
con cuotas fallaba con el `23503` crudo. Corregido en `20260823320000`.

##### 🔴 El módulo son CINCO pasos: falta el calendario

`crear_equipo_torneo` exige jornadas sembradas y con fecha para las líneas
`por_partido`. Y **`generar_grilla_liga` está rota**: inserta en
`jornada (torneo_id, genero, numero)`, columnas que ya no existen —`jornada`
cuelga de `serie_id` desde la reescritura de la grilla, que la regla 12 ya
anticipaba—. Verificado: `column "torneo_id" of relation "jornada" does not exist`.

    torneo → estructura → tarifario → CALENDARIO (roto) → arrastre

Hoy la única vía de sembrar es `crear_jornada` una por una: **284 llamadas** para
un torneo. Es carril de Horacio, avisado en `coordinacion.md`.

**Falta el paso del calendario,
y con él el módulo queda completo: crear un torneo, clonarle la estructura,
cargarle el tarifario, sembrar el calendario y traer los inscriptos del torneo
anterior.


> **Y el `ambito` rompió dos vistas, latente.** La migración que lo agregó
> permitió dos arqueos por día, y `v_saldo_efectivo_dia_cancha` y
> `v_efectivo_sin_rendir` hacen LEFT JOIN a `arqueo` **sin filtrar ámbito**: la
> primera devolvía el día duplicado (58 filas → 59), la segunda contaba el
> arqueo del bar como plata a rendir a central. No causó daño —`arqueo` estaba
> en 0— pero estuvo aplicado. Corregido con `and a.ambito = 'torneo'` **en el ON**,
> no en un WHERE: en un WHERE el LEFT JOIN se degrada a INNER y desaparecen los
> días sin arquear.
>
> **La lección: agregar una dimensión a una tabla rompe a los que la leen sin
> conocerla.** No cambió ninguna columna ni ninguna función, y aun así partió dos
> vistas — porque un LEFT JOIN que asumía «como mucho una fila» dejó de ser
> cierto.

### 3.7 Moneda extranjera · caja USD de cobertura

Campa guarda excedentes en dólares como **cobertura cambiaria**. Es plata de la **empresa**, no de los socios: nada que ver con el fondo de inversión (§3.15), que tiene su propia tabla y su propia cuenta.

```sql
create table usd_operacion (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  tipo        text not null,               -- compra | venta
  cantidad    numeric(14,2) not null,      -- negativo en venta
  tc          numeric(10,2) not null,
  monto_pesos numeric(16,2) not null,
  motivo      text,
  asiento_id  uuid references asiento(id)
);
```

#### El diario es monomoneda, y eso se sostiene

**`asiento_linea` no tiene moneda ni cantidad** — es `(cuenta, debe, haber, tercero)`, todo en pesos. Tampoco hay ninguna columna de divisa en el resto del schema.

La complejidad del dólar queda **aislada en `usd_operacion`**, y la división es limpia:

| Número | De dónde sale |
|---|---|
| **Tenencia** — cuántos USD hay | `Σ cantidad` de `usd_operacion` |
| **Costo en libros** — cuánto valen en pesos | saldo de `CAJA_USD` en el diario |

Los dos hacen falta y **el PPP es el puente**. No se toca el diario para meterle multimoneda: esa decisión ya estaba tomada en el schema original y es la correcta.

#### Valuación por promedio ponderado (PPP)

Los dólares en caja valen el **promedio ponderado de las compras**, y salen a ese promedio al venderse.

```
tenencia_usd    = Σ cantidad de usd_operacion
costo_libros    = saldo de CAJA_USD (pesos)
costo_promedio  = costo_libros / tenencia_usd
```

**El promedio no se guarda en ninguna parte: se deriva.** Y se mantiene solo — al vender, `CAJA_USD` baja exactamente por el costo de salida, así que lo que queda conserva el mismo promedio.

```
compra 500 @ 1.000  +  compra 500 @ 1.100
  → 1.000 USD · $1.050.000 · promedio 1.050

vende 700 @ 1.200
  costo de salida  700 × 1.050 = 735.000
  recibido         700 × 1.200 = 840.000
  ganancia                        105.000
  → quedan 300 USD · $315.000 · sigue en 1.050
```

#### La diferencia de cambio es solo realizada

**Los dólares quedan a su costo hasta que se venden.** La ganancia o pérdida se reconoce **al concretar la venta**, nunca por revalúo periódico: sin ganancias en papel.

> **`revaluacion` sale del dominio.** `usd_operacion.tipo` admitía `('compra','venta','revaluacion')`. Con el modelo realizado la revaluación no existe, y **un valor del dominio que el modelo no usa es una trampa**: alguien lo va a elegir y va a asentar una ganancia que no ocurrió. Misma limpieza que `por_jornada` en la pieza 5. Si algún día se quiere revalúo, se agrega — con su lógica.
>
> Esto **reemplaza** la fila "Revaluación → `Caja USD` / `Diferencia de cambio` → No realizado" que esta sección traía desde el schema original.

#### Los dos asientos

```
COMPRA — USD 1.000 a $1.000
  CAJA_USD          debe   1.000.000
    <caja pesos>          haber  1.000.000
  Ningún resultado: es una permuta.
  + usd_operacion (compra, cantidad +1.000, tc 1.000, monto_pesos 1.000.000)

VENTA — USD 1.000 a $1.200, con promedio en libros de $1.000
  <caja pesos>      debe   1.200.000     lo recibido
    CAJA_USD              haber  1.000.000     salen al PPP
    FIN_DIF_CAMBIO        haber    200.000     ganancia realizada
  Si el dólar hubiera bajado, FIN_DIF_CAMBIO va al DEBE (pérdida).
  + usd_operacion (venta, cantidad −1.000, tc 1.200, monto_pesos 1.200.000)
```

`crear_asiento` expresa las tres líneas sin cambios: acepta N líneas con la única condición de que balanceen, `origen = 'usd'` ya está en su CHECK, y ni `CAJA_USD` ni las cajas de pesos globales exigen predio.

**Nivel empresa**, `torneo_id = NULL`: la cobertura no es de ningún torneo (decisión 5).

#### Las cuentas ya existían en el plan

`CAJA_USD` (activo) y **`FIN_DIF_CAMBIO`** (`financiero`) están en el plan desde el schema inicial, sin uso. **No se crea ninguna cuenta.** Ojo con el nombre: es `FIN_DIF_CAMBIO`, no `DIFERENCIA_CAMBIO`.

`FIN_DIF_CAMBIO` es de tipo `financiero` y no `ingreso`/`egreso` operativo. En el P&L entra al resultado, pero **en su propio bloque**: una suba del dólar suma al resultado del ejercicio y no debe leerse como que el torneo funcionó mejor (decisión 12).

> **Esa "línea aparte" ya existe.** Cuando se escribió esto, ninguna vista leía `FIN_DIF_CAMBIO` y la diferencia de cambio se habría registrado sin verse en ningún lado. Hoy la leen `v_resultado_cambio` —por mes— y `v_resultado_cambio_total` —el acumulado—, y las dos se muestran en `/usd`.

#### Lo que se lee

| Vista | Para qué |
|---|---|
| `v_tenencia_usd` | cuántos USD hay, costo en libros y promedio ponderado actual |
| `v_resultado_cambio` | la diferencia de cambio **realizada**, por período |
| `v_resultado_cambio_total` | lo mismo acumulado, en una fila, para el KPI (migración `20260809181901`) |
| `v_usd_sincronia` | la red de seguridad de abajo: costo en libros contra costo esperado |

`v_resultado_cambio_total` suma `v_resultado_cambio` y no el diario, para que el KPI y la tabla mensual de la pantalla no puedan discrepar.

#### La red de seguridad · `v_usd_sincronia`

El promedio cruza **dos fuentes**: la cantidad sale de `usd_operacion` y los pesos del diario. Si alguien asienta contra `CAJA_USD` **sin** registrar la operación —un `crear_asiento` directo, un ajuste— el promedio queda mal **en silencio** y todas las ventas posteriores salen a un costo equivocado.

`v_usd_sincronia` compara el costo en libros contra el que se reconstruye desde `usd_operacion`, y dice `OK` o qué no cierra.

**El costo esperado no es `Σ monto_pesos`.** En una venta, `monto_pesos` es lo **recibido**, pero de `CAJA_USD` sale el **costo al PPP** — dos números distintos. Y el PPP de cada venta dependió del estado en ese momento. Por eso hay que **reconstruirlo**, rehaciendo el promedio operación por operación.

> **El orden del replay tiene que ser el de ejecución, y eso obligó a una columna nueva.**
>
> `fecha` **no sirve**: `vender_usd` calcula el PPP sobre el estado real del diario al ejecutar, así que una compra registrada con fecha vieja después de una venta daría un replay distinto del que ocurrió.
>
> `asiento.created_at` **tampoco**: `now()` devuelve la hora de la **transacción**, no de la sentencia. Varias operaciones en una misma transacción quedan con timestamp idéntico y el desempate cae en un uuid aleatorio. **Lo detectó el test**: las ventas se replicaban antes que las compras y el costo esperado salía igual a la suma de las compras, sin restar nada.
>
> `usd_operacion.orden` —una secuencia, que sí avanza dentro de la transacción— es la clave correcta.

#### Funciones

| Función | Qué hace |
|---|---|
| `comprar_usd(fecha, cantidad, tc, motivo)` | asiento de compra + registra la operación |
| `vender_usd(fecha, cantidad, tc, motivo)` | calcula el PPP, arma el asiento de tres líneas y registra la operación. Valida que haya dólares suficientes |

**No hay proceso mensual.** A diferencia de socios y sponsors, las operaciones son puntuales: no hay nada que devengar, y `periodo_de_fecha` resuelve el período al asentar.

**Alcance:** el más liviano de los módulos. No se creó estructura — tabla, caja y cuentas ya existían. **Backend y pantalla están hechos**: `/usd` muestra tenencia, costo en libros y promedio ponderado; el control de sincronía; la lista de operaciones; y el resultado por diferencia de cambio, mensual y acumulado.

> **La valuación es al COSTO, y no puede ser otra cosa.** No hay ninguna cotización del día en el schema, así que el sistema es incapaz de mostrar una tenencia a valor de mercado — y por lo tanto de mostrar una ganancia **no realizada** como si fuera realizada. La pantalla lo dice donde importa: el KPI de costo en libros aclara *"lo pagado, no valor de mercado"*.

### 3.8 Presupuesto

```sql
create table presupuesto (
  id           uuid primary key default gen_random_uuid(),
  torneo_id    uuid references torneo(id),   -- NULL = presupuesto de estructura anual
  ejercicio_id uuid not null references ejercicio(id),
  estado       text not null default 'borrador'
);

create table presupuesto_linea (
  id              uuid primary key default gen_random_uuid(),
  presupuesto_id  uuid not null references presupuesto(id) on delete cascade,
  cat_gasto_id    uuid not null references cat_gasto(id),
  concepto_id     uuid references concepto_gasto(id),
  base            numeric(16,2) not null,
  cantidad        numeric(16,2) not null default 1,
  unidad          text                       -- NULL = heredar del catálogo (§3.3)
    check (unidad is null or unidad in
          ('por_partido','por_dia_cancha','por_mes','anual','unico'))
);
```

*Hasta el Draft 15 esta sección documentaba columnas `arancel`, `cantidad_x_fecha` y `monto_mensual` que **nunca existieron en la base**: la tabla se construyó con `base`, `cantidad` y `unidad`. Corregido contra el schema real.*

**`unidad` pasa a ser anulable y cambia de dominio.** Era `not null` con `check ('por_jornada','por_mes','anual','unico')`. Ahora admite `null` —que significa *heredar el default del catálogo*, no *sin definir*— y `por_jornada` desaparece, reemplazada por `por_partido` y `por_dia_cancha`. *(Cuando se hizo ese cambio la tabla estaba vacía, así que no migró ningún dato. **Hoy tiene 6 líneas en 2 cabeceras, $139.300.000.**)*

Presupuesto = `base × cantidad ×` el multiplicador de su unidad efectiva (§3.3):

| Unidad efectiva | Multiplicador |
|---|---|
| `por_partido` | Σ `equipos(serie) / 2` sobre las jornadas no suspendidas del torneo |
| `por_dia_cancha` | `count(*)` de `dia_cancha` del torneo |
| `por_mes` | meses del ejercicio |
| `anual`, `unico` | 1 |

> **La cuenta plana `× jornadas_no_suspendidas` era una bomba.** `v_presupuesto_total` multiplicaba por `count(*) from jornada where torneo_id = … and estado <> 'suspendida'`: **28** con jornadas por género, **284** con jornadas por serie. Un presupuesto se habría mostrado **diez veces más grande, sin error ni advertencia** — el peor modo de falla, porque un número plausible no se cuestiona. Se arregla con las tablas todavía vacías: nunca llegó a existir un número mal.

> **Segundo bug en la misma vista.** La rama final era `else pl.base`, sin `cantidad`: una línea `unico` de `500.000 × 3` mostraba **500.000**. Ahora todas las ramas multiplican por `cantidad` y solo cambia el factor. También se saca el `* 12` escrito a mano de `por_mes`: los meses se derivan del ejercicio.

La vista expone además `unidad` y `factor`, para que la pantalla pueda mostrar **de dónde salió el número** en lugar de solo el número.

*Durante un tiempo `por_partido` dio **0**, porque los partidos se derivan de los equipos de cada serie y no había fichas cargadas.* Hoy, con 34 equipos, **Clausura 2026 escala por 199 partidos y 58 días de cancha**.

Ese comportamiento sigue vigente para un torneo sin calendario: **`Apertura 2027` da factor 0** y sus líneas aportan $0. No es un bug —el presupuesto por partido existe recién cuando se sabe cuántos equipos hay— pero **un `$0` sin explicar se lee como error**, así que la pantalla lo rotula «sin calendario cargado» en vez de mostrar el número pelado.

El desvío se calcula por `cat_gasto_id`, que es la misma dimensión con la que se carga el gasto real. No hay tabla de mapeo entre presupuesto y real, y esa ausencia es el punto. **Desde el 20/08 eso ya se puede cruzar:** `v_gasto_detalle` expone `cat_gasto_id` y `v_gasto_categoria_mes` suma `torneo_id`. Falta la vista de comparación (PR4) y decidir su grano temporal — el presupuesto no tiene fecha y el real sí.

#### Construido · escritura y pantalla

*Migraciones `20260819200000` · `20260820175419` · `20260820190000` · `20260820200000`.*

**Las cinco puertas** (`20260820175419`, escritas por Horacio): `crear_presupuesto`
—nace en **borrador**, una cabecera por ámbito—, `agregar_linea_presupuesto`,
`editar_linea_presupuesto`, `borrar_linea_presupuesto` y `aprobar_presupuesto`
—rechaza si no tiene líneas—. No revalidan los unique: dejan que el constraint
trabaje y traducen el `unique_violation` a un mensaje que dice qué hacer.

> `agregar_linea_presupuesto` deja `unidad` en **NULL** cuando no se pasa. NULL
> ahí no es un dato faltante: es «heredar del catálogo», y la herencia la
> resuelve la vista en tres niveles. Materializarla salteaba el nivel del
> concepto y congelaba el valor si cambiaba el default.

**Los dos invariantes** (`20260819200000`): `unique (torneo_id, ejercicio_id)` y
`unique (presupuesto_id, cat_gasto_id, concepto_id)`, los dos **`NULLS NOT
DISTINCT`** — `torneo_id` es NULL para la estructura y `concepto_id` lo es en
todas las líneas, así que un unique común no habría protegido nada. Y el filtro
`estado = 'aprobado'`: **sólo el aprobado proyecta**. Sin eso, un borrador
sumaba $41.880.000 al cashflow apenas se guardaba.

**Las tres vistas**, que responden tres preguntas distintas:

| Vista | Qué da | Quién la lee |
|---|---|---|
| `v_presupuesto_linea` | **todas** las líneas con su `factor` y su `estado` | la pantalla de carga, que edita borradores |
| `v_presupuesto_total` | sólo las **aprobadas** — se define *sobre* la anterior | `v_cashflow_estimado`, y de ahí el cashflow |
| `v_presupuesto_ambito` | una fila por presupuesto: estado, líneas, total | el encabezado de cada sección |

> **Por qué `v_presupuesto_total` se apoya en `v_presupuesto_linea`.** El filtro
> por estado es correcto para el cashflow y equivocado para la edición: la
> pantalla mostraba «2 líneas» en el encabezado y «sin líneas» en la tabla,
> porque leía la vista filtrada. Copiar el cálculo del factor a una segunda
> vista habría creado dos definiciones que se desincronizan; definir una sobre
> la otra lo deja escrito **una sola vez**.

#### La pantalla · `/presupuesto`

Dos secciones por **ámbito** —cada torneo y la estructura permanente—, cada
línea con `base × cantidad × factor = total`. **`base` y `cantidad` se editan;
el `factor` no**: sale del calendario y se muestra como texto (`× 199 partidos`)
para que se vea de dónde sale el número y no sólo el resultado.

Cuatro avisos, cada uno por algo que sin decirlo se lee mal:

| Aviso | Por qué |
|---|---|
| **Borrar de un aprobado** | esa plata desaparece de los egresos estimados y el saldo proyectado sube sin que nada lo avise. Sugiere editar en vez de borrar. En borrador no hay fricción: no proyectaba nada |
| **«sin calendario cargado»** | un `$0` pelado se lee como bug; es un torneo sin fixture |
| **«unidad heredada»** | la línea guarda NULL y la unidad la pone el catálogo |
| **Cobertura** | 6 de 32 categorías presupuestadas: lo que no tiene línea **no se proyecta** |

**No hay «desaprobar»**: `desaprobar_presupuesto` no existe y la pantalla no lo
ofrece. Si hiciera falta, es un `UPDATE` manual hasta que el caso aparezca.

En el Sidebar va **primera en Finanzas**, antes de Proyección: se planea, se
proyecta, y recién después se mira lo que pasó.

#### El «vs real» · PR4

*Migraciones `20260821120000` · `20260821130000` · `20260821140000`. Es una
**pestaña** de `/presupuesto`, no una pantalla aparte: cargar y controlar son la
misma información mirada con dos propósitos.*

**El prorrateo se escribe aparte, y esa es la decisión de fondo.** El
presupuesto es un total del ejercicio sin fecha; el gasto real tiene fecha. Para
compararlos mes a mes hay que repartirlo, y **`v_cashflow_estimado` ya hace ese
reparto** — la tentación es reusarlo. No se puede, por tres razones:

| | |
|---|---|
| Viene **neteado** | descuenta el gasto real (el fix de doble conteo). Restarlo otra vez sería descontarlo dos veces |
| Sólo mira el **futuro** | 5 meses de 12, y el vs-real vive en el pasado. Julio no existe ahí, y julio tiene gasto real |
| Parte el **mes en curso** | agosto da $14.200.000 contra $26.350.000 de presupuesto real del mes |

Así que `v_presupuesto_vs_real` repite las tres ramas —`por_partido` por las
jornadas del mes, `por_dia_cancha` por sus días, `por_mes` uniforme— **sin el
filtro de futuro y sin el `NOT EXISTS`**. La validación del método es que el
reparto **suma el total exacto**: $139.300.000, igual que `v_presupuesto_total`.

`anual` y `unico` quedan fuera del prorrateo: no tienen fecha que las ubique en
un mes, y repartirlas entre doce sería inventar un criterio.

**`FULL OUTER JOIN`**, porque hay filas de los dos lados sin contraparte. Y el
join de `torneo_id` va con **`is not distinct from`**: el ámbito estructura es
NULL en las dos puntas, y `NULL = NULL` perdería la fila **en silencio** — el
mismo cuidado que el `NULLS NOT DISTINCT` de los unique.

**Los cuatro estados no se suman entre sí**, y cada uno responde otra pregunta:

| Estado | Qué dice | Qué hacer |
|---|---|---|
| `excedido` | gasté de más en algo que planeé | revisar el gasto |
| `dentro` | gasté menos de lo planeado | — |
| `sin_presupuesto` | gasté en algo que **no** planeé | falta la línea de presupuesto |
| `sin_ejecutar` | todavía no gasté lo planeado | **no es un ahorro** |

Las tres vistas:

| Vista | Grano |
|---|---|
| `v_presupuesto_vs_real` | (categoría, ámbito, mes) — el detalle |
| `v_presupuesto_vs_real_kpi` | (tramo, estado) — con `tramo` en **dos niveles**: los finos `pasado`/`en_curso`/`futuro` y los rollups `hasta_hoy`/`todo` |
| `v_presupuesto_vs_real_anual` | (categoría, ámbito) — el acumulado, con `meses_excedidos` |

> **Las filas de la KPI se solapan a propósito: hay que ELEGIR un nivel, nunca
> sumar la vista entera.** Los rollups existen para que la pantalla no sume
> tramos en el front; los tramos finos, porque la señal de calidad de dato vive
> en `pasado` y el rollup la esconde.

##### La pestaña

**El corte por defecto es «hasta hoy»** —meses cerrados y el corriente— porque
el desvío global crudo da **−$126.500.000** y se lee como «ahorramos 126
millones»: son los meses que todavía no pasaron. El año completo se ofrece, con
la advertencia.

**Cuatro tarjetas, una por estado, nunca un total único.** El `sin_presupuesto`
se muestra como *«gastaste en algo que no planeaste»* y **no como desvío del
100%**: se corrige agregando la línea, no revisando el gasto. Hoy son
$4.100.000, el **46% del gasto real**.

**La señal de calidad de dato.** `sin_ejecutar` en meses **ya cerrados** —hoy
$32.900.000 en 14 meses-categoría— no es lo mismo que en el mes corriente, que
todavía puede ejecutarse: *o falta cargar esos gastos, o no se gastaron*. Por eso
`tramo` distingue `pasado` de `en_curso`; mezclarlos inflaba la señal un 28%.

**El desvío distingue tres lecturas en la misma columna**: un `sin_ejecutar`
muestra «no ejecutado» en gris y **no un número verde**, que lo haría parecer un
ahorro.

##### Dos supuestos del prorrateo, y por qué hay tabla anual

- `por_mes` reparte **uniforme**: un aguinaldo daría «excedido» en dos meses y
  «dentro» en los otros diez, sin que nada esté mal.
- `por_partido` asume que el gasto cae **en el mes de la jornada**: si el árbitro
  factura a 30 días, el real llega un mes tarde y **los dos meses dan desvío**,
  compensándose.

El acumulado los neutraliza. **Por eso están las dos tablas**: el mensual dice
*cuándo*, el anual dice *cuánto* — y `meses_excedidos` conserva lo que el anual
esconde, que una categoría puede cerrar el año dentro habiéndose pasado algunos
meses.

El desvío se mide contra el **devengado** y no contra lo pagado: el presupuesto
es de gasto, no de caja.

> **El módulo Presupuesto queda completo:** tabla e invariantes, las cinco
> funciones de escritura (PR1), las seis vistas, la pantalla de carga y la
> pestaña de comparación.

### 3.9 Comunicaciones

```sql
create table plantilla_mail (
  id           uuid primary key default gen_random_uuid(),
  clave        text not null unique,  -- aviso_7dias | reclamo_vencida | reclamo_2 | recibo_pago
  asunto       text not null,
  cuerpo       text not null,         -- HTML, para el mail
  cuerpo_texto text                   -- plano, para WhatsApp. Null si no aplica
);                                     -- placeholders: {{equipo}} {{cantidad}} {{monto}} {{detalle}}

create table envio (
  id           uuid primary key default gen_random_uuid(),
  tercero_id   uuid not null references tercero(id),
  plantilla    text not null,
  destinatario text not null,
  payload      jsonb,
  enviado_at   timestamptz not null default now(),
  enviado_por  uuid references auth.users(id)   -- NULL si fue automático
);

create table reclamo (                 -- migración 20260812071827
  id              uuid primary key default gen_random_uuid(),
  tercero_id      uuid not null references tercero(id),
  torneo_id       uuid references torneo(id),   -- NULL = el reclamo abarca varios
  fecha           date not null default current_date,
  canal           text not null,       -- mail | whatsapp | manual
  monto_reclamado numeric(16,2) not null,       -- congelados al reclamar
  cuotas          integer not null,
  cuota_ids       uuid[] not null,
  texto           text,                -- el mensaje tal como salió
  destino         text,                -- mail o número; NULL en manual
  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now()
);
```

#### Reclamos · el módulo construido

`reclamo` es de **sólo inserción**: un reclamo es un hecho, no un estado. Por eso
no lleva `audit_log` —la fila ya es el registro— y por eso `monto_reclamado`,
`cuotas` y `texto` quedan **congelados**: si el equipo paga mañana, el reclamo
tiene que seguir diciendo lo que decía, igual que `arqueo.saldo_sistema`.

**Los dos canales salen de la misma plantilla.** `cuerpo` para el mail (HTML),
`cuerpo_texto` para WhatsApp (plano), los dos resolviendo los mismos cuatro
placeholders. La pantalla aporta **sólo los datos**; el saludo, el cuerpo y el
cierre viven en la fila, que es lo que se puede editar sin un deploy. La
previsualización que se ve es literalmente lo que se manda.

WhatsApp va por `wa.me`, sin API: abre el chat con el mensaje puesto. Como el
sistema **no puede saber si se mandó**, el registro es un botón aparte y
explícito.

`v_reclamo_equipo` da, por equipo, cuántos reclamos y hace cuántos días fue el
último — es lo que convierte la lista de deudores en cola de trabajo.

> **`envio` quedó sin uso y se superpone con `reclamo`.** Existe desde el schema
> inicial, con 0 filas, para registrar mails enviados. `reclamo` cubre eso y más
> —canal manual, montos congelados, las cuotas reclamadas—, así que hoy hay dos
> tablas para una parte del mismo problema. Ver la nota en `decisiones.md`.

**Reglas de negocio del reclamo:**

- El aviso previo (7 días) aplica **solo a modalidad `cuotas`**. Los equipos `unitario` no tienen vencimiento conocido — se les cobra en la cancha.
- El nivel de automatización es configurable: `manual` (botón por equipo) / `mixto` (aviso automático, reclamo manual) / `automatico` (ambos, con log).
- Todo envío queda registrado en `envio` y visible desde la cuenta corriente del tercero.

### 3.10 Cashflow · flujo de fondos con niveles de certeza

*Construido — migraciones `20260802133417_modulo_cashflow.sql` y `20260805121912_cashflow_stock_vs_flujo.sql` (esta última corrige el doble conteo del saldo). Cinco vistas.*

La pieza que integra todo. Es **mayormente lectura**: junta en una línea de tiempo las fuentes que ya existen, sin estructura nueva.

El requisito: **ver qué plata hay y va a haber, semana a semana, y que cada número diga de dónde viene y cuán seguro es.** Sin duplicar nada.

#### Tres niveles de certeza

Cada flujo cae en **un solo** nivel, y el nivel lo determina su **estado** — automático y objetivo, sin clasificación a mano:

| Nivel | Qué es | Fuente | Fecha |
|---|---|---|---|
| **REAL** | ya pasó, está en el diario | movimientos de las cuentas de caja | `asiento.fecha` |
| **COMPROMETIDO** | pactado, fecha y monto ciertos | cuotas de equipos (saldo) + sponsors | `vence_at` / `fecha_cobro` |
| **ESTIMADO** | cálculo, sin compromiso detrás | presupuesto distribuido | según el calendario |

**La confianza es una columna del modelo**, no una convención de la pantalla: cada flujo sabe su nivel y la vista agrupa por él.

#### REAL · movimiento de las cajas, agregadas

Sale de las líneas de las cuentas que apunta `caja.cuenta_id` —`CAJA_EFECTIVO`, `CAJA_TRANSFERENCIA`, `CAJA_CENTRAL`, `CAJA_USD`— por `asiento.fecha`.

**Tiene que ser por caja y no por tipo `ingreso`/`egreso`.** Los gastos van por devengo y los sueldos de socios también, así que `GAS_*` y `SOCIOS_A_PAGAR` **no son caja**: solo los ingresos de equipos coinciden, por percibido puro. Se cuenta lo que tocó caja y nada más.

**Se agregan todas las cajas**, y eso resuelve un problema solo: los traslados predio → central (§3.6) y las compras de USD (§3.7) mueven plata **entre dos cuentas de caja**, así que en el agregado suman cero y no ensucian el flujo. El flujo real es el movimiento de la **posición de caja**, no de cada caja por separado. El desglose por caja, si se quiere, es otra vista.

#### COMPROMETIDO · lo pactado con fecha

**Ingresos:**

- **Cuotas de equipos** — de `v_estado_cuota`, el **`saldo`** pendiente y no el `monto`, porque hay cuotas parciales. **Excluye las de jornada suspendida** (decisión 51): no se proyecta lo que nadie va a reclamar.
- **Cuotas de sponsors** — `v_cuotas_sponsor_futuras`. La fuente más limpia del sistema: fechas y montos ciertos, y validado que la suma cubre el contrato (decisión 74).

**Egresos:** `compromiso` con `sentido = 'pagar'` y `cheque` por `fecha_cobro`. Hoy `compromiso` está prácticamente vacía —solo la escribe `generar_cuotas_plan`— así que se suma lo que haya.

#### ESTIMADO · el presupuesto distribuido por el calendario

`v_presupuesto_total` da un **total sin dimensión temporal**. Para la línea de tiempo se reparte usando el calendario que ya existe:

| Unidad | Dónde cae |
|---|---|
| `por_partido` | en las fechas de las **jornadas**, cada una con sus partidos |
| `por_dia_cancha` | en los **días de cancha** (§3.5), en sus fechas |
| `por_mes` | parejo por mes |

El costo estimado cae **donde el calendario dice que ocurre la actividad**, no en un bulto. Reusa la escala del rediseño (§3.3).

**El ESTIMADO es solo egresos.** Los ingresos proyectados ya son COMPROMETIDO, porque cuotas y sponsors tienen fecha pactada. Si algún día hubiera un ingreso sin fecha, sería estimado.

#### La regla anti-duplicación, y dónde no alcanza

Del lado de **ingresos** funciona sola: la cuota cobrada tiene `saldo = 0` y desaparece de COMPROMETIDO; la cuota de sponsor cobrada tiene `cobrado_at` y sale de la vista de futuras. **El estado migra el flujo de proyectado a real, y nunca está en los dos.**

> **⚠ Del lado de egresos NO alcanza, y hay que resolverlo al construir.**
>
> El diseño dice "gasto pagado → REAL, sale de ESTIMADO". Pero **ESTIMADO sale del presupuesto, no de los gastos**: una línea "árbitros × N partidos" no sabe qué gastos concretos se pagaron, y **pagar un gasto no achica el presupuesto**. Con 100.000 presupuestados para agosto y 100.000 de árbitros efectivamente pagados en agosto, el flujo mostraría **200.000 de egreso**.
>
> La asimetría es de fondo: **una cuota es un compromiso individual con estado propio; una línea de presupuesto es un agregado sin estado.** No hay nada que migre.
>
> **Resolución propuesta: cortar la línea de tiempo por fecha.** Lo anterior a hoy es REAL —lo que efectivamente pasó— y lo de hoy en adelante es proyectado. Una fecha es pasada o futura, nunca las dos, así que la exclusión es **estructural** y no depende de emparejar líneas de presupuesto con gastos.
>
> Queda un caso a decidir: **las cuotas vencidas e impagas** tienen `vence_at` pasado y siguen esperándose. Mostrar plata futura con fecha pasada confunde una proyección; la alternativa es arrastrarlas a la semana en curso. Se define al construir.

#### Presentación

- **Por semana**, con `date_trunc('week', fecha)` sobre las fechas de los flujos. **Sin tabla de semanas**: una semana no es un período contable y no debería serlo. También por mes, que ahí sí existe `periodo`.
- Los tres niveles sumados por separado, más el **saldo proyectado acumulado**.
- **Alerta de quiebre** cuando el saldo perfora cero (§3.16). Avisar en julio que en septiembre falta plata es lo más valioso que hace el sistema.
- **Drill-down**: qué compone cada celda — qué equipos pagan, qué sponsors, qué costos.

#### Estructura

Sin tablas nuevas, todo derivado:

| Vista | |
|---|---|
| Vista | Qué devuelve | Deriva de |
|---|---|---|
| `v_cashflow_real` | movimientos de caja por fecha y origen | las cuentas de caja del diario |
| `v_cashflow_comprometido` | lo pactado con fecha, con `fecha_original` y `arrastrada` | `v_estado_cuota`, `v_cuotas_sponsor_futuras`, `compromiso`, `cheque` |
| `v_cashflow_estimado` | el presupuesto repartido por el calendario | `v_presupuesto_total` × jornadas / `dia_cancha` / meses |
| **`v_cashflow`** | la línea de tiempo semanal: los tres niveles, `entradas`, `salidas`, `flujo_neto`, `saldo_proyectado` y `futura` | unión de las tres anteriores |
| **`v_cashflow_mensual`** | lo mismo agregado por mes: flujos sumados y `saldo_proyectado` = el de la **última semana** del mes | `v_cashflow` |
| **`v_cashflow_quiebre`** | solo las semanas futuras con `saldo_proyectado < 0` — vacía si no hay quiebre | `v_cashflow` |
| **`v_saldo_caja_total`** | `saldo_total` y `cajas`: la posición de caja de **hoy**, en un solo número | `v_saldo_caja` |

**Tres de ellas alimentan pantallas hoy**, y las tres en `/proyeccion`: `v_cashflow` y `v_saldo_caja_total` en la pestaña **semanal**, y `v_cashflow_mensual` —que construyó Horacio (P3) sobre la semanal— en la pestaña **mensual**. Fueron dos rutas hasta que se fusionaron: son la misma pregunta a dos granularidades, comparten encabezado, KpiCards y gráfico, y `/proyeccion/mensual` nunca estuvo enlazada desde ningún lado. Esa ruta sobrevive como redirección a `?vista=mensual`, para no romper un link guardado.

**Por qué `v_saldo_caja_total` existe.** El total de caja no era un número: `v_saldo_caja` devuelve una fila por caja. Sumarlas en el front habría violado la regla 1 —el front nunca calcula totales—, así que la suma vive en una vista. Es **la contracara de `saldo_proyectado`**: `v_saldo_caja_total` responde *cuánta plata hay ahora* y solo cuenta lo que ya tocó caja; `saldo_proyectado` responde *cuánta voy a tener* e incluye lo comprometido todavía sin cobrar.

> **Reemplaza a `v_flujo_proyectado`.** El Draft anterior documentaba esa vista con SQL completo, **y no existía en la base**. Peor: su SQL **no compilaría hoy** — referencia `cat_gasto.grupo` (hoy `naturaleza` + `area`), `presupuesto_linea.monto_mensual` y `cantidad_x_fecha` (hoy `base`, `cantidad`, `unidad`) y **`jornada.torneo_id`**, que la pieza 1 eliminó. Además usaba `pagado_at is null`, que ignora las cuotas parciales y las suspendidas.
>
> Se reemplaza por completo: **no se copia nada de ese SQL.** Es la cuarta aparición del drift doc↔schema y la más grande, porque parecía código construido.

---

### 3.11 Activos y amortización

*Construido de punta a punta — backend y pantalla. Las tres patas del circuito: el ruteo de la compra (`20260816184239_ruteo_inversion_bienes_uso.sql`), el pago (`pagar_gasto`, que ya funcionaba) y `asentar_amortizacion` (`20260816191333`). Las vistas de lectura en `20260816193512` y `20260816193835`. La pantalla en `/activos`.*

Compras grandes se activan y amortizan mensualmente en lugar de impactar íntegras en el mes de pago.

**Umbral de materialidad.** `config_contable.umbral_activacion` (default $500.000). Por debajo, el gasto va directo al período. Por encima, la UI **ofrece** activar sin forzarlo.

El riesgo del módulo no es contable sino de adopción: si hay que dar de alta cada compra menor, en tres meses nadie lo mantiene. Con umbral razonable se esperan 5-10 altas por año.

**Circuito:**

| Momento | Debe | Haber |
|---|---|---|
| Compra | `Bienes de uso` | `Proveedores a pagar` |
| Pago | `Proveedores a pagar` | `Caja` |
| Cierre de cada mes | `Amortizaciones` (egreso) | `Amortización acumulada` |

La compra **no toca el resultado** —cambia un activo por otro—. Lo que impacta el P&L es la cuota mensual.

**El ruteo de la compra vive en `registrar_gasto`, no en el catálogo.** La función resuelve la cuenta del devengo desde `cat_gasto.cuenta_id` y **la sobrescribe con `BIENES_USO` cuando la naturaleza es `inversion`**. `preview_gasto` hace lo mismo, para que el preview no muestre una cuenta y el asiento use otra. Se eligió la función y no repuntar `cat_gasto.cuenta_id` porque «una inversión se activa» es una **regla contable**, no un atributo de una categoría: en el catálogo taparía sólo la categoría de hoy y dejaría `cuenta_id` significando dos cosas distintas.

> Antes de esto la única categoría `inversion` apuntaba a `GAS_PREDIO`, así que **la compra de un bien tocaba el resultado entero**. La Desmalezadora ($1.450.000) se corrigió por contraasiento —regla 4— y el resultado del ejercicio bajó de $31.104.767 a $29.654.767.

**Generación con revisión, en un solo paso.** `proponer_amortizaciones(periodo)` es **lectura pura**: calcula las cuotas del mes y **no escribe nada**. La revisión que pide la decisión 23 ocurre en la pantalla —muestra la propuesta, el operador confirma— y recién entonces `asentar_amortizacion(periodo, created_by, [activo])` escribe, ya como `confirmada`.

`asentar_amortizacion` **llama** a `proponer_amortizaciones` en vez de repetir su filtro, así la pantalla y el asiento nunca proponen cosas distintas. Es **idempotente** en tres capas —el filtro de la propuesta, `unique (activo_id, periodo_id)` y el loop—: correrla dos veces devuelve **0**, no error. Devuelve cuántas asentó. Con `p_activo_id` confirma un activo puntual.

> **`estado = 'propuesta'` quedó vestigial.** La tabla anticipaba materializar las propuestas antes de confirmarlas, pero ese camino crea un problema propio: una fila `propuesta` abandonada **bloquea al activo para siempre**, porque `proponer_amortizaciones` deja de proponerlo —ya tiene fila en ese período— y el `unique` impide reintentar limpio. Con el flujo de un paso nada se escribe hasta que hay asiento.

> **La reversa quedó fuera.** Anular una amortización sería `anular_asiento` + marcar la fila, pero `estado` sólo admite `propuesta|confirmada` —no hay `anulada`—, así que implica tocar el modelo. Tampoco hay precedente: `devengo_socio` tiene 6 filas y ninguna función que lo anule. Es pasada aparte.

**La amortización no va al flujo de caja.** Es gasto sin movimiento de dinero: la salida ocurrió al pagar el bien. Confundirlos duplicaría el impacto. No hay que excluirla de ningún lado: `v_cashflow_real` sólo mira las cuentas que apunta `caja.cuenta_id`, y `GAS_AMORT` / `AMORT_ACUM` no son caja.

**Imputación:** siempre estructura permanente (`torneo_id = NULL`, decisión 24). El bien sirve a todos los torneos que dura.

*Nota operativa:* `asentar_amortizacion` recibe un `periodo_id`, así que **no se puede amortizar un mes cuyo período todavía no existe** — los períodos se crean solos al primer movimiento del mes (`periodo_de_fecha`). La pantalla ofrece sólo los que existen.

#### Las vistas de lectura

| Vista | Qué da |
|---|---|
| `v_activo` | Un activo por fila con lo que la pantalla no puede calcular: `cuota_mensual`, `cuotas_confirmadas`, `cuotas_restantes`, `amortizado`, `residual`, `avance_pct`, más `compra_registrada` y `gasto_id` |
| `v_amortizacion` | Las cuotas **ya asentadas**, por activo y período. Las propuestas no salen de acá: salen de `proponer_amortizaciones()`, que es función |
| `v_activo_kpi` | Los totales de la posición: `en_activos`, `amortizado`, `residual`, `sin_compra`. Una fila siempre, también sin activos |

**Todas las derivadas de `v_activo` son subconsultas correlacionadas, no joins.** Un activo con N cuotas y un gasto daría N×1 filas si se joinearan las dos cosas; así la vista tiene una fila por activo pase lo que pase con los datos.

**Y el gasto se busca ignorando los anulados.** No es teórico: la Desmalezadora tiene dos gastos apuntándola —el original mal imputado y el que lo corrige— y un join ingenuo mostraría un valor de compra de $2.900.000. El filtro sale de `v_gasto_detalle.estado`, para no reimplementar la regla de anulación en un segundo lugar.

`cuota_mensual` usa **la misma expresión** que `proponer_amortizaciones`; si se calculara distinto, la pantalla mostraría una cuota y se asentaría otra. Y `numero_cuota` se deriva de `fecha_alta` y no de un `row_number()`: contarlas por orden daría mal apenas se saltee un período.

#### La pantalla · `/activos`

Lista con los tres KPIs y el detalle por activo, que abre su plan de amortización —las cuotas confirmadas y, destacada, la propuesta pendiente del período abierto—.

**Dos acciones, y el alta no asienta nada.** Dar de alta un activo sólo registra el bien: `gasto` apunta al activo y no al revés, así que **el activo tiene que existir antes que la compra**. La compra se carga después desde `/gastos/nuevo` con una categoría de naturaleza `inversion`, y ahí el ruteo la manda a `BIENES_USO`. La pantalla del alta termina en ese enlace, no en un "listo".

Mientras el gasto no entre, el activo queda **dado de alta sin compra registrada** — un estado real, que `v_activo_kpi.sin_compra` cuenta y la lista avisa.

`/activos/amortizar` hace el flujo de un paso: elegir período → ver la propuesta con su `AsientoPreview` → confirmar. **Los períodos se muestran todos y en orden**, incluso los que no tienen pendientes: nada impide asentar agosto y noviembre salteando septiembre —el `unique` es por `(activo, período)`, no una secuencia— y verlos en fila es lo que hace visible el hueco. El preview va **uno por activo**, porque `asentar_amortizacion` crea un asiento por cada uno y mostrar uno solo por el total sería previsualizar algo que no se escribe.

#### Lo que quedó afuera, a propósito

| | Por qué |
|---|---|
| **Baja de activo** | Dar de baja un bien parcialmente amortizado deja un residual en `BIENES_USO` que habría que dar de baja también. **Esa decisión contable no está tomada**, y la pantalla no la puede inventar |
| **Reversa de la amortización** | `amortizacion.estado` sólo admite `propuesta\|confirmada`: no hay `anulada`, así que implica tocar el modelo. Sin precedente —`devengo_socio` tampoco tiene con qué anularse— |
| **El umbral como validación** | `umbral_activacion` se muestra como **referencia** y no se fuerza: el doc dice que la UI *ofrece* activar. Su lugar natural es `/gastos/nuevo` —«este gasto supera el umbral, ¿lo activás?»—, que es carril de Horacio |

### 3.12 Compromisos

Todo lo que tiene fecha cierta y monto conocido vive en `compromiso`: facturas, cuotas de plan, cheques emitidos, cheques a cobrar. El calendario de pagos es una consulta sobre esa tabla, no una pantalla que junta datos de cinco lugares.

**Criticidad diferenciada.** No todas las obligaciones pesan igual:

| Tipo | Criticidad | Consecuencia de no cumplir |
|---|---|---|
| `cheque_emitido` | Crítico | Rebota: consecuencias bancarias inmediatas |
| `cuota_plan` | Alto | Puede caer el plan entero |
| `factura` | Medio | Suele admitir unos días |

### 3.12b Calendario de pagos · lo que vence, en dos presentaciones

*Construido — migraciones `20260819120000` · `20260819130000` · `20260819150000`
· `20260819160000` · `20260819170000`. Ruta `/calendario-pagos`.*

**Ojo con el nombre:** `/calendario` es el **calendario de jornadas** (§3.5) —
dónde y cuándo se juega—. Este es el de **vencimientos**: qué plata entra y sale
cada día. Son dos módulos distintos y la ruta larga existe porque la corta ya
estaba tomada.

#### La fuente

**`v_cashflow_comprometido`** (§3.10), sin vista intermedia. Sus 5 ramas ya son
exactamente «lo que vence»: cuotas de equipo, cuotas de sponsor, compromisos,
cheques pendientes y gastos devengados impagos, con signo unificado (**+ entra,
− sale**).

> **NO se lee `v_calendario_pagos`**, que a pesar del nombre es 1 de esas 5
> ramas sobre una tabla vacía. Ver la nota en §4.

Se le agregaron dos columnas, las dos aditivas y al final —`create or replace
view` no permite otra cosa—:

| columna | para qué |
|---|---|
| `origen_id` | clave de fila, y enlace donde el destino se abre por el registro. Lo que identifica es el **par `(origen, origen_id)`**: los ids son de tablas distintas |
| `tercero_id` | enlace por contraparte. **Siempre** en `cuota_equipo` y `cuota_sponsor`, sólo en cheques **recibidos**, a veces en compromisos, **nunca** en `gasto_impago` — `gasto` no tiene proveedor |

Un `tercero_id` en NULL **no significa que no se pueda enlazar**: significa que
no se enlaza por tercero. El destino lo decide `origen`.

#### Las tres vistas nuevas

| vista | grano | para qué |
|---|---|---|
| `v_calendario_dia` | un día | la celda de la matriz: `items`, `entra`, `sale`, `neto`, `vencidos`, `acumulado` |
| `v_calendario_mes` | un mes | el encabezado de la matriz |
| `v_calendario_kpi` | **una fila siempre** | los cuatro números de arriba, más el próximo vencimiento |

El **detalle de un día no necesita vista**: sale de `v_cashflow_comprometido`
filtrando por `fecha_original`.

#### Cuatro decisiones que definen la pantalla

**1 · Se agrupa por `fecha_original`, no por `fecha`.** Es la decisión de fondo.
`fecha` es `GREATEST(vence_at, CURRENT_DATE)`: empuja lo vencido a hoy porque
para **proyectar caja** importa cuándo va a entrar la plata. Un **calendario**
quiere lo contrario — dónde venció de verdad. Medido:

```
agrupado por        días   ítems en hoy   día más cargado
fecha_original        36              0                39
fecha                 28             68                68
```

Con `fecha`, julio y media agosto quedan vacíos y hoy junta 68 vencimientos: el
calendario diría que no venció nada justo en los días en que venció todo.

**2 · El acumulado es por día, y se escribe una vez por fecha.** Dentro de un día
el orden entre vencimientos es arbitrario, así que un acumulado que saltara fila
a fila informaría sobre un orden que no existe.

**3 · La columna acumulado desaparece al filtrar por tipo.** Corre sobre la serie
**completa**; mostrarla junto a una lista filtrada invita a leerla como «el
acumulado de los gastos», que no es. Y recalcularla sobre lo filtrado sería el
front sumando un total (regla 1).

**4 · El acumulado NO es un saldo de caja.** Es el neto comprometido corrido; no
incluye la plata que ya hay. El saldo proyectado de verdad es
`v_cashflow.saldo_proyectado`, que suma el saldo de las cajas.

#### La pantalla

Matriz mensual y lista, con toggle. **Todo Server Component**: vista, mes, día
abierto y filtro viven en la URL, así que no hay estado de cliente, la pantalla
filtrada es un link que se comparte y el «atrás» del navegador funciona. Lo
único cliente es la barra de filtros.

**Display puro.** Las dos acciones imaginables no le pertenecen: «marcar como
pagado» ya tiene dueño en Cobranza, Gastos y Cheques, y «mover una fecha» no es
de este módulo —`cuota.vence_at` es derivada, la mantiene
`trg_sync_cuota_vence_at` desde la jornada—. La pantalla lista, agrupa y
**enlaza**:

```
cuota_equipo  → /cobranza/[tercero_id]     cheque_*     → /cheques/[origen_id]
cuota_sponsor → /sponsors/[tercero_id]     gasto_impago → /gastos
```

**Mira para adelante, más lo vencido que arrastra.** Lo ya cobrado o pagado no
está acá: eso es `/movimientos`. `v_cashflow_real` existe pero agrupa por
`(fecha, origen)` y no tiene `detalle`, así que no se puede mezclar fila a fila.

#### Lo que destapó

**68 vencimientos vencidos e impagos por $35.563.233 netos** que no se veían en
ninguna pantalla. Estaban en la base —entraban al cashflow empujados a hoy— pero
nadie podía mirarlos como lista ni saber de qué día venían. Hacerlos visibles es
la razón de ser del módulo.

De esos, **$4.000.000 de una cuota de sponsor** no estaban ni en el cashflow:
los rescató el fix de la rama de sponsors (`20260819130000`).

### 3.13 Cheques

Un cheque **no es un pago**: es una promesa de pago con fecha. Afecta la deuda en un momento y la caja en otro.

| Momento | Deuda | Caja |
|---|---|---|
| Recibo un cheque a 60 días | Cancela la deuda del sponsor | Sin movimiento |
| Se acredita | — | Entra la plata |
| Emito un cheque | Cancela mi deuda | Sin movimiento |
| Se debita | — | Sale la plata, si está |

**Cuentas puente:** `Valores a depositar` (recibidos) y `Cheques a pagar` (emitidos). Su saldo es exactamente la cartera pendiente.

**Endoso: no se modela.** Si endosan un cheque recibido para pagar a un tercero, se registra el recibido como cobrado y el pago como realizado. *Salvedad conocida:* si endosan un cheque a 60 días para pagar hoy, la proyección muestra la salida hoy. Imprecisión aceptada a cambio de no modelar cadenas de endoso.

**Alerta de cobertura.** Si un cheque emitido cae en una fecha donde el saldo proyectado no alcanza, se avisa con anticipación. Es la función más valiosa del módulo.

#### Construido · el circuito completo, con pantalla

**Un cheque no se carga: aparece.** No hay alta manual, y es deliberado — un
cheque siempre nace de otra cosa, y cargarlo aparte permitiría uno sin cobro ni
gasto detrás.

| | Recibido | Emitido |
|---|---|---|
| **Nace** | `registrar_cobro(..., medio 'cheque')` | `pagar_gasto(..., medio 'cheque')` |
| **Asiento de alta** | `VALORES_A_DEPOSITAR` / ingreso | `PROVEEDORES` / `CHEQUES_A_PAGAR` |
| **Se resuelve** | acreditar · rechazar | debitar |
| **Fecha esperada** | `fecha_cobro` | `fecha_cobro` *(el débito esperado; una sola columna)* |

`cambiar_estado_cheque(cheque, nuevo_estado, caja, fecha, responsable)` es la
puerta única de las tres transiciones, y **sólo actúa desde `pendiente`**:

- **acreditar** → `caja` / `VALORES_A_DEPOSITAR`. Exige caja explícita: no hay
  una por defecto.
- **debitar** → `CHEQUES_A_PAGAR` / `caja`. Ídem.
- **rechazar** → **no escribe un asiento propio**: llama a `anular_asiento` sobre
  el asiento del cobro y borra las imputaciones del pago. La cuota vuelve a
  figurar impaga sola, porque `pagado_at` es derivado y `trg_sync_cuota_pagada`
  lo recalcula en el DELETE. Es la única acción de la app que reabre una deuda.

**Las vistas.** `v_cheque` da una fila por cheque con `situacion` ya derivada
—`por_vencer` · `vencido` · `acreditado` · `debitado` · `rechazado` · `anulado`—,
`dias_para_cobro`, el origen y sus dos asientos. `v_cheque_kpi` agrega la
cartera: `en_cartera`, `a_pagar`, `neto`, `vencidos`, `monto_vencido`,
`proximos_30` y `proximos_60`.

**El control cruzado.** `en_cartera` tiene que dar igual al saldo de
`VALORES_A_DEPOSITAR`, y `a_pagar` al de `CHEQUES_A_PAGAR`. Son dos caminos al
mismo número —uno por la tabla `cheque`, otro por el diario— y si discrepan, hay
un cheque que se movió por fuera de las puertas.

**La pantalla** (`/cheques`) es la cartera: los cuatro KPIs, la banda de
vencidos, la tabla filtrable, y el detalle con origen, asientos y acciones. Sólo
ofrece las transiciones válidas para cada cheque —un emitido no muestra
«rechazar», un resuelto no muestra ninguna— y previsualiza el asiento antes de
confirmar. El rechazo pide una confirmación aparte del click, porque reabre una
deuda y no se deshace.

**Lo que quedó afuera, y por qué:**

| | Estado |
|---|---|
| **Rechazo de un emitido** | No construido. El espejo no es simétrico: la deuda con el proveedor sigue viva, y revertir el pago exige definir `gasto.pagado_at`, que hoy no es derivado. `cambiar_estado_cheque` lo corta con un mensaje explícito |
| **Beneficiario de un emitido** | `gasto` no tiene `tercero_id`, así que la contraparte de un emitido es la **categoría del gasto**, no a quién se le paga. La pantalla rotula «Categoría» para no sugerir una persona que no está |
| **Comisión bancaria del rechazo** | No se registra. Si el banco la cobra, entra como gasto aparte. Se agrega al circuito si pasa a ser habitual |
| **Preview desde la base** | Las líneas de acreditación y débito las arma el front espejando la función, como en `/activos/amortizar`. No hay `preview_cheque` todavía; el rechazo sí lee el asiento real y lo invierte |
| **Endoso** | No se modela — ver arriba |

### 3.14 Planes de pago

Cuotas fijas, fechas conocidas: el compromiso más predecible que existe. Al dar de alta un plan, `generar_cuotas_plan()` crea todos sus compromisos.

Si el plan cae por falta de pago, sus compromisos pendientes se anulan y se alerta: la consecuencia de una moratoria caída es mayor que la cuota impaga.

### 3.15 Fondo de inversión

Los socios tienen dinero colocado en un fondo del banco. Cuando el cashflow lo necesita hacen un **rescate**; cuando se recompone, devuelven.

**No se modela como caja con saldo.** Campa no lleva cuánto hay invertido ni concilia contra el banco. Motivos: un saldo que hay que mantener a mano se desactualiza, y un saldo desactualizado es peor que no tenerlo.

| Operación | Debe | Haber |
|---|---|---|
| Rescate | `Banco` | `Fondo de inversión` |
| Colocación | `Fondo de inversión` | `Banco` |

Ninguna toca el resultado: son movimientos de fondos.

**El indicador que importa:** `v_dependencia_fondo` muestra rescatado, colocado y neto por mes. Si el neto acumulado es positivo y creciente, la operación está consumiendo respaldo en lugar de sostenerse. Es la diferencia entre "este mes hubo que rescatar" y "hace ocho meses que rescatamos más de lo que devolvemos".

### 3.16 Proyección de caja y escenarios

Prioridad número uno del dueño. La proyección debe llegar a 12 meses, no a 6 semanas.

**Cinco fuentes, con confianza distinta:**

| Fuente | Origen | Confianza |
|---|---|---|
| Comprometido — cobrar | Cuotas de equipos, sponsors | Alta |
| Comprometido — pagar | Cheques, cuotas de plan, facturas | **Muy alta** |
| Recurrente | Gastos fijos mensuales | Alta |
| Estimado | Jornadas pendientes, torneo siguiente | Media / Baja |
| Respaldo | Cheques a cobrar, rescate del fondo | No automática |

El **respaldo no se suma al saldo proyectado**: es capacidad de reacción, no dinero en la cuenta.

**Escenarios** (`escenario`): tres supuestos mueven toda la proyección —`tasa_cobranza`, `demora_cobro_dias`, `ajuste_gastos_pct`—. Limitar a tres escenarios por ejercicio: diez es una planilla otra vez.

**Alerta de quiebre.** Si el saldo proyectado perfora cero en alguna semana, se avisa en el dashboard con fecha y monto. Avisar en julio que en septiembre falta plata es la función más valiosa de todo el sistema.

**Falsa precisión.** Una proyección a 12 meses donde el mes 11 depende de un torneo que no arrancó es un supuesto, no un pronóstico. Mostrar el nivel de confianza junto al número.

### 3.17 Cobranza

Prioridad dos, e insumo principal de la proyección. Indicadores en `v_cobranza_kpi`:

| Indicador | Para qué |
|---|---|
| Tasa de cobranza | Calibra el escenario base |
| Días promedio de cobro | Alimenta `demora_cobro_dias` |
| Cartera por vencer | Es el ingreso comprometido |
| Cartera vencida | Riesgo real de incobrable |

Si históricamente cobran el 92% de lo comprometido —el total del plan de cuotas, no un devengo: bajo percibido puro no existe—, el escenario base debe usar 92, no 100. Eso es lo que separa un pronóstico de una expectativa.

### 3.18 Tarifario · `plan_tarifa` (capa de catálogos)

Modela las modalidades de pago del torneo. **Versionado por torneo:** cada torneo clona su tarifario y edita valores/reglas sin tocar código. Reemplaza el hardcodeo de precios.

Es una **capa de catálogos / plantilla**, no data entry contable. El devengo no vive acá: cuando se arma la ficha del equipo (`equipo_torneo`), el tarifario es la fuente de la que salen las `cuota` con sus importes y vencimientos —y, derivado de ellas, `total_plan`—. Armar la ficha no devenga nada: cada cuota se devenga al vencer (ver §3.4 y principio b). `plan_tarifa` no toca asientos.

**Tablas:** `plan_tarifa` (torneo + género + concepto + opción) → `plan_tarifa_linea` (los renglones). Se llama `plan_tarifa` y no `plan_pago` porque este último ya lo ocupa la moratoria de deuda (§3.14).

Dos conceptos independientes por género, cada uno con opciones alternativas; el equipo elige **una opción por concepto** en su ficha:

| Concepto | Opción 1 | Opción 2 |
|---|---|---|
| Inscripción | Pago único (seña + restante) | Cuotas |
| Partidos | Pago por fecha | Cuotas |

**Precio diferenciado Efectivo / Transferencia** en cada línea (nunca declarable/no declarable — principio e).

**Tres reglas de vencimiento** (`regla` en la línea, no en la opción — dentro de "Pago por fecha" conviven las tres):

| Regla | Qué modela |
|---|---|
| `fecha_fija` | Importe fijo que vence en una fecha resuelta contra el calendario del torneo. La línea apunta con `hito_jornada_id` (FK → `jornada`) a la fecha que define su vencimiento, más `fecha_referencia` (snapshot informativo); no una fecha plana. Reprogramar la jornada recalcula el vencimiento (ver §3.5). |
| `por_partido` | Arancel unitario por partido jugado (fechas 1–10, playoffs). Total = arancel × cantidad (decisión 8). Define el importe de la cuota, no un devengo: el ingreso se reconoce al cobrar. |
| `bloque_adelantado` | Rango de fechas cobrado de una vez por adelantado (Masc fechas 11–15, Fem 11–13). El importe cargado **es** el total del bloque. |

**Flag `es_playoff`** en la línea: eliminación directa, sin rango de fechas de liga, máx 3 partidos (cuartos/semi/final).

**Asimetría de bloque entre géneros** (confirmada): en ambos el importe es el total del bloque, pero Masculino nace de 460k/520k × 5 fechas = 2.300k/2.600k, mientras Femenino es 435k/510k como total directo de las 3 fechas.

**Válido para todas las categorías del género** — ninguna categoría tiene tarifa propia, por eso el plan lleva `genero` y no `categoria_id` (principio d, decisión 3). Con la estructura de §3.4 esto se resuelve solo: el género es atributo de la `categoria`, así que la ficha llega a su tarifario subiendo serie → categoría → género.

### 3.19 Socios · sueldo devengado y retiros

*Construido — migración `20260802113135_modulo_socios.sql`. Guille y Agus cargados por `supabase/seeds/03_socios.sql`; los sueldos acordados se cargan aparte.*

Guille y Agus —los dueños— tienen un **sueldo mensual acordado**. Retiran plata cuando quieren, y el sistema lleva la cuenta: cuánto se devengó, cuánto se retiró, y el saldo acumulado.

- El sueldo es **fijo mensual**, no reparto de ganancias. Puede cambiar en el tiempo.
- **Se acumula**: lo no retirado queda a favor y se cobra cuando el socio quiera.
- Retirar de más deja el saldo **en contra**.
- Saldo **corriente acumulado**, sin reseteo mensual.

Se cargan como `tercero` de tipo **`socio`** — el tipo ya existe en el CHECK y §3.4 ya dice que equipos, sponsors y socios comparten mecánica. No hace falta tabla propia.

#### Forma B · devengo, no percibido puro

**Ésta es la excepción deliberada al principio §1.b.** Los ingresos de equipos van por percibido puro; el sueldo del socio **se devenga**.

| | Reconocimiento | Por qué |
|---|---|---|
| Ingreso de equipo | **percibido** | puede no pagar; hasta que no cobra no hay nada |
| Sueldo de socio | **devengo** | es un compromiso cierto: se acordó pagarlo y existe cada mes, se retire o no |

No registrarlo distorsiona en una dirección concreta: **la caja parece toda del negocio cuando parte ya está comprometida** con los socios. Son situaciones distintas y merecen tratamiento distinto — no es una inconsistencia sino la misma lógica de §1.b aplicada a un hecho de naturaleza opuesta.

#### Los dos asientos

```
Devengo (mensual, automático):
  GAS_SOCIOS        debe   X      egreso — baja el resultado de la EMPRESA
    SOCIOS_A_PAGAR        haber  X      pasivo — lo que se le debe al socio

Retiro (cuando el socio saca plata):
  SOCIOS_A_PAGAR    debe   X      cancela el pasivo
    <caja>                haber  X      sale la plata
```

**El saldo del socio es el saldo de `SOCIOS_A_PAGAR` imputado a ese socio** — devengado menos retirado. Positivo = a favor; negativo = retiró de más. Sale del libro diario, no de un cálculo aparte (§1.c).

`crear_asiento` expresa los dos **sin cambios**: `origen = 'socio'` ya está en su CHECK, y `asiento_linea.tercero_id` permite imputar por socio.

#### Las dos cuentas nuevas

| Cuenta | Tipo | Rol |
|---|---|---|
| **`GAS_SOCIOS`** | `egreso` | el sueldo del socio |
| **`SOCIOS_A_PAGAR`** | `pasivo` | lo devengado y no retirado |

**`egreso`, no `patrimonio`.** El sueldo de socios se trata como **costo del negocio**, no como distribución de utilidad.

**Pero es costo de la empresa, no del torneo.** El asiento va con **`torneo_id = NULL`**, o sea a nivel **estructura permanente** (§3.2). El sueldo del socio existe todos los meses, haya torneo o no; imputarlo a un torneo exigiría prorratearlo entre los que corren ese mes, que es exactamente el criterio arbitrario que la **decisión 5** prohíbe.

Baja el **resultado de la empresa**, que es el único que se mira (§3.2). En `/resultados` se ve como una fila más de egresos, `GAS_SOCIOS`, que se abre por socio.

**El tipo de cuenta decide el P&L solo.** La vista filtra `where c.tipo in ('ingreso','egreso')`: `GAS_SOCIOS` entra; `SOCIOS_A_PAGAR`, por ser pasivo, no aparece. **No hay que tocar ninguna vista.**

**Cuenta propia, separada de `GAS_SUELDOS`** (empleados). Da lo mismo en el total del P&L, pero permite leer por separado el sueldo operativo del de los dueños — que es justo la distinción que se querría mirar.

#### No mezclar con el fondo de inversión (§3.15)

El fondo **ya modela plata de socios**, y en el sentido contrario: colocación y rescate contra `FONDO_INVERSION`, sin tocar resultado porque son movimientos de fondos.

**Un retiro de sueldo no es un rescate del fondo.** Uno cancela un pasivo devengado; el otro mueve respaldo. Cuentas y conceptos **separados**: si terminaran en la misma cuenta o en el mismo indicador, `v_dependencia_fondo` dejaría de significar lo que dice — "hace ocho meses que rescatamos más de lo que devolvemos" se contaminaría con retiros de sueldo, que son otra cosa.

#### Patrón nuevo · el sueldo acordado se versiona

```sql
create table sueldo_socio (
  id            uuid primary key default gen_random_uuid(),
  socio_id      uuid not null references tercero(id),
  monto         numeric(16,2) not null,
  vigente_desde date not null,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
```

**Es el primer parámetro versionado de verdad del sistema.** `config_contable` tiene `vigente_desde`, pero es **una sola fila sin historial** —guarda "el umbral actual y desde cuándo", no una línea de tiempo— y además no la lee nadie: no sirve de molde.

El sueldo vigente en un mes es **el de mayor `vigente_desde <= fin de ese mes`**. Cambiar el sueldo es **insertar una fila**, no editar la que hay. El historial es lo que permite recalcular un mes viejo con el sueldo que regía entonces — sin él, corregir un devengo de marzo usaría el sueldo de hoy.

#### Patrón nuevo · el devengo escribe solo

```sql
devengar_sueldos_socios(periodo_id) → int   -- cuántos devengó
```

**Rompe con el único precedente, y es deliberado.** `proponer_amortizaciones` **propone** y el operador confirma (decisión 23), porque una amortización es una **estimación**. El sueldo del socio es un **monto acordado y conocido**: no hay nada que revisar, y devengarlo directo es defendible.

- Por cada socio con sueldo vigente en el período, genera el asiento `GAS_SOCIOS` / `SOCIOS_A_PAGAR` por el monto vigente.
- **Idempotente**: `unique (socio_id, periodo_id)`, mismo patrón que `amortizacion`. Correrlo dos veces no duplica.
- **Se dispara por período, explícitamente.** No es un cron invisible: alguien lo corre al procesar el mes.
- **Aborta si el período está cerrado** — `periodo_de_fecha` ya lo garantiza.

#### El retiro

Asiento `SOCIOS_A_PAGAR` / caja. De qué caja sale importa:

| Caja | Requiere predio | |
|---|---|---|
| `CAJA_TRANSFERENCIA` · `CAJA_CENTRAL` | no | el camino natural |
| `CAJA_EFECTIVO` | **sí** | el asiento declara de qué predio salió |

No es una restricción del módulo sino de `crear_asiento`, que exige `predio_id` ante cualquier línea de `CAJA_EFECTIVO` — y con razón: si un socio se lleva efectivo de un predio y el asiento no lo dice, **el arqueo de ese día no cuadra** (§3.6).

#### Lo que se lee

| Vista | Para qué |
|---|---|
| `v_saldo_socio` | saldo actual por socio: a favor o en contra |
| `v_socio_detalle_mensual` | por socio y período: devengado, retirado, saldo acumulado |
| `v_socio_lista` | una fila por socio, con el **sueldo vigente** y el estado derivado |
| `v_socio_kpi` | los totales de todos, en una fila |

Las dos primeras son las que hay que poder mirar de un socio: el número de hoy y cómo se llegó. Las dos últimas sostienen la **lista** de `/socios`, que se separó del detalle porque la tabla mensual **no tiene techo** —12 filas por socio por año, para siempre— y con dos socios ya no entraba en una pantalla.

`v_socio_lista` trae el sueldo vigente, que ninguna de las dos primeras tenía: derivan de `SOCIOS_A_PAGAR` y ahí el acuerdo no está. Su `estado` va de lo que más pide atención a lo que menos: `en_contra` (retiró de más) → `sin_sueldo` → `al_dia` → `a_favor`. `v_socio_kpi` **suma `v_socio_lista`** y no `v_saldo_socio`, para que el encabezado y la tabla de la pantalla no puedan discrepar.

**Alcance:** backend y **lectura**. `/socios` es la lista y `/socios/[socioId]` el detalle mes a mes. Falta la **escritura** —cargar sueldo pactado y registrar retiro—: `crear_retiro_socio` existe pero es una de las seis funciones sin `p_created_by`, así que todavía no puede escribir desde una pantalla. El lugar del botón está marcado y deshabilitado en el detalle.

### 3.20 Sponsors · devengo lineal y dos calendarios

*Construido — migración `20260802121935_modulo_sponsors.sql`.*

Los sponsors aportan plata a cambio de visibilidad. Firman un **contrato anual** —cubre los dos torneos— por un monto total, con fechas de pago concretas. El aporte **se gana a lo largo del año**, porque dan visibilidad todo el tiempo, pero **se cobra en cuotas puntuales**.

#### El tercer patrón de reconocimiento

| Quién | Patrón | Por qué |
|---|---|---|
| **Equipos** | percibido puro (§1.b) | puede no pagar; hasta que no cobra no hay nada |
| **Socios** (§3.19) | devengo mensual de un fijo | compromiso cierto, mismo monto cada mes |
| **Sponsors** | **devengo lineal prorrateado** | el contrato se reconoce repartido en los meses que cubre |

Tres patrones distintos para tres naturalezas distintas. **La asimetría es deliberada** y ya está argumentada caso por caso — no es que el sistema no se haya decidido.

#### Los dos calendarios · el corazón del módulo

Un contrato tiene **dos líneas de tiempo que no coinciden**, y el modelo las lleva separadas:

| | Responde | Cadencia |
|---|---|---|
| **Reconocimiento** | *¿cuánto ganó el negocio este mes?* | **parejo**, mensual |
| **Cobro** | *¿cuándo entra la plata?* | las **cuotas**, en sus fechas |

Un contrato de 1.200.000 de ago-2026 a jul-2027 reconoce **100.000 por mes durante 12 meses**, pero puede cobrarse 400.000 en agosto, diciembre y abril:

```
Mes   Reconocido (P&L)   Entra (cashflow)
Ago      100.000            400.000
Sep      100.000                  0
…        100.000                  …
Dic      100.000            400.000
Abr      100.000            400.000
```

Colapsarlos en uno solo obligaría a mentir en una de las dos preguntas.

#### Tres momentos, tres asientos

```
Al FIRMAR — se registra la deuda y el ingreso todavía no ganado
  DEUDORES_SPONSORS   debe   total
    INGRESO_DIFERIDO        haber  total
  Sin ingreso en el P&L: se firmó, no se ganó nada aún.

Cada MES — devengo lineal, proceso automático
  INGRESO_DIFERIDO    debe   total / meses      libera el pasivo
    ING_SPONSORS            haber  total / meses      ingreso ganado → P&L

Cada COBRO — la cuota que paga el sponsor
  <caja>              debe   monto de la cuota
    DEUDORES_SPONSORS       haber  monto de la cuota  cancela lo que nos debían
```

Cada pregunta se responde con **su** cuenta, sin cálculos aparte (§1.c):

| Pregunta | Cuenta |
|---|---|
| ¿cuánto ganamos? | `ING_SPONSORS` |
| ¿cuándo entra la plata? | las cuotas de cobro |
| ¿cuánto falta ganar? | `INGRESO_DIFERIDO` |
| ¿cuánto falta cobrar? | `DEUDORES_SPONSORS` |

#### Las cuentas

| Cuenta | Tipo | Estado |
|---|---|---|
| `ING_SPONSORS` | `ingreso` | **ya existe** en el plan, sin uso |
| `DEUDORES_SPONSORS` | `activo` | nueva |
| `INGRESO_DIFERIDO` | `pasivo` | nueva |

**`DEUDORES_SPONSORS` propia y no la `DEUDORES` genérica.** `DEUDORES` "Deudores por servicios" se diseñó para equipos y la **decisión 1** la sacó de juego: bajo percibido puro, lo que un equipo debe **no está en el diario**. Reusarla resucitaría un concepto retirado a propósito y dejaría ambiguo "¿cuánto nos deben?", mezclando deuda de equipos —que no es saldo contable— con deuda de sponsors, que sí lo es.

`INGRESO_DIFERIDO` tampoco reusa `ANTICIPOS`: un anticipo es plata **ya recibida** por adelantado; el ingreso diferido es un contrato **firmado y no ganado**, que puede además estar sin cobrar. Son dos pasivos distintos.

#### Nivel empresa

**Todos los asientos van con `torneo_id = NULL`**, igual que los sueldos de socios. El contrato es anual y cubre los dos torneos; imputarlo a uno exigiría el prorrateo que la **decisión 5** prohíbe.

> **Consecuencia que conviene tener presente:** el ingreso de sponsors **no es de ningún torneo** — el contrato es anual y los cubre a los dos. Desde que el resultado se mira a nivel empresa (§3.2) esto ya no exige ninguna advertencia de lectura: en `/resultados` es una fila de ingresos como cualquier otra.

#### Estructura

```sql
create table contrato_sponsor (
  id             uuid primary key default gen_random_uuid(),
  sponsor_id     uuid not null references tercero(id),
  monto_total    numeric(16,2) not null,
  vigente_desde  date not null,
  vigente_hasta  date not null,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create table cuota_cobro_sponsor (
  id           uuid primary key default gen_random_uuid(),
  contrato_id  uuid not null references contrato_sponsor(id) on delete cascade,
  monto        numeric(16,2) not null,
  fecha_cobro  date not null,
  cobrado_at   date,
  asiento_id   uuid references asiento(id)
);

create table devengo_sponsor (
  id           uuid primary key default gen_random_uuid(),
  contrato_id  uuid not null references contrato_sponsor(id),
  periodo_id   uuid not null references periodo(id),
  monto        numeric(16,2) not null,
  asiento_id   uuid not null references asiento(id),
  unique (contrato_id, periodo_id)
);
```

`contrato_sponsor` **reusa el patrón de vigencia** estrenado en `sueldo_socio` (§3.19), y `devengo_sponsor` **reusa el anti-duplicado** de `devengo_socio`. El rango define en cuántos meses se prorratea.

**La suma de las cuotas de cobro tiene que igualar `monto_total`.** Si no, el cashflow proyecta una plata que nunca va a entrar, o de menos — y `DEUDORES_SPONSORS` nunca llegaría a cero. Se valida.

#### El último mes absorbe el redondeo

> **Detalle que parece menor y no lo es.** `total / meses` no siempre da exacto: 1.000.000 en 12 meses da 83.333,33, y doce veces eso son 999.999,96. Los 0,04 quedarían **para siempre** en `INGRESO_DIFERIDO`, que nunca cerraría en cero, y "pendiente de devengar" mostraría cuatro centavos eternos.
>
> **El último período devenga el remanente** —`monto_total` menos lo ya devengado— en vez de la cuota teórica. Así el pasivo cierra exacto por construcción, sin arrastre.

#### Procesos

| Función | Qué hace |
|---|---|
| `crear_contrato_sponsor(…)` | registra el contrato, asienta la firma y, opcionalmente, carga el cronograma de cobros |
| `devengar_sponsors(periodo_id)` | proceso mensual **idempotente que escribe solo**, igual que `devengar_sueldos_socios` |
| `registrar_cobro_sponsor(cuota_id, medio, …)` | asiento caja / `DEUDORES_SPONSORS`, y marca la cuota cobrada |

**El cobro de sponsor no reusa `registrar_cobro`.** Ésa imputa contra `cuota` de equipos y llama a `imputar_pago`; el sponsor cobra contra `DEUDORES_SPONSORS` y no tiene cuotas de equipo. Son circuitos distintos con el mismo nombre coloquial.

De qué caja sale rige lo mismo que en §3.19: transferencia y central sin predio, efectivo **con** predio, o el arqueo de ese día no cierra.

#### Lo que se lee

| Vista | Para qué |
|---|---|
| `v_estado_sponsor` | por contrato: total, devengado, cobrado, pendiente de devengar, pendiente de cobrar |
| `v_cuotas_sponsor` | **el calendario de cobro entero**, con estado `cobrada` / `vencida` / `por_vencer` |
| `v_sponsor_detalle_mensual` | **el calendario de reconocimiento**, mes a mes, con acumulado y pendiente |
| `v_cuotas_sponsor_futuras` | las cuotas con fecha futura — **la que el módulo de cashflow va a consumir** |
| `v_sponsor_lista` | **una fila por SPONSOR**, agregando sus contratos, con estado derivado |
| `v_sponsor_kpi` | los totales de todos los sponsors, en una fila |

`v_cuotas_sponsor` y `v_sponsor_detalle_mensual` se agregaron con la pantalla
(migración `20260809155729`), porque con las otras dos **no se podía mostrar
ninguno de los dos calendarios completo**:
del reconocimiento sólo existía el agregado, y del cobro sólo las cuotas futuras
—o sea que **una cuota vencida e impaga desaparecía el día que se vencía**, y un
sponsor moroso era invisible—.

`v_sponsor_detalle_mensual` deriva del **diario** (`ING_SPONSORS`), no de la tabla
`devengo_sponsor`: es un número contable (§2), y así reconcilia con
`v_estado_sponsor.devengado` por construcción en vez de por casualidad. Se engancha
por `origen_id = contrato`, y el filtro por cuenta deja afuera el asiento de firma
y los de cobro, que tocan otras cuentas.

`v_cuotas_sponsor_futuras` **se conserva**: sigue siendo la que el cashflow va a
consumir, y la nueva la contiene.

Las dos últimas se agregaron al partir la pantalla (migración `20260809174936`).
El grano de `v_estado_sponsor` es el **contrato**, y un sponsor puede tener más de
uno: una lista por contrato lo mostraría dos veces con cifras parciales, y a
"cuánto nos debe Bodega" hay que contestarle una vez. `v_sponsor_lista` agrega por
sponsor —y arranca de `tercero`, así que un sponsor cargado y todavía **sin
contrato aparece igual**, con ceros—. `v_sponsor_kpi` suma `v_sponsor_lista` y no
`v_estado_sponsor`: así el encabezado y la tabla de abajo salen de la misma fuente
y no pueden discrepar.

**Alcance:** backend **y pantalla**, en dos rutas:

- **`/sponsors`** — lista-resumen: cuatro KpiCards globales de `v_sponsor_kpi` y
  una fila por sponsor, con estado (`en_mora` · `al_dia` · `saldado` ·
  `sin_contrato`) y link al detalle.
- **`/sponsors/[sponsorId]`** — los cuatro KpiCards **del sponsor** —ya agregados
  por la vista— y una sección por contrato con sus dos calendarios.

Nació como una sola pantalla con un bloque por contrato, y con tres contratos de
prueba ya ocupaba tres pantallas de scroll: con quince sponsors no se puede
comparar dos sin recordarlos.

### 3.21 Bar · ingreso, retiro y arqueo · USABLE de punta a punta

**Estado: USABLE de punta a punta.** Los tres circuitos —ingreso, retiro y
arqueo— tienen backend Y pantalla. Es el módulo que en el Draft anterior
figuraba como «falta, y empieza por modelar»; se modeló y se cerró el 21/08.

El orden en que se construyó no es casual y conviene entenderlo: **primero el
ingreso, después el retiro, y recién entonces el arqueo.** Sin salida, al bar
solo le entraba plata y el saldo subía sin bajar nunca — un arqueo ahí habría
medido una deriva creciente, no una diferencia.

#### El grano

Un **cierre por día y predio**, colgado de `dia_cancha`, y **un asiento por
cierre**. Percibido puro: la plata ya entró, así que no hay deudor, ni cuota, ni
imputación. Es el circuito más simple del sistema.

`venta_bar` guarda los tres medios por separado —`monto_efectivo`,
`monto_tarjeta`, `monto_mp`— y el `total` es **columna generada**, no un número
que alguien pueda desincronizar.

#### Las tres cajas, y por qué el efectivo va aparte

| Cuenta | Caja | Predio |
|---|---|---|
| `BAR_EFECTIVO` | Una por predio (`tipo = 'bar_efectivo'`) | Sí |
| `TARJETA` | Global | No |
| `MERCADO_PAGO` | Global | No |

El efectivo del bar está en un **cajón físico separado** del torneo, así que
queda **fuera del arqueo del predio** — el arqueo sigue siendo solo torneo.
Técnicamente eso ya se cumplía solo: `saldo_efectivo_predio` filtra
`c.codigo = 'CAJA_EFECTIVO'` con **igualdad exacta**, no `LIKE`. El nombre sin
prefijo y el `tipo` propio son **defensa**: que un `where tipo = 'efectivo'` o un
`like 'CAJA_EFECTIVO%'` escrito mañana no se lleve la plata del bar al arqueo del
torneo sin que nadie lo note.

Tarjeta y Mercado Pago **acumulan sin que nada las baje**: se registra el neto
que entra, y la liquidación del proveedor todavía no se modela. Es correcto
—representan plata a cobrar— pero **no es caja disponible**, y la pantalla lo
dice.

#### El asiento

```
BAR_EFECTIVO   (predio del día)   debe    efectivo
TARJETA                           debe    tarjeta
MERCADO_PAGO                      debe    mp
  ING_BAR                                 haber   total
```

Solo las líneas con monto. `origen = 'bar'`, `torneo_id` NULL —el bar es
estructura permanente—, y la fecha es **la del `dia_cancha`**, no `current_date`:
un cierre del sábado cargado el lunes tiene que caer en el sábado o el saldo de
caja de ese día miente.

#### Las puertas

| Función | Qué garantiza |
|---|---|
| `registrar_venta_bar(dia, efectivo, tarjeta, mp, obs, by)` | Única vía de alta. Exige al menos un medio > 0, rechaza el segundo cierre vigente del día, y arma el asiento con `crear_asiento` |
| `anular_venta_bar(id, motivo, fecha, by)` | Delega en `anular_asiento` (regla 4). Marca la fila, lo que además libera el día para recargarlo |

**No hay «editar un cierre»**: se anula y se registra de nuevo, igual que gasto
y cheque.

#### El único por día es un índice PARCIAL

```sql
create unique index venta_bar_dia_unico on venta_bar (dia_cancha_id)
  where anulado_at is null;
```

Con un `unique` pleno, anular un cierre dejaba el día **bloqueado para siempre**:
la fila anulada sigue ahí —nada se borra— y el segundo insert chocaba contra
ella. Se podía anular, pero nunca volver a cargar el día bien. El parcial dice lo
que en realidad se quiere: **un cierre vigente por día**.

#### Las dos vistas de lectura

**`v_venta_bar`** — la lista. Aplana `dia_cancha` y `predio`, y expone el `total`
tal cual sale de la columna generada: la pantalla no suma nada. **Muestra todos,
incluidos los anulados**, marcados con `estado`. Lista *cierres*, no asientos,
así que la advertencia de la regla 4 sobre contraasientos huérfanos no aplica —
y esconderlos dejaría un día «sin cierre» que en realidad tuvo uno.

**`v_dia_cancha_bar`** — qué día se puede cerrar. Espejo de
`v_saldo_efectivo_dia_cancha`: todos los `dia_cancha` con LEFT JOIN a lo que les
cuelga, y la pantalla filtra `venta_bar_id is null`.

```sql
left join venta_bar vb on vb.dia_cancha_id = dc.id and vb.anulado_at is null
```

**El filtro va en el `ON`, no en un `WHERE`**, y no es estilo: un día cuyo cierre
se anuló tiene que volver a aparecer disponible. En un `WHERE`, el LEFT JOIN se
degrada a INNER y los días sin cierre desaparecen — la vista pasa de 58 filas a
1, o sea lo contrario de para qué existe.

**No hay `v_venta_bar_kpi`**, y la ausencia es deliberada: todos los módulos
tienen una, pero con la tabla en 0 filas una banda de KPIs muestra cuatro ceros
arriba de un empty state. Se agrega cuando haya movimiento que justifique qué
cortes valen.

#### Las pantallas

- **`/bar`** — la lista, Server Component, sin JavaScript propio. Día, predio,
  los tres montos, total y estado. El anulado se **tacha y muestra su motivo**,
  no se esconde — mismo criterio que `/movimientos`. Lo único que cruza al
  cliente es `<AnularCierre>`, una isla por fila.
- **`/bar/nuevo`** — la carga. Client Component + `supabase.rpc()` +
  `router.refresh()`.

**Tres modos de resolver el `dia_cancha`**, porque el cierre cuelga de él:

1. **Elegir un día libre** — el caso normal, un Select de `v_dia_cancha_bar`
   filtrado por `venta_bar_id is null`.
2. **Reusar un día existente que está libre** — si en el modo «no está en la
   lista» la fecha+predio ya existe sin cierre, se **reusa** en vez de crear:
   llamar a `crear_dia_cancha` reventaría contra `unique (fecha, predio_id)`.
3. **Crear un día de solo bar** — `crear_dia_cancha`, que por la decisión 56 no
   exige jornada. Se llama **al confirmar**, no al tipear la fecha: crearlo antes
   dejaría `dia_cancha` huérfanos cada vez que alguien abre el formulario y se va.

La opción no se ofrece como «creá un día» sino como **«el día no está en la
lista»**: que por dentro cree un `dia_cancha` es un detalle de implementación que
a quien carga no le dice nada.

**Las validaciones del front duplican a propósito las de la función**: botón
deshabilitado con los tres medios en 0, y el choque de día avisado **antes** de
mandar. El índice parcial es la garantía de verdad; el aviso previo es la
diferencia entre corregir y descubrir.

En el Sidebar va en **Operación, pegado a Arqueo**: el bar *es* un dominio
aparte, pero un grupo de un solo ítem se lee como algo a medio hacer, y lo que
esa pantalla hace —cerrar la caja de un día— es lo mismo que Arqueo. Cuando sume
productos o stock se muda a grupo propio.

#### El retiro · cómo sale la plata del cajón

`retirar_efectivo_bar(predio, monto, destino, fecha, motivo, by)` acredita
`BAR_EFECTIVO` del predio y debita el destino. **Transferencia interna: no toca
ING ni GAS, el resultado no se mueve** — la plata cambia de lugar, no de dueño.

| Destino | Cuenta | |
|---|---|---|
| `central` | `CAJA_CENTRAL` | Lo habitual |
| `banco` | `CAJA_TRANSFERENCIA` | **No existe una cuenta `BANCO`**: lo bancario se modela como transferencia en todo el sistema |
| `socios` | — | Rama y mensaje propios: es un destino decidido que falta conectar con `SOCIOS_A_PAGAR`, no un typo |

**No cuelga de `dia_cancha`** —a diferencia del cierre y del arqueo—: un retiro
puede pasar cualquier día, incluso uno sin bar abierto. Lleva fecha y predio
propios, y **sin unique**: varios retiros el mismo día son normales.

**Valida que el monto no supere el saldo**, vía `saldo_bar_predio` a la fecha del
retiro. Es más estricto que el circuito del torneo, donde `pagar_gasto` **no**
valida saldo — por eso la caja de Tirolesa está hoy en −$508.000.

> **No reusa `registrar_movimiento_fondo`.** Parecía «el movimiento entre cajas
> genérico que ya existe», pero ejecutarlo con la caja del bar mostró que su
> contraparte es SIEMPRE `FONDO_INVERSION`: a `CAJA_CENTRAL` le llegaba $0, el
> asiento salía con `origen='fondo'` y `predio_id` NULL —dejando el saldo
> mintiendo $500.000 contra $450.000 reales—, escribía en `movimiento_fondo`, y
> aceptaba retirar $999.999.999 sobre $500.000. Lo único genérico que tiene es
> resolver la cuenta desde `caja_id`; esa mecánica sí se reusó.

**`/bar/retiro`** muestra el saldo de cada cajón arriba, el form, el preview del
asiento y la lista con anulación. El saldo **sigue el campo fecha**, no «hoy»:
es el mismo corte que usa la función para validar.

#### El arqueo del bar · dentro de la tabla del torneo

Calca el circuito del torneo sobre `BAR_EFECTIVO`. **Solo efectivo**: tarjeta y
Mercado Pago no tienen billetes que contar — su contraste es la conciliación
contra la liquidación del proveedor, que está fuera de alcance.

`arqueo` ganó **`ambito`** (`'torneo'` | `'bar'`) y el unique pasó de
`(dia_cancha_id)` a **`(dia_cancha_id, ambito)`**: el mismo día admite los dos
cajones. Se hizo cuando la tabla tenía 0 filas, que era el momento.

`crear_arqueo` toma `p_ambito` con default `'torneo'`, y elige de dónde sale el
saldo congelado: `saldo_efectivo_predio` o `saldo_bar_predio`.

> **El `drop function` no es opcional.** Agregar un parámetro cambia la firma, así
> que `create or replace` **no reemplaza: sobrecarga**. Quedaban las dos versiones
> vivas y toda llamada de 3 args era ambigua (`ERROR 42725`) — `/arqueo/nuevo` se
> habría roto al aplicar.

**El bar no entrega a central**: su salida es el retiro.
`registrar_entrega_central` rechaza `ambito='bar'` — sin esa guardia habría
sacado plata del cajón del **torneo**, que es la cuenta que tiene hardcodeada.

`/arqueo` y `/arqueo/nuevo` manejan los dos cajones con un selector que **arranca
en Torneo**: el flujo existente no cambió. La lista marca el cajón con badge, y
el historial **no manda los arqueos de bar a `/entregar`** — para eso
`DataTable.rowHref` admite `undefined`, que el cuerpo ya soportaba.

#### El ajuste de diferencias · la puerta que le faltaba a los DOS

Ver §3.6: `FIN_DIF_ARQUEO` y `asentar_diferencia_arqueo` sirven a los dos
ámbitos. **Es un paso separado del arqueo, a propósito**: contar es control,
asentar es movimiento. La isla `<AsentarDiferencia>` en `/arqueo` muestra las dos
líneas del asiento antes de confirmar.

#### Las vistas de lectura

| Vista | |
|---|---|
| `v_venta_bar` | Los cierres, con anulados marcados |
| `v_dia_cancha_bar` | Días cerrables (filtro de anulados en el ON) |
| `v_retiro_bar` | Los retiros, con `destino_nombre` legible |
| `v_saldo_bar_dia_cancha` | Días arqueables del bar, gemela de `v_saldo_efectivo_dia_cancha` |

#### Dos bugs de UX que cazaron los screenshots

Ninguno lo habría encontrado leer el código:

**El saldo del retiro seguía «hoy» en vez de la fecha del retiro.** La pantalla
mostraba $0 mientras la función veía $270.000, porque los días de prueba están
en noviembre. Mostrar un número distinto del que se va a validar es peor que no
mostrar ninguno.

**El arqueo del bar decía «Pendiente de entrega»**, un paso que para el bar no
existe. Ahora dice «Registrado». Es la contra asumida al elegir `ambito` en vez
de tabla aparte —`estado`, `entregado_at` y `asiento_entrega_id` son del
torneo—, y se corrige en la lectura, donde el ámbito está a la vista.

#### Extensiones futuras

| | |
|---|---|
| **Detalle de productos** | `venta_bar_detalle` colgará de `venta_bar` y **no generará asientos** |
| **Comisión y liquidación diferida** | `TARJETA` y `MERCADO_PAGO` crecen sin bajar. La comisión será un gasto contra `GAS_BAR`; la liquidación, una función contra el resumen del proveedor |
| **Destino `socios` del retiro** | Falta conectarlo con `SOCIOS_A_PAGAR`. Es una línea en el `case` y un `drop/add constraint` |
| **Cargar gastos de bar** | `GAS_BAR` tiene 8 categorías y **0 gastos**: hay ingreso, no margen. No falta pantalla — falta que alguien los cargue |
| **`v_venta_bar_kpi`** | Con 0 filas serían cuatro ceros arriba de un empty state |

## 4. Navegación

**Esta sección describe la navegación REAL** —lo que existe hoy— y, al final, lo
que falta. No es un boceto: si una pantalla figura acá arriba, se puede abrir.

*Antes describía seis secciones con pestañas internas y un selector de ámbito
Empresa/Torneo que nunca se construyó — y que además contradecía §1.d, porque el
resultado se mira a nivel empresa y no hay nada que cambiar de ámbito.*

### Lo que hay · 23 pantallas en cinco grupos

El Sidebar es plano: cinco grupos, sin pestañas internas.

| Grupo | Pantallas |
|---|---|
| **Torneo** | Inscripciones · Calendario · Cobranza · Reclamos · Tarifario |
| **Operación** | Gastos · Caja · Arqueo · **Bar** · Cheques · Activos |
| **Finanzas** | Presupuesto · Proyección · Calendario de pagos · Resultados · Movimientos |
| **Societario** | Socios · Sponsors · USD |
| **Sistema** | Auditoría · Configuración › Plantillas *(+ Categorías, Cierres y Usuarios, anunciadas y no construidas)* |

Fuera del Sidebar: `/login`, `/design` (el catálogo del sistema de diseño) y las
rutas de detalle —`/cobranza/[id]`, `/gastos/[id]/pagar`, `/socios/[id]`,
`/sponsors/[id]`, `/reclamos/[id]`, `/activos/[id]`, `/cheques/[id]`— a las que
se llega desde su lista. `/bar/nuevo`, `/bar/retiro` y `/arqueo/nuevo` son de
carga, no de detalle, pero también quedan fuera del Sidebar: se entra desde su
lista.

**Ojo con dos rutas parecidas que son módulos distintos:** `/calendario` es el
**calendario de jornadas** —dónde y cuándo se juega—, y `/calendario-pagos` es
el **calendario de vencimientos** —qué plata entra y sale cada día—. El nombre
largo del segundo existe justamente porque el corto ya estaba tomado.

**El orden de «Torneo» es el orden en que pasan las cosas:** se anota el equipo,
se arma el fixture, se le cobra, y al que no paga se le reclama. El tarifario va
último porque es el catálogo del que sale todo lo anterior, no un paso.

### Lo que falta · backend construido, sin pantalla

**Ninguna. La lista se vació.** Las cuatro están construidas: Activos (§3.11),
Cheques (§3.13), Calendario de pagos (§3.12b) y **Presupuesto** (§3.8).

> **La lección, y ahora son cuatro de cuatro:** «backend construido, falta el
> front» fue optimista **todas** las veces. Cheques necesitó el asiento del
> rechazo y el nacimiento de los emitidos; el Calendario de pagos, cuatro vistas
> nuevas y dos columnas en `v_cashflow_comprometido`; Presupuesto, cinco
> funciones de escritura, dos unique, un filtro de estado y dos vistas más — y
> aun así el primer QA destapó que la pantalla no podía ver sus propios
> borradores.
>
> **Una tabla que nadie escribe esconde sus errores.** Construir la pantalla es
> lo que los saca.
>
> **Y con Ventas de bar pasó de nuevo, esta vez desde cero.** Se modeló completo
> —tabla, dos funciones, tres cuentas, cuatro cajas— y la prueba en rollback
> reventó igual, contra un índice parcial que nadie tenía a la vista:
> `uq_caja_efectivo_predio` impedía que un predio tuviera dos cajas de efectivo.
> Además, aplicar el modelo **rompió en silencio el selector de cajas de
> `/cheques`**, que filtraba por exclusión y dejó pasar las tres cajas nuevas: un
> cheque se podía acreditar en el cajón del bar. Ninguna de las dos cosas la
> encontró leer el código — las encontró ejecutarlo.

> **`v_calendario_pagos` no es el calendario de pagos.** El nombre promete de
> más: lee **una sola tabla** —`compromiso`, con `estado = 'pendiente'`— y le
> agrega una columna `criticidad` derivada del tipo. Es **1 de las 5 ramas** de
> `v_cashflow_comprometido`: no ve cheques, ni cuotas de equipo, ni sponsors, ni
> gastos impagos.
>
> Y `compromiso` tiene **0 filas**, con un único escritor —`generar_cuotas_plan(p_plan_id)`—
> que pide un `plan_pago`… que **nada inserta**. O sea que la vista devuelve 0
> filas y va a seguir devolviendo 0 hasta que exista quién escriba `plan_pago`.
> Es el mismo dibujo que tenía `cambiar_estado_cheque` esperando un `p_cheque_id`
> que nadie creaba.
>
> **Quien construya la pantalla debe leer `v_cashflow_comprometido`**, no esta.
> `v_calendario_pagos` queda como lo que es: la vista de compromisos, útil el día
> que `compromiso` tenga filas.

### Lo que falta · y empieza por modelar

**Ninguna.** Ventas de bar era la única de esta categoría y **está construida**:
modelo, funciones y pantalla (§3.21). Se modeló el 21/08 y se cerró el mismo día.

> Los **gastos** de bar siguen cubiertos por `/gastos`: `GAS_BAR` tiene 8
> categorías y 25 conceptos. Con el ingreso ya modelado, lo que falta para tener
> **margen** del bar no es una pantalla sino que **alguien cargue esos gastos**:
> hoy `GAS_BAR` tiene 0.

### Planificación · a futuro

**Escenarios.** La tabla `escenario` existe **vacía y sin ninguna vista ni
función que la use**. Es la única pieza de planificación que quedó a mitad de
camino: hay dónde guardarlos y nada que los calcule. Queda anotado como
intención, no como roadmap activo.

### Lo que NO va a existir como pantalla propia

| | Por qué |
|---|---|
| **Impuestos** | Un impuesto **es un gasto** y entra por el mismo circuito. `GAS_IMPUESTOS` tiene «Impositivos» y «Planes de Pago» con sus 11 conceptos. Una pantalla aparte sería `/gastos` filtrada por una cuenta |
| **Padrón / Alta masiva** | Lo cubre `/inscripciones` sobre `v_inscripcion`; el padrón es `tercero`. La **importación masiva desde Excel** sí falta, pero es una **función**, no una pantalla — mejora menor |
| **Bar (gastos)** | Cubierto por `/gastos`, ver arriba |
| **Punto de equilibrio** | **Descartado.** No tenía tabla, vista, función ni ruta: existía sólo en el boceto de navegación |

### La escritura desde el front

**La convención vive en `CLAUDE.md`**, y desde el 21/08 refleja la práctica:
`supabase.rpc()` desde un Client Component cuando hay función de Postgres que
valida —la puerta es la función, no el transporte—, y Server Action cuando se
escribe directo a una tabla o hay un secreto en juego.

*Antes esta sección marcaba que el doc y el código no coincidían: `CLAUDE.md`
pedía Server Actions para toda mutación y las trece pantallas de escritura usan
`rpc`. Las dos únicas Server Actions —`reclamos` y `configuracion`— resultaron
tener razones propias y consistentes: la `RESEND_API_KEY` no puede tocar el
bundle, y las dos escriben con `.from(...).insert()` sin función que las valide.
La regla se corrigió hacia la práctica, que era la correcta.*

### Una convención que vale para todas

El preview del asiento en los modales de carga **se conserva colapsado** tras un
"ver detalle contable". Sirve como prueba de rigor cuando alguien duda de un
número, sin poner contabilidad delante de quien sólo quiere cargar un gasto.

## 5. Alta de equipos y transición entre torneos

El problema: 168 equipos, dos torneos por año. Cargarlos de a uno es motivo suficiente para que el sistema no se adopte.

**Primera carga — importación.** Se sube `APERTURA 2026 · CAMPA.xlsx`, que ya tiene los equipos por categoría en hojas separadas. El sistema detecta las hojas, propone el mapeo y muestra la lista completa para revisar antes de confirmar. Nada se escribe hasta la aprobación.

**Torneos siguientes — diferencial.** Al crear un torneo nuevo se elige un torneo base y se copia:

| Se copia | No se copia |
|---|---|
| Padrón de equipos | **Deuda pendiente** |
| Estructura: categorías y series (§3.4) | |
| Tarifario | Pagos |
| Catálogo de categorías y conceptos | Asientos |

Se presenta solo la excepción: ascensos, descensos, bajas y altas nuevas. Los equipos que siguen igual no se muestran.

**La deuda no se arrastra.** Si un equipo quedó en mora en Apertura, esa mora sigue viva en su cuenta corriente pero imputada al torneo donde nació. Arrastrarla contaminaría el resultado del torneo nuevo. Bajo percibido puro, lo que se arrastra es cronograma impago, no un saldo contable: el cobro que llegue tarde se reconoce como ingreso del torneo al que pertenece la cuota, en la fecha en que entra la plata. **Consecuencia: el resultado de un torneo no se congela al cerrar.** Los cobros atrasados entran en su fecha real, así que un torneo terminado puede seguir sumando ingresos meses después. Es deliberado —es lo que significa reconocer por percibido— y las pantallas de resultado tienen que poder mostrarlo sin que parezca un error.

## 6. Orden de construcción · qué está y qué falta

*El orden en que se construyó y por qué: cada bloque necesitaba al anterior.
**Nueve de los diez están hechos**; el que falta es el 10. La tabla queda porque
las dependencias siguen valiendo si mañana se reordena el backlog.*

| # | Bloque | Contenido |
|---|---|---|
| 1 | **Núcleo contable** | `ejercicio`, `periodo`, `cuenta`, `asiento`, `asiento_linea` + triggers. Sin UI. |
| 2 | **Catálogos y padrón** | `predio`, `cat_gasto`, `concepto_gasto`, `tercero`, importador de Excel |
| 3 | **Cobranza** ★ | `equipo_torneo`, `cuota`, `pago`, reclamos, KPIs |
| 4 | **Transaccional** | Gastos por fecha, estructura, bar, caja |
| 5 | **Proyección** ★ | Flujo a 12 meses, escenarios, alertas de quiebre |
| 6 | **Resultados** | P&L por torneo y empresa, comparador |
| 7 | **Controles** | Arqueo, conciliación, cierre de período |
| 8 | **Compromisos** | Cheques, planes de pago, calendario de pagos, fondo |
| 9 | **Societario** | Socios, sponsors, USD, activos y amortización |
| 10 | **Roles y RLS** | Al final, con entidades estables. **El mínimo ya está** — ver abajo |

★ = prioridad del dueño. Todo lo demás sostiene esos dos bloques.

#### Bloque 10 · qué está y qué falta

Se construyó el **mínimo**: lo justo para que una escritura desde la UI quede con
el id real de quien la hizo, no para cerrar la seguridad.

**Está:** `/login` con email y contraseña · `middleware.ts` que refresca la
sesión y cierra el paso · los cinco usuarios creados a mano, sin registro
público · las seis llamadas de escritura pasando el id de sesión
(`p_responsable_id` en cobro y arqueo, `p_created_by` en gastos) · y el
**fallback a `auth.users` sacado de `crear_asiento`**, que era la deuda de la
decisión 89 en el motor.

**Faltaba:** roles diferenciados, **RLS**, permisos por pantalla, y el usuario de
sistema para los devengos automáticos, que por ahora reciben un `p_created_by`
transitorio.

> **El mínimo arregla la auditoría, no la seguridad.** Con RLS apagado y la anon
> key en el bundle, cualquiera podía escribir la base con o sin login. Cambia
> *quién dice ser* el que escribe; no *quién puede*.

**Resuelto el 24/08**: RLS 50/51 y los cuatro roles activos (§2). De la lista
sigue abierto **el usuario de sistema** y los **permisos por pantalla**.

> **Consecuencia operativa:** sembrar datos por SQL o MCP ahora exige pasar
> `p_created_by` explícito. `service_role` ya no alcanza — antes el fallback lo
> cubría en silencio.

**Fuera de alcance:** IVA discriminado, plan de cuentas como pantalla, balance patrimonial, amortización según tablas fiscales.

## 7. Notas de implementación

**✅ RLS construido y activo: 50 de 51 tablas**, 129 policies (50 de SELECT, 79 de escritura). La única apagada es `_prueba_marca`, que es de testing. Los roles son cuatro —`admin`, `operador`, `read-only`, `bar`— y viven en el JWT (§2). Verificado contra la base el 24/08.

Esto cierra el agujero que el bloque 10 dejaba abierto: la anon key viaja en el bundle del navegador, así que **con RLS apagado cualquiera con esa clave podía leer y escribir la base con o sin login**. El bloque 10 resolvió *quién dice ser* el que escribe; RLS resolvió *quién puede*.

El diseño original hablaba de `administracion` y `encargado_bar` filtrando por `predio_id`. Se construyeron como `read-only` y `bar`, y **el filtro por predio no se implementó**: el bar es compartido entre predios, así que `bar` está acotado por circuito, no por predio.

Lo que falta es el front: los permisos por pantalla. Hoy la base deniega, pero la pantalla todavía ofrece el botón.

**Cálculos en base, no en el cliente.** Los totales del P&L, saldos de cuenta corriente y flujo proyectado son vistas SQL. El cliente no suma: consulta. Es la traducción técnica del principio (c) — si el front calcula, en algún momento dos pantallas van a discrepar.

**Numérico, no float.** `numeric(16,2)` en todo lo monetario. Nunca `float8`.

**Los gráficos del sistema, y cuál usar.** Viven en `components/ui` y los tres contestan preguntas distintas — elegir mal es la forma más rápida de dibujar algo que no significa nada:

| Componente | Contesta | Forma |
|---|---|---|
| `ChartArea` | «¿cómo evolucionó esto en el tiempo?» | una serie sobre un eje temporal |
| `Waterfall` | «¿de dónde a dónde llegué?» | sumas y restas encadenadas |
| `BarrasComposicion` | «¿en qué se reparte el total?» | barras horizontales, sin eje de tiempo |

`BarrasComposicion` se construyó para `/gastos` porque los otros dos no servían: «en qué se va la plata» no tiene eje temporal. Es **CSS y no SVG** —rectángulos proporcionales y texto—, así que el ancho lo resuelve el navegador y el texto queda seleccionable. Su `tope` **agrupa la cola en «Otros (n)» en vez de recortarla**: un gráfico que muestra 7 de 9 sin decirlo hace parecer que el total es lo que se ve.

**Idempotencia del importador.** La importación debe poder correrse dos veces sin duplicar: clave natural `(torneo_id, nombre_equipo)`.

**Auditoría.** `asiento` ya es inmutable. Para el resto de las tablas, tabla `audit_log` genérica con trigger sobre `update`/`delete` en las sensibles: **seis** — `equipo_torneo`, `cuota`, `gasto`, `arqueo`, `activo` y `cheque` (el doc listaba cuatro; las dos últimas también lo tienen).

**No hay `insert`**: el registro se lleva sólo de lo que cambia después de creado, así que un alta no genera evento. `/auditoria` lo dice y no ofrece un badge de INSERT que nunca aparecería.

La pantalla lee de **`v_auditoria`** (migración `20260809171605`), que agrega `campos_cambiados` contando el diff de los dos snapshots **en SQL**. No es un adorno: sin esa columna no se puede filtrar por ella —PostgREST no filtra por algo que no existe en la vista— y hoy **727 de los 865 `update` registrados no cambiaron ningún campo**. Ver la nota de `fn_audit` en `decisiones.md` § Abiertas.

## 8. Decisiones cerradas

No reabrir sin motivo nuevo:

1. **Ingresos por percibido puro**: el asiento nace del cobro, la cuota no devenga. **Gastos siguen por devengo** (dos asientos). Desde el Draft 12 — ver "Decisiones reemplazadas" al pie de esta sección.
2. Fuente única: todo deriva del libro diario.
3. Sin rentabilidad por predio ni por categoría.
4. Efectivo / Transferencia como única terminología.
5. Efectivo y Transferencia son cajas independientes; USD es módulo aparte.
6. IVA en vista simple. Sin discriminación de débito/crédito.
7. Gasto con dos ejes: naturaleza + área.
8. Carga como arancel × cantidad.
9. Estado de cuota en lugar de aging 30/60/90.
10. Arqueo por **fecha + predio** — concretado como `dia_cancha_id` (25). *La segunda mitad de esta decisión, "con ajuste que afecta caja", fue refinada por la 29: el ajuste existe, pero no al arquear.*
11. Estructura permanente sin prorrateo entre torneos.
12. Diferencia de cambio separada del resultado operativo.
13. Categoría de gasto obligatoria; concepto opcional.
14. La deuda no se arrastra entre torneos.
15. Activos con umbral de materialidad; amortización mensual con revisión previa.
16. Amortización siempre a estructura permanente, nunca a un torneo.
17. Endoso de cheques: no se modela.
18. Fondo de inversión sin saldo en Campa: solo rescates y colocaciones.
19. Bar es área del torneo, no unidad de negocio separada.
20. Campa es gestión financiera; la contabilidad formal es del estudio externo.
21. El costo variable tiene **tres unidades**: `por_partido`, `por_dia_cancha`, `por_mes`. `por_jornada` sale del dominio.
22. La unidad es **default en el catálogo, override en la línea** de presupuesto.
23. `dia_cancha (fecha, predio)` es **tabla propia**, compartida entre presupuesto y arqueo. El torneo se deriva.
24. El bar no escala con partidos ni con días de cancha: escala con consumo. Tratamiento propio, pendiente.
25. El arqueo cuelga de **`dia_cancha_id`**, con `unique`. Concreta la 10.
26. **Sin estado contable "en tránsito"**: el arqueo pendiente de entrega *es* el estado, y la plata la tiene su responsable.
27. **`saldo_sistema` se congela** al arquear. El arqueo es acta histórica.
28. **Un solo movimiento contable, al entregar** (Escenario A). El arqueo no mueve plata.
29. **La diferencia se registra; la resolución es diferida** y puede no ocurrir.
30. Se crea la **caja central**, destino del efectivo de los predios.
31. El **formato de instancia** es tabla configurable, no un CHECK con literales.
32. **`crear_playoff`** es la puerta del playoff, con identidad `(serie_id, instancia)`.
33. La **cuota de playoff se genera por instancia jugada**, en un paso posterior a la ficha, desde `equipo_playoff`.
34. Los **partidos de un playoff son dato**, no derivados. La decisión 45 queda acotada a la liga.
35. El **sueldo del socio se devenga** (Forma B) — excepción deliberada al percibido puro.
36. **`GAS_SOCIOS` es egreso propio**: costo del negocio, separado de los sueldos de empleados. Imputado a **estructura permanente** (`torneo_id` NULL), no a un torneo — decisión 5.
37. El **sueldo acordado se versiona con historial**; cambiarlo es insertar, no editar.
38. El **devengo mensual escribe solo**, idempotente por `(socio, período)`.
39. **Retiro de sueldo ≠ rescate del fondo de inversión.** Cuentas y conceptos separados.
40. **Sponsors por devengo lineal** — tercer patrón, distinto de equipos y socios.
41. **Dos calendarios separados**: reconocimiento (P&L, parejo) y cobro (cashflow, cuotas).
42. **`INGRESO_DIFERIDO` es un pasivo que se libera** mes a mes; el último período absorbe el redondeo.
43. **Sponsor a nivel empresa** (`torneo_id` NULL); `DEUDORES_SPONSORS` propia, no la `DEUDORES` genérica.
44. Las **cuotas de cobro de sponsor alimentan el cashflow** vía `v_cuotas_sponsor_futuras`.
45. **USD por promedio ponderado**, derivado y no guardado.
46. **Diferencia de cambio solo realizada**, al vender. `revaluacion` sale del dominio.
47. **El diario es monomoneda**: la cantidad de dólares vive en `usd_operacion`, no en `asiento_linea`.
48. **Cashflow con tres niveles de certeza** —real, comprometido, estimado—, determinados por el estado.
49. **REAL es el movimiento de las cajas agregadas**; los traslados internos se netean solos.
50. **ESTIMADO es el presupuesto distribuido por el calendario**, no un bulto mensual.
51. La **semana se deriva** con `date_trunc`; no hay tabla de semanas.

### Decisiones reemplazadas

Se registran acá con su razonamiento. Una decisión derogada sin explicación es una trampa: el que venga después vuelve a proponerla, o peor, la reimplementa sin saber que ya se descartó.

**Sobre el patrón.** El reconocimiento de ingresos se reformuló dos veces en dos drafts: Opción A → devengo progresivo (Draft 11) → percibido puro (Draft 12). Vale registrar por qué, porque el recorrido explica el destino: las dos primeras versiones discutían **cuándo** devengar, y el problema real era **si** devengar. Ninguna cantidad de precisión en la fecha arreglaba que la fecha misma no significara nada. La tercera es la más simple de las tres y la única que no deja preguntas abiertas.

---

**Devengo progresivo por vencimiento (Camino 2)** · vigente solo en el Draft 11 · reemplazado en el Draft 12.

*Qué decía.* Las cuotas se creaban todas al armar la ficha pero no facturaban nada; cada una se devengaba al vencer (`Deudores` al debe, `Ingresos` al haber, por el monto de esa cuota). La deuda del equipo era su mora. Quedaba abierto qué proceso disparaba cada asiento.

*Por qué se reemplazó.* Porque el devengo no aportaba verdad y sí complejidad:

1. **La fecha de vencimiento es arbitraria.** Se fija por comodidad del cliente al armar el plan de pago, no por un hecho económico: la misma prestación puede vencer en marzo o en mayo según lo que se le acomode al equipo. Devengar contra una fecha elegida por conveniencia comercial no informa mejor el resultado — le da apariencia de precisión a una convención.
2. **El torneo se evalúa por semestre, no por mes.** El corte relevante es el torneo completo. Repartir el ingreso mes a mes dentro del semestre resuelve un problema que nadie tiene, y para el corte que sí importa —el torneo cerrado— devengado y percibido convergen salvo por la mora, que ya se mide aparte.
3. **El costo era concreto.** Obligaba a definir qué disparaba cada asiento, y las tres opciones tenían defecto: la más barata de programar rompía el principio (c). Percibido puro elimina la pregunta en lugar de responderla — el disparador es el pago.

*Qué NO cambió.* Las cuotas se siguen creando todas al armar la ficha y siguen siendo la base del cashflow y de la mora. Lo único que se eliminó es el asiento que emitían al vencer.

*Qué se ganó.* Una vía contable en lugar de dos, y ninguna decisión pendiente. `DEUDORES` deja de intervenir en el circuito de equipos.

---

**Opción A — deuda total al armar la ficha** · vigente Drafts 1–10 · reemplazada en el Draft 11.

*Qué decía.* Armar la ficha de un equipo facturaba el torneo completo de una vez: `Deudores` al debe e `Ingresos` al haber por el total, contra `equipo_torneo.asiento_id`. Desde ese momento el equipo "debía" todo el torneo, y cada pago solo cancelaba `Deudores`.

*Por qué se reemplazó.* Tres razones, en orden de peso:

1. **En la cobranza solo interesa la mora.** Lo que se reclama es lo vencido e impago. Un equipo con diez cuotas y una sola vencida no debe diez cuotas: debe una. Mostrar el total facturado como deuda infla la cartera y vuelve inservible la pantalla de deudores, que es prioridad del dueño.
2. **El cashflow se deriva de la estructura del torneo, no de sumar fichas.** El calendario y el tarifario ya dicen cuánto entra y cuándo (§3.5, §3.18). Devengar todo al inicio no aportaba información de caja —la fecha de cobro sale del vencimiento igual— y a cambio distorsionaba el P&L, cargando el ingreso de un torneo entero al mes en que se armaron las fichas.
3. **Alinea la letra con lo que ya decía el tarifario.** La regla `por_partido` (§3.18) se define como "arancel unitario **devengado por partido jugado**", pero la Opción A lo cobraba todo por adelantado. La contradicción estaba escrita desde antes; el devengo progresivo la resuelve en lugar de sostenerla.

*Qué NO cambió.* Las cuotas se siguen creando todas al armar la ficha (Camino 2): el plan de pago queda cerrado desde el inicio y con eso alcanza para proyectar caja. Lo que cambió es cuándo se reconoce el ingreso, no cuándo se conoce el compromiso.

*Qué quedó abierto.* Qué dispara el asiento de cada cuota al vencer — ver §3.4.

## 9. Abierto

- Nivel de automatización de reclamos: `manual` / `mixto` / `automatico` — a definir con la dirección.
- Proveedor de mail (Resend / Postmark) y dominio de envío.
- Formato fiscal del recibo: si necesita numeración formal o alcanza comprobante interno.
- Comparaciones C3 (torneo vs torneo), C4 (diferencias de caja por responsable) y C5 (inscripción como cobertura de costo fijo): siguen de interés, no priorizadas.


---

## Historial de drafts

Qué cambió en cada versión de este documento, de la más reciente a la más
vieja. **No es el estado del sistema** —para eso está todo lo de arriba— sino
el registro de cómo se llegó: qué se probó, qué se descartó y por qué.

Se lee cuando hay que **cambiar** algo y conviene saber si ya se intentó antes.

## Qué cambió desde el Draft 21

La pieza que integra todo, y **la última grande de backend**. Es mayormente lectura: junta en una línea de tiempo las fuentes que los módulos anteriores ya producen. **Sin estructura nueva.**

**Tres niveles de certeza, automáticos** (§3.10). **REAL** —movimientos de caja del diario—, **COMPROMETIDO** —cuotas de equipos y sponsors, con fecha pactada— y **ESTIMADO** —el presupuesto—. El nivel lo determina el **estado** del flujo, sin clasificación a mano, y **la confianza es una columna del modelo**, no una convención de la pantalla.

**REAL sale de las cajas, no de `ingreso`/`egreso`** (§3.10). Los gastos van por devengo y los sueldos de socios también, así que esas cuentas no son caja. Y **se agregan todas las cajas**, lo que resuelve un problema solo: los traslados predio → central y las compras de USD mueven plata entre dos cuentas de caja, así que en el agregado **suman cero y no ensucian el flujo**.

**ESTIMADO se distribuye por el calendario** (§3.10). `v_presupuesto_total` da un total sin dimensión temporal; se reparte con el calendario que ya existe — `por_partido` en las fechas de las jornadas, `por_dia_cancha` en los días de cancha, `por_mes` parejo. El costo cae donde el calendario dice que ocurre la actividad.

**La semana se deriva de las fechas** (§3.10), con `date_trunc`. Sin tabla de semanas: una semana no es un período contable y no debería serlo.

> **⚠ La anti-duplicación no alcanza del lado de egresos** (§3.10). Funciona sola en ingresos —la cuota cobrada tiene `saldo = 0` y sale de COMPROMETIDO—, pero **ESTIMADO sale del presupuesto, no de los gastos**: pagar un gasto no achica el presupuesto, así que 100.000 presupuestados y 100.000 pagados en el mismo mes darían **200.000**. La asimetría es de fondo: una cuota es un compromiso individual con estado; una línea de presupuesto es un agregado sin estado. **Resolución propuesta:** cortar la línea de tiempo por fecha —pasado REAL, futuro proyectado—, que hace la exclusión estructural. Se cierra al construir.

**§3.10 se reemplaza por completo.** La `v_flujo_proyectado` que documentaba **no existía**, y su SQL **no compilaría**: referencia `cat_gasto.grupo`, `presupuesto_linea.monto_mensual`/`cantidad_x_fecha` y `jornada.torneo_id`, todo eliminado. Cuarta aparición del drift doc↔schema, y la más grande porque parecía código construido.

---

## Qué cambió desde el Draft 20

Tercer módulo de la capa societaria, y **el más liviano: no se crea estructura**. La tabla `usd_operacion`, la caja USD y las cuentas `CAJA_USD` y `FIN_DIF_CAMBIO` ya existían desde el schema inicial, sin uso. Solo faltaba la lógica.

**El diario es monomoneda, y se explicita como principio** (§3.7). `asiento_linea` no tiene moneda ni cantidad, y no hay ninguna columna de divisa en el schema. La complejidad del dólar queda **aislada en `usd_operacion`**: la **tenencia** sale de ahí, el **costo en libros** del diario, y el PPP es el puente. Ya estaba así; ahora está dicho.

**Valuación por promedio ponderado** (§3.7). `costo_libros / tenencia_usd`, **derivado y no guardado**. Se mantiene solo: al vender, `CAJA_USD` baja exactamente por el costo de salida, así que lo que queda conserva el promedio.

**La diferencia de cambio es solo realizada** (§3.7). Los dólares quedan a su costo hasta que se venden; nada de ganancias en papel. **`revaluacion` sale del dominio** de `usd_operacion.tipo` — un valor que el modelo no usa es una trampa, misma limpieza que `por_jornada` en la pieza 5. Esto **reemplaza** la fila "Revaluación → no realizado" que §3.7 traía del schema original.

> **Dos cosas que el relevamiento encontró.** `FIN_DIF_CAMBIO` es de tipo `financiero`, y durante meses **ninguna vista la leía**: la diferencia de cambio se registraba sin aparecer en pantalla. *Resuelto:* `v_pl_mensual` la incluye y `/resultados` la muestra como bloque propio, «Resultado financiero», separada de los ingresos operativos — que es lo que pedía la decisión 12: una suba del dólar no debe leerse como que el torneo funcionó mejor. Y el promedio cruza **dos fuentes**: si alguien asienta contra `CAJA_USD` sin registrar la operación, el promedio queda mal **en silencio** y todas las ventas posteriores salen a un costo equivocado.

---

## Qué cambió desde el Draft 19

Segundo módulo de la capa societaria.

**Devengo lineal · el tercer patrón de reconocimiento** (§3.20). Equipos por percibido puro, socios por devengo mensual de un fijo, sponsors por **devengo lineal prorrateado**: el contrato se reconoce repartido en los meses que cubre. Tres naturalezas distintas, tres tratamientos, cada uno argumentado.

**Dos calendarios separados** (§3.20). El **reconocimiento** es parejo y mensual —responde *cuánto ganó el negocio este mes*—; el **cobro** son las cuotas en sus fechas —responde *cuándo entra la plata*—. Un contrato de 1.200.000 reconoce 100.000 por mes y puede cobrarse en tres cuotas de 400.000. Colapsarlos obligaría a mentir en una de las dos preguntas.

**Ingreso diferido como pasivo que se libera** (§3.20). Al firmar se asienta `DEUDORES_SPONSORS` / `INGRESO_DIFERIDO` **sin tocar el P&L**: se firmó, no se ganó nada aún. Cada mes el devengo libera una porción contra `ING_SPONSORS`.

**De las tres cuentas, una ya existía.** `ING_SPONSORS` está en el plan desde el schema inicial, sin uso. Se crean `DEUDORES_SPONSORS` e `INGRESO_DIFERIDO`. **Cuenta de deudores propia y no la `DEUDORES` genérica**: ésa se diseñó para equipos y la decisión 1 la sacó de juego, así que reusarla mezclaría deuda de equipos —que no es saldo contable— con deuda de sponsors, que sí lo es.

**Nivel empresa, `torneo_id = NULL`** (§3.20), como los sueldos de socios. El contrato es anual y cubre los dos torneos. **Consecuencia a tener presente:** el ingreso de sponsors no entra en la contribución de ningún torneo. Desde que el resultado se mira a nivel empresa (§3.2) eso dejó de ser un problema de lectura: no hay pantalla que compare torneos.

> **Un detalle que parece menor y no lo es** (§3.20). `total / meses` no siempre da exacto: 1.000.000 en 12 meses deja 0,04 huérfanos, y `INGRESO_DIFERIDO` nunca cerraría en cero. **El último período devenga el remanente** en vez de la cuota teórica, así el pasivo cierra exacto por construcción.

---

## Qué cambió desde el Draft 18

Primer módulo posterior al rediseño calendario-por-serie. Introduce **dos patrones que el sistema no tenía**.

**El sueldo del socio se devenga — Forma B** (§3.19). Es la **excepción deliberada al percibido puro** de §1.b, y no una inconsistencia: el ingreso de un equipo puede no ocurrir nunca, pero el sueldo del socio es un compromiso cierto que existe cada mes se retire o no. No registrarlo hace que **la caja parezca toda del negocio cuando parte ya está comprometida**.

**Dos cuentas nuevas: `GAS_SOCIOS` (egreso) y `SOCIOS_A_PAGAR` (pasivo)** (§3.19). Egreso y no patrimonio: el sueldo de socios es **costo del negocio**. Cuenta propia separada de `GAS_SUELDOS` para poder distinguir el sueldo operativo del de los dueños. **Ninguna vista se toca**: el P&L filtra por tipo de cuenta, así que `GAS_SOCIOS` entra y el pasivo no.

**Es costo de la empresa, no del torneo** (§3.19). El asiento va con `torneo_id = NULL`, a nivel estructura permanente: el sueldo existe todos los meses haya torneo o no, e imputarlo a uno exigiría el prorrateo que la **decisión 5** prohíbe. La contribución de cada torneo queda intacta; lo que baja es el resultado de la empresa.

**El sueldo acordado se versiona con historial** (§3.19). **Primer parámetro versionado de verdad**: `config_contable` tiene `vigente_desde` pero es una fila única sin historial —y no la lee nadie—, así que no servía de molde. Cambiar el sueldo es insertar una fila, no editar: es lo que permite recalcular un mes viejo con el sueldo que regía entonces.

**El devengo mensual escribe solo** (§3.19). **Rompe con el único precedente** de proceso mensual: `proponer_amortizaciones` propone y el operador confirma (decisión 23), porque una amortización es una estimación. El sueldo es un monto acordado y conocido — no hay nada que revisar. Idempotente por `(socio, período)` y disparado explícitamente, no por cron.

**El retiro de sueldo no se mezcla con el fondo de inversión** (§3.15, §3.19). El fondo ya modela plata de socios en el sentido contrario. Uno cancela un pasivo devengado, el otro mueve respaldo: cuentas y conceptos separados, o `v_dependencia_fondo` deja de significar lo que dice.

---

## Qué cambió desde el Draft 17

**Los playoffs ya colgaban de serie** (§3.5). La pieza 1 movió *toda* `jornada`, no solo la liga. La pieza 6 **no mueve nada**: cierra tres agujeros que quedaron abiertos porque la rama `es_playoff` nunca se ejercitó — no hay puerta de creación (`crear_jornada` hardcodea `es_playoff = false`), el `unique (serie_id, numero)` no protege playoffs porque `numero` es `NULL`, e `instancia` no tiene dominio.

**El formato de instancia es una tabla, no un CHECK** (§3.5). `formato_instancia (nombre, cantidad_partidos, orden)`, sembrada con cuartos=4 / semifinal=2 / final=1. Cerrarlo con literales sería violar la regla 12: otro torneo puede tener octavos, repechaje o final a ida y vuelta, y tiene que entrar con sus datos sin tocar código.

**`crear_playoff` es la cuarta puerta** (§3.5). Extiende la decisión 49 al playoff. Valida contra el formato y contra `(serie_id, instancia)`, que es la identidad natural que faltaba. `mover_jornada` y `suspender_jornada` ya servían.

**`equipo_playoff` — quién juega cada instancia** (§3.5). En la liga juegan todos los de la serie siempre; en playoff **la clasificación es dato** y no se deriva de nada. Sin esa tabla no hay a quién cobrarle.

**La cuota de playoff se genera después de la ficha, por instancia jugada** (§3.5). B0 sigue excluyéndolas y está bien: al armar la ficha no se sabe si el equipo va a clasificar, y facturarle a 16 equipos una final que juegan 2 sería inventar deuda. Se cobra lo que se juega a medida que se juega.

> **⚠ Bug latente que esta pieza destapa** (§3.3, §3.5). `v_torneo_escala.partidos` calcula `equipos ÷ 2` por jornada **sin excluir playoffs**: la final de Libre A daría 8 partidos en vez de 1. Con 3 instancias × 20 series el presupuesto `por_partido` se infla mucho y **en silencio** — misma clase que la bomba del 284. Hoy no molesta porque hay 0 playoffs. **La decisión 45 queda acotada a la liga**: en un cuadro la cantidad de partidos depende del formato, no del tamaño de la serie.

---

## Qué cambió desde el Draft 16

**El arqueo cuelga de `dia_cancha`** (§3.6). `jornada_id` + `predio_id` → `dia_cancha_id`, más el `unique` que hoy falta. Implementa la decisión 46, que estaba escrita en presente sin estar construida. La tabla tiene 0 filas y ningún consumidor: no hay backfill.

**El efectivo se consolida en dos etapas** (§3.6). Cobro y arqueo pasan el fin de semana en el predio; la entrega a central es el lunes. **No hay estado contable intermedio "en tránsito"**: el arqueo pendiente *es* el estado, y el saldo sin rendir de una persona sale de sumar sus arqueos pendientes. Inventarle una cuenta sería modelar un pasivo que se resuelve solo el lunes.

**Escenario A: la plata baja al entregar, no al arquear** (§3.6). Un único asiento predio → central en la entrega. **El arqueo del fin de semana es control puro y no mueve plata.**

**`saldo_sistema` se congela** (§3.6). El arqueo es un acta histórica: si mañana se corrige un asiento viejo, el saldo esperado de ese arqueo no cambia. Se deriva del diario al calcularlo; lo que se guarda es la foto.

**La diferencia se registra, no se resuelve** (§3.6). Faltante o sobrante quedan asentados y ahí se detienen. Quién se hace cargo es un paso posterior, y puede no ocurrir nunca. **Reemplaza** al criterio anterior, que la resolvía con un asiento como parte del arqueo.

> **Dos bloqueos estructurales encontrados al relevar** (§3.6). El asiento predio → central **no se puede expresar hoy**: `asiento_linea` no tiene `predio_id` —el predio está en la cabecera—, así que con una sola cuenta `CAJA_EFECTIVO` las dos líneas del traslado se netean a cero y el saldo del predio no baja. Y `check_caja_predio` rechaza una caja de efectivo sin predio, que es exactamente lo que sería la central. La salida propuesta es una cuenta `CAJA_CENTRAL` propia; se cierra al construir.

**Correcciones doc↔schema** (§3.6). `caja` se documentaba como `(id, tipo unique)` y la tabla real siempre fue `(id, tipo, nombre, predio_id, activo)` — `tipo` no es único porque hay una caja de efectivo por predio. Y `arqueo` se documentaba con `fecha date not null`, que nunca existió. **Tercera aparición del mismo patrón** (antes: `presupuesto_linea`): conviene una pasada de verificación doc↔schema.

---

## Qué cambió desde el Draft 15

**El costo variable tiene tres unidades, y `por_jornada` no es ninguna de ellas** (§3.3). `por_jornada` **sale del dominio**: era la unidad correcta cuando una jornada era la fecha N de un género, y dejó de serlo cuando pasó a ser la fecha N de una serie. La reemplazan **`por_partido`** y **`por_dia_cancha`**. `por_mes`, `anual` y `unico` no se tocan.

**La unidad vive en el catálogo, con override en la línea** (§3.3). Un concepto tiene *naturalmente* su unidad —un arbitraje es por partido, siempre— así que el default va en `cat_gasto`/`concepto_gasto` y se hereda. La línea de presupuesto puede sobrescribirlo para el caso raro. Sin el default, cada línea nueva vuelve a decidir algo que ya estaba decidido, y basta una mal cargada para que el total se corra.

**`dia_cancha` es una tabla propia** (§3.5). La entidad `(fecha, predio)` que el Draft 15 nombró no existía en la base: `jornada` no tiene predio, y las únicas tablas con fecha *y* predio son de movimiento —`asiento`, `gasto`, `pago`—. No se puede contar los días de cancha de un torneo mirando los gastos ya cargados. **Es compartida**: el presupuesto la cuenta, el arqueo (§3.6) cuelga de ella. Una sola definición de "día de operación de un predio", no dos.

**Se desarma la bomba de `v_presupuesto_total`** (§3.8). Hoy multiplica por `count(*) from jornada … estado <> 'suspendida'`. Con jornadas por género daba 28; con jornadas por serie da **284**. Un presupuesto se habría mostrado **diez veces más grande** sin que nada fallara ni avisara. Pasa a multiplicar por la unidad que corresponde a cada línea. **Las tablas de presupuesto están vacías** —0 filas en `presupuesto`, `presupuesto_linea` y `gasto`—, así que se arregla antes de que exista el primer número mal.

**Clasificación inicial de las 16 categorías `por_fecha`** (§3.3): 3 por partido, 8 por día de cancha, 5 aparte (4 de bar + 1 de administración). El bar no escala con partidos ni con días de cancha —escala con consumo— y tiene su propio tratamiento.

---

## Qué cambió desde el Draft 14

**Gestión de jornadas por funciones validadas** (§3.5). `crear_jornada`, `mover_jornada` y `suspender_jornada`. **Una lógica, dos puertas**: el seed que carga el Clausura y el módulo de calendario que vendrá después llaman a las mismas funciones. No hay dos caminos que validen distinto. Son agnósticas del torneo (regla 12): reciben serie, número y fecha.

**La autonomía de la cuota es parcial** (§3.4). Refina la decisión 41 sin contradecirla: el **monto** se copia siempre, pero el **vencimiento** solo en las cuotas fijas. La cuota de liga lo **deriva de `jornada.fecha`** en vivo. La inscripción vence un día administrativo fijo; la de liga vence cuando se juega esa fecha, y esa fecha puede moverse.

**Suspender una jornada saca su cuota del circuito de cobro** (§3.5). Un equipo cuya fecha se suspendió **no es moroso de esa cuota**: no se jugó, no corresponde reclamarla. Vuelve al circuito al reprogramar, con el vencimiento nuevo.

**Las vistas de deuda tienen que distinguir los dos tipos de cuota.** Fija por `vence_at` propio; de liga derivando de la jornada y excluyendo las suspendidas. Es el punto de la pieza que más cuidado necesita: si una vista se olvida, un equipo aparece debiendo algo que nadie le va a cobrar.

**Queda por resolver al construir:** `cuota.vence_at` es hoy `NOT NULL`. Derivar el vencimiento obliga a elegir entre dejarlo nulo para las cuotas de liga —fuente única— o mantenerlo como caché sincronizada por trigger.

**Construido.** Pieza 2 del rediseño, migración `20260801131425_gestion_jornadas.sql`: las funciones, los cambios de vista y el seed de las 284 jornadas se aplicaron juntos.

---

## Qué cambió desde el Draft 13

**La jornada cuelga de la serie, no del género.** Identidad `(serie_id, numero)`; el género y el torneo se derivan subiendo `serie → categoria`. El modelo anterior no podía representar el calendario real: distintas series del mismo género juegan la misma fecha en días distintos —Libre A su fecha 3 el 15/8, +35 B el 29/8— y `(torneo, genero, numero)` colapsaba fechas que en la realidad difieren. **Clausura 2026: 284 jornadas** en lugar de 28.

**Fecha de calendario ≠ jornada.** Una *fecha* es un día concreto en el que juegan muchas series; una *jornada* es la fecha N de **una** serie. 29 fechas, 284 jornadas en el Clausura. De ahí emerge `(fecha, predio)` —el día de operación de un predio— como entidad natural.

**Tres unidades de costo variable** (§3.3). Los gastos `por_fecha` dejan de escalar todos igual: **por partido** (árbitros, veedores, ballboys — se multiplica por `equipos ÷ 2`), **por día de cancha** (fotografía — 1 por `(fecha, predio)`) y **fijo mensual**. Un sábado con 6 series en un predio son 48 arbitrajes y un solo servicio de fotografía.

**El arqueo cuelga de `(fecha, predio)`**, no de la jornada. Controla la caja física de un predio en un día, y ese día jugaron varias series: la plata no distingue de cuál vino.

**Playoffs también por serie.** La final de Libre A y la de Libre B son jornadas distintas. No están en el calendario validado —no tienen fecha aún— y se cargan cuando se definan.

**⚠ `v_presupuesto_total` — la pieza 5 tiene que llegar antes que el primer presupuesto cargado.** La vista cuenta jornadas del torneo sin distinguir la unidad del costo. Con jornadas por género daba 28; con jornadas por serie da **284**. Un presupuesto `por_jornada` se multiplicaría por diez **sin fallar ni avisar** — no es un error de schema, es un número diez veces más grande en pantalla.

La bomba se arma en la **pieza 2**, cuando se cargue la grilla: hoy la vista da 0 porque `jornada` está vacía. La desarma la **pieza 5**, implementando las tres unidades (decisión 44). Entre una y otra, cualquier presupuesto que se cargue va a estar mal. Las tablas `presupuesto` y `presupuesto_linea` están vacías hoy, así que todavía no hay ningún número incorrecto — pero es una ventana que hay que cerrar antes de abrirla.

**La PK de `jornada` no cambia.** Sigue siendo `id`, así que las siete FKs que la apuntan —`asiento`, `pago`, `gasto`, `arqueo`, `cuota`, `plan_tarifa_linea.hito_jornada_id` y el `reprograma_a` propio— no se tocan. Cambia la identidad natural y la columna.

**Construido, las seis piezas.** `jornada` cuelga de serie (`20260801121708`), gestión de jornadas (`20260801131425`), la rama `por_partido` de B0 ejercitada por primera vez, unidades de costo y `dia_cancha` (`20260802075345`, `20260802075631`), arqueo y consolidación (`20260802094852`, `20260802095023`) y playoffs por serie (`20260802103856`). La base tiene las 284 jornadas del Clausura y 58 días de cancha.

---

## Qué cambió desde el Draft 12

**Capa nueva en el modelo: `categoria` → `serie`.** Catálogos por torneo, clonados del anterior al crear uno nuevo. La jerarquía pasa a ser `torneo → categoria → serie → equipo_torneo`. **El género es atributo de la categoría**, no del equipo ni del tercero: Libre/+30/+40 son masculinas, Femenino/Flex femeninas.

**`equipo_torneo.categoria` deja de ser texto libre.** El `'+40 A'` de string suelto se reemplaza por `serie_id`, FK al nivel más específico; categoría y género se derivan subiendo. Sale también `modalidad` —su `CHECK` quedó de un modelo anterior al tarifario y no alcanza para expresar las dos elecciones que exige el plan—, reemplazada por una FK a `plan_tarifa` por concepto.

**Traducción de tarifario a cuotas, definida.** El motor de generación mira la **regla** de cada línea, no el concepto: `fecha_fija` → 1 cuota con fecha propia, `por_partido` de liga → una cuota por fecha atada a la jornada, `bloque_adelantado` → 1 cuota con el total, playoffs → ninguna. El concepto solo se usa después, para rutear el asiento del cobro.

**La cobranza queda atada al calendario.** Las cuotas `por_partido` vencen con su jornada y se mueven si se reprograma. Mover una jornada recalcula el cashflow proyectado y los vencimientos de equipo desde la misma fuente — principio (i) alcanzando a la cobranza.

**El monto se copia, no se lee.** El tarifario es el molde; la cuota, la pieza ya fundida. Editar el tarifario no recalcula cuotas ya generadas, y una cuota puntual se puede ajustar a mano sin marca especial.

Todo esto está en §3.4, y **está construido**: estructura → ficha (B0) → cobro, en ese orden porque cada bloque necesitaba al anterior. Hoy corre con datos reales — 7 categorías, 21 series, 34 fichas, 297 cuotas y 20 pagos.

---

## Qué cambió desde el Draft 11

**Ingresos por percibido puro.** El único evento que genera ingreso contable es el pago: `Caja` al debe, `Ingresos` al haber. Las cuotas **no generan ningún asiento** — quedan como términos de pago: cronograma, mora y base del cashflow. `DEUDORES` sale del circuito de equipos. La cuota hereda el concepto (inscripción / partidos) de la línea del plan, que es lo que resuelve a qué cuenta de ingreso se imputa el cobro.

**⚠ El cambio es asimétrico.** Pasan a percibido **los ingresos**. Los **gastos siguen por devengo**, con sus dos asientos —devengo al cargar, pago al pagar— sin ninguna modificación (§3.3, regla 7 de CLAUDE.md, decisión 12). Un reemplazo ciego de la palabra "devengo" rompería el modelo de gastos. Consecuencia: para ingresos el P&L y la caja muestran lo mismo; para gastos siguen contando cosas distintas.

**Se cierra la pregunta abierta del Draft 11.** Qué disparaba el asiento de devengo dejó de tener sentido: el disparador es el pago. El bloque de §3.4 se eliminó.

Toca el principio (b), el (h), §3.3, §3.4, §3.10, §3.17, §3.18, §5 y la decisión cerrada 1. El razonamiento —y qué decía cada versión anterior— queda en §8 → Decisiones reemplazadas, que ahora registra las dos vueltas.

Nada de esto está implementado todavía: es cambio de documentación. El código y las vistas siguen sin implementar ningún reconocimiento de ingresos — `crear_asiento()` no se invoca desde ninguna función de negocio, así que hoy no hay ni percibido ni devengado.

---

## Qué cambió desde el Draft 10

> **⚠ Superado por el Draft 12.** El devengo progresivo que se describe acá duró un solo draft: los ingresos pasaron a percibido puro. Se conserva como registro de lo que se decidió entonces. El razonamiento del cambio está en §8.

**Devengo progresivo por vencimiento (Camino 2).** Reemplaza a la Opción A, que facturaba el torneo completo al armar la ficha. Ahora las cuotas se siguen creando todas juntas —el plan de pago queda cerrado desde el inicio— pero cada una se devenga al vencer. **La deuda de un equipo es su mora**: cuotas vencidas e impagas. El cashflow se deriva de la estructura de vencimientos, no de sumar fichas. Toca el principio (b), §3.4, §3.18, §5 y la decisión cerrada 1. El razonamiento del cambio, y qué decía la decisión anterior, quedan registrados en §8 → Decisiones reemplazadas.

**Abierto: qué dispara el asiento de devengo** (§3.4). El principio dice que cada cuota se devenga al vencer, pero no qué genera ese asiento. Tres opciones —proceso agendado, devengo perezoso, devengo por jornada— con un trade-off que toca el principio (c). **Hay que definirlo antes de implementar B0.**

Nada de esto está implementado todavía: es cambio de documentación. El código y las vistas siguen calculando como en el Draft 10.

---

## Qué cambió desde el Draft 7

Las migraciones 002 y 003 modificaron el modelo. Este documento refleja el estado real.

**Integridad de períodos** (002). La fecha del asiento se valida contra su período; un período cerrado no se puede reabrir; `cerrado_por` y `cerrado_at` se completan solos.

**Pagos parciales** (002). Tabla `pago_imputacion`: un pago se reparte entre varias cuotas, una cuota recibe varios pagos. `cuota.pagado_at` pasa a ser derivado.

**Caja por predio** (002). Efectivo tiene una caja por predio; transferencia y USD son globales. El arqueo es por jornada + predio.

**Deuda por equipo** (003). La deuda se consolida por tercero, no por torneo. `v_deuda_equipo` y `v_deuda_detalle`.

> **Y por eso `v_deuda_equipo` no se puede filtrar por torneo** (`20260812114152`). No tiene `torneo_id`, y agregárselo sería peor: filtraría las FILAS dejando los MONTOS de todos los torneos sumados — un equipo que debe $10,5M en un torneo y $11,1M en otro aparecería, filtrado por el primero, mostrando $21,6M. Plausible y falso.
>
> La pregunta con el otro grano la contesta **`v_deuda_equipo_torneo`**: una fila por equipo **y torneo**, con los montos restringidos a ese torneo y los mismos criterios de impago y vencido. `/cobranza` usa una u otra según haya filtro.
>
> **Con una excepción que es puro concepto 5:** `saldo_a_favor` **no** se restringe al torneo. Un anticipo es del equipo y no tiene torneo — esa es su definición. Se repite en cada fila y **no se suma entre filas**; la pantalla lo muestra por fila y nunca lo totaliza.

**Imputación elegida** (003). `sugerir_imputacion()` propone —priorizando el torneo en curso— e `imputar_pago()` guarda lo que eligió el operador. `imputar_pago_automatico()` queda deprecada: decidía sola en casos ambiguos y podía dejar a un equipo impago en el torneo en curso.

**Anticipos** (003). El sobrante de un pago queda como saldo a favor del equipo. No expira ni se pierde al cambiar de torneo.

---

## Qué cambió desde el Draft 6

**Reenfoque financiero.** Decisión del dueño: el foco es financiero, no contable. El libro diario baja a `Configuración → Registro de movimientos`; el P&L pasa a llamarse Resultados y se reordena por pregunta de negocio. Salen del alcance el IVA discriminado, el plan de cuentas como pantalla y el balance patrimonial.

**Prioridades confirmadas del dueño**, en este orden:
1. Previsión de caja a 6-12 meses con escenarios
2. Cobranza: cuánto falta cobrar y cuándo entra
3. Rentabilidad real por torneo
4. Punto de equilibrio

Las dos primeras son la misma pregunta —cuándo entra la plata— y la cobranza alimenta la previsión, así que reforzar una mejora la otra.

**Rediseño de la estructura de gastos.** `cat_gasto.grupo` se reemplaza por dos ejes independientes: `naturaleza` (por_fecha / recurrente / eventual / inversion) y `area` (torneo / predio / bar / administracion). Resuelve el hueco del gasto eventual —mantenimiento, compras de predio— que el modelo anterior no podía representar.

**Activos y amortización.** Compras grandes se activan y amortizan mensualmente, con umbral de materialidad para no ahogar la carga.

**Compromisos, cheques y fondo de inversión.** Tres tipos de obligación que faltaban: cuotas de moratoria, cheques emitidos, facturas con vencimiento. Más el calendario de pagos que los integra.

---
