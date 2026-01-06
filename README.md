# MPGB Premier League 2025-26 (Static GitHub Pages)

Tabs:
- Home, Teams & Venues, Schedule, Knockouts, Rules, Nomination, Live Scoring

Live Scoring:
- Dream11/Cric style mini scorecard
- 1-tap scorer console
- Enforces: 10 overs, Powerplay 3 overs, Bowler max 2 overs

Deploy:
1) Create GitHub repo
2) Upload files
3) Settings → Pages → Deploy from branch → /root
4) Open your GitHub Pages URL


---

## New (Mobile-first) Live + Multi-Scorer Setup

This repo now includes separate pages:

- `matches.html` — Match list (entry point)
- `standings.html` — Points table (Win=2, NR=1, Loss=0) calculated from finished matches
- `live.html?matchId=m1` — Public live view (compact)
- `scorecard.html?matchId=m1` — Full scorecard view
- `scorer.html?matchId=m1` — Scorer console (PIN-protected), bottom keypad + top sticky score

Scorer adds:
- Toss/Batting setup
- End innings (auto sets Target for 2nd innings)
- Finish match (stores Result + ScoreSummary for standings)

### Firebase (optional, for realtime multi-scorer)

Without Firebase config, pages will run in demo mode (no realtime).

1) Create Firebase project  
2) Enable **Firestore**  
3) (Recommended) Enable **Authentication → Anonymous**  
4) Paste config in `firebase.js`

Tip: Scorer console includes:
- **Toss / Batting** (sets who bats first)
- **End Innings** (starts 2nd innings + sets Target)
- **Finish Match** (sets status DONE + result + stores scoreSummary used in standings)

### Firestore Security Rules (recommended)

This repo includes a starter `firestore.rules` you can copy into your Firebase project.
Client-side PIN is only a convenience lock; for stronger security, enforce scorer roles server-side.

Optional (recommended): deploy Firestore rules from `firestore.rules`.

### Create Match Docs in Firestore (one-time)

Create collection: `matches`

Each match doc id should match `matchId` from `data.js` schedule (m1, m2, ...)

Example doc fields:
- `a`: "Sehore"
- `b`: "Dewas"
- `group`: "Group A"
- `venue`: "Venus"
- `status`: "LIVE"
- `pinHash`: "<sha256 hex of PIN>"
- `baseState`: (optional) base live state
- `liveState`: (optional) current live state
- `history`: (optional) array of recent events

### PIN hash

PIN is verified client-side by comparing SHA-256(PIN) with `pinHash` in match doc.

You can generate `pinHash` quickly in browser console:

```js
async function sha256Hex(s){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
sha256Hex("1234").then(console.log);
```

Paste that hex into the match doc `pinHash`.
