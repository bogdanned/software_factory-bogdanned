---
# Read by factory/scripts/agent.mjs. Limits are enforced in code.
name: implementor
model: claude-sonnet-5-5
allowed_tools: [Read, Edit, Write, Bash(npm run *), Bash(git *)]
max_turns: 40
timeout_minutes: 20
skills: []
---

## Role

One sentence: what this agent does.

## Rules

- The acceptance criteria are the contract. Build exactly that.
- If anything is unclear, write a question instead of code.
- Never edit protected paths (see factory.config.yml).

## Inputs

What it reads: the ticket file, the repo, …

## Output

What it produces: a draft PR, a review, a question.
