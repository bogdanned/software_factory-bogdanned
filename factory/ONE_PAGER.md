# Software factory pilot: what it is, what it can touch, how to stop it

*For: <manager name>, <security owner>. From: <your name>. Repo: <repo>. Proposed pilot: <start date> to <end date>.*

## The ask
Run an AI software factory on **<repo>** in **shadow mode** for **two weeks** on **10 tickets** that I pick and label by hand. It opens **draft PRs only**. Nothing merges without a human review, exactly as today. At the end I share the numbers and a recommendation, and we decide together whether to continue, change or stop.

## What it does
A labelled ticket → an AI agent (Claude Code) in a fresh GitHub Actions runner writes the change → our existing CI checks it → a second AI agent reviews it → a draft PR appears for a human. If checks fail, the agent gets at most **3** attempts to fix them, then hands the ticket back to a human.

## The controls

| Concern | Control |
|---|---|
| **Least privilege** | The agent's job gets a GitHub App token limited to this repo with `contents: write` (its own `factory/*` branches) and `pull-requests: write`. No admin, no settings, no access to other repos. The tracker token can only read and label tickets in one team. |
| **Every agent is one reviewable file** | Each agent is a Markdown file in `factory/agents/`: its model, tools, turn cap, timeout and skills in a frontmatter that code enforces, then its rules. Changing what an agent may do is a one-file diff a human reviews. Third-party skills are vendored at a pinned commit and read before use. |
| **The agent never holds a write token** | Agent steps get the model token, plus read-only Sentry and Linear tokens for its MCP servers. No deploy keys, write tokens, database URLs or cloud credentials in their environment. The agent has no network tools and can't push; the workflow pushes after it finishes. |
| **Ticket text is data** | Ticket text is treated as untrusted input, never as instructions. A read-only step (no shell, no network) turns it into a spec, and code validates that spec before anything is built. Only a human can mark a ticket ready. |
| **Protected paths** | Changes to `.github/`, `.claude/` (the agents' skills), the factory itself (`factory/`: agent definitions and scripts), `<auth dir>`, `<migrations dir>`, `<payments / infra / release paths>` are refused when the implementor finishes. These areas are always human work. |
| **Shadow mode** | Draft PRs only. Branch protection requires a human review on `<default branch>`; the factory has no merge permission and no merge step. |
| **Kill switch** | `factory/scripts/pause.sh` sets a repo variable every workflow checks and cancels running agent jobs, within a minute. Anyone with admin on the repo can run it. |
| **Budgets** | One agent at a time. Each run is capped at <30> minutes and <150> turns. |
| **Audit log** | Every agent run is recorded: ticket, model, tools allowed, duration, cost, outcome, link to the run. The log lives on a branch the agent can't write to. |
| **Uninstall** | Delete `<list of files>` and the `factory/*` branches. Nothing else in the repo changes. |

## Data and cost
- **Where the code goes:** the agent sends code and ticket text to **<Anthropic / our approved provider>** under **<our enterprise agreement / the account our AI policy allows>**. <Confirm against the AI policy before the pilot.>
- **Cost:** about **$<x>** for the pilot (model <plan or API>, CI minutes <included / $y>). Plus my time: about <n> hours to set up and review.

## How we decide

| Metric | Why it matters |
|---|---|
| First-pass success (n of m) | PRs a reviewer would merge with no fix rounds |
| Fix rounds and escalations | how often it needs help, and why |
| Cost per merged PR | all runs counted, including failed ones |
| Reviewer time per PR | whether it saves us time or moves it |
| What each check caught | which of our gates earn their place |

**Continue** if a reviewer would merge at least <half> of the PRs and review time per PR is lower than doing the ticket by hand. **Stop** if it creates more review work than it saves, or if any control above fails once.

## What this pilot is not
It doesn't merge code, deploy anything, touch production, run on our secrets, or replace code review.
