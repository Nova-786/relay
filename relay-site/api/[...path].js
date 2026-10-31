// One serverless function that serves every /api/* address. Vercel's free plan allows at most 12 functions,
// and Relay has 18 endpoints, so they all live in server/routes and are dispatched from here.
const routes = {
  account: require("../server/routes/account"),
  admin: require("../server/routes/admin"),
  agent: require("../server/routes/agent"),
  "agent-chat": require("../server/routes/agent-chat"),
  billing: require("../server/routes/billing"),
  chat: require("../server/routes/chat"),
  checkout: require("../server/routes/checkout"),
  claim: require("../server/routes/claim"),
  crawl: require("../server/routes/crawl"),
  cron: require("../server/routes/cron"),
  health: require("../server/routes/health"),
  inbox: require("../server/routes/inbox"),
  knowledge: require("../server/routes/knowledge"),
  login: require("../server/routes/login"),
  memory: require("../server/routes/memory"),
  plans: require("../server/routes/plans"),
  stats: require("../server/routes/stats"),
  trial: require("../server/routes/trial")
};
module.exports = (req, res) => {
  const name = new URL(req.url, "http://x").pathname.split("/").filter(Boolean)[1];
  const h = Object.prototype.hasOwnProperty.call(routes, name) ? routes[name] : null;
  if (!h) return res.status(404).json({ error: "Not found" });
  return h(req, res);
};
