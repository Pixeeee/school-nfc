import { expect, it } from "vitest";
import {
  defaultAttendanceTemplate,
  previewMessage,
  templateError,
} from "./messageTemplates";
it("allows custom wording but preserves attendance facts and rejects unknown or broken placeholders", () => {
  expect(templateError(defaultAttendanceTemplate)).toBeNull();
  expect(templateError("")).toBeNull();
  expect(templateError("Hello, " + defaultAttendanceTemplate)).toBeNull();
  expect(templateError("Hello, {{studentName}}!")).toContain("Keep");
  expect(templateError(defaultAttendanceTemplate + " {{password}}")).toContain(
    "listed",
  );
  expect(templateError(defaultAttendanceTemplate + " {studentName}")).toContain(
    "listed",
  );
  expect(previewMessage(defaultAttendanceTemplate, "absent")).toContain(
    "Ada Cruz is absent on October 15, 2026 at 9:00 AM.",
  );
});
