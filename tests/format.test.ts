import { describe, expect, it } from "vitest";
import { plural, statusLabel, timeAgo } from "@/legacy/api/lib/format";

describe("format", () => {
  const now = new Date("2026-01-10T12:00:00Z");
  it("says how long ago", () => {
    expect(timeAgo("2026-01-10T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-01-10T11:00:00Z", now)).toBe("1h ago");
    expect(timeAgo("2026-01-07T12:00:00Z", now)).toBe("3d ago");
    expect(timeAgo("2025-10-01T12:00:00Z", now)).toBe("2025-10-01");
  });
  it("labels statuses", () => {
    expect(statusLabel("in_progress")).toBe("In progress");
  });
  it("pluralises", () => {
    expect(plural(1, "comment")).toBe("1 comment");
    expect(plural(2, "comment")).toBe("2 comments");
  });
});
