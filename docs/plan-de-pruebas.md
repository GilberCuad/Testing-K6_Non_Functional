# Plan de pruebas de performance — QuickPizza

Este documento define **qué** se prueba, **con qué carga** y **cuándo se considera aprobado**.
Es la referencia para implementar los scripts de `k6/scripts/` (Fase 4) y el pipeline de
Jenkins (Fase 6).

## 1. Alcance

- **Sistema bajo prueba:** QuickPizza (`ghcr.io/grafana/quickpizza-local:latest`), en local con
  Docker, dentro de la red `perf-net`.
- **Fuera de alcance:** el servidor público de QuickPizza (nunca se le aplica carga), el frontend
  web (solo se prueba la API HTTP), WebSockets y gRPC.
- **Flujos cubiertos:** endpoints públicos, login, generación de pizza autenticada y rating.

## 2. Entorno y limitaciones

| Elemento | Valor |
|---|---|
| Máquina | Portátil AMD Ryzen 7 5700U (8 núcleos / 16 hilos), 15 GB RAM. Docker Desktop (WSL 2) con 7,6 GB |
| QuickPizza | **Limitado a 2 CPUs y 512 MB** en `docker-compose.yml` (simula un servidor pequeño) |
| Generador | `grafana/k6:2.3.0` en contenedor, misma máquina, misma red `perf-net` |
| Base de datos | SQLite **en memoria**: se vacía cada vez que se recrea el contenedor |

**Limitaciones que hay que tener presentes al interpretar resultados:**

1. **El generador y la app comparten máquina.** Por eso se limita QuickPizza a 2 CPUs: así se
   satura antes que k6. Durante stress y spike hay que vigilar con `docker stats` que k6 no
   llegue a saturar la CPU; si lo hace, el resultado mide el portátil, no la app.
2. **La red es local.** No hay latencia de red real: los tiempos son menores que los de un
   entorno desplegado. Los thresholds valen para comparar ejecuciones entre sí, no como
   predicción de producción.
3. **La BD en memoria crece** con cada pizza y rating. En el soak esto es justo lo que se quiere
   observar (consumo de memoria del contenedor).
4. **Ruido del portátil:** otras aplicaciones abiertas afectan a los resultados. Para comparar
   ejecuciones, cerrar lo que no sea necesario.

## 3. Línea base (1 usuario, sin carga, 2026-11-05)

| Endpoint | Latencia observada |
|---|---|
| `GET /api/quotes`, `GET /api/names` | p(95) ≈ 2-3 ms |
| `POST /api/users` (registro) | ≈ 66 ms |
| `POST /api/users/token/login` | ≈ 60 ms |
| `POST /api/pizza` | 24-107 ms (variable) |
| `POST /api/ratings` | ≈ 8 ms |

`POST /api/pizza` es el **endpoint crítico**: es ~25 veces más lento que los públicos y es el
centro del negocio.

## 4. Conceptos: k6 frente a JMeter

| k6 | Qué es | Equivalente en JMeter |
|---|---|---|
| VU (usuario virtual) | Un usuario que ejecuta su función en bucle, con su propio estado | Hilo de un Thread Group |
| Iteración | Una ejecución completa de la función del VU | Una vuelta del *Loop Count* |
| Escenario (`scenarios`) | Bloque de carga con nombre, función y patrón propios. Varios corren en paralelo | Thread Group (varios escenarios = varios Thread Groups) |
| Executor | Patrón de carga del escenario | Tipo de Thread Group |
| `ramping-vus` (modelo **cerrado**) | Fija cuántos usuarios hay; si la app se vuelve lenta, baja el throughput | Thread Group clásico / Concurrency Thread Group |
| `ramping-arrival-rate` (modelo **abierto**) | Fija cuántas iteraciones/s empiezan; si la app se vuelve lenta, k6 añade VUs | Arrival Thread Group / Throughput Shaping Timer |
| `thresholds` | Criterio de aprobado/suspenso; si se incumple, exit code 99 | Assertions + revisión del .jtl, automatizado |

**Decisión: modelo híbrido.**
- **Smoke, load y soak** usan el modelo cerrado (`ramping-vus`). Se razona en "usuarios
  concurrentes", como en JMeter, y es adecuado para validar un comportamiento esperado.
- **Stress y spike** usan el modelo abierto (`ramping-arrival-rate`). En el modelo cerrado, una
  app degradada recibe *menos* carga (los VUs esperan respuestas lentas), y eso oculta el punto
  de quiebre. En el modelo abierto la carga sigue llegando, como los usuarios reales. La métrica
  `dropped_iterations` indica cuándo k6 ya no pudo mantener el ritmo pedido.

## 5. Recorridos de usuario

Se modelan como **dos escenarios en paralelo** (≈ dos Thread Groups en el mismo plan):

| Escenario | Proporción | Pasos de una iteración | Think time |
|---|---|---|---|
| `navegantes` | ~60% | `GET /api/quotes` → `GET /api/names` | aleatorio 1-3 s |
| `clientes` | ~40% | `POST /api/pizza` (con restricciones variadas) → `POST /api/ratings` (estrellas 1-5) | aleatorio 2-4 s |

**Datos y autenticación** (los detalles se implementan en la Fase 4):

- Como la BD está en memoria, los usuarios de prueba se **crean en `setup()`** al inicio de cada
  ejecución. No se depende de datos previos.
- Cada VU de `clientes` hace **login una sola vez** y reutiliza su token, como un usuario real
  que mantiene la sesión. El login no se repite en cada iteración.
- Las restricciones de pizza (vegetariana, máximo de calorías, ingredientes excluidos) salen de
  un archivo de datos en `k6/data/`, leído con `SharedArray` (≈ CSV Data Set Config).

El think time aleatorio (≈ Uniform Random Timer) evita que todos los VUs vayan sincronizados.

## 6. Matriz de pruebas

La carga de referencia es la del **load test**: 20 VUs (12 navegantes + 8 clientes). Con el
think time definido, son unas 6 iteraciones/s de navegantes y unas 2,5 de clientes (≈ 17
peticiones/s). Stress y spike se expresan como **múltiplos** de esa carga.

| Prueba | Objetivo | Executor | Carga | Duración | Criterio de aceptación |
|---|---|---|---|---|---|
| **Smoke** | Validar que los scripts y la app funcionan antes de cualquier otra prueba | `constant-vus` | 1 VU por escenario | 30 s | 0% errores, 100% checks |
| **Load** | Comportamiento con la carga esperada | `ramping-vus` | 0 → 20 VUs (12 + 8) | 5 min: 1 subida, 3 estable, 1 bajada | Thresholds generales (sección 7) |
| **Stress** | Encontrar el punto de quiebre | `ramping-arrival-rate` | Escalones de 1×, 2×, 4×, 8× y 16× la carga de load | ~11 min: 5 escalones de 2 min + bajada | **Exploratoria**: no falla por latencia. Se registra el primer escalón donde p(95) de pizza > 500 ms, errores > 1% o `dropped_iterations` > 0. Se aborta si errores > 10% |
| **Spike** | Reacción ante un pico repentino y recuperación | `ramping-arrival-rate` | `navegantes` constante a 1×; `clientes` a 1× → **10×** en 10 s → 1 min → vuelve a 1× | ~5 min | Durante el pico, errores < 5%. En la **recuperación** (escenario propio tras el pico), mismos thresholds que load |
| **Soak** | Estabilidad prolongada, fugas y degradación progresiva | `ramping-vus` | 10 VUs (6 + 4), el 50% de load | 20 min estable + 3 de rampas (configurable) | Thresholds generales, p(95) de pizza en los últimos 5 min ≤ 120% del de los primeros 5 min, y memoria de QuickPizza sin acercarse a 512 MB |

**Notas:**

- El factor del spike (10×) se **ajustará con el resultado del stress**: tiene sentido que el pico
  supere la carga sostenible, pero no tanto que solo mida un colapso total.
- En el spike, la recuperación va en un **escenario separado** con `startTime`, lo que permite
  aplicarle thresholds propios (`{scenario:recuperacion}`).
- La duración del soak se podrá pasar por variable de entorno, para hacer versiones cortas
  mientras se desarrolla.

## 7. Thresholds generales (load, soak y recuperación del spike)

Sin un SLA de negocio, los thresholds se fijan a partir de la **línea base con margen**. Se
definen **por tipo de endpoint** (≈ filtrar el Aggregate Report por label), porque un único
p(95) global mezclaría endpoints de 3 ms con endpoints de 100 ms y no detectaría nada.

| Métrica | Threshold | Justificación |
|---|---|---|
| `http_req_failed` | `rate < 0.01` | Menos del 1% de errores |
| `checks` | `rate > 0.99` | Las respuestas, además de llegar, son correctas |
| `http_req_duration` de endpoints públicos | `p(95) < 200` ms | Línea base ≈ 3 ms: un margen amplio, pero detecta degradación real |
| `http_req_duration` de `POST /api/pizza` | `p(95) < 500` ms y `p(99) < 1000` ms | Línea base hasta ≈ 107 ms: ~5 veces de margen bajo carga |
| `http_req_duration` del login | `p(95) < 500` ms | Línea base ≈ 60 ms |

**Lección de la Fase 2:** con errores de conexión, `http_req_duration` puede dar 0 ms y pasar el
threshold. Por eso los thresholds de latencia **siempre** van junto con `http_req_failed`.

## 8. Orden y política de ejecución

1. **Smoke**, siempre primero. Si falla, no se ejecuta nada más (actúa como *gate*).
2. **Load**, la prueba por defecto del pipeline de Jenkins.
3. **Stress, spike y soak**, bajo demanda (parámetro del pipeline), porque son largas o
   exploratorias.

Antes de cada ejecución se recomienda recrear QuickPizza (`docker compose up -d
--force-recreate --wait`) para partir de una BD vacía y comparar ejecuciones en igualdad de
condiciones.
