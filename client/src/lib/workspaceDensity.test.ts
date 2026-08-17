import { describe, expect, it } from "vitest";
import { defaultWorkspaceDensity, isWorkspaceDensity, normalizeWorkspaceDensity } from "./workspaceDensity";

describe("workspace density contract", () => {
  it("accepts only the three supported density values", () => {
    expect(isWorkspaceDensity("compact")).toBe(true);
    expect(isWorkspaceDensity("comfortable")).toBe(true);
    expect(isWorkspaceDensity("spacious")).toBe(true);
    expect(isWorkspaceDensity("dense")).toBe(false);
  });

  it("uses a comfortable default for malformed persisted values", () => {
    expect(normalizeWorkspaceDensity("unexpected")).toBe(defaultWorkspaceDensity);
    expect(normalizeWorkspaceDensity(null)).toBe(defaultWorkspaceDensity);
  });
});
