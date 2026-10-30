// Flutterwave card-on-file billing. A $1 card check at signup saves a card token and is refunded; we then charge the token ourselves
// when the trial ends and every month after. Deterministic tx_refs mean a repeated run can never double-charge.
const crypto = require("crypto");
const { cmd } = require("./kv");
const { PLANS } = require("./plans");
const FLW = "https://api.flutterwave.com/v3", DAY = 864e5, TRIAL_DAYS = 14;
const hdr = () => ({ Authorization: "Bearer " + process.env.FLW_SECRET_KEY, "content-type": "application/json" });
const CUR = () => (process.env.CURRENCY || "USD").toUpperCase();
const CHECK = () => Number(process.env.VERIFY_AMOUNT || 1);
const th = e => crypto.createHash("sha256").update(String(e).toLowerCase()).digest("hex").slice(0, 32);
const newCode = () => "RLY-" + crypto.randomBytes(3).toString("hex").toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();

async function verify(id) {
  const r = await fetch(FLW + "/transactions/" + encodeURIComponent(id) + "/verify", { headers: hdr() });
  const d = await r.json();
  return d && d.status === "success" && d.data && d.data.status === "successful" ? d.data : null;
}
async function refund(id) {
  try { const r = await fetch(FLW + "/transactions/" + encodeURIComponent(id) + "/refund", { method: "POST", headers: hdr(), body: "{}" }); return r.ok; } catch (e) { return false; }
}
async function charge(acct, amount, txRef) {
  const r = await fetch(FLW + "/tokenized-charges", { method: "POST", headers: hdr(), body: JSON.stringify({
    token: acct.token, currency: CUR(), country: process.env.CHARGE_COUNTRY || "NG", amount, email: acct.email, tx_ref: txRef, narration: "Relay " + PLANS[acct.plan].name + " plan" }) });
  const d = await r.json();
  if (!(d && d.status === "success" && d.data)) return { ok: false, error: (d && d.message) || "declined" };
  if (d.data.status === "successful") return { ok: true, id: d.data.id };
  if (d.data.status === "pending") return { ok: false, pending: true, id: d.data.id };
  return { ok: false, error: d.data.processor_response || "declined" };
}
function addMonths(ts, n) {
  const d = new Date(ts), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d.getTime();
}
async function createAccount({ email, plan, token, last4, site }) {
  email = String(email).toLowerCase();
  const code = newCode(), end = Date.now() + TRIAL_DAYS * DAY;
  const rec = { plan, email, token, last4, site, active: true, status: "trial", trialEnd: end, nextBill: end, until: end + 3 * DAY, failed: 0, reminded: false };
  await cmd("SET", "code:" + code, JSON.stringify(rec));
  await cmd("SET", "trial:" + th(email), code);
  await cmd("SADD", "accts", code);
  return { code, rec };
}
module.exports = { th, verify, refund, charge, addMonths, createAccount, CUR, CHECK, DAY };
