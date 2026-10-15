import { expect, it } from "vitest";
import { orderRoster } from "./rosterOrder";
import type { RosterStudent } from "../native/types";
const student = (
  id: string,
  firstName: string,
  lastName: string,
): RosterStudent => ({
  id,
  firstName,
  lastName,
  displayName: `${firstName} ${lastName}`,
  studentNumber: id,
  sectionId: "nara",
  present: false,
  smsStatus: "NONE",
});
it("sorts by the complete surname, then first name, without mutating the roster", () => {
  const roster = [
    student("1", "Ada", "Santos"),
    student("2", "Zoe", "De la Cruz"),
    student("3", "Ana", "De la Cruz"),
  ];
  expect(orderRoster(roster).map((x) => x.id)).toEqual(["3", "2", "1"]);
  expect(roster.map((x) => x.id)).toEqual(["1", "2", "3"]);
  expect(orderRoster(roster, ["1", "2"]).map((x) => x.id)).toEqual([
    "1",
    "2",
    "3",
  ]);
  expect(orderRoster(roster, ["deleted"]).map((x) => x.id)).toEqual([
    "3",
    "2",
    "1",
  ]);
});
