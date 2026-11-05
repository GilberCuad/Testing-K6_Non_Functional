// Smoke test: valida que los scripts y la app funcionan con carga mínima
// (1 VU por recorrido). Si esto falla, no tiene sentido lanzar el resto.
// Ver docs/plan-de-pruebas.md.
//
// Ejecución (desde la raíz del proyecto, con la app levantada):
//   docker run --rm --network perf-net --env-file .env -v "${PWD}/k6:/k6:ro" grafana/k6:2.3.0 run /k6/scripts/smoke.js

import { crearUsuarios } from '../lib/auth.js';
import { flujoNavegante, flujoCliente } from '../lib/flujos.js';
import { thresholdsSmoke } from '../lib/thresholds.js';

export const options = {
  // Cada escenario ≈ un Thread Group. "exec" indica qué función exportada ejecuta.
  scenarios: {
    navegantes: { executor: 'constant-vus', vus: 1, duration: '30s', exec: 'navegantes' },
    clientes: { executor: 'constant-vus', vus: 1, duration: '30s', exec: 'clientes' },
  },
  thresholds: thresholdsSmoke,
};

// Se ejecuta una vez antes de la carga (≈ setUp Thread Group).
export function setup() {
  return { usuarios: crearUsuarios(1) };
}

export function navegantes() {
  flujoNavegante();
}

// "data" es lo que devolvió setup().
export function clientes(data) {
  flujoCliente(data.usuarios);
}
