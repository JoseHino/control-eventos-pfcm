# -*- coding: utf-8 -*-
"""Sube etl/eventos.json a Supabase mediante la API REST (PostgREST).

Se autentica como usuario del equipo de AMMA: la politica RLS de escritura exige
rol 'amma', asi que no hace falta guardar en el equipo la clave service_role. Si
esas credenciales se comprometen, basta con cambiar la contrasena del usuario.

Uso:  python etl/subir.py
"""
import io, json, os, re, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from entorno import cargar_env, pedir, entrar

ENTRADA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "eventos.json")
SLUG = "pfcm"
LOTE = 400


def si_no(v, cierto):
    return None if v is None else (str(v).strip().upper() == cierto)


def main():
    datos = json.load(io.open(ENTRADA, encoding="utf-8"))
    if not datos:
        # Nunca vaciar el destino por una lectura fallida.
        sys.exit("ERROR: %s esta vacio. No se toca la base de datos." % ENTRADA)
    print("registros en el fichero:", len(datos))

    env = cargar_env()
    URL = env["SUPABASE_URL"]
    cab = entrar(env)
    print("autenticado como", env["AMMA_EMAIL"])

    cliente = pedir(URL + "/rest/v1/clientes?slug=eq." + SLUG + "&select=id,nombre", cab)
    if not cliente:
        sys.exit("No existe el cliente '%s' (o no hay permiso para verlo)." % SLUG)
    cid, nombre = cliente[0]["id"], cliente[0]["nombre"]
    print("cliente:", nombre)

    filas = [{
        "cliente_id": cid,
        "codigo": d.get("CODIGO"),
        "titulo": d.get("TITULO"),
        "fecha_inicio": d.get("FECHA_INICIO"),
        "fecha_fin": d.get("FECHA_FIN"),
        "tipo": d.get("TIPO"),
        "modalidad": d.get("MODALIDAD"),
        "tipologia": d.get("TIPO1"),
        "caracter": d.get("CARACTER"),
        "delegacion": d.get("DELEGACION"),
        "facturable": si_no(d.get("FACTURABLE"), "F"),
        "asistentes": d.get("ASISTENTES"),
        "anulado": bool(d.get("ANULADO") and str(d["ANULADO"]).upper().startswith("S")),
        "facturacion": d.get("FACT_TOTAL"),
        "conflicto": d.get("CONFLICTO"),
        "origen": d.get("ORIGEN"),
    } for d in datos if d.get("FECHA_INICIO")]

    print("filas validas (con fecha de inicio):", len(filas))
    if not filas:
        sys.exit("ERROR: ninguna fila con fecha. No se toca la base de datos.")

    escribir = dict(cab, **{"Prefer": "return=minimal"})
    # Se borra solo despues de saber que hay datos que poner en su lugar.
    pedir(URL + "/rest/v1/eventos?cliente_id=eq." + cid, escribir, metodo="DELETE")
    print("tabla vaciada para este cliente")

    for i in range(0, len(filas), LOTE):
        pedir(URL + "/rest/v1/eventos", escribir, filas[i:i + LOTE])
        print("  subidas %d/%d" % (min(i + LOTE, len(filas)), len(filas)))

    # Fecha de los datos = la del libro mas reciente, no la de la subida.
    sellos = [m.group(1) for m in
              (re.search(r"\((\d{6})\)", d.get("ORIGEN") or "") for d in datos) if m]
    if sellos:
        s = max(sellos)
        fecha = "20%s-%s-%s" % (s[0:2], s[2:4], s[4:6])
        pedir(URL + "/rest/v1/clientes?id=eq." + cid, escribir,
              {"actualizado_en": fecha + "T00:00:00Z"}, metodo="PATCH")
        print("fecha de los datos:", fecha)
    print("listo.")


if __name__ == "__main__":
    main()
