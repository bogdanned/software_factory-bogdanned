import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VoteButton } from "@/components/vote-button";
import { api, currentUser, type FeedbackItem } from "@/lib/api";
import { plural, timeAgo } from "@/legacy/api/lib/format";

const FILTERS = [
  ["", "All"],
  ["open", "Open"],
  ["planned", "Planned"],
  ["in_progress", "In progress"],
  ["shipped", "Shipped"],
] as const;
const LIMIT = 20;

export default async function Board({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { status = "", q = "", page = "1" } = await searchParams;
  const params = new URLSearchParams({ status, q, page, limit: String(LIMIT) });
  const [{ data }, user] = await Promise.all([
    api<{ items: FeedbackItem[]; total: number; page: number }>(`/api/feedback?${params}`),
    currentUser(),
  ]);
  const pages = Math.max(1, Math.ceil(data.total / LIMIT));
  const href = (p: Record<string, string>) => `/?${new URLSearchParams({ status, q, ...p })}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Feedback</h1>
        {user && (
          <Button nativeButton={false} render={<Link href="/new" />}>
            New idea
          </Button>
        )}
      </div>

      <form className="flex gap-2">
        <input type="hidden" name="status" value={status} />
        <Input name="q" defaultValue={q} placeholder="Search" aria-label="Search" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map(([value, label]) => (
          <Button key={value} size="sm" variant={status === value ? "secondary" : "ghost"} nativeButton={false} render={<Link href={href({ status: value, page: "1" })} />}>
            {label}
          </Button>
        ))}
      </div>

      <ul className="divide-y rounded-lg border">
        {data.items.map((item) => (
          <li key={item.id} className="flex items-center gap-4 p-4" data-testid="feedback-row">
            <VoteButton id={item.id} votes={item.votes} voted={item.voted} signedIn={Boolean(user)} />
            <div className="min-w-0 flex-1 space-y-1">
              <Link href={`/feedback/${item.id}`} className="font-medium hover:underline">
                {item.title}
              </Link>
              <p className="text-sm text-muted-foreground">
                {item.author} · {timeAgo(item.created_at)} · {plural(item.comments ?? 0, "comment")}
              </p>
            </div>
            <StatusBadge status={item.status} />
          </li>
        ))}
        {data.items.length === 0 && <li className="p-4 text-sm text-muted-foreground">No feedback.</li>}
      </ul>

      {pages > 1 && (
        <nav className="flex gap-1" aria-label="Pages">
          {Array.from({ length: pages }, (_, i) => String(i + 1)).map((p) => (
            <Button key={p} size="sm" variant={p === page ? "secondary" : "ghost"} nativeButton={false} render={<Link href={href({ page: p })} />}>
              {p}
            </Button>
          ))}
        </nav>
      )}
    </div>
  );
}
