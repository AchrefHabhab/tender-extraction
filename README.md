# Tender Extraction Pipeline

A CLI tool that takes a folder of procurement tender PDFs and extracts all requirements into a structured 3-level tree of `ProcurementMatchDeliverable` objects.

## Quick Start

```bash
git clone https://github.com/AchrefHabhab/tender-extraction.git
cd tender-extraction
npm install
cp .env.example .env   # add your DeepSeek API key
```

Place your tender PDF(s) in a folder (e.g., `sample-tenders/my-tender/`), then run:

```bash
npx tsx src/index.ts sample-tenders/my-tender
```

Output JSON is written to `output/`. Pre-generated sample outputs are available in `sample-output/`.

### Docker

```bash
docker build -t tender-extraction .
docker run --env-file .env -v ./sample-tenders:/app/sample-tenders -v ./output:/app/output tender-extraction sample-tenders/my-tender
```

## How It Works

```
PDF folder → Parse → Chunk → Extract → Consolidate → Classify → Merge → Validate → JSON
```

1. **PDF Parsing** — `pdf-parse` v2 extracts text per page from each PDF in the folder.
2. **Intelligent Chunking** — Pages are merged by detected section headings. Noise pages (tables of contents, pricing grids, boilerplate) are filtered out.
3. **LLM Extraction** — Each chunk is sent to DeepSeek with a prompt that extracts individual requirements with priority, confidence, and equivalence fields.
4. **Consolidation** — A strict deduplication pass merges only true duplicates (same text extracted from overlapping pages). No semantic grouping — we keep separate items separate.
5. **Classification** — Requirements are organized into Level 1 (broad categories) and Level 2 (sub-groups) using the LLM.
6. **Tree Merge** — A post-processing step merges duplicate Level 1 categories created across batches (e.g., "Gas Supply" and "Gasversorgung").
7. **Validation** — Zod validates the full output tree against the `ProcurementMatchDeliverable` schema before writing.

## Design Choices

**Each folder = one tender.** All PDFs in a folder are treated as parts of the same tender (main notice + annexes + datasheets), producing one output tree.

**Cache-first approach.** Every LLM call is cached to disk (SHA-256 of prompt → `.cache/`). Re-runs are instant. This enables fast iteration on downstream logic without re-calling the API.

**Strict consolidation over aggressive merging.** The first version over-merged (28 requirements → 2). The current version only merges exact duplicates. It's better to have a stray duplicate than to lose a real requirement.

**Prompts as .txt files.** All LLM prompts live in `src/prompts/*.txt`, loaded at runtime. Easy to iterate on prompt engineering without touching code.

**Retry with exponential backoff.** LLM calls retry up to 3 times with doubling delay. Handles transient API errors gracefully.

**Batch-then-merge for classification.** Since the LLM has a context window limit, we classify in batches of 50 and then merge fragmented Level 1 categories in a final pass.

## Output Shape

The output matches the `ProcurementMatchDeliverable` interface:

- **Level 1** — Top categories (e.g., "Laboratory Furniture", "Electrical Installation")
- **Level 2** — Sub-groups (e.g., "Fume Hoods", "Wiring and Cabling")
- **Level 3** — Individual requirements with `bulletPoint`, `description`, `priority`, `confidence`, `equivalenceAllowed`, and `procurementDocumentChunkIdArray` linking back to source chunks

## Limitations and Honest Assessment

- **No cross-chunk consolidation.** The consolidator works per-batch (30 items). A requirement split across distant chunks in different batches won't be merged. A future improvement: a second global dedup pass.
- **Classification quality scales with tender complexity.** Simple tenders (5-6 pages) produce clean trees. The 409-page Salzburg tender produces 39 Level 1 categories — reasonable but could be tighter with a two-pass classification approach.
- **OCR not yet wired.** The `tesseract.js` dependency is installed but not integrated. Scanned PDFs without embedded text won't extract properly.
- **German/English mixed output.** For bilingual tenders, some categories appear in their original language. The merger handles some of this, but not all.
- **No cross-file chunk linking.** When a tender has multiple PDFs (main + annex), chunks reference their source file but the consolidator doesn't yet detect "see Annex A" references to merge across files.

## Project Structure

```
src/
├── index.ts              # CLI entry point, orchestrates pipeline
├── parsers/              # PDF parsing + intelligent chunking
├── extractors/           # LLM client with retry + caching
├── prompts/              # All LLM prompts as .txt files
├── builders/             # Consolidation, tree building, merging
├── validators/           # Zod output schema validation
├── types/                # TypeScript interfaces
└── utils/                # Config, logger, output writer
```

## Scripts

```bash
npm run dev -- <path>     # Run pipeline with tsx
npm run verify            # Type-check + lint
npm run lint              # ESLint
npm run format            # Prettier
```
