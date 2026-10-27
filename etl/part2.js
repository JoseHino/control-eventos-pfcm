/* =========================================================================
   Control de Eventos PFCM - logica de aplicacion
   Fuente maestra: libro Excel "Control_Eventos". Esta pagina solo lee.
   ========================================================================= */
"use strict";

/* ---------- Constantes de dominio (Leyenda del libro) ---------- */
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const MESES_L = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

/* Orden fijo de series: el color sigue a la entidad, nunca al ranking */
const GRUPOS = [
  {k:"CONGRESOS Y CONVENCIONES", n:"Congresos y convenciones", c:"var(--s1)"},
  {k:"FERIAS", n:"Ferias", c:"var(--s2)"},
  {k:"JORNADAS Y REUNIONES", n:"Jornadas y reuniones", c:"var(--s3)"},
  {k:"EVENTOS DE CARÁCTER LÚDICO, MUSICAL, DEPORTIVO, CULTURAL, …", n:"Lúdicos, culturales y deportivos", c:"var(--s4)"},
  {k:"CURSOS, ASAMBLEAS, PEQUEÑAS REUNIONES Y OTROS EVENTOS", n:"Cursos, asambleas y otros", c:"var(--s5)"},
  {k:"EVENTOS BENÉFICOS", n:"Benéficos", c:"var(--s6)"}
];
const CARACTERES = [
  {k:"LOCAL", n:"Local", c:"var(--s1)"},
  {k:"REGIONAL", n:"Regional", c:"var(--s2)"},
  {k:"NACIONAL", n:"Nacional", c:"var(--s3)"},
  {k:"INTERNACIONAL", n:"Internacional", c:"var(--s4)"}
];
const MODALIDADES = {OE:"Otros eventos", FE:"Ferias y eventos", CO:"Congresos", FT:"Ferias temáticas"};
const TIPOS_OK = ["CONGRESO","CONVENCIÓN","JORNADA","FERIA","FESTIVAL","MUSICAL","LÚDICO","DEPORTIVO",
  "BENÉFICO","CURSO","ASAMBLEA","REUNIÓN","PRESENTACIÓN","EXAMEN","SELECCIÓN PERSONAL","OTRO"];
const DELEGACIONES_OK = ["Alcaldía","Comercio","Comunicación","Cultura-Enseñanza","Deportes",
  "Derechos Sociales-Igualdad","Distritos","Empleo","Extranjeros","Fiestas-Juventud","Hacienda","Limpieza",
  "Medio Ambiente-Playas","Movilidad","Nuevas Tecnologías","OAL Coordinación","Obras","Parques y Jardines",
  "Participación Ciudadana","PRIVADO","RR.HH.","RTV Marbella","Sanidad-Consumo","Seguridad Ciudadana",
  "Servicios Operativos","Turismo","Urbanismo","Vía Pública-Industria"];

/* Umbrales de aviso - ajustables aqui en una sola linea */
const UMBRAL = {
  proximosDias: 60,        // ventana de "eventos proximos"
  anulacionPct: 12,        // % de anulacion que dispara aviso
  caidaPct: 15,            // % de caida interanual que dispara aviso
  datosViejosDias: 90,     // antiguedad del Excel que dispara aviso
  duracionRara: 45,        // dias de duracion que resultan sospechosos
  concurrencia: 3          // eventos solapados el mismo dia = dia de carga alta
};

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const NF = new Intl.NumberFormat("es-ES");
const nf = n => (n === null || n === undefined || isNaN(n)) ? "—" : NF.format(Math.round(n));
const nf1 = n => (n === null || n === undefined || isNaN(n)) ? "—" : new Intl.NumberFormat("es-ES",{maximumFractionDigits:1}).format(n);
const esc = s => String(s === null || s === undefined ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const anio = r => r.i ? +r.i.slice(0,4) : null;
const mes = r => r.i ? (+r.i.slice(5,7) - 1) : null;
const fecha = s => { if(!s) return "—"; const p = s.split("-"); return p[2]+"/"+p[1]+"/"+p[0]; };
const hoyISO = () => new Date().toISOString().slice(0,10);
const diasEntre = (a,b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const grupoDe = k => GRUPOS.find(g => g.k === k) || {n: k || "(sin tipología)", c:"var(--text-3)"};

/* ---------- Estado ---------- */
const S = {
  rows: [],
  snapshot: SNAPSHOT,
  origen: "datos incorporados (libros 2024 + 2026)",
  f: {ano:"", grupo:"", car:"", del:"", fact:"", q:"", anul:false},
  sort: {col:"i", dir:-1},
  page: 0,
  perPage: 60,
  tab: "panel"
};
const PER = 60;

/* ---------- Persistencia local ---------- */
function guardar(){
  try{
    localStorage.setItem("pfcm_eventos_v1", JSON.stringify({
      rows: S.rows, snapshot: S.snapshot, origen: S.origen, ts: Date.now()
    }));
  }catch(e){ /* cuota llena: seguimos en memoria */ }
}
function restaurar(){
  try{
    const raw = localStorage.getItem("pfcm_eventos_v1");
    if(!raw) return false;
    const o = JSON.parse(raw);
    if(!o || !Array.isArray(o.rows) || !o.rows.length) return false;
    S.rows = o.rows; S.snapshot = o.snapshot || SNAPSHOT; S.origen = o.origen || S.origen;
    return true;
  }catch(e){ return false; }
}

/* ---------- Filtrado ---------- */
function filtrar(rows){
  const f = S.f, q = f.q.trim().toLowerCase();
  return rows.filter(r => {
    if(!f.anul && r.an) return false;
    if(f.ano && String(anio(r)) !== f.ano) return false;
    if(f.grupo && r.g !== f.grupo) return false;
    if(f.car && r.ca !== f.car) return false;
    if(f.del && (r.d || "(sin delegación)") !== f.del) return false;
    if(f.fact && r.fb !== f.fact) return false;
    if(q){
      const blob = (r.t||"") + " " + (r.c||"") + " " + (r.tp||"") + " " + (r.d||"") + " " + (r.g||"");
      if(blob.toLowerCase().indexOf(q) === -1) return false;
    }
    return true;
  });
}

/* ---------- Agregaciones ---------- */
function resumen(rows){
  const o = {n:0, asist:0, conAsist:0, fact:0, anul:0, dias:0};
  rows.forEach(r => {
    if(r.an){ o.anul++; return; }
    o.n++;
    if(typeof r.a === "number"){ o.asist += r.a; o.conAsist++; }
    if(r.fb === "F") o.fact++;
    if(r.i && r.f) o.dias += Math.max(1, diasEntre(r.i, r.f) + 1);
  });
  o.media = o.conAsist ? o.asist / o.conAsist : null;
  o.pctFact = o.n ? (o.fact / o.n * 100) : null;
  o.pctAnul = (o.n + o.anul) ? (o.anul / (o.n + o.anul) * 100) : null;
  return o;
}
function porAnio(rows){
  const m = new Map();
  rows.forEach(r => {
    const y = anio(r); if(!y) return;
    if(!m.has(y)) m.set(y, []);
    m.get(y).push(r);
  });
  return Array.from(m.keys()).sort((a,b)=>a-b).map(y => ({y, rows:m.get(y), s:resumen(m.get(y))}));
}
function contar(rows, key){
  const m = new Map();
  rows.forEach(r => { const k = key(r); m.set(k, (m.get(k)||0) + 1); });
  return Array.from(m, ([k,v]) => ({k, v})).sort((a,b) => b.v - a.v);
}

/* =========================================================================
   Graficas - SVG artesanal, sin dependencias
   ========================================================================= */
let TIPID = 0;
function tip(html){ return ' data-tip="' + esc(html) + '"'; }

/* Escala redondeada: evita ejes con topes como 253 o 146.050 */
function escalaBonita(v){
  if(!(v > 0)) return 4;
  const mag = Math.pow(10, Math.floor(Math.log10(v))), n = v / mag;
  const pasos = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return (pasos.find(p => n <= p + 1e-9) || 10) * mag;
}

/* Barras verticales, una serie. Etiqueta de valor sobre cada barra. */
function chartBarras(data, opt){
  opt = opt || {};
  const W = opt.w || 720, H = opt.h || 210, ml = 54, mr = 12, mt = 22, mb = 26;
  const iw = W - ml - mr, ih = H - mt - mb;
  const max = escalaBonita(Math.max(1, ...data.map(d => d.v)));
  const step = iw / Math.max(1, data.length);
  const bw = Math.min(58, step - 10);
  const color = opt.color || "var(--s1)";
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.aria||"") + '">';
  /* rejilla */
  for(let i = 0; i <= 4; i++){
    const y = mt + ih - (ih * i / 4);
    s += '<line class="gridline" x1="' + ml + '" y1="' + y + '" x2="' + (W-mr) + '" y2="' + y + '"/>';
    s += '<text class="axis" x="' + (ml-8) + '" y="' + (y+4) + '" text-anchor="end">' + nf(max*i/4) + '</text>';
  }
  data.forEach((d,i) => {
    const h = Math.max(d.v > 0 ? 2 : 0, ih * d.v / max);
    const x = ml + step*i + (step-bw)/2, y = mt + ih - h;
    s += '<rect class="mark" x="' + x + '" y="' + y + '" width="' + bw + '" height="' + h +
         '" rx="4" fill="' + (d.c || color) + '"' + tip(d.tip || (d.k + ": " + nf(d.v))) + '/>';
    s += '<text class="dlabel" x="' + (x+bw/2) + '" y="' + (y-6) + '" text-anchor="middle">' + nf(d.v) + '</text>';
    s += '<text class="axis-strong" x="' + (x+bw/2) + '" y="' + (H-8) + '" text-anchor="middle">' + esc(d.k) + '</text>';
  });
  return s + '</svg>';
}

/* Barras apiladas por categoria (anios) con varias series */
function chartApiladas(cats, series, opt){
  opt = opt || {};
  const W = opt.w || 720, H = opt.h || 260, ml = 54, mr = 12, mt = 18, mb = 28;
  const iw = W - ml - mr, ih = H - mt - mb;
  const tot = cats.map((_,i) => series.reduce((a,s) => a + (s.v[i]||0), 0));
  const max = escalaBonita(Math.max(1, ...tot));
  const step = iw / Math.max(1, cats.length);
  const bw = Math.min(62, step - 12);
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.aria||"") + '">';
  for(let i = 0; i <= 4; i++){
    const y = mt + ih - (ih*i/4);
    s += '<line class="gridline" x1="' + ml + '" y1="' + y + '" x2="' + (W-mr) + '" y2="' + y + '"/>';
    s += '<text class="axis" x="' + (ml-8) + '" y="' + (y+4) + '" text-anchor="end">' + nf(max*i/4) + '</text>';
  }
  cats.forEach((cat,i) => {
    const x = ml + step*i + (step-bw)/2;
    let acc = 0;
    series.forEach(se => {
      const v = se.v[i] || 0; if(!v) return;
      const h = ih * v / max, y = mt + ih - (ih*acc/max) - h;
      /* 2px de aire entre segmentos: el hueco deja ver la superficie */
      s += '<rect class="mark" x="' + x + '" y="' + y + '" width="' + bw + '" height="' + Math.max(1,h-2) +
           '" rx="3" fill="' + se.c + '"' +
           tip("<div class='tt'>" + cat + " · " + se.n + "</div><div class='tr'><span><i style='background:" +
               se.c + "'></i>Eventos</span><b>" + nf(v) + "</b></div><div class='tm'>" +
               (tot[i] ? (v/tot[i]*100).toFixed(1) : 0) + "% del año (" + nf(tot[i]) + ")</div>") + '/>';
      acc += v;
    });
    s += '<text class="dlabel" x="' + (x+bw/2) + '" y="' + (mt + ih - ih*tot[i]/max - 6) + '" text-anchor="middle">' + nf(tot[i]) + '</text>';
    s += '<text class="axis-strong" x="' + (x+bw/2) + '" y="' + (H-9) + '" text-anchor="middle">' + esc(cat) + '</text>';
  });
  return s + '</svg>';
}

/* Barras horizontales ordenadas (identidad + magnitud) */
function chartHBarras(data, opt){
  opt = opt || {};
  const rowH = 25, W = opt.w || 720, ml = opt.ml || 190, mr = 54;
  const H = data.length * rowH + 12;
  const iw = W - ml - mr;
  const max = Math.max(1, ...data.map(d => d.v));
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.aria||"") + '">';
  data.forEach((d,i) => {
    const y = i*rowH + 6, w = Math.max(d.v > 0 ? 2 : 0, iw * d.v / max);
    s += '<text class="axis-strong" x="' + (ml-10) + '" y="' + (y+12) + '" text-anchor="end">' + esc(d.k) + '</text>';
    s += '<rect class="mark" x="' + ml + '" y="' + y + '" width="' + w + '" height="15" rx="4" fill="' +
         (d.c || "var(--s1)") + '"' + tip(d.tip || (d.k + ": " + nf(d.v))) + '/>';
    s += '<text class="dlabel" x="' + (ml+w+7) + '" y="' + (y+12) + '">' + nf(d.v) + '</text>';
  });
  return s + '</svg>';
}

/* Mapa de calor anio x mes - rampa secuencial de un solo tono */
function chartHeatmap(anios, matriz, opt){
  opt = opt || {};
  const cw = 52, ch = 30, ml = 46, mt = 22;
  const W = ml + cw*12 + 10, H = mt + ch*anios.length + 10;
  let max = 0; matriz.forEach(f => f.forEach(v => { if(v > max) max = v; }));
  const SEQ = ["var(--seq-1)","var(--seq-2)","var(--seq-3)","var(--seq-4)","var(--seq-5)","var(--seq-6)"];
  const paso = v => { if(!v) return "transparent"; return SEQ[Math.min(5, Math.floor(v / (max||1) * 5.999))]; };
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" style="max-width:' + W + 'px" role="img" aria-label="' + esc(opt.aria||"") + '">';
  MESES.forEach((m,j) => {
    s += '<text class="axis" x="' + (ml + cw*j + cw/2) + '" y="' + (mt-8) + '" text-anchor="middle">' + m + '</text>';
  });
  anios.forEach((y,i) => {
    s += '<text class="axis-strong" x="' + (ml-10) + '" y="' + (mt + ch*i + 20) + '" text-anchor="end">' + y + '</text>';
    matriz[i].forEach((v,j) => {
      const x = ml + cw*j, yy = mt + ch*i;
      const oscuro = v / (max||1) > 0.55;
      s += '<rect class="mark" x="' + (x+1) + '" y="' + (yy+1) + '" width="' + (cw-3) + '" height="' + (ch-3) +
           '" rx="4" fill="' + paso(v) + '" stroke="var(--line)" stroke-width="' + (v?0:1) + '"' +
           tip("<div class='tt'>" + MESES_L[j] + " " + y + "</div><div class='tr'><span>Eventos</span><b>" + nf(v) + "</b></div>") + '/>';
      if(v) s += '<text x="' + (x+cw/2) + '" y="' + (yy+ch/2+4) + '" text-anchor="middle" font-size="11.5" font-weight="650" fill="' +
                 (oscuro ? "#fff" : "var(--text-2)") + '" style="pointer-events:none">' + v + '</text>';
    });
  });
  return s + '</svg>';
}

/* Lineas: acumulado mensual comparando anios */
function chartLineas(series, opt){
  opt = opt || {};
  const W = opt.w || 720, H = opt.h || 240, ml = 54, mr = 62, mt = 16, mb = 26;
  const iw = W - ml - mr, ih = H - mt - mb;
  let max = 1; series.forEach(s2 => s2.v.forEach(v => { if(v > max) max = v; }));
  max = escalaBonita(max);
  const X = i => ml + iw * i / 11, Y = v => mt + ih - ih * v / max;
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.aria||"") + '">';
  for(let i = 0; i <= 4; i++){
    const y = mt + ih - ih*i/4;
    s += '<line class="gridline" x1="' + ml + '" y1="' + y + '" x2="' + (W-mr) + '" y2="' + y + '"/>';
    s += '<text class="axis" x="' + (ml-8) + '" y="' + (y+4) + '" text-anchor="end">' + nf(max*i/4) + '</text>';
  }
  MESES.forEach((m,i) => s += '<text class="axis" x="' + X(i) + '" y="' + (H-8) + '" text-anchor="middle">' + m + '</text>');
  series.forEach(se => {
    const pts = se.v.map((v,i) => X(i) + "," + Y(v)).join(" ");
    s += '<polyline points="' + pts + '" fill="none" stroke="' + se.c + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"' +
         (se.dash ? ' stroke-dasharray="5 4"' : '') + '/>';
    se.v.forEach((v,i) => {
      s += '<circle class="mark" cx="' + X(i) + '" cy="' + Y(v) + '" r="4.5" fill="' + se.c +
           '" stroke="var(--surface-1)" stroke-width="2"' +
           tip("<div class='tt'>" + MESES_L[i] + "</div><div class='tr'><span><i style='background:" + se.c + "'></i>" +
               se.n + "</span><b>" + nf(v) + "</b></div>") + '/>';
    });
    /* etiqueta directa al final de la linea, en tinta de texto */
    const last = se.v.length - 1;
    s += '<text class="dlabel" x="' + (X(last)+9) + '" y="' + (Y(se.v[last])+4) + '">' + esc(se.n) + '</text>';
  });
  return s + '</svg>';
}

function leyenda(items){
  return '<div class="legend">' + items.map(i =>
    '<span><i style="background:' + i.c + '"></i>' + esc(i.n) + '</span>').join("") + '</div>';
}
function tarjeta(titulo, hint, cuerpo){
  return '<div class="card"><h3>' + esc(titulo) + '</h3>' +
    (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') +
    '<div class="chartwrap">' + cuerpo + '</div></div>';
}
