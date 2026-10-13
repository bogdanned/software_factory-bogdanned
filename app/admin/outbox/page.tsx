import { api } from "@/lib/api";
import { timeAgo } from "@/legacy/api/lib/format";

export default async function Outbox() {
  const { data } = await api<{ emails: { id: number; to_email: string; subject: string; created_at: string }[] }>("/api/admin/outbox");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Outbox</h1>
      <ul className="divide-y rounded-lg border">
        {data.emails.map((e) => (
          <li key={e.id} className="flex gap-3 p-3 text-sm">
            <span className="w-44 shrink-0 truncate">{e.to_email}</span>
            <span className="min-w-0 flex-1 truncate">{e.subject}</span>
            <span className="text-muted-foreground">{timeAgo(e.created_at)}</span>
          </li>
        ))}
        {data.emails.length === 0 && <li className="p-3 text-sm text-muted-foreground">No emails.</li>}
      </ul>
    </div>
  );
}
