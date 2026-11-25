import type { MatrixCredentials } from './types';
import { STORAGE_KEY_ACCOUNT_PROFILE } from '@/const/storageKeys';
import {
  activeAccount,
  listAccounts as listStored,
  removeAccount as removeStored,
  type StoredAccount,
} from '@/core/storage';

export type AccountsMap = Record<string, MatrixCredentials>;

export function toCredentials(account: StoredAccount): MatrixCredentials {
  const { session, store } = account;
  return {
    userId: session.userId,
    accessToken: session.accessToken,
    deviceId: session.deviceId,
    homeserverUrl: session.homeserverUrl,
    session,
    store,
  };
}

export function loadAccounts(): AccountsMap {
  return Object.fromEntries(listStored().map((a) => [a.session.userId, toCredentials(a)]));
}

export function listAccounts(): MatrixCredentials[] {
  return listStored().map(toCredentials);
}

export function getActiveAccountId(): string | null {
  return activeAccount()?.session.userId ?? null;
}

export function removeAccount(userId: string): void {
  removeStored(userId);
}

export interface AccountProfile {
  displayName: string | null;
  avatarUrl: string | null;
}

const profileKey = (userId: string) => `${STORAGE_KEY_ACCOUNT_PROFILE}::${userId}`;

export function storedAccountProfile(userId: string): AccountProfile | null {
  try {
    const raw = localStorage.getItem(profileKey(userId));
    return raw ? (JSON.parse(raw) as AccountProfile) : null;
  } catch {
    return null;
  }
}

export function rememberAccountProfile(userId: string, profile: AccountProfile): void {
  try {
    localStorage.setItem(profileKey(userId), JSON.stringify(profile));
  } catch {
    // storage full or blocked
  }
}
