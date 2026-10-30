// Terracotta ribbon under the hero with the category names scrolling past
// (CSS only). Pauses on hover; static for reduced motion.
type Props = { items: string[] };

export function Marquee({ items }: Props) {
  if (items.length === 0) return null;
  // Two copies side by side; the track moves by half its width and loops.
  const row = [...items, ...items];
  return (
    <div className="marquee overflow-hidden bg-terracotta py-4 text-white" aria-label={items.join(", ")}>
      <div className="marquee-track flex w-max" aria-hidden="true">
        {[0, 1].map((copy) => (
          <ul key={copy} className="flex shrink-0 items-center">
            {row.map((item, i) => (
              <li key={`${copy}-${i}`} className="flex items-center text-[0.82rem] font-medium tracking-[0.12em] whitespace-nowrap uppercase">
                <span className="px-7">{item}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
