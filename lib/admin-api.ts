// Shared contract between the dashboard API (worker/), the dashboard screens
// (app/admin, components/admin) and the site build (scripts/sync-content.mjs).
// Types only, plus the list of photo places. Owner: Backend; changes are
// additive, and each one is noted in the change log below.
//
// Conventions
//   - Every route below is under /api/admin and needs the session cookie.
//     Every route that changes something (POST, PATCH, PUT, DELETE) also needs
//     the X-CSRF-Token header (see docs/admin-architecture.md).
//   - Bodies are JSON unless noted. Success: the JSON shown. Failure:
//     ApiError with the right HTTP status (400 invalid, 401 not signed in,
//     403 CSRF or forbidden, 404, 409 conflict, 413 too large, 429 slow down).
//   - Ids are numbers. Timestamps are ISO strings (UTC).
//   - Lists take ?limit= (default 50, max 200) and ?cursor= (opaque string
//     from the previous page's nextCursor) and return Page<T>.
//
// Change log
//   2026-11-20  first version (lead)
//   2026-11-22  site photo places reduced to the four replaceable ones, each with a
//               defaultKey; hero places listed in NON_REPLACEABLE_SLOTS; new helpers
//               isReplaceableSlot, isHeroSlot, defaultFor, categoryCardDefaultFor,
//               isProtectedDefault; CATEGORY_CARD_DEFAULTS.
//   2026-11-23  media lifecycle and email-code sign-in (additive): POST /media/sweep;
//               hero places answer 400 NOT_REPLACEABLE; categories.heroImageKey can no
//               longer be changed (400 NOT_REPLACEABLE); AuthStatus.emailCodes;
//               POST /auth/code/request, /auth/code/verify, /auth/password/reset;
//               MeResponse.mustSetPassword.
//   2026-11-21  additive (backend): ApiError.error.usedBy (on MEDIA_IN_USE);
//               MediaAsset.usedBy type may also be "room" (room fabric textures);
//               PublishStatus.configured (false while DEPLOY_HOOK_URL is empty;
//               POST /publish then answers 503 PUBLISH_NOT_CONFIGURED).
//               Behaviour notes: an upload needs two sizes unless the original is
//               under 800 px wide; requests with no body (DELETE, bare POST) need
//               the X-CSRF-Token but not a Content-Type.

// ---------------------------------------------------------------- shared

export type ApiError = { error: { code: string; message: string; field?: string; usedBy?: MediaAsset["usedBy"] } };
export type Page<T> = { items: T[]; nextCursor: string | null };
export type Ok = { ok: true };
export type SweepResult = { photos: number; files: number };

// ------------------------------------------------------------------ auth
//   GET    /api/admin/auth/status            (public)   -> AuthStatus
//   POST   /api/admin/auth/setup             (public)   SetupBody  -> MeResponse (signed in)
//   POST   /api/admin/auth/login             (public)   LoginBody  -> LoginResponse
//   POST   /api/admin/auth/code/request     (public)   CodeRequestBody -> Ok (the same answer for every email; 503 EMAIL_NOT_CONFIGURED when emailCodes is false)
//   POST   /api/admin/auth/code/verify      (public)   CodeVerifyBody -> CodeVerifyResponse (needsCode = the authenticator code is also required; resend the same email code with totp)
//            on success the session is a password-reset session (mustSetPassword true, 15 minutes): only /me, /auth/logout and /auth/password/reset work
//   POST   /api/admin/auth/password/reset              PasswordResetBody -> MeResponse (new session; other sessions end)
//   POST   /api/admin/auth/logout                       -> Ok
//   GET    /api/admin/me                                -> MeResponse
//   POST   /api/admin/auth/password                     PasswordBody -> MeResponse (new session cookie and CSRF token; other sessions end)
//   POST   /api/admin/auth/2fa/start                    -> TwoFactorStart
//   POST   /api/admin/auth/2fa/enable                   { code } -> MeResponse (new session; other sessions end)
//   POST   /api/admin/auth/2fa/disable                  { password, code } -> MeResponse (new session; other sessions end)
//   GET    /api/admin/sessions                          -> { items: SessionInfo[] }
//   DELETE /api/admin/sessions/:id                      -> Ok   (id "others" = every other device)

export type AuthStatus = { setupRequired: boolean; emailCodes: boolean };
export type SetupBody = { setupCode: string; email: string; name?: string; password: string };
export type LoginBody = { email: string; password: string; code?: string };
export type LoginResponse = { ok: true } | { needsCode: true };
export type AdminUser = { id: number; email: string; name: string | null; totpEnabled: boolean };
export type MeResponse = { user: AdminUser; csrf: string; idleExpiresAt: string; expiresAt: string; mustSetPassword?: boolean };
export type CodeRequestBody = { email: string };
export type CodeVerifyBody = { email: string; code: string; totp?: string };
export type CodeVerifyResponse = MeResponse | { needsCode: true };
export type PasswordResetBody = { next: string };
export type PasswordBody = { current: string; next: string };
export type TwoFactorStart = { secret: string; otpauthUri: string };
export type SessionInfo = { id: string; current: boolean; createdAt: string; lastSeenAt: string; device: string };

// ------------------------------------------------------------- collections
//   GET    /api/admin/catalogue                          -> { categories: AdminCategory[]; totalProducts: number }
//   POST   /api/admin/categories                         NewCategory -> AdminCategory
//   PATCH  /api/admin/categories/:id                     CategoryPatch -> AdminCategory
//   DELETE /api/admin/categories/:id?confirm=<name>      -> Ok   (name must match; removes its types and designs)
//   POST   /api/admin/categories/reorder                 { ids: number[] } -> Ok
//   POST   /api/admin/subcategories                      NewSubcategory -> AdminSubcategory
//   PATCH  /api/admin/subcategories/:id                  SubcategoryPatch -> AdminSubcategory
//   DELETE /api/admin/subcategories/:id?confirm=<name>   -> Ok
//   POST   /api/admin/subcategories/reorder              { categoryId, parentId: number | null, ids: number[] } -> Ok
// Slugs come from the name unless given; they only have to be unique among
// siblings. Changing a slug changes the page address (the dashboard warns).
// A collection that has types inside shows them as cards and holds no designs
// itself; the API refuses (409) to add a design to such a collection and
// refuses to add a type to a collection that already holds designs directly.

export type AdminSubcategory = {
  id: number;
  categoryId: number;
  parentId: number | null;
  slug: string;
  name: string;
  description: string | null;
  imageKey: string | null;
  visible: boolean;
  position: number;
  productCount: number; // designs in it and below
  children: AdminSubcategory[];
};
export type AdminCategory = {
  id: number;
  slug: string;
  name: string;
  description: string | null; // categories.tagline
  imageKey: string | null; // Home card photo (tall)
  heroImageKey: string | null; // page header photo (wide)
  visible: boolean;
  position: number;
  productCount: number;
  children: AdminSubcategory[];
};
export type NewCategory = { name: string; description?: string; slug?: string };
export type CategoryPatch = Partial<{ name: string; description: string | null; slug: string; visible: boolean; imageKey: string | null; heroImageKey: string | null }>;
export type NewSubcategory = { categoryId: number; parentId?: number | null; name: string; description?: string; slug?: string };
export type SubcategoryPatch = Partial<{ name: string; description: string | null; slug: string; visible: boolean; imageKey: string | null }>;

// ---------------------------------------------------------------- designs
//   GET    /api/admin/products?categoryId=&subcategoryId=&q=&sample=1&limit=&cursor=  -> Page<AdminProduct>
//   GET    /api/admin/products/:id                      -> AdminProduct
//   POST   /api/admin/products                          NewProduct -> AdminProduct
//   PATCH  /api/admin/products/:id                      ProductPatch -> AdminProduct
//   DELETE /api/admin/products/:id                      -> Ok
//   POST   /api/admin/products/reorder                  { categoryId, subcategoryId: number | null, ids: number[] } -> Ok
//   PUT    /api/admin/products/:id/images               { images: { mediaKey: string; alt?: string }[] } -> AdminProduct
//                                                       (the whole list, in order; replaces what was there)
//   DELETE /api/admin/products/sample                   -> { removed: number }   (designs whose photo key starts with demo/)

export type AdminProductImage = { id: number; mediaKey: string; width: number; height: number; alt: string | null; position: number };
export type AdminProduct = {
  id: number;
  categoryId: number;
  subcategoryId: number | null;
  slug: string;
  name: string;
  description: string | null;
  visible: boolean;
  position: number;
  images: AdminProductImage[];
  isSample: boolean; // first photo key starts with "demo/"
  updatedAt: string;
};
export type NewProduct = { categoryId: number; subcategoryId?: number | null; name: string; description?: string; visible?: boolean };
export type ProductPatch = Partial<{ name: string; description: string | null; visible: boolean; categoryId: number; subcategoryId: number | null }>;

// ----------------------------------------------------------------- photos
//   GET    /api/admin/media?q=&limit=&cursor=           -> Page<MediaAsset>
//   POST   /api/admin/media                             multipart/form-data -> MediaAsset
//            fields: meta (JSON {label?: string; alt?: string; width: number; height: number}),
//                    w<width> for each width in MEDIA_WIDTHS that applies (w480, w800, w1200,
//                    and for wide places w1600, w2048) = image/webp files; at least two, unique
//   PATCH  /api/admin/media/:id                         { label?: string; alt?: string | null } -> MediaAsset
//   DELETE /api/admin/media/:id                         -> Ok  (409 MEDIA_IN_USE with usedBy list while any design, collection or site place uses it; removes the D1 row and every R2 size file)
//   POST   /api/admin/media/sweep?minutes=60           -> SweepResult  (deletes photos nothing uses and stray R2 files, both older than `minutes`, default 60)
// Public URL of one size: /m/<hash>-<width>.webp where key = "m/<hash>".

export const MEDIA_WIDTHS = [480, 640, 800, 1080, 1200, 1600, 2048] as const;
export type MediaAsset = {
  id: number;
  key: string; // "m/<16 hex>"
  widths: number[];
  width: number;
  height: number;
  bytes: number;
  label: string | null;
  alt: string | null;
  createdAt: string;
  usedBy: { type: "product" | "category" | "subcategory" | "site" | "room"; id: number | string; name: string }[];
};

// ------------------------------------------------------------------- site
//   GET   /api/admin/site/images                        -> { slots: SiteImage[] }
//   PUT   /api/admin/site/images/:slot                  { mediaKey: string | null; alt?: string | null } -> SiteImage
//            null = back to the default photo; the owner's upload is deleted from D1 and R2 unless another place still uses it.
//            Hero places and unknown places: 400 NOT_REPLACEABLE / 404.
//   GET   /api/admin/site/settings                      -> SiteSettings
//   PATCH /api/admin/site/settings                      Partial<SiteSettings> -> SiteSettings
//   GET   /api/admin/testimonials                       -> { items: Testimonial[] }
//   POST  /api/admin/testimonials                       { name, text } -> Testimonial
//   PATCH /api/admin/testimonials/:id                   Partial<{ name; text; visible }> -> Testimonial
//   DELETE /api/admin/testimonials/:id                  -> Ok
//   POST  /api/admin/testimonials/reorder               { ids: number[] } -> Ok

export type SiteImageSlot = {
  slot: string;
  group: "Home" | "Collection" | "About" | "Contact";
  label: string;
  shape: "wide" | "tall" | "square";
  /** Widths the dashboard should produce for this place. */
  widths: number[];
  hint: string;
  /** Default photo key shown while nothing is uploaded: a static file in public/demo/. */
  defaultKey: string;
};

/**
 * Places the owner can replace with an upload. Each has a default photo
 * (static file in public/demo/, protected) that returns when the upload is removed.
 */
export const SITE_IMAGE_SLOTS: SiteImageSlot[] = [
  { slot: "about.story", group: "About", label: "About: who we are", shape: "tall", widths: [480, 800, 1200], hint: "Upright photo", defaultKey: "demo/about-story" },
  { slot: "about.showroom", group: "About", label: "About: visit us", shape: "wide", widths: [640, 1080, 1600], hint: "Showroom photo", defaultKey: "demo/about-showroom" },
  { slot: "about.band", group: "About", label: "About: closing band", shape: "wide", widths: [800, 1200, 1600, 2048], hint: "Wide photo", defaultKey: "demo/about-band" },
  { slot: "contact.showroom", group: "Contact", label: "Contact: showroom card", shape: "wide", widths: [640, 1080, 1600], hint: "Showroom photo", defaultKey: "demo/about-showroom" },
];

/**
 * Hero places: fixed, never replaceable. The API refuses them and the
 * dashboard does not list them. Also never replaceable: each collection's
 * header photo (categories.hero_image_key).
 */
export const NON_REPLACEABLE_SLOTS: readonly string[] = [
  "home.hero.1",
  "home.hero.2",
  "home.hero.3",
  "collection.hero",
  "about.hero",
  "contact.hero",
];

/**
 * Home category card photos (categories.image_key). Replaceable; when the
 * column is empty the card shows the default for its slug. Slugs that are
 * not listed (new collections) have no default and show a neutral tile.
 */
export const CATEGORY_CARD_DEFAULTS: Readonly<Record<string, string>> = {
  "upholstery-fabric": "demo/cat-upholstery",
  "curtains-blinds": "demo/cat-curtains",
  "carpets-mats": "demo/cat-carpets",
  cushions: "demo/cat-cushions",
  wallpaper: "demo/cat-wallpaper",
};

const SLOT_BY_NAME = new Map(SITE_IMAGE_SLOTS.map((s) => [s.slot, s]));

/** True for the site places in SITE_IMAGE_SLOTS. Heroes and unknown names are false. */
export function isReplaceableSlot(slot: string): boolean {
  return SLOT_BY_NAME.has(slot);
}

/** True for hero places (home.hero.*, collection.hero, about.hero, contact.hero). */
export function isHeroSlot(slot: string): boolean {
  return /^home\.hero\.\d+$/.test(slot) || NON_REPLACEABLE_SLOTS.includes(slot);
}

/** Default photo key of a replaceable site place, or null if it has none. */
export function defaultFor(slot: string): string | null {
  return SLOT_BY_NAME.get(slot)?.defaultKey ?? null;
}

/** Default Home card photo key for a collection slug, or null (neutral tile). */
export function categoryCardDefaultFor(slug: string): string | null {
  return Object.prototype.hasOwnProperty.call(CATEGORY_CARD_DEFAULTS, slug) ? CATEGORY_CARD_DEFAULTS[slug] : null;
}

/**
 * True for a key that points at a static default file (demo/<name>). Such
 * a key is never stored in R2 and its media row can never be deleted.
 */
export function isProtectedDefault(key: string | null | undefined): boolean {
  return typeof key === "string" && key.startsWith("demo/");
}
export type SiteImage = SiteImageSlot & { mediaKey: string | null; alt: string | null; media: MediaAsset | null };
export type SiteSettings = {
  businessName: string;
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  phone: string; // digits with country code, used for calls and messages
  phoneDisplay: string;
  gstin: string;
  instagramHandle: string;
};
export type Testimonial = { id: number; name: string; text: string; position: number; visible: boolean };

// -------------------------------------------------------------- enquiries
//   GET    /api/admin/enquiries?filter=all|unread&limit=&cursor=  -> Page<Enquiry> & { unread: number }
//   PATCH  /api/admin/enquiries/:id                     { isRead: boolean } -> Enquiry
//   DELETE /api/admin/enquiries/:id                     -> Ok

export type Enquiry = {
  id: number;
  createdAt: string;
  customerType: "B2C" | "B2B";
  name: string;
  company: string | null;
  phone: string;
  message: string | null;
  productName: string | null;
  categoryName: string | null;
  source: string | null;
  isRead: boolean;
};

// ---------------------------------------------------------------- publish
//   GET   /api/admin/publish                            -> PublishStatus
//   POST  /api/admin/publish                            -> PublishStatus  (calls the deploy hook; at most once a minute)
// state: "current"  the live site shows everything
//        "changes"  edits are waiting
//        "building" a publish was requested in the last 15 minutes and the
//                   live site has not caught up yet

export type PublishStatus = {
  state: "current" | "changes" | "building";
  version: number; // content version in the database
  liveVersion: number; // content version the running site was built from
  changesWaiting: number; // version - liveVersion
  requestedAt: string | null;
  configured: boolean; // false until DEPLOY_HOOK_URL is set (local runs)
};

// ------------------------------------------------------------------ audit
//   GET /api/admin/audit?limit=&cursor=                 -> Page<AuditEntry>

export type AuditEntry = { id: number; at: string; userEmail: string | null; action: string; entity: string | null; entityId: string | null; detail: string | null };

// ----------------------------------------------------- site build export
//   GET /api/content/export     Authorization: Bearer EXPORT_TOKEN     -> ContentExport
// Only visible content. Used by scripts/sync-content.mjs, nothing else.

export type ContentExport = {
  version: number; // content_state.version when exported
  exportedAt: string;
  categories: {
    id: number; slug: string; name: string; tagline: string | null;
    image_key: string | null; hero_image_key: string | null; position: number;
  }[];
  subcategories: {
    id: number; category_id: number; parent_id: number | null; slug: string; name: string;
    description: string | null; image_key: string | null; position: number;
  }[];
  products: {
    id: number; category_id: number; subcategory_id: number | null; slug: string; name: string;
    description: string | null; position: number;
  }[];
  product_images: { id: number; product_id: number; image_key: string; width: number; height: number; alt: string | null; position: number }[];
  media: { key: string; widths: string; width: number; height: number; alt: string | null }[];
  site_images: { slot: string; media_key: string | null; alt: string | null }[];
  settings: { key: string; value: string }[];
  testimonials: { id: number; name: string; text: string; position: number }[];
};
