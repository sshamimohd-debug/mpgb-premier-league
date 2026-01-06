(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const params = new URLSearchParams(location.search);
  const matchId = params.get("matchId") || "m1";

  /***********************
   * 🔐 SCORER PIN CONFIG
   ***********************/
  const SCORER_PIN = "1011";   // 👈 यही PIN है (yahan change kar sakte ho)
  let scorerUnlocked = false;

  /***********************
   * Init realtime
   ***********************/
  if (typeof initRealtime === "function") initRealtime();

  /***********************
   * PIN MODAL HANDLING
   ***********************/
  document.addEventListener("DOMContentLoaded", () => {
    const pinModal = $("#pinModal");
    const pinInput = $("#pinInput");
    const pinOk = $("#pinOk");
    const pinCancel = $("#pinCancel");
    const pinMsg = $("#pinMsg");

    // Show PIN modal on load
    if (pinModal) pinModal.style.display = "flex";

    pinOk?.addEventListener("click", () => {
      if (pinInput.value === SCORER_PIN) {
        scorerUnlocked = true;
        pinModal.style.display = "none";
        pinMsg.textContent = "";
        console.log("✅ Scorer unlocked");
      } else {
        pinMsg.textContent = "❌ Wrong PIN";
      }
    });

    pinCancel?.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "matches.html";
    });
  });

  /***********************
   * 🔒 LOCK ALL SCORING
   ***********************/
  function requireUnlock() {
    if (!scorerUnlocked) {
      alert("Please enter PIN to start scoring");
      return false;
    }
    return true;
  }

  /***********************
   * EXAMPLE SCORING ACTIONS
   * (buttons call these)
   ***********************/
  window.addRun = function (runs) {
    if (!requireUnlock()) return;
    addEvent({ type: "RUN", runs });
  };

  window.addWicket = function () {
    if (!requireUnlock()) return;
    addEvent({ type: "WICKET" });
  };

  window.addExtra = function (kind) {
    if (!requireUnlock()) return;
    addEvent({ type: "EXTRA", extra: kind });
  };

  /***********************
   * FIREBASE / DEMO EVENT
   ***********************/
  function addEvent(ev) {
    if (window.RT && RT.ready) {
      RT.addEvent(matchId, ev);
    } else {
      console.log("DEMO EVENT:", ev);
      alert("Firebase not active – demo mode");
    }
  }

})();
