// Recorridos de usuario reutilizables (≈ Test Fragments de JMeter).
// Cada script de prueba solo decide CUÁNTA carga aplica; QUÉ hace cada
// usuario está definido aquí una sola vez.
//
// Cada petición lleva la etiqueta "tipo" (publico, login, pizza, rating)
// para poder definir thresholds por tipo de endpoint (ver thresholds.js).

import http from 'k6/http';
import { check, group } from 'k6';
import { BASE_URL, thinkTime, enteroAleatorio } from './config.js';
import { obtenerToken, cabecerasAuth } from './auth.js';
import { siguienteRestriccion } from './datos.js';

// Navegante: consulta contenido público, sin autenticarse.
export function flujoNavegante() {
  // group() ≈ Transaction Controller: agrupa las peticiones y mide su duración total.
  group('navegante', function () {
    const quotes = http.get(`${BASE_URL}/api/quotes`, { tags: { tipo: 'publico' } });
    check(quotes, {
      'quotes: status 200': (r) => r.status === 200,
      'quotes: devuelve al menos una cita': (r) => r.status === 200 && r.json('quotes').length > 0,
    });

    const names = http.get(`${BASE_URL}/api/names`, { tags: { tipo: 'publico' } });
    check(names, {
      'names: status 200': (r) => r.status === 200,
      'names: devuelve al menos un nombre': (r) => r.status === 200 && r.json('names').length > 0,
    });
  });

  thinkTime(1, 3);
}

// Cliente: con sesión iniciada, pide una pizza y la puntúa.
export function flujoCliente(usuarios) {
  const token = obtenerToken(usuarios);

  // Si no hay token (login fallido) no se sigue, pero se respeta el think time
  // para no convertir el fallo en un bucle de peticiones sin pausa.
  if (token) {
    group('cliente', function () {
      const { perfil, restricciones } = siguienteRestriccion();
      const headers = cabecerasAuth(token);

      const pizza = http.post(`${BASE_URL}/api/pizza`, JSON.stringify(restricciones), {
        headers,
        tags: { tipo: 'pizza', perfil },
      });
      const pizzaOk = check(pizza, {
        'pizza: status 200': (r) => r.status === 200,
        'pizza: tiene id e ingredientes': (r) =>
          r.status === 200 && r.json('pizza.id') > 0 && r.json('pizza.ingredients').length > 0,
        'pizza: respeta "vegetariana"': (r) =>
          !restricciones.mustBeVegetarian || (r.status === 200 && r.json('vegetarian') === true),
      });

      // Sin pizza no hay nada que puntuar.
      if (!pizzaOk) {
        return;
      }

      const rating = http.post(
        `${BASE_URL}/api/ratings`,
        JSON.stringify({ pizza_id: pizza.json('pizza.id'), stars: enteroAleatorio(1, 5) }),
        { headers, tags: { tipo: 'rating' } },
      );
      check(rating, {
        'rating: status 201': (r) => r.status === 201,
      });
    });
  }

  thinkTime(2, 4);
}
