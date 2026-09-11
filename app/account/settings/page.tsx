import type { Metadata } from "next";
import { SettingsForm } from "@/components/account/SettingsForm";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <SettingsForm />;
}
