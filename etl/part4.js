
/* =========================================================================
   LECTURA DEL LIBRO EXCEL
   Se busca la hoja BD, se localiza la fila de cabecera y se mapean las
   columnas por nombre (sin acentos ni signos) para tolerar erratas.
   ========================================================================= */
function normCab(s){
  return String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}
const MAPA = {
  CODIGO:"c", TITULO:"t", FECHAINICIO:"i", FECHAFIN:"f", TIPO:"tp", MODALIDAD:"m",
  TIPO1:"g", CARACTER:"ca", DELEGACION:"d", FACTURABLE:"fb", ASISTENTES:"a", ANULADO:"an",
  FACTURACIONTOTAL:"imp", ORGANIZADOR:"org"
};
function isoDe(v){
  if(v === null || v === undefined || v === "") return null;
  if(v instanceof Date && !isNaN(v)){
    return new Date(v.getTime() - v.getTimezoneOffset()*60000).toISOString().slice(0,10);
  }
  if(typeof v === "number"){                       /* serie de fecha de Excel */
    const d = new Date(Date.UTC(1899, 11, 30) + v*86400000);
    return isNaN(d) ? null : d.toISOString().slice(0,10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(m){
    const y = m[3].length === 2 ? "20"+m[3] : m[3];
    return y + "-" + m[2].padStart(2,"0") + "-" + m[1].padStart(2,"0");
  }
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  return null;
}
function txt(v){
  if(v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g," ").trim();
  return (!s || s === "---" || s === "-") ? null : s;
}
function numero(v){
  if(typeof v === "number" && isFinite(v)) return v;
  if(typeof v === "string"){
    const s = v.replace(/\./g,"").replace(",",".").replace(/[^\d.\-]/g,"");
    if(s && !isNaN(+s)) return +s;
  }
  return null;
}

function leerLibro(buf){
  const wb = XLSX.read(buf, {type:"array", cellDates:true});
  const nom = wb.SheetNames.find(n => normCab(n) === "BD") || wb.SheetNames[0];
  const hoja = wb.Sheets[nom];

  /* El rango usado que declara Excel puede llegar a la columna XFD por un simple
     formato aplicado a filas vacias: son millones de celdas y el navegador se
     queda colgado. La tabla real tiene 17 columnas, asi que se acota a 40. */
  let rango = null;
  if(hoja["!ref"]){
    rango = XLSX.utils.decode_range(hoja["!ref"]);
    rango.e.c = Math.min(rango.e.c, 39);
    rango.e.r = Math.min(rango.e.r, 50000);
  }
  /* raw:true + cellDates:true -> las fechas llegan como Date, no como texto
     formateado en m/d/yy, que se leia al reves (7 de enero como 1 de julio). */
  const aoa = XLSX.utils.sheet_to_json(hoja,
    Object.assign({header:1, raw:true, cellDates:true, defval:null}, rango ? {range:rango} : {}));

  /* localizar la fila de cabecera: la que contenga CODIGO y TITULO */
  let hi = -1;
  for(let i = 0; i < Math.min(15, aoa.length); i++){
    const f = (aoa[i] || []).map(normCab);
    if(f.indexOf("CODIGO") !== -1 && f.indexOf("TITULO") !== -1){ hi = i; break; }
  }
  if(hi === -1) throw new Error("No se encuentra la fila de cabecera (CÓDIGO / TÍTULO) en la hoja " + nom + ".");

  const cab = (aoa[hi] || []).map(normCab);
  const idx = {};
  cab.forEach((c,j) => { if(MAPA[c] !== undefined && idx[MAPA[c]] === undefined) idx[MAPA[c]] = j; });
  if(idx.c === undefined || idx.i === undefined)
    throw new Error("La hoja " + nom + " no tiene las columnas CÓDIGO y FECHA_INICIO.");

  const out = [];
  for(let i = hi + 1; i < aoa.length; i++){
    const f = aoa[i] || [];
    const cod = txt(f[idx.c]), tit = txt(f[idx.t]);
    if(!cod && !tit) continue;
    const r = {
      c: cod, t: tit,
      i: isoDe(f[idx.i]), f: isoDe(f[idx.f]),
      tp: txt(f[idx.tp]), m: txt(f[idx.m]), g: txt(f[idx.g]), ca: txt(f[idx.ca]),
      d: txt(f[idx.d]), fb: txt(f[idx.fb]),
      a: numero(f[idx.a]),
      an: /^S/i.test(String(f[idx.an] || "")) ? 1 : 0,
      imp: numero(f[idx.imp])
    };
    Object.keys(r).forEach(k => { if(r[k] === null) delete r[k]; });
    if(!r.i) continue;                       /* sin fecha no entra en ninguna serie */
    out.push(r);
  }
  if(!out.length) throw new Error("La hoja " + nom + " no contiene filas de datos legibles.");
  return {rows: out, hoja: nom};
}

/* Fusion por codigo de expediente: lo importado manda, lo anterior se conserva.
   Asi la historia sobrevive al reinicio anual del libro. */
function fusionar(nuevos){
  const idx = new Map();
  S.rows.forEach((r,k) => { if(r.c) idx.set(r.c, k); });
  let alta = 0, act = 0;
  nuevos.forEach(n => {
    if(n.c && idx.has(n.c)){
      const k = idx.get(n.c), viejo = S.rows[k];
      const cambios = ["t","i","f","tp","g","ca","d","fb","a","an"].filter(f => (viejo[f]||null) !== (n[f]||null));
      if(cambios.length) act++;
      S.rows[k] = n;
    } else { S.rows.push(n); alta++; }
  });
  return {alta, act, conservados: S.rows.length - alta - act};
}

function importar(file){
  if(!S.esAmma){ toast("Solo el equipo de AMMA puede actualizar los datos."); return; }
  const fr = new FileReader();
  fr.onload = async e => {
    try{
      const {rows, hoja} = leerLibro(new Uint8Array(e.target.result));
      const res = fusionar(rows);
      S.snapshot = new Date(file.lastModified).toISOString().slice(0,10);
      S.origen = file.name;
      toast("Hoja «" + hoja + "»: " + nf(rows.length) + " filas · " + nf(res.alta) +
            " altas, " + nf(res.act) + " actualizados. Guardando…");
      await guardarEnServidor();
      pintarTodo();
      toast("Guardado: " + nf(S.rows.length) + " eventos. Ya lo ve todo el equipo.");
    }catch(err){
      toast("No se ha podido guardar: " + err.message);
    }
  };
  fr.onerror = () => toast("No se ha podido abrir el fichero.");
  fr.readAsArrayBuffer(file);
}

/* ---------- Exportación ---------- */
function exportar(){
  const rows = filtrar(S.rows).slice().sort((a,b) => (a.i||"").localeCompare(b.i||""));
  const hojaEv = rows.map(r => ({
    "CÓDIGO": r.c || "", "TÍTULO": r.t || "",
    "FECHA_INICIO": r.i || "", "FECHA_FIN": r.f || "",
    "AÑO": anio(r) || "", "MES": mes(r) !== null ? MESES_L[mes(r)] : "",
    "TIPO": r.tp || "", "MODALIDAD": r.m || "", "TIPOLOGÍA": grupoDe(r.g).n,
    "CARÁCTER": r.ca || "", "DELEGACIÓN": r.d || "",
    "FACTURABLE": r.fb === "F" ? "Sí" : "No",
    "ASISTENTES": typeof r.a === "number" ? r.a : "",
    "ANULADO": r.an ? "Sí" : "No",
    "CONFLICTO_ENTRE_LIBROS": r.x ? r.x.join(", ") : ""
  }));
  const A = avisos();
  const hojaAv = [];
  A.forEach(a => a.items.forEach(i => hojaAv.push({
    "GRAVEDAD": {crit:"Crítico", serious:"Importante", warn:"Aviso", info:"Información", good:"Cartera"}[a.sev],
    "AVISO": a.ttl,
    "DETALLE": String(i).replace(/<[^>]+>/g, "")
  })));
  const ys = porAnio(S.rows.filter(r => !r.an));
  const hojaRes = ys.map(a => ({
    "AÑO": a.y, "EVENTOS": a.s.n, "ASISTENTES": a.s.asist,
    "MEDIA_ASISTENTES": a.s.media ? Math.round(a.s.media) : "",
    "FACTURABLES": a.s.fact, "%_FACTURABLE": a.s.pctFact ? +a.s.pctFact.toFixed(1) : 0,
    "DÍAS_ACTIVIDAD": a.s.dias
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaRes), "Resumen anual");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaEv), "Eventos");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaAv.length ? hojaAv : [{AVISO:"Sin avisos"}]), "Avisos");
  XLSX.writeFile(wb, "PFCM_Control_Eventos_" + hoyISO() + ".xlsx");
  toast("Exportado: " + nf(rows.length) + " eventos, " + nf(hojaAv.length) + " líneas de aviso.");
}

/* =========================================================================
   INTERFAZ
   ========================================================================= */
function toast(msg){
  const t = $("#toast");
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 5200);
}

function opciones(sel, items, todo){
  const v = sel.value;
  sel.innerHTML = '<option value="">' + todo + '</option>' +
    items.map(i => '<option value="' + esc(i.v) + '">' + esc(i.n) + '</option>').join("");
  if(items.some(i => String(i.v) === v)) sel.value = v;
}
function poblarFiltros(){
  const anios = Array.from(new Set(S.rows.map(anio).filter(Boolean))).sort((a,b) => b-a);
  opciones($("#fAno"), anios.map(y => ({v:y, n:y})), "Todos");
  opciones($("#fGrupo"), GRUPOS.map(g => ({v:g.k, n:g.n})), "Todas");
  opciones($("#fCar"), CARACTERES.map(c => ({v:c.k, n:c.n})), "Todos");
  const dels = Array.from(new Set(S.rows.map(r => r.d).filter(Boolean))).sort((a,b) => a.localeCompare(b,"es"));
  opciones($("#fDel"), dels.map(d => ({v:d, n:d})).concat([{v:"(sin delegación)", n:"(sin delegación)"}]), "Todas");
  opciones($("#fFact"), [{v:"F", n:"Sí, facturable"}, {v:"NF", n:"No facturable"}], "Todos");
}

function contadores(){
  const rows = filtrar(S.rows);
  $("#fcount").innerHTML = "<b>" + nf(rows.length) + "</b> de " + nf(S.rows.length) + " eventos";
  const A = avisos();
  const graves = A.filter(a => a.sev !== "good" && a.sev !== "info").length;
  const bn = $("#nAlerts");
  bn.textContent = graves;
  bn.className = "badge" + (A.some(a => a.sev === "crit" || a.sev === "serious") ? "" : " mut");
  const hoy = hoyISO();
  $("#nCart").textContent = S.rows.filter(r => !r.an && r.i > hoy).length;
}
function pintarTodo(){
  poblarFiltros();
  const desfase = diasEntre(S.snapshot, hoyISO());
  $("#stamp").innerHTML = "Datos a <b>" + fecha(S.snapshot) + "</b>" +
    (desfase > UMBRAL.datosViejosDias ? " · <b style='color:#ffd7d7'>" + nf(desfase) + " días de antigüedad</b>" : "") +
    "<br>" + nf(S.rows.length) + " eventos · " + esc(S.usuario) +
    (S.esAmma ? "" : " (solo lectura)");
  /* Escribir exige rol amma en la politica del servidor: si no lo tiene,
     el boton sobra. La barrera de verdad esta en la base de datos. */
  $("#btnLoad").hidden = !S.esAmma;
  contadores();
  Object.keys(PINTADO).forEach(k => delete PINTADO[k]);
  pintar(S.tab);
}
/* Los avisos y la cartera no dependen del filtro: no hace falta rehacerlos. */
function repintarVistas(){
  contadores();
  invalidar(["panel", "analisis", "eventos"]);
}


/* Ancho de vineta para las tarjetas a ancho completo. Las tarjetas en rejilla
   de dos columnas usan el valor por defecto (720). */
const ANCHO = 1180;

/* Devuelve las filas del filtro actual pero SIN aplicar la casilla de anulados
   (y, si se pide, sustituyendo algun campo del filtro). resumen() ya distingue
   celebrados de anulados, asi que los KPI deben partir del conjunto completo. */
function conAnulados(sobre){
  const prev = S.f;
  S.f = Object.assign({}, prev, sobre || {}, {anul:true});
  try { return filtrar(S.rows); } finally { S.f = prev; }
}

/* Pintado perezoso: solo se dibuja la pestana visible. Con 1.200 registros y
   cinco paneles, redibujarlo todo en cada cambio de filtro bloqueaba la pagina. */
const PINTADO = {};
const PINTORES = {panel:renderPanel, avisos:renderAvisos, analisis:renderAnalisis,
                  cartera:renderCartera, eventos:renderEventos};
function pintar(tab){
  if(PINTADO[tab]) return;
  PINTORES[tab]();
  PINTADO[tab] = true;
}
function invalidar(tabs){
  tabs.forEach(t => delete PINTADO[t]);
  pintar(S.tab);
}

/* ---------- Tooltip delegado ---------- */
(function(){
  const t = $("#tip");
  document.addEventListener("mouseover", e => {
    const el = e.target.closest ? e.target.closest("[data-tip]") : null;
    if(!el) return;
    t.innerHTML = el.getAttribute("data-tip");
    t.classList.add("on");
  });
  document.addEventListener("mousemove", e => {
    if(!t.classList.contains("on")) return;
    const r = t.getBoundingClientRect();
    let x = e.clientX + 15, y = e.clientY + 15;
    if(x + r.width > innerWidth - 10) x = e.clientX - r.width - 15;
    if(y + r.height > innerHeight - 10) y = e.clientY - r.height - 15;
    t.style.left = Math.max(6, x) + "px"; t.style.top = Math.max(6, y) + "px";
  });
  document.addEventListener("mouseout", e => {
    const el = e.target.closest ? e.target.closest("[data-tip]") : null;
    if(el) t.classList.remove("on");
  });
})();

/* ---------- Cableado ---------- */
$$(".tab").forEach(b => b.addEventListener("click", () => {
  $$(".tab").forEach(x => x.setAttribute("aria-selected", String(x === b)));
  $$(".panel").forEach(p => p.hidden = true);
  S.tab = b.dataset.p;
  pintar(S.tab);
  $("#p-" + S.tab).hidden = false;
  window.scrollTo({top:0, behavior:"smooth"});
}));

[["fAno","ano"],["fGrupo","grupo"],["fCar","car"],["fDel","del"],["fFact","fact"]].forEach(([id,k]) => {
  $("#"+id).addEventListener("change", e => { S.f[k] = e.target.value; S.page = 0; repintarVistas(); });
});
let tq;
$("#fQ").addEventListener("input", e => {
  clearTimeout(tq);
  tq = setTimeout(() => { S.f.q = e.target.value; S.page = 0; repintarVistas(); }, 220);
});
$("#fAnul").addEventListener("change", e => { S.f.anul = e.target.checked; S.page = 0; repintarVistas(); });
$("#btnReset").addEventListener("click", () => {
  S.f = {ano:"", grupo:"", car:"", del:"", fact:"", q:"", anul:false};
  S.page = 0;
  ["fAno","fGrupo","fCar","fDel","fFact","fQ"].forEach(id => $("#"+id).value = "");
  $("#fAnul").checked = false;
  repintarVistas();
});

document.addEventListener("click", e => {
  const th = e.target.closest && e.target.closest("th[data-col]");
  if(th){
    const c = th.dataset.col;
    if(S.sort.col === c) S.sort.dir *= -1; else { S.sort.col = c; S.sort.dir = 1; }
    invalidar(["eventos", "cartera"]);
    return;
  }
  if(e.target.id === "pgPrev"){ S.page = Math.max(0, S.page - 1); renderEventos(); window.scrollTo({top:0}); }
  if(e.target.id === "pgNext"){ S.page++; renderEventos(); window.scrollTo({top:0}); }
});

$("#btnLoad").addEventListener("click", () => $("#fileIn").click());
$("#fileIn").addEventListener("change", e => { if(e.target.files[0]) importar(e.target.files[0]); e.target.value = ""; });
$("#btnExport").addEventListener("click", exportar);
$("#btnTheme").addEventListener("click", () => {
  const d = document.documentElement.getAttribute("data-theme") === "dark";
  document.documentElement.setAttribute("data-theme", d ? "light" : "dark");
  try{ localStorage.setItem("pfcm_tema", d ? "light" : "dark"); }catch(_){}
});

/* Arrastrar y soltar el libro sobre la página */
let dragN = 0;
addEventListener("dragenter", e => { e.preventDefault(); if(++dragN === 1) $("#drop").classList.add("on"); });
addEventListener("dragleave", e => { e.preventDefault(); if(--dragN <= 0){ dragN = 0; $("#drop").classList.remove("on"); } });
addEventListener("dragover", e => e.preventDefault());
addEventListener("drop", e => {
  e.preventDefault(); dragN = 0; $("#drop").classList.remove("on");
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if(f) importar(f);
});

$("#btnSalir").addEventListener("click", async () => {
  await sb.auth.signOut();
  location.reload();
});

/* ---------- Cambio de contraseña ----------
   Actua sobre la cuenta que tiene la sesion abierta, nunca sobre otra: es
   supabase-js quien la cambia con el token de esa sesion. */
function abrirPass(){
  $("#passQuien").textContent = "Cuenta: " + S.usuario;
  $("#pw1").value = ""; $("#pw2").value = "";
  const err = $("#pwError"); err.hidden = true; err.classList.remove("ok");
  $("#pwBtn").disabled = false; $("#pwBtn").textContent = "Guardar";
  $("#modalPass").hidden = false;
  $("#pw1").focus();
}
function cerrarPass(){ $("#modalPass").hidden = true; }

$("#btnPass").addEventListener("click", abrirPass);
$("#pwCancelar").addEventListener("click", cerrarPass);
$("#modalPass").addEventListener("mousedown", e => { if(e.target.id === "modalPass") cerrarPass(); });
document.addEventListener("keydown", e => {
  if(e.key === "Escape" && !$("#modalPass").hidden) cerrarPass();
});

$("#passForm").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("#pwError"), btn = $("#pwBtn");
  const a = $("#pw1").value, b = $("#pw2").value;
  const fallo = m => { err.textContent = m; err.classList.remove("ok"); err.hidden = false; };

  if(a.length < 8) return fallo("La contraseña debe tener al menos 8 caracteres.");
  if(a !== b){ $("#pw2").select(); return fallo("Las dos contraseñas no coinciden."); }

  btn.disabled = true; btn.textContent = "Guardando…"; err.hidden = true;
  const { error } = await sb.auth.updateUser({ password: a });
  if(error){
    btn.disabled = false; btn.textContent = "Guardar";
    return fallo(/should be different/i.test(error.message)
      ? "Esa es la contraseña que ya tenías. Elige otra."
      : "No se ha podido cambiar: " + error.message);
  }
  err.textContent = "Contraseña actualizada. Acuérdate de poner la nueva en el .env de los procesos que suben datos.";
  err.classList.add("ok"); err.hidden = false;
  btn.textContent = "Hecho";
  $("#pw1").value = ""; $("#pw2").value = "";
  setTimeout(cerrarPass, 4200);
  toast("Contraseña cambiada para " + S.usuario);
});

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("#lgBtn"), err = $("#lgError");
  btn.disabled = true; btn.textContent = "Entrando…"; err.hidden = true;
  const { error } = await sb.auth.signInWithPassword({
    email: $("#lgEmail").value.trim(), password: $("#lgPass").value
  });
  if(error){
    err.textContent = /invalid/i.test(error.message)
      ? "Correo o contraseña incorrectos."
      : "No se ha podido entrar: " + error.message;
    err.hidden = false;
    btn.disabled = false; btn.textContent = "Entrar";
    $("#lgPass").select();
    return;
  }
  await arrancar();
});

/* ---------- Arranque ---------- */
try{
  const tm = localStorage.getItem("pfcm_tema");
  if(tm) document.documentElement.setAttribute("data-theme", tm);
}catch(_){}

async function arrancar(){
  $("#puerta").hidden = true;
  $("#cargando").hidden = false;
  try{
    await cargarDeServidor();
    pintarTodo();
  }catch(e){
    $("#cargando").hidden = true;
    $("#puerta").hidden = false;
    const err = $("#lgError");
    err.textContent = "Sesión iniciada, pero no se han podido leer los datos: " + e.message;
    err.hidden = false;
    return;
  }
  $("#cargando").hidden = true;
}

/* Al abrir: si ya hay sesion guardada se entra directo; si no, se pide acceso. */
(async function inicio(){
  const { data: { session } } = await sb.auth.getSession();
  if(session) await arrancar();
  else { $("#puerta").hidden = false; $("#lgEmail").focus(); }
})();
