"use client";

import { ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function VoteButton({ id, votes, voted, signedIn }: { id: number; votes: number; voted: boolean; signedIn: boolean }) {
  const router = useRouter();
  const [count, setCount] = useState(votes);
  const [mine, setMine] = useState(voted);

  async function vote() {
    if (!signedIn) {
      router.push("/sign-in");
      return;
    }
    const res = await fetch(`/api/feedback/${id}/vote`, { method: mine ? "DELETE" : "POST" });
    if (!res.ok) return;
    const data = await res.json();
    setCount(data.votes);
    setMine(!mine);
    router.refresh();
  }

  return (
    <Button
      variant={mine ? "default" : "outline"}
      className="h-14 w-14 flex-col gap-0"
      onClick={vote}
      aria-label={mine ? "Remove vote" : "Vote"}
      aria-pressed={mine}
    >
      <ChevronUp />
      <span data-testid="vote-count" className="text-sm font-semibold tabular-nums">
        {count}
      </span>
    </Button>
  );
}
