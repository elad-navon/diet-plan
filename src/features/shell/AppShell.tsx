import { NavLink, Outlet } from 'react-router';
import { he } from '../../i18n/he';
import { Icon, type IconName } from '../../ui/Icon';

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/today', label: he.nav.today, icon: 'home' },
  { to: '/progress', label: he.nav.progress, icon: 'chart' },
  { to: '/settings', label: he.nav.settings, icon: 'settings' },
];

/** Page frame: content area plus the bottom navigation (always reachable with the thumb). */
export function AppShell() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        דלג לתוכן
      </a>
      <main id="main" className="flex-1 px-4 pb-28 pt-4">
        <Outlet />
      </main>
      <nav
        aria-label={he.nav.label}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-faint bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-xl">
          {TABS.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-0.5 text-sm ${
                    isActive ? 'font-bold text-accent' : 'text-muted'
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
    </div>
  );
}
