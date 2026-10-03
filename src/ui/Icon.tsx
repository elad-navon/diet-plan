import { type ReactNode } from 'react';

export type IconName =
  | 'plus'
  | 'minus'
  | 'check'
  | 'clock'
  | 'arrow-up'
  | 'alert'
  | 'pencil'
  | 'trash'
  | 'repeat'
  | 'close'
  | 'search'
  | 'home'
  | 'chart'
  | 'settings'
  | 'star'
  | 'chevron-down';

const PATHS: Record<IconName, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  'arrow-up': <path d="M12 19V6M6 11l6-6 6 6" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5M12 16.2v.3" />
    </>
  ),
  pencil: <path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM14 7l3 3" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5" />,
  repeat: <path d="M17 4l3 3-3 3M20 7H8a4 4 0 00-4 4M7 20l-3-3 3-3M4 17h12a4 4 0 004-4" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  home: <path d="M4 11l8-7 8 7M6 10v9h4v-5h4v5h4v-9" />,
  chart: <path d="M4 19V5M4 19h16M8 15l4-5 3 3 4-6" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </>
  ),
  star: <path d="M12 4l2.4 5 5.4.7-4 3.7 1 5.4L12 16.2 7.2 18.8l1-5.4-4-3.7 5.4-.7L12 4z" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
};

/** A decorative 24px icon. The control that contains it carries the accessible name. */
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
