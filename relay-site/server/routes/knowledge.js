const crypto = require("crypto");
const { jget, jset } = require("../../lib/store");
const { who } = require("../../lib/auth");
module.exports = async (req, res) => {
  try {
    const a = await who(req);
    if (!a.code) return res.status(403).json({ error: a.error || "Enter your access code first." });
    const key = "kb:" + a.code;
    let docs = await jget(key, []);
    if (req.method === "DELETE") { docs = docs.filter(d => d.id !== String(req.query.id || "")); await jset(key, docs); return res.json({ ok: true }); }
    if (req.method === "POST") {
      const b = req.body || {}, title = String(b.title || "").trim().slice(0, 80), text = String(b.text || "").trim().slice(0, 20000);
      if (!title || !text) return res.status(400).json({ error: "Add a title and some text." });
      if (docs.length >= 30) return res.status(400).json({ error: "You’ve reached 30 documents. Delete one to add another." });
      if (docs.reduce((n, d) => n + d.text.length, 0) + text.length > 100000) return res.status(400).json({ error: "Knowledge limit reached. Delete something first." });
      docs.push({ id: crypto.randomBytes(4).toString("hex"), title, text });
      await jset(key, docs);
      return res.json({ ok: true });
    }
    return res.json({ docs: docs.map(d => ({ id: d.id, title: d.title, chars: d.text.length })) });
  } catch (e) { return res.status(500).json({ error: "Something went wrong." }); }
};
