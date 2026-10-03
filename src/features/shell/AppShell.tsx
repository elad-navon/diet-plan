import { NavLink, Outlet, useMatch } from 'react-router';
import { useOnline, usePwaUpdate } from '../../app/pwa';
import { useServices } from '../../app/services';
import { he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { ArtSprite } from '../../ui/art/ArtSprite';
import { SideRail, TABS } from './SideRail';

/**
 * Page frame. On a phone: the content and a bottom navigation (always reachable with the thumb). On a computer
 * (`lg:` and up): a side bar on the right and a content area that fills the rest of the window.
 */
export function AppShell() {
  const { updateReady, applyUpdate } = usePwaUpdate();
  const online = useOnline();
  const { account, persistent } = useServices();
  // The day screen fills the whole window on a computer; the other screens stay in a readable column.
  const fullWidth = useMatch('/today') !== null;
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col lg:mx-0 lg:h-dvh lg:max-w-none lg:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        דלג לתוכן
      </a>
      <ArtSprite />
      <SideRail />
      <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
        {updateReady && (
          <div
            role="status"
            className="sticky top-0 z-30 mx-4 mt-3 flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-2 [box-shadow:var(--card-shadow)]"
          >
            <p className="text-base">{he.pwa.updateReady}</p>
            <Button variant="primary" onClick={applyUpdate}>
              {he.pwa.updateAction}
            </Button>
          </div>
        )}
        {account && !persistent && (
          <p
            role="status"
            className="mx-4 mt-3 rounded-2xl border-s-4 border-warning bg-surface px-4 py-2 text-base [box-shadow:var(--card-shadow)]"
          >
            {he.auth.storageBlocked}
          </p>
        )}
        {account && !online && (
          <p
            role="status"
            className="mx-4 mt-3 rounded-2xl border-s-4 border-warning bg-surface px-4 py-2 text-base [box-shadow:var(--card-shadow)]"
          >
            {he.pwa.offline}
          </p>
        )}
        <main
          id="main"
          className="flex-1 px-4 pb-32 pt-5 lg:min-h-0 lg:overflow-y-auto lg:px-5 lg:pb-5 lg:pt-4"
        >
          {fullWidth ? (
            <Outlet />
          ) : (
            <div className="lg:mx-auto lg:max-w-3xl">
              <Outlet />
            </div>
          )}
        </main>
      </div>

      <nav
        aria-label={he.nav.label}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        <ul className="pointer-events-auto mx-auto flex max-w-sm gap-1 rounded-full bg-surface/90 p-1.5 ring-1 ring-faint backdrop-blur-xl [box-shadow:var(--nav-shadow)]">
          {TABS.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-full text-sm transition ${
                    isActive ? 'bg-accent/10 font-bold text-accent' : 'text-muted'
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
