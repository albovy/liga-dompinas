// ¿La contraseña de los entrenadores de esta web es la del calendario del club? Las dos webs usan la misma llave
// cifrada (config.json › edicion › cifrada, en cada repositorio): si alguien la cambia en el calendario y no aquí, la
// contraseña nueva no entra en la liga. Lo mira publicar.yml al publicar: lee la página publicada del calendario
// (config.json › calendario), que lleva su llave cifrada en los datos, y si no es la misma avisa (sin parar nada).
//
//   node src/contrasena.js [--config config.json]

import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { configCalendario, configEdicion } from './generar.js';
import { leerJson } from './util.js';

// La llave cifrada que lleva la página del calendario en sus datos ('' si no lleva).
export function cifradaDe(html) {
  const m = /"cifrada":"(v1\.\d{4,7}\.[\w-]{22}\.[\w-]{16}\.[\w-]{40,600})"/.exec(String(html));
  return m ? m[1] : '';
}

// Compara las dos llaves cifradas. Devuelve { ok, mensaje }; pedir: el fetch con el que se lee la página.
export async function comprobar(cfg, pedir = fetch) {
  const url = configCalendario(cfg);
  const edicion = configEdicion(cfg);
  if (!url || !edicion || !edicion.cifrada) return { ok: true, mensaje: 'Sin calendario o sin contraseña: nada que comparar.' };
  let html;
  try {
    const r = await pedir(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { ok: true, mensaje: `No se ha podido leer la página del calendario (error ${r.status}); no se compara.` };
    html = await r.text();
  } catch {
    return { ok: true, mensaje: 'No se ha podido leer la página del calendario; no se compara.' };
  }
  const delCalendario = cifradaDe(html);
  if (!delCalendario) return { ok: true, mensaje: 'La página del calendario no lleva contraseña de entrenadores; no se compara.' };
  if (delCalendario === edicion.cifrada) return { ok: true, mensaje: 'La contraseña de los entrenadores es la del calendario.' };
  return {
    ok: false,
    mensaje: 'La contraseña de los entrenadores de la liga no es la del calendario: pon en config.json › edicion › cifrada la llave cifrada del config.json del calendario.',
  };
}

function esPrograma() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (esPrograma()) {
  const { values } = parseArgs({ options: { config: { type: 'string' } } });
  const { ok, mensaje } = await comprobar(leerJson(readFileSync(values.config || 'config.json', 'utf8')));
  console.log(`  ${mensaje}`);
  if (!ok) {
    console.log(`::warning::${mensaje}`);
    process.exitCode = 1;
  }
}
