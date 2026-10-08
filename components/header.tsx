import Link from "next/link";
import { currentUser } from "@/lib/api";
import { SignOutButton } from "./sign-out-button";
import { ThemePicker } from "./theme-picker";

export async function Header() {
  const user = await currentUser();
  return (
    <header className="border-b">
      <nav className="mx-auto flex h-14 w-full max-w-3xl items-center gap-5 px-4 text-sm">
        <Link href="/" className="font-semibold">
          Pulse
        </Link>
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          Board
        </Link>
        <Link href="/changelog" className="text-muted-foreground hover:text-foreground">
          Changelog
        </Link>
        {user?.role === "admin" && (
          <Link href="/admin" className="text-muted-foreground hover:text-foreground">
            Admin
          </Link>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ThemePicker />
          {user ? (
            <>
              <span className="text-muted-foreground">{user.name}</span>
              <SignOutButton />
            </>
          ) : (
            <Link href="/sign-in" className="hover:underline">
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
