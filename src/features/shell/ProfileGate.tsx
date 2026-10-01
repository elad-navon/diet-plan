import { createContext, useContext, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useProfile } from '../../app/data-hooks';
import { type Profile } from '../../data';
import { he } from '../../i18n/he';

const ProfileContext = createContext<Profile | null>(null);

/** The signed-up user's profile. Only usable below <RequireProfile>. */
export function useRequiredProfile(): Profile {
  const profile = useContext(ProfileContext);
  if (!profile) throw new Error('useRequiredProfile must be used below <RequireProfile>');
  return profile;
}

/** Sends people who have not finished onboarding to the welcome flow; everyone else sees the app. */
export function RequireProfile({ children }: { children: ReactNode }) {
  const profile = useProfile();
  if (profile.isPending) {
    return (
      <p role="status" className="p-6 text-muted">
        {he.loading}
      </p>
    );
  }
  if (!profile.data) return <Navigate to="/welcome" replace />;
  return <ProfileContext.Provider value={profile.data}>{children}</ProfileContext.Provider>;
}
