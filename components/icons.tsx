// Inline SVG icons, all in one line style (1.6 px stroke, rounded ends) so
// they match each other and take the surrounding text colour. No icon
// library, nothing extra to download.
type IconProps = { className?: string };

function Line({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** WhatsApp, drawn in the same line style as the other icons. */
export function WhatsAppIcon({ className }: IconProps) {
  return (
    <Line className={className}>
      <path d="M4.2 19.8l1.1-3.6A8.3 8.3 0 1 1 8 19.1l-3.8.7Z" />
      <path d="M9.1 8.4c.2-.4.4-.5.7-.5h.5c.2 0 .4.1.5.3l.7 1.6c.1.3 0 .5-.1.7l-.5.6c.6 1.1 1.4 1.9 2.5 2.5l.6-.5c.2-.2.5-.2.7-.1l1.6.7c.2.1.3.3.3.5v.5c0 .3-.2.5-.5.7-.6.3-1.3.4-2 .2a7.3 7.3 0 0 1-5.1-5.1c-.2-.7-.1-1.4.1-2Z" />
    </Line>
  );
}

export function PhoneIcon({ className }: IconProps) {
  return (
    <Line className={className}>
      <path d="M5.4 3.8h2.7c.4 0 .8.3.9.7l.8 3.4c.1.4 0 .8-.3 1L8 10.3a12.4 12.4 0 0 0 5.7 5.7l1.4-1.5c.3-.3.7-.4 1-.3l3.4.8c.4.1.7.5.7.9v2.7c0 .6-.5 1.1-1.1 1.1A15.6 15.6 0 0 1 4.3 4.9c0-.6.5-1.1 1.1-1.1Z" />
    </Line>
  );
}

export function InstagramIcon({ className }: IconProps) {
  return (
    <Line className={className}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="17.2" cy="6.8" r="0.5" fill="currentColor" />
    </Line>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <Line className={className}>
      <path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" />
    </Line>
  );
}

export function ArrowUpRightIcon({ className }: IconProps) {
  return (
    <Line className={className}>
      <path d="M7 17 17 7M8.5 7H17v8.5" />
    </Line>
  );
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <Line className={className}>
      <path d="m14.5 6-6 6 6 6" />
    </Line>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <Line className={className}>
      <path d="m9.5 6 6 6-6 6" />
    </Line>
  );
}

export function MapPinIcon({ className }: IconProps) {
  return (
    <Line className={className}>
      <path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </Line>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <Line className={className}>
      <path d="M4 7.5h16M4 12h16M4 16.5h16" />
    </Line>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <Line className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Line>
  );
}

export function QuoteIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M9.5 6C6.5 7.2 4.5 9.9 4.5 13.4V18h5.6v-5.6H7.4c.1-1.9 1.3-3.4 3.1-4.2L9.5 6Zm9 0c-3 1.2-5 3.9-5 7.4V18h5.6v-5.6h-2.7c.1-1.9 1.3-3.4 3.1-4.2L18.5 6Z" />
    </svg>
  );
}

/** Shopping-bag outline for the "Choose a product" panel. */
export function BagIcon({ className }: IconProps) {
  return (
    <Line className={className}>
      <path d="M5.5 8h13l-1 11.2a1.5 1.5 0 0 1-1.5 1.3H8a1.5 1.5 0 0 1-1.5-1.3L5.5 8Z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </Line>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Line className={className}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Line>
  );
}

export function SendIcon({ className }: IconProps) {
  return (
    <Line className={className}>
      <path d="M20.5 3.5 10 14M20.5 3.5l-6.5 17-4-6.5-6.5-4 17-6.5Z" />
    </Line>
  );
}

export function PauseIcon({ className }: IconProps) {
  return (
    <Line className={className}>
      <path d="M9 6v12M15 6v12" />
    </Line>
  );
}

export function PlayIcon({ className }: IconProps) {
  return (
    <Line className={className}>
      <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />
    </Line>
  );
}
