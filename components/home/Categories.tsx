// Plain <a> links here (not next/link): these pages are pre-rendered HTML,
// so a normal page load is fast, and it keeps the client-side JavaScript
// that has to start up on a phone smaller.
//
// Section 02 · Main categories, in the agreed order. On desktop, hovering a
// card lifts it, zooms the photo and reveals its subcategories (Furnish &
// Shades-inspired). On phones and tablets the cards sit in a swipe row with
// the subcategories always shown. Only opacity and transform animate.
import type { Category } from "@/lib/content";
import { imageSource } from "@/lib/media";
import { ArrowRightIcon } from "../icons";
import { Words } from "../Words";

export function Categories({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;
  return (
    <section className="bg-ivory py-20 sm:py-24" aria-labelledby="categories-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="text-center">
          <h2 id="categories-title" className="section-title" data-words>
            <Words parts={["Browse", { accent: "by category" }]} />
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[0.98rem] leading-relaxed text-muted" data-reveal style={{ ["--reveal-delay" as string]: 2 }}>
            Five collections, from upholstery fabric to wallpaper.
          </p>
        </div>

        <div className="no-scrollbar -mx-5 mt-12 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pt-2 pb-4 sm:-mx-8 sm:scroll-px-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-5 lg:overflow-visible lg:px-0">
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
    <div className="w-[78vw] max-w-[20rem] shrink-0 snap-start sm:w-[18rem] lg:w-auto lg:max-w-none" data-reveal style={{ ["--reveal-delay" as string]: index }}>
      <article className="cat-card group relative isolate h-[26rem] overflow-hidden rounded-[1.4rem] bg-stone shadow-[0_18px_40px_-30px_rgba(31,27,23,0.5)] lg:h-[29rem]">
        {source && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={source.src}
            srcSet={source.srcSet}
            sizes="(min-width: 1024px) 20vw, 80vw"
            width={source.width}
            height={source.height}
            alt=""
            loading="lazy"
            decoding="async"
            className="cat-img absolute inset-0 -z-10 h-full w-full object-cover"
          />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(20,16,12,0.78)_0%,rgba(20,16,12,0.3)_40%,rgba(20,16,12,0)_70%)]"
        />
        {/* Darker shade behind the subcategory panel (fades in on hover). */}
        <div
          aria-hidden="true"
          className="cat-panel-shade absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(20,16,12,0.9)_0%,rgba(20,16,12,0.55)_48%,rgba(20,16,12,0.1)_85%)]"
        />

        {/* Resting state on desktop: name and button. */}
        <div className="cat-base absolute inset-x-0 bottom-0 p-5 text-white sm:p-6" aria-hidden="true">
          <p className="text-[1.25rem] leading-tight font-medium">{category.name}</p>
          <span className="mt-4 inline-flex items-center gap-2 rounded-lg bg-ivory px-3.5 py-2 text-[0.7rem] font-semibold tracking-[0.12em] text-ink uppercase">
            Explore
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </span>
        </div>

        {/* Hover (desktop) / always (touch): name, subcategories, button. */}
        <div className="cat-panel absolute inset-x-0 bottom-0 p-5 text-white sm:p-6">
          <h3 className="text-[1.25rem] leading-tight font-medium">
            <a href={href} className="after:absolute after:inset-0 after:content-['']">
              {category.name}
            </a>
          </h3>
          {subs.length > 0 && (
            <ul className="relative mt-3 flex flex-wrap gap-2">
              {subs.map((s) => (
                <li key={s.id}>
                  <a
                    href={`${href}/${s.slug}`}
                    className="block rounded-full border border-white/45 bg-black/20 px-3 py-1 text-[0.76rem] whitespace-nowrap transition-colors duration-300 hover:border-white hover:bg-white hover:text-ink"
                  >
                    {s.name}
                  </a>
                </li>
              ))}
            </ul>
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
