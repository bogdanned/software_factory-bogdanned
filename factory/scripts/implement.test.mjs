import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { branchName, finish, finishFix, refusal } from "./implement.mjs";

const ENV = { GITHUB_REPOSITORY: "acme/bugboard", FACTORY_GH_TOKEN: "push-token", BASE_SHA: "base" };
const ISSUE = { id: "uuid-12", identifier: "BBD-12", title: "Sort the board", description: "", team: { key: "BBD" }, labels: { nodes: [] }, comments: { nodes: [] } };

// A fake git: `commits` new commits touching `files`, every push recorded.
const fakeGit = (commits, files = ["app/page.tsx"]) => {
  const pushes = [];
  const git = (args) => {
    if (args[0] === "rev-list") return String(commits);
    if (args[0] === "diff") return files.join("\n");
    if (args[0] === "push") return pushes.push(args), "";
    throw new Error(`unexpected git ${args[0]}`);
  };
  return { git, pushes };
};

// A fake Linear behind the global fetch: records the comments and label changes.
let linear;
const realFetch = globalThis.fetch;
beforeEach(() => {
  linear = { comments: [], labelIds: [] };
  process.env.LINEAR_API_KEY = "test";
  globalThis.fetch = async (url, init) => {
    const { query, variables } = JSON.parse(init.body);
    let data = { issue: ISSUE };
    if (query.includes("commentCreate")) data = (linear.comments.push(variables.body), { commentCreate: { comment: { url: "c" } } });
    if (query.includes("issueLabels")) data = { issueLabels: { nodes: variables.names.map((name) => ({ id: name, name, team: { key: "BBD" } })) } };
    if (query.includes("issueUpdate")) data = (linear.labelIds = variables.labelIds, { issueUpdate: { issue: { labels: { nodes: [] } } } });
    return { ok: true, json: async () => ({ data }) };
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("implement", () => {
  test("branch names carry the ticket id", () => {
    assert.equal(branchName("BBD-12", "Sort the board!"), "factory/bbd-12-sort-the-board");
  });
  test("refusal: no commits, a question, or a protected file stop the push", () => {
    assert.equal(refusal("base", undefined, ENV, fakeGit(0).git), "The implementor made no commits and left no question.");
    const question = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "implement-")), "question.md");
    fs.writeFileSync(question, "Which page?\n");
    assert.equal(refusal("base", question, ENV, fakeGit(0).git), "The implementor has a question:\n\nWhich page?");
    assert.equal(refusal("base", undefined, ENV, fakeGit(1, ["app/page.tsx", "factory.config.yml"]).git), "The implementor changed protected files, nothing was pushed: factory.config.yml");
    assert.equal(refusal("base", undefined, ENV, fakeGit(2).git), null);
  });
  test("a fix round pushes onto the PR's branch: no force, no new PR", async () => {
    const g = fakeGit(1);
    assert.equal(await finishFix("BBD-12", "factory/bbd-12-x", "14", {}, ENV, { git: g.git }), "BBD-12: fix pushed to PR #14\n");
    assert.deepEqual(g.pushes, [["push", "https://x-access-token:push-token@github.com/acme/bugboard.git", "HEAD:refs/heads/factory/bbd-12-x"]]);
    assert.equal(linear.comments.length, 0);
  });
  test("a fix round with no commits escalates and takes the ticket out of review", async () => {
    const g = fakeGit(0);
    assert.equal(await finishFix("BBD-12", "factory/bbd-12-x", "14", {}, ENV, { git: g.git }), "BBD-12: escalated\n");
    assert.equal(g.pushes.length, 0);
    assert.match(linear.comments[0], /^Fix round on PR #14: The implementor made no commits/);
    assert.deepEqual(linear.labelIds, ["factory:escalated"]);
  });
  test("finish pushes the branch and opens a draft PR", async () => {
    const g = fakeGit(1);
    const posts = [];
    const fetchFn = async (url, init) => (posts.push({ url, body: JSON.parse(init.body) }), { ok: true, json: async () => ({ html_url: "https://github.com/acme/bugboard/pull/14" }) });
    assert.equal(await finish("BBD-12", "factory/bbd-12-x", {}, ENV, { git: g.git, fetchFn }), "BBD-12: https://github.com/acme/bugboard/pull/14\n");
    assert.equal(g.pushes[0][1], "--force-with-lease");
    assert.equal(posts[0].body.draft, true);
    assert.deepEqual(linear.comments, ["Draft PR: https://github.com/acme/bugboard/pull/14"]);
  });
  test("finish never pushes without the push token", async () => {
    await assert.rejects(finish("BBD-12", "factory/bbd-12-x", {}, { ...ENV, FACTORY_GH_TOKEN: "" }, { git: fakeGit(1).git }), /FACTORY_GH_TOKEN is not set/);
  });
});
