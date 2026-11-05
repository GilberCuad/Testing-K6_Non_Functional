// Configuración común a todos los scripts.

import { sleep } from 'k6';

// La URL llega por variable de entorno (-e BASE_URL=... o --env-file .env).
// Sin valor por defecto a propósito: preferimos fallar antes que apuntar a un
// entorno equivocado (p. ej. el servidor público de QuickPizza).
export const BASE_URL = __ENV.BASE_URL;
if (!BASE_URL) {
  throw new Error('Falta BASE_URL. Ejemplo: -e BASE_URL=http://quickpizza:3333');
}

export const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Think time aleatorio entre min y max segundos (≈ Uniform Random Timer de JMeter).
// Evita que todos los VUs lancen sus peticiones sincronizados.
export function thinkTime(min, max) {
  sleep(min + Math.random() * (max - min));
}

// Entero aleatorio entre min y max, ambos incluidos.
export function enteroAleatorio(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}
