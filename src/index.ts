import path from "path";
import { logger, writeOutput, detectLocale } from "./utils/index.js";
import { parseTenderFolder, chunkDocuments } from "./parsers/index.js";
import { extractRequirements, resolveReferences } from "./extractors/index.js";
import { consolidateRequirements, linkRelatedRequirements, buildTree, mergeTree } from "./builders/index.js";
import { validateOutput } from "./validators/index.js";

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
  const resolved = resolveReferences(rawRequirements, chunks);
  logger.info(`${resolved.length} raw requirements extracted`);

  const consolidated = await consolidateRequirements(resolved);
  logger.info(`${consolidated.length} requirements after consolidation`);

  const linked = await linkRelatedRequirements(consolidated);
  logger.info(`${linked.length} requirements after linking`);

  const locale = detectLocale(linked.map((r) => r.description));
  const rawTree = await buildTree(linked, locale);
  const tree = await mergeTree(rawTree);

  const { valid, errors } = validateOutput(tree);
  if (!valid) {
    logger.error(`Validation failed with ${errors.length} errors`);
    process.exit(1);
  }

  const outputPath = await writeOutput(tree, tenderName);

  logger.info(`Pipeline complete. Output: ${outputPath}`);
}

main().catch((err) => {
  logger.error("Pipeline failed", err);
  process.exit(1);
});
