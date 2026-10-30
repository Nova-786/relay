// Safe website fetching for the "import from my website" feature: blocks private addresses (SSRF), limits redirects, size and time.
const dns = require("dns").promises, net = require("net");
function priv(ip) {
  if (net.isIPv4(ip)) { const [a, b] = ip.split(".").map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
  if (net.isIPv6(ip)) { const l = ip.toLowerCase(); if (l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80")) return true; const m = l.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/); return m ? priv(m[1]) : false; }
  return true;
}
async function check(u) {
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http and https addresses can be imported.");
  if (u.port && !["80", "443"].includes(u.port)) throw new Error("That address isn’t allowed.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) { if (priv(host)) throw new Error("That address isn’t allowed."); return; }
  const addrs = await (global.__relayLookup || (h => dns.lookup(h, { all: true })))(host);
  if (!addrs.length || addrs.some(a => priv(a.address))) throw new Error("That address isn’t allowed.");
}
async function get(url, { max = 1500000, ms = 8000 } = {}) {
  let u = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    await check(u);
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
    let r; try { r = await fetch(u.href, { redirect: "manual", signal: ac.signal, headers: { "user-agent": "RelayBot/1.0 (website knowledge import)", accept: "text/html,text/plain" } }); } finally { clearTimeout(t); }
    if ([301, 302, 303, 307, 308].includes(r.status)) { u = new URL(r.headers.get("location"), u); continue; }
    if (!r.ok) throw new Error("The page returned an error (" + r.status + ").");
    if (!/text\/(html|plain)|xhtml/.test(r.headers.get("content-type") || "")) throw new Error("That address isn’t a web page.");
    return { url: u.href, body: (await r.text()).slice(0, max) };
  }
  throw new Error("Too many redirects.");
}
const dec = s => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
function text(html) {
  const title = dec((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [, ""])[1]).replace(/\s+/g, " ").trim();
  let t = html.replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
  t = dec(t).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  return { title, text: t };
}
function links(html, base) {
  const out = new Set();
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["']/gi)) { try { const u = new URL(m[1], base); if (u.origin === new URL(base).origin && !/\.(png|jpe?g|gif|svg|pdf|zip|css|js|ico|webp)$/i.test(u.pathname)) out.add(u.origin + u.pathname.replace(/\/$/, "") + u.search); } catch (e) {} }
  return [...out];
}
module.exports = { get, text, links, priv };
