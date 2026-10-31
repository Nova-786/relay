const { cmd } = require("../../lib/kv");
const { who } = require("../../lib/auth");
const { PLANS } = require("../../lib/plans");
module.exports = async (req, res) => {
  try {
    const a = await who(req);
    if (!a.code) return res.status(403).json({ error: a.error || "Enter your access code first." });
    const days = await Promise.all(Array.from({ length: 14 }, async (_, i) => {
      const d = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10);
      const r = (await cmd("HGETALL", "stat:" + a.code + ":" + d)) || [], o = { day: d };
      for (let k = 0; k < r.length; k += 2) o[r[k]] = Number(r[k + 1]);
      return o;
    }));
    const mc = Number(await cmd("GET", "conv:" + a.code + ":" + new Date().toISOString().slice(0, 7))) || 0, pl = PLANS[a.rec.plan] || {};
    return res.json({ days, limit: pl.conv || 300, plan: pl.name || "", monthConv: mc });
  } catch (e) { return res.status(500).json({ error: "Couldn’t load analytics." }); }
};
