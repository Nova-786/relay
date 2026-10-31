// Lets a customer delete their whole account. Works even if their plan has ended. Removing the saved card token stops all future charges.
const { cmd } = require("../../lib/kv");
const { th } = require("../../lib/pay");
const { resolve } = require("../../lib/auth");
const { send, T } = require("../../lib/mail");
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const c = await resolve(req.headers["x-relay-code"]);
    const raw = c && (await cmd("GET", "code:" + c));
    if (!raw) return res.status(403).json({ error: "Enter your access code first." });
    if ((req.body || {}).confirm !== "DELETE") return res.status(400).json({ error: "Type DELETE to confirm." });
    const r = JSON.parse(raw), cfg = JSON.parse((await cmd("GET", "agentcfg:" + c)) || "{}"), keys = ["code:" + c, "kb:" + c, "facts:" + c, "prof:" + c, "inbox:" + c, "agentcfg:" + c];
    if (cfg.id) keys.push("agent:" + cfg.id);
    if (r.email) keys.push("payemail:" + String(r.email).toLowerCase());
    for (let i = 0; i < 31; i++) keys.push("stat:" + c + ":" + new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
    const n = new Date();
    for (let i = 0; i < 3; i++) { const m = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - i, 1)).toISOString().slice(0, 7); keys.push("conv:" + c + ":" + m, "msg:" + c + ":" + m); }
    const ses = (await cmd("SMEMBERS", "sessions:" + c)) || [];
    if (ses.length) await cmd("DEL", ...ses.map(x => "ses:" + x));
    keys.push("sessions:" + c);
    await cmd("SREM", "accts", c);
    await cmd("DEL", ...keys);
    if (r.email) { await cmd("SET", "trial:" + th(r.email), "deleted"); const m = T.deleted(r); await send(r.email, m[0], m[1]); }
    return res.json({ ok: true });
  } catch (e) { console.error(e); return res.status(500).json({ error: "Couldn’t delete the account. Please email support." }); }
};
