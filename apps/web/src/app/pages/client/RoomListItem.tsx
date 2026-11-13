import { memo, useCallback } from 'react';
import { useAtom, useAtomValue, useStore } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  GearIcon,
  UserPlusIcon,
  SignOutIcon,
  EnvelopeSimpleOpenIcon,
  EnvelopeSimpleIcon,
  ChatTextIcon,
  BellIcon,
  BellSimpleIcon,
  BellRingingIcon,
  BellSlashIcon,
  LinkSimpleIcon,
  StarIcon,
  FolderSimpleIcon,
  FolderSimplePlusIcon,
  FolderSimpleMinusIcon,
} from '@phosphor-icons/react';
import {
  roomSettingsRoomIdAtom,
  favouriteRoomsAtom,
  currentSpaceIdAtom,
  sidebarViewAtom,
} from '@/app/store/atoms';
import { HOME_SPACE, getRoomSectionTag } from '@/app/features/room/roomSections';
import { usePrompt } from '@/app/hooks/usePrompt';
import type { ContextMenuItem } from '@/app/features/contextMenu/contextMenuAtom';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { markRoomAsRead } from './markAsRead';
import { sendReadReceiptsAtom, showRoomAvatarsAtom } from '@/app/store/atoms/settings';
import { useToast } from '@/app/hooks/useToast';
import { useContextMenu } from '@/app/hooks/useContextMenu';
import { useRoomActions } from './hooks/useRoomActions';
import { useRoomNotifLevel } from '@/app/hooks/useRoomNotifLevel';
import type { NotifLevel } from '@/app/hooks/useNotifications';
import { ChatListItem } from './ChatListItem';
import { getErrorMessage } from '@/util/error';
import { makeRoomPermalink } from '@/util/matrix';
import { roomSectionsAtom, roomTagNamesAtom, useRoom } from '@/app/data';
import type { RoomEntry } from '@/app/features/room/useRooms';
import type { DmEntry } from '@/app/hooks/useDms';

function notifMenuItems(
  level: NotifLevel,
  setLevel: (level: NotifLevel) => void,
  t: (key: string) => string
) {
  const options: { value: NotifLevel; label: string; icon: React.ReactNode }[] = [
    { value: 'default', label: t('room.notifications.default'), icon: <BellIcon size={14} /> },
    { value: 'all', label: t('room.notifications.all'), icon: <BellRingingIcon size={14} /> },
    {
      value: 'mentions',
      label: t('room.notifications.mentions'),
      icon: <BellSimpleIcon size={14} />,
    },
    { value: 'mute', label: t('room.notifications.mute'), icon: <BellSlashIcon size={14} /> },
  ];
  return options.map((opt) => ({
    label: opt.label,
    icon: opt.icon,
    checked: level === opt.value,
    onClick: () => setLevel(opt.value),
  }));
}

function notifMenuItem(
  level: NotifLevel,
  setLevel: (level: NotifLevel) => void,
  t: (key: string) => string
) {
  return {
    label: t('room.notifications.title'),
    icon: <BellIcon size={14} />,
    submenu: notifMenuItems(level, setLevel, t),
    onClick: () => {},
  };
}

interface RoomListItemProps {
  entry: RoomEntry;
  isActive: boolean;
  hasActiveCall?: boolean;
  isInCall?: boolean;
  voiceMembers?: string[];
  compactVoice?: boolean;
  onSelect: (roomId: string) => void;
  onOpenChat: (roomId: string) => void;
  onOpenChatOnly?: (roomId: string) => void;
}

export const RoomListItem = memo(function RoomListItem({
  entry,
  isActive,
  hasActiveCall,
  isInCall,
  voiceMembers,
  compactVoice,
  onSelect,
  onOpenChat,
  onOpenChatOnly,
}: RoomListItemProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { openContextMenu } = useContextMenu();
  const roomActions = useRoomActions();
  const [, setRoomSettings] = useAtom(roomSettingsRoomIdAtom);
  const sendReadReceipts = useAtomValue(sendReadReceiptsAtom);
  const showRoomAvatars = useAtomValue(showRoomAvatarsAtom);
  const { level, setLevel } = useRoomNotifLevel(entry.roomId);
  const favourite = useAtomValue(favouriteRoomsAtom).has(entry.roomId);
  const sidebarView = useAtomValue(sidebarViewAtom);
  const currentSpaceId = useAtomValue(currentSpaceIdAtom);
  const prompt = usePrompt();
  const store = useStore();
  const client = getMatrixClientOrNull();
  const room = useRoom(entry.roomId);

  const sectionMenu = useCallback((): ContextMenuItem => {
    const sections = store.get(roomSectionsAtom);
    const current = getRoomSectionTag(store.get(roomTagNamesAtom).get(entry.roomId), sections);
    const fail = (err: unknown) =>
      toast.error(t('room.sections.failed', { error: getErrorMessage(err) }));
    const move = (tag: string | null) => {
      if (client) client.setRoomSection(entry.roomId, tag).catch(fail);
    };
    const context = sidebarView === 'space' && currentSpaceId ? currentSpaceId : HOME_SPACE;
    return {
      label: t('room.sections.moveTo'),
      icon: <FolderSimpleIcon size={14} />,
      onClick: () => {},
      submenu: [
        ...sections.map((sec) => ({
          label: sec.name,
          checked: sec.tag === current,
          onClick: () => move(sec.tag === current ? null : sec.tag),
        })),
        ...(sections.length > 0 ? [{ divider: true, label: '', onClick: () => {} }] : []),
        {
          label: t('room.sections.new'),
          icon: <FolderSimplePlusIcon size={14} />,
          onClick: async () => {
            const name = (await prompt({ title: t('room.sections.newTitle') }))?.trim();
            if (!name || !client) return;
            client
              .createRoomSection(name, context)
              .then((tag) => client.setRoomSection(entry.roomId, tag))
              .catch(fail);
          },
        },
        ...(current
          ? [
              {
                label: t('room.sections.remove'),
                icon: <FolderSimpleMinusIcon size={14} />,
                onClick: () => move(null),
              },
            ]
          : []),
      ],
    };
  }, [client, store, entry.roomId, sidebarView, currentSpaceId, prompt, toast, t]);

  const handleClick = useCallback(() => {
    onSelect(entry.roomId);
  }, [onSelect, entry.roomId]);

  const handleDoubleClick = useCallback(() => {
    onOpenChat(entry.roomId);
  }, [onOpenChat, entry.roomId]);

  const handleMarkAsRead = useCallback(() => {
    if (!client) return;
    void markRoomAsRead(client, entry.roomId, sendReadReceipts);
  }, [client, entry.roomId, sendReadReceipts]);

  const handleMarkAsUnread = useCallback(() => {
    client?.setMarkedUnread(entry.roomId, true).catch(() => {});
  }, [client, entry.roomId]);

  const handleCopyLink = useCallback(() => {
    if (!room) return;
    navigator.clipboard.writeText(makeRoomPermalink(room)).catch(() => {});
  }, [room]);

  const handleToggleFavourite = useCallback(async () => {
    if (!client) return;
    try {
      if (!favourite) await client.setRoomSection(entry.roomId, null);
      await client.setFavourite(entry.roomId, !favourite);
    } catch (err) {
      toast.error(t('room.toggleFavouriteFailed', { error: getErrorMessage(err) }));
    }
  }, [client, entry.roomId, favourite, toast, t]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      openContextMenu(e, [
        ...(entry.hasVoiceRoom
          ? [
              {
                label: t('room.openChat'),
                icon: <ChatTextIcon size={14} />,
                onClick: () => onOpenChatOnly?.(entry.roomId),
              },
            ]
          : []),
        entry.unreadCount === 0 && !entry.hasNotif
          ? {
              label: t('nav.markAsUnread'),
              icon: <EnvelopeSimpleIcon size={14} />,
              onClick: handleMarkAsUnread,
            }
          : {
              label: t('common.markRead'),
              icon: <EnvelopeSimpleOpenIcon size={14} />,
              onClick: handleMarkAsRead,
            },
        {
          divider: true,
          label: '',
          onClick: () => {},
        },
        {
          label: favourite ? t('room.removeFavourite') : t('room.addFavourite'),
          icon: <StarIcon size={14} weight={favourite ? 'fill' : 'regular'} />,
          onClick: handleToggleFavourite,
        },
        sectionMenu(),
        {
          divider: true,
          label: '',
          onClick: () => {},
        },
        {
          label: t('common.invite'),
          icon: <UserPlusIcon size={14} />,
          onClick: () =>
            roomActions.inviteToRoom({ roomId: entry.roomId, name: entry.name, isSpace: false }),
        },
        {
          label: t('common.copyLink'),
          icon: <LinkSimpleIcon size={14} />,
          onClick: handleCopyLink,
        },
        {
          label: t('common.settings'),
          icon: <GearIcon size={14} />,
          onClick: () => setRoomSettings(entry.roomId),
        },
        {
          divider: true,
          label: '',
          onClick: () => {},
        },
        notifMenuItem(level, setLevel, t),
        {
          divider: true,
          label: '',
          onClick: () => {},
        },
        {
          label: t('room.leaveRoom'),
          icon: <SignOutIcon size={14} />,
          danger: true,
          onClick: () => roomActions.leaveRoom(entry.roomId, entry.name),
        },
      ]);
    },
    [
      openContextMenu,
      roomActions,
      setRoomSettings,
      entry.roomId,
      entry.name,
      handleMarkAsRead,
      handleMarkAsUnread,
      handleCopyLink,
      handleToggleFavourite,
      sectionMenu,
      onOpenChatOnly,
      entry.hasVoiceRoom,
      entry.unreadCount,
      entry.hasNotif,
      favourite,
      t,
      level,
      setLevel,
    ]
  );

  return (
    <ChatListItem
      name={entry.name}
      roomId={entry.roomId}
      avatarMxc={entry.avatarMxc}
      isActive={isActive}
      unread={entry.unreadCount}
      hasNotif={entry.hasNotif}
      hasVoiceRoom={entry.hasVoiceRoom}
      hasActiveCall={hasActiveCall}
      isInCall={isInCall}
      voiceMembers={voiceMembers}
      compactVoice={compactVoice}
      isMuted={level === 'mute'}
      showTypeBadge={true}
      hideAvatar={!showRoomAvatars}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMenuClick={handleContextMenu}
    />
  );
});

interface DmListItemProps {
  entry: DmEntry;
  isActive: boolean;
  hasActiveCall?: boolean;
  isInCall?: boolean;
  onSelect: (roomId: string, isDm: boolean) => void;
}

export const DmListItem = memo(function DmListItem({
  entry,
  isActive,
  hasActiveCall,
  isInCall,
  onSelect,
}: DmListItemProps) {
  const { t } = useTranslation();
  const { openContextMenu } = useContextMenu();
  const roomActions = useRoomActions();
  const { level, setLevel } = useRoomNotifLevel(entry.roomId);
  const client = getMatrixClientOrNull();
  const sendReadReceipts = useAtomValue(sendReadReceiptsAtom);
  const [, setRoomSettings] = useAtom(roomSettingsRoomIdAtom);

  const handleClick = useCallback(() => {
    onSelect(entry.roomId, true);
  }, [onSelect, entry.roomId]);

  const handleMarkAsRead = useCallback(() => {
    if (!client) return;
    void markRoomAsRead(client, entry.roomId, sendReadReceipts);
  }, [client, entry.roomId, sendReadReceipts]);

  const handleMarkAsUnread = useCallback(() => {
    client?.setMarkedUnread(entry.roomId, true).catch(() => {});
  }, [client, entry.roomId]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      openContextMenu(e, [
        entry.unreadCount === 0 && !entry.hasNotif
          ? {
              label: t('nav.markAsUnread'),
              icon: <EnvelopeSimpleIcon size={14} />,
              onClick: handleMarkAsUnread,
            }
          : {
              label: t('common.markRead'),
              icon: <EnvelopeSimpleOpenIcon size={14} />,
              onClick: handleMarkAsRead,
            },
        {
          divider: true,
          label: '',
          onClick: () => {},
        },
        {
          label: t('common.settings'),
          icon: <GearIcon size={14} />,
          onClick: () => setRoomSettings(entry.roomId),
        },
        {
          divider: true,
          label: '',
          onClick: () => {},
        },
        notifMenuItem(level, setLevel, t),
        {
          divider: true,
          label: '',
          onClick: () => {},
        },
        {
          label: t('room.dm.leaveDm'),
          icon: <SignOutIcon size={14} />,
          danger: true,
          onClick: () => roomActions.leaveRoom(entry.roomId, entry.partnerName),
        },
      ]);
    },
    [
      openContextMenu,
      roomActions,
      setRoomSettings,
      entry.roomId,
      entry.partnerName,
      entry.unreadCount,
      entry.hasNotif,
      handleMarkAsRead,
      handleMarkAsUnread,
      t,
      level,
      setLevel,
    ]
  );

  return (
    <ChatListItem
      name={entry.partnerName}
      roomId={entry.roomId}
      avatarMxc={entry.avatarMxc}
      avatarPlaceholder="logo"
      isActive={isActive}
      unread={entry.unreadCount}
      hasNotif={entry.hasNotif}
      hasActiveCall={hasActiveCall}
      isInCall={isInCall}
      isMuted={level === 'mute'}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMenuClick={handleContextMenu}
    />
  );
});
