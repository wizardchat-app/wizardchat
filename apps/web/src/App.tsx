import { useEffect } from 'react';
import { useApplyTheme } from '@/theme/useApplyTheme';
import { Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { themedAppIconAtom } from '@/app/store/atoms';
import { baseLogoClass } from '@/theme/themes.css';
import { WelcomePage } from '@/app/pages/auth/WelcomePage';
import { ClientLayout } from '@/app/pages/client/ClientLayout';
import { RequireAuth } from '@/app/features/auth/RequireAuth';
import { ErrorBoundary } from '@/app/components/ErrorBoundary/ErrorBoundary';
import { useReducedMotionSync } from '@/app/hooks/useReducedMotion';
import { useChatDisplaySync } from '@/app/hooks/useChatDisplaySync';
import { useUiDensitySync } from '@/app/hooks/useUiDensitySync';
import { STORAGE_KEY_PENDING_LINK } from '@/const/storageKeys';

function MatrixToLink() {
  const { hash } = useLocation();
  if (hash) sessionStorage.setItem(STORAGE_KEY_PENDING_LINK, hash);
  return <Navigate to="/" replace />;
}

export function App() {
  const themedAppIcon = useAtomValue(themedAppIconAtom);
  useReducedMotionSync();
  useChatDisplaySync();
  useUiDensitySync();

  useApplyTheme((bg, text) => window.desktopAPI?.setTitleBarTheme?.(bg, text));

  useEffect(() => {
    document.documentElement.classList.toggle(baseLogoClass, !themedAppIcon);
  }, [themedAppIcon]);

  return (
    <ErrorBoundary>
      <Routes>
        {/* Public */}
        <Route path="/welcome/:homeserver?" element={<WelcomePage />} />
        <Route path="/to" element={<MatrixToLink />} />

        {/* Protected client routes */}
        <Route
          path="/*"
          element={
            <RequireAuth>
              <ClientLayout />
            </RequireAuth>
          }
        />
      </Routes>
    </ErrorBoundary>
  );
}
