# Control de Eventos · Palacio de Ferias y Congresos de Marbella

Cuadro de mando, análisis y avisos sobre los libros `Control_Eventos` de PFCM.
Una sola página HTML autónoma: sin servidor, sin instalación y sin conexión.
SheetJS va embebido, las gráficas son SVG propio y no hay ninguna dependencia externa.

**REPOSITORIO PRIVADO.** Contiene datos de eventos del Ayuntamiento de Marbella
(1.232 registros con título, fechas, delegación organizadora y aforo). No hacerlo
público sin autorización de PFCM.

## Estructura

```
web/index.html     lo único que se despliega (1,3 MB, todo dentro)
etl/extraer.py     consolida los .xlsm de C:\AMMA\Clientes\PFCM\IA  -> eventos.json
etl/compact.py     reduce a la forma que consume la página          -> eventos_min.json
etl/build.py       ensambla part1..part4 + SheetJS + datos          -> web/index.html
etl/part1.html     armazón y estilos
etl/part2.js       dominio, agregaciones y motor de gráficas
etl/part3.js       motor de avisos y render de paneles
etl/part4.js       lectura de Excel, exportación e interfaz
etl/vendor/        SheetJS 0.18.5 (fijado, para que el build sea reproducible)
```

## Reconstruir

```bash
python etl/extraer.py && python etl/compact.py && python etl/build.py
```

Los libros se localizan **por patrón** (`*.xlsm`), nunca por nombre exacto: OneDrive
los renombra solo. Se ordenan por el sello de fecha del nombre —`(260105)`— y **gana
el más reciente**; los campos que difieren quedan marcados en `CONFLICTO`. Si no se
encuentra ningún libro, el proceso aborta sin escribir, para no vaciar el destino.

## Uso diario

No hace falta reconstruir nada para actualizar datos: se abre `index.html` y se
**arrastra encima el `.xlsm` nuevo**. La fusión es por código de expediente —lo
importado manda, lo anterior se conserva—, que es lo que permite que la historia
sobreviva al reinicio bienal del libro. Si algún día se cargan varios libros
seguidos, **el más reciente va el último**.

El proceso `etl/` solo se toca para cambiar los datos de arranque o el código.

## Notas del origen

- Las columnas `FACTURACIÓN_ESPACIO`, `_SERVICIOS` y `_TOTAL` están rellenas con
  guiones en los 1.232 registros: no hay importes. Todo el bloque económico del
  libro (y las filas `FACTURACIÓN` de las hojas `TablaAAAA`) da cero. En cuanto PFCM
  los rellene, la página los recoge sin cambiar nada.
- La hoja `BD` del libro 2026 declara rango usado hasta la columna **XFD**. Leerla
  entera son 6,5 millones de celdas y cuelga el navegador: el lector la acota a 40
  columnas.
- Las fechas se leen como objetos `Date` (`raw:true` + `cellDates:true`). Con
  `raw:false` SheetJS las entrega formateadas en m/d/yy y el 7 de enero se convertía
  en 1 de julio.

Los umbrales de los avisos están agrupados en la constante `UMBRAL`, al principio de
`etl/part2.js`.
