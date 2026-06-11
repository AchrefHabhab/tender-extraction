import { ProcurementMatchDeliverable, Priority, DeliverableStatus } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { callLLM } from "../extractors/llm-client.js";
import { ConsolidatedRequirement } from "./consolidator.js";
import { CLASSIFICATION_SYSTEM_PROMPT, CATEGORY_DISCOVERY_SYSTEM_PROMPT } from "../prompts/index.js";
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
  const titles = requirements.map((r) => r.bulletPoint);

  const categories = await discoverCategories(titles);
  logger.info(`Discovered ${categories.length} Level 1 categories: ${categories.join(", ")}`);

  const summaries = requirements.map(
    (r, i) => `[${i}] [${r.priority}] ${r.bulletPoint}: ${r.description.substring(0, 100)}`
  );

  const batches = createBatches(summaries, 50);
  const categoryList = categories.map((c, i) => `${i + 1}. ${c}`).join("\n");

  const results = await pMap(
    batches,
    async (batch, i) => {
      logger.info(`Classifying batch ${i + 1}/${batches.length}`);
      const userPrompt = `Level 1 categories (use ONLY these):\n${categoryList}\n\nRequirements to classify:\n${batch.join("\n")}`;
      const response = await callLLM(CLASSIFICATION_SYSTEM_PROMPT, userPrompt);
      return parseClassification(response);
    },
    CLASSIFICATION_CONCURRENCY
  );

  return mergeClassifications(results.flat());
}

async function discoverCategories(titles: string[]): Promise<string[]> {
  const MAX_TITLES = 500;
  const sampled = titles.length <= MAX_TITLES
    ? titles
    : sampleEvenly(titles, MAX_TITLES);

  const titleList = sampled.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const userPrompt = `Derive Level 1 categories from these ${sampled.length} requirement titles (sampled from ${titles.length} total):\n\n${titleList}`;
  const response = await callLLM(CATEGORY_DISCOVERY_SYSTEM_PROMPT, userPrompt);

  try {
    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as { categories: string[] };
    if (Array.isArray(parsed.categories) && parsed.categories.length > 0) {
      return parsed.categories;
    }
  } catch {
    logger.warn("Failed to parse category discovery response, using fallback");
  }

  return ["General Requirements"];
}

function constructTree(
  classifications: Classification[],
  requirements: ConsolidatedRequirement[],
  locale: LocaleKey
): ProcurementMatchDeliverable[] {
  return classifications.map((cat) => ({
    bulletPoint: cat.level1,
    description: toLocaleObject(cat.level1, locale),
    priority: Priority.Must,
    confidence: null,
    equivalenceAllowed: null,
    fullfillable: null,
    status: DeliverableStatus.WaitingForAnalysis,
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
    priority: Priority.Must,
    confidence: null,
    equivalenceAllowed: null,
    fullfillable: null,
    status: DeliverableStatus.WaitingForAnalysis,
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
    status: DeliverableStatus.WaitingForAnalysis,
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
    const categories = parsed.categories ?? [];
    return categories.map((cat) => ({
      level1: cat.level1,
      level2: (cat.level2 ?? []).filter(
        (sub) => sub.name && Array.isArray(sub.requirementIndices)
      ),
    })).filter((cat) => cat.level2.length > 0);
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

function sampleEvenly<T>(items: T[], count: number): T[] {
  const step = items.length / count;
  const result: T[] = [];
  for (let i = 0; i < count; i++) {
    result.push(items[Math.floor(i * step)]);
  }
  return result;
}
