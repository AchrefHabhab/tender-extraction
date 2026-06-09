import OpenAI from "openai";
import { config } from "../utils/config.js";
import { logger } from "../utils/logger.js";
import { getCached, setCache } from "./cache.js";
import { ChatRole } from "../types/index.js";

const client = new OpenAI({
  apiKey: config.llmApiKey,
  baseURL: config.llmBaseUrl,
});

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const cacheKey = systemPrompt + userPrompt;
  const cached = await getCached(cacheKey);

  if (cached) {
    return cached;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: config.llmModel,
        messages: [
          { role: ChatRole.System, content: systemPrompt },
          { role: ChatRole.User, content: userPrompt },
        ],
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error("Empty response from LLM");
      }

      logger.debug(`LLM response: ${content.length} chars`);
      await setCache(cacheKey, content);
      return content;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;

      if (isLastAttempt) {
        logger.error(`LLM call failed after ${MAX_RETRIES} attempts`, error);
        throw error;
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      logger.warn(`LLM call failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  throw new Error("Unreachable");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
