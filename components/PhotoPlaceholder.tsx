// Tidy neutral stand-in for a place with no photo (a design, a type or a
// collection card). Pure markup, no image file.
export function PhotoPlaceholder({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`absolute inset-0 flex items-center justify-center bg-stone text-ink/25 ${className}`}>
      <svg viewBox="0 0 24 24" className="h-1/4 max-h-10 min-h-5 w-auto" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m4.5 17.5 4.7-4.7a1.5 1.5 0 0 1 2.1 0l2.2 2.2 1.5-1.5a1.5 1.5 0 0 1 2.1 0l2.4 2.4" />
      </svg>
    </span>
  );
}
