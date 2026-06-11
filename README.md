# Tender Extraction Pipeline

A CLI tool that takes a folder of procurement tender PDFs and extracts all requirements into a structured 3-level tree of `ProcurementMatchDeliverable` objects.

## Quick Start

```bash
git clone https://github.com/AchrefHabhab/tender-extraction.git
cd tender-extraction
npm install
cp .env.example .env   # add your DeepSeek API key
npx tsx src/index.ts sample-tenders/christmas-lights
```

Output JSON is written to `output/`. Pre-generated sample outputs are in `sample-output/`.

### Docker

```bash
docker build -t tender-extraction .
docker run --env-file .env -v ./sample-tenders:/app/sample-tenders -v ./output:/app/output tender-extraction sample-tenders/christmas-lights
```

## Pipeline Architecture

```
PDF folder → Parse → Chunk → Extract → Consolidate → Link → Classify → Merge → Validate → JSON
```

1. **PDF Parsing** — Extracts text per page from each PDF. Handles structured formats: German Leistungsverzeichnisse (bill of quantities), form-based tenders, tabular specifications, and hierarchical section numbering.
2. **Intelligent Chunking** — Merges pages by detected section boundaries (`GU.53.01`, `Section 4`, `Abschnitt 2`). Filters noise (empty price columns, placeholder lines, signature fields).
3. **LLM Extraction** — Each chunk → DeepSeek with calibrated prompts for priority/confidence. Handles German (`muss`, `soll`, `kann`) and English (`must`, `should`, `may`) language markers.
4. **Reference Resolution** — Detects cross-references ("see Annex A", "gemäß Anlage B") and links additional source chunks.
5. **Consolidation** — Batch deduplication + global dedup pass to merge identical requirements from overlapping pages.
6. **Semantic Linking** — Finds requirements from different chunks that describe the same deliverable (Jaccard similarity + LLM verification). Merges scattered pieces with full traceability.
7. **Top-Down Classification** — First discovers 5-15 Level 1 categories from all titles, then classifies each requirement into this fixed set. Prevents L1 fragmentation.
8. **Tree Merge** — Merges duplicate L1 categories across batches (e.g., "Gas Supply" / "Gasversorgung").
9. **Validation** — Zod validates the full output tree against the `ProcurementMatchDeliverable` schema.
10. **Metrics** — Logs source coverage, consolidation rate, priority entropy, and tree balance per run.

## What It Handles

- **Structured German LVs** — Hierarchical numbering (GU.53.01.01.01), quantity/unit columns, pricing grids. The chunker detects section boundaries; the LLM extracts specs from linearized table text.
- **Form-based tenders** — Contractor detail forms, evaluation criteria tables, signature areas. Empty fields are ignored; actual requirements and evaluation criteria are extracted.
- **Large multi-section documents** — 400+ page tenders split into meaningful chunks with cross-section linking.
- **Bilingual content** — Automatic locale detection (de/en) applied to all output descriptions.

## Results (Sample Tenders)

| Tender | Pages | L1 Categories | Requirements | Multi-Chunk | Coverage |
|--------|-------|---------------|--------------|-------------|----------|
| Christmas Lights (EN) | 5 | 13 | 50 | 0% | 66.7% |
| Fahrradgaragen (DE) | 6 | 13 | 32 | 0% | 100% |
| Salzburg Laboratory (DE) | 409 | 11 | 1,468 | 25.1% | 98.0% |

Multi-chunk = % of leaves referencing more than one source chunk (cross-section linking).

## Design Choices

- **Cache-first** — Every LLM call is cached (SHA-256 of prompt → `.cache/`). Re-runs cost $0. Enables fast iteration without API spend.
- **Top-down classification** — Categories are derived once from all titles, then each batch sorts into this fixed set. Prevents the 46-category fragmentation that bottom-up produces.
- **Calibrated prompts** — Few-shot examples + language markers (DE/EN) guide priority/confidence assignments. German LV-specific rules distinguish physical specs ("must") from approximate language ("should").
- **Prompts as .txt files** — All LLM prompts live in `src/prompts/*.txt`, loaded at runtime. Easy to iterate without touching logic.
- **Retry with backoff** — LLM calls retry 3× with exponential delay. Handles transient API errors.
- **Concurrency control** — `pMap` limits parallel calls (5 concurrent) to avoid rate limits while maximizing throughput.

## Cost Efficiency

The pipeline minimizes API costs through:
- **Disk cache** — identical prompts never call the API twice
- **Batch processing** — groups of 50 requirements per LLM call
- **Noise filtering** — skips chunks that are pure pricing/boilerplate (no wasted extraction calls)
- **Sampled category discovery** — caps at 500 titles for large tenders to avoid context overflow

A full run on all three sample tenders costs ~$0.12 (DeepSeek pricing). Cached re-runs cost $0.

## Output Shape

- **Level 1** — Broad categories (e.g., "Laboratory Furniture", "Electrical Installations")
- **Level 2** — Sub-groups (e.g., "Fume Hoods", "Wiring and Cabling")
- **Level 3** — Individual requirements with `bulletPoint`, `description`, `priority`, `confidence`, `equivalenceAllowed`, and `procurementDocumentChunkIdArray` linking back to source chunks

## Limitations

- **Linker is lexical** — Cross-chunk linking uses word overlap (Jaccard). Requirements described in completely different words won't be linked. An embeddings-based approach would improve this.
- **German LVs are priority-heavy** — Construction specs tend to produce ~95% "must" because most items genuinely are mandatory. The prompt calibration helps but can't override the source material.
- **Small tenders show 0% consolidation** — Expected: a 5-page PDF with 3 chunks has no cross-section repetition to merge.
- **OCR not integrated** — Scanned PDFs without embedded text layer won't extract properly.

## Project Structure

```
src/
├── index.ts              # CLI entry, orchestrates pipeline
├── parsers/              # PDF parsing + intelligent chunking
├── extractors/           # LLM client (retry, cache), requirement extraction
├── prompts/              # All LLM prompts as .txt files
├── builders/             # Consolidation, linker, tree building, merging
├── metrics/              # Output quality metrics (coverage, entropy, balance)
├── validators/           # Zod schema validation
├── types/                # TypeScript interfaces + enums
└── utils/                # Config, logger, locale detection, concurrency
```

## Scripts

```bash
npx tsx src/index.ts <path>   # Run pipeline
npm run verify                # Type-check + lint
npm test                      # Run all tests (30 tests)
npm run format                # Prettier
```
