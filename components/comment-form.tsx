"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function CommentForm({ id }: { id: number }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch(`/api/feedback/${id}/comments`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        });
        if (res.ok) {
          setBody("");
          router.refresh();
        }
      }}
    >
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment" aria-label="Comment" />
      <Button type="submit" disabled={!body.trim()}>
        Comment
      </Button>
    </form>
  );
}
