// Criterios de aceptación reutilizables (ver docs/plan-de-pruebas.md, sección 7).
//
// Un threshold sobre una métrica con filtro, p. ej. 'http_req_duration{tipo:pizza}',
// solo evalúa las peticiones con esa etiqueta (≈ filtrar el Aggregate Report
// por label). Así un endpoint de 3 ms no "diluye" a uno de 100 ms.

// Load, soak y recuperación del spike.
export const thresholdsGenerales = {
  // La latencia sola engaña (una conexión rechazada "tarda" 0 ms): siempre
  // va acompañada del porcentaje de errores.
  http_req_failed: ['rate<0.01'],
  checks: ['rate>0.99'],
  'http_req_duration{tipo:publico}': ['p(95)<200'],
  'http_req_duration{tipo:pizza}': ['p(95)<500', 'p(99)<1000'],
  'http_req_duration{tipo:login}': ['p(95)<500'],
};

// Smoke: mismos límites de latencia, pero cero tolerancia a errores.
export const thresholdsSmoke = {
  ...thresholdsGenerales,
  http_req_failed: ['rate==0'],
  checks: ['rate==1'],
};
