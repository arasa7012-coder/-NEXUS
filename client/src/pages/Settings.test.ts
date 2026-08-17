import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: vi.fn() }),
}));
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({
    language: "en",
    setLanguage: vi.fn(),
    t: (key: string) => ({ language: "Language", languageEnglish: "English", languageArabic: "Arabic" }[key] ?? key),
  }),
}));
vi.mock("@/contexts/WorkspaceDensityContext", () => ({
  useWorkspaceDensity: () => ({ density: "comfortable", setDensity: vi.fn() }),
}));

import Settings from "./Settings";

describe("Settings browser preference boundaries", () => {
  it("renders local persistence language and non-interactive unavailable services honestly", () => {
    const html = renderToStaticMarkup(createElement(Settings));

    expect(html).toContain("Save browser preferences");
    expect(html).toContain("Workspace density");
    expect(html).toContain("Unavailable: no API-key management service or credentials are connected.");
    expect(html).toContain("Unavailable: no network-policy service is connected.");
    expect(html).not.toContain("Save workspace preview");
    expect(html).not.toContain("<button type=\"button\" class=\"flex w-full items-center gap-3 px-4 py-4 text-left");
  });
});
