#!/usr/bin/env node
// Creates the factory's labels in your Linear team, coloured like the
// lifecycle diagram. Re-run safe: skips labels that already exist.
//
//   LINEAR_API_KEY=lin_api_… npm run linear:labels
//   npm run linear:labels -- --dry-run

const DRY = process.argv.includes("--dry-run");
const KEY = process.env.LINEAR_API_KEY;
const TEAM = process.env.LINEAR_TEAM_KEY ?? "BBD";

const LABELS = [
  ["factory:new", "#95a2b3"],
  ["factory:refined", "#4a5be0"],
  ["factory:needs-info", "#d4a015"],
  ["factory:ready", "#2e9e5b"],
  ["factory:in-progress", "#4a5be0"],
  ["factory:in-review", "#8a4fd8"],
  ["factory:escalated", "#d6453a"],
  ["blast:low", "#2e9e5b"],
  ["blast:high", "#e07b24"],
];

if (DRY) {
  for (const [name] of LABELS) console.log(`  ${name}`);
  process.exit(0);
}
if (!KEY) {
  console.error("Set LINEAR_API_KEY (and LINEAR_TEAM_KEY, default BBD).");
  process.exit(1);
}

async function gql(query, variables) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: KEY },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(`Linear: ${JSON.stringify(body.errors ?? body)}`);
  return body.data;
}

const { teams } = await gql(`query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id } } }`, { key: TEAM });
const teamId = teams.nodes[0]?.id;
if (!teamId) throw new Error(`No Linear team with key ${TEAM}`);

const { issueLabels } = await gql(`query { issueLabels(first: 250) { nodes { name } } }`);
const have = new Set(issueLabels.nodes.map((l) => l.name));

for (const [name, color] of LABELS) {
  if (have.has(name)) {
    console.log(`  ✓ ${name} (already there)`);
    continue;
  }
  await gql(
    `mutation($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { issueLabel { id } } }`,
    { input: { name, color, teamId } },
  );
  console.log(`  + ${name}`);
}
console.log(`done: ${LABELS.length} factory labels in ${TEAM}`);
