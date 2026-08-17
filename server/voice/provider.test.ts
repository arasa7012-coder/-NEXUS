import { describe, expect, it } from "vitest";
import { buildNexusWelcomeText, getNexusVoiceProvider } from "./provider";

describe("Nexus premium voice readiness", () => {
  it("keeps voice explicitly unconfigured without generating or simulating audio", () => {
    const provider = getNexusVoiceProvider();
    expect(provider.isConfigured()).toBe(false);
    expect(provider.getReadiness()).toMatchObject({ configured: false, status: "NOT_CONFIGURED", provider: null });
  });
  it("builds only configurable welcome text for a future provider", () => {
    expect(buildNexusWelcomeText("Amina")).toBe("Welcome back, Amina. Welcome to Nexus.");
    expect(buildNexusWelcomeText(null)).toBe("Welcome back, Nexus user. Welcome to Nexus.");
  });
});
