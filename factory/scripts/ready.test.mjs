import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { autoReady, gh, ready, skipReason } from "./ready.mjs";

const ON = "limits:\n  max_turns: 60\nauto_ready: true\n";
const ENV = { GITHUB_REPOSITORY: "acme/bugboard", PR_NUMBER: "12", HEAD_SHA: "abc" };
const PR = { id: "PR_1", isDraft: true, headRefName: "factory/bbd-12-x", headRefOid: "abc" };

// A fake GitHub: answers the PR query with `pr`, records every call.
const fakeGitHub = (pr) => {
  const calls = [];
  const call = async (query, variables) => {
    calls.push({ query, variables });
    return query.trim().startsWith("query") ? { repository: { pullRequest: pr } } : {};
  };
  return { call, calls };
};

describe("ready", () => {
  test("auto_ready is on only when the config says true", () => {
    assert.equal(autoReady(ON), true);
    assert.equal(autoReady("auto_ready: true # undraft green PRs\n"), true);
    assert.equal(autoReady("auto_ready: false\n"), false);
    assert.equal(autoReady("limits:\n  auto_ready: true\n"), false);
    assert.equal(autoReady(""), false);
  });
  test("only a draft on a factory branch at the commit CI checked leaves draft", () => {
    assert.equal(skipReason(PR, "abc"), null);
    assert.equal(skipReason({ ...PR, headRefName: "feature/x" }, "abc"), "feature/x is not a factory branch");
    assert.equal(skipReason({ ...PR, isDraft: false }, "abc"), "it is already ready for review");
    assert.equal(skipReason(PR, "newer"), "a newer commit is still in CI");
  });
  test("a green draft factory PR is marked ready and gets one comment", async () => {
    const gh = fakeGitHub(PR);
    assert.equal(await ready(ENV, ON, gh.call), "ready: PR #12 is ready for review.");
    assert.deepEqual(gh.calls[0].variables, { owner: "acme", name: "bugboard", number: 12 });
    assert.match(gh.calls[1].query, /markPullRequestReadyForReview/);
    assert.deepEqual(gh.calls[1].variables, { id: "PR_1" });
    assert.match(gh.calls[2].query, /addComment/);
    assert.deepEqual(gh.calls[2].variables, { id: "PR_1", body: "All gates green: marked ready for review." });
  });
  test("no comment when GitHub refuses to undraft", async () => {
    const calls = [];
    const call = async (query) => {
      calls.push(query);
      if (query.includes("markPullRequestReadyForReview")) throw new Error("GitHub 200: Resource not accessible by integration");
      return { repository: { pullRequest: PR } };
    };
    await assert.rejects(ready(ENV, ON, call), /not accessible/);
    assert.equal(calls.some((q) => q.includes("addComment")), false);
  });
  test("switched off or not a factory draft: GitHub is only read, never changed", async () => {
    const off = fakeGitHub(PR);
    assert.equal(await ready(ENV, "auto_ready: false\n", off.call), "ready: auto_ready is off in factory.config.yml.");
    assert.equal(off.calls.length, 0);
    const human = fakeGitHub({ ...PR, headRefName: "feature/x" });
    assert.equal(await ready(ENV, ON, human.call), "ready: nothing to do, feature/x is not a factory branch.");
    assert.equal(human.calls.length, 1);
  });
  test("gh posts to GraphQL with the token and throws on errors", async () => {
    const seen = [];
    const reply = (status, body) => async (url, init) => (seen.push({ url, init }), { ok: status === 200, status, json: async () => body });
    assert.deepEqual(await gh("query { viewer { login } }", {}, { GITHUB_TOKEN: "t" }, reply(200, { data: { viewer: { login: "bot" } } })), { viewer: { login: "bot" } });
    assert.equal(seen[0].url, "https://api.github.com/graphql");
    assert.equal(seen[0].init.headers.Authorization, "Bearer t");
    await assert.rejects(gh("q", {}, {}, reply(200, { errors: [{ message: "Resource not accessible by integration" }] })), /not accessible/);
    await assert.rejects(gh("q", {}, {}, reply(401, { message: "Bad credentials" })), /GitHub 401/);
  });
});
