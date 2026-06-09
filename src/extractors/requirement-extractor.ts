import { z } from "zod";
import { DocumentChunk, Priority, Confidence } from "../types/index.js";
import { logger, pMap } from "../utils/index.js";
import { callLLM } from "./llm-client.js";
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionPrompt } from "../prompts/index.js";

const EXTRACTION_CONCURRENCY = 5;

const RawRequirementSchema = z.object({
  bulletPoint: z.string(),
  description: z.string(),
  priority: z.nativeEnum(Priority),
  equivalenceAllowed: z.boolean().nullable(),
  confidence: z.nativeEnum(Confidence),
});

export type RawRequirement = z.infer<typeof RawRequirementSchema> & {
  sourceChunkIds: string[];
};

export async function extractRequirements(chunks: DocumentChunk[]): Promise<RawRequirement[]> {
  logger.info(`Extracting from ${chunks.length} chunks (concurrency: ${EXTRACTION_CONCURRENCY})`);

  const results = await pMap(
    chunks,
    async (chunk, i) => {
      logger.info(`Extracting chunk ${i + 1}/${chunks.length}: ${chunk.id}`);
      return extractFromChunk(chunk);
    },
    EXTRACTION_CONCURRENCY
  );

  const allRequirements = results.flat();
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
