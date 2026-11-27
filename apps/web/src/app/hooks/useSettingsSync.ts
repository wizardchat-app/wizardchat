import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import type {
  SyncedSettings as CoreSyncedSettings,
  WizardClient as MatrixClient,
} from '@wizardchat/core';
import {
  messageLayoutAtom,
  languageAtom,
  preferencesAtom,
  DEFAULT_PREFERENCES,
} from '@/app/store/atoms';
import { useSyncReady } from '@/app/hooks/useSync';
import i18n from '@/i18n';
import { isSupportedLanguage } from '@/i18n/languages';
import {
  SYNCED_PREFERENCE_KEYS,
  type SyncedPreferences,
  type SyncedSettings,
  fromCoreSettings,
  pickSyncedPreferences,
  settingsEqual,
} from '@/client/settingsSync';

const PUSH_DEBOUNCE_MS = 500;

export function useSettingsSync(client: MatrixClient | null): void {
  const [messageLayout, setMessageLayout] = useAtom(messageLayoutAtom);
  const [language, setLanguage] = useAtom(languageAtom);
  const [preferences, setPreferences] = useAtom(preferencesAtom);
  const syncReady = useSyncReady();
  const [remoteKnown, setRemoteKnown] = useState(false);
  const remoteRef = useRef<Partial<SyncedSettings>>({});

  const applyRemote = useCallback(
    (settings: Partial<SyncedSettings>) => {
      if (settings.messageLayout) setMessageLayout(settings.messageLayout);
      if (settings.language && isSupportedLanguage(settings.language)) {
        setLanguage(settings.language);
        if (i18n.language !== settings.language) i18n.changeLanguage(settings.language);
      }
      const remotePreferences = pickSyncedPreferences(settings);
      if (Object.keys(remotePreferences).length > 0) {
        setPreferences((prev) => ({ ...prev, ...remotePreferences }));
      }
    },
    [setMessageLayout, setLanguage, setPreferences]
  );

  // Pull: server -> local, live via account data
  useEffect(() => {
    setRemoteKnown(false);
    remoteRef.current = {};
    if (!client || !syncReady) return;
    const subscription = client.watchSyncedSettings((synced) => {
      const settings = fromCoreSettings(synced);
      remoteRef.current = settings;
      if (Object.keys(settings).length > 0) {
        applyRemote(settings);
      }
      setRemoteKnown(true);
    });
    return () => subscription.cancel();
  }, [client, syncReady, applyRemote]);

  const syncedJson = JSON.stringify(
    Object.fromEntries(
      SYNCED_PREFERENCE_KEYS.map((key) => [key, preferences[key] ?? DEFAULT_PREFERENCES[key]])
    )
  );
  const syncedPreferences = useMemo(
    () => JSON.parse(syncedJson) as SyncedPreferences,
    [syncedJson]
  );

  useEffect(() => {
    if (!client || !syncReady || !remoteKnown) return;
    const timer = setTimeout(() => {
      const next: SyncedSettings = { messageLayout, language, ...syncedPreferences };
      const current = remoteRef.current;
      if (settingsEqual(next, current)) return;
      const changed = Object.fromEntries(
        (Object.keys(next) as (keyof SyncedSettings)[])
          .filter((key) => next[key] !== current[key])
          .map((key) => [key, next[key]])
      ) as CoreSyncedSettings;
      client.updateSyncedSettings(changed).catch(() => {
        // Non-fatal - the local value stays applied and the next change retries
      });
    }, PUSH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [client, syncReady, remoteKnown, messageLayout, language, syncedPreferences]);
}
