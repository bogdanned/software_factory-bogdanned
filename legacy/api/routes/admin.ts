import { Router } from "express";
import { sql, transaction } from "../db";
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

admin.post("/admin/feedback/:id/merge", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const targetId = Number(req.body?.targetId);
  if (!Number.isInteger(id) || !Number.isInteger(targetId) || id < 1 || targetId < 1) {
    res.status(400).json({ error: "targetId must be a feedback id" });
    return;
  }
  if (id === targetId) {
    res.status(400).json({ error: "Cannot merge an item into itself" });
    return;
  }
  const result = await transaction<{ status: number; error?: string }>(async (q) => {
    const rows = await q<{ id: number; merged_into_id: number | null }>(
      "SELECT id, merged_into_id FROM feedback WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE",
      [[id, targetId]],
    );
    const dup = rows.find((r) => r.id === id);
    const target = rows.find((r) => r.id === targetId);
    if (!dup || !target) return { status: 404, error: "Not found" };
    if (dup.merged_into_id !== null) return { status: 409, error: "Already merged" };
    if (target.merged_into_id !== null) return { status: 409, error: "Target is merged into another item" };

    await q("UPDATE comments SET feedback_id = $2 WHERE feedback_id = $1", [id, targetId]);
    // Keep one vote per user: skip users already on the target, and collapse repeated rows.
    await q(
      `UPDATE votes SET feedback_id = $2
        WHERE id IN (SELECT min(id) FROM votes WHERE feedback_id = $1
                        AND user_id NOT IN (SELECT user_id FROM votes WHERE feedback_id = $2)
                      GROUP BY user_id)`,
      [id, targetId],
    );
    await q("DELETE FROM votes WHERE feedback_id = $1", [id]);
    await q("UPDATE feedback SET merged_into_id = $2 WHERE id = $1", [id, targetId]);
    return { status: 200 };
  });
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ merged: id, into: targetId });
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
