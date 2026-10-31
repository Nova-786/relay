// PUBLIC endpoint used by the website widget. Customers have no access code; the agent id maps to the business.
const crypto = require("crypto");
const { cmd } = require("../../lib/kv");
const { jget, jset } = require("../../lib/store");
const { PLANS } = require("../../lib/plans");
const { splitTags, agentPrompt } = require("../../lib/kb");
const { retrieve } = require("../../lib/ai");
const pow = require("../../lib/pow");
const { send, T } = require("../../lib/mail");
const BITS = 14;
async function hit(key, limit, ttl) { const n = await cmd("INCR", key); if (n === 1) await cmd("EXPIRE", key, ttl); return n > limit; }
const cidOf = v => String(v || "").replace(/[^a-z0-9]/gi, "").slice(0, 24);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    const b = req.body || {}, q = req.query || {}, id = String(q.agent || b.agent || "");
    if (!/^[a-f0-9]{10}$/.test(id)) return res.status(400).json({ error: "Unknown agent." });
    const code = await cmd("GET", "agent:" + id);
    if (!code) return res.status(404).json({ error: "Unknown agent." });
    const raw = await cmd("GET", "code:" + code), rec = raw ? JSON.parse(raw) : null;
    if (!rec || !rec.active || (rec.exp && Date.now() > rec.exp) || (rec.until && Date.now() > rec.until)) return res.status(403).json({ error: "This assistant is offline right now." });
    const cfg = await jget("agentcfg:" + code, {});

    if (req.method === "GET") {
      if (q.pow) return res.json(Object.assign(pow.challenge(id, BITS)));
      if (q.cid) {
        const conv = (await jget("inbox:" + code, [])).find(c => c.id === cidOf(q.cid)), own = (conv && conv.owner) || [];
        return res.json({ owner: own.slice(Number(q.after) || 0).map(m => m.content), total: own.length });
      }
      return res.json({ name: cfg.name || "Assistant", color: cfg.color || "#f3701e", welcome: cfg.welcome || "Hi! How can I help?" });
    }
    if (b.solve) {
      if (!pow.verify(id, b.solve)) return res.status(400).json({ error: "Verification failed. Please try again." });
      if (!(await cmd("SET", "pow:" + b.solve.nonce, "1", "NX", "EX", 900))) return res.status(400).json({ error: "Verification already used." });
      return res.json({ pass: pow.issuePass(id, req) });
    }
    if (!pow.checkPass(id, req, b.pass)) return res.status(401).json({ needPow: true, error: "Please wait a moment while we verify your browser." });

    const cid = cidOf(b.cid) || crypto.randomBytes(6).toString("hex");
    const inbox = await jget("inbox:" + code, []);
    let conv = inbox.find(c => c.id === cid);
    const host = req.headers["x-forwarded-host"] || req.headers.host, site = rec.site || process.env.SITE_URL || "https://" + host;
    const notify = async m => { if (cfg.notify !== false && rec.email) { try { await send(rec.email, m[0], m[1]); } catch (e) {} } };
    if (b.contact) {
      if (conv) { conv.contact = String(b.contact).slice(0, 120); await jset("inbox:" + code, inbox); await notify(T.contact(conv, site)); }
      return res.json({ ok: true });
    }
    let msgs = (Array.isArray(b.messages) ? b.messages : []).filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map(m => ({ role: m.role, content: m.content.slice(0, 1000) })).slice(-30);
    while (msgs.length && msgs[0].role !== "user") msgs.shift();
    if (!msgs.length || msgs[msgs.length - 1].role !== "user") return res.status(400).json({ error: "Invalid request." });

    const now = new Date().toISOString(), hour = now.slice(0, 13), month = now.slice(0, 7), day = now.slice(0, 10);
    if (await hit("arl:" + pow.ipHash(req) + ":" + hour, 40, 4000)) return res.status(429).json({ error: "You’re sending messages very quickly. Please wait a moment." });
    if (await hit("arlg:" + id + ":" + hour, 600, 4000)) return res.status(429).json({ error: "This assistant is very busy right now. Please try again shortly." });

    if (conv && conv.owner && conv.owner.length) {   // a person has taken over this chat
      conv.msgs = (conv.msgs || []).concat({ role: "user", content: msgs[msgs.length - 1].content }).slice(-40);
      if (!conv.lastPing || Date.now() - conv.lastPing > 600000) { conv.lastPing = Date.now(); await notify(T.followup(conv, site)); }
      await jset("inbox:" + code, inbox);
      return res.json({ text: "Thanks, I’ve passed that to the team. They’ll reply here or by email.", human: true, cid });
    }
    if (msgs.length === 1) {
      const ck = "conv:" + code + ":" + month, n = await cmd("INCR", ck);
      if (n === 1) await cmd("EXPIRE", ck, 3456000);
      if (n > PLANS[rec.plan].conv) return res.status(429).json({ error: "This assistant is unavailable right now. Please contact the business directly." });
    }
    const docs = await jget("kb:" + code, []);
    const system = agentPrompt(cfg, await retrieve(docs, msgs.filter(m => m.role === "user").slice(-2).map(m => m.content).join(" ")));
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.AGENT_MODEL || "claude-haiku-5-5", max_tokens: 500, system, messages: msgs })
    });
    const d = await r.json();
    if (!r.ok) throw new Error((d.error && d.error.message) || "api error");
    const o = splitTags((d.content || []).filter(c => c.type === "text").map(c => c.text).join("\n"));

    if (!conv) { conv = { id: cid, at: Date.now(), contact: "", handoff: "", owner: [] }; inbox.unshift(conv); }
    conv.msgs = msgs.concat({ role: "assistant", content: o.text }).slice(-40);
    conv.tone = o.tone;
    if (o.handoff[0]) conv.handoff = o.handoff[0].slice(0, 120);
    const alert = conv.handoff && !conv.notified; if (alert) conv.notified = true;
    await jset("inbox:" + code, inbox.slice(0, 100));
    if (alert) await notify(T.handoff(conv, site));
    const sk = "stat:" + code + ":" + day;
    await cmd("HINCRBY", sk, "msgs", 1);
    if (msgs.length === 1) await cmd("HINCRBY", sk, "conv", 1);
    await cmd("HINCRBY", sk, "s_" + o.tone, 1);
    await cmd("EXPIRE", sk, 2592000);
    return res.json({ text: o.text, handoff: o.handoff.length > 0, cid });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "The assistant is unavailable right now. Please try again." });
  }
};
