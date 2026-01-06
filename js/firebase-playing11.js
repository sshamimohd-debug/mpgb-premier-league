// =======================================
// Firebase Playing 11 Helper
// =======================================

function savePlaying11(matchId, team, players) {
  return db.collection("matches")
    .doc(matchId)
    .set({
      playing11: {
        [team]: players
      }
    }, { merge: true });
}

function getPlaying11(matchId, callback) {
  db.collection("matches")
    .doc(matchId)
    .onSnapshot(doc => {
      if (doc.exists && doc.data().playing11) {
        callback(doc.data().playing11);
      }
    });
}
