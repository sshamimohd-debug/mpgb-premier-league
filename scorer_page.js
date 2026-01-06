(function(){
  const $ = (s, el=document)=>el.querySelector(s);
  const $$ = (s, el=document)=>Array.from(el.querySelectorAll(s));
  const esc = (s)=> (s??"").toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const params = new URLSearchParams(location.search);
  const matchId = params.get("matchId") || "A1";

  $("#backLive").href = `live.html?matchId=${encodeURIComponent(matchId)}`;
  $("#pinCancel").href = `live.html?matchId=${encodeURIComponent(matchId)}`;

  initRealtime();

  const banner = $("#fbBanner");
  if(!RT.ready){
    banner.style.display="block";
    banner.textContent = "Firebase not configured. Scorer console needs Firebase.";
  }

  // Device scorer id (audit trail)
  const deviceKey = "mpgbpl_device_id";
  let deviceId = localStorage.getItem(deviceKey);
  if(!deviceId){
    deviceId = "dev_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
    localStorage.setItem(deviceKey, deviceId);
  }

  // Session lock (per match, per device session)
  const unlockKey = `mpgbpl_pin_ok_${matchId}`;
  let unlocked = sessionStorage.getItem(unlockKey)==="1";

  const pinModal = $("#pinModal");
  function showPin(){
    pinModal.classList.add("show");
    $("#pinInput").value="";
    $("#pinMsg").textContent="";
    $("#pinInput").focus();
  }
  function hidePin(){ pinModal.classList.remove("show"); }

  const wktModal = $("#wktModal");
  const resModal = $("#resModal");
  function showModal(m){ m.classList.add("show"); }
  function hideModal(m){ m.classList.remove("show"); }

  function setMsg(t){ $("#scMsg").textContent = t || ""; }

  function matchFromDoc(doc){
    if(doc?.a && doc?.b) return doc;
    return scheduleToMatches().find(x=>x.matchId===matchId) || {a:"Team A", b:"Team B", venue:"", group:""};
  }

  function ensureState(match, doc){
    const st = doc?.liveState || newLiveState({matchId, a:match.a, b:match.b});
    // ensure team names in meta
    if(!st.meta) st.meta = {};
    if(!st.meta.teamA) st.meta.teamA = match.a;
    if(!st.meta.teamB) st.meta.teamB = match.b;
    // ensure squads from demo (DATA.squads)
    if((!st.squads || !st.squads.A?.length || !st.squads.B?.length) && window.DATA?.squads){
      st.squads = {
        A: (window.DATA.squads[match.a] || []).map(x=>({id:x.id,name:x.name,role:x.role||"",photo:x.photo||null})),
        B: (window.DATA.squads[match.b] || []).map(x=>({id:x.id,name:x.name,role:x.role||"",photo:x.photo||null})),
      };
    }
    // playing XI default first 11 if missing
    if(!st.playingXI || !st.playingXI.A?.length || !st.playingXI.B?.length){
      st.playingXI = {
        A: (st.squads?.A||[]).slice(0,11).map(p=>p.name),
        B: (st.squads?.B||[]).slice(0,11).map(p=>p.name),
      };
    }
    return st;
  }

  function renderXIBoxes(match, st){
    $("#xiTitleA").textContent = match.a;
    $("#xiTitleB").textContent = match.b;

    const boxA = $("#xiA"); const boxB = $("#xiB");
    boxA.innerHTML = ""; boxB.innerHTML = "";

    const mk = (teamKey, players, selected)=>{
      const frag = document.createDocumentFragment();
      players.forEach((p, idx)=>{
        const id = `${teamKey}_${idx}`;
        const row = document.createElement("label");
        row.className = "xiRow";
        row.innerHTML = `<input type="checkbox" data-team="${teamKey}" data-name="${esc(p.name)}" ${selected.includes(p.name) ? "checked":""}> <span>${esc(p.name)}</span> <span class="pill">${esc(p.role||"")}</span>`;
        frag.appendChild(row);
      });
      return frag;
    };

    boxA.appendChild(mk("A", st.squads?.A||[], st.playingXI?.A||[]));
    boxB.appendChild(mk("B", st.squads?.B||[], st.playingXI?.B||[]));
  }

  function fillSelect(el, options, placeholder="Select"){
    el.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = placeholder;
    el.appendChild(ph);
    options.forEach(x=>{
      const opt=document.createElement("option");
      opt.value = x;
      opt.textContent = x;
      el.appendChild(opt);
    });
  }

  function currentBattingSide(st){
    // if meta.battingFirst known, innings decides
    if(st.meta?.battingFirst){
      return st.innings===1 ? st.meta.battingFirst : (st.meta.battingFirst==="A"?"B":"A");
    }
    return st.bat || "A";
  }
  function currentBowlingSide(st){
    return currentBattingSide(st)==="A" ? "B" : "A";
  }

  function refreshOnFieldDropdowns(match, st){
    // toss winner dropdown
    fillSelect($("#tossWinnerSel"), [match.a, match.b], "Select");
    $("#tossWinnerSel").value = st.meta?.tossWinner || "";

    $("#tossDecisionSel").value = st.meta?.tossDecision || "";

    // result winner dropdown
    fillSelect($("#resWinner"), [match.a, match.b, "Tie", "No result"], "Select");
    $("#resWinner").value = st.result?.winner || "";

    // wicket batter dropdown (from current batting XI)
    const batSide = currentBattingSide(st);
    const battingXI = (st.playingXI && st.playingXI[batSide]) ? st.playingXI[batSide] : [];
    fillSelect($("#wktBatter"), battingXI, "Select batter");
    $("#wktBatter").value = (st.striker?.name || battingXI[0] || "");

    // striker/non-striker from batting XI
    fillSelect($("#strikerSel"), battingXI, "Select");
    fillSelect($("#nonSel"), battingXI, "Select");

    $("#strikerSel").value = st.striker?.name || "";
    $("#nonSel").value = st.nonStriker?.name || "";

    // bowler from bowling XI
    const bowlSide = currentBowlingSide(st);
    const bowlingXI = (st.playingXI && st.playingXI[bowlSide]) ? st.playingXI[bowlSide] : [];
    fillSelect($("#bowlerSel"), bowlingXI, "Select");
    $("#bowlerSel").value = st.bowler?.name || "";
  }

  function renderSticky(match, st){
    const innObj = st.inningsData?.[String(st.innings)];
    const ov = oversTextFromBalls(st.balls||0);
    const oversLimit = st.meta?.oversLimit || (window.DATA?.rules?.overs||10);
    const target = st.innings===2 ? (st.target||null) : null;

    let chaseLine = "";
    if(st.innings===2 && target){
      const need = Math.max(0, target - st.runs);
      const ballsRem = oversLimit*6 - (st.balls||0);
      const rrr = ballsRem>0 ? (need / (ballsRem/6)) : 0;
      chaseLine = `<div class="muted">Target ${target} • Need ${need} in ${ballsRem}b • RRR ${rrr.toFixed(2)}</div>`;
    }

    const tossLine = (st.meta?.tossWinner && st.meta?.tossDecision) ? `${st.meta.tossWinner} won toss & chose ${st.meta.tossDecision}` : "Toss not set";

    $("#sticky").innerHTML = `
      <div class="scoreline">
        <div class="h2">${esc(match.a)} <span class="muted">vs</span> ${esc(match.b)}</div>
        <div class="muted">${esc(match.group||"")} • ${esc(match.venue||"")} • ${esc(match.time||"")}</div>
        <div class="muted tiny">${esc(tossLine)}</div>
      </div>
      <div class="bigscore">
        <div class="muted">Innings ${st.innings} • Overs ${oversLimit}</div>
        <div class="runs">${st.runs}<span class="muted">/${st.wkts}</span></div>
        <div class="ov">${ov} ov</div>
        <div class="muted">CRR ${crr(st.runs, st.balls).toFixed(2)}</div>
        ${chaseLine}
      </div>
      <div class="last6">${(st.last6||[]).map(x=>`<span class="ball">${esc(x)}</span>`).join("")}</div>
    `;
  }

  function renderRecent(st){
    const comm = (st.commentary||[]).slice(0,12);
    $("#comm").innerHTML = comm.length ? comm.map(x=>`<div class="commrow">${esc(x)}</div>`).join("") : `<div class="muted">No updates yet.</div>`;
  }

  let lastDoc = null;
  let lastState = null;
  let unsub = ()=>{};
  if(RT.ready){
    unsub = subscribeMatch(matchId, (res)=>{
      if(res.ok){
        lastDoc = res.data;
        const match = matchFromDoc(res.data);
        const st = ensureState(match, res.data);
        lastState = st;
        renderSticky(match, st);
        renderRecent(st);
        renderXIBoxes(match, st);
        refreshOnFieldDropdowns(match, st);

        if(!unlocked) showPin();
      } else {
        banner.style.display="block";
        banner.textContent = res.error || "Unable to load match";
      }
    });
  }

  async function requireUnlock(){
    if(!unlocked){ showPin(); return false; }
    return true;
  }

  // --- PIN Unlock ---
  $("#pinOk").addEventListener("click", async ()=>{
    try{
      const pin = $("#pinInput").value;
      const res = await verifyPin(lastDoc, pin);
      if(res.ok){
        unlocked = true;
        sessionStorage.setItem(unlockKey, "1");
        hidePin();
        setMsg("Unlocked ✅");
      }else{
        $("#pinMsg").textContent = res.msg || "Invalid PIN";
      }
    }catch(e){
      $("#pinMsg").textContent = e.message;
    }
  });

  $("#btnLock").addEventListener("click", ()=>{
    unlocked = false;
    sessionStorage.removeItem(unlockKey);
    showPin();
  });

  // --- Save Toss ---
  $("#btnSaveToss").addEventListener("click", async ()=>{
    if(!await requireUnlock()) return;
    const winner = $("#tossWinnerSel").value;
    const decision = $("#tossDecisionSel").value;
    if(!winner || !decision){ setMsg("Select toss winner + decision"); return; }
    const match = matchFromDoc(lastDoc);
    const battingFirst = (decision==="BAT") ? (winner===match.a ? "A" : "B") : (winner===match.a ? "B" : "A");
    await writeEvent(matchId, { type:"SET_META", tossWinner:winner, tossDecision:decision, battingFirst, teamA:match.a, teamB:match.b, oversLimit: (window.DATA?.rules?.overs||10), bowlerMaxOvers: (window.DATA?.rules?.bowlerMaxOvers||2), scorerId: deviceId });
    await writeEvent(matchId, { type:"SET_SQUADS", squadA: lastState?.squads?.A||[], squadB: lastState?.squads?.B||[], scorerId: deviceId });
    await writeEvent(matchId, { type:"SET_PLAYING_XI", xiA: lastState?.playingXI?.A||[], xiB: lastState?.playingXI?.B||[], scorerId: deviceId });
    setMsg("Toss saved ✅");
  });

  // --- Save XI ---
  $("#btnSaveXI").addEventListener("click", async ()=>{
    if(!await requireUnlock()) return;
    const checks = $$("input[type=checkbox][data-team]");
    const xiA = checks.filter(c=>c.dataset.team==="A" && c.checked).map(c=>c.dataset.name.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'"));
    const xiB = checks.filter(c=>c.dataset.team==="B" && c.checked).map(c=>c.dataset.name.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'"));
    if(xiA.length!==11 || xiB.length!==11){ setMsg("Playing XI must be exactly 11 for both teams"); return; }
    await writeEvent(matchId, { type:"SET_PLAYING_XI", xiA, xiB, scorerId: deviceId });
    setMsg("Playing XI saved ✅");
  });

  // --- Start Innings 1 ---
  $("#btnStartInnings1").addEventListener("click", async ()=>{
    if(!await requireUnlock()) return;
    if(!lastState?.meta?.battingFirst){ setMsg("Set toss first"); return; }
    await writeEvent(matchId, { type:"START_INNINGS", innings: 1, bat: lastState.meta.battingFirst, scorerId: deviceId });
    setMsg("Innings 1 started ✅ (Select on-field players)");
  });

  // Reset current innings (use with caution)
  $("#btnResetInnings").addEventListener("click", async ()=>{
    if(!await requireUnlock()) return;
    if(!confirm("Reset current innings state? (Use only if match not started or major mistake)")) return;
    const match = matchFromDoc(lastDoc);
    await setMatchFields(matchId, { baseState: newLiveState({matchId, a:match.a, b:match.b}), liveState: newLiveState({matchId, a:match.a, b:match.b}), history: [] });
    setMsg("Reset done ✅");
  });

  // --- End Innings ---
  $("#btnEndInnings").addEventListener("click", async ()=>{
    if(!await requireUnlock()) return;
    await writeEvent(matchId, { type:"END_INNINGS", reason:"manual", scorerId: deviceId });
    setMsg("Innings ended ✅");
  });

  // --- Select players ---
  $("#btnSetPlayers").addEventListener("click", async ()=>{
    if(!await requireUnlock()) return;
    const striker = $("#strikerSel").value;
    const nonStriker = $("#nonSel").value;
    const bowler = $("#bowlerSel").value;
    if(!striker || !nonStriker || !bowler){ setMsg("Select striker, non-striker and bowler"); return; }
    if(striker === nonStriker){ setMsg("Striker and non-striker must be different"); return; }
    await writeEvent(matchId, { type:"SET_PLAYERS", striker, nonStriker, bowler, scorerId: deviceId });
    setMsg("Players set ✅");
  });

  $("#btnSwap").addEventListener("click", async ()=>{
    if(!await requireUnlock()) return;
    await writeEvent(matchId, { type:"SWAP_STRIKE", scorerId: deviceId });
  });

  // --- Keypad runs ---
  $$(".k[data-run]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      if(!await requireUnlock()) return;
      const r = parseInt(btn.dataset.run,10)||0;
      await writeEvent(matchId, { type:"BALL", runsBat: r, scorerId: deviceId });
    });
  });

  // Extras: ask runs (default 1)
  $$(".k[data-extra]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      if(!await requireUnlock()) return;
      const ex = btn.dataset.extra;
      const map = { WD:"wd", NB:"nb", BYE:"b", LB:"lb" };
      const extraType = map[ex] || "";
      let val = prompt(`${ex} runs?`, "1");
      if(val==null) return;
      const extraRuns = Math.max(1, Math.min(12, parseInt(val,10)||1));
      await writeEvent(matchId, { type:"BALL", extraType, extraRuns, runsBat:0, scorerId: deviceId });
    });
  });

  // Wicket modal
  $("#btnWicket").addEventListener("click", async ()=>{
    if(!await requireUnlock()) return;
    // populate batter list based on current dropdown
    $("#wktRuns").value = "0";
    $("#wktFielder").value = "";
    showModal(wktModal);
  });
  $("#wktCancel").addEventListener("click", ()=>hideModal(wktModal));
  $("#wktOk").addEventListener("click", async ()=>{
    if(!await requireUnlock()) return;
    const kind = $("#wktKind").value;
    const batter = $("#wktBatter").value || (lastState?.striker?.name||"");
    const fielder = $("#wktFielder").value.trim();
    const runsBat = Math.max(0, Math.min(6, parseInt($("#wktRuns").value||"0",10)||0));
    hideModal(wktModal);
    await writeEvent(matchId, { type:"BALL", runsBat, wicket:{ kind, batter, fielder }, scorerId: deviceId });
  });

  // Undo
  $("#btnUndo").addEventListener("click", async ()=>{
    if(!await requireUnlock()) return;
    await undoLast(matchId);
  });

  // Finalize result modal
  $("#btnFinish").addEventListener("click", async ()=>{
    if(!await requireUnlock()) return;
    showModal(resModal);
  });
  $("#resCancel").addEventListener("click", ()=>hideModal(resModal));
  $("#resOk").addEventListener("click", async ()=>{
    if(!await requireUnlock()) return;
    const match = matchFromDoc(lastDoc);
    const winner = $("#resWinner").value;
    const method = $("#resMethod").value;
    const margin = $("#resMargin").value.trim();
    const mom = $("#resMOM").value.trim();
    const note = $("#resNote").value.trim();

    hideModal(resModal);

    await writeEvent(matchId, { type:"SET_RESULT", winner, method, margin, mom, note, scorerId: deviceId });

    // Persist match status/result for standings page (for standings/NRR)
    const ls = lastState || {};
    const scoreSummary = {
      meta: { battingFirst: ls.meta?.battingFirst || "" },
      innings1: ls.innings1 || null,
      innings2: ls.innings2 || null
    };
    await setMatchFields(matchId, { status: "DONE", result: { winner, method, margin, mom, note }, scoreSummary });
    setMsg("Result saved ✅");
  });

})();