import { describe, expect, it } from "vitest";
import { resolveGapClass, resolveGridClass } from "./ResponsiveLayout";

describe("responsive layout class resolution", () => {
  it("maps supported spacing values to explicit Tailwind classes", () => {
    expect(resolveGapClass("0")).toBe("gap-0");
    expect(resolveGapClass("6")).toBe("gap-6");
    expect(resolveGapClass("12")).toBe("gap-12");
  });

  it("uses the stable default spacing class for unsupported values", () => {
    expect(resolveGapClass("7")).toBe("gap-4");
    expect(resolveGapClass("px-4")).toBe("gap-4");
  });

  it("maps supported column counts and falls back to a safe single column", () => {
    expect(resolveGridClass(1)).toBe("grid-cols-1");
    expect(resolveGridClass(4)).toBe("grid-cols-4");
    expect(resolveGridClass(6)).toBe("grid-cols-6");
    expect(resolveGridClass(0)).toBe("grid-cols-1");
    expect(resolveGridClass(9)).toBe("grid-cols-1");
  });
});
