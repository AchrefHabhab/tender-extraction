import Tesseract from "tesseract.js";
import { logger } from "../utils/index.js";

let worker: Tesseract.Worker | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (!worker) {
    worker = await Tesseract.createWorker("deu+eng");
    logger.info("OCR worker initialized (deu+eng)");
  }
  return worker;
}

export async function ocrPage(pdfBuffer: Buffer, pageNumber: number): Promise<string> {
  const { pdf } = await import("pdf-to-img");
  const doc = await pdf(new Uint8Array(pdfBuffer), { scale: 2 });
  const imageBuffer = await doc.getPage(pageNumber);
  await doc.destroy();

  const ocrWorker = await getWorker();
  const { data } = await ocrWorker.recognize(imageBuffer);

  return data.text.trim();
}

export async function destroyOcrWorker(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
