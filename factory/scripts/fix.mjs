#!/usr/bin/env node
// The fix loop's plain code. `decide` runs in the CI fix job when a factory PR
// goes red: the implementor gets another round, or a human gets the ticket.
// `target` and `failures` feed that round in factory-implement.yml.
// Each round is a PR comment carrying a hidden marker, so the count survives
// across runs and a re-run of the same CI run never starts a second round.
//
//   node factory/scripts/fix.mjs decide          # in the CI fix job
//   node factory/scripts/fix.mjs target 12       # the ticket of factory PR #12
//   node factory/scripts/fix.mjs failures 123    # the red jobs of CI run 123, the end of each log

import crypto from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { configSection } from "./agent.mjs";
import { escalate } from "./implement.mjs";
import { teamKey } from "./linear.mjs";

const MARK = /<!-- factory:(fix-round|escalated) run=(\d+) -->/;
const RED = ["failure", "timed_out"];
const USAGE = "usage: fix.mjs decide | target <pr number> | failures <run id>";

// The link to the CI run this script runs in.
function runUrl(env) {
  const server = env.GITHUB_SERVER_URL || "https://github.com";
  return `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
}

// The ticket id in a factory branch name: factory/bbd-12-some-title → BBD-12, or null.
export function ticketOf(branch) {
  const match = (branch ?? "").match(/^factory\/([a-z][a-z0-9]*-\d+)(-|$)/);
  return match ? match[1].toUpperCase() : null;
}

// limits.max_fix_rounds in factory.config.yml. Missing: 0, every red PR goes to a human.
export function maxRounds(config) {
  const rounds = configSection(config, "limits").max_fix_rounds;
  return Number.isInteger(rounds) ? rounds : 0;
}

// The markers in the PR's comments, as [{ kind: "fix-round" | "escalated", run: "123" }].
export function marks(bodies) {
  const found = [];
  for (const body of bodies) {
    const match = (body ?? "").match(MARK);
    if (match) found.push({ kind: match[1], run: match[2] });
  }
  return found;
}

// The jobs that went red, this fix job left out.
export function failedJobs(jobs) {
  return jobs.filter((job) => RED.includes(job.conclusion) && job.name !== "fix");
}

// What a red CI run gets: { action: "skip" | "escalate" | "fix", why, round? }.
export function decide({ ticket, draft, failed, bodies, runId, max }) {
  const seen = marks(bodies);
  if (!ticket) return { action: "skip", why: "the branch names no ticket, there is nobody to hand it to" };
  if (!draft) return { action: "skip", why: "the PR is out of draft, a human has it" };
  if (seen.some((m) => m.run === String(runId))) return { action: "skip", why: `CI run ${runId} was already handled` };
  if (seen.some((m) => m.kind === "escalated")) return { action: "skip", why: "the ticket is already escalated" };
  if (failed.length === 0) return { action: "skip", why: "no job failed" };
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
  if (raw || !text) return text;
  return JSON.parse(text);
}

// A PR comment text that ends with the hidden marker for this CI run.
function markedComment(text, kind, env) {
  return `${text} [CI run](${runUrl(env)})\n\n<!-- factory:${kind} run=${env.GITHUB_RUN_ID} -->`;
}

// The CI fix job: reads the PR, its comments and the red jobs, then skips, escalates or starts a round.
export async function run(env, config, deps = { call: rest, escalate }) {
  const call = (path, init) => deps.call(path, init, env);
  const pr = await call(`/pulls/${env.PR_NUMBER}`);
  const { jobs } = await call(`/actions/runs/${env.GITHUB_RUN_ID}/jobs?per_page=100`);
  const comments = await call(`/issues/${env.PR_NUMBER}/comments?per_page=100`);
  const failed = failedJobs(jobs).map((job) => job.name);
  const max = maxRounds(config);
  const ticket = ticketOf(pr.head.ref);
  const bodies = comments.map((c) => c.body);
  const decision = decide({ ticket, draft: pr.draft, failed, bodies, runId: env.GITHUB_RUN_ID, max });
  const postComment = (text, kind) => call(`/issues/${env.PR_NUMBER}/comments`, { method: "POST", body: { body: markedComment(text, kind, env) } });

  if (decision.action === "skip") return `fix: nothing to do, ${decision.why}.`;
  if (decision.action === "escalate") {
    await deps.escalate(ticket, teamKey(config), `${decision.why}. PR: ${pr.html_url}`, env);
    await postComment(`${decision.why}: ${ticket} is escalated to a human.`, "escalated");
    return `fix: ${ticket} escalated, ${decision.why}.`;
  }
  // The comment goes first: it claims this round, then the round starts.
  await postComment(`Fix round ${decision.round}/${max}: ${failed.join(", ")} failed. The implementor gets another round.`, "fix-round");
  const inputs = { pr: String(pr.number), ci_run: String(env.GITHUB_RUN_ID) };
  await call("/actions/workflows/factory-implement.yml/dispatches", { method: "POST", body: { ref: pr.base.ref, inputs } });
  return `fix: round ${decision.round} of ${max} started for ${ticket}.`;
}

// The PR a fix round works on, checked: open, from this repo, on a factory branch.
export async function target(number, env, call = rest) {
  const pr = await call(`/pulls/${number}`, {}, env);
  if (pr.state !== "open") throw new Error(`PR #${number} is ${pr.state}`);
  if (pr.head.repo?.full_name !== env.GITHUB_REPOSITORY) throw new Error(`PR #${number} comes from another repo`);
  const identifier = ticketOf(pr.head.ref);
  if (!identifier) throw new Error(`${pr.head.ref} names no ticket`);
  return JSON.stringify({ identifier, title: pr.title, branch: pr.head.ref, pr: pr.number }) + "\n";
}

// One log line without its timestamp and terminal colours.
function cleanLine(line) {
  return line.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z ?/, "").replace(/\x1b\[[0-9;]*m/g, "");
}

// The last `n` lines of a job log, up to its last error.
export function tail(log, n = 80) {
  const lines = log.split(/\r?\n/).map(cleanLine);
  const lastError = lines.findLastIndex((line) => line.includes("##[error]"));
  const upToError = lastError === -1 ? lines : lines.slice(0, lastError + 1);
  return upToError.filter((line) => line.trim()).slice(-n).join("\n");
}

// Every red job of a CI run: its name, then the end of its log.
export async function failures(runId, env, call = rest) {
  const { jobs } = await call(`/actions/runs/${runId}/jobs?per_page=100`, {}, env);
  const parts = [];
  for (const job of failedJobs(jobs)) {
    const log = await call(`/actions/jobs/${job.id}/logs`, { raw: true }, env);
    parts.push(`### ${job.name} failed\n\n${tail(log)}`);
  }
  return parts.join("\n\n") || "(no failed job found)";
}

// One multi-line value in $GITHUB_OUTPUT syntax.
export function asOutput(key, value) {
  const eof = `EOF_${crypto.randomUUID()}`;
  return `${key}<<${eof}\n${value}\n${eof}\n`;
}

// Writes the red jobs' logs to $GITHUB_OUTPUT as `failures` (or returns them to print).
async function writeFailures(runId, env) {
  const output = asOutput("failures", await failures(runId, env));
  if (!env.GITHUB_OUTPUT) return output;
  fs.appendFileSync(env.GITHUB_OUTPUT, output);
  return "";
}

// Runs one command from the command line and returns what to print.
async function main(cmd, arg, env) {
  if (cmd === "decide") return (await run(env, fs.readFileSync("factory.config.yml", "utf8"))) + "\n";
  if (!/^\d+$/.test(arg ?? "")) throw new Error(USAGE);
  if (cmd === "target") return target(arg, env);
  if (cmd === "failures") return writeFailures(arg, env);
  throw new Error(USAGE);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, arg] = process.argv.slice(2);
  main(cmd, arg, process.env)
    .then((out) => process.stdout.write(out))
    .catch((e) => {
      console.log(`::error::fix.mjs: ${e.message}`);
      process.exit(1);
    });
}
