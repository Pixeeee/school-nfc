
import { describe, expect, it } from "vitest";
import { displayError, formatTimestamp } from "./lib/format";
describe("admin utilities",()=>{it("shows safe errors",()=>expect(displayError(new Error("Failure"))).toBe("Failure"));it("handles empty timestamps",()=>expect(formatTimestamp(null)).toBe("—"));});
