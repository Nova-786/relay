// Import a business's own website into its knowledge base.
const crypto = require("crypto");
const { cmd } = require("../lib/kv");
const { jget, jset } = require("../lib/store");
const { who } = require("../lib/auth");
const { get, text, links } = require("../lib/net");
const WANT = /pric|about|faq|contact|service|menu|ship|deliver|return|refund|polic|book|hour|location|product|shop|help|support|terms/i;
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const a = await who(req);
    if (!a.code) return res.status(403).json({ error: a.error || "Sign in first." });
    const k = "crawl:" + a.code + ":" + new Date().toISOString().slice(0, 10), n = await cmd("INCR", k);
    if (n === 1) await cmd("EXPIRE", k, 90000);
    if (n > 5) return res.status(429).json({ error: "You can import a website up to 5 times a day." });
    let start = String((req.body || {}).url || "").trim(); if (!/^https?:\/\//i.test(start)) start = "https://" + start;
    let u; try { u = new URL(start); } catch (e) { return res.status(400).json({ error: "That doesn’t look like a web address." }); }
    try {  // respect robots.txt
      const rb = await get(u.origin + "/robots.txt", { max: 50000, ms: 4000 }).catch(() => null);
      if (rb) { let on = false; for (const l of rb.body.split(/\r?\n/)) { const m = /^\s*([a-z-]+)\s*:\s*(.*)$/i.exec(l); if (!m) continue; if (/^user-agent$/i.test(m[1])) on = m[2].trim() === "*"; else if (on && /^disallow$/i.test(m[1]) && m[2].trim() === "/") return res.status(400).json({ error: "That website asks robots not to read it, so we can’t import it." }); } }
    } catch (e) { /* robots missing is fine */ }
    const home = await get(u.href);
    const urls = [home.url, ...links(home.body, home.url).filter(x => x !== home.url.replace(/\/$/, "")).sort((x, y) => WANT.test(y) - WANT.test(x))].slice(0, 7);
    const pages = [{ url: home.url, ...text(home.body) }];
    for (const x of urls.slice(1)) { try { const p = await get(x); pages.push({ url: p.url, ...text(p.body) }); } catch (e) {} }
    let docs = await jget("kb:" + a.code, []);
    const srcs = new Set(pages.map(p => p.url));
    docs = docs.filter(d => !srcs.has(d.src));
    let added = 0, total = docs.reduce((s, d) => s + d.text.length, 0);
    for (const p of pages) {
      const t = p.text.slice(0, 6000);
      if (t.length < 200 || docs.length >= 30 || total + t.length > 100000) continue;
      docs.push({ id: crypto.randomBytes(4).toString("hex"), title: (p.title || new URL(p.url).pathname || "Home").slice(0, 80), text: t, src: p.url });
      total += t.length; added++;
    }
    await jset("kb:" + a.code, docs);
    return res.json({ added, pages: pages.length });
  } catch (e) { return res.status(400).json({ error: String(e.message || "Couldn’t import that website.").slice(0, 160) }); }
};
