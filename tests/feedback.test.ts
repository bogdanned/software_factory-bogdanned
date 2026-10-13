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
});
