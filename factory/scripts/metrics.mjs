#!/usr/bin/env node
// PR stats for the factory: how many PRs it opened, merged and how fast.
// Usage: GITHUB_TOKEN=… GITHUB_REPOSITORY=you/your-repo npm run factory:metrics

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!repo) {
  console.error("Set GITHUB_REPOSITORY=owner/name");
  process.exit(1);
}

const headers = { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
const prs = [];
for (let page = 1; page <= 10; page++) {
  const res = await fetch(`https://api.github.com/repos/${repo}/pulls?state=all&per_page=100&page=${page}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  const batch = await res.json();
  prs.push(...batch);
  if (batch.length < 100) break;
}

const factory = prs.filter((p) => p.head.ref.startsWith("factory/"));
const merged = factory.filter((p) => p.merged_at);
const hours = merged.map((p) => (new Date(p.merged_at) - new Date(p.created_at)) / 36e5).sort((a, b) => a - b);
const median = hours.length ? hours[Math.floor(hours.length / 2)] : 0;

console.log(`factory PRs: ${factory.length}`);
console.log(`merged:      ${merged.length} (${factory.length ? Math.round((merged.length / factory.length) * 100) : 0}%)`);
console.log(`closed:      ${factory.filter((p) => p.state === "closed" && !p.merged_at).length}`);
console.log(`open:        ${factory.filter((p) => p.state === "open").length}`);
console.log(`median time to merge: ${median.toFixed(1)} h`);
