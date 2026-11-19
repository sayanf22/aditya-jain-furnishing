import type { Metadata } from "next";
import { SiteScreen } from "@/components/admin/Site";

export const metadata: Metadata = { title: "Site" };

export default function Page() {
  return <SiteScreen />;
}
