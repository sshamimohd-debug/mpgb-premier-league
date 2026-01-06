(function(){
  const $ = (s, el=document)=>el.querySelector(s);
  const esc = (s)=> (s??"").toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  initRealtime();

  const banner = $("#fbBanner");
  if(!RT.ready){
    banner.style.display="block";
    banner.textContent = "Firebase not configured yet. Matches will open in demo view. Paste Firebase config in firebase.js for realtime multi-scorer.";
  }

  const matches = scheduleToMatches();

  const list = $("#matchList");
  list.innerHTML = matches.map(m=>{
    const urlLive = `live.html?matchId=${encodeURIComponent(m.matchId)}`;
    const urlScore = `scorer.html?matchId=${encodeURIComponent(m.matchId)}`;
    return `
      <div class="mitem">
        <div class="mhead">
          <div class="mtitle">${esc(m.a)} <span class="muted">vs</span> ${esc(m.b)}</div>
          <div class="mbadges">
            <span class="pill">${esc(m.group||"")}</span>
            ${m.status==="LIVE" ? '<span class="pill live">LIVE</span>' : `<span class="pill">${esc(m.status||"")}</span>`}
          </div>
        </div>
        <div class="mmeta">
          <span>${esc(m.venue||"")}</span>
          <span class="dot">•</span>
          <span>${esc(m.time||"")}</span>
        </div>
        <div class="mactions">
          <a class="btn" href="${urlLive}">View Live</a>
          <a class="btn primary" href="${urlScore}">Score (PIN)</a>
          <a class="btn ghost" href="scorecard.html?matchId=${encodeURIComponent(m.matchId)}">Full Scorecard</a>
        </div>
      </div>
    `;
  }).join("");
})();
