import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@wizardchat/design-tokens/tokens.css';
import { App } from './App';
import { SessionProvider } from '@/app/SessionProvider';
import { handleAuthCallbackPopup, loadCore } from '@/core/client';
import { registerNotificationServiceWorker } from '@/app/hooks/useNotifications';
import { installNativeAppHooks } from '@/util/nativeApp';
import { installDesktopHooks } from '@/bridge/desktop';

// Fonts (must be in .tsx, not in .css.ts - VE esbuild can't handle woff2)
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

import '@/theme/reset.css';
import '@/theme/global.css';

import '@/i18n';

window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('chunk_reload_attempted')) {
    sessionStorage.setItem('chunk_reload_attempted', '1');
    window.location.reload();
  }
});
window.addEventListener('load', () => sessionStorage.removeItem('chunk_reload_attempted'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const sharePicker =
  import.meta.env.DESKTOP && new URLSearchParams(location.search).get('window') === 'share-picker';

// The share picker window shows only the picker; the sign-in popup only hands its URL back and closes
if (sharePicker) {
  void Promise.all([
    import('@/bridge/desktopApi'),
    import('@/app/features/calls/desktopPicker/SharePickerWindow'),
  ]).then(([{ desktopApi }, { SharePickerWindow }]) => {
    window.desktopAPI = desktopApi;
    const root = document.getElementById('root');
    if (!root) throw new Error('Root element not found');
    createRoot(root).render(
      <StrictMode>
        <SharePickerWindow />
      </StrictMode>
    );
  });
} else if (!handleAuthCallbackPopup()) {
  void loadCore();
  void registerNotificationServiceWorker();
  installNativeAppHooks();
  installDesktopHooks();

  const root = document.getElementById('root');
  if (!root) throw new Error('Root element not found');
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SessionProvider>
            <App />
          </SessionProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>
  );
}
