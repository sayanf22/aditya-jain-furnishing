// Splits text into words that rise into place one after another.
//   mode "scroll": plays when the element scrolls into view (the heading
//                  needs data-words, handled by RevealObserver)
//   mode "auto":   plays as soon as it mounts (hero headline, replays on
//                  every slide because the hero remounts it)
// Each word is masked, so it slides up from behind its own baseline.
import type { CSSProperties } from "react";

export type WordPart = string | { accent: string };

type Props = {
  parts: WordPart[];
  /** Words to wait before the first one starts (to follow other text). */
  delay?: number;
  mode?: "scroll" | "auto";
};

export function Words({ parts, delay = 0, mode = "scroll" }: Props) {
  let index = delay;
  const nodes: React.ReactNode[] = [];
  parts.forEach((part, p) => {
    const text = typeof part === "string" ? part : part.accent;
    const words = text.split(/\s+/).filter(Boolean);
    const rendered = words.map((word, w) => {
      const i = index++;
      return (
        <span key={`${p}-${w}`}>
          <span className="word">
            <span className={mode === "auto" ? "word-in word-auto" : "word-in"} style={{ "--w": i } as CSSProperties}>
              {word}
            </span>
          </span>
          {w < words.length - 1 ? " " : null}
        </span>
      );
    });
    nodes.push(
      typeof part === "string" ? (
        <span key={p}>{rendered}</span>
      ) : (
        <span key={p} className="text-terracotta">
          {rendered}
        </span>
      ),
    );
    if (p < parts.length - 1) nodes.push(" ");
  });
  return <>{nodes}</>;
}
