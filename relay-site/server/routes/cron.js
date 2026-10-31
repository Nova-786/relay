// Runs once a day (see vercel.json). Sends trial reminders, charges when a trial ends or a month renews, and retries failures.
const { cmd } = require("../../lib/kv");
const { PLANS } = require("../../lib/plans");
const { verify, charge, addMonths, DAY } = require("../../lib/pay");
const { send, T } = require("../../lib/mail");

async function handle(code) {
  const raw = await cmd("GET", "code:" + code); if (!raw) return;
  const r = JSON.parse(raw), now = Date.now(), today = new Date().toISOString().slice(0, 10), price = PLANS[r.plan].price, site = r.site || process.env.SITE_URL || "";
  const mail = async m => { await send(r.email, m[0], m[1]); };
  const paid = id => { r.status = "active"; r.failed = 0; r.pendingTx = null; r.lastTx = id; r.active = true; r.nextBill = addMonths(r.nextBill, 1); r.until = r.nextBill + 3 * DAY; };
  const fail = async () => {
    r.failed = (r.failed || 0) + 1; r.pendingTx = null;
    if (r.failed >= 3) { r.status = "ended"; r.active = false; await mail(T.ended(r, site)); }
    else { r.status = "past_due"; await mail(T.failed(r, site, price, r.failed)); }
  };
  if (r.status === "canceled") { if (now >= r.until) r.active = false; }
  else if (["trial", "active", "past_due"].includes(r.status)) {
    if (r.pendingTx) {
      const tx = await verify(r.pendingTx);
      if (tx) { paid(tx.id); await mail(T.charged(r, site, price)); }
      else if (now - (r.pendingAt || now) > 2 * DAY) await fail();
    }
    if (r.status === "trial" && !r.reminded && r.trialEnd > now && r.trialEnd - now <= 3 * DAY) { await mail(T.reminder(r, site, price)); r.reminded = true; }
    if (now >= r.nextBill && !r.pendingTx && r.lastTry !== today) {
      r.lastTry = today;
      const ref = "rly_" + code.replace(/[^A-Z0-9]/g, "") + "_" + new Date(r.nextBill).toISOString().slice(0, 10) + (r.failed ? "-r" + r.failed : "");
      const c = await charge(r, price, ref);
      if (c.ok) { paid(c.id); await mail(T.charged(r, site, price)); }
      else if (c.pending) { r.pendingTx = c.id; r.pendingAt = now; }
      else await fail();
    }
  }
  await cmd("SET", "code:" + code, JSON.stringify(r));
}
module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET) return res.status(500).json({ error: "CRON_SECRET is not set" });
  if (req.headers.authorization !== "Bearer " + process.env.CRON_SECRET) return res.status(401).end();
  const codes = (await cmd("SMEMBERS", "accts")) || [];
  for (const c of codes) { try { await handle(c); } catch (e) { console.error("cron", c, e); } }
  return res.json({ checked: codes.length });
};
