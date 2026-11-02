"use client";

// Section 01 · Hero (Floor & Furnishings-inspired): full-screen photo slides
// with three animations: a cross-fade between slides, a slow zoom on the
// active photo, and the headline rising in word by word on every slide.
// Only the first photo loads with the page; the others load after it, so
// the hero doesn't slow down the first paint.
//
// Timer: every slide stays SLIDE_MS, shown as a bar filling the active dot.
// The bar is a CSS animation and the slide changes when it ends, so what the
// visitor sees and the timer can never drift apart. It waits (keeping its
// place) while the hero is scrolled out of view, the tab is in the
// background, or the visitor presses pause. No auto-advance for visitors who
// ask for reduced motion.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { HeroSlide } from "@/lib/content";
import { imageSource } from "@/lib/media";
import { ArrowRightIcon, PauseIcon, PlayIcon } from "../icons";
import { SiteLink } from "../SiteLink";
import { Words } from "../Words";

const SLIDE_MS = 6000;

// The brand name is left out of the eyebrow on phones (the header shows it).
type Props = { slides: HeroSlide[]; eyebrow: { brand: string; place: string } };

export function Hero({ slides, eyebrow }: Props) {
  const [active, setActive] = useState(0);
  const [loadRest, setLoadRest] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [motionOk, setMotionOk] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const count = slides.length;

  // Load the other slides once the page has finished loading.
  useEffect(() => {
    const start = () => setLoadRest(true);
    if (document.readyState === "complete") {
      const id = setTimeout(start, 1200);
      return () => clearTimeout(id);
    }
    window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, []);

  // What the timer waits for: reduced motion, tab visibility, hero on screen.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setMotionOk(!media.matches);
    const onVisibility = () => setTabVisible(document.visibilityState === "visible");
    onMotion();
    onVisibility();
    media.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    let io: IntersectionObserver | undefined;
    if (ref.current && "IntersectionObserver" in window) {
      io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.3 });
      io.observe(ref.current);
    }
    return () => {
      media.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
    };
  }, []);

  if (count === 0) return null;
  const current = slides[active];
  const autoplay = count > 1 && motionOk;
  const running = autoplay && loadRest && !userPaused && onScreen && tabVisible;

  return (
    <section
      ref={ref}
      aria-roledescription="carousel"
      aria-label="Showroom highlights"
      className="relative isolate flex h-[100svh] min-h-[560px] items-end overflow-hidden bg-ink text-white"
    >
      {slides.map((slide, i) => {
        const source = imageSource(slide.image);
        if (!source) return null;
        const render = i === 0 || loadRest;
        return (
          <div
            key={slide.image}
            className="hero-slide absolute inset-0 -z-10"
            data-active={i === active}
            aria-hidden={i !== active}
          >
            {render && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={source.src}
                srcSet={source.srcSet}
                sizes="100vw"
                width={source.width}
                height={source.height}
                alt={slide.alt}
                className="h-full w-full object-cover"
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : "low"}
                decoding={i === 0 ? "sync" : "async"}
              />
            )}
          </div>
        );
      })}
      {/* Darkens the lower left so the white text stays readable on any photo. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(20,16,12,0.72)_0%,rgba(20,16,12,0.28)_42%,rgba(20,16,12,0.08)_70%,rgba(20,16,12,0.35)_100%)]"
      />

      <div className="shell pb-28 sm:pb-32 lg:pb-36">
        <div key={active} className="max-w-3xl">
          <p className="hero-rise text-[0.72rem] font-medium tracking-[0.22em] text-white/85 uppercase sm:text-[0.8rem]" style={{ ["--rise-delay" as string]: 0 }}>
            <span className="hidden sm:inline">{eyebrow.brand} · </span>
            {eyebrow.place}
          </p>
          {/* Headline words rise in one by one on every slide. */}
          <h1 className="mt-4 text-[2.35rem] leading-[1.08] font-medium tracking-[-0.01em] sm:text-6xl lg:text-[4.4rem]">
            <Words parts={[current.title]} delay={1} mode="auto" />
          </h1>
          <div className="hero-rise mt-8" style={{ ["--rise-delay" as string]: current.title.split(/\s+/).length + 3 }}>
            <SiteLink
              href={current.href}
              className="btn inline-flex h-12 items-center gap-3 rounded-full bg-terracotta px-7 text-[0.85rem] font-medium tracking-[0.06em] text-white hover:bg-terracotta-dark"
            >
              {current.cta}
              <ArrowRightIcon className="btn-arrow h-4 w-4" />
            </SiteLink>
          </div>
        </div>
      </div>

      {count > 1 && (
        <div className="absolute inset-x-0 bottom-8 flex items-center justify-center gap-1 sm:bottom-10">
          {slides.map((slide, i) => (
            <button
              key={slide.image}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show slide ${i + 1} of ${count}`}
              aria-current={i === active}
              className="group flex h-8 items-center justify-center px-1.5"
            >
              <span
                className={`relative block h-[5px] overflow-hidden rounded-full transition-[width,background-color] duration-500 ease-[var(--ease-out-soft)] ${
                  i === active ? `w-12 ${autoplay ? "bg-white/35" : "bg-white"}` : "w-[5px] bg-white/55 group-hover:bg-white/85"
                }`}
              >
                {i === active && autoplay && (
                  // Fills over SLIDE_MS; the next slide comes when it ends.
                  <span
                    key={active}
                    className="hero-progress absolute inset-0 rounded-full bg-white"
                    style={{ ["--slide-ms" as string]: `${SLIDE_MS}ms`, animationPlayState: running ? "running" : "paused" } as CSSProperties}
                    onAnimationEnd={() => running && setActive((a) => (a + 1) % count)}
                  />
                )}
              </span>
            </button>
          ))}
          {autoplay && (
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              aria-label={userPaused ? "Play slides" : "Pause slides"}
              className="ml-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/35 text-white/90 transition-colors duration-300 hover:border-white hover:bg-white hover:text-ink"
            >
              {userPaused ? <PlayIcon className="h-3.5 w-3.5" /> : <PauseIcon className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      )}

      {/* Sits above the fixed WhatsApp button on the right. */}
      <div aria-hidden="true" className="absolute right-10 bottom-32 hidden flex-col items-center gap-3 lg:flex">
        <span className="text-[0.68rem] font-medium tracking-[0.3em] text-white/80 uppercase [writing-mode:vertical-rl]">Scroll</span>
        <span className="relative block h-14 w-px overflow-hidden bg-white/25">
          <span className="scroll-line absolute inset-0 bg-white" />
        </span>
      </div>
    </section>
  );
}
