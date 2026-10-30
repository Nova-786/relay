// Platform owner's dashboard data. Open /admin.html and enter ADMIN_KEY (falls back to CRON_SECRET).
const crypto = require("crypto");
const { cmd } = require("../lib/kv");
const { PLANS } = require("../lib/plans");
const eq = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
module.exports = async (req, res) => {
  const want = process.env.ADMIN_KEY || process.env.CRON_SECRET, key = String(req.headers["x-admin-key"] || (req.query && req.query.key) || "");
  if (!want || !eq(key, want)) return res.status(401).json({ error: "Wrong admin key." });
  try {
    if (req.method === "POST") {
      const b = req.body || {}, code = String(b.code || "").toUpperCase(), raw = await cmd("GET", "code:" + code);
      if (!raw) return res.status(404).json({ error: "No such account." });
      const r = JSON.parse(raw);
      if (b.action === "disable") r.active = false; else if (b.action === "enable") r.active = true;
      else if (b.action === "stopBilling") { r.status = "canceled"; r.until = Date.now(); } else return res.status(400).json({ error: "Unknown action." });
      await cmd("SET", "code:" + code, JSON.stringify(r));
      return res.json({ ok: true });
    }
    const codes = (await cmd("SMEMBERS", "accts")) || [], month = new Date().toISOString().slice(0, 7), rows = [];
    for (let i = 0; i < codes.length; i += 100) {
      const part = codes.slice(i, i + 100), recs = await cmd("MGET", ...part.map(c => "code:" + c)), use = await cmd("MGET", ...part.map(c => "conv:" + c + ":" + month));
      part.forEach((c, k) => {
        if (!recs[k]) return;
        const r = JSON.parse(recs[k]), p = PLANS[r.plan] || {};
        rows.push({ code: c, email: r.email, plan: r.plan, price: p.price || 0, status: !r.active && !["ended", "canceled"].includes(r.status) ? "disabled" : (r.status || "active"), trialEnd: r.trialEnd, nextBill: r.nextBill, failed: r.failed || 0, last4: r.last4, convMonth: Number(use[k]) || 0, limit: p.conv || 0 });
      });
    }
    const n = s => rows.filter(r => r.status === s).length;
    const summary = { accounts: rows.length, trialing: n("trial"), active: n("active"), pastDue: n("past_due"), canceled: n("canceled"), ended: n("ended"), disabled: n("disabled"),
      mrr: rows.filter(r => r.status === "active").reduce((s, r) => s + r.price, 0), trialValue: rows.filter(r => r.status === "trial").reduce((s, r) => s + r.price, 0) };
    rows.sort((x, y) => (x.nextBill || 0) - (y.nextBill || 0));
    return res.json({ summary, rows });
  } catch (e) { console.error(e); return res.status(500).json({ error: "Couldn’t load accounts." }); }
};
