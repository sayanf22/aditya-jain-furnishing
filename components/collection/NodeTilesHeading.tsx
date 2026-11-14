// Small label and section title used above the tiles on Collection pages.
import { Words, type WordPart } from "../Words";

export function NodeTilesHeading({ id, label, parts }: { id: string; label: string; parts: WordPart[] }) {
  return (
    <div>
      <p className="section-label" data-reveal>
        {label}
      </p>
      <h2 id={id} className="section-title mt-3" data-words>
        <Words parts={parts} />
      </h2>
    </div>
  );
}
