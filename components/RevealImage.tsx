// Photo that is uncovered when it scrolls into view: a panel in the page
// colour slides away upwards while the photo settles from a gentle zoom.
// While the page scrolls, the photo also drifts slowly inside its frame
// (CSS scroll-driven animation, where supported). See ".img-reveal" in
// globals.css. Transform and opacity only; no client JavaScript.
import type { CSSProperties } from "react";
import { imageSource } from "@/lib/media";

type Props = {
  image: string | null;
  alt: string;
  sizes: string;
  /** Frame shape and corners, e.g. "aspect-[4/5] rounded-[1.75rem]". */
  className?: string;
  delay?: number;
  /** Colour of the uncovering panel: the background behind the photo. */
  cover?: string;
  eager?: boolean;
};

export function RevealImage({ image, alt, sizes, className = "", delay = 0, cover, eager = false }: Props) {
  const source = imageSource(image);
  return (
    <div
      // No background colour on the frame: it would show as a thin line
      // around the rounded corners while the cover panel slides away.
      className={`img-reveal relative overflow-hidden ${className}`}
      data-reveal
      style={{ ["--reveal-delay" as string]: delay, ...(cover ? { ["--cover" as string]: cover } : {}) } as CSSProperties}
    >
      {source && (
        <div className="img-parallax absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={source.src}
            srcSet={source.srcSet}
            sizes={sizes}
            width={source.width}
            height={source.height}
            alt={alt}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className="img-reveal-inner h-full w-full object-cover"
          />
        </div>
      )}
    </div>
  );
}
