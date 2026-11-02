// A LITTLE MUSIC — configuration
// Edit these values to change app behaviour. No code changes needed.

const ALM_CONFIG = {
  // App name — working title, not a cleared brand name
  appName: "A Little Music",

  // Access control for the beta:
  //   true  = everything unlocked (current beta state)
  //   false = free tier shows today + the previous FREE_WINDOW_DAYS days;
  //           older archive entries show a subscription prompt.
  betaUnlocked: true,

  // Free tier: today + the previous 3 days
  freeWindowDays: 3,

  // Placeholder pricing hypotheses — not wired to any payment provider yet.
  pricingHypotheses: [
    { plan: "Monthly", price: "$3.99/month" },
    { plan: "Annual", price: "$29/year" },
  ],

  // Where the catalogue lives. Add new content by editing this file
  // (or dropping a batch into content/ and running tools/merge.js).
  catalogueUrl: "data/catalogue.json",
};
