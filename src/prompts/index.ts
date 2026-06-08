import fs from "fs";
import path from "path";

const PROMPTS_DIR = path.resolve("src", "prompts");

function loadPrompt(fileName: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, fileName), "utf-8").trim();
}

export const EXTRACTION_SYSTEM_PROMPT = loadPrompt("extraction-system.txt");
export const EXTRACTION_USER_TEMPLATE = loadPrompt("extraction-user.txt");
export const CONSOLIDATION_SYSTEM_PROMPT = loadPrompt("consolidation-system.txt");
export const CLASSIFICATION_SYSTEM_PROMPT = loadPrompt("classification-system.txt");
export const MERGE_SYSTEM_PROMPT = loadPrompt("merge-system.txt");
export const GLOBAL_DEDUP_SYSTEM_PROMPT = loadPrompt("global-dedup-system.txt");

export function buildExtractionPrompt(
  fileName: string,
  pageRef: string,
  text: string
): string {
  return EXTRACTION_USER_TEMPLATE
    .replace("{fileName}", fileName)
    .replace("{pageRef}", pageRef)
    .replace("{text}", text);
}
