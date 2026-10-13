import { Pool } from "pg";
import { databaseUrl, poolConfig } from "../lib/db-url";

// Demo data. Re-run safe: personas are upserted, feedback is only added to an
// empty board. Nobody signs in with a stored password (see routes/auth.ts).
const PERSONAS = [
  { email: "admin@bugboard.test", name: "Alex Admin", role: "admin", timezone: "Europe/Berlin" },
  { email: "ada@bugboard.test", name: "Ada", role: "customer", timezone: "America/Los_Angeles" },
  { email: "lin@bugboard.test", name: "Lin", role: "customer", timezone: "Asia/Tokyo" },
] as const;

const IDEAS: [string, string, string][] = [
  ["Café export", "Export the board as CSV for our café chain reports.", "open"],
  ["Dark mode for the widget", "The embedded widget is blinding at night.", "planned"],
  ["Slack notifications", "Post new feedback to a Slack channel.", "in_progress"],
  ["Merge duplicate ideas", "Let admins merge two ideas and keep the votes.", "open"],
  ["Email digest for customers", "Weekly email with what shipped.", "open"],
  ["Custom statuses", "We need a 'Needs info' status.", "open"],
  ["Embed the board on our site", "An iframe or script tag.", "planned"],
  ["SSO with Google", "Customers sign in with Google.", "shipped"],
  ["Comment reactions", "Thumbs up on comments.", "open"],
  ["Pin important ideas", "Admins pin ideas to the top.", "open"],
  ["Roadmap view", "A public roadmap grouped by quarter.", "planned"],
  ["Private ideas", "Ideas only admins can see.", "open"],
  ["Mobile layout", "The board is hard to use on a phone.", "shipped"],
  ["Search by author", "Find all ideas from one customer.", "open"],
  ["Attach screenshots", "Upload an image with an idea.", "open"],
  ["Changelog RSS", "Subscribe to the changelog.", "open"],
  ["Vote on behalf of a customer", "Sales logs votes from calls.", "open"],
  ["Archive old ideas", "Hide ideas older than a year.", "open"],
  ["Keyboard shortcuts", "J/K to move, V to vote.", "open"],
  ["Tag ideas", "Free-form tags on ideas.", "in_progress"],
  ["Ideas API", "A public REST API.", "open"],
  ["Zapier integration", "Trigger zaps on new ideas.", "open"],
  ["Faster board", "The board takes a while to load.", "open"],
  ["Better onboarding", "First-time admins get lost.", "open"],
  ["Translations", "German and Japanese UI.", "planned"],
  ["Résumé builder for job board", "Off-topic, but customers keep asking.", "open"],
  ["Accessibility audit", "Screen reader support on the board.", "open"],
  ["Two-factor sign-in", "TOTP for admins.", "shipped"],
  ["Custom domain", "feedback.ourcompany.com", "open"],
  ["Weekly admin report", "How many ideas came in this week.", "open"],
  ["Import from Canny", "Move our old board over.", "open"],
  ["Rate limit spam", "Bots post junk ideas.", "shipped"],
  ["Hide vote counts", "Show counts only to admins.", "open"],
  ["Due dates on planned items", "When will it ship?", "open"],
  ["Comment threads", "Reply to a comment.", "open"],
  ["Bulk status change", "Select ten ideas, mark them planned.", "open"],
  ["Customer segments", "Weight votes by plan.", "open"],
  ["Webhooks", "Call our endpoint on status change.", "shipped"],
  ["Print view", "A clean print of the roadmap.", "open"],
  ["Sort by newest", "Not only by votes.", "shipped"],
];

const url = process.env.PROD_DATABASE_URL ?? (await databaseUrl());
const pool = new Pool(poolConfig(url));
const hash = "-";

const ids: number[] = [];
for (const p of PERSONAS) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, timezone) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, timezone = EXCLUDED.timezone
     RETURNING id`,
    [p.email, hash, p.name, p.role, p.timezone],
  );
  ids.push(rows[0].id);
}
const [admin, ada, lin] = ids;

const { rows: count } = await pool.query("SELECT count(*)::int AS n FROM feedback");
if (count[0].n === 0) {
  for (const [i, [title, body, status]] of IDEAS.entries()) {
    const author = i % 2 === 0 ? ada : lin;
    const daysAgo = 40 - i;
    const { rows } = await pool.query(
      `INSERT INTO feedback (title, body, status, author_id, created_at, shipped_at)
       VALUES ($1, $2, $3, $4, now() - make_interval(days => $5), CASE WHEN $3 = 'shipped' THEN now() - make_interval(days => $5 / 2) END)
       RETURNING id`,
      [title, body, status, author, daysAgo],
    );
    const id = rows[0].id;
    // 0–3 votes per idea, so many ideas tie.
    const voters = [ada, lin, admin].slice(0, i % 4);
    for (const v of voters) await pool.query("INSERT INTO votes (feedback_id, user_id) VALUES ($1, $2)", [id, v]);
    if (i % 3 === 0) {
      await pool.query("INSERT INTO comments (feedback_id, user_id, body) VALUES ($1, $2, $3)", [id, lin, "Same here."]);
    }
  }
}
await pool.end();
console.log(`seeded ${PERSONAS.length} personas${count[0].n === 0 ? ` and ${IDEAS.length} ideas` : ""}`);
