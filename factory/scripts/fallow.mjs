#!/usr/bin/env node
// The fallow CI job's judge. Fails on every finding the PR introduced, even one
// Fallow only warns about. Inherited debt goes to the job summary, never blocks.
//
//   npx fallow audit --base origin/main --format json --quiet > fallow.json; echo $? > fallow.exit
//   node factory/scripts/fallow.mjs fallow.json "$(cat fallow.exit)"

import fs from "node:fs";
import { pathToFileURL } from "node:url";

// "legacy/a.ts:12" for one place, "a.ts:3 = b.ts:9" for a clone group.
const where = (f) => (f.instances ? f.instances.map((i) => `${i.file}:${i.start_line}`).join(" = ") : `${f.path ?? f.file}${f.line ? `:${f.line}` : ""}`);
const what = (f) => f.name ?? f.export_name ?? f.package_name ?? f.message ?? "";
// The JSON list a finding sits in, in words: "dead_code.unused_files" → "unused files".
const KINDS = { "duplication.clone_groups": "duplicated code", "complexity.findings": "complex function", "diff_risk.findings": "risky change" };
const kindOf = (section, key) => KINDS[`${section}.${key}`] ?? key.replaceAll("_", " ");

// Inside a list the kind stays; a list names it; any other object is a section.
const childKind = (node, kind, key, value) => (Array.isArray(node) ? kind : Array.isArray(value) ? kindOf(kind, key) : key);

// Every finding in the report is an object carrying "introduced". Worsened complexity counts as new.
export function findings(report) {
  const out = [];
  const walk = (node, kind) => {
    if ("introduced" in node) return out.push({ kind, where: where(node), what: what(node), isNew: node.introduced === true || node.attribution === "worsened" });
    for (const [key, value] of Object.entries(node)) if (value && typeof value === "object") walk(value, childKind(node, kind, key, value));
  };
  walk(report, "");
  return out;
}

// Exit 0 or 1 with a JSON verdict is a finished audit. Anything else is Fallow itself failing.
export function readReport(text, exitCode) {
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    report = null;
  }
  if (![0, 1].includes(Number(exitCode)) || typeof report?.verdict !== "string") {
    throw new Error(`Fallow crashed (exit ${exitCode}). This is a tool failure, not a finding in your code: re-run the job.`);
  }
  return report;
}

const line = (f) => `- ${f.kind}: \`${f.where}\`${f.what ? ` ${f.what}` : ""}`;

export function summary(all) {
  const fresh = all.filter((f) => f.isNew);
  const old = all.filter((f) => !f.isNew);
  return [
    `## Fallow: ${fresh.length} new, ${old.length} inherited`,
    fresh.length ? `### New in this PR (blocking)\n${fresh.map(line).join("\n")}` : "No new findings.",
    old.length ? `### Inherited debt in the changed files (not blocking)\n${old.map(line).join("\n")}` : "",
  ].filter(Boolean).join("\n\n") + "\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, exitCode] = process.argv.slice(2);
  try {
    const all = findings(readReport(fs.existsSync(file ?? "") ? fs.readFileSync(file, "utf8") : "", exitCode));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(all));
    const fresh = all.filter((f) => f.isNew);
    for (const f of fresh) console.log(`::error::new ${line(f).slice(2)}`);
    console.log(fresh.length ? `fallow: ${fresh.length} new finding(s), fix them or remove the code.` : "fallow: no new findings.");
    process.exit(fresh.length ? 1 : 0);
  } catch (e) {
    console.log(`::error::${e.message}`);
    process.exit(1);
  }
}
