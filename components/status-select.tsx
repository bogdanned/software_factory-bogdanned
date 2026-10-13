"use client";

import { useRouter } from "next/navigation";
import { statusLabel } from "@/legacy/api/lib/format";

const STATUSES = ["open", "planned", "in_progress", "shipped"];

export function StatusSelect({ id, status }: { id: number; status: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="Status"
      defaultValue={status}
      className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
      onChange={async (e) => {
        await fetch(`/api/feedback/${id}/status`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: e.target.value }),
        });
        router.refresh();
      }}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {statusLabel(s)}
        </option>
      ))}
    </select>
  );
}
