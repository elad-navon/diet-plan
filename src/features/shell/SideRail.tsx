import { NavLink } from 'react-router';
import avatarUrl from '../../assets/avatar.jpg';
import { applyTheme } from '../../app/theme';
import { useThemeMode } from '../../app/use-theme';
import { he } from '../../i18n/he';
import { Icon, type IconName } from '../../ui/Icon';

export const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/today', label: he.nav.today, icon: 'home' },
  { to: '/progress', label: he.nav.progress, icon: 'chart' },
  { to: '/settings', label: he.nav.settings, icon: 'settings' },
];

const MODES: { value: 'light' | 'dark'; label: string; icon: IconName }[] = [
  { value: 'light', label: he.nav.themeLight, icon: 'sun' },
  { value: 'dark', label: he.nav.themeDark, icon: 'moon' },
];

/** Light or dark, with both choices always visible: the one in use is filled, so there is nothing to guess. */
function ThemeToggle() {
  const mode = useThemeMode();
  return (
    <div
      role="group"
      aria-label={he.nav.themeLabel}
      className="flex w-16 flex-col items-center gap-1"
    >
      <span aria-hidden="true" className="text-xs font-medium text-muted">
        {he.nav.themeLabel}
      </span>
      <div className="flex w-full flex-col gap-1 rounded-2xl bg-[var(--tile-bg)] p-1 ring-1 ring-inset ring-faint">
        {MODES.map((option) => {
          const active = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => applyTheme(option.value)}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-xs transition ${
                active
                  ? '[background:var(--toggle-on-bg)] font-bold text-[var(--toggle-on-ink)] shadow-[var(--toggle-on-glow)]'
                  : 'text-muted hover:bg-faint/70'
              }`}
            >
              <Icon name={option.icon} size={20} />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The side bar of the computer layout: my picture on top, the three screens, and the light/dark switch at the bottom. */
export function SideRail() {
  return (
    <aside className="hidden w-20 shrink-0 flex-col items-center gap-3 border-e border-[var(--rail-border)] bg-[var(--rail-bg)] py-4 backdrop-blur-xl lg:flex">
      <img
        src={avatarUrl}
        alt={he.nav.avatarAlt}
        width={48}
        height={48}
        className="size-12 rounded-full object-cover ring-2 ring-[var(--ring-via)]/70 shadow-[0_0_20px_-4px_var(--ring-glow)]"
      />
      <nav aria-label={he.nav.label} className="mt-2">
        <ul className="flex flex-col gap-1">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  `flex min-h-14 w-16 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs transition ${
                    isActive
                      ? '[background:var(--nav-on-bg)] font-bold text-[var(--nav-on-ink)] shadow-[var(--nav-on-glow)]'
                      : 'text-muted hover:bg-faint/70'
                  }`
                }
              >
                <Icon name={tab.icon} />
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </aside>
  );
}
