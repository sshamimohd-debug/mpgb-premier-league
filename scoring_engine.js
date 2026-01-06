/**
 * Scoring engine (shared by live + scorer)
 * LiveState shape:
 * { matchId, innings, bat, runs,wkts,balls, last6:[], striker, nonStriker, bowler, extras, commentary, updatedAt, seq }
 */
function newLiveState(match){
  return {
    matchId: match.matchId,
    meta: {
      teamA: match.a || "Team A",
      teamB: match.b || "Team B",
      tossWinner: "",
      tossDecision: "", // BAT/BOWL
      battingFirst: "", // A/B
    },
    innings: 1,
    bat: "A",
    innings1: null,
    innings2: null,
    target: null,
    runs: 0,
    wkts: 0,
    balls: 0,
    last6: [],
    striker: { name:"", r:0, b:0, f4:0, f6:0 },
    nonStriker: { name:"", r:0, b:0, f4:0, f6:0 },
    bowler: { name:"", balls:0, runs:0, wkts:0 },
    extras: { wd:0, nb:0, b:0, lb:0 },
    commentary: [],
    updatedAt: Date.now(),
    seq: 0
  };
}
function oversTextFromBalls(balls){ const o=Math.floor(balls/6), b=balls%6; return `${o}.${b}`; }
function crr(runs, balls){ const ov = balls/6; return ov>0 ? (runs/ov) : 0; }

function pushLast6(state, label){
  state.last6.push(label);
  if(state.last6.length>6) state.last6.shift();
}
function rotateStrikeState(state){
  const t = state.striker; state.striker = state.nonStriker; state.nonStriker = t;
}

function applyEvent(state, ev){
  state = JSON.parse(JSON.stringify(state));
  state.seq = (state.seq||0) + 1;
  state.updatedAt = Date.now();

  if(ev.type==="SET_PLAYERS"){
    state.striker = { name: ev.striker||"", r:0,b:0,f4:0,f6:0 };
    state.nonStriker = { name: ev.nonStriker||"", r:0,b:0,f4:0,f6:0 };
    state.bowler = { name: ev.bowler||"", balls:0,runs:0,wkts:0 };
    state.commentary.unshift("Players set");
    return state;
  }

  if(ev.type==="SET_META"){
    state.meta = state.meta || {};
    if(ev.teamA!=null) state.meta.teamA = ev.teamA;
    if(ev.teamB!=null) state.meta.teamB = ev.teamB;
    if(ev.tossWinner!=null) state.meta.tossWinner = ev.tossWinner;
    if(ev.tossDecision!=null) state.meta.tossDecision = ev.tossDecision;
    if(ev.battingFirst!=null) state.meta.battingFirst = ev.battingFirst;
    if(ev.bat!=null) state.bat = ev.bat;
    state.commentary.unshift("Match meta set");
    return state;
  }

  if(ev.type==="END_INNINGS"){
    const summary = { runs: state.runs, wkts: state.wkts, balls: state.balls };
    if(state.innings===1){
      state.innings1 = summary;
      state.target = summary.runs + 1;
      state.innings = 2;
      state.bat = (state.bat==="A") ? "B" : "A";
    }else{
      state.innings2 = summary;
    }

    // Reset ball-by-ball counters for next innings (if any)
    state.runs = 0; state.wkts = 0; state.balls = 0;
    state.last6 = [];
    state.striker = { name:"", r:0, b:0, f4:0, f6:0 };
    state.nonStriker = { name:"", r:0, b:0, f4:0, f6:0 };
    state.bowler = { name:"", balls:0, runs:0, wkts:0 };
    state.extras = { wd:0, nb:0, b:0, lb:0 };
    state.commentary.unshift(state.innings2 ? "Match innings ended" : "Innings ended");
    return state;
  }

  const addLegalBall = (batRuns, extraType=null, extraRuns=0, wicket=false, wicketHow="Wicket")=>{
    state.balls += 1;
    const total = (batRuns||0) + (extraRuns||0);
    state.runs += total;
    state.bowler.balls += 1;
    state.bowler.runs += total;

    state.striker.b += 1;
    state.striker.r += (batRuns||0);
    if(batRuns===4) state.striker.f4 += 1;
    if(batRuns===6) state.striker.f6 += 1;

    if(extraType){
      state.extras[extraType] = (state.extras[extraType]||0) + (extraRuns||0);
    }

    if(wicket){
      state.wkts += 1;
      state.bowler.wkts += 1;
      pushLast6(state, "W");
      state.commentary.unshift(`WICKET • ${wicketHow}`);
    }else{
      pushLast6(state, String(batRuns||0));
      state.commentary.unshift(`RUN • ${batRuns||0}`);
    }

    if(total % 2 === 1) rotateStrikeState(state);
  };

  const addExtraNotBall = (extraType, extraRuns)=>{
    const r = Math.max(1, Math.min(12, parseInt(extraRuns||1,10)||1));
    state.runs += r;
    state.bowler.runs += r;
    state.extras[extraType] = (state.extras[extraType]||0) + r;
    pushLast6(state, `${extraType.toUpperCase()}+${r}`);
    state.commentary.unshift(`${extraType.toUpperCase()} +${r}`);
  };

  if(ev.type==="RUN"){ addLegalBall(ev.runs||0); return state; }
  if(ev.type==="WD"){ addExtraNotBall("wd", ev.runs||1); return state; }
  if(ev.type==="NB"){ addExtraNotBall("nb", ev.runs||1); return state; }
  if(ev.type==="BYE"){ addLegalBall(0,"b",ev.runs||1,false,""); return state; }
  if(ev.type==="LB"){ addLegalBall(0,"lb",ev.runs||1,false,""); return state; }
  if(ev.type==="WICKET"){ addLegalBall(ev.runs||0,null,0,true, ev.how||"Wicket"); return state; }
  if(ev.type==="END_OVER"){ rotateStrikeState(state); state.commentary.unshift("End over"); return state; }
  if(ev.type==="SWAP_STRIKE"){ rotateStrikeState(state); state.commentary.unshift("Strike swapped"); return state; }

  return state;
}
