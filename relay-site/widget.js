/* Relay website widget: <script src="https://YOUR-SITE/widget.js" data-agent="AGENT_ID" async></script> */
(function () {
  var s = document.currentScript; if (!s) return;
  var id = s.getAttribute("data-agent"), origin = new URL(s.src).origin, API = origin + "/api/agent-chat";
  fetch(API + "?agent=" + encodeURIComponent(id)).then(function (r) { return r.json(); })
    .then(function (c) { if (!c.error) boot(c); }).catch(function () {});
  function boot(c) {
    var col = /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : "#f3701e";
    function L(h) { var k = [1, 3, 5].map(function (i) { var v = parseInt(h.substr(i, 2), 16) / 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * k[0] + .7152 * k[1] + .0722 * k[2]; }
    var fg = (1.05 / (L(col) + .05)) > ((L(col) + .05) / (L("#1a1a1a") + .05)) ? "#fff" : "#1a1a1a";
    var host = document.createElement("div"); document.body.appendChild(host);
    var sh = host.attachShadow({ mode: "open" }), hist = [], cid = "", pass = null, owned = 0, timer = null, busy = false;
    try { cid = sessionStorage.getItem("relay_cid") || ""; } catch (e) {}
    if (!cid) { cid = Math.random().toString(36).slice(2, 12); try { sessionStorage.setItem("relay_cid", cid); } catch (e) {} }
    sh.innerHTML = '<style>*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,sans-serif}' +
      '.fab{position:fixed;right:20px;bottom:calc(20px + env(safe-area-inset-bottom,0px));width:56px;height:56px;border-radius:50%;border:0;background:' + col + ';color:' + fg + ';cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:24px;z-index:2147483000}' +
      '.p{position:fixed;right:20px;bottom:calc(88px + env(safe-area-inset-bottom,0px));width:360px;height:min(560px,calc(100vh - 110px));background:#fff;color:#1a1a1a;border-radius:18px;box-shadow:0 16px 48px rgba(0,0,0,.28);display:none;flex-direction:column;overflow:hidden;z-index:2147483000}.p.o{display:flex}' +
      '.h{background:' + col + ';color:' + fg + ';padding:14px 16px;font-weight:600;display:flex;justify-content:space-between}.h button{background:none;border:0;color:' + fg + ';font-size:18px;cursor:pointer}' +
      '.m{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:8px}.b{max-width:85%;padding:9px 13px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}' +
      '.a{background:#f1efea;align-self:flex-start}.t{background:#e8d8c9;align-self:flex-start}.u{background:' + col + ';color:' + fg + ';align-self:flex-end}' +
      '.f{display:flex;gap:8px;padding:10px;border-top:1px solid #eee}.f input{flex:1;min-width:0;font-size:16px;border:1px solid #ddd;border-radius:12px;padding:10px}.f button{border:0;border-radius:12px;background:' + col + ';color:' + fg + ';padding:0 16px;cursor:pointer}' +
      '.x{font-size:11px;text-align:center;color:#999;padding:0 0 8px}' +
      '@media(max-width:480px){.p{inset:0;width:auto;height:auto;border-radius:0}}</style>' +
      '<button class="fab" aria-label="Open chat">💬</button><div class="p"><div class="h"><span></span><button aria-label="Close">✕</button></div><div class="m"></div>' +
      '<div class="f"><input placeholder="Type your message…" aria-label="Message"><button>Send</button></div><div class="x">Powered by Relay</div></div>';
    var q = function (x) { return sh.querySelector(x); }, panel = q(".p"), box = q(".m"), inp = q(".f input");
    q(".h span").textContent = c.name;
    function add(t, cls) { var d = document.createElement("div"); d.className = "b " + cls; d.textContent = t; box.appendChild(d); box.scrollTop = box.scrollHeight; return d; }
    add(c.welcome, "a");
    var json = { "content-type": "application/json" };
    async function solve(ch) { var enc = new TextEncoder(); for (var n = 0; ; n++) { var a = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(ch.nonce + ":" + n))); if (((a[0] << 12) | (a[1] << 4) | (a[2] >> 4)) < Math.pow(2, 20 - ch.bits)) return n; } }
    async function ensurePass(force) {
      if (pass && !force) return pass;
      var ch = await (await fetch(API + "?agent=" + id + "&pow=1")).json(), n = await solve(ch);
      var r = await fetch(API, { method: "POST", headers: json, body: JSON.stringify({ agent: id, solve: { nonce: ch.nonce, ts: ch.ts, bits: ch.bits, sig: ch.sig, counter: n } }) }), d = await r.json();
      if (!r.ok) throw new Error(d.error || "verify"); pass = d.pass; return pass;
    }
    async function post(payload) {
      await ensurePass(); payload.agent = id; payload.cid = cid; payload.pass = pass;
      var r = await fetch(API, { method: "POST", headers: json, body: JSON.stringify(payload) }), d = await r.json();
      if (r.status === 401 && d.needPow) { await ensurePass(true); payload.pass = pass; r = await fetch(API, { method: "POST", headers: json, body: JSON.stringify(payload) }); d = await r.json(); }
      return { ok: r.ok, d: d };
    }
    function poll() {
      if (timer) return;
      timer = setInterval(async function () {
        try { var d = await (await fetch(API + "?agent=" + id + "&cid=" + cid + "&after=" + owned)).json(); (d.owner || []).forEach(function (t) { add(t, "t"); }); owned = d.total || owned; } catch (e) {}
      }, 8000);
      setTimeout(function () { clearInterval(timer); timer = null; }, 3600000);
    }
    q(".fab").onclick = function () { panel.classList.toggle("o"); if (panel.classList.contains("o")) { inp.focus(); ensurePass().catch(function () {}); } };
    q(".h button").onclick = function () { panel.classList.remove("o"); };
    async function send() {
      var t = inp.value.trim(); if (!t || busy) return; busy = true; inp.value = ""; hist.push({ role: "user", content: t }); add(t, "u");
      var w = add("…", "a");
      try {
        var x = await post({ messages: hist });
        if (!x.ok) { hist.pop(); w.textContent = x.d.error || "Something went wrong."; }
        else {
          hist.push({ role: "assistant", content: x.d.text }); w.textContent = x.d.text;
          if (x.d.handoff || x.d.human) poll();
          if (x.d.handoff) {
            var d = add("A person will follow up. Leave your email or phone:", "a"), i2 = document.createElement("input");
            i2.placeholder = "Email or phone"; i2.style.cssText = "margin-top:6px;width:100%;font-size:16px;border:1px solid #ddd;border-radius:10px;padding:8px";
            i2.onkeydown = function (e) { if (e.key === "Enter" && i2.value.trim()) { post({ contact: i2.value.trim() }); d.textContent = "Thanks, we’ll be in touch."; } };
            d.appendChild(i2);
          }
        }
      } catch (e) { hist.pop(); w.textContent = "I couldn’t connect. Please try again."; }
      busy = false;
    }
    q(".f button").onclick = send; inp.onkeydown = function (e) { if (e.key === "Enter") send(); };
  }
})();
