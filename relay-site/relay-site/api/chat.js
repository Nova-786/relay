const crypto = require("crypto");
const { cmd } = require("../lib/kv");
const { jget, jset } = require("../lib/store");
const { PLANS } = require("../lib/plans");
const { buildSystem } = require("../lib/mind");
const { splitTags } = require("../lib/kb");
const { retrieve } = require("../lib/ai");
const { who } = require("../lib/auth");
const DEMO_PER_DAY = 5;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const b = req.body || {};
    let msgs = (Array.isArray(b.messages) ? b.messages : [])
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (!msgs.length || msgs[msgs.length - 1].role !== "user") return res.status(400).json({ error: "Invalid request." });
    if (msgs.length > 40) return res.status(400).json({ error: "This chat is getting long. Please start a new chat." });
    const isNew = msgs.length === 1;
    const lastUser = msgs[msgs.length - 1].content;
    const userText = msgs.filter(m => m.role === "user").slice(-2).map(m => m.content).join(" ");
    msgs = msgs.slice(-20);
    while (msgs.length && msgs[0].role !== "user") msgs.shift();

    const now = new Date().toISOString(), month = now.slice(0, 7), day = now.slice(0, 10);
    const a = await who(req, b.code);
    if (a.error) return res.status(403).json({ error: a.error, upgrade: true });
    const code = a.code;
    let note = "", docs = [], facts = [];

    if (code) {
      const limit = PLANS[a.rec.plan].conv, plan = PLANS[a.rec.plan];
      const mKey = "msg:" + code + ":" + month;
      const mn = await cmd("INCR", mKey);
      if (mn === 1) await cmd("EXPIRE", mKey, 3456000);
      if (mn > limit * 30) return res.status(429).json({ error: "You’ve reached this month’s usage limit. Upgrade your plan to keep going.", upgrade: true });
      if (isNew) {
        const cKey = "conv:" + code + ":" + month;
        const n = await cmd("INCR", cKey);
        if (n === 1) await cmd("EXPIRE", cKey, 3456000);
        if (n > limit) return res.status(429).json({ error: "You’ve used all " + limit + " conversations this month. Upgrade your plan to keep going.", upgrade: true });
        note = plan.name + " plan · " + (limit - n) + " conversations left this month";
      }
      docs = await jget("kb:" + code, []);
      facts = (await jget("facts:" + code, [])).slice(-40).map(f => f.t);
    } else {
      const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
      const key = "demo:" + crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16) + ":" + day;
      const n = await cmd("INCR", key);
      if (n === 1) await cmd("EXPIRE", key, 90000);
      if (n > DEMO_PER_DAY) return res.status(429).json({ error: "You’ve used today’s free demo messages. Start a free trial or pick a plan to keep going.", upgrade: true });
      note = "Free demo · " + (DEMO_PER_DAY - n) + " messages left today";
    }

    const system = buildSystem({ name: String(b.bizName || "").slice(0, 80), desc: String(b.bizDesc || "").slice(0, 300), mode: b.mode, lang: b.lang, lastUser,
      chunks: code ? await retrieve(docs, userText) : [], facts, agent: !!code });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: code ? (process.env.MODEL || "claude-sonnet-5-5") : (process.env.DEMO_MODEL || "claude-haiku-5-5"), max_tokens: 1000, system, messages: msgs })
    });
    const d = await r.json();
    if (!r.ok) throw new Error((d.error && d.error.message) || "api error");
    const o = splitTags((d.content || []).filter(c => c.type === "text").map(c => c.text).join("\n"));

    if (code) {
      if (o.remember.length) {
        const all = await jget("facts:" + code, []), seen = new Set(all.map(f => f.t.toLowerCase()));
        for (const t of o.remember) if (!seen.has(t.toLowerCase())) all.push({ id: crypto.randomBytes(4).toString("hex"), t, at: Date.now() });
        await jset("facts:" + code, all.slice(-60));
      }
      const sk = "stat:" + code + ":" + day;
      await cmd("HINCRBY", sk, "msgs", 1);
      if (isNew) await cmd("HINCRBY", sk, "conv", 1);
      await cmd("HINCRBY", sk, "s_" + o.tone, 1);
      await cmd("EXPIRE", sk, 2592000);
      const p = await jget("prof:" + code, {});
      p.history = msgs.concat({ role: "assistant", content: o.text }).slice(-30);
      await jset("prof:" + code, p);
    }
    return res.status(200).json({ text: o.text, note, tone: o.tone === "negative" ? "extra care" : "", remembered: o.remember, proposals: o.propose, used: o.used });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "The assistant is unavailable right now. Please try again." });
  }
};
