import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { sql } from "./db";

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: "customer" | "admin";
  timezone: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser;
  }
}

const COOKIE = "bugboard_session";
const DAYS = 14;

function sign(id: string): string {
  const secret = process.env.SESSION_SECRET ?? "dev-secret";
  return `${id}.${createHmac("sha256", secret).update(id).digest("base64url")}`;
}

function unsign(value: string): string | null {
  const [id, mac] = value.split(".");
  if (!id || !mac) return null;
  const expected = sign(id).split(".")[1];
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

function readCookie(req: Request): string | null {
  const raw = req.headers.cookie ?? "";
  const pair = raw.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return pair ? decodeURIComponent(pair.slice(COOKIE.length + 1)) : null;
}

export async function startSession(res: Response, userId: number): Promise<void> {
  const id = randomBytes(24).toString("base64url");
  await sql("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))", [id, userId, DAYS]);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${sign(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 86400}${secure}`);
}

export async function endSession(req: Request, res: Response): Promise<void> {
  const value = readCookie(req);
  const id = value && unsign(value);
  if (id) await sql("DELETE FROM sessions WHERE id = $1", [id]);
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export async function loadUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const value = readCookie(req);
  const id = value && unsign(value);
  if (id) {
    const rows = await sql<SessionUser>(
      `SELECT u.id, u.email, u.name, u.role, u.timezone FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.expires_at > now()`,
      [id],
    );
    req.user = rows[0];
  }
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Sign in first" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Admins only" });
    return;
  }
  next();
}
