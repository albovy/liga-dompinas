// Pruebas de la página de la Liga Dompiñas (el <script> de src/plantilla.html), ejecutada con node:vm en el DOM
// simulado de test/apoyo/pagina-simulada.js, con los datos que le pone pagina.js (crearPagina) a partir de la liga de
// verdad.
// En el DOM simulado es viernes 25/09/2026: los partidos de la liga aún no se han jugado; para el modo entrenador
// (resultados de partidos ya jugados) se usa la misma liga un año antes (LIGA_PASADA).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { aplicarResultado, leerLiga } from '../src/liga.js';
import { crearPagina } from '../src/pagina.js';
import { abrirPagina as abrir, codigoDe, elemento, plantilla } from './apoyo/pagina-simulada.js';

const CODIGO = codigoDe(plantilla('plantilla.html'));
const LIGA = leerLiga(new URL('../liga/dompinas-1.json', import.meta.url));
const unAnoAntes = (f) => `${+f.slice(0, 4) - 1}${f.slice(4)}`;
const LIGA_PASADA = { ...LIGA, partidos: LIGA.partidos.map((p) => ({ ...p, fecha: unAnoAntes(p.fecha) })) };
const GENERADO = new Date(Date.UTC(2026, 10, 6, 21, 0));   // de pared (hora de Galicia)
const CLAVE = 'calendario-voley:DOMPAVOLEI';
const CLAVE_LLAVE = `${CLAVE}:llave`;
const LLAVE = `github_pat_PRUEBA_${'x'.repeat(40)}`;
const EDICION = { repo: 'albovy/liga-dompinas', workflow: 'resultado.yml', rama: 'main' };
const API = 'https://api.github.com/repos/albovy/liga-dompinas/actions/workflows/resultado.yml';
const GANA_L = [[25, 18], [20, 22], [15, 12]];
const GANA_V = [[18, 25], [22, 20], [12, 15]];
const respuesta = (status) => Promise.resolve({ ok: status >= 200 && status < 300, status });
const esperar = () => new Promise((listo) => { setImmediate(listo); });

// Los datos de la página (los de pagina.js, tal cual van en ella).
function datosLiga({ resultados = {}, edicion = null, liga = LIGA } = {}) {
  const { html } = crearPagina({ liga, resultados, club: 'DOMPAVOLEI', generado: GENERADO, edicion });
  const ini = html.indexOf('<script id="datos" type="application/json">') + '<script id="datos" type="application/json">'.length;
  return JSON.parse(html.slice(ini, html.indexOf('</script>', ini)));
}
function abrirLiga({ resultados, edicion, liga, llave = '', llaveDe = '', guardado = null, ...opciones } = {}) {
  const almacen = new Map();
  if (llave) almacen.set(CLAVE_LLAVE, llave);
  if (llaveDe) almacen.set(`${CLAVE_LLAVE}-de`, llaveDe);
  if (guardado) almacen.set(`${CLAVE}:liga`, JSON.stringify(guardado));
  const p = abrir(CODIGO, datosLiga({ resultados, edicion, liga }), { almacen, ...opciones });
  p.almacen = almacen;
  return p;
}
// El modo entrenador, con la llave y la liga ya jugada.
function abrirEntrenador(opciones = {}) { return abrirLiga({ edicion: EDICION, llave: LLAVE, liga: LIGA_PASADA, guardado: { sec: 'partidos', eq: '' }, ...opciones }); }
function texto(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/\s+/g, ' ').trim();
}
// Las filas de partidos: { i, id, html }.
function filas(html) {
  return html.split('<article class="fila').slice(1).map((t) => {
    const cuerpo = t.slice(0, t.indexOf('</article>'));
    return { i: +/data-i="(\d+)"/.exec(cuerpo)[1], id: /id="p-(P\d+)"/.exec(cuerpo)[1], html: cuerpo.slice(cuerpo.indexOf('>') + 1) };
  });
}
function fila(p, id) { return filas(p.contenido.innerHTML).find((f) => f.id === id); }
function pulsar(p, idTab) { p.porId(idTab).oyentes.click({}); }
function boton(p, clase, i, attrs = {}) {
  const b = elemento(p.doc, 'button');
  b.classList.add(clase);
  if (i !== undefined) b.setAttribute('data-i', i);
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  return b;
}
function enContenido(p, clase, i, evento = {}) { p.contenido.oyentes.click({ target: boton(p, clase, i), ...evento }); }
function elegirEquipo(p, id) { p.porId('chips').oyentes.click({ target: boton(p, 'chip', undefined, { 'data-eq': id }) }); }
// Escribe los tantos en el editor (como al teclearlos: el evento «input»). '' deja la casilla vacía.
function escribirSets(p, sets) {
  sets.forEach((s, k) => s.forEach((n, e) => { p.porId(`er-${k}-${e}`).value = String(n); }));
  p.contenido.oyentes.input({ target: boton(p, 'er-n') });
}
const i = (id) => LIGA.partidos.findIndex((x) => x.id === id);
const conBoton = (p) => [...p.contenido.innerHTML.matchAll(/class="boton-p poner-res" id="pr-(\d+)"/g)].map((m) => LIGA.partidos[+m[1]].id);
const cuerpo = (p, n = 0) => JSON.parse(p.peticiones[n].opciones.body);

test('plantilla.html: los elementos que usa el código están en la página (o los pinta él: el editor)', () => {
  const html = plantilla('plantilla.html');
  const ids = new Set([...CODIGO.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]));
  const pintados = new Set(['er-pista', 'er-aviso', 'chip-0']);
  for (const id of ids) if (!pintados.has(id)) assert.match(html, new RegExp(`id="${id}"`), id);
  for (const s of ['clas', 'partidos', 'normas']) assert.match(html, new RegExp(`id="tab-${s}"`));
  for (const id of ['er-pista', 'er-aviso', 'chip-0', 'er-confirma', 'er-borrar']) assert.match(CODIGO, new RegExp(`id="${id}"`), id);
});

test('liga: cabecera, pie y, sin resultados aún, los partidos por jornada (la 1.ª, la próxima)', () => {
  const p = abrirLiga();
  assert.equal(p.porId('titulo').textContent, 'Liga Dompiñas I');
  assert.equal(p.porId('subtitulo').textContent, 'DOMPAVOLEI · temporada 2026/27');
  assert.match(p.porId('pie').textContent, /actualizados el 06\/11\/2026 21:00/);
  assert.equal(p.porId('tab-partidos').getAttribute('aria-pressed'), 'true');
  assert.match(texto(p.contenido.innerHTML), /^Partidos Todos los equipos Jornada 1/);
  const fs = filas(p.contenido.innerHTML);
  assert.equal(fs.length, 36);
  assert.deepEqual(fs.slice(0, 3).map((f) => f.id), ['P1', 'P2', 'P3']);
  assert.equal(texto(fs[0].html), '17:00 a 18:00 Cadete 20h Alevín Remedios');
  assert.match(p.contenido.innerHTML, /Jornada 1 · viernes 6 de noviembre<\/span><span class="nota prox">Próxima/);
  assert.equal(p.contenido.innerHTML.split('Próxima').length - 1, 1);
  // Los cruces: el puesto (sin «ahora»: aún no hay resultados) y el partido amistoso.
  assert.equal(texto(fila(p, 'P31').html), '17:00 a 18:00 Semifinal 1 1.º clasificado 4.º clasificado');
  assert.match(texto(fila(p, 'P34').html), /Amistoso: no cuenta para la clasificación\./);
  // Sin config.json › edicion, ni modo entrenador ni botones.
  assert.equal(p.porId('entrenador').classList.contains('oculto'), true);
  assert.deepEqual(conBoton(p), []);
});

test('liga: con resultados, se empieza por la clasificación; sets, puntos de liga y quién sería cada puesto', () => {
  const resultados = { P1: { sets: GANA_L }, P2: { sets: [[18, 25], [25, 20], [10, 15]] } };
  const p = abrirLiga({ resultados });
  assert.equal(p.porId('tab-clas').getAttribute('aria-pressed'), 'true');
  const h = p.contenido.innerHTML;
  assert.match(texto(h), /Clasificación 2 de 30 partidos jugados/);
  // Infantil C gana 2-1 al Cadete Lagoas (sus sets valen 2: 4 puntos); el alevín, 1 set al cadete (3 puntos).
  const filasTabla = [...h.matchAll(/<tr class="[^"]*">([\s\S]*?)<\/tr>/g)].map((m) => texto(m[1]));
  assert.deepEqual(filasTabla.slice(0, 3), ['1 Infantil C 1 2 1 +7 4', '2 Alevín Remedios 1 1 2 -8 3', '3 Cadete 20h 1 2 1 +8 2']);
  assert.match(h, /<tr class="corte">/);   // la raya bajo el 4.º
  // Los cruces, con quién sería ahora.
  assert.match(h, /1\.º clasificado<span class="ahora">ahora, Infantil C<\/span>/);
  assert.match(texto(h), /Partido único, sin coeficiente: pasa quien gana más sets/);
  pulsar(p, 'tab-partidos');
  const f = fila(p, 'P1');
  assert.match(f.html, /<div class="lado gana" data-cat="cadete">[\s\S]*Cadete 20h[\s\S]*\+2 pts<\/span><span class="tanteo">2<\/span>/);
  assert.match(f.html, /<div class="lado" data-cat="alevin">[\s\S]*Alevín Remedios[\s\S]*\+3 pts<\/span><span class="tanteo">1<\/span>/);
  assert.match(texto(f.html), /Sets: 25-18 · 20-22 · 15-12/);
  // Un 3-0: el que pierde, «0 pts» (no «+0»).
  const p3 = fila(abrirLiga({ resultados: { P3: { sets: [[25, 1], [25, 1], [15, 1]] } }, guardado: { sec: 'partidos', eq: '' } }), 'P3');
  assert.match(p3.html, /<span class="ptsl">0 pts<\/span>/);
  assert.equal(p.almacen.get(`${CLAVE}:liga`), JSON.stringify({ sec: 'partidos', eq: '' }));
});

test('liga: acabada la fase regular, los empatados a puntos y a tantos: «=» y el aviso del partido de desempate (antes, no)', () => {
  // A mitad de liga, los empates no se marcan (aún no deciden nada).
  assert.doesNotMatch(abrirLiga({ resultados: { P1: { sets: GANA_L } } }).contenido.innerHTML, /class="emp"|desempate/);
  // Todos ganan en casa 2-1: los tres infantiles, empatados, y los dos cadetes también.
  const resultados = {};
  for (const x of LIGA.partidos.filter((q) => typeof q.local === 'string')) resultados[x.id] = { sets: GANA_L };
  const h = abrirLiga({ resultados }).contenido.innerHTML;
  assert.equal(h.split('<span class="emp" aria-hidden="true">=</span><span class="sr-only"> (empatado)</span>').length - 1, 5);
  assert.match(texto(h), /= Empatados a puntos y a diferencia de tantos: se decide con un partido de desempate\./);
  // Los puestos empatados, sin «ahora» (el orden por nombre no decide nada).
  assert.doesNotMatch(h, /class="ahora"/);
});

test('liga: «Mi equipo»: en Partidos, solo los suyos; en la clasificación, resaltado; se recuerda y se anuncia', () => {
  const p = abrirLiga({ resultados: { P1: { sets: GANA_L } } });
  elegirEquipo(p, 'infb');
  // Los chips no se vuelven a crear (no se pierde el foco): solo cambia su estado.
  assert.match(p.porId('chips').innerHTML, /id="chip-4" data-eq="infb" data-cat="infantil">/);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((k) => p.porId(`chip-${k}`).getAttribute('aria-pressed')), ['false', 'false', 'false', 'false', 'true', 'false', 'false']);
  assert.match(p.contenido.innerHTML, /<tr class="[^"]*nuestro"><td class="pos">\d<\/td><td class="eq" data-cat="infantil"><span class="punto"><\/span>Infantil B</);
  assert.equal(p.contenido.innerHTML.split('nuestro">').length - 1, 1);
  assert.equal(p.estado.textContent, 'Mi equipo: Infantil B');
  pulsar(p, 'tab-partidos');
  const ids = filas(p.contenido.innerHTML).map((f) => f.id);
  // Sus 10 partidos de la fase regular y la semifinal que jugaría ahora (va 4.º).
  assert.equal(ids.length, 11);
  assert.equal(ids[10], 'P31');
  assert.match(fila(p, 'P31').html, /4\.º clasificado<span class="ahora">ahora, Infantil B</);
  assert.ok(ids.slice(0, 10).every((id) => { const x = LIGA.partidos.find((q) => q.id === id); return x.local === 'infb' || x.visitante === 'infb'; }), ids.join());
  assert.match(texto(p.contenido.innerHTML), /^Partidos Infantil B/);
  assert.equal(p.almacen.get(`${CLAVE}:liga`), JSON.stringify({ sec: 'partidos', eq: 'infb' }));
  // Al volver, sigue elegido; un equipo que ya no está en la liga no vale.
  assert.equal(filas(abrirLiga({ guardado: { sec: 'partidos', eq: 'infb' } }).contenido.innerHTML).length, 10);
  assert.equal(filas(abrirLiga({ guardado: { sec: 'partidos', eq: 'otro' } }).contenido.innerHTML).length, 36);
  elegirEquipo(p, '');
  assert.equal(filas(p.contenido.innerHTML).length, 36);
  assert.equal(p.estado.textContent, 'Todos los equipos, 36 partidos');
  assert.equal(p.porId('chip-0').getAttribute('aria-pressed'), 'true');
});

test('liga: Normas, y lo que vale cada set según quién lo gana y quién lo pierde', () => {
  const p = abrirLiga();
  pulsar(p, 'tab-normas');
  const h = p.contenido.innerHTML;
  assert.equal(h.split('<li>').length - 1, LIGA.normas.length);
  const filasValor = [...h.matchAll(/<tr><th scope="row"[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => texto(m[1]));
  assert.deepEqual(filasValor, ['Alevín 1 2 3', 'Infantil 1 1 2', 'Cadete 1 1 1']);
  assert.equal(p.porId('fijos').classList.contains('oculto'), true);   // sin «Mi equipo»
});

test('liga: acabada la fase regular, los cruces con sus equipos; con la final, la clasificación final', () => {
  const resultados = {};
  for (const x of LIGA.partidos.filter((q) => typeof q.local === 'string')) resultados[x.id] = { sets: ['P2', 'P3'].includes(x.id) ? GANA_V : GANA_L };
  Object.assign(resultados, { P31: { sets: GANA_L }, P32: { sets: GANA_L }, P33: { sets: GANA_L }, P35: { sets: GANA_L }, P36: { sets: GANA_L } });
  const h = abrirLiga({ resultados }).contenido.innerHTML;
  assert.match(texto(h), /^Clasificación final 1\.º Alevín Remedios Campeón 2\.º Infantil C 3\.º Infantil Lagoas 4\.º Infantil B 5\.º Cadete 20h 6\.º Cadete Lagoas /);
  assert.match(texto(h), /Fase regular Fase regular terminada/);
  assert.match(texto(h), /Gran final vie 23\/4 · 19:20 Alevín Remedios 2 Infantil C 1 Sets: 25-18 · 20-22 · 15-12/);
});

test('liga: un partido anulado: tachado, «Anulado» y sin botón; no cuenta', () => {
  const liga = { ...LIGA_PASADA, partidos: LIGA_PASADA.partidos.map((x) => (x.id === 'P1' ? { ...x, anulado: true } : x)) };
  const p = abrirEntrenador({ liga });
  const f = filas(p.contenido.innerHTML).find((x) => x.id === 'P1');
  assert.match(p.contenido.innerHTML, /<article class="fila anulada" id="p-P1"/);
  assert.match(texto(f.html), /Anulado: no se juega y no cuenta para la clasificación\./);
  assert.ok(!conBoton(p).includes('P1'));
  assert.equal(conBoton(p).length, 29);
});

// --- Modo entrenador ---------------------------------------------------------------------------------------------

test('entrenador: con la llave del calendario, «Poner resultado» en los partidos ya jugados con sus equipos sabidos', () => {
  let p = abrirLiga({ edicion: EDICION, liga: LIGA_PASADA, guardado: { sec: 'partidos', eq: '' } });
  assert.equal(p.porId('entrenador').classList.contains('oculto'), false);
  assert.match(p.porId('entrenador-texto').textContent, /pega la llave/);
  assert.deepEqual(conBoton(p), []);
  p = abrirEntrenador();
  assert.equal(p.porId('llave-fila').classList.contains('oculto'), true);
  assert.equal(p.porId('quitar-llave').classList.contains('oculto'), false);
  const ids = conBoton(p);
  assert.equal(ids.length, 30);
  assert.ok(!ids.includes('P31'));   // los cruces, cuando se sepa quién juega
  // Los que aún no se han jugado (después de hoy), sin botón: un toque en la fila equivocada no pone nada.
  p = abrirLiga({ edicion: EDICION, llave: LLAVE, guardado: { sec: 'partidos', eq: '' } });
  assert.deepEqual(conBoton(p), []);
  // Una llave que no tiene la forma de las de verdad se olvida.
  p = abrirEntrenador({ llave: 'ghp_clasica' });
  assert.deepEqual(conBoton(p), []);
  assert.equal(p.almacen.has(CLAVE_LLAVE), false);
});

test('entrenador: una llave de otra contraseña (página vieja) no se usa aquí, pero tampoco se borra', () => {
  const p = abrirEntrenador({ edicion: { ...EDICION, cifrada: `v1.600000.${'A'.repeat(22)}.${'b'.repeat(16)}.${'c'.repeat(150)}` }, llaveDe: `v1.600000.${'Z'.repeat(22)}.${'b'.repeat(16)}.${'c'.repeat(150)}` });
  assert.deepEqual(conBoton(p), []);
  assert.equal(p.almacen.get(CLAVE_LLAVE), LLAVE);
});

test('entrenador: el editor con los tres sets; mientras se escribe, quién gana y los puntos; «Guardar» lanza resultado.yml', async () => {
  const p = abrirEntrenador({ red: () => respuesta(204) });
  enContenido(p, 'poner-res', i('P1'));
  let f = fila(p, 'P1');
  assert.match(f.html, /<th scope="col">Cadete 20h<\/th><th scope="col">Alevín Remedios<\/th>/);
  assert.match(f.html, /Set 3 <small>\(a 15\)<\/small>/);
  assert.match(f.html, /<input type="number" inputmode="numeric" min="0" max="25" class="er-n" id="er-0-0" value="" aria-label="Set 1, Cadete 20h">/);
  assert.match(f.html, /<p class="es-pista" id="er-pista" aria-live="polite">Escribe los tantos de los 3 sets/);
  assert.equal(p.doc.activeElement, p.porId('er-0-0'));
  assert.ok(!conBoton(p).includes('P1'));
  // A medio escribir, nada en rojo.
  escribirSets(p, [[25, ''], ['', ''], ['', '']]);
  assert.deepEqual([p.porId('er-pista').textContent, p.porId('er-pista').classList.contains('mal')], ['Escribe los tantos de los 3 sets (se juegan siempre los 3).', false]);
  escribirSets(p, GANA_L);
  assert.equal(p.porId('er-pista').textContent, 'Gana Cadete 20h, 2-1. Puntos de liga: Cadete 20h +2, Alevín Remedios +3.');
  escribirSets(p, [[25, 18], [20, 20], [15, 12]]);
  assert.deepEqual([p.porId('er-pista').textContent, p.porId('er-pista').classList.contains('mal')], ['Set 2: no puede acabar empatado (con punto de oro, siempre gana alguien).', true]);
  escribirSets(p, [[25, 18], [20, 22], [16, 12]]);
  assert.equal(p.porId('er-pista').textContent, 'Set 3: como mucho a 15 tantos.');
  // Con algo mal, «Guardar» no manda nada: lo dice debajo (y a los lectores de pantalla).
  enContenido(p, 'er-guardar', i('P1'));
  assert.equal(p.peticiones.length, 0);
  assert.equal(p.estado.textContent, 'Set 3: como mucho a 15 tantos.');
  escribirSets(p, GANA_L);
  enContenido(p, 'er-guardar', i('P1'));
  f = fila(p, 'P1');
  assert.match(f.html, /disabled>Guardando…</);
  assert.match(f.html, /id="er-0-0" value="25"[^>]* disabled>/);
  await esperar();
  assert.equal(p.peticiones.length, 1);
  const { url, opciones } = p.peticiones[0];
  assert.equal(url, `${API}/dispatches`);
  assert.equal(opciones.method, 'POST');
  assert.equal(opciones.headers.Authorization, `Bearer ${LLAVE}`);
  // Con los equipos que enseña la página (si el cuadro cambió, el resultado no se da a otros).
  assert.deepEqual(cuerpo(p), { ref: 'main', inputs: { partido: 'P1', sets: '25-18 20-22 15-12', local: 'cad20', visitante: 'alerem' } });
  f = fila(p, 'P1');
  assert.doesNotMatch(f.html, /er-0-0/);   // editor cerrado
  assert.match(texto(f.html), /Enviado, se publica en 1 o 2 minutos: 25-18 · 20-22 · 15-12\./);
  assert.match(texto(f.html), /✓ Enviado: 25-18 · 20-22 · 15-12\. En 1 o 2 minutos estará en la web/);
  assert.match(f.html, />Cambiar resultado</);
  assert.equal(p.doc.activeElement, p.porId(`pr-${i('P1')}`));
  assert.match(p.estado.textContent, /Enviado/);
  // Otra vez lo mismo: nada que mandar.
  enContenido(p, 'poner-res', i('P1'));
  assert.match(fila(p, 'P1').html, /id="er-0-0" value="25"/);
  enContenido(p, 'er-guardar', i('P1'));
  assert.equal(p.peticiones.length, 1);
  assert.match(texto(fila(p, 'P1').html), /Es el mismo resultado: no hay nada que cambiar\./);
});

test('entrenador: en los playoffs (y en el amistoso), «Gana», sin puntos de liga', () => {
  const resultados = {};
  for (const x of LIGA.partidos.filter((q) => typeof q.local === 'string')) resultados[x.id] = { sets: ['P2', 'P3'].includes(x.id) ? GANA_V : GANA_L };
  const p = abrirEntrenador({ resultados });
  enContenido(p, 'poner-res', i('P33'));   // 5.º y 6.º: Cadete 20h – Cadete Lagoas
  escribirSets(p, GANA_V);
  assert.equal(p.porId('er-pista').textContent, 'Gana Cadete Lagoas, 2-1.');
});

test('entrenador: «Borrar resultado» pregunta aparte; un doble toque no lo borra; manda «borrar»', async () => {
  const p = abrirEntrenador({ resultados: { P1: { sets: GANA_L } }, red: () => respuesta(204) });
  assert.match(fila(p, 'P1').html, />Cambiar resultado</);
  enContenido(p, 'poner-res', i('P1'));
  assert.match(fila(p, 'P1').html, /id="er-2-1" value="12"/);
  enContenido(p, 'er-borrar', i('P1'));
  let f = fila(p, 'P1');
  assert.equal(p.peticiones.length, 0);
  assert.match(texto(f.html), /¿Borrar el resultado de este partido\? Sí, borrarlo No/);
  assert.doesNotMatch(f.html, /id="er-borrar"/);              // el botón de antes ya no está ahí
  assert.match(f.html, /class="boton principal er-guardar" data-i="\d+" disabled>Guardar/);
  assert.equal(p.doc.activeElement, p.porId('er-confirma'));
  // El segundo clic de un doble clic (detail 2) no contesta la pregunta.
  enContenido(p, 'er-borrar-si', i('P1'), { detail: 2 });
  assert.equal(p.peticiones.length, 0);
  // «No»: vuelve el botón.
  enContenido(p, 'er-borrar-no', i('P1'));
  assert.match(fila(p, 'P1').html, /id="er-borrar"/);
  assert.equal(p.doc.activeElement, p.porId('er-borrar'));
  enContenido(p, 'er-borrar', i('P1'));
  enContenido(p, 'er-borrar-si', i('P1'), { detail: 1 });
  await esperar();
  // Con la huella de lo que enseñaba la página: solo se borra si sigue siendo eso.
  assert.deepEqual(cuerpo(p).inputs, { partido: 'P1', sets: 'borrar', antes: '[[[25,18],[20,22],[15,12]],null,null]' });
  f = fila(p, 'P1');
  assert.match(texto(f.html), /✓ Enviado: resultado borrado\./);
  // Ya borrado (aún sin publicar): «Poner resultado» y, en el editor, sin «Borrar».
  assert.match(f.html, />Poner resultado</);
  enContenido(p, 'poner-res', i('P1'));
  assert.doesNotMatch(fila(p, 'P1').html, /er-borrar/);
  assert.match(fila(p, 'P1').html, /id="er-0-0" value=""/);
  enContenido(p, 'er-cancelar', i('P1'));
  assert.doesNotMatch(fila(p, 'P1').html, /er-0-0/);
});

test('entrenador: si la llave ya no vale (401), se olvida y se abre el modo entrenador; otros errores, sin cerrar el editor', async () => {
  let p = abrirEntrenador({ red: () => respuesta(401) });
  enContenido(p, 'poner-res', i('P1'));
  escribirSets(p, GANA_L);
  enContenido(p, 'er-guardar', i('P1'));
  await esperar();
  assert.equal(p.almacen.has(CLAVE_LLAVE), false);
  assert.equal(p.porId('llave-fila').classList.contains('oculto'), false);
  assert.equal(p.porId('entrenador').open, true);
  assert.equal(p.doc.activeElement, p.porId('llave'));
  assert.match(texto(p.contenido.innerHTML), /La llave ya no vale/);
  assert.match(p.estado.textContent, /La llave ya no vale/);
  assert.deepEqual(conBoton(p), []);
  p = abrirEntrenador({ red: () => respuesta(403) });
  enContenido(p, 'poner-res', i('P1'));
  escribirSets(p, GANA_L);
  enContenido(p, 'er-guardar', i('P1'));
  await esperar();
  assert.match(fila(p, 'P1').html, /id="er-0-0" value="25"/);   // lo escrito sigue ahí
  assert.match(texto(fila(p, 'P1').html), /GitHub no deja guardar con esta llave \(error 403\)/);
  // Al corregirlo, el error de antes se va.
  escribirSets(p, GANA_V);
  assert.equal(p.porId('er-aviso').textContent, '');
  p = abrirEntrenador({ red: () => respuesta(404) });
  enContenido(p, 'poner-res', i('P1'));
  escribirSets(p, GANA_L);
  enContenido(p, 'er-guardar', i('P1'));
  await esperar();
  assert.match(texto(fila(p, 'P1').html), /no encuentra la tarea de la liga/);
  p = abrirEntrenador({ enLinea: false });
  enContenido(p, 'poner-res', i('P1'));
  escribirSets(p, GANA_L);
  enContenido(p, 'er-guardar', i('P1'));
  assert.equal(p.peticiones.length, 0);
  assert.match(texto(fila(p, 'P1').html), /Sin conexión: no se ha guardado/);
});

test('entrenador: cambiar de pestaña mientras se guarda no pierde el editor ni lo que pase', async () => {
  let responder;
  const p = abrirEntrenador({ red: () => new Promise((listo) => { responder = listo; }) });
  enContenido(p, 'poner-res', i('P1'));
  escribirSets(p, GANA_L);
  enContenido(p, 'er-guardar', i('P1'));
  pulsar(p, 'tab-clas');
  pulsar(p, 'tab-partidos');
  assert.match(fila(p, 'P1').html, /disabled>Guardando…</);
  responder({ ok: false, status: 500 });
  await esperar();
  assert.match(fila(p, 'P1').html, /id="er-0-0" value="25"/);
  assert.match(texto(fila(p, 'P1').html), /error 500 de GitHub/);
});

test('entrenador: los avisos de la publicación (un resultado que ya no cuenta), arriba, solo con la llave', () => {
  const res = {};
  for (const x of LIGA.partidos.filter((q) => typeof q.local === 'string')) res[x.id] = { sets: ['P2', 'P3'].includes(x.id) ? GANA_V : GANA_L };
  // Las semifinales las ganan Alevín Remedios e Infantil C; la final se puso con Infantil B.
  let resultados = aplicarResultado(res, 'P31', GANA_L, new Date(), { local: 'alerem', visitante: 'inflag' });
  resultados = aplicarResultado(resultados, 'P32', GANA_L, new Date(), { local: 'infc', visitante: 'infb' });
  resultados = aplicarResultado(resultados, 'P36', GANA_L, new Date(), { local: 'alerem', visitante: 'infb' });
  const p = abrirEntrenador({ resultados, guardado: { sec: 'clas', eq: '' } });
  assert.match(texto(p.contenido.innerHTML), /^Avisos para los entrenadores El resultado de P36 se puso para Alevín Remedios – Infantil B, pero ahora juegan/);
  assert.doesNotMatch(abrirLiga({ edicion: EDICION, resultados }).contenido.innerHTML, /Avisos para los entrenadores/);
});

async function cifrarEnPrueba(llave, contrasena, vueltas = 1000) {
  const sal = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const base = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(contrasena), 'PBKDF2', false, ['deriveKey']);
  const k = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: vueltas }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const c = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(llave));
  return ['v1', vueltas, Buffer.from(sal).toString('base64url'), Buffer.from(iv).toString('base64url'), Buffer.from(c).toString('base64url')].join('.');
}
async function hasta(cond, ms = 5000) {
  for (const fin = Date.now() + ms; Date.now() < fin;) {
    if (cond()) return;
    await new Promise((listo) => { setTimeout(listo, 5); });
  }
  assert.fail('no ha pasado a tiempo');
}

test('entrenador: con la contraseña de los entrenadores (la del calendario), la página descifra la llave y la comprueba con resultado.yml', async () => {
  const contrasena = 'k7m2-p9qx-4tz8-abcd';
  const cifrada = await cifrarEnPrueba(LLAVE, contrasena);
  let p = abrirLiga({ edicion: { ...EDICION, cifrada }, liga: LIGA_PASADA, guardado: { sec: 'partidos', eq: '' }, red: () => respuesta(200) });
  assert.match(p.porId('entrenador-texto').textContent, /escribe la contraseña de entrenador/);
  p.porId('llave').value = 'K7M2 P9QX 4TZ8 ABCD';
  p.porId('guardar-llave').oyentes.click({});
  await hasta(() => /Llave aceptada/.test(p.porId('llave-msg').textContent));
  assert.deepEqual(p.peticiones.map((x) => [x.url, x.opciones.method]), [[API, undefined]]);
  assert.equal(p.almacen.get(CLAVE_LLAVE), LLAVE);
  assert.equal(p.almacen.get(`${CLAVE_LLAVE}-de`), cifrada);
  assert.equal(p.doc.activeElement, p.porId('llave-msg'));   // el campo ya no está: el foco, en el mensaje
  assert.equal(conBoton(p).length, 30);
  assert.ok(!p.contenido.innerHTML.includes(LLAVE));
  // Una contraseña equivocada: nada a GitHub ni al navegador.
  p = abrirLiga({ edicion: { ...EDICION, cifrada }, red: () => respuesta(200) });
  p.porId('llave').value = 'aaaa-bbbb-cccc-dddd';
  p.porId('guardar-llave').oyentes.click({});
  await hasta(() => /Contraseña incorrecta/.test(p.porId('llave-msg').textContent));
  assert.equal(p.peticiones.length, 0);
  assert.equal(p.almacen.has(CLAVE_LLAVE), false);
});

test('liga: los textos van escapados (nombres de equipo y normas con <, & y comillas); categorías sin color, «otra»', () => {
  const liga = {
    ...LIGA,
    equipos: LIGA.equipos.map((q) => (q.id === 'cad20' ? { ...q, nombre: '<img src=x onerror=alert(1)> & "Cía"' } : q)),
    normas: ['<b>negrita</b>'],
  };
  const p = abrirLiga({ liga });
  assert.ok(!p.contenido.innerHTML.includes('<img'));
  assert.match(fila(p, 'P1').html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;Cía&quot;/);
  pulsar(p, 'tab-normas');
  assert.match(p.contenido.innerHTML, /<li>&lt;b&gt;negrita&lt;\/b&gt;<\/li>/);
  // Una categoría que no es de las del calendario: su punto, del color «otra».
  const otra = { ...LIGA, categorias: { ...LIGA.categorias, minivoley: { nombre: 'Minivoley', nivel: 0 } }, equipos: LIGA.equipos.map((q) => (q.id === 'alerem' ? { ...q, categoria: 'minivoley' } : q)) };
  assert.match(fila(abrirLiga({ liga: otra }), 'P1').html, /<div class="lado" data-cat="otra">[\s\S]*Alevín Remedios/);
});

// --- Segunda revisión ----------------------------------------------------------------------------------------------

test('entrenador: un resultado guardado que no cuenta (partido anulado, o de otros equipos) se puede borrar desde la página', async () => {
  // P1 anulado con un resultado guardado: «Borrar el resultado guardado» (sin poder poner otro).
  const liga = { ...LIGA_PASADA, partidos: LIGA_PASADA.partidos.map((x) => (x.id === 'P1' ? { ...x, anulado: true } : x)) };
  let p = abrirEntrenador({ liga, resultados: { P1: { sets: GANA_L } }, red: () => respuesta(204) });
  assert.match(fila(p, 'P1').html, />Borrar el resultado guardado</);
  enContenido(p, 'poner-res', i('P1'));
  let f = fila(p, 'P1');
  assert.match(texto(f.html), /Resultado guardado que no cuenta El partido está anulado\. Puedes borrarlo\./);
  assert.doesNotMatch(f.html, /er-0-0|er-guardar/);
  assert.equal(p.doc.activeElement, p.porId('er-caja'));
  enContenido(p, 'er-borrar', i('P1'));
  enContenido(p, 'er-borrar-si', i('P1'));
  await esperar();
  assert.deepEqual(cuerpo(p).inputs, { partido: 'P1', sets: 'borrar', antes: '[[[25,18],[20,22],[15,12]],null,null]' });   // sin equipos; con la huella
  // El foco: el botón de la fila ya no está (no queda nada que borrar), así que va al aviso.
  assert.equal(p.doc.activeElement, p.porId(`av-${i('P1')}`));
  f = fila(p, 'P1');
  assert.match(texto(f.html), /✓ Enviado: resultado borrado\./);
  assert.doesNotMatch(f.html, /poner-res/);   // ya mandado
  // La final guardada para otros equipos (ya no cuenta): se puede poner otra o borrarla.
  const res = {};
  for (const x of LIGA.partidos.filter((q) => typeof q.local === 'string')) res[x.id] = { sets: ['P2', 'P3'].includes(x.id) ? GANA_V : GANA_L };
  let resultados = aplicarResultado(res, 'P31', GANA_L, new Date(), { local: 'alerem', visitante: 'inflag' });
  resultados = aplicarResultado(resultados, 'P32', GANA_L, new Date(), { local: 'infc', visitante: 'infb' });
  resultados = aplicarResultado(resultados, 'P36', GANA_L, new Date(), { local: 'alerem', visitante: 'infb' });
  p = abrirEntrenador({ resultados });
  assert.match(fila(p, 'P36').html, />Poner resultado</);
  enContenido(p, 'poner-res', i('P36'));
  assert.match(fila(p, 'P36').html, /id="er-0-0" value=""/);   // el guardado no es de estos equipos: no se rellena
  assert.match(fila(p, 'P36').html, /id="er-borrar"/);
});

test('liga: un partido aplazado sale en su jornada con su propia fecha; la jornada, con la de la mayoría', () => {
  // P2 (jornada 1) pasa al 13/11; el archivo, además, no viene en orden.
  const partidos = LIGA.partidos.map((x) => (x.id === 'P2' ? { ...x, fecha: '2026-11-13' } : x));
  const liga = { ...LIGA, partidos: [partidos[1], partidos[0], ...partidos.slice(2)] };
  const p = abrirLiga({ liga });
  const h = p.contenido.innerHTML;
  assert.equal(h.split('Jornada 1 · ').length - 1, 1);   // una sola sección
  assert.match(h, /Jornada 1 · viernes 6 de noviembre/);
  assert.match(fila(p, 'P2').html, /<span class="otro-dia">vie 13\/11<\/span><span class="h">18:10</);
  assert.doesNotMatch(fila(p, 'P1').html, /otro-dia/);
});

test('entrenador: 401 con una llave nueva en el navegador (puesta en el calendario): no se borra; si vale, se usa', async () => {
  const NUEVA = `github_pat_NUEVA_${'y'.repeat(40)}`;
  let p = abrirEntrenador({ red: () => { p.almacen.set(CLAVE_LLAVE, NUEVA); return respuesta(401); } });
  enContenido(p, 'poner-res', i('P1'));
  escribirSets(p, GANA_L);
  enContenido(p, 'er-guardar', i('P1'));
  await esperar();
  assert.equal(p.almacen.get(CLAVE_LLAVE), NUEVA);
  assert.match(fila(p, 'P1').html, /id="er-0-0" value="25"/);   // el editor sigue, con lo escrito
  assert.match(texto(fila(p, 'P1').html), /hay una nueva: pulsa Guardar otra vez/);
  p.peticiones.length = 0;
  enContenido(p, 'er-guardar', i('P1'));
  await esperar();
  assert.equal(p.peticiones[0].opciones.headers.Authorization, `Bearer ${NUEVA}`);
  // La nueva es de otra contraseña: no se toca y se pide recargar.
  const otraCifrada = `v1.600000.${'Z'.repeat(22)}.${'b'.repeat(16)}.${'c'.repeat(150)}`;
  p = abrirEntrenador({ red: () => { p.almacen.set(CLAVE_LLAVE, NUEVA); p.almacen.set(`${CLAVE_LLAVE}-de`, otraCifrada); return respuesta(401); } });
  enContenido(p, 'poner-res', i('P1'));
  escribirSets(p, GANA_L);
  enContenido(p, 'er-guardar', i('P1'));
  await esperar();
  assert.equal(p.almacen.get(CLAVE_LLAVE), NUEVA);
  assert.match(p.estado.textContent, /recarga la página/);
});

test('entrenador: tras un 401, al volver a entrar, el aviso se va y lo escrito sigue ahí', async () => {
  const p = abrirEntrenador({ red: (url) => (url.endsWith('/dispatches') ? respuesta(401) : respuesta(200)) });
  enContenido(p, 'poner-res', i('P1'));
  escribirSets(p, GANA_L);
  enContenido(p, 'er-guardar', i('P1'));
  await esperar();
  assert.match(texto(fila(p, 'P1').html), /La llave ya no vale.*lo que has escrito se queda/);
  p.porId('llave').value = LLAVE;
  p.porId('guardar-llave').oyentes.click({});
  await esperar();
  assert.match(p.porId('llave-msg').textContent, /Llave aceptada/);
  assert.doesNotMatch(texto(fila(p, 'P1').html), /La llave ya no vale/);
  enContenido(p, 'poner-res', i('P1'));
  assert.match(fila(p, 'P1').html, /id="er-0-0" value="25"/);
  assert.match(fila(p, 'P1').html, /id="er-2-1" value="12"/);
});

test('entrenador: un error mientras se mira otra pestaña: al volver, el editor sigue con lo escrito; al reintentar, el error de antes se va', async () => {
  let responder;
  const p = abrirEntrenador({ red: () => new Promise((listo) => { responder = listo; }) });
  enContenido(p, 'poner-res', i('P1'));
  escribirSets(p, GANA_L);
  enContenido(p, 'er-guardar', i('P1'));
  pulsar(p, 'tab-clas');
  responder({ ok: false, status: 500 });
  await esperar();
  pulsar(p, 'tab-partidos');
  assert.match(fila(p, 'P1').html, /id="er-0-0" value="25"/);
  assert.match(texto(fila(p, 'P1').html), /error 500 de GitHub/);
  // Otra vez: mientras se guarda, sin el error de antes.
  enContenido(p, 'er-guardar', i('P1'));
  assert.match(fila(p, 'P1').html, /Guardando…/);
  assert.doesNotMatch(texto(fila(p, 'P1').html), /error 500/);
  assert.equal(p.estado.textContent, 'Guardando…');
  // Cerrar el editor: al dejar Partidos (sin nada pendiente), sí.
  responder({ ok: false, status: 500 });
  await esperar();
  pulsar(p, 'tab-normas');
  pulsar(p, 'tab-partidos');
  assert.doesNotMatch(fila(p, 'P1').html, /er-0-0/);
});

// --- Revisión de la web aparte ---------------------------------------------------------------------------------------

test('liga: «Próxima», el próximo día con partido de los que se ven (un aplazado de una jornada vieja no la lleva atrás)', () => {
  // Hoy (DOM simulado): viernes 25/09/2026. Jornada 1 el 11/09 (P1 y P3 jugados; P2 aplazado al 30/10); jornada 2 el
  // 26/09 (mañana).
  const fechas = { 1: '2026-09-11', 2: '2026-09-26' };
  const partidos = LIGA.partidos.map((x) => (x.id === 'P2' ? { ...x, fecha: '2026-10-30' } : fechas[x.jornada] ? { ...x, fecha: fechas[x.jornada] } : x));
  const liga = { ...LIGA, partidos };
  const resultados = { P1: { sets: GANA_L }, P3: { sets: GANA_L } };
  let p = abrirLiga({ liga, resultados, guardado: { sec: 'partidos', eq: '' } });
  assert.match(p.contenido.innerHTML, /Jornada 2 · sábado 26 de septiembre<\/span><span class="nota prox">Próxima/);
  assert.doesNotMatch(p.contenido.innerHTML, /Jornada 1 · viernes 11 de septiembre<\/span><span class="nota prox">/);
  // «Mi equipo»: Infantil B ya jugó en la jornada 1; juega mañana.
  p = abrirLiga({ liga, resultados, guardado: { sec: 'partidos', eq: 'infb' } });
  assert.match(p.contenido.innerHTML, /Jornada 2 · sábado 26 de septiembre<\/span><span class="nota prox">Próxima/);
  // Si el próximo es el aplazado (P2, antes que la jornada 2), la marca va en su fila.
  const antes = { ...liga, partidos: partidos.map((x) => (x.id === 'P2' ? { ...x, fecha: '2026-09-25' } : x)) };
  p = abrirLiga({ liga: antes, resultados, guardado: { sec: 'partidos', eq: '' } });
  assert.match(fila(p, 'P2').html, /<span class="prox-fila">Próxima<\/span>/);
  assert.doesNotMatch(p.contenido.innerHTML, /class="nota prox"/);
});

test('entrenador: 401 al borrar, con una llave nueva que vale: la pregunta de borrar sigue en pantalla', async () => {
  const NUEVA = `github_pat_NUEVA_${'y'.repeat(40)}`;
  const p = abrirEntrenador({ resultados: { P1: { sets: GANA_L } }, red: () => { p.almacen.set(CLAVE_LLAVE, NUEVA); return respuesta(401); } });
  enContenido(p, 'poner-res', i('P1'));
  enContenido(p, 'er-borrar', i('P1'));
  enContenido(p, 'er-borrar-si', i('P1'));
  await esperar();
  const f = fila(p, 'P1');
  assert.match(texto(f.html), /hay una nueva: pulsa «Sí, borrarlo» otra vez/);
  assert.match(f.html, /id="er-borrar-si"/);
  assert.equal(p.doc.activeElement, p.porId('er-confirma'));
  p.peticiones.length = 0;
  enContenido(p, 'er-borrar-si', i('P1'));
  await esperar();
  assert.equal(p.peticiones[0].opciones.headers.Authorization, `Bearer ${NUEVA}`);
  assert.equal(cuerpo(p).inputs.sets, 'borrar');
});

test('entrenador: con una llave guardada de otra contraseña (la del calendario, si la cambiaron allí), no se pisa', async () => {
  const otraCifrada = `v1.600000.${'Z'.repeat(22)}.${'b'.repeat(16)}.${'c'.repeat(150)}`;
  const contrasena = 'k7m2-p9qx-4tz8-abcd';
  const cifrada = await cifrarEnPrueba(LLAVE, contrasena);
  const OTRA = `github_pat_OTRA_${'z'.repeat(40)}`;
  const p = abrirLiga({ edicion: { ...EDICION, cifrada }, llave: OTRA, llaveDe: otraCifrada, liga: LIGA_PASADA, guardado: { sec: 'partidos', eq: '' }, red: () => respuesta(200) });
  // No se usa aquí, y se dice.
  assert.deepEqual(conBoton(p), []);
  assert.match(p.porId('entrenador-texto').textContent, /Aquí hay guardada una llave de otra contraseña/);
  // Con la contraseña de esta página: vale en esta visita, pero lo guardado no se toca.
  p.porId('llave').value = contrasena;
  p.porId('guardar-llave').oyentes.click({});
  await hasta(() => /Llave aceptada/.test(p.porId('llave-msg').textContent));
  assert.match(p.porId('llave-msg').textContent, /solo mientras tengas abierta esta página/);
  assert.equal(conBoton(p).length, 30);
  assert.deepEqual([p.almacen.get(CLAVE_LLAVE), p.almacen.get(`${CLAVE_LLAVE}-de`)], [OTRA, otraCifrada]);
});

// --- Modo de prueba (?demo) ------------------------------------------------------------------------------------------

test('modo de prueba (?demo): la jornada 3 es hoy, la 1 con resultados de mentira; el editor sin llave y sin mandar nada', async () => {
  // Hoy (DOM simulado): viernes 25/09/2026. Sin modo entrenador en config.json ni llave: igual se puede probar.
  const p = abrirLiga({ busqueda: '?demo', guardado: { sec: 'partidos', eq: '' } });
  assert.match(texto(p.contenido.innerHTML), /^Modo de prueba: partidos y resultados de mentira \(la jornada 3 es hoy\) para probar «Poner resultado»\. No se guarda nada\. Volver a la liga/);
  assert.match(p.contenido.innerHTML, /Jornada 3 · viernes 25 de septiembre/);
  assert.match(p.contenido.innerHTML, /Jornada 1 · viernes 28 de agosto/);
  // Jornadas 1 a 3 (de hoy hacia atrás): con botón; la 1, con resultado.
  assert.deepEqual(conBoton(p), ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9']);
  assert.match(fila(p, 'P1').html, />Cambiar resultado</);
  assert.match(texto(fila(p, 'P1').html), /Sets: 25-18 · 20-25 · 15-12/);
  assert.match(fila(p, 'P4').html, />Poner resultado</);
  // Poner uno: se ve al momento, con su aviso; nada a GitHub.
  enContenido(p, 'poner-res', i('P4'));
  escribirSets(p, GANA_V);
  // (El set que gana el alevín a un infantil vale 2.)
  assert.equal(p.porId('er-pista').textContent, 'Gana Infantil B, 2-1. Puntos de liga: Alevín Remedios +2, Infantil B +2.');
  enContenido(p, 'er-guardar', i('P4'));
  await esperar();
  assert.equal(p.peticiones.length, 0);
  let f = fila(p, 'P4');
  assert.match(texto(f.html), /✓ Puesto: 18-25 · 22-20 · 12-15\. Es de prueba: no se ha guardado nada\./);
  assert.match(texto(f.html), /Sets: 18-25 · 22-20 · 12-15/);
  assert.match(f.html, />Cambiar resultado</);
  // La clasificación, al día.
  pulsar(p, 'tab-clas');
  assert.match(texto(p.contenido.innerHTML), /Clasificación 4 de 30 partidos jugados/);
  const infb = [...p.contenido.innerHTML.matchAll(/<tr class="[^"]*">([\s\S]*?)<\/tr>/g)].map((m) => texto(m[1])).find((t) => t.includes('Infantil B'));
  assert.match(infb, /Infantil B 2 2 4 -6 2$/);   // P3 (perdido 0-3) y P4 (ganado 2-1): 2 jugados, 2 sets ganados, 4 perdidos, -6, 2 puntos
  // Borrar uno: también solo aquí.
  pulsar(p, 'tab-partidos');
  enContenido(p, 'poner-res', i('P1'));
  enContenido(p, 'er-borrar', i('P1'));
  enContenido(p, 'er-borrar-si', i('P1'));
  await esperar();
  assert.equal(p.peticiones.length, 0);
  f = fila(p, 'P1');
  assert.match(texto(f.html), /✓ Resultado borrado\. Es de prueba/);
  assert.match(f.html, />Poner resultado</);
});

test('modo de prueba: sin ?demo, la liga de verdad; con modo entrenador, el enlace para probar (que en la prueba no sale)', () => {
  let p = abrirLiga({ edicion: EDICION, guardado: { sec: 'partidos', eq: '' } });
  assert.doesNotMatch(p.contenido.innerHTML, /Modo de prueba/);
  assert.deepEqual(conBoton(p), []);
  assert.equal(p.porId('ir-demo').classList.contains('oculto'), false);
  p = abrirLiga({ edicion: EDICION, busqueda: '?demo', guardado: { sec: 'partidos', eq: '' } });
  assert.equal(p.porId('ir-demo').classList.contains('oculto'), true);
  // Con llave, en la prueba tampoco se manda nada.
  p = abrirLiga({ edicion: EDICION, llave: LLAVE, busqueda: '?demo', guardado: { sec: 'partidos', eq: '' }, red: () => respuesta(204) });
  enContenido(p, 'poner-res', i('P7'));
  escribirSets(p, GANA_L);
  enContenido(p, 'er-guardar', i('P7'));
  assert.equal(p.peticiones.length, 0);
  assert.match(texto(fila(p, 'P7').html), /Es de prueba/);
});

test('modo de prueba: el panel del modo entrenador no sale; ni la contraseña ni «Quitar la llave» tocan la llave de verdad', () => {
  const p = abrirLiga({ edicion: EDICION, llave: LLAVE, busqueda: '?demo', guardado: { sec: 'partidos', eq: '' }, red: () => respuesta(200) });
  assert.equal(p.porId('entrenador').classList.contains('oculto'), true);
  p.porId('llave').value = LLAVE;
  p.porId('guardar-llave').oyentes.click({});
  p.porId('quitar-llave').oyentes.click({});
  assert.equal(p.peticiones.length, 0);
  assert.equal(p.almacen.get(CLAVE_LLAVE), LLAVE);
});

test('modo de prueba: el cuadro, sin decidir aunque la liga de verdad ya lo tenga; un aplazado no lleva la jornada 3 atrás', () => {
  // Liga de verdad acabada (con semifinales): en la prueba, los cruces vuelven a ser «1.º clasificado».
  const resultados = {};
  for (const x of LIGA.partidos.filter((q) => typeof q.local === 'string')) resultados[x.id] = { sets: ['P2', 'P3'].includes(x.id) ? GANA_V : GANA_L };
  let p = abrirLiga({ resultados, busqueda: '?demo', guardado: { sec: 'partidos', eq: '' } });
  assert.match(fila(p, 'P31').html, /1\.º clasificado<span class="ahora">ahora, /);
  assert.ok(!conBoton(p).includes('P31'));
  // P7 (jornada 3) aplazado al 8/1: la jornada 3 sigue siendo hoy (25/9) y la 4 no se puede tocar aún.
  // P2 (jornada 1) aplazado al 11/12: sin resultado de mentira.
  const liga = { ...LIGA, partidos: LIGA.partidos.map((x) => (x.id === 'P7' ? { ...x, fecha: '2027-01-08' } : x.id === 'P2' ? { ...x, fecha: '2026-12-11' } : x)) };
  p = abrirLiga({ liga, busqueda: '?demo', guardado: { sec: 'partidos', eq: '' } });
  assert.match(p.contenido.innerHTML, /Jornada 3 · viernes 25 de septiembre/);
  assert.ok(!conBoton(p).some((id) => ['P10', 'P11', 'P12', 'P7'].includes(id)), conBoton(p).join());
  assert.doesNotMatch(texto(fila(p, 'P2').html), /Sets:/);
});
