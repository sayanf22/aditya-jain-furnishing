import type { Metadata } from "next";
import { CollectionsScreen } from "@/components/admin/Collections";

export const metadata: Metadata = { title: "Collections" };

export default function Page() {
  return <CollectionsScreen />;
}
