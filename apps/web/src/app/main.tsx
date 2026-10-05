import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/shared/api';
import { SessionProvider, useSession } from '@/features/session';
import { Layout } from '@/widgets/layout';
import { Dashboard } from '@/pages/dashboard';
import { AuthPage, Landing } from '@/pages/auth';
import { Account } from '@/pages/account';
import { AcceptTransfer, PublicReport } from '@/pages/reports';
import { EmptyState, Skeleton } from '@/shared/ui';
import '@/shared/styles/index.css';
const CarPage = lazy(() => import('@/pages/car').then((m) => ({ default: m.CarPage })));
function Protected() {
  const { user, ready } = useSession();
  const location = useLocation();
  if (!ready)
    return (
      <div className="mx-auto max-w-5xl p-10">
        <Skeleton />
      </div>
    );
  return user ? (
    <Outlet />
  ) : (
    <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  );
}
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <Suspense
            fallback={
              <div className="p-10">
                <Skeleton />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Landing />} />
              {(['login', 'register', 'forgot-password', 'reset-password', 'verify-email'] as const).map(
                (mode) => (
                  <Route key={mode} path={`/${mode}`} element={<AuthPage mode={mode} />} />
                ),
              )}
              <Route path="/r/:token" element={<PublicReport />} />
              <Route element={<Protected />}>
                <Route element={<Layout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/cars" element={<Dashboard garage />} />
                  <Route path="/cars/:id/*" element={<CarPage />} />
                  {['profile', 'settings', 'sessions'].map((p) => (
                    <Route key={p} path={`/${p}`} element={<Account />} />
                  ))}
                  <Route path="/transfer" element={<AcceptTransfer />} />
                </Route>
              </Route>
              <Route
                path="*"
                element={
                  <EmptyState
                    title="Страница не найдена"
                    text="Проверьте адрес или вернитесь в гараж."
                    action={
                      <a href="/dashboard" className="text-accent">
                        В гараж
                      </a>
                    }
                  />
                }
              />
            </Routes>
          </Suspense>
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
