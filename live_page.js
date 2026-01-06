(function(){
  const $ = (s, el=document)=>el.querySelector(s);
  const esc = (s)=> (s??"").toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params = new URLSearchParams(location.search);
  const matchId = params.get("matchId") || "m1";

  initRealtime();

  $("#scoreBtn").href = `scorer.html?matchId=${encodeURIComponent(matchId)}`;
  $("#fullBtn").href = `scorecard.html?matchId=${encodeURIComponent(matchId)}`;

  const banner = $("#fbBanner");
  if(!RT.ready){
    banner.style.display="block";
    banner.textContent = "Firebase not configured. Live view will show demo (no realtime).";
  }

  function render(doc){
    const m = doc || {};
    const match = m.a && m.b ? m : (scheduleToMatches().find(x=>x.matchId===matchId) || {a:"Team A", b:"Team B", venue:"", group:""});
    const st = (m.liveState) || newLiveState({matchId});

    const innLabel = st.innings===2 ? `Innings 2 • Target ${st.target||"-"}` : `Innings 1`;
    const chase = (st.innings===2 && st.target!=null)
      ? (()=>{
          const need = Math.max(0, (st.target - st.runs));
          const ballsLeft = Math.max(0, (10*6) - st.balls);
          const rrr = ballsLeft>0 ? (need/(ballsLeft/6)) : (need>0?Infinity:0);
          return `<div class="muted">Need ${need} in ${ballsLeft} balls • RRR ${isFinite(rrr)?rrr.toFixed(2):"-"}</div>`;
        })()
      : ``;

    const score = `<div class="scoreline">
      <div class="h2">${esc(match.a)} <span class="muted">vs</span> ${esc(match.b)}</div>
      <div class="muted">${esc(match.group||"")} • ${esc(match.venue||"")}</div>
    </div>
    <div class="bigscore">
      <div class="muted">${esc(innLabel)}</div>
      <div class="runs">${st.runs}<span class="muted">/${st.wkts}</span></div>
      <div class="ov">${oversTextFromBalls(st.balls)} ov</div>
      <div class="muted">CRR ${crr(st.runs, st.balls).toFixed(2)}</div>
      ${chase}
    </div>
    <div class="last6">${(st.last6||[]).map(x=>`<span class="ball">${esc(x)}</span>`).join("")}</div>
    `;
    $("#sticky").innerHTML = score;

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
          <div>WD ${st.extras?.wd||0} • NB ${st.extras?.nb||0} • B ${st.extras?.b||0} • LB ${st.extras?.lb||0}</div>
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
