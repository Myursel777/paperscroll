import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = { title: "Choose a new password", description: "Set a new password for your PaperScroll account." };

export default function Page() {
  return <ResetPasswordForm />;
}
