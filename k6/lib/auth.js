// Registro y login de usuarios de prueba.

import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { BASE_URL, JSON_HEADERS } from './config.js';

// Usuarios efímeros: la BD de QuickPizza vive en memoria, la contraseña no es
// un secreto real. Se puede sobrescribir con -e TEST_USER_PASSWORD=...
const PASSWORD = __ENV.TEST_USER_PASSWORD || 'k6-perf-1234';

// Crea n usuarios nuevos. Pensada para setup() (≈ setUp Thread Group): se
// ejecuta una vez y el resultado se pasa a todos los VUs.
// El prefijo con timestamp evita el error "username already taken" si se
// relanza la prueba sin recrear el contenedor.
export function crearUsuarios(n) {
  const prefijo = `k6_${Date.now()}`;
  const usuarios = [];

  for (let i = 1; i <= n; i++) {
    const usuario = { username: `${prefijo}_${i}`, password: PASSWORD };
    const res = http.post(`${BASE_URL}/api/users`, JSON.stringify(usuario), {
      headers: JSON_HEADERS,
      tags: { tipo: 'registro' },
    });
    // Sin usuarios no tiene sentido seguir: un error en setup() aborta la prueba.
    if (res.status !== 201) {
      throw new Error(`No se pudo crear ${usuario.username}: HTTP ${res.status} ${res.body}`);
    }
    usuarios.push(usuario);
  }
  return usuarios;
}

// Token del VU actual. Las variables de módulo son privadas de cada VU
// (cada VU tiene su propio runtime de JavaScript), igual que las variables
// de JMeter son locales a cada hilo.
let token = null;

// Devuelve el token del VU, haciendo login solo la primera vez (sesión
// reutilizada, como un usuario real). Devuelve null si el login falla.
export function obtenerToken(usuarios) {
  if (token) {
    return token;
  }

  // Varios VUs pueden compartir usuario: QuickPizza devuelve siempre el mismo
  // token para el mismo usuario.
  const usuario = usuarios[(exec.vu.idInTest - 1) % usuarios.length];
  const res = http.post(`${BASE_URL}/api/users/token/login`, JSON.stringify(usuario), {
    headers: JSON_HEADERS,
    tags: { tipo: 'login' },
  });
  const ok = check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: devuelve token': (r) => r.status === 200 && typeof r.json('token') === 'string',
  });

  token = ok ? res.json('token') : null;
  return token;
}

export function cabecerasAuth(tokenUsuario) {
  return { ...JSON_HEADERS, Authorization: `Token ${tokenUsuario}` };
}
