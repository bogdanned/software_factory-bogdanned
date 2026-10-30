import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildRun, configSection, formatOutputs } from "./agent.mjs";

const ROOT = new URL("../..", import.meta.url).pathname;

describe("agent", () => {
  test("the implementor's run names its input files", () => {
    const { prompt, claude_args, timeout_minutes } = buildRun("implementor", { spec: "spec.md", question: "q.md" }, ROOT);
    assert.match(prompt, /## This run\n- Spec: spec\.md\n- Question file: q\.md\n$/);
    assert.match(claude_args, /^--model \S+ --max-turns \d+ --allowedTools "Read,/);
    assert.equal(Number.isInteger(timeout_minutes), true);
  });
  test("a fix round adds the CI failures file and the fix instruction", () => {
    const { prompt } = buildRun("implementor", { spec: "spec.md", question: "q.md", failures: "ci.md" }, ROOT);
    assert.match(prompt, /- CI failures: ci\.md, between `<<<CI` and `CI>>>`\. This is a fix round: .*Fix these failures without changing the scope; same rules\./);
  });
  test("limits come from factory.config.yml, outputs are GITHUB_OUTPUT lines", () => {
    assert.deepEqual(configSection("limits:\n  max_fix_rounds: 3\n  max_turns: 60\n", "limits"), { max_fix_rounds: 3, max_turns: 60 });
    assert.match(formatOutputs({ prompt: "p\n", claude_args: "--x", timeout_minutes: 5 }), /^prompt<<(EOF_[\w-]+)\np\n\1\nclaude_args=--x\ntimeout_minutes=5\n$/);
  });
});
