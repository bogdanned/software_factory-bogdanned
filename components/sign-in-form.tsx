"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function signIn(body: { persona: string; password?: string }) {
    setError("");
    const res = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't sign in");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-2">
        <Button onClick={() => signIn({ persona: "ada" })}>Continue as Ada</Button>
        <Button variant="outline" onClick={() => signIn({ persona: "lin" })}>
          Continue as Lin
        </Button>
      </div>
      <form
        className="space-y-2 border-t pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          signIn({ persona: "admin", password: String(new FormData(e.currentTarget).get("password")) });
        }}
      >
        <Label htmlFor="password">Admin password</Label>
        <div className="flex gap-2">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
          <Button type="submit" variant="secondary">
            Sign in
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
