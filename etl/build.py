# -*- coding: utf-8 -*-
"""Reconstruye web/index.html a partir de los libros Excel de PFCM.

    python etl/extraer.py     (lee C:\\AMMA\\Clientes\\PFCM\\IA\\*.xlsm)
    python etl/compact.py
    python etl/build.py

Deja el fichero unico en web/index.html, listo para desplegar.
"""
import io, os, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
DESTINO = os.path.join(RAIZ, 'web', 'index.html')

# Fecha del libro mas reciente incorporado a los datos de arranque.
SNAPSHOT = '2026-10-28'

leer = lambda *p: io.open(os.path.join(AQUI, *p), encoding='utf-8').read()

html = leer('part1.html')
js = leer('part2.js') + leer('part3.js') + leer('part4.js')
sheetjs = leer('vendor', 'xlsx.full.min.js')
datos = leer('eventos_min.json')

# Una cadena "</script" dentro de un <script> cerraria la etiqueta antes de tiempo.
proteger = lambda s: s.replace('</script', '<\\/script')

html = html.replace('/*__SHEETJS__*/', proteger(sheetjs))
html = html.replace('/*__DATA__*/', proteger(datos))
html = html.replace('__SNAPSHOT__', SNAPSHOT)
html += proteger(js) + '\n</script>\n</body>\n</html>\n'

for marcador in ('/*__SHEETJS__*/', '/*__DATA__*/', '__SNAPSHOT__'):
    assert marcador not in html, 'marcador sin sustituir: ' + marcador

os.makedirs(os.path.dirname(DESTINO), exist_ok=True)
io.open(DESTINO, 'w', encoding='utf-8', newline='\n').write(html)
print('escrito:', DESTINO, os.path.getsize(DESTINO), 'bytes')
