// Home page, in the order set by the revised agreement (§02):
// 01 Hero · 02 Main categories · 03 Interactive home décor, as one
// interactive room (13 Nov 2026: the client asked for the "Our looks"
// Watch & Buy section to be merged into it) · 04 Customer testimonials ·
// 05 Quick enquiry (with the enquiry form).
// Pre-rendered at build time from D1, so a visit doesn't render anything on
// the Worker.
import { Suspense } from "react";
import { Categories } from "@/components/home/Categories";
import { Hero } from "@/components/home/Hero";
import { Marquee } from "@/components/home/Marquee";
import { QuickEnquiry } from "@/components/home/QuickEnquiry";
import { RoomStudio } from "@/components/home/room/RoomStudio";
import { Testimonials } from "@/components/home/Testimonials";
import { whatsappLink } from "@/lib/contact";
import { getHomeContent } from "@/lib/content";

export const dynamic = "force-static";

export default async function Home() {
  const home = await getHomeContent();
  const whatsappBase = whatsappLink(home.contact);
  const city = home.contact.addressLine2.split(" ").slice(0, -1).join(" ") || home.contact.addressLine2;

  // Each section is its own Suspense boundary. The HTML is complete either
  // way (the page is pre-rendered), but React can then hydrate the sections
  // one at a time and let the browser breathe in between, instead of one
  // long task that blocks taps on a slower phone.
  return (
    <main>
      <Hero slides={home.heroSlides} eyebrow={{ brand: home.contact.businessName, place: city }} />
      <Marquee items={[...home.categories.map((c) => c.name), "Showroom in Kirti Nagar, New Delhi"]} />
      <Suspense fallback={null}>
        <Categories categories={home.categories} />
      </Suspense>
      <Suspense fallback={null}>
        <RoomStudio room={home.room} whatsappBase={whatsappBase} />
      </Suspense>
      <Suspense fallback={null}>
        <Testimonials items={home.testimonials} />
      </Suspense>
      <Suspense fallback={null}>
        <QuickEnquiry contact={home.contact} categories={home.categories} />
      </Suspense>
    </main>
  );
}
