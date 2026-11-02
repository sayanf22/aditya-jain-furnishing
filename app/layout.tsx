import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Instrument_Sans } from "next/font/google";
import { FloatingWhatsApp } from "@/components/FloatingWhatsApp";
import { RevealObserver } from "@/components/RevealObserver";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { enquiryMessage, phoneLink, whatsappLink } from "@/lib/contact";
import { contactFrom, getCategories, getSettings } from "@/lib/content";
import "./globals.css";

// Self-hosted at build time by next/font: regular to semibold, upright only.
const instrument = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal"],
  display: "swap",
  variable: "--font-instrument",
});

export const metadata: Metadata = {
  title: {
    default: "Delta Furnishings | Home Furnishing Showroom, Kirti Nagar, New Delhi",
    template: "%s | Delta Furnishings",
  },
  description:
    "Delta Furnishings, Kirti Nagar, New Delhi: upholstery fabric, curtains & blinds, carpets & mats, cushions and wallpaper. Enquire on WhatsApp or call the showroom.",
};

export const viewport: Viewport = {
  themeColor: "#faf8f2",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [settings, categories] = await Promise.all([getSettings(), getCategories()]);
  const contact = contactFrom(settings);
  const whatsapp = whatsappLink(contact, enquiryMessage(contact));

  return (
    // suppressHydrationWarning: the inline script below adds the "js" class
    // before React loads, so the class list differs from the server HTML on
    // purpose. This only silences that one attribute on <html>.
    <html lang="en-IN" className={instrument.variable} suppressHydrationWarning>
      <head>
        {/* Marks that JavaScript runs, so scroll-reveal styles only apply then. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <SiteHeader
          brand={contact.businessName}
          phoneHref={phoneLink(contact)}
          whatsappHref={whatsapp}
          address={`${contact.addressLine1}, ${contact.addressLine2}`}
        />
        {children}
        <Suspense fallback={null}>
          <SiteFooter contact={contact} categories={categories} />
        </Suspense>
        <FloatingWhatsApp href={whatsapp} />
        <RevealObserver />
      </body>
    </html>
  );
}
