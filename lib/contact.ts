// Contact links built from the business settings.

export type ContactInfo = {
  businessName: string;
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  phone: string | null;
  phoneDisplay: string | null;
  gstin: string | null;
  whatsappNumber: string | null;
  instagramHandle: string | null;
};

/** wa.me link that opens a chat with an optional pre-filled message. */
export function whatsappLink(info: ContactInfo, message?: string): string | null {
  if (!info.whatsappNumber) return null;
  const digits = info.whatsappNumber.replace(/\D/g, "");
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${text}`;
}

export function enquiryMessage(info: ContactInfo, about?: string): string {
  return about
    ? `Hello ${info.businessName}, I'd like to know more about ${about}.`
    : `Hello ${info.businessName}, I'd like to know more about your range.`;
}

export function phoneLink(info: ContactInfo): string | null {
  return info.phone ? `tel:${info.phone.replace(/[^\d+]/g, "")}` : null;
}

/** Instagram direct-message link (ig.me opens the chat in the app). */
export function instagramLink(info: ContactInfo): string | null {
  if (!info.instagramHandle) return null;
  const handle = info.instagramHandle.replace(/^@/, "");
  return `https://ig.me/m/${encodeURIComponent(handle)}`;
}

/** The showroom's own Google Business listing: directions, photos and Google reviews. */
export const GOOGLE_LISTING_URL = "https://maps.app.goo.gl/kvrzmJNvyC4ECi1L9";

/** Showroom position (from the Google listing), used for the embedded map. */
export const SHOWROOM_LAT = 28.647461;
export const SHOWROOM_LNG = 77.142804;

export const MAP_EMBED_URL = `https://www.google.com/maps?q=${SHOWROOM_LAT},${SHOWROOM_LNG}&z=17&output=embed`;

export function mapsLink(): string {
  return GOOGLE_LISTING_URL;
}
