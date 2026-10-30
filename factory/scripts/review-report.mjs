#!/usr/bin/env node
// Plain code, no AI: checks the reviewer's review.json, writes the PR comment
// and prints the state of the factory/ai-review status.
//
//   node factory/scripts/review-report.mjs factory-out/review.json comment.md
//
// Prints success (approve), failure (changes) or error (missing or invalid).

import fs from "node:fs";
import { pathToFileURL } from "node:url";

const QUESTIONS = { 1: "Architecture", 2: "Duplication", 3: "Regression test", 4: "Security" };
const FIELDS = ["question", "file", "problem", "fix"];

// review.json as an object, or null when it is missing or not JSON.
export function readReview(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
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

// One numbered line per finding: question, file, problem, fix.
function findingLines(findings) {
  return findings.map((f, i) => `${i + 1}. **${QUESTIONS[f.question] ?? `Question ${f.question}`}** \`${f.file}\`: ${f.problem}\n   Fix: ${f.fix}`);
}

// The status state and the PR comment for one review.
export function report(review) {
  const problems = checkReview(review);
  if (problems.length) {
    return { state: "error", comment: `**Factory review: the review could not run.** ${problems.join("; ")}.\n\nNothing was reviewed: check this PR yourself, or push again to retry.\n` };
  }
  const state = review.verdict === "approve" ? "success" : "failure";
  const title = state === "success" ? "**Factory review: approve.**" : "**Factory review: changes requested.**";
  const body = review.findings.length ? findingLines(review.findings).join("\n") : "No findings.";
  return { state, comment: `${title}\n\n${body}\n` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [reviewFile, commentFile] = process.argv.slice(2);
  if (!reviewFile || !commentFile) {
    console.error("usage: review-report.mjs <review.json> <comment.md>");
    process.exit(1);
  }
  const { state, comment } = report(readReview(reviewFile));
  fs.writeFileSync(commentFile, comment);
  console.log(state);
}
