import { redirect } from "next/navigation";
import { NewFeedbackForm } from "@/components/new-feedback-form";
import { currentUser } from "@/lib/api";

export default async function NewPage() {
  if (!(await currentUser())) redirect("/sign-in");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New idea</h1>
      <NewFeedbackForm />
    </div>
  );
}
