import { z } from "zod";

export const standardFields = [
  "cardType",
  "name",
  "company",
  "jobTitle",
  "department",
  "email",
  "phone",
  "secondaryPhone",
  "website",
  "address",
  "cardNumber",
] as const;

const visibleText = z.string().min(1).max(2000);
const confidence = z.number().min(0).max(1);
export const extraFieldSchema = z.strictObject({
  label: visibleText.nullable(),
  key: z
    .string()
    .max(100)
    .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/),
  value: visibleText,
  confidence,
});
const fieldShape = Object.fromEntries(
  standardFields.map((key) => [key, visibleText.nullable()]),
) as Record<
  (typeof standardFields)[number],
  ReturnType<typeof visibleText.nullable>
>;
const confidenceShape = Object.fromEntries(
  standardFields.map((key) => [key, confidence.nullable()]),
) as Record<
  (typeof standardFields)[number],
  ReturnType<typeof confidence.nullable>
>;

// The provider receives the same structural contract. Cross-field rules are
// checked locally after JSON parsing and never silently repair invented data.
export const cardOutputSchema = z.strictObject({
  ...fieldShape,
  rawText: z.string().min(1).max(30000).nullable(),
  overallConfidence: confidence,
  fieldConfidences: z.strictObject(confidenceShape),
  extraFields: z.array(extraFieldSchema).max(100),
});

export const extractedCardSchema = cardOutputSchema.superRefine((card, ctx) => {
  for (const key of standardFields) {
    if (card[key] !== null && !card[key].trim())
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: "Use null for unavailable values.",
      });
    if ((card[key] === null) !== (card.fieldConfidences[key] === null))
      ctx.addIssue({
        code: "custom",
        path: ["fieldConfidences", key],
        message:
          "Missing values require null confidence; visible values require a score.",
      });
  }
  if (card.rawText !== null && !card.rawText.trim())
    ctx.addIssue({
      code: "custom",
      path: ["rawText"],
      message: "Use null for absent text.",
    });
  if (
    standardFields.every((key) => card[key] === null) &&
    card.rawText === null &&
    card.extraFields.length === 0 &&
    card.overallConfidence !== 0
  )
    ctx.addIssue({
      code: "custom",
      path: ["overallConfidence"],
      message: "Empty extraction requires zero confidence.",
    });
  card.extraFields.forEach((field, index) => {
    if (!field.value.trim() || (field.label !== null && !field.label.trim()))
      ctx.addIssue({
        code: "custom",
        path: ["extraFields", index],
        message: "Preserve visible, nonempty text.",
      });
    if (
      (field.label === null || field.key === "unknown_field") &&
      (field.label !== null ||
        field.key !== "unknown_field" ||
        field.confidence >= 0.5)
    )
      ctx.addIssue({
        code: "custom",
        path: ["extraFields", index],
        message:
          "Unclear fields require a null label, unknown_field key, and confidence below 0.5.",
      });
  });
});

export const extractionMessages = {
  UNAUTHORIZED: "Your session has expired. Sign in again before extracting.",
  AUTH_UNAVAILABLE: "Unable to verify your session. Please try again.",
  FORBIDDEN: "This extraction request is not allowed.",
  INVALID_UPLOAD: "Choose one valid JPG, JPEG, PNG, or WEBP image.",
  IMAGE_TOO_LARGE: "This image is too large. Choose an image of 10 MB or less.",
  INVALID_IMAGE:
    "Unable to open this image. It may be damaged, unsupported, animated, or over 40 megapixels. Try another image.",
  AI_NOT_CONFIGURED:
    "Extraction is not configured yet. Contact the app administrator.",
  PROVIDER_UNAVAILABLE:
    "AI extraction is temporarily unavailable. Please try again.",
  PROVIDER_RATE_LIMITED: "Extraction is busy. Wait a moment, then try again.",
  REQUEST_RATE_LIMITED: "Too many extraction requests. Wait a minute, then try again. Your image is still here.",
  PROVIDER_QUOTA_EXCEEDED:
    "The AI provider's API balance or quota is exhausted. The app administrator must check API billing before extraction can continue.",
  EXTRACTION_TIMEOUT: "Extraction took too long. Please try again.",
  EXTRACTION_FAILED:
    "Unable to extract reliable information from this image. Try again or use a clearer photo.",
} as const;
export type ExtractionErrorCode = keyof typeof extractionMessages;
export const extractionResponseSchema = z.discriminatedUnion("success", [
  z.strictObject({ success: z.literal(true), data: extractedCardSchema }),
  z.strictObject({
    success: z.literal(false),
    error: z.strictObject({
      code: z.enum(
        Object.keys(extractionMessages) as [
          ExtractionErrorCode,
          ...ExtractionErrorCode[],
        ],
      ),
      message: z.string().max(1000),
    }),
  }),
]);
