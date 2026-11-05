// Load test: comportamiento con la carga esperada.
// 20 VUs en total (12 navegantes + 8 clientes, ≈ 60/40), modelo cerrado.
// Ver docs/plan-de-pruebas.md.
//
// Ejecución (desde la raíz del proyecto, con la app levantada):
//   docker run --rm --network perf-net --env-file .env -v "${PWD}/k6:/k6:ro" grafana/k6:2.3.0 run /k6/scripts/load.js

import { crearUsuarios } from '../lib/auth.js';
import { flujoNavegante, flujoCliente } from '../lib/flujos.js';
import { thresholdsGenerales } from '../lib/thresholds.js';

const VUS_NAVEGANTES = 12;
const VUS_CLIENTES = 8;

// Perfil de carga: 1 min de subida, 3 min estable, 1 min de bajada.
// ramping-vus ≈ Concurrency Thread Group (ramp-up + hold).
function rampa(target) {
  return [
    { duration: '1m', target },
    { duration: '3m', target },
    { duration: '1m', target: 0 },
  ];
}

export const options = {
  scenarios: {
    navegantes: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: rampa(VUS_NAVEGANTES),
      exec: 'navegantes',
    },
    clientes: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: rampa(VUS_CLIENTES),
      exec: 'clientes',
    },
  },
  thresholds: thresholdsGenerales,
};

// Un usuario por VU de clientes (≈ setUp Thread Group).
export function setup() {
  return { usuarios: crearUsuarios(VUS_CLIENTES) };
}

export function navegantes() {
  flujoNavegante();
}

export function clientes(data) {
  flujoCliente(data.usuarios);
}
