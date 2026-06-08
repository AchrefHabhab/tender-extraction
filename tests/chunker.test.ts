import { describe, it, expect } from "vitest";
import { chunkDocuments } from "../src/parsers/chunker.js";
import { DocumentChunk, ParsedDocument } from "../src/types/index.js";

function makeDoc(pages: string[], fileName = "test.pdf"): ParsedDocument {
  const chunks: DocumentChunk[] = pages.map((text, i) => ({
    id: `${fileName}:page-${i + 1}`,
    text,
    pageNumber: i + 1,
    fileName,
  }));
  return { fileName, totalPages: pages.length, chunks };
}

describe("chunkDocuments", () => {
  it("merges consecutive pages without section boundaries", () => {
    const doc = makeDoc([
      "This is a paragraph of moderate length text on page one.",
      "This continues the same topic on page two without a heading.",
    ]);
    const result = chunkDocuments([doc]);
    expect(result.length).toBe(1);
    expect(result[0].text).toContain("page one");
    expect(result[0].text).toContain("page two");
  });

  it("splits at section boundaries", () => {
    const doc = makeDoc([
      "1.1 Introduction to the project requirements and objectives for delivery. This section outlines all technical specifications needed for compliance.",
      "1.2 Scope of work including all deliverables as described below. The contractor must provide evidence of conformity to all listed standards.",
    ]);
    const result = chunkDocuments([doc]);
    expect(result.length).toBe(2);
  });

  it("splits when merged text would exceed maxChunkLength", () => {
    const longText = "A".repeat(3000);
    const doc = makeDoc([longText, longText]);
    const result = chunkDocuments([doc]);
    expect(result.length).toBe(2);
  });

  it("filters chunks below minChunkLength", () => {
    const doc = makeDoc(["Hi", "This is a real paragraph with enough text to pass the minimum length filter and be included."]);
    const result = chunkDocuments([doc]);
    expect(result.every((c) => c.text.length >= 100)).toBe(true);
  });

  it("filters noisy chunks (mostly prices/placeholders)", () => {
    const noiseText = Array(20).fill("EUR\n...\nA1").join("\n");
    const realText = "1.1 The contractor shall deliver all materials as specified in section 3 below including documentation and all required certificates of compliance.";
    const doc = makeDoc([noiseText, realText]);
    const result = chunkDocuments([doc]);
    expect(result.length).toBe(1);
    expect(result[0].text).toContain("contractor");
  });

  it("returns empty array for empty documents", () => {
    const result = chunkDocuments([]);
    expect(result).toEqual([]);
  });

  it("handles multiple documents", () => {
    const doc1 = makeDoc(["1.1 Requirements for doc one which is long enough to pass the minimum length filter check and be included in output results."], "a.pdf");
    const doc2 = makeDoc(["2.1 Requirements for doc two which is long enough to pass the minimum length filter check and be included in output results."], "b.pdf");
    const result = chunkDocuments([doc1, doc2]);
    expect(result.length).toBe(2);
    expect(result[0].fileName).toBe("a.pdf");
    expect(result[1].fileName).toBe("b.pdf");
  });
});
