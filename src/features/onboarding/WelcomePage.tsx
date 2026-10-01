import { Navigate } from 'react-router';
import { useOnboarded } from '../shell/ProfileGate';
import { OnboardingPage } from './OnboardingPage';

/** The first-run flow, outside the app frame (no bottom navigation yet). */
export function WelcomePage() {
  const { done } = useOnboarded();
  if (done) return <Navigate to="/today" replace />;
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-6">
      <OnboardingPage mode="new" />
    </main>
  );
}
