import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/api";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (user?.role !== "admin") redirect("/sign-in");
  return (
    <div className="space-y-6">
      <nav className="flex gap-4 text-sm">
        <Link href="/admin" className="hover:underline">
          Feedback
        </Link>
        <Link href="/admin/digest" className="hover:underline">
          Digest
        </Link>
        <Link href="/admin/outbox" className="hover:underline">
          Outbox
        </Link>
      </nav>
      {children}
    </div>
  );
}
