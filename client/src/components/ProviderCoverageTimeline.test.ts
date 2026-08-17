import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProviderCoverageTimeline from "./ProviderCoverageTimeline";

describe("ProviderCoverageTimeline", () => {
  it("labels verified source coverage, gaps, and confirmed boundaries without hiding a temporary failure", () => {
    const html = renderToStaticMarkup(createElement(ProviderCoverageTimeline, { source: "binance", earliest: 1_725_000_000_000, latest: 1_725_007_200_000, gaps: [{ afterSequence: 1, beforeSequence: 2, expectedOpenTime: 1_725_003_600_000, observedOpenTime: 1_725_007_200_000 }], earliestBoundary: true, latestBoundary: false, temporaryFailure: "upstream timeout", invalidRange: null }));
    expect(html).toContain("binance coverage timeline");
    expect(html).toContain("1 verified gap");
    expect(html).toContain("Earliest confirmed binance boundary");
    expect(html).toContain("Temporary provider request failure");
    expect(html).toContain("not a coverage boundary");
  });
});
