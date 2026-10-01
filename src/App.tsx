import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ServicesProvider, type Services } from './app/services';
import { OnboardingPage } from './features/onboarding/OnboardingPage';
import { WelcomePage } from './features/onboarding/WelcomePage';
import { ProgressPage } from './features/progress/ProgressPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { AppShell } from './features/shell/AppShell';
import { RequireProfile } from './features/shell/ProfileGate';
import { TodayPage } from './features/today/TodayPage';
import { ToastProvider } from './ui/Toast';

/** Everything the app is made of: data services, caching, messages and the screens. */
export function App({ services }: { services?: Services }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Data is local and invalidated by the mutations that change it, so it never goes stale by itself.
        defaultOptions: {
          queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <ServicesProvider {...(services ? { services } : {})}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/welcome" element={<WelcomePage />} />
              <Route
                element={
                  <RequireProfile>
                    <AppShell />
                  </RequireProfile>
                }
              >
                <Route path="/today" element={<TodayPage />} />
                <Route path="/progress" element={<ProgressPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/goal" element={<OnboardingPage mode="edit" />} />
              </Route>
              <Route path="*" element={<Navigate to="/today" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ServicesProvider>
  );
}
