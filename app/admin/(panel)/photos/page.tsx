import type { Metadata } from "next";
import { PhotosScreen } from "@/components/admin/Photos";

export const metadata: Metadata = { title: "Photos" };

export default function Page() {
  return <PhotosScreen />;
}
