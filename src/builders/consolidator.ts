import { RawRequirement } from "../extractors/index.js";
import { logger } from "../utils/logger.js";
import { callLLM } from "../extractors/llm-client.js";

export interface ConsolidatedRequirement {
  bulletPoint: string;
  description: string;
  priority: "must" | "should" | "optional";
  equivalenceAllowed: boolean | null;
  confidence: "high" | "medium" | "low";
  sourceChunkIds: string[];
}

const SIMILARITY_SYSTEM_PROMPT = `You are a procurement requirement deduplication engine. Given a list of requirements extracted from a tender document, group the ones that describe the SAME requirement (even if worded differently or found on different pages).

Rules:
- Two requirements are the same if they refer to the same obligation, deliverable, or specification
- Different pages describing the same item = same requirement
- A main description and its technical spec = same requirement
- Different items that happen to be similar but are separate obligations = NOT the same

Return a JSON array of groups. Each group contains the indices (0-based) of requirements that belong together.
Respond with valid JSON only.`;

export async function consolidateRequirements(
  requirements: RawRequirement[]
): Promise<ConsolidatedRequirement[]> {
  if (requirements.length === 0) return [];

  if (requirements.length <= 5) {
    return requirements.map(toConsolidated);
  }

  const batches = createBatches(requirements, 30);
  const consolidated: ConsolidatedRequirement[] = [];

  for (let i = 0; i < batches.length; i++) {
    logger.info(`Consolidating batch ${i + 1}/${batches.length} (${batches[i].length} requirements)`);
    const merged = await consolidateBatch(batches[i]);
    consolidated.push(...merged);
  }

  logger.info(`Consolidation: ${requirements.length} → ${consolidated.length} requirements`);
  return consolidated;
}

async function consolidateBatch(batch: RawRequirement[]): Promise<ConsolidatedRequirement[]> {
  const summaries = batch.map(
    (r, i) => `[${i}] ${r.bulletPoint}: ${r.description.substring(0, 150)}`
  );

  const userPrompt = `Group these requirements by sameness. Return [[indices], [indices], ...]

${summaries.join("\n")}`;

  const response = await callLLM(SIMILARITY_SYSTEM_PROMPT, userPrompt);
  const groups = parseGroups(response, batch.length);

  return groups.map((group) => mergeGroup(group.map((idx) => batch[idx])));
}

function parseGroups(response: string, total: number): number[][] {
  try {
    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as number[][];

    if (!Array.isArray(parsed)) {
      return Array.from({ length: total }, (_, i) => [i]);
    }

    const seen = new Set<number>();
    const validGroups: number[][] = [];

    for (const group of parsed) {
      if (!Array.isArray(group)) continue;
      const valid = group.filter((n) => typeof n === "number" && n >= 0 && n < total && !seen.has(n));
      valid.forEach((n) => seen.add(n));
      if (valid.length > 0) validGroups.push(valid);
    }

    for (let i = 0; i < total; i++) {
      if (!seen.has(i)) validGroups.push([i]);
    }

    return validGroups;
  } catch {
    return Array.from({ length: total }, (_, i) => [i]);
  }
}

function mergeGroup(group: RawRequirement[]): ConsolidatedRequirement {
  const primary = group[0];
  const allChunkIds = group.flatMap((r) => r.sourceChunkIds);
  const uniqueChunkIds = [...new Set(allChunkIds)];

  const highestPriority = getHighestPriority(group.map((r) => r.priority));

  return {
    bulletPoint: primary.bulletPoint,
    description: group.map((r) => r.description).join(" | "),
    priority: highestPriority,
    equivalenceAllowed: primary.equivalenceAllowed,
    confidence: primary.confidence,
    sourceChunkIds: uniqueChunkIds,
  };
}

function getHighestPriority(priorities: Array<"must" | "should" | "optional">): "must" | "should" | "optional" {
  if (priorities.includes("must")) return "must";
  if (priorities.includes("should")) return "should";
  return "optional";
}

function toConsolidated(req: RawRequirement): ConsolidatedRequirement {
  return {
    bulletPoint: req.bulletPoint,
    description: req.description,
    priority: req.priority,
    equivalenceAllowed: req.equivalenceAllowed,
    confidence: req.confidence,
    sourceChunkIds: req.sourceChunkIds,
  };
}

function createBatches<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
