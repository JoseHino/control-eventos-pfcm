# -*- coding: utf-8 -*-
"""Comprueba que la barrera de seguridad hace lo que dice.

Sin sesion no se debe ver ni una fila; autenticado como AMMA, todas.
No imprime ninguna credencial.

Uso:  python etl/verificar_rls.py
"""
import io, os, sys, urllib.error, urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from entorno import cargar_env, entrar

TABLAS = ("eventos", "clientes", "indicadores", "mediciones")


def visibles(url, cabeceras, tabla):
    pet = urllib.request.Request(
        url + "/rest/v1/" + tabla + "?select=*",
        headers=dict(cabeceras, **{"Prefer": "count=exact", "Range": "0-0"}))
    try:
        with urllib.request.urlopen(pet) as r:
            return r.headers.get("Content-Range", "*/0").split("/")[-1]
    except urllib.error.HTTPError:
        return "0"


def main():
    env = cargar_env()
    url = env["SUPABASE_URL"]
    anon = {"apikey": env["SUPABASE_ANON_KEY"]}
    amma = entrar(env)

    print("Filas visibles en cada tabla\n")
    print("  %-14s %14s %14s" % ("tabla", "SIN sesion", "como AMMA"))
    print("  " + "-" * 44)
    fallos = []
    for t in TABLAS:
        sin, con = visibles(url, anon, t), visibles(url, amma, t)
        print("  %-14s %14s %14s" % (t, sin, con))
        if sin != "0":
            fallos.append(t)

    print()
    if fallos:
        print("FALLO: sin sesion se ven datos de:", ", ".join(fallos), "- NO desplegar.")
        sys.exit(1)
    print("CORRECTO: un visitante sin sesion no ve ni una fila de ninguna tabla.")


if __name__ == "__main__":
    main()
