// Genera la web de la liga: la página (index.html) en la carpeta de salida, con la liga de config.json y sus
// resultados. La publica el workflow publicar.yml en GitHub Pages.
//
//   node src/generar.js [--config config.json] [--salida web]
//
// config.json:
//   club        El nombre del club. Con el mismo que el calendario del club («DOMPAVOLEI»), los entrenadores que ya
//               entraron allí en el modo entrenador ya tienen aquí la llave (la guarda el navegador con ese nombre).
//   liga        { "archivo": "liga/dompinas-1.json" }: la liga que se publica.
//   edicion     { "repo": "dueño/repositorio", "cifrada": "v1...." }: poner resultados desde la página (la llave
//               cifrada con la contraseña de los entrenadores: la misma que en el calendario). Sin ella, no se puede.
//   calendario  La dirección de la web del calendario del club: al publicar se comprueba que la contraseña de los
//               entrenadores es la misma (src/contrasena.js). No sale en la página. Opcional.
//
// Si la liga o sus resultados no se pueden leer, error y nada: se queda publicada la última página buena.

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { configLiga, leerLiga, leerResultados, rutaResultados } from './liga.js';
import { crearPagina } from './pagina.js';
import { ahoraMadrid, aviso, claveSinCaja, esObjeto, leerJson, paso, txt } from './util.js';

const RE_CIFRADA = /^v1\.\d{4,7}\.[\w-]{22}\.[\w-]{16}\.[\w-]{40,600}$/;

// Un campo de config.json sin distinguir mayúsculas.
function campo(cfg, nombre) { return esObjeto(cfg) ? cfg[claveSinCaja(cfg, nombre)] : undefined; }

// config.json › edicion → { repo, workflow, rama, cifrada? } o null (sin ella, o si no vale: aviso).
export function configEdicion(cfg) {
  const e = campo(cfg, 'edicion');
  if (e == null) return null;
  const repo = txt(campo(e, 'repo'));
  const workflow = campo(e, 'workflow') == null ? 'resultado.yml' : txt(campo(e, 'workflow'));
  const rama = campo(e, 'rama') == null ? 'main' : txt(campo(e, 'rama'));
  if (!/^[A-Za-z0-9-]+\/(?!\.\.?$)[\w.-]+$/.test(repo) || !/^[\w-][\w.-]*\.ya?ml$/.test(workflow) || !/^\w[\w./-]*$/.test(rama)) {
    aviso('config.json: "edicion" necesita "repo" (dueño/repositorio) y, si se ponen, "workflow" (el archivo .yml) y "rama"; sin ella no se pueden poner resultados desde la web.');
    return null;
  }
  const cifrada = txt(campo(e, 'cifrada')).trim();
  if (cifrada && !RE_CIFRADA.test(cifrada)) {
    aviso('config.json: "edicion" › "cifrada" no tiene la forma de una llave cifrada (la del calendario, «v1.600000....»); se ignora.');
  }
  return { repo, workflow, rama, ...(RE_CIFRADA.test(cifrada) ? { cifrada } : {}) };
}

// config.json › calendario: una dirección https, o '' (no se compara la contraseña).
export function configCalendario(cfg) {
  const url = txt(campo(cfg, 'calendario')).trim();
  if (!url) return '';
  if (/^https:\/\/[^\s"'<>\\]+$/.test(url)) return url;
  aviso('config.json: "calendario" tiene que ser una dirección https://...; no se comprueba que la contraseña sea la del calendario.');
  return '';
}

// Hace la página. Devuelve { ruta (la de index.html), avisos }. Lanza error si falta algo imprescindible.
export function generar({ config = 'config.json', salida = 'web', ahora = new Date() } = {}) {
  const rutaConfig = resolve(config);
  if (!existsSync(rutaConfig)) throw new Error(`no está ${config}.`);
  const cfg = leerJson(readFileSync(rutaConfig, 'utf8'));
  if (!esObjeto(cfg)) throw new Error(`${config} no es un objeto JSON.`);
  const conf = configLiga(cfg);
  if (!conf) throw new Error('falta config.json › liga › archivo.');
  const club = txt(campo(cfg, 'club')).trim();
  if (!club) throw new Error('falta config.json › club (el nombre del club, el mismo que en el calendario).');
  const carpeta = dirname(rutaConfig);
  const rutaLiga = join(carpeta, conf.archivo);
  const liga = leerLiga(rutaLiga);
  const resultados = leerResultados(rutaResultados(rutaLiga), { estricto: true });
  const { html, avisos } = crearPagina({
    liga, resultados, club, generado: ahoraMadrid(ahora), edicion: configEdicion(cfg), rutaEscudo: join(carpeta, 'escudo.png'),
  });
  const dir = resolve(salida);
  mkdirSync(dir, { recursive: true });
  const ruta = join(dir, 'index.html');
  writeFileSync(ruta, html, 'utf8');
  return { ruta, avisos, liga, resultados };
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
  try {
    const { values } = parseArgs({ options: { config: { type: 'string' }, salida: { type: 'string' } } });
    const { ruta, avisos, liga, resultados } = generar({ config: values.config, salida: values.salida });
    paso(`${liga.nombre}: ${Object.keys(resultados).length} resultado(s) guardado(s).`);
    // Los avisos, también como anotaciones de GitHub Actions (en una línea: cada línea podría ser una orden suya).
    for (const a of avisos) {
      aviso(a);
      if (process.env.GITHUB_ACTIONS === 'true') console.log(`::warning::${a.replace(/[\r\n]+/g, ' ')}`);
    }
    paso(`Página: ${ruta}`);
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
    if (process.env.GITHUB_ACTIONS === 'true') console.log(`::error::${String(e.message).replace(/[\r\n]+/g, ' ')}`);
    process.exitCode = 1;
  }
}
