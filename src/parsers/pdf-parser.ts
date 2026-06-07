import fs from "fs/promises";
import path from "path";
import { PDFParse } from "pdf-parse";
import { logger } from "../utils/index.js";
import { DocumentChunk, ParsedDocument } from "../types/index.js";

const MIN_CHARS_PER_PAGE = 50;

export async function parsePdf(filePath: string): Promise<ParsedDocument> {
  const fileName = path.basename(filePath);
  logger.info(`Parsing PDF: ${fileName}`);

  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const textResult = await parser.getText();

  const chunks: DocumentChunk[] = [];

  for (const page of textResult.pages) {
    const text = page.text.trim();

    if (text.length < MIN_CHARS_PER_PAGE) {
      logger.warn(`Page ${page.num} of ${fileName} has very little text (${text.length} chars)`);
      continue;
    }

    chunks.push({
      id: `${fileName}:page-${page.num}`,
      text,
      pageNumber: page.num,
      fileName,
    });
  }

  logger.info(`Parsed ${fileName}: ${textResult.total} pages, ${chunks.length} chunks`);

  await parser.destroy();

  return {
    fileName,
    totalPages: textResult.total,
    chunks,
  };
}

export async function parseTenderFolder(folderPath: string): Promise<ParsedDocument[]> {
  const files = await fs.readdir(folderPath);
  const pdfFiles = files.filter((f) => f.toLowerCase().endsWith(".pdf"));

  if (pdfFiles.length === 0) {
    throw new Error(`No PDF files found in ${folderPath}`);
  }

  logger.info(`Found ${pdfFiles.length} PDF files in tender folder`);

  const documents: ParsedDocument[] = [];

  for (const file of pdfFiles) {
    const fullPath = path.join(folderPath, file);
    const doc = await parsePdf(fullPath);
    documents.push(doc);
  }

  const totalChunks = documents.reduce((sum, doc) => sum + doc.chunks.length, 0);
  logger.info(`Total: ${documents.length} documents, ${totalChunks} chunks`);

  return documents;
}
