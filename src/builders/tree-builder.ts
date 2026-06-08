import { ProcurementMatchDeliverable } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { callLLM } from "../extractors/llm-client.js";
import { ConsolidatedRequirement } from "./consolidator.js";
import { CLASSIFICATION_SYSTEM_PROMPT } from "../prompts/index.js";
import { type LocaleKey, toLocaleObject, pMap } from "../utils/index.js";

const CLASSIFICATION_CONCURRENCY = 5;

interface Classification {
  level1: string;
  level2: Array<{ name: string; requirementIndices: number[] }>;
}

export async function buildTree(
  requirements: ConsolidatedRequirement[],
  locale: LocaleKey = "en"
): Promise<ProcurementMatchDeliverable[]> {
  if (requirements.length === 0) return [];

  logger.info(`Building tree from ${requirements.length} consolidated requirements`);

  const classifications = await classifyRequirements(requirements);
  return constructTree(classifications, requirements, locale);
}

async function classifyRequirements(
  requirements: ConsolidatedRequirement[]
): Promise<Classification[]> {
  const summaries = requirements.map(
    (r, i) => `[${i}] [${r.priority}] ${r.bulletPoint}: ${r.description.substring(0, 100)}`
  );

  const batches = createBatches(summaries, 50);

  const results = await pMap(
    batches,
    async (batch, i) => {
      logger.info(`Classifying batch ${i + 1}/${batches.length}`);
      const userPrompt = `Classify these requirements:\n\n${batch.join("\n")}`;
      const response = await callLLM(CLASSIFICATION_SYSTEM_PROMPT, userPrompt);
      return parseClassification(response);
    },
    CLASSIFICATION_CONCURRENCY
  );

  return mergeClassifications(results.flat());
}

function constructTree(
  classifications: Classification[],
  requirements: ConsolidatedRequirement[],
  locale: LocaleKey
): ProcurementMatchDeliverable[] {
  return classifications.map((cat) => ({
    bulletPoint: cat.level1,
    description: toLocaleObject(cat.level1, locale),
    priority: "must" as const,
    confidence: null,
    equivalenceAllowed: null,
    fullfillable: null,
    status: "waitingForAnalysis" as const,
    aiReasoning: null,
    feedback: null,
    feedbackText: null,
    openQuestionId: null,
    deliverableArray: cat.level2.map((sub) => buildLevel2(sub, requirements, locale)),
    procurementDocumentChunkIdArray: [],
    workspaceDocumentChunkIdArray: [],
    citedProductIdArray: [],
    citedPersonIdArray: [],
  }));
}

function buildLevel2(
  sub: { name: string; requirementIndices: number[] },
  requirements: ConsolidatedRequirement[],
  locale: LocaleKey
): ProcurementMatchDeliverable {
  const leaves = sub.requirementIndices
    .filter((idx) => idx >= 0 && idx < requirements.length)
    .map((idx) => buildLeaf(requirements[idx], locale));

  return {
    bulletPoint: sub.name,
    description: toLocaleObject(sub.name, locale),
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

function buildLeaf(req: ConsolidatedRequirement, locale: LocaleKey): ProcurementMatchDeliverable {
  return {
    bulletPoint: req.bulletPoint,
    description: toLocaleObject(req.description, locale),
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
