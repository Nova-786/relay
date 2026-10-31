const crypto = require("crypto");
const { cmd } = require("../../lib/kv");
const { jget, jset } = require("../../lib/store");
const { who } = require("../../lib/auth");
module.exports = async (req, res) => {
  try {
    const a = await who(req);
    if (!a.code) return res.status(403).json({ error: a.error || "Enter your access code first." });
    const key = "agentcfg:" + a.code;
    let c = await jget(key, {});
    if (!c.id) { c.id = crypto.randomBytes(5).toString("hex"); await jset(key, c); await cmd("SET", "agent:" + c.id, a.code); }
    if (req.method === "POST") {
      const b = req.body || {}, t = (v, n) => String(v || "").trim().slice(0, n);
      Object.assign(c, { name: t(b.name, 40), business: t(b.business, 80), welcome: t(b.welcome, 160), color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : "#f3701e",
        instructions: t(b.instructions, 1500), procedure: t(b.procedure, 1500), guardrails: t(b.guardrails, 1500), notify: b.notify !== false });
      await jset(key, c);
      return res.json({ ok: true });
    }
    return res.json(c);
  } catch (e) { return res.status(500).json({ error: "Something went wrong." }); }
};
