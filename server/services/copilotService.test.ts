import { describe, expect, it } from "vitest";
import { formatGroundedModelResponse } from "./copilotService";

describe("formatGroundedModelResponse", () => {
  it("rejects a model response that cites evidence outside the supplied evidence package", () => {
    expect(() => formatGroundedModelResponse(JSON.stringify({ answer: "Unsupported", limitations: [], evidenceIds: ["outside.source"] }), ["market.overview"])).toThrow("evidence-reference validation");
  });
  it("keeps the required non-execution boundary with validated evidence references", () => {
    const text = formatGroundedModelResponse(JSON.stringify({ answer: "The evidence is mixed.", limitations: ["Data is limited."], evidenceIds: ["market.overview"] }), ["market.overview"]);
    expect(text).toContain("market.overview");
    expect(text).toContain("does not execute external trades");
  });
});
