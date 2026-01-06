(function(){
  const $ = (s, el=document)=>el.querySelector(s);
  const esc = (s)=> (s??"").toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params = new URLSearchParams(location.search);
  const matchId = params.get("matchId") || "A1";

  initRealtime();

  $("#scoreBtn").href = `scorer.html?matchId=${encodeURIComponent(matchId)}`;
  $("#fullBtn").href = `scorecard.html?matchId=${encodeURIComponent(matchId)}`;

  const banner = $("#fbBanner");
  if(!RT.ready){
    banner.style.display="block";
    banner.textContent = "Firebase not configured. Live view will show demo (no realtime).";
  }

  function matchFromDoc(doc){
    const m = doc || {};
    if(m.a && m.b) return m;
    return scheduleToMatches().find(x=>x.matchId===matchId) || {a:"Team A", b:"Team B", venue:"", group:""};
  }

  function ensureState(match, doc){
    const st = (doc?.liveState) || newLiveState({matchId, a:match.a, b:match.b});
    if(!st.meta) st.meta = {};
    if(!st.meta.teamA) st.meta.teamA = match.a;
    if(!st.meta.teamB) st.meta.teamB = match.b;
    return st;
  }

  function render(doc){
    const match = matchFromDoc(doc);
    const st = ensureState(match, doc);

    const oversLimit = st.meta?.oversLimit || (window.DATA?.rules?.overs||10);
    const innLabel = st.innings===2 ? `Innings 2` : `Innings 1`;
    const target = (st.innings===2 && st.target!=null) ? st.target : null;

    const tossLine = (st.meta?.tossWinner && st.meta?.tossDecision)
      ? `${st.meta.tossWinner} won toss & chose ${st.meta.tossDecision}`
      : `Toss: not set`;

    const chase = (st.innings===2 && target!=null)
      ? (()=>{
          const need = Math.max(0, (target - (st.runs||0)));
          const ballsLeft = Math.max(0, (oversLimit*6) - (st.balls||0));
          const rrr = ballsLeft>0 ? (need/(ballsLeft/6)) : (need>0?Infinity:0);
          return `<div class="muted">Target ${target} • Need ${need} in ${ballsLeft} balls • RRR ${isFinite(rrr)?rrr.toFixed(2):"-"}</div>`;
        })()
      : ``;

    const resultLine = st.result?.winner
      ? `<div class="banner ok" style="margin-top:10px">Result: <b>${esc(st.result.winner)}</b> ${esc(st.result.method||"")} ${esc(st.result.margin||"")} ${st.result.mom?` • MOM: <b>${esc(st.result.mom)}</b>`:""}</div>`
      : ``;

    $("#sticky").innerHTML = `
      <div class="scoreline">
        <div class="h2">${esc(match.a)} <span class="muted">vs</span> ${esc(match.b)}</div>
        <div class="muted">${esc(match.group||"")} • ${esc(match.venue||"")} • ${esc(match.time||"")}</div>
        <div class="muted tiny">${esc(tossLine)}</div>
      </div>
      <div class="bigscore">
        <div class="muted">${esc(innLabel)} • Overs ${oversLimit}</div>
        <div class="runs">${st.runs||0}<span class="muted">/${st.wkts||0}</span></div>
        <div class="ov">${oversTextFromBalls(st.balls||0)} ov</div>
        <div class="muted">CRR ${crr(st.runs||0, st.balls||0).toFixed(2)}</div>
        ${chase}
      </div>
      <div class="last6">${(st.last6||[]).map(x=>`<span class="ball">${esc(x)}</span>`).join("")}</div>
      ${resultLine}
    `;

    $("#mini").innerHTML = `
      <div class="grid2">
        <div class="box">
          <div class="muted">Striker</div>
          <div><b>${esc(st.striker?.name||"-")}</b> • ${st.striker?.r||0}(${st.striker?.b||0})</div>
        </div>
        <div class="box">
          <div class="muted">Non-striker</div>
          <div><b>${esc(st.nonStriker?.name||"-")}</b> • ${st.nonStriker?.r||0}(${st.nonStriker?.b||0})</div>
        </div>
        <div class="box">
          <div class="muted">Bowler</div>
          <div><b>${esc(st.bowler?.name||"-")}</b> • ${oversTextFromBalls(st.bowler?.balls||0)} • R ${st.bowler?.runs||0} • W ${st.bowler?.wkts||0}</div>
        </div>
        <div class="box">
          <div class="muted">Extras</div>
          <div>WD ${st.extras?.wd||0} • NB ${st.extras?.nb||0} • B ${st.extras?.b||0} • LB ${st.extras?.lb||0} • PEN ${st.extras?.pen||0}</div>
        </div>
      </div>
    `;

    const comm = (st.commentary||[]).slice(0,12);
    $("#comm").innerHTML = comm.length ? comm.map(x=>`<div class="commrow">${esc(x)}</div>`).join("") : `<div class="muted">No updates yet.</div>`;
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
  }else{
    render(null);
  }
})();