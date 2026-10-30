const { cmd } = require("../lib/kv");
const { PLANS } = require("../lib/plans");
const { who } = require("../lib/auth");
const { send, T } = require("../lib/mail");
module.exports = async (req, res) => {
  try {
    const a = await who(req);
    if (!a.code) return res.status(403).json({ error: a.error || "Enter your access code first." });
    const r = a.rec, key = "code:" + a.code;
    if (req.method === "POST" && (req.body || {}).action === "cancel") {
      if (r.status === "canceled") return res.json({ ok: true });
      r.status = "canceled"; r.until = r.status && r.trialEnd && Date.now() < r.trialEnd ? r.trialEnd : r.nextBill;
      await cmd("SET", key, JSON.stringify(r));
      const m = T.cancelled(r, r.site || process.env.SITE_URL); await send(r.email, m[0], m[1]);
      return res.json({ ok: true });
    }
    const p = PLANS[r.plan] || {};
    return res.json({ status: r.status || "active", plan: r.plan, planName: p.name, price: p.price, trialEnd: r.trialEnd, nextBill: r.nextBill, until: r.until, last4: r.last4 });
  } catch (e) { return res.status(500).json({ error: "Something went wrong." }); }
};
