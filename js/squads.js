// ==========================================
// MPGB PREMIER LEAGUE – TEAM SQUADS (FINAL)
// SAFE FILE – DOES NOT TOUCH ANY OLD CODE
// ==========================================

const TEAM_SQUADS = {

  "Bhopal": makeSquad("BH"),
  "Chhatarpur": makeSquad("CH"),
  "Chhindwara": makeSquad("CW"),
  "Damoh": makeSquad("DA"),
  "Dewas": makeSquad("DE"),
  "Dhar": makeSquad("DH"),
  "Gwalior": makeSquad("GW"),
  "Head Office": makeSquad("HO"),
  "Jabalpur": makeSquad("JB"),
  "Jhabua": makeSquad("JH"),
  "Khargone": makeSquad("KH"),
  "Mandla": makeSquad("MD"),
  "Mandsaur": makeSquad("MS"),
  "Narmadapuram": makeSquad("NP"),
  "Rewa": makeSquad("RW"),
  "Satna": makeSquad("ST"),
  "Sehore": makeSquad("SH"),
  "Shahdol": makeSquad("SD"),
  "Shivpuri": makeSquad("SP"),
  "Sidhi": makeSquad("SI"),
  "Tikamgarh": makeSquad("TK"),
  "Ujjain": makeSquad("UJ")
};

// ---------- helper functions ----------

function makeSquad(code) {
  return [
    player(code,1,"Amit Sharma","Batsman","Opener"),
    player(code,2,"Rohit Verma","All-Rounder","Power Hitter"),
    player(code,3,"Sandeep Yadav","Bowler","Fast"),
    player(code,4,"Vikas Jain","Batsman","Anchor"),
    player(code,5,"Nitin Patel","Bowler","Death Overs"),
    player(code,6,"Rahul Singh","All-Rounder","Finisher"),
    player(code,7,"Aakash Mishra","Bowler","Swing"),
    player(code,8,"Manoj Gupta","Batsman","Middle Order"),
    player(code,9,"Deepak Soni","Bowler","Off Spin"),
    player(code,10,"Kunal Tiwari","All-Rounder","Utility"),
    player(code,11,"Pankaj Dubey","Batsman","Aggressive"),
    player(code,12,"Sachin Rathore","Bowler","Leg Spin"),
    player(code,13,"Harshit Malviya","Batsman","Stroke Player"),
    player(code,14,"Ankit Chourasia","All-Rounder","Medium Pace"),
    player(code,15,"Sunil Yadav","Wicket Keeper","Safe Hands")
  ];
}

function player(code,no,name,role,speciality){
  return {
    id: code + no,
    name,
    role,
    speciality
  };
}
