(function(){
  const $ = (s, el=document)=>el.querySelector(s);
  const esc = (s)=> (s??"").toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params = new URLSearchParams(location.search);
  const matchId = params.get("matchId") || "m1";

  initRealtime();

  $("#backLive").href = `live.html?matchId=${encodeURIComponent(matchId)}`;

  const banner = $("#fbBanner");
  if(!RT.ready){
    banner.style.display="block";
    banner.textContent = "Firebase not configured. Scorecard will show demo (no realtime).";
  }

  function fmtInn(sum){
    if(!sum) return "-";
    return `${sum.runs}/${sum.wkts} (${oversTextFromBalls(sum.balls)} ov)`;
  }

  function render(doc){
    const m = doc || {};
    const match = (m.a && m.b) ? m : (scheduleToMatches().find(x=>x.matchId===matchId) || {a:"Team A", b:"Team B", venue:"", group:""});
    const st = m.liveState || newLiveState({matchId, a:match.a, b:match.b});
    const scoreSummary = m.scoreSummary || { innings1: st.innings1, innings2: st.innings2, target: st.target, meta: st.meta };
    const result = m.result || null;

    const meta = scoreSummary.meta || st.meta || {};
    const tossLine = (meta.tossWinner)
      ? `Toss: <b>${esc(meta.tossWinner)}</b> • Decision: <b>${esc(meta.tossDecision||"-")}</b> • Bat first: <b>${esc(meta.battingFirst||"-")}</b>`
      : `Toss: <span class="muted">Not set</span>`;

    const resLine = result
      ? `<div class="banner ok" style="margin-top:10px">Result: <b>${esc(result.winner||"-")}</b> ${result.how?`• ${esc(result.how)}`:""}</div>`
      : "";

    const inn1 = fmtInn(scoreSummary.innings1);
    const inn2 = fmtInn(scoreSummary.innings2);
    const tgt = (scoreSummary.target!=null) ? scoreSummary.target : (st.target!=null?st.target:"-");

    $("#hdr").innerHTML = `
      <div class="scoreline">
        <div class="h2">${esc(match.a)} <span class="muted">vs</span> ${esc(match.b)}</div>
        <div class="muted">${esc(match.group||"")} • ${esc(match.venue||"")}</div>
        <div class="muted" style="margin-top:6px">${tossLine}</div>
      </div>

      <div class="grid2" style="margin-top:12px">
        <div class="box">
          <div class="muted">Innings 1</div>
          <div><b>${inn1}</b></div>
        </div>
        <div class="box">
          <div class="muted">Innings 2</div>
          <div><b>${inn2}</b></div>
        </div>
        <div class="box">
          <div class="muted">Target</div>
          <div><b>${esc(String(tgt))}</b></div>
        </div>
        <div class="box">
          <div class="muted">Live now</div>
          <div><b>${st.runs}/${st.wkts}</b> • ${oversTextFromBalls(st.balls)} ov • CRR ${crr(st.runs, st.balls).toFixed(2)}</div>
        </div>
      </div>
      ${resLine}
    `;

    const hist = Array.isArray(m.history) ? m.history.slice().reverse() : [];
    const rows = hist.slice(0, 80).map(ev=>{
      const t = ev.type || "";
      const d = t==="RUN" ? `Run ${ev.runs}`
        : (t==="WD"||t==="NB"||t==="BYE"||t==="LB") ? `${t} +${ev.runs||1}`
        : t==="WICKET" ? `WICKET • ${ev.how||"Wicket"} (${ev.runs||0} run)`
        : t==="SET_PLAYERS" ? `Players • ${ev.striker||""}/${ev.nonStriker||""} • Bowler ${ev.bowler||""}`
        : t==="SET_META" ? `Meta updated`
        : t==="END_OVER" ? `End over`
        : t==="END_INNINGS" ? `End innings`
        : t==="SWAP_STRIKE" ? `Swap strike`
        : esc(JSON.stringify(ev));
      const when = ev.ts ? new Date(ev.ts).toLocaleString() : "";
      return `<div class="commrow"><b>${esc(t)}</b> • ${esc(d)} <span class="muted">${esc(when)}</span></div>`;
    }).join("");
    $("#events").innerHTML = rows || `<div class="muted">No events yet.</div>`;
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
