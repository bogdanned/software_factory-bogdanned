import { describe, expect, it } from "vitest";
import { checkResults, report } from "@/factory/scripts/qa-report.mjs";

const row = (criterion: number, verdict: string) => ({ criterion, verdict, observed: "seen", screenshot: `qa-out/media/${criterion}.png` });
const checks = (results: Record<number, boolean>) => ({
  suites: Object.entries(results).map(([n, ok]) => ({ file: `${n}.spec.ts`, specs: [{ ok }] })),
});

describe("qa-report", () => {
  it("every pass with a passing check: success", () => {
    expect(report({ stack: "success", qa: [row(1, "pass")], checks: checks({ 1: true }) }).state).toBe("success");
  });
  it("the agent says fail: failure", () => {
    expect(report({ stack: "success", qa: [row(1, "fail")], checks: checks({ 1: false }) }).state).toBe("failure");
  });
  it("the agent says pass but its check fails: failure", () => {
    const { state, comment } = report({ stack: "success", qa: [row(1, "pass")], checks: checks({ 1: false }) });
    expect(state).toBe("failure");
    expect(comment).toContain("| 1 | ❌ | pass | fail |");
  });
  it("a pass with no check: failure", () => {
    expect(report({ stack: "success", qa: [row(1, "pass")], checks: checks({}) }).state).toBe("failure");
  });
  it("untestable never fails", () => {
    expect(report({ stack: "success", qa: [row(1, "pass"), row(2, "untestable")], checks: checks({ 1: true }) }).state).toBe("success");
  });
  it("the stack never started: error", () => {
    const { state, comment } = report({ stack: "failure", qa: null, checks: null });
    expect(state).toBe("error");
    expect(comment).toContain("no fix round spent");
  });
  it("no qa.json: error", () => {
    expect(report({ stack: "success", qa: null, checks: null }).state).toBe("error");
  });
  it("a bad verdict: error", () => {
    expect(report({ stack: "success", qa: [row(1, "maybe")], checks: null }).state).toBe("error");
  });
  it("reads nested Playwright suites", () => {
    const nested = { suites: [{ file: "2.spec.ts", specs: [], suites: [{ specs: [{ ok: true }, { ok: false }] }] }] };
    expect(checkResults(nested)).toEqual({ 2: "fail" });
  });
});
