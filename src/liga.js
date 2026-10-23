// Liga Dompiñas: liga interna entre equipos del club, mezclando categorías (docs/diseno.md). La liga (equipos,
// calendario, normas) está en liga/<nombre>.json, sacada del Excel del club; los resultados, en
// liga/resultados-<nombre>.json, que escribe el workflow resultado.yml con lo que meten los entrenadores desde la
// página (modo entrenador). generar.js hace con esto la página (pagina.js).
//
// Reglas: partidos por tiempo, siempre 3 sets (como mucho a 25 tantos, 15 el 3.º; con punto de oro, cada set lo
// gana alguien). En la fase regular, cada set ganado vale 1 punto y 1 más por cada categoría de diferencia si lo
// gana el equipo de categoría menor. Clasificación por puntos; a igualdad, diferencia de tantos; si siguen
// igualados, partido de desempate (su resultado, en «desempates»). Playoffs: partido único sin coeficiente: pasa
// quien gana más sets. Un partido «amistoso» no cuenta; uno «anulado» (no se juega) tampoco, ni hace falta para
// acabar la fase regular.
//
//   PARTIDO=P1 SETS='25-18 20-22 15-12' [LOCAL=cad20 VISITANTE=alerem] node src/liga.js
//   PARTIDO=P1 SETS=borrar [ANTES=<huella>] node src/liga.js
//   (LOCAL y VISITANTE: los equipos que enseñaba la página; ANTES: la huella del resultado que enseñaba, al borrar;
//   la liga, la de config.json, o LIGA=ruta)

import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aviso, claveSinCaja, esObjeto, leerJson, txt } from './util.js';

const RE_ID = /^[A-Za-z0-9_-]{1,20}$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
// Los ids son claves de objetos (aquí y en la página): nunca los nombres especiales de JavaScript.
const RESERVADOS = new Set(['__proto__', 'constructor', 'prototype']);
function idValido(x) { return typeof x === 'string' && RE_ID.test(x) && !RESERVADOS.has(x); }

/* ---------- la liga ---------- */

// ¿Es de la fase regular? Sus dos equipos son ids; en los playoffs, referencias ({ puesto }, { ganador }...).
export function esRegular(p) { return typeof p.local === 'string' && typeof p.visitante === 'string'; }
// ¿Cuenta para la clasificación? Los de la fase regular, salvo los amistosos y los anulados.
export function cuenta(p) { return esRegular(p) && !p.amistoso && !p.anulado; }

// Lista de problemas del archivo de la liga (vacía si vale).
export function validarLiga(L) {
  const e = [];
  if (!esObjeto(L)) return ['no es un objeto'];
  if (typeof L.nombre !== 'string' || !L.nombre.trim()) e.push('falta el nombre');
  const cats = esObjeto(L.categorias) ? L.categorias : {};
  if (!Object.keys(cats).length) e.push('faltan las categorías');
  for (const [k, c] of Object.entries(cats)) {
    if (!idValido(k)) e.push('una categoría con un nombre que no vale (letras, cifras, - y _)');
    else if (!esObjeto(c) || !Number.isInteger(c.nivel) || typeof c.nombre !== 'string') e.push(`la categoría ${k} no tiene nombre o nivel`);
  }
  const equipos = Array.isArray(L.equipos) ? L.equipos : [];
  if (equipos.length < 2) e.push('faltan los equipos');
  const ids = new Set();
  for (const q of equipos) {
    if (!esObjeto(q) || !idValido(q.id) || typeof q.nombre !== 'string' || !q.nombre.trim()) { e.push('un equipo sin id o sin nombre'); continue; }
    if (ids.has(q.id)) e.push(`equipo repetido: ${q.id}`);
    ids.add(q.id);
    if (!Object.hasOwn(cats, q.categoria)) e.push(`el equipo ${q.id} tiene una categoría que no existe`);
  }
  if (!Array.isArray(L.puntosMaxSet) || L.puntosMaxSet.length !== 3 || !L.puntosMaxSet.every((n) => Number.isInteger(n) && n > 0 && n < 100)) {
    e.push('puntosMaxSet tiene que ser una lista de 3 números');
  }
  const partidos = Array.isArray(L.partidos) ? L.partidos : [];
  if (!partidos.length) e.push('faltan los partidos');
  const pids = new Set();
  const refValida = (r, previos) => {
    if (typeof r === 'string') return ids.has(r);
    if (!esObjeto(r)) return false;
    if (Number.isInteger(r.puesto)) return r.puesto >= 1 && r.puesto <= equipos.length;
    const x = r.ganador ?? r.perdedor;
    return typeof x === 'string' && previos.has(x);
  };
  for (const p of partidos) {
    if (!esObjeto(p) || !idValido(p.id)) { e.push('un partido sin id (letras, cifras, - y _)'); continue; }
    if (pids.has(p.id)) e.push(`partido repetido: ${p.id}`);
    if (!Number.isInteger(p.jornada) || !RE_FECHA.test(txt(p.fecha)) || !RE_HORA.test(txt(p.hora))) e.push(`al partido ${p.id} le falta la jornada, la fecha o la hora`);
    for (const lado of ['local', 'visitante']) if (!refValida(p[lado], pids)) e.push(`el ${lado} del partido ${p.id} no existe: ${JSON.stringify(p[lado])}`);
    if (esRegular(p) && p.local === p.visitante) e.push(`el partido ${p.id} enfrenta a un equipo consigo mismo`);
    if (p.anulado && !esRegular(p)) e.push(`el partido ${p.id} es de playoffs: no se puede anular`);
    pids.add(p.id);
  }
  // desempates: listas de equipos (al menos 2, sin repetir), en el orden que decidió el partido de desempate.
  if (L.desempates != null && !Array.isArray(L.desempates)) e.push('desempates tiene que ser una lista de listas de equipos');
  for (const d of Array.isArray(L.desempates) ? L.desempates : []) {
    if (!Array.isArray(d) || d.length < 2 || new Set(d).size !== d.length || !d.every((x) => ids.has(x))) e.push('un desempate con equipos que no existen o repetidos');
  }
  if (L.clasificacionFinal != null && !Array.isArray(L.clasificacionFinal)) e.push('clasificacionFinal tiene que ser una lista');
  for (const r of Array.isArray(L.clasificacionFinal) ? L.clasificacionFinal : []) {
    if (!esObjeto(r) || !pids.has(r.ganador ?? r.perdedor)) e.push('la clasificación final nombra un partido que no existe');
  }
  return e;
}

// config.json › liga: { "archivo": "liga/dompinas-1.json" } (junto a config.json) → { archivo }, o null sin liga.
// Solo un .json de la carpeta liga: ahí guarda los resultados el workflow (resultado.yml). Sin distinguir mayúsculas
// en los nombres.
export function configLiga(cfg) {
  if (!esObjeto(cfg)) return null;
  const liga = cfg[claveSinCaja(cfg, 'liga')];
  if (liga == null) return null;
  const archivo = esObjeto(liga) ? liga[claveSinCaja(liga, 'archivo')] : '';
  if (typeof archivo === 'string' && /^liga\/[\w-]+(?:\.[\w-]+)*\.json$/.test(archivo)) return { archivo };
  aviso('config.json: "liga" › "archivo" tiene que ser un .json de la carpeta liga (por ejemplo, liga/dompinas-1.json); sin él no hay página de la liga.');
  return null;
}

export function leerLiga(ruta) {
  const L = leerJson(readFileSync(ruta, 'utf8'));
  const e = validarLiga(L);
  if (e.length) throw new Error(`${basename(ruta)}: ${e.join('; ')}`);
  return L;
}

// liga/dompinas-1.json → liga/resultados-dompinas-1.json
export function rutaResultados(rutaLiga) { return join(dirname(rutaLiga), `resultados-${basename(rutaLiga)}`); }

// Por qué no se puede leer el archivo de resultados ('' si se puede, o si no existe: aún no hay resultados). Sin el
// mensaje de JSON.parse, que repite lo que hay en el archivo.
export function problemaResultados(ruta) {
  if (!existsSync(ruta)) return '';
  let d;
  try {
    d = leerJson(readFileSync(ruta, 'utf8'));
  } catch {
    return 'no es JSON válido';
  }
  return esObjeto(d) ? '' : 'no es un objeto';
}

// Sin archivo, {}. Uno que no se puede leer: sin estricto, aviso y {}; estricto (al publicar y al guardar), error:
// así no se publica una liga sin resultados (se queda la última buena) ni se pisa el archivo.
export function leerResultados(ruta, { estricto = false } = {}) {
  const motivo = problemaResultados(ruta);
  if (!motivo) return existsSync(ruta) ? leerJson(readFileSync(ruta, 'utf8')) : {};
  if (estricto) throw new Error(`${basename(ruta)} no se puede leer (${motivo}): arréglalo en el repositorio.`);
  aviso(`${basename(ruta)} no se puede leer (${motivo}); la liga sale sin resultados.`);
  return {};
}

export function guardarResultados(ruta, datos) {
  const ordenados = Object.fromEntries(Object.keys(datos)
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true })).map((k) => [k, datos[k]]));
  writeFileSync(ruta, `${JSON.stringify(ordenados, null, 2)}\n`, 'utf8');
}

/* ---------- sets y puntos ---------- */

// «25-18 20-22 15-12» (también con comas o punto y coma) → [[25, 18], [20, 22], [15, 12]]; vacío → null.
export function interpretarSets(texto) {
  const t = txt(texto).trim();
  if (!t) return null;
  const partes = t.split(/[\s,;]+/);
  if (!partes.every((x) => /^\d{1,2}-\d{1,2}$/.test(x))) throw new Error('los tantos no valen: tienen que ser como «25-18 20-22 15-12».');
  return partes.map((x) => x.split('-').map(Number));
}

// Problemas de los tantos de un partido (vacía si valen): 3 sets, enteros, sin empate, como mucho el máximo.
export function validarSets(L, sets) {
  if (!Array.isArray(sets) || sets.length !== 3) return ['tienen que ser 3 sets (se juegan siempre los 3)'];
  const e = [];
  sets.forEach((s, i) => {
    const max = L.puntosMaxSet[i];
    if (!Array.isArray(s) || s.length !== 2 || !s.every((n) => Number.isInteger(n) && n >= 0)) e.push(`set ${i + 1}: tantos que no valen`);
    else if (s[0] === s[1]) e.push(`set ${i + 1}: empate (con punto de oro, siempre gana alguien)`);
    else if (Math.max(s[0], s[1]) > max) e.push(`set ${i + 1}: como mucho ${max} tantos`);
  });
  return e;
}

function equipoDe(L, id) { return L.equipos.find((q) => q.id === id); }
export function nivel(L, id) { return L.categorias[equipoDe(L, id).categoria].nivel; }
// Lo que vale un set: 1, y 1 más por cada categoría de diferencia si lo gana el de categoría menor.
export function puntosSet(L, ganador, perdedor) { return 1 + Math.max(0, nivel(L, perdedor) - nivel(L, ganador)); }

// El resultado de un partido con sus equipos ya sabidos. Si cuenta para la clasificación, con los puntos de liga.
function resultado(L, sets, local, visitante, conPuntos) {
  const r = { sets, setsL: 0, setsV: 0, tantosL: 0, tantosV: 0 };
  if (conPuntos) { r.ptsL = 0; r.ptsV = 0; }
  for (const [a, b] of sets) {
    r.tantosL += a; r.tantosV += b;
    if (a > b) { r.setsL++; if (conPuntos) r.ptsL += puntosSet(L, local, visitante); } else { r.setsV++; if (conPuntos) r.ptsV += puntosSet(L, visitante, local); }
  }
  r.ganador = r.setsL > r.setsV ? 'local' : 'visitante';   // 3 sets: nunca empatan
  return r;
}

/* ---------- la clasificación y los playoffs ---------- */

// Todo lo que enseña la página: { clasificacion, partidos, final, regularTerminada, avisos }. Los avisos (resultados
// que no cuentan, desempates que no casan) salen en el registro de la publicación y, a los entrenadores, en la página.
export function calcular(L, resultados = {}) {
  const avisos = [];
  const nombre = (id) => equipoDe(L, id).nombre;
  const guardado = (p) => (Object.hasOwn(resultados, p.id) && esObjeto(resultados[p.id]) ? resultados[p.id] : null);
  // Los tantos de un resultado guardado, si valen y son de estos equipos (se guardan con los que jugaron: si el cuadro
  // cambia después, por un resultado corregido o un desempate, ese resultado ya no es de los que juegan ahora).
  const setsDe = (p, local, visitante) => {
    const r = guardado(p);
    if (!r) return null;
    const e = validarSets(L, r.sets);
    if (e.length) { avisos.push(`El resultado de ${p.id} no vale (${e.join('; ')}); no cuenta.`); return null; }
    if ((r.local !== undefined || r.visitante !== undefined) && (r.local !== local || r.visitante !== visitante)) {
      const antes = equipoDe(L, r.local) && equipoDe(L, r.visitante) ? `${nombre(r.local)} – ${nombre(r.visitante)}` : 'otros equipos';
      avisos.push(`El resultado de ${p.id} se puso para ${antes}, pero ahora juegan ${nombre(local)} – ${nombre(visitante)}: no cuenta (vuelve a ponerlo o bórralo).`);
      return null;
    }
    return r.sets;
  };
  for (const k of Object.keys(resultados)) {
    if (!L.partidos.some((p) => p.id === k)) avisos.push(`Hay un resultado de ${idValido(k) ? k : 'un partido'} que no es de la liga; no cuenta.`);
    else if (!esObjeto(resultados[k])) avisos.push(`El resultado de ${k} no tiene la forma { "sets": [[25, 18], [20, 22], [15, 12]] }; no cuenta.`);
  }
  const filas = new Map(L.equipos.map((q) => [q.id, { id: q.id, nombre: q.nombre, categoria: q.categoria, pj: 0, sg: 0, sp: 0, tf: 0, tc: 0, pts: 0 }]));
  const hechos = new Map();   // id → resultado (de los que cuentan)
  let regularTerminada = true;
  for (const p of L.partidos.filter(cuenta)) {
    const sets = setsDe(p, p.local, p.visitante);
    if (!sets) { regularTerminada = false; continue; }
    const r = resultado(L, sets, p.local, p.visitante, true);
    hechos.set(p.id, r);
    const fl = filas.get(p.local), fv = filas.get(p.visitante);
    fl.pj++; fv.pj++;
    fl.sg += r.setsL; fl.sp += r.setsV; fv.sg += r.setsV; fv.sp += r.setsL;
    fl.tf += r.tantosL; fl.tc += r.tantosV; fv.tf += r.tantosV; fv.tc += r.tantosL;
    fl.pts += r.ptsL; fv.pts += r.ptsV;
  }
  // Orden: puntos, diferencia de tantos y, si siguen igualados, el partido de desempate (o, sin él, el nombre). De
  // «desempates» vale la última lista que tenga a todos los empatados (puede tener más equipos).
  const desempates = Array.isArray(L.desempates) ? L.desempates.filter(Array.isArray) : [];
  const lista = [...filas.values()].map((f) => ({ ...f, dif: f.tf - f.tc, empate: false }));
  lista.sort((a, b) => b.pts - a.pts || b.dif - a.dif || a.nombre.localeCompare(b.nombre, 'es'));
  const grupos = [];   // los empates (para avisar de las listas de «desempates» que no casan con ninguno)
  for (let i = 0; i < lista.length;) {
    let j = i + 1;
    while (j < lista.length && lista[j].pts === lista[i].pts && lista[j].dif === lista[i].dif) j++;
    if (j - i > 1) {
      const grupo = lista.slice(i, j);
      grupos.push(grupo);
      const dec = desempates.filter((d) => grupo.every((f) => d.includes(f.id))).pop();
      if (dec) grupo.sort((a, b) => dec.indexOf(a.id) - dec.indexOf(b.id));
      else {
        grupo.forEach((f) => { f.empate = true; });
        if (regularTerminada && desempates.some((d) => grupo.filter((f) => d.includes(f.id)).length > 1)) {
          avisos.push(`desempates: ninguna lista tiene a todos los empatados (${grupo.map((f) => f.nombre).join(', ')}); hay que ponerlos a todos, en su orden.`);
        }
      }
      lista.splice(i, j - i, ...grupo);
    }
    i = j;
  }
  lista.forEach((f, i) => { f.pos = i + 1; });
  // Acabada la fase regular, una lista que no tiene a todos los de ningún empate (una errata, o un empate que ya no
  // lo es tras corregir un resultado) no sirve para nada: se avisa.
  if (regularTerminada) {
    for (const d of desempates) {
      if (!grupos.some((g) => g.every((x) => d.includes(x.id)))) {
        avisos.push(`desempates: la lista (${d.filter((x) => equipoDe(L, x)).map(nombre).join(', ')}) no corresponde a ningún empate de la clasificación; no cuenta.`);
      }
    }
  }

  // Los equipos de cada partido: { id (o null si aún no se sabe), texto, ahora (quién sería, en los cruces por puesto,
  // mientras dura la fase regular) }.
  const resueltos = new Map();
  const ref = (r) => {
    if (typeof r === 'string') return { id: r, texto: nombre(r) };
    if (Number.isInteger(r.puesto)) {
      const f = lista[r.puesto - 1];
      const x = { id: regularTerminada && !f.empate ? f.id : null, texto: `${r.puesto}.º clasificado` };
      if (!regularTerminada) x.ahora = f.id;
      return x;
    }
    const quien = r.ganador ? 'ganador' : 'perdedor', otro = resueltos.get(r.ganador ?? r.perdedor);
    const nombreOtro = L.partidos.find((x) => x.id === (r.ganador ?? r.perdedor)).nombre || (r.ganador ?? r.perdedor);
    const texto = `${quien === 'ganador' ? 'Ganador' : 'Perdedor'} de ${nombreOtro}`;
    if (!otro || !otro.resultado) return { id: null, texto };
    const gana = otro.resultado.ganador === 'local' ? otro.local : otro.visitante;
    const pierde = otro.resultado.ganador === 'local' ? otro.visitante : otro.local;
    return { id: (quien === 'ganador' ? gana : pierde).id, texto };
  };
  const partidos = [];
  for (const p of L.partidos) {
    const local = ref(p.local), visitante = ref(p.visitante);
    let res = null;
    if (cuenta(p)) res = hechos.get(p.id) || null;
    else if (guardado(p)) {
      if (p.anulado) avisos.push(`El partido ${p.id} está anulado: su resultado no cuenta (bórralo).`);
      else if (!local.id || !visitante.id) avisos.push(`El resultado de ${p.id} no cuenta: aún no se sabe quién juega.`);
      else { const sets = setsDe(p, local.id, visitante.id); if (sets) res = resultado(L, sets, local.id, visitante.id, false); }
    }
    const x = {
      id: p.id, jornada: p.jornada, fecha: p.fecha, hora: p.hora, fin: txt(p.fin), fase: txt(p.fase), nombre: txt(p.nombre),
      amistoso: !!p.amistoso, anulado: !!p.anulado, regular: esRegular(p), cuenta: cuenta(p), local, visitante, resultado: res,
    };
    resueltos.set(p.id, x);
    partidos.push(x);
  }
  // Clasificación final (cuando todos sus partidos tienen resultado).
  let final = null;
  if (Array.isArray(L.clasificacionFinal) && L.clasificacionFinal.length) {
    const puestos = L.clasificacionFinal.map((r) => ref(r).id);
    if (puestos.every(Boolean)) final = puestos;
  }
  return { clasificacion: lista, partidos, final, regularTerminada, avisos };
}

// Pone (o, con sets null, quita) el resultado de un partido, con los equipos que lo jugaron ({ local, visitante }:
// así, si el cuadro cambia después, se sabe que ya no es de los que juegan); el mismo otra vez no cambia nada.
export function aplicarResultado(datos, id, sets, ahora = new Date(), equipos = null) {
  const nuevos = { ...datos };
  if (!sets) { delete nuevos[id]; return nuevos; }
  const nuevo = { sets, ...(equipos ? { local: equipos.local, visitante: equipos.visitante } : {}) };
  const antes = Object.hasOwn(nuevos, id) && esObjeto(nuevos[id]) ? nuevos[id] : null;
  const igual = antes && JSON.stringify(antes.sets) === JSON.stringify(sets) && antes.local === nuevo.local && antes.visitante === nuevo.visitante;
  if (!igual) nuevos[id] = { ...nuevo, cambiado: ahora.toISOString() };
  return nuevos;
}

// La huella de un resultado guardado (lo que importa de él, sin «cambiado»): la página la manda al borrar, para borrar
// solo el que enseñaba. 'x' si no tiene la forma de un resultado.
export function huella(entrada) {
  if (!esObjeto(entrada)) return 'x';
  return JSON.stringify([entrada.sets ?? null, entrada.local ?? null, entrada.visitante ?? null]);
}

// ¿Cuenta ahora un resultado guardado para un partido entre estos equipos? (Tantos que valen y, si lleva equipos, los
// mismos.)
export function cuentaAhora(L, entrada, local, visitante) {
  if (!esObjeto(entrada) || validarSets(L, entrada.sets).length) return false;
  if (entrada.local === undefined && entrada.visitante === undefined) return true;
  return entrada.local === local && entrada.visitante === visitante;
}

/* ---------- por consola (el workflow resultado.yml) ---------- */

function esPrograma() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

// Una línea para el registro de GitHub Actions: sin saltos de línea (cada línea podría ser una orden suya).
const RE_SALTOS = new RegExp(`[\r\n${String.fromCharCode(0x2028, 0x2029)}]+`, 'g');
function unaLinea(t) { return String(t).replace(RE_SALTOS, ' '); }

// Lo que hace el workflow: guarda (o borra) el resultado de PARTIDO. Lo que llega no se repite en los mensajes: así
// no se cuela nada en el registro de GitHub Actions.
function porConsola() {
  let rutaLiga = txt(process.env.LIGA);
  if (!rutaLiga) {
    const liga = configLiga(existsSync('config.json') ? leerJson(readFileSync('config.json', 'utf8')) : null);
    if (!liga) throw new Error('no hay liga: falta config.json › liga › archivo.');
    rutaLiga = liga.archivo;
  }
  rutaLiga = resolve(rutaLiga);
  const L = leerLiga(rutaLiga);
  const id = txt(process.env.PARTIDO).trim();
  if (!idValido(id)) throw new Error('el partido no vale: tiene que ser como «P1».');
  const p = L.partidos.find((x) => x.id === id);
  if (!p) throw new Error(`no hay ningún partido ${id} en la liga.`);
  // Para quitar un resultado hay que pedirlo («borrar»): vacío es un error (p. ej., lanzado a mano sin los tantos).
  const textoSets = txt(process.env.SETS).trim();
  if (!textoSets) throw new Error('faltan los tantos (para quitar el resultado: «borrar»).');
  const sets = textoSets.toLowerCase() === 'borrar' ? null : interpretarSets(textoSets);
  if (sets) {
    const e = validarSets(L, sets);
    if (e.length) throw new Error(`los tantos no valen: ${e.join('; ')}.`);
  }
  if (sets && p.anulado) throw new Error(`el ${id} está anulado: no lleva resultado.`);
  // Los equipos que enseñaba la página (LOCAL y VISITANTE; lanzado a mano, pueden faltar). El resultado se guarda con
  // ellos, los que jugaron: si la página era de antes de cambiar el cuadro (otro resultado corregido entre medias), no
  // cuenta para los que juegan ahora y se avisa, en vez de dárselo a otro equipo.
  const enviados = [txt(process.env.LOCAL).trim(), txt(process.env.VISITANTE).trim()];
  if (enviados.some(Boolean) && !enviados.every((q) => idValido(q) && equipoDe(L, q))) throw new Error('los equipos no valen.');
  // Al borrar desde la página, la huella del resultado que enseñaba (ANTES): solo se borra si sigue siendo ese.
  const antes = txt(process.env.ANTES);
  if (antes.length > 400) throw new Error('lo que enseñaba la página no vale.');
  const ruta = rutaResultados(rutaLiga);
  const datos = leerResultados(ruta, { estricto: true });
  const x = calcular(L, datos).partidos.find((q) => q.id === id);
  const ahora = Object.hasOwn(datos, id) ? datos[id] : undefined;
  const equipos = enviados[0] ? { local: enviados[0], visitante: enviados[1] } : { local: x.local.id, visitante: x.visitante.id };
  if (sets && (!equipos.local || !equipos.visitante)) throw new Error(`aún no se sabe quién juega el ${id}.`);
  if (sets && equipos.local === equipos.visitante) throw new Error('los equipos no valen.');
  // Una página de antes de cambiar el cuadro (con otros equipos) no pisa un resultado que cuenta para los de ahora.
  if (sets && enviados[0] && x.local.id && x.visitante.id && (equipos.local !== x.local.id || equipos.visitante !== x.visitante.id)
    && ahora !== undefined && cuentaAhora(L, ahora, x.local.id, x.visitante.id)) {
    throw new Error(`el cuadro ha cambiado y el ${id} ya tiene un resultado que cuenta: recarga la página.`);
  }
  if (!sets && antes) {
    if (ahora === undefined) { console.log(`  Resultado: ${id} ya estaba borrado.`); return; }
    if (huella(ahora) !== antes) throw new Error(`el resultado guardado del ${id} ha cambiado desde que se abrió la página: recarga la página.`);
  }
  const nuevos = aplicarResultado(datos, id, sets, new Date(), sets ? equipos : null);
  guardarResultados(ruta, nuevos);
  const quien = sets ? `${equipoDe(L, equipos.local).nombre} – ${equipoDe(L, equipos.visitante).nombre}`
    : `${x.local.id ? equipoDe(L, x.local.id).nombre : x.local.texto} – ${x.visitante.id ? equipoDe(L, x.visitante.id).nombre : x.visitante.texto}`;
  console.log(`  Resultado: ${id} ${quien} → ${sets ? sets.map((s) => s.join('-')).join(' ') : 'borrado'}`);
  // Lo que este cambio deja sin contar (p. ej., la final, si cambia el ganador de una semifinal).
  for (const a of calcular(L, nuevos).avisos) console.log(`::warning::${unaLinea(a)}`);
}

if (esPrograma()) {
  try {
    porConsola();
  } catch (e) {
    console.log(`  ERROR: ${unaLinea(e.message)}`);
    console.log(`::error::${unaLinea(e.message)}`);
    process.exitCode = 1;
  }
}
