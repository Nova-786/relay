// Email via Resend (https://resend.com). Set RESEND_API_KEY and FROM_EMAIL (an address on a domain you verified there).
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
async function send(to, subject, html, opts = {}) {
  if (!process.env.RESEND_API_KEY) { console.log("[mail skipped, no RESEND_API_KEY]", to, subject); return false; }
  try {
    const body = { from: process.env.FROM_EMAIL || "Relay <onboarding@resend.dev>", to: [to], subject, html };
    if (opts.replyTo) body.reply_to = opts.replyTo;
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "content-type": "application/json" }, body: JSON.stringify(body) });
    return r.ok;
  } catch (e) { return false; }
}
const when = t => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const snip = (t, n) => esc(String(t || "").replace(/\s+/g, " ").slice(0, n || 200));
function page(h, lines, site, btn, href) {
  const link = href || (site ? site + "/?manage=1" : "");
  return '<div style="font-family:system-ui,Segoe UI,sans-serif;max-width:520px;margin:auto;color:#1a1a1a;line-height:1.6"><h2 style="margin:0 0 12px">' + esc(h) + "</h2>" +
    lines.map(l => "<p>" + l + "</p>").join("") + (link ? '<p><a href="' + esc(link) + '" style="display:inline-block;background:#f3701e;color:#1a1a1a;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:999px">' + esc(btn || "Manage my plan") + "</a></p>" : "") +
    '<p style="color:#888;font-size:12px">You’re receiving this because of your Relay account.</p></div>';
}
const userMsgs = c => (c.msgs || []).filter(m => m.role === "user").map(m => m.content);
const T = {
  welcome: (r, code, site, price) => ["Your Relay trial has started", page("Welcome to Relay", ["Your access code is <b>" + esc(code) + "</b>. Keep it safe. You can also sign in with just your email.",
    "Your free trial runs until <b>" + when(r.trialEnd) + "</b>. On that date your card ending <b>" + esc(r.last4 || "") + "</b> will be charged <b>$" + price + "</b> for the " + esc(r.plan) + " plan, then every month.",
    "We’ll email you 3 days before. Cancel any time before then and you pay nothing."], site)],
  reminder: (r, site, price) => ["Your Relay trial ends soon", page("Your trial ends on " + when(r.trialEnd), ["On <b>" + when(r.trialEnd) + "</b> your card ending <b>" + esc(r.last4 || "") + "</b> will be charged <b>$" + price + "</b>, and then every month.", "Don’t want to continue? Cancel before then and you won’t be charged."], site, "Review or cancel")],
  charged: (r, site, price) => ["Payment received, thank you", page("Payment received", ["We charged <b>$" + price + "</b> to your card ending <b>" + esc(r.last4 || "") + "</b> for your " + esc(r.plan) + " plan.", "Your next payment is on <b>" + when(r.nextBill) + "</b>."], site)],
  failed: (r, site, price, n) => ["We couldn’t take your Relay payment", page("Payment didn’t go through", ["We tried to charge <b>$" + price + "</b> to your card ending <b>" + esc(r.last4 || "") + "</b> and it was declined (attempt " + n + " of 3).", "We’ll try again tomorrow. To avoid losing access, please make sure your card has funds, or contact us."], site)],
  ended: (r, site) => ["Your Relay plan has ended", page("Your plan has ended", ["We couldn’t collect your payment after 3 attempts, so your plan has ended. Your knowledge and settings are kept, so you can restart any time."], site, "Restart")],
  cancelled: (r, site) => ["Your Relay plan is cancelled", page("Plan cancelled", ["You won’t be charged again. You keep access until <b>" + when(r.until) + "</b>."], site)],
  deleted: () => ["Your Relay account has been deleted", page("Account deleted", ["We’ve deleted your documents, memories, conversations, settings and saved card token, and your plan has ended. You won’t be charged again."], "")],
  login: link => ["Your Relay sign-in link", page("Sign in to Relay", ["Click the button to sign in. The link works once and expires in 15 minutes.", "If you didn’t ask for this, you can safely ignore this email."], "", "Sign in", link)],
  handoff: (conv, site, biz) => ["A customer needs you: " + String(conv.handoff || "needs a person").slice(0, 80), page("A customer needs a person", [
    "Reason: <b>" + snip(conv.handoff, 120) + "</b>", "They asked: “" + snip(userMsgs(conv)[0], 160) + "”" + (userMsgs(conv).length > 1 ? "<br>Latest: “" + snip(userMsgs(conv).slice(-1)[0], 160) + "”" : ""),
    conv.contact ? "Contact: <b>" + snip(conv.contact, 80) + "</b>" : "They haven’t left contact details yet. We’ve asked them to."], site, "Open your inbox", site + "/?inbox=1")],
  contact: (conv, site) => ["Contact details received: " + snip(conv.contact, 60), page("A customer left their details", ["Contact: <b>" + snip(conv.contact, 80) + "</b>", "About: “" + snip(userMsgs(conv)[0], 160) + "”"], site, "Open your inbox", site + "/?inbox=1")],
  followup: (conv, site) => ["A customer replied to you", page("New message from a customer", ["“" + snip(userMsgs(conv).slice(-1)[0], 200) + "”"], site, "Open your inbox", site + "/?inbox=1")],
  ownerReply: (biz, reply) => ["A reply from " + String(biz).slice(0, 60), page("A reply from " + biz, [snip(reply, 1000).replace(/\n/g, "<br>"), "You can reply to this email to answer directly."], "")]
};
module.exports = { send, T };
