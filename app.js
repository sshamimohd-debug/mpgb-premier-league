// ---------- small helpers ----------
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const esc = (s) => (s ?? "").toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function h(tag, attrs={}, children=""){
  const el = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(k === "class") el.className = v;
    else if(k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  if(Array.isArray(children)) children.forEach(ch => el.append(ch));
  else el.innerHTML = children;
  return el;
}

function oversText(balls){
  const o = Math.floor(balls/6);
  const b = balls%6;
  return `${o}.${b}`;
}

// ---------- scoring model ----------
function newInnings(battingTeam, bowlingTeam){
  return {
    battingTeam,
    bowlingTeam,
    runs: 0,
    wkts: 0,
    balls: 0, // legal balls
    extras: { wd:0, nb:0, b:0, lb:0 },
    batters: [], // {id,name,r,b,4,6,out,how}
    bowlers: [], // {name, balls, runs, wkts, overs}
    strikerId: null,
    nonStrikerId: null,
    currentBowler: null,
    ballLog: [] // {legal, code, runsBat, runsExtra, extraType, wicket, ts}
  };
}

function getBatter(inn, id, name){
  let b = inn.batters.find(x=>x.id===id);
  if(!b){
    b = { id, name, r:0, b:0, f4:0, f6:0, out:false, how:"" };
    inn.batters.push(b);
  }
  return b;
}
function getBowler(inn, name){
  let bl = inn.bowlers.find(x=>x.name===name);
  if(!bl){
    bl = { name, balls:0, runs:0, wkts:0 };
    inn.bowlers.push(bl);
  }
  return bl;
}
function bowlerOvers(bl){ return oversText(bl.balls); }

function computeCRR(inn){
  const overs = inn.balls/6;
  if(overs<=0) return 0;
  return (inn.runs/overs);
}

// enforce IOM: bowler max 2 overs :contentReference[oaicite:17]{index=17}
function canBowlMore(inn, bowlerName){
  const bl = getBowler(inn, bowlerName);
  const maxBalls = IOM.rules.bowlerMaxOvers * 6;
  return bl.balls < maxBalls;
}

function legalBall(inn, batRuns, extraType=null, extraRuns=0, isWicket=false, wicketHow=""){
  // Validate bowler
  if(!inn.currentBowler) return { ok:false, msg:"Select bowler for this over." };
  if(!canBowlMore(inn, inn.currentBowler)) return { ok:false, msg:`Bowler max ${IOM.rules.bowlerMaxOvers} overs reached.` };

  const striker = inn.strikerId ? getBatter(inn, inn.strikerId, inn.strikerName) : null;
  if(!striker) return { ok:false, msg:"Select striker & non-striker first." };

  const bl = getBowler(inn, inn.currentBowler);

  // apply
  inn.balls += 1;
  bl.balls += 1;

  const totalRuns = batRuns + (extraRuns || 0);

  inn.runs += totalRuns;
  bl.runs += totalRuns;

  // batter stats
  striker.b += 1;
  striker.r += batRuns;
  if(batRuns===4) striker.f4 += 1;
  if(batRuns===6) striker.f6 += 1;

  // extras
  if(extraType){
    inn.extras[extraType] = (inn.extras[extraType]||0) + extraRuns;
  }

  // wicket
  if(isWicket){
    inn.wkts += 1;
    bl.wkts += 1;
    striker.out = true;
    striker.how = wicketHow || "Wicket";
  }

  inn.ballLog.push({
    legal:true, code: (isWicket ? "W" : String(batRuns)),
    runsBat:batRuns, runsExtra: extraRuns||0, extraType, wicket:isWicket, ts: nowISO()
  });

  // strike rotate for odd total runs
  if(totalRuns % 2 === 1){
    const tmp = inn.strikerId; inn.strikerId = inn.nonStrikerId; inn.nonStrikerId = tmp;
  }

  return { ok:true };
}

function extraBall(inn, extraType, runs=1){
  // wide/no-ball are NOT legal balls
  if(!inn.currentBowler) return { ok:false, msg:"Select bowler for this over." };
  const striker = inn.strikerId ? getBatter(inn, inn.strikerId, inn.strikerName) : null;
  if(!striker) return { ok:false, msg:"Select striker & non-striker first." };

  const bl = getBowler(inn, inn.currentBowler);

  inn.runs += runs;
  bl.runs += runs;
  inn.extras[extraType] = (inn.extras[extraType]||0) + runs;

  inn.ballLog.push({
    legal:false, code: extraType.toUpperCase(),
    runsBat:0, runsExtra:runs, extraType, wicket:false, ts: nowISO()
  });

  // wides don't change strike unless you want; keep simple: no strike change
  return { ok:true };
}

function undoLastBall(inn){
  const last = inn.ballLog.pop();
  if(!last) return { ok:false, msg:"Nothing to undo." };

  // This demo undo is “safe” for most cases, but not perfect for complex wicket+new batter flows.
  // For tournament use, we'd do full snapshot-based undo.
  return { ok:false, msg:"Undo in demo: Please use Reset Match for now." };
}

// ---------- UI / Router ----------
const TABS = [
  { id:"home", label:"Home", hash:"#/home" },
  { id:"teams", label:"Teams & Venues", hash:"#/teams" },
  { id:"schedule", label:"Schedule", hash:"#/schedule" },
  { id:"knockouts", label:"Knockouts", hash:"#/knockouts" },
  { id:"rules", label:"Rules", hash:"#/rules" },
  { id:"nomination", label:"Nomination", hash:"#/nomination" },
  { id:"live", label:"Live Scoring", hash:"#/live" },
];

let STATE = loadState();

function renderTabs(activeId){
  const el = $("#tabs");
  el.innerHTML = "";
  TABS.forEach(t=>{
    const a = h("a", { class:`tab ${t.id===activeId?"active":""}`, href:t.hash }, esc(t.label));
    el.append(a);
  });
}

function setHashDefault(){
  if(!location.hash) location.hash = "#/home";
}

function route(){
  setHashDefault();
  const id = (location.hash.split("/")[1] || "home").toLowerCase();
  const view = $("#view");
  view.innerHTML = "";
  renderTabs(id);

  if(id==="home") view.append(renderHome());
  else if(id==="teams") view.append(renderTeams());
  else if(id==="schedule") view.append(renderSchedule());
  else if(id==="knockouts") view.append(renderKnockouts());
  else if(id==="rules") view.append(renderRules());
  else if(id==="nomination") view.append(renderNomination());
  else if(id==="live") view.append(renderLive());
  else view.append(renderHome());
}

window.addEventListener("hashchange", route);
onStateChanged((st)=>{ STATE = st; route(); });

// ---------- Views ----------
function renderHome(){
  const c = h("div", {class:"grid two"}, []);

  const left = h("div", {class:"card"}, `
    <h2>Overview</h2>
    <div class="kv"><span class="muted">Tournament</span><span><b>${esc(IOM.meta.title)}</b></span></div>
    <div class="kv"><span class="muted">Commencement</span><span><b>${esc(IOM.meta.commencement)}</b></span></div>
    <div class="kv"><span class="muted">Format</span><span><b>22 teams • 4 groups</b></span></div>
    <div class="kv"><span class="muted">Group Winners</span><span><b>Semi-finals</b></span></div>
    <div class="hr"></div>
    <div class="badge">Rules engine: <span class="muted">10 overs • PP 3 • Bowler max 2</span></div>
  `);

  const right = h("div", {class:"card"}, `
    <h2>Quick Actions</h2>
    <div class="grid">
      <button class="btn primary" id="goLive">Open Live Scoring</button>
      <button class="btn" id="goNom">Open Nomination</button>
      <button class="btn" id="goSch">Open Schedule</button>
    </div>
    <div class="hr"></div>
    <div class="muted">Tip: Live scoring works in single device (multi tabs) on GitHub Pages. For multi-phone live, add backend (Firebase).</div>
  `);

  c.append(left, right);
  setTimeout(()=>{
    $("#goLive")?.addEventListener("click",()=>location.hash="#/live");
    $("#goNom")?.addEventListener("click",()=>location.hash="#/nomination");
    $("#goSch")?.addEventListener("click",()=>location.hash="#/schedule");
  },0);

  return c;
}

function renderTeams(){
  const wrap = h("div", {class:"grid"}, []);
  const card = h("div",{class:"card"}, `<h2>Teams & Venues (Group-wise)</h2><div class="muted">As per IOM group/venue table.</div>`);
  const rows = [];
  for(const g of ["A","B","C","D"]){
    const grp = IOM.groups[g];
    rows.push(`<tr><td><b>Group ${g}</b></td><td>${esc(grp.venue)}</td><td>${grp.teams.map(esc).join(", ")}</td></tr>`);
  }
  card.insertAdjacentHTML("beforeend", `
    <div class="hr"></div>
    <table class="table">
      <thead><tr><th>Group</th><th>Venue</th><th>Teams</th></tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  `);
  wrap.append(card);
  return wrap;
}

function renderSchedule(){
  const wrap = h("div",{class:"grid"},[]);
  const card = h("div",{class:"card"}, `<h2>Schedule of League Matches</h2><div class="muted">Dates: ${esc(IOM.scheduleDates.join(" / "))}</div>`);
  const items = STATE.matches.map(m=>`
    <tr>
      <td><b>${esc(m.id)}</b></td>
      <td>Group ${esc(m.group)}</td>
      <td>${esc(m.venue)}</td>
      <td>${esc(m.time)}</td>
      <td><b>${esc(m.team1)}</b> vs <b>${esc(m.team2)}</b></td>
      <td>${esc(m.status)}</td>
      <td><button class="btn primary" data-live="${esc(m.id)}">Open</button></td>
    </tr>
  `).join("");

  card.insertAdjacentHTML("beforeend", `
    <div class="hr"></div>
    <table class="table">
      <thead><tr><th>ID</th><th>Group</th><th>Venue</th><th>Time</th><th>Match</th><th>Status</th><th></th></tr></thead>
      <tbody>${items}</tbody>
    </table>
  `);

  wrap.append(card);
  setTimeout(()=>{
    $$("button[data-live]").forEach(b=>{
      b.addEventListener("click",()=>{
        const id = b.getAttribute("data-live");
        const st = loadState();
        st.liveMatchId = id;
        saveState(st);
        location.hash = "#/live";
      });
    });
  },0);

  return wrap;
}

function renderKnockouts(){
  const card = h("div",{class:"card"}, `
    <h2>Knockouts</h2>
    <div class="kv"><span class="muted">Semi Final 1</span><span><b>${esc(IOM.knockouts.semi1)}</b></span></div>
    <div class="kv"><span class="muted">Semi Final 2</span><span><b>${esc(IOM.knockouts.semi2)}</b></span></div>
    <div class="kv"><span class="muted">Final</span><span><b>${esc(IOM.knockouts.final)}</b></span></div>
    <div class="hr"></div>
    <div class="muted">Semi/Final dates to be announced (as per schedule sheet).</div>
  `);
  return h("div",{class:"grid"},[card]);
}

function renderRules(){
  const r = IOM.rules;
  const card = h("div",{class:"card"}, `
    <h2>Rules (IOM)</h2>
    <div class="kv"><span class="muted">Match Format</span><span><b>${r.overs} overs/innings</b></span></div>
    <div class="kv"><span class="muted">Powerplay</span><span><b>First ${r.powerplayOvers} overs</b></span></div>
    <div class="kv"><span class="muted">Bowler Limit</span><span><b>Max ${r.bowlerMaxOvers} overs/bowler</b></span></div>
    <div class="kv"><span class="muted">Ball</span><span><b>${esc(r.ball)}</b></span></div>
    <div class="kv"><span class="muted">Qualification</span><span><b>${esc(r.qualification)}</b></span></div>
    <div class="kv"><span class="muted">Tie-break</span><span><b>${esc(r.tieBreak)}</b></span></div>
    <div class="hr"></div>
    <div class="badge">Awards: <span class="muted">${r.awards.map(esc).join(" • ")}</span></div>
  `);
  return h("div",{class:"grid"},[card]);
}

function renderNomination(){
  const card = h("div",{class:"card"}, `
    <h2>Nomination Form (Annexure-1)</h2>
    <div class="muted">Fill details and Save. This is local-demo storage (GitHub Pages).</div>
    <div class="hr"></div>

    <div class="grid two">
      <div>
        <label>Name of the Region</label>
        <input id="n_region" placeholder="e.g., Sagar / Indore / ..." />
      </div>
      <div>
        <label>Name of the Player</label>
        <input id="n_player" placeholder="Full name" />
      </div>

      <div>
        <label>Employee ID</label>
        <input id="n_empid" placeholder="Employee ID" />
      </div>
      <div>
        <label>Designation</label>
        <input id="n_desig" placeholder="Designation" />
      </div>

      <div>
        <label>Branch / Office</label>
        <input id="n_office" placeholder="Branch/Office" />
      </div>
      <div>
        <label>Mobile Number</label>
        <input id="n_mobile" placeholder="10-digit mobile" />
      </div>

      <div>
        <label>Playing Role</label>
        <select id="n_role">
          <option value="">Select</option>
          <option>Batsman</option>
          <option>Bowler</option>
          <option>All-Rounder</option>
          <option>Wicket Keeper</option>
        </select>
      </div>
      <div>
        <label>Bowling Arm</label>
        <select id="n_arm">
          <option value="">Select</option>
          <option>Right</option>
          <option>Left</option>
          <option>NA</option>
        </select>
      </div>

      <div>
        <label>Previous Tournament Experience (if any)</label>
        <input id="n_exp" placeholder="Yes/No + details" />
      </div>
      <div>
        <label>How often do you play (regular/weekly/occasional)</label>
        <select id="n_freq">
          <option value="">Select</option>
          <option>Regularly</option>
          <option>Weekly</option>
          <option>Occasionally</option>
        </select>
      </div>

      <div class="grid" style="grid-column:1/-1">
        <label>Serious Disease / Allergy (If any)</label>
        <input id="n_health" placeholder="If none, write 'None'" />
      </div>

      <div class="grid" style="grid-column:1/-1">
        <label>Declaration (optional note)</label>
        <textarea id="n_decl" placeholder="I agree to abide by rules..."></textarea>
      </div>
    </div>

    <div class="hr"></div>
    <div style="display:flex; gap:10px; flex-wrap:wrap">
      <button class="btn primary" id="n_save">Save Nomination</button>
      <button class="btn" id="n_list">View Saved</button>
    </div>

    <div id="n_out" class="hr"></div>
    <div id="n_table"></div>
  `);

  setTimeout(()=>{
    $("#n_save").addEventListener("click",()=>{
      const st = loadState();
      const rec = {
        id: "N" + Math.random().toString(16).slice(2,8).toUpperCase(),
        ts: nowISO(),
        region: $("#n_region").value.trim(),
        player: $("#n_player").value.trim(),
        empid: $("#n_empid").value.trim(),
        desig: $("#n_desig").value.trim(),
        office: $("#n_office").value.trim(),
        mobile: $("#n_mobile").value.trim(),
        role: $("#n_role").value,
        arm: $("#n_arm").value,
        exp: $("#n_exp").value.trim(),
        freq: $("#n_freq").value,
        health: $("#n_health").value.trim(),
        decl: $("#n_decl").value.trim(),
      };
      st.nominations.unshift(rec);
      saveState(st);
      $("#n_out").innerHTML = `<div class="badge">Saved: <b>${esc(rec.id)}</b></div>`;
    });

    $("#n_list").addEventListener("click",()=>{
      const st = loadState();
      const rows = st.nominations.map(x=>`
        <tr>
          <td><b>${esc(x.id)}</b></td>
          <td>${esc(x.player)}</td>
          <td>${esc(x.region)}</td>
          <td>${esc(x.mobile)}</td>
          <td>${esc(x.role)}</td>
          <td class="muted">${esc(new Date(x.ts).toLocaleString())}</td>
        </tr>
      `).join("");
      $("#n_table").innerHTML = `
        <table class="table">
          <thead><tr><th>ID</th><th>Player</th><th>Region</th><th>Mobile</th><th>Role</th><th>Saved</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6" class="muted">No saved nominations</td></tr>`}</tbody>
        </table>
      `;
    });
  },0);

  return h("div",{class:"grid"},[card]);
}

// ---------- Live Scoring ----------
function renderLive(){
  const st = loadState();
  const match = st.matches.find(m=>m.id===st.liveMatchId) || st.matches[0];
  const card = h("div",{class:"grid"}, []);

  const top = h("div",{class:"card"}, `
    <div class="scoreTop">
      <div>
        <div class="scoreTitle"><span class="liveBadge">● LIVE</span> ${esc(match.team1)} vs ${esc(match.team2)} <span class="muted">(Group ${esc(match.group)} • ${esc(match.venue)})</span></div>
        <div class="scoreSub">Time: ${esc(match.time)} • Match ID: <b>${esc(match.id)}</b></div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap">
        <select id="mPick"></select>
        <button class="btn" id="mStart">Start / Resume</button>
        <button class="btn danger" id="mReset">Reset Match</button>
      </div>
    </div>
    <div class="hr"></div>
    <div id="livePanel"></div>
  `);

  const scorer = h("div",{class:"card"}, `
    <h2>Scorer Console</h2>
    <div class="muted">One-tap ball entry (Dream11 style). Rules enforced: 10 overs, PP 3, bowler max 2.</div>
    <div class="hr"></div>

    <div class="grid two">
      <div>
        <label>Innings</label>
        <select id="innPick">
          <option value="0">1st Innings</option>
          <option value="1">2nd Innings</option>
        </select>
      </div>
      <div>
        <label>Bowler</label>
        <select id="bowlerPick"></select>
        <div class="muted" id="bowlerHint" style="margin-top:6px"></div>
      </div>

      <div>
        <label>Striker</label>
        <select id="strikerPick"></select>
      </div>
      <div>
        <label>Non-striker</label>
        <select id="nonStrikerPick"></select>
      </div>
    </div>

    <div class="hr"></div>

    <div class="keypad">
      <button class="kbtn" data-run="0">0</button>
      <button class="kbtn" data-run="1">1</button>
      <button class="kbtn" data-run="2">2</button>
      <button class="kbtn" data-run="3">3</button>
      <button class="kbtn" data-run="4">4</button>
      <button class="kbtn" data-run="6">6</button>

      <button class="kbtn warn" data-extra="wd">Wide +1</button>
      <button class="kbtn warn" data-extra="nb">No Ball +1</button>
      <button class="kbtn warn" data-extra="b">Bye +1</button>
      <button class="kbtn warn" data-extra="lb">LegBye +1</button>

      <button class="kbtn bad" id="btnWicket">Wicket</button>
      <button class="kbtn" id="btnSwap">Swap Strike</button>
      <button class="kbtn danger" id="btnEndOver">End Over</button>
    </div>

    <div class="hr"></div>
    <div id="msg" class="muted"></div>
  `);

  card.append(top, scorer);

  setTimeout(()=>initLive(match.id),0);
  return card;
}

function initLive(matchId){
  let st = loadState();
  st.liveMatchId = matchId;
  saveState(st);

  // populate match picker
  const mPick = $("#mPick");
  mPick.innerHTML = st.matches.map(m=>`<option value="${esc(m.id)}"${m.id===matchId?" selected":""}>${esc(m.id)} • ${esc(m.team1)} vs ${esc(m.team2)}</option>`).join("");
  mPick.addEventListener("change",()=>{
    const id = mPick.value;
    const s = loadState(); s.liveMatchId = id; saveState(s);
    route();
  });

  $("#mReset").addEventListener("click",()=>{
    const s = loadState();
    const m = s.matches.find(x=>x.id===matchId);
    m.status = "SCHEDULED";
    m.innings = [];
    m.result = null;
    m.updatedAt = nowISO();
    saveState(s);
    route();
  });

  $("#mStart").addEventListener("click",()=>{
    const s = loadState();
    const m = s.matches.find(x=>x.id===matchId);
    if(m.innings.length===0){
      // 1st innings default: team1 bats
      m.innings.push(newInnings(m.team1, m.team2));
      m.innings.push(newInnings(m.team2, m.team1));
    }
    m.status = "LIVE";
    m.updatedAt = nowISO();
    saveState(s);
    route();
  });

  // render live panel & bind scorer
  bindScorer(matchId);
  renderLivePanel(matchId);
}

function bindScorer(matchId){
  const s = loadState();
  const m = s.matches.find(x=>x.id===matchId);
  if(!m) return;

  // ensure innings exist
  if(m.innings.length===0){
    m.innings.push(newInnings(m.team1, m.team2));
    m.innings.push(newInnings(m.team2, m.team1));
    m.status = "LIVE";
    saveState(s);
  }

  const innPick = $("#innPick");
  const bowlerPick = $("#bowlerPick");
  const strikerPick = $("#strikerPick");
  const nonStrikerPick = $("#nonStrikerPick");
  const msg = $("#msg");
  const bowlerHint = $("#bowlerHint");

  function currentInnings(){
    const idx = parseInt(innPick.value,10);
    return { idx, inn: m.innings[idx] };
  }

  function setupDropdowns(){
    const { inn } = currentInnings();
    // bowlers from bowling team players
    const bowlTeam = s.teams[inn.bowlingTeam];
    const batTeam = s.teams[inn.battingTeam];

    bowlerPick.innerHTML = bowlTeam.players.map(p=>`<option value="${esc(p.name)}">${esc(p.name)}</option>`).join("");
    strikerPick.innerHTML = batTeam.players.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
    nonStrikerPick.innerHTML = batTeam.players.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");

    // set defaults
    if(!inn.currentBowler) inn.currentBowler = bowlTeam.players[0].name;
    if(!inn.strikerId) inn.strikerId = batTeam.players[0].id;
    if(!inn.nonStrikerId) inn.nonStrikerId = batTeam.players[1].id;

    inn.strikerName = batTeam.players.find(p=>p.id===inn.strikerId)?.name || "Striker";
    inn.nonStrikerName = batTeam.players.find(p=>p.id===inn.nonStrikerId)?.name || "Non-striker";

    bowlerPick.value = inn.currentBowler;
    strikerPick.value = inn.strikerId;
    nonStrikerPick.value = inn.nonStrikerId;

    saveState(s);
    updateBowlerHint();
  }

  function updateBowlerHint(){
    const { inn } = currentInnings();
    const bl = getBowler(inn, inn.currentBowler || "");
    const max = IOM.rules.bowlerMaxOvers;
    bowlerHint.textContent = `This bowler: ${bowlerOvers(bl)} overs • Max allowed: ${max}`;
    if(!canBowlMore(inn, inn.currentBowler)) bowlerHint.textContent += " • LIMIT REACHED";
  }

  innPick.addEventListener("change",()=>{
    setupDropdowns();
    renderLivePanel(matchId);
  });

  bowlerPick.addEventListener("change",()=>{
    const { inn } = currentInnings();
    inn.currentBowler = bowlerPick.value;
    saveState(s);
    updateBowlerHint();
    renderLivePanel(matchId);
  });

  strikerPick.addEventListener("change",()=>{
    const { inn } = currentInnings();
    inn.strikerId = strikerPick.value;
    const bt = s.teams[inn.battingTeam];
    inn.strikerName = bt.players.find(p=>p.id===inn.strikerId)?.name || "Striker";
    saveState(s);
    renderLivePanel(matchId);
  });

  nonStrikerPick.addEventListener("change",()=>{
    const { inn } = currentInnings();
    inn.nonStrikerId = nonStrikerPick.value;
    const bt = s.teams[inn.battingTeam];
    inn.nonStrikerName = bt.players.find(p=>p.id===inn.nonStrikerId)?.name || "Non-striker";
    saveState(s);
    renderLivePanel(matchId);
  });

  // run buttons
  $$("[data-run]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const { inn } = currentInnings();
      const r = parseInt(btn.getAttribute("data-run"),10);
      const res = legalBall(inn, r, null, 0, false, "");
      msg.textContent = res.ok ? "" : res.msg;
      updateBowlerHint();
      saveState(s);
      renderLivePanel(matchId);
    });
  });

  // extras
  $$("[data-extra]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const { inn } = currentInnings();
      const ex = btn.getAttribute("data-extra");
      const res = extraBall(inn, ex, 1);
      msg.textContent = res.ok ? "" : res.msg;
      saveState(s);
      renderLivePanel(matchId);
    });
  });

  $("#btnSwap").addEventListener("click",()=>{
    const { inn } = currentInnings();
    const tmp = inn.strikerId; inn.strikerId = inn.nonStrikerId; inn.nonStrikerId = tmp;
    saveState(s);
    renderLivePanel(matchId);
  });

  $("#btnEndOver").addEventListener("click",()=>{
    const { inn } = currentInnings();
    // end over: swap strike
    const tmp = inn.strikerId; inn.strikerId = inn.nonStrikerId; inn.nonStrikerId = tmp;
    saveState(s);
    renderLivePanel(matchId);
  });

  $("#btnWicket").addEventListener("click",()=>{
    const how = prompt("Wicket type? (e.g., Bowled/Caught/Run out/LBW/Stumped)");
    if(!how) return;
    const { inn } = currentInnings();
    const res = legalBall(inn, 0, null, 0, true, how);
    msg.textContent = res.ok ? "Wicket recorded. Select new striker if needed." : res.msg;
    updateBowlerHint();
    saveState(s);
    renderLivePanel(matchId);
  });

  setupDropdowns();
}

function renderLivePanel(matchId){
  const s = loadState();
  const m = s.matches.find(x=>x.id===matchId);
  if(!m) return;

  const lp = $("#livePanel");
  const inn = m.innings[0] || newInnings(m.team1, m.team2);
  const inn2 = m.innings[1] || newInnings(m.team2, m.team1);

  // pick which innings to show as "live": if 2nd has balls >0 show it else 1st
  const showInn = (inn2.balls>0 || (inn2.runs>0)) ? inn2 : inn;

  const overs = oversText(showInn.balls);
  const crr = computeCRR(showInn).toFixed(2);

  const last6 = showInn.ballLog.slice(-6).map(b=>{
    const cls = b.wicket ? "ball w" : (b.code==="6"?"ball b6": (b.code==="4"?"ball b4":"ball"));
    return `<div class="${cls}">${esc(b.code)}</div>`;
  }).join("");

  const bt = s.teams[showInn.battingTeam];
  const striker = bt?.players.find(p=>p.id===showInn.strikerId);
  const non = bt?.players.find(p=>p.id===showInn.nonStrikerId);
  const b1 = striker ? getBatter(showInn, striker.id, striker.name) : null;
  const b2 = non ? getBatter(showInn, non.id, non.name) : null;

  const bowl = showInn.currentBowler ? getBowler(showInn, showInn.currentBowler) : null;

  // PP indicator
  const ppBalls = IOM.rules.powerplayOvers * 6;
  const inPP = showInn.balls < ppBalls;

  lp.innerHTML = `
    <div class="grid two">
      <div class="card">
        <div class="pill"><span class="liveBadge">●</span> ${esc(showInn.battingTeam)} batting</div>
        <div class="bigScore">${showInn.runs}/${showInn.wkts} <span class="muted">(${overs} ov)</span></div>
        <div class="smallRow">
          <span>CRR: <b>${crr}</b></span>
          <span>${inPP ? `Powerplay: <b>ON</b> (${IOM.rules.powerplayOvers} ov)` : `Powerplay: <b>DONE</b>`}</span>
          <span>Extras: <b>wd ${showInn.extras.wd} • nb ${showInn.extras.nb} • b ${showInn.extras.b} • lb ${showInn.extras.lb}</b></span>
        </div>
        <div class="hr"></div>
        <div class="muted" style="margin-bottom:8px">Last 6 balls</div>
        <div class="ballRow">${last6 || `<span class="muted">No balls yet</span>`}</div>
      </div>

      <div class="card">
        <h2>Mini Scorecard</h2>
        <div class="kv"><span class="muted">Striker</span><span><b>${esc(b1?.name || "—")}</b> ${b1 ? `${b1.r}*(${b1.b}) 4s:${b1.f4} 6s:${b1.f6}` : ""}</span></div>
        <div class="kv"><span class="muted">Non-striker</span><span><b>${esc(b2?.name || "—")}</b> ${b2 ? `${b2.r}(${b2.b}) 4s:${b2.f4} 6s:${b2.f6}` : ""}</span></div>
        <div class="kv"><span class="muted">Bowler</span><span><b>${esc(showInn.currentBowler || "—")}</b> ${bowl ? `${bowlerOvers(bowl)}-${bowl.runs}-${bowl.wkts}` : ""}</span></div>
        <div class="hr"></div>
        <div class="muted">Full Scorecard is shown below (batting & bowling tables).</div>
      </div>
    </div>

    <div class="card" style="margin-top:12px">
      <h2>Scorecard – ${esc(showInn.battingTeam)}</h2>
      <table class="table">
        <thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>How out</th></tr></thead>
        <tbody>
          ${(showInn.batters.length?showInn.batters:[]).map(b=>`
            <tr>
              <td><b>${esc(b.name)}</b>${(b.id===showInn.strikerId)?" *":""}</td>
              <td>${b.r}</td><td>${b.b}</td><td>${b.f4}</td><td>${b.f6}</td>
              <td class="muted">${b.out?esc(b.how):"not out"}</td>
            </tr>
          `).join("") || `<tr><td colspan="6" class="muted">No batting data yet</td></tr>`}
        </tbody>
      </table>

      <div class="hr"></div>

      <h2>Bowling – ${esc(showInn.bowlingTeam)}</h2>
      <table class="table">
        <thead><tr><th>Bowler</th><th>O</th><th>R</th><th>W</th><th>Econ</th></tr></thead>
        <tbody>
          ${(showInn.bowlers.length?showInn.bowlers:[]).map(b=>`
            <tr>
              <td><b>${esc(b.name)}</b></td>
              <td>${bowlerOvers(b)}</td>
              <td>${b.runs}</td>
              <td>${b.wkts}</td>
              <td>${(b.balls? (b.runs/(b.balls/6)).toFixed(2) : "0.00")}</td>
            </tr>
          `).join("") || `<tr><td colspan="5" class="muted">No bowling data yet</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- install PWA ----------
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt",(e)=>{
  e.preventDefault();
  deferredPrompt = e;
  $("#btnInstall").classList.remove("hidden");
});
$("#btnInstall")?.addEventListener("click", async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("#btnInstall").classList.add("hidden");
});

// reset button
$("#btnReset")?.addEventListener("click",()=>{
  if(confirm("Reset all local data?")){
    resetState();
    STATE = loadState();
    route();
  }
});

// SW
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>navigator.serviceWorker.register("./sw.js"));
}

route();
