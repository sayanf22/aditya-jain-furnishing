import type { Metadata } from "next";
import { SetupScreen } from "@/components/admin/AuthForms";

export const metadata: Metadata = { title: "Set up" };

export default function Page() {
  return <SetupScreen />;
}
