import type { Metadata } from "next";
import { SecurityScreen } from "@/components/admin/Security";

export const metadata: Metadata = { title: "Security" };

export default function Page() {
  return <SecurityScreen />;
}
