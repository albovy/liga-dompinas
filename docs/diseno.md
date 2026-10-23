# Liga Dompiñas (2026-10-21)

## Qué

Una liga interna del club entre equipos del Dompa, mezclando categorías: Cadete 20h, Cadete Lagoas, Infantil
Lagoas, Infantil B, Infantil C y Alevín Remedios. Las jugadoras ven en una página los partidos, los resultados y
la clasificación. Los entrenadores meten los resultados desde esa página con el modo entrenador (la misma llave o
contraseña que en el calendario). La definición sale del Excel del club «Liga Dompiñas I.xlsx».

Hosting: una web aparte del calendario (el usuario la quiere separada, 23/10/2026), en su propio repositorio
(albovy/liga-dompinas) con GitHub Pages: https://albovy.github.io/liga-dompinas/. No en Vercel u otro sitio con base
de datos (el usuario lo descartó: los resultados se meten igual a mano, en un formulario de la página; solo se
ganaría que salgan al instante en vez de en 1 o 2 minutos, a cambio de cuentas y servicios que mantener). La liga es
entre equipos, sin nombres de jugadoras ni otros datos personales, así que no hace falta privacidad, y se aprovecha
el modo entrenador del calendario: la misma llave (con acceso a los dos repositorios) y la misma contraseña; como las
dos webs están en albovy.github.io, el navegador guarda la llave una vez para las dos (con el nombre del club), en el
mismo navegador (la app del calendario instalada en el iPhone no comparte lo guardado con Safari). La
página no se indexa (noindex). Publica sola, sin depender de la federación (el calendario sí).

## Reglas (confirmadas con el usuario)

- 12 jornadas, viernes alternos del 6/11/2026 al 23/4/2027, 3 partidos por jornada (17:00, 18:10, 19:20).
- Fase regular a doble vuelta: 30 partidos (P1–P30). Jornada 11: semifinales 1.º–4.º (P31) y 2.º–3.º (P32), y
  5.º–6.º por el 5.º puesto (P33). Jornada 12: confraternización 5.º–6.º (P34, amistoso), 3.er y 4.º puesto
  (P35, perdedores de las semifinales) y gran final (P36, ganadores).
- Partidos por tiempo: **siempre 3 sets**; cada set como mucho a 25 puntos (15 el 3.º), con punto de oro si se
  acaba el tiempo empatado. Así, cada set tiene un ganador y el partido acaba 3-0 o 2-1.
- Puntos de liga: cada set ganado vale 1, más 1 por cada categoría de diferencia si lo gana el equipo de categoría
  menor (Alevín 1 < Infantil 2 < Cadete 3). Por ejemplo, en un Cadete–Infantil que acaba 2-1, cada equipo suma 2.
- Los entrenadores meten los **puntos de cada set**.
- Clasificación, por puntos de liga; a igualdad, la **diferencia de tantos**; si siguen igualados, **partido de
  desempate** (Santi, 16/10). Acabada la fase regular, hasta que se juegue, la clasificación los marca con «=» y
  el aviso del partido de desempate (en orden alfabético), y sus cruces no se saben; a mitad de liga los empates
  no se marcan (no deciden nada). Su resultado se apunta a mano en `desempates` del archivo de la liga (lista de
  ids en el orden decidido), que deshace el empate.
- Playoffs: **partido único sin coeficiente** (Santi, 16/10): pasa quien gana más sets; la categoría no cuenta.
- Hasta que termine la fase regular, los cruces de playoffs se ven como «1.º clasificado», con el equipo que lo
  sería ahora entre paréntesis. Los de la final y el 3.er puesto, cuando haya resultado de su semifinal.

## Datos

- `liga/dompinas-1.json`: nombre, temporada, categorías (con nivel), equipos (id, nombre, categoría),
  `puntosMaxSet` [25, 25, 15], `desempates`, normas (texto) y partidos (id, jornada, fecha, hora, fin, local,
  visitante, fase, nombre, amistoso). Un rival de playoff es `{ puesto: n }`, `{ ganador: id }` o
  `{ perdedor: id }`.
- `liga/resultados-dompinas-1.json`: `{ "P1": { "sets": [[25, 18], [20, 22], [15, 12]], "local": "cad20",
  "visitante": "alerem", "cambiado": ISO } }` (local primero). Lo escribe el workflow, con los equipos que jugaron:
  si el cuadro cambia después (un resultado corregido, un desempate), el de un cruce que ya no es de esos equipos
  no cuenta y se avisa (en el registro y, a los entrenadores, en la página). Uno sin equipos (puesto a mano) vale
  para los que jueguen.
- Un partido de la fase regular con `"anulado": true` no se juega: no cuenta ni hace falta para acabar la fase
  regular. Los amistosos (`"amistoso": true`) tampoco cuentan.
- `resultado.yml` necesita los tantos o `borrar` (vacío es un error: lanzado a mano sin ellos, no borra nada), y
  la página le manda también los equipos que enseñaba (`local`, `visitante`).
- `config.json`: `club` (el mismo nombre que en el calendario), `liga` › `archivo`, `edicion` (`repo` y la llave
  cifrada) y `calendario` (la web del calendario: solo para comprobar al publicar que la contraseña es la misma;
  sin enlaces entre las dos webs, a petición del usuario).

## Cómo se hace

- `src/liga.js`: leer y validar la liga, puntos de un set y de un partido, clasificación con desempates, resolver
  los cruces de playoffs y la clasificación final, y validar y guardar un resultado (por consola desde el
  workflow: `PARTIDO`, `SETS`, `LOCAL`, `VISITANTE`; la liga, la de config.json o `LIGA`).
- `src/generar.js`: con `config.json`, hace `web/index.html` (`src/pagina.js` con la plantilla `src/plantilla.html`),
  con los datos ya calculados. Si la liga o sus resultados no se pueden leer, error: no se publica una liga vacía.
- `src/plantilla.html`: tres pestañas (Clasificación con el cuadro de playoffs, Partidos por jornada con resultado,
  sets y puntos, y Normas con lo que vale cada set), con el mismo diseño y colores que el calendario (no el rosa
  de Instagram). «Mi equipo» (chips): en Partidos, solo los suyos; en la clasificación, resaltado. Con la llave
  (modo entrenador, mismo localStorage que el calendario; se entra igual con la contraseña), «Poner resultado» o
  «Cambiar resultado» en cada partido con equipos ya conocidos: tres filas de tantos (local y visitante),
  validación (enteros, no empatados, como mucho 25 o 15) con quién gana y los puntos mientras se escribe,
  «Guardar» lanza `resultado.yml` (workflow_dispatch) y «Borrar resultado» (pide confirmación).
- `.github/workflows/resultado.yml`: como `salida.yml` del calendario (entradas por variables de entorno,
  concurrencia por partido, reintentos desde lo último guardado) y lanza `publicar.yml`, que genera y publica en
  Pages (la nueva cancela la anterior; también con cada cambio subido a main).

## Pruebas

- liga.js: puntos por set y partido (todas las combinaciones de categoría), validación de sets, clasificación y
  desempates (tantos; empate a desempatar con partido; `desempates`), cruces de playoffs provisionales y
  definitivos, ganador por sets (sin coeficiente),
  clasificación final, consola (guardar, borrar, entrada mala).
- generar: `index.html` con sus datos y el modo entrenador; errores sin página.
- Página: pestañas, partidos con resultado y puntos, clasificación, cuadro, editor de resultado (solo con la
  llave), petición a GitHub.
- Workflows: entradas, concurrencia, sin `${{ }}` en los `run:`.
