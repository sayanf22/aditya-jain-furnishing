"use client";

// Section 03 · Interactive home décor, as one interactive room (client's
// request, 13 Nov 2026). It merges the old texture picker and "Our looks":
// every element in the room (curtains, blind, sofa, armchair, cushions,
// rug, wallpaper) can be tapped, which shows what it is, its collection and
// the fabrics to choose from; picking one changes it in the room. The
// visitor can enquire about one element or about the whole room.
//
// Drawing: components/home/room/shapes.tsx. Motion: room rules in
// app/globals.css (transform, opacity and clip-path only).
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { RoomElement, RoomOption, RoomSlug } from "@/lib/content";
import { imageSource } from "@/lib/media";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, WhatsAppIcon } from "../../icons";
import { SiteLink } from "../../SiteLink";
import { Words } from "../../Words";
import { BackStatic, FloorShadows, FOCUS, H, ORDER, PARTS, PLAIN, RoomDefs, Shade, SPOTS, W } from "./shapes";

type Props = { room: RoomElement[]; whatsappBase: string | null };
type Svg = Exclude<RoomSlug, "rug">;

const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;
const src = (key: string) => imageSource(key)?.src ?? null;
const FLOOR = src("demo/tex-floor-oak");
const WIPE: Partial<Record<RoomSlug, "down" | "across">> = { curtains: "down", blind: "down", wall: "across" };

const pickLabel = (slug: RoomSlug) => (slug === "wall" ? "Choose a wallpaper" : slug === "rug" ? "Choose a rug" : "Choose a fabric");

export function RoomStudio({ room, whatsappBase }: Props) {
  // Elements that have something to choose, in the dashboard's order.
  const live = room.filter((e) => e.options.length > 0);
  const bySlug = new Map(live.map((e) => [e.slug, e]));

  const [choice, setChoice] = useState<Record<string, number>>(() =>
    Object.fromEntries(live.map((e) => [e.slug, e.options[0].id])),
  );
  // The texture being covered by a new one, until the change finishes.
  const [prev, setPrev] = useState<Record<string, number | null>>({});
  const [selected, setSelected] = useState<RoomSlug | null>(null);
  const [touched, setTouched] = useState(false);
  // warm: start loading textures (section near the screen); seen: play the
  // tap points' pop-in (section on screen).
  const [warm, setWarm] = useState(false);
  const [seen, setSeen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const section = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pan = useRef(0);
  const drag = useRef<{ x: number; start: number; id: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);

  useEffect(() => {
    const el = section.current;
    if (!el || !("IntersectionObserver" in window)) {
      setWarm(true);
      setSeen(true);
      return;
    }
    const near = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setWarm(true);
          near.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    const onScreen = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          onScreen.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    near.observe(el);
    onScreen.observe(frame.current ?? el);
    return () => {
      near.disconnect();
      onScreen.disconnect();
    };
  }, []);

  // ------------------------------------------------------------ panning
  // On narrow screens the stage is wider than the frame. Pan is kept in a
  // ref and written straight to the stage's style, so dragging doesn't
  // re-render the room.
  const limits = useCallback(() => {
    const f = frame.current;
    if (!f) return { max: 0, sw: 0 };
    const fw = f.clientWidth;
    const fh = f.clientHeight;
    const sw = Math.max(fw, fh * (W / H));
    return { max: (sw - fw) / 2, sw };
  }, []);
  const setPan = useCallback(
    (px: number) => {
      const { max } = limits();
      pan.current = Math.max(-max, Math.min(max, px));
      stage.current?.style.setProperty("--pan", `${pan.current.toFixed(1)}px`);
    },
    [limits],
  );
  const panTo = useCallback(
    (slug: RoomSlug) => {
      const { sw } = limits();
      setPan((0.5 - FOCUS[slug] / W) * sw);
    },
    [limits, setPan],
  );
  useEffect(() => {
    const f = frame.current;
    if (!f || !("ResizeObserver" in window)) return;
    const ro = new ResizeObserver(() => setPan(pan.current));
    ro.observe(f);
    return () => ro.disconnect();
  }, [setPan]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (limits().max <= 0 || e.button !== 0) return;
    drag.current = { x: e.clientX, start: pan.current, id: e.pointerId, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 8) {
      d.moved = true;
      setDragging(true);
      frame.current?.setPointerCapture(e.pointerId);
    }
    if (d.moved) setPan(d.start + dx);
  };
  const endDrag = () => {
    if (drag.current?.moved) swallowClick.current = true;
    drag.current = null;
    setDragging(false);
  };

  // ------------------------------------------------------------ choosing
  const select = useCallback(
    (slug: RoomSlug | null) => {
      setTouched(true);
      setSelected(slug);
      if (!slug) return;
      panTo(slug);
      // Below 1024 px the panel sits under the room: when something is
      // picked from the list, bring the room back into view so the change
      // can be seen.
      const f = frame.current;
      if (f && window.matchMedia("(max-width: 1023.98px)").matches) {
        const r = f.getBoundingClientRect();
        if (r.top < 64 || r.bottom > window.innerHeight) {
          const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          f.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
        }
      }
    },
    [panTo],
  );

  const pick = (slug: RoomSlug, id: number) => {
    const current = choice[slug];
    if (current === id) return;
    setTouched(true);
    setPrev((p) => ({ ...p, [slug]: current }));
    setChoice((c) => ({ ...c, [slug]: id }));
  };
  const settle = (slug: RoomSlug) => setPrev((p) => ({ ...p, [slug]: null }));

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  if (live.length === 0) return null;

  const optionOf = (slug: RoomSlug): RoomOption | null => {
    const el = bySlug.get(slug);
    return el?.options.find((o) => o.id === choice[slug]) ?? null;
  };
  // Textures drawn for an element: the one being covered, then the new one.
  const layers = (slug: RoomSlug) => {
    const el = bySlug.get(slug);
    if (!el) return [];
    const out: { option: RoomOption; fresh: boolean }[] = [];
    const before = prev[slug];
    const old = before != null ? el.options.find((o) => o.id === before) : null;
    if (old && old.id !== choice[slug]) out.push({ option: old, fresh: false });
    const now = optionOf(slug);
    if (now) out.push({ option: now, fresh: Boolean(old) });
    return out;
  };

  const current = selected ? bySlug.get(selected) ?? null : null;
  const currentOption = selected ? optionOf(selected) : null;

  const enquireOne =
    current && currentOption && whatsappBase
      ? `${whatsappBase}?text=${encodeURIComponent(
          `Hello, I'd like to know more about "${currentOption.name}" (${current.name.toLowerCase()}) from the interactive room on your website.`,
        )}`
      : null;
  const enquireRoom = whatsappBase
    ? `${whatsappBase}?text=${encodeURIComponent(
        `Hello, I'd like to know more about this room from your website:\n${live
          .map((e) => `${e.name}: ${optionOf(e.slug)?.name ?? ""}`)
          .join("\n")}`,
      )}`
    : null;

  const index = current ? live.indexOf(current) : -1;
  const step = (by: number) => select(live[(index + by + live.length) % live.length].slug);

  // ------------------------------------------------------------ drawing
  const renderSvgElement = (slug: Svg) => {
    const el = bySlug.get(slug);
    const parts = PARTS[slug];
    const outline = parts.join("");
    return (
      <div key={slug} className="pointer-events-none absolute inset-0" data-room={slug}>
        {el ? (
          layers(slug).map(({ option, fresh }) => {
            const t = option.tile;
            const texture = warm ? src(option.textureKey) : null;
            const id = `room-pat-${option.id}`;
            return (
              <svg
                key={option.id}
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                aria-hidden="true"
                className={`room-svg ${fresh ? "room-tex-in" : ""}`}
                data-wipe={fresh ? WIPE[slug] : undefined}
                data-option={option.id}
                onAnimationEnd={(e) => {
                  // A wipe runs two animations; the change ends with the wipe.
                  const last = WIPE[slug] ? e.animationName !== "room-tex-fade" : true;
                  if (fresh && last && e.target === e.currentTarget) settle(slug);
                }}
              >
                <defs>
                  <pattern id={id} patternUnits="userSpaceOnUse" width={t} height={t}>
                    <rect width={t} height={t} fill={option.colour} />
                    {texture && <image href={texture} width={t} height={t} preserveAspectRatio="none" />}
                  </pattern>
                </defs>
                <g fill={`url(#${id})`}>
                  {parts.map((d) => (
                    <path key={d} d={d} />
                  ))}
                </g>
              </svg>
            );
          })
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="room-svg">
            <g fill={PLAIN[slug]}>
              {parts.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
          </svg>
        )}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="room-svg">
          <Shade slug={slug} />
          {el && (
            <>
              <path d={outline} className="room-hit" data-on={selected === slug} onClick={() => select(slug)} />
              <path d={outline} className="room-outline" data-on={selected === slug} />
              {/* Tapping the window glass below the blind picks the curtains. */}
              {slug === "curtains" && <rect x="472" y="336" width="436" height="242" className="room-hit-quiet" onClick={() => select("curtains")} />}
            </>
          )}
        </svg>
      </div>
    );
  };

  const rug = bySlug.get("rug");
  const floorAndRug = (
    <div key="rug" className="room-3d" aria-hidden="true">
      <div className="room-floor" style={FLOOR && warm ? { backgroundImage: `url(${FLOOR})` } : undefined}>
        <div className="room-floor-light" />
        <div
          className="room-rug"
          data-live={rug ? "" : undefined}
          data-on={selected === "rug"}
          onClick={rug ? () => select("rug") : undefined}
        >
          {rug ? (
            layers("rug").map(({ option, fresh }) => {
              const texture = warm ? src(option.textureKey) : null;
              return (
                <div
                  key={option.id}
                  className={`room-rug-img ${fresh ? "room-tex-in" : ""}`}
                  data-option={option.id}
                  style={{ backgroundColor: option.colour, backgroundImage: texture ? `url(${texture})` : undefined }}
                  onAnimationEnd={(e) => {
                    if (fresh && e.target === e.currentTarget) settle("rug");
                  }}
                />
              );
            })
          ) : (
            <div className="room-rug-img" style={{ backgroundColor: PLAIN.rug }} />
          )}
          <div className="room-rug-shade" />
        </div>
      </div>
    </div>
  );

  const swatch = (option: RoomOption | null, slug: RoomSlug, size: string) => {
    if (!option) return null;
    const texture = src(option.textureKey);
    // A rug is shown whole (never cropped); fabrics as a round swatch.
    return slug === "rug" ? (
      <span className={`block overflow-hidden rounded-md ${size}`} style={{ backgroundColor: option.colour }}>
        {texture && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={texture} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
        )}
      </span>
    ) : (
      <span className={`block overflow-hidden rounded-full ${size}`} style={{ backgroundColor: option.colour }}>
        {texture && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={texture} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        )}
      </span>
    );
  };

  return (
    <section ref={section} className="px-3 sm:px-5 lg:px-6" aria-labelledby="room-title">
      <RoomDefs />
      <div className="mx-auto max-w-[108rem] rounded-[2rem] bg-sand lg:rounded-[2.5rem]">
        <div className="shell py-16 sm:py-20 lg:py-24">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <div>
              <p className="section-label" data-reveal>
                Interactive home décor
              </p>
              <h2 id="room-title" className="section-title mt-3" data-words>
                <Words parts={["Try it in", { accent: "a room" }]} />
              </h2>
            </div>
            <p className="max-w-md text-[1.02rem] leading-relaxed text-ink-soft lg:text-right" data-reveal style={{ ["--reveal-delay" as string]: 1 }}>
              Tap the curtains, the sofa or anything else in the room, then pick a fabric to see it change.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:mt-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-7 xl:grid-cols-[minmax(0,1fr)_24rem]">
            {/* The room */}
            <div data-reveal style={{ ["--reveal-delay" as string]: 1 }}>
              <div
                ref={frame}
                className={`room-frame relative aspect-[4/5] scroll-mt-24 overflow-hidden rounded-[1.75rem] bg-stone select-none sm:aspect-[4/3] lg:aspect-[16/10] ${seen ? "room-in" : ""}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onClickCapture={(e) => {
                  if (swallowClick.current) {
                    swallowClick.current = false;
                    e.stopPropagation();
                    e.preventDefault();
                  }
                }}
              >
                <div ref={stage} className="room-stage" data-dragging={dragging ? "" : undefined}>
                  {renderSvgElement("wall")}
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="room-svg">
                    <BackStatic />
                  </svg>
                  {floorAndRug}
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="room-svg">
                    <FloorShadows />
                  </svg>
                  {ORDER.filter((s): s is Svg => s !== "wall" && s !== "rug").map(renderSvgElement)}

                  {/* Tap points */}
                  {live.map((el, i) => {
                    const [x, y] = SPOTS[el.slug];
                    const on = selected === el.slug;
                    return (
                      <button
                        key={el.slug}
                        type="button"
                        onClick={() => select(on ? null : el.slug)}
                        aria-label={`${el.name}: ${optionOf(el.slug)?.name ?? ""}${on ? ", selected" : ""}`}
                        aria-pressed={on}
                        data-spot={el.slug}
                        className="room-spot flex h-11 w-11 items-center justify-center"
                        style={{ left: pct(x, W), top: pct(y, H), ["--i" as string]: i } as CSSProperties}
                      >
                        {!on && <span aria-hidden="true" className="spot-ring absolute h-6 w-6 rounded-full bg-white/70" style={{ animationDelay: `${i * 340}ms` }} />}
                        <span
                          aria-hidden="true"
                          className={`relative flex h-6 w-6 items-center justify-center rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.35)] transition-[transform,background-color] duration-300 ${
                            on ? "scale-125 bg-terracotta" : "bg-white hover:scale-110"
                          }`}
                        >
                          <span className={`block h-2 w-2 rounded-full transition-colors duration-300 ${on ? "bg-white" : "bg-terracotta"}`} />
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p
                  className="room-hint pointer-events-none absolute top-4 left-4 rounded-full bg-ivory/95 px-4 py-2 text-[0.8rem] font-medium text-ink shadow-[0_6px_20px_-10px_rgba(0,0,0,0.4)]"
                  data-gone={touched ? "" : undefined}
                  aria-hidden={touched}
                >
                  Tap anything in the room to change it
                </p>
              </div>
            </div>

            {/* What's picked, and the choices */}
            <div data-reveal style={{ ["--reveal-delay" as string]: 2 }}>
              <p className="sr-only" aria-live="polite">
                {current && currentOption ? `${current.name}: ${currentOption.name}` : ""}
              </p>
              <div className="h-full rounded-[1.75rem] bg-ivory p-6 sm:p-7">
                {current && currentOption ? (
                  <div key={current.slug} className="look-slide-in flex h-full flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {current.categoryName && <p className="section-label">{current.categoryName}</p>}
                        <h3 className="mt-1.5 text-[1.6rem] leading-tight font-medium sm:text-[1.75rem]">{current.name}</h3>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => step(-1)} aria-label="Previous item" className="btn flex h-9 w-9 items-center justify-center rounded-full border border-ink/12 hover:border-ink">
                          <ChevronLeftIcon className="h-4 w-4" />
                        </button>
                        <span className="w-9 text-center text-[0.72rem] font-semibold text-muted tabular-nums">
                          {index + 1}/{live.length}
                        </span>
                        <button type="button" onClick={() => step(1)} aria-label="Next item" className="btn flex h-9 w-9 items-center justify-center rounded-full border border-ink/12 hover:border-ink">
                          <ChevronRightIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {current.description && <p className="mt-2 text-[0.92rem] leading-relaxed text-muted">{current.description}</p>}

                    <p className="mt-5 text-[0.72rem] font-semibold tracking-[0.18em] text-ink-soft uppercase">{pickLabel(current.slug)}</p>
                    <div role="radiogroup" aria-label={pickLabel(current.slug)} className="mt-3 flex flex-wrap gap-x-2 gap-y-3">
                      {current.options.map((o) => {
                        const on = o.id === currentOption.id;
                        return (
                          <button
                            key={o.id}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => pick(current.slug, o.id)}
                            className="group flex w-[4.1rem] flex-col items-center gap-1.5 text-center"
                          >
                            <span
                              className={`block rounded-full p-[3px] transition-[box-shadow,transform] duration-300 group-hover:scale-105 ${
                                on ? "shadow-[0_0_0_2px_var(--color-terracotta)]" : "shadow-[0_0_0_1px_rgba(31,27,23,0.15)]"
                              } ${current.slug === "rug" ? "rounded-lg" : ""}`}
                            >
                              {swatch(o, current.slug, current.slug === "rug" ? "h-10 w-14" : "h-12 w-12")}
                            </span>
                            <span className={`text-[0.72rem] leading-tight ${on ? "font-semibold text-ink" : "text-muted"}`}>{o.name}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div key={currentOption.id} className="look-panel-in mt-5 rounded-2xl bg-sand/70 px-4 py-3.5">
                      <p className="text-[0.98rem] font-medium">{currentOption.name}</p>
                      {currentOption.description && <p className="mt-0.5 text-[0.88rem] leading-relaxed text-muted">{currentOption.description}</p>}
                    </div>

                    <div className="mt-auto flex flex-wrap gap-3 pt-6">
                      {enquireOne && (
                        <a
                          href={enquireOne}
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
                          className="btn inline-flex h-12 items-center gap-2 rounded-full border border-ink/15 px-5 text-[0.85rem] font-medium hover:border-ink hover:bg-ink hover:text-ivory"
                        >
                          View {current.categoryName}
                          <ArrowRightIcon className="btn-arrow h-4 w-4" />
                        </SiteLink>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => select(null)}
                      className="mt-5 inline-flex items-center gap-1.5 self-start text-[0.8rem] font-medium text-muted transition-colors duration-300 hover:text-ink"
                    >
                      <ChevronLeftIcon className="h-3.5 w-3.5" />
                      Back to the whole room
                    </button>
                  </div>
                ) : (
                  <div key="room" className="look-slide-in flex h-full flex-col">
                    <p className="section-label">How it works</p>
                    <ol className="mt-4 space-y-2.5 text-[0.95rem] text-ink-soft">
                      {["Tap anything in the room.", "Pick a fabric, wallpaper or rug.", "Enquire about what you like."].map((t, i) => (
                        <li key={t} className="flex items-center gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sand text-[0.75rem] font-semibold text-terracotta">{i + 1}</span>
                          {t}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-7 text-[0.72rem] font-semibold tracking-[0.18em] text-ink-soft uppercase">In this room</p>
                    <ul className="mt-2 divide-y divide-ink/8">
                      {live.map((el) => {
                        const o = optionOf(el.slug);
                        return (
                          <li key={el.slug}>
                            <button
                              type="button"
                              onClick={() => select(el.slug)}
                              data-room-item={el.slug}
                              className="group flex w-full items-center gap-3 py-2.5 text-left"
                            >
                              {swatch(o, el.slug, el.slug === "rug" ? "h-7 w-10" : "h-8 w-8")}
                              <span className="min-w-0 flex-1">
                                <span className="block text-[0.9rem] font-medium">{el.name}</span>
                                <span key={o?.id} className="look-panel-in block truncate text-[0.8rem] text-muted">{o?.name}</span>
                              </span>
                              <ChevronRightIcon className="h-4 w-4 text-muted transition-transform duration-300 group-hover:translate-x-1 group-hover:text-ink" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {enquireRoom && (
                      <div className="mt-auto pt-6">
                        <a
                          href={enquireRoom}
                          target="_blank"
                          rel="noopener"
                          className="btn inline-flex h-12 items-center gap-2 rounded-full bg-terracotta px-6 text-[0.85rem] font-medium text-white hover:bg-terracotta-dark"
                        >
                          <WhatsAppIcon className="h-4 w-4" />
                          Enquire about this room
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
