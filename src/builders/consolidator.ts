import { RawRequirement } from "../extractors/index.js";
import { logger, pMap } from "../utils/index.js";
import { callLLM } from "../extractors/llm-client.js";
import { CONSOLIDATION_SYSTEM_PROMPT, GLOBAL_DEDUP_SYSTEM_PROMPT } from "../prompts/index.js";
import { Priority, Confidence } from "../types/index.js";

const CONSOLIDATION_CONCURRENCY = 5;

export interface ConsolidatedRequirement {
  bulletPoint: string;
  description: string;
  priority: Priority;
  equivalenceAllowed: boolean | null;
  confidence: Confidence;
  sourceChunkIds: string[];
}

export async function consolidateRequirements(
  requirements: RawRequirement[]
): Promise<ConsolidatedRequirement[]> {
  if (requirements.length === 0) return [];

  if (requirements.length <= 5) {
    return requirements.map(toConsolidated);
  }

  const batches = createBatches(requirements, 30);

  const results = await pMap(
    batches,
    async (batch, i) => {
      logger.info(`Consolidating batch ${i + 1}/${batches.length} (${batch.length} requirements)`);
      return consolidateBatch(batch);
    },
    CONSOLIDATION_CONCURRENCY
  );

  const consolidated = results.flat();

  logger.info(`Batch consolidation: ${requirements.length} → ${consolidated.length} requirements`);

  const deduped = await globalDedup(consolidated);
  logger.info(`Global dedup: ${consolidated.length} → ${deduped.length} requirements`);
  return deduped;
}

async function consolidateBatch(batch: RawRequirement[]): Promise<ConsolidatedRequirement[]> {
  const summaries = batch.map(
    (r, i) => `[${i}] ${r.bulletPoint}: ${r.description.substring(0, 150)}`
  );

  const userPrompt = `Group these requirements by sameness. Return [[indices], [indices], ...]

${summaries.join("\n")}`;

  const response = await callLLM(CONSOLIDATION_SYSTEM_PROMPT, userPrompt);
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

function getHighestPriority(priorities: Priority[]): Priority {
  if (priorities.includes(Priority.Must)) return Priority.Must;
  if (priorities.includes(Priority.Should)) return Priority.Should;
  return Priority.Optional;
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

async function globalDedup(
  requirements: ConsolidatedRequirement[]
): Promise<ConsolidatedRequirement[]> {
  if (requirements.length <= 50) return requirements;

  const clusters = findSimilarClusters(requirements);
  if (clusters.length === 0) return requirements;

  logger.info(`Found ${clusters.length} potential duplicate clusters to verify`);

  const toRemove = new Set<number>();

  for (const cluster of clusters) {
    const anchor = requirements[cluster[0]];
    const candidates = cluster.slice(1);

    const userPrompt = `Anchor requirement:\n[A] ${anchor.bulletPoint}: ${anchor.description.substring(0, 200)}\n\nCandidate requirements:\n${candidates.map((idx, i) => `[${i}] ${requirements[idx].bulletPoint}: ${requirements[idx].description.substring(0, 200)}`).join("\n")}\n\nWhich candidates are duplicates of the anchor? Return their indices.`;

    const response = await callLLM(GLOBAL_DEDUP_SYSTEM_PROMPT, userPrompt);
    const duplicateIndices = parseDuplicateIndices(response, candidates.length);

    for (const di of duplicateIndices) {
      const realIdx = candidates[di];
      const dup = requirements[realIdx];
      anchor.sourceChunkIds = [...new Set([...anchor.sourceChunkIds, ...dup.sourceChunkIds])];
      anchor.description = anchor.description.length >= dup.description.length
        ? anchor.description
        : dup.description;
      toRemove.add(realIdx);
    }
  }

  return requirements.filter((_, i) => !toRemove.has(i));
}

function findSimilarClusters(requirements: ConsolidatedRequirement[]): number[][] {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = new Map<string, number[]>();

  for (let i = 0; i < requirements.length; i++) {
    const key = normalize(requirements[i].bulletPoint);
    const existing = map.get(key);
    if (existing) {
      existing.push(i);
    } else {
      map.set(key, [i]);
    }
  }

  return Array.from(map.values()).filter((group) => group.length > 1);
}

function parseDuplicateIndices(response: string, max: number): number[] {
  try {
    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as number[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n) => typeof n === "number" && n >= 0 && n < max);
  } catch {
    return [];
  }
}

function createBatches<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
