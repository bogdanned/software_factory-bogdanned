#!/usr/bin/env node
// The guard CI job. On a factory/ branch, fails when the PR touches a protected
// path, skips or focuses a test, silences TypeScript or ESLint, or deletes a
// test file. Any other branch passes at once.
//
//   HEAD_REF=factory/bbd-12-x BASE_REF=main node factory/scripts/guard.mjs

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { touchesProtected } from "./implement.mjs";

const TEST_FILE = /(^|\/)(tests?|e2e|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
export const isTest = (file) => TEST_FILE.test(file ?? "");

// [what an added line may not contain, the rule it breaks, only in test files?]
const LINE_RULES = [
  [/\.(skip|only)\(/, "adds .skip( or .only( to a test", true],
  [/@ts-ignore|@ts-expect-error/, "adds @ts-ignore or @ts-expect-error", false],
  [/eslint-disable/, "adds eslint-disable", false],
];

// `git diff --name-status` into [{ status: "M", paths: ["a.ts"] }]; a rename has [old, new].
export const parseChanges = (text) => text.split("\n").filter(Boolean).map((l) => {
  const [status, ...paths] = l.split("\t");
  return { status: status[0], paths };
});

// `git diff -U0` into the added lines, as [{ file, text }].
export function addedLines(diff) {
  const out = [];
  let file = null;
  for (const l of diff.split("\n")) {
    if (l.startsWith("+++ ")) file = l.startsWith("+++ b/") ? l.slice(6) : null;
    else if (l.startsWith("+") && file) out.push({ file, text: l.slice(1) });
  }
  return out;
}

const deletesTest = (c) => isTest(c.paths[0]) && (c.status === "D" || (c.status === "R" && !isTest(c.paths[1])));
const breaks = ({ file, text }) => LINE_RULES.filter(([re, , testsOnly]) => (!testsOnly || isTest(file)) && re.test(text)).map(([, rule]) => `${file}: ${rule}`);

// Every broken rule as "file: rule", each once.
export function violations(changes, added, config) {
  const out = [
    ...touchesProtected(changes.flatMap((c) => c.paths), config).map((f) => `${f}: touches protected_paths in factory.config.yml`),
    ...changes.filter(deletesTest).map((c) => `${c.paths[0]}: deletes a test file`),
    ...added.flatMap(breaks),
  ];
  return [...new Set(out)];
}

const git = (args) => {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.trim()}`);
  return r.stdout;
};

// The guard's verdict for one PR: null when it passes, else the broken rules.
export function guard(env, run = git) {
  if (!(env.HEAD_REF ?? "").startsWith("factory/")) return null;
  const range = `origin/${env.BASE_REF || "main"}...HEAD`;
  const changes = parseChanges(run(["diff", "--name-status", range]));
  const added = addedLines(run(["diff", "-U0", "--no-color", range]));
  const bad = violations(changes, added, fs.readFileSync("factory.config.yml", "utf8"));
  return bad.length ? bad : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const bad = guard(process.env);
    if (!bad) console.log(process.env.HEAD_REF?.startsWith("factory/") ? "guard: clean." : `guard: ${process.env.HEAD_REF || "this branch"} is not a factory branch, nothing to check.`);
    for (const b of bad ?? []) console.log(`::error::${b}`);
    process.exit(bad ? 1 : 0);
  } catch (e) {
    console.log(`::error::guard.mjs: ${e.message}`);
    process.exit(1);
  }
}
