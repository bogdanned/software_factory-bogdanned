import { describe, expect, it } from "vitest";
import { client, signIn } from "./helpers";

describe("GET /api/admin/users", () => {
  it("rejects anonymous requests", async () => {
    const res = await client()("GET", "/api/admin/users");
    expect([401, 403]).toContain(res.status);
  });

  it("rejects a customer", async () => {
    const res = await (await signIn("ada"))("GET", "/api/admin/users");
    expect([401, 403]).toContain(res.status);
  });

  it("lists up to 50 newest users for an admin", async () => {
    const res = await (await signIn("admin"))("GET", "/api/admin/users");
    expect(res.status).toBe(200);
    const { users } = res.json;
    expect(users.length).toBeGreaterThan(0);
    expect(users.length).toBeLessThanOrEqual(50);
    expect(Object.keys(users[0]).sort()).toEqual(["created_at", "email", "id", "name", "role"]);
    const times = users.map((u: { created_at: string }) => Date.parse(u.created_at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});
