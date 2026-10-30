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

export function mapsLink(info: ContactInfo): string {
  const query = `${info.legalName}, ${info.addressLine1}, ${info.addressLine2}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
