# Liga Dompiñas

Liga interna del **DOMPAVOLEI** entre sus equipos (Cadete 20h, Cadete Lagoas, Infantil Lagoas, Infantil B,
Infantil C y Alevín Remedios), temporada 2026/27.

- **Web:** https://albovy.github.io/liga-dompinas/

En la web se ven la **clasificación**, el cuadro de **playoffs**, los **partidos** de cada jornada con su resultado
(se puede elegir «mi equipo») y las **normas**. No lleva nombres de jugadoras y no la indexan los buscadores. Es
aparte del calendario del club (https://albovy.github.io/calendario-dompavolei/), sin enlaces entre las dos.

## Reglas

- Partidos por tiempo: **siempre 3 sets**, cada set como mucho a 25 tantos (el 3.º a 15), con punto de oro.
- **Puntos de liga**: cada set ganado vale 1 punto, y 1 más por cada categoría de diferencia si lo gana el equipo de
  categoría menor (Alevín < Infantil < Cadete). Los amistosos no cuentan.
- **Clasificación**: por puntos; a igualdad, la diferencia de tantos; si siguen igualados al acabar la fase regular,
  partido de desempate. Hasta entonces la clasificación los marca con «=» y esos cruces no se saben. Su resultado se
  apunta a mano en `desempates` del archivo de la liga: una lista con **todos** los empatados, en el orden que decidió
  (p. ej. `"desempates": [["infc", "inflag", "infb"]]`); si hay varias para el mismo empate, vale la última.
- **Playoffs**: partido único, sin coeficiente: pasa quien gana más sets. Hasta que acaba la fase regular, los cruces
  se ven por puesto («1.º clasificado») con quién lo ocupa ahora.
- **Un partido que no se juega**: se pone `"anulado": true` en ese partido del archivo de la liga. No cuenta y no hace
  falta para acabar la fase regular (solo en la fase regular).

## Poner los resultados (entrenadores)

Con la **misma contraseña de entrenador que el calendario**. Si ya entraron allí en el «Modo entrenador» **desde el
mismo navegador** (Safari o Chrome del móvil, o el del ordenador), aquí ya la tienen: las dos webs están en
albovy.github.io y el navegador la guarda una vez para las dos. Desde la app del calendario instalada en el iPhone (no
comparte lo guardado con Safari), desde otro navegador o desde el de Instagram o Facebook, no: ahí se escribe otra vez
la contraseña en «Modo entrenador», al final de la página. En cada partido ya jugado (de hoy hacia atrás) con sus equipos sabidos sale **Poner resultado**: los tantos de cada set (el
local, a la izquierda), y la página dice quién gana y cuántos puntos se lleva cada uno. **Guardar** lanza la tarea
`.github/workflows/resultado.yml`, que lo guarda en `liga/resultados-dompinas-1.json` (con los equipos que jugaron) y
vuelve a publicar la web (`publicar.yml`, en la misma ejecución: si falla, GitHub avisa al dueño): en 1 o 2 minutos
sale, con la clasificación al día. Con **Borrar
resultado** (pide confirmación) se quita. Si no aparece, mira la pestaña **Actions** › **Resultado de la liga**;
lanzada a mano, los tantos van como `25-18 20-22 15-12`, o `borrar`.

Si cambia el cuadro después de jugarse un cruce (porque se corrige un resultado de la fase regular o se apunta un
desempate), o se guardó el resultado desde una página abierta de antes, el resultado de ese cruce no cuenta para los
equipos que juegan ahora: los entrenadores lo ven en la página («Avisos para los entrenadores») y en el registro de la
publicación. Se vuelve a poner, o se borra. Desde una página abierta de antes no se pisa un resultado que cuenta ni se
borra uno que ha cambiado entre medias: la tarea falla con «recarga la página» (en **Actions**) y no toca nada.

### La llave

Es la del calendario: un token de GitHub de grano fino del dueño, con el permiso **Actions: Read and write**. Tiene que
tener acceso a los dos repositorios (ver «Puesta en marcha»). La llave cifrada de `config.json` › `edicion` ›
`cifrada` es la misma que la del calendario (con la misma contraseña): **si se cambia la contraseña en el calendario,
hay que cambiarla aquí también** (cada publicación lo comprueba y, si no coinciden, avisa en **Actions**). Mientras no
coincidan, la página de la liga no usa ni pisa la llave guardada con la otra contraseña.

Con la llave se pueden poner o borrar resultados de cualquier partido (también de partidos por jugar: lo de «de hoy
hacia atrás» solo lo limita la página) y lanzar o parar las tareas de este repositorio; no se puede tocar el código ni
los archivos. Lo que se ha cambiado y cuándo está en el historial de `liga/resultados-*.json` (siempre a nombre del
bot): de ahí se puede recuperar.

## Puesta en marcha (una vez)

1. El repositorio `albovy/liga-dompinas` es **público** (con GitHub gratis, Pages no funciona en uno privado; la web es
   pública de todas formas).
2. **Settings** › **Pages** › **Build and deployment** › **Source: GitHub Actions** (no «Deploy from a branch»).
3. **Actions** › **Publicar la liga** › **Run workflow** (activar Pages no publica nada por sí solo), y abrir
   https://albovy.github.io/liga-dompinas/ antes de pasar el enlace.
4. **La llave**: en GitHub, foto de perfil › **Settings** › **Developer settings** › **Personal access tokens** ›
   **Fine-grained tokens** › la llave del calendario › **Edit** › **Repository access** › añadir `liga-dompinas` ›
   **Update**. Sin esto, «Guardar» da un error 404 («GitHub no encuentra la tarea de la liga»).

## Cómo funciona

- `liga/dompinas-1.json`: la liga (equipos, categorías, calendario, normas), sacada del Excel del club «Liga Dompiñas
  I.xlsx». `config.json` › `liga` › `archivo` dice cuál se publica: para la Liga II, otro archivo en `liga/` y se cambia
  ahí.
- `src/liga.js`: los puntos, la clasificación, los cruces y guardar un resultado (por consola, desde `resultado.yml`).
- `src/generar.js` hace la página (`src/pagina.js` con la plantilla `src/plantilla.html`) y `publicar.yml` la publica en
  GitHub Pages. Si la liga o sus resultados no se pueden leer, no publica nada: se queda la última página buena (y
  GitHub avisa de la tarea fallida).
- Diseño: `docs/diseno.md`.

Para hacer cambios (con [Node.js](https://nodejs.org/) 20 o posterior, sin dependencias):

- **Probar:** `npm test` (no necesita internet).
- **Generar en local:** `node src/generar.js` (deja la página en `web/index.html`).
