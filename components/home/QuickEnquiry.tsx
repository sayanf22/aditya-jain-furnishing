// Section 06 · Quick enquiry: WhatsApp, call, Instagram (once a handle is
// added) and the showroom address with directions.
import { enquiryMessage, instagramLink, mapsLink, phoneLink, whatsappLink, type ContactInfo } from "@/lib/contact";
import { imageSource } from "@/lib/media";
import { InstagramIcon, MapPinIcon, PhoneIcon, WhatsAppIcon } from "../icons";

type Props = { contact: ContactInfo; imageKey: string | null };

export function QuickEnquiry({ contact, imageKey }: Props) {
  const whatsapp = whatsappLink(contact, enquiryMessage(contact));
  const tel = phoneLink(contact);
  const instagram = instagramLink(contact);
  const image = imageSource(imageKey);

  return (
    <section className="bg-sand" aria-labelledby="enquiry-title">
      <div className="mx-auto grid max-w-7xl items-stretch gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        {image && (
          <div className="relative hidden overflow-hidden rounded-2xl lg:block" data-reveal>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.src}
              srcSet={image.srcSet}
              sizes="40vw"
              width={image.width}
              height={image.height}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        )}
        <div className="flex flex-col justify-center lg:py-10" data-reveal style={{ ["--reveal-delay" as string]: 1 }}>
          <h2 id="enquiry-title" className="section-title">
            Visit or <span className="text-terracotta">message us</span>
          </h2>
          <p className="mt-5 max-w-md text-[1.02rem] leading-relaxed text-ink-soft">
            Send a message about any fabric, curtain or carpet you liked, or come to the showroom in Kirti Nagar.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener"
                className="btn flex h-14 items-center justify-center gap-2.5 rounded-full bg-whatsapp px-6 text-[0.9rem] font-medium text-white hover:brightness-95"
              >
                <WhatsAppIcon className="h-5 w-5" />
                WhatsApp us
              </a>
            )}
            {tel && (
              <a
                href={tel}
                className="btn flex h-14 items-center justify-center gap-2.5 rounded-full bg-ink px-6 text-[0.9rem] font-medium text-ivory hover:bg-terracotta"
              >
                <PhoneIcon className="h-5 w-5" />
                Call the showroom
              </a>
            )}
            {instagram && (
              <a
                href={instagram}
                target="_blank"
                rel="noopener"
                className="btn flex h-14 items-center justify-center gap-2.5 rounded-full border border-ink/20 px-6 text-[0.9rem] font-medium hover:bg-ink hover:text-ivory sm:col-span-2"
              >
                <InstagramIcon className="h-5 w-5" />
                Message on Instagram
              </a>
            )}
          </div>

          <div className="mt-10 flex gap-4 border-t border-ink/10 pt-8">
            <MapPinIcon className="mt-0.5 h-5 w-5 shrink-0 text-terracotta" />
            <div>
              <address className="text-[0.98rem] leading-relaxed">
                <span className="block font-semibold">{contact.legalName}</span>
                <span className="block text-ink-soft">{contact.addressLine1}</span>
                <span className="block text-ink-soft">{contact.addressLine2}</span>
              </address>
              <a href={mapsLink(contact)} target="_blank" rel="noopener" className="link-line mt-3 inline-block text-[0.85rem] font-semibold tracking-[0.08em] text-terracotta uppercase">
                Get directions
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
