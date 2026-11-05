# Pruebas de performance con k6 + Jenkins local (Docker)

Proyecto de práctica para aprender **k6** implementando las pruebas de performance
que habitualmente se hacen con JMeter, ejecutadas desde un **Jenkins local en Docker**.

> **App bajo prueba:** [QuickPizza](https://github.com/grafana/quickpizza), la app demo
> oficial de Grafana k6, corriendo **localmente en Docker**
> (`ghcr.io/grafana/quickpizza-local:latest`, puerto `3333`).
> Nunca se ejecutan pruebas de carga contra el servidor público de QuickPizza.

## Estado del proyecto

| Fase | Descripción | Estado |
|---|---|---|
| 0 | Diagnóstico del entorno y estructura | ✅ Hecha |
| 1 | Docker Compose con QuickPizza (red `perf-net`) | ✅ Hecha |
| 2 | Primer test (smoke) | ✅ Hecha |
| 3 | Plan de pruebas ([`docs/plan-de-pruebas.md`](docs/plan-de-pruebas.md)) | ✅ Hecha |
| 4 | Implementación de los tests (load, stress, spike, soak) | ⏳ Pendiente |
| 5 | Jenkins en Docker | ⏳ Pendiente |
| 6 | Pipeline (`Jenkinsfile`) | ⏳ Pendiente |
| 7 | (Opcional) InfluxDB + Grafana | ⏳ Pendiente |
| 8 | Documentación final | ⏳ Pendiente |

## Requisitos

| Herramienta | Versión verificada | Notas |
|---|---|---|
| Windows 11 + WSL 2 | 10.0.26200 | Docker Desktop usa WSL 2 como backend |
| Docker Desktop | Docker 29.9.2 | Debe estar **abierto** para que el engine responda. Instalación por usuario (`%LOCALAPPDATA%\Programs\DockerDesktop`) |
| Docker Compose | v5.6.1 | Se invoca como `docker compose` (con espacio) |
| k6 | v2.3.0 | No hace falta instalarlo: se usa la imagen **fijada** `grafana/k6:2.3.0` (misma versión en local y en Jenkins) |

Comprobación rápida:

```powershell
docker --version
docker compose version
docker info   # si falla, Docker Desktop no está corriendo
```

## Estructura del proyecto

```text
K6/
├── docker-compose.yml   # (Fase 1) Orquesta todos los servicios en la red perf-net
├── docker/              # Dockerfiles y configuración propia de cada servicio
│                        #   (imagen custom de Jenkins, provisioning de Grafana, etc.)
├── k6/
│   ├── scripts/         # Un script por tipo de prueba: smoke, load, stress, spike, soak
│   ├── lib/             # Código reutilizable: autenticación, config, thresholds
│   └── data/            # Datos de prueba (JSON/CSV) leídos con SharedArray
├── jenkins/             # Jenkinsfile y configuración del pipeline
├── docs/                # Plan de pruebas, decisiones y guías
└── results/             # Salidas de cada ejecución (ignorado por git)
```

## Cómo ejecutar

### 1. Levantar la app bajo prueba (QuickPizza)

```powershell
docker compose up -d --wait   # espera hasta que QuickPizza responda en /ready
docker compose ps             # quickpizza-ready debe aparecer como (healthy)
```

- Navegador / Windows: <http://localhost:3333> (publicado solo en `127.0.0.1`).
- Desde otros contenedores (k6, Jenkins): `http://quickpizza:3333`, conectándolos a la red `perf-net`.
- La base de datos es SQLite **en memoria**: al recrear el contenedor se pierden usuarios y ratings.
- QuickPizza está **limitado a 2 CPUs y 512 MB** para que se sature antes que k6, que corre en la
  misma máquina (ver [plan de pruebas](docs/plan-de-pruebas.md#2-entorno-y-limitaciones)).
- Para empezar con la BD vacía: `docker compose up -d --force-recreate --wait`.

Verificación rápida:

```powershell
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3333/ready      # 200
docker run --rm --network perf-net curlimages/curl:8.11.1 -s http://quickpizza:3333/api/names
```

Parar todo:

```powershell
docker compose down
```

#### ¿Por qué existe `quickpizza-ready`?

La imagen de QuickPizza es *distroless* (sin shell ni curl), así que no puede llevar su propio
`healthcheck`. El servicio `quickpizza-ready` es un contenedor mínimo con curl que comprueba
`http://quickpizza:3333/ready` por la red `perf-net`; su estado `healthy` indica que la app está
lista. Esto permite usar `docker compose up --wait`.

### 2. Smoke test

Valida que los scripts y la app funcionan con carga mínima: 1 VU navegante y 1 VU cliente
durante 30 s. Con la app levantada, desde la raíz del proyecto:

```powershell
docker run --rm --network perf-net -e BASE_URL=http://quickpizza:3333 -v "${PWD}/k6:/k6:ro" grafana/k6:2.3.0 run /k6/scripts/smoke.js
```

| Parte del comando | Para qué |
|---|---|
| `--network perf-net` | k6 se une a la red de la app y la encuentra por nombre (`quickpizza`) |
| `-e BASE_URL=...` | URL objetivo. **Obligatoria**: el script se detiene si falta, para no apuntar nunca a un entorno equivocado |
| `-v "${PWD}/k6:/k6:ro"` | Monta los scripts en el contenedor, en solo lectura |
| `grafana/k6:2.3.0` | Versión fijada de k6 |

Alternativa con archivo de variables: copia `.env.example` a `.env` y sustituye
`-e BASE_URL=...` por `--env-file .env` (`-e` tiene prioridad si se usan ambos).

> **Git Bash:** convierte `/k6/...` en `C:/Program Files/Git/k6/...` y k6 no encuentra el
> script. Usa PowerShell, o en Git Bash antepón `MSYS_NO_PATHCONV=1` y usa `"$(pwd -W)/k6:/k6:ro"`
> como volumen.

Criterios de aceptación (thresholds): 0% de peticiones fallidas, 100% de checks correctos y
los límites de latencia por tipo de endpoint del
[plan de pruebas](docs/plan-de-pruebas.md#7-thresholds-generales-load-soak-y-recuperación-del-spike).

#### Cómo leer el resultado

| Métrica del resumen | Significado | En JMeter |
|---|---|---|
| `http_req_duration` | Tiempo de respuesta (avg, med, p(90), p(95), max) | *Elapsed* / columnas del Aggregate Report |
| `p(95)` | El 95% de las peticiones tardó esto o menos | *95% Line* |
| `http_req_failed` | % de peticiones fallidas (status ≥ 400 o error de conexión) | *Error %* |
| `http_reqs` | Total de peticiones y peticiones/segundo | *Samples* / *Throughput* |
| `checks` | % de validaciones correctas | Resultados de las Assertions |
| `iterations` | Veces que se completó la función de un VU | Iteraciones del Thread Group |
| `http_req_duration{tipo:pizza}` | Latencia solo de las peticiones con esa etiqueta | Fila de un label en el Aggregate Report |
| `group_duration` | Duración total de un `group()` | Transaction Controller |

#### Código de salida (lo que usará Jenkins)

| Código | Significado |
|---|---|
| `0` | Todo correcto, thresholds cumplidos |
| `99` | Algún threshold no se cumplió (p. ej. `BASE_URL=http://localhost:3333` desde el contenedor) |
| `107` | Error del script (p. ej. falta `BASE_URL`) |

### 3. Pruebas de carga

Todas se lanzan igual que el smoke, cambiando solo el script. Conviene recrear la app antes de
cada una para partir de una BD vacía:

```powershell
docker compose up -d --force-recreate --wait
docker run --rm --network perf-net --env-file .env -v "${PWD}/k6:/k6:ro" grafana/k6:2.3.0 run /k6/scripts/load.js
```

| Script | Prueba | Carga | Duración |
|---|---|---|---|
| `smoke.js` | Smoke | 1 navegante + 1 cliente | 30 s |
| `load.js` | Load | Rampa a 20 VUs (12 navegantes + 8 clientes) | 5 min |

Detalle de objetivos y criterios: [docs/plan-de-pruebas.md](docs/plan-de-pruebas.md).

#### Organización del código k6

```text
k6/
├── lib/
│   ├── config.js       BASE_URL obligatoria, think time aleatorio
│   ├── auth.js         creación de usuarios (setup) y login con token reutilizado por VU
│   ├── datos.js        perfiles de restricciones con SharedArray
│   ├── flujos.js       recorridos "navegante" y "cliente" (≈ Test Fragments)
│   └── thresholds.js   criterios de aceptación reutilizables
├── data/
│   └── restricciones.json
└── scripts/            un script fino por prueba: solo define la carga (scenarios)
```

| k6 | JMeter |
|---|---|
| Recorrido en `lib/flujos.js` | Test Fragment + Module Controller |
| `scenarios` en cada script | Thread Groups del plan |
| `setup()` | setUp Thread Group |
| `SharedArray` + `restricciones.json` | CSV Data Set Config (*All threads*, *Recycle on EOF*) |
| `group()` | Transaction Controller |
| `check()` | Response Assertion (sin detener la prueba) |
| Etiqueta `tipo` | Nombre (label) del sampler |

Se irá completando fase a fase.
