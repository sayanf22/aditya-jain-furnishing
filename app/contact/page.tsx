// Contact: the enquiry form plus every way to reach the showroom
// (agreement §02: enquiry form, chat, Instagram, phone). Opens with a
// full-width photo like the other pages. Pre-rendered at build time from
// D1. The Instagram option appears once a handle is added in the settings.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EnquiryForm } from "@/components/EnquiryForm";
import { ArrowRightIcon, ArrowUpRightIcon, InstagramIcon, MapPinIcon, PhoneIcon, WhatsAppIcon } from "@/components/icons";
import { PageHero } from "@/components/PageHero";
import { RevealImage } from "@/components/RevealImage";
import { enquiryMessage, instagramLink, mapsLink, phoneLink, whatsappLink } from "@/lib/contact";
import { contactFrom, getCategories, getSettings } from "@/lib/content";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Call, message or visit the Delta Furnishings showroom in Kirti Nagar, New Delhi, or send an enquiry for your home or a client's project.",
};

const delay = (n: number) => ({ ["--reveal-delay" as string]: n });

export default async function ContactPage() {
  const [settings, categories] = await Promise.all([getSettings(), getCategories()]);
  const contact = contactFrom(settings);
  const whatsapp = whatsappLink(contact, enquiryMessage(contact));
  const tel = phoneLink(contact);
  const instagram = instagramLink(contact);
  const directions = mapsLink(contact);

  const options: Option[] = [];
  if (whatsapp) options.push({ href: whatsapp, external: true, icon: <WhatsAppIcon className="h-5 w-5" />, title: "Message us", detail: "Chat with the showroom", accent: true });
  if (tel) options.push({ href: tel, icon: <PhoneIcon className="h-5 w-5" />, title: "Call the showroom", detail: contact.phoneDisplay ?? "" });
  if (instagram) options.push({ href: instagram, external: true, icon: <InstagramIcon className="h-5 w-5" />, title: "Instagram", detail: `@${contact.instagramHandle!.replace(/^@/, "")}` });
  options.push({ href: directions, external: true, icon: <MapPinIcon className="h-5 w-5" />, title: "Get directions", detail: contact.addressLine2 });

  return (
    <main>
      <PageHero
        id="contact-title"
        label="Contact"
        title={["Talk to", { accent: "the showroom" }]}
        intro="Ask about a fabric, a product or a visit. For your home or a client's project."
        image={settings.contact_hero_image ?? null}
        alt="White sheer curtains at a window"
        size="short"
      />

      <section className="shell py-16 sm:py-24 lg:py-28" aria-label="Ways to reach us">
        <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16 xl:gap-24">
          <div>
            <ul className="grid gap-3">
              {options.map((o, i) => (
                <li key={o.title} data-reveal style={delay(i)}>
                  <a
                    href={o.href}
                    {...(o.external ? { target: "_blank", rel: "noopener" } : {})}
                    className="contact-option group flex items-center gap-4 rounded-[1.25rem] border border-ink/10 bg-white/50 p-4 sm:gap-5 sm:p-5"
                  >
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
                        o.accent ? "bg-terracotta text-white" : "bg-terracotta/10 text-terracotta group-hover:bg-terracotta group-hover:text-white"
                      }`}
                    >
                      {o.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[1.02rem] font-medium">{o.title}</span>
                      <span className="mt-0.5 block truncate text-[0.9rem] text-muted">{o.detail}</span>
                    </span>
                    <span className="contact-arrow flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink/10 text-ink/60">
                      {o.external ? <ArrowUpRightIcon className="h-4 w-4" /> : <ArrowRightIcon className="h-4 w-4" />}
                    </span>
                  </a>
                </li>
              ))}
            </ul>

            {/* Showroom card: a photo of the showroom on top, so visitors
                know what to look for. */}
            <div className="mt-8 overflow-hidden rounded-[1.5rem] bg-night text-ivory" data-reveal style={delay(options.length)}>
              {settings.about_showroom_image && (
                <RevealImage
                  image={settings.about_showroom_image}
                  alt="Inside a furnished room"
                  sizes="(min-width: 1024px) 40vw, 100vw"
                  className="aspect-[16/9]"
                  cover="var(--color-night)"
                  delay={options.length + 1}
                />
              )}
              <div className="p-6 sm:p-8">
                <p className="text-[0.72rem] font-semibold tracking-[0.22em] text-terracotta-light uppercase">Showroom</p>
                <address className="mt-4 text-[1rem] leading-relaxed">
                  <span className="block text-[1.15rem] font-medium">{contact.legalName}</span>
                  <span className="block text-ivory/80">{contact.addressLine1}</span>
                  <span className="block text-ivory/80">{contact.addressLine2}</span>
                </address>
                {contact.gstin && <p className="mt-4 text-[0.82rem] tracking-[0.06em] text-ivory/60">GSTIN {contact.gstin}</p>}
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] bg-sand p-3 sm:p-5 lg:sticky lg:top-28" data-reveal style={delay(1)}>
            <EnquiryForm categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} source="contact" whatsappHref={whatsapp} />
          </div>
        </div>
      </section>
    </main>
  );
}

type Option = { href: string; external?: boolean; icon: ReactNode; title: string; detail: string; accent?: boolean };
