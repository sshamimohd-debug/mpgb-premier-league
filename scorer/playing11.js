const teamSelect = document.getElementById("teamSelect");
const playersDiv = document.getElementById("players");
const msg = document.getElementById("msg");

let selectedPlayers = [];

Object.keys(TEAM_SQUADS).forEach(team => {
  const opt = document.createElement("option");
  opt.value = team;
  opt.textContent = team;
  teamSelect.appendChild(opt);
});

teamSelect.addEventListener("change", () => {
  playersDiv.innerHTML = "";
  selectedPlayers = [];
  msg.textContent = "";

  const team = teamSelect.value;
  if (!team) return;

  TEAM_SQUADS[team].forEach(p => {
    const div = document.createElement("div");
    div.className = "player";
    div.innerHTML = `
      <label>
        <input type="checkbox" value="${p.id}">
        <b>${p.name}</b> (${p.role})
      </label>
    `;
    div.querySelector("input").addEventListener("change", e => {
      if (e.target.checked) {
        if (selectedPlayers.length >= 11) {
          alert("सिर्फ 11 खिलाड़ी चुन सकते हैं");
          e.target.checked = false;
          return;
        }
        selectedPlayers.push(p.id);
      } else {
        selectedPlayers = selectedPlayers.filter(id => id !== p.id);
      }
    });
    playersDiv.appendChild(div);
  });
});

function lockPlaying11() {
  if (selectedPlayers.length !== 11) {
    alert("Exactly 11 खिलाड़ी select करना जरूरी है");
    return;
  }

  const team = teamSelect.value;

  // अभी demo के लिए fixed matchId
  const matchId = "match1";

  savePlaying11(matchId, team, selectedPlayers)
    .then(() => {
      msg.textContent = "Playing 11 Firebase में SAVE हो गई ✅";
    })
    .catch(error => {
      alert("Firebase में save करने में error");
      console.error(error);
    });
}
