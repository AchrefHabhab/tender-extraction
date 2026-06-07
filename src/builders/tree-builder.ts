import { ProcurementMatchDeliverable } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { callLLM } from "../extractors/llm-client.js";
import { ConsolidatedRequirement } from "./consolidator.js";

const CLASSIFICATION_SYSTEM_PROMPT = `You are a procurement document classifier. Given a list of requirements from a tender, organize them into a 2-level category structure.

Level 1: Broad categories (e.g., Project Management, Software Development, Hardware, Operations, Construction, etc.)
Level 2: Sub-categories within each Level 1 (e.g., under Software Development: Backend, Frontend, QA)

Rules:
- Derive categories from the actual content — do not invent categories not supported by the requirements
- Go shallow where the tender is simple, deeper where it is rich
- Each requirement must belong to exactly one Level 2 group

Return JSON:
{
  "categories": [
    {
      "level1": "category name",
      "level2": [
        {
          "name": "sub-category name",
          "requirementIndices": [0, 1, 2]
        }
      ]
    }
  ]
}

Respond with valid JSON only.`;

interface Classification {
  level1: string;
  level2: Array<{ name: string; requirementIndices: number[] }>;
}

export async function buildTree(
  requirements: ConsolidatedRequirement[]
): Promise<ProcurementMatchDeliverable[]> {
  if (requirements.length === 0) return [];

  logger.info(`Building tree from ${requirements.length} consolidated requirements`);

  const classifications = await classifyRequirements(requirements);
  return constructTree(classifications, requirements);
}

async function classifyRequirements(
  requirements: ConsolidatedRequirement[]
): Promise<Classification[]> {
  const summaries = requirements.map(
    (r, i) => `[${i}] [${r.priority}] ${r.bulletPoint}: ${r.description.substring(0, 100)}`
  );

  const batches = createBatches(summaries, 50);
  const allClassifications: Classification[] = [];

  for (let i = 0; i < batches.length; i++) {
    logger.info(`Classifying batch ${i + 1}/${batches.length}`);
    const userPrompt = `Classify these requirements:\n\n${batches[i].join("\n")}`;
    const response = await callLLM(CLASSIFICATION_SYSTEM_PROMPT, userPrompt);
    const parsed = parseClassification(response);
    allClassifications.push(...parsed);
  }

  return mergeClassifications(allClassifications);
}

function constructTree(
  classifications: Classification[],
  requirements: ConsolidatedRequirement[]
): ProcurementMatchDeliverable[] {
  return classifications.map((cat) => ({
    bulletPoint: cat.level1,
    description: { en: cat.level1 },
    priority: "must" as const,
    confidence: null,
    equivalenceAllowed: null,
    fullfillable: null,
    status: "waitingForAnalysis" as const,
    aiReasoning: null,
    feedback: null,
    feedbackText: null,
    openQuestionId: null,
    deliverableArray: cat.level2.map((sub) => buildLevel2(sub, requirements)),
    procurementDocumentChunkIdArray: [],
    workspaceDocumentChunkIdArray: [],
    citedProductIdArray: [],
    citedPersonIdArray: [],
  }));
}

function buildLevel2(
  sub: { name: string; requirementIndices: number[] },
  requirements: ConsolidatedRequirement[]
): ProcurementMatchDeliverable {
  const leaves = sub.requirementIndices
    .filter((idx) => idx >= 0 && idx < requirements.length)
    .map((idx) => buildLeaf(requirements[idx]));

  return {
    bulletPoint: sub.name,
    description: { en: sub.name },
    priority: "must" as const,
    confidence: null,
    equivalenceAllowed: null,
    fullfillable: null,
    status: "waitingForAnalysis" as const,
    aiReasoning: null,
    feedback: null,
    feedbackText: null,
    openQuestionId: null,
    deliverableArray: leaves,
    procurementDocumentChunkIdArray: [],
    workspaceDocumentChunkIdArray: [],
    citedProductIdArray: [],
    citedPersonIdArray: [],
  };
}

function buildLeaf(req: ConsolidatedRequirement): ProcurementMatchDeliverable {
  return {
    bulletPoint: req.bulletPoint,
    description: { en: req.description },
    priority: req.priority,
    confidence: req.confidence,
    equivalenceAllowed: req.equivalenceAllowed,
    fullfillable: null,
    status: "waitingForAnalysis" as const,
    aiReasoning: null,
    feedback: null,
    feedbackText: null,
    openQuestionId: null,
    deliverableArray: [],
    procurementDocumentChunkIdArray: req.sourceChunkIds,
    workspaceDocumentChunkIdArray: [],
    citedProductIdArray: [],
    citedPersonIdArray: [],
  };
}

function parseClassification(response: string): Classification[] {
  try {
    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as { categories: Classification[] };
    return parsed.categories ?? [];
  } catch {
    logger.warn("Failed to parse classification response");
    return [];
  }
}

function mergeClassifications(batches: Classification[]): Classification[] {
  const map = new Map<string, Classification>();

  for (const cat of batches) {
    const existing = map.get(cat.level1);
    if (existing) {
      existing.level2.push(...cat.level2);
    } else {
      map.set(cat.level1, { ...cat });
    }
  }

  return Array.from(map.values());
}

function createBatches<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
