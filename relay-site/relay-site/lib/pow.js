// Invisible "are you a real browser" check for the public chat widget: a small proof-of-work puzzle, no third-party captcha needed.
// Slows scripted abuse; it is not a guarantee against a determined attacker.
const crypto = require("crypto");
const secret = () => process.env.POW_SECRET || process.env.CRON_SECRET || "change-me";
const hmac = s => crypto.createHmac("sha256", secret()).update(s).digest("hex");
const eq = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const ipHash = req => crypto.createHash("sha256").update(String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim()).digest("hex").slice(0, 16);
exports.ipHash = ipHash;
exports.challenge = (agent, bits) => { const nonce = crypto.randomBytes(12).toString("hex"), ts = Date.now(); return { nonce, ts, bits, sig: hmac([agent, nonce, ts, bits].join("|")) }; };
exports.verify = (agent, s) => {
  if (!s || !/^[a-f0-9]{24}$/.test(String(s.nonce))) return false;
  const ts = Number(s.ts), bits = Number(s.bits);
  if (!(Date.now() - ts < 600000 && ts <= Date.now() + 1000) || !(bits >= 10 && bits <= 20)) return false;
  if (!eq(hmac([agent, s.nonce, ts, bits].join("|")), s.sig)) return false;
  const h = crypto.createHash("sha256").update(s.nonce + ":" + s.counter).digest("hex");
  return parseInt(h.slice(0, 5), 16) < Math.pow(2, 20 - bits);
};
exports.issuePass = (agent, req) => { const exp = Date.now() + 1800000; return exp + "." + hmac(["pass", agent, ipHash(req), exp].join("|")); };
exports.checkPass = (agent, req, pass) => { const [exp, sig] = String(pass || "").split("."); return Number(exp) > Date.now() && !!sig && eq(hmac(["pass", agent, ipHash(req), exp].join("|")), sig); };
