// Section 06 · Quick enquiry: the enquiry form (B2C / B2B), plus WhatsApp,
// call, Instagram (once a handle is added) and the showroom address.
// Sits in a rounded sand panel.
import { enquiryMessage, instagramLink, mapsLink, phoneLink, whatsappLink, type ContactInfo } from "@/lib/contact";
import type { Category } from "@/lib/content";
import { EnquiryForm } from "../EnquiryForm";
import { ArrowUpRightIcon, InstagramIcon, MapPinIcon, PhoneIcon, WhatsAppIcon } from "../icons";
import { Words } from "../Words";

type Props = { contact: ContactInfo; categories: Category[] };

export function QuickEnquiry({ contact, categories }: Props) {
  const whatsapp = whatsappLink(contact, enquiryMessage(contact));
  const tel = phoneLink(contact);
  const instagram = instagramLink(contact);

  return (
    <section className="px-3 pb-12 sm:px-5 sm:pb-16 lg:px-6 lg:pb-20" aria-labelledby="enquiry-title" id="enquire">
      <div className="mx-auto max-w-[108rem] rounded-[2rem] bg-sand lg:rounded-[2.5rem]">
        <div className="shell grid items-start gap-12 py-16 sm:py-20 lg:grid-cols-[1fr_1.15fr] lg:gap-20 lg:py-28 xl:gap-28">
          <div>
            <p className="section-label" data-reveal>
              Enquiry
            </p>
            <h2 id="enquiry-title" className="section-title mt-3" data-words>
              <Words parts={["Visit or", { accent: "message us" }]} />
            </h2>
            <p className="mt-5 max-w-md text-[1.02rem] leading-relaxed text-balance text-ink-soft" data-reveal style={{ ["--reveal-delay" as string]: 2 }}>
              For your home or a client&apos;s project. Message, call or visit us in Kirti Nagar.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row" data-reveal style={{ ["--reveal-delay" as string]: 3 }}>
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener"
                  className="btn flex h-14 items-center sm:flex-1 lg:flex-none xl:flex-1 justify-center gap-2.5 rounded-full bg-terracotta px-6 text-[0.9rem] font-medium text-white hover:bg-terracotta-dark"
                >
                  <WhatsAppIcon className="h-5 w-5" />
                  Message us
                </a>
              )}
              {tel && (
                <a href={tel} className="btn flex h-14 items-center sm:flex-1 lg:flex-none xl:flex-1 justify-center gap-2.5 rounded-full border border-ink/20 px-6 text-[0.9rem] font-medium hover:border-ink hover:bg-ink hover:text-ivory">
                  <PhoneIcon className="h-5 w-5" />
                  Call the showroom
                </a>
              )}
              {instagram && (
                <a
                  href={instagram}
                  target="_blank"
                  rel="noopener"
                  className="btn flex h-14 items-center sm:flex-1 lg:flex-none xl:flex-1 justify-center gap-2.5 rounded-full border border-ink/20 px-6 text-[0.9rem] font-medium hover:border-ink hover:bg-ink hover:text-ivory"
                >
                  <InstagramIcon className="h-5 w-5" />
                  Instagram
                </a>
              )}
            </div>

            <div className="mt-10 flex gap-4 rounded-2xl bg-ivory/70 p-5" data-reveal style={{ ["--reveal-delay" as string]: 4 }}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-terracotta/10 text-terracotta">
                <MapPinIcon className="h-5 w-5" />
              </span>
              <div>
                <address className="text-[0.95rem] leading-relaxed">
                  <span className="block font-semibold">{contact.legalName}</span>
                  <span className="block text-ink-soft">{contact.addressLine1}</span>
                  <span className="block text-ink-soft">{contact.addressLine2}</span>
                </address>
                <a href={mapsLink(contact)} target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold tracking-[0.1em] text-terracotta uppercase">
                  <span className="link-line">Get directions</span>
                  <ArrowUpRightIcon className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>

          <div data-reveal style={{ ["--reveal-delay" as string]: 2 }}>
            <EnquiryForm categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} source="home" whatsappHref={whatsapp} />
          </div>
        </div>
      </div>
    </section>
  );
}
