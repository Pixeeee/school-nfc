import { describe, expect, it } from "vitest";
import { SchoolNfcWeb } from "./web";
describe("web fallback", () => {
  it("rejects weak sign-in", async () => {
    const p = new SchoolNfcWeb();
    await expect(
      p.signIn({ username: "teacher_a", password: "short" }),
    ).rejects.toThrow();
  });
  it("does not pretend browser NFC is production scanner", async () => {
    const p = new SchoolNfcWeb();
    await expect(
      p.startScannerSession({ schoolId: "school", mode: "ARRIVAL" }),
    ).rejects.toThrow(/Android/);
  });
});
it("rejects teacher configuration outside Android", async () => {
  const p = new SchoolNfcWeb();
  await expect(p.activeTeacherDirectory()).rejects.toThrow(/Android/);
  await expect(p.sectionAssign()).rejects.toThrow(/Android/);
  await expect(p.subjectSet()).rejects.toThrow(/Android/);
});
