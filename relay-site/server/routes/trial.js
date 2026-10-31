// Free trials without a card are no longer offered. Trials start from the Pricing page (card required, billed after 14 days).
module.exports = (req, res) => res.status(410).json({ error: "Free trials now start from the Pricing page. A card is required, and you aren’t charged for 14 days." });
