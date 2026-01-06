(function(){
  const $ = (s, el=document)=>el.querySelector(s);
  const esc = (s)=> (s??"").toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params = new URLSearchParams(location.search);
  const matchId = params.get("matchId") || "m1";

  $("#backLive").href = `live.html?matchId=${encodeURIComponent(matchId)}`;

  initRealtime();

  const banner = $("#fbBanner");
  if(!RT.ready){
    banner.style.display="block";
    banner.textContent = "Firebase not configured. Showing demo scorecard.";
  }

  function render(doc){
    const match = doc?.a && doc?.b ? doc : (scheduleToMatches().find(x=>x.matchId===matchId) || {a:"Team A", b:"Team B", venue:"", group:""});
    const st = doc?.liveState || newLiveState({matchId});
    const hist = Array.isArray(doc?.history) ? doc.history.slice().reverse() : [];

    $("#hdr").innerHTML = `
      <div class="row between">
        <div>
          <div class="h2">${esc(match.a)} <span class="muted">vs</span> ${esc(match.b)}</div>
          <div class="muted">${esc(match.group||"")} • ${esc(match.venue||"")}</div>
        </div>
        <div class="bigscore compact">
          <div class="runs">${st.runs}<span class="muted">/${st.wkts}</span></div>
          <div class="muted">${oversTextFromBalls(st.balls)} ov • CRR ${crr(st.runs, st.balls).toFixed(2)}</div>
        </div>
      </div>
      <div class="last6">${(st.last6||[]).map(x=>`<span class="ball">${esc(x)}</span>`).join("")}</div>
    `;

    $("#events").innerHTML = hist.length
      ? hist.map(ev=>`<div class="commrow"><b>#${ev.seq||""}</b> • ${esc(ev.type)} ${ev.runs!=null?("• "+ev.runs):""} <span class="muted">(${new Date(ev.ts||Date.now()).toLocaleTimeString()})</span></div>`).join("")
      : `<div class="muted">No ball-by-ball events yet.</div>`;
  }

  if(RT.ready){
    subscribeMatch(matchId, (res)=>{
      if(res.ok) render(res.data);
      else { banner.style.display="block"; banner.textContent=res.error||"Unable"; render(null); }
    });
  } else render(null);
})();
