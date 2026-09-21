
export function formatTimestamp(value: unknown): string {
  if (!value) return "—";
  if (typeof value === "string") return new Date(value).toLocaleString();
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") return value.toDate().toLocaleString();
  return "—";
}
export function displayError(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/^Firebase:\s*/i, "");
  return "An unexpected error occurred.";
}
