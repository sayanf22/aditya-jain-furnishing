import { mapsLink, phoneLink, type ContactInfo } from "@/lib/contact";
import type { Category } from "@/lib/content";
import { NAV } from "@/lib/nav";
import { MapPinIcon, PhoneIcon } from "./icons";
import { SiteLink } from "./SiteLink";

type Props = { contact: ContactInfo; categories: Category[] };

export function SiteFooter({ contact, categories }: Props) {
  const tel = phoneLink(contact);
  const year = new Date().getFullYear();
  return (
    <footer className="bg-ink text-ivory">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr] lg:py-20">
        <div>
          <p className="text-xl font-semibold tracking-[0.24em] uppercase">{contact.businessName}</p>
          <p className="mt-4 max-w-xs text-[0.95rem] leading-relaxed text-ivory/80">
            Upholstery fabric, curtains &amp; blinds, carpets &amp; mats, cushions and wallpaper.
          </p>
        </div>

        <div>
          <p className="text-[0.75rem] font-semibold tracking-[0.18em] text-ivory/70 uppercase">Explore</p>
          <ul className="mt-5 space-y-3 text-[0.95rem]">
            {NAV.map((item) => (
              <li key={item.href}>
                <SiteLink href={item.href} className="link-line">
                  {item.label}
                </SiteLink>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[0.75rem] font-semibold tracking-[0.18em] text-ivory/70 uppercase">Categories</p>
          <ul className="mt-5 space-y-3 text-[0.95rem]">
            {categories.map((c) => (
              <li key={c.id}>
                <SiteLink href={`/collection/${c.slug}`} className="link-line">
                  {c.name}
                </SiteLink>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[0.75rem] font-semibold tracking-[0.18em] text-ivory/70 uppercase">Showroom</p>
          <address className="mt-5 text-[0.95rem] leading-relaxed">
            <span className="block font-medium">{contact.legalName}</span>
            <span className="block text-ivory/85">{contact.addressLine1}</span>
            <span className="block text-ivory/85">{contact.addressLine2}</span>
          </address>
          <div className="mt-5 space-y-3 text-[0.95rem]">
            {tel && contact.phoneDisplay && (
              <a href={tel} className="flex items-center gap-3">
                <PhoneIcon className="h-4 w-4 text-ivory/70" />
                <span className="link-line">{contact.phoneDisplay}</span>
              </a>
            )}
            <a href={mapsLink(contact)} target="_blank" rel="noopener" className="flex items-center gap-3">
              <MapPinIcon className="h-4 w-4 text-ivory/70" />
              <span className="link-line">Get directions</span>
            </a>
          </div>
          {contact.gstin && <p className="mt-5 text-[0.8rem] tracking-[0.06em] text-ivory/70">GSTIN {contact.gstin}</p>}
        </div>
      </div>

      <div className="border-t border-ivory/10">
        {/* Extra bottom space on phones so the fixed WhatsApp button doesn't cover the credit. */}
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-5 pt-6 pb-24 text-center text-[0.8rem] text-ivory/70 sm:flex-row sm:justify-between sm:px-8 sm:pb-6 sm:text-left">
          <p>
            © {year} {contact.legalName}
          </p>
          <p>
            Built by <span className="font-semibold text-ivory">WhyCreatives</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
