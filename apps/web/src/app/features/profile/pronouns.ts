import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import i18n from '@/i18n';

// MSC4247: stable key, and the unstable one clients use until it is merged
export const PRONOUNS_KEY = 'm.pronouns';
export const PRONOUNS_UNSTABLE_KEY = 'io.fsky.nyx.pronouns';
export const MAX_PRONOUNS_LENGTH = 40;

export function parsePronouns(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  const summaries = raw
    .map((entry) =>
      entry && typeof entry === 'object' ? (entry as { summary?: unknown }).summary : null
    )
    .filter((summary): summary is string => typeof summary === 'string' && !!summary.trim())
    .map((summary) => summary.trim().slice(0, MAX_PRONOUNS_LENGTH));
  return summaries.length ? summaries.join(', ') : null;
}

const pronounsKey = (userId: string | null | undefined) => ['profile-pronouns', userId];

export function useUserPronouns(client: MatrixClient | null, userId: string | null | undefined) {
  return useQuery<string | null>({
    queryKey: pronounsKey(userId),
    queryFn: async () => {
      if (!client || !userId) return null;
      for (const key of [PRONOUNS_UNSTABLE_KEY, PRONOUNS_KEY]) {
        const value = parsePronouns(await client.profileField(userId, key).catch(() => null));
        if (value) return value;
      }
      return null;
    },
    enabled: !!client && !!userId,
    staleTime: 5 * 60_000,
  }).data;
}

export function useCanSetPronouns(client: MatrixClient | null) {
  return (
    useQuery({
      queryKey: ['profile-pronouns-writable'],
      queryFn: () => client?.canSetProfileField(PRONOUNS_UNSTABLE_KEY).catch(() => false) ?? false,
      enabled: !!client,
      staleTime: Infinity,
    }).data ?? false
  );
}

export function useSetPronouns(client: MatrixClient | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pronouns: string) => {
      if (!client) throw new Error('No client');
      const summary = pronouns.trim().slice(0, MAX_PRONOUNS_LENGTH);
      if (summary) {
        await client.setProfileField(PRONOUNS_UNSTABLE_KEY, [
          { language: i18n.language?.split('-')[0] || 'en', summary },
        ]);
      } else {
        await client.deleteProfileField(PRONOUNS_UNSTABLE_KEY);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pronounsKey(client?.userId()) }),
  }).mutateAsync;
}
