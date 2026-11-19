// Line icons for the dashboard (24px grid, 1.7 stroke). Decorative: they sit
// next to text or inside buttons that carry an aria-label.
import type { ReactNode } from "react";

type IconProps = { className?: string };

function Icon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconOverview = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </Icon>
);
export const IconCollections = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4v8.5a2.5 2.5 0 0 0 2.5 2.5H12" />
    <path d="M5 8.5h7" />
    <rect x="12" y="6" width="8" height="5" rx="1.4" />
    <rect x="12" y="13" width="8" height="5" rx="1.4" />
    <rect x="3" y="3" width="4" height="3" rx="1" />
  </Icon>
);
export const IconDesigns = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 11.5V9a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v2.5" />
    <path d="M3 11.5a2 2 0 0 1 2 2V16h14v-2.5a2 2 0 1 1 2 2.2V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2.3a2.2 2.2 0 0 1 0-4.2Z" />
    <path d="M6 19v1.5M18 19v1.5" />
  </Icon>
);
export const IconPhotos = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4 17 4.5-4.5a1.5 1.5 0 0 1 2.1 0L15 17l2-2a1.5 1.5 0 0 1 2.1 0L20.5 16.5" />
  </Icon>
);
export const IconSite = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
    <path d="M3.5 9h17M9 9v11" />
  </Icon>
);
export const IconEnquiries = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V17h0A2.5 2.5 0 0 1 4 14.5Z" />
    <path d="M8.5 9h7M8.5 12h4" />
  </Icon>
);
export const IconSecurity = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6Z" />
    <path d="m9 12 2.2 2.2L15.2 10" />
  </Icon>
);
export const IconMore = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5.5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="18.5" cy="12" r="1.4" />
  </Icon>
);
export const IconUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 14 6-6 6 6" />
  </Icon>
);
export const IconDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 10 6 6 6-6" />
  </Icon>
);
export const IconLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="m14 6-6 6 6 6" />
  </Icon>
);
export const IconRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="m10 6 6 6-6 6" />
  </Icon>
);
export const IconChevron = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);
export const IconEye = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Icon>
);
export const IconEyeOff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.9 5.7A9.5 9.5 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.7 3.5M6.2 7.2A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4-.9" />
    <path d="M9.9 9.9a2.8 2.8 0 0 0 4 4M3.5 3.5l17 17" />
  </Icon>
);
export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const IconEdit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17Z" />
    <path d="m14 7 3 3" />
  </Icon>
);
export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    <path d="M10 11v5M14 11v5" />
  </Icon>
);
export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);
export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
export const IconUpload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 16V4.5M7 9l5-5 5 5M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
  </Icon>
);
export const IconReplace = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9h13l-3.5-3.5M20 15H7l3.5 3.5" />
  </Icon>
);
export const IconPhone = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4h3.5l1.7 4.2-2.2 1.4a11 11 0 0 0 6.4 6.4l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z" />
  </Icon>
);
export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Icon>
);
export const IconExternal = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  </Icon>
);
export const IconCopy = (p: IconProps) => (
  <Icon {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </Icon>
);
export const IconLogout = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10M15 8l4 4-4 4M19 12H9.5" />
  </Icon>
);
export const IconPublish = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 16.5V5M7.5 9.5 12 5l4.5 4.5M5 19h14" />
  </Icon>
);
export const IconDevice = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="11" rx="2" />
    <path d="M8 19.5h8M12 16v3.5" />
  </Icon>
);
export const IconQuote = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 17.5c-1.3-1-2-2.5-2-4.7C4 9.700 5.800 7.200 9 6.500M14 17.500c-1.300-1-2-2.500-2-4.700 0-3.100 1.800-5.600 5-6.300" />
  </Icon>
);
