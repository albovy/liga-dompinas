// La página de la liga (index.html en la web): la plantilla (plantilla.html) con __TITULO__, __APP__ y __DATOS__
// rellenos. Los datos son la liga ya calculada (calcular de liga.js), en JSON, más el escudo del club.

import { readFileSync } from 'node:fs';
import { calcular, huella } from './liga.js';
import { aviso, esObjeto, fmt, txt } from './util.js';

// Barra invertida, construida por partes a propósito (ver rellenarPlantilla).
const BARRA = String.fromCharCode(92);
// Separadores de línea que algunos navegadores no aceptan dentro de un <script> antiguo: van escapados.
const RE_SEPARADORES = new RegExp(`[${String.fromCharCode(0x85, 0x2028, 0x2029)}]`, 'g');
const ENTIDADES = new Map([['<', '&lt;'], ['>', '&gt;'], ['"', '&quot;'], ["'", '&#39;'], ['&', '&amp;']]);

// Texto para HTML: < > " ' & con su entidad, y lo que no es ASCII básico (tildes, eñes, emojis) como «&#número;».
export function codificarHtml(valor) {
  let r = '';
  for (const c of txt(valor)) {
    const codigo = c.codePointAt(0);
    if (ENTIDADES.has(c)) r += ENTIDADES.get(c);
    else if ((codigo >= 160 && codigo <= 255) || codigo > 0xFFFF) r += `&#${codigo};`;
    else if (codigo >= 0xD800 && codigo <= 0xDFFF) r += String.fromCharCode(0xFFFD);
    else r += c;
  }
  return r;
}

// La plantilla con el título, lo de la cabecera (HTML ya hecho) y los datos dentro.
function rellenarPlantilla(plantilla, datos, titulo, cabecera) {
  // Lo que falta sale como null (JSON.stringify quitaría la propiedad).
  let json = JSON.stringify(datos, (_clave, valor) => (valor === undefined ? null : valor));
  json = json.replace(RE_SEPARADORES, (c) => `${BARRA}u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  // Dentro de <script> no puede aparecer "</script>" ni "<!--": cada "<" va con su escape JSON (barra invertida +
  // u003c), construido por partes para que ningún editor lo convierta en "<".
  json = json.split('<').join(`${BARRA}u003c`);
  if (json.includes('<')) throw new Error('Error interno: quedan "<" sin escapar en los datos de la página.');
  const valores = { TITULO: codificarHtml(titulo), APP: cabecera, DATOS: json };
  // De una pasada y con función: lo que se mete no se vuelve a mirar y un "$&" en los textos no se interpreta.
  return plantilla.replace(/__(TITULO|APP|DATOS)__/g, (_m, clave) => valores[clave]);
}

// El escudo del club como data URI, para que la página no dependa de otro archivo; '' si no hay.
function escudoDataUri(ruta) {
  if (!ruta) return '';
  try {
    return `data:image/png;base64,${readFileSync(ruta).toString('base64')}`;
  } catch (e) {
    if (e.code !== 'ENOENT') aviso(`No se pudo leer el escudo (${e.message}); la página sale sin él.`);
    return '';
  }
}

// Uno de los equipos de un partido: id (null si aún no se sabe), t (lo que se enseña mientras: «1.º clasificado»,
// «Ganador de Semifinal 1»...) y a (quién sería ahora, en los cruces por puesto).
function lado(x) {
  return { id: x.id, t: x.texto, ...(x.ahora ? { a: x.ahora } : {}) };
}

// Los datos de la página. edicion: { repo, workflow, rama, cifrada? } (config.json › edicion) o null. Devuelve
// { datos, avisos }.
export function datosPagina({ liga: L, resultados, club, generado, edicion = null }) {
  const c = calcular(L, resultados);
  return {
    datos: {
      club: txt(club),
      nombre: txt(L.nombre),
      temporada: txt(L.temporada),
      generado: fmt(generado, 'dd/MM/yyyy HH:mm'),
      cats: Object.fromEntries(Object.entries(L.categorias).map(([k, x]) => [k, { n: txt(x.nombre), nv: x.nivel }])),
      equipos: L.equipos.map((q) => ({ id: q.id, n: q.nombre, cat: q.categoria })),
      max: L.puntosMaxSet,
      normas: Array.isArray(L.normas) ? L.normas.map(txt) : [],
      clas: c.clasificacion.map((f) => ({ pos: f.pos, id: f.id, pj: f.pj, sg: f.sg, sp: f.sp, tf: f.tf, tc: f.tc, dif: f.dif, pts: f.pts, emp: f.empate })),
      partidos: c.partidos.map((p) => ({
        // reg: de la fase regular (no un cruce); cu: cuenta para la clasificación (no amistoso ni anulado); an: anulado.
        id: p.id, j: p.jornada, f: p.fecha, h: p.hora, fin: p.fin, fase: p.fase, nom: p.nombre, am: p.amistoso, an: p.anulado, reg: p.regular, cu: p.cuenta,
        l: lado(p.local), v: lado(p.visitante),
        r: p.resultado ? {
          sets: p.resultado.sets, sl: p.resultado.setsL, sv: p.resultado.setsV, g: p.resultado.ganador,
          ...(p.cuenta ? { pl: p.resultado.ptsL, pv: p.resultado.ptsV } : {}),
        } : null,
        // gu: la huella del resultado guardado (la página la manda al borrar: solo se borra si sigue siendo ese).
        ...(Object.hasOwn(resultados, p.id) ? { gu: huella(resultados[p.id]) } : {}),
        // g: hay un resultado guardado que no cuenta y no va a contar solo (anulado, con otra forma, o de otros equipos
        // ya sabidos): los entrenadores lo pueden borrar. Si aún no se sabe quién juega (un empate por deshacer), no.
        ...(!p.resultado && Object.hasOwn(resultados, p.id)
          && (p.anulado || !esObjeto(resultados[p.id]) || (p.local.id && p.visitante.id)) ? { g: 1 } : {}),
      })),
      final: c.final,
      terminada: c.regularTerminada,
      // Poner resultados («Modo entrenador»): la llave (la misma que la del calendario del club) lanza el workflow. Los
      // avisos (un resultado que ya no cuenta...), para que los vean los entrenadores.
      edicion: edicion ? { repo: edicion.repo, workflow: edicion.workflow, rama: edicion.rama, ...(edicion.cifrada ? { cifrada: edicion.cifrada } : {}) } : null,
      avisos: edicion ? c.avisos : [],
    },
    avisos: c.avisos,
  };
}

// La página. Opciones: las de datosPagina más rutaEscudo (el escudo.png del club: en la cabecera y como icono de la
// pestaña). Devuelve { html, avisos } (los resultados que no cuentan..., para la consola). La plantilla se lee aquí.
export function crearPagina({ rutaEscudo = '', ...opciones }) {
  const plantilla = readFileSync(new URL('./plantilla.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const { datos, avisos } = datosPagina(opciones);
  datos.escudo = escudoDataUri(rutaEscudo);
  const cabecera = datos.escudo ? `<link rel="icon" type="image/png" href="${datos.escudo}">` : '';
  const html = rellenarPlantilla(plantilla, datos, `${datos.nombre} · ${txt(opciones.club)} · ${datos.temporada}`, cabecera);
  return { html, avisos };
}
