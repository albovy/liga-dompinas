// Pruebas de src/liga.js: la Liga Dompiñas (liga interna entre equipos del club).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aplicarResultado, calcular, configLiga, cuentaAhora, huella, interpretarSets, leerResultados, problemaResultados, leerLiga, puntosSet, rutaResultados, validarLiga, validarSets,
} from '../src/liga.js';

const MODULO = fileURLToPath(new URL('../src/liga.js', import.meta.url));
const RUTA = fileURLToPath(new URL('../liga/dompinas-1.json', import.meta.url));
const LIGA = leerLiga(RUTA);
const AHORA = new Date('2026-11-06T20:30:00Z');
// Sets en los que gana el local (2-1) y en los que gana el visitante (1-2).
const GANA_L = [[25, 18], [20, 22], [15, 12]];
const GANA_V = [[18, 25], [22, 20], [12, 15]];
const fila = (c, id) => c.clasificacion.find((f) => f.id === id);
const partido = (c, id) => c.partidos.find((p) => p.id === id);

test('liga: el archivo de la liga (del Excel) es válido: 6 equipos, 36 partidos, 30 de fase regular a doble vuelta', () => {
  assert.deepEqual(validarLiga(LIGA), []);
  assert.equal(LIGA.equipos.length, 6);
  assert.equal(LIGA.partidos.length, 36);
  const regulares = LIGA.partidos.filter((p) => typeof p.local === 'string');
  assert.equal(regulares.length, 30);
  // Doble vuelta: cada pareja se enfrenta dos veces.
  const parejas = new Map();
  for (const p of regulares) {
    const k = [p.local, p.visitante].sort().join('-');
    parejas.set(k, (parejas.get(k) || 0) + 1);
  }
  assert.equal(parejas.size, 15);
  assert.ok([...parejas.values()].every((n) => n === 2));
  assert.deepEqual(validarLiga({ ...LIGA, partidos: [...LIGA.partidos, { ...LIGA.partidos[0] }] }).length > 0, true);   // id repetido
  assert.match(validarLiga({ ...LIGA, partidos: [{ ...LIGA.partidos[0], local: 'nadie' }] }).join(), /nadie/);
});

test('liga: puntos de un set: 1, y 1 más por cada categoría de diferencia si lo gana el de categoría menor', () => {
  // cad20 y cadlag: cadete (3); inflag, infb, infc: infantil (2); alerem: alevín (1)
  assert.equal(puntosSet(LIGA, 'cad20', 'cadlag'), 1);
  assert.equal(puntosSet(LIGA, 'cad20', 'infb'), 1);
  assert.equal(puntosSet(LIGA, 'infb', 'cad20'), 2);
  assert.equal(puntosSet(LIGA, 'alerem', 'cad20'), 3);
  assert.equal(puntosSet(LIGA, 'alerem', 'infc'), 2);
  assert.equal(puntosSet(LIGA, 'infc', 'alerem'), 1);
});

test('liga: los tantos de cada set: siempre 3 sets, enteros, sin empate, como mucho 25 (15 el 3.º)', () => {
  assert.deepEqual(interpretarSets('25-18 20-22 15-12'), GANA_L);
  assert.deepEqual(interpretarSets(' 25-18, 20-22; 15-12 '), GANA_L);
  assert.equal(interpretarSets(''), null);   // borrar el resultado
  assert.throws(() => interpretarSets('25-18 x 15-12'), /tantos/);
  assert.deepEqual(validarSets(LIGA, GANA_L), []);
  assert.deepEqual(validarSets(LIGA, [[25, 24], [3, 0], [15, 14]]), []);   // por tiempo: cualquier tanteo vale
  const malos = [
    [[[25, 18], [20, 22]], /3 sets/],
    [[[26, 24], [20, 22], [15, 12]], /set 1.*25/],
    [[[25, 18], [20, 22], [16, 14]], /set 3.*15/],
    [[[20, 20], [20, 22], [15, 12]], /set 1.*empate/],
    [[[-1, 18], [20, 22], [15, 12]], /set 1/],
    [[[25.5, 18], [20, 22], [15, 12]], /set 1/],
  ];
  for (const [sets, error] of malos) assert.match(validarSets(LIGA, sets).join(' '), error, JSON.stringify(sets));
});

test('liga: un partido de la fase regular: sets, tantos y puntos con el coeficiente de categoría', () => {
  // P1: Cadete 20h – Alevín Remedios. Gana el cadete 2-1: 2 puntos (2 × 1); el alevín, 3 (su set vale 3).
  const c = calcular(LIGA, { P1: { sets: [[25, 10], [18, 20], [15, 10]] } });
  assert.deepEqual(partido(c, 'P1').resultado, {
    sets: [[25, 10], [18, 20], [15, 10]], setsL: 2, setsV: 1, tantosL: 58, tantosV: 40, ptsL: 2, ptsV: 3, ganador: 'local',
  });
  assert.deepEqual([fila(c, 'cad20').pts, fila(c, 'alerem').pts], [2, 3]);
  assert.deepEqual([fila(c, 'alerem').pj, fila(c, 'alerem').sg, fila(c, 'alerem').sp, fila(c, 'alerem').tf, fila(c, 'alerem').tc, fila(c, 'alerem').dif],
    [1, 1, 2, 40, 58, -18]);
  // El alevín va primero: más puntos.
  assert.deepEqual(c.clasificacion.slice(0, 2).map((f) => f.id), ['alerem', 'cad20']);
  assert.equal(c.regularTerminada, false);
});

test('liga: clasificación: por puntos; a igualdad, la diferencia de tantos', () => {
  // P2: Cadete Lagoas – Infantil C, 2-1 para el cadete: 2 y 2 puntos (el set del infantil vale 2). Tantos: 58-52.
  const c = calcular(LIGA, { P2: { sets: [[25, 18], [18, 22], [15, 12]] } });
  assert.deepEqual([fila(c, 'cadlag').pts, fila(c, 'cadlag').dif, fila(c, 'infc').pts, fila(c, 'infc').dif], [2, 6, 2, -6]);
  assert.deepEqual(c.clasificacion.slice(0, 2).map((f) => f.id), ['cadlag', 'infc']);
  assert.deepEqual(c.clasificacion.slice(0, 2).map((f) => f.empate), [false, false]);
});

test('liga: igualados a puntos y a tantos: empate (partido de desempate), que se deshace con «desempates»', () => {
  const res = {
    P3: { sets: [[25, 20], [20, 25], [15, 10]] },    // Infantil Lagoas 2-1 Infantil B
    P10: { sets: [[25, 20], [20, 25], [15, 10]] },   // Alevín Remedios 2-1 Infantil C (alevín: 2 sets × 2 = 4 pts)
  };
  let c = calcular(LIGA, res);
  // Infantil B (1 pt, -5) e Infantil C (1 pt, -5) empatan.
  assert.deepEqual([fila(c, 'infb').pts, fila(c, 'infb').dif, fila(c, 'infc').pts, fila(c, 'infc').dif], [1, -5, 1, -5]);
  assert.equal(fila(c, 'infb').empate, true);
  assert.equal(fila(c, 'infc').empate, true);
  const orden = (cc) => cc.clasificacion.map((f) => f.id);
  assert.ok(orden(c).indexOf('infb') < orden(c).indexOf('infc'));   // sin decidir: por nombre
  c = calcular({ ...LIGA, desempates: [['infc', 'infb']] }, res);
  assert.ok(orden(c).indexOf('infc') < orden(c).indexOf('infb'));
  assert.equal(fila(c, 'infc').empate, false);
});

// Todos los partidos de la fase regular con resultado: el local gana siempre 2-1, salvo los que diga «visitantes».
// Si todos ganan en casa, los equipos de la misma categoría acaban empatados a puntos y a tantos; con P2 y P3 para el
// visitante, no hay empates (Alevín Remedios, Infantil C, Infantil B, Infantil Lagoas, Cadete 20h, Cadete Lagoas).
function faseRegular(visitantes = ['P2', 'P3']) {
  const r = {};
  for (const p of LIGA.partidos.filter((x) => typeof x.local === 'string')) r[p.id] = { sets: visitantes.includes(p.id) ? GANA_V : GANA_L };
  return r;
}

test('liga: playoffs: hasta acabar la fase regular, «1.º clasificado» (con quién lo sería ahora); luego, los equipos', () => {
  let c = calcular(LIGA, { P1: { sets: GANA_L } });
  const p31 = partido(c, 'P31');
  assert.deepEqual([p31.local.id, p31.local.texto, p31.visitante.texto], [null, '1.º clasificado', '4.º clasificado']);
  assert.equal(p31.local.ahora, c.clasificacion[0].id);
  assert.deepEqual([partido(c, 'P36').local.texto, partido(c, 'P35').visitante.texto], ['Ganador de Semifinal 1', 'Perdedor de Semifinal 2']);
  c = calcular(LIGA, faseRegular());
  assert.equal(c.regularTerminada, true);
  const ids = c.clasificacion.map((f) => f.id);
  assert.deepEqual(ids, ['alerem', 'infc', 'infb', 'inflag', 'cad20', 'cadlag']);
  assert.deepEqual([partido(c, 'P31').local.id, partido(c, 'P31').visitante.id, partido(c, 'P32').local.id, partido(c, 'P32').visitante.id,
    partido(c, 'P33').local.id, partido(c, 'P33').visitante.id], [ids[0], ids[3], ids[1], ids[2], ids[4], ids[5]]);
});

test('liga: playoffs con empates sin desempatar: esos puestos esperan al partido de desempate', () => {
  const res = faseRegular([]);   // los tres infantiles empatados, y los dos cadetes
  let c = calcular(LIGA, res);
  assert.deepEqual(c.clasificacion.map((f) => f.empate), [false, true, true, true, true, true]);
  assert.deepEqual([partido(c, 'P31').local.id, partido(c, 'P31').visitante.id, partido(c, 'P32').local.id], ['alerem', null, null]);
  // Acabada la fase regular, el puesto empatado no dice quién sería (el orden por nombre no decide nada).
  assert.equal(partido(c, 'P32').local.ahora, undefined);
  c = calcular({ ...LIGA, desempates: [['infc', 'inflag', 'infb'], ['cadlag', 'cad20']] }, res);
  assert.deepEqual([partido(c, 'P31').visitante.id, partido(c, 'P32').local.id, partido(c, 'P32').visitante.id,
    partido(c, 'P33').local.id, partido(c, 'P33').visitante.id], ['infb', 'infc', 'inflag', 'cadlag', 'cad20']);
});

test('liga: playoffs sin coeficiente: pasa quien gana más sets; final, 3.er puesto y clasificación final', () => {
  const res = faseRegular();
  let c = calcular(LIGA, res);
  const ids = c.clasificacion.map((f) => f.id);
  // Semifinal 1: el 4.º (visitante) gana 2-1 aunque sea de categoría menor o mayor: solo cuentan los sets.
  Object.assign(res, { P31: { sets: GANA_V }, P32: { sets: GANA_L }, P33: { sets: GANA_V } });
  c = calcular(LIGA, res);
  assert.deepEqual(partido(c, 'P31').resultado.ganador, 'visitante');
  assert.equal(partido(c, 'P31').resultado.ptsL, undefined);   // sin puntos de liga en los playoffs
  assert.deepEqual([partido(c, 'P36').local.id, partido(c, 'P36').visitante.id], [ids[3], ids[1]]);
  assert.deepEqual([partido(c, 'P35').local.id, partido(c, 'P35').visitante.id], [ids[0], ids[2]]);
  assert.equal(c.final, null);   // aún sin final
  Object.assign(res, { P35: { sets: GANA_L }, P36: { sets: GANA_V } });
  c = calcular(LIGA, res);
  assert.deepEqual(c.final, [ids[1], ids[3], ids[0], ids[2], ids[5], ids[4]]);
  // El partido de confraternización no cambia nada.
  res.P34 = { sets: GANA_L };
  assert.deepEqual(calcular(LIGA, res).final, c.final);
});

test('liga: un resultado de playoff con los equipos aún sin decidir, o con tantos que no valen, no cuenta (y se avisa)', () => {
  const c = calcular(LIGA, { P31: { sets: GANA_L }, P1: { sets: [[30, 0], [25, 1], [15, 1]] } });
  assert.equal(partido(c, 'P31').resultado, null);
  assert.equal(partido(c, 'P1').resultado, null);
  assert.equal(c.avisos.length, 2);
  assert.match(c.avisos.join(' '), /P31.*aún no se sabe/);
  assert.match(c.avisos.join(' '), /P1.*25/);
});

test('liga: guardar y borrar un resultado (vale el último; el mismo otra vez, nada)', () => {
  let d = aplicarResultado({}, 'P1', GANA_L, AHORA);
  assert.deepEqual(d, { P1: { sets: GANA_L, cambiado: '2026-11-06T20:30:00.000Z' } });
  assert.equal(aplicarResultado(d, 'P1', GANA_L, new Date('2026-11-07T00:00:00Z')).P1.cambiado, '2026-11-06T20:30:00.000Z');
  d = aplicarResultado(d, 'P1', GANA_V, AHORA);
  assert.deepEqual(d.P1.sets, GANA_V);
  assert.deepEqual(aplicarResultado(d, 'P1', null, AHORA), {});
  assert.equal(rutaResultados('/x/liga/dompinas-1.json').replace(/\\/g, '/'), '/x/liga/resultados-dompinas-1.json');
});

test('liga: por consola (el workflow): LIGA, PARTIDO y SETS; entradas malas, error sin repetirlas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'liga-'));
  try {
    const ruta = join(dir, 'dompinas-1.json');
    writeFileSync(ruta, readFileSync(RUTA));
    const res = join(dir, 'resultados-dompinas-1.json');
    const correr = (env) => spawnSync(process.execPath, [MODULO], { encoding: 'utf8', env: { ...process.env, LIGA: ruta, ...env } });
    let r = correr({ PARTIDO: 'P1', SETS: '25-10 18-20 15-10' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Resultado: P1 Cadete 20h – Alevín Remedios → 25-10 18-20 15-10/);
    assert.deepEqual(JSON.parse(readFileSync(res, 'utf8')).P1.sets, [[25, 10], [18, 20], [15, 10]]);
    // Se guarda con los equipos que jugaron.
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(res, 'utf8')).P1), ['sets', 'local', 'visitante', 'cambiado']);
    assert.deepEqual([JSON.parse(readFileSync(res, 'utf8')).P1.local, JSON.parse(readFileSync(res, 'utf8')).P1.visitante], ['cad20', 'alerem']);
    r = correr({ PARTIDO: 'P1', SETS: 'borrar' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /P1.*borrado/);
    assert.deepEqual(JSON.parse(readFileSync(res, 'utf8')), {});
    for (const [env, error] of [
      [{ PARTIDO: 'P1', SETS: '' }, /faltan los tantos \(para quitar el resultado: «borrar»\)/],
      [{ PARTIDO: '__proto__', SETS: '25-10 18-20 15-10' }, /partido no vale/],
      [{ PARTIDO: 'P1', SETS: '25-10 18-20 15-10\n::error::x' }, /tantos/],
      [{ PARTIDO: 'P99', SETS: '25-10 18-20 15-10' }, /no hay ningún partido/],
      [{ PARTIDO: 'P1; rm', SETS: '25-10 18-20 15-10' }, /partido no vale/],
      [{ PARTIDO: 'P1', SETS: '30-10 18-20 15-10' }, /25/],
      [{ PARTIDO: 'P1', SETS: '##[error]x' }, /tantos/],
      [{ PARTIDO: 'P31', SETS: '25-10 18-20 15-10' }, /aún no se sabe/],
    ]) {
      r = correr(env);
      assert.equal(r.status, 1, JSON.stringify(env));
      assert.match(r.stdout, error, JSON.stringify(env));
      assert.ok(!r.stdout.includes('##[') && !r.stdout.includes('rm') && !r.stdout.includes('::error::x'), r.stdout);
      // El error, también como anotación de GitHub Actions (una sola línea, con el mensaje fijo).
      assert.match(r.stdout, /\n::error::[^\n]+\n$/);
    }
    // Un archivo de resultados que no se puede leer no se pisa.
    writeFileSync(res, '{"P2": {"sets": [[25,1],[25,1],[15,1]]},}');
    r = correr({ PARTIDO: 'P1', SETS: '25-10 18-20 15-10' });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /no se puede leer/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('liga: config.json › liga: un .json de la carpeta liga; si no, aviso y sin liga', () => {
  assert.equal(configLiga(null), null);
  assert.equal(configLiga({}), null);
  assert.deepEqual(configLiga({ liga: { archivo: 'liga/dompinas-1.json' } }), { archivo: 'liga/dompinas-1.json' });
  for (const liga of [{ archivo: '../config.json' }, { archivo: 'liga/../config.json' }, { archivo: 'otra/x.json' }, { archivo: 'liga/x.txt' }, 'liga/x.json', {}]) {
    assert.equal(configLiga({ liga }), null, JSON.stringify(liga));
  }
});

test('liga: por consola, sin LIGA, la de config.json (como en el workflow)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'liga-'));
  try {
    mkdirSync(join(dir, 'liga'));
    writeFileSync(join(dir, 'liga', 'dompinas-1.json'), readFileSync(RUTA));
    const correr = () => spawnSync(process.execPath, [MODULO], { cwd: dir, encoding: 'utf8', env: { ...process.env, LIGA: '', PARTIDO: 'P2', SETS: '25-10 25-20 15-13' } });
    let r = correr();
    assert.equal(r.status, 1);
    assert.match(r.stdout, /no hay liga: falta config\.json › liga › archivo/);
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ liga: { archivo: 'liga/dompinas-1.json' } }));
    r = correr();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'liga', 'resultados-dompinas-1.json'), 'utf8')).P2.sets, [[25, 10], [25, 20], [15, 13]]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('liga: un resultado de playoff se guarda con sus equipos; si el cuadro cambia después, no cuenta y se avisa', () => {
  const res = faseRegular();   // alerem, infc, infb, inflag, cad20, cadlag
  // P31 (alerem – inflag) y la final (alerem – infc), con sus equipos.
  let d = aplicarResultado(res, 'P31', GANA_L, AHORA, { local: 'alerem', visitante: 'inflag' });
  d = aplicarResultado(d, 'P32', GANA_L, AHORA, { local: 'infc', visitante: 'infb' });
  d = aplicarResultado(d, 'P36', GANA_L, AHORA, { local: 'alerem', visitante: 'infc' });
  assert.deepEqual(d.P31, { sets: GANA_L, local: 'alerem', visitante: 'inflag', cambiado: '2026-11-06T20:30:00.000Z' });
  let c = calcular(LIGA, d);
  assert.deepEqual(c.avisos, []);
  assert.equal(partido(c, 'P36').resultado.ganador, 'local');
  // El mismo resultado y los mismos equipos: nada cambia; con otros equipos, sí.
  assert.equal(aplicarResultado(d, 'P31', GANA_L, new Date('2027-01-01T00:00:00Z'), { local: 'alerem', visitante: 'inflag' }).P31.cambiado, '2026-11-06T20:30:00.000Z');
  assert.equal(aplicarResultado(d, 'P31', GANA_L, new Date('2027-01-01T00:00:00Z'), { local: 'alerem', visitante: 'infb' }).P31.cambiado, '2027-01-01T00:00:00.000Z');
  // Se corrige la semifinal 2: ahora la gana Infantil B. La final guardada (alerem – infc) ya no es de los que juegan.
  d = aplicarResultado(d, 'P32', GANA_V, AHORA, { local: 'infc', visitante: 'infb' });
  c = calcular(LIGA, d);
  assert.equal(partido(c, 'P36').visitante.id, 'infb');
  assert.equal(partido(c, 'P36').resultado, null);
  assert.equal(c.final, null);
  assert.deepEqual(c.avisos, ['El resultado de P36 se puso para Alevín Remedios – Infantil C, pero ahora juegan Alevín Remedios – Infantil B: no cuenta (vuelve a ponerlo o bórralo).']);
  // Se corrige un partido de la fase regular y cambia el orden: las semifinales guardadas tampoco cuentan.
  // (P1 para el visitante y P2 para el local: Infantil B pasa a 2.º y la semifinal 2 es Infantil B – Infantil C.)
  d = { ...d, P1: { sets: GANA_V }, P2: { sets: GANA_L } };
  c = calcular(LIGA, d);
  assert.deepEqual([partido(c, 'P32').local.id, partido(c, 'P32').visitante.id, partido(c, 'P32').resultado], ['infb', 'infc', null]);
  assert.match(c.avisos.join(), /El resultado de P32 se puso para Infantil C – Infantil B, pero ahora juegan Infantil B – Infantil C/);
  // Uno guardado a mano, sin equipos, cuenta para los que jueguen (como antes).
  assert.equal(partido(calcular(LIGA, { ...res, P31: { sets: GANA_L } }), 'P31').resultado.ganador, 'local');
});

test('liga: desempates: tiene que ser una lista; vale la última lista con todos los empatados; si falta alguno, aviso', () => {
  for (const desempates of ['cad20', {}, 5, [['cad20']], [['cad20', 'cad20']], [['cad20', 'nadie']]]) {
    assert.ok(validarLiga({ ...LIGA, desempates }).length > 0, JSON.stringify(desempates));
  }
  const res = faseRegular([]);   // los tres infantiles empatados, y los dos cadetes
  // Una lista vieja y otra nueva para el mismo empate: vale la última.
  let c = calcular({ ...LIGA, desempates: [['cad20', 'cadlag'], ['cadlag', 'cad20']] }, res);
  assert.deepEqual(c.clasificacion.slice(4).map((f) => f.id), ['cadlag', 'cad20']);
  // Una lista con solo dos de los tres infantiles empatados: siguen empatados, con aviso.
  c = calcular({ ...LIGA, desempates: [['infb', 'inflag']] }, res);
  assert.deepEqual(c.clasificacion.slice(1, 4).map((f) => f.empate), [true, true, true]);
  assert.match(c.avisos.join(), /desempates: ninguna lista tiene a todos los empatados \(Infantil B, Infantil C, Infantil Lagoas\)/);
});

test('liga: un amistoso entre equipos no cuenta; un partido anulado tampoco, ni hace falta para acabar la fase regular', () => {
  const amistoso = { id: 'A1', jornada: 12, fecha: '2027-04-23', hora: '20:30', local: 'cad20', visitante: 'alerem', amistoso: true };
  let L = { ...LIGA, partidos: [...LIGA.partidos, amistoso] };
  assert.deepEqual(validarLiga(L), []);
  let c = calcular(L, { ...faseRegular(), A1: { sets: GANA_V } });
  assert.equal(c.regularTerminada, true);
  assert.equal(fila(c, 'alerem').pj, 10);
  assert.equal(partido(c, 'A1').resultado.ptsL, undefined);   // con resultado, pero sin puntos de liga
  assert.equal(partido(c, 'A1').cuenta, false);
  // P1 anulado: la fase regular acaba sin él y su resultado (si lo hay) no cuenta.
  L = { ...LIGA, partidos: LIGA.partidos.map((p) => (p.id === 'P1' ? { ...p, anulado: true } : p)) };
  const res = faseRegular();
  delete res.P1;
  c = calcular(L, res);
  assert.equal(c.regularTerminada, true);
  assert.deepEqual([partido(c, 'P1').anulado, partido(c, 'P1').cuenta, fila(c, 'cad20').pj], [true, false, 9]);
  c = calcular(L, { ...res, P1: { sets: GANA_L } });
  assert.equal(partido(c, 'P1').resultado, null);
  assert.match(c.avisos.join(), /P1 está anulado/);
  // Un cruce de playoffs no se puede anular.
  assert.match(validarLiga({ ...LIGA, partidos: LIGA.partidos.map((p) => (p.id === 'P31' ? { ...p, anulado: true } : p)) }).join(), /P31 es de playoffs/);
});

test('liga: ids y categorías con nombres que no valen (__proto__...); nombres que no son texto', () => {
  const conEquipo = (cambio) => ({ ...LIGA, equipos: LIGA.equipos.map((q, i) => (i === 0 ? { ...q, ...cambio } : q)) });
  assert.ok(validarLiga(conEquipo({ id: '__proto__' })).length > 0);
  assert.ok(validarLiga(conEquipo({ nombre: 5 })).length > 0);
  assert.ok(validarLiga({ ...LIGA, partidos: [{ ...LIGA.partidos[0], id: 'constructor' }] }).length > 0);
  assert.ok(validarLiga({ ...LIGA, categorias: { ...LIGA.categorias, 'x"><b>': { nombre: 'X', nivel: 4 } } }).length > 0);
  assert.ok(validarLiga({ ...LIGA, nombre: '' }).length > 0);
});

test('liga: resultados de partidos que no son de la liga: aviso (sin repetir lo que no es un id)', () => {
  const c = calcular(LIGA, { P99: { sets: GANA_L }, '::error::x': { sets: GANA_L } });
  assert.deepEqual(c.avisos, ['Hay un resultado de P99 que no es de la liga; no cuenta.', 'Hay un resultado de un partido que no es de la liga; no cuenta.']);
});

test('liga: un archivo de resultados roto: el aviso no repite lo que tiene dentro', () => {
  const dir = mkdtempSync(join(tmpdir(), 'liga-'));
  try {
    const ruta = join(dir, 'resultados-x.json');
    writeFileSync(ruta, '{"P1": x\n::error::pwned');
    assert.throws(() => leerResultados(ruta, { estricto: true }), (e) => /no es JSON válido/.test(e.message) && !e.message.includes('pwned'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('liga: config.json › liga sin distinguir mayúsculas (como el resto de config.json)', () => {
  assert.deepEqual(configLiga({ Liga: { Archivo: 'liga/dompinas-1.json' } }), { archivo: 'liga/dompinas-1.json' });
});

test('liga: por consola, si el cambio deja sin contar otro resultado (la final), lo avisa en GitHub Actions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'liga-'));
  try {
    const ruta = join(dir, 'dompinas-1.json');
    writeFileSync(ruta, readFileSync(RUTA));
    let d = aplicarResultado(faseRegular(), 'P31', GANA_L, AHORA, { local: 'alerem', visitante: 'inflag' });
    d = aplicarResultado(d, 'P32', GANA_L, AHORA, { local: 'infc', visitante: 'infb' });
    d = aplicarResultado(d, 'P36', GANA_L, AHORA, { local: 'alerem', visitante: 'infc' });
    writeFileSync(join(dir, 'resultados-dompinas-1.json'), JSON.stringify(d));
    const r = spawnSync(process.execPath, [MODULO], { encoding: 'utf8', env: { ...process.env, LIGA: ruta, PARTIDO: 'P32', SETS: '18-25 22-20 12-15' } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Resultado: P32 Infantil C – Infantil B → 18-25 22-20 12-15\n::warning::El resultado de P36 se puso para Alevín Remedios – Infantil C, pero ahora juegan Alevín Remedios – Infantil B/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('liga: por consola, un partido anulado no lleva resultado', () => {
  const dir = mkdtempSync(join(tmpdir(), 'liga-'));
  try {
    const ruta = join(dir, 'dompinas-1.json');
    const L = JSON.parse(readFileSync(RUTA, 'utf8'));
    L.partidos[0].anulado = true;
    writeFileSync(ruta, JSON.stringify(L));
    const r = spawnSync(process.execPath, [MODULO], { encoding: 'utf8', env: { ...process.env, LIGA: ruta, PARTIDO: 'P1', SETS: '25-10 18-20 15-10' } });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /el P1 está anulado/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('liga: por consola, con los equipos que enseñaba la página (LOCAL, VISITANTE): si el cuadro cambió, se guarda para ellos y no cuenta', () => {
  const dir = mkdtempSync(join(tmpdir(), 'liga-'));
  try {
    const ruta = join(dir, 'dompinas-1.json');
    writeFileSync(ruta, readFileSync(RUTA));
    const res = join(dir, 'resultados-dompinas-1.json');
    // Acabada la fase regular, la semifinal 2 es Infantil C – Infantil B; luego se corrigen P1 y P2 y pasa a ser
    // Infantil B – Infantil C. Una página de antes manda el resultado con los equipos que enseñaba.
    writeFileSync(res, JSON.stringify({ ...faseRegular(), P1: { sets: GANA_V }, P2: { sets: GANA_L } }));
    const correr = (env) => spawnSync(process.execPath, [MODULO], { encoding: 'utf8', env: { ...process.env, LIGA: ruta, ...env } });
    let r = correr({ PARTIDO: 'P32', SETS: '25-18 20-22 15-12', LOCAL: 'infc', VISITANTE: 'infb' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Resultado: P32 Infantil C – Infantil B → 25-18 20-22 15-12/);
    assert.match(r.stdout, /::warning::El resultado de P32 se puso para Infantil C – Infantil B, pero ahora juegan Infantil B – Infantil C/);
    const guardado = JSON.parse(readFileSync(res, 'utf8')).P32;
    assert.deepEqual([guardado.local, guardado.visitante], ['infc', 'infb']);
    assert.equal(partido(calcular(LIGA, JSON.parse(readFileSync(res, 'utf8'))), 'P32').resultado, null);
    // Equipos que no valen: error, sin repetirlos.
    for (const env of [{ LOCAL: 'infc' }, { LOCAL: 'infc', VISITANTE: 'nadie' }, { LOCAL: 'infc', VISITANTE: 'infc' }, { LOCAL: '::error::x', VISITANTE: 'infb' }]) {
      r = correr({ PARTIDO: 'P32', SETS: '25-18 20-22 15-12', ...env });
      assert.equal(r.status, 1, JSON.stringify(env));
      assert.match(r.stdout, /los equipos no valen/);
      assert.ok(!r.stdout.includes('::error::x'), r.stdout);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('liga: más avisos: un resultado con otra forma; una lista de desempates que no casa con ningún empate', () => {
  let c = calcular(LIGA, { P5: [[25, 18], [20, 22], [15, 12]] });
  assert.deepEqual(c.avisos, ['El resultado de P5 no tiene la forma { "sets": [[25, 18], [20, 22], [15, 12]] }; no cuenta.']);
  // Los cadetes, empatados; la lista nombra a un cadete y a un infantil (errata): no deshace nada, y se avisa.
  c = calcular({ ...LIGA, desempates: [['cad20', 'inflag'], ['infc', 'inflag', 'infb']] }, faseRegular([]));
  assert.deepEqual(c.avisos, ['desempates: la lista (Cadete 20h, Infantil Lagoas) no corresponde a ningún empate de la clasificación; no cuenta.']);
  assert.deepEqual(c.clasificacion.slice(4).map((f) => f.empate), [true, true]);
  // A mitad de liga, no (aún no se sabe qué empates habrá).
  assert.deepEqual(calcular({ ...LIGA, desempates: [['cad20', 'inflag']] }, { P1: { sets: GANA_L } }).avisos, []);
});

test('liga: problemaResultados: sin archivo o bueno, nada; roto, por qué (sin repetir lo que tiene)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'liga-'));
  try {
    const ruta = join(dir, 'resultados-x.json');
    assert.equal(problemaResultados(ruta), '');
    writeFileSync(ruta, '{"P1": {"sets": [[25,1],[25,1],[15,1]]}}');
    assert.equal(problemaResultados(ruta), '');
    writeFileSync(ruta, '{"P1": x');
    assert.equal(problemaResultados(ruta), 'no es JSON válido');
    writeFileSync(ruta, '[1]');
    assert.equal(problemaResultados(ruta), 'no es un objeto');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('liga: huella y cuentaAhora (lo que enseñaba la página; si un resultado guardado cuenta para unos equipos)', () => {
  assert.equal(huella({ sets: GANA_L, local: 'cad20', visitante: 'alerem', cambiado: 'x' }), '[[[25,18],[20,22],[15,12]],"cad20","alerem"]');
  assert.equal(huella({ sets: GANA_L }), '[[[25,18],[20,22],[15,12]],null,null]');
  assert.equal(huella([1]), 'x');
  assert.equal(cuentaAhora(LIGA, { sets: GANA_L, local: 'a', visitante: 'b' }, 'a', 'b'), true);
  assert.equal(cuentaAhora(LIGA, { sets: GANA_L }, 'a', 'b'), true);
  assert.equal(cuentaAhora(LIGA, { sets: GANA_L, local: 'b', visitante: 'a' }, 'a', 'b'), false);
  assert.equal(cuentaAhora(LIGA, { sets: [[30, 0], [25, 0], [15, 0]] }, 'a', 'b'), false);
});

test('liga: por consola, una página de antes no pisa un resultado que cuenta, ni borra uno que ha cambiado', () => {
  const dir = mkdtempSync(join(tmpdir(), 'liga-'));
  try {
    const ruta = join(dir, 'dompinas-1.json');
    writeFileSync(ruta, readFileSync(RUTA));
    const res = join(dir, 'resultados-dompinas-1.json');
    const correr = (env) => spawnSync(process.execPath, [MODULO], { encoding: 'utf8', env: { ...process.env, LIGA: ruta, LOCAL: '', VISITANTE: '', ANTES: '', ...env } });
    const leer = () => JSON.parse(readFileSync(res, 'utf8'));
    // La final ya está guardada para Alevín Remedios – Infantil C (cuenta).
    let d = aplicarResultado(faseRegular(), 'P31', GANA_L, AHORA, { local: 'alerem', visitante: 'inflag' });
    d = aplicarResultado(d, 'P32', GANA_L, AHORA, { local: 'infc', visitante: 'infb' });
    d = aplicarResultado(d, 'P36', GANA_L, AHORA, { local: 'alerem', visitante: 'infc' });
    writeFileSync(res, JSON.stringify(d));
    // Una página de antes enseñaba otra final (Alevín Remedios – Infantil B): no pisa la que cuenta.
    let r = correr({ PARTIDO: 'P36', SETS: '18-25 22-20 12-15', LOCAL: 'alerem', VISITANTE: 'infb' });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /el cuadro ha cambiado y el P36 ya tiene un resultado que cuenta: recarga la página/);
    assert.deepEqual(leer().P36.sets, GANA_L);
    // Con los equipos de ahora, vale el último.
    r = correr({ PARTIDO: 'P36', SETS: '18-25 22-20 12-15', LOCAL: 'alerem', VISITANTE: 'infc' });
    assert.equal(r.status, 0, r.stdout);
    assert.deepEqual(leer().P36.sets, GANA_V);
    // Borrar con la huella de otro resultado (el que enseñaba una página de antes): no se borra.
    r = correr({ PARTIDO: 'P36', SETS: 'borrar', ANTES: huella({ sets: GANA_L, local: 'alerem', visitante: 'infc' }) });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /el resultado guardado del P36 ha cambiado desde que se abrió la página: recarga la página/);
    assert.ok(leer().P36);
    // Con la huella del que hay, sí; otra vez, ya no hay nada (sin error ni cambios).
    r = correr({ PARTIDO: 'P36', SETS: 'borrar', ANTES: huella(leer().P36) });
    assert.equal(r.status, 0, r.stdout);
    assert.equal(Object.hasOwn(leer(), 'P36'), false);
    r = correr({ PARTIDO: 'P36', SETS: 'borrar', ANTES: '[[[1,0],[1,0],[1,0]],null,null]' });
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /P36 ya estaba borrado/);
    // Lanzado a mano (sin ANTES): borra lo que haya.
    r = correr({ PARTIDO: 'P35', SETS: 'borrar' });
    assert.equal(r.status, 0, r.stdout);
    // Una huella que no es razonable: error, sin repetirla.
    r = correr({ PARTIDO: 'P31', SETS: 'borrar', ANTES: `::error::${'x'.repeat(500)}` });
    assert.equal(r.status, 1);
    assert.ok(!r.stdout.includes('::error::x'), r.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
