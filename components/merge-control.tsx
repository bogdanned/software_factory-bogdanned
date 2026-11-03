"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MergeControl({ id }: { id: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState("");

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Merge into...
      </Button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        const res = await fetch(`/api/admin/feedback/${id}/merge`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetId: Number(targetId) }),
        });
        if (res.ok) {
          router.push(`/feedback/${Number(targetId)}`);
          router.refresh();
        } else {
          setError((await res.json().catch(() => null))?.error ?? "Merge failed");
        }
      }}
    >
      <Input
        type="number"
        min={1}
        value={targetId}
        onChange={(e) => setTargetId(e.target.value)}
        placeholder="Target id"
        aria-label="Target feedback id"
        className="w-32"
      />
      <Button type="submit" disabled={!targetId}>
        Confirm merge
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
