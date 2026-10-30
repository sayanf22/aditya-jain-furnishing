// Section 05 · Customer testimonials, placed right after Watch & Buy.
// Shows only reviews added in the dashboard; hidden when there are none.
import type { Testimonial } from "@/lib/content";
import { QuoteIcon } from "../icons";

export function Testimonials({ items }: { items: Testimonial[] }) {
  if (items.length === 0) return null;
  return (
    <section className="border-t border-ink/8 bg-ivory py-20 sm:py-24" aria-labelledby="testimonials-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <h2 id="testimonials-title" className="section-title text-center" data-reveal>
          What our <span className="text-terracotta">customers say</span>
        </h2>
        <ul className="no-scrollbar -mx-5 mt-12 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 sm:scroll-px-8 pb-2 sm:-mx-8 sm:px-8 md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0">
          {items.map((t, i) => (
            <li
              key={t.id}
              className="flex w-[82vw] max-w-[22rem] shrink-0 snap-start flex-col rounded-2xl bg-white p-7 shadow-[0_1px_0_rgba(31,27,23,0.06),0_18px_40px_-28px_rgba(31,27,23,0.35)] md:w-auto md:max-w-none"
              data-reveal
              style={{ ["--reveal-delay" as string]: i }}
            >
              <QuoteIcon className="h-8 w-8 text-terracotta/80" />
              <blockquote className="mt-4 flex-1 text-[1.02rem] leading-relaxed text-ink-soft">{t.text}</blockquote>
              <p className="mt-6 text-[0.85rem] font-semibold tracking-[0.08em] uppercase">{t.name}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
