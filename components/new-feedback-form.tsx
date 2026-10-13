"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const TITLE_MAX = 120;

export function NewFeedbackForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setPending(true);
        const form = new FormData(e.currentTarget);
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: form.get("title"), body: form.get("body") }),
        });
        setPending(false);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Something went wrong");
          return;
        }
        router.push(`/feedback/${data.item.id}`);
        router.refresh();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required minLength={3} maxLength={TITLE_MAX} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="body">Details</Label>
        <Textarea id="body" name="body" rows={5} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Post
      </Button>
    </form>
  );
}
