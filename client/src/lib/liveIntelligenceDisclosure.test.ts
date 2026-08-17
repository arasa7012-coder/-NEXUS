import { describe, expect, it } from "vitest";
import { LIVE_ANALYTICAL_DISCLOSURE } from "./liveIntelligenceDisclosure";

describe("live Intelligence disclosure", () => {
  it("states the probabilistic analytical boundary and forbids execution claims", () => {
    expect(LIVE_ANALYTICAL_DISCLOSURE).toMatch(/probabilistic/i);
    expect(LIVE_ANALYTICAL_DISCLOSURE).toMatch(/never a guaranteed forecast/i);
    expect(LIVE_ANALYTICAL_DISCLOSURE).toMatch(/recommendation, or execution instruction/i);
  });
});
