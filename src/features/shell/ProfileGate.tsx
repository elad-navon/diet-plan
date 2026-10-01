import { createContext, useContext, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { usePlans, useProfile } from '../../app/data-hooks';
import { type Profile } from '../../data';
import { LoadGate } from './LoadGate';

const ProfileContext = createContext<Profile | null>(null);

/** The signed-up user's profile. Only usable below <RequireProfile>. */
export function useRequiredProfile(): Profile {
  const profile = useContext(ProfileContext);
  if (!profile) throw new Error('useRequiredProfile must be used below <RequireProfile>');
  return profile;
}

/**
 * Whether first-run setup is finished: a profile AND a target plan exist. (Setup saves them in separate
 * steps; if the second one failed, the person is sent back to finish rather than landing on an empty day.)
 */
export function useOnboarded(): { profile: Profile | null; done: boolean } {
  const profile = useProfile().data ?? null;
  const plans = usePlans().data ?? [];
  return { profile, done: profile !== null && plans.length > 0 };
}

/** Sends people who have not finished onboarding to the welcome flow; everyone else sees the app. */
export function RequireProfile({ children }: { children: ReactNode }) {
  const profile = useProfile();
  const plans = usePlans();
  return (
    <LoadGate queries={[profile, plans]}>
      <Gate>{children}</Gate>
    </LoadGate>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { profile, done } = useOnboarded();
  if (!profile || !done) return <Navigate to="/welcome" replace />;
  return <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>;
}
