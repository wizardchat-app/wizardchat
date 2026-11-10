import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretDownIcon,
  DotsThreeVerticalIcon,
  HouseIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Tooltip } from '@/app/components/Tooltip';
import { IconButton } from '@/app/components/Button';
import {
  currentRoomIdAtom,
  currentSpaceIdAtom,
  sidebarViewAtom,
  createRoomOpenAtom,
  newDmOpenAtom,
  closedNavCategoriesAtom,
  pinnedSubSpacesAtom,
  spaceSettingsRoomIdAtom,
  mobileDrawerOpenAtom,
  favouriteRoomsAtom,
  openRoomChatAtom,
} from '@/app/store/atoms';
import { useToast } from '@/app/hooks/useToast';
import { useContextMenu } from '@/app/hooks/useContextMenu';
import { useContextMenuTrigger } from '@/app/hooks/useContextMenuTrigger';
import { useDms } from '@/app/hooks/useDms';
import { useRooms, useSpaces } from '@/app/features/room';
import { useSpaceHierarchy } from '@/app/features/room/useSpaceHierarchy';
import type { RoomEntry } from '@/app/features/room/useRooms';
import type {
  HierarchyItem,
  HierarchyRoomItem,
  HierarchySpaceItem,
} from '@/app/features/room/useSpaceHierarchy';
import { CallBar } from '@/app/features/calls/CallBar';
import {
  callActionsAtom,
  callUiAtom,
  leavingCallRoomIdAtom,
  pendingCallRoomIdAtom,
} from '@/app/store/atoms/call';
import { computeParticipantsBlockHeight } from '@/app/features/voice/participantSize';
import { useTouchUi, useUiDensitySizes } from '@/app/hooks/useUiDensitySync';
import { Avatar } from '@/app/components/Avatar';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useRoomActions } from './hooks/useRoomActions';
import { sendReadReceiptsAtom, showRoomAvatarsAtom } from '@/app/store/atoms/settings';
import { buildSpaceMenu, markSpaceAsRead, buildHomeMenu, buildDmsMenu } from './spaceContextMenu';
import { RoomListItem, DmListItem } from './RoomListItem';
import { UserPanel } from './UserPanel';
import { isTextFieldTarget } from '@/app/features/keyboardShortcuts/keyEvents';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import * as css from './RoomListPanel.css';
import * as itemCss from './ChatListItem.css';
import {
  planSpaceReorder,
  saveFavouriteOrder,
  saveHomeOrder,
  saveSpaceChildOrders,
  sortFavourites,
  applyPendingOrder,
  useFavouriteOrders,
} from '@/app/features/room/roomOrder';
import { isValidSpaceOrder } from '@/app/features/room/roomOrder';
import {
  canSendState,
  childrenOf,
  queryKeys,
  roomsByIdAtom,
  useAllRooms,
  useRoomDetails,
  useRoomSections,
  useRoomTagNames,
  useSpaceGraph,
} from '@/app/data';
import { getErrorMessage } from '@/util/error';
import {
  RoomReorderProvider,
  SortableHeaderRow,
  SortableRoomRow,
  type ReorderRow,
} from './RoomReorder';
import * as reorderCss from './RoomReorder.css';
import {
  HOME_SPACE,
  getRoomSectionTag,
  ROOMS_ANCHOR,
  type RoomSection,
} from '@/app/features/room/roomSections';
import { usePrompt } from '@/app/hooks/usePrompt';
import { useConfirm } from '@/app/hooks/useConfirm';
import { isVoiceRoom } from '@/util/matrix';

const LIST_OVERSCAN = 5;

const noop = () => {};

const HOME_FAVOURITES_CATEGORY = 'home-favourites';
const HOME_ROOMS_CATEGORY = 'home-rooms';

type HomeListItem =
  | {
      kind: 'header';
      itemKey: string;
      label: string;
      hasNotif: boolean;
      hasMention: boolean;
      showAdd: boolean;
    }
  | SectionListItem
  | { kind: 'room'; entry: RoomEntry; compact?: boolean };

type SpaceListItem =
  | { kind: 'header'; item: HierarchySpaceItem }
  | SectionListItem
  | { kind: 'room'; item: HierarchyRoomItem; compact?: boolean };

type SectionListItem = {
  kind: 'section';
  key: string;
  section: RoomSection;
  hasNotif: boolean;
  hasMention: boolean;
};

const SECTION_ROWS = 'section';

interface RoomListPanelProps {
  onVoiceJoin: (roomId: string) => void;
}

interface SubspaceCategoryHeaderProps {
  item: HierarchySpaceItem;
  isClosed: boolean;
  onToggle: (categoryKey: string) => void;
  onAdd: (e: React.MouseEvent, item: HierarchySpaceItem) => void;
  onMenu?: (e: React.MouseEvent) => void;
  client: ReturnType<typeof getMatrixClientOrNull>;
}

function SubspaceCategoryHeader({
  item,
  isClosed,
  onToggle,
  onAdd,
  onMenu,
  client,
  showAvatar,
}: SubspaceCategoryHeaderProps & { showAvatar: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      className={css.subspaceCategoryHeader}
      onClick={() => onToggle(item.categoryKey)}
      onContextMenu={onMenu}
    >
      <button
        type="button"
        className={css.subspaceToggle}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(item.categoryKey);
        }}
        aria-expanded={!isClosed}
      >
        {showAvatar && !item.isRoot && (
          <Avatar name={item.name} mxcUrl={item.avatarMxc} client={client ?? undefined} size="xs" />
        )}
        <span className={css.subspaceName}>{item.isRoot ? 'Rooms' : item.name}</span>
        <CaretDownIcon
          size={10}
          weight="bold"
          className={[css.subspaceChevron, isClosed ? css.subspaceChevronClosed : '']
            .filter(Boolean)
            .join(' ')}
        />
        <span className={css.subspaceSpacer} />
        {item.hasNotif && (
          <span
            className={item.hasMention ? css.subspaceUnreadDotMention : css.subspaceUnreadDot}
          />
        )}
      </button>
      <Tooltip content={t('room.create.title')}>
        <button
          type="button"
          aria-label={t('room.create.title')}
          className={css.subspaceAddButton}
          onClick={(e) => {
            e.stopPropagation();
            onAdd(e, item);
          }}
        >
          <PlusIcon size={12} weight="bold" />
        </button>
      </Tooltip>
      {onMenu && (
        <Tooltip content={t('room.sections.options')}>
          <button
            type="button"
            aria-label={t('room.sections.options')}
            className={css.subspaceAddButton}
            onClick={(e) => {
              e.stopPropagation();
              onMenu(e);
            }}
          >
            <DotsThreeVerticalIcon size={14} weight="bold" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

function HomeCategoryHeader({
  label,
  isClosed,
  onToggle,
  hasNotif,
  hasMention,
  showAdd,
  onAdd,
  onMenu,
}: {
  label: string;
  isClosed: boolean;
  onToggle: () => void;
  hasNotif?: boolean;
  hasMention?: boolean;
  showAdd?: boolean;
  onAdd?: (e: React.MouseEvent) => void;
  onMenu?: (e: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={css.subspaceCategoryHeader} onClick={onToggle} onContextMenu={onMenu}>
      <button
        type="button"
        className={css.subspaceToggle}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-expanded={!isClosed}
      >
        <span className={css.subspaceName}>{label}</span>
        <CaretDownIcon
          size={10}
          weight="bold"
          className={[css.subspaceChevron, isClosed ? css.subspaceChevronClosed : '']
            .filter(Boolean)
            .join(' ')}
        />
        <span className={css.subspaceSpacer} />
        {hasNotif && (
          <span className={hasMention ? css.subspaceUnreadDotMention : css.subspaceUnreadDot} />
        )}
      </button>
      {showAdd && onAdd && (
        <Tooltip content={t('room.create.title')}>
          <button
            type="button"
            aria-label={t('room.create.title')}
            className={css.subspaceAddButton}
            onClick={(e) => {
              e.stopPropagation();
              onAdd(e);
            }}
          >
            <PlusIcon size={12} weight="bold" />
          </button>
        </Tooltip>
      )}
      {onMenu && (
        <Tooltip content={t('room.sections.options')}>
          <button
            type="button"
            aria-label={t('room.sections.options')}
            className={css.subspaceAddButton}
            onClick={(e) => {
              e.stopPropagation();
              onMenu(e);
            }}
          >
            <DotsThreeVerticalIcon size={14} weight="bold" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

export function RoomListPanel({ onVoiceJoin }: RoomListPanelProps) {
  const { t } = useTranslation();
  const { roomRow: roomItemHeight, categoryHeader: categoryHeaderHeight } = useUiDensitySizes();
  const touchUi = useTouchUi();
  const [currentRoomId, setCurrentRoomId] = useAtom(currentRoomIdAtom);
  const [currentSpaceId] = useAtom(currentSpaceIdAtom);
  const [sidebarView] = useAtom(sidebarViewAtom);
  const [, setCreateRoomOpen] = useAtom(createRoomOpenAtom);
  const [, setNewDmOpen] = useAtom(newDmOpenAtom);
  const callUi = useAtomValue(callUiAtom);
  const callActions = useAtomValue(callActionsAtom);
  const [closedNavCategoriesArr, setClosedNavCategoriesArr] = useAtom(closedNavCategoriesAtom);
  const favouriteRooms = useAtomValue(favouriteRoomsAtom);
  const navigate = useNavigate();
  const location = useLocation();
  const client = getMatrixClientOrNull();
  const toast = useToast();
  const { openContextMenu } = useContextMenu();
  const roomActions = useRoomActions();
  const [pinnedSubSpacesArr, setPinnedSubSpacesArr] = useAtom(pinnedSubSpacesAtom);
  const pinnedSubSpaces = useMemo(() => new Set(pinnedSubSpacesArr), [pinnedSubSpacesArr]);
  const [, setSpaceSettings] = useAtom(spaceSettingsRoomIdAtom);
  const sendReadReceipts = useAtomValue(sendReadReceiptsAtom);
  const showRoomAvatars = useAtomValue(showRoomAvatarsAtom);
  const { spaces } = useSpaces();
  const setDrawerOpen = useSetAtom(mobileDrawerOpenAtom);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const handleNewSectionRef = useRef<() => Promise<void>>(async () => {});
  const currentSpaceEntry = useMemo(
    () => spaces.find((s) => s.roomId === currentSpaceId) ?? null,
    [spaces, currentSpaceId]
  );

  const allRooms = useAllRooms();
  const spaceGraph = useSpaceGraph();
  const roomsById = useAtomValue(roomsByIdAtom);

  const handleMarkSpaceAsRead = useCallback(
    (spaceId: string) => {
      markSpaceAsRead(client, sendReadReceipts, spaceId, allRooms, spaceGraph);
    },
    [client, sendReadReceipts, allRooms, spaceGraph]
  );

  const onCreateRoom = useCallback(() => {
    setCreateRoomOpen({ open: true, spaceId: null, spaceName: null });
  }, [setCreateRoomOpen]);

  const onNewDm = useCallback(() => {
    setNewDmOpen(true);
  }, [setNewDmOpen]);

  const buildSpaceMenuItems = useCallback(() => {
    if (!currentSpaceEntry) return [];
    return buildSpaceMenu(currentSpaceEntry, {
      t,
      navigate,
      rooms: allRooms,
      graph: spaceGraph,
      roomActions,
      toast,
      pinnedSubSpaces,
      setPinnedSubSpacesArr,
      setSpaceSettings,
      markSpaceAsRead: handleMarkSpaceAsRead,
      onCreateSection: () => void handleNewSectionRef.current(),
    });
  }, [
    currentSpaceEntry,
    t,
    navigate,
    allRooms,
    spaceGraph,
    roomActions,
    toast,
    pinnedSubSpaces,
    setPinnedSubSpacesArr,
    setSpaceSettings,
    handleMarkSpaceAsRead,
  ]);

  const buildHomeMenuItems = useCallback(
    () =>
      buildHomeMenu({
        t,
        client,
        rooms: allRooms,
        graph: spaceGraph,
        sendReadReceipts,
        onCreateRoom,
        onCreateSection: () => void handleNewSectionRef.current(),
      }),
    [t, client, allRooms, spaceGraph, sendReadReceipts, onCreateRoom]
  );

  const buildDmsMenuItems = useCallback(
    () =>
      buildDmsMenu({
        t,
        client,
        rooms: allRooms,
        graph: spaceGraph,
        sendReadReceipts,
        onNewDm,
      }),
    [t, client, allRooms, spaceGraph, sendReadReceipts, onNewDm]
  );

  const spaceMenuTrigger = useContextMenuTrigger(buildSpaceMenuItems);
  const homeMenuTrigger = useContextMenuTrigger(buildHomeMenuItems);
  const dmMenuTrigger = useContextMenuTrigger(buildDmsMenuItems);

  const handleSpaceMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!currentSpaceEntry) return;
      openContextMenu(e, buildSpaceMenuItems());
    },
    [currentSpaceEntry, openContextMenu, buildSpaceMenuItems]
  );

  const handleSubspaceAdd = useCallback(
    (_e: React.MouseEvent, item: HierarchySpaceItem) => {
      setCreateRoomOpen({ open: true, spaceId: item.roomId, spaceName: item.name });
    },
    [setCreateRoomOpen]
  );

  const handleHomeAdd = useCallback(
    (_e: React.MouseEvent) => {
      setCreateRoomOpen({ open: true, spaceId: null, spaceName: null });
    },
    [setCreateRoomOpen]
  );

  const handleHomeMenu = useCallback(
    (e: React.MouseEvent) => {
      openContextMenu(e, buildHomeMenuItems());
    },
    [openContextMenu, buildHomeMenuItems]
  );

  const handleDmsMenu = useCallback(
    (e: React.MouseEvent) => {
      openContextMenu(e, buildDmsMenuItems());
    },
    [openContextMenu, buildDmsMenuItems]
  );

  const isDmView = sidebarView === 'dms';
  const isSpaceView = sidebarView === 'space' && !!currentSpaceId;

  const closedCategories = useMemo(() => new Set(closedNavCategoriesArr), [closedNavCategoriesArr]);

  const toggleCategory = useCallback(
    (categoryKey: string) => {
      setClosedNavCategoriesArr((prev) => {
        const next = new Set(prev);
        if (next.has(categoryKey)) {
          next.delete(categoryKey);
        } else {
          next.add(categoryKey);
        }
        return Array.from(next);
      });
    },
    [setClosedNavCategoriesArr]
  );

  const { rooms: homeRooms, loading: homeLoading } = useRooms();
  const dms = useDms();

  const hierarchyItems = useSpaceHierarchy(isSpaceView ? currentSpaceId : null, favouriteRooms);

  const spaceFavKey = isSpaceView && currentSpaceId ? `${currentSpaceId}::favourites` : null;
  const favouriteOrdersVersion = useFavouriteOrders();
  const roomTagNames = useRoomTagNames();
  const sections = useRoomSections();
  const [draggingSection, setDraggingSection] = useState(false);
  const roomsHeaderId =
    isSpaceView && currentSpaceId
      ? `hdr:${currentSpaceId}::${currentSpaceId}`
      : `hdr:${HOME_ROOMS_CATEGORY}`;
  const [dropGroup, setDropGroup] = useState<string | null>(null);
  const isCollapsed = useCallback(
    (key: string) => draggingSection || closedCategories.has(key),
    [draggingSection, closedCategories]
  );
  const prompt = usePrompt();
  const confirmDialog = useConfirm();
  const sectionContext = isSpaceView && currentSpaceId ? currentSpaceId : HOME_SPACE;

  const sectionError = useCallback(
    (err: unknown) => toast.error(t('room.sections.failed', { error: getErrorMessage(err) })),
    [toast, t]
  );

  const handleNewSection = useCallback(async () => {
    if (!client) return;
    const name = (await prompt({ title: t('room.sections.newTitle') }))?.trim();
    if (name) client.createRoomSection(name, sectionContext).catch(sectionError);
  }, [client, prompt, t, sectionContext, sectionError]);
  handleNewSectionRef.current = handleNewSection;

  const visibleAnchorsRef = useRef<string[]>([]);
  const moveItems = useCallback(
    (anchor: string) => {
      const anchors = visibleAnchorsRef.current;
      const index = anchors.indexOf(anchor);
      const move = (direction: -1 | 1) => {
        if (!client) return;
        const next = [...anchors];
        [next[index], next[index + direction]] = [next[index + direction], next[index]];
        client.setRoomSectionOrder(next).catch(sectionError);
      };
      return [
        {
          label: t('room.sections.moveUp'),
          icon: <ArrowUpIcon size={14} />,
          disabled: index <= 0,
          onClick: () => move(-1),
        },
        {
          label: t('room.sections.moveDown'),
          icon: <ArrowDownIcon size={14} />,
          disabled: index === -1 || index >= anchors.length - 1,
          onClick: () => move(1),
        },
      ];
    },
    [client, t, sectionError]
  );

  const openRoomsMenu = useCallback(
    (e: React.MouseEvent) => openContextMenu(e, moveItems(ROOMS_ANCHOR)),
    [openContextMenu, moveItems]
  );

  const openSectionMenu = useCallback(
    (e: React.MouseEvent, section: RoomSection) => {
      if (!client) return;
      openContextMenu(e, [
        {
          label: t('common.rename'),
          icon: <PencilSimpleIcon size={14} />,
          onClick: async () => {
            const name = (
              await prompt({ title: t('room.sections.renameTitle'), defaultValue: section.name })
            )?.trim();
            if (name && name !== section.name) {
              client.renameRoomSection(section.tag, name).catch(sectionError);
            }
          },
        },
        ...moveItems(section.tag),
        { divider: true, label: '', onClick: () => {} },
        {
          label: t('room.sections.delete'),
          icon: <TrashIcon size={14} />,
          danger: true,
          onClick: async () => {
            const ok = await confirmDialog({
              title: t('room.sections.deleteTitle', { name: section.name }),
              message: t('room.sections.deleteMessage'),
              confirmLabel: t('room.sections.delete'),
              danger: true,
            });
            if (ok) client.deleteRoomSection(section.tag).catch(sectionError);
          },
        },
      ]);
    },
    [client, openContextMenu, prompt, confirmDialog, t, sectionError, moveItems]
  );

  const renderSectionHeader = (item: SectionListItem) => (
    <SortableHeaderRow id={`sec:${item.section.tag}`} draggable>
      <HomeCategoryHeader
        label={item.section.name}
        isClosed={isCollapsed(item.key)}
        onToggle={() => toggleCategory(item.key)}
        hasNotif={item.hasNotif}
        hasMention={item.hasMention}
        showAdd
        onAdd={() =>
          setCreateRoomOpen({
            open: true,
            spaceId: isSpaceView ? currentSpaceId : null,
            spaceName:
              isSpaceView && currentSpaceId
                ? (currentSpaceDetails?.name ?? currentSpaceEntry?.name ?? null)
                : null,
            sectionTag: item.section.tag,
          })
        }
        onMenu={(e) => openSectionMenu(e, item.section)}
      />
    </SortableHeaderRow>
  );

  const groupBySection = useCallback(
    <T,>(roomItems: T[], roomIdOf: (item: T) => string) => {
      const bySection = new Map<string, T[]>(sections.map((sec) => [sec.tag, []]));
      const rest: T[] = [];
      for (const item of roomItems) {
        const tag = getRoomSectionTag(roomTagNames.get(roomIdOf(item)), sections);
        if (tag) bySection.get(tag)!.push(item);
        else rest.push(item);
      }
      const visible = sections.filter(
        (sec) => bySection.get(sec.tag)!.length > 0 || sec.spaceId === sectionContext
      );
      return { bySection, rest, visible };
    },
    [roomTagNames, sections, sectionContext]
  );

  const callRoomId = callUi.roomId;
  const keepWhenClosed = useCallback(
    (roomId: string) => roomId === currentRoomId || roomId === callRoomId,
    [currentRoomId, callRoomId]
  );
  const keepVisible = useCallback(
    (roomId: string) => !draggingSection && keepWhenClosed(roomId),
    [draggingSection, keepWhenClosed]
  );

  const spaceItemsBase = useMemo((): SpaceListItem[] => {
    if (!isSpaceView || !currentSpaceId || !client) return [];
    const favSet = favouriteRooms;

    const favRooms: HierarchyRoomItem[] = [];
    const nonFav: HierarchyItem[] = [];
    for (const item of hierarchyItems) {
      if (item.kind === 'room' && favSet.has(item.roomId)) favRooms.push(item);
      else nonFav.push(item);
    }
    const grouped = groupBySection(nonFav, (i) => i.roomId);
    const sectioned = new Set([...grouped.bySection.values()].flat().map((i) => i.roomId));
    const rest = nonFav.filter((i) => i.kind !== 'room' || !sectioned.has(i.roomId));

    const sectionBlock = (above: boolean): SpaceListItem[] =>
      grouped.visible
        .filter((sec) => sec.aboveRooms === above)
        .flatMap((sec) => {
          const rooms = grouped.bySection
            .get(sec.tag)!
            .filter((i): i is HierarchyRoomItem => i.kind === 'room');
          const key = `${currentSpaceId}::${sec.tag}`;
          const closed = isCollapsed(key);
          const hasMention = rooms.some((r) => r.entry.hasNotif);
          const out: SpaceListItem[] = [
            {
              kind: 'section',
              key,
              section: sec,
              hasMention,
              hasNotif: hasMention || rooms.some((r) => r.entry.unreadCount > 0),
            },
          ];
          for (const room of rooms) {
            if (closed && !keepVisible(room.roomId)) continue;
            out.push({ kind: 'room', item: room, compact: closed });
          }
          return out;
        });

    const items: SpaceListItem[] = [];
    if (favRooms.length > 0 && spaceFavKey) {
      const favClosed = isCollapsed(spaceFavKey);
      const favHasMention = favRooms.some((r) => r.entry.hasNotif);
      const favHasNotif = favHasMention || favRooms.some((r) => r.entry.unreadCount > 0);
      items.push({
        kind: 'header',
        item: {
          kind: 'space',
          roomId: spaceFavKey,
          categoryKey: spaceFavKey,
          name: t('nav.favourites'),
          avatarMxc: null,
          hasNotif: favHasNotif,
          hasMention: favHasMention,
          isRoot: false,
          depth: 0,
        },
      });
      for (const room of sortFavourites(
        favRooms,
        (r) => r.roomId,
        (r) => r.entry.name
      )) {
        if (favClosed && !keepVisible(room.roomId)) continue;
        items.push({ kind: 'room', item: room, compact: favClosed });
      }
    }

    items.push(...sectionBlock(true));

    const hasRootSection = rest.some((i) => i.kind === 'space' && i.isRoot);
    if (!hasRootSection) {
      items.push({
        kind: 'header',
        item: {
          kind: 'space',
          roomId: currentSpaceId,
          categoryKey: `${currentSpaceId}::${currentSpaceId}`,
          name: '',
          avatarMxc: null,
          hasNotif: false,
          hasMention: false,
          isRoot: true,
          depth: 0,
        },
      });
    }

    const filterRoom = (h: HierarchyItem): boolean => {
      if (h.kind !== 'room') return true;
      return keepVisible(h.roomId);
    };

    const collect = (list: HierarchyItem[]): SpaceListItem[] => {
      const out: SpaceListItem[] = [];
      const remaining = [...list];
      while (remaining.length > 0) {
        const head = remaining.shift()!;
        if (head.kind === 'room') {
          out.push({ kind: 'room', item: head });
          continue;
        }
        const depth = head.depth;
        const chunk: HierarchyItem[] = [];
        while (remaining.length > 0 && remaining[0].depth > depth) {
          chunk.push(remaining.shift()!);
        }
        const closed = isCollapsed(head.categoryKey);
        const fullyOpen = !closed;
        if (fullyOpen || head.isRoot || chunk.length > 0) {
          out.push({ kind: 'header', item: head });
          if (fullyOpen) {
            out.push(...collect(chunk));
          } else {
            for (const sub of collect(chunk)) {
              const direct = sub.kind === 'room' && sub.item.depth === head.depth + 1;
              if (direct && !filterRoom(sub.item)) continue;
              out.push(direct ? { ...sub, compact: true } : sub);
            }
          }
        }
      }
      return out;
    };

    const collected = collect(rest);
    const split = collected.findIndex((it) => it.kind === 'header' && !it.item.isRoot);
    const roomsPart = split === -1 ? collected : collected.slice(0, split);
    const subspacePart = split === -1 ? [] : collected.slice(split);
    return items.concat(roomsPart, sectionBlock(false), subspacePart);
  }, [
    groupBySection,
    isCollapsed,
    isSpaceView,
    currentSpaceId,
    client,
    favouriteRooms,
    hierarchyItems,
    keepVisible,
    spaceFavKey,
    favouriteOrdersVersion,
    t,
  ]);

  const spaceVoiceRoomIds = useMemo(
    () =>
      spaceItemsBase
        .filter((i): i is Extract<SpaceListItem, { kind: 'room' }> => i.kind === 'room')
        .filter((i) => i.item.entry.hasVoiceRoom)
        .map((i) => i.item.roomId),
    [spaceItemsBase]
  );
  const homeVoiceRoomIds = useMemo(
    () => homeRooms.filter((r) => r.hasVoiceRoom).map((r) => r.roomId),
    [homeRooms]
  );
  const voiceRoomIds = isSpaceView ? spaceVoiceRoomIds : homeVoiceRoomIds;

  const listedRoomIds = useMemo(() => {
    if (isDmView) return dms.map((d) => d.roomId);
    if (isSpaceView) {
      return spaceItemsBase
        .filter((i): i is Extract<SpaceListItem, { kind: 'room' }> => i.kind === 'room')
        .map((i) => i.item.roomId);
    }
    return homeRooms.map((r) => r.roomId);
  }, [isDmView, isSpaceView, spaceItemsBase, dms, homeRooms]);

  const pendingCallRoomId = useAtomValue(pendingCallRoomIdAtom);
  const joiningRoomId = pendingCallRoomId ?? (callUi.phase !== 'idle' ? callUi.roomId : null);
  const myUserId = client?.userId() ?? null;
  const [leavingRoomId, setLeavingRoomId] = useAtom(leavingCallRoomIdAtom);
  const leavingStillListed = !!leavingRoomId && !!roomsById.get(leavingRoomId)?.inCall;

  useEffect(() => {
    if (leavingRoomId && !leavingStillListed) setLeavingRoomId(null);
  }, [leavingRoomId, leavingStillListed, setLeavingRoomId]);

  // Our own join and leave show right away, before the membership change syncs
  const callParticipantsByRoom = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const roomId of listedRoomIds) {
      const room = roomsById.get(roomId);
      if (!room) continue;
      let userIds = room.callParticipants;
      if (roomId === leavingRoomId && leavingStillListed) {
        userIds = userIds.filter((userId) => userId !== myUserId);
      }
      if (roomId === joiningRoomId && myUserId && room.isVoice && !userIds.includes(myUserId)) {
        userIds = [...userIds, myUserId];
      }
      if (userIds.length > 0) map.set(roomId, userIds);
    }
    return map;
  }, [listedRoomIds, roomsById, leavingRoomId, leavingStillListed, joiningRoomId, myUserId]);

  const participantCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const roomId of voiceRoomIds) {
      const count = callParticipantsByRoom.get(roomId)?.length ?? 0;
      if (count > 0) map.set(roomId, count);
    }
    return map;
  }, [callParticipantsByRoom, voiceRoomIds]);

  const getRoomEntryHeight = useCallback(
    (entry: RoomEntry, compact?: boolean) => {
      if (!entry.hasVoiceRoom) return roomItemHeight;
      const count = participantCounts.get(entry.roomId) ?? 0;
      return roomItemHeight + computeParticipantsBlockHeight(count, compact, touchUi);
    },
    [participantCounts, roomItemHeight, touchUi]
  );

  const homeItemsBase = useMemo((): HomeListItem[] => {
    if (isSpaceView || isDmView || !client) return [];
    const favSet = favouriteRooms;

    const favEntries: RoomEntry[] = [];
    for (const entry of homeRooms) {
      if (favSet.has(entry.roomId)) {
        favEntries.push(entry);
      }
    }

    const grouped = groupBySection(
      homeRooms.filter((entry) => !favSet.has(entry.roomId)),
      (e) => e.roomId
    );
    const otherEntries = grouped.rest;
    const pushSections = (above: boolean) => {
      for (const sec of grouped.visible.filter((x) => x.aboveRooms === above)) {
        const entries = grouped.bySection.get(sec.tag)!;
        const key = `${HOME_SPACE}::${sec.tag}`;
        const closed = isCollapsed(key);
        const hasMention = entries.some((entry) => entry.hasNotif);
        items.push({
          kind: 'section',
          key,
          section: sec,
          hasMention,
          hasNotif: hasMention || entries.some((entry) => entry.unreadCount > 0),
        });
        for (const entry of entries) {
          if (closed && !keepVisible(entry.roomId)) continue;
          items.push({ kind: 'room', entry, compact: closed });
        }
      }
    };

    const items: HomeListItem[] = [];
    const pushSection = (itemKey: string, entries: RoomEntry[]) => {
      const hasMention = entries.some((entry) => entry.hasNotif);
      const hasNotif = hasMention || entries.some((entry) => entry.unreadCount > 0);
      items.push({
        kind: 'header',
        itemKey,
        label: itemKey === HOME_FAVOURITES_CATEGORY ? t('nav.favourites') : t('nav.rooms'),
        hasNotif,
        hasMention,
        showAdd: itemKey === HOME_ROOMS_CATEGORY,
      });
      const closed = isCollapsed(itemKey);
      for (const entry of entries) {
        if (closed && !keepVisible(entry.roomId)) continue;
        items.push({ kind: 'room', entry, compact: closed });
      }
    };

    if (favEntries.length > 0) {
      pushSection(
        HOME_FAVOURITES_CATEGORY,
        sortFavourites(
          favEntries,
          (e) => e.roomId,
          (e) => e.name
        )
      );
    }
    pushSections(true);
    pushSection(HOME_ROOMS_CATEGORY, otherEntries);
    pushSections(false);
    return items;
  }, [
    groupBySection,
    isCollapsed,
    isSpaceView,
    isDmView,
    client,
    favouriteRooms,
    homeRooms,
    keepVisible,
    favouriteOrdersVersion,
    t,
  ]);

  const parentSpaceIds = useMemo(
    () =>
      Array.from(
        new Set(spaceItemsBase.flatMap((it) => (it.kind === 'room' ? [it.item.parentSpaceId] : [])))
      ),
    [spaceItemsBase]
  );
  const parentSpaceSettings = useQueries({
    queries: parentSpaceIds.map((spaceId) => ({
      queryKey: queryKeys.roomSettings(spaceId),
      queryFn: () => client!.roomSettings(spaceId),
      enabled: !!client,
      staleTime: 30_000,
    })),
  });
  const canEditSpace = useMemo(() => {
    const userId = client?.userId() ?? '';
    const allowed = new Set<string>();
    parentSpaceIds.forEach((spaceId, i) => {
      if (canSendState(parentSpaceSettings[i]?.data, userId, 'm.space.child')) allowed.add(spaceId);
    });
    return allowed;
  }, [client, parentSpaceIds, parentSpaceSettings]);

  const spaceReorderRows = useCallback(
    (items: SpaceListItem[]): ReorderRow[] => {
      const rows: ReorderRow[] = [];
      let headerKey: string | null = null;
      let group: string | null = null;
      for (const it of items) {
        if (it.kind === 'header') {
          headerKey = it.item.categoryKey;
          group = headerKey === spaceFavKey ? 'fav' : it.item.isRoot ? 'rooms' : 'subspaces';
          rows.push({
            id: `hdr:${headerKey}`,
            kind: 'header',
            group,
            section: null,
            anchor: it.item.isRoot ? ROOMS_ANCHOR : undefined,
          });
          continue;
        }
        if (it.kind === 'section') {
          headerKey = SECTION_ROWS;
          group = `section:${it.section.tag}`;
          rows.push({
            id: `sec:${it.section.tag}`,
            kind: 'header',
            group,
            section: null,
            anchor: it.section.tag,
          });
          continue;
        }
        if (headerKey === SECTION_ROWS) {
          rows.push({ id: it.item.roomId, kind: 'room', group, section: null });
          continue;
        }
        const isFavourite = headerKey !== null && headerKey === spaceFavKey;
        const closed = headerKey !== null && closedCategories.has(headerKey);
        const allowed = !closed && (isFavourite || canEditSpace.has(it.item.parentSpaceId));
        rows.push({
          id: it.item.roomId,
          kind: 'room',
          group,
          section: allowed ? (isFavourite ? 'fav' : `space:${it.item.parentSpaceId}`) : null,
        });
      }
      return rows;
    },
    [canEditSpace, spaceFavKey, closedCategories]
  );

  const homeReorderRows = useCallback(
    (items: HomeListItem[]): ReorderRow[] => {
      const rows: ReorderRow[] = [];
      let headerKey: string | null = null;
      let group: string | null = null;
      for (const it of items) {
        if (it.kind === 'header') {
          headerKey = it.itemKey;
          group = headerKey === HOME_FAVOURITES_CATEGORY ? 'fav' : 'rooms';
          rows.push({
            id: `hdr:${headerKey}`,
            kind: 'header',
            group,
            section: null,
            anchor: headerKey === HOME_ROOMS_CATEGORY ? ROOMS_ANCHOR : undefined,
          });
          continue;
        }
        if (it.kind === 'section') {
          headerKey = SECTION_ROWS;
          group = `section:${it.section.tag}`;
          rows.push({
            id: `sec:${it.section.tag}`,
            kind: 'header',
            group,
            section: null,
            anchor: it.section.tag,
          });
          continue;
        }
        if (headerKey === SECTION_ROWS) {
          rows.push({ id: it.entry.roomId, kind: 'room', group, section: null });
          continue;
        }
        const closed = headerKey !== null && closedCategories.has(headerKey);
        rows.push({
          id: it.entry.roomId,
          kind: 'room',
          group,
          section: closed ? null : headerKey === HOME_FAVOURITES_CATEGORY ? 'fav' : 'home',
        });
      }
      return rows;
    },
    [closedCategories]
  );

  const [pendingOrder, setPendingOrder] = useState<{ section: string; ids: string[] } | null>(null);
  const pendingSectionIds = useCallback(
    (rows: ReorderRow[]) =>
      new Set(
        rows.filter((r) => pendingOrder && r.section === pendingOrder.section).map((r) => r.id)
      ),
    [pendingOrder]
  );
  const spaceItems = useMemo(
    () =>
      applyPendingOrder(
        spaceItemsBase,
        pendingSectionIds(spaceReorderRows(spaceItemsBase)),
        pendingOrder?.ids ?? null,
        (it) => (it.kind === 'room' ? it.item.roomId : null)
      ),
    [spaceItemsBase, spaceReorderRows, pendingOrder, pendingSectionIds]
  );
  const homeItems = useMemo(
    () =>
      applyPendingOrder(
        homeItemsBase,
        pendingSectionIds(homeReorderRows(homeItemsBase)),
        pendingOrder?.ids ?? null,
        (it) => (it.kind === 'room' ? it.entry.roomId : null)
      ),
    [homeItemsBase, homeReorderRows, pendingOrder, pendingSectionIds]
  );
  const reorderRows = useMemo(
    () =>
      isSpaceView ? spaceReorderRows(spaceItems) : !isDmView ? homeReorderRows(homeItems) : [],
    [isSpaceView, isDmView, spaceItems, homeItems, spaceReorderRows, homeReorderRows]
  );
  visibleAnchorsRef.current = reorderRows.reduce<string[]>((list, row) => {
    if (row.kind !== 'header') return list;
    if (row.anchor && !list.includes(row.anchor)) list.push(row.anchor);
    return list;
  }, []);

  useEffect(() => {
    if (!pendingOrder) return;
    const base = isSpaceView ? spaceReorderRows(spaceItemsBase) : homeReorderRows(homeItemsBase);
    const synced = base.filter((r) => r.section === pendingOrder.section).map((r) => r.id);
    if (synced.join('|') === pendingOrder.ids.join('|')) {
      setPendingOrder(null);
      return;
    }
    const timer = setTimeout(() => setPendingOrder(null), 8000);
    return () => clearTimeout(timer);
  }, [pendingOrder, isSpaceView, spaceItemsBase, homeItemsBase, spaceReorderRows, homeReorderRows]);

  const handleReorder = useCallback(
    (section: string, orderedIds: string[], movedId: string) => {
      if (!client) return;
      setPendingOrder({ section, ids: orderedIds });
      let save: Promise<void>;
      if (section === 'fav') {
        save = saveFavouriteOrder(client, orderedIds);
      } else if (section === 'home') {
        save = saveHomeOrder(client, orderedIds);
      } else {
        const spaceId = section.slice('space:'.length);
        const children = childrenOf(spaceGraph, spaceId);
        if (children.length === 0) return;
        const orders = new Map(
          children.map((c) => [c.roomId, isValidSpaceOrder(c.order) ? c.order : undefined])
        );
        const updates = planSpaceReorder(orderedIds, orders, movedId);
        save = saveSpaceChildOrders(client, spaceId, updates);
      }
      save.catch((err: unknown) => {
        setPendingOrder(null);
        toast.error(t('nav.reorderFailed', { error: getErrorMessage(err) }));
      });
    },
    [client, spaceGraph, toast, t]
  );

  const handleMoveRoom = useCallback(
    (roomId: string, group: string) => {
      if (!client) return;
      let save: Promise<unknown>;
      if (group === 'fav') {
        save = client.setRoomSection(roomId, null).then(() => client.setFavourite(roomId, true));
      } else if (group === 'rooms' || group === 'subspaces') {
        save = client.setRoomSection(roomId, null);
      } else if (group.startsWith('section:')) {
        save = client.setRoomSection(roomId, group.slice('section:'.length));
      } else {
        return;
      }
      save.catch(sectionError);
    },
    [client, sectionError]
  );

  const handleReorderSections = useCallback(
    (anchors: string[]) => {
      if (client) client.setRoomSectionOrder(anchors).catch(sectionError);
    },
    [client, sectionError]
  );

  const renderDropBlock = (virtualizer: {
    measurementsCache: { start: number; end: number }[];
  }) => {
    if (!dropGroup) return null;
    const first = reorderRows.findIndex((r) => r.group === dropGroup);
    const last =
      reorderRows.length - 1 - [...reorderRows].reverse().findIndex((r) => r.group === dropGroup);
    const top = virtualizer.measurementsCache[first]?.start;
    const bottom = virtualizer.measurementsCache[last]?.end;
    if (first === -1 || top === undefined || bottom === undefined) return null;
    return <div className={reorderCss.dropBlock} style={{ top, height: bottom - top }} />;
  };

  const renderReorderOverlay = (roomId: string) => {
    if (roomId === roomsHeaderId) {
      return <HomeCategoryHeader label={t('nav.rooms')} isClosed={false} onToggle={noop} />;
    }
    if (roomId.startsWith('sec:')) {
      const tag = roomId.slice('sec:'.length);
      const name = sections.find((sec) => sec.tag === tag)?.name ?? '';
      return <HomeCategoryHeader label={name} isClosed={false} onToggle={noop} />;
    }
    const entry = isSpaceView
      ? spaceItems.find(
          (it): it is Extract<SpaceListItem, { kind: 'room' }> =>
            it.kind === 'room' && it.item.roomId === roomId
        )?.item.entry
      : homeItems.find(
          (it): it is Extract<HomeListItem, { kind: 'room' }> =>
            it.kind === 'room' && it.entry.roomId === roomId
        )?.entry;
    if (!entry) return null;
    return (
      <RoomListItem
        entry={entry}
        isActive={currentRoomId === roomId}
        hasActiveCall={callParticipantsByRoom.has(roomId) && !entry.hasVoiceRoom}
        isInCall={callUi.roomId === roomId}
        voiceMembers={callParticipantsByRoom.get(roomId)}
        onSelect={noop}
        onOpenChat={noop}
        onOpenChatOnly={noop}
      />
    );
  };

  const currentSpaceDetails = useRoomDetails(isSpaceView ? currentSpaceId : null);

  const roomListRef = useRef<HTMLDivElement>(null);
  const bottomDockRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = bottomDockRef.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const margin = parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      root.style.setProperty('--bottom-dock-inset', `${Math.ceil(rect.height + margin + 8)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--bottom-dock-inset');
    };
  }, []);

  const spaceVirtualizer = useVirtualizer({
    count: spaceItems.length,
    getScrollElement: () => roomListRef.current,
    estimateSize: (index) => {
      const item = spaceItems[index];
      if (item.kind !== 'room') return categoryHeaderHeight;
      return getRoomEntryHeight(item.item.entry, item.compact);
    },
    getItemKey: (index) => {
      const item = spaceItems[index];
      if (item.kind === 'section') return `section-${item.key}`;
      return item.kind === 'header'
        ? `header-${item.item.categoryKey}`
        : `room-${item.item.roomId}`;
    },
    overscan: LIST_OVERSCAN,
    enabled: isSpaceView,
  });

  const homeVirtualizer = useVirtualizer({
    count: homeItems.length,
    getScrollElement: () => roomListRef.current,
    estimateSize: (index) => {
      const item = homeItems[index];
      return item.kind !== 'room'
        ? categoryHeaderHeight
        : getRoomEntryHeight(item.entry, item.compact);
    },
    getItemKey: (index) => {
      const item = homeItems[index];
      if (item.kind === 'section') return `section-${item.key}`;
      return item.kind === 'header' ? `header-${item.itemKey}` : item.entry.roomId;
    },
    overscan: LIST_OVERSCAN,
    enabled: !isDmView && !isSpaceView,
  });

  const dmVirtualizer = useVirtualizer({
    count: dms.length,
    getScrollElement: () => roomListRef.current,
    estimateSize: () => roomItemHeight,
    overscan: LIST_OVERSCAN,
    enabled: isDmView,
  });

  useEffect(() => {
    spaceVirtualizer.measure();
    homeVirtualizer.measure();
    dmVirtualizer.measure();
  }, [roomItemHeight, categoryHeaderHeight, spaceVirtualizer, homeVirtualizer, dmVirtualizer]);

  useEffect(() => {
    if (isSpaceView) spaceVirtualizer.measure();
  }, [participantCounts, spaceItems, spaceVirtualizer, isSpaceView]);

  useEffect(() => {
    if (isSpaceView && roomListRef.current) {
      roomListRef.current.scrollTop = 0;
    }
  }, [currentSpaceId, isSpaceView]);

  useEffect(() => {
    if (!isSpaceView && !isDmView) homeVirtualizer.measure();
  }, [participantCounts, homeItems, homeVirtualizer, isSpaceView, isDmView]);

  const selectRoom = useCallback(
    (roomId: string, isDm = false) => {
      const room = roomsById.get(roomId);
      const navigateToRoom = () => {
        setCurrentRoomId(roomId);
        setDrawerOpen(false);
        navigate(`/${isDm ? 'dm' : 'r'}/${encodeURIComponent(roomId)}`, {
          state: { sidebarView, currentSpaceId },
        });
      };
      const isVoice = !isDm && !!room && isVoiceRoom(room);
      if (isVoice) {
        if (callUi.roomId === roomId) {
          navigateToRoom();
          callActions?.setPresentation('room');
          return;
        }
        onVoiceJoin(roomId);
        return;
      }
      navigateToRoom();
    },
    [
      setCurrentRoomId,
      navigate,
      sidebarView,
      currentSpaceId,
      roomsById,
      callUi.roomId,
      callActions,
      onVoiceJoin,
      setDrawerOpen,
    ]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (isTextFieldTarget(e)) return;
      let ids: string[];
      let virtualizer: { scrollToIndex: (index: number, opts?: { align?: 'auto' }) => void };
      if (isDmView) {
        ids = dms.map((d) => d.roomId);
        virtualizer = dmVirtualizer;
      } else if (isSpaceView) {
        ids = spaceItems.map((it) => (it.kind === 'room' ? it.item.roomId : ''));
        virtualizer = spaceVirtualizer;
      } else {
        ids = homeItems.map((it) => (it.kind === 'room' ? it.entry.roomId : ''));
        virtualizer = homeVirtualizer;
      }
      const roomIndexes = ids.flatMap((id, index) => (id ? [index] : []));
      if (roomIndexes.length === 0) return;
      e.preventDefault();
      const down = e.key === 'ArrowDown';
      const current = roomIndexes.findIndex((index) => ids[index] === currentRoomId);
      const nextPos =
        current === -1
          ? down
            ? 0
            : roomIndexes.length - 1
          : (current + (down ? 1 : -1) + roomIndexes.length) % roomIndexes.length;
      const index = roomIndexes[nextPos];
      const roomId = ids[index];
      setCurrentRoomId(roomId);
      navigate(`/${isDmView ? 'dm' : 'r'}/${encodeURIComponent(roomId)}`, {
        state: { sidebarView, currentSpaceId },
      });
      virtualizer.scrollToIndex(index, { align: 'auto' });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    isDmView,
    isSpaceView,
    dms,
    spaceItems,
    homeItems,
    dmVirtualizer,
    spaceVirtualizer,
    homeVirtualizer,
    currentRoomId,
    setCurrentRoomId,
    navigate,
    sidebarView,
    currentSpaceId,
  ]);

  const openRoomChat = useSetAtom(openRoomChatAtom);

  const openChatOnly = useCallback(
    (roomId: string) => {
      setCurrentRoomId(roomId);
      setDrawerOpen(false);
      navigate(`/r/${encodeURIComponent(roomId)}`, {
        state: { sidebarView, currentSpaceId },
      });
      openRoomChat(roomId);
    },
    [setCurrentRoomId, navigate, sidebarView, currentSpaceId, setDrawerOpen, openRoomChat]
  );

  const openVoiceChat = useCallback(
    (roomId: string) => {
      setCurrentRoomId(roomId);
      setDrawerOpen(false);
      navigate(`/r/${encodeURIComponent(roomId)}`, {
        state: { sidebarView, currentSpaceId },
      });
      if (client && callUi.roomId !== roomId) {
        const room = roomsById.get(roomId);
        if (room && !room.isInvite && isVoiceRoom(room)) onVoiceJoin(roomId);
      }
    },
    [
      setCurrentRoomId,
      navigate,
      sidebarView,
      currentSpaceId,
      client,
      roomsById,
      callUi.roomId,
      onVoiceJoin,
      setDrawerOpen,
    ]
  );

  const isSpaceContext = sidebarView === 'space' && !!currentSpaceId;
  const headerLabel = isDmView
    ? t('room.dm.directMessages')
    : isSpaceContext
      ? (currentSpaceDetails?.name ?? currentSpaceEntry?.name ?? t('nav.home'))
      : t('nav.home');

  const renderSpaceList = () => {
    return (
      <div ref={roomListRef} className={css.roomList}>
        <RoomReorderProvider
          rows={reorderRows}
          onReorder={handleReorder}
          onMoveRoom={handleMoveRoom}
          onReorderSections={handleReorderSections}
          onActiveChange={(id) =>
            setDraggingSection(!!id && (id.startsWith('sec:') || id === roomsHeaderId))
          }
          onDropGroupChange={setDropGroup}
          renderOverlay={renderReorderOverlay}
        >
          <div style={{ height: spaceVirtualizer.getTotalSize(), position: 'relative' }}>
            {renderDropBlock(spaceVirtualizer)}
            {spaceVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = spaceItems[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    boxSizing: 'border-box',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {item.kind === 'section' ? (
                    renderSectionHeader(item)
                  ) : item.kind === 'header' ? (
                    <SortableHeaderRow
                      id={`hdr:${item.item.categoryKey}`}
                      draggable={item.item.isRoot}
                    >
                      {spaceFavKey && item.item.categoryKey === spaceFavKey ? (
                        <HomeCategoryHeader
                          label={item.item.name}
                          isClosed={isCollapsed(spaceFavKey)}
                          onToggle={() => toggleCategory(spaceFavKey)}
                          hasNotif={item.item.hasNotif}
                          hasMention={item.item.hasMention}
                        />
                      ) : (
                        <SubspaceCategoryHeader
                          item={item.item}
                          isClosed={isCollapsed(item.item.categoryKey)}
                          onToggle={toggleCategory}
                          onAdd={handleSubspaceAdd}
                          onMenu={item.item.isRoot ? openRoomsMenu : undefined}
                          client={client}
                          showAvatar={showRoomAvatars}
                        />
                      )}
                    </SortableHeaderRow>
                  ) : (
                    <SortableRoomRow roomId={item.item.roomId} disabled={false}>
                      <RoomListItem
                        entry={item.item.entry}
                        isActive={currentRoomId === item.item.roomId}
                        hasActiveCall={
                          callParticipantsByRoom.has(item.item.roomId) &&
                          !item.item.entry.hasVoiceRoom
                        }
                        isInCall={callUi.roomId === item.item.roomId}
                        voiceMembers={callParticipantsByRoom.get(item.item.roomId)}
                        compactVoice={item.compact}
                        onSelect={selectRoom}
                        onOpenChat={openVoiceChat}
                        onOpenChatOnly={openChatOnly}
                      />
                    </SortableRoomRow>
                  )}
                </div>
              );
            })}
          </div>
        </RoomReorderProvider>
      </div>
    );
  };

  const renderHomeList = () => {
    if (homeLoading && homeRooms.length === 0) {
      return (
        <div ref={roomListRef} className={css.roomList}>
          <div className={css.skeletonList}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={css.skeletonRow}>
                <div className={css.skeletonAvatar} />
                <div className={css.skeletonLines}>
                  <div className={css.skeletonLine} />
                  <div className={css.skeletonLineShort} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div ref={roomListRef} className={css.roomList}>
        <RoomReorderProvider
          rows={reorderRows}
          onReorder={handleReorder}
          onMoveRoom={handleMoveRoom}
          onReorderSections={handleReorderSections}
          onActiveChange={(id) =>
            setDraggingSection(!!id && (id.startsWith('sec:') || id === roomsHeaderId))
          }
          onDropGroupChange={setDropGroup}
          renderOverlay={renderReorderOverlay}
        >
          <div style={{ height: homeVirtualizer.getTotalSize(), position: 'relative' }}>
            {renderDropBlock(homeVirtualizer)}
            {homeVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = homeItems[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {item.kind === 'section' ? (
                    renderSectionHeader(item)
                  ) : item.kind === 'header' ? (
                    <SortableHeaderRow
                      id={`hdr:${item.itemKey}`}
                      draggable={item.itemKey === HOME_ROOMS_CATEGORY}
                    >
                      <HomeCategoryHeader
                        label={item.label}
                        isClosed={isCollapsed(item.itemKey)}
                        onToggle={() => toggleCategory(item.itemKey)}
                        hasNotif={item.hasNotif}
                        hasMention={item.hasMention}
                        showAdd={item.showAdd}
                        onAdd={handleHomeAdd}
                        onMenu={item.itemKey === HOME_ROOMS_CATEGORY ? openRoomsMenu : undefined}
                      />
                    </SortableHeaderRow>
                  ) : (
                    <SortableRoomRow roomId={item.entry.roomId} disabled={false}>
                      <RoomListItem
                        entry={item.entry}
                        isActive={currentRoomId === item.entry.roomId}
                        hasActiveCall={
                          callParticipantsByRoom.has(item.entry.roomId) && !item.entry.hasVoiceRoom
                        }
                        isInCall={callUi.roomId === item.entry.roomId}
                        voiceMembers={callParticipantsByRoom.get(item.entry.roomId)}
                        compactVoice={item.compact}
                        onSelect={selectRoom}
                        onOpenChat={openVoiceChat}
                        onOpenChatOnly={openChatOnly}
                      />
                    </SortableRoomRow>
                  )}
                </div>
              );
            })}
          </div>
        </RoomReorderProvider>
      </div>
    );
  };

  const renderDmList = () => {
    if (dms.length === 0) {
      return (
        <div ref={roomListRef} className={css.roomList}>
          <div className={css.emptyList}>{t('nav.noDms')}</div>
        </div>
      );
    }
    return (
      <div ref={roomListRef} className={css.roomList}>
        <div style={{ height: dmVirtualizer.getTotalSize(), position: 'relative' }}>
          {dmVirtualizer.getVirtualItems().map((virtualRow) => {
            const entry = dms[virtualRow.index];
            return (
              <div
                key={entry.roomId}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <DmListItem
                  entry={entry}
                  isActive={currentRoomId === entry.roomId}
                  hasActiveCall={callParticipantsByRoom.has(entry.roomId)}
                  isInCall={callUi.roomId === entry.roomId}
                  onSelect={selectRoom}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={css.roomListPanel}>
      <header className={css.roomHeader}>
        <Tooltip content={headerLabel}>
          <h2 className={css.roomHeaderTitle}>
            <span className={css.roomHeaderLabel}>{headerLabel}</span>
          </h2>
        </Tooltip>
        <div className={css.roomHeaderActions}>
          {sidebarView === 'space' && currentSpaceEntry ? (
            <IconButton
              size="sm"
              tooltip={t('common.menu')}
              aria-label={t('common.menu')}
              onClick={handleSpaceMenu}
              {...spaceMenuTrigger}
            >
              <DotsThreeVerticalIcon size={16} weight="bold" />
            </IconButton>
          ) : isDmView ? (
            <IconButton
              size="sm"
              tooltip={t('common.markRead')}
              aria-label={t('common.markRead')}
              onClick={handleDmsMenu}
              {...dmMenuTrigger}
            >
              <DotsThreeVerticalIcon size={16} weight="bold" />
            </IconButton>
          ) : (
            <IconButton
              size="sm"
              tooltip={t('common.markRead')}
              aria-label={t('common.markRead')}
              onClick={handleHomeMenu}
              {...homeMenuTrigger}
            >
              <DotsThreeVerticalIcon size={16} weight="bold" />
            </IconButton>
          )}
        </div>
      </header>

      {!isMobile && !isDmView && !isSpaceView && (
        <div className={css.overviewNav}>
          <button
            type="button"
            className={`${itemCss.roomItem} ${css.overviewItem}`}
            data-active={location.pathname === '/'}
            aria-current={location.pathname === '/' ? 'page' : undefined}
            onClick={() => navigate('/', { state: { sidebarView: 'home', currentSpaceId: null } })}
          >
            <span className={itemCss.avatarWrap}>
              <span className={`${itemCss.chatAvatar} ${css.overviewIcon}`}>
                <HouseIcon size={18} weight={location.pathname === '/' ? 'fill' : 'regular'} />
              </span>
            </span>
            <span className={itemCss.chatTextContent}>{t('home.overview')}</span>
          </button>
        </div>
      )}

      {isDmView ? renderDmList() : isSpaceView ? renderSpaceList() : renderHomeList()}

      <div ref={bottomDockRef} className={css.bottomDock}>
        <CallBar />
        {!isMobile && <UserPanel />}
      </div>
    </div>
  );
}
