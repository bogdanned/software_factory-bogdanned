import { describe, expect, it } from "vitest";
import { checkReview, readReview, report } from "@/factory/scripts/review-report.mjs";

const finding = { question: 4, file: "legacy/api/routes/admin.ts:12", problem: "No role check.", fix: "Call requireAdmin first." };

describe("review-report", () => {
  it("approve: success", () => {
    expect(report({ verdict: "approve", findings: [] }).state).toBe("success");
  });
  it("changes: failure, and the comment names the finding", () => {
    const { state, comment } = report({ verdict: "changes", findings: [finding] });
    expect(state).toBe("failure");
    expect(comment).toContain("**Security** `legacy/api/routes/admin.ts:12`: No role check.");
  });
  it("a missing review.json: error", () => {
    const { state, comment } = report(readReview("no/such/review.json"));
    expect(state).toBe("error");
    expect(comment).toContain("the review could not run");
  });
  it("an invalid review: every problem listed", () => {
    expect(checkReview({ verdict: "maybe", findings: Array(6).fill(finding) })).toEqual(['verdict must be "approve" or "changes"', "at most 5 findings"]);
    expect(checkReview({ verdict: "changes", findings: [{ question: 1 }] })).toEqual(["finding 1 has no file", "finding 1 has no problem", "finding 1 has no fix"]);
  });
});
