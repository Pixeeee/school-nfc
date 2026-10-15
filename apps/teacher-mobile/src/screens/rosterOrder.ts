import type { RosterStudent } from "../native/types";
const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});
export function orderRoster(students: RosterStudent[], order: string[] = []) {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...students].sort((a, b) => {
    if (rank.has(a.id) || rank.has(b.id))
      return (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity);
    const surname = (s: RosterStudent) =>
      s.lastName?.trim() || s.displayName.trim().split(/\s+/).at(-1) || "";
    return (
      collator.compare(surname(a), surname(b)) ||
      collator.compare(
        a.firstName || a.displayName,
        b.firstName || b.displayName,
      ) ||
      collator.compare(a.studentNumber, b.studentNumber)
    );
  });
}
