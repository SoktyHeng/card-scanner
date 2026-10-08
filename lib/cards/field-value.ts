export function hasFieldValue(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
