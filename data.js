// IOM based data
// Groups/Venues table from IOM page showing Group A/B/C/D & venue cities. :contentReference[oaicite:6]{index=6}
window.IOM = {
  meta: {
    title: "MPGB Premier League – Cricket Tournament 2025-26",
    commencement: "10 January 2026", // Annexure-1 shows commencement date :contentReference[oaicite:7]{index=7}
  },

  groups: {
    A: { venue: "Indore", teams: ["Bhopal","Dewas","Head Office","Narmadapuram","Sehore"] },
    B: { venue: "Dhar", teams: ["Dhar","Jhabua","Khargone","Mandsaur","Ujjain"] },
    C: { venue: "Jabalpur", teams: ["Chhindwara","Jabalpur","Mandla","Rewa","Shahdol","Sidhi"] },
    D: { venue: "Gwalior", teams: ["Chhatarpur","Damoh","Gwalior","Satna","Shivpuri","Tikamgarh"] },
  },

  // League schedule table from IOM page 7. :contentReference[oaicite:8]{index=8}
  scheduleDates: ["10 January 2026", "11 January 2026"],
  leagueMatches: [
    // Group A (Indore)
    { id:"A1", group:"A", venue:"Indore", time:"9:00 pm", team1:"Sehore", team2:"Dewas" },
    { id:"A2", group:"A", venue:"Indore", time:"10:15 pm", team1:"Narmadapuram", team2:"Head Office" },
    { id:"A3", group:"A", venue:"Indore", time:"11:30 pm", team1:"Dewas", team2:"Bhopal" },
    { id:"A4", group:"A", venue:"Indore", time:"12:45 am", team1:"Head Office", team2:"Sehore" },
    { id:"A5", group:"A", venue:"Indore", time:"2:00 am", team1:"Bhopal", team2:"Narmadapuram" },

    // Group B (Dhar)
    { id:"B1", group:"B", venue:"Dhar", time:"9:00 pm", team1:"Ujjain", team2:"Mandsaur" },
    { id:"B2", group:"B", venue:"Dhar", time:"10:15 pm", team1:"Khargone", team2:"Dhar" },
    { id:"B3", group:"B", venue:"Dhar", time:"11:30 pm", team1:"Jhabua", team2:"Ujjain" },
    { id:"B4", group:"B", venue:"Dhar", time:"12:45 am", team1:"Mandsaur", team2:"Khargone" },
    { id:"B5", group:"B", venue:"Dhar", time:"2:00 am", team1:"Dhar", team2:"Jhabua" },

    // Group C (Jabalpur)
    { id:"C1", group:"C", venue:"Jabalpur", time:"9:00 pm", team1:"Rewa", team2:"Shahdol" },
    { id:"C2", group:"C", venue:"Jabalpur", time:"10:15 pm", team1:"Chhindwara", team2:"Mandla" },
    { id:"C3", group:"C", venue:"Jabalpur", time:"11:30 pm", team1:"Shahdol", team2:"Sidhi" },
    { id:"C4", group:"C", venue:"Jabalpur", time:"12:45 am", team1:"Mandla", team2:"Jabalpur" },
    { id:"C5", group:"C", venue:"Jabalpur", time:"2:00 am", team1:"Sidhi", team2:"Rewa" },
    { id:"C6", group:"C", venue:"Jabalpur", time:"3:15 am", team1:"Jabalpur", team2:"Chhindwara" },

    // Group D (Gwalior)
    { id:"D1", group:"D", venue:"Gwalior", time:"9:00 pm", team1:"Tikamgarh", team2:"Gwalior" },
    { id:"D2", group:"D", venue:"Gwalior", time:"10:15 pm", team1:"Damoh", team2:"Satna" },
    { id:"D3", group:"D", venue:"Gwalior", time:"11:30 pm", team1:"Gwalior", team2:"Shivpuri" },
    { id:"D4", group:"D", venue:"Gwalior", time:"12:45 am", team1:"Satna", team2:"Chhatarpur" },
    { id:"D5", group:"D", venue:"Gwalior", time:"2:00 am", team1:"Shivpuri", team2:"Tikamgarh" },
    { id:"D6", group:"D", venue:"Gwalior", time:"3:15 am", team1:"Chhatarpur", team2:"Damoh" },
  ],

  knockouts: {
    semi1: "Group A Winner vs Group C Winner",
    semi2: "Group B Winner vs Group D Winner",
    final: "Winner SF1 vs Winner SF2",
  }, // from Knockouts section :contentReference[oaicite:9]{index=9}

  rules: {
    overs: 10,                 // :contentReference[oaicite:10]{index=10}
    powerplayOvers: 3,         // :contentReference[oaicite:11]{index=11}
    bowlerMaxOvers: 2,         // :contentReference[oaicite:12]{index=12}
    ball: "Tennis ball",       // :contentReference[oaicite:13]{index=13}
    awards: ["Man of the Match", "Sixer King", "Best Bowler"], // :contentReference[oaicite:14]{index=14}
    // NOTE: This app also shows a points table (Pts/NRR) for transparency.
    // Final qualification is still strictly "Group Winner" as per IOM.
    qualification: "Group A winner vs Group C winner; Group B winner vs Group D winner.",
    // Tie-break (within a group) for selecting group winner:
    // 1) Points (Win=2, NR=1, Loss=0)
    // 2) Net Run Rate (NRR)
    // 3) Head-to-Head result (if exactly two teams are tied)
    // 4) Decider match / Super over as per tournament committee
    tieBreak: "Points → NRR → Head-to-Head (if 2-way tie) → Decider match/Super over.",
  }
};
// --- Adapter for matches/live/scorer pages (DEMO mode) ---
window.DATA = window.DATA || {};
window.DATA.schedule = (window.IOM?.leagueMatches || []).map((m, i) => ({
  id: m.id || `m${i+1}`,
  group: m.group || "",
  a: m.team1 || m.a || "",
  b: m.team2 || m.b || "",
  venue: m.venue || "",
  time: m.time || "",
  status: m.status || "SCHEDULED"
}));

