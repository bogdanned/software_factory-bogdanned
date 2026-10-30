#!/usr/bin/env node
// The ready CI job. Runs after every other check is green: a draft PR on a
// factory/ branch leaves draft ("Ready for review") and gets a short comment.
// Off when factory.config.yml says auto_ready: false. The REST API can't undraft,
// so this talks GraphQL.
//
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo PR_NUMBER=12 HEAD_SHA=<sha CI ran on> node factory/scripts/ready.mjs

import fs from "node:fs";
import { pathToFileURL } from "node:url";

// `auto_ready: true` in factory.config.yml. Missing or anything else is off.
export const autoReady = (config) => /^auto_ready:[ \t]*true[ \t]*(#.*)?$/m.test(config);

// Why this PR stays as it is, or null when it should leave draft.
export function skipReason(pr, headSha) {
  if (!pr.headRefName.startsWith("factory/")) return `${pr.headRefName} is not a factory branch`;
  if (!pr.isDraft) return "it is already ready for review";
  if (headSha && pr.headRefOid !== headSha) return "a newer commit is still in CI";
  return null;
}

export async function gh(query, variables, env = process.env, fetchFn = fetch) {
  const res = await fetchFn("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) throw new Error(`GitHub ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
  return json.data;
}

// Reads the PR fresh, then undrafts it and comments, or says why not.
export async function ready(env, config, call = gh) {
  if (!autoReady(config)) return "ready: auto_ready is off in factory.config.yml.";
  const [owner, name] = (env.GITHUB_REPOSITORY ?? "").split("/");
  const { repository } = await call(
    `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) {
      pullRequest(number: $number) { id isDraft headRefName headRefOid } } }`,
    { owner, name, number: Number(env.PR_NUMBER) },
  );
  const pr = repository.pullRequest;
  const why = skipReason(pr, env.HEAD_SHA);
  if (why) return `ready: nothing to do, ${why}.`;
  await call(
    `mutation($id: ID!, $body: String!) {
      markPullRequestReadyForReview(input: { pullRequestId: $id }) { clientMutationId }
      addComment(input: { subjectId: $id, body: $body }) { clientMutationId } }`,
    { id: pr.id, body: "All gates green: marked ready for review." },
  );
  return `ready: PR #${env.PR_NUMBER} is ready for review.`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ready(process.env, fs.readFileSync("factory.config.yml", "utf8"))
    .then((out) => console.log(out))
    .catch((e) => {
      console.log(`::error::ready.mjs: ${e.message}`);
      process.exit(1);
    });
}
