#!/usr/bin/env node
// The refine workflow's plain code: which tickets to refine, and how the
// refiner's answer lands in Linear. The refiner itself never touches Linear.
//
//   node factory/scripts/refine.mjs sweep                                    # ids to refine, oldest first, as JSON
//   node factory/scripts/refine.mjs apply BBD-12 factory-out/refinement.json

import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { comment, getIssue, gql, label, teamKey } from "./linear.mjs";

export const LABELS = { new: "factory:new", refined: "factory:refined", needsInfo: "factory:needs-info", escalated: "factory:escalated", ready: "factory:ready" };
export const QUESTION_MARK = "<!-- factory-question -->";
const ID = /^[A-Z][A-Z0-9]*-\d+$/;
const USAGE = "usage: refine.mjs sweep | apply <id> <refinement.json>";

// The "- item" lines under one top-level key of factory.config.yml, e.g. protected_paths.
export function configList(text, key) {
  const m = text.match(new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]+-.*\\n?)*)`, "m"));
  if (!m) return [];
  return m[1].split("\n").map((l) => l.replace(/^[ \t]+-[ \t]*/, "").trim()).filter(Boolean);
}

const byCreated = (a, b) => a.createdAt.localeCompare(b.createdAt);

// Every factory:new ticket, and every factory:needs-info ticket where a human
// commented after the factory's last question. Oldest first.
export function toRefine(issues) {
  return [...issues].sort(byCreated).filter((issue) => {
    const names = issue.labels.nodes.map((l) => l.name);
    if (names.includes(LABELS.new)) return true;
    if (!names.includes(LABELS.needsInfo)) return false;
    const comments = [...issue.comments.nodes].sort(byCreated);
    const asked = comments.filter((c) => c.body.startsWith(QUESTION_MARK)).at(-1);
    return Boolean(asked) && comments.some((c) => c.createdAt > asked.createdAt && !c.body.startsWith(QUESTION_MARK));
  }).map((issue) => issue.identifier);
}

export async function sweep(team) {
  const { issues } = await gql(
    `query($team: String!, $names: [String!]) { issues(first: 100, orderBy: createdAt,
      filter: { team: { key: { eq: $team } }, labels: { name: { in: $names } } }) {
      nodes { identifier createdAt labels { nodes { name } } comments(first: 100) { nodes { body createdAt } } }
    } }`,
    { team, names: [LABELS.new, LABELS.needsInfo] },
  );
  const ids = toRefine(issues.nodes).filter((id) => ID.test(id));
  return JSON.stringify(ids) + "\n";
}

// Does a file sit under one of the paths? A path ending in "/" is a folder.
const touches = (files, paths) => files.some((f) => paths.some((p) => f === p || f.startsWith(p.endsWith("/") ? p : `${p}/`)));

// The refiner's JSON, checked. Anything it may not decide is decided here: a file
// under protected_paths or high_blast_paths forces blast high.
export function parseRefinement(text, config) {
  let r;
  try {
    r = JSON.parse(text);
  } catch {
    throw new Error("refinement.json is not valid JSON");
  }
  if (!["refined", "needs-info"].includes(r.verdict)) throw new Error(`verdict "${r.verdict}" is not "refined" or "needs-info"`);
  const files = Array.isArray(r.files) ? r.files.filter((f) => typeof f === "string") : [];
  if (r.verdict === "needs-info") {
    if (typeof r.question !== "string" || !r.question.trim()) throw new Error("needs-info without a question");
    return { verdict: "needs-info", question: r.question.trim(), files };
  }
  if (typeof r.spec_md !== "string" || !r.spec_md.trim()) throw new Error("refined without spec_md");
  if (![1, 2, 4, 8, 16].includes(r.estimate)) throw new Error(`estimate ${JSON.stringify(r.estimate)} is not 1, 2, 4, 8 or 16`);
  if (!["low", "high"].includes(r.blast_radius)) throw new Error(`blast_radius ${JSON.stringify(r.blast_radius)} is not "low" or "high"`);
  const risky = [...configList(config, "protected_paths"), ...configList(config, "high_blast_paths")];
  const blast_radius = touches(files, risky) ? "high" : r.blast_radius;
  return { verdict: "refined", spec_md: r.spec_md.trim(), estimate: r.estimate, blast_radius, files };
}

// Labels a refinement adds and removes. factory:ready is never among them.
export function labelChanges(r) {
  const add = r.verdict === "refined" ? [`blast:${r.blast_radius}`, LABELS.refined] : [LABELS.needsInfo];
  const remove = [LABELS.new, LABELS.needsInfo, "blast:low", "blast:high"].filter((x) => !add.includes(x));
  if (add.includes(LABELS.ready)) throw new Error("a refinement can never add factory:ready");
  return r.verdict === "refined" ? { add, remove } : { add, remove: [LABELS.new] };
}

const runUrl = (env) => (env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : "a local run");

// Writes one refinement to its ticket. A bad or missing file escalates the ticket and changes nothing else.
export async function apply(id, team, file, env = process.env) {
  const issue = await getIssue(id, team);
  let r;
  try {
    if (!fs.existsSync(file)) throw new Error(`${file} is missing`);
    r = parseRefinement(fs.readFileSync(file, "utf8"), fs.readFileSync("factory.config.yml", "utf8"));
  } catch (e) {
    await comment(id, team, `The factory could not apply the refiner's output: ${e.message}.\n\nRun: ${runUrl(env)}`);
    await label(id, team, [LABELS.escalated], [LABELS.new, LABELS.needsInfo]);
    return `${issue.identifier}: escalated (${e.message})\n`;
  }
  const { add, remove } = labelChanges(r);
  if (r.verdict === "needs-info") {
    await comment(id, team, `${QUESTION_MARK}\n${r.question}\n\n_Answer in a comment and the next sweep refines this ticket._`);
  } else {
    const original = issue.description?.trim();
    const description = [r.spec_md, "---", `Source: ${runUrl(env)} · Estimate: ${r.estimate}`, ...(original ? ["## Original report", original] : [])].join("\n\n");
    await gql(`mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`, { id: issue.id, input: { description, estimate: r.estimate } });
  }
  const labels = await label(id, team, add, remove);
  return `${issue.identifier}: ${r.verdict}${r.verdict === "refined" ? `, blast ${r.blast_radius}, estimate ${r.estimate}` : ""}\n${labels}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, id, file] = process.argv.slice(2);
  const run = cmd === "sweep" && !id ? () => sweep(teamKey())
    : cmd === "apply" && ID.test(id ?? "") && file ? () => apply(id, teamKey(), file)
    : null;
  if (!run) {
    console.error(USAGE);
    process.exit(1);
  }
  run()
    .then((out) => process.stdout.write(out))
    .catch((e) => {
      console.error(`refine.mjs: ${e.message}`);
      process.exit(1);
    });
}