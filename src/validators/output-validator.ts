import { z } from "zod";
import { logger } from "../utils/logger.js";
import { Priority, Confidence, Fulfillable, DeliverableStatus, Feedback } from "../types/index.js";

const LocaleObjectSchema = z.record(z.string(), z.string());

const DeliverableSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    bulletPoint: z.string().min(1),
    description: LocaleObjectSchema,
    priority: z.nativeEnum(Priority),
    confidence: z.nativeEnum(Confidence).nullable(),
    equivalenceAllowed: z.boolean().nullable(),
    fullfillable: z.nativeEnum(Fulfillable).nullable(),
    status: z.nativeEnum(DeliverableStatus),
    aiReasoning: LocaleObjectSchema.nullable(),
    feedback: z.nativeEnum(Feedback).nullable(),
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
