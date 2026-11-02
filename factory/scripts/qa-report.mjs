#!/usr/bin/env node
// Plain code, no AI: joins the QA agent's verdicts with the re-run of its checks,
// writes the PR comment and prints the state of the factory/qa status.
//
//   node factory/scripts/qa-report.mjs <stack outcome> qa-out/qa.json qa-out/checks.json comment.md
//
// Prints failure (a criterion failed), success, or error (QA could not run).

import fs from "node:fs";
import { pathToFileURL } from "node:url";

const VERDICTS = ["pass", "fail", "untestable"];
const ICON = { pass: "✅", fail: "❌", untestable: "➖" };
const COULD_NOT_RUN = "**Factory QA could not run, no fix round spent.**";

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// What is wrong with qa.json. An empty list means it is valid.
export function checkQa(qa) {
  if (!Array.isArray(qa) || !qa.length) return ["qa.json is missing, empty or not a list"];
  const problems = [];
  qa.forEach((row, i) => {
    if (!Number.isInteger(row?.criterion)) problems.push(`row ${i + 1} has no criterion number`);
    if (!VERDICTS.includes(row?.verdict)) problems.push(`row ${i + 1}: verdict must be pass, fail or untestable`);
  });
  return problems;
}

// Playwright's JSON report → { 1: "pass" | "fail" } per checks/<n>.spec.ts.
export function checkResults(report) {
  const out = {};
  const walk = (suite) => {
    const n = Number(suite.file?.match(/(\d+)\.spec\.ts$/)?.[1]);
    for (const spec of suite.specs ?? []) {
      if (n) out[n] = out[n] === "fail" || !spec.ok ? "fail" : "pass";
    }
    for (const child of suite.suites ?? []) walk({ file: suite.file, ...child });
  };
  for (const suite of report?.suites ?? []) walk(suite);
  return out;
}

// One row per criterion. A pass needs its check to pass too; untestable never fails.
export function judge(qa, checks) {
  return qa.map((row) => {
    const check = row.verdict === "untestable" ? "-" : (checks[row.criterion] ?? "missing");
    const failed = row.verdict === "fail" || (row.verdict === "pass" && check !== "pass");
    return { ...row, check, result: row.verdict === "untestable" ? "untestable" : failed ? "fail" : "pass" };
  });
}

const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

// The status state and the PR comment.
export function report({ stack, qa, checks, runUrl = "" }) {
  if (stack !== "success") return { state: "error", comment: `${COULD_NOT_RUN} The app or the ticket never loaded (install, migrate, seed, build, start or Linear failed). [Run](${runUrl})\n` };
  const problems = checkQa(qa);
  if (problems.length) return { state: "error", comment: `${COULD_NOT_RUN} ${problems.join("; ")}. [Run](${runUrl})\n` };

  const rows = judge(qa, checkResults(checks));
  const state = rows.some((r) => r.result === "fail") ? "failure" : "success";
  const title = state === "success" ? "**Factory QA: every criterion holds.**" : "**Factory QA: a criterion fails.**";
  const table = [
    "| # | Result | Agent | Check | Observed | Evidence |",
    "|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.criterion} | ${ICON[r.result]} | ${r.verdict} | ${r.check} | ${cell(r.observed)} | ${cell(r.screenshot)} |`),
  ];
  return { state, comment: `${title}\n\n${table.join("\n")}\n\nScreenshots and checks: the \`qa-out\` artifact of the [run](${runUrl}).\n` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [stack, qaFile, checksFile, commentFile] = process.argv.slice(2);
  if (!commentFile) {
    console.error("usage: qa-report.mjs <stack outcome> <qa.json> <checks.json> <comment.md>");
    process.exit(1);
  }
  const { state, comment } = report({ stack, qa: readJson(qaFile), checks: readJson(checksFile), runUrl: process.env.RUN_URL });
  fs.writeFileSync(commentFile, comment);
  console.log(state);
}
