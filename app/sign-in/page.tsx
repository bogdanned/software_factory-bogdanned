import { SignInForm } from "@/components/sign-in-form";

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <SignInForm />
    </div>
  );
}
