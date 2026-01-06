(function(){
  const $ = (s, el=document)=>el.querySelector(s);
  const esc = (s)=> (s??"").toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  initRealtime();

  const banner = $("#fbBanner");
  if(!RT.ready){
    banner.style.display = "block";
    banner.textContent = "Firebase not configured. Standings will be calculated only from local (legacy) data, if available.";
  }

  const GROUPS = (window.IOM && IOM.groups) ? IOM.groups : {};

  function nrrFor(team){
    const bf = team.ballsFor || 0;
    const ba = team.ballsAgainst || 0;
    const rf = team.runsFor || 0;
    const ra = team.runsAgainst || 0;
    const ovf = bf/6;
    const ova = ba/6;
    if(ovf===0 && ova===0) return 0;
    const a = ovf>0 ? (rf/ovf) : 0;
    const b = ova>0 ? (ra/ova) : 0;
    return a - b;
  }

  function initTable(){
    const tables = {};
    Object.keys(GROUPS).forEach(g=>{
      const t = {};
      (GROUPS[g].teams||[]).forEach(name=>{
        t[name] = { team:name, group:g, played:0, win:0, loss:0, nr:0, pts:0, runsFor:0, ballsFor:0, runsAgainst:0, ballsAgainst:0, h2h:{} };
      });
      tables[g] = t;
    });
    return tables;
  }

  function applyResult(tables, match){
    // match shape supports:
    // {a,b, group, result:{winner:'A'|'B'|'TIE'|'NR'}, scoreSummary:{innings1,innings2,meta:{battingFirst}}}
    if(!match || !match.group || !tables[match.group]) return;
    const g = match.group;
    const A = match.a; const B = match.b;
    if(!A || !B) return;
    const ta = tables[g][A];
    const tb = tables[g][B];
    if(!ta || !tb) return;

    const res = match.result || null;
    if(!res || !res.winner) return;

    const winnerRaw = String(res.winner||"");
    const winnerUp = winnerRaw.toUpperCase();

    // Accept: "A"/"B", team name, "TIE"/"Tie", "NR"/"No result"
    let winner = "";
    if(winnerUp === "NR" || winnerUp === "NO RESULT" || winnerUp === "N/R") winner = "NR";
    else if(winnerUp === "TIE" || winnerUp === "TIED") winner = "TIE";
    else if(winnerUp === "A" || winnerRaw === A) winner = "A";
    else if(winnerUp === "B" || winnerRaw === B) winner = "B";
if(winner === "NR"){
      ta.nr += 1; tb.nr += 1;
      ta.pts += 1; tb.pts += 1;
      ta.h2h[B].nr += 1; tb.h2h[A].nr += 1;
      return;
    }
    if(winner === "TIE"){
      // Treat tie as 1 point each (simple). If tournament uses decider, scorer should finalize as A/B.
      ta.pts += 1; tb.pts += 1;
      ta.h2h[B].t += 1; tb.h2h[A].t += 1;
      return;
    }

    if(winner === "A"){
      ta.win += 1; tb.loss += 1;
      ta.pts += 2;
      ta.h2h[B].w += 1; tb.h2h[A].l += 1;
    } else if(winner === "B"){
      tb.win += 1; ta.loss += 1;
      tb.pts += 2;
      tb.h2h[A].w += 1; ta.h2h[B].l += 1;
    }

    // NRR: use scoreSummary if available
    const ss = match.scoreSummary || {};
    const meta = ss.meta || {};
    const bf = meta.battingFirst || ""; // A/B
    const i1 = ss.innings1 || null;
    const i2 = ss.innings2 || null;
    if(!i1 || !i2 || !(bf==="A"||bf==="B")) return;
    const teamBat1 = (bf==="A") ? A : B;
    const teamBat2 = (bf==="A") ? B : A;

    const t1 = tables[g][teamBat1];
    const t2 = tables[g][teamBat2];
    // innings runs/balls count for/against
    t1.runsFor += i1.runs||0; t1.ballsFor += i1.balls||0;
    t1.runsAgainst += i2.runs||0; t1.ballsAgainst += i2.balls||0;
    t2.runsFor += i2.runs||0; t2.ballsFor += i2.balls||0;
    t2.runsAgainst += i1.runs||0; t2.ballsAgainst += i1.balls||0;
  }

  function renderTables(tables){
    const root = $("#tables");
    const blocks = Object.keys(GROUPS).sort().map(g=>{
      const rows = Object.values(tables[g]||{});
      rows.forEach(r=>{ r.nrr = nrrFor(r); });
      rows.sort((x,y)=> (y.pts-x.pts) || (y.nrr-x.nrr) || (x.team.localeCompare(y.team)));

      const htmlRows = rows.map(r=>{
        return `<tr>
          <td><b>${esc(r.team)}</b></td>
          <td>${r.played}</td>
          <td>${r.win}</td>
          <td>${r.loss}</td>
          <td>${r.nr}</td>
          <td><b>${r.pts}</b></td>
          <td>${r.nrr.toFixed(3)}</td>
        </tr>`;
      }).join("");

      return `
        <div class="card" style="margin-top:12px">
          <div class="row between">
            <div>
              <div class="h2">Group ${esc(g)} <span class="muted">(${esc(GROUPS[g].venue||"")})</span></div>
              <div class="muted">Top team qualifies for semi-final.</div>
            </div>
          </div>
          <div class="tablewrap" style="margin-top:10px">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Team</th><th>P</th><th>W</th><th>L</th><th>NR</th><th>Pts</th><th>NRR</th>
                </tr>
              </thead>
              <tbody>${htmlRows || ""}</tbody>
            </table>
          </div>
          <div class="muted tiny" style="margin-top:8px">Tie-break: Points → NRR → Head-to-Head (2-way tie) → Decider.</div>
        </div>
      `;
    });

    root.innerHTML = blocks.join("\n") || `<div class="card"><div class="muted">No standings data.</div></div>`;
  }

  async function loadFromFirebaseAndRender(){
    const tables = initTable();
    try{
      const snap = await RT.fb.db.collection("matches").get();
      snap.forEach(doc=>{
        const d = doc.data() || {};
        // ensure group/a/b exist
        const base = scheduleToMatches().find(x=>x.matchId===doc.id) || {};
        const match = {
          group: d.group || base.group || "",
          a: d.a || base.a,
          b: d.b || base.b,
          result: d.result || null,
          scoreSummary: d.scoreSummary || null,
        };
        applyResult(tables, match);
      });
      renderTables(tables);
    }catch(e){
      banner.style.display = "block";
      banner.textContent = `Unable to load standings from Firebase: ${e.message}`;
      renderTables(tables);
    }
  }

  function loadFromLocalAndRender(){
    const tables = initTable();
    // Legacy localStorage state (index.html)
    try{
      const raw = localStorage.getItem("mpgbpl_v1");
      if(raw){
        const st = JSON.parse(raw);
        const ms = Array.isArray(st.matches) ? st.matches : [];
        ms.forEach(m=>{
          if(!m || !m.group) return;
          // Expect result structure: {winnerTeamName or 'TIE/NR'} in legacy; handle best effort
          const r = m.result || null;
          let winner = "";
          if(r && r.winner){
            winner = r.winner;
          }
          const winnerUpper = String(winner||"").toUpperCase();
          let w = "";
          if(winnerUpper === "NR") w = "NR";
          else if(winnerUpper === "TIE") w = "TIE";
          else if(winner && winner === m.team1) w = "A";
          else if(winner && winner === m.team2) w = "B";
          const match = {
            group: m.group,
            a: m.team1,
            b: m.team2,
            result: w ? {winner:w} : null,
            scoreSummary: null,
          };
          applyResult(tables, match);
        });
      }
    }catch(_){/* ignore */}
    renderTables(tables);
  }

  if(RT.ready){
    loadFromFirebaseAndRender();
  }else{
    loadFromLocalAndRender();
  }
})();
