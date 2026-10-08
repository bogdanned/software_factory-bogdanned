import { legacyRequest } from "@/lib/legacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every /api/* request goes to the legacy Express app.
async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const payload = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();
  const res = await legacyRequest(req.method, url.pathname + url.search, headers, payload);
  const out = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined || key === "content-length" || key === "transfer-encoding" || key === "connection") continue;
    for (const v of Array.isArray(value) ? value : [value]) out.append(key, String(v));
  }
  return new Response(res.body, { status: res.status, headers: out });
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE, handle as PUT };
