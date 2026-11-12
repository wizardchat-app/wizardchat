import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { VerificationEmoji, VerificationFlow, WizardClient } from '@wizardchat/core';
import {
  STORAGE_KEY_SIDEBAR_VIEW,
  STORAGE_KEY_CLOSED_NAV_CATEGORIES,
  STORAGE_KEY_OPEN_LOBBY_CATEGORIES,
  STORAGE_KEY_THREAD_LAST_SEEN,
  STORAGE_KEY_THREAD_PANEL_WIDTH,
  STORAGE_KEY_HIDDEN_MEDIA,
  STORAGE_KEY_EMOJI_FREQUENCY,
  STORAGE_KEY_RECENT_INVITES,
  STORAGE_KEY_MEMBERS_PANEL,
  STORAGE_KEY_VERIFY_SKIPPED_DEVICE,
  STORAGE_KEY_WHATS_NEW_SEEN,
} from '@/const/storageKeys';
import { atomWithAccountStorage } from './accountStorage';

export type { SyncState } from '@wizardchat/core';
export { syncStateAtom } from '@/app/data/atoms';

// Mobile
export const mobileDrawerOpenAtom = atom(false);
export const mobileLastSpaceIdAtom = atom<string | null>(null);

export const connectionLostAtom = atom(false);

// Connection banner
export const connectionBannerAtom = atom<{
  visible: boolean;
  reconnected: boolean;
}>({ visible: false, reconnected: false });

// Toast notifications
export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  duration?: number;
  onClick?: () => void;
  actionLabel?: string;
}
export const toastsAtom = atom<Toast[]>([]);

// Confirm modal
export interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  cancelPrimary?: boolean;
  alert?: boolean;
  resolve?: (confirmed: boolean) => void;
}
export const confirmModalAtom = atom<ConfirmState>({
  open: false,
  title: '',
  message: '',
});

// Prompt modal
export interface PromptState {
  open: boolean;
  title: string;
  message: string;
  defaultValue?: string;
  resolve?: (value: string | null) => void;
}
export const promptModalAtom = atom<PromptState>({
  open: false,
  title: '',
  message: '',
});

// Active modals
export const settingsOpenAtom = atom(false);
export const themeEditorAtom = atom<string | null>(null);

export interface CreateRoomState {
  open: boolean;
  spaceId?: string | null;
  spaceName?: string | null;
  sectionTag?: string | null;
}
export const createRoomOpenAtom = atom<CreateRoomState>({ open: false });
export const newDmOpenAtom = atom(false);
export interface CreateSpaceState {
  open: boolean;
  parentSpaceId?: string | null;
  parentSpaceName?: string | null;
}
export const createSpaceOpenAtom = atom<CreateSpaceState>({ open: false });
export interface InviteModalState {
  roomId: string;
  name: string;
  isSpace: boolean;
}
export const inviteModalRoomIdAtom = atom<InviteModalState | null>(null);
export const roomSettingsRoomIdAtom = atom<string | null>(null);
export const roomSettingsTabAtom = atom<
  'general' | 'members' | 'permissions' | 'widgets' | 'emojis' | 'sounds' | 'developer' | null
>(null);
export const spaceSettingsRoomIdAtom = atom<string | null>(null);

export interface AddRoomToSpaceState {
  open: boolean;
  spaceId: string;
  spaceName: string;
  type?: 'room' | 'subspace';
}
export const addRoomToSpaceAtom = atom<AddRoomToSpaceState | null>(null);

export interface ForwardMessageState {
  open: boolean;
  eventType: string;
  content: Record<string, unknown>;
}
export const forwardMessageAtom = atom<ForwardMessageState | null>(null);

export interface VerificationBannerState {
  visible: boolean;
  text: string;
  request?: VerificationFlow;
}
export const verificationBannerAtom = atom<VerificationBannerState>({
  visible: false,
  text: '',
});

// Recovery key display modal (shown after generating a new key)
export interface RecoveryKeyModalState {
  open: boolean;
  recoveryKey: string;
  isRegenerating?: boolean;
}
export const recoveryKeyModalAtom = atom<RecoveryKeyModalState>({
  open: false,
  recoveryKey: '',
});

// Enter recovery key modal (for restoring from backup)
export interface EnterRecoveryKeyModalState {
  open: boolean;
  resolve?: (key: string | null) => void;
}
export const enterRecoveryKeyModalAtom = atom<EnterRecoveryKeyModalState>({
  open: false,
});

// Cross-signing UIA modal - shown when uploading cross-signing keys requires re-auth
export interface CrossSigningUiaState {
  open: boolean;
  offerSso: boolean;
  error?: string;
  resetUrl?: string;
  resolve?: (
    result: { type: 'password'; password: string } | { type: 'sso' } | { type: 'reset' } | null
  ) => void;
}
export const crossSigningUiaAtom = atom<CrossSigningUiaState>({ open: false, offerSso: false });

export const globalSearchOpenAtom = atom(false);

export interface RoomMessageMatch {
  eventId: string;
  senderName: string;
  senderAvatar: string | null;
  body: string;
  ts: number;
}

export interface RoomMessageSearcher {
  roomId: string;
  find: (query: string, limit: number) => { matches: RoomMessageMatch[]; total: number };
  jumpTo: (eventId: string) => void;
}
export const roomMessageSearcherAtom = atom<RoomMessageSearcher | null>(null);

export interface RoomSearchRequest {
  roomId: string;
  query: string;
  openedAt: number;
}
export const roomSearchAtom = atom<RoomSearchRequest | null>(null);

export interface RoomSearchResults {
  roomId: string;
  matchCount: number;
  activeMatch: number;
  next: () => void;
  prev: () => void;
}
export const roomSearchResultsAtom = atom<RoomSearchResults | null>(null);
export const exploreOpenAtom = atom(false);

export const getAppsOpenAtom = atom(false);
export const inboxOpenAtom = atom(false);
export const mobileYouOpenAtom = atom(false);

export interface ComposerAttachment {
  id: string;
  file: File;
  previewUrl: string;
  oversized: boolean;
  caption: string;
  spoiler: boolean;
}
export const composerAttachmentsAtom = atom<Record<string, ComposerAttachment[]>>({});

export function composerDraftKey(roomId: string, threadId?: string | null): string {
  return threadId ? `${roomId}|${threadId}` : roomId;
}

export const composerFocusRequestAtom = atom<{ key: string; at: number } | null>(null);

export interface ReportMessageState {
  open: boolean;
  roomId: string;
  eventId: string;
  senderId: string;
  resolve?: (reason: string | null) => void;
}
export const reportMessageAtom = atom<ReportMessageState>({
  open: false,
  roomId: '',
  eventId: '',
  senderId: '',
});

export type SessionVerificationStatus = 'checking' | 'verified' | 'unverified' | 'no-identity';
export interface SessionVerificationState {
  status: SessionVerificationStatus;
  hasOtherVerifiedSession: boolean;
  hasRecoveryKey: boolean;
}
export const sessionVerificationAtom = atom<SessionVerificationState>({
  status: 'checking',
  hasOtherVerifiedSession: false,
  hasRecoveryKey: false,
});

export const verifySkippedDeviceAtom = atomWithAccountStorage<string | null>(
  STORAGE_KEY_VERIFY_SKIPPED_DEVICE,
  null
);

// Target page to open in Settings (set externally before settingsOpenAtom)
export type SettingsPage =
  | 'profile'
  | 'account'
  | 'appearance'
  | 'accessibility'
  | 'privacy'
  | 'notifications'
  | 'voice-video'
  | 'emojis-stickers'
  | 'soundboard'
  | 'keybinds'
  | 'language'
  | 'developer'
  | 'sessions'
  | 'encryption'
  | 'about';
export const settingsPageAtom = atom<SettingsPage | null>(null);
export const settingsHighlightAtom = atom<string | null>(null);

export interface EmojiVerificationState {
  open: boolean;
  request?: VerificationFlow;
  emojis?: VerificationEmoji[];
  otherUserId?: string;
  phase: 'waiting' | 'comparing' | 'done' | 'cancelled';
}
export const emojiVerificationAtom = atom<EmojiVerificationState>({
  open: false,
  phase: 'waiting',
});

export type SidebarView = 'home' | 'dms' | 'space';
export const sidebarViewAtom = atomWithStorage<SidebarView>(STORAGE_KEY_SIDEBAR_VIEW, 'home');

export interface EditMessageState {
  roomId: string;
  eventId: string;
  body: string;
  msgtype: string;
  threadId?: string | null;
}
export const editMessageAtom = atom<EditMessageState | null>(null);

export const editComposerEmojiInserterAtom = atom<{
  (emoji: string, mxcUrl?: string): void;
} | null>(null);

export interface EmojiPickerState {
  anchor: HTMLElement | null;
  anchorRect?: { x: number; y: number; width: number; height: number } | null;
  onPick: (emoji: string, mxcUrl?: string) => void;
  client: WizardClient;
  roomId: string;
  unicodeOnly?: boolean;
  placement?: 'bottom-start' | 'left-start' | 'right-start';
}
export const emojiPickerAtom = atom<EmojiPickerState | null>(null);

export type ThreadsPanelView = { type: 'list' } | { type: 'thread'; rootEventId: string };

type BaseSidePanel =
  | { kind: 'none' }
  | { kind: 'members' }
  | { kind: 'spaceMembers' }
  | { kind: 'threads'; view: ThreadsPanelView };

type SidePanel = BaseSidePanel | { kind: 'roomChat'; roomId: string; under: BaseSidePanel };

const sidePanelAtom = atom<SidePanel>(
  typeof window !== 'undefined' && window.innerWidth >= 768 ? { kind: 'members' } : { kind: 'none' }
);

export const roomChatRoomIdAtom = atom((get) => {
  const panel = get(sidePanelAtom);
  return panel.kind === 'roomChat' ? panel.roomId : null;
});

export const roomChatPanelOpenAtom = atom((get) => get(roomChatRoomIdAtom) !== null);

type BoolUpdater = boolean | ((prev: boolean) => boolean);
type ThreadsUpdater =
  ThreadsPanelView | null | ((prev: ThreadsPanelView | null) => ThreadsPanelView | null);

function resolveBool(updater: BoolUpdater, current: boolean): boolean {
  return typeof updater === 'function' ? updater(current) : updater;
}

function resolveThreads(updater: ThreadsUpdater, current: ThreadsPanelView | null) {
  return typeof updater === 'function' ? updater(current) : updater;
}

function nextPanel(current: SidePanel, kind: 'members' | 'spaceMembers', open: boolean): SidePanel {
  if (!open) return current.kind === kind ? { kind: 'none' } : current;
  return { kind };
}

export const membersPanelOpenAtom = atom<boolean, [BoolUpdater], void>(
  (get) => get(sidePanelAtom).kind === 'members',
  (get, set, updater) => {
    const open = resolveBool(updater, get(sidePanelAtom).kind === 'members');
    set(sidePanelAtom, nextPanel(get(sidePanelAtom), 'members', open));
  }
);

export const spaceMembersPanelOpenAtom = atom<boolean, [BoolUpdater], void>(
  (get) => get(sidePanelAtom).kind === 'spaceMembers',
  (get, set, updater) => {
    const open = resolveBool(updater, get(sidePanelAtom).kind === 'spaceMembers');
    set(sidePanelAtom, nextPanel(get(sidePanelAtom), 'spaceMembers', open));
  }
);

export const threadsPanelViewAtom = atom<ThreadsPanelView | null, [ThreadsUpdater], void>(
  (get) => {
    const panel = get(sidePanelAtom);
    return panel.kind === 'threads' ? panel.view : null;
  },
  (get, set, updater) => {
    const panel = get(sidePanelAtom);
    const view = resolveThreads(updater, panel.kind === 'threads' ? panel.view : null);
    set(
      sidePanelAtom,
      view ? { kind: 'threads', view } : panel.kind === 'threads' ? { kind: 'none' } : panel
    );
  }
);

export const threadFilterAtom = atom<'all' | 'my'>('all');

export const openRoomChatAtom = atom(null, (get, set, roomId: string) => {
  const panel = get(sidePanelAtom);
  if (panel.kind === 'roomChat') {
    set(sidePanelAtom, { ...panel, roomId });
  } else {
    set(sidePanelAtom, { kind: 'roomChat', roomId, under: panel });
  }
});

export const closeRoomChatAtom = atom(null, (get, set) => {
  const panel = get(sidePanelAtom);
  if (panel.kind === 'roomChat') set(sidePanelAtom, panel.under);
});
export const threadPanelExpandedAtom = atom(false);

export const THREAD_PANEL_WIDTH_MIN = 450;
export const THREAD_PANEL_WIDTH_MAX = 600;
export const THREAD_PANEL_WIDTH_DEFAULT = 450;

const storedThreadPanelWidthAtom = atomWithStorage<number>(
  STORAGE_KEY_THREAD_PANEL_WIDTH,
  THREAD_PANEL_WIDTH_DEFAULT
);

export const threadPanelWidthAtom = atom(
  (get) => clampPanelWidth(get(storedThreadPanelWidthAtom)),
  (_get, set, width: number) => set(storedThreadPanelWidthAtom, clampPanelWidth(width))
);

function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return THREAD_PANEL_WIDTH_DEFAULT;
  return Math.min(THREAD_PANEL_WIDTH_MAX, Math.max(THREAD_PANEL_WIDTH_MIN, width));
}

// Maps thread root event ID -> last-seen renderable reply event ID.
// Persisted to localStorage so the unread dot stays cleared across hot reloads and page refreshes.
export const threadLastSeenAtom = atomWithAccountStorage<Record<string, string>>(
  STORAGE_KEY_THREAD_LAST_SEEN,
  {}
);

// Maps media event ID -> hidden by the local user (per-message "hide media").
// Persisted so a hidden message stays hidden across reloads.
export const hiddenMediaAtom = atomWithAccountStorage<Record<string, boolean>>(
  STORAGE_KEY_HIDDEN_MEDIA,
  {}
);

export const updateAvailableAtom = atom(false);

export interface RoomScrollState {
  atBottom: boolean;
  scrollTop?: number;
}
export const timelineScrollAtom = atom(new Map<string, RoomScrollState>());

export const closedNavCategoriesAtom = atomWithAccountStorage<string[]>(
  STORAGE_KEY_CLOSED_NAV_CATEGORIES,
  []
);

export const openLobbyCategoriesAtom = atomWithAccountStorage<string[]>(
  STORAGE_KEY_OPEN_LOBBY_CATEGORIES,
  []
);

export const emojiFrequencyAtom = atomWithAccountStorage<Record<string, number>>(
  STORAGE_KEY_EMOJI_FREQUENCY,
  {}
);

interface RecentUser {
  userId: string;
  displayName: string;
  avatarMxc: string | null;
  timestamp: number;
}

export const recentInvitesAtom = atomWithAccountStorage<RecentUser[]>(
  STORAGE_KEY_RECENT_INVITES,
  []
);

export const membersPanelStateAtom = atomWithStorage<{
  sort: 'az' | 'za';
}>(STORAGE_KEY_MEMBERS_PANEL, { sort: 'az' });

export const optimisticRedactedIdsAtom = atom<ReadonlySet<string>>(new Set<string>());

export const optimisticEditBodiesAtom = atom<ReadonlyMap<string, string>>(
  new Map<string, string>()
);

export const whatsNewOpenAtom = atom(false);

export const whatsNewSeenAtom = atomWithAccountStorage<string | null>(
  STORAGE_KEY_WHATS_NEW_SEEN,
  null
);

export const pendingEventJumpAtom = atom<{ roomId: string; eventId: string } | null>(null);
