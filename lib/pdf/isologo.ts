/**
 * El isologo de CAMPA, como path vectorial.
 *
 * ── Por qué el SVG y no el PNG ────────────────────────────────────────────
 *
 * El isologo existe en las dos formas. El PNG son 512×512 y 24 KB —y reducido a
 * 120 px seguía pesando 8,9 KB, porque `sips` no optimiza la paleta—, y meter
 * eso en el PDF lo habría llevado de 2 KB a más de 10.
 *
 * El SVG es **un solo path**, así que `drawSvgPath` lo dibuja como vector: pesa
 * lo que ocupa este texto, es nítido a cualquier tamaño y en una impresora sale
 * con el filo del papel, no con el de una imagen de 120 px.
 *
 * Sale de `public/brand/campa-isologo.svg`, `viewBox="0 0 640.157 640.157"`. Si
 * el isologo cambia, se vuelve a extraer el atributo `d` de ese archivo.
 *
 * Va como constante y no leyendo el archivo en tiempo de ejecución: `public/`
 * no viaja al bundle de una función serverless, así que un `readFile` andaría
 * en local y fallaría en Vercel — justo donde nadie lo estaría mirando. Y
 * además mantiene puro al generador: sin disco, sin rutas, sin entorno.
 */
export const ISOLOGO_PATH =
  'M320.076 587.452C172.412 587.452 52.707 467.743 52.707 320.08C52.707 172.413' +
  ' 172.412 52.705 320.076 52.705C467.745 52.705 587.45 172.413 587.45 320.08C5' +
  '87.45 467.743 467.745 587.452 320.076 587.452ZM320.076 0C143.306 0 0.002 143' +
  '.305 0.002 320.08C0.002 496.852 143.306 640.157 320.076 640.157C496.857 640.' +
  '157 640.155 496.852 640.155 320.08C640.155 143.305 496.857 0 320.076 0ZM312.' +
  '953 367.515L340.465 290.627C342.394 286.757 346.329 284.307 350.688 284.307C' +
  '355.253 284.307 359.311 286.972 361.141 291.112L399.282 401.247C399.599 402.' +
  '277 399.77 403.379 399.77 404.518C399.77 410.744 394.723 415.786 388.506 415' +
  '.786C386.899 415.786 385.352 415.449 383.976 414.823L318.1 381.244C314.63 37' +
  '9.332 312.276 375.634 312.276 371.389C312.276 370.036 312.506 368.724 312.95' +
  '3 367.515ZM466.258 428.05L411.864 271.21C401.782 246.075 377.782 229.827 350' +
  '.688 229.827C323.988 229.827 300.095 245.765 289.836 270.422L289.412 271.455' +
  'L262.559 347.095C261.83 348.861 260.13 350.127 258.1 350.127C257.383 350.127' +
  ' 256.706 349.968 256.095 349.692L220.377 331.447C198.812 319.442 184.189 296' +
  '.413 184.189 270.029C184.189 231.316 215.701 199.796 254.424 199.796L427.599' +
  ' 199.796L427.599 145.619L254.424 145.619C185.825 145.619 130.013 201.418 130' +
  '.013 270.029C130.013 318.366 157.719 360.352 198.083 380.945L238.507 401.588' +
  'L238.495 401.592C240.183 402.35 241.359 404.05 241.359 406.022C241.359 406.5' +
  '85 241.248 407.116 241.071 407.618L212.648 487.676L269.894 487.676L291.065 4' +
  '28.626L400.847 484.583C407.511 488.118 415.011 489.985 422.576 489.985C448.1' +
  '46 489.985 468.94 469.196 468.94 443.625C468.94 438.29 468.034 433.048 466.2' +
  '58 428.05Z'

/** El lado del `viewBox`, para calcular la escala. */
export const ISOLOGO_LADO = 640.157
