import inject from "light-my-request";
import { createApp } from "@/legacy/api/server";

let app: ReturnType<typeof createApp> | null = null;

export interface LegacyResponse {
  status: number;
  headers: Record<string, string | number | string[] | undefined>;
  body: string;
}

// Calls the legacy Express app in-process: no second server, no network hop.
export async function legacyRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  payload?: string,
): Promise<LegacyResponse> {
  app ??= createApp();
  const res = await inject(app as never, { method: method as never, url, headers, payload });
  return { status: res.statusCode, headers: res.headers, body: res.payload };
}
