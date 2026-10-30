import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { findings, readReport, summary } from "./fallow.mjs";

// The shape of `fallow audit --format json` (3.37), trimmed to what the judge reads.
const REPORT = {
  verdict: "fail",
  dead_code: { unused_files: [{ path: "legacy/api/routes/list.ts", introduced: true, effective_severity: "error" }], unused_exports: [{ path: "lib/api.ts", export_name: "old", line: 4, introduced: false }] },
  duplication: {
    clone_groups: [{ instances: [{ file: "legacy/api/routes/feedback.ts", start_line: 38 }, { file: "legacy/api/routes/list.ts", start_line: 21 }], introduced: true }],
    clone_families: [{ files: ["legacy/api/routes/feedback.ts"], groups: [{ instances: [{ file: "legacy/api/routes/feedback.ts", start_line: 38 }] }] }],
  },
  complexity: {
    findings: [
      { path: "legacy/api/routes/list.ts", name: "listFeedback", line: 5, effective_severity: "warn", introduced: true, attribution: "introduced" },
      { path: "app/page.tsx", name: "Board", line: 9, introduced: false, attribution: "worsened" },
      { path: "app/api/route.ts", name: "handle", line: 3, introduced: false, attribution: "inherited" },
    ],
  },
  diff_risk: { findings: [{ rule: "weakened-tests", path: "tests/a.test.ts", line: 7, message: "The change skips a test", introduced: true }] },
};

describe("fallow", () => {
  test("every finding the PR introduced is new, warnings and worsened ones too", () => {
    const fresh = findings(REPORT).filter((f) => f.isNew).map((f) => `${f.kind} ${f.where} ${f.what}`.trim());
    assert.deepEqual(fresh, [
      "unused files legacy/api/routes/list.ts",
      "duplicated code legacy/api/routes/feedback.ts:38 = legacy/api/routes/list.ts:21",
      "complex function legacy/api/routes/list.ts:5 listFeedback",
      "complex function app/page.tsx:9 Board",
      "risky change tests/a.test.ts:7 The change skips a test",
    ]);
  });
  test("inherited findings are reported, not blocking", () => {
    const old = findings(REPORT).filter((f) => !f.isNew).map((f) => f.where);
    assert.deepEqual(old, ["lib/api.ts:4", "app/api/route.ts:3"]);
    assert.match(summary(findings(REPORT)), /5 new, 2 inherited[\s\S]*not blocking/);
  });
  test("a clean report has no findings, whatever the verdict says", () => {
    assert.deepEqual(findings(readReport(JSON.stringify({ verdict: "pass", summary: {} }), "0")), []);
    assert.match(summary([]), /No new findings/);
  });
  test("a crash is a tool failure, not a pass", () => {
    assert.throws(() => readReport("", "2"), /tool failure/);
    assert.throws(() => readReport("Error: panicked", "1"), /tool failure/);
    assert.throws(() => readReport(JSON.stringify({ verdict: "pass" }), "137"), /tool failure/);
  });
});
