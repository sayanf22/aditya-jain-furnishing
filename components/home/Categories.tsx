// Section 02 · Main categories, in the agreed order. On desktop, hovering a
// card widens it and reveals its subcategories (Furnish & Shades-inspired).
// On phones and tablets the cards sit in a swipe row with the
// subcategories always shown.
import type { Category } from "@/lib/content";
import { imageSource } from "@/lib/media";
import { ArrowRightIcon } from "../icons";
import { SiteLink } from "../SiteLink";

export function Categories({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;
  return (
    <section className="bg-ivory py-20 sm:py-24" aria-labelledby="categories-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="text-center" data-reveal>
          <h2 id="categories-title" className="section-title">
            Browse <span className="text-terracotta">by category</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[0.98rem] leading-relaxed text-muted">
            Five collections, from upholstery fabric to wallpaper.
          </p>
        </div>

        <div className="cat-row no-scrollbar -mx-5 mt-12 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 sm:scroll-px-8 pb-2 sm:-mx-8 sm:px-8 lg:mx-0 lg:h-[30rem] lg:snap-none lg:overflow-visible lg:px-0 lg:pb-0">
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
    <article
      className="cat-card group relative isolate h-[26rem] w-[78vw] max-w-[20rem] shrink-0 snap-start overflow-hidden rounded-2xl bg-stone sm:w-[19rem] lg:h-auto lg:w-auto lg:max-w-none lg:shrink"
      data-reveal
      style={{ ["--reveal-delay" as string]: index }}
    >
      {source && (
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
          className="cat-img absolute top-0 left-1/2 -z-10 h-full w-full max-w-none object-cover lg:w-[34rem]"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(20,16,12,0.82)_0%,rgba(20,16,12,0.35)_45%,rgba(20,16,12,0)_75%)]"
      />
      <div className="flex h-full flex-col justify-end p-5 text-white sm:p-6">
        <h3 className="text-[1.3rem] leading-tight font-medium">
          <SiteLink href={href} className="after:absolute after:inset-0 after:content-['']">
            {category.name}
          </SiteLink>
        </h3>
        {subs.length > 0 && (
          <div className="cat-reveal-wrap">
            <ul className="cat-reveal relative flex min-h-0 flex-wrap gap-2 overflow-hidden pt-3">
              {subs.map((s) => (
                <li key={s.id}>
                  <SiteLink
                    href={`${href}/${s.slug}`}
                    className="block rounded-full border border-white/40 bg-black/25 px-3 py-1 text-[0.78rem] whitespace-nowrap transition-colors hover:bg-white hover:text-ink"
                  >
                    {s.name}
                  </SiteLink>
                </li>
              ))}
            </ul>
          </div>
        )}
        <span className="btn mt-4 inline-flex w-fit items-center gap-2 rounded-md bg-ivory px-3.5 py-2 text-[0.72rem] font-semibold tracking-[0.12em] text-ink uppercase">
          Explore
          <ArrowRightIcon className="btn-arrow h-3.5 w-3.5" />
        </span>
      </div>
    </article>
  );
}
