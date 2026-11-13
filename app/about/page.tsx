// About Us (replaced the Gallery page on 13 Nov 2026). Pre-rendered at
// build time from D1. The copy uses only what the client has confirmed:
// the business name, the showroom address, the five collections, and that
// it serves homes and businesses (the B2C / B2B enquiry form). The client's
// own story (history, people) is still to come from them; it is not
// written here until they send it.
//
// Photos come from the settings (about_*_image keys), so they can be
// replaced from the admin dashboard. Plain <a> links: the target pages are
// pre-rendered HTML.
import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { RevealImage } from "@/components/RevealImage";
import { ArrowRightIcon, ArrowUpRightIcon, MapPinIcon, PhoneIcon, WhatsAppIcon } from "@/components/icons";
import { Words } from "@/components/Words";
import { enquiryMessage, mapsLink, phoneLink, whatsappLink } from "@/lib/contact";
import { contactFrom, getCategories, getSettings } from "@/lib/content";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Delta Furnishings is a home furnishing showroom in Kirti Nagar, New Delhi: upholstery fabric, curtains & blinds, carpets & mats, cushions and wallpaper, for homes and interior designers.",
};

const delay = (n: number) => ({ ["--reveal-delay" as string]: n });

export default async function AboutPage() {
  const [settings, categories] = await Promise.all([getSettings(), getCategories()]);
  const contact = contactFrom(settings);
  const whatsapp = whatsappLink(contact, enquiryMessage(contact));
  const tel = phoneLink(contact);

  return (
    <main>
      <PageHero
        id="about-title"
        label="About us"
        title={["Fabrics and furnishings,", { accent: "in Kirti Nagar" }]}
        intro={`${contact.businessName} is a home furnishing showroom in Kirti Nagar, New Delhi.`}
        image={settings.about_hero_image ?? null}
        alt="Folded fabrics in many colours"
      />

      {/* Who we are */}
      <section className="py-20 sm:py-28 lg:py-36" aria-labelledby="who-title">
        <div className="shell grid items-center gap-12 lg:grid-cols-[0.9fr_1fr] lg:gap-20 xl:gap-28">
          <RevealImage
            image={settings.about_story_image ?? null}
            alt="Fabric swatches being looked through"
            sizes="(min-width: 1024px) 42vw, 100vw"
            className="aspect-[4/5] rounded-[1.75rem] lg:rounded-[2.25rem]"
          />
          <div>
            <p className="section-label" data-reveal>
              Who we are
            </p>
            <h2 id="who-title" className="mt-4 text-[2rem] leading-[1.12] font-medium sm:text-[2.6rem] lg:text-[3rem]" data-words>
              <Words parts={["Five collections", { accent: "under one roof" }]} />
            </h2>
            <p className="mt-6 max-w-lg text-[1.05rem] leading-relaxed text-ink-soft" data-reveal style={delay(2)}>
              Upholstery fabric, curtains and blinds, carpets and mats, cushions and wallpaper, all at our showroom in Furniture Block, Kirti Nagar.
            </p>
            <p className="mt-4 max-w-lg text-[1.05rem] leading-relaxed text-ink-soft" data-reveal style={delay(3)}>
              Come in to see and feel the fabrics, or send us an enquiry first.
            </p>
            <div className="mt-9 flex flex-wrap gap-3" data-reveal style={delay(4)}>
              <a
                href="/collection"
                className="btn inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[0.85rem] font-medium text-ivory hover:bg-terracotta"
              >
                Explore the collection
                <ArrowRightIcon className="btn-arrow h-4 w-4" />
              </a>
              <a
                href="#visit"
                className="btn inline-flex h-12 items-center gap-2 rounded-full border border-ink/15 px-6 text-[0.85rem] font-medium hover:border-ink hover:bg-ink hover:text-ivory"
              >
                Visit the showroom
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* The five collections */}
      {categories.length > 0 && (
        <section className="pb-20 sm:pb-28 lg:pb-36" aria-labelledby="range-title">
          <div className="shell">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="section-label" data-reveal>
                  What you&apos;ll find
                </p>
                <h2 id="range-title" className="section-title mt-3" data-words>
                  <Words parts={["Our", { accent: "collections" }]} />
                </h2>
              </div>
              <a href="/collection" className="inline-flex items-center gap-1.5 text-[0.8rem] font-semibold tracking-[0.1em] text-terracotta uppercase" data-reveal style={delay(2)}>
                <span className="link-line">See everything</span>
                <ArrowRightIcon className="h-4 w-4" />
              </a>
            </div>

            <ul className="mt-10 grid grid-cols-2 gap-3 sm:mt-12 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5 lg:gap-5">
              {categories.map((c, i) => (
                <li key={c.id} className={i === categories.length - 1 && categories.length % 2 === 1 ? "col-span-2 sm:col-span-1" : ""}>
                  <a href={`/collection/${c.slug}`} className="about-tile group block">
                    <RevealImage
                      image={c.imageKey}
                      alt=""
                      sizes="(min-width: 1024px) 19vw, (min-width: 640px) 31vw, 50vw"
                      className={`rounded-[1.25rem] lg:rounded-[1.5rem] ${i === categories.length - 1 && categories.length % 2 === 1 ? "aspect-[2/1] sm:aspect-[4/5]" : "aspect-[4/5]"}`}
                      delay={i}
                    />
                    <span className="about-tile-name mt-3.5 flex items-center justify-between gap-2 px-1" data-reveal style={delay(i + 1)}>
                      <span>
                        <span className="block text-[1.02rem] leading-snug font-medium transition-colors duration-300 group-hover:text-terracotta">{c.name}</span>
                        {c.subcategories.length > 0 && (
                          <span className="mt-0.5 block text-[0.8rem] text-muted">{c.subcategories.map((s) => s.name).join(", ")}</span>
                        )}
                      </span>
                      <ArrowRightIcon className="about-tile-arrow h-4 w-4 shrink-0 text-terracotta" />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Who we work with */}
      <section className="px-3 sm:px-5 lg:px-6" aria-labelledby="with-title">
        <div className="mx-auto max-w-[108rem] rounded-[2rem] bg-sand lg:rounded-[2.5rem]">
          <div className="shell py-16 sm:py-20 lg:py-28">
            <div className="max-w-2xl">
              <p className="section-label" data-reveal>
                Who we work with
              </p>
              <h2 id="with-title" className="section-title mt-3" data-words>
                <Words parts={["Homes and", { accent: "projects" }]} />
              </h2>
            </div>
            <div className="mt-10 grid gap-4 sm:mt-12 md:grid-cols-2 lg:gap-6">
              <div data-reveal style={delay(1)}><article className="about-card h-full rounded-[1.5rem] bg-ivory p-7 sm:p-9 lg:p-11">
                <p className="text-[0.8rem] font-semibold tracking-[0.2em] text-terracotta tabular-nums">01</p>
                <h3 className="mt-5 text-[1.5rem] leading-tight font-medium sm:text-[1.75rem]">For your home</h3>
                <p className="mt-3 max-w-md text-[1rem] leading-relaxed text-ink-soft">
                  Choose fabric, curtains, carpets, cushions and wallpaper for your own rooms.
                </p>
              </article></div>
              <div data-reveal style={delay(2)}><article className="about-card h-full rounded-[1.5rem] bg-ivory p-7 sm:p-9 lg:p-11">
                <p className="text-[0.8rem] font-semibold tracking-[0.2em] text-terracotta tabular-nums">02</p>
                <h3 className="mt-5 text-[1.5rem] leading-tight font-medium sm:text-[1.75rem]">For interior designers and businesses</h3>
                <p className="mt-3 max-w-md text-[1rem] leading-relaxed text-ink-soft">
                  Enquiring for a client&apos;s project? Choose Business (B2B) in the enquiry form and add your firm&apos;s name.
                </p>
              </article></div>
            </div>
            <div className="mt-10" data-reveal style={delay(3)}>
              <a
                href="/contact"
                className="btn inline-flex h-12 items-center gap-2 rounded-full bg-terracotta px-6 text-[0.85rem] font-medium text-white hover:bg-terracotta-dark"
              >
                Send an enquiry
                <ArrowRightIcon className="btn-arrow h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Visit the showroom */}
      <section id="visit" className="scroll-mt-24 py-20 sm:py-28 lg:py-36" aria-labelledby="visit-title">
        <div className="shell grid items-center gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-20 xl:gap-28">
          <RevealImage
            image={settings.about_showroom_image ?? null}
            alt="Inside a furnished room"
            sizes="(min-width: 1024px) 52vw, 100vw"
            className="aspect-[4/3] rounded-[1.75rem] lg:order-2 lg:rounded-[2.25rem]"
          />
          <div>
            <p className="section-label" data-reveal>
              Visit us
            </p>
            <h2 id="visit-title" className="mt-4 text-[2rem] leading-[1.12] font-medium sm:text-[2.6rem] lg:text-[3rem]" data-words>
              <Words parts={["Come to", { accent: "the showroom" }]} />
            </h2>
            <address className="mt-7 flex gap-4 text-[1.02rem] leading-relaxed" data-reveal style={delay(2)}>
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-terracotta/10 text-terracotta">
                <MapPinIcon className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold">{contact.legalName}</span>
                <span className="block text-ink-soft">{contact.addressLine1}</span>
                <span className="block text-ink-soft">{contact.addressLine2}</span>
              </span>
            </address>
            <div className="mt-9 flex flex-wrap gap-3" data-reveal style={delay(3)}>
              <a
                href={mapsLink(contact)}
                target="_blank"
                rel="noopener"
                className="btn inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[0.85rem] font-medium text-ivory hover:bg-terracotta"
              >
                Get directions
                <ArrowUpRightIcon className="h-4 w-4" />
              </a>
              {tel && (
                <a href={tel} className="btn inline-flex h-12 items-center gap-2 rounded-full border border-ink/15 px-6 text-[0.85rem] font-medium hover:border-ink hover:bg-ink hover:text-ivory">
                  <PhoneIcon className="h-4 w-4" />
                  {contact.phoneDisplay ?? "Call"}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Closing photo band */}
      <section className="px-3 pb-12 sm:px-5 sm:pb-16 lg:px-6 lg:pb-20" aria-labelledby="band-title">
        <div className="relative isolate mx-auto max-w-[108rem] overflow-hidden rounded-[2rem] text-white lg:rounded-[2.5rem]">
          <RevealImage
            image={settings.about_band_image ?? null}
            alt=""
            sizes="100vw"
            className="absolute! inset-0 -z-10 h-full w-full"
            cover="var(--color-ivory)"
          />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(20,16,12,0.78)_0%,rgba(20,16,12,0.45)_50%,rgba(20,16,12,0.15)_100%)]" />
          <div className="shell flex min-h-[26rem] flex-col justify-center py-16 sm:min-h-[30rem] lg:min-h-[34rem]">
            <h2 id="band-title" className="on-photo max-w-xl text-balance text-[2rem] leading-[1.12] font-medium sm:text-[2.6rem] lg:text-[3rem]" data-words>
              <Words parts={["Ask about a fabric", { accent: "or a visit" }]} />
            </h2>
            <div className="mt-9 flex flex-wrap gap-3" data-reveal style={delay(3)}>
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener"
                  className="btn inline-flex h-12 items-center gap-2 rounded-full bg-terracotta px-6 text-[0.85rem] font-medium text-white hover:bg-terracotta-dark"
                >
                  <WhatsAppIcon className="h-4 w-4" />
                  Enquire
                </a>
              )}
              <a
                href="/contact"
                className="btn inline-flex h-12 items-center gap-2 rounded-full border border-white/40 px-6 text-[0.85rem] font-medium hover:border-white hover:bg-white hover:text-ink"
              >
                Contact page
                <ArrowRightIcon className="btn-arrow h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
