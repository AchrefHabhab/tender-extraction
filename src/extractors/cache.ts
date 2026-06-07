import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { logger } from "../utils/logger.js";

const CACHE_DIR = path.resolve(".cache");

export async function getCached(key: string): Promise<string | null> {
  const filePath = getCachePath(key);

  try {
    const data = await fs.readFile(filePath, "utf-8");
    logger.debug(`Cache hit: ${key.substring(0, 20)}...`);
    return data;
  } catch {
    return null;
  }
}

export async function setCache(key: string, value: string): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const filePath = getCachePath(key);
  await fs.writeFile(filePath, value, "utf-8");
  logger.debug(`Cache saved: ${key.substring(0, 20)}...`);
}

function getCachePath(key: string): string {
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return path.join(CACHE_DIR, `${hash}.json`);
}
