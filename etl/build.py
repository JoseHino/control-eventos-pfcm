# -*- coding: utf-8 -*-
"""Ensambla web/index.html.

La pagina NO lleva datos dentro: los pide a Supabase despues de iniciar sesion.
Aqui solo se incrusta el codigo, las librerias y la configuracion publica.

    python etl/build.py
"""
import io, os, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from entorno import cargar_env

RAIZ = os.path.dirname(AQUI)
DESTINO = os.path.join(RAIZ, 'web', 'index.html')

leer = lambda *p: io.open(os.path.join(AQUI, *p), encoding='utf-8').read()

env = cargar_env()

html = leer('part1.html')
js = leer('part2.js') + leer('part3.js') + leer('part4.js')

# Una cadena "</script" dentro de un <script> cerraria la etiqueta antes de tiempo.
proteger = lambda s: s.replace('</script', '<\\/script')

html = html.replace('/*__SHEETJS__*/', proteger(leer('vendor', 'xlsx.full.min.js')))
html = html.replace('/*__SUPABASE__*/', proteger(leer('vendor', 'supabase.js')))
# La clave publicable es publica por diseno: sin sesion, RLS devuelve cero filas.
html = html.replace('__SUPABASE_URL__', env['SUPABASE_URL'])
html = html.replace('__SUPABASE_KEY__', env['SUPABASE_ANON_KEY'])
html += proteger(js) + '\n</script>\n</body>\n</html>\n'

for marcador in ('/*__SHEETJS__*/', '/*__SUPABASE__*/', '__SUPABASE_URL__', '__SUPABASE_KEY__'):
    assert marcador not in html, 'marcador sin sustituir: ' + marcador
assert 'service_role' not in html, 'la clave service_role no debe aparecer nunca en la pagina'

os.makedirs(os.path.dirname(DESTINO), exist_ok=True)
io.open(DESTINO, 'w', encoding='utf-8', newline='\n').write(html)
print('escrito:', DESTINO, os.path.getsize(DESTINO), 'bytes')
