"use client";

// Gallery: every photo shown whole (frames take each photo's own shape, so
// nothing is cropped), in a masonry grid. Visitors filter by category and
// search by name; both run in the browser on the pre-rendered list, so no
// request goes to the Worker.
//
// Tapping a photo opens it larger in a native <dialog>. The photo grows out
// of its place in the grid (and flies back on close), the caption rises in,
// arrows (or keys, or a swipe on phones) step through the photos with a
// slide in the direction of travel, and Enquire opens a chat about that
// photo. Only transform and opacity animate.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GalleryItem } from "@/lib/content";
import { imageSource } from "@/lib/media";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, ExpandIcon, SearchIcon, WhatsAppIcon } from "../icons";
import { SiteLink } from "../SiteLink";

type Props = {
  items: GalleryItem[];
  categories: { slug: string; name: string }[];
  whatsappBase: string | null;
  businessName: string;
};

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const GRID_SIZES = "(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, 50vw";
const VIEW_SIZES = "(min-width: 1024px) 70vw, 92vw";
// The first photos animate in on page load with CSS (no wait for
// JavaScript); the rest fade in as they scroll into view.
const FIRST = 8;

const pad = (n: number) => String(n).padStart(2, "0");
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// The page behind the viewer doesn't scroll while it is open.
const lockScroll = (on: boolean) => {
  document.documentElement.style.overflow = on ? "hidden" : "";
};
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " ")
    .split(/\s+/)
    .filter(Boolean);

export function Gallery({ items, categories, whatsappBase, businessName }: Props) {
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<number | null>(null);
  const [dir, setDir] = useState<0 | 1 | -1>(0);
  const [placeholder, setPlaceholder] = useState<string | null>(null);

  const top = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const openFrom = useRef<DOMRect | null>(null);
  const closing = useRef(false);
  const touchX = useRef<number | null>(null);

  // Only categories that have photos get a filter button.
  const filters = useMemo(
    () =>
      categories
        .map((c) => ({ ...c, count: items.filter((i) => i.categorySlug === c.slug).length }))
        .filter((c) => c.count > 0),
    [categories, items],
  );

  const shown = useMemo(() => {
    const terms = words(query);
    return items.filter((item) => {
      if (category !== "all" && item.categorySlug !== category) return false;
      if (terms.length === 0) return true;
      const text = words(`${item.title} ${item.categoryName ?? ""}`).join(" ");
      return terms.every((t) => text.includes(t));
    });
  }, [items, category, query]);

  const thumb = (id: number) => document.querySelector<HTMLImageElement>(`[data-gal-id="${id}"] img`);

  const open = (index: number) => {
    const img = thumb(shown[index].id);
    openFrom.current = img?.getBoundingClientRect() ?? null;
    setPlaceholder(img?.currentSrc || null);
    setDir(0);
    setView(index);
  };

  const step = (by: 1 | -1) => {
    if (view === null || shown.length < 2) return;
    const next = (view + by + shown.length) % shown.length;
    setPlaceholder(thumb(shown[next].id)?.currentSrc || null);
    setDir(by);
    setView(next);
  };

  const close = () => {
    const d = dialog.current;
    if (!d?.open || closing.current) return;
    closing.current = true;
    if (reducedMotion() || view === null) {
      d.close();
      return;
    }
    // Fly back to the photo's place in the grid if it is on screen.
    const target = thumb(shown[view].id)?.getBoundingClientRect();
    const from = box.current?.getBoundingClientRect();
    const onScreen = target && target.bottom > 0 && target.top < window.innerHeight && target.width > 0;
    const timing = { duration: 420, easing: EASE, fill: "forwards" as const };
    const anims = [
      overlay.current?.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, duration: 380 }),
      caption.current?.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, duration: 200 }),
      box.current?.animate(
        onScreen && from
          ? [{ transform: "none" }, { transform: flip(target, from) }]
          : [
              { transform: "none", opacity: 1 },
              { transform: "scale(0.94)", opacity: 0 },
            ],
        timing,
      ),
    ];
    Promise.all(anims.map((a) => a?.finished))
      .catch(() => {})
      .then(() => d.close());
  };

  // Open the dialog and grow the photo out of its grid place, before the
  // first paint so there is no flash at full size.
  useLayoutEffect(() => {
    const d = dialog.current;
    if (view === null || !d || d.open) return;
    d.showModal();
    lockScroll(true);
    if (reducedMotion()) return;
    overlay.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: "ease" });
    caption.current?.animate(
      [
        { opacity: 0, transform: "translate3d(0, 18px, 0)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 600, delay: 220, easing: EASE, fill: "backwards" },
    );
    const from = openFrom.current;
    const to = box.current?.getBoundingClientRect();
    if (from && to && from.width > 0) {
      box.current?.animate([{ transform: flip(from, to) }, { transform: "none" }], { duration: 620, easing: EASE });
    } else {
      box.current?.animate(
        [
          { opacity: 0, transform: "scale(0.94)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 500, easing: EASE },
      );
    }
  }, [view]);

  // Keys: left / right step through the photos. Escape is handled by the
  // dialog's cancel event (so the close can animate).
  useEffect(() => {
    if (view === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const choose = (slug: string) => {
    if (slug === category) return;
    setCategory(slug);
    // If the visitor has scrolled down the grid, bring its top back into
    // view so the new set starts at the top.
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0) {
      window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 72, behavior: reducedMotion() ? "auto" : "smooth" });
    }
  };

  const current = view !== null ? shown[view] : null;
  const image = current ? imageSource(current.imageKey) : null;
  const ratio = current ? current.width / current.height : 1;
  const enquire =
    current && whatsappBase
      ? `${whatsappBase}?text=${encodeURIComponent(`Hello ${businessName}, I'd like to know more about the "${current.title}" photo in your gallery.`)}`
      : null;

  return (
    <div ref={top}>
      {/* Filter and search. Sticks under the header while scrolling. */}
      <div className="sticky top-16 z-30 -mx-5 bg-ivory/95 px-5 py-3 backdrop-blur-md sm:top-20 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10 xl:mx-0 xl:px-0">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between xl:gap-8">
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-5 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10 xl:mx-0 xl:flex-wrap xl:px-0" role="group" aria-label="Filter by category">
            <FilterChip active={category === "all"} onClick={() => choose("all")} label="All" count={items.length} />
            {filters.map((f) => (
              <FilterChip key={f.slug} active={category === f.slug} onClick={() => choose(f.slug)} label={f.name} count={f.count} />
            ))}
          </div>
          <label className="relative block shrink-0 sm:max-w-md xl:w-80">
            <span className="sr-only">Search the gallery</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-4 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the gallery"
              className="field h-11 rounded-full! py-0! pl-11!"
              autoComplete="off"
              enterKeyHint="search"
            />
          </label>
        </div>
      </div>

      <p className="mt-5 text-[0.8rem] font-medium tracking-[0.12em] text-muted uppercase" aria-live="polite">
        {shown.length === 1 ? "1 photo" : `${shown.length} photos`}
        {query.trim() && <> for &ldquo;{query.trim()}&rdquo;</>}
      </p>

      {shown.length === 0 ? (
        <div className="look-panel-in py-24 text-center">
          <p className="text-[1.3rem] font-medium">No photos match that search.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("all");
            }}
            className="btn mt-6 inline-flex h-12 items-center rounded-full border border-ink/15 px-6 text-[0.85rem] font-medium hover:border-ink hover:bg-ink hover:text-ivory"
          >
            Show all photos
          </button>
        </div>
      ) : (
        // Re-created when the category changes, so the new set animates in.
        <ul key={category} className="mt-5 columns-2 gap-3 sm:gap-4 lg:columns-3 lg:gap-5 xl:columns-4">
          {shown.map((item, i) => {
            const src = imageSource(item.imageKey);
            if (!src) return null;
            const first = i < FIRST;
            return (
              <li
                key={item.id}
                data-gal-id={item.id}
                className={`mb-3 break-inside-avoid sm:mb-4 lg:mb-5 ${first ? "gal-in" : ""}`}
                data-reveal={first ? undefined : ""}
                style={{ ["--i" as string]: i, ["--reveal-delay" as string]: i % 3 } as CSSProperties}
              >
                <button
                  type="button"
                  onClick={() => open(i)}
                  className="gal-card group block w-full text-left"
                  aria-label={`${item.title}, see larger`}
                  aria-haspopup="dialog"
                >
                  <span className="relative block overflow-hidden rounded-[1.1rem] bg-stone lg:rounded-[1.35rem]" style={{ aspectRatio: `${item.width} / ${item.height}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src.src}
                      srcSet={src.srcSet}
                      sizes={GRID_SIZES}
                      width={item.width}
                      height={item.height}
                      alt={item.title}
                      loading={i < 2 ? "eager" : "lazy"}
                      fetchPriority={i < 2 ? "high" : undefined}
                      decoding="async"
                      className="gal-img h-full w-full object-contain"
                    />
                    <span className="gal-zoom absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-ivory/90 text-ink shadow-sm">
                      <ExpandIcon className="h-4 w-4" />
                    </span>
                  </span>
                  <span className="mt-2.5 block px-1 pb-1">
                    <span className="block text-[0.92rem] leading-snug font-medium transition-colors duration-300 group-hover:text-terracotta">{item.title}</span>
                    {item.categoryName && <span className="mt-0.5 block text-[0.72rem] font-semibold tracking-[0.16em] text-muted uppercase">{item.categoryName}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <dialog
        ref={dialog}
        className="gal-dialog"
        aria-label={current ? current.title : "Photo"}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClose={() => {
          closing.current = false;
          lockScroll(false);
          setView(null);
        }}
      >
        <div ref={overlay} className="absolute inset-0 bg-night/95" onClick={close} aria-hidden="true" />
        {current && image && (
          <div className="pointer-events-none relative flex h-full w-full flex-col items-center justify-center px-4 pt-16 pb-6 sm:px-20 sm:pt-20 lg:px-28">
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="btn pointer-events-auto absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white hover:text-ink sm:top-6 sm:right-6"
            >
              <CloseIcon className="h-5 w-5" />
            </button>

            <div
              ref={box}
              className="pointer-events-auto relative max-w-full"
              style={{ aspectRatio: `${current.width} / ${current.height}`, width: `min(100%, 75rem, calc((100dvh - 15rem) * ${ratio}))` }}
              onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
              onTouchEnd={(e) => {
                const start = touchX.current;
                touchX.current = null;
                if (start === null) return;
                const dx = e.changedTouches[0].clientX - start;
                if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
              }}
            >
              <div
                key={current.id}
                className={`absolute inset-0 overflow-hidden rounded-[1.1rem] bg-ink lg:rounded-[1.5rem] ${dir ? "look-slide-in" : ""}`}
                style={{ ["--dx" as string]: `${dir * 60}px`, animationDelay: "0s" } as CSSProperties}
              >
                {placeholder && (
                  // The grid's copy, already loaded, shows until the larger one arrives.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={placeholder} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-contain" />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.src}
                  srcSet={image.srcSet}
                  sizes={VIEW_SIZES}
                  width={current.width}
                  height={current.height}
                  alt={current.title}
                  className="relative h-full w-full object-contain"
                />
              </div>
            </div>

            <div ref={caption} className="pointer-events-auto mt-5 flex w-full max-w-[75rem] flex-col items-center gap-4 text-center text-white sm:mt-6 sm:flex-row sm:justify-between sm:text-left">
              <div key={current.id} className={dir ? "look-slide-in" : ""} style={{ ["--dx" as string]: `${dir * 30}px` } as CSSProperties}>
                <p className="text-[0.72rem] font-semibold tracking-[0.2em] text-white/60 uppercase tabular-nums">
                  {pad(view! + 1)} <span className="text-white/30">/</span> {pad(shown.length)}
                  {current.categoryName && <span className="text-terracotta-light"> · {current.categoryName}</span>}
                </p>
                <p className="mt-1.5 text-[1.25rem] leading-tight font-medium sm:text-[1.4rem]">{current.title}</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 whitespace-nowrap">
                {enquire && (
                  <a
                    href={enquire}
                    target="_blank"
                    rel="noopener"
                    className="btn inline-flex h-12 items-center gap-2 rounded-full bg-terracotta px-6 text-[0.85rem] font-medium text-white hover:bg-terracotta-dark"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    Enquire
                  </a>
                )}
                {current.categorySlug && (
                  <SiteLink
                    href={`/collection/${current.categorySlug}`}
                    onClick={() => dialog.current?.close()}
                    className="btn inline-flex h-12 items-center gap-2 rounded-full border border-white/25 px-6 text-[0.85rem] font-medium hover:border-white hover:bg-white hover:text-ink"
                  >
                    View {current.categoryName}
                    <ArrowRightIcon className="btn-arrow h-4 w-4" />
                  </SiteLink>
                )}
              </div>
            </div>

            {shown.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Previous photo"
                  className="btn pointer-events-auto absolute top-1/2 left-3 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white hover:text-ink sm:left-5 sm:flex lg:left-8"
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Next photo"
                  className="btn pointer-events-auto absolute top-1/2 right-3 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white hover:text-ink sm:right-5 sm:flex lg:right-8"
                >
                  <ChevronRightIcon className="h-5 w-5" />
                </button>
                <div className="pointer-events-auto mt-4 flex gap-3 sm:hidden">
                  <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className="btn flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white">
                    <ChevronLeftIcon className="h-5 w-5" />
                  </button>
                  <button type="button" onClick={() => step(1)} aria-label="Next photo" className="btn flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white">
                    <ChevronRightIcon className="h-5 w-5" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`btn flex h-11 shrink-0 items-center gap-2 rounded-full border px-5 text-[0.82rem] font-medium whitespace-nowrap ${
        active ? "border-ink bg-ink text-ivory" : "border-ink/15 hover:border-ink"
      }`}
    >
      {label}
      <span className={`text-[0.72rem] tabular-nums ${active ? "text-ivory/60" : "text-muted"}`}>{count}</span>
    </button>
  );
}

/** Transform that moves and scales rect `to` onto rect `from` (same shape). */
function flip(from: DOMRect, to: DOMRect): string {
  const scale = from.width / to.width;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  return `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
}
