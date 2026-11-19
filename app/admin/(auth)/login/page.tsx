import type { Metadata } from "next";
import { SignInScreen } from "@/components/admin/AuthForms";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return <SignInScreen />;
}
