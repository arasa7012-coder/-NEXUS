import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TerminalChart from "./TerminalChart";

describe("TerminalChart reference controls", () => {
  it("renders an operational expand control and an explicit indicator-unavailable boundary", () => {
    const html = renderToStaticMarkup(createElement(TerminalChart, {
      symbol: "BTC / USDT Perpetual",
      price: "$45,230.50",
      change: "+2.45%",
      variant: "futures",
    }));

    expect(html).toContain('aria-label="Expand chart preview"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Indicators unavailable");
    expect(html).toContain("Reference market visualization");
  });
});
