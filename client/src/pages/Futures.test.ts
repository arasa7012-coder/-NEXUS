import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/TerminalChart", () => ({
  default: () => createElement("div", { "data-testid": "reference-chart" }),
}));

import Futures from "./Futures";

describe("Futures reference-workspace boundaries", () => {
  it("keeps reference controls explicit about unavailable execution", () => {
    const html = renderToStaticMarkup(createElement(Futures));

    expect(html).toContain("no margin account, leverage service, or execution route is connected");
    expect(html).toContain("Margin unavailable");
    expect(html).toContain("Close unavailable");
    expect(html).toContain("Local preview only. This workspace cannot open, close, or manage a position.");
    expect(html).toContain('data-slot="nexus-binary-toggle"');
    expect(html).toContain('aria-label="Position side"');
  });
});
