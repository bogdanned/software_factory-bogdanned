import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sql } from "@/legacy/api/db";
import { client, signIn } from "./helpers";

// Replays one migration file by its index prefix, statement by statement.
async function runMigration(prefix: string) {
  const dir = path.resolve(__dirname, "../db/migrations");
  const file = readdirSync(dir).find((f) => f.startsWith(`${prefix}_`) && f.endsWith(".sql"));
  if (!file) throw new Error(`no migration ${prefix}_*.sql`);
  for (const statement of readFileSync(path.join(dir, file), "utf8").split("--> statement-breakpoint")) {
    if (statement.trim()) await sql(statement);
  }
}

describe("feedback API", () => {
  it("lists feedback for anyone", async () => {
    const res = await client()("GET", "/api/feedback?limit=5");
    expect(res.status).toBe(200);
    expect(res.json.items.length).toBeGreaterThan(0);
    expect(res.json.total).toBeGreaterThan(0);
  });

  it("needs a signed-in user to post", async () => {
    const res = await client()("POST", "/api/feedback", { title: "Anonymous idea" });
    expect(res.status).toBe(401);
  });

  it("creates feedback and a comment", async () => {
    const ada = await signIn("ada");
    const created = await ada("POST", "/api/feedback", { title: "Integration test idea", body: "From Vitest" });
    expect(created.status).toBe(201);
    const id = created.json.item.id;

    expect((await ada("POST", `/api/feedback/${id}/comments`, { body: "First" })).status).toBe(201);
    const read = await ada("GET", `/api/feedback/${id}`);
    expect(read.json.item.title).toBe("Integration test idea");
    expect(read.json.comments).toHaveLength(1);
  });

  it("rejects a wrong admin password", async () => {
    const res = await client()("POST", "/api/auth/sign-in", { persona: "admin", password: "nope" });
    expect(res.status).toBe(401);
  });

  it("signs the admin in with the password", async () => {
    const admin = await signIn("admin");
    expect((await admin("GET", "/api/me")).json.user.role).toBe("admin");
  });

  it("lists shipped items in the changelog", async () => {
    const res = await client()("GET", "/api/changelog");
    expect(res.json.items.length).toBeGreaterThan(0);
  });
});

describe("votes", () => {
  async function newIdea(call: Awaited<ReturnType<typeof signIn>>) {
    const created = await call("POST", "/api/feedback", { title: `Vote test ${Date.now()}` });
    expect(created.status).toBe(201);
    return created.json.item.id as number;
  }

  it("counts one vote per user and rejects a repeat with 409", async () => {
    const ada = await signIn("ada");
    const id = await newIdea(ada);

    const first = await ada("POST", `/api/feedback/${id}/vote`);
    expect(first.status).toBe(201);
    expect(first.json).toEqual({ votes: 1 });

    const second = await ada("POST", `/api/feedback/${id}/vote`);
    expect(second.status).toBe(409);
    expect(second.json).toEqual({ error: "Already voted" });

    const list = await ada("GET", "/api/feedback?limit=100");
    const listed = list.json.items.find((i: { id: number }) => i.id === id);
    expect(listed.votes).toBe(1);
  });

  it("two votes sent at the same time leave exactly one", async () => {
    const ada = await signIn("ada");
    const id = await newIdea(ada);

    const results = await Promise.all([ada("POST", `/api/feedback/${id}/vote`), ada("POST", `/api/feedback/${id}/vote`)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);

    const read = await ada("GET", `/api/feedback/${id}`);
    expect(read.json.item.votes).toBe(1);
    expect(read.json.item.voted).toBe(true);
  });

  it("the migration removes duplicate votes, keeping one per user", async () => {
    const ada = await signIn("ada");
    const lin = await signIn("lin");
    const id = await newIdea(ada);
    const [{ ada_id, lin_id }] = await sql<{ ada_id: number; lin_id: number }>(
      `SELECT (SELECT id FROM users WHERE email = 'ada@bugboard.test') AS ada_id,
              (SELECT id FROM users WHERE email = 'lin@bugboard.test') AS lin_id`,
    );

    // Recreate the pre-migration state: no constraint, duplicate rows.
    await sql(`ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_feedback_id_user_id_unique`);
    for (let i = 0; i < 3; i++) await sql("INSERT INTO votes (feedback_id, user_id) VALUES ($1, $2)", [id, ada_id]);
    await sql("INSERT INTO votes (feedback_id, user_id) VALUES ($1, $2)", [id, lin_id]);
    expect((await ada("GET", `/api/feedback/${id}`)).json.item.votes).toBe(4);

    await runMigration("0001");

    const asAda = await ada("GET", `/api/feedback/${id}`);
    expect(asAda.json.item.votes).toBe(2);
    expect(asAda.json.item.voted).toBe(true);
    expect((await lin("GET", `/api/feedback/${id}`)).json.item.voted).toBe(true);
  });

  it("keeps unvote and auth behaviour", async () => {
    const ada = await signIn("ada");
    const id = await newIdea(ada);

    const unvote = await ada("DELETE", `/api/feedback/${id}/vote`);
    expect(unvote.status).toBe(200);
    expect(unvote.json).toEqual({ votes: 0 });

    const anon = client();
    const post = await anon("POST", `/api/feedback/${id}/vote`);
    expect(post.status).toBe(401);
    expect(post.json).toEqual({ error: "Sign in first" });
    const del = await anon("DELETE", `/api/feedback/${id}/vote`);
    expect(del.status).toBe(401);
    expect(del.json).toEqual({ error: "Sign in first" });
  });
});
