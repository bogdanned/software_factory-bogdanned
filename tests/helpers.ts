import { legacyRequest } from "@/lib/legacy";

// Calls the legacy API in-process, keeping the session cookie between calls.
export function client() {
  let cookie = "";
  return async function call(method: string, url: string, body?: unknown) {
    const headers: Record<string, string> = cookie ? { cookie } : {};
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await legacyRequest(method, url, headers, body === undefined ? undefined : JSON.stringify(body));
    const set = res.headers["set-cookie"];
    if (set) cookie = String(Array.isArray(set) ? set[0] : set).split(";")[0];
    return { status: res.status, headers: res.headers, json: JSON.parse(res.body || "null") };
  };
}

export async function signIn(as: "admin" | "ada" | "lin") {
  const call = client();
  const body = as === "admin" ? { persona: as, password: process.env.ADMIN_PASSWORD ?? "bugboard-admin" } : { persona: as };
  const res = await call("POST", "/api/auth/sign-in", body);
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`);
  return call;
}
