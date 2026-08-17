import { describe, expect, it } from "vitest";
import { chartViewportSignature, shouldEmitChartViewport } from "./chartViewport";

describe("chart viewport emission", () => {
  const viewport = { startTime: 1_700_000_000_000, endTime: 1_700_003_600_000, visibleCandles: 24 };

  it("creates a stable signature for an unchanged viewport", () => {
    expect(chartViewportSignature(viewport)).toBe("1700000000000:1700003600000:24");
    expect(shouldEmitChartViewport(chartViewportSignature(viewport), { ...viewport })).toBe(false);
  });

  it("requires an emission when the visible range actually changes", () => {
    expect(shouldEmitChartViewport(chartViewportSignature(viewport), { ...viewport, endTime: viewport.endTime + 60_000 })).toBe(true);
  });
});
