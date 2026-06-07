import { DocumentChunk, ParsedDocument } from "../types/index.js";
import { logger } from "../utils/index.js";

interface ChunkerConfig {
  maxChunkLength: number;
  minChunkLength: number;
  noiseThreshold: number;
}

const DEFAULT_CONFIG: ChunkerConfig = {
  maxChunkLength: 4000,
  minChunkLength: 100,
  noiseThreshold: 0.5,
};

const SECTION_PATTERNS = [
  /^\d+\.\d+/,
  /^[A-Z]\d+\.\d+/,
  /^\d+\s+[A-ZÄÖÜ]/,
  /^(Section|Part|Chapter|Abschnitt|Kapitel)\s+\d+/i,
  /^[IVXLC]+\.\s+/,
];

export function chunkDocuments(
  documents: ParsedDocument[],
  config: Partial<ChunkerConfig> = {}
): DocumentChunk[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const allChunks: DocumentChunk[] = [];

  for (const doc of documents) {
    const merged = mergeBySection(doc.chunks, cfg);
    const filtered = filterNoise(merged, cfg);
    allChunks.push(...filtered);
  }

  logger.info(`Chunker: ${allChunks.length} chunks after merging and filtering`);
  return allChunks;
}

function mergeBySection(chunks: DocumentChunk[], cfg: ChunkerConfig): DocumentChunk[] {
  if (chunks.length === 0) return [];

  const merged: DocumentChunk[] = [];
  let current = { ...chunks[0] };

  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i];
    const startsNewSection = detectsSectionBoundary(next.text);
    const wouldExceedMax = current.text.length + next.text.length > cfg.maxChunkLength;

    if (startsNewSection || wouldExceedMax) {
      merged.push(current);
      current = { ...next };
    } else {
      current.text += "\n\n" + next.text;
      current.id = `${current.fileName}:page-${current.pageNumber}-${next.pageNumber}`;
    }
  }

  merged.push(current);
  return merged;
}

function detectsSectionBoundary(text: string): boolean {
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  return SECTION_PATTERNS.some((pattern) => pattern.test(firstLine));
}

function filterNoise(chunks: DocumentChunk[], cfg: ChunkerConfig): DocumentChunk[] {
  return chunks.filter((chunk) => {
    if (chunk.text.length < cfg.minChunkLength) {
      logger.debug(`Filtered short chunk: ${chunk.id}`);
      return false;
    }

    const noiseRatio = calculateNoiseRatio(chunk.text);
    if (noiseRatio > cfg.noiseThreshold) {
      logger.debug(`Filtered noisy chunk: ${chunk.id} (noise: ${(noiseRatio * 100).toFixed(0)}%)`);
      return false;
    }

    return true;
  });
}

function calculateNoiseRatio(text: string): number {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return 1;

  const noiseLines = lines.filter((line) => {
    const trimmed = line.trim();
    const isPrice = /^(EUR|USD|\$|€)\s*$/.test(trimmed);
    const isPlaceholder = /^[.\s]+$/.test(trimmed);
    const isShortCode = trimmed.length < 5 && /^[A-Z0-9]+$/.test(trimmed);
    return isPrice || isPlaceholder || isShortCode;
  });

  return noiseLines.length / lines.length;
}
