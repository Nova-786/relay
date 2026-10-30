// Retrieval with query expansion: plain keyword search first, then (only when it finds little) ask a small model for synonyms.
const { topChunks } = require("./kb");
async function expand(q) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.EXPAND_MODEL || "claude-haiku-5-5", max_tokens: 60,
        system: "Reply with up to 12 comma-separated keywords and synonyms that a business's documents might use for this customer question. Reply with nothing else.",
        messages: [{ role: "user", content: String(q).slice(0, 400) }] }) });
    const d = await r.json();
    return r.ok ? (d.content || []).map(c => c.text || "").join(" ") : "";
  } catch (e) { return ""; }
}
exports.retrieve = async (docs, text) => {
  let c = topChunks(docs, text, 5);
  const big = docs.reduce((n, d) => n + d.text.length, 0) >= 3000;
  if (big && (!c.length || c[0].cov < 0.5)) { const x = await expand(text); if (x) c = topChunks(docs, text + " " + x, 5); }
  return c;
};
