# Control de Eventos · Palacio de Ferias y Congresos de Marbella

Cuadro de mando, análisis y avisos sobre los libros `Control_Eventos` de PFCM.

**LIVE:** https://control-eventos-pfcm.pages.dev — acceso con correo y contraseña.

## Arquitectura

Mismo patrón que el observatorio privado de Finca Cortesín: **la página es pública
pero está vacía**; los datos los sirve Supabase y solo a usuarios autenticados.

```
Excel en C:\AMMA\Clientes\PFCM\IA
        │  etl/extraer.py     consolida los libros        -> etl/eventos.json
        │  etl/subir.py       sube autenticado como AMMA  -> Supabase
        ▼
   Supabase (RLS)  ──────>  web/index.html en Cloudflare Pages
```

- **Nunca se usa la clave `service_role`.** El ETL se autentica como usuario con
  rol `amma` y las políticas RLS le dan permiso. Credenciales en `.env`, fuera del repo.
- Las funciones `privado.es_amma()` y `privado.mi_cliente()` viven en el esquema
  `privado`, que PostgREST no publica: no quedan expuestas como endpoints `/rpc/`.
- La clave publicable sí va dentro de la página: sin sesión, el servidor devuelve
  cero filas. La seguridad está en la base de datos, no en el navegador.
- Multi-cliente: cada fila lleva `cliente_id`. AMMA lo ve todo; un usuario de
  cliente, solo lo suyo.

**Comprobado:** `python etl/verificar_rls.py` confirma que un visitante sin sesión
ve 0 filas en `eventos`, `clientes`, `indicadores` y `mediciones`.

## Estructura

```
web/index.html        lo único que se publica (1,1 MB, sin un solo dato dentro)
etl/extraer.py        consolida los .xlsm            -> eventos.json
etl/compact.py        (solo para la versión offline autónoma)
etl/subir.py          carga eventos.json en Supabase
etl/verificar_rls.py  comprueba la barrera de seguridad
etl/build.py          ensambla part1..part4 + librerías + configuración
etl/part1.html        armazón, estilos y pantalla de acceso
etl/part2.js          dominio, acceso a datos y motor de gráficas
etl/part3.js          motor de avisos y render de paneles
etl/part4.js          lectura de Excel, exportación e interfaz
etl/vendor/           SheetJS 0.18.5 y supabase-js 2.58.0, fijados
```

## Operativa

**Actualizar datos** (lo habitual): entrar en la web y **arrastrar el `.xlsm` nuevo**.
Se fusiona por código de expediente —lo importado manda, lo anterior se conserva—,
se guarda en Supabase y lo ve todo el equipo. Solo con rol `amma`.

**Recargar desde cero** (si hace falta rehacer la base):
```bash
python etl/extraer.py && python etl/subir.py
```

**Republicar el sitio** (solo si cambia el código):
```bash
python etl/build.py
npx wrangler pages deploy web --project-name=control-eventos-pfcm --branch=main
```

Publicar el sitio ≠ actualizar datos: los datos van por Supabase.

## Cuidado con esto

- **El proyecto de Supabase se duerme** en plan gratuito tras ~7 días sin uso. Si
  PFCM entra una vez al mes, se la encontrará caída y hay que despertarla desde el
  panel de Supabase. Es el precio del plan gratuito.
- Los libros se localizan **por patrón glob**, nunca por nombre exacto: OneDrive los
  renombra solo. Se ordenan por el sello del nombre —`(260105)`— y gana el más
  reciente. Si no encuentra ninguno, aborta sin escribir.
- La fecha que se guarda en `clientes.actualizado_en` es la **del libro**, no la de
  la subida. Si se guardase la de la subida, el aviso de datos obsoletos no saltaría nunca.

## Notas del origen

- `FACTURACIÓN_ESPACIO`, `_SERVICIOS` y `_TOTAL` están rellenas con guiones en los
  1.232 registros: no hay importes. Todo el bloque económico da cero.
- La hoja `BD` del libro 2026 declara rango usado hasta la columna **XFD**: leerla
  entera son 6,5 millones de celdas y cuelga el navegador. El lector la acota a 40.
- Las fechas se leen como `Date` (`raw:true` + `cellDates:true`). Con `raw:false`
  SheetJS las entrega en m/d/yy y el 7 de enero se convertía en 1 de julio.

Los umbrales de los avisos están en la constante `UMBRAL`, al principio de `etl/part2.js`.
