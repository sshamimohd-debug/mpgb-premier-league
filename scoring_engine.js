/**
 * Professional-ish scoring engine (T10).
 * Stores ball-by-ball with enough detail for scorecard, FOW, partnerships, over-by-over.
 *
 * LiveState shape (backward compatible fields kept):
 * {
 *   matchId,
 *   meta: { teamA, teamB, oversLimit, bowlerMaxOvers, tossWinner, tossDecision, battingFirst },
 *   squads: { A:[{id,name,role,photo}], B:[...] }  // 15 each
 *   playingXI: { A:[name...], B:[name...] },       // 11 each
 *   innings: 1|2,
 *   bat: "A"|"B",
 *   inningsData: { "1": {...}, "2": {...} },
 *   target, result,
 *   // legacy counters for current innings:
 *   runs,wkts,balls,last6, striker, nonStriker, bowler, extras, commentary, updatedAt, seq
 * }
 */

const T10_RULES = { overs: 10, bowlerMaxOvers: 2, powerplayOvers: 3 };

function deepClone(o){ return JSON.parse(JSON.stringify(o)); }
function safeStr(x){ return (x==null ? "" : String(x)); }

function oversTextFromBalls(balls){
  const o=Math.floor(balls/6), b=balls%6;
  return `${o}.${b}`;
}
function ballsFromOversText(txt){
  const [o,b] = safeStr(txt).split(".").map(n=>parseInt(n,10)||0);
  return o*6 + (b||0);
}
function crr(runs, balls){
  const ov = balls/6;
  return ov>0 ? (runs/ov) : 0;
}

function newInningsObj(batSide){
  return {
    bat: batSide,                    // "A" or "B"
    startedAt: Date.now(),
    endedAt: null,
    balls: [],                       // ball-by-ball records
    totals: { runs:0, wkts:0, legalBalls:0, extras:{ wd:0, nb:0, b:0, lb:0, pen:0 } },
    batters: {},                     // name -> {r,b,4,6,out,how}
    bowlers: {},                     // name -> {legalBalls,runs,wkts,maidens,oversArr}
    fow: [],                         // [{wkt, score, over, batter, kind}]
    partnerships: [],                // computed on the fly in finalizeInnings()
    overByOver: [],                  // [{over:0, seq:["1","W","NB+1"...], runs, wkts}]
  };
}

function ensureBatter(inn, name){
  name = safeStr(name).trim();
  if(!name) return null;
  if(!inn.batters[name]){
    inn.batters[name] = { name, r:0, b:0, f4:0, f6:0, out:false, how:"" };
  }
  return inn.batters[name];
}
function ensureBowler(inn, name){
  name = safeStr(name).trim();
  if(!name) return null;
  if(!inn.bowlers[name]){
    inn.bowlers[name] = { name, legalBalls:0, runs:0, wkts:0, maidens:0, oversArr:[] };
  }
  return inn.bowlers[name];
}

function newLiveState(match){
  const a = match?.a || "Team A";
  const b = match?.b || "Team B";
  const rules = (window.DATA && window.DATA.rules) ? window.DATA.rules : T10_RULES;

  const st = {
    matchId: match?.matchId || match?.id || "m1",
    meta: {
      teamA: a,
      teamB: b,
      oversLimit: rules.overs || T10_RULES.overs,
      bowlerMaxOvers: rules.bowlerMaxOvers || T10_RULES.bowlerMaxOvers,
      tossWinner: "",
      tossDecision: "", // BAT/BOWL
      battingFirst: "", // "A" or "B"
    },
    squads: { A:[], B:[] },     // 15 players (objects)
    playingXI: { A:[], B:[] },  // 11 players (names)
    innings: 1,
    bat: "A",
    inningsData: { "1": newInningsObj("A"), "2": newInningsObj("B") },
    innings1: null,
    innings2: null,
    target: null,
    result: null,

    // legacy fields for UI convenience (current innings)
    runs: 0,
    wkts: 0,
    balls: 0,
    last6: [],
    striker: { name:"", r:0, b:0, f4:0, f6:0 },
    nonStriker: { name:"", r:0, b:0, f4:0, f6:0 },
    bowler: { name:"", balls:0, runs:0, wkts:0 },
    extras: { wd:0, nb:0, b:0, lb:0, pen:0 },
    commentary: [],
    updatedAt: Date.now(),
    seq: 0
  };

  return st;
}

function getCurrentInnings(state){
  const key = String(state.innings || 1);
  if(!state.inningsData) state.inningsData = { "1": newInningsObj(state.bat||"A"), "2": newInningsObj((state.bat==="A")?"B":"A") };
  if(!state.inningsData[key]) state.inningsData[key] = newInningsObj(state.bat||"A");
  return state.inningsData[key];
}

function pushLast6(state, label){
  state.last6.push(label);
  if(state.last6.length>6) state.last6.shift();
}

function rotateStrikeState(state){
  const t = state.striker; state.striker = state.nonStriker; state.nonStriker = t;
}

function isBowlerWicket(kind){
  const k = safeStr(kind).toLowerCase();
  if(k.includes("run out")) return false;
  if(k.includes("retired")) return false;
  if(k.includes("obstruct")) return false;
  return true;
}

function ballLabel(ball){
  // for last6/over-by-over
  if(ball.wicket) return "W";
  if(ball.extraType){
    const tag = ball.extraType.toUpperCase();
    const plus = ball.extraRuns ? `+${ball.extraRuns}` : "";
    if(ball.runsBat) return `${tag}${plus}+${ball.runsBat}`;
    return `${tag}${plus || "+1"}`;
  }
  return String(ball.runsBat || 0);
}

function recomputeLegacyFromInnings(state){
  const inn = getCurrentInnings(state);
  state.runs = inn.totals.runs;
  state.wkts = inn.totals.wkts;
  state.balls = inn.totals.legalBalls;
  state.extras = deepClone(inn.totals.extras);
  // last6 from last 6 legal balls (labels)
  const lastLegal = inn.balls.filter(b=>b.legal).slice(-6);
  state.last6 = lastLegal.map(ballLabel);
}

function finalizeInningsComputations(inn){
  // Over-by-over (legal balls only, grouped by over)
  const overs = [];
  let cur = { over:0, seq:[], runs:0, wkts:0 };
  for(const b of inn.balls){
    if(b.legal){
      const overNo = Math.floor(b.legalBallIndex/6);
      if(overNo !== cur.over){
        overs.push(cur);
        cur = { over: overNo, seq:[], runs:0, wkts:0 };
      }
    }
    cur.seq.push(ballLabel(b));
    cur.runs += (b.totalRuns||0);
    if(b.wicket) cur.wkts += 1;
  }
  overs.push(cur);
  inn.overByOver = overs.filter(x=>x.seq.length>0);

  // Partnerships: between wickets in legal sequence
  const parts = [];
  let startScore = 0, startBall = 0, wktNo = 0;
  for(const b of inn.balls){
    // count legal balls for partnership balls faced (use legal balls)
    if(b.legal) {}
    if(b.wicket){
      wktNo += 1;
      const endScore = b.cumRuns;
      const endBall = b.legalBallIndex;
      parts.push({
        wkt: wktNo,
        runs: endScore - startScore,
        balls: endBall - startBall,
        at: oversTextFromBalls(endBall),
        out: b.wicket?.batter || ""
      });
      startScore = endScore;
      startBall = endBall;
    }
  }
  parts.push({
    wkt: wktNo + 1,
    runs: inn.totals.runs - startScore,
    balls: inn.totals.legalBalls - startBall,
    at: oversTextFromBalls(inn.totals.legalBalls),
    out: "Not out"
  });
  inn.partnerships = parts;
}

function endInnings(state, reason){
  const inn = getCurrentInnings(state);
  if(inn.endedAt) return state;

  inn.endedAt = Date.now();
  finalizeInningsComputations(inn);

  const summary = { runs: inn.totals.runs, wkts: inn.totals.wkts, balls: inn.totals.legalBalls, oversText: oversTextFromBalls(inn.totals.legalBalls), extras: deepClone(inn.totals.extras) };

  if(state.innings === 1){
    state.innings1 = summary;
    state.target = summary.runs + 1;
    // flip innings + batting side
    state.innings = 2;
    state.bat = (state.bat === "A") ? "B" : "A";
    // init innings 2 bat side
    state.inningsData["2"] = state.inningsData["2"] || newInningsObj(state.bat);
    state.inningsData["2"].bat = state.bat;
    state.commentary.unshift(`Innings 1 ended (${reason||"end"}) • Target ${state.target}`);
  } else {
    state.innings2 = summary;
    state.commentary.unshift(`Innings 2 ended (${reason||"end"})`);
  }

  // clear current players for next innings or match end
  state.striker = { name:"", r:0, b:0, f4:0, f6:0 };
  state.nonStriker = { name:"", r:0, b:0, f4:0, f6:0 };
  state.bowler = { name:"", balls:0, runs:0, wkts:0 };
  state.last6 = [];
  recomputeLegacyFromInnings(state);

  return state;
}

function applyBall(state, payload){
  const inn = getCurrentInnings(state);

  const strikerName = safeStr(payload.striker || state.striker?.name).trim();
  const nonStrikerName = safeStr(payload.nonStriker || state.nonStriker?.name).trim();
  const bowlerName = safeStr(payload.bowler || state.bowler?.name).trim();

  if(!strikerName || !nonStrikerName || !bowlerName){
    state.commentary.unshift("⚠️ Set striker/non-striker/bowler first");
    return state;
  }

  const extraType = payload.extraType ? safeStr(payload.extraType).toLowerCase() : "";
  const extraRuns = Math.max(0, parseInt(payload.extraRuns || 0, 10) || 0);
  const runsBat = Math.max(0, parseInt(payload.runsBat || 0, 10) || 0);

  // Determine legality
  const legal = !(extraType === "wd" || extraType === "nb");

  // Bowling limit enforcement (warn, but still allow if forced)
  const bl = ensureBowler(inn, bowlerName);
  const bowlerOvers = bl ? (bl.legalBalls/6) : 0;
  const bowlerMax = (state.meta?.bowlerMaxOvers || T10_RULES.bowlerMaxOvers);
  if(legal && bl && bowlerOvers >= bowlerMax){
    state.commentary.unshift(`⚠️ Bowler limit exceeded (${bowlerName})`);
    // still proceed; scorer can undo if mistake
  }

  // Runs attribution
  const totalRuns = runsBat + extraRuns + (payload.penaltyRuns ? (parseInt(payload.penaltyRuns,10)||0) : 0);
  const isBye = (extraType === "b");
  const isLb = (extraType === "lb");
  const isWide = (extraType === "wd");
  const isNb = (extraType === "nb");

  // Update totals
  inn.totals.runs += totalRuns;
  if(extraType){
    if(!inn.totals.extras[extraType]) inn.totals.extras[extraType] = 0;
    inn.totals.extras[extraType] += extraRuns;
  }
  if(payload.penaltyRuns){
    inn.totals.extras.pen = (inn.totals.extras.pen||0) + (parseInt(payload.penaltyRuns,10)||0);
  }

  // Update batter stats
  const striker = ensureBatter(inn, strikerName);
  const nonStriker = ensureBatter(inn, nonStrikerName);

  if(!isWide){
    // ball faced counts for no-ball too (common scoreboard convention)
    striker.b += 1;
  }

  if(!isBye && !isLb){
    striker.r += runsBat;
    if(runsBat === 4) striker.f4 += 1;
    if(runsBat === 6) striker.f6 += 1;
  }

  // Update bowler stats
  const bowl = ensureBowler(inn, bowlerName);
  // Bowler conceded runs exclude byes/leg byes
  const bowlerConceded = (isBye || isLb) ? (isWide ? extraRuns : 0) : (runsBat + extraRuns);
  bowl.runs += bowlerConceded;

  // Legal ball increments
  if(legal){
    inn.totals.legalBalls += 1;
    bowl.legalBalls += 1;
  }

  // Wicket handling
  let wicketObj = null;
  if(payload.wicket && payload.wicket.kind){
    inn.totals.wkts += 1;
    const kind = safeStr(payload.wicket.kind);
    const batterOut = safeStr(payload.wicket.batter || strikerName);
    const fielder = safeStr(payload.wicket.fielder || "");
    wicketObj = { kind, batter: batterOut, fielder };

    // mark out
    const outB = ensureBatter(inn, batterOut);
    if(outB){
      outB.out = true;
      outB.how = kind + (fielder ? ` (${fielder})` : "");
    }

    if(isBowlerWicket(kind)){
      bowl.wkts += 1;
    }

    // Fall of wicket: score at this ball
    const overText = oversTextFromBalls(inn.totals.legalBalls);
    inn.fow.push({ wkt: inn.totals.wkts, score: inn.totals.runs, over: overText, batter: batterOut, kind });
  }

  // Create ball record
  const legalBallIndex = inn.totals.legalBalls;
  const rec = {
    ts: Date.now(),
    innings: state.innings,
    bat: state.bat,
    striker: strikerName,
    nonStriker: nonStrikerName,
    bowler: bowlerName,
    runsBat,
    extraType: extraType || "",
    extraRuns,
    penaltyRuns: payload.penaltyRuns ? (parseInt(payload.penaltyRuns,10)||0) : 0,
    totalRuns,
    legal,
    legalBallIndex,
    wicket: wicketObj,
    notes: safeStr(payload.notes || ""),
    cumRuns: inn.totals.runs,
    cumWkts: inn.totals.wkts
  };
  inn.balls.push(rec);

  // Update last6 and commentary
  if(legal){
    pushLast6(state, ballLabel(rec));
  } else {
    // don't push to last6 but show in commentary
  }

  const note = [];
  if(rec.wicket) note.push(`WICKET ${rec.wicket.kind}`);
  if(rec.extraType) note.push(`${rec.extraType.toUpperCase()}+${rec.extraRuns||1}`);
  if(runsBat) note.push(`${runsBat} run`);
  if(!note.length) note.push("dot");
  state.commentary.unshift(note.join(" • "));

  // Strike rotation: based on runs off the bat + byes/leg byes? (totalRuns excluding wides)
  // For wide, strike generally doesn't change unless runs taken; here we keep simple:
  const forStrike = (isWide ? 0 : (runsBat + (isBye||isLb ? extraRuns : 0)));
  if(forStrike % 2 === 1){
    rotateStrikeState(state);
  }

  // End of over (legal ball boundary)
  if(legal && (inn.totals.legalBalls % 6 === 0)){
    rotateStrikeState(state);
    state.commentary.unshift("End over • Strike swapped");
  }

  // Auto end innings conditions
  const oversLimitBalls = (state.meta?.oversLimit || T10_RULES.overs) * 6;
  if(inn.totals.wkts >= 10){
    endInnings(state, "all out");
  } else if(inn.totals.legalBalls >= oversLimitBalls){
    endInnings(state, "overs complete");
  } else if(state.innings === 2 && state.target && inn.totals.runs >= state.target){
    // chase completed
    endInnings(state, "target reached");
  }

  // Sync legacy counters
  recomputeLegacyFromInnings(state);

  // sync visible striker/nonStriker/bowler legacy objects from innings batter stats
  const sObj = inn.batters[strikerName] || {name:strikerName,r:0,b:0,f4:0,f6:0};
  const nsObj = inn.batters[nonStrikerName] || {name:nonStrikerName,r:0,b:0,f4:0,f6:0};
  state.striker = { name: strikerName, r:sObj.r, b:sObj.b, f4:sObj.f4, f6:sObj.f6 };
  state.nonStriker = { name: nonStrikerName, r:nsObj.r, b:nsObj.b, f4:nsObj.f4, f6:nsObj.f6 };
  state.bowler = { name: bowlerName, balls: (inn.bowlers[bowlerName]?.legalBalls||0), runs: (inn.bowlers[bowlerName]?.runs||0), wkts: (inn.bowlers[bowlerName]?.wkts||0) };

  return state;
}

function applyEvent(state, ev){
  state = deepClone(state);
  state.seq = (state.seq||0) + 1;
  state.updatedAt = Date.now();
  state.commentary = state.commentary || [];

  // --- Meta / setup ---
  if(ev.type === "SET_META"){
    state.meta = state.meta || {};
    for(const k of ["teamA","teamB","tossWinner","tossDecision","battingFirst","oversLimit","bowlerMaxOvers"]){
      if(ev[k] != null) state.meta[k] = ev[k];
    }
    state.commentary.unshift("Match meta updated");
    return state;
  }

  if(ev.type === "SET_SQUADS"){
    state.squads = state.squads || {A:[],B:[]};
    if(Array.isArray(ev.squadA)) state.squads.A = ev.squadA;
    if(Array.isArray(ev.squadB)) state.squads.B = ev.squadB;
    state.commentary.unshift("Squads saved (15)");
    return state;
  }

  if(ev.type === "SET_PLAYING_XI"){
    state.playingXI = state.playingXI || {A:[],B:[]};
    if(Array.isArray(ev.xiA)) state.playingXI.A = ev.xiA;
    if(Array.isArray(ev.xiB)) state.playingXI.B = ev.xiB;
    state.commentary.unshift("Playing XI saved (11)");
    return state;
  }

  if(ev.type === "SET_PLAYERS"){
    // Striker/non-striker/bowler for current innings
    const inn = getCurrentInnings(state);
    state.striker = { name: safeStr(ev.striker).trim(), r:0,b:0,f4:0,f6:0 };
    state.nonStriker = { name: safeStr(ev.nonStriker).trim(), r:0,b:0,f4:0,f6:0 };
    state.bowler = { name: safeStr(ev.bowler).trim(), balls:0,runs:0,wkts:0 };
    // ensure stats entries exist
    ensureBatter(inn, state.striker.name);
    ensureBatter(inn, state.nonStriker.name);
    ensureBowler(inn, state.bowler.name);
    state.commentary.unshift("Players selected");
    return state;
  }

  if(ev.type === "START_INNINGS"){
    // Reset current innings state & set batting side explicitly
    const bat = (ev.bat === "A" || ev.bat === "B") ? ev.bat : state.bat;
    state.bat = bat;
    state.innings = ev.innings ? parseInt(ev.innings,10) : state.innings;
    const key = String(state.innings);
    state.inningsData = state.inningsData || {};
    state.inningsData[key] = newInningsObj(bat);
    state.commentary.unshift(`Innings ${state.innings} started`);
    recomputeLegacyFromInnings(state);
    return state;
  }

  if(ev.type === "END_INNINGS"){
    return endInnings(state, ev.reason || "manual");
  }

  if(ev.type === "BALL"){
    return applyBall(state, ev);
  }

  if(ev.type === "SET_RESULT"){
    state.result = {
      winner: safeStr(ev.winner),
      method: safeStr(ev.method||""),
      margin: safeStr(ev.margin||""),
      mom: safeStr(ev.mom||""),
      note: safeStr(ev.note||""),
      decidedAt: Date.now()
    };
    state.commentary.unshift(`Result set • ${state.result.winner}`);
    return state;
  }

  // Backward compatibility (old button events)
  if(ev.type === "RUN"){
    return applyBall(state, { runsBat: ev.runs||0 });
  }
  if(ev.type === "WD"){
    return applyBall(state, { extraType:"wd", extraRuns: ev.runs||1 });
  }
  if(ev.type === "NB"){
    return applyBall(state, { extraType:"nb", extraRuns: ev.runs||1 });
  }
  if(ev.type === "BYE"){
    return applyBall(state, { extraType:"b", extraRuns: ev.runs||1, runsBat:0 });
  }
  if(ev.type === "LB"){
    return applyBall(state, { extraType:"lb", extraRuns: ev.runs||1, runsBat:0 });
  }
  if(ev.type === "WICKET"){
    return applyBall(state, { runsBat: ev.runs||0, wicket: { kind: ev.how||"Wicket", batter: state.striker?.name||"" } });
  }
  if(ev.type === "SWAP_STRIKE"){
    rotateStrikeState(state);
    state.commentary.unshift("Strike swapped");
    return state;
  }
  if(ev.type === "END_OVER"){
    rotateStrikeState(state);
    state.commentary.unshift("End over");
    return state;
  }

  return state;
}
