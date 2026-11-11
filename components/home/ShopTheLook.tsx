"use client";

// Section 04 · Watch & Buy, photo based (no video): "Our looks". Each look
// is a room photo with dots on the products in it. Tapping a dot shows that
// product on the right with a WhatsApp enquiry and a link to its category.
//
// Changing look (arrows or dots) plays in steps: the new photo slides in
// from the side you're heading to while the old one drifts away and dims,
// the photo settles from a slight zoom, the product dots pop in one by one,
// and the panel on the right slides in from the same side. Only transform
// and opacity animate (Web Animations API), so it stays smooth.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Look } from "@/lib/content";
import { imageSource } from "@/lib/media";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, WhatsAppIcon } from "../icons";
import { SiteLink } from "../SiteLink";
import { Words } from "../Words";

type Props = { looks: Look[]; whatsappBase: string | null };

const SIZES = "(min-width: 1024px) 55vw, 100vw";
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const SLIDE_MS = 950;

const pad = (n: number) => String(n).padStart(2, "0");
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function ShopTheLook({ looks, whatsappBase }: Props) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [spotId, setSpotId] = useState<number | null>(null);
  // When the product dots start popping in: right away on first view, after
  // the photo has mostly slid in when changing look. Set once per change so
  // it never shifts while the dots are animating.
  const [dotsDelay, setDotsDelay] = useState(250);
  const [warm, setWarm] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);

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

  // Slide the photos whenever the look changes.
  useEffect(() => {
    if (leaving === null || !frame.current) return;
    const incoming = frame.current.querySelector<HTMLElement>(`[data-look="${index}"]`);
    const outgoing = frame.current.querySelector<HTMLElement>(`[data-look="${leaving}"]`);
    const timing = { duration: SLIDE_MS, easing: EASE };
    const anims = [
      incoming?.animate([{ transform: `translate3d(${dir * 100}%, 0, 0)` }, { transform: "translate3d(0, 0, 0)" }], timing),
      incoming?.querySelector("img")?.animate([{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { ...timing, duration: SLIDE_MS + 450 }),
      outgoing?.animate(
        [
          { transform: "translate3d(0, 0, 0)", opacity: 1 },
          { transform: `translate3d(${dir * -32}%, 0, 0)`, opacity: 0.3 },
        ],
        timing,
      ),
    ];
    let done = false;
    anims[0]?.finished.then(() => !done && setLeaving(null)).catch(() => {});
    return () => {
      done = true;
      anims.forEach((a) => a?.cancel());
    };
  }, [index, leaving, dir]);

  if (looks.length === 0) return null;
  const count = looks.length;
  const look = looks[index];
  const spot = look.hotspots.find((h) => h.id === spotId) ?? null;
  const image = imageSource(look.imageKey);

  const go = (to: number, direction?: 1 | -1) => {
    const target = (to + count) % count;
    if (target === index) return;
    const still = reducedMotion();
    setDir(direction ?? (target > index ? 1 : -1));
    setLeaving(still ? null : index);
    setDotsDelay(still ? 0 : SLIDE_MS - 300);
    setIndex(target);
    setSpotId(null);
  };

  const enquire =
    spot && whatsappBase
      ? `${whatsappBase}?text=${encodeURIComponent(`Hello, I'd like to know more about the ${spot.name.toLowerCase()} in the "${look.title}" look on your website.`)}`
      : null;

  // Panel content slides in from the side the visitor is heading to.
  const slideIn = { ["--dx" as string]: `${dir * 36}px` } as CSSProperties;

  return (
    <section ref={ref} className="bg-ivory py-20 sm:py-28 lg:py-32" aria-labelledby="looks-title" aria-roledescription="carousel">
      <div className="shell">
        <div className="text-center">
          <p className="section-label" data-reveal>
            Watch &amp; buy
          </p>
          <h2 id="looks-title" className="section-title mt-3" data-words>
            <Words parts={["Our", { accent: "looks" }]} />
          </h2>
        </div>

        <div className="relative mt-12 sm:mt-14 lg:mt-16 lg:px-20" data-reveal style={{ ["--reveal-delay" as string]: 1 }}>
          <div className="grid items-center gap-10 lg:grid-cols-[1.45fr_1fr] lg:gap-16 xl:gap-24">
            {/* Photo with product dots */}
            <div ref={frame} className="relative isolate aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-stone">
              {looks.map((l, i) => {
                const src = imageSource(l.imageKey);
                if (!src || (!warm && i !== index)) return null;
                const state = i === index ? "active" : i === leaving ? "leaving" : "idle";
                return (
                  <div
                    key={l.id}
                    data-look={i}
                    aria-hidden={i !== index}
                    className="absolute inset-0 overflow-hidden"
                    style={{ opacity: state === "idle" ? 0 : 1, zIndex: state === "active" ? 2 : state === "leaving" ? 1 : 0 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src.src}
                      srcSet={src.srcSet}
                      sizes={SIZES}
                      width={src.width}
                      height={src.height}
                      alt={i === index ? `${l.title} look` : ""}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  </div>
                );
              })}
              <div key={look.id} className="absolute inset-0 z-10">
                {look.hotspots.map((h, i) => {
                  const active = h.id === spotId;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setSpotId(active ? null : h.id)}
                      aria-label={`${h.name}${active ? ", selected" : ""}`}
                      aria-pressed={active}
                      className="spot-pop absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                      style={{ left: `${h.x}%`, top: `${h.y}%`, animationDelay: `${dotsDelay + i * 130}ms` }}
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
            </div>

            {/* Product panel */}
            <div className="min-h-[16rem] text-center lg:text-left" aria-live="polite">
              {spot ? (
                <div key={`spot-${spot.id}`} className="look-slide-in mx-auto max-w-sm lg:mx-0" style={slideIn}>
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
                  <div className="mt-7 flex flex-wrap items-center justify-center gap-3 whitespace-nowrap lg:justify-start">
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
                <div key={`look-${look.id}`} className="look-slide-in mx-auto max-w-sm lg:mx-0" style={slideIn}>
                  <p className="text-[0.8rem] font-semibold tracking-[0.2em] text-muted tabular-nums">
                    {pad(index + 1)} <span className="text-ink/30">/</span> {pad(count)}
                  </p>
                  <h3 className="mt-3 text-[1.9rem] leading-tight font-medium sm:text-[2.2rem]">{look.title}</h3>
                  <p className="mt-3 text-[0.98rem] text-muted">Tap a dot to see the product.</p>
                  <ul className="mt-7 flex flex-wrap justify-center gap-2 lg:justify-start">
                    {look.hotspots.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => setSpotId(h.id)}
                          className="rounded-full border border-ink/12 px-4 py-2 text-[0.82rem] transition-colors duration-300 hover:border-terracotta hover:text-terracotta"
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

          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(index - 1, -1)}
                aria-label="Previous look"
                className="btn absolute top-[40%] left-0 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-ivory hover:bg-terracotta lg:flex"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => go(index + 1, 1)}
                aria-label="Next look"
                className="btn absolute top-[40%] right-0 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-ivory hover:bg-terracotta lg:flex"
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
              <div className="mt-10 flex items-center justify-center gap-4 lg:mt-12">
                <button type="button" onClick={() => go(index - 1, -1)} aria-label="Previous look" className="btn flex h-11 w-11 items-center justify-center rounded-full bg-ink text-ivory lg:hidden">
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <div className="flex">
                  {looks.map((l, i) => (
                    <button key={l.id} type="button" onClick={() => go(i)} aria-label={`Show look ${i + 1} of ${count}`} aria-current={i === index} className="group flex h-8 items-center justify-center px-1.5">
                      <span className={`block h-[5px] rounded-full transition-[width,background-color] duration-500 ${i === index ? "w-10 bg-ink" : "w-[5px] bg-ink/25 group-hover:bg-ink/50"}`} />
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => go(index + 1, 1)} aria-label="Next look" className="btn flex h-11 w-11 items-center justify-center rounded-full bg-ink text-ivory lg:hidden">
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
