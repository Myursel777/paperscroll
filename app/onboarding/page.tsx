import type { Metadata } from "next";
import { OnboardingForm } from "@/components/account/OnboardingForm";

export const metadata: Metadata = { title: "Welcome" };

export default function Page() {
  return <OnboardingForm />;
}
