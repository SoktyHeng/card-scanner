import { z } from "zod";
export const MAX_CARD_TAGS = 20;
export const MAX_NOTES_LENGTH = 10000;
export const tagNameSchema = z.string().trim().normalize().min(1, "Enter a tag name.").max(50, "Use 50 characters or fewer.").regex(/^[^\u0000-\u001f\u007f-\u009f]*$/, "Remove control characters from your tag.");
export const organizationSchema = z.strictObject({
  operation: z.literal("organize"),
  expectedUpdatedAt: z.iso.datetime({offset: true}),
  notes: z.string().max(MAX_NOTES_LENGTH, "Use 10,000 characters or fewer."),
  favorite: z.boolean(),
  tags: z.array(tagNameSchema).max(MAX_CARD_TAGS, "Use at most 20 tags."),
});
export const cardTagsSchema = z.array(z.object({id: z.uuid(), name: tagNameSchema})).max(MAX_CARD_TAGS);
