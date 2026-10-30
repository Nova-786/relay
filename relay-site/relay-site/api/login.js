// Sign in by email link. Always answers the same way, so nobody can use it to find out who has an account.
const crypto = require("crypto");
const { cmd } = require("../lib/kv");
const { th } = require("../lib/pay");
const { who } = require("../lib/auth");
const { send, T } = require("../lib/mail");
const { ipHash } = require("../lib/pow");
const hex = n => crypto.randomBytes(n).toString("hex");
async function hit(key, limit, ttl) { const n = await cmd("INCR", key); if (n === 1) await cmd("EXPIRE", key, ttl); return n > limit; }
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const b = req.body || {}, hr = new Date().toISOString().slice(0, 13);
    if (b.action === "logout" || b.action === "logoutAll") {
      const raw = String(req.headers["x-relay-code"] || "").toLowerCase();
      if (b.action === "logout") { if (/^ses_[a-f0-9]{32}$/.test(raw)) { const c = await cmd("GET", "ses:" + raw); await cmd("DEL", "ses:" + raw); if (c) await cmd("SREM", "sessions:" + c, raw); } return res.json({ ok: true }); }
      const a = await who(req); if (!a.code) return res.status(403).json({ error: a.error || "Sign in first." });
      const all = (await cmd("SMEMBERS", "sessions:" + a.code)) || [];
      if (all.length) await cmd("DEL", ...all.map(x => "ses:" + x));
      await cmd("DEL", "sessions:" + a.code);
      return res.json({ ok: true });
    }
    if (b.token) {
      if (await hit("lgv:" + ipHash(req) + ":" + hr, 30, 4000)) return res.status(429).json({ error: "Too many attempts. Try again later." });
      const t = String(b.token); if (!/^[a-f0-9]{48}$/.test(t)) return res.status(400).json({ error: "That sign-in link isn’t valid." });
      const code = await cmd("GET", "login:" + t);
      if (!code) return res.status(400).json({ error: "This sign-in link has expired or was already used. Request a new one." });
      await cmd("DEL", "login:" + t);
      const s = "ses_" + hex(16);
      await cmd("SET", "ses:" + s, code, "EX", 2592000); await cmd("SADD", "sessions:" + code, s);
      return res.json({ session: s });
    }
    const email = String(b.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return res.status(400).json({ error: "Please enter a valid email." });
    if ((await hit("lgi:" + ipHash(req) + ":" + hr, 10, 4000)) || (await hit("lge:" + th(email) + ":" + hr, 3, 4000))) return res.status(429).json({ error: "Too many sign-in requests. Try again in an hour." });
    const code = await cmd("GET", "trial:" + th(email));
    if (code && code !== "deleted" && (await cmd("GET", "code:" + code))) {
      const tok = hex(24); await cmd("SET", "login:" + tok, code, "EX", 900);
      const host = req.headers["x-forwarded-host"] || req.headers.host, m = T.login("https://" + host + "/?login=" + tok);
      await send(email, m[0], m[1]);
    }
    return res.json({ ok: true });
  } catch (e) { console.error(e); return res.status(500).json({ error: "Something went wrong. Please try again." }); }
};
