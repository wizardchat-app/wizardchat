import type { Session, StoreConfig } from '@wizardchat/core';
import { deleteDesktopStore, isDesktop } from '@/bridge/desktop';
import { STORAGE_KEY_ACTIVE_ACCOUNT } from '@/const/storageKeys';

export const ACCOUNTS_KEY = 'wizardchat.accounts';

export interface StoredAccount {
  session: Session;
  store: StoreConfig;
}

interface AccountsState {
  active: string | null;
  accounts: Record<string, StoredAccount>;
}

function read(): AccountsState {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (raw) return JSON.parse(raw) as AccountsState;
  } catch {
    // Unreadable storage is treated as signed out
  }
  return { active: null, accounts: {} };
}

function write(state: AccountsState): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(state));
  if (state.active) localStorage.setItem(STORAGE_KEY_ACTIVE_ACCOUNT, state.active);
  else localStorage.removeItem(STORAGE_KEY_ACTIVE_ACCOUNT);
}

export function listAccounts(): StoredAccount[] {
  return Object.values(read().accounts);
}

export function activeAccount(): StoredAccount | null {
  const state = read();
  return (state.active && state.accounts[state.active]) || null;
}

export function storedAccount(userId: string): StoredAccount | null {
  return read().accounts[userId] ?? null;
}

/** Stores (or updates) an account and makes it the active one */
export function saveAccount(account: StoredAccount): void {
  const state = read();
  state.accounts[account.session.userId] = account;
  state.active = account.session.userId;
  write(state);
}

/** Replaces the session of a stored account (e.g. after a token refresh) */
export function updateSession(session: Session): void {
  const state = read();
  const account = state.accounts[session.userId];
  if (!account) return;
  state.accounts[session.userId] = { ...account, session };
  write(state);
}

export function setActive(userId: string): void {
  const state = read();
  if (state.accounts[userId]) write({ ...state, active: userId });
}

/** Forgets an account; another one (if any) becomes active */
export function removeAccount(userId: string): StoredAccount | null {
  const state = read();
  const removed = state.accounts[userId] ?? null;
  delete state.accounts[userId];
  if (state.active === userId) state.active = Object.keys(state.accounts)[0] ?? null;
  write(state);
  return removed;
}

/** A fresh, encrypted store for a new sign-in (IndexedDB, or a directory on desktop) */
export function newStoreConfig(): StoreConfig {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return {
    location: `wizardchat-${crypto.randomUUID()}`,
    passphrase: btoa(String.fromCharCode(...bytes)),
    manualEncryptionSetup: true,
  };
}

/** Deletes the IndexedDB databases the core created for a store location */
export async function deleteStore(store: StoreConfig): Promise<void> {
  if (isDesktop) return deleteDesktopStore(store.location).catch(() => {});
  const databases = (await indexedDB.databases?.()) ?? [];
  await Promise.all(
    databases
      .map((db) => db.name)
      .filter((name): name is string => !!name?.startsWith(store.location))
      .map(
        (name) =>
          new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
          })
      )
  );
}
