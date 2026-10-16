// ============================================================
//   KMJ TIPS  —  bot.js  v2.7  (SINGLE FILE HOSTING)
//   🎛 WEB ADMIN PANEL + Update API + Telegram Bot
//
//   HOST: Render (Free Web Service)   START: node bot.js
//
//   • /admin      <- WEB PANEL (control everything from here)
//   • /kmj/update <- the API your app (dex) calls
//   • RECENT APP HITS: live in the panel — shows whether the dex
//     reached the app (UA should show KMJ-TIPS-Dex/2.x)
//   • DEBUG switch: turns on step-by-step toasts inside the app
//   • LATER BUTTON switch: show/hide the "Later" dismiss option.
//     OFF = popup has NO Later button and CANNOT be dismissed
//     (Back button blocked too) — only the update removes it.
//   • Panel password: ADMIN_PASSWORD env var (default: kmjtips)
// ============================================================

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ================== CONFIG — EDIT HERE ==================
const CONFIG = {
  BOT_TOKEN: process.env.BOT_TOKEN || "PUT_YOUR_BOT_TOKEN_HERE",
  ADMIN_ID: Number(process.env.ADMIN_ID) || 0,

  // WEB PANEL PASSWORD — change this! (Render env: ADMIN_PASSWORD)
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "kmjtips",

  APP_NAME: "KMJ TIPS",
  CHANNEL: "@kmjTips",
  CHANNEL_URL: "https://t.me/kmjTips",

  LATEST_VERSION: "2.0",
  MIN_VERSION: "1.0",
  UPDATE_MESSAGE: "NEW UPDATE v2.0\nSpeed boost + bug fixes!\nDaily premium tips free",
  BTN1: "UPDATE NOW",
  BTN2: "JOIN @kmjTips",

  PORT: process.env.PORT || 3000,
  DATA_FILE: path.join(__dirname, "settings.json"),
};
// =============================================================

// ---------- SETTINGS (changed live from the panel) ----------
let SETTINGS = {
  app: CONFIG.APP_NAME,
  latest: CONFIG.LATEST_VERSION,   // latest version
  min: CONFIG.MIN_VERSION,         // older than this = auto force
  message: CONFIG.UPDATE_MESSAGE,  // popup message
  url: CONFIG.CHANNEL_URL,         // UPDATE NOW button link
  btn1: CONFIG.BTN1,               // button 1 text
  btn2: CONFIG.BTN2,               // button 2 text
  channel: CONFIG.CHANNEL,         // channel name (@kmjTips)
  channelUrl: CONFIG.CHANNEL_URL,  // JOIN button link
  popup: true,                     // popup ON/OFF
  force: false,                    // force update (full-screen lock)
  sound: true,                     // popup sound ON/OFF
  later: false,                    // "Later" dismiss button (false = popup cannot be skipped)
  debug: false,                    // dex DEBUG toasts (for testing)
};
try {
  if (fs.existsSync(CONFIG.DATA_FILE)) {
    SETTINGS = Object.assign(SETTINGS, JSON.parse(fs.readFileSync(CONFIG.DATA_FILE, "utf8")));
    console.log("[PANEL] settings.json loaded");
  }
} catch (e) {
  console.log("[PANEL] settings load fail:", e.message);
}
function saveSettings() {
  try {
    fs.writeFileSync(CONFIG.DATA_FILE, JSON.stringify(SETTINGS, null, 2));
    return true;
  } catch (e) {
    console.log("[PANEL] settings save fail:", e.message);
    return false;
  }
}

let apiHits = 0;
const hitsLog = [];   // recent app hits — dex diagnosis (shown in panel)
const authed = new Set();

// ---------- version compare ----------
function cmp(a, b) {
  const p = (s) => String(s).split(".").map((n) => parseInt(n, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

// convert literal \n typed in the panel into real newlines (popup + TG)
function fmtMsg() {
  return String(SETTINGS.message || "").replace(/\\n/g, "\n");
}

// ---------- auth helpers ----------
function getToken(req) {
  const m = /kmj_token=([a-f0-9]+)/.exec(req.headers.cookie || "");
  return m ? m[1] : null;
}
function isAuth(req) {
  const t = getToken(req);
  return t && authed.has(t);
}

const app = express();
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: false }));

// ================== HOME STATUS PAGE ==================
app.get("/", (req, res) => {
  res.type("html").send(
    "<div style='font-family:monospace;background:linear-gradient(135deg,#17172B,#26264C);" +
    "color:#FFD54A;min-height:100vh;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;text-align:center;padding:20px'>" +
    "<h1 style='font-size:40px;margin:0;text-shadow:0 0 18px #FF8A3D'>&#127918; " + SETTINGS.app + "</h1>" +
    "<p style='color:#A9A9C6'>Update API + Admin Panel LIVE &#9989;</p>" +
    "<p style='background:#26264C;border:1px solid #FFD54A;border-radius:12px;padding:10px 18px'>" +
    "<a href='/admin' style='color:#FFD54A;font-weight:bold;text-decoration:none'>&#127912; OPEN ADMIN PANEL</a></p>" +
    "<p style='color:#fff'>API: <b>/kmj/update?v=1.0</b></p>" +
    "</div>"
  );
});

// ================== DEX API (called by the app's dex) ==================
app.get("/kmj/update", (req, res) => {
  apiHits++;
  const v = String(req.query.v || "0").trim();
  hitsLog.push({
    t: Date.now(),
    v: v.slice(0, 20),
    ua: String(req.headers["user-agent"] || "").slice(0, 48),
  });
  if (hitsLog.length > 25) hitsLog.shift();
  res.json({
    app: SETTINGS.app,
    latest: SETTINGS.latest,
    update: cmp(v, SETTINGS.latest) < 0,
    force: SETTINGS.force || cmp(v, SETTINGS.min) < 0,
    popup: SETTINGS.popup,
    sound: SETTINGS.sound,
    later: !!SETTINGS.later,
    message: fmtMsg(),
    url: SETTINGS.url,
    btn1: SETTINGS.btn1,
    btn2: SETTINGS.btn2,
    channel: SETTINGS.channel,
    debug: !!SETTINGS.debug,
  });
});

app.get("/health", (req, res) =>
  res.json({ ok: true, app: SETTINGS.app, latest: SETTINGS.latest, panel: true })
);

// ================== ADMIN: LOGIN ==================
app.post("/admin/login", (req, res) => {
  const pw = (req.body && req.body.password) || req.query.password || "";
  if (pw === CONFIG.ADMIN_PASSWORD) {
    const token = crypto.randomBytes(24).toString("hex");
    authed.add(token);
    res.setHeader("Set-Cookie", "kmj_token=" + token + "; Path=/; HttpOnly; Max-Age=604800; SameSite=Lax");
    if (req.headers.accept && req.headers.accept.indexOf("json") >= 0) {
      res.json({ ok: true });
    } else {
      res.redirect("/admin");
    }
  } else {
    if (req.headers.accept && req.headers.accept.indexOf("json") >= 0) {
      res.status(401).json({ ok: false, error: "Wrong password!" });
    } else {
      res.redirect("/admin?err=1");
    }
  }
});

app.post("/admin/logout", (req, res) => {
  const t = getToken(req);
  if (t) authed.delete(t);
  res.setHeader("Set-Cookie", "kmj_token=; Path=/; Max-Age=0");
  res.redirect("/admin");
});

// ================== ADMIN: SAVE SETTINGS ==================
app.post("/admin/save", (req, res) => {
  if (!isAuth(req)) return res.status(401).json({ ok: false, error: "Login first" });
  const b = req.body || {};
  ["app", "latest", "min", "message", "url", "btn1", "btn2", "channel", "channelUrl"].forEach((k) => {
    if (typeof b[k] === "string") SETTINGS[k] = b[k].slice(0, 2000);
  });
  ["popup", "force", "sound", "later", "debug"].forEach((k) => {
    if (typeof b[k] === "boolean") SETTINGS[k] = b[k];
  });
  const ok = saveSettings();
  console.log("[PANEL] settings saved — popup:" + SETTINGS.popup + " force:" + SETTINGS.force +
    " latest:v" + SETTINGS.latest + " btn1:" + SETTINGS.btn1);
  res.json({ ok: ok });
});

app.get("/admin/stats", (req, res) => {
  if (!isAuth(req)) return res.status(401).json({ ok: false });
  res.json({ hits: apiHits, settings: SETTINGS, bot: !!bot, recent: hitsLog.slice().reverse() });
});

// ================== ADMIN PANEL PAGES ==================
const LOGIN_HTML = "<!DOCTYPE html><html><head><meta charset='utf-8'>" +
"<meta name='viewport' content='width=device-width,initial-scale=1'>" +
"<title>KMJ ADMIN — Login</title><style>" +
"*{margin:0;padding:0;box-sizing:border-box}" +
"body{min-height:100vh;display:flex;align-items:center;justify-content:center;" +
"background:linear-gradient(135deg,#0D0D1F,#1A1A35,#0D0D1F);font-family:system-ui,sans-serif}" +
".card{background:rgba(38,38,76,.45);border:1px solid rgba(255,213,74,.35);border-radius:22px;" +
"padding:34px 28px;width:min(92vw,380px);box-shadow:0 0 40px rgba(255,138,61,.18);text-align:center}" +
"h1{color:#FFD54A;font-size:26px;text-shadow:0 0 14px rgba(255,138,61,.8);margin-bottom:6px}" +
"p{color:#A9A9C6;font-size:12px;margin-bottom:22px}" +
"input{width:100%;padding:13px 15px;border-radius:14px;border:1px solid rgba(255,213,74,.4);" +
"background:#14142A;color:#F7F7FC;font-size:15px;outline:none;text-align:center;letter-spacing:2px}" +
"input:focus{border-color:#FFD54A;box-shadow:0 0 12px rgba(255,213,74,.35)}" +
"button{margin-top:16px;width:100%;padding:13px;border:none;border-radius:14px;cursor:pointer;" +
"background:linear-gradient(135deg,#FFD54A,#FF8A3D,#FF4E6A);color:#14142A;font-weight:800;" +
"font-size:15px;letter-spacing:1px;transition:transform .12s}" +
"button:active{transform:scale(.96)}" +
".err{color:#FF4E6A;font-size:12px;margin-top:12px;display:@ERRDIS@}" +
"@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}" +
".shake{animation:shake .3s}" +
"</style></head><body><div class='card'>" +
"<h1>&#128640; KMJ TIPS</h1><p>ADMIN PANEL — Login</p>" +
"<form method='post' action='/admin/login' id='f'>" +
"<input type='password' name='password' placeholder='&#128273; Password' autofocus>" +
"<button type='submit'>&#128274; LOGIN</button>" +
"<div class='err'>&#10060; Wrong password — try again</div>" +
"</form></div><script>var q=location.search;if(q.indexOf('err=1')>=0){document.querySelector('.err').style.display='block';document.querySelector('.card').classList.add('shake');}</script>" +
"</body></html>";

const PANEL_HTML = "<!DOCTYPE html><html><head><meta charset='utf-8'>" +
"<meta name='viewport' content='width=device-width,initial-scale=1'>" +
"<title>KMJ TIPS — Admin Panel</title><style>" +
"*{margin:0;padding:0;box-sizing:border-box}" +
"body{background:linear-gradient(160deg,#0D0D1F,#1A1A35 55%,#10102A);min-height:100vh;" +
"font-family:system-ui,sans-serif;padding:18px 12px 60px;color:#F7F7FC}" +
".wrap{max-width:760px;margin:0 auto}" +
".hdr{position:relative;text-align:center;padding:26px 16px 22px;border-radius:22px;margin-bottom:16px;" +
"background:linear-gradient(135deg,rgba(255,213,74,.12),rgba(255,78,106,.10));" +
"border:1px solid rgba(255,213,74,.45);box-shadow:0 0 30px rgba(255,138,61,.25)}" +
".hdr h1{color:#FFD54A;font-size:30px;text-shadow:0 0 16px rgba(255,138,61,.9);animation:pulse 2.2s infinite}" +
"@keyframes pulse{0%,100%{text-shadow:0 0 10px rgba(255,138,61,.6)}50%{text-shadow:0 0 24px rgba(255,138,61,1)}}" +
".hdr p{color:#A9A9C6;font-size:12px;margin-top:6px}" +
".chips{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:14px}" +
".chip{background:rgba(20,20,42,.8);border:1px solid rgba(255,213,74,.35);color:#FFD54A;" +
"border-radius:20px;padding:6px 13px;font-size:11.5px;font-weight:700}" +
".chip.off{color:#FF4E6A;border-color:rgba(255,78,106,.5)}" +
".card{background:rgba(38,38,76,.35);border:1px solid rgba(255,213,74,.22);border-radius:20px;" +
"padding:20px;margin-bottom:16px;backdrop-filter:blur(4px)}" +
".card h2{color:#FFD54A;font-size:15px;margin-bottom:14px;letter-spacing:.5px}" +
".grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}" +
"@media(max-width:560px){.grid{grid-template-columns:1fr}}" +
"label{display:block;color:#A9A9C6;font-size:11px;font-weight:700;letter-spacing:.6px;margin-bottom:5px;text-transform:uppercase}" +
"input[type=text],textarea{width:100%;padding:11px 13px;border-radius:12px;border:1px solid rgba(255,213,74,.28);" +
"background:#14142A;color:#F7F7FC;font-size:14px;outline:none;transition:border .15s}" +
"input:focus,textarea:focus{border-color:#FFD54A;box-shadow:0 0 10px rgba(255,213,74,.3)}" +
"textarea{resize:vertical;min-height:88px;line-height:1.5}" +
".full{grid-column:1/-1}" +
".toggles{display:flex;gap:14px;flex-wrap:wrap;margin-top:4px}" +
".tg{display:flex;align-items:center;gap:9px;background:#14142A;border:1px solid rgba(255,213,74,.22);" +
"border-radius:14px;padding:10px 14px;cursor:pointer;user-select:none}" +
".tg .sw{width:40px;height:22px;border-radius:20px;background:#3a3a5c;position:relative;transition:.2s}" +
".tg .sw:after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;" +
"background:#A9A9C6;transition:.2s}" +
".tg.on .sw{background:linear-gradient(135deg,#FFD54A,#FF8A3D)}" +
".tg.on .sw:after{left:21px;background:#14142A}" +
".tg span.t{color:#F7F7FC;font-size:12.5px;font-weight:700}" +
".btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}" +
"button{padding:12px 20px;border:none;border-radius:13px;cursor:pointer;font-weight:800;font-size:13.5px;" +
"letter-spacing:.5px;transition:transform .12s,box-shadow .15s}" +
"button:active{transform:scale(.95)}" +
".save{background:linear-gradient(135deg,#FFD54A,#FF8A3D,#FF4E6A);color:#14142A;flex:1;min-width:150px;" +
"box-shadow:0 4px 18px rgba(255,138,61,.4)}" +
".ghost{background:transparent;color:#FFD54A;border:1.5px solid rgba(255,213,74,.55)}" +
".danger{background:transparent;color:#FF4E6A;border:1.5px solid rgba(255,78,106,.55)}" +
"pre{background:#0D0D1F;border:1px solid rgba(255,213,74,.25);border-radius:14px;padding:14px;" +
"font-size:11.5px;line-height:1.6;color:#FFD54A;overflow-x:auto;font-family:monospace;white-space:pre-wrap}" +
".toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(80px);" +
"background:linear-gradient(135deg,#1A1A35,#26264C);color:#FFD54A;border:1.5px solid #FFD54A;" +
"padding:12px 22px;border-radius:16px;font-weight:800;font-size:13px;box-shadow:0 0 24px rgba(255,213,74,.4);" +
"transition:transform .3s;z-index:9}" +
".toast.show{transform:translateX(-50%) translateY(0)}" +
"textarea.imp{min-height:120px;font-family:monospace;font-size:11.5px;display:none;margin-top:10px}" +
".foot{text-align:center;color:#A9A9C6;font-size:11px;margin-top:8px;line-height:1.8}" +
".foot a{color:#FFD54A;font-weight:700;text-decoration:none}" +
"</style></head><body><div class='wrap'>" +

"<div class='hdr'><h1>&#128640; KMJ TIPS — ADMIN</h1>" +
"<p>Control everything live — changes apply in the app instantly</p>" +
"<div class='chips'>" +
"<span class='chip'>&#128200; API Hits: <b id='hits'>0</b></span>" +
"<span class='chip' id='chipPop'>POPUP: ON</span>" +
"<span class='chip' id='chipFor'>FORCE: OFF</span>" +
"<span class='chip' id='chipVer'>v0.0</span>" +
"<span class='chip' id='chipBot'>BOT: ?</span>" +
"</div></div>" +

"<div class='card'><h2>&#9881;&#65039; UPDATE SETTINGS</h2><div class='grid'>" +
"<div><label>App Name (popup title)</label><input type='text' id='app'></div>" +
"<div><label>Latest Version</label><input type='text' id='latest' placeholder='2.1'></div>" +
"<div><label>Min Version (older than this = force)</label><input type='text' id='min' placeholder='1.0'></div>" +
"<div><label>Update Message (\\n = new line)</label><textarea id='message' class='full' rows='3'></textarea></div>" +
"<div><label>Button 1 Text (update)</label><input type='text' id='btn1' placeholder='UPDATE NOW'></div>" +
"<div><label>Button 1 URL (download link)</label><input type='text' id='url' placeholder='https://...'></div>" +
"<div><label>Button 2 Text (join)</label><input type='text' id='btn2' placeholder='JOIN @kmjTips'></div>" +
"<div><label>Channel Name</label><input type='text' id='channel' placeholder='@kmjTips'></div>" +
"<div><label>Channel URL</label><input type='text' id='channelUrl'></div>" +
"</div>" +
"<div style='margin-top:14px'><label>&#127918; SWITCHES</label><div class='toggles'>" +
"<div class='tg' id='tgPopup' onclick='tg(\"popup\")'><div class='sw'></div><span class='t'>&#128421; POPUP ON/OFF</span></div>" +
"<div class='tg' id='tgForce' onclick='tg(\"force\")'><div class='sw'></div><span class='t'>&#9889; FORCE UPDATE</span></div>" +
"<div class='tg' id='tgSound' onclick='tg(\"sound\")'><div class='sw'></div><span class='t'>&#128266; SOUND</span></div>" +
"<div class='tg' id='tgLater' onclick='tg(\"later\")'><div class='sw'></div><span class='t'>&#9193; LATER BUTTON</span></div>" +
"<div class='tg' id='tgDebug' onclick='tg(\"debug\")'><div class='sw'></div><span class='t'>&#128030; DEBUG</span></div>" +
"</div><div style='color:#A9A9C6;font-size:10px;margin-top:8px'>&#9193; LATER BUTTON OFF = no Later button in the popup, and the Back button cannot close it either — it only goes away after the update is installed (or popup turned OFF from here)</div></div>" +
"<div class='btns' style='margin-top:16px'>" +
"<button class='save' onclick='save()'>&#128190; SAVE — LIVE IN APP</button>" +
"<button class='ghost' onclick='exportS()'>&#128228; EXPORT</button>" +
"<button class='ghost' onclick='toggleImp()'>&#128228; IMPORT</button>" +
"<button class='danger' onclick='resetS()'>&#9851; RESET</button>" +
"</div>" +
"<textarea id='impBox' class='imp' placeholder='Paste the exported JSON here...'></textarea>" +
"<div class='btns' style='display:none' id='impBtns'><button class='ghost' onclick='importS()'>&#9986; APPLY IMPORT</button></div>" +
"</div>" +

"<div class='card'><h2>&#128269; LIVE API PREVIEW <span style='font-size:10px;color:#A9A9C6'>(this is what the app receives)</span></h2>" +
"<div style='display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap'>" +
"<label style='margin:0;color:#A9A9C6;font-size:11px;text-transform:none;letter-spacing:0'>App version test:</label>" +
"<input type='text' id='pv' value='1.0' style='width:80px;padding:8px 10px' oninput='preview()'>" +
"<span style='color:#A9A9C6;font-size:10.5px'>&#8592; enter your app's versionName — update:true means the popup will show</span>" +
"</div>" +
"<pre id='preview'>loading...</pre></div>" +

"<div class='card'><h2>&#128241; RECENT APP HITS <span style='font-size:10px;color:#A9A9C6'>(which app is talking to the server)</span></h2>" +
"<div id='hitsList' style='font-family:monospace;font-size:11px;line-height:1.9;color:#A9A9C6'>loading...</div>" +
"<div style='color:#A9A9C6;font-size:10px;margin-top:8px'>&#128241; Open the app &#8594; within 15 sec <b style='color:#FFD54A'>KMJ-TIPS-Dex/2.x</b> should appear here. Not showing = the dex did not reach the app (check rebuild/injection). Hits reset on Render restart.</div></div>" +

"<div class='foot'>&#128226; Channel: <a href='https://t.me/kmjTips' target='_blank'>@kmjTips</a> &#8226; " +
"<a href='#' onclick='logout()'>Logout</a><br>" +
"&#9888;&#65039; On free Render, settings.json resets on redeploy — take an Export backup!</div>" +

"</div><div class='toast' id='toast'>&#9989; SAVED — Live in app!</div>" +
"<script>" +
"var S = %%SETTINGS%%;" +
"var F = ['app','latest','min','message','url','btn1','btn2','channel','channelUrl'];" +
"var B = ['popup','force','sound','later','debug'];" +
"function fill(){F.forEach(function(k){document.getElementById(k).value = S[k] || '';});" +
"B.forEach(function(k){var el=document.getElementById('tg'+k.charAt(0).toUpperCase()+k.slice(1));" +
"if(S[k]){el.classList.add('on');}else{el.classList.remove('on');}});}" +
"function tg(k){S[k]=!S[k];fill();save();}" +
"function collect(){F.forEach(function(k){S[k]=document.getElementById(k).value;});return S;}" +
"function toast(m){var t=document.getElementById('toast');t.innerHTML=m;t.classList.add('show');" +
"setTimeout(function(){t.classList.remove('show');},2200);}" +
"function save(){fetch('/admin/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(collect())})" +
".then(function(r){return r.json();}).then(function(j){if(j.ok){toast('&#9989; SAVED — Live in app!');preview();chips();}else{toast('&#10060; Login expired — reload the page');}})" +
".catch(function(){toast('&#10060; Network error');});}" +
"function preview(){var pv=document.getElementById('pv');" +
"fetch('/kmj/update?v='+encodeURIComponent(pv&&pv.value?pv.value:'1.0')).then(function(r){return r.json();})" +
".then(function(j){document.getElementById('preview').textContent=JSON.stringify(j,null,2);});}" +
"function chips(){fetch('/admin/stats').then(function(r){return r.json();}).then(function(j){" +
"if(!j||!j.settings)return;document.getElementById('hits').textContent=j.hits;" +
"document.getElementById('chipPop').textContent='POPUP: '+(j.settings.popup?'ON':'OFF');" +
"document.getElementById('chipPop').className='chip'+(j.settings.popup?'':' off');" +
"document.getElementById('chipFor').textContent='FORCE: '+(j.settings.force?'ON':'OFF');" +
"document.getElementById('chipFor').className='chip'+(j.settings.force?' off':'');" +
"document.getElementById('chipVer').textContent='LATEST v'+j.settings.latest;" +
"document.getElementById('chipBot').textContent='BOT: '+(j.bot?'ONLINE':'API-ONLY');" +
"var hl=document.getElementById('hitsList');if(!hl)return;" +
"if(!j.recent||!j.recent.length){hl.innerHTML='&#9888; No hits yet — open your app and wait, auto-refreshes every 15 sec';return;}" +
"var h='';j.recent.forEach(function(x){" +
"var dex=/KMJ-TIPS-Dex/i.test(x.ua||'');" +
"var ua=String(x.ua||'(no UA)').replace(/</g,'&lt;').slice(0,42);" +
"var vv=String(x.v||'0').replace(/[^0-9A-Za-z.\\-]/g,'');" +
"h+='<div style=\"color:'+(dex?'#FFD54A':'#6E6E8E')+'\">'+new Date(x.t).toLocaleTimeString()+' &#8226; v'+vv+' &#8226; '+ua+(dex?' &#9989;':' (panel/browser)')+'</div>';});" +
"hl.innerHTML=h;});}" +
"function exportS(){collect();var b=document.getElementById('impBox');" +
"b.value=JSON.stringify(S,null,2);b.style.display='block';b.select();" +
"try{document.execCommand('copy');}catch(e){}toast('&#128203; JSON ready — copied');}" +
"function toggleImp(){var b=document.getElementById('impBox');var on=b.style.display==='block';" +
"b.style.display=on?'none':'block';document.getElementById('impBtns').style.display=on?'none':'flex';}" +
"function importS(){try{var o=JSON.parse(document.getElementById('impBox').value);" +
"Object.keys(o).forEach(function(k){if(S.hasOwnProperty(k))S[k]=o[k];});fill();save();}" +
"catch(e){toast('&#10060; Invalid JSON');}}" +
"function resetS(){S={app:'KMJ TIPS',latest:'2.0',min:'1.0'," +
"message:'NEW UPDATE v2.0\\\\nSpeed boost + bug fixes!',url:'https://t.me/kmjTips'," +
"btn1:'UPDATE NOW',btn2:'JOIN @kmjTips',channel:'@kmjTips',channelUrl:'https://t.me/kmjTips'," +
"popup:true,force:false,sound:true,later:false,debug:false};fill();save();}" +
"function logout(){fetch('/admin/logout',{method:'POST'}).then(function(){location.reload();});}" +
"fill();preview();chips();setInterval(chips,15000);" +
"</script></body></html>";

app.get("/admin", (req, res) => {
  if (!isAuth(req)) {
    const err = req.query.err ? "1" : "0";
    res.type("html").send(LOGIN_HTML.replace("@ERRDIS@", err === "1" ? "block" : "none"));
  } else {
    res.type("html").send(PANEL_HTML.replace("%%SETTINGS%%", JSON.stringify(SETTINGS)));
  }
});

// ================== TELEGRAM BOT ==================
let bot = null;
if (CONFIG.BOT_TOKEN && CONFIG.BOT_TOKEN.includes(":")) {
  try {
    bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
    console.log("[BOT] Telegram bot started — " + SETTINGS.channel);

    bot.onText(/\/start/, (msg) => {
      const name = (msg.from && msg.from.first_name) || "Friend";
      bot.sendMessage(
        msg.chat.id,
        "\uD83D\uDC4B Welcome *" + name + "*!\n\n" +
        "\uD83D\uDD25 *" + SETTINGS.app + "* — Daily Tips & Updates\n" +
        "\uD83D\uDCE2 Channel: " + SETTINGS.channel,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "\uD83D\uDCE2 JOIN " + SETTINGS.channel, url: SETTINGS.channelUrl }],
              [{ text: "\u2B07 GET UPDATE", callback_data: "update" }],
            ],
          },
        }
      );
    });

    bot.onText(/\/update/, (msg) => {
      bot.sendMessage(
        msg.chat.id,
        "\uD83D\uDE80 *UPDATE v" + SETTINGS.latest + "*\n" + fmtMsg() +
        "\n\n\u2B07 " + SETTINGS.url,
        { parse_mode: "Markdown" }
      );
    });

    bot.on("callback_query", (q) => {
      if (q.data === "update") {
        bot.answerCallbackQuery(q.id).catch(() => {});
        bot.sendMessage(
          q.message.chat.id,
          "\uD83D\uDE80 *UPDATE v" + SETTINGS.latest + "*\n" + fmtMsg() +
          "\n\n\u2B07 " + SETTINGS.url,
          { parse_mode: "Markdown" }
        );
      }
    });

    bot.onText(/\/id/, (msg) => {
      bot.sendMessage(msg.chat.id, "\uD83D\uDD11 Your ID: `" + msg.from.id + "`", { parse_mode: "Markdown" });
    });

    bot.onText(/\/broadcast (.+)/s, (msg, match) => {
      if (CONFIG.ADMIN_ID && msg.from.id === CONFIG.ADMIN_ID) {
        bot.sendMessage(SETTINGS.channel, match[1], { parse_mode: "Markdown" })
          .then(() => bot.sendMessage(msg.chat.id, "\u2705 Broadcast sent!"))
          .catch((e) => bot.sendMessage(msg.chat.id, "\u26D4 Error: " + e.message));
      } else {
        bot.sendMessage(msg.chat.id, "\u26D4 Admin only!");
      }
    });

    bot.on("polling_error", (e) => console.log("[BOT] polling:", e.message));
  } catch (e) {
    console.log("[BOT] start failed:", e.message);
  }
} else {
  console.log("[BOT] BOT_TOKEN not found — running API + Panel only");
}

// ================== SERVER START ==================
app.listen(CONFIG.PORT, () => {
  console.log("\n=========================================");
  console.log("  " + SETTINGS.app + " — v2.7 (PANEL + API + BOT)");
  console.log("  Port : " + CONFIG.PORT);
  console.log("  Panel: /admin  (password: ADMIN_PASSWORD env)");
  console.log("  API  : /kmj/update?v=APP_VERSION");
  console.log("=========================================\n");
});

// ================== RENDER KEEP-ALIVE ==================
setInterval(() => {
  const url = process.env.RENDER_EXTERNAL_URL;
  if (url) {
    require("http").get(url + "/health").on("error", () => {});
  }
}, 10 * 60 * 1000);

process.on("uncaughtException", (e) => console.log("[ERR]", e.message));
process.on("unhandledRejection", (e) => console.log("[ERR]", e));

module.exports = { app, bot, CONFIG };
