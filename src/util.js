// Utilidades: textos, JSON, fechas «de pared» de Galicia y mensajes de consola. Las mismas que usa el calendario del
// club (albovy/calendario-dompavolei), solo las que hacen falta aquí.

// Marca de orden de bytes (BOM) que pueden traer delante los JSON guardados con algunos editores.
const BOM = String.fromCharCode(0xFEFF);

export function paso(texto) { console.log(`  ${texto}`); }
export function aviso(texto) { console.log(`  ! ${texto}`); }

// null y undefined como texto vacío; lo demás, como texto.
export function txt(valor) { return valor == null ? '' : String(valor); }

// Un objeto de JSON ({...}), no una lista, un texto ni null.
export function esObjeto(valor) { return valor !== null && typeof valor === 'object' && !Array.isArray(valor); }

// JSON.parse, sin el BOM del principio; un texto en blanco es null (no un error). Lanza error si no es JSON.
export function leerJson(texto) {
  let t = txt(texto);
  if (t.startsWith(BOM)) t = t.slice(1);
  return t.trim() === '' ? null : JSON.parse(t);
}

// La clave de coleccion que equivale a k sin distinguir mayúsculas («Liga» vale por «liga»); k si no hay ninguna.
const ORDEN_TEXTO = new Intl.Collator('en', { sensitivity: 'accent' });
export function claveSinCaja(coleccion, k) {
  if (Object.hasOwn(coleccion, k)) return k;
  for (const x of Object.keys(coleccion)) if (ORDEN_TEXTO.compare(x, k) === 0) return x;
  return k;
}

// Hora actual de Galicia, como Date «de pared» (sus campos UTC son la hora de Galicia).
const RELOJ_MADRID = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Madrid', hourCycle: 'h23',
  year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
});
export function ahoraMadrid(instante = new Date()) {
  const p = {};
  for (const { type, value } of RELOJ_MADRID.formatToParts(instante)) p[type] = Number(value);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

// Una fecha de pared con los campos yyyy, MM, dd, HH y mm («dd/MM/yyyy HH:mm»).
export function fmt(d, patron) {
  const dos = (n) => String(n).padStart(2, '0');
  const campos = { yyyy: String(d.getUTCFullYear()), MM: dos(d.getUTCMonth() + 1), dd: dos(d.getUTCDate()), HH: dos(d.getUTCHours()), mm: dos(d.getUTCMinutes()) };
  return patron.replace(/yyyy|MM|dd|HH|mm/g, (c) => campos[c]);
}
