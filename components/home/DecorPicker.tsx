"use client";

// Section 03 · Interactive home décor (agreement §04): the admin uploads a
// ready photo of a product in each texture; the visitor taps a texture and
// the matching photo cross-fades in. Nothing is generated. The other photos
// start loading once the section is near the screen, so taps feel instant.
import { useEffect, useRef, useState } from "react";
import type { DecorScene } from "@/lib/content";
import { imageSource } from "@/lib/media";
import { WhatsAppIcon } from "../icons";

type Props = { scene: DecorScene; whatsappBase: string | null };

const SIZES = "(min-width: 1024px) 58vw, 100vw";

export function DecorPicker({ scene, whatsappBase }: Props) {
  const [active, setActive] = useState(0);
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
    <section ref={ref} className="bg-sand" aria-labelledby="decor-title">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-stone" data-reveal>
          {options.map((opt, i) => {
            const source = imageSource(opt.imageKey);
            if (!source) return null;
            const render = i === active || warm;
            return render ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={opt.id}
                src={source.src}
                srcSet={source.srcSet}
                sizes={SIZES}
                width={source.width}
                height={source.height}
                alt={i === active ? `${scene.name} in ${opt.name}` : ""}
                aria-hidden={i !== active}
                loading={i === active ? "lazy" : "eager"}
                decoding="async"
                className="decor-layer absolute inset-0 h-full w-full object-cover"
                style={{ opacity: i === active ? 1 : 0 }}
              />
            ) : null;
          })}
          <p className="absolute bottom-4 left-4 rounded-full bg-ivory/90 px-4 py-2 text-[0.8rem] font-medium text-ink backdrop-blur-sm" aria-live="polite">
            {current.name}
          </p>
        </div>

        <div data-reveal style={{ ["--reveal-delay" as string]: 1 }}>
          <h2 id="decor-title" className="section-title">
            Interactive <span className="text-terracotta">home décor</span>
          </h2>
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
                  onClick={() => setActive(i)}
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
              className="btn mt-10 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[0.85rem] font-medium tracking-[0.04em] text-ivory hover:bg-terracotta"
            >
              <WhatsAppIcon className="h-4 w-4" />
              Enquire about this look
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
