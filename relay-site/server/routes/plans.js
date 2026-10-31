// Public: the pricing page reads this, so prices on the site always match what checkout charges.
const { PLANS } = require("../../lib/plans");
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  const plans = Object.entries(PLANS).filter(([, p]) => p.price).map(([id, p]) => ({
    id, name: p.name, price: p.price, conv: p.conv, pop: !!p.pop, tag: p.tag, support: p.support, onboarding: !!p.onboarding,
    items: [p.conv.toLocaleString("en-US") + " conversations per month"].concat(p.items)
  }));
  res.status(200).json({ currency: process.env.CURRENCY || "USD", plans });
};
