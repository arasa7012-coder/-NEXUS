import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "ar" }),
}));
vi.mock("@/contexts/WorkspaceDensityContext", () => ({
  useWorkspaceDensity: () => ({ density: "comfortable", setDensity: vi.fn() }),
}));

import { NexusDensityControl } from "./NexusDensityControl";

describe("NexusDensityControl", () => {
  it("renders three accessible RTL density choices with the persisted selection", () => {
    const html = renderToStaticMarkup(createElement(NexusDensityControl));

    expect(html).toContain('role="radiogroup"');
    expect(html).toContain("كثافة اللوحة");
    expect(html).toContain("مدمج");
    expect(html).toContain("مريح");
    expect(html).toContain("واسع");
    expect(html).toContain('aria-checked="true"');
  });
});
