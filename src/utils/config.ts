import "dotenv/config";

export const config = {
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmBaseUrl: process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1",
  llmModel: process.env.LLM_MODEL ?? "deepseek-chat",
  logLevel: process.env.LOG_LEVEL ?? "info",
};
