import { describe, it, expect } from "vitest";
import { validateOutput } from "../src/validators/output-validator.js";

function makeValidLeaf(overrides = {}) {
  return {
    bulletPoint: "Test requirement",
    description: { en: "A valid requirement description" },
    priority: "must",
    confidence: "high",
    equivalenceAllowed: true,
    fullfillable: null,
    status: "waitingForAnalysis",
    aiReasoning: null,
    feedback: null,
    feedbackText: null,
    openQuestionId: null,
    deliverableArray: [],
    procurementDocumentChunkIdArray: ["chunk-1"],
    workspaceDocumentChunkIdArray: [],
    citedProductIdArray: [],
    citedPersonIdArray: [],
    ...overrides,
  };
}

function makeValidTree() {
  return [
    {
      ...makeValidLeaf({ bulletPoint: "Category 1" }),
      deliverableArray: [
        {
          ...makeValidLeaf({ bulletPoint: "Sub-category 1" }),
          deliverableArray: [makeValidLeaf()],
        },
      ],
    },
  ];
}

describe("validateOutput", () => {
  it("passes for a valid 3-level tree", () => {
    const result = validateOutput(makeValidTree());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails for empty bulletPoint", () => {
    const tree = makeValidTree();
    tree[0].deliverableArray[0].deliverableArray[0].bulletPoint = "";
    const result = validateOutput(tree);
    expect(result.valid).toBe(false);
  });

  it("fails for invalid priority value", () => {
    const tree = makeValidTree();
    (tree[0].deliverableArray[0].deliverableArray[0] as Record<string, unknown>).priority = "critical";
    const result = validateOutput(tree);
    expect(result.valid).toBe(false);
  });

  it("fails for missing description", () => {
    const tree = makeValidTree();
    (tree[0].deliverableArray[0].deliverableArray[0] as Record<string, unknown>).description = null;
    const result = validateOutput(tree);
    expect(result.valid).toBe(false);
  });

  it("fails for non-array input", () => {
    const result = validateOutput({ not: "an array" });
    expect(result.valid).toBe(false);
  });

  it("passes for empty array", () => {
    const result = validateOutput([]);
    expect(result.valid).toBe(true);
  });

  it("passes with German locale key", () => {
    const tree = [
      {
        ...makeValidLeaf({ bulletPoint: "Kategorie", description: { de: "Eine Beschreibung" } }),
        deliverableArray: [],
      },
    ];
    const result = validateOutput(tree);
    expect(result.valid).toBe(true);
  });

  it("fails for invalid status enum", () => {
    const tree = makeValidTree();
    (tree[0] as Record<string, unknown>).status = "invalid";
    const result = validateOutput(tree);
    expect(result.valid).toBe(false);
  });
});
