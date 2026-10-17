import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LABELS, QUESTION_MARK, apply, configList, labelChanges, parseRefinement, toRefine } from "./refine.mjs";

process.env.LINEAR_API_KEY = "lin_api_test";

const CONFIG = fs.readFileSync(new URL("../../factory.config.yml", import.meta.url), "utf8");
const Q = `${QUESTION_MARK}\nWhich page?`;
const issueWith = (identifier, createdAt, labels, comments = []) => ({
  identifier,
  createdAt,
  labels: { nodes: labels.map((name) => ({ name })) },
  comments: { nodes: comments.map(([body, createdAt]) => ({ body, createdAt })) },
});

describe("sweep: which tickets to refine", () => {
  test("every factory:new ticket, oldest first", () => {
    const ids = toRefine([
      issueWith("BBD-2", "2026-10-02T10:00:00.000Z", ["factory:new"]),
      issueWith("BBD-1", "2026-10-01T10:00:00.000Z", ["factory:new", "blast:low"]),
      issueWith("BBD-3", "2026-10-03T10:00:00.000Z", ["factory:refined"]),
    ]);
    assert.deepEqual(ids, ["BBD-1", "BBD-2"]);
  });
  test("a needs-info ticket only once a human commented after the factory's question", () => {
    const ids = toRefine([
      issueWith("BBD-4", "2026-10-01T10:00:00.000Z", ["factory:needs-info"], [[Q, "2026-10-05T10:00:00.000Z"]]),
      issueWith("BBD-5", "2026-10-02T10:00:00.000Z", ["factory:needs-info"], [[Q, "2026-10-05T10:00:00.000Z"], ["It is the board page.", "2026-10-06T10:00:00.000Z"]]),
      issueWith("BBD-6", "2026-10-03T10:00:00.000Z", ["factory:needs-info"], [["Old comment", "2026-10-04T10:00:00.000Z"], [Q, "2026-10-05T10:00:00.000Z"]]),
      issueWith("BBD-7", "2026-10-04T10:00:00.000Z", ["factory:needs-info"], [[Q, "2026-10-05T10:00:00.000Z"], [`${QUESTION_MARK}\nAnd which browser?`, "2026-10-06T10:00:00.000Z"]]),
      issueWith("BBD-8", "2026-10-05T10:00:00.000Z", ["factory:needs-info"]),
    ]);
    assert.deepEqual(ids, ["BBD-5"]);
  });
});

describe("parseRefinement", () => {
  const refined = { verdict: "refined", spec_md: "## Why\nx", files: ["app/page.tsx"], blast_radius: "low", estimate: 2 };
  test("invalid JSON and bad verdicts are refused", () => {
    assert.throws(() => parseRefinement("{not json", CONFIG), /not valid JSON/);
    assert.throws(() => parseRefinement(JSON.stringify({ verdict: "ready" }), CONFIG), /verdict "ready"/);
    assert.throws(() => parseRefinement(JSON.stringify({ verdict: "needs-info", question: " " }), CONFIG), /without a question/);
    assert.throws(() => parseRefinement(JSON.stringify({ ...refined, estimate: 3 }), CONFIG), /estimate 3/);
    assert.throws(() => parseRefinement(JSON.stringify({ ...refined, blast_radius: "medium" }), CONFIG), /blast_radius "medium"/);
  });
  test("keeps the refiner's blast radius for ordinary files", () => {
    assert.equal(parseRefinement(JSON.stringify(refined), CONFIG).blast_radius, "low");
  });
  test("admin.ts, db/ and protected paths come out blast:high", () => {
    for (const file of ["legacy/api/routes/admin.ts", "db/schema.ts", "factory/agents/refiner.md", ".github/workflows/main.yml"]) {
      assert.equal(parseRefinement(JSON.stringify({ ...refined, files: [file] }), CONFIG).blast_radius, "high", file);
    }
    assert.equal(parseRefinement(JSON.stringify({ ...refined, files: ["dbx/other.ts"] }), CONFIG).blast_radius, "low");
  });
  test("configList reads a YAML list", () => {
    assert.deepEqual(configList("a:\n  - x\n  - y/\nb:\n  - z\n", "a"), ["x", "y/"]);
    assert.deepEqual(configList("a:\n  - x\n", "missing"), []);
  });
});

describe("labelChanges", () => {
  test("refined: the blast label and factory:refined in, factory:new and the other blast out", () => {
    assert.deepEqual(labelChanges({ verdict: "refined", blast_radius: "high" }), {
      add: ["blast:high", LABELS.refined],
      remove: [LABELS.new, LABELS.needsInfo, "blast:low"],
    });
  });
  test("needs-info: only factory:needs-info in, factory:new out", () => {
    assert.deepEqual(labelChanges({ verdict: "needs-info" }), { add: [LABELS.needsInfo], remove: [LABELS.new] });
  });
  test("a refinement that tries to add factory:ready never gets it", () => {
    const r = parseRefinement(JSON.stringify({ verdict: "refined", spec_md: "x", files: [], blast_radius: "low", estimate: 1, labels: ["factory:ready"], add_labels: "factory:ready" }), CONFIG);
    const { add } = labelChanges(r);
    assert.ok(!add.includes(LABELS.ready));
    assert.deepEqual(add, ["blast:low", LABELS.refined]);
  });
});

describe("apply", () => {
  const issue = {
    id: "uuid-12", identifier: "BBD-12", description: "I double click and it shows +2.", team: { key: "BBD" },
    labels: { nodes: [{ id: "L-factory:new", name: "factory:new" }, { id: "L-blast:low", name: "blast:low" }] },
    comments: { nodes: [] },
  };
  const labels = ["factory:new", "factory:refined", "factory:needs-info", "factory:escalated", "factory:ready", "blast:low", "blast:high"].map((name) => ({ id: `L-${name}`, name, team: { key: "BBD" } }));
  let calls, dir, cwd;
  beforeEach(() => {
    calls = [];
    globalThis.fetch = async (url, init) => {
      const { query, variables } = JSON.parse(init.body);
      calls.push({ query, variables });
      let data;
      if (query.includes("issue(id:")) data = { issue };
      else if (query.includes("issueLabels(")) data = { issueLabels: { nodes: labels.filter((l) => variables.names.includes(l.name)) } };
      else if (query.includes("issueUpdate(id: $id, input: { labelIds")) data = { issueUpdate: { issue: { labels: { nodes: variables.labelIds.map((id) => ({ name: id.slice(2) })) } } } };
      else if (query.includes("issueUpdate(")) data = { issueUpdate: { success: true } };
      else if (query.includes("commentCreate(")) data = { commentCreate: { comment: { url: "https://linear.app/x/c1" } } };
      else throw new Error(`unexpected query ${query}`);
      return new Response(JSON.stringify({ data }), { status: 200 });
    };
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "refine-"));
    fs.writeFileSync(path.join(dir, "factory.config.yml"), CONFIG);
    cwd = process.cwd();
    process.chdir(dir);
  });
  afterEach(() => process.chdir(cwd));
  const kinds = () => calls.map((c) => (c.query.includes("commentCreate") ? "comment" : c.query.includes("labelIds") ? "labels" : c.query.includes("issueUpdate") ? "update" : "read"));
  const added = () => calls.find((c) => c.query.includes("labelIds")).variables.labelIds.map((id) => id.slice(2));

  test("a refined ticket gets the spec, the estimate, the blast label and factory:refined", async () => {
    fs.writeFileSync("refinement.json", JSON.stringify({ verdict: "refined", spec_md: "## Why\nTwo votes.", files: ["app/vote.ts"], blast_radius: "high", estimate: 4 }));
    const out = await apply("BBD-12", "BBD", "refinement.json", { GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: "o/r", GITHUB_RUN_ID: "7" });
    const update = calls.find((c) => c.query.includes("$input: IssueUpdateInput"));
    assert.match(update.variables.input.description, /^## Why\nTwo votes\.\n\n---\n\nSource: https:\/\/github.com\/o\/r\/actions\/runs\/7 · Estimate: 4\n\n## Original report\n\nI double click/);
    assert.equal(update.variables.input.estimate, 4);
    assert.deepEqual(added().sort(), ["blast:high", "factory:refined"]);
    assert.ok(!kinds().includes("comment"));
    assert.match(out, /BBD-12: refined, blast high, estimate 4/);
  });
  test("needs-info: the question as a marked comment, factory:needs-info, no description change", async () => {
    fs.writeFileSync("refinement.json", JSON.stringify({ verdict: "needs-info", question: "Which page?" }));
    await apply("BBD-12", "BBD", "refinement.json", {});
    const c = calls.find((x) => x.query.includes("commentCreate"));
    assert.ok(c.variables.body.startsWith(`${QUESTION_MARK}\nWhich page?`));
    assert.ok(!kinds().includes("update"));
    assert.deepEqual(added().sort(), ["blast:low", "factory:needs-info"]);
  });
  test("invalid JSON: one comment and factory:escalated, nothing else", async () => {
    fs.writeFileSync("refinement.json", "{oops");
    const out = await apply("BBD-12", "BBD", "refinement.json", {});
    assert.ok(!kinds().includes("update"));
    assert.equal(kinds().filter((k) => k === "comment").length, 1);
    assert.deepEqual(added().sort(), ["blast:low", "factory:escalated"]);
    assert.match(out, /escalated \(refinement.json is not valid JSON\)/);
  });
  test("a missing file escalates too", async () => {
    const out = await apply("BBD-12", "BBD", "factory-out/refinement.json", {});
    assert.match(out, /escalated \(factory-out\/refinement.json is missing\)/);
    assert.deepEqual(added().sort(), ["blast:low", "factory:escalated"]);
  });
  test("factory:ready is never added, whatever the file says", async () => {
    fs.writeFileSync("refinement.json", JSON.stringify({ verdict: "refined", spec_md: "x", files: [], blast_radius: "low", estimate: 1, labels: ["factory:ready"] }));
    await apply("BBD-12", "BBD", "refinement.json", {});
    assert.ok(!added().includes("factory:ready"));
  });
});