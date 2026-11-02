#!/usr/bin/env node
// Plain code, no AI: checks the reviewer's review.json and turns it into a GitHub
// PR review: a summary, each finding inline on its line, and what to do next.
//
//   node factory/scripts/review-report.mjs factory-out/review.json factory-out/pr.diff review-payload.json
//
// Prints success (approve), failure (changes) or error (missing or invalid).
// The payload is the body of POST /repos/{repo}/pulls/{n}/reviews. It never approves:
// "changes" requests changes, everything else is a plain comment.

import fs from "node:fs";
import { pathToFileURL } from "node:url";

const QUESTIONS = { 1: "Architecture", 2: "Duplication", 3: "Regression test", 4: "Security" };
const FIELDS = ["question", "file", "problem", "fix"];
const NEXT = {
  failure:
    "**What now:** fix each finding on this branch and push, or add the `factory:fix` label to let the implementor fix them (one fix round). The review runs again on every push; when it approves, `factory/ai-review` turns green and the merge unblocks.",
  error: "**What now:** nothing was reviewed. Push again to retry, or review this PR yourself.",
};

export function readFile(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

// review.json as an object, or null when it is missing or not JSON.
export function readReview(file) {
  try {
    return JSON.parse(readFile(file));
  } catch {
    return null;
  }
}

// What is wrong with a review. An empty list means it is valid.
export function checkReview(review) {
  if (!review || typeof review !== "object") return ["review.json is missing or not JSON"];
  const problems = [];
  if (!["approve", "changes"].includes(review.verdict)) problems.push('verdict must be "approve" or "changes"');
  if (!Array.isArray(review.findings)) return [...problems, "findings must be a list"];
  if (review.findings.length > 5) problems.push("at most 5 findings");
  review.findings.forEach((finding, i) => {
    for (const field of FIELDS) if (!finding?.[field]) problems.push(`finding ${i + 1} has no ${field}`);
  });
  return problems;
}

// The lines of the new code that the diff shows, per file. GitHub only takes
// an inline comment on one of these.
export function diffLines(diff) {
  /** @type {Record<string, Set<number>>} */
  const lines = {};
  let file = null;
  let line = 0;
  for (const text of (diff ?? "").split("\n")) {
    if (text.startsWith("+++ ")) {
      file = text.startsWith("+++ b/") ? text.slice(6) : null;
      if (file) lines[file] ??= new Set();
    } else if (text.startsWith("@@")) {
      line = Number(text.match(/\+(\d+)/)?.[1] ?? 0);
    } else if (file && (text.startsWith("+") || text.startsWith(" "))) {
      lines[file].add(line++);
    }
  }
  return lines;
}

// "path:12" or "path:12-15" → { path, line }
export function parseLocation(location) {
  const m = String(location).match(/^(.+?):(\d+)(?:-\d+)?$/);
  return m ? { path: m[1], line: Number(m[2]) } : { path: String(location), line: null };
}

const title = (f) => `**${QUESTIONS[f.question] ?? `Question ${f.question}`}**`;

// The review payload and the status state for one review.
export function report(review, diff) {
  const problems = checkReview(review);
  if (problems.length) {
    return { state: "error", payload: { event: "COMMENT", body: `### Factory review: could not run\n\n${problems.join("; ")}.\n\n${NEXT.error}\n`, comments: [] } };
  }
  const state = review.verdict === "approve" ? "success" : "failure";
  const shown = diffLines(diff);
  const comments = [];
  const elsewhere = [];
  review.findings.forEach((f, i) => {
    const { path, line } = parseLocation(f.file);
    if (line && shown[path]?.has(line)) comments.push({ path, line, side: "RIGHT", body: `${title(f)}: ${f.problem}\n\n**Fix:** ${f.fix}` });
    else elsewhere.push(`${i + 1}. ${title(f)} \`${f.file}\`: ${f.problem}\n   **Fix:** ${f.fix}`);
  });

  const parts = [state === "success" ? "### Factory review: approve" : "### Factory review: changes requested"];
  if (!review.findings.length) parts.push("No findings.");
  if (comments.length) parts.push(`${comments.length} finding${comments.length > 1 ? "s" : ""} inline on the diff, in **Files changed**.`);
  if (elsewhere.length) parts.push(`On lines outside the diff:\n\n${elsewhere.join("\n")}`);
  if (NEXT[state]) parts.push(NEXT[state]);
  return { state, payload: { event: state === "failure" ? "REQUEST_CHANGES" : "COMMENT", body: parts.join("\n\n") + "\n", comments } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [reviewFile, diffFile, payloadFile] = process.argv.slice(2);
  if (!reviewFile || !diffFile || !payloadFile) {
    console.error("usage: review-report.mjs <review.json> <pr.diff> <payload.json>");
    process.exit(1);
  }
  const { state, payload } = report(readReview(reviewFile), readFile(diffFile));
  fs.writeFileSync(payloadFile, JSON.stringify(payload));
  console.log(state);
}
