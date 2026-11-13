import type { RoomSummary, SpaceNode, WizardClient } from '@wizardchat/core';
import { markRoomAsRead } from './markAsRead';
import {
  EnvelopeSimpleOpenIcon,
  StackIcon,
  PushPinIcon,
  UserPlusIcon,
  GearIcon,
  SignOutIcon,
  PlusIcon,
  ChatCircleIcon,
  LinkSimpleIcon,
  FolderSimplePlusIcon,
} from '@phosphor-icons/react';
import type { TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import type { SpaceEntry } from '@/app/features/room';
import type { ContextMenuItem } from '@/app/features/contextMenu/contextMenuAtom';
import { descendantsOf, isInAnySpace } from '@/app/data';
import { makeRoomPermalink } from '@/util/matrix';
import { getRoomUnreadCount } from '@/util/mentions';

function unreadRoomIds(rooms: RoomSummary[], roomIds: string[]): string[] {
  const ids = new Set(roomIds);
  return rooms
    .filter((room) => ids.has(room.id) && !room.isInvite && getRoomUnreadCount(room) > 0)
    .map((room) => room.id);
}

function hasJoinedUnreadRooms(rooms: RoomSummary[], roomIds: string[]): boolean {
  return unreadRoomIds(rooms, roomIds).length > 0;
}

function spaceHasJoinedUnread(rooms: RoomSummary[], graph: SpaceNode[], spaceId: string): boolean {
  return hasJoinedUnreadRooms(rooms, spaceRoomIds(rooms, graph, spaceId));
}

function spaceRoomIds(rooms: RoomSummary[], graph: SpaceNode[], spaceId: string): string[] {
  const below = descendantsOf(graph, spaceId);
  return rooms.filter((room) => below.has(room.id) && !room.isInvite).map((room) => room.id);
}

export interface ViewMenuDeps {
  t: TFunction;
  client: WizardClient | null;
  rooms: RoomSummary[];
  graph: SpaceNode[];
  sendReadReceipts: boolean;
  onNewDm?: () => void;
  onCreateRoom?: () => void;
  onCreateSection?: () => void;
}

export function buildHomeMenu(deps: ViewMenuDeps): ContextMenuItem[] {
  const { t, client, rooms, graph, sendReadReceipts, onCreateRoom, onCreateSection } = deps;
  const homeIds = getHomeRoomIds(rooms, graph);
  const items: ContextMenuItem[] = [];
  items.push({
    label: t('common.markRead'),
    icon: <EnvelopeSimpleOpenIcon size={14} />,
    disabled: !hasJoinedUnreadRooms(rooms, homeIds),
    onClick: () => markRoomsAsRead(client, sendReadReceipts, unreadRoomIds(rooms, homeIds)),
  });
  if (onCreateRoom) {
    items.push({ divider: true, label: '', onClick: () => {} });
    items.push({
      label: t('room.create.title'),
      icon: <PlusIcon size={14} />,
      onClick: onCreateRoom,
    });
  }
  if (onCreateSection) {
    items.push({
      label: t('room.sections.new'),
      icon: <FolderSimplePlusIcon size={14} />,
      onClick: onCreateSection,
    });
  }
  return items;
}

export function buildDmsMenu(deps: ViewMenuDeps): ContextMenuItem[] {
  const { t, client, rooms, sendReadReceipts, onNewDm } = deps;
  const dmIds = getDmRoomIds(rooms);
  const items: ContextMenuItem[] = [];
  items.push({
    label: t('common.markRead'),
    icon: <EnvelopeSimpleOpenIcon size={14} />,
    disabled: !hasJoinedUnreadRooms(rooms, dmIds),
    onClick: () => markRoomsAsRead(client, sendReadReceipts, unreadRoomIds(rooms, dmIds)),
  });
  if (onNewDm) {
    items.push({ divider: true, label: '', onClick: () => {} });
    items.push({
      label: t('room.dm.newDm'),
      icon: <ChatCircleIcon size={14} />,
      onClick: onNewDm,
    });
  }
  return items;
}

export interface SpaceMenuDeps {
  t: TFunction;
  navigate: NavigateFunction;
  rooms: RoomSummary[];
  graph: SpaceNode[];
  roomActions: {
    client: WizardClient | null;
    inviteToRoom: (state: { roomId: string; name: string; isSpace: boolean }) => void;
    leaveSpace: (roomId: string, name: string) => void;
  };
  toast: {
    info: (msg: string) => void;
    error: (msg: string) => void;
    success: (msg: string) => void;
  };
  pinnedSubSpaces: Set<string>;
  setPinnedSubSpacesArr: (fn: (prev: string[]) => string[]) => void;
  setSpaceSettings: (roomId: string) => void;
  markSpaceAsRead: (spaceId: string) => void;
  onCreateSection?: () => void;
}

export function buildSpaceMenu(space: SpaceEntry, deps: SpaceMenuDeps): ContextMenuItem[] {
  const {
    t,
    navigate,
    rooms,
    graph,
    roomActions,
    pinnedSubSpaces,
    setPinnedSubSpacesArr,
    setSpaceSettings,
    markSpaceAsRead,
  } = deps;

  const items: ContextMenuItem[] = [];
  items.push({
    label: t('common.markRead'),
    icon: <EnvelopeSimpleOpenIcon size={14} />,
    disabled: !spaceHasJoinedUnread(rooms, graph, space.roomId),
    onClick: () => markSpaceAsRead(space.roomId),
  });
  items.push({ divider: true, label: '', onClick: () => {} });
  items.push({
    label: t('space.overview'),
    icon: <StackIcon size={14} />,
    onClick: () =>
      navigate(`/space/${encodeURIComponent(space.roomId)}`, {
        state: { sidebarView: 'space', currentSpaceId: space.roomId },
      }),
  });
  if (deps.onCreateSection) {
    items.push({
      label: t('room.sections.new'),
      icon: <FolderSimplePlusIcon size={14} />,
      onClick: deps.onCreateSection,
    });
  }
  if (pinnedSubSpaces.has(space.roomId)) {
    items.push({
      label: t('space.unpinFromSidebar'),
      icon: <PushPinIcon size={14} weight="fill" />,
      onClick: () => setPinnedSubSpacesArr((prev) => prev.filter((id) => id !== space.roomId)),
    });
    items.push({ divider: true, label: '', onClick: () => {} });
  }
  items.push(
    {
      label: t('common.invite'),
      icon: <UserPlusIcon size={14} />,
      onClick: () =>
        roomActions.inviteToRoom({ roomId: space.roomId, name: space.name, isSpace: true }),
    },
    {
      label: t('common.copyLink'),
      icon: <LinkSimpleIcon size={14} />,
      onClick: () => {
        navigator.clipboard.writeText(makeRoomPermalink({ id: space.roomId })).catch(() => {});
      },
    },
    {
      label: t('common.settings'),
      icon: <GearIcon size={14} />,
      onClick: () => setSpaceSettings(space.roomId),
    },
    {
      divider: true,
      label: '',
      onClick: () => {},
    },
    {
      label: t('space.leave'),
      icon: <SignOutIcon size={14} />,
      danger: true,
      onClick: () => roomActions.leaveSpace(space.roomId, space.name),
    }
  );
  return items;
}

export function markSpaceAsRead(
  client: WizardClient | null,
  sendReadReceipts: boolean,
  spaceId: string,
  rooms: RoomSummary[],
  graph: SpaceNode[]
): void {
  markRoomsAsRead(
    client,
    sendReadReceipts,
    unreadRoomIds(rooms, spaceRoomIds(rooms, graph, spaceId))
  );
}

export function markRoomsAsRead(
  client: WizardClient | null,
  sendReadReceipts: boolean,
  roomIds: string[]
): void {
  if (!client) return;
  for (const roomId of roomIds) {
    void markRoomAsRead(client, roomId, sendReadReceipts);
  }
}

export function getHomeRoomIds(rooms: RoomSummary[], graph: SpaceNode[]): string[] {
  return rooms
    .filter(
      (room) =>
        !room.isInvite && !room.isDirect && !room.isTombstoned && !isInAnySpace(graph, room.id)
    )
    .map((r) => r.id);
}

export function getDmRoomIds(rooms: RoomSummary[]): string[] {
  return rooms
    .filter((room) => !room.isInvite && room.isDirect && !room.isTombstoned)
    .map((r) => r.id);
}
