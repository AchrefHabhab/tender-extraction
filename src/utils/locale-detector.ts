import { logger } from "./logger.js";

const GERMAN_MARKERS = [
  "und", "der", "die", "das", "für", "mit", "aus", "auf", "ist", "von",
  "den", "des", "dem", "ein", "eine", "einer", "eines", "einem",
  "werden", "wird", "sind", "nach", "bei", "zur", "zum", "über",
  "gemäß", "sowie", "bzw", "müssen", "soll", "kann",
  "ä", "ö", "ü", "ß",
];

const ENGLISH_MARKERS = [
  "the", "and", "for", "with", "from", "that", "this", "are", "was",
  "will", "shall", "must", "should", "have", "been", "which", "their",
  "into", "upon", "between", "during", "required", "contractor",
];

export type LocaleKey = "en" | "de" | "fr";

export function detectLocale(texts: string[]): LocaleKey {
  const sample = texts.slice(0, 50).join(" ").toLowerCase();
  const words = sample.split(/\s+/);

  let deScore = 0;
  let enScore = 0;

  for (const word of words) {
    if (GERMAN_MARKERS.includes(word)) deScore++;
    if (ENGLISH_MARKERS.includes(word)) enScore++;
  }

  for (const char of ["ä", "ö", "ü", "ß"]) {
    deScore += (sample.match(new RegExp(char, "g")) ?? []).length * 2;
  }

  const locale: LocaleKey = deScore > enScore * 1.2 ? "de" : "en";
  logger.info(`Detected locale: ${locale} (de=${deScore}, en=${enScore})`);
  return locale;
}

export function toLocaleObject(text: string, locale: LocaleKey): Record<string, string> {
  return { [locale]: text };
}
