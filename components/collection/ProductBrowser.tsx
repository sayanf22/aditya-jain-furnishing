"use client";

// The design grid on the Collection pages: filter chips (when given
// groups), a search box once there is more than one page of designs, 12
// designs a page, and a viewer that opens a product large (agreement: "photos open with a
// zoom"). Tapping a card grows its photo into the viewer while the page
// dims; in the viewer, tapping the photo zooms in on the spot tapped, and
// the arrows move through the products currently shown.
//
// Photos are never cropped (the client's real photos can be any shape):
// a photo that isn't 4:5 sits whole in its frame over a blurred copy of
// itself. Image URLs are worked out on the server and passed in, so the
// image size list doesn't ship to the browser.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, SearchIcon, WhatsAppIcon } from "../icons";

export type BrowserImage = { src: string; srcSet: string; width: number; height: number; alt: string };
export type BrowserProduct = {
  id: number;
  name: string;
  description: string | null;
  /** e.g. "Curtains · Sheer · Organza" */
  trail: string;
  /** The collection it sits in, and its name. */
  href: string;
  collection: string;
  group: number | null;
  image: BrowserImage | null;
};
type Props = {
  products: BrowserProduct[];
  groups: { id: number; name: string }[];
  /** Shown as "All {allLabel}". */
  allLabel: string;
  whatsappBase: string | null;
  /** Show the collection name on each card (main Collection page). */
  showCollection?: boolean;
  headingId: string;
};

const FRAME = 4 / 5;
/** Cards shown at first, and added by each "Show more". */
const PAGE = 12;
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function ProductBrowser({ products, groups, allLabel, whatsappBase, showCollection = false, headingId }: Props) {
  const [group, setGroup] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<number | null>(null);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  // Closing plays a short fade-out first; stepping slides the next photo
  // in from the side it comes from (-1, 1; 0 when opened from a card).
  const [closing, setClosing] = useState(false);
  const [dir, setDir] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const viewerImg = useRef<HTMLDivElement>(null);
  const fromRect = useRef<DOMRect | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) => (group === null || p.group === group) && (!q || `${p.name} ${p.trail} ${p.collection}`.toLowerCase().includes(q)),
    );
  }, [products, group, query]);

  const hasGrid = shown.length > 0;
  const grid = useRef<HTMLUListElement>(null);
  // Columns in the grid right now (2 to 5), so a page always ends on a full row.
  const [cols, setCols] = useState(4);
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const read = () => setCols(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(" ").length));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasGrid]);
  // Round the page up to a full row, unless that is everything anyway.
  const visible = Math.min(shown.length, Math.ceil(limit / cols) * cols);
  const showSearch = products.length > PAGE;
  const showChips = groups.length > 1;

  const index = shown.findIndex((p) => p.id === openId);
  const open = index >= 0 ? shown[index] : null;

  // Open and close the native dialog (focus trap, Esc and the backdrop
  // come with it).
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // The photo grows from the card that was tapped.
  useEffect(() => {
    const from = fromRect.current;
    const target = viewerImg.current;
    if (!open || !from || !target || reduced()) return;
    fromRect.current = null;
    const to = target.getBoundingClientRect();
    if (!to.width) return;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const s = Math.min(from.width / to.width, from.height / to.height);
    target.animate(
      [{ transform: `translate3d(${dx}px, ${dy}px, 0) scale(${s})`, borderRadius: "1.5rem" }, { transform: "none", borderRadius: "1.25rem" }],
      { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, [open]);

  const show = (id: number, from?: HTMLElement | null) => {
    fromRect.current = from?.getBoundingClientRect() ?? null;
    setZoom(null);
    setDir(0);
    setOpenId(id);
  };
  const step = (by: number) => {
    if (shown.length < 2 || index < 0) return;
    setZoom(null);
    setDir(by);
    setOpenId(shown[(index + by + shown.length) % shown.length].id);
  };
  const close = () => {
    if (closing || openId === null) return;
    if (reduced()) return setOpenId(null);
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      setOpenId(null);
    }, 260);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const enquire = (p: BrowserProduct) =>
    whatsappBase
      ? `${whatsappBase}?text=${encodeURIComponent(`Hello, I'd like to know more about "${p.name}" (${p.trail || p.collection}) from your website.`)}`
      : null;

  return (
    <div>
      {(showChips || showSearch) && (
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          {showChips ? (
            <div
              role="group"
              aria-label="Filter"
              className="chip-row no-scrollbar -mx-5 flex gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-5 pb-1 sm:-mx-8 sm:px-8 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
            >
              {[{ id: null as number | null, name: `All ${allLabel}` }, ...groups].map((g) => {
                const on = group === g.id;
                return (
                  <button
                    key={g.id ?? "all"}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setGroup(g.id);
                      setLimit(PAGE);
                    }}
                    className={`shrink-0 rounded-full border px-4 py-2 text-[0.82rem] font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-300 ${
                      on ? "border-ink bg-ink text-ivory" : "border-ink/15 text-ink-soft hover:border-ink hover:text-ink"
                    }`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <span />
          )}
          {showSearch && (
            <label className="relative block w-full shrink-0 lg:w-72">
              <span className="sr-only">Search products</span>
              <SearchIcon className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE);
                }}
                placeholder="Search by name or type"
                className="field h-11 rounded-full! pl-11!"
              />
            </label>
          )}
        </div>
      )}

      <p className="sr-only" aria-live="polite" id={`${headingId}-count`}>
        {shown.length === 1 ? "1 design" : `${shown.length} designs`}
        {query.trim() && ` for “${query.trim()}”`}
      </p>

      {shown.length > 0 ? (
        <ul ref={grid} className="grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-12">
          {shown.slice(0, visible).map((p, i) => (
            <li key={p.id} className="product-in" style={{ ["--i" as string]: Math.min(i % PAGE, 11) } as CSSProperties}>
              <button type="button" onClick={(e) => show(p.id, e.currentTarget.querySelector<HTMLElement>(".product-frame"))} className="product-card group block w-full text-left">
                <ProductFrame image={p.image} sizes="(min-width: 1024px) 23vw, (min-width: 768px) 31vw, 48vw" className="product-frame rounded-[1.1rem] sm:rounded-[1.35rem]" hover />
                <span className="mt-3.5 block px-0.5">
                  <span className="block text-[0.95rem] leading-snug font-medium transition-colors duration-300 group-hover:text-terracotta sm:text-[1.02rem]">{p.name}</span>
                  {(showCollection || p.trail) && (
                    <span className="mt-1 block truncate text-[0.8rem] text-muted">{showCollection ? p.collection : p.trail}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {shown.length > visible && (
        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={() => setLimit(visible + PAGE)}
            className="btn inline-flex h-12 items-center gap-2 rounded-full border border-ink/15 bg-ivory px-6 text-[0.85rem] font-medium hover:border-ink hover:bg-ink hover:text-ivory"
          >
            Show more ({shown.length - visible} left)
          </button>
        </div>
      )}
      {shown.length === 0 && (
        <div className="mt-6 rounded-[1.5rem] bg-sand/60 px-6 py-12 text-center">
          <p className="text-[1.05rem] font-medium">Nothing found</p>
          <p className="mt-2 text-[0.92rem] text-muted">Try another word, or ask the showroom.</p>
          {query && (
            <button type="button" onClick={() => setQuery("")} className="btn mt-5 inline-flex h-10 items-center rounded-full border border-ink/15 px-5 text-[0.82rem] font-medium hover:border-ink">
              Clear the search
            </button>
          )}
        </div>
      )}

      <dialog
        ref={dialog}
        aria-label={open?.name ?? "Product"}
        data-closing={closing || undefined}
        onClose={() => setOpenId(null)}
        onCancel={(e) => {
          // Esc: play the closing animation instead of vanishing at once.
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="product-viewer m-auto h-[100dvh] max-h-[100dvh] w-full sm:h-auto max-w-none bg-transparent p-0 text-ink backdrop:bg-[rgb(12_12_12/0.74)] sm:max-h-[94dvh] sm:w-[min(68rem,94vw)]"
      >
        {open && (
          <div className="viewer-in grid h-full max-h-[100dvh] content-start overflow-y-auto sm:h-auto bg-ivory sm:max-h-[94dvh] sm:rounded-[1.75rem] md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className="relative bg-sand/70 p-3 sm:p-4">
              {/* On a phone the details sit below the photo: keep Close in reach. */}
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="btn absolute top-5 right-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-ivory/95 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.5)] md:hidden"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
              <div
                ref={viewerImg}
                key={open.id}
                className={`relative overflow-hidden rounded-[1.25rem] ${dir ? "viewer-photo-step" : ""}`}
                style={{ ["--dx" as string]: `${dir * 36}px` } as CSSProperties}
              >
                <button
                  type="button"
                  aria-label={zoom ? "Zoom out" : "Zoom in"}
                  onClick={(e) => {
                    if (zoom) return setZoom(null);
                    const r = e.currentTarget.getBoundingClientRect();
                    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                  }}
                  onPointerMove={(e) => {
                    if (!zoom || e.pointerType !== "mouse") return;
                    const r = e.currentTarget.getBoundingClientRect();
                    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                  }}
                  className={`block w-full ${zoom ? "cursor-zoom-out" : "cursor-zoom-in"}`}
                >
                  <ProductFrame
                    image={open.image}
                    sizes="(min-width: 768px) 40rem, 100vw"
                    className="rounded-[1.25rem]"
                    eager
                    zoom={zoom}
                  />
                </button>
              </div>
              <p className="mt-2 text-center text-[0.72rem] text-muted">{zoom ? "Tap to zoom out" : "Tap the photo to zoom in"}</p>
            </div>

            <div key={open.id} className="viewer-detail flex flex-col p-6 sm:p-8 lg:p-10">
              <div className="flex items-start justify-between gap-4">
                <p className="text-[0.7rem] font-semibold tracking-[0.16em] text-terracotta uppercase">{open.trail || open.collection}</p>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="btn -mt-2 -mr-2 hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink/12 hover:border-ink md:flex"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
              <h3 className="mt-2 text-[1.7rem] leading-tight font-medium sm:text-[2rem]">{open.name}</h3>
              {open.description && <p className="mt-3 text-[0.98rem] leading-relaxed text-ink-soft">{open.description}</p>}

              <div className="mt-7 flex flex-wrap gap-3">
                {enquire(open) && (
                  <a
                    href={enquire(open)!}
                    target="_blank"
                    rel="noopener"
                    className="btn inline-flex h-12 items-center gap-2 rounded-full bg-terracotta px-6 text-[0.85rem] font-medium text-white hover:bg-terracotta-dark"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    Enquire
                  </a>
                )}
                {/* Not on the page of that collection itself. */}
                {open.href !== window.location.pathname && (
                  <a
                    href={open.href}
                    className="btn inline-flex h-12 items-center gap-2 rounded-full border border-ink/15 px-5 text-[0.85rem] font-medium hover:border-ink hover:bg-ink hover:text-ivory"
                  >
                    More {open.collection}
                    <ArrowRightIcon className="btn-arrow h-4 w-4" />
                  </a>
                )}
              </div>

              {shown.length > 1 && (
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-ink/10 pt-6 max-md:mt-8">
                  <button type="button" onClick={() => step(-1)} aria-label="Previous product" className="btn flex h-11 w-11 items-center justify-center rounded-full bg-ink text-ivory hover:bg-terracotta">
                    <ChevronLeftIcon className="h-5 w-5" />
                  </button>
                  <span className="text-[0.78rem] font-semibold text-muted tabular-nums">
                    {index + 1} / {shown.length}
                  </span>
                  <button type="button" onClick={() => step(1)} aria-label="Next product" className="btn flex h-11 w-11 items-center justify-center rounded-full bg-ink text-ivory hover:bg-terracotta">
                    <ChevronRightIcon className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}

/**
 * A 4:5 frame. A photo of another shape is shown whole over a blurred copy
 * of itself, never cropped.
 */
function ProductFrame({
  image,
  sizes,
  className = "",
  hover = false,
  eager = false,
  zoom = null,
}: {
  image: BrowserImage | null;
  sizes: string;
  className?: string;
  hover?: boolean;
  eager?: boolean;
  zoom?: { x: number; y: number } | null;
}) {
  const fits = image ? Math.abs(image.width / image.height - FRAME) < 0.02 : true;
  return (
    <span className={`relative block aspect-[4/5] overflow-hidden bg-stone ${className}`}>
      {image && (
        <>
          {!fits && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl" />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.src}
            srcSet={image.srcSet}
            sizes={sizes}
            width={image.width}
            height={image.height}
            alt={image.alt}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className={`absolute inset-0 h-full w-full ${fits ? "object-cover" : "object-contain"} ${hover ? "product-img" : "transition-transform duration-500 ease-out"}`}
            style={zoom ? { transform: "scale(2.2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
          />
        </>
      )}
    </span>
  );
}
