"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await fetch("/api/auth/sign-out", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
