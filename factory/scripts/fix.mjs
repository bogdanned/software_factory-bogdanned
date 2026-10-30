#!/usr/bin/env node
// The fix loop's plain code. `decide` runs in the CI fix job when a factory PR
// goes red: the implementor gets another round, or a human gets the ticket.
// `target` and `failures` feed that round in factory-implement.yml.
// Each round is a PR comment carrying a hidden marker, so the count survives
// across runs and a re-run of the same CI run never starts a second round.
//
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo GITHUB_RUN_ID=123 PR_NUMBER=12 node factory/scripts/fix.mjs decide
//   node factory/scripts/fix.mjs target 12       # {identifier,title,branch,pr} of an open factory PR
//   node factory/scripts/fix.mjs failures 123    # the failed jobs of CI run 123, the end of each log

import crypto from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { configSection } from "./agent.mjs";
import { escalate } from "./implement.mjs";
import { teamKey } from "./linear.mjs";

const MARK = /<!-- factory:(fix-round|escalated) run=(\d+) -->/;
const RED = ["failure", "timed_out"];
const runUrl = (env) => `${env.GITHUB_SERVER_URL || "https://github.com"}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;

// factory/bbd-12-some-title → BBD-12. Anything else is not a factory PR.
export function ticketOf(branch) {
  const m = (branch ?? "").match(/^factory\/([a-z][a-z0-9]*-\d+)(-|$)/);
  if (!m) throw new Error(`${branch} is not a factory branch`);
  return m[1].toUpperCase();
}

// limits.max_fix_rounds in factory.config.yml. Missing: 0, every red PR goes to a human.
export function maxRounds(config) {
  const n = configSection(config, "limits").max_fix_rounds;
  return Number.isInteger(n) ? n : 0;
}

// The markers in the PR's comments, as [{ kind: "fix-round" | "escalated", run: "123" }].
export const marks = (bodies) => bodies.map((b) => (b ?? "").match(MARK)).filter(Boolean).map(([, kind, run]) => ({ kind, run }));

// The names of the jobs that went red, this fix job left out.
export const failedJobs = (jobs) => jobs.filter((j) => RED.includes(j.conclusion) && j.name !== "fix");

// What a red CI run gets: { action: "skip" | "escalate" | "fix", why, round? }.
export function decide({ draft, failed, bodies, runId, max }) {
  const seen = marks(bodies);
  if (!draft) return { action: "skip", why: "the PR is out of draft, a human has it" };
  if (seen.some((m) => m.run === String(runId))) return { action: "skip", why: `CI run ${runId} was already handled` };
  if (seen.some((m) => m.kind === "escalated")) return { action: "skip", why: "the ticket is already escalated" };
  if (!failed.length) return { action: "skip", why: "no job failed" };
  // A guard failure is a broken rule, not a bug: another round would only teach the agent to hide it.
  if (failed.includes("guard")) return { action: "escalate", why: "The guard failed, the change breaks a factory rule" };
  const used = seen.filter((m) => m.kind === "fix-round").length;
  if (used >= max) return { action: "escalate", why: `CI is still red after ${used} of ${max} fix rounds` };
  return { action: "fix", round: used + 1, why: `fix round ${used + 1} of ${max}` };
}

// One GitHub REST call on this repo. `raw` returns the body as text (job logs).
export async function rest(path, { method = "GET", body, raw = false } = {}, env = process.env, fetchFn = fetch) {
  const res = await fetchFn(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}: ${text}`);
  return raw || !text ? text : JSON.parse(text);
}

// The CI fix job: posts the round's comment first (that claims it), then starts the round.
export async function run(env, config, deps = { call: rest, escalate }) {
  const call = (path, init) => deps.call(path, init, env);
  const pr = await call(`/pulls/${env.PR_NUMBER}`);
  const { jobs } = await call(`/actions/runs/${env.GITHUB_RUN_ID}/jobs?per_page=100`);
  const comments = await call(`/issues/${env.PR_NUMBER}/comments?per_page=100`);
  const failed = failedJobs(jobs).map((j) => j.name);
  const max = maxRounds(config);
  const d = decide({ draft: pr.draft, failed, bodies: comments.map((c) => c.body), runId: env.GITHUB_RUN_ID, max });
  if (d.action === "skip") return `fix: nothing to do, ${d.why}.`;

  const ticket = ticketOf(pr.head.ref);
  const say = (text, kind) => call(`/issues/${env.PR_NUMBER}/comments`, { method: "POST", body: { body: `${text} [CI run](${runUrl(env)})\n\n<!-- factory:${kind} run=${env.GITHUB_RUN_ID} -->` } });
  if (d.action === "escalate") {
    await deps.escalate(ticket, teamKey(config), `${d.why}. PR: ${pr.html_url}`, env);
    await say(`${d.why}: ${ticket} is escalated to a human.`, "escalated");
    return `fix: ${ticket} escalated, ${d.why}.`;
  }
  await say(`Fix round ${d.round}/${max}: ${failed.join(", ")} failed. The implementor gets another round.`, "fix-round");
  await call("/actions/workflows/factory-implement.yml/dispatches", { method: "POST", body: { ref: pr.base.ref, inputs: { pr: String(pr.number), ci_run: String(env.GITHUB_RUN_ID) } } });
  return `fix: round ${d.round} of ${max} started for ${ticket}.`;
}

// The PR a fix round works on, checked: open, from this repo, on a factory branch.
export async function target(number, env, call = rest) {
  const pr = await call(`/pulls/${number}`, {}, env);
  if (pr.state !== "open") throw new Error(`PR #${number} is ${pr.state}`);
  if (pr.head.repo?.full_name !== env.GITHUB_REPOSITORY) throw new Error(`PR #${number} comes from another repo`);
  return JSON.stringify({ identifier: ticketOf(pr.head.ref), title: pr.title, branch: pr.head.ref, pr: pr.number }) + "\n";
}

// The end of a job log up to its last error, timestamps and colours stripped.
export function tail(log, n = 80) {
  const lines = log.split(/\r?\n/).map((l) => l.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z ?/, "").replace(/\x1b\[[0-9;]*m/g, ""));
  const end = lines.findLastIndex((l) => l.includes("##[error]"));
  return lines.slice(0, end + 1 || undefined).filter((l) => l.trim()).slice(-n).join("\n");
}

// Every failed job of a CI run: its name, then the end of its log.
export async function failures(runId, env, call = rest) {
  const { jobs } = await call(`/actions/runs/${runId}/jobs?per_page=100`, {}, env);
  const parts = [];
  for (const job of failedJobs(jobs)) parts.push(`### ${job.name} failed\n\n${tail(await call(`/actions/jobs/${job.id}/logs`, { raw: true }, env))}`);
  return parts.join("\n\n") || "(no failed job found)";
}

// $GITHUB_OUTPUT syntax for one multi-line value.
export const asOutput = (key, value) => {
  const eof = `EOF_${crypto.randomUUID()}`;
  return `${key}<<${eof}\n${value}\n${eof}\n`;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, arg] = process.argv.slice(2);
  const env = process.env;
  const write = (text) => (env.GITHUB_OUTPUT ? fs.appendFileSync(env.GITHUB_OUTPUT, text) : process.stdout.write(text));
  const commands = {
    decide: () => run(env, fs.readFileSync("factory.config.yml", "utf8")).then((out) => `${out}\n`),
    target: () => target(arg, env),
    failures: async () => {
      write(asOutput("failures", await failures(arg, env)));
      return "";
    },
  };
  if (!(cmd in commands) || (cmd !== "decide" && !/^\d+$/.test(arg ?? ""))) {
    console.error("usage: fix.mjs decide | target <pr number> | failures <run id>");
    process.exit(1);
  }
  commands[cmd]()
    .then((out) => process.stdout.write(out || ""))
    .catch((e) => {
      console.log(`::error::fix.mjs: ${e.message}`);
      process.exit(1);
    });
}
