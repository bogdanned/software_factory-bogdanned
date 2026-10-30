import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { asOutput, decide, failedJobs, failures, marks, maxRounds, rest, run, target, tail, ticketOf } from "./fix.mjs";

const CONFIG = fs.readFileSync(new URL("../../factory.config.yml", import.meta.url), "utf8");
const ENV = { GITHUB_REPOSITORY: "acme/bugboard", GITHUB_RUN_ID: "900", PR_NUMBER: "14" };
const PR = { number: 14, draft: true, state: "open", title: "BBD-12: x", html_url: "https://github.com/acme/bugboard/pull/14", head: { ref: "factory/bbd-12-x", repo: { full_name: "acme/bugboard" } }, base: { ref: "main" } };
const JOBS = { jobs: [{ id: 1, name: "lint", conclusion: "failure" }, { id: 2, name: "guard", conclusion: "success" }, { id: 3, name: "fix", conclusion: null }] };
const round = (run) => `Fix round 1/3: lint failed.\n\n<!-- factory:fix-round run=${run} -->`;
const BASE = { draft: true, failed: ["lint"], bodies: [], runId: "900", max: 3 };

// A fake GitHub: answers GETs by path, records every call.
const fakeGitHub = ({ pr = PR, jobs = JOBS, comments = [] } = {}) => {
  const calls = [];
  const call = async (path, init = {}) => {
    calls.push({ path, ...init });
    if (init.method === "POST") return {};
    if (path.startsWith("/pulls/")) return pr;
    if (path.includes("/jobs?")) return jobs;
    if (path.endsWith("/logs")) return `2026-10-30T10:00:00.0000000Z \x1b[31merror\x1b[0m in ${path}\n##[error]Process completed with exit code 1.\nPost job cleanup.`;
    return comments.map((body) => ({ body }));
  };
  return { call, calls, posts: () => calls.filter((c) => c.method === "POST") };
};

describe("fix", () => {
  test("the ticket comes from the factory branch name", () => {
    assert.equal(ticketOf("factory/bbd-12-sort-the-board"), "BBD-12");
    assert.equal(ticketOf("factory/bbd-7"), "BBD-7");
    assert.throws(() => ticketOf("feature/bbd-12-x"), /not a factory branch/);
    assert.throws(() => ticketOf(undefined), /not a factory branch/);
  });
  test("max_fix_rounds comes from limits, missing means none", () => {
    assert.equal(maxRounds(CONFIG), 3);
    assert.equal(maxRounds("limits:\n  max_turns: 60\n"), 0);
  });
  test("markers and red jobs are read from comments and the run", () => {
    assert.deepEqual(marks([round(1), "lgtm", null, "x\n<!-- factory:escalated run=2 -->"]), [{ kind: "fix-round", run: "1" }, { kind: "escalated", run: "2" }]);
    assert.deepEqual(failedJobs([...JOBS.jobs, { name: "e2e", conclusion: "timed_out" }, { name: "fix", conclusion: "failure" }]).map((j) => j.name), ["lint", "e2e"]);
  });
  test("a red factory draft gets the next round until max_fix_rounds", () => {
    assert.deepEqual(decide(BASE), { action: "fix", round: 1, why: "fix round 1 of 3" });
    assert.deepEqual(decide({ ...BASE, bodies: [round(1), round(2)] }), { action: "fix", round: 3, why: "fix round 3 of 3" });
    assert.deepEqual(decide({ ...BASE, bodies: [round(1), round(2), round(3)] }), { action: "escalate", why: "CI is still red after 3 of 3 fix rounds" });
    assert.equal(decide({ ...BASE, max: 0 }).action, "escalate");
  });
  test("a red guard escalates at once, whatever the rounds left", () => {
    assert.deepEqual(decide({ ...BASE, failed: ["lint", "guard"] }), { action: "escalate", why: "The guard failed, the change breaks a factory rule" });
  });
  test("re-runs, escalated tickets, undrafted PRs and green runs are left alone", () => {
    assert.match(decide({ ...BASE, bodies: [round(900)] }).why, /already handled/);
    assert.match(decide({ ...BASE, bodies: ["<!-- factory:escalated run=5 -->"] }).why, /already escalated/);
    assert.match(decide({ ...BASE, draft: false }).why, /out of draft/);
    assert.match(decide({ ...BASE, failed: [] }).why, /no job failed/);
  });
  test("run: a round posts its comment, then dispatches the implement workflow on the PR's base", async () => {
    const gh = fakeGitHub({ comments: ["lgtm"] });
    const escalate = () => assert.fail("no escalation");
    assert.equal(await run(ENV, CONFIG, { call: gh.call, escalate }), "fix: round 1 of 3 started for BBD-12.");
    const [comment, dispatch] = gh.posts();
    assert.equal(comment.path, "/issues/14/comments");
    assert.match(comment.body.body, /^Fix round 1\/3: lint failed\. The implementor gets another round\. \[CI run\]\(https:\/\/github\.com\/acme\/bugboard\/actions\/runs\/900\)/);
    assert.match(comment.body.body, /<!-- factory:fix-round run=900 -->$/);
    assert.deepEqual(dispatch, { path: "/actions/workflows/factory-implement.yml/dispatches", method: "POST", body: { ref: "main", inputs: { pr: "14", ci_run: "900" } } });
  });
  test("run: the last round used up escalates on Linear, then says so on the PR", async () => {
    const gh = fakeGitHub({ comments: [round(1), round(2), round(3)] });
    const escalated = [];
    const escalate = async (...args) => escalated.push(args);
    assert.equal(await run(ENV, CONFIG, { call: gh.call, escalate }), "fix: BBD-12 escalated, CI is still red after 3 of 3 fix rounds.");
    assert.deepEqual(escalated[0].slice(0, 3), ["BBD-12", "BBD", "CI is still red after 3 of 3 fix rounds. PR: https://github.com/acme/bugboard/pull/14"]);
    assert.equal(gh.posts().length, 1);
    assert.match(gh.posts()[0].body.body, /BBD-12 is escalated to a human\. .*\n\n<!-- factory:escalated run=900 -->$/);
  });
  test("run: nothing to do changes nothing", async () => {
    const gh = fakeGitHub({ pr: { ...PR, draft: false } });
    assert.equal(await run(ENV, CONFIG, { call: gh.call, escalate: () => assert.fail() }), "fix: nothing to do, the PR is out of draft, a human has it.");
    assert.equal(gh.posts().length, 0);
  });
  test("target: an open factory PR from this repo, as the implement workflow's ticket", async () => {
    const gh = fakeGitHub();
    assert.deepEqual(JSON.parse(await target("14", ENV, gh.call)), { identifier: "BBD-12", title: "BBD-12: x", branch: "factory/bbd-12-x", pr: 14 });
    await assert.rejects(target("14", ENV, fakeGitHub({ pr: { ...PR, state: "closed" } }).call), /is closed/);
    await assert.rejects(target("14", ENV, fakeGitHub({ pr: { ...PR, head: { ...PR.head, repo: { full_name: "evil/fork" } } } }).call), /another repo/);
    await assert.rejects(target("14", ENV, fakeGitHub({ pr: { ...PR, head: { ...PR.head, ref: "main" } } }).call), /not a factory branch/);
  });
  test("failures: each red job with the end of its log, up to the last error", async () => {
    const out = await failures("900", ENV, fakeGitHub().call);
    assert.equal(out, "### lint failed\n\nerror in /actions/jobs/1/logs\n##[error]Process completed with exit code 1.");
    assert.equal(await failures("900", ENV, fakeGitHub({ jobs: { jobs: [] } }).call), "(no failed job found)");
    assert.equal(tail("a\nb\nc", 2), "b\nc");
  });
  test("rest calls the repo's API with the token, throws on errors", async () => {
    const seen = [];
    const reply = (status, text) => async (url, init) => (seen.push({ url, init }), { ok: status < 300, status, text: async () => text });
    assert.deepEqual(await rest("/pulls/1", {}, { GITHUB_REPOSITORY: "a/b", GITHUB_TOKEN: "t" }, reply(200, '{"n":1}')), { n: 1 });
    assert.equal(seen[0].url, "https://api.github.com/repos/a/b/pulls/1");
    assert.equal(seen[0].init.headers.Authorization, "Bearer t");
    assert.equal(await rest("/x", { method: "POST", body: {} }, {}, reply(204, "")), "");
    assert.equal(await rest("/logs", { raw: true }, {}, reply(200, "log")), "log");
    await assert.rejects(rest("/x", {}, {}, reply(403, "Resource not accessible")), /GitHub 403 on \/x: Resource not accessible/);
  });
  test("asOutput is a GITHUB_OUTPUT heredoc", () => {
    assert.match(asOutput("failures", "a\nb"), /^failures<<(EOF_[\w-]+)\na\nb\n\1\n$/);
  });
});
