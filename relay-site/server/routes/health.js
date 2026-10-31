// Launch checklist. Open https://YOUR-SITE/api/health?key=YOUR_CRON_SECRET to see what is and isn't set up. Shows no secrets.
const { cmd } = require("../../lib/kv");
const { PLANS } = require("../../lib/plans");
module.exports = async (req, res) => {
  const key = (req.query && req.query.key) || String(req.headers.authorization || "").replace(/^Bearer /, "");
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) return res.status(401).json({ error: "Add ?key=YOUR_CRON_SECRET to the address." });
  const has = n => !!process.env[n];
  const out = {
    settings: { ANTHROPIC_API_KEY: has("ANTHROPIC_API_KEY"), FLW_SECRET_KEY: has("FLW_SECRET_KEY"), RESEND_API_KEY: has("RESEND_API_KEY"), FROM_EMAIL: has("FROM_EMAIL"), SITE_URL: has("SITE_URL"), DATABASE: has("KV_REST_API_URL") || has("UPSTASH_REDIS_REST_URL") },
    currency: process.env.CURRENCY || "USD",
    prices: Object.fromEntries(Object.entries(PLANS).filter(([, p]) => p.price).map(([k, p]) => [k, p.price]))
  };
  try { await cmd("PING"); out.database_ok = true; } catch (e) { out.database_ok = false; }
  if (has("FLW_SECRET_KEY")) {
    out.flutterwave_mode = /_TEST/i.test(process.env.FLW_SECRET_KEY) ? "test" : "live";
    try {
      const r = await fetch("https://api.flutterwave.com/v3/balances", { headers: { Authorization: "Bearer " + process.env.FLW_SECRET_KEY } });
      const d = await r.json();
      out.flutterwave_key_ok = r.ok && d.status === "success";
      out.flutterwave_has_usd_wallet = (d.data || []).some(b => String(b.currency).toUpperCase() === "USD");
    } catch (e) { out.flutterwave_key_ok = false; }
  }
  out.reminders = ["Ask Flutterwave to enable USD and card tokenization (charging a saved card after the trial) on your account.", "Run a full test trial, then force a trial end, before using live keys."];
  return res.json(out);
};
