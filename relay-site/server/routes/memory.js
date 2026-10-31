const { jget, jset } = require("../../lib/store");
const { who } = require("../../lib/auth");
module.exports = async (req, res) => {
  try {
    const a = await who(req);
    if (!a.code) return res.status(403).json({ error: a.error || "Enter your access code first." });
    const c = a.code;
    if (req.method === "DELETE") {
      const id = String(req.query.fact || "");
      await jset("facts:" + c, (await jget("facts:" + c, [])).filter(f => f.id !== id));
      return res.json({ ok: true });
    }
    const p = await jget("prof:" + c, {});
    if (req.method === "POST") {
      const b = req.body || {};
      if (b.profile && JSON.stringify(b.profile).length < 4000) p.profile = b.profile;
      if ("crm" in b) p.crm = String(b.crm || "").slice(0, 300);
      if (b.onboarding) p.onboarding = b.onboarding;
      await jset("prof:" + c, p);
      return res.json({ ok: true });
    }
    return res.json({ profile: p.profile || {}, history: p.history || [], crm: p.crm || "", onboarding: p.onboarding || {}, facts: await jget("facts:" + c, []) });
  } catch (e) { return res.status(500).json({ error: "Something went wrong." }); }
};
