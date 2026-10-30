// SINGLE SOURCE OF TRUTH for plans. Change a price or limit here and the website, checkout, billing and emails all follow.
// The pricing page loads these from /api/plans, so it never drifts from what customers are actually charged.
const PLANS = {
  trial: { name: "Trial", conv: 300 },
  basic: {
    name: "Basic", conv: 1000, price: 20, support: "Email",
    tag: "For solo owners getting started with AI help.",
    items: ["Website chat bubble with inbox", "Knowledge from your documents", "Long-term memory", "All six assistant modes", "Insights dashboard", "Email support"]
  },
  standard: {
    name: "Standard", conv: 5000, price: 50, pop: true, support: "Priority email",
    tag: "For growing businesses with steady customer chats.",
    items: ["Everything in Basic", "Priority email support"]
  },
  premium: {
    name: "Premium", conv: 20000, price: 100, support: "Replies within 24 hours", onboarding: true,
    tag: "For busy businesses that need more volume and care.",
    items: ["Everything in Standard", "Replies within 24 hours", "Onboarding call"]
  }
};
module.exports = { PLANS };
