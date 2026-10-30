const { jget } = require("./store");
const { cmd } = require("./kv");
// A credential is either an access code (RLY-...) or a sign-in session token (ses_...). Returns the account's access code, or null.
exports.resolve = async raw => {
  const c = String(raw || "").trim();
  if (/^ses_[a-f0-9]{32}$/i.test(c)) return (await cmd("GET", "ses:" + c.toLowerCase())) || null;
  return c ? c.toUpperCase() : "";
};
// Returns {} (nothing supplied), {error}, or {code, rec}
exports.who = async (req, bodyCode) => {
  const raw = req.headers["x-relay-code"] || bodyCode || "";
  if (!String(raw).trim()) return {};
  const code = await exports.resolve(raw);
  if (code === null) return { error: "Your session has expired. Please sign in again." };
  const text = await cmd("GET", "code:" + code);
  const rec = text ? JSON.parse(text) : null;
  if (!rec || !rec.active) return { error: "That access code isn’t active. Check it, or pick a plan." };
  if (rec.until && Date.now() > rec.until) return { error: "Your plan has ended. Pick a plan to continue." };
  if (rec.exp && Date.now() > rec.exp) return { error: "Your free trial has ended. Pick a plan to keep going." };
  return { code, rec };
};
