import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { decide, failures, rest, run, target, ticketOf } from "./fix.mjs";

const CONFIG = fs.readFileSync(new URL("../../factory.config.yml", import.meta.url), "utf8");
const ENV = { GITHUB_REPOSITORY: "acme/bugboard", GITHUB_RUN_ID: "900", PR_NUMBER: "14" };
const PR = { number: 14, draft: true, state: "open", title: "BBD-12: x", html_url: "https://github.com/acme/bugboard/pull/14", head: { ref: "factory/bbd-12-x", repo: { full_name: "acme/bugboard" } }, base: { ref: "main" } };
const JOBS = { jobs: [{ id: 1, name: "lint", conclusion: "failure" }, { id: 3, name: "fix", conclusion: null }] };
const round = (run) => `Fix round: lint failed.\n\n<!-- factory:fix-round run=${run} -->`;
const BASE = { ticket: "BBD-12", draft: true, failed: ["lint"], bodies: [], runId: "900", max: 3 };

// A fake GitHub: answers GETs by path, records every POST.
const fakeGitHub = ({ pr = PR, comments = [] } = {}) => {
  const posts = [];
  const call = async (path, init = {}) => {
    if (init.method === "POST") return posts.push({ path, ...init }), {};
    if (path.startsWith("/pulls/")) return pr;
    if (path.includes("/jobs?")) return JOBS;
    if (path.endsWith("/logs")) return "2026-10-30T10:00:00.0000000Z lint error\n##[error]Process completed with exit code 1.\nPost job cleanup.";
    return comments.map((body) => ({ body }));
  };
  return { call, posts };
};

describe("fix", () => {
  test("the ticket comes from the factory branch name", () => {
    assert.equal(ticketOf("factory/bbd-12-sort-the-board"), "BBD-12");
    assert.equal(ticketOf("factory/no-ticket"), null);
  });
  test("a red factory draft gets rounds until max_fix_rounds, then escalates", () => {
    assert.deepEqual(decide(BASE), { action: "fix", round: 1, why: "fix round 1 of 3" });
    assert.equal(decide({ ...BASE, bodies: [round(1), round(2), round(3)] }).action, "escalate");
    assert.match(decide({ ...BASE, bodies: [round(900)] }).why, /already handled/);
    assert.match(decide({ ...BASE, draft: false }).why, /out of draft/);
  });
  test("run: a round posts its comment, then starts factory-implement", async () => {
    const gh = fakeGitHub();
    assert.equal(await run(ENV, CONFIG, { call: gh.call, escalate: () => assert.fail() }), "fix: round 1 of 3 started for BBD-12.");
    assert.match(gh.posts[0].body.body, /^Fix round 1\/3: lint failed\.[\s\S]*<!-- factory:fix-round run=900 -->$/);
    assert.deepEqual(gh.posts[1].body, { ref: "main", inputs: { pr: "14", ci_run: "900" } });
  });
  test("run: after the last round the ticket is escalated", async () => {
    const gh = fakeGitHub({ comments: [round(1), round(2), round(3)] });
    const escalated = [];
    await run(ENV, CONFIG, { call: gh.call, escalate: async (...args) => escalated.push(args) });
    assert.equal(escalated[0][0], "BBD-12");
    assert.match(gh.posts[0].body.body, /BBD-12 is escalated to a human/);
  });
  test("target and failures feed the round", async () => {
    const gh = fakeGitHub();
    assert.deepEqual(JSON.parse(await target("14", ENV, gh.call)), { identifier: "BBD-12", title: "BBD-12: x", branch: "factory/bbd-12-x", pr: 14 });
    await assert.rejects(target("14", ENV, fakeGitHub({ pr: { ...PR, state: "closed" } }).call), /is closed/);
    assert.equal(await failures("900", ENV, gh.call), "### lint failed\n\nlint error\n##[error]Process completed with exit code 1.");
  });
  test("rest calls the repo's API with the token", async () => {
    const reply = async (url, init) => ({ ok: true, status: 200, text: async () => JSON.stringify({ url, auth: init.headers.Authorization }) });
    assert.deepEqual(await rest("/pulls/1", {}, { GITHUB_REPOSITORY: "a/b", GITHUB_TOKEN: "t" }, reply), { url: "https://api.github.com/repos/a/b/pulls/1", auth: "Bearer t" });
  });
});
