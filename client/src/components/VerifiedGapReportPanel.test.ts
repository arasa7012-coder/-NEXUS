import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import VerifiedGapReportPanel from "./VerifiedGapReportPanel";
describe("VerifiedGapReportPanel", () => { it("does not classify an empty verified-gap set as a provider boundary or temporary failure", () => { const html = renderToStaticMarkup(createElement(VerifiedGapReportPanel, { report: { provider: "coinbase", assetSymbol: "BTC", timeframe: "1h", requestedRangeStart: 1, requestedRangeEnd: 2, verifiedRangeStart: 1, verifiedRangeEnd: 2, expectedIntervalMs: 3_600_000, validationStatus: "NO_VERIFIED_GAPS", gaps: [] } })); expect(html).toContain("No verified chronology gaps"); expect(html).toContain("JSON"); expect(html).toContain("CSV"); }); });
