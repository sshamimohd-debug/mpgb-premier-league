/**
 * Firebase bootstrap (compat SDK).
 * 1) Create Firebase project
 * 2) Enable Firestore + (optional) Anonymous Auth
 * 3) Paste your firebaseConfig below
 */
const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

let FB = { enabled:false, app:null, db:null, auth:null };

function initFirebase(){
  try{
    if(!firebaseConfig || String(firebaseConfig.apiKey||"").startsWith("PASTE_")) return FB;
    FB.app = firebase.initializeApp(firebaseConfig);
    FB.db = firebase.firestore();
    FB.auth = firebase.auth ? firebase.auth() : null;
    FB.enabled = true;
    return FB;
  }catch(e){
    console.warn("Firebase init failed", e);
    return FB;
  }
}
