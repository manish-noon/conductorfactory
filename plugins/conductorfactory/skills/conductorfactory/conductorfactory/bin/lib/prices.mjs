// Prices tokens with the per-model rates in the factory config (`prices`, USD
// per million tokens). Cache writes are 1.25x input (5-minute) and 2x input (1-hour).

import { config } from "./config.mjs";

const RATES = config.prices;

// Returns the USD cost of one model's token totals, or null if the model is unknown.
export function priceTokens(model, t) {
  const r = RATES[model];
  if (!r) return null;
  const usd =
    t.input * r.input +
    t.output * r.output +
    t.cacheRead * r.cacheRead +
    t.cacheWrite5m * r.input * 1.25 +
    t.cacheWrite1h * r.input * 2;
  return usd / 1e6;
}
