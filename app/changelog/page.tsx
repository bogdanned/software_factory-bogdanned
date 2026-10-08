import Link from "next/link";
import { api } from "@/lib/api";

export default async function Changelog() {
  const { data } = await api<{ items: { id: number; title: string; shipped_at: string | null }[] }>("/api/changelog");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Changelog</h1>
      <ul className="space-y-3">
        {data.items.map((item) => (
          <li key={item.id} className="flex gap-4">
            <span className="w-24 shrink-0 text-sm text-muted-foreground tabular-nums">{item.shipped_at?.slice(0, 10)}</span>
            <Link href={`/feedback/${item.id}`} className="hover:underline">
              {item.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
