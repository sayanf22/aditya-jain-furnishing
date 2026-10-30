"use client";

// Section 04 · Watch & Buy: short portrait clips. A clip downloads only when
// the visitor taps play (preload="none"), only one plays at a time, and it
// pauses when scrolled away. "Buy" means enquiring on WhatsApp; there is no
// cart.
import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import type { WatchItem } from "@/lib/content";
import { imageSource, videoSource } from "@/lib/media";
import { PauseIcon, PlayIcon, WhatsAppIcon } from "../icons";

type Props = { items: WatchItem[]; whatsappBase: string | null };

export function WatchAndBuy({ items, whatsappBase }: Props) {
  const [playing, setPlaying] = useState<number | null>(null);
  if (items.length === 0) return null;
  return (
    <section className="bg-ivory py-20 sm:py-24" aria-labelledby="watch-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-col items-center text-center" data-reveal>
          <h2 id="watch-title" className="section-title">
            Watch <span className="text-terracotta">&amp; buy</span>
          </h2>
          <p className="mt-4 max-w-xl text-[0.98rem] leading-relaxed text-muted">
            Tap a clip to play it, then enquire on WhatsApp about what you saw.
          </p>
        </div>
        <ul className="no-scrollbar -mx-5 mt-12 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 sm:scroll-px-8 pb-2 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible lg:px-0">
          {items.map((item, i) => (
            <li key={item.id} className="w-[64vw] max-w-[17rem] shrink-0 snap-start lg:w-auto lg:max-w-none" data-reveal style={{ ["--reveal-delay" as string]: i }}>
              <Clip item={item} active={playing === item.id} setPlaying={setPlaying} whatsappBase={whatsappBase} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Clip({
  item,
  active,
  setPlaying,
  whatsappBase,
}: {
  item: WatchItem;
  active: boolean;
  setPlaying: Dispatch<SetStateAction<number | null>>;
  whatsappBase: string | null;
}) {
  const id = item.id;
  const onPlay = useCallback(() => setPlaying(id), [id, setPlaying]);
  const onStop = useCallback(() => setPlaying((p) => (p === id ? null : p)), [id, setPlaying]);
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const poster = imageSource(item.posterKey);
  const src = videoSource(item.videoKey);

  // Play or pause when this clip becomes (in)active. The <video> is mounted
  // on first play, so this also runs once it exists.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active) {
      v.play().catch(() => onStop());
    } else {
      v.pause();
    }
  }, [active, started, onStop]);

  // Pause when scrolled off screen.
  useEffect(() => {
    const el = box.current;
    if (!el || !active || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => !e.isIntersecting && onStop(), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [active, onStop]);

  const toggle = () => {
    if (active) {
      onStop();
    } else {
      setStarted(true);
      onPlay();
    }
  };

  const enquire = whatsappBase
    ? `${whatsappBase}?text=${encodeURIComponent(`Hello, I saw the ${item.title.toLowerCase()} clip on your website and would like to know more.`)}`
    : null;

  return (
    <div>
      <div ref={box} className="group relative aspect-[9/16] overflow-hidden rounded-2xl bg-stone">
        {poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster.src}
            srcSet={poster.srcSet}
            sizes="(min-width: 1024px) 22vw, 64vw"
            width={poster.width}
            height={poster.height}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        )}
        {started && src && (
          <video
            ref={video}
            src={src}
            muted
            loop
            playsInline
            preload="none"
            className="absolute inset-0 h-full w-full object-cover"
            aria-label={`${item.title} clip`}
          />
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={active ? `Pause ${item.title} clip` : `Play ${item.title} clip`}
          className="absolute inset-0 flex items-center justify-center"
        >
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-full bg-ivory/90 text-ink shadow-lg backdrop-blur-sm transition-[opacity,transform] duration-300 group-hover:scale-105 ${
              active ? "opacity-0 group-hover:opacity-100" : "opacity-100"
            }`}
          >
            {active ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="ml-0.5 h-5 w-5" />}
          </span>
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[1rem] font-medium">{item.title}</p>
        {enquire && (
          <a
            href={enquire}
            target="_blank"
            rel="noopener"
            className="btn inline-flex h-9 items-center gap-1.5 rounded-full border border-ink/15 px-3.5 text-[0.75rem] font-medium tracking-[0.06em] uppercase hover:border-terracotta hover:bg-terracotta hover:text-white"
          >
            <WhatsAppIcon className="h-3.5 w-3.5" />
            Enquire
          </a>
        )}
      </div>
    </div>
  );
}
