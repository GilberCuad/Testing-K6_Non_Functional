// Datos de prueba compartidos entre VUs (≈ CSV Data Set Config de JMeter).

import { SharedArray } from 'k6/data';
import exec from 'k6/execution';

// SharedArray lee y parsea el archivo UNA sola vez (en el init) y todos los VUs
// comparten esa copia de solo lectura. Con un JSON.parse normal, cada VU
// tendría su propia copia en memoria.
const restricciones = new SharedArray('restricciones', function () {
  return JSON.parse(open('../data/restricciones.json'));
});

// Devuelve el siguiente perfil de restricciones, recorriendo el archivo en
// orden y volviendo al principio al terminar (≈ Sharing mode "All threads"
// + "Recycle on EOF"). Usa el contador de iteraciones del escenario, que es
// global a todos sus VUs, para repartir los perfiles de forma equilibrada.
export function siguienteRestriccion() {
  return restricciones[exec.scenario.iterationInTest % restricciones.length];
}
