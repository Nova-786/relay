// Starts a free-trial checkout: a card-only $1 check (refunded) that saves the card for billing after the trial.
const crypto = require("crypto");
const { PLANS } = require("../../lib/plans");
const { CUR, CHECK } = require("../../lib/pay");
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const b = req.body || {}, plan = String(b.plan || ""), email = String(b.email || "").trim().toLowerCase(), p = PLANS[plan];
    if (!p || !p.price) return res.status(400).json({ error: "Unknown plan." });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return res.status(400).json({ error: "Please enter a valid email." });
    if (b.consent !== true) return res.status(400).json({ error: "Please tick the box to confirm how billing works." });
    if (!process.env.FLW_SECRET_KEY) return res.status(503).json({ error: "Checkout isn’t set up yet. Please check back soon." });
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const r = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST", headers: { Authorization: "Bearer " + process.env.FLW_SECRET_KEY, "content-type": "application/json" },
      body: JSON.stringify({ tx_ref: "rly_" + plan + "_" + crypto.randomBytes(6).toString("hex"), amount: CHECK(), currency: CUR(), payment_options: "card",
        redirect_url: "https://" + host + "/", customer: { email },
        customizations: { title: "Relay free trial", description: "Card check of $" + CHECK() + ", refunded. Free for 14 days, then $" + p.price + " per month (" + p.name + ")." } })
    });
    const d = await r.json();
    if (!r.ok || !d.data || !d.data.link) throw new Error(JSON.stringify(d));
    return res.json({ link: d.data.link });
  } catch (e) { console.error(e); return res.status(500).json({ error: "Couldn’t start checkout. Please try again." }); }
};
