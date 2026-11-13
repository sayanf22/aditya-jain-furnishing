// Page header with a full-width photo (About Us, Contact). The site header
// sits transparent on top of it (lib/nav.ts PHOTO_HEADER_PAGES).
//
// Motion, all transform and opacity, so the browser's compositor runs it
// and the page never stutters:
//   - on load the photo settles from a slight zoom and the text rises in
//     (CSS only, no wait for JavaScript);
//   - while scrolling, the photo drifts down a little slower than the page
//     and the text fades up and away. These are CSS scroll-driven
//     animations (Baseline in Chrome, Safari and Firefox); browsers without
//     them keep a still photo.
// No client JavaScript.
import type { ReactNode } from "react";
import { imageSource } from "@/lib/media";
import { Words, type WordPart } from "./Words";

type Props = {
  id: string;
  label: string;
  title: WordPart[];
  intro?: string;
  image: string | null;
  alt: string;
  /** "tall" for About Us, "short" for Contact. */
  size?: "tall" | "short";
  children?: ReactNode;
};

export function PageHero({ id, label, title, intro, image, alt, size = "tall", children }: Props) {
  const source = imageSource(image);
  const words = title.reduce((n, p) => n + (typeof p === "string" ? p : p.accent).split(/\s+/).length, 0);
  return (
    <section
      aria-labelledby={id}
      className={`page-hero relative isolate flex items-end overflow-hidden rounded-b-[2rem] bg-ink text-white sm:rounded-b-[2.5rem] lg:rounded-b-[3rem] ${
        size === "tall" ? "h-[80svh] min-h-[32rem] max-h-[56rem]" : "h-[62svh] min-h-[28rem] max-h-[44rem]"
      }`}
    >
      {source && (
        <div aria-hidden="true" className="page-hero-media absolute inset-0 -z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={source.src}
            srcSet={source.srcSet}
            sizes="100vw"
            width={source.width}
            height={source.height}
            alt={alt}
            fetchPriority="high"
            decoding="sync"
            className="page-hero-img h-full w-full object-cover"
          />
        </div>
      )}
      {/* Darker at the top (for the header) and the lower left (for the text). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(20,16,12,0.74)_0%,rgba(20,16,12,0.3)_45%,rgba(20,16,12,0.1)_70%,rgba(20,16,12,0.45)_100%)]"
      />

      <div className="page-hero-text shell pb-14 sm:pb-20 lg:pb-24">
        <div className="max-w-3xl">
          <p className="hero-rise text-[0.72rem] font-semibold tracking-[0.24em] text-white/85 uppercase sm:text-[0.78rem]" style={{ ["--rise-delay" as string]: 0 }}>
            {label}
          </p>
          <h1 id={id} className="on-photo mt-4 text-[2.4rem] leading-[1.06] font-medium tracking-[-0.01em] text-balance sm:text-[3.4rem] lg:text-[4.2rem]">
            <Words parts={title} delay={1} mode="auto" />
          </h1>
          {intro && (
            <p className="hero-rise mt-5 max-w-xl text-[1.02rem] leading-relaxed text-balance text-white/85 sm:text-[1.1rem]" style={{ ["--rise-delay" as string]: words + 2 }}>
              {intro}
            </p>
          )}
          {children && (
            <div className="hero-rise mt-8" style={{ ["--rise-delay" as string]: words + 4 }}>
              {children}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
