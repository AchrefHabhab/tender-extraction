import path from "path";
import { logger, writeOutput } from "./utils/index.js";
import { parseTenderFolder, chunkDocuments } from "./parsers/index.js";
import { extractRequirements } from "./extractors/index.js";
import { consolidateRequirements, buildTree } from "./builders/index.js";

async function main(): Promise<void> {
  const inputPath = process.argv[2];

  if (!inputPath) {
    logger.error("Usage: npm run dev -- <path-to-tender-folder>");
    process.exit(1);
  }

  const folderPath = path.resolve(inputPath);
  const tenderName = path.basename(folderPath);
  logger.info(`Processing tender: ${tenderName}`);

  const documents = await parseTenderFolder(folderPath);
  const chunks = chunkDocuments(documents);
  logger.info(`${chunks.length} chunks ready for extraction`);

  const rawRequirements = await extractRequirements(chunks);
  logger.info(`${rawRequirements.length} raw requirements extracted`);

  const consolidated = await consolidateRequirements(rawRequirements);
  logger.info(`${consolidated.length} requirements after consolidation`);

  const tree = await buildTree(consolidated);
  const outputPath = await writeOutput(tree, tenderName);

  logger.info(`Pipeline complete. Output: ${outputPath}`);
}

main().catch((err) => {
  logger.error("Pipeline failed", err);
  process.exit(1);
});
