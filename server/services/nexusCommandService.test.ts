import { describe, expect, it } from "vitest";
import { monitoringFreshness } from "./nexusCommandService";

describe("managed monitoring health freshness", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");
  it("uses only the stored observation timestamp and never invents availability", () => {
    expect(monitoringFreshness(new Date("2026-08-13T11:55:00.000Z"), now)).toBe("FRESH");
    expect(monitoringFreshness(new Date("2026-08-13T11:49:59.999Z"), now)).toBe("STALE");
    expect(monitoringFreshness(null, now)).toBe("UNKNOWN");
  });
});
