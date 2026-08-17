import { describe, expect, it } from "vitest";
import { isMobileViewportWidth, MOBILE_BREAKPOINT } from "./useMobile";

describe("mobile viewport breakpoint", () => {
  it("uses the mobile drawer breakpoint before the first responsive render", () => {
    expect(isMobileViewportWidth(MOBILE_BREAKPOINT - 1)).toBe(true);
    expect(isMobileViewportWidth(MOBILE_BREAKPOINT)).toBe(false);
    expect(isMobileViewportWidth(1440)).toBe(false);
  });
});
