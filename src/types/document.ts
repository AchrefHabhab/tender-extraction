export interface DocumentChunk {
  id: string;
  text: string;
  pageNumber: number;
  fileName: string;
}

export interface ParsedDocument {
  fileName: string;
  totalPages: number;
  chunks: DocumentChunk[];
}
