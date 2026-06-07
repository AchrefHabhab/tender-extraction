import fs from "fs/promises";
import path from "path";
import { ProcurementMatchDeliverable } from "../types/index.js";
import { logger } from "./logger.js";

const OUTPUT_DIR = path.resolve("output");

export async function writeOutput(
  tree: ProcurementMatchDeliverable[],
  tenderName: string
): Promise<string> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const fileName = `${sanitize(tenderName)}-${timestamp()}.json`;
  const filePath = path.join(OUTPUT_DIR, fileName);

  const output = JSON.stringify(tree, null, 2);
  await fs.writeFile(filePath, output, "utf-8");

  logger.info(`Output written: ${filePath} (${output.length} bytes)`);
  return filePath;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, "_").toLowerCase();
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
}
