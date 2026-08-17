import { describe, expect, it } from "vitest";
import { shouldReportExchangeFailure } from "./binanceApi";

describe("Binance regional fallback diagnostics", () => {
  it("suppresses the expected regional restriction that the unified adapter can fall back from", () => {
    const restriction = {
      isAxiosError: true,
      response: { status: 451, data: { msg: "Service unavailable from a restricted location" } },
    };

    expect(shouldReportExchangeFailure(restriction)).toBe(false);
  });

  it("retains diagnostics for unexpected exchange failures", () => {
    expect(shouldReportExchangeFailure(new Error("connection reset"))).toBe(true);
  });
});
