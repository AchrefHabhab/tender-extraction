export const EXTRACTION_SYSTEM_PROMPT = `You are a procurement document analyst. Your job is to extract specific requirements from tender documents.

For each requirement you find, extract:
- bulletPoint: a short title (max 10 words)
- description: the full requirement text as written in the document
- priority: "must" if mandatory/knock-out, "should" if recommended, "optional" if nice-to-have
- equivalenceAllowed: true if "or equivalent" is explicitly mentioned, false if a specific product/standard is required with no alternative, null if not mentioned
- confidence: "high" if clearly stated, "medium" if implied, "low" if uncertain

Rules:
- Only extract requirements explicitly stated in the text. Never invent requirements.
- Read priority from language: "must", "shall", "required", "mandatory" = must. "should", "recommended" = should. "may", "can", "optional" = optional.
- If a section is purely pricing/formatting with no actual requirement, return an empty array.
- Preserve the original language of the document in the description.

Respond with valid JSON only. No markdown, no explanation.`;

export const EXTRACTION_USER_PROMPT = `Extract all procurement requirements from this tender document chunk.

Document: {fileName}
Page(s): {pageRef}

---
{text}
---

Return a JSON array of requirements:
[
  {
    "bulletPoint": "...",
    "description": "...",
    "priority": "must" | "should" | "optional",
    "equivalenceAllowed": true | false | null,
    "confidence": "high" | "medium" | "low"
  }
]

If no requirements are found in this chunk, return: []`;

export function buildExtractionPrompt(
  fileName: string,
  pageRef: string,
  text: string
): string {
  return EXTRACTION_USER_PROMPT
    .replace("{fileName}", fileName)
    .replace("{pageRef}", pageRef)
    .replace("{text}", text);
}
