import { describe, it, expect } from "vitest";
import { detectLocale } from "../src/utils/locale-detector.js";

describe("detectLocale", () => {
  it("detects German from German text", () => {
    const texts = [
      "Die Lieferung der Fahrradgaragen muss gemäß den technischen Spezifikationen erfolgen",
      "Der Auftragnehmer ist für die Montage und Installation verantwortlich",
      "Alle Materialien müssen den DIN-Normen entsprechen",
    ];
    expect(detectLocale(texts)).toBe("de");
  });

  it("detects English from English text", () => {
    const texts = [
      "The contractor shall deliver all equipment as specified in the requirements",
      "All materials must comply with British Standards and be certified",
      "Installation should be completed within the agreed timeline",
    ];
    expect(detectLocale(texts)).toBe("en");
  });

  it("defaults to English for mixed/ambiguous content", () => {
    const texts = ["ISO 9001 certification required"];
    expect(detectLocale(texts)).toBe("en");
  });

  it("handles empty input gracefully", () => {
    expect(detectLocale([])).toBe("en");
  });
});
