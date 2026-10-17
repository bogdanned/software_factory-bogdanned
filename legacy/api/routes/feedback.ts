import { Router } from "express";
import { sql } from "../db";
import { requireUser } from "../session";

export const feedbackRoutes = Router();

const STATUSES = ["open", "planned", "in_progress", "shipped"];

interface Row {
  id: number;
  title: string;
  body: string;
  status: string;
  author: string;
  created_at: string;
  shipped_at: string | null;
  votes: number;
  voted: boolean;
  comments?: number;
}

feedbackRoutes.get("/feedback", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const status = STATUSES.includes(String(req.query.status)) ? String(req.query.status) : null;
  const q = String(req.query.q ?? "").trim();
  const where = `($1::text IS NULL OR f.status = $1) AND ($2 = '' OR f.title ILIKE '%' || $2 || '%' OR f.body ILIKE '%' || $2 || '%')`;

  const items = await sql<Row>(
    `SELECT f.id, f.title, f.body, f.status, u.name AS author, f.created_at, f.shipped_at,
            (SELECT count(*)::int FROM votes v WHERE v.feedback_id = f.id) AS votes,
            EXISTS (SELECT 1 FROM votes v WHERE v.feedback_id = f.id AND v.user_id = $3) AS voted
       FROM feedback f JOIN users u ON u.id = f.author_id
      WHERE ${where}
      ORDER BY votes DESC
      LIMIT $4 OFFSET $5`,
    [status, q, req.user?.id ?? 0, limit, (page - 1) * limit],
  );
  for (const item of items) {
    const [c] = await sql<{ n: number }>("SELECT count(*)::int AS n FROM comments WHERE feedback_id = $1", [item.id]);
    item.comments = c.n;
  }
  const [{ total }] = await sql<{ total: number }>(`SELECT count(*)::int AS total FROM feedback f WHERE ${where}`, [status, q]);
  res.json({ items, page, limit, total });
});

feedbackRoutes.get("/feedback/:id", async (req, res) => {
  const [item] = await sql<Row>(
    `SELECT f.id, f.title, f.body, f.status, u.name AS author, f.created_at, f.shipped_at,
            (SELECT count(*)::int FROM votes v WHERE v.feedback_id = f.id) AS votes,
            EXISTS (SELECT 1 FROM votes v WHERE v.feedback_id = f.id AND v.user_id = $2) AS voted
       FROM feedback f JOIN users u ON u.id = f.author_id WHERE f.id = $1`,
    [Number(req.params.id) || 0, req.user?.id ?? 0],
  );
  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const comments = await sql(
    `SELECT c.id, c.body, c.created_at, u.name AS author FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.feedback_id = $1 ORDER BY c.created_at`,
    [item.id],
  );
  res.json({ item, comments });
});

feedbackRoutes.post("/feedback", requireUser, async (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  const body = String(req.body?.body ?? "").trim();
  if (title.length < 3 || title.length > 200) {
    res.status(400).json({ error: "Title must be 3 to 200 characters" });
    return;
  }
  const [item] = await sql("INSERT INTO feedback (title, body, author_id) VALUES ($1, $2, $3) RETURNING id, title, body, status", [
    title,
    body,
    req.user!.id,
  ]);
  res.status(201).json({ item });
});

async function voteCount(id: number): Promise<number> {
  const [{ n }] = await sql<{ n: number }>("SELECT count(*)::int AS n FROM votes WHERE feedback_id = $1", [id]);
  return n;
}

feedbackRoutes.post("/feedback/:id/vote", requireUser, async (req, res) => {
  const id = Number(req.params.id) || 0;
  // The unique constraint on (feedback_id, user_id) makes this safe under concurrent requests.
  const inserted = await sql(
    "INSERT INTO votes (feedback_id, user_id) VALUES ($1, $2) ON CONFLICT (feedback_id, user_id) DO NOTHING RETURNING id",
    [id, req.user!.id],
  );
  if (inserted.length === 0) {
    res.status(409).json({ error: "Already voted" });
    return;
  }
  res.status(201).json({ votes: await voteCount(id) });
});

feedbackRoutes.delete("/feedback/:id/vote", requireUser, async (req, res) => {
  const id = Number(req.params.id) || 0;
  await sql("DELETE FROM votes WHERE feedback_id = $1 AND user_id = $2", [id, req.user!.id]);
  res.json({ votes: await voteCount(id) });
});

feedbackRoutes.post("/feedback/:id/comments", requireUser, async (req, res) => {
  const body = String(req.body?.body ?? "").trim();
  if (!body) {
    res.status(400).json({ error: "Write a comment first" });
    return;
  }
  const [comment] = await sql("INSERT INTO comments (feedback_id, user_id, body) VALUES ($1, $2, $3) RETURNING id, body", [
    Number(req.params.id) || 0,
    req.user!.id,
    body,
  ]);
  res.status(201).json({ comment });
});

feedbackRoutes.patch("/feedback/:id/status", requireUser, async (req, res) => {
  const id = Number(req.params.id) || 0;
  const status = String(req.body?.status ?? "");
  if (!STATUSES.includes(status)) {
    res.status(400).json({ error: "Unknown status" });
    return;
  }
  const [item] = await sql<{ id: number; title: string; status: string }>(
    `UPDATE feedback SET status = $2, shipped_at = CASE WHEN $2 = 'shipped' THEN now() ELSE shipped_at END
      WHERE id = $1 RETURNING id, title, status`,
    [id, status],
  );
  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (status === "shipped") {
    const recipients = await sql<{ email: string }>(
      `SELECT u.email FROM votes v JOIN users u ON u.id = v.user_id WHERE v.feedback_id = $1
       UNION ALL
       SELECT u.email FROM comments c JOIN users u ON u.id = c.user_id WHERE c.feedback_id = $1`,
      [id],
    );
    for (const r of recipients) {
      await sql("INSERT INTO outbox (to_email, subject, feedback_id) VALUES ($1, $2, $3)", [r.email, `Shipped: ${item.title}`, id]);
    }
  }
  res.json({ item });
});

feedbackRoutes.get("/changelog", async (_req, res) => {
  const items = await sql(
    `SELECT id, title, shipped_at FROM feedback WHERE status = 'shipped' ORDER BY shipped_at DESC NULLS LAST`,
  );
  res.json({ items });
});
