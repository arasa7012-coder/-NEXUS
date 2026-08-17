# XAU/USD Market-Data Provider Research — Working Notes

## Sources reviewed

| Provider | Official source | Findings verified so far |
|---|---|---|
| Twelve Data | https://twelvedata.com/docs/introduction/overview | The documented `time_series` endpoint supports `1min`, `5min`, `15min`, `30min`, `45min`, `1h`, `2h`, `4h`, `8h`, `1day`, `1week`, and `1month`. Its reference catalog includes a commodities endpoint. Exact XAU/USD entitlement, bid/ask availability, delay, and plan limits still require verification. |
| Alpha Vantage | https://www.alphavantage.co/documentation/ | The documentation exposes Gold & Silver spot/history resources, FX daily/weekly/monthly, and marks FX intraday as premium. Its generic intraday documentation lists 1/5/15/30/60-minute intervals and realtime vs. delayed entitlement semantics. It is not yet verified that these endpoints provide a tradable XAU/USD quote with every requested field. |
| Metals-API | https://metals-api.com/documentation | Documentation lists real-time gold bid/ask, OHLC, historical rates, and daily time series. The public pricing page publishes annual plans from 2,500 API calls/month, but its listed time-series windows are daily date ranges, not verified intraday candle intervals for the requested chart. |

## Non-negotiable Nexus acceptance checks

The selected provider must be checked for an actual XAU/USD symbol, a permitted production/commercial use case, current quote freshness, historical OHLC coverage, documented interval support, rate-limit behavior, and truthful market-status derivation. The integration will never represent a delayed or end-of-day response as live, and it will not manufacture bid/ask, 24-hour metrics, candles, or closed-market values.

## Verified selection evidence

Twelve Data publishes an instrument page for **Gold Spot / US Dollar (XAU/USD)** under **COMMODITY**, with a displayed price, daily range, previous close, last-update field, historical-data entry point, and a statement that `time_series` API access begins with the Basic plan. Its public pricing lists Basic at no cost with 8 API credits per minute and 800 per day, but commodity market data is listed under the paid Grow plan and higher. Grow is shown at $79/month ($790/year), 377 API credits per minute, no daily limit, commodities market data, and 8 trial WebSocket credits. This gives the most complete verified match for the requested multi-timeframe chart, but the production-data licence and whether bid/ask is included must be confirmed in the selected subscription before an integration describes those fields as available.

## Real API probe — 2026-08-14

The configured server-side key authenticated real XAU/USD requests. The provider returned successful `quote` responses containing `close`, `previous_close`, `high`, `low`, `is_market_open`, an exchange classification of `Forex`, and an upstream timestamp. `time_series` returned five real candles for `1min`, `5min`, `15min`, `1h`, `4h`, `1day`, and `1month` in the combined probe. The `1week` request returned HTTP 429 with the provider's explicit message that the active key had used 10 API credits while its current per-minute limit was 8; this is a **rate-limit result**, not an unsupported-timeframe result. A targeted weekly retry remains required after the rate window clears.

The observed `quote.timestamp` translated to 2026-08-13T21:00:00Z while the probe ran on 2026-08-14T19:12:41Z. Nexus must therefore classify this response as **DELAYED**, not LIVE, until a more recent verified source timestamp satisfies a defined freshness threshold. The response did not establish bid/ask fields, so the interface must label bid/ask **DATA UNAVAILABLE** unless a future response actually supplies them.

## Commercial-display conclusion

Twelve Data's terms prohibit redistributing, reselling, sublicensing, or transferring data except as expressly permitted by the subscription tier, data add-ons, or a separate agreement. They state that certain tiers/add-ons may permit limited redistribution or external display under additional terms and direct customers to sales for details. The current key's entitlement does not by itself establish public-display or commercial redistribution rights. The integration can be built and can truthfully present a licensed-user/testing state, but it must be treated as **not production-ready for public commercial display** until the account holder confirms the appropriate licence with Twelve Data.
