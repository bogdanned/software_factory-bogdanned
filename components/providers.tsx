"use client";

import { ThemeProvider } from "next-themes";
import posthog from "posthog-js";
import { useEffect } from "react";

// PostHog stays off until NEXT_PUBLIC_POSTHOG_KEY is set.
function usePostHog() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
      autocapture: true,
      disable_session_recording: true,
    });
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  usePostHog();
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
