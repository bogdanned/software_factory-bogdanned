import { describe, expect, it } from "vitest";
import { checkReview, diffLines, readReview, report } from "@/factory/scripts/review-report.mjs";

const diff = `diff --git a/legacy/api/routes/admin.ts b/legacy/api/routes/admin.ts
--- a/legacy/api/routes/admin.ts
+++ b/legacy/api/routes/admin.ts
@@ -25,3 +25,7 @@ admin.get("/admin/outbox", requireAdmin, async (req, res) => {
   res.json({ emails });
 });
${" "}
+admin.get("/admin/users", async (_req, res) => {
+  const users = await sql("SELECT id FROM users");
+  res.json({ users });
+});
`;
const finding = { question: 4, file: "legacy/api/routes/admin.ts:28", problem: "No role check.", fix: "Call requireAdmin first." };

describe("review-report", () => {
  it("approve: success, a comment, never an approval", () => {
    const { state, payload } = report({ verdict: "approve", findings: [] }, diff);
    expect(state).toBe("success");
    expect(payload.event).toBe("COMMENT");
    expect(payload.body).toContain("No findings.");
  });
  it("changes: failure, changes requested, the finding inline on its line", () => {
    const { state, payload } = report({ verdict: "changes", findings: [finding] }, diff);
    expect(state).toBe("failure");
    expect(payload.event).toBe("REQUEST_CHANGES");
    expect(payload.comments).toEqual([{ path: "legacy/api/routes/admin.ts", line: 28, side: "RIGHT", body: "**Security**: No role check.\n\n**Fix:** Call requireAdmin first." }]);
    expect(payload.body).toContain("**What now:**");
  });
  it("a line outside the diff goes in the summary, not inline", () => {
    const { payload } = report({ verdict: "changes", findings: [{ ...finding, file: "legacy/api/session.ts:5" }] }, diff);
    expect(payload.comments).toEqual([]);
    expect(payload.body).toContain("`legacy/api/session.ts:5`: No role check.");
  });
  it("a line range uses its first line", () => {
    const { payload } = report({ verdict: "changes", findings: [{ ...finding, file: "legacy/api/routes/admin.ts:28-31" }] }, diff);
    expect(payload.comments[0].line).toBe(28);
  });
  it("diffLines: context and added lines of the new file", () => {
    expect([...diffLines(diff)["legacy/api/routes/admin.ts"]]).toEqual([25, 26, 27, 28, 29, 30, 31]);
  });
  it("a missing review.json: error", () => {
    const { state, payload } = report(readReview("no/such/review.json"), diff);
    expect(state).toBe("error");
    expect(payload.body).toContain("could not run");
  });
  it("an invalid review: every problem listed", () => {
    expect(checkReview({ verdict: "maybe", findings: Array(6).fill(finding) })).toEqual(['verdict must be "approve" or "changes"', "at most 5 findings"]);
    expect(checkReview({ verdict: "changes", findings: [{ question: 1 }] })).toEqual(["finding 1 has no file", "finding 1 has no problem", "finding 1 has no fix"]);
  });
});
