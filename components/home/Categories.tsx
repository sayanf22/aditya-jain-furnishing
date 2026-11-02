// Plain <a> links here (not next/link): these pages are pre-rendered HTML,
// so a normal page load is fast, and it keeps the client-side JavaScript
// that has to start up on a phone smaller.
//
// Section 02 · Main categories, in the agreed order. On desktop, hovering a
// card widens it, then its subcategories rise in one by one (see
// "Category cards" in globals.css). Each card has one name, one list and
// one button, so nothing is ever drawn twice on top of itself. On phones
// and tablets the cards sit in a swipe row with the subcategories shown.
import type { CSSProperties } from "react";
import type { Category } from "@/lib/content";
import { imageSource } from "@/lib/media";
import { ArrowRightIcon } from "../icons";
import { Words } from "../Words";

export function Categories({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;
  return (
    <section className="bg-ivory py-20 sm:py-28 lg:py-32" aria-labelledby="categories-title">
      <div className="shell">
        <div className="text-center">
          <h2 id="categories-title" className="section-title" data-words>
            <Words parts={["Browse", { accent: "by category" }]} />
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[0.98rem] leading-relaxed text-muted" data-reveal style={{ ["--reveal-delay" as string]: 2 }}>
            Five collections, from upholstery fabric to wallpaper.
          </p>
        </div>

        {/* Desktop: the gaps are padding inside each item, so the pointer is
            always over a card and the row never flickers between states. */}
        <div className="cat-row no-scrollbar -mx-5 mt-12 sm:mt-14 lg:mt-16 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pt-2 pb-4 sm:-mx-8 sm:scroll-px-8 sm:px-8 lg:-mx-2.5 lg:snap-none lg:gap-0 lg:overflow-visible lg:px-0">
          {categories.map((cat, i) => (
            <CategoryCard key={cat.id} category={cat} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoryCard({ category, index }: { category: Category; index: number }) {
  const source = imageSource(category.imageKey);
  const href = `/collection/${category.slug}`;
  const subs =
    category.slug === "carpets-mats"
      ? [...category.subcategories, { id: -1, slug: "all", name: "Direct collections" }]
      : category.subcategories;

  return (
    <div className="cat-item w-[78vw] max-w-[20rem] shrink-0 snap-start sm:w-[18rem] lg:w-auto lg:max-w-none lg:px-2.5">
      <article
        className="cat-card relative isolate h-[26rem] overflow-hidden rounded-[1.4rem] bg-stone shadow-[0_18px_40px_-30px_rgba(31,27,23,0.5)] lg:h-[30rem] xl:h-[32rem]"
        data-reveal
        style={{ ["--reveal-delay" as string]: index }}
      >
        {source && (
          // The photo keeps one width (wider than an open card) and stays
          // centred, so widening the card reveals more of it instead of
          // resizing it on every frame.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={source.src}
            srcSet={source.srcSet}
            sizes="(min-width: 1024px) 34rem, 80vw"
            width={source.width}
            height={source.height}
            alt=""
            loading="lazy"
            decoding="async"
            className="cat-img absolute inset-y-0 left-1/2 -z-10 h-full w-full max-w-none object-cover lg:w-[34rem]"
          />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(20,16,12,0.8)_0%,rgba(20,16,12,0.32)_42%,rgba(20,16,12,0)_70%)]"
        />
        {/* Deeper shade behind the subcategories, fades in on hover. */}
        <div
          aria-hidden="true"
          className="cat-shade absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(20,16,12,0.55)_0%,rgba(20,16,12,0.25)_45%,rgba(20,16,12,0)_75%)]"
        />

        {/* Not positioned, so the name's link overlay covers the whole card. */}
        <div className="flex h-full flex-col items-start justify-end p-5 text-white sm:p-6 lg:p-5 xl:p-6">
          {/* Fixed width on desktop: the name wraps the same way whether the
              card is narrow or open, so it never jumps mid-animation. */}
          <h3 className="text-[1.25rem] leading-tight font-medium lg:max-w-[6.75rem] lg:text-[1.125rem] xl:max-w-[7.75rem] xl:text-[1.25rem]">
            <a href={href} className="after:absolute after:inset-0 after:content-['']">
              {category.name}
            </a>
          </h3>
          {subs.length > 0 && (
            <div className="cat-subs">
              <ul className="relative -mx-1.5 -mb-1.5 flex flex-wrap gap-2 px-1.5 pt-3 pb-1.5">
                {subs.map((s, i) => (
                  <li key={s.id} className="cat-chip" style={{ "--i": i } as CSSProperties}>
                    <a
                      href={`${href}/${s.slug}`}
                      className="block rounded-full border border-white/45 bg-black/20 px-3 py-1 text-[0.76rem] whitespace-nowrap transition-colors duration-300 hover:border-white hover:bg-white hover:text-ink"
                    >
                      {s.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <span className="btn pointer-events-none mt-4 inline-flex items-center gap-2 rounded-lg bg-ivory px-3.5 py-2 text-[0.7rem] font-semibold tracking-[0.12em] text-ink uppercase">
            Explore
            <ArrowRightIcon className="btn-arrow h-3.5 w-3.5" />
          </span>
        </div>
      </article>
    </div>
  );
}
