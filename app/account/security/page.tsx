import type { Metadata } from "next";
import { SecurityForm } from "@/components/account/SecurityForm";

export const metadata: Metadata = { title: "Security" };

export default function Page() {
  return <SecurityForm />;
}
