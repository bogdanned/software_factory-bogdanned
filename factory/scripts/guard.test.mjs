import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { addedLines, guard, isTest, parseChanges, violations } from "./guard.mjs";

const CONFIG = fs.readFileSync(new URL("../../factory.config.yml", import.meta.url), "utf8");
const diffAdding = (file, ...lines) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join("\n")}\n`;
// Built from parts, so this file never holds a focused or skipped test itself.
const call = (fn, method) => `${fn}${"."}${method}("x", () => {});`;
const check = (nameStatus, diff = "") => violations(parseChanges(nameStatus), addedLines(diff), CONFIG);

describe("guard", () => {
  test("a branch outside factory/ passes without reading the diff", () => {
    const run = () => assert.fail("git should not run");
    assert.equal(guard({ HEAD_REF: "feature/x", BASE_REF: "main" }, run), null);
    assert.equal(guard({}, run), null);
  });
  test("a clean factory branch passes", () => {
    const run = (args) => (args.includes("--name-status") ? "M\tapp/page.tsx\n" : diffAdding("app/page.tsx", "const x = 1;"));
    assert.equal(guard({ HEAD_REF: "factory/bbd-1-x", BASE_REF: "main" }, run), null);
  });
  test("protected paths fail, named with the rule", () => {
    assert.deepEqual(check("M\tfactory.config.yml\nM\t.github/workflows/main.yml\nM\tapp/page.tsx\n"), [
      "factory.config.yml: touches protected_paths in factory.config.yml",
      ".github/workflows/main.yml: touches protected_paths in factory.config.yml",
    ]);
    assert.deepEqual(check("R100\tapp/x.ts\t.claude/x.ts\n"), [".claude/x.ts: touches protected_paths in factory.config.yml"]);
  });
  test(".skip( and .only( fail in a test file only", () => {
    assert.deepEqual(check("M\ttests/feedback.test.ts\n", diffAdding("tests/feedback.test.ts", call("test", "only"), call("describe", "skip"))), [
      "tests/feedback.test.ts: adds .skip( or .only( to a test",
    ]);
    assert.deepEqual(check("M\te2e/board.spec.ts\n", diffAdding("e2e/board.spec.ts", call("test", "skip"))), ["e2e/board.spec.ts: adds .skip( or .only( to a test"]);
    assert.deepEqual(check("M\tlib/api.ts\n", diffAdding("lib/api.ts", "const rows = list.only(1);")), []);
  });
  test("@ts-ignore, @ts-expect-error and eslint-disable fail anywhere", () => {
    const diff = diffAdding("lib/api.ts", "// @ts-ignore", "// @ts-expect-error") + diffAdding("app/page.tsx", "// eslint-disable-next-line no-console");
    assert.deepEqual(check("M\tlib/api.ts\nM\tapp/page.tsx\n", diff), ["lib/api.ts: adds @ts-ignore or @ts-expect-error", "app/page.tsx: adds eslint-disable"]);
  });
  test("deleting a test file fails, renaming one to another test does not", () => {
    assert.deepEqual(check("D\ttests/format.test.ts\n"), ["tests/format.test.ts: deletes a test file"]);
    assert.deepEqual(check("R090\ttests/format.test.ts\tlib/format.ts\n"), ["tests/format.test.ts: deletes a test file"]);
    assert.deepEqual(check("R100\ttests/format.test.ts\ttests/fmt.test.ts\nD\tlib/old.ts\n"), []);
  });
  test("removed lines and deleted files never count as added", () => {
    assert.deepEqual(addedLines("+++ /dev/null\n+// @ts-ignore\n-// eslint-disable\n"), []);
    assert.ok(isTest("tests/helpers.ts") && isTest("app/x.test.tsx") && !isTest("app/testing.ts"));
  });
});
