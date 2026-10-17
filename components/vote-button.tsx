"use client";

import { ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function VoteButton({ id, votes, voted, signedIn }: { id: number; votes: number; voted: boolean; signedIn: boolean }) {
  const router = useRouter();
  const [count, setCount] = useState(votes);
  const [mine, setMine] = useState(voted);
  // A ref, not state: it blocks the second click of a double-click before React re-renders.
  const inFlight = useRef(false);

  async function vote() {
    if (!signedIn) {
      router.push("/sign-in");
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/feedback/${id}/vote`, { method: mine ? "DELETE" : "POST" });
      if (res.status === 409) {
        // The vote already exists (for example from another tab): show the server's state.
        setMine(true);
        router.refresh();
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setCount(data.votes);
      setMine(!mine);
      router.refresh();
    } finally {
      inFlight.current = false;
    }
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
