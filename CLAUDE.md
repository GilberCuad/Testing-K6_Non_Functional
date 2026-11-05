# CLAUDE.md — Contexto del proyecto k6 + Jenkins local (Docker)

Este archivo guarda el contexto del proyecto para retomarlo en cualquier sesión.
Léelo completo antes de hacer nada.

## Quién es el usuario

QA Automation con experiencia en **JMeter, Cypress y Playwright**. Está aprendiendo **k6**
con un proyecto de práctica: implementar las pruebas de performance que normalmente hace
con JMeter y ejecutarlas en un **Jenkins local dentro de Docker**.

## Cómo trabajar (OBLIGATORIO)

Actúa como **profesor de desarrollo**:

1. Trabaja **por fases**. Al terminar cada fase, **detente**, resume lo hecho y **espera
   confirmación** antes de pasar a la siguiente.
2. En cada paso explica **qué haces y por qué** (la razón de la decisión, no solo el comando).
3. Cuando haya varias opciones, presenta las alternativas con **pros y contras**, recomienda
   una y espera antes de implementarla.
4. Cuando algo se parezca a un concepto de JMeter (Thread Group, Assertions, CSV Data Set,
   Listeners, Test Fragments, .jtl), haz la **comparación explícita**.
5. No avances varias fases de golpe ni crees archivos que no hayas explicado.
6. Si algo falla, **explica la causa antes de arreglarlo**.
7. **NUNCA hagas `git commit`** (ni push). Cuando sea buen momento para un commit,
   **avísale al usuario** y propón el mensaje; él lo hace.
8. Código y comentarios claros; **documentación en español**.
9. Cada fase debe ser reproducible con comandos documentados.

## App bajo prueba: QuickPizza

- App demo oficial de Grafana k6: https://github.com/grafana/quickpizza
- Corre **localmente en Docker**: imagen `ghcr.io/grafana/quickpizza-local:latest`, puerto `3333`.
- **Nunca** hacer pruebas de carga contra el servidor público (entorno compartido).
- Antes de escribir tests, **investigar el repo/README** para descubrir los endpoints reales
  (login, registro, generación de pizza, ratings…). No asumir endpoints: verificarlos y
  explicar lo encontrado.

## Stack

- k6 (scripts en JavaScript), ejecutado con la imagen `grafana/k6` (k6 NO está instalado localmente,
  decisión intencional: misma versión en local y en Jenkins).
- Docker + Docker Compose v2 (`docker compose`, con espacio).
- Jenkins local en contenedor, Jenkinsfile declarativo.
- Opcional: InfluxDB + Grafana.

## Plan de fases

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Diagnóstico del entorno, estructura de carpetas, README inicial, `.gitignore` | ✅ Hecha |
| 1 | `docker-compose.yml` con QuickPizza en red propia `perf-net`. Explicar redes de Docker, resolución por nombre de contenedor y por qué importa para Jenkins. Healthcheck y verificar que responde | ✅ Hecha |
| 2 | Primer test smoke con pocos VUs. Explicar anatomía (`options`, `default function`, `check`, `sleep`) y el resumen (`http_req_duration`, `p(95)`, `http_req_failed`…). `BASE_URL` como variable de entorno y por qué no se hardcodea | ✅ Hecha |
| 3 | Plan de pruebas en `docs/plan-de-pruebas.md` (tabla: objetivo, escenario, carga, duración, criterio de aceptación). Explicar VU, iteración, escenario y su relación con el Thread Group | ✅ Hecha |
| 4 | Implementar los scripts reutilizando `k6/lib/` (helpers de auth, thresholds, datos). Explicar `SharedArray` frente al CSV Data Set. Usar `check`, `group`, `scenarios`, `thresholds` explicando cada uno | 🔄 4a hecha (lib + smoke + load); falta 4b (stress, spike, soak) |
| 5 | Jenkins en el compose (misma red). Antes: opciones para ejecutar k6 desde Jenkins (contenedor `grafana/k6` como agente/paso vs. imagen custom de Jenkins con k6) con pros y contras y recomendación. Explicar el acceso a Docker desde Jenkins y sus implicaciones de seguridad | ⏳ |
| 6 | `Jenkinsfile` declarativo: levantar/verificar app → smoke → load → publicar resultados (JSON/HTML como artefacto). Si falla un threshold, falla el build (equivalente automatizado de las aserciones de JMeter). Parametrizar el tipo de prueba | ⏳ |
| 7 | (Opcional) InfluxDB + Grafana, enviar métricas de k6, dashboard. Comparar con Listeners/reportes de JMeter | ⏳ |
| 8 | README final: cómo levantar todo, correr cada prueba, interpretar resultados, tabla JMeter → k6 | ⏳ |

### Propuesta base de pruebas (Fase 3, para ajustar y justificar)

| Prueba | Objetivo | Carga sugerida | Threshold sugerido |
|---|---|---|---|
| Smoke | Validar que el script y la app funcionan | 1-2 VUs, ~30 s | 0% errores |
| Load | Comportamiento con carga esperada | rampa a ~20 VUs, ~5 min | p(95) < 500 ms, errores < 1% |
| Stress | Encontrar el punto de quiebre | rampas escalonadas hasta degradar | observar dónde se rompe |
| Spike | Reacción ante pico repentino | salto brusco de VUs | recuperación posterior |
| Soak | Estabilidad prolongada | carga moderada, 20-30 min | sin degradación progresiva |

Flujos mínimos: endpoints públicos, login/registro, generación de pizza autenticada y rating.

## Estado actual (Fase 4a terminada, falta 4b)

### Entorno verificado
- Windows 11 Home Single Language 10.0.26200, 64 bits. Docker Desktop con backend **WSL 2**.
- Docker Desktop **se actualizó** durante la Fase 1: Docker 29.9.2, Compose v5.6.1. Ahora es
  instalación **por usuario** en `C:\Users\g_cua\AppData\Local\Programs\DockerDesktop\resources\bin`
  (la antigua `C:\Program Files\Docker\Docker` ya no existe). Si `docker` "no se reconoce", el
  proceso tiene un PATH viejo: reiniciar VS Code o anteponer esa ruta al PATH.
- Ruta del proyecto: `C:\Users\g_cua\Documents\Practicas Aut\K6` (sin tildes, con un espacio:
  vigilar en montajes de volúmenes de la Fase 5).
- git 2.36.1 (antiguo pero funcional; se sugirió `winget upgrade Git.Git`).
- k6 no instalado localmente (intencional).

### Estructura creada
```text
docker/       Dockerfiles y configuración por servicio (Jenkins custom, Grafana…)
k6/scripts/   un script por tipo de prueba
k6/lib/       código reutilizable (auth, config, thresholds)
k6/data/      datos de prueba (JSON/CSV para SharedArray)
jenkins/      Jenkinsfile (se configura "Script Path" en Jenkins; decisión final en Fase 6)
docs/         plan de pruebas y decisiones
results/      salidas de ejecución (ignorado por git)
```
Las carpetas vacías tienen `.gitkeep`. Archivos creados: `README.md` (con tabla de estado por
fase, actualizarla al cerrar cada fase), `.gitignore`, este `CLAUDE.md`.

### Decisiones y pendientes
- **git:** rama `calidad`. Fases 1 y 2 ya commiteadas por el usuario. El usuario hace los
  commits; Claude solo avisa y propone mensaje. **Pendiente:** commit de la Fase 3 (si no lo hizo)
  y de la 4a.

### Decisiones de la Fase 4a
- Estructura elegida: **scripts finos + `k6/lib/`** (no un script único con perfiles). Datos en
  **JSON** (no CSV). Fase 4 dividida en 4a (lib + smoke + load) y 4b (stress, spike, soak).
- `lib/config.js`: BASE_URL obligatoria, `thinkTime(min, max)`, `enteroAleatorio()`. **Sin
  imports remotos** (jslib) para no depender de internet en Jenkins.
- `lib/auth.js`: `crearUsuarios(n)` para `setup()` con prefijo `k6_<timestamp>` (un registro
  duplicado da 400); `obtenerToken()` hace login la primera vez y guarda el token en una variable
  de módulo (por VU); el usuario se elige con `(exec.vu.idInTest - 1) % n`.
- `lib/datos.js`: `SharedArray` de `data/restricciones.json` (7 perfiles), reparto con
  `exec.scenario.iterationInTest % length`. `open()` con ruta relativa al módulo (`../data/...`) funciona.
- `lib/flujos.js`: `flujoNavegante()` (group `navegante`) y `flujoCliente(usuarios)` (group
  `cliente`). Etiqueta `tipo` (publico/login/pizza/rating/registro) y `perfil` en pizza.
- `lib/thresholds.js`: `thresholdsGenerales` y `thresholdsSmoke` (rate==0 / ==1).
- Hallazgos de la API: `maxCaloriesPerSlice` **no se respeta** (no se comprueba); `mustBeVegetarian`
  **sí** (`vegetarian: true` en la respuesta, comprobado); el mismo usuario recibe siempre el
  mismo token; 32 toppings y tools `Knife`, `Pizza cutter`, `Scissors`.
- Resultados (2026-11-05, app recreada): smoke → exit 0, pizza p(95) 115 ms, públicos 2,7 ms.
  Load → exit 0, 4178 peticiones (13,8/s), 0% errores, pizza p(95) 126 ms / p(99) 175 ms, login
  p(95) 150 ms, públicos 2,9 ms. `docker stats` (CPU, base 100% = 1 núcleo): QuickPizza ≤ 23%
  (de 200% disponible), k6 ≤ 9%, memoria de QuickPizza 12 → 15 MB. El load está lejos de saturar.
- Para el load se usó `docker run -d --name k6-load` + muestreo de `docker stats` + `docker wait`/`logs`.
- El usuario creó `.env` (`BASE_URL=http://quickpizza:3333`, ignorado por git) y `.env.example`.
  Ejecución con `--env-file .env`. A veces usa **Git Bash**: convierte `/k6/...` en
  `C:/Program Files/Git/...` → usar `MSYS_NO_PATHCONV=1` y `"$(pwd -W)/k6:/k6:ro"`, o PowerShell
  (recomendado y documentado en el README).

### Decisiones de la Fase 3 (detalle en `docs/plan-de-pruebas.md`)
- **Modelo híbrido:** smoke/load/soak con `ramping-vus` (cerrado); stress/spike con
  `ramping-arrival-rate` (abierto, vigilar `dropped_iterations`).
- **Dos escenarios en paralelo:** `navegantes` (~60%: GET quotes → names, think time 1-3 s) y
  `clientes` (~40%: POST pizza con restricciones de `k6/data/` vía SharedArray → POST rating,
  think time 2-4 s). Usuarios creados en `setup()`; login una vez por VU con el token reutilizado.
- Load: 0 → 20 VUs (12 + 8), 5 min (1/3/1). Stress: escalones de 1×, 2×, 4×, 8× y 16× de 2 min,
  exploratorio, abortar con errores > 10%. Spike: clientes 1× → 10× → 1×, navegantes constante;
  recuperación como escenario propio con `startTime` y thresholds `{scenario:recuperacion}`.
  Soak: 10 VUs, 20 min (duración configurable por env); p(95) de pizza al final ≤ 120% del inicio.
- Thresholds generales: `http_req_failed < 1%`, `checks > 99%`, públicos p(95) < 200 ms,
  pizza p(95) < 500 ms y p(99) < 1000 ms, login p(95) < 500 ms (por tipo de endpoint → tags).
- **QuickPizza limitado a `cpus: 2`, `mem_limit: 512m`** en el compose (uso en reposo ≈ 17 MB).
- Línea base medida (1 usuario): públicos ≈ 3 ms, login ≈ 60 ms, registro ≈ 66 ms, pizza
  24-107 ms, rating ≈ 8 ms. Máquina: Ryzen 7 5700U 8c/16t, Docker con 7,6 GB.
- Política: smoke como gate → load por defecto en Jenkins; stress/spike/soak bajo demanda.
  Recrear la app antes de cada prueba: `docker compose up -d --force-recreate --wait`.
- El PATH de la sesión de VS Code sigue sin Docker: en cada comando anteponer
  `$env:Path = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin;$env:Path"` (PowerShell).

### Decisiones de la Fase 2
- k6 **fijado** a `grafana/k6:2.3.0` (era la `latest` el 2026-10-28). k6 v2.x.
- Ejecución: `docker run --rm --network perf-net -e BASE_URL=http://quickpizza:3333 -v "${PWD}/k6:/k6:ro" grafana/k6:2.3.0 run /k6/scripts/<script>.js`.
  La ruta con espacio funciona entre comillas.
- `k6/scripts/smoke.js`: 1 VU, 30 s, GET `/api/quotes` y `/api/names`, `sleep(1)`. Thresholds:
  `http_req_failed rate==0`, `checks rate==1`, `http_req_duration p(95)<500`. Resultado: p(95) ≈ 3 ms.
- `BASE_URL` **obligatoria** sin valor por defecto (falla con error claro → exit 107).
- Lección aprendida: en los checks de contenido, validar `r.status === 200 &&` antes de `r.json()`.
  Si no, una respuesta fallida lanza una excepción, corta la iteración antes de `sleep()` y el VU
  dispara peticiones sin pausa.
- Códigos de salida verificados: 0 = ok, 99 = thresholds incumplidos, 107 = error de script.
- Observación para la Fase 4: con conexión rechazada `http_req_duration` p(95)=0s (pasa el
  threshold): la latencia sola no basta, siempre acompañarla de `http_req_failed`, o usar
  `http_req_duration{expected_response:true}`.
- Endpoints verificados SIN auth (200): `/api/quotes`, `/api/names`, `/api/adjectives`,
  `/api/config`. CON auth (401 sin token): `/api/doughs`, `/api/tools`,
  `/api/ingredients/{type}`, `POST /api/pizza`.

### Decisiones de la Fase 1
- `docker-compose.yml` en la **raíz** (confirmado); `docker/` solo para configuración de servicios.
  Proyecto `name: k6-perf`.
- Red con **nombre fijo** `perf-net` (sin prefijo de proyecto) para poder usar
  `docker run --network perf-net grafana/k6 ...` en la Fase 6.
- QuickPizza publicado solo en `127.0.0.1:3333`. Desde contenedores: `http://quickpizza:3333`.
- La imagen de QuickPizza es **distroless** (sin shell/curl/wget), así que no puede tener
  healthcheck propio. Opción elegida (C): contenedor vigía `quickpizza-ready`
  (`curlimages/curl:8.11.1`, `sleep infinity`, `init: true`) con healthcheck
  `curl -f http://quickpizza:3333/ready`. Permite `docker compose up -d --wait`.
- Verificado: `/ready` y `/healthz` → 200 desde Windows; `/api/names` por nombre de servicio
  desde otro contenedor en `perf-net` → 200; `localhost` desde un contenedor falla (esperado).

### Hallazgos de QuickPizza (para las Fases 2-4)
- Salud: `GET /ready` (readiness), `GET /healthz` (liveness).
- Registro `POST /api/users {username, password}` → 201. Login `POST /api/users/token/login`
  → `{token}`. Cabecera: `Authorization: Token <token>`.
- Con auth: `POST /api/pizza` (restricciones opcionales), `/api/ratings` (CRUD,
  `{stars 1-5, pizza_id}`), `/api/ingredients/{type}`, `/api/doughs`, `/api/tools`.
- Públicos: ver la lista verificada en "Decisiones de la Fase 2" (el OpenAPI declara auth
  global por error).
- BD: SQLite **en memoria** por defecto (`QUICKPIZZA_DB`): los usuarios se pierden al recrear
  el contenedor → crear los usuarios de prueba en el `setup()` de k6.
- `QUICKPIZZA_DELAY_RECOMMENDATIONS_API_PIZZA_POST` (p. ej. `3s`) inyecta latencia: útil para
  demostrar thresholds que fallan.

## Al retomar la sesión

1. Leer este archivo y `README.md`.
2. Verificar la nueva ruta del proyecto y que `docker info` responde.
3. Levantar la app: `docker compose up -d --wait` y comprobar `docker compose ps` (healthy).
4. Recordar el commit pendiente si el usuario aún no lo ha hecho.
5. Continuar con la **Fase 4b**: `stress.js`, `spike.js`, `soak.js` con `ramping-arrival-rate`
   (stress/spike) reutilizando `lib/`. Explicar `preAllocatedVUs`/`maxVUs`, `dropped_iterations`,
   `abortOnFail`, `startTime` y los thresholds `{scenario:...}`. Ajustar el factor del spike
   según el resultado del stress.
