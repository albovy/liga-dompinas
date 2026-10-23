// Pruebas de src/pagina.js: los datos de la página (la liga calculada) y la plantilla rellena.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leerLiga } from '../src/liga.js';
import { codificarHtml, crearPagina } from '../src/pagina.js';

const PLANTILLA = readFileSync(new URL('../src/plantilla.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const LIGA = leerLiga(new URL('../liga/dompinas-1.json', import.meta.url));
const GENERADO = new Date(Date.UTC(2026, 10, 6, 21, 0));   // de pared (hora de Galicia)
const EDICION = { repo: 'albovy/liga-dompinas', workflow: 'resultado.yml', rama: 'main' };
const INICIO_DATOS = '<script id="datos" type="application/json">';

function jsonDe(html) {
  const ini = html.indexOf(INICIO_DATOS) + INICIO_DATOS.length;
  return html.slice(ini, html.indexOf('</script>', ini));
}
function datosDe(html) { return JSON.parse(jsonDe(html)); }
function veces(texto, trozo) { return texto.split(trozo).length - 1; }
function pagina(opciones = {}) {
  return crearPagina({ liga: LIGA, resultados: {}, club: 'DOMPAVOLEI', generado: GENERADO, edicion: null, ...opciones });
}

test('plantilla.html: un solo __TITULO__, __APP__ y __DATOS__, sin indexar, y el código sin errores de sintaxis', () => {
  for (const marca of ['__TITULO__', '__APP__', '__DATOS__']) assert.equal(veces(PLANTILLA, marca), 1, marca);
  assert.match(PLANTILLA, /<meta name="robots" content="noindex">/);
  const codigo = PLANTILLA.slice(PLANTILLA.lastIndexOf('<script>') + 8, PLANTILLA.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new Function(codigo));
  // Los colores de la web del calendario (aguamarina), no los del Instagram del equipo.
  for (const t of ['--agua: #0A7A70', '--agua-r: #5EC4B9', '--tinta: #121B2E', '--agua: #63D0C3']) assert.ok(PLANTILLA.includes(t), t);
  assert.doesNotMatch(PLANTILLA, /#A61D58|#E27BA8/i);
  assert.match(PLANTILLA, /@media \(prefers-color-scheme: dark\)/);
});

test('crearPagina: la liga calculada (clasificación, partidos con puntos, cruces), título y avisos', () => {
  const resultados = { P1: { sets: [[25, 18], [20, 22], [15, 12]] }, P2: { sets: [[30, 0], [25, 0], [15, 0]] } };
  const { html, avisos } = pagina({ resultados });
  assert.match(html, /<title>Liga Dompi&#241;as I &#183; DOMPAVOLEI &#183; 2026\/27<\/title>/);
  const d = datosDe(html);
  assert.deepEqual(Object.keys(d), ['club', 'nombre', 'temporada', 'generado', 'cats', 'equipos', 'max', 'normas', 'clas', 'partidos', 'final', 'terminada', 'edicion', 'avisos', 'escudo']);
  assert.equal(d.generado, '06/11/2026 21:00');
  // Sin enlace a la web del calendario (es aparte).
  assert.doesNotMatch(html, /id="volver"|github\.io\/calendario-dompavolei/);
  assert.deepEqual(d.cats.cadete, { n: 'Cadete', nv: 3 });
  assert.deepEqual(d.max, [25, 25, 15]);
  // P1: Cadete 20h 2-1 Alevín Remedios: 2 sets del cadete (1 punto cada uno) y 1 del alevín (3 puntos).
  const p1 = d.partidos.find((p) => p.id === 'P1');
  assert.deepEqual(p1.r, { sets: [[25, 18], [20, 22], [15, 12]], sl: 2, sv: 1, g: 'local', pl: 2, pv: 3 });
  assert.deepEqual([p1.l, p1.v, p1.reg, p1.cu, p1.an, p1.j, p1.f, p1.h, p1.fin],
    [{ id: 'cad20', t: 'Cadete 20h' }, { id: 'alerem', t: 'Alevín Remedios' }, true, true, false, 1, '2026-11-06', '17:00', '18:00']);
  // P2, con tantos que no valen: no cuenta, se avisa y queda marcado como guardado que no cuenta (g).
  const p2 = d.partidos.find((p) => p.id === 'P2');
  assert.deepEqual([p2.r, p2.g], [null, 1]);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /P2/);
  // La clasificación: el alevín, primero (3 puntos).
  assert.deepEqual(d.clas[0], { pos: 1, id: 'alerem', pj: 1, sg: 1, sp: 2, tf: 52, tc: 60, dif: -8, pts: 3, emp: false });
  // Los cruces, por puesto hasta acabar la fase regular (con quién sería ahora).
  const p31 = d.partidos.find((p) => p.id === 'P31');
  assert.deepEqual([p31.l, p31.reg, p31.nom, p31.r], [{ id: null, t: '1.º clasificado', a: 'alerem' }, false, 'Semifinal 1', null]);
  assert.deepEqual(d.partidos.find((p) => p.id === 'P36').l, { id: null, t: 'Ganador de Semifinal 1' });
  assert.deepEqual([d.partidos.find((p) => p.id === 'P34').am, d.partidos.find((p) => p.id === 'P34').cu], [true, false]);
  // Sin modo entrenador: ni edicion ni avisos en la página; sin escudo.
  assert.deepEqual([d.final, d.terminada, d.edicion, d.avisos, d.escudo], [null, false, null, [], '']);
});

test('crearPagina: con la llave de los entrenadores, la página lanza su workflow y ve los avisos; con escudo, también de icono', () => {
  const cifrada = `v1.600000.${'A'.repeat(22)}.${'b'.repeat(16)}.${'c'.repeat(150)}`;
  const { html } = pagina({
    edicion: { ...EDICION, cifrada }, resultados: { P99: { sets: [[25, 1], [25, 1], [15, 1]] } },
    rutaEscudo: new URL('../escudo.png', import.meta.url),
  });
  const d = datosDe(html);
  assert.deepEqual(d.edicion, { ...EDICION, cifrada });
  assert.deepEqual(d.avisos, ['Hay un resultado de P99 que no es de la liga; no cuenta.']);
  assert.match(d.escudo, /^data:image\/png;base64,/);
  assert.match(html, /<link rel="icon" type="image\/png" href="data:image\/png;base64,[A-Za-z0-9+/=]+">/);
});

test('crearPagina: los textos de la liga no pueden cerrar el <script> de los datos', () => {
  const liga = { ...LIGA, nombre: 'Liga </script><script>alert(1)</script>', normas: ['<!-- x', "$& $'"] };
  const { html } = pagina({ liga });
  assert.equal(veces(jsonDe(html), '<'), 0);
  assert.equal(datosDe(html).nombre, liga.nombre);
  assert.deepEqual(datosDe(html).normas, liga.normas);
  assert.match(html, /<title>Liga &lt;\/script&gt;/);
});

test('codificarHtml: < > " \' & con su entidad; tildes y emojis como &#número;', () => {
  assert.equal(codificarHtml('<a href="x">\'&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(codificarHtml('Dompiñas 🏐'), 'Dompi&#241;as &#127952;');
});

test('crearPagina: gu (la huella del resultado guardado) y g solo si no va a contar solo (no si falta un desempate)', () => {
  const GANA_L = [[25, 18], [20, 22], [15, 12]];
  // Fase regular con los tres infantiles y los dos cadetes empatados: P31 y P32 sin equipos aún.
  const resultados = {};
  for (const x of LIGA.partidos.filter((q) => typeof q.local === 'string')) resultados[x.id] = { sets: GANA_L };
  resultados.P32 = { sets: GANA_L, local: 'infc', visitante: 'infb' };
  let d = datosDe(pagina({ resultados }).html);
  const p32 = d.partidos.find((p) => p.id === 'P32');
  assert.deepEqual([p32.r, p32.g, p32.gu], [null, undefined, '[[[25,18],[20,22],[15,12]],"infc","infb"]']);
  assert.equal(d.partidos.find((p) => p.id === 'P1').gu, '[[[25,18],[20,22],[15,12]],null,null]');
  assert.equal(d.partidos.find((p) => p.id === 'P31').gu, undefined);
  // Ya con los equipos sabidos (desempates) y otros: se puede borrar (g).
  d = datosDe(pagina({ liga: { ...LIGA, desempates: [['infb', 'inflag', 'infc'], ['cad20', 'cadlag']] }, resultados }).html);
  assert.equal(d.partidos.find((p) => p.id === 'P32').g, 1);
});
