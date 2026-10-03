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
  | 'chevron-down'
  | 'sun'
  | 'moon'
  | 'trend'
  | 'utensils'
  | 'pie'
  | 'cube'
  | 'wheat'
  | 'calendar'
  | 'eye';

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
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />,
  trend: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  utensils: <path d="M6 3v6a2 2 0 004 0V3M8 3v18M17 21V3c-2.6 1.4-3.6 4-3.6 7v3H17" />,
  pie: <path d="M12 3a9 9 0 109 9h-9zM14.5 3.4A9 9 0 0120.6 9.5H14.5z" />,
  cube: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9" />,
  wheat: (
    <path d="M12 21V8M12 8c-2.4 0-3.8-1.6-3.8-3.8 2.4 0 3.8 1.6 3.8 3.8zM12 8c2.4 0 3.8-1.6 3.8-3.8-2.4 0-3.8 1.6-3.8 3.8zM12 13c-2.4 0-3.8-1.6-3.8-3.8 2.4 0 3.8 1.6 3.8 3.8zM12 13c2.4 0 3.8-1.6 3.8-3.8-2.4 0-3.8 1.6-3.8 3.8zM12 18c-2.4 0-3.8-1.6-3.8-3.8 2.4 0 3.8 1.6 3.8 3.8zM12 18c2.4 0 3.8-1.6 3.8-3.8-2.4 0-3.8 1.6-3.8 3.8z" />
  ),
  calendar: (
    <path d="M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM4 10h16M8 3v4M16 3v4" />
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
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
