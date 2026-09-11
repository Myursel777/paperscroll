import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Log in", description: "Log in to PaperScroll." };

export default function Page() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
