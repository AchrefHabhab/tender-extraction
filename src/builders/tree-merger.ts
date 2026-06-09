import { ProcurementMatchDeliverable } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { callLLM } from "../extractors/llm-client.js";
import { MERGE_SYSTEM_PROMPT, DEEP_MERGE_SYSTEM_PROMPT } from "../prompts/index.js";

interface MergeGroup {
  canonicalName: string;
  members: string[];
}

export async function mergeTree(
  tree: ProcurementMatchDeliverable[]
): Promise<ProcurementMatchDeliverable[]> {
  if (tree.length <= 10) return tree;

  const pass1 = await mergePass(tree, MERGE_SYSTEM_PROMPT, buildNameOnlyPrompt);
  logger.info(`Merge pass 1 (names): ${tree.length} → ${pass1.length} Level 1 categories`);

  if (pass1.length <= 15) return pass1;

  const pass2 = await mergePass(pass1, DEEP_MERGE_SYSTEM_PROMPT, buildDeepPrompt);
  logger.info(`Merge pass 2 (with sub-categories): ${pass1.length} → ${pass2.length} Level 1 categories`);

  return pass2;
}

function buildNameOnlyPrompt(tree: ProcurementMatchDeliverable[]): string {
  const names = tree.map((node) => node.bulletPoint);
  return `Group these categories:\n\n${names.map((n, i) => `[${i}] ${n}`).join("\n")}`;
}

function buildDeepPrompt(tree: ProcurementMatchDeliverable[]): string {
  const lines = tree.map((node) => {
    const subs = node.deliverableArray.map((s) => s.bulletPoint).join(", ");
    return `- ${node.bulletPoint}: [${subs}]`;
  });
  return `Review these categories and their sub-categories for overlap:\n\n${lines.join("\n")}`;
}

async function mergePass(
  tree: ProcurementMatchDeliverable[],
  systemPrompt: string,
  promptBuilder: (tree: ProcurementMatchDeliverable[]) => string
): Promise<ProcurementMatchDeliverable[]> {
  const categoryNames = tree.map((node) => node.bulletPoint);
  const userPrompt = promptBuilder(tree);

  const response = await callLLM(systemPrompt, userPrompt);
  const groups = parseMergeGroups(response, categoryNames);

  return groups.map((group) => {
    const members = group.members
      .map((name) => tree.find((node) => node.bulletPoint === name))
      .filter((n): n is ProcurementMatchDeliverable => n !== undefined);

    if (members.length === 1) return members[0];

    const allLevel2 = members.flatMap((m) => m.deliverableArray);
    const locale = Object.keys(members[0].description)[0] ?? "en";

    return {
      ...members[0],
      bulletPoint: group.canonicalName,
      description: { [locale]: group.canonicalName },
      deliverableArray: allLevel2,
    };
  });
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
