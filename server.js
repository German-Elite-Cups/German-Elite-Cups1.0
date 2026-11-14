const express=require("express");
const session=require("express-session");
const bcrypt=require("bcryptjs");
const Database=require("better-sqlite3");
const multer=require("multer");
const path=require("path");
const fs=require("fs");

const app=express();
// Railway läuft hinter einem Reverse Proxy. Damit Express HTTPS korrekt erkennt
// und Secure-Session-Cookies an den Browser senden kann, Proxy vertrauen.
app.set("trust proxy", 1);
const PORT=process.env.PORT||3000;
const DB=process.env.GEC_DB||path.join(__dirname,"gec.sqlite");
const db=new Database(DB);
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 ea_name TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'member',
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS teams(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 abbreviation TEXT NOT NULL UNIQUE,
 ea_name TEXT NOT NULL,
 crest TEXT,
 description TEXT DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending',
 owner_id INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(owner_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS rosters(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 team_id INTEGER NOT NULL,
 user_id INTEGER NOT NULL UNIQUE,
 shirt_number INTEGER NOT NULL,
 main_position TEXT NOT NULL DEFAULT '',
 secondary_position_1 TEXT DEFAULT '',
 secondary_position_2 TEXT DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS competitions(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 type TEXT NOT NULL,
 name TEXT NOT NULL,
 description TEXT DEFAULT '',
 logo TEXT,
 start_date TEXT,
 status TEXT NOT NULL DEFAULT 'upcoming',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS matches(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 competition_id INTEGER,
 home_team_id INTEGER,
 away_team_id INTEGER,
 kickoff TEXT,
 status TEXT NOT NULL DEFAULT 'pending',
 home_score INTEGER,
 away_score INTEGER,
 FOREIGN KEY(competition_id) REFERENCES competitions(id) ON DELETE SET NULL,
 FOREIGN KEY(home_team_id) REFERENCES teams(id) ON DELETE SET NULL,
 FOREIGN KEY(away_team_id) REFERENCES teams(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS transfer_windows(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 starts_at TEXT NOT NULL,
 ends_at TEXT NOT NULL,
 reason TEXT DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS transfers(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 player_id INTEGER NOT NULL,
 from_team_id INTEGER,
 to_team_id INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 decided_at TEXT,
 FOREIGN KEY(player_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(from_team_id) REFERENCES teams(id) ON DELETE SET NULL,
 FOREIGN KEY(to_team_id) REFERENCES teams(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS bans(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 target_type TEXT NOT NULL,
 target_id INTEGER NOT NULL,
 starts_at TEXT NOT NULL,
 ends_at TEXT NOT NULL,
 reason TEXT DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS player_profiles(
 user_id INTEGER PRIMARY KEY,
 age INTEGER,
 height_cm INTEGER,
 weight_kg INTEGER,
 position TEXT DEFAULT '',
 bio TEXT DEFAULT '',
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS player_match_stats(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 match_id INTEGER NOT NULL,
 player_id INTEGER NOT NULL,
 goals INTEGER NOT NULL DEFAULT 0,
 assists INTEGER NOT NULL DEFAULT 0,
 clean_sheet INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(match_id, player_id),
 FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE,
 FOREIGN KEY(player_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS free_agents(
 user_id INTEGER PRIMARY KEY, age INTEGER, main_position TEXT NOT NULL DEFAULT '', secondary_position_1 TEXT DEFAULT '', secondary_position_2 TEXT DEFAULT '', secondary_position_3 TEXT DEFAULT '', bio TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS free_agent_applications(
 id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INTEGER NOT NULL, team_id INTEGER NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, decided_at TEXT,
 FOREIGN KEY(player_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS team_managers(
 team_id INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'co_manager', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(team_id,user_id),
 FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS player_market_values(
 user_id INTEGER PRIMARY KEY, manual_value INTEGER, note TEXT DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// Migration für bestehende GEC-Datenbanken: Kaderpositionen nachrüsten.
const transferColumns=db.prepare("PRAGMA table_info(transfers)").all().map(x=>x.name);
if(!transferColumns.includes("offer_message")) db.exec("ALTER TABLE transfers ADD COLUMN offer_message TEXT DEFAULT ''");

const profileColumns=db.prepare("PRAGMA table_info(player_profiles)").all().map(x=>x.name);
if(!profileColumns.includes("main_position")) db.exec("ALTER TABLE player_profiles ADD COLUMN main_position TEXT DEFAULT ''");
if(!profileColumns.includes("secondary_position_1")) db.exec("ALTER TABLE player_profiles ADD COLUMN secondary_position_1 TEXT DEFAULT ''");
if(!profileColumns.includes("secondary_position_2")) db.exec("ALTER TABLE player_profiles ADD COLUMN secondary_position_2 TEXT DEFAULT ''");
if(!profileColumns.includes("secondary_position_3")) db.exec("ALTER TABLE player_profiles ADD COLUMN secondary_position_3 TEXT DEFAULT ''");

const rosterColumns=db.prepare("PRAGMA table_info(rosters)").all().map(x=>x.name);
if(!rosterColumns.includes("main_position")) db.exec("ALTER TABLE rosters ADD COLUMN main_position TEXT NOT NULL DEFAULT ''");
if(!rosterColumns.includes("secondary_position_1")) db.exec("ALTER TABLE rosters ADD COLUMN secondary_position_1 TEXT DEFAULT ''");
if(!rosterColumns.includes("secondary_position_2")) db.exec("ALTER TABLE rosters ADD COLUMN secondary_position_2 TEXT DEFAULT ''");

app.use(express.urlencoded({extended:true}));
app.use(express.json());
// Persistente Session ohne natives connect-sqlite3-Modul.
 // Railway kann dadurch normal mit npm install bauen; der Session-Store
 // verwendet dieselbe better-sqlite3-Datenbank wie die GEC-Daten.
 class SQLiteSessionStore extends session.Store {
   constructor(database){
     super();
     this.db=database;
     this.db.exec(`CREATE TABLE IF NOT EXISTS sessions (
       sid TEXT PRIMARY KEY,
       sess TEXT NOT NULL,
       expire INTEGER NOT NULL
     )`);
   }
   get(sid, cb){
     try {
       const row=this.db.prepare("SELECT sess, expire FROM sessions WHERE sid=?").get(sid);
       if(!row){ return cb(null,null); }
       if(row.expire <= Date.now()){
         this.db.prepare("DELETE FROM sessions WHERE sid=?").run(sid);
         return cb(null,null);
       }
       return cb(null, JSON.parse(row.sess));
     } catch(e){ return cb(e); }
   }
   set(sid, sess, cb){
     try {
       const expire=Date.now() + (sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge : 30*24*60*60*1000);
       this.db.prepare(`INSERT INTO sessions(sid,sess,expire) VALUES(?,?,?)
         ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess, expire=excluded.expire`)
         .run(sid, JSON.stringify(sess), expire);
       return cb && cb(null);
     } catch(e){ return cb && cb(e); }
   }
   destroy(sid, cb){
     try { this.db.prepare("DELETE FROM sessions WHERE sid=?").run(sid); return cb && cb(null); }
     catch(e){ return cb && cb(e); }
   }
   touch(sid, sess, cb){
     try {
       const expire=Date.now() + (sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge : 30*24*60*60*1000);
       this.db.prepare("UPDATE sessions SET sess=?, expire=? WHERE sid=?")
         .run(JSON.stringify(sess), expire, sid);
       return cb && cb(null);
     } catch(e){ return cb && cb(e); }
   }
 }

 app.use(session({
   secret:process.env.SESSION_SECRET||"CHANGE_THIS_IN_PRODUCTION",
   store:new SQLiteSessionStore(db),
   resave:false,
   saveUninitialized:false,
   proxy:true,
   cookie:{httpOnly:true,sameSite:"lax",secure:"auto",maxAge:1000*60*60*24*30}
 }));
app.use("/uploads",express.static(path.join(__dirname,"public/uploads")));
app.use(express.static(path.join(__dirname,"public")));

const upload=multer({
 storage:multer.diskStorage({
  destination:(req,file,cb)=>cb(null,path.join(__dirname,"public/uploads")),
  filename:(req,file,cb)=>cb(null,Date.now()+"-"+Math.random().toString(36).slice(2)+path.extname(file.originalname).toLowerCase())
 }),
 limits:{fileSize:3*1024*1024},
 fileFilter:(req,file,cb)=>cb(null,/^image\/(png|jpeg|webp)$/.test(file.mimetype))
});

const roleRank={member:0,admin:1,management:2,owner:3};
function user(){return reqUser();}
function reqUser(){return null;}
function currentUser(req){return req.session.userId?db.prepare("SELECT id,ea_name,role,active FROM users WHERE id=?").get(req.session.userId):null}
function requireLogin(req,res,next){const u=currentUser(req);if(!u||!u.active)return res.status(401).json({error:"Anmeldung erforderlich"});req.user=u;next()}
function requireRole(...roles){return (req,res,next)=>{const u=currentUser(req);if(!u||!u.active)return res.status(401).json({error:"Anmeldung erforderlich"});if(!roles.includes(u.role))return res.status(403).json({error:"Keine Berechtigung"});req.user=u;next()}}
function staff(req,res,next){return requireRole("owner","management","admin")(req,res,next)}
function nowIso(){return new Date().toISOString()}
function teamManager(req,teamId){ const team=db.prepare("SELECT id,owner_id,status FROM teams WHERE id=?").get(teamId); if(!team||team.status!=="approved")return null; if(team.owner_id===req.user.id)return team; return db.prepare("SELECT 1 FROM team_managers WHERE team_id=? AND user_id=?").get(teamId,req.user.id)?team:null; }
function calcMarketValue(stats){ return Math.max(0,Number(stats.goals||0)*100000+Number(stats.assists||0)*75000+Number(stats.clean_sheets||0)*125000); }
function marketFor(userId){ const stats=db.prepare("SELECT COALESCE(SUM(goals),0) goals,COALESCE(SUM(assists),0) assists,COALESCE(SUM(clean_sheet),0) clean_sheets FROM player_match_stats WHERE player_id=?").get(userId); const manual=db.prepare("SELECT manual_value,note FROM player_market_values WHERE user_id=?").get(userId); return {automatic_value:calcMarketValue(stats),manual_value:manual?.manual_value??null,value:manual?.manual_value??calcMarketValue(stats),note:manual?.note||"",basis:stats}; }
function transferBlocked(){
 const now=nowIso();
 return db.prepare("SELECT * FROM transfer_windows WHERE active=1 AND starts_at<=? AND ends_at>=? LIMIT 1").get(now,now);
}

app.get("/api/me",(req,res)=>res.json({user:currentUser(req)||null,setup:db.prepare("SELECT COUNT(*) c FROM users").get().c===0}));
app.post("/api/setup",async(req,res)=>{
 if(db.prepare("SELECT COUNT(*) c FROM users").get().c>0)return res.status(409).json({error:"Owner ist bereits eingerichtet"});
 const {eaName,password}=req.body;
 if(!eaName||!password||password.length<8)return res.status(400).json({error:"EA-Name und Passwort (mind. 8 Zeichen) erforderlich"});
 const hash=await bcrypt.hash(password,12);
 const info=db.prepare("INSERT INTO users(ea_name,password_hash,role) VALUES(?,?, 'owner')").run(eaName.trim(),hash);
 req.session.userId=info.lastInsertRowid;
 res.json({ok:true,user:currentUser(req)});
});
app.post("/api/register",async(req,res)=>{
 const eaName=String(req.body.eaName||"").trim(); const password=String(req.body.password||"");
 if(!eaName||password.length<8)return res.status(400).json({error:"EA-Name und Passwort (mind. 8 Zeichen) erforderlich"});
 try{
  const hash=await bcrypt.hash(password,12);
  const info=db.prepare("INSERT INTO users(ea_name,password_hash,role) VALUES(?,?,\'member\')").run(eaName,hash);
  db.prepare("INSERT INTO player_profiles(user_id,position) VALUES(?,?)").run(info.lastInsertRowid,"");
  req.session.userId=info.lastInsertRowid; res.json({ok:true,user:currentUser(req)});
 }catch(e){res.status(409).json({error:"EA-Name ist bereits registriert"})}
});
app.post("/api/login",async(req,res)=>{
 const eaName=String(req.body.eaName||"").trim();
 const password=String(req.body.password||"");
 const u=db.prepare("SELECT * FROM users WHERE ea_name=?").get(eaName);
 if(!u||!u.active||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:"Login fehlgeschlagen"});
 req.session.userId=u.id;
 req.session.save(err=>{
  if(err)return res.status(500).json({error:"Sitzung konnte nicht gespeichert werden"});
  res.json({ok:true,user:currentUser(req)});
 });
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get("/api/stats",(req,res)=>{
 const q=t=>db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
 res.json({teams:q("teams"),cups:db.prepare("SELECT COUNT(*) c FROM competitions WHERE type='cup'").get().c,
 leagues:db.prepare("SELECT COUNT(*) c FROM competitions WHERE type='league'").get().c,
 matches:q("matches"),players:q("users")});
});
app.get("/api/teams",(req,res)=>res.json(db.prepare("SELECT id,name,abbreviation,ea_name,crest,status,owner_id FROM teams WHERE status='approved' ORDER BY name").all()));
app.post("/api/teams",requireLogin,upload.single("crest"),(req,res)=>{
 const {name,abbreviation,eaName,description}=req.body;
 if(!name||!eaName||!abbreviation||!/^[A-Za-z]{3}$/.test(String(abbreviation).trim()))return res.status(400).json({error:"Teamname, EA-Name und genau 3 Buchstaben (A-Z) sind erforderlich"});
 const isStaff=["owner","management","admin"].includes(req.user.role);
 const existing=db.prepare("SELECT id FROM rosters WHERE user_id=?").get(req.user.id);
 if(existing && !isStaff)return res.status(409).json({error:"Ein Spieler kann maximal einem Team angehören"});
 try{
  const status=isStaff ? "approved" : "pending";
  const info=db.prepare("INSERT INTO teams(name,abbreviation,ea_name,crest,description,status,owner_id) VALUES(?,?,?,?,?,?,?)")
   .run(name.trim(),abbreviation.toUpperCase(),eaName.trim(),req.file?"/uploads/"+req.file.filename:null,description||"",status,req.user.id);
  res.json({ok:true,id:info.lastInsertRowid,status,staffCreated:isStaff});
 }catch(e){res.status(400).json({error:e.message.includes("UNIQUE")?"Abkürzung bereits vergeben":"Team konnte nicht erstellt werden"})}
});

app.get("/api/teams/:id/managers",(req,res)=>{ const team=db.prepare("SELECT id,owner_id FROM teams WHERE id=?").get(req.params.id); if(!team)return res.status(404).json({error:"Team nicht gefunden"}); const owner=db.prepare("SELECT id,ea_name FROM users WHERE id=?").get(team.owner_id); const coManagers=db.prepare("SELECT tm.user_id,tm.role,u.ea_name FROM team_managers tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=?").all(req.params.id); res.json({owner,coManagers}); });
app.post("/api/teams/:id/co-manager",requireLogin,(req,res)=>{ const team=db.prepare("SELECT id,owner_id,status FROM teams WHERE id=?").get(req.params.id); if(!team||team.owner_id!==req.user.id||team.status!=="approved")return res.status(403).json({error:"Nur der Vereinsmanager kann einen Co. Manager hinzufügen"}); const player=db.prepare("SELECT id FROM users WHERE ea_name=? AND active=1").get(String(req.body.eaName||"").trim()); if(!player)return res.status(404).json({error:"GEC-Account nicht gefunden"}); if(player.id===team.owner_id)return res.status(400).json({error:"Der Vereinsmanager ist bereits Manager"}); db.prepare("INSERT OR REPLACE INTO team_managers(team_id,user_id,role) VALUES(?,?, 'co_manager')").run(team.id,player.id); res.json({ok:true}); });
app.delete("/api/teams/:id/co-manager/:userId",requireLogin,(req,res)=>{ const team=db.prepare("SELECT id,owner_id FROM teams WHERE id=?").get(req.params.id); if(!team||team.owner_id!==req.user.id)return res.status(403).json({error:"Nur der Vereinsmanager darf Co. Manager entfernen"}); db.prepare("DELETE FROM team_managers WHERE team_id=? AND user_id=?").run(team.id,req.params.userId); res.json({ok:true}); });

app.get("/api/competitions",(req,res)=>res.json(db.prepare("SELECT * FROM competitions ORDER BY start_date DESC, id DESC").all()));
app.get("/api/matches",(req,res)=>res.json(db.prepare(`
SELECT m.*, c.name competition_name, h.name home_name, h.crest home_crest, a.name away_name, a.crest away_crest
FROM matches m LEFT JOIN competitions c ON c.id=m.competition_id
LEFT JOIN teams h ON h.id=m.home_team_id LEFT JOIN teams a ON a.id=m.away_team_id
ORDER BY m.kickoff DESC`).all()));

app.get("/api/free-agents",(req,res)=>{ res.json(db.prepare(`SELECT fa.*,u.ea_name FROM free_agents fa JOIN users u ON u.id=fa.user_id WHERE fa.active=1 AND u.active=1 ORDER BY fa.updated_at DESC`).all().map(x=>({...x,market:marketFor(x.user_id)}))); });
app.get("/api/free-agents/me",requireLogin,(req,res)=>res.json(db.prepare("SELECT * FROM free_agents WHERE user_id=?").get(req.user.id)||null));
app.post("/api/free-agents",requireLogin,(req,res)=>{ const age=req.body.age===""?null:Number(req.body.age); const positions=[req.body.mainPosition,req.body.secondaryPosition1,req.body.secondaryPosition2,req.body.secondaryPosition3].map(x=>String(x||"").toUpperCase()).filter(Boolean); if(!positions.length)return res.status(400).json({error:"Hauptposition ist erforderlich"}); if(positions.length!==new Set(positions).size)return res.status(400).json({error:"Positionen dürfen nicht doppelt sein"}); if(age!==null&&(!Number.isInteger(age)||age<13||age>100))return res.status(400).json({error:"Alter muss zwischen 13 und 100 liegen"}); db.prepare(`INSERT INTO free_agents(user_id,age,main_position,secondary_position_1,secondary_position_2,secondary_position_3,bio,active,updated_at) VALUES(?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET age=excluded.age,main_position=excluded.main_position,secondary_position_1=excluded.secondary_position_1,secondary_position_2=excluded.secondary_position_2,secondary_position_3=excluded.secondary_position_3,bio=excluded.bio,active=1,updated_at=CURRENT_TIMESTAMP`).run(req.user.id,age,positions[0],positions[1]||"",positions[2]||"",positions[3]||"",String(req.body.bio||"").trim()); res.json({ok:true}); });
app.delete("/api/free-agents/me",requireLogin,(req,res)=>{db.prepare("UPDATE free_agents SET active=0,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(req.user.id);res.json({ok:true});});
app.post("/api/free-agents/me/apply",requireLogin,(req,res)=>{ req.params.id=req.user.id; const target=db.prepare("SELECT * FROM free_agents WHERE user_id=? AND active=1").get(req.user.id); if(!target)return res.status(404).json({error:"Du bist aktuell nicht als Free Agent gelistet"}); const teamId=Number(req.body.teamId),message=String(req.body.message||"").trim(); if(!teamId||message.length<5)return res.status(400).json({error:"Team und ein Bewerbungstext sind erforderlich"}); const team=db.prepare("SELECT id FROM teams WHERE id=? AND status='approved'").get(teamId); if(!team)return res.status(404).json({error:"Team nicht gefunden"}); const open=db.prepare("SELECT id FROM free_agent_applications WHERE player_id=? AND team_id=? AND status='pending'").get(req.user.id,team.id); if(open)return res.status(409).json({error:"Offene Bewerbung existiert bereits"}); const info=db.prepare("INSERT INTO free_agent_applications(player_id,team_id,message,status) VALUES(?,?,?,'pending')").run(req.user.id,team.id,message); res.json({ok:true,id:info.lastInsertRowid}); });
app.post("/api/free-agents/:id/apply",requireLogin,(req,res)=>{ const target=db.prepare("SELECT * FROM free_agents WHERE user_id=? AND active=1").get(req.params.id); if(!target)return res.status(404).json({error:"Free Agent nicht gefunden"}); if(req.user.id!==target.user_id)return res.status(403).json({error:"Nur der Free Agent selbst kann Bewerbungen senden"}); const teamId=Number(req.body.teamId),message=String(req.body.message||"").trim(); if(!teamId||message.length<5)return res.status(400).json({error:"Team und ein Bewerbungstext sind erforderlich"}); const team=db.prepare("SELECT id FROM teams WHERE id=? AND status='approved'").get(teamId); if(!team)return res.status(404).json({error:"Team nicht gefunden"}); const open=db.prepare("SELECT id FROM free_agent_applications WHERE player_id=? AND team_id=? AND status='pending'").get(target.user_id,team.id); if(open)return res.status(409).json({error:"Offene Bewerbung existiert bereits"}); const info=db.prepare("INSERT INTO free_agent_applications(player_id,team_id,message,status) VALUES(?,?,?,'pending')").run(target.user_id,team.id,message); res.json({ok:true,id:info.lastInsertRowid}); });
app.get("/api/teams/:id/free-agent-applications",requireLogin,(req,res)=>{if(!teamManager(req,req.params.id))return res.status(403).json({error:"Keine Berechtigung"});res.json(db.prepare(`SELECT a.*,u.ea_name,fa.age,fa.main_position,fa.secondary_position_1,fa.secondary_position_2,fa.secondary_position_3 FROM free_agent_applications a JOIN users u ON u.id=a.player_id LEFT JOIN free_agents fa ON fa.user_id=a.player_id WHERE a.team_id=? ORDER BY a.created_at DESC`).all(req.params.id));});
app.post("/api/teams/:id/free-agent-applications/:applicationId/decision",requireLogin,(req,res)=>{ if(!teamManager(req,req.params.id))return res.status(403).json({error:"Keine Berechtigung"}); const a=db.prepare("SELECT * FROM free_agent_applications WHERE id=? AND team_id=? AND status='pending'").get(req.params.applicationId,req.params.id); if(!a)return res.status(404).json({error:"Bewerbung nicht gefunden"}); const decision=req.body.decision; if(!["accepted","declined"].includes(decision))return res.status(400).json({error:"Ungültige Entscheidung"}); if(decision==='declined'){db.prepare("UPDATE free_agent_applications SET status='declined',decided_at=? WHERE id=?").run(nowIso(),a.id);return res.json({ok:true});} const existing=db.prepare("SELECT id FROM transfers WHERE player_id=? AND to_team_id=? AND status='pending'").get(a.player_id,a.team_id); if(!existing)db.prepare("INSERT INTO transfers(player_id,from_team_id,to_team_id,status,offer_message) VALUES(?,?,?,'pending',?)").run(a.player_id,null,a.team_id,a.message); db.prepare("UPDATE free_agent_applications SET status='accepted',decided_at=? WHERE id=?").run(nowIso(),a.id); res.json({ok:true}); });
app.post("/api/teams/:id/free-agent-offers",requireLogin,(req,res)=>{if(!teamManager(req,req.params.id))return res.status(403).json({error:"Nur Manager oder Co. Manager dürfen Angebote senden"});const player=db.prepare("SELECT user_id FROM free_agents WHERE user_id=? AND active=1").get(Number(req.body.playerId));if(!player)return res.status(404).json({error:"Free Agent nicht gefunden"});const message=String(req.body.message||"").trim();if(message.length<5)return res.status(400).json({error:"Angebotstext ist erforderlich"});const existing=db.prepare("SELECT id FROM transfers WHERE player_id=? AND to_team_id=? AND status='pending'").get(player.user_id,req.params.id);if(existing)return res.status(409).json({error:"Für diesen Spieler gibt es bereits ein offenes Angebot"});const current=db.prepare("SELECT team_id FROM rosters WHERE user_id=?").get(player.user_id);const info=db.prepare("INSERT INTO transfers(player_id,from_team_id,to_team_id,status,offer_message) VALUES(?,?,?,'pending',?)").run(player.user_id,current?current.team_id:null,req.params.id,message);res.json({ok:true,id:info.lastInsertRowid});});
app.get("/api/me/transfer-offers",requireLogin,(req,res)=>res.json(db.prepare(`SELECT tr.*,t.name to_name FROM transfers tr JOIN teams t ON t.id=tr.to_team_id WHERE tr.player_id=? AND tr.status='pending' ORDER BY tr.requested_at DESC`).all(req.user.id)));

app.get("/api/transfers",(req,res)=>res.json(db.prepare(`
SELECT tr.*,p.ea_name player_name,f.name from_name,t.name to_name
FROM transfers tr JOIN users p ON p.id=tr.player_id
LEFT JOIN teams f ON f.id=tr.from_team_id JOIN teams t ON t.id=tr.to_team_id
ORDER BY tr.requested_at DESC`).all()));
app.post("/api/transfers",requireLogin,(req,res)=>{
 const blocked=transferBlocked(); if(blocked)return res.status(423).json({error:"Transferperiode gesperrt",window:blocked});
 const to=db.prepare("SELECT * FROM teams WHERE id=? AND status='approved'").get(req.body.toTeamId);
 if(!to)return res.status(404).json({error:"Zielteam nicht gefunden"});
 const existing=db.prepare("SELECT * FROM rosters WHERE user_id=?").get(req.user.id);
 if(existing&&existing.team_id===to.id)return res.status(400).json({error:"Du bist bereits in diesem Team"});
 const pending=db.prepare("SELECT id FROM transfers WHERE player_id=? AND status='pending'").get(req.user.id);
 if(pending)return res.status(409).json({error:"Du hast bereits eine offene Transferanfrage"});
 const info=db.prepare("INSERT INTO transfers(player_id,from_team_id,to_team_id,status,offer_message) VALUES(?,?,?,'pending',?)").run(req.user.id,existing?existing.team_id:null,to.id,String(req.body.message||"").trim());
 res.json({ok:true,id:info.lastInsertRowid});
});
app.post("/api/transfers/:id/decision",requireLogin,(req,res)=>{
 const tr=db.prepare("SELECT * FROM transfers WHERE id=? AND player_id=? AND status='pending'").get(req.params.id,req.user.id);
 if(!tr)return res.status(404).json({error:"Transfer nicht gefunden"});
 if(req.body.decision==="decline"){db.prepare("UPDATE transfers SET status='declined',decided_at=? WHERE id=?").run(nowIso(),tr.id);return res.json({ok:true})}
 if(req.body.decision!=="accept")return res.status(400).json({error:"Ungültige Entscheidung"});
 if(transferBlocked())return res.status(423).json({error:"Transferperiode gesperrt"});
 const tx=db.transaction(()=>{
   const oldRoster=db.prepare("SELECT main_position,secondary_position_1,secondary_position_2,shirt_number FROM rosters WHERE user_id=?").get(req.user.id);
   const fa=db.prepare("SELECT main_position,secondary_position_1,secondary_position_2 FROM free_agents WHERE user_id=?").get(req.user.id);
   db.prepare("DELETE FROM rosters WHERE user_id=?").run(req.user.id);
   const count=db.prepare("SELECT COUNT(*) c FROM rosters WHERE team_id=?").get(tr.to_team_id).c;
   const main=oldRoster?.main_position||fa?.main_position||""; const p1=oldRoster?.secondary_position_1||fa?.secondary_position_1||""; const p2=oldRoster?.secondary_position_2||fa?.secondary_position_2||"";
   if(!main) throw new Error("Spieler hat keine Hauptposition für den neuen Kader hinterlegt");
   db.prepare("INSERT INTO rosters(team_id,user_id,shirt_number,main_position,secondary_position_1,secondary_position_2) VALUES(?,?,?,?,?,?)").run(tr.to_team_id,req.user.id,count+1,main,p1,p2);
   db.prepare("UPDATE transfers SET status='accepted',decided_at=? WHERE id=?").run(nowIso(),tr.id);
 });
 tx();res.json({ok:true});
});

app.get("/api/admin/pending-teams",staff,(req,res)=>res.json(db.prepare("SELECT t.*,u.ea_name owner_name FROM teams t JOIN users u ON u.id=t.owner_id WHERE t.status='pending' ORDER BY t.created_at DESC").all()));
app.post("/api/admin/teams/:id/status",staff,(req,res)=>{
 const status=["approved","rejected","suspended"].includes(req.body.status)?req.body.status:null;
 if(!status)return res.status(400).json({error:"Ungültiger Status"});
 db.prepare("UPDATE teams SET status=? WHERE id=?").run(status,req.params.id);res.json({ok:true});
});
app.get("/api/admin/users",staff,(req,res)=>res.json(db.prepare("SELECT id,ea_name,role,active,created_at FROM users ORDER BY created_at DESC").all()));
app.post("/api/admin/users/create",requireRole("owner"),async(req,res)=>{
 const eaName=String(req.body.eaName||"").trim(); const password=String(req.body.password||""); const role=String(req.body.role||"");
 if(!eaName||password.length<8||!["management","admin"].includes(role))return res.status(400).json({error:"EA-Name, Passwort (mind. 8 Zeichen) und gültige Staff-Rolle erforderlich"});
 try{const hash=await bcrypt.hash(password,12);const info=db.prepare("INSERT INTO users(ea_name,password_hash,role) VALUES(?,?,?)").run(eaName,hash,role);db.prepare("INSERT OR IGNORE INTO player_profiles(user_id,position) VALUES(?,?)").run(info.lastInsertRowid,"");res.json({ok:true,id:info.lastInsertRowid,mode:"created"});}catch(e){res.status(409).json({error:"EA-Name ist bereits registriert. Verwende die Funktion 'bestehenden Spieler zum Staff machen'."})}
});
app.post("/api/admin/users/:id/staff-role",requireRole("owner"),(req,res)=>{
 const role=String(req.body.role||"");
 if(!["member","admin","management"].includes(role))return res.status(400).json({error:"Ungültige Staff-Rolle"});
 const target=db.prepare("SELECT id,role FROM users WHERE id=?").get(Number(req.params.id));
 if(!target)return res.status(404).json({error:"Benutzer nicht gefunden"});
 db.prepare("UPDATE users SET role=? WHERE id=?").run(role,target.id);
 db.prepare("INSERT OR IGNORE INTO player_profiles(user_id,position) VALUES(?,?)").run(target.id,"");
 res.json({ok:true});
});
app.post("/api/admin/users/:id/role",requireRole("owner"),(req,res)=>{
 if(!["member","admin","management","owner"].includes(req.body.role))return res.status(400).json({error:"Ungültige Rolle"});
 if(Number(req.params.id)===req.user.id && req.body.role!=="owner")return res.status(400).json({error:"Der letzte Owner kann sich nicht selbst herabstufen"});
 db.prepare("UPDATE users SET role=? WHERE id=?").run(req.body.role,req.params.id);res.json({ok:true});
});
app.post("/api/admin/users/:id/active",requireRole("owner","management","admin"),(req,res)=>{
 if(Number(req.params.id)===req.user.id)return res.status(400).json({error:"Eigenen Account nicht sperren"});
 db.prepare("UPDATE users SET active=? WHERE id=?").run(req.body.active?1:0,req.params.id);res.json({ok:true});
});

// Vollständige Spielerbearbeitung durch Staff: Accountname, Profil, Free-Agent-Daten,
// Marktwert und Kaderzuordnung. Rollen bleiben bewusst im separaten Rollen-Management.
app.get("/api/admin/players/:id",staff,(req,res)=>{
 const id=Number(req.params.id);
 const u=db.prepare("SELECT id,ea_name,role,active,created_at FROM users WHERE id=?").get(id);
 if(!u)return res.status(404).json({error:"Spieler nicht gefunden"});
 const p=db.prepare("SELECT age,height_cm,weight_kg,position,main_position,secondary_position_1,secondary_position_2,secondary_position_3,bio FROM player_profiles WHERE user_id=?").get(id)||{};
 const roster=db.prepare(`SELECT r.*,t.name team_name,t.abbreviation,t.status team_status FROM rosters r JOIN teams t ON t.id=r.team_id WHERE r.user_id=?`).get(id)||null;
 const fa=db.prepare("SELECT * FROM free_agents WHERE user_id=?").get(id)||null;
 const market=marketFor(id);
 const stats=db.prepare(`SELECT ps.id,ps.match_id,ps.goals,ps.assists,ps.clean_sheet,ps.updated_at,m.kickoff,m.status,h.name home_name,a.name away_name,c.name competition_name FROM player_match_stats ps JOIN matches m ON m.id=ps.match_id LEFT JOIN teams h ON h.id=m.home_team_id LEFT JOIN teams a ON a.id=m.away_team_id LEFT JOIN competitions c ON c.id=m.competition_id WHERE ps.player_id=? ORDER BY COALESCE(m.kickoff,m.id) DESC`).all(id);
 res.json({user:u,profile:p,roster,freeAgent:fa,market,stats});
});
app.put("/api/admin/players/:id",staff,async(req,res)=>{
 const id=Number(req.params.id); const existing=db.prepare("SELECT id FROM users WHERE id=?").get(id);
 if(!existing)return res.status(404).json({error:"Spieler nicht gefunden"});
 const eaName=String(req.body.eaName??"").trim();
 if(!eaName)return res.status(400).json({error:"EA-Name darf nicht leer sein"});
 const duplicate=db.prepare("SELECT id FROM users WHERE ea_name=? AND id<>?").get(eaName,id);
 if(duplicate)return res.status(409).json({error:"Dieser EA-Name ist bereits vergeben"});
 const age=req.body.age===""||req.body.age==null?null:Number(req.body.age);
 const height=req.body.height_cm===""||req.body.height_cm==null?null:Number(req.body.height_cm);
 const weight=req.body.weight_kg===""||req.body.weight_kg==null?null:Number(req.body.weight_kg);
 if(age!==null&&(!Number.isInteger(age)||age<13||age>100))return res.status(400).json({error:"Alter muss zwischen 13 und 100 liegen"});
 if(height!==null&&(!Number.isInteger(height)||height<100||height>250))return res.status(400).json({error:"Größe muss zwischen 100 und 250 cm liegen"});
 if(weight!==null&&(!Number.isInteger(weight)||weight<30||weight>250))return res.status(400).json({error:"Gewicht muss zwischen 30 und 250 kg liegen"});
 const main=String(req.body.mainPosition||req.body.position||"").trim().toUpperCase();
 const sec=[req.body.secondaryPosition1,req.body.secondaryPosition2,req.body.secondaryPosition3].map(x=>String(x||"").trim().toUpperCase()).filter(Boolean);
 if(main && sec.includes(main))return res.status(400).json({error:"Hauptposition darf nicht als Nebenposition gewählt werden"});
 if(new Set(sec).size!==sec.length)return res.status(400).json({error:"Nebenpositionen dürfen nicht doppelt sein"});
 const active=req.body.active===false||req.body.active==="0"?0:1;
 const passwordHash=String(req.body.password||"")?await bcrypt.hash(String(req.body.password),12):null;
 const tx=db.transaction(()=>{
   db.prepare("UPDATE users SET ea_name=?,active=? WHERE id=?").run(eaName,active,id);
   db.prepare(`INSERT INTO player_profiles(user_id,age,height_cm,weight_kg,position,main_position,secondary_position_1,secondary_position_2,secondary_position_3,bio) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET age=excluded.age,height_cm=excluded.height_cm,weight_kg=excluded.weight_kg,position=excluded.position,main_position=excluded.main_position,secondary_position_1=excluded.secondary_position_1,secondary_position_2=excluded.secondary_position_2,secondary_position_3=excluded.secondary_position_3,bio=excluded.bio`).run(id,age,height,weight,main,main,sec[0]||"",sec[1]||"",sec[2]||"",String(req.body.bio||"").trim());
   const teamId=req.body.teamId===""||req.body.teamId==null?null:Number(req.body.teamId);
   if(teamId===null){ db.prepare("DELETE FROM rosters WHERE user_id=?").run(id); }
   else {
     const team=db.prepare("SELECT id FROM teams WHERE id=? AND status='approved'").get(teamId);
     if(!team) throw new Error("Genehmigtes Team nicht gefunden");
     const conflict=db.prepare("SELECT user_id FROM rosters WHERE team_id=? AND user_id<>?").all(teamId,id);
     const shirt=Math.max(1,Math.min(99,Number(req.body.shirtNumber||1)));
     const existingRoster=db.prepare("SELECT id FROM rosters WHERE user_id=?").get(id);
     if(existingRoster){db.prepare("UPDATE rosters SET team_id=?,shirt_number=?,main_position=?,secondary_position_1=?,secondary_position_2=? WHERE user_id=?").run(teamId,shirt,main,sec[0]||"",sec[1]||"",id);}
     else {
       if(conflict.some(x=>x.user_id===id)) throw new Error("Spieler ist bereits im gewählten Team");
       db.prepare("INSERT INTO rosters(team_id,user_id,shirt_number,main_position,secondary_position_1,secondary_position_2) VALUES(?,?,?,?,?,?)").run(teamId,id,shirt,main,sec[0]||"",sec[1]||"");
     }
   }
   const faActive=req.body.freeAgentActive?1:0;
   if(faActive){
     if(!main)return;
     db.prepare(`INSERT INTO free_agents(user_id,age,main_position,secondary_position_1,secondary_position_2,secondary_position_3,bio,active,updated_at) VALUES(?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET age=excluded.age,main_position=excluded.main_position,secondary_position_1=excluded.secondary_position_1,secondary_position_2=excluded.secondary_position_2,secondary_position_3=excluded.secondary_position_3,bio=excluded.bio,active=1,updated_at=CURRENT_TIMESTAMP`).run(id,age,main,sec[0]||"",sec[1]||"",sec[2]||"",String(req.body.bio||"").trim());
   } else { db.prepare("UPDATE free_agents SET active=0,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(id); }
   const manual=req.body.manualValue===""||req.body.manualValue==null?null:Math.max(0,Math.round(Number(req.body.manualValue)));
   if(manual!==null&&!Number.isFinite(manual))throw new Error("Ungültiger Marktwert");
   db.prepare(`INSERT INTO player_market_values(user_id,manual_value,note,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET manual_value=excluded.manual_value,note=excluded.note,updated_at=CURRENT_TIMESTAMP`).run(id,manual,String(req.body.marketNote||"").trim());
   if(passwordHash) db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(passwordHash,id);
 });
 try{tx();res.json({ok:true});}catch(e){res.status(400).json({error:e.message||"Spieler konnte nicht gespeichert werden"});}
});
app.put("/api/admin/player-stats/:statId",staff,(req,res)=>{
 const stat=db.prepare("SELECT ps.*,r.main_position,r.secondary_position_1,r.secondary_position_2 FROM player_match_stats ps LEFT JOIN rosters r ON r.user_id=ps.player_id WHERE ps.id=?").get(Number(req.params.statId));
 if(!stat)return res.status(404).json({error:"Statistik nicht gefunden"});
 const goals=Math.max(0,Number(req.body.goals||0)); const assists=Math.max(0,Number(req.body.assists||0));
 const isGk=[stat.main_position,stat.secondary_position_1,stat.secondary_position_2].map(x=>String(x||"").toUpperCase()).includes("TW");
 const clean=req.body.cleanSheet&&isGk?1:0;
 db.prepare("UPDATE player_match_stats SET goals=?,assists=?,clean_sheet=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(goals,assists,clean,stat.id); res.json({ok:true});
});
app.delete("/api/admin/player-stats/:statId",staff,(req,res)=>{const info=db.prepare("DELETE FROM player_match_stats WHERE id=?").run(Number(req.params.statId));if(!info.changes)return res.status(404).json({error:"Statistik nicht gefunden"});res.json({ok:true});});
app.post("/api/admin/transfer-windows",staff,(req,res)=>{
 const {startsAt,endsAt,reason}=req.body;if(!startsAt||!endsAt)return res.status(400).json({error:"Zeitraum erforderlich"});
 const info=db.prepare("INSERT INTO transfer_windows(starts_at,ends_at,reason,active) VALUES(?,?,?,1)").run(new Date(startsAt).toISOString(),new Date(endsAt).toISOString(),reason||"");
 res.json({ok:true,id:info.lastInsertRowid});
});
app.get("/api/admin/transfer-windows",staff,(req,res)=>res.json(db.prepare("SELECT * FROM transfer_windows ORDER BY starts_at DESC").all()));
app.delete("/api/admin/transfer-windows/:id",staff,(req,res)=>{db.prepare("UPDATE transfer_windows SET active=0 WHERE id=?").run(req.params.id);res.json({ok:true})});

app.post("/api/admin/competitions",staff,(req,res)=>{
 const {type,name,description,startDate}=req.body;if(!["cup","league"].includes(type)||!name)return res.status(400).json({error:"Typ und Name erforderlich"});
 const info=db.prepare("INSERT INTO competitions(type,name,description,start_date) VALUES(?,?,?,?)").run(type,name,description||"",startDate||null);res.json({ok:true,id:info.lastInsertRowid});
});
app.post("/api/admin/matches",staff,(req,res)=>{
 const {competitionId,homeTeamId,awayTeamId,kickoff}=req.body;
 const info=db.prepare("INSERT INTO matches(competition_id,home_team_id,away_team_id,kickoff) VALUES(?,?,?,?)").run(competitionId||null,homeTeamId||null,awayTeamId||null,kickoff||null);
 res.json({ok:true,id:info.lastInsertRowid});
});
app.patch("/api/admin/matches/:id",staff,(req,res)=>{
 const fields=["status","home_score","away_score","kickoff"];const vals=[];
 const sets=[];for(const f of fields)if(req.body[f]!==undefined){sets.push(f+"=?");vals.push(req.body[f])}
 if(!sets.length)return res.json({ok:true});vals.push(req.params.id);db.prepare("UPDATE matches SET "+sets.join(",")+" WHERE id=?").run(...vals);res.json({ok:true});
});

app.get("/api/players",(req,res)=>{
 const q=String(req.query.q||"").trim();
 const rows=db.prepare(`
 SELECT u.id,u.ea_name,u.role,p.age,p.height_cm,p.weight_kg,p.position,p.bio,
        r.team_id,r.shirt_number,r.main_position,r.secondary_position_1,r.secondary_position_2,
        t.name team_name,t.abbreviation team_abbreviation,t.crest team_crest
 FROM users u
 LEFT JOIN player_profiles p ON p.user_id=u.id
 LEFT JOIN rosters r ON r.user_id=u.id
 LEFT JOIN teams t ON t.id=r.team_id AND t.status='approved'
 WHERE u.active=1 AND (?='' OR LOWER(u.ea_name) LIKE LOWER(?) OR LOWER(COALESCE(t.name,'')) LIKE LOWER(?))
 ORDER BY u.ea_name COLLATE NOCASE`).all(q,q?`%${q}%`:"",q?`%${q}%`:"");
 const grouped=new Map();
 for(const x of rows){
  if(!grouped.has(x.id))grouped.set(x.id,{id:x.id,ea_name:x.ea_name,role:x.role,age:x.age,height_cm:x.height_cm,weight_kg:x.weight_kg,position:x.position,bio:x.bio,team:null});
  if(x.team_id&&!grouped.get(x.id).team)grouped.get(x.id).team={id:x.team_id,name:x.team_name,abbreviation:x.team_abbreviation,crest:x.team_crest,shirt_number:x.shirt_number,main_position:x.main_position,secondary_position_1:x.secondary_position_1,secondary_position_2:x.secondary_position_2};
 }
 res.json(Array.from(grouped.values()).map(x=>({...x,market:marketFor(x.id)})));
});
app.get("/api/profile/:id",(req,res)=>{
 const id=Number(req.params.id);
 const u=db.prepare("SELECT id,ea_name,role FROM users WHERE id=? AND active=1").get(id);
 if(!u)return res.status(404).json({error:"Spieler nicht gefunden"});
 const p=db.prepare("SELECT * FROM player_profiles WHERE user_id=?").get(id)||{user_id:id,age:null,height_cm:null,weight_kg:null,position:"",bio:""};
 const stats=db.prepare(`
 SELECT COALESCE(SUM(goals),0) goals,COALESCE(SUM(assists),0) assists,COALESCE(SUM(clean_sheet),0) clean_sheets,
 COUNT(DISTINCT match_id) matches
 FROM player_match_stats WHERE player_id=?`).get(id);
 const history=db.prepare(`
 SELECT ps.match_id,ps.goals,ps.assists,ps.clean_sheet,m.kickoff,m.status,
 h.name home_name,a.name away_name
 FROM player_match_stats ps JOIN matches m ON m.id=ps.match_id
 LEFT JOIN teams h ON h.id=m.home_team_id LEFT JOIN teams a ON a.id=m.away_team_id
 WHERE ps.player_id=? ORDER BY m.kickoff DESC`).all(id);
 const market=marketFor(id); const freeAgent=db.prepare("SELECT * FROM free_agents WHERE user_id=?").get(id)||null; res.json({user:u,profile:p,stats,history,market,freeAgent});
});
app.put("/api/me/profile",requireLogin,(req,res)=>{
 const age=req.body.age===""||req.body.age==null?null:Number(req.body.age);
 const height=req.body.height_cm===""||req.body.height_cm==null?null:Number(req.body.height_cm);
 const weight=req.body.weight_kg===""||req.body.weight_kg==null?null:Number(req.body.weight_kg);
 if(age!==null&&(!Number.isInteger(age)||age<13||age>100))return res.status(400).json({error:"Alter muss zwischen 13 und 100 liegen"});
 if(height!==null&&(!Number.isInteger(height)||height<100||height>250))return res.status(400).json({error:"Größe muss zwischen 100 und 250 cm liegen"});
 if(weight!==null&&(!Number.isInteger(weight)||weight<30||weight>250))return res.status(400).json({error:"Gewicht muss zwischen 30 und 250 kg liegen"});
 db.prepare(`INSERT INTO player_profiles(user_id,age,height_cm,weight_kg,position,bio) VALUES(?,?,?,?,?,?)
 ON CONFLICT(user_id) DO UPDATE SET age=excluded.age,height_cm=excluded.height_cm,weight_kg=excluded.weight_kg,position=excluded.position,bio=excluded.bio`)
 .run(req.user.id,age,height,weight,req.body.position||"",req.body.bio||"");
 res.json({ok:true});
});
app.post("/api/admin/matches/:id/player-stats",staff,(req,res)=>{
 const match=db.prepare("SELECT id,home_team_id,away_team_id FROM matches WHERE id=?").get(req.params.id);
 if(!match)return res.status(404).json({error:"Match nicht gefunden"});
 const player=db.prepare("SELECT id FROM users WHERE id=? AND active=1").get(Number(req.body.playerId));
 if(!player)return res.status(404).json({error:"Spieler nicht gefunden"});
 const roster=db.prepare("SELECT team_id,main_position,secondary_position_1,secondary_position_2 FROM rosters WHERE user_id=?").get(player.id);
 if(!roster||![match.home_team_id,match.away_team_id].includes(roster.team_id))return res.status(400).json({error:"Spieler gehört nicht zu einem Team dieses Matches"});
 const goals=Math.max(0,Number(req.body.goals||0));
 const assists=Math.max(0,Number(req.body.assists||0));
 const isGoalkeeper=[roster.main_position,roster.secondary_position_1,roster.secondary_position_2].map(x=>String(x||"").toUpperCase()).includes("TW");
 const clean=req.body.cleanSheet&&isGoalkeeper?1:0;
 db.prepare(`INSERT INTO player_match_stats(match_id,player_id,goals,assists,clean_sheet)
 VALUES(?,?,?,?,?)
 ON CONFLICT(match_id,player_id) DO UPDATE SET goals=excluded.goals,assists=excluded.assists,clean_sheet=excluded.clean_sheet,updated_at=CURRENT_TIMESTAMP`)
 .run(match.id,player.id,goals,assists,clean);
 res.json({ok:true});
});
app.get("/api/admin/matches/:id/player-stats",staff,(req,res)=>{
 res.json(db.prepare(`SELECT ps.*,u.ea_name,r.main_position,r.secondary_position_1,r.secondary_position_2 FROM player_match_stats ps JOIN users u ON u.id=ps.player_id LEFT JOIN rosters r ON r.user_id=ps.player_id WHERE ps.match_id=? ORDER BY u.ea_name`).all(req.params.id));
});
app.get("/api/admin/matches/:id/players",staff,(req,res)=>{
 res.json(db.prepare(`SELECT r.team_id,r.shirt_number,r.main_position,r.secondary_position_1,r.secondary_position_2,u.id player_id,u.ea_name FROM rosters r JOIN users u ON u.id=r.user_id WHERE r.team_id IN ((SELECT home_team_id FROM matches WHERE id=?),(SELECT away_team_id FROM matches WHERE id=?)) ORDER BY r.team_id,r.shirt_number`).all(req.params.id,req.params.id));
});
app.delete("/api/admin/matches/:id/player-stats/:playerId",staff,(req,res)=>{db.prepare("DELETE FROM player_match_stats WHERE match_id=? AND player_id=?").run(req.params.id,req.params.playerId);res.json({ok:true});});
app.get("/api/admin/player-market-values",staff,(req,res)=>{const rows=db.prepare(`SELECT u.id,u.ea_name,COALESCE(SUM(ps.goals),0) goals,COALESCE(SUM(ps.assists),0) assists,COALESCE(SUM(ps.clean_sheet),0) clean_sheets,pm.manual_value,pm.note FROM users u LEFT JOIN player_match_stats ps ON ps.player_id=u.id LEFT JOIN player_market_values pm ON pm.user_id=u.id WHERE u.active=1 GROUP BY u.id ORDER BY u.ea_name`).all();res.json(rows.map(x=>({...x,automatic_value:calcMarketValue(x),value:x.manual_value??calcMarketValue(x)})));});
app.post("/api/admin/player-market-values/:id",staff,(req,res)=>{const value=req.body.manualValue===""||req.body.manualValue==null?null:Math.max(0,Math.round(Number(req.body.manualValue)));if(value!==null&&!Number.isFinite(value))return res.status(400).json({error:"Ungültiger Marktwert"});db.prepare(`INSERT INTO player_market_values(user_id,manual_value,note,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET manual_value=excluded.manual_value,note=excluded.note,updated_at=CURRENT_TIMESTAMP`).run(req.params.id,value,String(req.body.note||"").trim());res.json({ok:true});});

app.get("/api/roster/:teamId",(req,res)=>res.json(db.prepare(`
SELECT r.*,u.ea_name FROM rosters r JOIN users u ON u.id=r.user_id WHERE r.team_id=? ORDER BY r.shirt_number`).all(req.params.teamId)));
app.post("/api/teams/:id/roster",requireLogin,(req,res)=>{
 const team=db.prepare("SELECT * FROM teams WHERE id=?").get(req.params.id);
 if(!teamManager(req,req.params.id))return res.status(403).json({error:"Nur Manager oder Co. Manager dürfen den Kader verwalten"});
 const player=db.prepare("SELECT id FROM users WHERE ea_name=? AND active=1").get(String(req.body.eaName||"").trim());
 if(!player)return res.status(404).json({error:"Spieler ist nicht auf der GEC registriert"});
 if(db.prepare("SELECT id FROM rosters WHERE user_id=?").get(player.id))return res.status(409).json({error:"Spieler ist bereits in einem Team"});
 const n=Number(req.body.shirtNumber);if(!Number.isInteger(n)||n<1||n>99)return res.status(400).json({error:"Trikotnummer 1-99"});
 const positions=[req.body.mainPosition,req.body.secondaryPosition1,req.body.secondaryPosition2].map(x=>String(x||"").toUpperCase()).filter(Boolean);
 if(!positions.length)return res.status(400).json({error:"Hauptposition ist erforderlich"});
 if(positions.length!==new Set(positions).size)return res.status(400).json({error:"Positionen dürfen nicht doppelt vergeben werden"});
 db.prepare("INSERT INTO rosters(team_id,user_id,shirt_number,main_position,secondary_position_1,secondary_position_2) VALUES(?,?,?,?,?,?)").run(team.id,player.id,n,positions[0],positions[1]||"",positions[2]||"");res.json({ok:true});
});
app.patch("/api/teams/:id/roster/:userId",requireLogin,(req,res)=>{
 const team=db.prepare("SELECT * FROM teams WHERE id=?").get(req.params.id);
 if(!teamManager(req,req.params.id))return res.status(403).json({error:"Nur Manager oder Co. Manager dürfen den Kader ändern"});
 const positions=[req.body.mainPosition,req.body.secondaryPosition1,req.body.secondaryPosition2].map(x=>String(x||"").toUpperCase()).filter(Boolean);
 if(!positions.length)return res.status(400).json({error:"Hauptposition ist erforderlich"});
 if(positions.length!==new Set(positions).size)return res.status(400).json({error:"Positionen dürfen nicht doppelt vergeben werden"});
 db.prepare("UPDATE rosters SET main_position=?,secondary_position_1=?,secondary_position_2=? WHERE team_id=? AND user_id=?").run(positions[0],positions[1]||"",positions[2]||"",team.id,req.params.userId);res.json({ok:true});
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));
app.listen(PORT,()=>console.log(`GEC läuft auf http://localhost:${PORT}`));
