// Footer: fully dark, edge to edge, with its two top corners rounded (the
// bottom stays square against the screen edge). Its content lines up with
// the header and the page sections.
// Brand and the showroom's contact actions on top, links below, then the
// legal row with the "Made by whycreatives.in" credit.
import { enquiryMessage, mapsLink, phoneLink, whatsappLink, type ContactInfo } from "@/lib/contact";
import type { Category } from "@/lib/content";
import { NAV } from "@/lib/nav";
import { ArrowUpRightIcon, MapPinIcon, PhoneIcon, WhatsAppIcon } from "./icons";

type Props = { contact: ContactInfo; categories: Category[] };

export function SiteFooter({ contact, categories }: Props) {
  const tel = phoneLink(contact);
  const whatsapp = whatsappLink(contact, enquiryMessage(contact));
  const year = new Date().getFullYear();
  const [first, ...rest] = contact.businessName.split(" ");

  return (
    <footer className="overflow-hidden rounded-t-[2rem] bg-night text-ivory sm:rounded-t-[2.5rem] lg:rounded-t-[3rem]">
      <div className="shell pt-16 sm:pt-20 lg:pt-24">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <div>
            <p className="leading-none">
              <span className="block text-[2rem] font-semibold tracking-[0.24em] uppercase sm:text-[2.5rem]">{first}</span>
              <span className="mt-2 block text-[0.8rem] font-medium tracking-[0.5em] text-ivory/80 uppercase">{rest.join(" ")}</span>
            </p>
            <p className="mt-6 max-w-sm text-[0.98rem] leading-relaxed text-ivory/80">
              Home furnishing showroom in Kirti Nagar, New Delhi.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 lg:justify-end">
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener" className="btn inline-flex h-12 items-center gap-2 rounded-full bg-terracotta px-5 text-[0.85rem] font-medium text-white hover:bg-terracotta-dark">
                <WhatsAppIcon className="h-[1.1rem] w-[1.1rem]" />
                WhatsApp
              </a>
            )}
            {tel && (
              <a href={tel} className="btn inline-flex h-12 items-center gap-2 rounded-full border border-ivory/25 px-5 text-[0.85rem] font-medium hover:border-ivory hover:bg-ivory hover:text-night">
                <PhoneIcon className="h-[1.1rem] w-[1.1rem]" />
                Call
              </a>
            )}
            <a href={mapsLink(contact)} target="_blank" rel="noopener" className="btn inline-flex h-12 items-center gap-2 rounded-full border border-ivory/25 px-5 text-[0.85rem] font-medium hover:border-ivory hover:bg-ivory hover:text-night">
              <MapPinIcon className="h-[1.1rem] w-[1.1rem]" />
              Directions
            </a>
          </div>
        </div>

        <div className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 border-t border-ivory/12 pt-12 lg:grid-cols-[1fr_1fr_1.3fr] lg:gap-16">
          <FooterColumn title="Explore">
            {NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="link-line">
                  {item.label}
                </a>
              </li>
            ))}
          </FooterColumn>

          <FooterColumn title="Categories">
            {categories.map((c) => (
              <li key={c.id}>
                <a href={`/collection/${c.slug}`} className="link-line">
                  {c.name}
                </a>
              </li>
            ))}
          </FooterColumn>

          <div className="col-span-2 lg:col-span-1">
            <p className="text-[0.72rem] font-semibold tracking-[0.22em] text-terracotta-light uppercase">Showroom</p>
            <address className="mt-5 text-[0.98rem] leading-relaxed">
              <span className="block font-medium text-ivory">{contact.legalName}</span>
              <span className="block text-ivory/80">{contact.addressLine1}</span>
              <span className="block text-ivory/80">{contact.addressLine2}</span>
            </address>
            {tel && contact.phoneDisplay && (
              <a href={tel} className="mt-4 inline-block text-[1.05rem] font-medium">
                <span className="link-line">{contact.phoneDisplay}</span>
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="shell mt-14 lg:mt-16">
        {/* Room on the right (sm and up) / below (phones) for the floating
            WhatsApp button, so it never covers the credit. */}
        <div className="flex flex-col items-center gap-3 border-t border-ivory/12 pt-6 pb-24 text-center text-[0.82rem] text-ivory/75 sm:flex-row sm:justify-between sm:pr-20 sm:pb-8 sm:text-left">
          <p>
            © {year} {contact.legalName}
            {contact.gstin && <span className="block sm:ml-3 sm:inline">GSTIN {contact.gstin}</span>}
          </p>
          <p>
            Made by{" "}
            <a href="https://whycreatives.in" target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-ivory">
              <span className="link-line">whycreatives.in</span>
              <ArrowUpRightIcon className="h-3.5 w-3.5" />
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[0.72rem] font-semibold tracking-[0.22em] text-terracotta-light uppercase">{title}</p>
      <ul className="mt-5 space-y-3 text-[0.98rem] text-ivory/90">{children}</ul>
    </div>
  );
}
