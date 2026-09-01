# -*- coding: utf-8 -*-
"""Lectura del .env y llamadas a la API REST de Supabase.

Compartido por subir.py y verificar_rls.py. Ninguna credencial se imprime.
"""
import json, os, sys, urllib.error, urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = os.path.join(RAIZ, ".env")

CLAVES = ("SUPABASE_URL", "SUPABASE_ANON_KEY", "AMMA_EMAIL", "AMMA_PASSWORD")


def cargar_env():
    if not os.path.exists(ENV):
        sys.exit("No encuentro %s. Copia .env.ejemplo a .env y rellena las claves." % ENV)
    valores = {}
    # utf-8-sig: el Bloc de notas y PowerShell escriben el fichero con BOM
    with open(ENV, encoding="utf-8-sig") as f:
        for linea in f:
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            k, v = linea.split("=", 1)
            valores[k.strip()] = v.strip().strip('"').strip("'")
    for k in CLAVES:
        if not valores.get(k):
            sys.exit("Falta %s en el .env" % k)
    valores["SUPABASE_URL"] = valores["SUPABASE_URL"].rstrip("/")
    return valores


def pedir(url, cab, datos=None, metodo=None, crudo=False):
    cuerpo = json.dumps(datos).encode("utf-8") if datos is not None else None
    pet = urllib.request.Request(url, data=cuerpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(pet) as r:
            if crudo:
                return r
            texto = r.read().decode("utf-8")
            return json.loads(texto) if texto.strip() else None
    except urllib.error.HTTPError as e:
        sys.exit("HTTP %s en %s\n%s" % (e.code, url, e.read().decode("utf-8", "replace")))


def entrar(env):
    """Devuelve las cabeceras autenticadas como usuario con rol amma."""
    sesion = pedir(env["SUPABASE_URL"] + "/auth/v1/token?grant_type=password",
                   {"apikey": env["SUPABASE_ANON_KEY"], "Content-Type": "application/json"},
                   {"email": env["AMMA_EMAIL"], "password": env["AMMA_PASSWORD"]})
    return {"apikey": env["SUPABASE_ANON_KEY"],
            "Authorization": "Bearer " + sesion["access_token"],
            "Content-Type": "application/json"}
