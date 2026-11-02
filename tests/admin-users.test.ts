import { describe, expect, it } from "vitest";
import { client, signIn } from "./helpers";

describe("GET /api/admin/users", () => {
  it("rejects anonymous callers", async () => {
    const res = await client()("GET", "/api/admin/users");
    expect(res.status).not.toBe(200);
    expect(res.json?.users).toBeUndefined();
  });

  it("rejects a customer session", async () => {
    const ada = await signIn("ada");
    const res = await ada("GET", "/api/admin/users");
    expect(res.status).not.toBe(200);
    expect(res.json?.users).toBeUndefined();
  });

  it("lists up to 50 newest users for an admin", async () => {
    const admin = await signIn("admin");
    const res = await admin("GET", "/api/admin/users");
    expect(res.status).toBe(200);
    const users: { created_at: string }[] = res.json.users;
    expect(users.length).toBeGreaterThan(0);
    expect(users.length).toBeLessThanOrEqual(50);
    expect(Object.keys(users[0]).sort()).toEqual(["created_at", "email", "id", "name", "role"]);
    const times = users.map((u) => new Date(u.created_at).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});
