import { sql } from "../db";

const STATUSES = ["open", "planned", "in_progress", "shipped"];

export async function listFeedback(query: Record<string, unknown>, userId: number) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const status = STATUSES.includes(String(query.status)) ? String(query.status) : null;
  const q = String(query.q ?? "").trim();
  const order = query.sort === "newest" ? "f.created_at DESC, f.id DESC" : "votes DESC, f.created_at DESC, f.id DESC";
  const where = `($1::text IS NULL OR f.status = $1) AND ($2 = '' OR f.title ILIKE '%' || $2 || '%' OR f.body ILIKE '%' || $2 || '%')`;

  const items = await sql<{ id: number; comments?: number }>(
    `SELECT f.id, f.title, f.body, f.status, u.name AS author, f.created_at, f.shipped_at,
            (SELECT count(*)::int FROM votes v WHERE v.feedback_id = f.id) AS votes,
            EXISTS (SELECT 1 FROM votes v WHERE v.feedback_id = f.id AND v.user_id = $3) AS voted
       FROM feedback f JOIN users u ON u.id = f.author_id
      WHERE ${where}
      ORDER BY ${order}
      LIMIT $4 OFFSET $5`,
    [status, q, userId, limit, (page - 1) * limit],
  );
  for (const item of items) {
    const [c] = await sql<{ n: number }>("SELECT count(*)::int AS n FROM comments WHERE feedback_id = $1", [item.id]);
    item.comments = c.n;
  }
  const [{ total }] = await sql<{ total: number }>(`SELECT count(*)::int AS total FROM feedback f WHERE ${where}`, [status, q]);
  return { items, page, limit, total };
}
