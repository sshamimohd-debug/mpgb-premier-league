const KEY = "mpgbpl_v1";

function nowISO(){ return new Date().toISOString(); }

function defaultState(){
  // Create basic teams with placeholder players (editable later)
  const teams = {};
  for(const g of Object.keys(IOM.groups)){
    for(const t of IOM.groups[g].teams){
      teams[t] = {
        name: t,
        group: g,
        players: Array.from({length: 15}).map((_,i)=>({ id:`${t}-${i+1}`, name:`Player ${i+1}`, role:"", }))
      };
    }
  }

  return {
    meta: { createdAt: nowISO(), updatedAt: nowISO() },
    teams,
    nominations: [], // submitted forms
    matches: IOM.leagueMatches.map(m => ({
      ...m,
      status: "SCHEDULED", // LIVE | DONE
      createdAt: nowISO(),
      updatedAt: nowISO(),
      innings: [],          // will hold innings objects
      result: null
    })),
    liveMatchId: null,
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return defaultState();
    return JSON.parse(raw);
  }catch(e){
    return defaultState();
  }
}

function saveState(st){
  st.meta.updatedAt = nowISO();
  localStorage.setItem(KEY, JSON.stringify(st));
  // broadcast for other tabs (local live)
  localStorage.setItem(KEY + "_ping", nowISO());
}

function resetState(){
  localStorage.removeItem(KEY);
  localStorage.removeItem(KEY + "_ping");
}

function onStateChanged(fn){
  window.addEventListener("storage", (e)=>{
    if(e.key === KEY || e.key === KEY + "_ping"){
      fn(loadState());
    }
  });
}
