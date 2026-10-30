import { Router } from "express";
import { sql } from "../db";
import { requireAdmin } from "../session";

export const admin = Router();

admin.get("/admin/digest", requireAdmin, async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? String(req.query.date) : new Date().toISOString().slice(0, 10);
  const items = await sql(
    `SELECT f.id, f.title, f.created_at, u.name AS author FROM feedback f JOIN users u ON u.id = f.author_id
      WHERE f.created_at::date = $1::date ORDER BY f.created_at`,
    [date],
  );
  res.json({ date, items });
});

admin.get("/admin/outbox", requireAdmin, async (req, res) => {
  const feedbackId = Number(req.query.feedback) || null;
  const emails = await sql(
    `SELECT id, to_email, subject, feedback_id, created_at FROM outbox
      WHERE $1::int IS NULL OR feedback_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [feedbackId],
  );
  res.json({ emails });
});

admin.get("/admin/users", requireAdmin, async (_req, res) => {
  const users = await sql("SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 50");
  res.json({ users });
});
