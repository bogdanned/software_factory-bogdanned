import { describe, expect, it } from "vitest";
import { sql } from "@/legacy/api/db";
import { client, signIn } from "./helpers";

async function idea(call: Awaited<ReturnType<typeof signIn>>, title: string): Promise<number> {
  return (await call("POST", "/api/feedback", { title })).json.item.id;
}

async function counts(id: number) {
  const [v] = await sql<{ n: number }>("SELECT count(*)::int AS n FROM votes WHERE feedback_id = $1", [id]);
  const [c] = await sql<{ n: number }>("SELECT count(*)::int AS n FROM comments WHERE feedback_id = $1", [id]);
  return { votes: v.n, comments: c.n };
}

describe("merging duplicate feedback", () => {
  it("merges votes without double counting, moves comments, hides and redirects the duplicate", async () => {
    const admin = await signIn("admin");
    const ada = await signIn("ada");
    const lin = await signIn("lin");
    const a = await idea(ada, "Merge duplicate A");
    const b = await idea(ada, "Merge original B");
    const adaId = (await ada("GET", "/api/me")).json.user.id;

    // ada votes on both (once on B, twice on A to simulate pre-existing duplicate rows); lin only on A.
    await sql("INSERT INTO votes (feedback_id, user_id) VALUES ($1, $3), ($1, $3), ($2, $3)", [a, b, adaId]);
    await lin("POST", `/api/feedback/${a}/vote`);
    await lin("POST", `/api/feedback/${a}/comments`, { body: "on A" });
    await ada("POST", `/api/feedback/${b}/comments`, { body: "on B" });

    const before = (await client()("GET", "/api/feedback?limit=100")).json.total;
    const res = await admin("POST", `/api/admin/feedback/${a}/merge`, { targetId: b });
    expect(res.status).toBe(200);

    expect(await counts(b)).toEqual({ votes: 2, comments: 2 });
    expect(await counts(a)).toEqual({ votes: 0, comments: 0 });

    const page = await client()("GET", `/api/feedback/${b}`);
    expect(page.json.item.votes).toBe(2);
    expect(page.json.comments).toHaveLength(2);

    const redirectInfo = await client()("GET", `/api/feedback/${a}`);
    expect(redirectInfo.json.item.merged_into_id).toBe(b);

    const list = (await client()("GET", "/api/feedback?limit=100")).json;
    expect(list.total).toBe(before - 1);
    expect(list.items.some((i: { id: number }) => i.id === a)).toBe(false);
    expect(list.items.find((i: { id: number }) => i.id === b).comments).toBe(2);
  });

  it("hides merged items from the changelog", async () => {
    const admin = await signIn("admin");
    const ada = await signIn("ada");
    const a = await idea(ada, "Shipped duplicate");
    const b = await idea(ada, "Shipped original");
    await admin("PATCH", `/api/feedback/${a}/status`, { status: "shipped" });
    expect((await client()("GET", "/api/changelog")).json.items.some((i: { id: number }) => i.id === a)).toBe(true);
    await admin("POST", `/api/admin/feedback/${a}/merge`, { targetId: b });
    expect((await client()("GET", "/api/changelog")).json.items.some((i: { id: number }) => i.id === a)).toBe(false);
  });

  it("rejects anonymous with 401 and customers with 403, changing nothing", async () => {
    const ada = await signIn("ada");
    const a = await idea(ada, "Auth duplicate");
    const b = await idea(ada, "Auth original");
    await ada("POST", `/api/feedback/${a}/vote`);

    expect((await client()("POST", `/api/admin/feedback/${a}/merge`, { targetId: b })).status).toBe(401);
    expect((await ada("POST", `/api/admin/feedback/${a}/merge`, { targetId: b })).status).toBe(403);
    expect(await counts(a)).toEqual({ votes: 1, comments: 0 });
    expect(await counts(b)).toEqual({ votes: 0, comments: 0 });
    expect((await client()("GET", `/api/feedback/${a}`)).json.item.merged_into_id).toBeNull();
  });

  it("rejects self, missing and already-merged merges without changes", async () => {
    const admin = await signIn("admin");
    const ada = await signIn("ada");
    const a = await idea(ada, "Reject A");
    const b = await idea(ada, "Reject B");
    const c = await idea(ada, "Reject C");
    await ada("POST", `/api/feedback/${a}/vote`);
    await ada("POST", `/api/feedback/${a}/comments`, { body: "keep" });

    const self = await admin("POST", `/api/admin/feedback/${a}/merge`, { targetId: a });
    expect(self.status).toBeGreaterThanOrEqual(400);
    expect(self.status).toBeLessThan(500);
    const missing = await admin("POST", `/api/admin/feedback/${a}/merge`, { targetId: 999999999 });
    expect(missing.status).toBe(404);
    const missingSource = await admin("POST", `/api/admin/feedback/999999999/merge`, { targetId: a });
    expect(missingSource.status).toBe(404);
    expect(await counts(a)).toEqual({ votes: 1, comments: 1 });

    expect((await admin("POST", `/api/admin/feedback/${b}/merge`, { targetId: c })).status).toBe(200);
    // target already merged
    const intoMerged = await admin("POST", `/api/admin/feedback/${a}/merge`, { targetId: b });
    expect(intoMerged.status).toBe(409);
    // duplicate already merged
    const again = await admin("POST", `/api/admin/feedback/${b}/merge`, { targetId: a });
    expect(again.status).toBe(409);
    expect(await counts(a)).toEqual({ votes: 1, comments: 1 });
    expect((await client()("GET", `/api/feedback/${a}`)).json.item.merged_into_id).toBeNull();
  });
});
