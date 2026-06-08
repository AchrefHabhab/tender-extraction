import { z } from "zod";
import { DocumentChunk } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { callLLM } from "./llm-client.js";
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionPrompt } from "../prompts/index.js";

const RawRequirementSchema = z.object({
  bulletPoint: z.string(),
  description: z.string(),
  priority: z.enum(["must", "should", "optional"]),
  equivalenceAllowed: z.boolean().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
});

export type RawRequirement = z.infer<typeof RawRequirementSchema> & {
  sourceChunkIds: string[];
};

export async function extractRequirements(chunks: DocumentChunk[]): Promise<RawRequirement[]> {
  const allRequirements: RawRequirement[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    logger.info(`Extracting chunk ${i + 1}/${chunks.length}: ${chunk.id}`);

    const requirements = await extractFromChunk(chunk);
    allRequirements.push(...requirements);
  }

  logger.info(`Extracted ${allRequirements.length} raw requirements from ${chunks.length} chunks`);
  return allRequirements;
}

async function extractFromChunk(chunk: DocumentChunk): Promise<RawRequirement[]> {
  const userPrompt = buildExtractionPrompt(chunk.fileName, String(chunk.pageNumber), chunk.text);

  const response = await callLLM(EXTRACTION_SYSTEM_PROMPT, userPrompt);
  return parseResponse(response, chunk.id);
}

function parseResponse(response: string, chunkId: string): RawRequirement[] {
  try {
    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as unknown[];

    if (!Array.isArray(parsed)) {
      logger.warn(`Non-array response for chunk ${chunkId}`);
      return [];
    }

    const validated: RawRequirement[] = [];

    for (const item of parsed) {
      const result = RawRequirementSchema.safeParse(item);

      if (result.success) {
        validated.push({ ...result.data, sourceChunkIds: [chunkId] });
      } else {
        logger.warn(`Invalid requirement in chunk ${chunkId}: ${result.error.message}`);
      }
    }

    return validated;
  } catch (error) {
    logger.error(`Failed to parse LLM response for chunk ${chunkId}`, error);
    return [];
  }
}
