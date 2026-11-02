"use client";

// Section 04 · Watch & Buy, photo based (no video): "Our looks". Each look
// is a room photo with dots on the products in it. Tapping a dot shows that
// product on the right with a WhatsApp enquiry and a link to its category.
// Arrows and dots move between looks; photos cross-fade.
import { useEffect, useRef, useState } from "react";
import type { Look } from "@/lib/content";
import { imageSource } from "@/lib/media";
import { ArrowRightIcon, BagIcon, ChevronLeftIcon, ChevronRightIcon, WhatsAppIcon } from "../icons";
import { SiteLink } from "../SiteLink";
import { Words } from "../Words";

type Props = { looks: Look[]; whatsappBase: string | null };

const SIZES = "(min-width: 1024px) 50vw, 100vw";

export function ShopTheLook({ looks, whatsappBase }: Props) {
  const [index, setIndex] = useState(0);
  const [spotId, setSpotId] = useState<number | null>(null);
  const [warm, setWarm] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // Load the other looks' photos once the section is near the screen.
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) {
      setWarm(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setWarm(true);
          io.disconnect();
        }
      },
      { rootMargin: "500px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (looks.length === 0) return null;
  const look = looks[index];
  const spot = look.hotspots.find((h) => h.id === spotId) ?? null;
  const go = (to: number) => {
    setIndex((to + looks.length) % looks.length);
    setSpotId(null);
  };
  const image = imageSource(look.imageKey);

  const enquire =
    spot && whatsappBase
      ? `${whatsappBase}?text=${encodeURIComponent(`Hello, I'd like to know more about the ${spot.name.toLowerCase()} in the "${look.title}" look on your website.`)}`
      : null;

  return (
    <section ref={ref} className="bg-ivory py-20 sm:py-24" aria-labelledby="looks-title" aria-roledescription="carousel">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="text-center">
          <p className="section-label" data-reveal>
            Watch &amp; buy
          </p>
          <h2 id="looks-title" className="section-title mt-3" data-words>
            <Words parts={["Our", { accent: "looks" }]} />
          </h2>
        </div>

        <div className="relative mt-12 lg:px-16" data-reveal style={{ ["--reveal-delay" as string]: 1 }}>
          <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
            {/* Photo with product dots */}
            <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-stone">
              {looks.map((l, i) => {
                const src = imageSource(l.imageKey);
                if (!src || (!warm && i !== index)) return null;
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={l.id}
                    src={src.src}
                    srcSet={src.srcSet}
                    sizes={SIZES}
                    width={src.width}
                    height={src.height}
                    alt={i === index ? `${l.title} look` : ""}
                    aria-hidden={i !== index}
                    loading="lazy"
                    decoding="async"
                    className="look-layer absolute inset-0 h-full w-full object-cover"
                    style={{ opacity: i === index ? 1 : 0 }}
                  />
                );
              })}
              <div key={look.id} className="absolute inset-0">
                {look.hotspots.map((h, i) => {
                  const active = h.id === spotId;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setSpotId(active ? null : h.id)}
                      aria-label={`${h.name}${active ? ", selected" : ""}`}
                      aria-pressed={active}
                      className="look-panel-in absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                      style={{ left: `${h.x}%`, top: `${h.y}%`, animationDelay: `${300 + i * 120}ms` }}
                    >
                      <span aria-hidden="true" className="spot-ring absolute h-6 w-6 rounded-full bg-white/70" style={{ animationDelay: `${i * 400}ms` }} />
                      <span
                        aria-hidden="true"
                        className={`relative flex h-6 w-6 items-center justify-center rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.35)] transition-[transform,background-color] duration-300 ${
                          active ? "scale-110 bg-terracotta" : "bg-white hover:scale-110"
                        }`}
                      >
                        <span className={`block h-2 w-2 rounded-full transition-colors duration-300 ${active ? "bg-white" : "bg-terracotta"}`} />
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="absolute bottom-4 left-4 rounded-full bg-ivory/90 px-4 py-2 text-[0.78rem] font-medium text-ink">{look.title}</p>
            </div>

            {/* Product panel */}
            <div className="min-h-[15rem] text-center lg:text-left" aria-live="polite">
              {spot ? (
                <div key={spot.id} className="look-panel-in mx-auto max-w-sm lg:mx-0">
                  {image && (
                    <div className="mx-auto h-28 w-28 overflow-hidden rounded-2xl bg-stone lg:mx-0">
                      {/* The same photo, zoomed in on the product's dot. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.src}
                        srcSet={image.srcSet}
                        sizes="240px"
                        alt=""
                        className="h-full w-full object-cover"
                        style={{ transform: "scale(2.6)", transformOrigin: `${spot.x}% ${spot.y}%`, objectPosition: `${spot.x}% ${spot.y}%` }}
                      />
                    </div>
                  )}
                  {spot.categoryName && <p className="section-label mt-6">{spot.categoryName}</p>}
                  <p className="mt-2 text-[1.6rem] leading-tight font-medium">{spot.name}</p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3 whitespace-nowrap lg:justify-start">
                    {enquire && (
                      <a
                        href={enquire}
                        target="_blank"
                        rel="noopener"
                        className="btn inline-flex h-12 items-center gap-2 rounded-full bg-terracotta px-6 text-[0.85rem] font-medium text-white hover:bg-terracotta-dark"
                      >
                        <WhatsAppIcon className="h-4 w-4" />
                        Enquire on WhatsApp
                      </a>
                    )}
                    {spot.categorySlug && (
                      <SiteLink
                        href={`/collection/${spot.categorySlug}`}
                        className="btn inline-flex h-12 items-center gap-2 rounded-full border border-ink/15 px-6 text-[0.85rem] font-medium hover:border-ink hover:bg-ink hover:text-ivory"
                      >
                        View {spot.categoryName}
                        <ArrowRightIcon className="btn-arrow h-4 w-4" />
                      </SiteLink>
                    )}
                  </div>
                </div>
              ) : (
                <div key={`empty-${look.id}`} className="look-panel-in mx-auto max-w-sm lg:mx-0">
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sand text-terracotta lg:mx-0">
                    <BagIcon className="h-7 w-7" />
                  </span>
                  <p className="mt-6 text-[0.78rem] font-semibold tracking-[0.2em] uppercase">Choose a product</p>
                  <p className="mt-3 text-[0.98rem] leading-relaxed text-muted">Tap a dot on the photo to see what&apos;s in this look.</p>
                  <ul className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
                    {look.hotspots.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => setSpotId(h.id)}
                          className="rounded-full border border-ink/12 px-3.5 py-1.5 text-[0.8rem] transition-colors duration-300 hover:border-terracotta hover:text-terracotta"
                        >
                          {h.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {looks.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(index - 1)}
                aria-label="Previous look"
                className="btn absolute top-[38%] left-0 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-ivory hover:bg-terracotta lg:flex"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => go(index + 1)}
                aria-label="Next look"
                className="btn absolute top-[38%] right-0 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-ivory hover:bg-terracotta lg:flex"
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
              <div className="mt-10 flex items-center justify-center gap-4">
                <button type="button" onClick={() => go(index - 1)} aria-label="Previous look" className="btn flex h-10 w-10 items-center justify-center rounded-full bg-ink text-ivory lg:hidden">
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <div className="flex gap-1">
                  {looks.map((l, i) => (
                    <button key={l.id} type="button" onClick={() => go(i)} aria-label={`Show look ${i + 1} of ${looks.length}`} aria-current={i === index} className="group flex h-8 w-8 items-center justify-center">
                      <span className={`block h-1.5 rounded-full transition-[width,background-color] duration-500 ${i === index ? "w-7 bg-ink" : "w-1.5 bg-ink/25 group-hover:bg-ink/50"}`} />
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => go(index + 1)} aria-label="Next look" className="btn flex h-10 w-10 items-center justify-center rounded-full bg-ink text-ivory lg:hidden">
                  <ChevronRightIcon className="h-5 w-5" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
