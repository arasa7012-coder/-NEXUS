import { describe, expect, it } from "vitest";
import { languageMetadata, messages } from "./messages";

describe("Nexus language messages", () => {
  it("keeps every configured locale aligned with the canonical translation contract", () => {
    const canonical = Object.keys(messages.en).sort();
    expect(Object.keys(languageMetadata)).toHaveLength(18);
    Object.entries(messages).forEach(([language, table]) => {
      expect(Object.keys(table).sort(), `locale ${language}`).toEqual(canonical);
    });
  });

  it("preserves Arabic direction and core navigation translations", () => {
    expect(languageMetadata.ar.direction).toBe("rtl");
    expect(languageMetadata.en.direction).toBe("ltr");
    expect(messages.ar.chartWorkspace).toBe("مساحة الشموع");
    expect(messages.en.chartWorkspace).toBe("Candlestick workspace");
    expect(messages.ar.commandGroup).toBe("القيادة");
    expect(messages.de.commandGroup).toBe("Kommando");
    expect(messages["zh-CN"].markets).toBe("市场");
  });
});
