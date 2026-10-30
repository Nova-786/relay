const { jget, jset } = require("../lib/store");
const { who } = require("../lib/auth");
const { send, T } = require("../lib/mail");
module.exports = async (req, res) => {
  try {
    const a = await who(req);
    if (!a.code) return res.status(403).json({ error: a.error || "Enter your access code first." });
    const key = "inbox:" + a.code;
    let list = await jget(key, []);
    if (req.method === "DELETE") { list = list.filter(c => c.id !== String(req.query.id || "")); await jset(key, list); return res.json({ ok: true }); }
    if (req.method === "POST") {   // reply to a customer
      const b = req.body || {}, c = list.find(x => x.id === String(b.id || "")), reply = String(b.reply || "").trim().slice(0, 1000);
      if (!c) return res.status(404).json({ error: "That conversation no longer exists." });
      if (!reply) return res.status(400).json({ error: "Write a reply first." });
      (c.owner = c.owner || []).push({ content: reply, at: Date.now() }); c.owner = c.owner.slice(-20); c.replied = true;
      await jset(key, list);
      let emailed = false;
      if (c.contact && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.contact)) {
        const cfg = await jget("agentcfg:" + a.code, {}), m = T.ownerReply(cfg.business || cfg.name || "the business", reply);
        emailed = await send(c.contact, m[0], m[1], { replyTo: a.rec.email });
      }
      return res.json({ ok: true, emailed });
    }
    return res.json({ convs: list.slice(0, 50) });
  } catch (e) { return res.status(500).json({ error: "Something went wrong." }); }
};
