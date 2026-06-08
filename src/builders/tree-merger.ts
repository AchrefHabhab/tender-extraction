import { ProcurementMatchDeliverable } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { callLLM } from "../extractors/llm-client.js";
import { MERGE_SYSTEM_PROMPT } from "../prompts/index.js";

interface MergeGroup {
  canonicalName: string;
  members: string[];
}

export async function mergeTree(
  tree: ProcurementMatchDeliverable[]
): Promise<ProcurementMatchDeliverable[]> {
  if (tree.length <= 10) return tree;

  logger.info(`Merging ${tree.length} Level 1 categories`);

  const categoryNames = tree.map((node) => node.bulletPoint);
  const userPrompt = `Group these categories:\n\n${categoryNames.map((n, i) => `[${i}] ${n}`).join("\n")}`;

  const response = await callLLM(MERGE_SYSTEM_PROMPT, userPrompt);
  const groups = parseMergeGroups(response, categoryNames);

  const merged = groups.map((group) => {
    const members = group.members
      .map((name) => tree.find((node) => node.bulletPoint === name))
      .filter((n): n is ProcurementMatchDeliverable => n !== undefined);

    if (members.length === 1) return members[0];

    const allLevel2 = members.flatMap((m) => m.deliverableArray);

    return {
      ...members[0],
      bulletPoint: group.canonicalName,
      description: { en: group.canonicalName },
      deliverableArray: allLevel2,
    };
  });

  logger.info(`Merged: ${tree.length} → ${merged.length} Level 1 categories`);
  return merged;
}

function parseMergeGroups(response: string, allNames: string[]): MergeGroup[] {
  try {
    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as { groups: MergeGroup[] };

    if (!parsed.groups || !Array.isArray(parsed.groups)) {
      return allNames.map((name) => ({ canonicalName: name, members: [name] }));
    }

    const covered = new Set<string>();
    for (const group of parsed.groups) {
      group.members.forEach((m) => covered.add(m));
    }

    for (const name of allNames) {
      if (!covered.has(name)) {
        parsed.groups.push({ canonicalName: name, members: [name] });
      }
    }

    return parsed.groups;
  } catch {
    logger.warn("Failed to parse merge response, returning original tree");
    return allNames.map((name) => ({ canonicalName: name, members: [name] }));
  }
}
