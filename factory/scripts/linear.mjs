#!/usr/bin/env node
// Our plain code's door to Linear. The key is LINEAR_API_KEY, the team is
// tracker.team in factory.config.yml. Exits non-zero on any API error.
//
//   node factory/scripts/linear.mjs spec BBD-12                                    # the ticket as markdown
//   node factory/scripts/linear.mjs label BBD-12 --add factory:refined --remove factory:new
//   echo "Which page?" | node factory/scripts/linear.mjs comment BBD-12

import fs from "node:fs";
import { pathToFileURL } from "node:url";

const API = "https://api.linear.app/graphql";
const USAGE = "usage: linear.mjs spec <id> | label <id> [--add X]... [--remove Y]... | comment <id>  (body on stdin)";

export function teamKey(config = fs.readFileSync("factory.config.yml", "utf8")) {
  const m = config.match(/^tracker:[ \t]*\n(?:[ \t]+.*\n)*?[ \t]+team:[ \t]*(\S+)/m);
  if (!m) throw new Error("factory.config.yml: tracker.team is not set");
  return m[1];
}

// One GraphQL call. Any HTTP or GraphQL error throws, so the command exits non-zero.
export async function gql(query, variables) {
  const key = process.env.LINEAR_API_KEY;
  if (!key) throw new Error("LINEAR_API_KEY is not set");
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: key },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) throw new Error(`Linear ${res.status}: ${JSON.stringify(body.errors ?? body)}`);
  return body.data;
}

// The issue with its labels and comments. Refuses an issue outside our team.
export async function getIssue(id, team) {
  const { issue } = await gql(
    `query($id: String!) { issue(id: $id) {
      id identifier description team { key }
      labels { nodes { id name } }
      comments(first: 100) { nodes { body createdAt user { name } botActor { name } } }
    } }`,
    { id },
  );
  if (!issue) throw new Error(`no issue ${id}`);
  if (issue.team.key !== team) throw new Error(`${issue.identifier} is in team ${issue.team.key}, not ${team}`);
  return issue;
}

// Markdown: the description, then every comment oldest first with author and date.
export function toMarkdown(issue) {
  const comments = [...issue.comments.nodes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const parts = [issue.description?.trim() || "(no description)"];
  for (const c of comments) {
    parts.push(`### Comment by ${c.user?.name ?? c.botActor?.name ?? "unknown"} on ${c.createdAt}`, c.body.trim());
  }
  return parts.join("\n\n") + "\n";
}

export async function spec(id, team) {
  return toMarkdown(await getIssue(id, team));
}

// Add and remove labels by name, keeping the issue's other labels.
export async function label(id, team, add, remove) {
  if (!add.length && !remove.length) throw new Error(USAGE);
  const issue = await getIssue(id, team);
  const { issueLabels } = await gql(
    `query($names: [String!]) { issueLabels(filter: { name: { in: $names } }) { nodes { id name team { key } } } }`,
    { names: [...add, ...remove] },
  );
  const idOf = (name) => {
    const found = issueLabels.nodes.filter((l) => l.name === name);
    const l = found.find((l) => l.team?.key === team) ?? found[0]; // our team's label before a workspace one
    if (!l) throw new Error(`label "${name}" does not exist`);
    return l.id;
  };
  const removeIds = remove.map(idOf);
  const keep = issue.labels.nodes.map((l) => l.id).filter((x) => !removeIds.includes(x));
  const labelIds = [...new Set([...keep, ...add.map(idOf)])];
  const { issueUpdate } = await gql(
    `mutation($id: String!, $labelIds: [String!]) { issueUpdate(id: $id, input: { labelIds: $labelIds }) { issue { labels { nodes { name } } } } }`,
    { id: issue.id, labelIds },
  );
  return `${issue.identifier}: ${issueUpdate.issue.labels.nodes.map((l) => l.name).join(", ")}\n`;
}

export async function comment(id, team, body) {
  if (!body.trim()) throw new Error("comment body on stdin is empty");
  const issue = await getIssue(id, team);
  const { commentCreate } = await gql(
    `mutation($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { comment { url } } }`,
    { issueId: issue.id, body },
  );
  return `${issue.identifier}: ${commentCreate.comment.url}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, id, ...rest] = process.argv.slice(2);
  const add = [];
  const remove = [];
  const commands = {
    spec: () => spec(id, teamKey()),
    label: () => label(id, teamKey(), add, remove),
    comment: () => comment(id, teamKey(), fs.readFileSync(0, "utf8")),
  };
  let ok = Boolean(id) && cmd in commands;
  for (let i = 0; i < rest.length; i += 2) {
    const list = { "--add": add, "--remove": remove }[rest[i]];
    if (cmd === "label" && list && rest[i + 1]) list.push(rest[i + 1]);
    else ok = false;
  }
  if (!ok) {
    console.error(USAGE);
    process.exit(1);
  }
  commands[cmd]()
    .then((out) => process.stdout.write(out))
    .catch((e) => {
      console.error(`linear.mjs: ${e.message}`);
      process.exit(1);
    });
}
