/*************************************************
 * Firebase bootstrap (NO module, simple JS)
 *************************************************/

// Firebase configuration (PASTED FROM CONSOLE)
const firebaseConfig = {
  apiKey: "AIzaSyCWRIDYm4X1pJsp9K-3m6kxRldI2PecHDs",
  authDomain: "mpgb-premier-league.firebaseapp.com",
  projectId: "mpgb-premier-league",
  storageBucket: "mpgb-premier-league.firebasestorage.app",
  messagingSenderId: "442384671822",
  appId: "1:442384671822:web:a813ce02cfaa3a63fecf1f"
};

// Global Firebase handle
window.FB = {
  enabled: false,
  app: null,
  db: null,
  auth: null
};

// Initialize Firebase
window.initFirebase = function () {
  try {
    if (!firebase || !firebase.initializeApp) {
      console.warn("Firebase SDK not loaded");
      return window.FB;
    }

    if (!firebase.apps.length) {
      window.FB.app = firebase.initializeApp(firebaseConfig);
    } else {
      window.FB.app = firebase.app();
    }

    window.FB.db = firebase.firestore();

    if (firebase.auth) {
      window.FB.auth = firebase.auth();
      // Anonymous login for scorer
      window.FB.auth.signInAnonymously().catch(() => {});
    }

    window.FB.enabled = true;
    console.log("Firebase initialized successfully");
    return window.FB;

  } catch (e) {
    console.error("Firebase init failed", e);
    return window.FB;
  }
};
