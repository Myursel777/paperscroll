import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset password", description: "Request a password reset link." };

export default function Page() {
  return <ForgotPasswordForm />;
}
