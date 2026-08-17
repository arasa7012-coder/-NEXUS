import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ChartTimeRangeSelector from "./ChartTimeRangeSelector";
describe("ChartTimeRangeSelector", () => { it("renders documented presets and disables selection when no verified coverage is loaded", () => { const html = renderToStaticMarkup(createElement(ChartTimeRangeSelector, { earliest: null, latest: null, visibleCandles: 50, onSelect: vi.fn() })); expect(html).toContain("1D"); expect(html).toContain("1Y"); expect(html).toContain("No verified provider coverage is loaded"); expect(html).toContain("disabled"); }); });
