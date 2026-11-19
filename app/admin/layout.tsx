import type { Metadata } from "next";
import "./admin.css";

// The dashboard is private: kept out of search results and previews.
export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s | Dashboard" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <div className="adm-root">{children}</div>;
}