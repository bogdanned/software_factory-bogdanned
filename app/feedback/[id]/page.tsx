import { notFound } from "next/navigation";
import { CommentForm } from "@/components/comment-form";
import { StatusBadge } from "@/components/status-badge";
import { VoteButton } from "@/components/vote-button";
import { api, currentUser, type FeedbackItem } from "@/lib/api";
import { timeAgo } from "@/legacy/api/lib/format";

interface Comment {
  id: number;
  body: string;
  author: string;
  created_at: string;
}

export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [res, user] = await Promise.all([api<{ item: FeedbackItem; comments: Comment[] }>(`/api/feedback/${id}`), currentUser()]);
  if (res.status === 404) notFound();
  const { item, comments } = res.data;

  return (
    <article className="space-y-6">
      <div className="flex items-start gap-4">
        <VoteButton id={item.id} votes={item.votes} voted={item.voted} signedIn={Boolean(user)} />
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-2xl font-semibold">{item.title}</h1>
          <p className="text-sm text-muted-foreground">
            {item.author} · {timeAgo(item.created_at)}
          </p>
        </div>
        <StatusBadge status={item.status} />
      </div>
      {item.body && <p className="whitespace-pre-wrap">{item.body}</p>}

      <section className="space-y-4">
        <h2 className="font-semibold">Comments</h2>
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border p-3 text-sm">
              <p>{c.body}</p>
              <p className="mt-1 text-muted-foreground">
                {c.author} · {timeAgo(c.created_at)}
              </p>
            </li>
          ))}
        </ul>
        {user && <CommentForm id={item.id} />}
      </section>
    </article>
  );
}
