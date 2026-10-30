// Offline smoke test: runs the whole signup, chat, billing, cancel and delete flow against fake Flutterwave, Anthropic, Resend and Redis.
// Run: node test/smoke.js
process.env.KV_REST_API_URL = "http://kv.test"; process.env.KV_REST_API_TOKEN = "t";
process.env.FLW_SECRET_KEY = "flw"; process.env.CRON_SECRET = "cron"; process.env.ANTHROPIC_API_KEY = "a"; process.env.RESEND_API_KEY = "r";
const db = new Map(), sets = new Map(), hashes = new Map(), emails = [], mails = [], calls = { charge: 0, refund: 0 }, seen = { system: "" };
global.__relayLookup = async h => [{ address: h === "localhost" ? "127.0.0.1" : "93.184.216.34" }];
let chargeFails = false;
const txs = {
  123456: { id: 123456, status: "successful", tx_ref: "rly_basic_abc", amount: 1, currency: "USD", customer: { email: "Owner@Shop.com" }, card: { token: "tok1", last_4digits: "4242" } },
  123457: { id: 123457, status: "successful", tx_ref: "rly_basic_def", amount: 1, currency: "USD", customer: { email: "owner@shop.com" }, card: { token: "tok2", last_4digits: "4242" } },
  123459: { id: 123459, status: "successful", tx_ref: "rly_basic_jkl", amount: 1, currency: "USD", customer: { email: "three@shop.com" }, card: { token: "tok4", last_4digits: "9999" } },
  123458: { id: 123458, status: "successful", tx_ref: "rly_standard_ghi", amount: 1, currency: "USD", customer: { email: "two@shop.com" }, card: { token: "tok3", last_4digits: "1111" } }
};
const J = (o, ok = true) => ({ ok, json: async () => o });
function redis(a) {
  const [c, k, v, x, y] = a;
  switch (c) {
    case "GET": return db.has(k) ? db.get(k) : null;
    case "SET": if (a.includes("NX") && db.has(k)) return null; db.set(k, v); return "OK";
    case "MGET": return a.slice(1).map(q => (db.has(q) ? db.get(q) : null));
    case "INCR": db.set(k, String((Number(db.get(k)) || 0) + 1)); return Number(db.get(k));
    case "EXPIRE": return 1;
    case "PING": return "PONG";
    case "SADD": (sets.get(k) || sets.set(k, new Set()).get(k)).add(v); return 1;
    case "SMEMBERS": return [...(sets.get(k) || [])];
    case "SREM": (sets.get(k) || new Set()).delete(v); return 1;
    case "DEL": a.slice(1).forEach(q => db.delete(q)); return 1;
    case "HINCRBY": { const h = hashes.get(k) || hashes.set(k, {}).get(k); h[v] = (h[v] || 0) + Number(x); return h[v]; }
    case "HGETALL": { const h = hashes.get(k) || {}; return Object.entries(h).flatMap(([a, b]) => [a, String(b)]); }
  }
  throw new Error("redis cmd " + c);
}
const page = (b, ok = true, ct = "text/html") => ({ ok, status: ok ? 200 : 404, headers: { get: k => (k === "content-type" ? ct : null) }, text: async () => b });
const LONG = "We sell hand made leather bags and belts in our workshop. ".repeat(8);
global.fetch = async (url, o = {}) => {
  url = String(url);
  const body = o.body ? JSON.parse(o.body) : {};
  if (url === "http://kv.test") return J({ result: redis(body) });
  if (url.endsWith("/payments")) return J({ status: "success", data: { link: "https://flw/pay" } });
  let m = url.match(/transactions\/(\d+)\/verify/); if (m) { const t = txs[m[1]]; return J(t ? { status: "success", data: t } : { status: "error" }); }
  if (url.endsWith("/balances")) return J({ status: "success", data: [{ currency: "USD" }, { currency: "NGN" }] });
  if (url.match(/refund/)) { calls.refund++; return J({ status: "success" }); }
  if (url.endsWith("/tokenized-charges")) { calls.charge++; return chargeFails ? J({ status: "success", data: { id: 9, status: "failed", processor_response: "Insufficient funds" } }) : J({ status: "success", data: { id: 900 + calls.charge, status: "successful" } }); }
  if (url === "https://shop.example/robots.txt") return page("User-agent: *\nDisallow: /private", true, "text/plain");
  if (url === "https://blocked.example/robots.txt") return page("User-agent: *\nDisallow: /", true, "text/plain");
  if (url === "https://shop.example/") return page('<html><head><title>Maya Leather</title></head><body><nav>menu</nav><p>' + LONG + '</p><a href="/pricing">Prices</a><a href="/about">About</a><a href="/private/x">Secret</a><a href="https://evil.example/">Other</a></body></html>');
  if (url === "https://shop.example/pricing") return page("<title>Prices</title><p>" + LONG + " Belts cost 30 pounds.</p>");
  if (url === "https://shop.example/about") return page("<title>About us</title><p>" + LONG + "</p>");
  if (url.includes("anthropic")) { seen.system = body.system || ""; if (body.max_tokens === 60) return J({ content: [{ type: "text", text: "refund, return, send back, reimbursement, money back" }] }); const lastU = (body.messages || []).slice(-1)[0] || {}; if (/human/i.test(lastU.content || "")) return J({ content: [{ type: "text", text: "[[tone:negative]]\n\nI’ll get a person to help.\n[[handoff: wants a person]]" }] }); }
  if (url.includes("anthropic")) return J({ content: [{ type: "text", text: "[[tone:positive]]\n\nHello from the AI.\n[[remember: The shop opens at 9am]]\n[[propose: Email lead | Follow up on quote]]\n[[used: Prices]]" }] });
  if (url.includes("resend")) { emails.push(body.subject); mails.push(body); return J({ id: "e" }); }
  throw new Error("unmocked " + url);
};
const call = async (file, { method = "POST", body = {}, query = {}, code } = {}) => {
  let out = { status: 200, body: null };
  const res = { setHeader() {}, status(s) { out.status = s; return this; }, json(b) { out.body = b; return this; }, send(b) { out.body = b; return this; }, end() { return this; } };
  await require("../api/" + file)({ method, body, query, headers: { host: "relay.test", "x-relay-code": code || "" } }, res);
  return out;
};
const pow = require("../lib/pow");
async function passFor(aid) {
  const ch = (await call("agent-chat.js", { method: "GET", query: { agent: aid, pow: "1" } })).body;
  let n = 0; while (!pow.verify(aid, { ...ch, counter: n })) n++;
  return (await call("agent-chat.js", { body: { agent: aid, solve: { ...ch, counter: n } } })).body.pass;
}
let fails = 0; const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
(async () => {
  let r = await call("checkout.js", { body: { plan: "basic", email: "owner@shop.com", consent: true } }); ok(r.body && r.body.link, "checkout returns a link");
  r = await call("checkout.js", { body: { plan: "basic", email: "owner@shop.com" } }); ok(r.status === 400, "checkout refuses without consent");
  r = await call("claim.js", { method: "GET", query: { transaction_id: "123456" } }); const code = r.body.code; ok(/^RLY-/.test(code) && r.body.plan === "basic", "claim creates trial account");
  ok(emails.some(e => /trial has started/i.test(e)), "welcome email sent"); ok(calls.refund === 1, "card check refunded");
  r = await call("claim.js", { method: "GET", query: { transaction_id: "123456" } }); ok(r.body.code === code && calls.refund === 1, "claim is idempotent");
  r = await call("claim.js", { method: "GET", query: { transaction_id: "123457" } }); ok(r.status === 409, "second trial for same email blocked (case-insensitive)");
  r = await call("chat.js", { code, body: { messages: [{ role: "user", content: "hi" }], mode: "support" } }); ok(r.status === 200 && r.body.text === "Hello from the AI." && r.body.remembered.length === 1 && r.body.proposals.length === 1, "chat returns reply, memory and proposal");
  r = await call("memory.js", { method: "GET", code }); ok(r.body.facts.length === 1, "fact stored in long-term memory");
  r = await call("knowledge.js", { code, body: { title: "Prices", text: "Haircut $10" } }); r = await call("knowledge.js", { method: "GET", code }); ok(r.body.docs.length === 1, "knowledge document saved");
  r = await call("agent.js", { method: "GET", code }); const aid = r.body.id; ok(/^[a-f0-9]{10}$/.test(aid), "agent id created");
  await call("agent.js", { code, body: { name: "Maya", color: "#2563eb", welcome: "Hi" } });
  r = await call("agent-chat.js", { body: { agent: aid, cid: "c1", messages: [{ role: "user", content: "price?" }] } }); ok(r.status === 401 && r.body.needPow, "public chat refuses a visitor who hasn’t passed the check");
  const pass1 = await passFor(aid);
  r = await call("agent-chat.js", { body: { agent: aid, cid: "c1", pass: pass1, messages: [{ role: "user", content: "price?" }] } }); ok(r.status === 200 && r.body.text, "public agent chat works");
  r = await call("inbox.js", { method: "GET", code }); ok(r.body.convs.length === 1, "conversation appears in inbox");
  r = await call("stats.js", { method: "GET", code }); ok(r.body.days.length === 14 && r.body.limit === 1000 && r.body.days[13].msgs >= 2, "stats counts messages and shows plan limit");
  r = await call("billing.js", { method: "GET", code }); ok(r.body.status === "trial" && r.body.price === 20, "billing shows trial and $20");
  r = await call("cron.js", { method: "GET" }); ok(r.status === 401, "cron rejects missing secret");
  const bk = "code:" + code, auth = { headers: {} };
  const edit = f => { const rec = JSON.parse(db.get(bk)); f(rec); db.set(bk, JSON.stringify(rec)); };
  const cron = async () => { const res = { status() { return this; }, json() { return this; }, end() {} }; await require("../api/cron.js")({ headers: { authorization: "Bearer cron" } }, res); };
  edit(x => { x.trialEnd = x.nextBill = Date.now() + 2 * 864e5; }); await cron(); ok(emails.some(e => /ends soon/i.test(e)) && calls.charge === 0, "reminder sent 3 days before, no charge yet");
  edit(x => { x.trialEnd = x.nextBill = Date.now() - 1000; }); await cron(); let rec = JSON.parse(db.get(bk));
  ok(calls.charge === 1 && rec.status === "active" && rec.nextBill > Date.now() + 25 * 864e5, "charged after trial and renewed a month ahead"); ok(emails.some(e => /Payment received/i.test(e)), "receipt email sent");
  await cron(); ok(calls.charge === 1, "second run does not double-charge");
  r = await call("billing.js", { code, body: { action: "cancel" } }); r = await call("billing.js", { method: "GET", code }); ok(r.body.status === "canceled" && r.body.until > Date.now(), "cancel keeps access until period end");
  r = await call("claim.js", { method: "GET", query: { transaction_id: "123458" } }); const code2 = r.body.code, bk2 = "code:" + code2;
  chargeFails = true; for (let i = 0; i < 3; i++) { const rr = JSON.parse(db.get(bk2)); rr.trialEnd = rr.nextBill = Date.now() - 1000; rr.lastTry = ""; db.set(bk2, JSON.stringify(rr)); await cron(); }
  rec = JSON.parse(db.get(bk2)); ok(rec.status === "ended" && rec.active === false, "plan ends after 3 failed payments"); ok(emails.some(e => /couldn.t take/i.test(e)) && emails.some(e => /has ended/i.test(e)), "failure and ended emails sent");
  r = await call("account.js", { code, body: { confirm: "no" } }); ok(r.status === 400, "delete needs DELETE typed");
  r = await call("account.js", { code, body: { confirm: "DELETE" } }); ok(r.body.ok && !db.has(bk) && !db.has("kb:" + code) && !db.has("facts:" + code) && !(sets.get("accts") || new Set()).has(code), "account deleted: data, memory and billing removed");
  r = await call("chat.js", { code, body: { messages: [{ role: "user", content: "hi" }] } }); ok(r.status === 403, "deleted code no longer works");
  ok(emails.some(e => /deleted/i.test(e)), "deletion email sent");
  r = await call("plans.js", { method: "GET" }); ok(r.body.plans.length === 3 && r.body.plans.map(x => x.price).join() === "20,50,100" && r.body.plans[2].items[0] === "20,000 conversations per month", "pricing endpoint serves the same prices checkout charges");
  r = await call("health.js", { method: "GET", query: { key: "wrong" } }); ok(r.status === 401, "health check refuses a wrong key");
  r = await call("health.js", { method: "GET", query: { key: "cron" } }); ok(r.body.database_ok && r.body.flutterwave_key_ok && r.body.flutterwave_mode === "live" && r.body.flutterwave_has_usd_wallet, "health check reports database, Flutterwave key and USD wallet");

  // ===== new features =====
  r = await call("claim.js", { method: "GET", query: { transaction_id: "123459" } }); const c3 = r.body.code; ok(/^RLY-/.test(c3), "third account created for feature tests");
  r = await call("login.js", { body: { email: "three@shop.com" } }); const before = mails.length; ok(r.body.ok && /sign-in link/i.test(emails[emails.length - 1]), "sign-in link emailed to a known address");
  const tok = /login=([a-f0-9]{48})/.exec(mails[mails.length - 1].html)[1];
  r = await call("login.js", { body: { email: "nobody@shop.com" } }); ok(r.body.ok && mails.length === before, "unknown address gets the same answer and no email");
  r = await call("login.js", { body: { token: tok } }); const ses = r.body.session; ok(/^ses_[a-f0-9]{32}$/.test(ses), "sign-in link returns a session");
  r = await call("memory.js", { method: "GET", code: ses }); ok(r.status === 200, "session works like an access code");
  r = await call("login.js", { body: { token: tok } }); ok(r.status === 400, "sign-in link can only be used once");
  await call("login.js", { code: ses, body: { action: "logout" } }); r = await call("memory.js", { method: "GET", code: ses }); ok(r.status === 403, "signing out ends the session");
  r = await call("agent.js", { method: "GET", code: c3 }); const aid3 = r.body.id; await call("agent.js", { code: c3, body: { name: "Maya", business: "Maya Leather", notify: true } });
  const p3 = await passFor(aid3);
  r = await call("agent-chat.js", { body: { agent: aid3, cid: "h1", pass: p3, messages: [{ role: "user", content: "I want a human please" }] } }); ok(r.body.handoff === true, "agent hands off when asked");
  ok(emails.some(e => /needs you: wants a person/i.test(e)), "owner emailed when a chat needs a person");
  const n1 = emails.length; await call("agent-chat.js", { body: { agent: aid3, cid: "h1", pass: p3, messages: [{ role: "user", content: "I want a human please" }, { role: "assistant", content: "ok" }, { role: "user", content: "human please" }] } }); ok(emails.length === n1, "owner is alerted once per chat, not for every message");
  await call("agent-chat.js", { body: { agent: aid3, cid: "h1", pass: p3, contact: "buyer@example.com" } }); ok(emails.some(e => /Contact details received/i.test(e)), "owner emailed when the customer leaves contact details");
  r = await call("inbox.js", { method: "POST", code: c3, body: { id: "h1", reply: "Hello, sorry about that." } }); ok(r.body.emailed === true && mails[mails.length - 1].to[0] === "buyer@example.com" && mails[mails.length - 1].reply_to === "three@shop.com", "owner reply is emailed to the customer with reply-to set");
  r = await call("agent-chat.js", { method: "GET", query: { agent: aid3, cid: "h1", after: "0" } }); ok(r.body.owner[0] === "Hello, sorry about that.", "widget can fetch the owner’s reply");
  r = await call("agent-chat.js", { body: { agent: aid3, cid: "h1", pass: p3, messages: [{ role: "user", content: "thanks, when?" }] } }); ok(r.body.human === true, "after a person replies, the assistant stops answering for them");
  r = await call("crawl.js", { code: c3, body: { url: "https://shop.example/" } }); ok(r.body.added >= 2, "website import adds pages as knowledge");
  r = await call("knowledge.js", { method: "GET", code: c3 }); ok(r.body.docs.some(d => d.title === "Prices") && !r.body.docs.some(d => /Secret/.test(d.title)), "import keeps useful pages and skips robots-disallowed ones");
  r = await call("crawl.js", { code: c3, body: { url: "http://127.0.0.1/" } }); ok(r.status === 400, "website import refuses private addresses");
  r = await call("crawl.js", { code: c3, body: { url: "https://blocked.example/" } }); ok(r.status === 400 && /robots/i.test(r.body.error), "website import respects robots.txt");
  await call("knowledge.js", { code: c3, body: { title: "Returns", text: "Returns: you can send items back within 14 days for a full refund.\n\n" + "Unrelated shipping and care notes for leather. ".repeat(40) } });
  seen.system = ""; await call("chat.js", { code: c3, body: { messages: [{ role: "user", content: "can I get my money back?" }], mode: "support" } }); ok(/send items back within 14 days/.test(seen.system), "search finds the returns policy for “money back” (query expansion)");
  r = await call("admin.js", { method: "GET", query: { key: "nope" } }); ok(r.status === 401, "admin refuses a wrong key");
  r = await call("admin.js", { method: "GET", query: { key: "cron" } }); ok(r.body.summary.accounts >= 1 && typeof r.body.summary.mrr === "number" && r.body.rows.some(x => x.email === "three@shop.com"), "admin shows accounts and revenue");
  await call("admin.js", { query: { key: "cron" }, body: { action: "disable", code: c3 } }); r = await call("chat.js", { code: c3, body: { messages: [{ role: "user", content: "hi" }] } }); ok(r.status === 403, "admin can switch an account off");
  console.log(fails ? "\n" + fails + " FAILED" : "\nAll checks passed"); process.exit(fails ? 1 : 0);
})().catch(e => { console.error("CRASH", e); process.exit(1); });
