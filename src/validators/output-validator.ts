import { z } from "zod";
import { logger } from "../utils/logger.js";

const LocaleObjectSchema = z.record(z.string(), z.string());

const DeliverableSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    bulletPoint: z.string().min(1),
    description: LocaleObjectSchema,
    priority: z.enum(["must", "should", "optional"]),
    confidence: z.enum(["high", "medium", "low"]).nullable(),
    equivalenceAllowed: z.boolean().nullable(),
    fullfillable: z.enum(["yes", "no", "maybe"]).nullable(),
    status: z.enum([
      "waitingForAnalysis",
      "waitingForAnswer",
      "waitingForAnswerPropagation",
      "waitingForReview",
      "userDefined",
    ]),
    aiReasoning: LocaleObjectSchema.nullable(),
    feedback: z.enum(["good", "bad"]).nullable(),
    feedbackText: z.string().nullable(),
    openQuestionId: z.string().nullable(),
    deliverableArray: z.array(DeliverableSchema),
    procurementDocumentChunkIdArray: z.array(z.string()),
    workspaceDocumentChunkIdArray: z.array(z.string()),
    citedProductIdArray: z.array(z.string()),
    citedPersonIdArray: z.array(z.string()),
  })
);

const OutputSchema = z.array(DeliverableSchema);

export function validateOutput(data: unknown): { valid: boolean; errors: string[] } {
  const result = OutputSchema.safeParse(data);

  if (result.success) {
    logger.info("Output validation passed");
    return { valid: true, errors: [] };
  }

  const errors = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`
  );

  logger.error(`Output validation failed: ${errors.length} errors`);
  errors.slice(0, 10).forEach((e) => logger.error(`  ${e}`));

  return { valid: false, errors };
}
