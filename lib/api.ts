import { cookies } from "next/headers";
import { legacyRequest } from "./legacy";

// Server components read the legacy API in-process, with the visitor's cookie.
export async function api<T>(path: string): Promise<{ status: number; data: T }> {
  const cookie = (await cookies()).toString();
  const res = await legacyRequest("GET", path, cookie ? { cookie } : {});
  return { status: res.status, data: JSON.parse(res.body || "null") as T };
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: "customer" | "admin";
  timezone: string;
}

export interface FeedbackItem {
  id: number;
  title: string;
  body: string;
  status: "open" | "planned" | "in_progress" | "shipped";
  author: string;
  created_at: string;
  shipped_at: string | null;
  votes: number;
  voted: boolean;
  comments?: number;
}

export async function currentUser(): Promise<User | null> {
  return (await api<{ user: User | null }>("/api/me")).data.user;
}
