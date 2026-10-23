// Pruebas de src/generar.js (config.json → web/index.html) y de los workflows (publicar.yml y resultado.yml).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configCalendario, configEdicion, generar } from '../src/generar.js';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const GENERAR = join(REPO, 'src', 'generar.js');
const CIFRADA = `v1.600000.${'A'.repeat(22)}.${'b'.repeat(16)}.${'c'.repeat(150)}`;

// Ejecuta f sin escribir en la consola y devuelve [resultado, líneas escritas].
function enSilencio(f) {
  const lineas = [];
  const original = console.log;
  console.log = (texto = '') => lineas.push(texto);
  try {
    return [f(), lineas];
  } finally {
    console.log = original;
  }
}

// Una carpeta como el repositorio: config.json, la liga, el escudo y (si se da) el archivo de resultados.
function carpeta(config, resultados) {
  const dir = mkdtempSync(join(tmpdir(), 'liga-web-'));
  mkdirSync(join(dir, 'liga'));
  copyFileSync(join(REPO, 'liga', 'dompinas-1.json'), join(dir, 'liga', 'dompinas-1.json'));
  copyFileSync(join(REPO, 'escudo.png'), join(dir, 'escudo.png'));
  writeFileSync(join(dir, 'config.json'), typeof config === 'string' ? config : JSON.stringify(config));
  if (resultados !== undefined) writeFileSync(join(dir, 'liga', 'resultados-dompinas-1.json'), resultados);
  return dir;
}
const CONFIG = { club: 'DOMPAVOLEI', liga: { archivo: 'liga/dompinas-1.json' }, edicion: { repo: 'albovy/liga-dompinas', cifrada: CIFRADA }, calendario: 'https://albovy.github.io/calendario-dompavolei/' };
function datosDe(ruta) {
  const html = readFileSync(ruta, 'utf8');
  const inicio = '<script id="datos" type="application/json">';
  const i = html.indexOf(inicio) + inicio.length;
  return JSON.parse(html.slice(i, html.indexOf('</script>', i)));
}

test('generar: index.html con la liga, sus resultados, el modo entrenador y el botón del calendario', () => {
  const dir = carpeta(CONFIG, JSON.stringify({ P1: { sets: [[25, 18], [20, 22], [15, 12]] } }));
  try {
    const [r] = enSilencio(() => generar({ config: join(dir, 'config.json'), salida: join(dir, 'web'), ahora: new Date('2026-11-06T20:30:00Z') }));
    assert.equal(r.ruta, join(dir, 'web', 'index.html'));
    const d = datosDe(r.ruta);
    assert.equal(d.club, 'DOMPAVOLEI');
    assert.equal(d.generado, '06/11/2026 21:30');   // hora de Galicia
    assert.deepEqual(d.edicion, { repo: 'albovy/liga-dompinas', workflow: 'resultado.yml', rama: 'main', cifrada: CIFRADA });
    assert.equal(d.calendario, 'https://albovy.github.io/calendario-dompavolei/');
    assert.deepEqual(d.partidos.find((p) => p.id === 'P1').r.sets, [[25, 18], [20, 22], [15, 12]]);
    assert.match(d.escudo, /^data:image\/png;base64,/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('generar: sin liga, sin club, o con la liga o sus resultados rotos: error y ninguna página (se queda la publicada)', () => {
  const casos = [
    [{ ...CONFIG, liga: undefined }, undefined, /falta config\.json › liga › archivo/],
    [{ ...CONFIG, club: '' }, undefined, /falta config\.json › club/],
    ['{ roto', undefined, /JSON/],
    [CONFIG, '{"P1": x\n::error::pwned', /resultados-dompinas-1\.json no se puede leer \(no es JSON válido\)/],
  ];
  for (const [config, resultados, error] of casos) {
    const dir = carpeta(config, resultados);
    try {
      assert.throws(() => enSilencio(() => generar({ config: join(dir, 'config.json'), salida: join(dir, 'web') })), error);
      assert.equal(existsSync(join(dir, 'web', 'index.html')), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('generar: por consola; los avisos, también como anotaciones de GitHub Actions; un error, código 1', () => {
  const dir = carpeta(CONFIG, JSON.stringify({ P99: { sets: [[25, 1], [25, 1], [15, 1]] } }));
  try {
    let r = spawnSync(process.execPath, [GENERAR, '--salida', 'web'], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'true' } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Liga Dompiñas I: 1 resultado\(s\) guardado\(s\)\./);
    assert.match(r.stdout, /\n::warning::Hay un resultado de P99 que no es de la liga; no cuenta\.\n/);
    assert.ok(existsSync(join(dir, 'web', 'index.html')));
    writeFileSync(join(dir, 'liga', 'resultados-dompinas-1.json'), '[1]');
    r = spawnSync(process.execPath, [GENERAR], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'true' } });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /::error::resultados-dompinas-1\.json no se puede leer \(no es un objeto\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('config.json: edicion (repo, workflow resultado.yml, rama main, la llave cifrada) y calendario (https)', () => {
  enSilencio(() => {
    assert.equal(configEdicion({}), null);
    assert.deepEqual(configEdicion({ edicion: { repo: 'a/b' } }), { repo: 'a/b', workflow: 'resultado.yml', rama: 'main' });
    assert.deepEqual(configEdicion({ Edicion: { Repo: 'a/b', Cifrada: CIFRADA } }), { repo: 'a/b', workflow: 'resultado.yml', rama: 'main', cifrada: CIFRADA });
    assert.deepEqual(configEdicion({ edicion: { repo: 'a/b', cifrada: 'no' } }), { repo: 'a/b', workflow: 'resultado.yml', rama: 'main' });
    for (const edicion of [{ repo: 'solo' }, { repo: 'a/b/c' }, { repo: 'a/b', workflow: '../x.yml' }, { repo: 'a/b', rama: '-x' }]) {
      assert.equal(configEdicion({ edicion }), null, JSON.stringify(edicion));
    }
    assert.equal(configCalendario({}), '');
    assert.equal(configCalendario({ calendario: 'https://albovy.github.io/calendario-dompavolei/' }), 'https://albovy.github.io/calendario-dompavolei/');
    for (const calendario of ['http://x.org', 'javascript:alert(1)', 'https://x.org/"><b>']) assert.equal(configCalendario({ calendario }), '', calendario);
  });
});

test('el config.json del repositorio: la liga del Excel, la llave del calendario y el botón del calendario', () => {
  const cfg = JSON.parse(readFileSync(join(REPO, 'config.json'), 'utf8'));
  assert.equal(cfg.club, 'DOMPAVOLEI');   // el mismo nombre que en el calendario: comparten la llave del navegador
  assert.deepEqual(cfg.liga, { archivo: 'liga/dompinas-1.json' });
  assert.equal(cfg.edicion.repo, 'albovy/liga-dompinas');
  assert.match(cfg.edicion.cifrada, /^v1\.600000\./);
  assert.equal(cfg.calendario, 'https://albovy.github.io/calendario-dompavolei/');
});

// --- Workflows --------------------------------------------------------------------------------------------------

function leerWorkflow(nombre) { return readFileSync(join(REPO, '.github', 'workflows', nombre), 'utf8').replace(/\r\n/g, '\n'); }
// El cuerpo de un paso «run: |», sin la sangría.
function pasoRun(workflow, nombre) {
  const lineas = workflow.split('\n');
  const i = lineas.findIndex((l) => l.trim() === `- name: ${nombre}`);
  const j = lineas.findIndex((l, k) => k > i && /^\s+run: \|$/.test(l));
  assert.ok(i >= 0 && j > i, `falta el paso «${nombre}» con run: |`);
  const sangriaRun = lineas[j].search(/\S/);
  const cuerpo = [];
  for (let k = j + 1; k < lineas.length && (!lineas[k].trim() || lineas[k].search(/\S/) > sangriaRun); k++) cuerpo.push(lineas[k]);
  const sangria = Math.min(...cuerpo.filter((l) => l.trim()).map((l) => l.search(/\S/)));
  return cuerpo.map((l) => l.slice(sangria)).join('\n').trimEnd();
}
// Nunca ${{ ... }} dentro de un script (se podría colar código): las entradas, en variables de entorno.
function sinExpresionesEnRun(workflow) {
  for (const [, cuerpo] of workflow.matchAll(/\n( +)run: ([^\n]*(?:\n\1 +[^\n]*|\n\s*(?=\n))*)/g)) assert.doesNotMatch(cuerpo, /\$\{\{/, cuerpo);
}

test('publicar.yml: con los cambios subidos, a mano y desde resultado.yml; genera lo último de la rama y publica en Pages; la nueva cancela la anterior', () => {
  const w = leerWorkflow('publicar.yml');
  assert.match(w, /\non:\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n {2}workflow_call:\n\n/);
  assert.match(w, /^permissions:\n {2}contents: read\n {2}pages: write\n {2}id-token: write\n/m);
  // En el trabajo (también cuando lo llama resultado.yml).
  assert.match(w, /\n {4}concurrency:\n {6}group: pages\n {6}cancel-in-progress: true\n/);
  // La rama tal como está ahora (no el commit que lanzó la ejecución): también al repetir una vieja.
  assert.match(w, /- uses: actions\/checkout@v7\n {8}with:\n {10}ref: \$\{\{ github\.ref_name \}\}\n/);
  assert.match(w, /- name: Generar la página\n {8}run: node src\/generar\.js --salida web\n/);
  // La contraseña, comparada con la del calendario: solo un aviso.
  assert.match(w, /- name: ¿La contraseña es la del calendario\?\n {8}continue-on-error: true\n {8}run: node src\/contrasena\.js\n/);
  assert.match(w, /uses: actions\/upload-pages-artifact@v5\n {8}with:\n {10}path: web\n/);
  assert.match(w, /- id: despliegue\n {8}uses: actions\/deploy-pages@v5\n$/);
  sinExpresionesEnRun(w);
});

test('resultado.yml: la página lo lanza con el partido, los tantos, los equipos y la huella; guarda en liga/ y publica en la misma ejecución', () => {
  const w = leerWorkflow('resultado.yml');
  const disparos = w.slice(w.indexOf('\non:\n'), w.indexOf('\npermissions:'));
  assert.match(disparos, /^ {2}workflow_dispatch:\n {4}inputs:\n {6}partido:\n(?: {8}[^\n]+\n)*? {8}required: true\n(?: {8}[^\n]+\n)*? {8}type: string\n/m);
  // Los tantos, obligatorios: lanzado a mano sin ellos no borra nada (para quitar un resultado: «borrar»).
  assert.match(disparos, /^ {6}sets:\n(?: {8}[^\n]+\n)*? {8}required: true\n(?: {8}[^\n]+\n)*? {8}type: string\n/m);
  assert.match(disparos, /borrar/);
  for (const x of ['local', 'visitante', 'antes']) assert.match(disparos, new RegExp(`^ {6}${x}:\\n(?: {8}[^\\n]+\\n)*? {8}required: false\\n`, 'm'));
  assert.doesNotMatch(disparos, /push:|schedule:|pull_request/);
  // Cada trabajo, lo suyo: guardar escribe en el repositorio; publicar, en Pages.
  assert.match(w, /^permissions: \{\}\n/m);
  assert.match(w, /\n {2}guardar:\n {4}permissions:\n {6}contents: write[^\n]*\n/);
  assert.match(w, /^concurrency:\n {2}group: liga-\$\{\{ inputs\.partido \}\}\n {2}cancel-in-progress: false\n/m);
  assert.match(w, /- name: Guardar el resultado\n {8}env:\n {10}PARTIDO: \$\{\{ inputs\.partido \}\}\n {10}SETS: \$\{\{ inputs\.sets \}\}\n {10}LOCAL: \$\{\{ inputs\.local \}\}\n {10}VISITANTE: \$\{\{ inputs\.visitante \}\}\n {10}ANTES: \$\{\{ inputs\.antes \}\}\n {10}RAMA: \$\{\{ github\.ref_name \}\}\n {8}run: \|\n/);
  sinExpresionesEnRun(w);
  // La liga, la de config.json (sin LIGA): el workflow no elige el archivo.
  assert.doesNotMatch(w, /LIGA/);
  const guardar = pasoRun(w, 'Guardar el resultado');
  assert.match(guardar, /for vez in 1 2 3 4 5; do\n {2}git fetch -q origin "\$RAMA"\n {2}git reset -q --hard "origin\/\$RAMA"\n {2}node src\/liga\.js\n {2}git add -A -- liga\n/);
  assert.match(guardar, /if git push -q origin "HEAD:\$RAMA"; then\n {4}exit 0\n {2}fi/);
  assert.match(guardar, /::error::[^\n]*\nexit 1$/);
  // Publicar, en otro trabajo después de guardar y en la misma ejecución (si falla, falla esta: GitHub avisa al dueño;
  // al repetirlo, no se vuelve a guardar este resultado).
  assert.match(w, /\n {2}publicar:\n {4}needs: guardar\n {4}permissions:\n {6}contents: read\n {6}pages: write\n {6}id-token: write\n {4}uses: \.\/\.github\/workflows\/publicar\.yml\n$/);
  assert.doesNotMatch(w, /gh workflow run/);
});

test('contrasena.js: compara la llave cifrada con la de la página publicada del calendario (sin parar nada si no puede)', async () => {
  const { cifradaDe, comprobar } = await import('../src/contrasena.js');
  const otra = `v1.600000.${'Z'.repeat(22)}.${'b'.repeat(16)}.${'c'.repeat(150)}`;
  const paginaCal = (cifrada) => `<script id="datos" type="application/json">{"edicion":{"repo":"albovy/calendario-dompavolei","workflow":"salida.yml","rama":"main","cifrada":"${cifrada}"}}</script>`;
  assert.equal(cifradaDe(paginaCal(CIFRADA)), CIFRADA);
  assert.equal(cifradaDe('<p>nada</p>'), '');
  const responde = (status, cuerpo) => async (url) => { assert.equal(url, CONFIG.calendario); return { ok: status === 200, status, text: async () => cuerpo }; };
  const igual = await comprobar(CONFIG, responde(200, paginaCal(CIFRADA)));
  assert.equal(igual.ok, true);
  const distinta = await comprobar(CONFIG, responde(200, paginaCal(otra)));
  assert.deepEqual([distinta.ok, /no es la del calendario/.test(distinta.mensaje)], [false, true]);
  // Sin poder leer la página, sin contraseña en ella o sin calendario: no se compara (y no es un fallo).
  assert.equal((await comprobar(CONFIG, responde(404, ''))).ok, true);
  assert.equal((await comprobar(CONFIG, async () => { throw new TypeError('sin red'); })).ok, true);
  assert.equal((await comprobar(CONFIG, responde(200, '<p>sin datos</p>'))).ok, true);
  assert.equal((await comprobar({ ...CONFIG, calendario: undefined }, () => assert.fail('no tiene que pedir nada'))).ok, true);
});
