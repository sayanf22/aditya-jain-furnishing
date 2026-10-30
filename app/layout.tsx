import type { Metadata } from "next";
import "./globals.css";

// Placeholder until the design guide arrives: fonts, colours and the
// header/footer are added in the Home page step.
export const metadata: Metadata = {
  title: "Home Furnishing Showroom, Kirti Nagar",
  description: "Home furnishing showroom website.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
