import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CandlestickChart, { type CandleData } from "./CandlestickChart";

const candles: CandleData[] = [
  { timestamp: 1_725_000_000_000, open: 100, high: 108, low: 96, close: 105, volume: 12 },
  { timestamp: 1_725_003_600_000, open: 105, high: 109, low: 101, close: 102, volume: 20 },
  { timestamp: 1_725_007_200_000, open: 102, high: 113, low: 100, close: 111, volume: 18 },
];
describe("Nexus CandlestickChart", () => {
  it("renders supplied OHLCV evidence, indicator controls, selected-candle evidence, annotations, and accessible controls", () => { const html = renderToStaticMarkup(createElement(CandlestickChart, { data: candles, symbol: "BTC / USD", interval: "1h", sourceLabel: "Coinbase", annotations: [{ id: "stop", price: 99, label: "STOP", tone: "risk" }] })); expect(html).toContain("Candlestick workspace"); expect(html).toContain("Coinbase"); expect(html).toContain("O 102"); expect(html).toContain("STOP 99"); expect(html).toContain("Zoom in"); expect(html).toContain("3/3 loaded candles"); expect(html).toContain("SMA"); expect(html).toContain("ATR"); expect(html).toContain("Selected candle evidence"); expect(html).toContain("Upper wick"); });
  it("withholds a visual price series for absent or invalid OHLCV instead of repairing it", () => { expect(renderToStaticMarkup(createElement(CandlestickChart, { data: [] }))).toContain("No verified OHLCV data is available"); const invalid = [{ ...candles[0] }, { ...candles[1], timestamp: candles[0].timestamp }]; const html = renderToStaticMarkup(createElement(CandlestickChart, { data: invalid })); expect(html).toContain("invalid or out of chronological order"); expect(html).not.toContain("validated candles"); });
  it("exposes independently requested adjacent live-page controls without inventing an adjacent candle", () => { const html = renderToStaticMarkup(createElement(CandlestickChart, { data: candles, hasMoreOlder: true, hasMoreNewer: true })); expect(html).toContain("Load older candles"); expect(html).toContain("Load newer candles"); });
});
