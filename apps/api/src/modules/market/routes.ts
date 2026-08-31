import { Hono } from "hono";
import { fetchRiskFreeRates } from "../../lib/risk-free-rates.js";

const market = new Hono();

// GET /api/market/risk-free-rates - Current yields for the reference
// instruments the optimizer offers as risk-free rate presets.
market.get("/risk-free-rates", async (c) => {
  const rates = await fetchRiskFreeRates();
  return c.json(rates);
});

export default market;
