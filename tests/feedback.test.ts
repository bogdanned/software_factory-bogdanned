import { describe, expect, it } from "vitest";
import { client, signIn } from "./helpers";

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

  describe("sorting", () => {
    type Item = { id: number; votes: number; created_at: string };
    const list = async (qs: string) => (await client()("GET", `/api/feedback?limit=100${qs}`)).json.items as Item[];
    const newestFirst = (a: Item, b: Item) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || b.id - a.id;
    const ids = (items: Item[]) => items.map((i) => i.id);

    it("sorts by votes, then newest, by default and for top", async () => {
      for (const qs of ["", "&sort=top"]) {
        const items = await list(qs);
        expect(ids(items)).toEqual(ids([...items].sort((a, b) => b.votes - a.votes || newestFirst(a, b))));
      }
    });

    it("sorts newest first regardless of votes", async () => {
      const items = await list("&sort=newest");
      expect(ids(items)).toEqual(ids([...items].sort(newestFirst)));
    });

    it("treats an unknown sort like top", async () => {
      expect(ids(await list("&sort=bogus"))).toEqual(ids(await list("&sort=top")));
    });

    it("pages without repeats or gaps", async () => {
      for (const sort of ["top", "newest"]) {
        const all = ids(await list(`&sort=${sort}`));
        const seen: number[] = [];
        for (let page = 1; page <= all.length; page++) {
          const res = await client()("GET", `/api/feedback?sort=${sort}&limit=7&page=${page}`);
          if (res.json.items.length === 0) break;
          seen.push(...res.json.items.map((i: Item) => i.id));
        }
        expect(seen).toEqual(all);
      }
    });
  });
});
