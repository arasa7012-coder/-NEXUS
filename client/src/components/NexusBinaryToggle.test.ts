import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getNextBinaryToggleValue, NexusBinaryToggle } from "./NexusBinaryToggle";

describe("NexusBinaryToggle", () => {
  const options = [{ value: "buy", label: "Buy", tone: "success" as const }, { value: "sell", label: "Sell", tone: "danger" as const }] as const;

  it("renders an active marker, semantic buttons, and a disabled state using Nexus tokens", () => {
    const active = renderToStaticMarkup(createElement(NexusBinaryToggle, { value: "sell", onValueChange: vi.fn(), options, ariaLabel: "Order side" }));
    const disabled = renderToStaticMarkup(createElement(NexusBinaryToggle, { value: "buy", onValueChange: vi.fn(), options, ariaLabel: "Order side", disabled: true }));

    expect(active).toContain('data-slot="nexus-binary-toggle"');
    expect(active).toContain('aria-pressed="true"');
    expect(active).toContain('transform:translateX(100%)');
    expect(disabled).toContain('data-disabled="true"');
    expect(disabled).toContain("disabled=\"\"");
  });

  it("moves keyboard selection in visual order for LTR and RTL", () => {
    expect(getNextBinaryToggleValue(["buy", "sell"], "buy", "ArrowRight", "ltr")).toBe("sell");
    expect(getNextBinaryToggleValue(["buy", "sell"], "buy", "ArrowRight", "rtl")).toBe("sell");
    expect(getNextBinaryToggleValue(["buy", "sell"], "sell", "ArrowRight", "rtl")).toBe("buy");
    expect(getNextBinaryToggleValue(["buy", "sell"], "sell", "Home", "rtl")).toBe("buy");
  });

  it("reverses the marker translation for RTL", () => {
    const html = renderToStaticMarkup(createElement(NexusBinaryToggle, { value: "sell", onValueChange: vi.fn(), options, ariaLabel: "Order side", direction: "rtl" }));
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('transform:translateX(-100%)');
  });
});
