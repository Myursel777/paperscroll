import type { Metadata } from "next";
import { ForYouPanel } from "@/components/account/ForYouPanel";

export const metadata: Metadata = { title: "For You" };

export default function Page() {
  return <ForYouPanel />;
}
