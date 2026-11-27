import { type ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSetAtom, useAtom } from 'jotai';
import type { WizardClient } from '@wizardchat/core';
import {
  credentialsAtom,
  userIdAtom,
  serverUploadLimitAtom,
  messageLayoutAtom,
  languageAtom,
  preferencesAtom,
} from '@/app/store/atoms';
import i18n from '@/i18n';
import { isSupportedLanguage } from '@/i18n/languages';
import { fromCoreSettings, pickSyncedPreferences } from '@/client/settingsSync';
import { resume, loadCredentials, logout, getMatrixClientOrNull } from '@/client/initMatrix';
import { AppLoading, FADE_OUT_MS } from '@/app/components/AppLoading';
import { DataSync } from '@/app/data';
import { fetchServerUploadLimit } from '@/util/serverCapabilities';
import { getErrorMessage } from '@/util/error';
import { SessionError } from './SessionError';

interface Props {
  children: ReactNode;
}

type Status = 'pending' | 'syncing' | 'hiding' | 'ready' | 'unauthenticated' | 'error';

/** Applies the account's synced settings as this device stored them, before the app shows */
function useApplyStoredSettings() {
  const setMessageLayout = useSetAtom(messageLayoutAtom);
  const setLanguage = useSetAtom(languageAtom);
  const setPreferences = useSetAtom(preferencesAtom);
  return async (client: WizardClient) => {
    const synced = await client.syncedSettings().catch(() => null);
    if (!synced) return;
    const settings = fromCoreSettings(synced);
    if (settings.messageLayout) setMessageLayout(settings.messageLayout);
    if (settings.language && isSupportedLanguage(settings.language)) {
      setLanguage(settings.language);
      if (i18n.language !== settings.language) void i18n.changeLanguage(settings.language);
    }
    const preferences = pickSyncedPreferences(settings);
    if (Object.keys(preferences).length > 0)
      setPreferences((prev) => ({ ...prev, ...preferences }));
  };
}

export function RequireAuth({ children }: Props) {
  const [credentials] = useAtom(credentialsAtom);
  const setUserId = useSetAtom(userIdAtom);
  const setServerUploadLimit = useSetAtom(serverUploadLimitAtom);
  const applyStoredSettings = useApplyStoredSettings();

  const [status, setStatus] = useState<Status>('pending');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const creds = credentials ?? loadCredentials();
    if (!creds) {
      setStatus('unauthenticated');
      return;
    }

    let cancelled = false;
    setStatus('pending');
    setError(null);

    const init = async () => {
      try {
        let resolveFirstSync!: () => void;
        const firstSyncPromise = new Promise<void>((res) => {
          resolveFirstSync = res;
        });

        const client = await resume(creds, () => resolveFirstSync());
        if (cancelled) return;
        await applyStoredSettings(client);
        if (cancelled) return;

        setUserId(client.userId() ?? null);

        void fetchServerUploadLimit(client).then((limit) => {
          if (!cancelled) setServerUploadLimit(limit);
        });

        setStatus('syncing');

        await firstSyncPromise;
        if (cancelled) return;

        setStatus('hiding');
        setTimeout(() => {
          if (!cancelled) setStatus('ready');
        }, FADE_OUT_MS);
      } catch (err) {
        console.error('[RequireAuth] Failed to resume session:', err);
        if (!cancelled) {
          setError(getErrorMessage(err));
          setStatus('error');
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (status === 'unauthenticated') {
    return <Navigate to="/welcome" replace />;
  }

  if (status === 'error') {
    const creds = credentials ?? loadCredentials();
    return (
      <SessionError
        error={error}
        onRetry={() => setAttempt((a) => a + 1)}
        onSignOut={() => {
          void logout(creds?.userId ?? null);
        }}
      />
    );
  }

  if (status === 'pending') return <AppLoading />;

  const client = getMatrixClientOrNull();
  return (
    <>
      {client && <DataSync client={client} />}
      {children}
      {(status === 'syncing' || status === 'hiding') && <AppLoading hiding={status === 'hiding'} />}
    </>
  );
}
