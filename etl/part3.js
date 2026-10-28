
/* =========================================================================
   MOTOR DE AVISOS
   Se calcula siempre sobre el conjunto completo, no sobre el filtro:
   un aviso de calidad del dato no debe esconderse al filtrar.
   ========================================================================= */
function avisos(){
  const R = S.rows, A = [];
  const vivos = R.filter(r => !r.an);
  const hoy = hoyISO();
  const add = (sev, id, ttl, dsc, items, extra) => {
    if(!items || !items.length) return;
    A.push(Object.assign({sev, id, ttl, dsc, n:items.length, items}, extra||{}));
  };

  /* ---- 1. Calidad del dato ---- */
  const porCod = new Map();
  R.forEach(r => { if(r.c) porCod.set(r.c, (porCod.get(r.c)||0)+1); });
  add("crit", "dup", "Códigos de expediente duplicados",
    "Dos o más registros comparten el mismo código. Rompe cualquier cruce por expediente.",
    Array.from(porCod).filter(([,v]) => v>1).map(([k,v]) => "<b>"+esc(k)+"</b> — "+v+" registros"));

  const dupTF = new Map();
  R.forEach(r => { const k = (r.t||"").toLowerCase()+"|"+(r.i||""); if(k.length>2) dupTF.set(k,(dupTF.get(k)||0)+1); });
  add("warn", "duptit", "Posibles duplicados por título y fecha",
    "Mismo título y misma fecha de inicio con códigos distintos. Revisa si es un alta repetida.",
    Array.from(dupTF).filter(([,v]) => v>1).map(([k]) => {
      const t = k.split("|")[0];
      return "<b>"+esc(t.slice(0,110))+(t.length>110?"…":"")+"</b> — "+fecha(k.split("|")[1]);
    }));

  add("crit", "fechas", "Fecha de fin anterior a la de inicio",
    "Error de tecleo en el libro: el evento acabaría antes de empezar.",
    R.filter(r => r.i && r.f && r.f < r.i)
     .map(r => "<b>"+esc(r.c)+"</b> — "+fecha(r.i)+" &rarr; "+fecha(r.f)));

  add("warn", "duracion", "Eventos de duración anómala",
    "Más de "+UMBRAL.duracionRara+" días entre inicio y fin. Suele ser una serie de sesiones sueltas anotada como un único evento, lo que distorsiona la ocupación.",
    vivos.filter(r => r.i && r.f && diasEntre(r.i,r.f) > UMBRAL.duracionRara)
      .sort((a,b) => diasEntre(b.i,b.f) - diasEntre(a.i,a.f))
      .map(r => "<b>"+esc(r.c)+"</b> — "+diasEntre(r.i,r.f)+" días · "+esc((r.t||"").slice(0,95))));

  add("serious", "conflicto", "Registros con datos contradictorios entre libros",
    "Estos expedientes aparecían en el libro 2021-2024 y en el 2025-2028 con valores distintos. Se ha conservado la versión del libro más reciente.",
    R.filter(r => r.x).map(r => "<b>"+esc(r.c)+"</b> — difieren: "+esc(r.x.join(", "))));

  const sinAsist = vivos.filter(r => typeof r.a !== "number");
  add(sinAsist.length/Math.max(1,vivos.length) > 0.2 ? "serious" : "warn", "asist",
    "Eventos sin número de asistentes",
    "Es el "+ (sinAsist.length/Math.max(1,vivos.length)*100).toFixed(0) +"% de los eventos no anulados. Sin este dato el indicador de afluencia queda infravalorado.",
    sinAsist.slice().sort((a,b)=> (b.i||"").localeCompare(a.i||""))
      .map(r => "<b>"+esc(r.c)+"</b> — "+fecha(r.i)+" · "+esc((r.t||"").slice(0,95))));

  const sinDel = vivos.filter(r => !r.d);
  add("warn", "deleg", "Eventos sin delegación asignada",
    "Impide repartir la actividad entre áreas del Ayuntamiento y justificar el uso institucional del recinto.",
    sinDel.slice().sort((a,b)=> (b.i||"").localeCompare(a.i||""))
      .map(r => "<b>"+esc(r.c)+"</b> — "+fecha(r.i)+" · "+esc((r.t||"").slice(0,95))));

  const conImporte = R.filter(r => typeof r.imp === "number" && r.imp > 0).length;
  if(!conImporte){
    A.push({sev:"crit", id:"factur", ttl:"La facturación no está registrada en ningún evento",
      dsc:"Las columnas FACTURACIÓN_ESPACIO, _SERVICIOS y _TOTAL del libro contienen guiones en lugar de importes, en los "+nf(R.length)+" registros. Todo el bloque económico del cuadro de mando (y las filas FACTURACIÓN de las hojas TablaAAAA) da cero.",
      n: R.filter(r => r.fb==="F" && !r.an).length,
      items:["Hay <b>"+nf(R.filter(r=>r.fb==="F" && !r.an).length)+"</b> eventos marcados como facturables sin ningún importe asociado.",
             "Mientras no se rellene, la herramienta no puede calcular ingresos, ticket medio ni rentabilidad por tipología."]});
  }

  const tipoRaro = vivos.filter(r => r.tp && TIPOS_OK.indexOf(r.tp) === -1);
  add("info", "tipo", "Valores fuera de la lista maestra",
    "Tipos que no figuran en la hoja Leyenda del libro. Rompen los COUNTIFS de las hojas anuales.",
    Array.from(new Set(tipoRaro.map(r => r.tp))).map(t => "<b>"+esc(t)+"</b>"));
  const delRara = vivos.filter(r => r.d && DELEGACIONES_OK.indexOf(r.d) === -1);
  add("info", "delrara", "Delegaciones fuera de la lista maestra",
    "Nombres de delegación que no coinciden con la hoja Leyenda (erratas o áreas nuevas sin dar de alta).",
    Array.from(new Set(delRara.map(r => r.d))).map(d => "<b>"+esc(d)+"</b>"));

  /* ---- 2. Agenda y ocupación ---- */
  const desfase = diasEntre(S.snapshot, hoy);
  if(desfase > UMBRAL.datosViejosDias){
    A.push({sev:"serious", id:"stale", ttl:"Los datos llevan "+nf(desfase)+" días sin actualizarse",
      dsc:"El último libro cargado es del "+fecha(S.snapshot)+". Todo lo registrado en el Palacio desde esa fecha falta aquí.",
      n:desfase,
      items:["Pide a PFCM el libro Control_Eventos actualizado y arrástralo sobre esta página.",
             "Los indicadores del año en curso están, por tanto, incompletos."]});
  }

  const prox = vivos.filter(r => r.i >= hoy && diasEntre(hoy, r.i) <= UMBRAL.proximosDias)
                    .sort((a,b) => a.i.localeCompare(b.i));
  add("info", "prox", "Eventos en los próximos "+UMBRAL.proximosDias+" días",
    "Agenda inmediata según los datos cargados.",
    prox.map(r => "<b>"+fecha(r.i)+"</b> — "+esc((r.t||"").slice(0,105))+
      " <span class='pill "+(r.fb==="F"?"f":"nf")+"'>"+(r.fb==="F"?"Facturable":"No facturable")+"</span>"));

  /* dias con varios eventos simultaneos */
  const carga = new Map();
  vivos.forEach(r => {
    if(!r.i) return;
    const fin = r.f && r.f >= r.i ? r.f : r.i;
    if(diasEntre(r.i, fin) > UMBRAL.duracionRara) return;
    for(let d = new Date(r.i); d <= new Date(fin); d.setDate(d.getDate()+1)){
      const k = d.toISOString().slice(0,10);
      carga.set(k, (carga.get(k)||0)+1);
    }
  });
  add("info", "concurrencia", "Días con "+UMBRAL.concurrencia+" o más eventos simultáneos",
    "Picos de ocupación del recinto. Útil para dimensionar personal y para justificar la necesidad de espacios.",
    Array.from(carga).filter(([,v]) => v >= UMBRAL.concurrencia).sort((a,b) => b[1]-a[1])
      .map(([k,v]) => "<b>"+fecha(k)+"</b> — "+v+" eventos"));

  /* ---- 3. Desviación de KPIs ---- */
  const ys = porAnio(R);
  const cierre = +S.snapshot.slice(0,4);
  const anioRef = ys.filter(a => a.y < cierre && a.s.n >= 20).map(a => a.y).pop();
  if(anioRef){
    const cur = ys.find(a => a.y === anioRef), prev = ys.find(a => a.y === anioRef-1);
    if(prev){
      const dEv = (cur.s.n - prev.s.n) / prev.s.n * 100;
      const dAs = prev.s.asist ? (cur.s.asist - prev.s.asist) / prev.s.asist * 100 : 0;
      const its = [];
      if(dEv <= -UMBRAL.caidaPct) its.push("Eventos: <b>"+nf(cur.s.n)+"</b> frente a "+nf(prev.s.n)+" en "+prev.y+" ("+dEv.toFixed(1)+"%)");
      if(dAs <= -UMBRAL.caidaPct) its.push("Asistentes: <b>"+nf(cur.s.asist)+"</b> frente a "+nf(prev.s.asist)+" en "+prev.y+" ("+dAs.toFixed(1)+"%)");
      add("serious", "caida", "Caída interanual en "+anioRef+" por encima del "+UMBRAL.caidaPct+"%",
        "Comparativa del último año con volumen frente al anterior.", its);
    }
    if(cur.s.pctAnul >= UMBRAL.anulacionPct){
      A.push({sev:"warn", id:"anul", ttl:"Tasa de anulación alta en "+anioRef,
        dsc:"Un "+cur.s.pctAnul.toFixed(1)+"% de los expedientes de "+anioRef+" acabó anulado (umbral de aviso: "+UMBRAL.anulacionPct+"%).",
        n:cur.rows.filter(r=>r.an).length,
        items:cur.rows.filter(r=>r.an).map(r => "<b>"+esc(r.c)+"</b> — "+esc((r.t||"").slice(0,100)))});
    }
  }

  /* ---- 4. Cartera futura ---- */
  const futuros = vivos.filter(r => r.i > hoy);
  if(futuros.length){
    A.push({sev:"good", id:"cartera", ttl:"Cartera comprometida: "+nf(futuros.length)+" eventos futuros",
      dsc:"Reservas ya anotadas con fecha posterior a hoy. "+
          nf(futuros.filter(r=>r.fb==="F").length)+" son facturables.",
      n:futuros.length,
      items:futuros.sort((a,b)=>a.i.localeCompare(b.i)).slice(0,40)
        .map(r => "<b>"+fecha(r.i)+"</b> — "+esc((r.t||"").slice(0,100)))});
    add("warn", "cartinc", "Reservas futuras con la ficha incompleta",
      "Antes de que llegue la fecha conviene cerrar delegación y aforo previsto.",
      futuros.filter(r => !r.d || typeof r.a !== "number")
        .map(r => "<b>"+fecha(r.i)+"</b> — "+esc((r.t||"").slice(0,85))+
          " <i>(falta"+(!r.d && typeof r.a!=="number" ? "n delegación y asistentes" : (!r.d ? " delegación" : " asistentes"))+")</i>"));
  }

  const ORD = {crit:0, serious:1, warn:2, info:3, good:4};
  A.sort((a,b) => ORD[a.sev] - ORD[b.sev] || b.n - a.n);
  return A;
}

/* =========================================================================
   RENDER DE PANELES
   ========================================================================= */
function kpi(lab, val, foot){
  return '<div class="card kpi"><div class="lab">'+esc(lab)+'</div><div class="val">'+val+
         '</div><div class="foot">'+(foot||"")+'</div></div>';
}
function delta(cur, prev, invertir){
  if(prev === null || prev === undefined || !prev) return '<span class="delta flat">sin comparativa</span>';
  const d = (cur - prev) / prev * 100;
  const cls = Math.abs(d) < 1 ? "flat" : ((d > 0) !== !!invertir ? "up" : "down");
  return '<span class="delta '+cls+'">'+(d>0?"+":"")+d.toFixed(1)+'%</span> vs. año anterior';
}

function renderPanel(){
  /* resumen() ya separa anulados de celebrados, asi que se le pasa el conjunto
     completo: si respetaramos la casilla "incluir anulados" el KPI daria siempre 0. */
  /* Sin año elegido, los KPI muestran el ultimo año completo, no la suma del periodo. */
  const hoy = hoyISO(), yHoy = +hoy.slice(0,4);
  const anoSel = S.f.ano ? +S.f.ano : yHoy - 1;
  const rows = conAnulados({ano:String(anoSel)});
  const s = resumen(rows);
  const sinAno = conAnulados({ano:""});
  const ys = porAnio(sinAno);
  const prev = ys.find(a => a.y === anoSel-1);
  const ps = prev ? prev.s : {};

  let h = '<div class="grid k6">';
  h += kpi("Eventos en "+anoSel, nf(s.n), delta(s.n, ps.n));
  h += kpi("Asistentes en "+anoSel, nf(s.asist), delta(s.asist, ps.asist));
  h += kpi("Media por evento", nf(s.media), delta(s.media, ps.media));
  h += kpi("Facturables", nf(s.fact), delta(s.fact, ps.fact));
  h += kpi("Anulados", nf(s.anul), delta(s.anul, ps.anul, true));
  h += kpi("Días de actividad", nf(s.dias), delta(s.dias, ps.dias));
  h += '</div>';

  /* Evolucion: dos graficas separadas, nunca dos ejes en una */
  const yy = ys.filter(a => a.s.n > 0);
  h += '<div class="sec">Evolución anual</div><div class="grid c2">';
  h += tarjeta("Eventos contratados por año", "Por año de inicio y sin anulados. Los años futuros recogen solo reservas ya comprometidas.",
    chartBarras(yy.map(a => ({k:a.y, v:a.s.n,
      tip:"<div class='tt'>"+a.y+"</div><div class='tr'><span>Eventos</span><b>"+nf(a.s.n)+
          "</b></div><div class='tr'><span>Facturables</span><b>"+nf(a.s.fact)+
          "</b></div><div class='tr'><span>Anulados</span><b>"+nf(a.s.anul)+"</b></div>"})),
      {aria:"Eventos contratados por año"}));
  /* Celebrados: solo lo que ya ha empezado a fecha de hoy. Un evento que cruza
     de un año a otro cuenta en cada año en que tuvo actividad. */
  const cel = new Map();
  sinAno.forEach(r => {
    if(r.an || !r.i || r.i > hoy) return;
    const y1 = Math.min(+(r.f || r.i).slice(0,4), yHoy);
    for(let y = +r.i.slice(0,4); y <= y1; y++) cel.set(y, (cel.get(y)||0) + 1);
  });
  const ycel = Array.from(cel.keys()).sort((a,b)=>a-b);
  h += tarjeta("Eventos celebrados por año", "Según sus fechas de inicio y fin, y solo los ya iniciados a "+fecha(hoy)+". Sin anulados.",
    chartBarras(ycel.map(y => ({k:y, v:cel.get(y), c:"var(--s2)",
      tip:"<div class='tt'>"+y+(y === yHoy ? " (hasta hoy)" : "")+"</div><div class='tr'><span>Celebrados</span><b>"+
          nf(cel.get(y))+"</b></div>"})),
      {aria:"Eventos celebrados por año"}));
  h += tarjeta("Asistentes por año", "Suma de la columna ASISTENTES; los eventos sin dato no suman.",
    chartBarras(yy.map(a => ({k:a.y, v:a.s.asist, c:"var(--s3)",
      tip:"<div class='tt'>"+a.y+"</div><div class='tr'><span>Asistentes</span><b>"+nf(a.s.asist)+
          "</b></div><div class='tr'><span>Media/evento</span><b>"+nf(a.s.media)+
          "</b></div><div class='tm'>"+nf(a.s.n - a.s.conAsist)+" eventos sin dato de aforo</div>"})),
      {aria:"Asistentes por año"}));
  h += '</div>';

  /* Estacionalidad */
  const anios = yy.map(a => a.y);
  const matriz = anios.map(y => {
    const f = new Array(12).fill(0);
    sinAno.forEach(r => { if(!r.an && anio(r) === y && mes(r) !== null) f[mes(r)]++; });
    return f;
  });
  h += '<div class="sec">Estacionalidad</div>';
  h += '<div class="card"><h3>Eventos por mes y año</h3>' +
       '<div class="hint">Cuanto más intenso el azul, más eventos. Sirve para localizar los valles de programación.</div>' +
       '<div class="chartwrap scroll-x">' + chartHeatmap(anios, matriz, {aria:"Mapa de calor de eventos por mes y año"}) + '</div></div>';

  /* Mix por tipologia */
  const series = GRUPOS.map(g => ({n:g.n, c:g.c,
    v: anios.map(y => sinAno.filter(r => !r.an && anio(r) === y && r.g === g.k).length)}));
  h += '<div class="sec">Composición de la actividad</div>';
  h += '<div class="card"><h3>Eventos por tipología y año</h3>' +
       '<div class="hint">Las seis categorías de la columna Tipo1 del libro.</div>' +
       '<div class="chartwrap">' + chartApiladas(anios, series, {w:ANCHO, h:300, aria:"Eventos por tipología y año"}) + '</div>' +
       leyenda(GRUPOS.map(g => ({n:g.n, c:g.c}))) + '</div>';

  $("#p-panel").innerHTML = h;
}

function renderAnalisis(){
  const rows = conAnulados().filter(r => !r.an);
  const sinAno = conAnulados({ano:""}).filter(r => !r.an);
  const anios = porAnio(sinAno).map(a => a.y);

  let h = '<div class="sec">Procedencia y encaje territorial</div><div class="grid c2">';
  const sCar = CARACTERES.map(c => ({n:c.n, c:c.c,
    v: anios.map(y => sinAno.filter(r => anio(r) === y && r.ca === c.k).length)}));
  h += '<div class="card"><h3>Carácter del evento por año</h3>' +
       '<div class="hint">Local, regional, nacional o internacional. Es el indicador de proyección exterior del recinto.</div>' +
       '<div class="chartwrap">' + chartApiladas(anios, sCar, {h:250, aria:"Carácter por año"}) + '</div>' +
       leyenda(CARACTERES.map(c => ({n:c.n, c:c.c}))) + '</div>';

  const mod = contar(rows, r => r.m || "(sin dato)");
  h += tarjeta("Modalidad de expediente",
    "OE otros eventos · FE ferias y eventos · CO congresos · FT ferias temáticas.",
    chartHBarras(mod.map(d => ({k:(MODALIDADES[d.k]||d.k)+" ("+d.k+")", v:d.v,
      tip:"<div class='tt'>"+esc(MODALIDADES[d.k]||d.k)+"</div><div class='tr'><span>Eventos</span><b>"+nf(d.v)+"</b></div>"})),
      {ml:200, aria:"Modalidad"}));
  h += '</div>';

  h += '<div class="sec">Áreas municipales y tipos</div><div class="grid c2">';
  const del = contar(rows, r => r.d || "(sin delegación)").slice(0, 14);
  h += tarjeta("Delegación organizadora (top 14)",
    "Reparto de la actividad institucional entre áreas del Ayuntamiento.",
    chartHBarras(del.map(d => ({k:d.k, v:d.v, c: d.k === "(sin delegación)" ? "var(--text-3)" : "var(--s1)",
      tip:"<div class='tt'>"+esc(d.k)+"</div><div class='tr'><span>Eventos</span><b>"+nf(d.v)+"</b></div>"})),
      {ml:190, aria:"Delegaciones"}));

  const tip1 = contar(rows, r => r.tp || "(sin tipo)").slice(0, 14);
  h += tarjeta("Tipo de evento (top 14)",
    "Clasificación fina de la columna TIPO.",
    chartHBarras(tip1.map(d => ({k:d.k, v:d.v, c:"var(--s3)",
      tip:"<div class='tt'>"+esc(d.k)+"</div><div class='tr'><span>Eventos</span><b>"+nf(d.v)+"</b></div>"})),
      {ml:170, aria:"Tipos de evento"}));
  h += '</div>';

  /* Comparativa mensual de los dos ultimos anios con volumen */
  const conVol = porAnio(sinAno).filter(a => a.s.n >= 20).map(a => a.y);
  if(conVol.length >= 2){
    const y1 = conVol[conVol.length-1], y0 = conVol[conVol.length-2];
    const acum = y => { let a = 0; return MESES.map((_,i) => {
      a += sinAno.filter(r => anio(r) === y && mes(r) === i).length; return a; }); };
    h += '<div class="sec">Ritmo del año</div>';
    h += '<div class="card"><h3>Eventos acumulados mes a mes: ' + y1 + ' frente a ' + y0 + '</h3>' +
         '<div class="hint">La distancia entre las dos líneas es el desfase acumulado del año.</div>' +
         '<div class="chartwrap">' + chartLineas([
            {n:String(y0), c:"var(--s2)", v:acum(y0), dash:true},
            {n:String(y1), c:"var(--s1)", v:acum(y1)}
         ], {w:ANCHO, h:270, aria:"Comparativa mensual acumulada"}) + '</div></div>';
  }

  /* Facturables por anio */
  h += '<div class="sec">Facturación</div>';
  h += '<div class="note"><b>Sin importes en el origen.</b> Las columnas FACTURACIÓN_ESPACIO, _SERVICIOS y ' +
       '_TOTAL del libro están rellenas con guiones, así que solo se puede contar <i>cuántos</i> eventos son ' +
       'facturables, no cuánto se facturó. En cuanto PFCM rellene esos importes, esta sección pasa a mostrar ' +
       'ingresos, ticket medio y rentabilidad por tipología sin tocar nada más.</div>';
  const sFact = [
    {n:"Facturables", c:"var(--s1)", v: anios.map(y => sinAno.filter(r => anio(r)===y && r.fb==="F").length)},
    {n:"No facturables", c:"var(--s5)", v: anios.map(y => sinAno.filter(r => anio(r)===y && r.fb!=="F").length)}
  ];
  h += '<div class="card"><h3>Eventos facturables frente a no facturables</h3>' +
       '<div class="hint">Proporción de uso comercial sobre uso institucional del recinto.</div>' +
       '<div class="chartwrap">' + chartApiladas(anios, sFact, {w:ANCHO, h:280, aria:"Facturables por año"}) + '</div>' +
       leyenda(sFact.map(s2 => ({n:s2.n, c:s2.c}))) + '</div>';

  $("#p-analisis").innerHTML = h;
}

function renderAvisos(){
  const A = avisos();
  const crit = A.filter(a => a.sev === "crit" || a.sev === "serious").length;
  $("#nAlerts").textContent = A.filter(a => a.sev !== "good" && a.sev !== "info").length;
  $("#nAlerts").className = "badge" + (crit ? "" : " mut");

  const ICO = {crit:"!", serious:"!", warn:"!", info:"i", good:"✓"};
  const NOM = {crit:"Crítico", serious:"Importante", warn:"Aviso", info:"Información", good:"Cartera"};
  let h = '<div class="note">Los avisos se calculan sobre <b>el conjunto completo de ' + nf(S.rows.length) +
    ' registros</b>, no sobre el filtro activo: un problema de calidad del dato no debe esconderse al filtrar. ' +
    'Los umbrales (ventana de agenda, % de anulación, antigüedad de los datos…) están agrupados en la constante ' +
    '<code>UMBRAL</code> al principio del código de esta página, por si quieres afinarlos.</div>';

  if(!A.length) h += '<div class="empty">Sin avisos: los datos están completos y al día.</div>';
  A.forEach(a => {
    h += '<details class="alert ' + a.sev + '"' + (a.sev === "crit" ? " open" : "") + '>' +
      '<summary><span class="ico">' + ICO[a.sev] + '</span>' +
      '<span><span class="ttl">' + a.ttl + '</span><span class="dsc">' + a.dsc + '</span></span>' +
      '<span class="n">' + nf(a.n) + '</span></summary>' +
      '<div class="body"><ul>' +
      a.items.slice(0, 60).map(i => '<li>' + i + '</li>').join("") +
      '</ul>' + (a.items.length > 60 ? '<div class="more">…y ' + nf(a.items.length - 60) +
        ' más. Usa la pestaña Eventos para verlos todos.</div>' : '') +
      '</div></details>';
  });
  $("#p-avisos").innerHTML = h;
}

function renderCartera(){
  const hoy = hoyISO();
  const fut = S.rows.filter(r => !r.an && r.i > hoy).sort((a,b) => a.i.localeCompare(b.i));
  $("#nCart").textContent = fut.length;
  const s = resumen(fut);
  const porA = porAnio(fut);

  let h = '<div class="note">Reservas con fecha posterior a <b>' + fecha(hoy) + '</b> ya anotadas en el libro. ' +
    'Es la actividad comprometida del recinto: sirve para anticipar carga de trabajo y para negociar el presupuesto del ejercicio.</div>';
  h += '<div class="grid k6">';
  h += kpi("Eventos comprometidos", nf(fut.length), "con fecha futura");
  h += kpi("Facturables", nf(s.fact), nf1(s.pctFact) + "% de la cartera");
  h += kpi("Aforo previsto", nf(s.asist), "declarado en " + nf(s.conAsist) + " de " + nf(fut.length));
  h += kpi("Sin delegación", nf(fut.filter(r => !r.d).length), "fichas por completar");
  h += '</div>';

  if(porA.length){
    h += '<div class="sec">Reparto por ejercicio</div>';
    h += '<div class="card"><h3>Reservas comprometidas por año</h3>' +
      '<div class="hint">Cuántos eventos hay ya cerrados en cada ejercicio futuro.</div>' +
      '<div class="chartwrap">' + chartBarras(porA.map(a => ({k:a.y, v:a.s.n, c:"var(--s3)",
        tip:"<div class='tt'>" + a.y + "</div><div class='tr'><span>Reservas</span><b>" + nf(a.s.n) +
            "</b></div><div class='tr'><span>Facturables</span><b>" + nf(a.s.fact) + "</b></div>"})),
        {w:ANCHO, h:210, aria:"Cartera por año"}) + '</div></div>';
  }

  h += '<div class="sec">Detalle de la cartera</div>';
  h += tabla(fut, false);
  $("#p-cartera").innerHTML = h;
}

/* ---------- Tabla de eventos ---------- */
const COLS = [
  {k:"c",  n:"Código", cls:"cod"},
  {k:"i",  n:"Inicio", cls:"num", fmt:r => fecha(r.i)},
  {k:"f",  n:"Fin", cls:"num", fmt:r => fecha(r.f)},
  {k:"t",  n:"Título", cls:"tit"},
  {k:"tp", n:"Tipo"},
  {k:"g",  n:"Tipología", fmt:r => esc(grupoDe(r.g).n)},
  {k:"ca", n:"Carácter"},
  {k:"d",  n:"Delegación", fmt:r => r.d ? esc(r.d) : '<span style="color:var(--text-3)">—</span>'},
  {k:"fb", n:"Facturable", fmt:r => '<span class="pill ' + (r.fb === "F" ? "f" : "nf") + '">' + (r.fb === "F" ? "Sí" : "No") + '</span>'},
  {k:"a",  n:"Asistentes", cls:"num", fmt:r => typeof r.a === "number" ? nf(r.a) : '<span style="color:var(--text-3)">—</span>'}
];
function tabla(rows, paginar){
  const sorted = rows.slice().sort((a,b) => {
    const k = S.sort.col; let x = a[k], y = b[k];
    if(k === "a"){ x = (typeof x === "number" ? x : -1); y = (typeof y === "number" ? y : -1); return (x-y) * S.sort.dir; }
    x = (x || "").toString(); y = (y || "").toString();
    return x.localeCompare(y, "es") * S.sort.dir;
  });
  const total = sorted.length;
  const page = paginar ? sorted.slice(S.page * PER, S.page * PER + PER) : sorted.slice(0, 400);
  let h = '<div class="tablewrap"><table><thead><tr>';
  COLS.forEach(c => {
    const on = S.sort.col === c.k;
    h += '<th data-col="' + c.k + '">' + esc(c.n) + (on ? (S.sort.dir > 0 ? " ↑" : " ↓") : "") + '</th>';
  });
  h += '</tr></thead><tbody>';
  if(!page.length) h += '<tr><td colspan="' + COLS.length + '"><div class="empty">Ningún evento cumple el filtro.</div></td></tr>';
  page.forEach(r => {
    h += '<tr' + (r.an ? ' class="anul"' : '') + '>';
    COLS.forEach(c => {
      let v = c.fmt ? c.fmt(r) : esc(r[c.k] || "—");
      if(c.k === "t" && r.an) v = '<span class="pill an">Anulado</span> ' + v;
      if(c.k === "t" && r.x) v += ' <span class="pill nf" title="Datos que diferían entre libros: ' + esc(r.x.join(", ")) + '">conflicto</span>';
      h += '<td' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + v + '</td>';
    });
    h += '</tr>';
  });
  h += '</tbody></table>';
  if(paginar && total > PER){
    const np = Math.ceil(total / PER);
    h += '<div class="pager"><button id="pgPrev"' + (S.page === 0 ? " disabled" : "") + '>Anterior</button>' +
      '<span>Página <b>' + (S.page + 1) + '</b> de ' + np + ' · ' + nf(total) + ' eventos</span>' +
      '<button id="pgNext"' + (S.page >= np - 1 ? " disabled" : "") + '>Siguiente</button></div>';
  } else if(!paginar && total > 400){
    h += '<div class="pager"><span>Mostrando 400 de ' + nf(total) + '</span></div>';
  }
  return h + '</div>';
}
function renderEventos(){
  const rows = filtrar(S.rows);
  const np = Math.ceil(rows.length / PER);
  if(S.page >= np) S.page = 0;
  $("#p-eventos").innerHTML = tabla(rows, true);
}
