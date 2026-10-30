// Home page, in the order set by the revised agreement (§02):
// 01 Hero · 02 Main categories · 03 Interactive home décor ·
// 04 Watch & Buy · 05 Customer testimonials · 06 Quick enquiry.
// Pre-rendered at build time from D1, so a visit doesn't render anything on
// the Worker.
import { Categories } from "@/components/home/Categories";
import { DecorPicker } from "@/components/home/DecorPicker";
import { Hero } from "@/components/home/Hero";
import { Marquee } from "@/components/home/Marquee";
import { QuickEnquiry } from "@/components/home/QuickEnquiry";
import { Testimonials } from "@/components/home/Testimonials";
import { WatchAndBuy } from "@/components/home/WatchAndBuy";
import { whatsappLink } from "@/lib/contact";
import { getHomeContent } from "@/lib/content";

export const dynamic = "force-static";

export default async function Home() {
  const home = await getHomeContent();
  const whatsappBase = whatsappLink(home.contact);
  const city = home.contact.addressLine2.split(" ").slice(0, -1).join(" ") || home.contact.addressLine2;

  return (
    <main>
      <Hero slides={home.heroSlides} eyebrow={{ brand: home.contact.businessName, place: city }} />
      <Marquee items={[...home.categories.map((c) => c.name), "Showroom in Kirti Nagar, New Delhi"]} />
      <Categories categories={home.categories} />
      {home.decor && <DecorPicker scene={home.decor} whatsappBase={whatsappBase} />}
      <WatchAndBuy items={home.watch} whatsappBase={whatsappBase} />
      <Testimonials items={home.testimonials} />
      <QuickEnquiry contact={home.contact} imageKey={home.enquiryImageKey} />
    </main>
  );
}
