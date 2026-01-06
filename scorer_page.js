(function(){
  const $ = (s, el=document)=>el.querySelector(s);
  const $$ = (s, el=document)=>Array.from(el.querySelectorAll(s));
  const esc = (s)=> (s??"").toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const params = new URLSearchParams(location.search);
  const matchId = params.get("matchId") || "m1";

  $("#backLive").href = `live.html?matchId=${encodeURIComponent(matchId)}`;
  $("#pinCancel").href = `live.html?matchId=${encodeURIComponent(matchId)}`;

  initRealtime();

  const banner = $("#fbBanner");
  if(!RT.ready){
    banner.style.display="block";
    banner.textContent = "Firebase not configured. Scorer console needs Firebase to sync multiple scorers.";
  }

  // Session lock (per device)
  const key = `mpgbpl_pin_ok_${matchId}`;
  let unlocked = sessionStorage.getItem(key)==="1";

  const pinModal = $("#pinModal");
  function showPin(){
    pinModal.classList.add("show");
    $("#pinInput").value="";
    $("#pinMsg").textContent="";
    $("#pinInput").focus();
  }
  function hidePin(){ pinModal.classList.remove("show"); }

  // Render
  function render(doc){
    const match = doc?.a && doc?.b ? doc : (scheduleToMatches().find(x=>x.matchId===matchId) || {a:"Team A", b:"Team B", venue:"", group:""});
    const st = doc?.liveState || newLiveState({matchId});

    $("#sticky").innerHTML = `
      <div class="scoreline">
        <div class="h2">${esc(match.a)} <span class="muted">vs</span> ${esc(match.b)}</div>
        <div class="muted">${esc(match.group||"")} • ${esc(match.venue||"")}</div>
      </div>
      <div class="bigscore">
        <div class="runs">${st.runs}<span class="muted">/${st.wkts}</span></div>
        <div class="ov">${oversTextFromBalls(st.balls)} ov</div>
        <div class="muted">CRR ${crr(st.runs, st.balls).toFixed(2)}</div>
      </div>
      <div class="last6">${(st.last6||[]).map(x=>`<span class="ball">${esc(x)}</span>`).join("")}</div>
    `;

    const comm = (st.commentary||[]).slice(0,10);
    $("#comm").innerHTML = comm.length ? comm.map(x=>`<div class="commrow">${esc(x)}</div>`).join("") : `<div class="muted">No updates yet.</div>`;
  }

  let lastDoc = null;
  let unsub = ()=>{};
  if(RT.ready){
    unsub = subscribeMatch(matchId, (res)=>{
      if(res.ok){
        lastDoc = res.data;
        render(res.data);
        if(!unlocked) showPin();
      } else {
        banner.style.display="block";
        banner.textContent = res.error || "Unable to load match";
        render(null);
      }
    });
  }else{
    render(null);
  }

  async function requireUnlock(){
    if(!unlocked){ showPin(); return false; }
    return true;
  }

  $("#btnLock").addEventListener("click", ()=>{
    unlocked=false;
    sessionStorage.removeItem(key);
    showPin();
  });

  $("#pinOk").addEventListener("click", async ()=>{
    if(!RT.ready){ $("#pinMsg").textContent="Firebase not configured."; return; }
    const pin = $("#pinInput").value;
    const v = await verifyPin(lastDoc, pin);
    if(v.ok){
      unlocked=true;
      sessionStorage.setItem(key,"1");
      hidePin();
      $("#scMsg").textContent = "Unlocked. You can score now.";
    }else{
      $("#pinMsg").textContent = v.msg;
    }
  });

  // Set players
  $("#btnSetPlayers").addEventListener("click", async ()=>{
    if(!(await requireUnlock())) return;
    const striker = $("#inStriker").value.trim();
    const nonStriker = $("#inNon").value.trim();
    const bowler = $("#inBowler").value.trim();
    if(!striker || !nonStriker || !bowler){ $("#scMsg").textContent="Enter striker, non-striker, bowler."; return; }
    try{
      await writeEvent(matchId, {type:"SET_PLAYERS", striker, nonStriker, bowler});
      $("#scMsg").textContent="Players set.";
    }catch(e){ $("#scMsg").textContent=e.message; }
  });

  $("#btnSwap").addEventListener("click", async ()=>{
    if(!(await requireUnlock())) return;
    try{ await writeEvent(matchId, {type:"SWAP_STRIKE"}); }
    catch(e){ $("#scMsg").textContent=e.message; }
  });
  $("#btnEndOver").addEventListener("click", async ()=>{
    if(!(await requireUnlock())) return;
    try{ await writeEvent(matchId, {type:"END_OVER"}); }
    catch(e){ $("#scMsg").textContent=e.message; }
  });

  // Runs
  $$(".k[data-run]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      if(!(await requireUnlock())) return;
      try{ await writeEvent(matchId, {type:"RUN", runs: parseInt(btn.dataset.run,10)}); }
      catch(e){ $("#scMsg").textContent=e.message; }
    });
  });

  // Extras prompt
  $$(".k[data-extra]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      if(!(await requireUnlock())) return;
      const t = btn.dataset.extra;
      const r = prompt(`${t} runs (e.g., 1, 2, 3...)`, "1");
      if(r===null) return;
      const runs = parseInt(r,10) || 1;
      try{ await writeEvent(matchId, {type:t, runs}); }
      catch(e){ $("#scMsg").textContent=e.message; }
    });
  });

  $("#btnWicket").addEventListener("click", async ()=>{
    if(!(await requireUnlock())) return;
    const how = prompt("Wicket how? (e.g., Bowled, Caught, Run out)", "Wicket");
    if(how===null) return;
    const r = prompt("Runs on that ball (0/1/2/3/4/6)", "0");
    if(r===null) return;
    const runs = parseInt(r,10)||0;
    try{ await writeEvent(matchId, {type:"WICKET", how, runs}); }
    catch(e){ $("#scMsg").textContent=e.message; }
  });

  $("#btnUndo").addEventListener("click", async ()=>{
    if(!(await requireUnlock())) return;
    if(!confirm("Undo last entry?")) return;
    try{ await undoLast(matchId); }
    catch(e){ $("#scMsg").textContent=e.message; }
  });

})();
