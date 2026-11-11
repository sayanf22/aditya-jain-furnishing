"use client";

// Section 03 · Interactive home décor (agreement §04): the admin uploads a
// ready photo of a product in each texture; the visitor taps a texture and
// the matching photo cross-fades in. Nothing is generated. The other photos
// start loading once the section is near the screen, so taps feel instant.
import { useEffect, useRef, useState } from "react";
import type { DecorScene } from "@/lib/content";
import { imageSource } from "@/lib/media";
import { WhatsAppIcon } from "../icons";
import { Words } from "../Words";

type Props = { scene: DecorScene; whatsappBase: string | null };

const SIZES = "(min-width: 1024px) 58vw, 100vw";

export function DecorPicker({ scene, whatsappBase }: Props) {
  const [active, setActive] = useState(0);
  // The photo being wiped over, and which way the wipe runs (towards the
  // swatch picked: a swatch to the right wipes left to right).
  const [prev, setPrev] = useState<number | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  // After the first change the active layer keeps its wipe/zoom classes, so
  // they finish on their own (and the first photo on load doesn't animate).
  const [changed, setChanged] = useState(false);
  const [warm, setWarm] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const options = scene.options;
  const current = options[active];

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) {
      setWarm(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setWarm(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const whatsappHref = whatsappBase
    ? `${whatsappBase}?text=${encodeURIComponent(`Hello, I'd like to know more about the ${current.name} ${scene.name.toLowerCase()} look.`)}`
    : null;

  return (
    <section ref={ref} className="px-3 sm:px-5 lg:px-6" aria-labelledby="decor-title">
      <div className="mx-auto max-w-[108rem] rounded-[2rem] bg-sand lg:rounded-[2.5rem]">
      <div className="shell grid items-center gap-10 py-16 sm:gap-12 sm:py-20 lg:grid-cols-[1.4fr_1fr] lg:gap-20 lg:py-28 xl:gap-28">
        {/* Changing texture: the new photo is wiped in over the old one by a
            clean vertical edge (clip-path), with a soft light line riding on
            the edge, while the new photo settles from a slight zoom. */}
        <div
          className="relative isolate aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-stone"
          data-reveal
        >
          {options.map((opt, i) => {
            const source = imageSource(opt.imageKey);
            if (!source) return null;
            const render = i === active || i === prev || warm;
            const isActive = i === active;
            const wiping = isActive && changed;
            return render ? (
              <div
                key={opt.id}
                aria-hidden={!isActive}
                className={`absolute inset-0 ${wiping ? (dir === 1 ? "decor-wipe-ltr" : "decor-wipe-rtl") : ""}`}
                style={{ opacity: isActive || i === prev ? 1 : 0, zIndex: isActive ? 2 : i === prev ? 1 : 0 }}
                onAnimationEnd={(e) => {
                  if (e.target === e.currentTarget && isActive) setPrev(null);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={source.src}
                  srcSet={source.srcSet}
                  sizes={SIZES}
                  width={source.width}
                  height={source.height}
                  alt={isActive ? `${scene.name} in ${opt.name}` : ""}
                  loading={isActive ? "lazy" : "eager"}
                  decoding="async"
                  className={`h-full w-full object-cover ${wiping ? "decor-settle" : ""}`}
                />
              </div>
            ) : null;
          })}
          {prev !== null && <span key={`edge-${active}`} aria-hidden="true" className={`decor-wipe-edge ${dir === 1 ? "decor-edge-ltr" : "decor-edge-rtl"}`} />}
          <p className="absolute bottom-4 left-4 z-10 overflow-hidden rounded-full bg-ivory/90 px-4 py-2 text-[0.8rem] font-medium text-ink backdrop-blur-sm" aria-live="polite">
            <span key={current.id} className="decor-label-in block">
              {current.name}
            </span>
          </p>
        </div>

        <div>
          <p className="section-label" data-reveal>
            Try a look
          </p>
          <h2 id="decor-title" className="section-title mt-3" data-words>
            <Words parts={["Interactive", { accent: "home décor" }]} />
          </h2>
          <div data-reveal style={{ ["--reveal-delay" as string]: 2 }}>
          <p className="mt-5 max-w-md text-[1.02rem] leading-relaxed text-ink-soft">
            Tap a texture to see the {scene.name.toLowerCase()} in it.
          </p>

          <div role="radiogroup" aria-label="Choose a texture" className="mt-8 flex flex-wrap gap-3 sm:gap-5">
            {options.map((opt, i) => {
              const swatch = imageSource(opt.swatchKey);
              const selected = i === active;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    if (i === active) return;
                    setDir(i > active ? 1 : -1);
                    setPrev(active);
                    setChanged(true);
                    setActive(i);
                  }}
                  className="group flex w-[4.4rem] flex-col items-center gap-2 text-center sm:w-[4.75rem]"
                >
                  <span
                    className={`block h-16 w-16 overflow-hidden rounded-full ring-offset-4 ring-offset-sand transition-[box-shadow,transform] duration-300 group-hover:scale-105 ${
                      selected ? "ring-2 ring-terracotta" : "ring-1 ring-ink/15"
                    }`}
                  >
                    {swatch && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={swatch.src}
                        srcSet={swatch.srcSet}
                        sizes="64px"
                        width={64}
                        height={64}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </span>
                  <span className={`text-[0.78rem] leading-tight ${selected ? "font-semibold text-ink" : "text-muted"}`}>{opt.name}</span>
                </button>
              );
            })}
          </div>

          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener"
              className="btn mt-10 inline-flex h-12 items-center gap-2 rounded-full bg-terracotta px-6 text-[0.85rem] font-medium tracking-[0.04em] text-white hover:bg-terracotta-dark"
            >
              <WhatsAppIcon className="h-4 w-4" />
              Enquire about this look
            </a>
          )}
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}
