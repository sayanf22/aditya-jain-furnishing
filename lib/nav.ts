// Main navigation. The revised agreement (§02) listed Home, Collection,
// Gallery and Contact; on 13 Nov 2026 Gallery was replaced by About Us
// (Gallery and Collection showed the same thing).
export const NAV = [
  { href: "/", label: "Home" },
  { href: "/collection", label: "Collection" },
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact" },
] as const;

/** Pages that open with a full-width photo, so the header sits on it. */
export const PHOTO_HEADER_PAGES = ["/", "/about", "/contact"];
