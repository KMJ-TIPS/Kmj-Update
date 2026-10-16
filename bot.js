// ============================================================
//   KMJ TIPS  —  bot.js  (SINGLE FILE HOSTING)
//   Update API + Telegram Bot — dono ek hi file me
//
//   HOST: Render (Free Web Service)
//   START: node bot.js   (ya   npm start)
//
//   DEX ISI API KO CALL KAREGA:  /kmj/update
// ============================================================

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

// ================== CONFIG — YAHAN EDIT KARO ==================
const CONFIG = {
  // Telegram bot token — @BotFather se lo (Render me Env var BOT_TOKEN bhi dal sakte ho)
  BOT_TOKEN: process.env.BOT_TOKEN || "YAHAN_APNA_BOT_TOKEN_DALO",

  // Apna telegram user id (broadcast ke liye) — @userinfobot se pata karo
  ADMIN_ID: Number(process.env.ADMIN_ID) || 0,

  CHANNEL: "@kmjTips",
  CHANNEL_URL: "https://t.me/kmjTips",

  APP_NAME: "KMJ TIPS",

  // === UPDATE SETTINGS (yahi popup me dikhega) ===
  LATEST_VERSION: "2.0",     // app ka latest version
  MIN_VERSION: "1.0",        // isse purana version = FORCE update (skip nahi kar sakta)
  UPDATE_MESSAGE: "NEW UPDATE v2.0\nSpeed boost + bug fixes!\nDaily premium tips free",

  PORT: process.env.PORT || 3000,
};
// =============================================================

const app = express();

// ---------- HOME PAGE (status) ----------
app.get("/", (req, res) => {
  res.type("html").send(
    "<div style='font-family:monospace;background:linear-gradient(135deg,#17172B,#26264C);" +
    "color:#FFD54A;min-height:100vh;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;text-align:center;padding:20px'>" +
    "<h1 style='font-size:42px;margin:0;text-shadow:0 0 18px #FF8A3D'>&#128640; " + CONFIG.APP_NAME + "</h1>" +
    "<p style='color:#A9A9C6'>UPDATE API LIVE &#9989;</p>" +
    "<p style='color:#fff'>API: <b>" + "/kmj/update?v=1.0" + "</b></p>" +
    "<p style='color:#FFD54A;font-weight:bold'>&#128226; JOIN " + CONFIG.CHANNEL + "</p>" +
    "</div>"
  );
});

// ---------- HEALTH CHECK ----------
app.get("/health", (req, res) => res.json({ ok: true, app: CONFIG.APP_NAME, latest: CONFIG.LATEST_VERSION }));

// ---------- VERSION COMPARE ----------
function cmp(a, b) {
  const p = (s) => String(s).split(".").map((n) => parseInt(n, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

// ================== DEX ISKO CALL KARTA HAI ==================
app.get("/kmj/update", (req, res) => {
  const v = String(req.query.v || "0").trim();
  res.json({
    app: CONFIG.APP_NAME,
    latest: CONFIG.LATEST_VERSION,
    update: cmp(v, CONFIG.LATEST_VERSION) < 0,
    force: cmp(v, CONFIG.MIN_VERSION) < 0,
    message: CONFIG.UPDATE_MESSAGE,
    url: CONFIG.CHANNEL_URL,
    channel: CONFIG.CHANNEL,
  });
});

// ================== SERVER START ==================
const server = app.listen(CONFIG.PORT, () => {
  console.log("\n=========================================");
  console.log("  " + CONFIG.APP_NAME + " — Update API LIVE");
  console.log("  Port: " + CONFIG.PORT);
  console.log("  API : /kmj/update?v=APP_VERSION");
  console.log("=========================================\n");
});

// ================== TELEGRAM BOT ==================
let bot = null;
if (CONFIG.BOT_TOKEN && CONFIG.BOT_TOKEN.includes(":")) {
  try {
    bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
    console.log("[BOT] Telegram bot started — " + CONFIG.CHANNEL);

    // /start — welcome + join button
    bot.onText(/\/start/, (msg) => {
      const name = (msg.from && msg.from.first_name) || "Friend";
      bot.sendMessage(
        msg.chat.id,
        "\uD83D\uDC4B Welcome *" + name + "*!\n\n" +
        "\uD83D\uDD25 *" + CONFIG.APP_NAME + "* — Daily Tips & Updates\n" +
        "\uD83D\uDCE2 Channel: " + CONFIG.CHANNEL,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "\uD83D\uDCE2 JOIN " + CONFIG.CHANNEL, url: CONFIG.CHANNEL_URL }],
              [{ text: "\u2B07 GET UPDATE", callback_data: "update" }],
            ],
          },
        }
      );
    });

    // /update — latest version info
    bot.onText(/\/update/, (msg) => {
      bot.sendMessage(
        msg.chat.id,
        "\uD83D\uDE80 *UPDATE v" + CONFIG.LATEST_VERSION + "*\n" + CONFIG.UPDATE_MESSAGE +
        "\n\n\u2B07 Download: " + CONFIG.CHANNEL_URL,
        { parse_mode: "Markdown" }
      );
    });

    // inline button — GET UPDATE
    bot.on("callback_query", (q) => {
      if (q.data === "update") {
        bot.answerCallbackQuery(q.id).catch(() => {});
        bot.sendMessage(
          q.message.chat.id,
          "\uD83D\uDE80 *UPDATE v" + CONFIG.LATEST_VERSION + "*\n" + CONFIG.UPDATE_MESSAGE +
          "\n\n\u2B07 " + CONFIG.CHANNEL_URL,
          { parse_mode: "Markdown" }
        );
      }
    });

    // /id — apna user id pata karo
    bot.onText(/\/id/, (msg) => {
      bot.sendMessage(msg.chat.id, "\uD83D\uDD11 Your ID: `" + msg.from.id + "`", { parse_mode: "Markdown" });
    });

    // /broadcast <msg> — sirf admin (channel pe bhejta hai)
    bot.onText(/\/broadcast (.+)/s, (msg, match) => {
      if (CONFIG.ADMIN_ID && msg.from.id === CONFIG.ADMIN_ID) {
        bot.sendMessage(CONFIG.CHANNEL, match[1], { parse_mode: "Markdown" })
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
  console.log("[BOT] BOT_TOKEN nahi mila — sirf Update API chal raha hai");
}

// ================== RENDER KEEP-ALIVE (free instance sleep rokne ke liye) ==================
setInterval(() => {
  const url = process.env.RENDER_EXTERNAL_URL;
  if (url) {
    require("http").get(url + "/health").on("error", () => {});
  }
}, 10 * 60 * 1000);

// graceful exit
process.on("uncaughtException", (e) => console.log("[ERR]", e.message));
process.on("unhandledRejection", (e) => console.log("[ERR]", e));

module.exports = { app, server, bot, CONFIG };
