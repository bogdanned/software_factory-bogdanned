#!/usr/bin/env node
// The implement workflow's plain code. `pick` takes the next ticket, `finish`
// turns the agent's commits into a draft PR, `escalate` hands a ticket back.
// The agent itself never pushes and never sees the push token.
//
//   node factory/scripts/implement.mjs pick [BBD-12]                      # {identifier,title,branch} or null
//   node factory/scripts/implement.mjs finish BBD-12 factory/bbd-12-slug --spec spec.md --question factory-out/question.md --execution out.json
//   node factory/scripts/implement.mjs escalate BBD-12 "the run failed"

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { comment, getIssue, gql, label, teamKey } from "./linear.mjs";
import { configList } from "./refine.mjs";

export const LABELS = { ready: "factory:ready", inProgress: "factory:in-progress", inReview: "factory:in-review", escalated: "factory:escalated" };
const ID = /^[A-Z][A-Z0-9]*-\d+$/;
const USAGE = "usage: implement.mjs pick [id] | finish <id> <branch> [--spec f] [--question f] [--execution f] [--pr n] | escalate <id> <message>";
const runUrl = (env) => (env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : "a local run");

// factory/<id lowercase>-<slug of the title>, at most 60 characters.
export function branchName(identifier, title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return `factory/${identifier.toLowerCase()}${slug ? `-${slug}` : ""}`;
}

// The oldest factory:ready ticket, or the named one if it is ready.
export function pickFrom(issues, wanted) {
  const ready = issues.filter((i) => i.labels.nodes.some((l) => l.name === LABELS.ready)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (wanted) {
    const issue = ready.find((i) => i.identifier === wanted);
    if (!issue) throw new Error(`${wanted} is not labelled ${LABELS.ready}`);
    return issue;
  }
  return ready[0] ?? null;
}

export async function pick(team, wanted) {
  const { issues } = await gql(
    `query($team: String!, $name: String!) { issues(first: 100, orderBy: createdAt,
      filter: { team: { key: { eq: $team } }, labels: { name: { eq: $name } } }) {
      nodes { identifier title createdAt labels { nodes { name } } } } }`,
    { team, name: LABELS.ready },
  );
  const issue = pickFrom(issues.nodes, wanted);
  if (!issue) return "null\n";
  await label(issue.identifier, team, [LABELS.inProgress], [LABELS.ready]);
  return JSON.stringify({ identifier: issue.identifier, title: issue.title, branch: branchName(issue.identifier, issue.title) }) + "\n";
}

export const touchesProtected = (files, config) => {
  const paths = configList(config, "protected_paths");
  return files.filter((f) => paths.some((p) => f === p || f.startsWith(p.endsWith("/") ? p : `${p}/`)));
};

// total_cost_usd from claude-code-action's execution file (a JSON array with one "result" entry).
export function costOf(text) {
  try {
    const items = JSON.parse(text);
    const r = (Array.isArray(items) ? items : [items]).find((x) => x && typeof x.total_cost_usd === "number");
    return r ? `$${r.total_cost_usd.toFixed(2)}` : "unknown";
  } catch {
    return "unknown";
  }
}

export function prBody({ identifier, spec, cost, run }) {
  return `Fixes ${identifier}\n\n${spec.trim()}\n\n---\nOpened by the factory · cost ${cost} · [run](${run})\n`;
}

const git = (args, env = process.env) => {
  const r = spawnSync("git", args, { encoding: "utf8", env });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr.trim()}`);
  return r.stdout.trim();
};

export async function escalate(id, team, message, env = process.env) {
  const issue = await getIssue(id, team);
  await comment(id, team, `${message}\n\nRun: ${runUrl(env)}`);
  await label(id, team, [LABELS.escalated], [LABELS.inProgress, LABELS.ready, LABELS.inReview]);
  return `${issue.identifier}: escalated\n`;
}

// Why the agent's commits since `base` can't be pushed, or null: none made, or a protected file touched.
export function refusal(base, question, env = process.env, run = git) {
  if (run(["rev-list", "--count", `${base}..HEAD`], env) === "0") {
    const q = question && fs.existsSync(question) ? fs.readFileSync(question, "utf8").trim() : "";
    return q ? `The implementor has a question:\n\n${q}` : "The implementor made no commits and left no question.";
  }
  const changed = run(["diff", "--name-only", base, "HEAD"], env).split("\n").filter(Boolean);
  const bad = touchesProtected(changed, fs.readFileSync("factory.config.yml", "utf8"));
  return bad.length ? `The implementor changed protected files, nothing was pushed: ${bad.join(", ")}` : null;
}

const pushToken = (env) => {
  if (!env.FACTORY_GH_TOKEN) throw new Error("FACTORY_GH_TOKEN is not set");
  return env.FACTORY_GH_TOKEN;
};
const remote = (env) => `https://x-access-token:${pushToken(env)}@github.com/${env.GITHUB_REPOSITORY}.git`;

// After the agent ran on the current branch: no commits or a protected file → escalate;
// otherwise push with FACTORY_GH_TOKEN, open a draft PR, move the ticket to in-review.
export async function finish(id, branch, { spec, question, execution } = {}, env = process.env, deps = { git, fetchFn: fetch }) {
  const issue = await getIssue(id, teamKey());
  const stop = refusal(env.BASE_SHA || "origin/main", question, env, deps.git);
  if (stop) return escalate(id, issue.team.key, stop, env);

  const token = pushToken(env);
  deps.git(["push", "--force-with-lease", remote(env), `HEAD:refs/heads/${branch}`], env);
  const body = prBody({ identifier: issue.identifier, spec: spec && fs.existsSync(spec) ? fs.readFileSync(spec, "utf8") : "", cost: execution && fs.existsSync(execution) ? costOf(fs.readFileSync(execution, "utf8")) : "unknown", run: runUrl(env) });
  const res = await deps.fetchFn(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/pulls`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({ title: `${issue.identifier}: ${issue.title ?? ""}`.trim(), head: branch, base: env.BASE_BRANCH || "main", body, draft: true }),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  const pr = await res.json();
  await comment(id, issue.team.key, `Draft PR: ${pr.html_url}`);
  await label(id, issue.team.key, [LABELS.inReview], [LABELS.inProgress]);
  return `${issue.identifier}: ${pr.html_url}\n`;
}

// A fix round: the new commits go on top of the PR's branch. No force, no new PR;
// the push re-runs CI on the PR.
export async function finishFix(id, branch, pr, { question } = {}, env = process.env, deps = { git }) {
  const issue = await getIssue(id, teamKey());
  const stop = refusal(env.BASE_SHA || `origin/${branch}`, question, env, deps.git);
  if (stop) return escalate(id, issue.team.key, `Fix round on PR #${pr}: ${stop}`, env);
  deps.git(["push", remote(env), `HEAD:refs/heads/${branch}`], env);
  return `${issue.identifier}: fix pushed to PR #${pr}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, id, ...rest] = process.argv.slice(2);
  const opts = {};
  for (let i = 1; i < rest.length; i += 2) if (["--spec", "--question", "--execution", "--pr"].includes(rest[i]) && rest[i + 1]) opts[rest[i].slice(2)] = rest[i + 1];
  const run = cmd === "pick" && (!id || ID.test(id)) ? () => pick(teamKey(), id)
    : cmd === "finish" && ID.test(id ?? "") && rest[0] && opts.pr ? () => finishFix(id, rest[0], opts.pr, opts)
    : cmd === "finish" && ID.test(id ?? "") && rest[0] ? () => finish(id, rest[0], opts)
    : cmd === "escalate" && ID.test(id ?? "") && rest.join(" ").trim() ? () => escalate(id, teamKey(), rest.join(" ").trim())
    : null;
  if (!run) {
    console.error(USAGE);
    process.exit(1);
  }
  run()
    .then((out) => process.stdout.write(out))
    .catch((e) => {
      console.error(`implement.mjs: ${e.message}`);
      process.exit(1);
    });
}