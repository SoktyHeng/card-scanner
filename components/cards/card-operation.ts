import { z } from "zod";
const responseSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true) }),
  z.object({ success: z.literal(false), error: z.object({ code: z.string(), message: z.string().max(1000) }) }),
]);
export async function cardOperation(id: string, method: "PATCH" | "DELETE", body: unknown) {
  const response = await fetch(`/api/cards/${id}`, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = responseSchema.safeParse(await response.json());
  if (!result.success) throw new Error("Unable to complete this operation. Reload to check its status before retrying.");
  if (!result.data.success) throw new Error(result.data.error.message);
  if (!response.ok) throw new Error("Unable to complete this operation. Please try again.");
}
