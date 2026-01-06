/**
 * Firestore realtime helpers (public live + scorer console)
 * - matches/{matchId}: { matchId, group, a, b, venue, time, status, pinHash, baseState, liveState, history, updatedAt }
 */
let RT = { fb:null, ready:false };

function initRealtime(){
  RT.fb = initFirebase();
  RT.ready = !!RT.fb.enabled;
  return RT;
}

function scheduleToMatches(){
  const out=[];
  (DATA.schedule||[]).forEach((x, idx)=>{
    const matchId = x.id || `m${idx+1}`;
    out.push({
      matchId,
      group: x.group || "",
      a: x.a,
      b: x.b,
      venue: x.venue || "",
      time: x.time || "",
      status: x.status || "SCHEDULED"
    });
  });
  return out;
}

function subscribeMatch(matchId, cb){
  if(!RT.ready){
    cb({ok:false, error:"Firebase not configured", data:null});
    return ()=>{};
  }
  return RT.fb.db.collection("matches").doc(matchId).onSnapshot((doc)=>{
    if(!doc.exists){
      cb({ok:false, error:"Match not found in Firestore", data:null});
      return;
    }
    cb({ok:true, data: doc.data()});
  }, (err)=>cb({ok:false, error: err.message, data:null}));
}

async function ensureAnonAuth(){
  if(!RT.ready || !RT.fb.auth) return;
  const u = RT.fb.auth.currentUser;
  if(u) return;
  await RT.fb.auth.signInAnonymously();
}

async function sha256Hex(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function verifyPin(matchDoc, pin){
  if(!matchDoc || !matchDoc.pinHash) return {ok:false, msg:"PIN not set for this match."};
  const h = await sha256Hex(String(pin||"").trim());
  return {ok: h===matchDoc.pinHash, msg: h===matchDoc.pinHash ? "OK" : "Invalid PIN"};
}

async function writeEvent(matchId, eventObj){
  if(!RT.ready) throw new Error("Firebase not configured");
  await ensureAnonAuth();

  const ref = RT.fb.db.collection("matches").doc(matchId);

  return RT.fb.db.runTransaction(async (tx)=>{
    const snap = await tx.get(ref);
    if(!snap.exists) throw new Error("Match not found");
    const doc = snap.data();

    const live = doc.liveState || newLiveState({matchId});
    const history = Array.isArray(doc.history) ? doc.history : [];
    const newHist = history.concat([{...eventObj, ts: Date.now(), seq: (live.seq||0)+1 }]).slice(-60);

    const next = applyEvent(live, eventObj);

    tx.set(ref, { liveState: next, history: newHist, updatedAt: Date.now() }, { merge:true });
    return next;
  });
}

async function undoLast(matchId){
  if(!RT.ready) throw new Error("Firebase not configured");
  await ensureAnonAuth();

  const ref = RT.fb.db.collection("matches").doc(matchId);
  return RT.fb.db.runTransaction(async (tx)=>{
    const snap = await tx.get(ref);
    if(!snap.exists) throw new Error("Match not found");
    const doc = snap.data();
    const history = Array.isArray(doc.history) ? doc.history : [];
    if(history.length===0) throw new Error("Nothing to undo");

    const newHistory = history.slice(0, -1);
    let st = doc.baseState || newLiveState({matchId});
    for(const ev of newHistory){
      st = applyEvent(st, ev);
    }
    tx.set(ref, { liveState: st, history: newHistory, updatedAt: Date.now() }, { merge:true });
    return st;
  });
}
