import type { Metadata } from "next";
import { DesignsScreen } from "@/components/admin/Designs";

export const metadata: Metadata = { title: "Designs" };

export default function Page() {
  return <DesignsScreen />;
}
