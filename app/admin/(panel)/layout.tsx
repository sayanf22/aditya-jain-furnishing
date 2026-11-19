import { AdminShell } from "@/components/admin/Shell";

export default function PanelLayout({ children }: LayoutProps<"/admin">) {
  return <AdminShell>{children}</AdminShell>;
}