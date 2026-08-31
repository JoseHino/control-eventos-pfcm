# -*- coding: utf-8 -*-
"""Reduce eventos.json a la forma que consume la pagina.

Se descartan las columnas vacias en el origen (ORGANIZADOR y las tres de
FACTURACION) y las derivables (MES sale de FECHA_INICIO). Las claves cortas y el
borrado de nulos bajan el fichero de ~600 KB a ~370 KB, que van embebidos en el HTML.
"""
import io, json, os, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

AQUI = os.path.dirname(os.path.abspath(__file__))
ENTRADA = os.path.join(AQUI, 'eventos.json')
SALIDA = os.path.join(AQUI, 'eventos_min.json')

origen = json.load(io.open(ENTRADA, encoding='utf-8'))
salida = []
for r in origen:
    d = {
        "c": r["CODIGO"], "t": r["TITULO"], "i": r["FECHA_INICIO"], "f": r["FECHA_FIN"],
        "tp": r["TIPO"], "m": r["MODALIDAD"], "g": r["TIPO1"], "ca": r["CARACTER"],
        "d": r["DELEGACION"], "fb": r["FACTURABLE"], "a": r["ASISTENTES"],
        "an": 1 if (r["ANULADO"] or "").upper().startswith("S") else 0,
        "imp": r["FACT_TOTAL"],
        "x": r.get("CONFLICTO") or None,
    }
    salida.append({k: v for k, v in d.items() if v is not None})

io.open(SALIDA, 'w', encoding='utf-8', newline='\n').write(
    json.dumps(salida, ensure_ascii=False, separators=(',', ':')))
print("registros:", len(salida), "-", os.path.getsize(SALIDA), "bytes ->", SALIDA)
