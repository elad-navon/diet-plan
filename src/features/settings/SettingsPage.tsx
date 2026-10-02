import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useResetAll, usePlans } from '../../app/data-hooks';
import { isIos, isStandalone, useInstall } from '../../app/pwa';
import { useNow, useServices } from '../../app/services';
import { applyTheme, getTheme, type ThemeChoice } from '../../app/theme';
import { ageOn, localDateOf } from '../../core/time';
import foodMeta from '../../assets/food-db/food-db.meta.json';
import { DataError } from '../../data';
import { dataErrorMessage } from '../../i18n/data-errors';
import { formatShortDate } from '../../i18n/format';
import { formatInt, he } from '../../i18n/he';
import { Button } from '../../ui/Button';
import { SelectField } from '../../ui/Field';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { useRequiredProfile } from '../shell/ProfileGate';

export function SettingsPage() {
  const profile = useRequiredProfile();
  const tz = profile.timezone;
  const now = useNow();
  const today = localDateOf(now, tz);
  const { repos, persistent, account } = useServices();
  const plans = usePlans().data ?? [];
  const resetAll = useResetAll();
  const navigate = useNavigate();
  const toast = useToast();
  const install = useInstall();
  const [theme, setTheme] = useState<ThemeChoice>(getTheme);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  const current = plans.filter((p) => p.effectiveFrom <= today).at(-1) ?? null;

  async function download(): Promise<void> {
    let document_;
    try {
      document_ = await repos.exportAll();
    } catch (error) {
      toast.show({ message: dataErrorMessage(error instanceof DataError ? error.code : null) });
      return;
    }
    const blob = new Blob([JSON.stringify(document_, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diet-plan-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.show({ message: he.settings.exported });
  }

  async function deleteEverything(): Promise<void> {
    try {
      await resetAll.mutateAsync();
    } catch (error) {
      setConfirmOpen(false);
      toast.show({ message: dataErrorMessage(error instanceof DataError ? error.code : null) });
      return;
    }
    setConfirmOpen(false);
    void navigate('/welcome', { replace: true });
  }

  async function deleteAccount(): Promise<void> {
    try {
      await account?.deleteAccount();
      // The sign-in screen takes over once the session ends.
    } catch (error) {
      setDeleteAccountOpen(false);
      toast.show({ message: dataErrorMessage(error instanceof DataError ? error.code : null) });
    }
  }

  async function signOut(): Promise<void> {
    try {
      await account?.signOut();
    } catch {
      toast.show({ message: he.genericError });
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold tracking-tight">{he.settings.title}</h1>

      {!persistent && (
        <p role="alert" className="rounded-2xl border border-warning p-3 text-base">
          {he.settings.notPersistent}
        </p>
      )}

      <section aria-labelledby="profile-title" className="space-y-2 card p-5">
        <h2 id="profile-title" className="text-xl font-bold">
          {he.settings.profile}
        </h2>
        <p className="text-base">
          {he.sex[profile.sex]} ·{' '}
          {he.settings.summary(ageOn(profile.birthDate, today), String(profile.heightCm))}
        </p>
        <p className="text-base text-muted">
          {current ? he.settings.currentTarget(formatInt(current.kcalTarget)) : he.settings.noPlan}
        </p>
        <Link
          to="/settings/goal"
          className="inline-flex min-h-12 items-center rounded-full bg-surface-2 px-5 text-base font-medium ring-1 ring-inset ring-faint"
        >
          {he.settings.editGoal}
        </Link>
      </section>

      {!isStandalone() && (install.canPrompt || isIos()) && (
        <section aria-labelledby="install-title" className="space-y-2 card p-5">
          <h2 id="install-title" className="text-xl font-bold">
            {he.pwa.installTitle}
          </h2>
          <p className="text-base">{he.pwa.installBody}</p>
          {install.canPrompt ? (
            <Button variant="primary" onClick={() => void install.prompt()}>
              {he.pwa.installAction}
            </Button>
          ) : (
            <p className="text-base">{he.pwa.installIos}</p>
          )}
        </section>
      )}

      {account && (
        <section aria-labelledby="account-title" className="space-y-2 card p-5">
          <h2 id="account-title" className="text-xl font-bold">
            {he.auth.account}
          </h2>
          <p className="text-base">
            {account.email ? he.auth.signedInAs(account.email) : he.auth.signedInNoEmail}
          </p>
          <Button onClick={() => void signOut()}>{he.auth.signOut}</Button>
          <p className="text-sm text-muted">{he.auth.signOutNote}</p>
          <Button variant="danger" onClick={() => setDeleteAccountOpen(true)}>
            {he.auth.deleteAccount}
          </Button>
        </section>
      )}

      <section aria-labelledby="look-title" className="card p-5">
        <h2 id="look-title" className="mb-2 text-xl font-bold">
          {he.settings.theme}
        </h2>
        <SelectField
          label={he.settings.theme}
          value={theme}
          onChange={(value) => {
            const choice = value as ThemeChoice;
            setTheme(choice);
            applyTheme(choice);
          }}
          options={[
            { value: 'system', label: he.settings.themeSystem },
            { value: 'light', label: he.settings.themeLight },
            { value: 'dark', label: he.settings.themeDark },
          ]}
        />
      </section>

      <section aria-labelledby="data-title" className="space-y-3 card p-5">
        <h2 id="data-title" className="text-xl font-bold">
          {he.settings.data}
        </h2>
        <p className="text-sm text-muted">{account ? he.settings.synced : he.settings.localOnly}</p>
        <div>
          <Button onClick={() => void download()}>{he.settings.export}</Button>
          <p className="mt-1 text-sm text-muted">{he.settings.exportNote}</p>
        </div>
        <Button variant="danger" onClick={() => setConfirmOpen(true)}>
          {he.settings.deleteAll}
        </Button>
      </section>

      <section aria-labelledby="sources-title" className="space-y-1 card p-5">
        <h2 id="sources-title" className="text-xl font-bold">
          {he.settings.sources}
        </h2>
        <p className="text-base">
          {he.settings.sourcesBody(
            foodMeta.source,
            foodMeta.sourceModified === 'unknown'
              ? '—'
              : formatShortDate(foodMeta.sourceModified, tz),
          )}
        </p>
        <a
          href={foodMeta.sourceUrl}
          className="inline-flex min-h-11 items-center text-accent underline"
          rel="noreferrer"
        >
          {he.settings.sourcesLink}
        </a>
      </section>

      <Sheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={he.settings.deleteConfirmTitle}
      >
        <p className="mb-4 text-base">
          {account ? he.settings.deleteConfirmBodyServer : he.settings.deleteConfirmBody}
        </p>
        <div className="flex gap-2">
          <Button variant="danger" onClick={() => void deleteEverything()}>
            {he.settings.deleteConfirmAction}
          </Button>
          <Button onClick={() => setConfirmOpen(false)}>{he.cancel}</Button>
        </div>
      </Sheet>

      <Sheet
        open={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
        title={he.auth.deleteAccountTitle}
      >
        <p className="mb-4 text-base">{he.auth.deleteAccountBody}</p>
        <div className="flex gap-2">
          <Button variant="danger" onClick={() => void deleteAccount()}>
            {he.auth.deleteAccountAction}
          </Button>
          <Button onClick={() => setDeleteAccountOpen(false)}>{he.cancel}</Button>
        </div>
      </Sheet>
    </div>
  );
}
