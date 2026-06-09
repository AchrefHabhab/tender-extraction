import { ConsolidatedRequirement } from "./consolidator.js";
import { logger, pMap } from "../utils/index.js";
import { callLLM } from "../extractors/llm-client.js";
import { Priority } from "../types/index.js";

const LINKING_CONCURRENCY = 5;
const JACCARD_THRESHOLD = 0.3;
const MAX_CANDIDATES_PER_REQ = 5;

interface LinkPrompt {
  anchorIdx: number;
  candidateIndices: number[];
}

export async function linkRelatedRequirements(
  requirements: ConsolidatedRequirement[]
): Promise<ConsolidatedRequirement[]> {
  if (requirements.length <= 10) return requirements;

  const candidates = findLinkCandidates(requirements);
  if (candidates.length === 0) {
    logger.info("Linker: no cross-chunk candidates found");
    return requirements;
  }

  logger.info(`Linker: ${candidates.length} potential link groups to verify`);

  const toMergeInto = new Map<number, number>();

  const results = await pMap(
    candidates,
    async (candidate) => verifyLink(requirements, candidate),
    LINKING_CONCURRENCY
  );

  for (const result of results) {
    for (const targetIdx of result.confirmed) {
      if (!toMergeInto.has(targetIdx)) {
        toMergeInto.set(targetIdx, result.anchorIdx);
      }
    }
  }

  if (toMergeInto.size === 0) {
    logger.info("Linker: no links confirmed by LLM");
    return requirements;
  }

  const merged = [...requirements];
  const removed = new Set<number>();

  for (const [targetIdx, anchorIdx] of toMergeInto) {
    const anchor = merged[anchorIdx];
    const target = merged[targetIdx];
    anchor.sourceChunkIds = [...new Set([...anchor.sourceChunkIds, ...target.sourceChunkIds])];
    anchor.description = anchor.description.length >= target.description.length
      ? anchor.description
      : `${anchor.description} | ${target.description}`;
    anchor.priority = getHighestPriority([anchor.priority, target.priority]);
    removed.add(targetIdx);
  }

  const result = merged.filter((_, i) => !removed.has(i));
  logger.info(`Linker: merged ${toMergeInto.size} requirements (${requirements.length} → ${result.length})`);
  return result;
}

function findLinkCandidates(requirements: ConsolidatedRequirement[]): LinkPrompt[] {
  const tokens = requirements.map((r) => tokenize(r.bulletPoint + " " + r.description));
  const prompts: LinkPrompt[] = [];

  for (let i = 0; i < requirements.length; i++) {
    const candidates: { idx: number; score: number }[] = [];

    for (let j = i + 1; j < requirements.length; j++) {
      if (shareChunks(requirements[i], requirements[j])) continue;

      const score = jaccardSimilarity(tokens[i], tokens[j]);
      if (score >= JACCARD_THRESHOLD) {
        candidates.push({ idx: j, score });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      prompts.push({
        anchorIdx: i,
        candidateIndices: candidates.slice(0, MAX_CANDIDATES_PER_REQ).map((c) => c.idx),
      });
    }
  }

  return prompts;
}

async function verifyLink(
  requirements: ConsolidatedRequirement[],
  prompt: LinkPrompt
): Promise<{ anchorIdx: number; confirmed: number[] }> {
  const anchor = requirements[prompt.anchorIdx];
  const candidateLines = prompt.candidateIndices.map(
    (idx, i) => `[${i}] ${requirements[idx].bulletPoint}: ${requirements[idx].description.substring(0, 150)}`
  );

  const systemPrompt = `You identify whether requirements describe the SAME deliverable from different parts of a document. Two requirements are "same deliverable" if they describe different aspects (spec, installation, testing) of one physical item or service. Return JSON array of indices that are the same deliverable as the anchor. Return [] if none match.`;

  const userPrompt = `Anchor:\n${anchor.bulletPoint}: ${anchor.description.substring(0, 150)}\nSource: ${anchor.sourceChunkIds.join(", ")}\n\nCandidates:\n${candidateLines.join("\n")}`;

  const response = await callLLM(systemPrompt, userPrompt);

  try {
    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as number[];
    if (!Array.isArray(parsed)) return { anchorIdx: prompt.anchorIdx, confirmed: [] };
    const valid = parsed.filter((n) => typeof n === "number" && n >= 0 && n < prompt.candidateIndices.length);
    return {
      anchorIdx: prompt.anchorIdx,
      confirmed: valid.map((i) => prompt.candidateIndices[i]),
    };
  } catch {
    return { anchorIdx: prompt.anchorIdx, confirmed: [] };
  }
}

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-zäöüß0-9\s]/g, "").split(/\s+/).filter((t) => t.length > 2)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function shareChunks(a: ConsolidatedRequirement, b: ConsolidatedRequirement): boolean {
  return a.sourceChunkIds.some((id) => b.sourceChunkIds.includes(id));
}

function getHighestPriority(priorities: Priority[]): Priority {
  if (priorities.includes(Priority.Must)) return Priority.Must;
  if (priorities.includes(Priority.Should)) return Priority.Should;
  return Priority.Optional;
}
