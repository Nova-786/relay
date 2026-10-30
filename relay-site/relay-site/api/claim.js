// After the card check, Flutterwave sends the customer back with ?transaction_id=... We confirm it, save the card token and start the trial.
const crypto = require("crypto");
const { cmd } = require("../lib/kv");
const { PLANS } = require("../lib/plans");
const { th, verify, refund, createAccount, CUR, CHECK } = require("../lib/pay");
const { send, T } = require("../lib/mail");
module.exports = async (req, res) => {
  const id = String(req.query.transaction_id || "");
  if (!/^\d{4,15}$/.test(id)) return res.status(400).json({ error: "Bad reference" });
  try {
    const ip = crypto.createHash("sha256").update(String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim()).digest("hex").slice(0, 16);
    const k = "clm:" + ip + ":" + new Date().toISOString().slice(0, 13), n = await cmd("INCR", k);
    if (n === 1) await cmd("EXPIRE", k, 4000);
    if (n > 30) return res.status(429).json({ error: "Too many attempts. Try again later." });
    let code = await cmd("GET", "ref:" + id);
    if (!code) {
      const tx = await verify(id);
      if (!tx) return res.status(404).json({ error: "pending" });
      const m = /^rly_(basic|standard|premium)_/.exec(tx.tx_ref || "");
      if (!m || String(tx.currency).toUpperCase() !== CUR() || Number(tx.amount) !== CHECK()) return res.status(400).json({ error: "That payment doesn’t match a trial." });
      const token = tx.card && tx.card.token, email = String((tx.customer && tx.customer.email) || "").toLowerCase();
      if (!token || !email) { await refund(id); return res.status(500).json({ error: "We couldn’t save your card, so no trial was started. Your $" + CHECK() + " check is being refunded. Please try again." }); }
      if (await cmd("GET", "trial:" + th(email))) { await refund(id); return res.status(409).json({ error: "This email has already used a free trial. Your card check is being refunded." }); }
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const made = await createAccount({ email, plan: m[1], token, last4: (tx.card.last_4digits || "").slice(-4), site: "https://" + host });
      code = made.code;
      await cmd("SET", "ref:" + id, code, "EX", 2592000);
      await refund(id);
      const mail = T.welcome(made.rec, code, made.rec.site, PLANS[m[1]].price);
      await send(email, mail[0], mail[1]);
    }
    const rec = JSON.parse(await cmd("GET", "code:" + code));
    return res.status(200).json({ code, plan: rec.plan, price: PLANS[rec.plan].price, trialEnd: rec.trialEnd });
  } catch (e) { console.error(e); return res.status(500).json({ error: "error" }); }
};
