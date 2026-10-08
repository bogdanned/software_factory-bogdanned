import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { sql } from "../db";
import { endSession, requireUser, startSession } from "../session";

export const auth = Router();

const CUSTOMERS = ["ada", "lin"];

// The admin password. Production needs ADMIN_PASSWORD, or admin sign-in is
// off; anywhere else it falls back to a dev default.
function adminPassword(): string | null {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  return process.env.NODE_ENV === "production" ? null : "pulse-admin";
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Customers sign in with one click as a seeded persona; the admin with a password.
auth.post("/auth/sign-in", async (req, res) => {
  const persona = String(req.body?.persona ?? "");
  if (persona === "admin") {
    const expected = adminPassword();
    if (!expected) {
      res.status(403).json({ error: "Admin sign-in is off" });
      return;
    }
    if (!same(String(req.body?.password ?? ""), expected)) {
      res.status(401).json({ error: "Wrong password" });
      return;
    }
  } else if (!CUSTOMERS.includes(persona)) {
    res.status(400).json({ error: "Unknown persona" });
    return;
  }
  const rows = await sql<{ id: number }>("SELECT id FROM users WHERE email = $1", [`${persona}@pulse.test`]);
  if (!rows[0]) {
    res.status(404).json({ error: "Run npm run db:seed first" });
    return;
  }
  await startSession(res, rows[0].id);
  res.json({ ok: true });
});

auth.post("/auth/sign-out", async (req, res) => {
  await endSession(req, res);
  res.json({ ok: true });
});

auth.get("/me", (req, res) => {
  res.json({ user: req.user ?? null });
});

auth.patch("/me", requireUser, async (req, res) => {
  const timezone = String(req.body?.timezone ?? "");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    res.status(400).json({ error: "Unknown time zone" });
    return;
  }
  await sql("UPDATE users SET timezone = $1 WHERE id = $2", [timezone, req.user!.id]);
  res.json({ user: { ...req.user, timezone } });
});

// CI and QA only: sign in as a seeded persona without a password.
auth.post("/dev/login", async (req, res) => {
  if (process.env.PULSE_DEV_LOGIN !== "1") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const rows = await sql<{ id: number }>("SELECT id FROM users WHERE email = $1", [`${req.query.as}@pulse.test`]);
  if (!rows[0]) {
    res.status(404).json({ error: "Unknown persona" });
    return;
  }
  await startSession(res, rows[0].id);
  res.json({ ok: true });
});
