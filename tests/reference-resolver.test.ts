import { describe, it, expect } from "vitest";
import { resolveReferences } from "../src/extractors/reference-resolver.js";
import { RawRequirement } from "../src/extractors/requirement-extractor.js";
import { DocumentChunk } from "../src/types/index.js";

function makeChunk(id: string, text: string): DocumentChunk {
  return { id, text, pageNumber: 1, fileName: "test.pdf" };
}

function makeReq(description: string, sourceChunkIds: string[] = ["chunk-1"]): RawRequirement {
  return {
    bulletPoint: "Test requirement",
    description,
    priority: "must",
    equivalenceAllowed: null,
    confidence: "high",
    sourceChunkIds,
  };
}

describe("resolveReferences", () => {
  it("links 'see Annex A' to chunks containing annex A header", () => {
    const req = makeReq("Pump specs must comply with requirements, see Annex A for details");
    const chunks = [
      makeChunk("doc.pdf:page-1", "Main body text"),
      makeChunk("doc.pdf:page-5", "Annex A - Pump Specifications\nFlow rate: 500 L/min"),
    ];
    const result = resolveReferences([req], chunks);
    expect(result[0].sourceChunkIds).toContain("doc.pdf:page-5");
  });

  it("links German 'gemäß Anlage B' references", () => {
    const req = makeReq("Lieferung gemäß Anlage B der Ausschreibung");
    const chunks = [
      makeChunk("doc.pdf:page-1", "Haupttext"),
      makeChunk("doc.pdf:page-10", "Anlage B - Technische Spezifikationen"),
    ];
    const result = resolveReferences([req], chunks);
    expect(result[0].sourceChunkIds).toContain("doc.pdf:page-10");
  });

  it("links page number references to matching chunk IDs", () => {
    const req = makeReq("Details on page 5 of the specification");
    const chunks = [
      makeChunk("spec.pdf:page-3", "Some text"),
      makeChunk("spec.pdf:page-5", "Detailed specification content"),
    ];
    const result = resolveReferences([req], chunks);
    expect(result[0].sourceChunkIds).toContain("spec.pdf:page-5");
  });

  it("does not duplicate already-linked chunk IDs", () => {
    const req = makeReq("See Annex A", ["doc.pdf:page-5"]);
    const chunks = [
      makeChunk("doc.pdf:page-5", "Annex A - Content here"),
    ];
    const result = resolveReferences([req], chunks);
    expect(result[0].sourceChunkIds.filter((id) => id === "doc.pdf:page-5").length).toBe(1);
  });

  it("returns requirements unchanged when no references found", () => {
    const req = makeReq("Simple requirement with no references");
    const chunks = [makeChunk("doc.pdf:page-1", "Some text")];
    const result = resolveReferences([req], chunks);
    expect(result[0].sourceChunkIds).toEqual(["chunk-1"]);
  });

  it("handles multiple references in one description", () => {
    const req = makeReq("Per Annex A and see page 10 for installation requirements");
    const chunks = [
      makeChunk("doc.pdf:page-1", "Main text"),
      makeChunk("doc.pdf:page-3", "Annex A - Equipment List"),
      makeChunk("doc.pdf:page-10", "Installation procedure"),
    ];
    const result = resolveReferences([req], chunks);
    expect(result[0].sourceChunkIds).toContain("doc.pdf:page-3");
    expect(result[0].sourceChunkIds).toContain("doc.pdf:page-10");
  });
});
