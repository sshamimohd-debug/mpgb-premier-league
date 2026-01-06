// ---------- helpers ----------
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const esc = (s) => (s ?? "").toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function nowISO(){ return new Date().toISOString(); }
function oversText(balls){ const o=Math.floor(balls/6), b=balls%6; return `${o}.${b}`; }
function deepClone(x){ return JSON.parse(JSON.stringify(x)); }

function toast(msg){
  let t = $("#toast");
  if(!t){
    t = document.createElement("div");
    t.id="toast";
    t.className="toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 2200);
}

function clampInt(v, min, max, fallback=min){
  const n = parseInt(v,10);
  if(isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// ---------- Router Tabs ----------
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
    const a = document.createElement("a");
    a.className = `tab ${t.id===activeId?"active":""}`;
    a.href = t.hash;
    a.textContent = t.label;
    el.append(a);
  });
}
function setHashDefault(){ if(!location.hash) location.hash = "#/home"; }

// ---------- scoring model ----------
function newInnings(battingTeam, bowlingTeam){
  return {
    battingTeam, bowlingTeam,
    runs:0, wkts:0, balls:0,
    extras:{ wd:0, nb:0, b:0, lb:0 },
    batters:[], bowlers:[],
    strikerId:null, nonStrikerId:null,
    strikerName:"", nonStrikerName:"",
    currentBowler:null,
    ballLog:[],          // {legal, label, runsBat, extraType, extraRuns, wicket, wicketHow, ts, freeHitUsed?}
    snapshots:[],        // undo stack (last 30)
    freeHitNext:false    // after NB -> next legal ball is free hit
  };
}

function getBatter(inn, id, name){
  let b = inn.batters.find(x=>x.id===id);
  if(!b){
    b = { id, name, r:0, b:0, f4:0, f6:0, out:false, how:"not out" };
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
  return inn.runs/overs;
}
function canBowlMore(inn, bowlerName){
  const bl = getBowler(inn, bowlerName);
  const maxBalls = IOM.rules.bowlerMaxOvers * 6;
  return bl.balls < maxBalls;
}
function pushSnapshot(inn){
  const snap = deepClone(inn);
  snap.snapshots = [];
  inn.snapshots.push(snap);
  if(inn.snapshots.length > 30) inn.snapshots.shift();
}
function restoreSnapshot(inn){
  const snap = inn.snapshots.pop();
  if(!snap) return {ok:false, msg:"Nothing to undo"};
  const keep = inn.snapshots; // already popped
  Object.keys(inn).forEach(k=>delete inn[k]);
  Object.assign(inn, snap);
  inn.snapshots = keep;
  return {ok:true};
}

function ensureReady(inn){
  if(!inn.currentBowler) return {ok:false, msg:"Select bowler."};
  if(!inn.strikerId || !inn.nonStrikerId) return {ok:false, msg:"Select striker & non-striker."};
  if(!canBowlMore(inn, inn.currentBowler)) return {ok:false, msg:`Bowler max ${IOM.rules.bowlerMaxOvers} overs reached.`};
  return {ok:true};
}
function rotateStrike(inn){
  const t = inn.strikerId; inn.strikerId = inn.nonStrikerId; inn.nonStrikerId = t;
  const tn = inn.strikerName; inn.strikerName = inn.nonStrikerName; inn.nonStrikerName = tn;
}

// Free-hit simplified rule for tournament UI:
// - NB => next legal ball is FREE HIT (inn.freeHitNext=true)
// - On FREE HIT, only RUN OUT is allowed as wicket type (others ignored)
function isWicketAllowed(inn, wicketType){
  if(!inn.freeHitNext) return true;
  // free hit active for next legal delivery; allow only run out (common simplified rule)
  const t = (wicketType||"").toLowerCase();
  return t.includes("run") && t.includes("out");
}

function addLegalBall(inn, batRuns, extraType=null, extraRuns=0, wicket=false, wicketHow=""){
  const ok = ensureReady(inn);
  if(!ok.ok) return ok;

  pushSnapshot(inn);

  const striker = getBatter(inn, inn.strikerId, inn.strikerName);
  const bl = getBowler(inn, inn.currentBowler);

  // Apply FREE HIT for this legal delivery if flagged
  const freeHitUsed = inn.freeHitNext === true;
  inn.freeHitNext = false;

  inn.balls += 1;
  bl.balls += 1;

  const total = batRuns + (extraRuns||0);
  inn.runs += total;
  bl.runs += total;

  striker.b += 1;
  striker.r += batRuns;
  if(batRuns===4) striker.f4 += 1;
  if(batRuns===6) striker.f6 += 1;

  if(extraType){
    inn.extras[extraType] = (inn.extras[extraType]||0) + (extraRuns||0);
  }

  let appliedWicket = false;
  let appliedHow = wicketHow || "Wicket";

  if(wicket){
    // check free hit wicket rule
    if(freeHitUsed && !isWicketAllowed({freeHitNext:false}, appliedHow)){
      // not allowed → ignore wicket
      appliedWicket = false;
      appliedHow = "Free Hit (wicket not allowed)";
    }else{
      appliedWicket = true;
      inn.wkts += 1;
      bl.wkts += 1;
      striker.out = true;
      striker.how = appliedHow;
    }
  }

  const label = appliedWicket ? "W" : String(batRuns);
  inn.ballLog.push({
    legal:true,
    label,
    runsBat:batRuns,
    extraType,
    extraRuns:extraRuns||0,
    wicket:appliedWicket,
    wicketHow: appliedHow,
    freeHitUsed,
    ts: nowISO()
  });

  if(total % 2 === 1) rotateStrike(inn);
  return {ok:true};
}

// Extras like WD/NB can include runs: WD+5, NB+2 etc
function addExtraBall(inn, extraType, extraRuns){
  const ok = ensureReady(inn);
  if(!ok.ok) return ok;

  extraRuns = clampInt(extraRuns, 1, 12, 1);

  // WD/NB are NOT legal balls. Byes/LB are legal (count ball).
  if(extraType === "wd"){
    pushSnapshot(inn);
    const bl = getBowler(inn, inn.currentBowler);
    inn.runs += extraRuns;
    bl.runs += extraRuns;
    inn.extras.wd += extraRuns;

    inn.ballLog.push({
      legal:false,
      label: `WD+${extraRuns}`,
      runsBat:0,
      extraType:"wd",
      extraRuns,
      wicket:false,
      wicketHow:"",
      freeHitUsed:false,
      ts: nowISO()
    });
    return {ok:true};
  }

  if(extraType === "nb"){
    pushSnapshot(inn);
    const bl = getBowler(inn, inn.currentBowler);
    inn.runs += extraRuns;
    bl.runs += extraRuns;
    inn.extras.nb += extraRuns;

    // NB triggers free hit for next legal ball
    inn.freeHitNext = true;

    inn.ballLog.push({
      legal:false,
      label: `NB+${extraRuns}`,
      runsBat:0,
      extraType:"nb",
      extraRuns,
      wicket:false,
      wicketHow:"",
      freeHitUsed:false,
      ts: nowISO()
    });
    return {ok:true};
  }

  // byes / legbyes are legal deliveries
  return addLegalBall(inn, 0, extraType, extraRuns, false, "");
}

// ---------- Target / RRR / Need ----------
function computeChase(inn1, inn2){
  const target = inn1.runs + 1;
  const maxBalls = IOM.rules.overs * 6;
  const ballsLeft = Math.max(0, maxBalls - inn2.balls);
  const runsNeeded = Math.max(0, target - inn2.runs);
  const rrr = ballsLeft>0 ? (runsNeeded / (ballsLeft/6)) : 0;
  return { target, ballsLeft, runsNeeded, rrr };
}

// ---------- Views ----------
function renderHome(){
  const wrap = document.createElement("div");
  wrap.className = "grid two";

  const left = document.createElement("div");
  left.className = "card";
  left.innerHTML = `
    <h2>Overview</h2>
    <div class="kv"><span class="muted">Tournament</span><span><b>${esc(IOM.meta.title)}</b></span></div>
    <div class="kv"><span class="muted">Commencement</span><span><b>${esc(IOM.meta.commencement)}</b></span></div>
    <div class="kv"><span class="muted">Format</span><span><b>22 teams • 4 groups</b></span></div>
    <div class="hr"></div>
    <div class="badge">Scoring rules: <span class="muted">10 overs • PP 3 • Bowler max 2</span></div>
  `;

  const right = document.createElement("div");
  right.className = "card";
  right.innerHTML = `
    <h2>Quick Actions</h2>
    <div class="grid">
      <button class="btn primary" id="goLive">Open Live Scoring</button>
      <button class="btn" id="goNom">Open Nomination</button>
      <button class="btn" id="goSch">Open Schedule</button>
    </div>
    <div class="hr"></div>
    <div class="muted">Tip: No-ball sets Free Hit on next legal ball (badge shown).</div>
  `;

  wrap.append(left,right);
  setTimeout(()=>{
    $("#goLive").addEventListener("click",()=>location.hash="#/live");
    $("#goNom").addEventListener("click",()=>location.hash="#/nomination");
    $("#goSch").addEventListener("click",()=>location.hash="#/schedule");
  },0);
  return wrap;
}

function renderTeams(){
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<h2>Teams & Venues (Group-wise)</h2><div class="muted">As per IOM group/venue table.</div><div class="hr"></div>`;
  const rows = ["A","B","C","D"].map(g=>{
    const grp = IOM.groups[g];
    return `<tr><td><b>Group ${g}</b></td><td>${esc(grp.venue)}</td><td>${grp.teams.map(esc).join(", ")}</td></tr>`;
  }).join("");
  const cards = ["A","B","C","D"].map(g=>{
    const grp = IOM.groups[g];
    return `
      <div class="mitem">
        <div class="mhead">
          <div>
            <div class="mtitle">Group ${esc(g)}</div>
            <div class="mmeta">Venue: <b>${esc(grp.venue)}</b></div>
          </div>
        </div>
        <div class="mrow">Teams: <b>${grp.teams.map(esc).join(", ")}</b></div>
      </div>
    `;
  }).join("");

  card.innerHTML += `
    <div class="only-desktop">
      <table class="table">
        <thead><tr><th>Group</th><th>Venue</th><th>Teams</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="only-mobile mlist">${cards}</div>
  `;
  const wrap = document.createElement("div");
  wrap.className="grid";
  wrap.append(card);
  return wrap;
}

function renderSchedule(){
  const st = loadState();
  const card = document.createElement("div");
  card.className="card";
  card.innerHTML = `<h2>Schedule of League Matches</h2><div class="muted">Dates: ${esc(IOM.scheduleDates.join(" / "))}</div><div class="hr"></div>`;
  const items = st.matches.map(m=>`
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
  const cards = st.matches.map(m=>`
    <div class="mitem">
      <div class="mhead">
        <div>
          <div class="mtitle">${esc(m.team1)} vs ${esc(m.team2)}</div>
          <div class="mmeta">Match <b>${esc(m.id)}</b> • Group <b>${esc(m.group)}</b></div>
        </div>
        <div><span class="badge">${esc(m.status)}</span></div>
      </div>
      <div class="mrow">
        <span>Venue: <b>${esc(m.venue)}</b></span>
        <span>Time: <b>${esc(m.time)}</b></span>
      </div>
      <div style="margin-top:10px">
        <button class="btn primary" data-live="${esc(m.id)}">Open</button>
      </div>
    </div>
  `).join("");

  card.innerHTML += `
    <div class="only-desktop">
      <table class="table">
        <thead><tr><th>ID</th><th>Group</th><th>Venue</th><th>Time</th><th>Match</th><th>Status</th><th></th></tr></thead>
        <tbody>${items}</tbody>
      </table>
    </div>

    <div class="only-mobile mlist">${cards}</div>
  `;
  const wrap=document.createElement("div"); wrap.className="grid"; wrap.append(card);

  setTimeout(()=>{
    $$("button[data-live]").forEach(b=>{
      b.addEventListener("click",()=>{
        const id=b.getAttribute("data-live");
        const s=loadState();
        s.liveMatchId=id;
        saveState(s);
        location.hash="#/live";
      });
    });
  },0);

  return wrap;
}

function renderKnockouts(){
  const card=document.createElement("div");
  card.className="card";
  card.innerHTML = `
    <h2>Knockouts</h2>
    <div class="kv"><span class="muted">Semi Final 1</span><span><b>${esc(IOM.knockouts.semi1)}</b></span></div>
    <div class="kv"><span class="muted">Semi Final 2</span><span><b>${esc(IOM.knockouts.semi2)}</b></span></div>
    <div class="kv"><span class="muted">Final</span><span><b>${esc(IOM.knockouts.final)}</b></span></div>
    <div class="hr"></div>
    <div class="muted">Semi/Final dates to be announced.</div>
  `;
  const wrap=document.createElement("div"); wrap.className="grid"; wrap.append(card);
  return wrap;
}

function renderRules(){
  const r=IOM.rules;
  const card=document.createElement("div");
  card.className="card";
  card.innerHTML=`
    <h2>Rules (IOM)</h2>
    <div class="kv"><span class="muted">Match Format</span><span><b>${r.overs} overs/innings</b></span></div>
    <div class="kv"><span class="muted">Powerplay</span><span><b>First ${r.powerplayOvers} overs</b></span></div>
    <div class="kv"><span class="muted">Bowler Limit</span><span><b>Max ${r.bowlerMaxOvers} overs/bowler</b></span></div>
    <div class="kv"><span class="muted">Ball</span><span><b>${esc(r.ball)}</b></span></div>
    <div class="kv"><span class="muted">Qualification</span><span><b>${esc(r.qualification)}</b></span></div>
    <div class="kv"><span class="muted">Tie-break</span><span><b>${esc(r.tieBreak)}</b></span></div>
    <div class="hr"></div>
    <div class="badge">Awards: <span class="muted">${r.awards.map(esc).join(" • ")}</span></div>
  `;
  const wrap=document.createElement("div"); wrap.className="grid"; wrap.append(card);
  return wrap;
}

function renderNomination(){
  const card=document.createElement("div");
  card.className="card";
  card.innerHTML=`
    <h2>Nomination Form (Annexure-1)</h2>
    <div class="muted">Fill details and Save. Local demo storage (GitHub Pages).</div>
    <div class="hr"></div>
    <div class="grid two">
      <div><label>Name of the Region</label><input id="n_region" placeholder="Region" /></div>
      <div><label>Name of the Player</label><input id="n_player" placeholder="Full name" /></div>
      <div><label>Employee ID</label><input id="n_empid" placeholder="Employee ID" /></div>
      <div><label>Designation</label><input id="n_desig" placeholder="Designation" /></div>
      <div><label>Branch / Office</label><input id="n_office" placeholder="Branch/Office" /></div>
      <div><label>Mobile Number</label><input id="n_mobile" placeholder="10-digit mobile" /></div>
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
      <div><label>Previous Tournament Experience</label><input id="n_exp" placeholder="Yes/No + details" /></div>
      <div>
        <label>How often do you play</label>
        <select id="n_freq">
          <option value="">Select</option>
          <option>Regularly</option>
          <option>Weekly</option>
          <option>Occasionally</option>
        </select>
      </div>
      <div style="grid-column:1/-1"><label>Serious Disease / Allergy</label><input id="n_health" placeholder="If none, write 'None'" /></div>
      <div style="grid-column:1/-1"><label>Declaration (optional)</label><textarea id="n_decl" placeholder="I agree to abide by rules..."></textarea></div>
    </div>
    <div class="hr"></div>
    <div style="display:flex; gap:10px; flex-wrap:wrap">
      <button class="btn primary" id="n_save">Save Nomination</button>
      <button class="btn" id="n_list">View Saved</button>
    </div>
    <div class="hr"></div>
    <div id="n_table"></div>
  `;

  setTimeout(()=>{
    $("#n_save").addEventListener("click",()=>{
      const st=loadState();
      const rec={
        id:"N"+Math.random().toString(16).slice(2,8).toUpperCase(),
        ts:nowISO(),
        region:$("#n_region").value.trim(),
        player:$("#n_player").value.trim(),
        empid:$("#n_empid").value.trim(),
        desig:$("#n_desig").value.trim(),
        office:$("#n_office").value.trim(),
        mobile:$("#n_mobile").value.trim(),
        role:$("#n_role").value,
        arm:$("#n_arm").value,
        exp:$("#n_exp").value.trim(),
        freq:$("#n_freq").value,
        health:$("#n_health").value.trim(),
        decl:$("#n_decl").value.trim(),
      };
      st.nominations.unshift(rec);
      saveState(st);
      toast(`Saved nomination ${rec.id}`);
    });

    $("#n_list").addEventListener("click",()=>{
      const st=loadState();
      const rows=st.nominations.map(x=>`
        <tr>
          <td><b>${esc(x.id)}</b></td>
          <td>${esc(x.player)}</td>
          <td>${esc(x.region)}</td>
          <td>${esc(x.mobile)}</td>
          <td>${esc(x.role)}</td>
          <td class="muted">${esc(new Date(x.ts).toLocaleString())}</td>
        </tr>
      `).join("");
      const cards = st.nominations.map(x=>`
        <div class="mitem">
          <div class="mhead">
            <div>
              <div class="mtitle">${esc(x.player)} <span class="muted">(${esc(x.region)})</span></div>
              <div class="mmeta">ID: <b>${esc(x.id)}</b> • Role: <b>${esc(x.role)}</b></div>
            </div>
          </div>
          <div class="mrow">
            <span>Mobile: <b>${esc(x.mobile)}</b></span>
            <span>Saved: <b>${esc(new Date(x.ts).toLocaleString())}</b></span>
          </div>
        </div>
      `).join("");

      $("#n_table").innerHTML=`
        <div class="only-desktop">
          <table class="table">
            <thead><tr><th>ID</th><th>Player</th><th>Region</th><th>Mobile</th><th>Role</th><th>Saved</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="6" class="muted">No saved nominations</td></tr>`}</tbody>
          </table>
        </div>
        <div class="only-mobile mlist">${cards || `<div class="mitem"><div class="muted">No saved nominations</div></div>`}</div>
      `;
    });
  },0);

  const wrap=document.createElement("div"); wrap.className="grid"; wrap.append(card);
  return wrap;
}

// ---------- Live Scoring UI ----------
function renderLive(){
  const st = loadState();
  const match = st.matches.find(m=>m.id===st.liveMatchId) || st.matches[0];

  const wrap=document.createElement("div");
  wrap.className="grid";

  const top=document.createElement("div");
  top.className="card";
  top.innerHTML=`
    <div class="scoreTop">
      <div>
        <div class="scoreTitle"><span class="liveBadge">●</span> LIVE ${esc(match.team1)} vs ${esc(match.team2)} <span class="muted">(Group ${esc(match.group)} • ${esc(match.venue)})</span></div>
        <div class="scoreSub">Time: ${esc(match.time)} • Match ID: <b>${esc(match.id)}</b></div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap">
        <select id="mPick"></select>
        <button class="btn" id="mStart">Start / Resume</button>
        <button class="btn danger" id="mReset">Reset</button>
      </div>
    </div>
    <div class="hr"></div>
    <div id="livePanel"></div>
  `;

  const scorer=document.createElement("div");
  scorer.className="card";
  scorer.innerHTML=`
    <h2>Scorer Console</h2>
    <div class="muted">Runs • WD/NB with runs • Free Hit • Wicket flow • Undo • Chase ticker</div>
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

      <div><label>Striker</label><select id="strikerPick"></select></div>
      <div><label>Non-striker</label><select id="nonStrikerPick"></select></div>
    </div>

    <div class="hr"></div>

    <div class="keypad">
      <button class="kbtn" data-run="0">0</button>
      <button class="kbtn" data-run="1">1</button>
      <button class="kbtn" data-run="2">2</button>
      <button class="kbtn" data-run="3">3</button>
      <button class="kbtn" data-run="4">4</button>
      <button class="kbtn" data-run="6">6</button>

      <button class="kbtn warn" data-pack="wd">WD Pack</button>
      <button class="kbtn warn" data-pack="nb">NB Pack</button>
      <button class="kbtn warn" data-pack="b">Bye (B+?)</button>
      <button class="kbtn warn" data-pack="lb">LegBye (LB+?)</button>

      <button class="kbtn bad" id="btnWicket">Wicket</button>
      <button class="kbtn" id="btnSwap">Swap Strike</button>
      <button class="kbtn" id="btnUndo">Undo</button>
      <button class="kbtn danger" id="btnEndOver">End Over</button>
    </div>

    <div class="hr"></div>

    <div class="grid two">
      <div class="card" style="padding:12px">
        <div class="muted" style="font-weight:900;margin-bottom:8px">Quick WD (adds to total, ball NOT count)</div>
        <div class="keypad" style="grid-template-columns:repeat(6,minmax(0,1fr))">
          ${[1,2,3,4,5,6].map(n=>`<button class="kbtn warn" data-exq="wd" data-val="${n}">WD+${n}</button>`).join("")}
        </div>
      </div>
      <div class="card" style="padding:12px">
        <div class="muted" style="font-weight:900;margin-bottom:8px">Quick NB (adds + Free Hit, ball NOT count)</div>
        <div class="keypad" style="grid-template-columns:repeat(6,minmax(0,1fr))">
          ${[1,2,3,4,5,6].map(n=>`<button class="kbtn warn" data-exq="nb" data-val="${n}">NB+${n}</button>`).join("")}
        </div>
      </div>
    </div>

    <div class="hr"></div>
    <div class="muted" id="msg"></div>
  `;

  wrap.append(top, scorer);

  setTimeout(()=>initLive(match.id),0);
  return wrap;
}

function initLive(matchId){
  let st = loadState();
  st.liveMatchId = matchId;
  saveState(st);

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
    m.status="SCHEDULED";
    m.innings=[];
    m.result=null;
    m.updatedAt=nowISO();
    saveState(s);
    toast("Match reset");
    route();
  });

  $("#mStart").addEventListener("click",()=>{
    const s = loadState();
    const m = s.matches.find(x=>x.id===matchId);
    if(m.innings.length===0){
      m.innings.push(newInnings(m.team1, m.team2));
      m.innings.push(newInnings(m.team2, m.team1));
    }
    m.status="LIVE";
    m.updatedAt=nowISO();
    saveState(s);
    toast("Match started");
    route();
  });

  bindScorer(matchId);
  renderLivePanel(matchId);
}

function bindScorer(matchId){
  const s = loadState();
  const m = s.matches.find(x=>x.id===matchId);
  if(!m) return;

  if(m.innings.length===0){
    m.innings.push(newInnings(m.team1, m.team2));
    m.innings.push(newInnings(m.team2, m.team1));
    m.status="LIVE";
    saveState(s);
  }

  const innPick=$("#innPick");
  const bowlerPick=$("#bowlerPick");
  const strikerPick=$("#strikerPick");
  const nonStrikerPick=$("#nonStrikerPick");
  const msg=$("#msg");
  const bowlerHint=$("#bowlerHint");

  function current(){
    const idx = parseInt(innPick.value,10);
    return { idx, inn: m.innings[idx] };
  }

  function setupDropdowns(){
    const { inn } = current();
    const bowlTeam = s.teams[inn.bowlingTeam];
    const batTeam  = s.teams[inn.battingTeam];

    bowlerPick.innerHTML = bowlTeam.players.map(p=>`<option value="${esc(p.name)}">${esc(p.name)}</option>`).join("");
    strikerPick.innerHTML = batTeam.players.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
    nonStrikerPick.innerHTML = batTeam.players.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");

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
    const { inn } = current();
    const bl = getBowler(inn, inn.currentBowler || "");
    const max = IOM.rules.bowlerMaxOvers;
    let text = `This bowler: ${bowlerOvers(bl)} ov • Max: ${max} ov`;
    if(!canBowlMore(inn, inn.currentBowler)) text += " • LIMIT REACHED";
    if(inn.freeHitNext) text += " • FREE HIT next ball";
    bowlerHint.textContent = text;
  }

  innPick.addEventListener("change",()=>{
    setupDropdowns();
    renderLivePanel(matchId);
  });

  bowlerPick.addEventListener("change",()=>{
    const { inn } = current();
    inn.currentBowler = bowlerPick.value;
    saveState(s);
    updateBowlerHint();
    renderLivePanel(matchId);
  });

  strikerPick.addEventListener("change",()=>{
    const { inn } = current();
    inn.strikerId = strikerPick.value;
    const bt = s.teams[inn.battingTeam];
    inn.strikerName = bt.players.find(p=>p.id===inn.strikerId)?.name || "Striker";
    saveState(s);
    renderLivePanel(matchId);
  });

  nonStrikerPick.addEventListener("change",()=>{
    const { inn } = current();
    inn.nonStrikerId = nonStrikerPick.value;
    const bt = s.teams[inn.battingTeam];
    inn.nonStrikerName = bt.players.find(p=>p.id===inn.nonStrikerId)?.name || "Non-striker";
    saveState(s);
    renderLivePanel(matchId);
  });

  // runs
  $$("[data-run]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const { inn } = current();
      const r = parseInt(btn.getAttribute("data-run"),10);
      const res = addLegalBall(inn, r, null, 0, false, "");
      msg.textContent = res.ok ? "" : res.msg;
      if(!res.ok) toast(res.msg);
      updateBowlerHint();
      saveState(s);
      renderLivePanel(matchId);
    });
  });

  // quick wd/nb buttons
  $$("[data-exq]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const { inn } = current();
      const type = btn.getAttribute("data-exq");
      const runs = parseInt(btn.getAttribute("data-val"),10);
      const res = addExtraBall(inn, type, runs);
      if(!res.ok){ msg.textContent=res.msg; toast(res.msg); return; }
      msg.textContent="";
      saveState(s);
      updateBowlerHint();
      renderLivePanel(matchId);
    });
  });

  // packs / custom for b/lb and optional prompt
  $$("[data-pack]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const { inn } = current();
      const type = btn.getAttribute("data-pack");

      // For WD/NB pack just focus user: they already have quick buttons
      if(type==="wd" || type==="nb"){
        toast("Use Quick WD/NB buttons below (WD+1..WD+6 / NB+1..NB+6).");
        return;
      }

      const val = prompt(`${type.toUpperCase()} runs? (1-6)`, "1");
      if(val === null) return;
      const runs = clampInt(val,1,6,1);
      const res = addExtraBall(inn, type, runs);
      if(!res.ok){ msg.textContent=res.msg; toast(res.msg); return; }
      msg.textContent="";
      saveState(s);
      updateBowlerHint();
      renderLivePanel(matchId);
    });
  });

  $("#btnSwap").addEventListener("click",()=>{
    const { inn } = current();
    pushSnapshot(inn);
    rotateStrike(inn);
    saveState(s);
    renderLivePanel(matchId);
    toast("Strike swapped");
  });

  $("#btnEndOver").addEventListener("click",()=>{
    const { inn } = current();
    pushSnapshot(inn);
    rotateStrike(inn);
    saveState(s);
    renderLivePanel(matchId);
    toast("Over ended (strike swapped)");
  });

  $("#btnUndo").addEventListener("click",()=>{
    const { inn } = current();
    const res = restoreSnapshot(inn);
    if(!res.ok) toast(res.msg);
    saveState(s);
    updateBowlerHint();
    renderLivePanel(matchId);
  });

  // wicket with free-hit rule enforcement
  $("#btnWicket").addEventListener("click",()=>{
    const { inn } = current();

    // If Free Hit is active for next legal ball, only Run out allowed
    const hint = inn.freeHitNext ? " (Free Hit next ball: only Run out allowed)" : "";
    const type = prompt("Wicket type? Bowled/Caught/Run out/LBW/Stumped/Hit wicket/Retired" + hint);
    if(!type) return;

    let how = type;
    if(type.toLowerCase()==="caught"){
      const f = prompt("Fielder name (optional):");
      if(f) how = `Caught (${f})`;
    }

    // Apply a wicket ball with 0 bat runs
    const res = addLegalBall(inn, 0, null, 0, true, how);
    if(!res.ok){ toast(res.msg); msg.textContent=res.msg; return; }

    // If wicket got ignored due to free hit, inform
    const last = inn.ballLog[inn.ballLog.length-1];
    if(last && last.freeHitUsed && !last.wicket){
      toast("Free Hit: wicket not allowed (ignored).");
      saveState(s);
      updateBowlerHint();
      renderLivePanel(matchId);
      return;
    }

    // New batsman pick (simple)
    const bt = s.teams[inn.battingTeam];
    const pick = prompt("New batsman number (1-15). Example: 5");
    if(pick){
      const n = clampInt(pick,1,15,1);
      const p = bt.players[n-1];
      if(p){
        // if striker got out, replace striker else non-striker
        const strikerB = inn.batters.find(b=>b.id===inn.strikerId);
        if(strikerB && strikerB.out){
          inn.strikerId = p.id; inn.strikerName = p.name;
        }else{
          inn.nonStrikerId = p.id; inn.nonStrikerName = p.name;
        }
      }
    }

    saveState(s);
    updateBowlerHint();
    renderLivePanel(matchId);
    toast("Wicket recorded");
  });

  setupDropdowns();
}

// ---------- Live Panel ----------
function renderLivePanel(matchId){
  const s=loadState();
  const m=s.matches.find(x=>x.id===matchId);
  if(!m) return;

  const lp=$("#livePanel");

  const inn1 = m.innings[0] || newInnings(m.team1, m.team2);
  const inn2 = m.innings[1] || newInnings(m.team2, m.team1);

  const showSecond = (inn2.balls>0 || inn2.runs>0 || inn2.wkts>0 || inn2.ballLog.length>0);
  const inn = showSecond ? inn2 : inn1;

  const overs = oversText(inn.balls);
  const crr = computeCRR(inn).toFixed(2);

  const ppBalls = IOM.rules.powerplayOvers * 6;
  const inPP = inn.balls < ppBalls;

  const bt = s.teams[inn.battingTeam];
  const striker = bt?.players.find(p=>p.id===inn.strikerId);
  const non = bt?.players.find(p=>p.id===inn.nonStrikerId);
  const b1 = striker ? getBatter(inn, striker.id, striker.name) : null;
  const b2 = non ? getBatter(inn, non.id, non.name) : null;

  const bowl = inn.currentBowler ? getBowler(inn, inn.currentBowler) : null;

  const last6 = inn.ballLog.slice(-6).map(b=>{
    let cls = "ball";
    if(b.wicket) cls="ball w";
    else if(b.label==="6") cls="ball b6";
    else if(b.label==="4") cls="ball b4";
    else if(!b.legal) cls="ball ex";
    return `<div class="${cls}">${esc(b.label)}</div>`;
  }).join("");

  let chaseTicker = "";
  if(showSecond){
    const c = computeChase(inn1, inn2);
    chaseTicker = `
      <div class="ticker">
        <span>Target: <b>${c.target}</b></span>
        <span>Need: <b class="warn">${c.runsNeeded}</b> off <b>${c.ballsLeft}</b> balls</span>
        <span>RRR: <b>${c.rrr.toFixed(2)}</b></span>
      </div>
    `;
  }

  const freeHitBadge = inn.freeHitNext ? `<span class="badge" style="margin-left:8px">FH next ball</span>` : "";

  lp.innerHTML = `
    <div class="grid two">
      <div class="card">
        <div class="pill"><span class="liveBadge">●</span> ${esc(inn.battingTeam)} batting ${showSecond?`<span class="muted">(Chasing)</span>`:""} ${freeHitBadge}</div>
        <div class="bigScore">${inn.runs}/${inn.wkts} <span class="muted">(${overs} ov)</span></div>
        <div class="smallRow">
          <span>CRR: <b>${crr}</b></span>
          <span>${inPP ? `Powerplay: <b>ON</b> (${IOM.rules.powerplayOvers} ov)` : `Powerplay: <b>DONE</b>`}</span>
          <span>Extras: <b>wd ${inn.extras.wd} • nb ${inn.extras.nb} • b ${inn.extras.b} • lb ${inn.extras.lb}</b></span>
        </div>
        ${chaseTicker}
        <div class="hr"></div>
        <div class="muted" style="margin-bottom:8px">Last 6 balls</div>
        <div class="ballRow">${last6 || `<span class="muted">No balls yet</span>`}</div>
      </div>

      <div class="card">
        <h2>Mini Scorecard</h2>
        <div class="kv"><span class="muted">Striker</span><span><b>${esc(b1?.name || "—")}</b> ${b1 ? `${b1.r}*(${b1.b}) 4s:${b1.f4} 6s:${b1.f6}` : ""}</span></div>
        <div class="kv"><span class="muted">Non-striker</span><span><b>${esc(b2?.name || "—")}</b> ${b2 ? `${b2.r}(${b2.b}) 4s:${b2.f4} 6s:${b2.f6}` : ""}</span></div>
        <div class="kv"><span class="muted">Bowler</span><span><b>${esc(inn.currentBowler || "—")}</b> ${bowl ? `${bowlerOvers(bowl)}-${bowl.runs}-${bowl.wkts}` : ""}</span></div>
        <div class="hr"></div>
        <div class="muted">Full scorecard below.</div>
      </div>
    </div>

    <div class="card" style="margin-top:12px">
      <h2>Scorecard – ${esc(inn.battingTeam)}</h2>
      <div class="only-desktop">
        <table class="table">
          <thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>Status</th></tr></thead>
          <tbody>
            ${(inn.batters.length?inn.batters:[]).map(b=>`
              <tr>
                <td><b>${esc(b.name)}</b>${(b.id===inn.strikerId)?" *":""}</td>
                <td>${b.r}</td><td>${b.b}</td><td>${b.f4}</td><td>${b.f6}</td>
                <td class="muted">${b.out?esc(b.how):"not out"}</td>
              </tr>
            `).join("") || `<tr><td colspan="6" class="muted">No batting data yet</td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="only-mobile mlist">
        ${(inn.batters.length?inn.batters:[]).map(b=>`
          <div class="mitem">
            <div class="mhead">
              <div>
                <div class="mtitle">${esc(b.name)}${(b.id===inn.strikerId)?" *":""}</div>
                <div class="mmeta">${b.out?esc(b.how):"not out"}</div>
              </div>
              <div class="badge">${b.r} (${b.b})</div>
            </div>
            <div class="mrow"><span>4s: <b>${b.f4}</b></span><span>6s: <b>${b.f6}</b></span></div>
          </div>
        `).join("") || `<div class="mitem"><div class="muted">No batting data yet</div></div>`}
      </div>

      <div class="hr"></div>

      <h2>Bowling – ${esc(inn.bowlingTeam)}</h2>
      <div class="only-desktop">
        <table class="table">
          <thead><tr><th>Bowler</th><th>O</th><th>R</th><th>W</th><th>Econ</th></tr></thead>
          <tbody>
            ${(inn.bowlers.length?inn.bowlers:[]).map(b=>`
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

      <div class="only-mobile mlist">
        ${(inn.bowlers.length?inn.bowlers:[]).map(b=>`
          <div class="mitem">
            <div class="mhead">
              <div>
                <div class="mtitle">${esc(b.name)}</div>
                <div class="mmeta">Overs: <b>${bowlerOvers(b)}</b> • Econ: <b>${(b.balls? (b.runs/(b.balls/6)).toFixed(2) : "0.00")}</b></div>
              </div>
              <div class="badge">W: ${b.wkts}</div>
            </div>
            <div class="mrow"><span>Runs: <b>${b.runs}</b></span></div>
          </div>
        `).join("") || `<div class="mitem"><div class="muted">No bowling data yet</div></div>`}
      </div>
    </div>
  `;
}

// ---------- App Shell ----------
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
onStateChanged((st)=>{ STATE=st; route(); });

// reset button (top bar)
$("#btnReset")?.addEventListener("click",()=>{
  if(confirm("Reset all local data?")){
    resetState();
    STATE = loadState();
    route();
  }
});

// PWA install prompt
let deferredPrompt=null;
window.addEventListener("beforeinstallprompt",(e)=>{
  e.preventDefault();
  deferredPrompt=e;
  $("#btnInstall")?.classList.remove("hidden");
});
$("#btnInstall")?.addEventListener("click", async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=null;
  $("#btnInstall")?.classList.add("hidden");
});

// SW
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>navigator.serviceWorker.register("./sw.js"));
}

route();
