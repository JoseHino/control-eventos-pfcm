# Control de Eventos · Palacio de Ferias y Congresos de Marbella

Cuadro de mando, análisis y avisos sobre los libros `Control_Eventos` de PFCM.

**LIVE:** https://josehino.github.io/control-eventos-pfcm/ — acceso libre, sin login.

## Arquitectura

Una sola página HTML autónoma, sin servidor ni base de datos: los 1.232 eventos
van **dentro** de la página. Se publica en GitHub Pages con una Action que sube
la carpeta `web/`.

```
Excel en C:\AMMA\Clientes\PFCM\IA y C:\AMMA\Clientes\PFCM\Ultimo
        │  etl/extraer.py   consolida los libros       -> etl/eventos.json
        │  etl/compact.py   claves cortas, sin vacíos  -> etl/eventos_min.json
        │  etl/build.py     incrusta datos y código     -> web/index.html
        ▼
   GitHub Pages (push a main)
```

Hasta octubre de 2026 los datos estaban en Supabase con login, pero compartían
proyecto con Finca Cortesín; se pasó a esta versión para no mezclar clientes.

## Estructura

```
web/index.html        lo único que se publica (1,3 MB, datos incluidos)
etl/extraer.py        consolida los .xlsm            -> eventos.json
etl/compact.py        reduce eventos.json            -> eventos_min.json
etl/build.py          ensambla part1..part4 + SheetJS + datos
etl/part1.html        armazón y estilos
etl/part2.js          dominio, datos de arranque y motor de gráficas
etl/part3.js          motor de avisos y render de paneles
etl/part4.js          lectura de Excel, exportación e interfaz
etl/vendor/           SheetJS 0.18.5, fijado
```

## Operativa

**Actualizar los datos publicados** (cuando llega un libro nuevo):
```bash
python etl/extraer.py && python etl/compact.py && python etl/build.py
git commit -am "Datos a <fecha del libro>" && git push
```
Antes, sube `SNAPSHOT` en `etl/build.py` a la fecha del libro más reciente.

**Arrastrar un `.xlsm` en la web** también funciona, pero solo para quien lo
arrastra: se fusiona por código de expediente y se guarda en el navegador
(`localStorage`). No cambia lo que ven los demás.

## Cuidado con esto

- La página es **pública**: cualquiera con el enlace ve todos los eventos.
- Los libros se localizan **por patrón glob**, nunca por nombre exacto: OneDrive los
  renombra solo. Se ordenan por el sello del nombre —`(260105)`— y gana el más
  reciente. Si no encuentra ninguno, aborta sin escribir.

## Notas del origen

- `FACTURACIÓN_ESPACIO`, `_SERVICIOS` y `_TOTAL` están rellenas con guiones en los
  1.232 registros: no hay importes. Todo el bloque económico da cero.
- La hoja `BD` del libro 2026 declara rango usado hasta la columna **XFD**: leerla
  entera son 6,5 millones de celdas y cuelga el navegador. El lector la acota a 40.
- Las fechas se leen como `Date` (`raw:true` + `cellDates:true`). Con `raw:false`
  SheetJS las entrega en m/d/yy y el 7 de enero se convertía en 1 de julio.

Los umbrales de los avisos están en la constante `UMBRAL`, al principio de `etl/part2.js`.
