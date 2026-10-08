import Link from "next/link";
import { api, currentUser } from "@/lib/api";
import { timeAgo } from "@/legacy/api/lib/format";

export default async function Digest({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await currentUser();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: user?.timezone ?? "UTC" }).format(new Date());
  const { date = today } = await searchParams;
  const { data } = await api<{ date: string; items: { id: number; title: string; author: string; created_at: string }[] }>(
    `/api/admin/digest?date=${encodeURIComponent(date)}`,
  );
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Digest · {data.date}</h1>
      <ul className="divide-y rounded-lg border">
        {data.items.map((item) => (
          <li key={item.id} className="p-3 text-sm">
            <Link href={`/feedback/${item.id}`} className="font-medium hover:underline">
              {item.title}
            </Link>
            <span className="text-muted-foreground">
              {" "}
              · {item.author} · {timeAgo(item.created_at)}
            </span>
          </li>
        ))}
        {data.items.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nothing new.</li>}
      </ul>
    </div>
  );
}
