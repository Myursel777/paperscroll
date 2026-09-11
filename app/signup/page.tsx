import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Create account", description: "Create a PaperScroll account to sync your saved papers." };

export default function Page() {
  return <SignupForm />;
}
