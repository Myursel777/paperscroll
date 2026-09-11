import type { Metadata } from "next";
import { DataPanel } from "@/components/account/DataPanel";

export const metadata: Metadata = { title: "Your data" };

export default function Page() {
  return <DataPanel />;
}
