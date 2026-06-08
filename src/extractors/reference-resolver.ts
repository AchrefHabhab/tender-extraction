import { DocumentChunk } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { RawRequirement } from "./requirement-extractor.js";

const REFERENCE_PATTERNS = [
  /see\s+(annex|appendix|anlage|anhang|section|abschnitt|chapter|kapitel)\s+([A-Z0-9.]+)/gi,
  /(?:cf\.|vgl\.|gem[aä][ßs]|according to|per|laut)\s+(annex|appendix|anlage|anhang|section|abschnitt)\s+([A-Z0-9.]+)/gi,
  /(?:annex|appendix|anlage|anhang)\s+([A-Z0-9.]+)/gi,
  /(?:specification|spezifikation|datasheet|datenblatt)\s+(?:on\s+)?(?:page|seite)\s+(\d+)/gi,
  /(?:page|seite|S\.)\s+(\d+(?:\s*[-–]\s*\d+)?)/gi,
];

interface ResolvedReference {
  type: "annex" | "page";
  label: string;
}

export function resolveReferences(
  requirements: RawRequirement[],
  allChunks: DocumentChunk[]
): RawRequirement[] {
  let totalResolved = 0;

  for (const req of requirements) {
    const refs = detectReferences(req.description);
    if (refs.length === 0) continue;

    const matchedChunkIds = resolveToChunks(refs, allChunks);
    const newIds = matchedChunkIds.filter((id) => !req.sourceChunkIds.includes(id));

    if (newIds.length > 0) {
      req.sourceChunkIds = [...req.sourceChunkIds, ...newIds];
      totalResolved += newIds.length;
    }
  }

  if (totalResolved > 0) {
    logger.info(`Reference resolver: linked ${totalResolved} additional chunks`);
  }

  return requirements;
}

function detectReferences(text: string): ResolvedReference[] {
  const refs: ResolvedReference[] = [];
  const seen = new Set<string>();

  for (const pattern of REFERENCE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const groups = match.slice(1);
      const label = groups[groups.length - 1];
      if (!label) continue;

      const key = label.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);

      const isPage = /^\d+/.test(label);
      refs.push({ type: isPage ? "page" : "annex", label: label.trim() });
    }
  }

  return refs;
}

function resolveToChunks(refs: ResolvedReference[], chunks: DocumentChunk[]): string[] {
  const matched: string[] = [];

  for (const ref of refs) {
    if (ref.type === "page") {
      const pageNums = parsePageNumbers(ref.label);
      for (const chunk of chunks) {
        const chunkPages = parseChunkPages(chunk.id);
        if (chunkPages.some((p) => pageNums.includes(p))) {
          matched.push(chunk.id);
        }
      }
    } else {
      const labelLower = ref.label.toLowerCase();
      for (const chunk of chunks) {
        const chunkTextLower = chunk.text.substring(0, 500).toLowerCase();
        const chunkIdLower = chunk.id.toLowerCase();
        if (
          chunkIdLower.includes(labelLower) ||
          chunkTextLower.includes(`annex ${labelLower}`) ||
          chunkTextLower.includes(`anlage ${labelLower}`) ||
          chunkTextLower.includes(`appendix ${labelLower}`) ||
          chunkTextLower.includes(`anhang ${labelLower}`)
        ) {
          matched.push(chunk.id);
        }
      }
    }
  }

  return [...new Set(matched)];
}

function parsePageNumbers(label: string): number[] {
  const rangeMatch = label.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    const pages: number[] = [];
    for (let i = start; i <= end && i <= start + 50; i++) pages.push(i);
    return pages;
  }
  const num = parseInt(label, 10);
  return isNaN(num) ? [] : [num];
}

function parseChunkPages(chunkId: string): number[] {
  const pageMatch = chunkId.match(/page-(\d+)(?:-(\d+))?/);
  if (!pageMatch) return [];

  const start = parseInt(pageMatch[1], 10);
  const end = pageMatch[2] ? parseInt(pageMatch[2], 10) : start;
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);
  return pages;
}
