# Campa — Arquitectura

**Versión:** Draft 11 · julio 2026 · devengo progresivo por vencimiento reemplaza a la Opción A (deuda total al armar la ficha)
**Referencias:** `supabase/migrations/` (esquema ejecutable) · `CLAUDE.md` (reglas) · `docs/decisiones.md`
**Stack:** Next.js 15 (App Router + TypeScript) · Tailwind · Supabase (Postgres + Auth + RLS) · Vercel

**Alcance.** Campa es una herramienta de **gestión financiera** para la operación de un torneo de fútbol amateur. Reemplaza cinco planillas de Excel por una fuente única de datos.

**Lo que Campa no es.** No es un sistema contable. La contabilidad formal —balance, liquidación de IVA, amortizaciones fiscales— la hace un estudio externo. Campa incorpora los criterios contables que **afectan la lectura financiera** y descarta los que solo sirven para el balance.

La partida doble está por debajo de todo el sistema, pero como **garantía de consistencia**, no como producto: es lo que impide que dos pantallas muestren números distintos.

## Qué cambió desde el Draft 10

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

## 1. Principios de diseño

**a. La Fecha es la unidad operativa central, no el mes.** Cada jornada (`Fecha 9 · Masculino · 14-jun`) es la unidad contra la que se cargan ingresos de equipos y egresos operativos. El mes es una vista derivada, no la unidad de trabajo.

**b. El ingreso se reconoce por devengo progresivo.** Armar la ficha fija el plan de pago completo —todas las `cuota` se crean juntas, con su `vence_at`— pero **no** factura el torneo entero. Cada cuota se devenga al vencer: `Deudores` al debe, `Ingresos` al haber, por el monto de esa cuota. Cada pago posterior **solo cancela Deudores** — `Ingresos` no se vuelve a tocar. Lo que aún no venció no es deuda ni ingreso: es compromiso futuro, y de ahí —de la estructura de vencimientos, no de la suma de fichas— sale la previsión de caja (§3.10). **La deuda de un equipo es su mora**: cuotas vencidas e impagas. El P&L muestra lo devengado a la fecha; la caja, lo percibido; la diferencia son cuentas por cobrar y se etiqueta como tal, nunca se presenta como un error de cuadratura. *Reemplaza la Opción A (deuda total al armar la ficha), vigente hasta el Draft 10 — el razonamiento del cambio está en §8.*

**c. Una sola fuente de verdad: el libro diario.** Ninguna pantalla calcula su propio número. Toda cifra visible se deriva de `asiento_linea`. Es la regla más importante de la arquitectura: es lo que hace que el sistema no reproduzca el problema del Excel, donde cada planilla llegaba a un total distinto.

**d. El negocio es unificado; los predios son logística.** No hay rentabilidad por predio ni por categoría. Repartir costos compartidos exigiría un criterio arbitrario. Los predios se usan para arqueo de caja y organización operativa, no como centros de resultado.

**e. Terminología: Efectivo y Transferencia.** Nunca "declarable/no declarable", "blanco/negro" ni equivalentes, ni en UI ni en comunicación ni en nombres de tablas.

**f. La empresa es la entidad contable; los torneos son centros de resultado.** Todo asiento pertenece a un ejercicio; algunos además pertenecen a un torneo. Lo que no pertenece a ninguno es **estructura permanente** y se resta una sola vez del resultado de la empresa. Prorratearla entre torneos volvería a introducir números que nadie puede defender.

**g. El catálogo de gastos es infraestructura, no configuración cosmética.** Categoría obligatoria, concepto opcional (del catálogo o texto libre). Presupuesto y gasto real comparten categoría, y por eso el desvío se calcula solo. La categoría tiene **dos ejes**: naturaleza (cómo se carga y presupuesta) y área (a quién se imputa).

**h. La previsión distingue hechos de supuestos.** Comprometido (deuda devengada con vencimiento) y recurrente (gasto fijo mensual) son hechos. Estimado (proyección de presupuesto y calendario) es supuesto. Se muestran diferenciados.

**i. El calendario es el motor de la previsión.** Suspender o mover una jornada recalcula el bloque estimado de esa fecha, sin tocar lo comprometido ni lo recurrente.

**j. Los compromisos de pago son más ciertos que los de cobro.** Un cheque emitido se debita sí o sí en su fecha; una cuota de equipo puede pagarse tarde. La proyección no aplica la misma tasa de cumplimiento a los dos lados.

**k. La contabilidad de Campa es de gestión, no fiscal.** Si el estudio amortiza un bien en 10 años por tabla fiscal pero en la cancha dura 5, en Campa se usan 5. Los dos sistemas son paralelos y no necesitan cuadrar entre sí.

---

## 2. Roles

| Rol | Alcance |
|---|---|
| `admin` | Todo. Guille y Agus (socios/dueños). |
| `operador` | Carga diaria: pagos, gastos de fecha, arqueos. Sin configuración ni societario. Mati. |
| `administracion` | Solo lectura sobre toda la operación y las finanzas. Puede exportar y cerrar períodos. Yas. |
| `encargado_bar` | Solo el módulo Bar, y solo su predio. Augusto. |

Nota: el rol antes llamado `contador` se renombra a `administracion`. La distinción importa: es un perfil de control, de solo lectura sobre la operación, sin capacidad de modificar asientos.

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

Las tres vistas del negocio salen de agrupar por esa columna:

```sql
-- Contribución por torneo y estructura permanente
create view v_resultado_producto as
select
  e.anio,
  coalesce(t.nombre, 'Estructura permanente') as producto,
  sum(case when c.tipo = 'ingreso' then l.haber - l.debe else 0 end) as ingresos,
  sum(case when c.tipo = 'egreso'  then l.debe  - l.haber else 0 end) as egresos,
  sum(case when c.tipo = 'ingreso' then l.haber - l.debe else 0 end)
  - sum(case when c.tipo = 'egreso' then l.debe - l.haber else 0 end) as contribucion
from asiento a
join periodo p       on p.id = a.periodo_id
join ejercicio e     on e.id = p.ejercicio_id
join asiento_linea l on l.asiento_id = a.id
join cuenta c        on c.id = l.cuenta_id
left join torneo t   on t.id = a.torneo_id
where a.anulado_por is null and c.tipo in ('ingreso','egreso')
group by e.anio, coalesce(t.nombre, 'Estructura permanente');
```

**Regla:** la estructura permanente no se prorratea. Ni por cantidad de equipos, ni por meses, ni mitad y mitad. Se resta una sola vez del resultado de la empresa.

### 3.3 Catálogo de gastos — dos ejes

Sale de `gastos_campa.xlsx`: 34 categorías y 111 conceptos, remapeados a dos dimensiones independientes.

**Eje 1 · Naturaleza** — determina cómo se carga, se presupuesta y se proyecta al flujo:

| Naturaleza | Se ancla a | Presupuesto | Ejemplos |
|---|---|---|---|
| `por_fecha` | jornada + predio | arancel × cantidad × jornadas | Árbitros, veedores, ballboys |
| `recurrente` | mes | monto mensual × meses | Alquileres, sueldos, EPEC |
| `eventual` | fecha calendario | monto anual por categoría | Mantenimiento, compras de predio |
| `inversion` | fecha + activo | monto + vida útil | Desmalezadora, arcos, heladera |

**Eje 2 · Área** — determina a quién se imputa: `torneo` · `predio` · `bar` · `administracion`.

**Por qué dos ejes y no uno.** El modelo anterior usaba `grupo ∈ {fecha, recurrente, bar}`, que mezclaba temporalidad con área. El sueldo del encargado de bar es recurrente y de área bar; el hielo de la jornada es por fecha y de área bar; una heladera es inversión y de área bar. Los tres caían en `grupo='bar'` y no se podían presupuestar con la lógica correcta.

Ver `campa_schema.sql` §3 para el DDL y `seed.sql` para el contenido completo.

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

Separarlos permite que el P&L y la caja cuenten cosas distintas sin contradecirse.

**Coherencia forzada en base.** El trigger `check_gasto_coherente` valida que la naturaleza y el anclaje sean consistentes: un gasto `por_fecha` exige jornada, uno `recurrente` no puede tener torneo, uno `inversion` exige activo.

### 3.4 Terceros y cuentas corrientes

Equipos, sponsors y socios comparten la misma mecánica: débitos, créditos, saldo. Se modelan como un solo tipo con discriminante.

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
  categoria      text not null,          -- '+40 A', 'Libre B', 'Femenino'
  modalidad      text not null,          -- cuotas | unitario | cinco_fechas
  responsable_id uuid references auth.users(id),
  total_facturado numeric(16,2) not null,       -- suma de las cuotas (trigger); NO es la deuda
  asiento_id     uuid references asiento(id),   -- ver nota: con devengo progresivo ya no es único
  unique (tercero_id, torneo_id)
);

create table cuota (
  id                uuid primary key default gen_random_uuid(),
  equipo_torneo_id  uuid not null references equipo_torneo(id) on delete cascade,
  numero            int not null,
  vence_at          date not null,
  monto             numeric(16,2) not null,
  pagado_at         date,
  unique (equipo_torneo_id, numero)
);
```

**`total_facturado` no es la deuda.** Es la suma de las cuotas, mantenida por trigger (`sync_total_facturado`, decisión 27). Con devengo progresivo mide el tamaño del plan de pago, no lo que el equipo debe hoy. **La deuda es la mora**: cuotas con `vence_at < current_date` y sin cancelar. Es el número que se reclama.

**`equipo_torneo.asiento_id` quedó desalineado.** Nació para apuntar al asiento único del devengo total. Con devengo progresivo hay un asiento por cuota, así que una FK en la ficha ya no lo representa: la referencia al asiento correspondería a `cuota`. La columna se mantiene por ahora —nada la escribe todavía, B0 no está implementado— y se resuelve junto con el disparador del devengo, acá abajo.

**Estado de cobranza — calculado, no almacenado:**

```sql
create view v_estado_cuota as
select c.*,
  case
    when c.pagado_at is not null            then 'al_dia'
    when c.vence_at < current_date          then 'cuota_vencida'
    when c.vence_at <= current_date + 7     then 'proxima_a_vencer'
    else 'al_dia'
  end as estado
from cuota c;
```

No se usan tramos de antigüedad 30/60/90: el vencimiento lo define la modalidad de pago del equipo, así que la antigüedad genérica no significa nada acá.

**⚠ ABIERTO — qué dispara el asiento de devengo.** El principio (b) dice que cada cuota se devenga al vencer, pero **no está definido qué genera ese asiento**. No es un detalle de implementación: las tres opciones tienen consecuencias distintas sobre el principio (c).

| Opción | A favor | En contra |
|---|---|---|
| **Proceso agendado** (cron diario) | Genera asientos reales; respeta el principio (c) —el diario es la fuente única— y mantiene la deuda al día sola | Hay que montar un proceso programado (`pg_cron` o scheduled function) y monitorearlo |
| **Devengo perezoso** (calculado al leer) | El más simple de programar; sin infraestructura nueva | **Choca con el principio (c):** no genera asiento real, así que el movimiento no existe en el libro diario. El P&L y el diario dejarían de coincidir |
| **Al confirmarse la jornada** | Ata el devengo al calendario, que ya es el motor de la previsión (§3.5) | Encaja solo parcialmente: la deuda nace del **vencimiento de pago**, no de la jornada jugada. Las dos fechas no coinciden |

**Hay que definirlo antes de implementar B0 (`crear_equipo_torneo`)**, que es la función que arma la ficha y sus cuotas. Es el punto exacto donde la pregunta aparece: quien escriba B0 va a tener que decidir si emite un asiento, varios, o ninguno. Definirlo después obliga a reescribir el devengo ya cargado.

De paso se resuelve dónde vive la referencia al asiento (ver arriba, `equipo_torneo.asiento_id`).

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
  torneo_id         uuid not null references torneo(id) on delete cascade,
  genero            genero not null,               -- cada género corre su calendario
  numero            smallint,                      -- fecha de liga (null en playoff)
  instancia         text,                          -- 'cuartos' | 'semi' | 'final' (playoff)
  es_playoff        boolean not null default false,
  fecha             date,                          -- null hasta programar
  estado            text not null default 'programada', -- programada | jugada | suspendida | reprogramada
  reprograma_a      uuid references jornada(id),   -- rastro de reprogramación
  cantidad_esperada smallint,                      -- base de estimación de ingreso
  unique (torneo_id, genero, numero),              -- identidad: fecha × género
  check (
    (es_playoff and instancia is not null and numero is null)
    or (not es_playoff and numero is not null and instancia is null)
  )
);
```

**`jornada` reconciliada — eje fecha × género** (antes era fecha × predio). La identidad es `(torneo, genero, numero)`: cada género corre su calendario propio (masc 1–15, fem 1–13). **El predio no es atributo de la jornada:** se decide por equipo semana a semana y vive en las tablas de movimiento (`asiento`, `pago`, `gasto`, `arqueo`), que llevan su propio `predio_id`. Un arqueo es por jornada + predio — dos arqueos la misma fecha si hubo dos canchas.

**Estado y reprogramación.** `estado` (programada/jugada/suspendida/reprogramada) + `reprograma_a` (rastro de la reprogramación). Suspender una jornada la saca de la proyección y del presupuesto de esa semana; reprogramar mueve el vencimiento atado. Es el punto donde el calendario deja de ser informativo y pasa a ser el motor de la previsión.

**Playoffs = jornadas especiales (Opción A).** Misma tabla, flag `es_playoff`, campo `instancia` (cuartos/semi/final) en lugar de `numero`. No se autogeneran —cantidad y fecha se desconocen hasta terminar la liga—: se agregan a mano.

**Estimación de ingreso automática.** Cada jornada proyecta ingreso estimado = arancel del tarifario (por género + regla) × `cantidad_esperada`. Vale igual para liga no jugada y para playoffs. El estimado se reemplaza por lo comprometido cuando se arman las fichas. Coherente con el principio (c) —una sola fuente de verdad, el libro diario— y con la proyección de caja por niveles de certeza (comprometido/estimado, §3.16).

**Grilla vacía.** `generar_grilla_liga(torneo_id)` siembra 28 filas (15 + 13) fecha × género, sin fecha ni predio. Idempotente. La fecha se carga al programar; el predio se resuelve en la asignación semanal de equipos.

**Puente con el tarifario.** El placeholder `hito_calendario` (texto) fue reemplazado por el FK real `plan_tarifa_linea.hito_jornada_id → jornada(id)`. Cada línea `fecha_fija` apunta a la jornada que define su vencimiento; reprogramar la jornada recalcula el vencimiento.

### 3.6 Caja, arqueo y conciliación

```sql
create table caja (
  id      uuid primary key default gen_random_uuid(),
  tipo    text not null unique       -- efectivo | transferencia | usd
);

create table arqueo (
  id           uuid primary key default gen_random_uuid(),
  jornada_id   uuid not null references jornada(id),
  predio_id    uuid not null references predio(id),
  saldo_sistema numeric(16,2) not null,
  saldo_contado numeric(16,2) not null,
  diferencia    numeric(16,2) generated always as (saldo_contado - saldo_sistema) stored,
  asiento_id    uuid references asiento(id),   -- ajuste, si hubo diferencia
  responsable_id uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);
```

Efectivo se cuenta (arqueo por jornada + predio); transferencia se concilia contra el extracto. La diferencia de arqueo **genera un asiento de ajuste y afecta el saldo real de la caja** — no se registra como una nota al margen.

### 3.7 Moneda extranjera

```sql
create table usd_operacion (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  tipo        text not null,               -- compra | venta | revaluacion
  cantidad    numeric(14,2) not null,      -- negativo en venta
  tc          numeric(10,2) not null,
  monto_pesos numeric(16,2) not null,
  motivo      text,
  asiento_id  uuid references asiento(id)
);
```

Los tres asientos:

| Operación | Debe | Haber | Resultado |
|---|---|---|---|
| Compra | `Caja USD` | `Caja Pesos` | Ninguno — es permuta |
| Revaluación | `Caja USD` | `Diferencia de cambio` | No realizado |
| Venta | `Caja Pesos` | `Caja USD` + `Dif. de cambio` | Realizado |

`Diferencia de cambio` es una cuenta de tipo `financiero`, no `egreso`/`ingreso` operativo. En el P&L aparece **debajo del resultado operativo**, en una línea aparte. Es deliberado: una suba del dólar no debe leerse como que el torneo funcionó mejor.

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
  arancel         numeric(16,2) not null,
  cantidad_x_fecha numeric(10,2),            -- para grupo 'fecha'
  monto_mensual   numeric(16,2)              -- para grupo 'recurrente'
);
```

Presupuesto de fecha = `arancel × cantidad_x_fecha × jornadas_no_suspendidas`.

El desvío se calcula por `cat_gasto_id`, que es la misma dimensión con la que se carga el gasto real. No hay tabla de mapeo entre presupuesto y real, y esa ausencia es el punto.

### 3.9 Comunicaciones

```sql
create table plantilla_mail (
  id      uuid primary key default gen_random_uuid(),
  clave   text not null unique,    -- aviso_7dias | reclamo_vencida | reclamo_2 | recibo_pago
  asunto  text not null,
  cuerpo  text not null            -- con placeholders {{equipo}}, {{monto}}, {{vence}}
);

create table envio (
  id           uuid primary key default gen_random_uuid(),
  tercero_id   uuid not null references tercero(id),
  plantilla    text not null,
  destinatario text not null,
  payload      jsonb,
  enviado_at   timestamptz not null default now(),
  enviado_por  uuid references auth.users(id)   -- NULL si fue automático
);
```

**Reglas de negocio del reclamo:**

- El aviso previo (7 días) aplica **solo a modalidad `cuotas`**. Los equipos `unitario` no tienen vencimiento conocido — se les cobra en la cancha.
- El nivel de automatización es configurable: `manual` (botón por equipo) / `mixto` (aviso automático, reclamo manual) / `automatico` (ambos, con log).
- Todo envío queda registrado en `envio` y visible desde la cuenta corriente del tercero.

### 3.10 Previsión de caja

La proyección no es una tabla: es una vista que une tres orígenes.

```sql
create view v_flujo_proyectado as
-- 1. COMPROMETIDO: deuda devengada con vencimiento
select c.vence_at as fecha, 'comprometido' as origen, 'ingreso' as signo, c.monto,
       t.nombre as detalle
from cuota c
join equipo_torneo et on et.id = c.equipo_torneo_id
join tercero t        on t.id = et.tercero_id
where c.pagado_at is null

union all
-- 2. RECURRENTE: gastos fijos mensuales proyectados
select make_date(extract(year from d)::int, extract(month from d)::int, 25),
       'recurrente', 'egreso', pl.monto_mensual, cg.nombre
from presupuesto_linea pl
join cat_gasto cg on cg.id = pl.cat_gasto_id
cross join generate_series(current_date, current_date + interval '6 months', '1 month') d
where cg.grupo = 'recurrente'

union all
-- 3. ESTIMADO: gastos de jornadas que faltan jugar
select j.fecha, 'estimado', 'egreso',
       pl.arancel * pl.cantidad_x_fecha, cg.nombre
from jornada j
join presupuesto p       on p.torneo_id = j.torneo_id
join presupuesto_linea pl on pl.presupuesto_id = p.id
join cat_gasto cg        on cg.id = pl.cat_gasto_id
where j.estado = 'programada' and cg.grupo = 'fecha';
```

La UI los distingue con badge (C / R / E). Es lo que permite responder "¿de dónde sale este número?" sin abrir el código.

---

### 3.11 Activos y amortización

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

**Generación con revisión.** Al cerrar el período, `proponer_amortizaciones()` calcula las cuotas del mes y las deja en estado `propuesta`. Alguien revisa y confirma. Sin confirmar no se cierra el período.

**La amortización no va al flujo de caja.** Es gasto sin movimiento de dinero: la salida ocurrió al pagar el bien. Confundirlos duplicaría el impacto.

**Imputación:** siempre estructura permanente (`torneo_id = NULL`). El bien sirve a todos los torneos que dura.

### 3.12 Compromisos

Todo lo que tiene fecha cierta y monto conocido vive en `compromiso`: facturas, cuotas de plan, cheques emitidos, cheques a cobrar. El calendario de pagos es una consulta sobre esa tabla, no una pantalla que junta datos de cinco lugares.

**Criticidad diferenciada.** No todas las obligaciones pesan igual:

| Tipo | Criticidad | Consecuencia de no cumplir |
|---|---|---|
| `cheque_emitido` | Crítico | Rebota: consecuencias bancarias inmediatas |
| `cuota_plan` | Alto | Puede caer el plan entero |
| `factura` | Medio | Suele admitir unos días |

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

Si históricamente cobran el 92% de lo devengado, el escenario base debe usar 92, no 100. Eso es lo que separa un pronóstico de una expectativa.

### 3.18 Tarifario · `plan_tarifa` (capa de catálogos)

Modela las modalidades de pago del torneo. **Versionado por torneo:** cada torneo clona su tarifario y edita valores/reglas sin tocar código. Reemplaza el hardcodeo de precios.

Es una **capa de catálogos / plantilla**, no data entry contable. El devengo no vive acá: cuando se arma la ficha del equipo (`equipo_torneo`), el tarifario es la fuente de la que salen las `cuota` con sus importes y vencimientos —y, derivado de ellas, `total_facturado`—. Armar la ficha no devenga nada: cada cuota se devenga al vencer (ver §3.4 y principio b). `plan_tarifa` no toca asientos.

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
| `por_partido` | Arancel unitario devengado por partido jugado (fechas 1–10, playoffs). Total = arancel × cantidad (decisión 8). |
| `bloque_adelantado` | Rango de fechas cobrado de una vez por adelantado (Masc fechas 11–15, Fem 11–13). El importe cargado **es** el total del bloque. |

**Flag `es_playoff`** en la línea: eliminación directa, sin rango de fechas de liga, máx 3 partidos (cuartos/semi/final).

**Asimetría de bloque entre géneros** (confirmada): en ambos el importe es el total del bloque, pero Masculino nace de 460k/520k × 5 fechas = 2.300k/2.600k, mientras Femenino es 435k/510k como total directo de las 3 fechas.

**Válido para todas las categorías del género** — ninguna categoría tiene tarifa propia, por eso el plan lleva `genero` y no `categoria_id` (principio d, decisión 3).

## 4. Navegación

Seis secciones; los módulos son pestañas internas. En el header: selector de **ámbito** (Empresa / Torneo) y de torneo.

| Sección | Pestañas |
|---|---|
| **Inicio** | Dashboard · Flujo de caja · **Proyección** |
| **Torneo** | Equipos y pagos · Padrón / Alta masiva · Inscripciones · Deudores · Reclamos · Calendario · Tarifario |
| **Operación** | Gastos por fecha · Gastos de estructura · Bar · **Calendario de pagos** |
| **Finanzas** | **Resultados** · Cuentas corrientes · Caja y banco · **Cheques** · Impuestos · Socios · Sponsors · Moneda extranjera |
| **Planificación** | Presupuesto · Presupuesto por fecha · **Escenarios** · **Punto de equilibrio** |
| **Configuración** | Torneo · Categorías de gastos · **Activos** · Predios · Cierre de período · **Registro de movimientos** · Auditoría · Usuarios |

**Cambios respecto del Draft 6:**

- El **libro diario** baja de Finanzas a Configuración, renombrado `Registro de movimientos`. Sigue siendo la fuente de todo; deja de ocupar lugar de privilegio.
- **P&L → Resultados**, reordenado por pregunta de negocio: ingresos por fuente → costos directos → **contribución del torneo** → estructura → resultado operativo → financieros.
- **Impuestos** pierde el toggle simple/detallado. Queda solo la vista simple.
- Pantallas nuevas: Proyección, Escenarios, Punto de equilibrio, Calendario de pagos, Cheques, Activos.

El preview del asiento en los modales de carga **se conserva colapsado** tras un "ver detalle contable". Sirve como prueba de rigor cuando alguien pregunta cómo se garantiza que los números cierren.

## 5. Alta de equipos y transición entre torneos

El problema: 168 equipos, dos torneos por año. Cargarlos de a uno es motivo suficiente para que el sistema no se adopte.

**Primera carga — importación.** Se sube `APERTURA 2026 · CAMPA.xlsx`, que ya tiene los equipos por categoría en hojas separadas. El sistema detecta las hojas, propone el mapeo y muestra la lista completa para revisar antes de confirmar. Nada se escribe hasta la aprobación.

**Torneos siguientes — diferencial.** Al crear un torneo nuevo se elige un torneo base y se copia:

| Se copia | No se copia |
|---|---|
| Padrón de equipos y categorías | **Deuda pendiente** |
| Tarifario | Pagos |
| Catálogo de categorías y conceptos | Asientos |

Se presenta solo la excepción: ascensos, descensos, bajas y altas nuevas. Los equipos que siguen igual no se muestran.

**La deuda no se arrastra.** Si un equipo quedó en mora en Apertura, esa mora sigue viva en su cuenta corriente pero imputada al torneo donde nació. Arrastrarla contaminaría el resultado del torneo nuevo. Con devengo progresivo lo que se arrastra es siempre deuda vencida: al cerrar un torneo, sus cuotas ya vencieron todas, así que no queda devengo pendiente colgando de un torneo terminado.

## 6. Orden de implementación

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
| 10 | **Roles y RLS** | Al final, con entidades estables |

★ = prioridad del dueño. Todo lo demás sostiene esos dos bloques.

**Fuera de alcance:** IVA discriminado, plan de cuentas como pantalla, balance patrimonial, amortización según tablas fiscales.

## 7. Notas de implementación

**RLS.** Todas las tablas con RLS activo. El rol `administracion` tiene `select` sobre todo y `update` solo sobre `periodo.estado`. `encargado_bar` filtra por `predio_id`. `operador` no accede a `socio`, `usd_operacion` ni `cfg_*`.

**Cálculos en base, no en el cliente.** Los totales del P&L, saldos de cuenta corriente y flujo proyectado son vistas SQL. El cliente no suma: consulta. Es la traducción técnica del principio (c) — si el front calcula, en algún momento dos pantallas van a discrepar.

**Numérico, no float.** `numeric(16,2)` en todo lo monetario. Nunca `float8`.

**Idempotencia del importador.** La importación debe poder correrse dos veces sin duplicar: clave natural `(torneo_id, nombre_equipo)`.

**Auditoría.** `asiento` ya es inmutable. Para el resto de las tablas, tabla `audit_log` genérica con trigger sobre `update`/`delete` en las sensibles (`equipo_torneo`, `cuota`, `gasto`, `arqueo`).

## 8. Decisiones cerradas

No reabrir sin motivo nuevo:

1. Devengo **progresivo por vencimiento de cuota** para reconocer ingresos. Reemplaza a la Opción A desde el Draft 11 — ver la nota al pie de esta sección.
2. Fuente única: todo deriva del libro diario.
3. Sin rentabilidad por predio ni por categoría.
4. Efectivo / Transferencia como única terminología.
5. Efectivo y Transferencia son cajas independientes; USD es módulo aparte.
6. IVA en vista simple. Sin discriminación de débito/crédito.
7. Gasto con dos ejes: naturaleza + área.
8. Carga como arancel × cantidad.
9. Estado de cuota en lugar de aging 30/60/90.
10. Arqueo por jornada + predio, con ajuste que afecta caja.
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

### Decisiones reemplazadas

Se registran acá con su razonamiento. Una decisión derogada sin explicación es una trampa: el que venga después vuelve a proponerla, o peor, la reimplementa sin saber que ya se descartó.

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
