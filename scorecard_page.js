(function(){
  const $ = (s, el=document)=>el.querySelector(s);
  const esc = (s)=> (s??"").toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params = new URLSearchParams(location.search);
  const matchId = params.get("matchId") || "A1";

  $("#backLive").href = `live.html?matchId=${encodeURIComponent(matchId)}`;

  initRealtime();
  const banner = $("#fbBanner");
  if(!RT.ready){
    banner.style.display="block";
    banner.textContent = "Firebase not configured. Showing demo scorecard (no realtime).";
  }

  function matchFromDoc(doc){
    if(doc?.a && doc?.b) return doc;
    return scheduleToMatches().find(x=>x.matchId===matchId) || {a:"Team A", b:"Team B", venue:"", group:""};
  }

  function ensureState(match, doc){
    const st = doc?.liveState || newLiveState({matchId, a:match.a, b:match.b});
    if(!st.meta) st.meta = {};
    if(!st.meta.teamA) st.meta.teamA = match.a;
    if(!st.meta.teamB) st.meta.teamB = match.b;
    return st;
  }

  function fmtOvers(b){ return oversTextFromBalls(b||0); }
  function sr(r,b){ return b?((r*100)/b):0; }
  function econ(r,b){ return b? (r/(b/6)) : 0; }

  function battingTable(inn){
    const rows = Object.values(inn.batters||{})
      .sort((a,b)=> (a.out===b.out ? b.r-a.r : (a.out?1:-1)));
    if(!rows.length) return `<div class="muted">No batting data.</div>`;
    return `
      <table class="tbl">
        <thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
        <tbody>
          ${rows.map(p=>`
            <tr>
              <td>${esc(p.name)} ${p.out?`<span class="muted tiny">• ${esc(p.how||"out")}</span>`:`<span class="pill ok">not out</span>`}</td>
              <td>${p.r}</td><td>${p.b}</td><td>${p.f4}</td><td>${p.f6}</td><td>${sr(p.r,p.b).toFixed(1)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function bowlingTable(inn){
    const rows = Object.values(inn.bowlers||{})
      .sort((a,b)=> (b.wkts-a.wkts) || (a.runs-b.runs));
    if(!rows.length) return `<div class="muted">No bowling data.</div>`;
    return `
      <table class="tbl">
        <thead><tr><th>Bowler</th><th>O</th><th>R</th><th>W</th><th>Econ</th></tr></thead>
        <tbody>
          ${rows.map(p=>`
            <tr>
              <td>${esc(p.name)}</td>
              <td>${fmtOvers(p.legalBalls)}</td>
              <td>${p.runs}</td>
              <td>${p.wkts}</td>
              <td>${econ(p.runs,p.legalBalls).toFixed(2)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function extrasLine(inn){
    const ex = inn.totals?.extras || {};
    const total = (ex.wd||0)+(ex.nb||0)+(ex.b||0)+(ex.lb||0)+(ex.pen||0);
    return `Extras: WD ${ex.wd||0}, NB ${ex.nb||0}, B ${ex.b||0}, LB ${ex.lb||0}, PEN ${ex.pen||0} <span class="muted">(Total ${total})</span>`;
  }

  function fowLine(inn){
    if(!inn.fow || !inn.fow.length) return `<div class="muted">FOW: -</div>`;
    return `<div><b>FOW:</b> ${inn.fow.map(x=>`${x.score}/${x.wkt} (${esc(x.batter)} • ${esc(x.over)} ov)`).join(" • ")}</div>`;
  }

  function partnershipsBlock(inn){
    if(!inn.partnerships || !inn.partnerships.length) return ``;
    return `
      <div class="h3" style="margin-top:12px">Partnerships</div>
      <div class="muted tiny">Runs (balls) at over</div>
      <div class="grid2">
        ${inn.partnerships.map(p=>`
          <div class="box">
            <div><b>Wkt ${p.wkt}</b> • ${p.runs} (${p.balls})</div>
            <div class="muted tiny">at ${esc(p.at)} • ${esc(p.out)}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function overByOverBlock(inn){
    if(!inn.overByOver || !inn.overByOver.length) return ``;
    return `
      <div class="h3" style="margin-top:12px">Over-by-over</div>
      <div class="grid2">
        ${inn.overByOver.slice(0,12).map(o=>`
          <div class="box">
            <div class="muted tiny">Over ${o.over+1}</div>
            <div>${o.seq.map(x=>`<span class="ball">${esc(x)}</span>`).join("")}</div>
            <div class="muted tiny">Runs ${o.runs} • Wkts ${o.wkts}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function inningsCard(label, inn){
    const ov = fmtOvers(inn.totals?.legalBalls||0);
    return `
      <div class="card">
        <div class="row between">
          <div class="h2">${esc(label)} — ${inn.totals?.runs||0}/${inn.totals?.wkts||0} (${ov} ov)</div>
          <div class="muted">CRR ${crr(inn.totals?.runs||0, inn.totals?.legalBalls||0).toFixed(2)}</div>
        </div>
        <div class="muted">${extrasLine(inn)}</div>
        <div style="margin-top:10px">${battingTable(inn)}</div>
        <div class="h3" style="margin-top:12px">Bowling</div>
        <div>${bowlingTable(inn)}</div>
        <div style="margin-top:10px">${fowLine(inn)}</div>
        ${partnershipsBlock(inn)}
        ${overByOverBlock(inn)}
      </div>
    `;
  }

  function render(doc){
    const match = matchFromDoc(doc);
    const st = ensureState(match, doc);

    const tossLine = (st.meta?.tossWinner && st.meta?.tossDecision)
      ? `${st.meta.tossWinner} won toss & chose ${st.meta.tossDecision}`
      : `Toss: not set`;

    const resLine = st.result?.winner
      ? `Result: ${st.result.winner} ${st.result.method||""} ${st.result.margin||""} ${st.result.mom?` • MOM: ${st.result.mom}`:""}`
      : `Result: -`;

    const oversLimit = st.meta?.oversLimit || (window.DATA?.rules?.overs||10);
    const target = st.target ? `Target: ${st.target}` : "";

    const inn1 = st.inningsData?.["1"] || newInningsObj("A");
    const inn2 = st.inningsData?.["2"] || newInningsObj("B");

    $("#hdr").innerHTML = `
      <div class="row between">
        <div>
          <div class="h2">${esc(match.a)} <span class="muted">vs</span> ${esc(match.b)}</div>
          <div class="muted">${esc(match.group||"")} • ${esc(match.venue||"")} • Overs ${oversLimit}</div>
          <div class="muted tiny">${esc(tossLine)}</div>
        </div>
        <div class="box">
          <div class="muted tiny">${esc(resLine)}</div>
          <div class="muted tiny">${esc(target)}</div>
        </div>
      </div>
    `;

    const cards = [];
    if(inn1 && (inn1.balls?.length || st.innings>=1)) cards.push(inningsCard(`Innings 1`, inn1));
    if(inn2 && (inn2.balls?.length || st.innings>=2)) cards.push(inningsCard(`Innings 2`, inn2));

    const ballList = []
      .concat((inn1.balls||[]).map(b=>Object.assign({_inn:1}, b)))
      .concat((inn2.balls||[]).map(b=>Object.assign({_inn:2}, b)));
    ballList.sort((a,b)=> (b.ts||0)-(a.ts||0));

    const bb = ballList.slice(0,120).map(b=>{
      const over = b.legal ? oversTextFromBalls(b.legalBallIndex||0) : "•";
      const who = `${b.striker||""} vs ${b.bowler||""}`;
      const what = `${ballLabel(b)}${b.wicket?` • ${b.wicket.kind} (${b.wicket.batter||""})`:""}`;
      return `<div class="commrow"><span class="pill">${b._inn===1?"1st":"2nd"}</span> <span class="muted">${esc(over)}</span> • ${esc(who)} • <b>${esc(what)}</b></div>`;
    }).join("");

    const main = document.querySelector("main.container");
    const hdrEl = $("#hdr");
    main.innerHTML = "";
    main.appendChild(hdrEl);

    const wrap = document.createElement("div");
    wrap.innerHTML = cards.join("") + `
      <div class="card">
        <div class="h2">Ball-by-ball (latest first)</div>
        <div class="comm">${bb || `<div class="muted">No balls yet.</div>`}</div>
      </div>
    `;
    while(wrap.firstChild) main.appendChild(wrap.firstChild);
    main.appendChild(banner);
  }

  if(RT.ready){
    subscribeMatch(matchId, (res)=>{
      if(res.ok) render(res.data);
      else {
        banner.style.display="block";
        banner.textContent = res.error || "Unable to load match";
        render(null);
      }
    });
  } else {
    render(null);
  }
})();