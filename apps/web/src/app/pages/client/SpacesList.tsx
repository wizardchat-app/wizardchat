import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HouseIcon,
  ChatCircleIcon,
  PlusIcon,
  CompassIcon,
  DownloadSimpleIcon,
  SpeakerHighIcon,
} from '@phosphor-icons/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/app/components/Tooltip';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { Avatar } from '@/app/components/Avatar';
import {
  spaceSettingsRoomIdAtom,
  createSpaceOpenAtom,
  exploreOpenAtom,
  getAppsOpenAtom,
  pinnedSubSpacesAtom,
  mobileDrawerOpenAtom,
} from '@/app/store/atoms';
import type { SidebarView } from '@/app/store/atoms';
import { useContextMenuTrigger } from '@/app/hooks/useContextMenuTrigger';
import { useSpaces } from '@/app/features/room';
import type { SpaceEntry } from '@/app/features/room';
import type { ContextMenuItem } from '@/app/features/contextMenu/contextMenuAtom';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useAllRooms, useSpaceGraph } from '@/app/data';
import { useToast } from '@/app/hooks/useToast';
import { useRoomActions } from './hooks/useRoomActions';
import { mergeHomeAndDmsAtom, sendReadReceiptsAtom } from '@/app/store/atoms/settings';
import { buildSpaceMenu, markSpaceAsRead, buildHomeMenu, buildDmsMenu } from './spaceContextMenu';
import {
  applyPendingOrder,
  getSpaceBarOrder,
  planSpaceReorder,
  saveSpaceBarOrders,
  sortSpaceBar,
  useSpaceBarOrders,
} from '@/app/features/room/roomOrder';
import { getErrorMessage } from '@/util/error';
import { isModOnly } from '@/app/features/keyboardShortcuts/keyEvents';
import { prefetchSpaceHierarchies } from '@/app/features/space/spaceHierarchy';
import { useQueryClient } from '@tanstack/react-query';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import * as css from './SpacesList.css';
import { vars } from '@/theme/vars.css';

interface SpacesListProps {
  sidebarView: SidebarView;
  currentSpaceId: string | null;
  onSelectView: (view: SidebarView, spaceId?: string | null) => void;
}

function SortableSpaceItem({
  space,
  isActive,
  onClick,
  onHover,
  buildContextMenu,
  children,
}: {
  space: SpaceEntry;
  isActive: boolean;
  onClick: () => void;
  onHover: () => void;
  buildContextMenu: () => ContextMenuItem[];
  children: React.ReactNode;
}) {
  const menuTrigger = useContextMenuTrigger(buildContextMenu);
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: space.roomId,
  });

  const style: React.CSSProperties = {
    opacity: isDragging ? 0.3 : 1,
    transition: 'opacity 0.15s ease, background-color 0.15s, box-shadow 0.15s',
  };

  const className = [isActive ? css.spaceBtnActive : css.spaceBarBtn].filter(Boolean).join(' ');

  return (
    <div ref={setNodeRef} className={className} style={style} {...attributes} {...listeners}>
      <span className={css.spacePill} />
      <Tooltip placement="right" content={space.name}>
        <button
          type="button"
          className={css.spaceBtnInner}
          onClick={onClick}
          onMouseEnter={onHover}
          onFocus={onHover}
          aria-label={space.name}
          aria-current={isActive ? 'page' : undefined}
          {...menuTrigger}
        >
          {children}
        </button>
      </Tooltip>
    </div>
  );
}

function SpaceAvatar({ space }: { space: SpaceEntry }) {
  const client = getMatrixClientOrNull();
  return (
    <>
      <div className={css.spaceAvatarWrap}>
        <Avatar
          name={space.name}
          mxcUrl={space.avatarMxc}
          client={client ?? undefined}
          size="fill"
        />
      </div>
      {space.hasCall && (
        <span className={css.callBadge}>
          <SpeakerHighIcon size={12} weight="fill" />
        </span>
      )}
      {space.hasNotif && <span className={space.hasMention ? css.notifDotMention : css.notifDot} />}
    </>
  );
}

export function SpacesList({ sidebarView, currentSpaceId, onSelectView }: SpacesListProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const {
    spaces,
    homeHasNotif,
    homeHasMention,
    dmsHasNotif,
    dmsHasMention,
    homeHasCall,
    dmsHasCall,
  } = useSpaces();
  const [pinnedSubSpacesArr, setPinnedSubSpacesArr] = useAtom(pinnedSubSpacesAtom);
  const pinnedSubSpaces = useMemo(() => new Set(pinnedSubSpacesArr), [pinnedSubSpacesArr]);
  const roomActions = useRoomActions();
  const [, setSpaceSettings] = useAtom(spaceSettingsRoomIdAtom);
  const [createSpaceOpen, setCreateSpaceOpen] = useAtom(createSpaceOpenAtom);
  const [exploreOpen, openExplore] = useAtom(exploreOpenAtom);
  const [getAppsOpen, openGetApps] = useAtom(getAppsOpenAtom);
  const setDrawerOpen = useSetAtom(mobileDrawerOpenAtom);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const sendReadReceipts = useAtomValue(sendReadReceiptsAtom);
  const mergeHomeAndDms = useAtomValue(mergeHomeAndDmsAtom);
  const client = getMatrixClientOrNull();
  const rooms = useAllRooms();
  const graph = useSpaceGraph();
  const queryClient = useQueryClient();
  const prefetchSpace = useCallback(
    (spaceId: string) => {
      if (client) prefetchSpaceHierarchies(queryClient, client, [spaceId]);
    },
    [client, queryClient]
  );

  const navigate = useNavigate();

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [insertLine, setInsertLine] = useState<{ id: string; position: 'before' | 'after' } | null>(
    null
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const handleMarkSpaceAsRead = useCallback(
    (spaceId: string) => {
      markSpaceAsRead(client, sendReadReceipts, spaceId, rooms, graph);
    },
    [client, sendReadReceipts, rooms, graph]
  );

  const buildSpaceMenuCb = useCallback(
    (space: SpaceEntry) => {
      return buildSpaceMenu(space, {
        t,
        navigate,
        rooms,
        graph,
        roomActions,
        toast,
        pinnedSubSpaces,
        setPinnedSubSpacesArr,
        setSpaceSettings,
        markSpaceAsRead: handleMarkSpaceAsRead,
      });
    },
    [
      navigate,
      rooms,
      graph,
      roomActions,
      setSpaceSettings,
      t,
      toast,
      pinnedSubSpaces,
      setPinnedSubSpacesArr,
      handleMarkSpaceAsRead,
    ]
  );

  const buildHomeMenuCb = useCallback(() => {
    return buildHomeMenu({
      t,
      client,
      rooms,
      graph,
      sendReadReceipts,
      includeDms: mergeHomeAndDms,
    });
  }, [t, client, rooms, graph, sendReadReceipts, mergeHomeAndDms]);

  const buildDmsMenuCb = useCallback(() => {
    return buildDmsMenu({ t, client, rooms, graph, sendReadReceipts });
  }, [t, client, rooms, graph, sendReadReceipts]);

  const homeMenuTrigger = useContextMenuTrigger(buildHomeMenuCb);
  const dmMenuTrigger = useContextMenuTrigger(buildDmsMenuCb);

  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const spaceBarOrdersVersion = useSpaceBarOrders();
  const sortedSpaces = useMemo(
    () => sortSpaceBar(spaces, (s) => s.roomId),
    [spaces, spaceBarOrdersVersion]
  );
  const orderedSpaces = useMemo(
    () =>
      applyPendingOrder(
        sortedSpaces,
        new Set(sortedSpaces.map((s) => s.roomId)),
        pendingOrder,
        (s) => s.roomId
      ),
    [sortedSpaces, pendingOrder]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isModOnly(e) || !e.altKey || e.shiftKey) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const contexts: { view: SidebarView; spaceId: string | null }[] = [
        { view: 'home', spaceId: null },
        ...(mergeHomeAndDms ? [] : [{ view: 'dms' as const, spaceId: null }]),
        ...orderedSpaces.map((s) => ({ view: 'space' as const, spaceId: s.roomId })),
      ];
      const current = contexts.findIndex(
        (c) => c.view === sidebarView && (c.view !== 'space' || c.spaceId === currentSpaceId)
      );
      const down = e.key === 'ArrowDown';
      const nextIndex =
        current === -1
          ? down
            ? 0
            : contexts.length - 1
          : (current + (down ? 1 : -1) + contexts.length) % contexts.length;
      const next = contexts[nextIndex];
      onSelectView(next.view, next.spaceId);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [orderedSpaces, sidebarView, currentSpaceId, onSelectView, mergeHomeAndDms]);

  useEffect(() => {
    if (!pendingOrder) return;
    if (sortedSpaces.map((s) => s.roomId).join('|') === pendingOrder.join('|')) {
      setPendingOrder(null);
      return;
    }
    const timer = setTimeout(() => setPendingOrder(null), 8000);
    return () => clearTimeout(timer);
  }, [sortedSpaces, pendingOrder]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    setInsertLine(null);
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) {
        setInsertLine(null);
        return;
      }

      const orderedIds = orderedSpaces.map((s) => s.roomId);
      const ai = orderedIds.indexOf(active.id as string);
      const oi = orderedIds.indexOf(over.id as string);
      if (ai === -1 || oi === -1) {
        setInsertLine(null);
        return;
      }

      setInsertLine({ id: over.id as string, position: ai < oi ? 'after' : 'before' });
    },
    [orderedSpaces]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
    setInsertLine(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      setInsertLine(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = orderedSpaces.findIndex((s) => s.roomId === active.id);
      const newIndex = orderedSpaces.findIndex((s) => s.roomId === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reorderedIds = arrayMove(orderedSpaces, oldIndex, newIndex).map((s) => s.roomId);
      if (!client) return;
      const currentOrders = new Map(
        orderedSpaces.map((s) => [s.roomId, getSpaceBarOrder(s.roomId)])
      );
      setPendingOrder(reorderedIds);
      const updates = planSpaceReorder(reorderedIds, currentOrders, String(active.id));
      saveSpaceBarOrders(client, updates).catch((err: unknown) => {
        setPendingOrder(null);
        toast.error(t('nav.reorderFailed', { error: getErrorMessage(err) }));
      });
    },
    [orderedSpaces, client, toast, t]
  );

  const activeDragSpace = useMemo(
    () => spaces.find((s) => s.roomId === activeDragId) ?? null,
    [spaces, activeDragId]
  );

  return (
    <div className={css.spacesList}>
      {!isMobile && (
        <>
          {/* Home button */}
          <Tooltip placement="right" content={t('nav.home')}>
            <button
              type="button"
              className={sidebarView === 'home' ? css.spaceBarBtnActive : css.spaceBarBtn}
              style={{
                color: sidebarView !== 'home' && homeHasNotif ? vars.color.textPrimary : undefined,
              }}
              aria-label={t('nav.home')}
              onClick={() => {
                if (sidebarView === 'home') {
                  setDrawerOpen(false);
                  navigate('/', { state: { sidebarView: 'home', currentSpaceId: null } });
                } else {
                  onSelectView('home', null);
                }
              }}
              {...homeMenuTrigger}
            >
              <span className={css.spacePill} />
              <HouseIcon size={20} weight={sidebarView === 'home' ? 'fill' : 'regular'} />
              {homeHasCall && (
                <span className={css.callBadge}>
                  <SpeakerHighIcon size={12} weight="fill" />
                </span>
              )}
              {homeHasNotif && (
                <span className={homeHasMention ? css.notifDotMention : css.notifDot} />
              )}
            </button>
          </Tooltip>

          {!mergeHomeAndDms && (
            <Tooltip placement="right" content={t('room.dm.directMessages')}>
              <button
                type="button"
                className={sidebarView === 'dms' ? css.spaceBarBtnActive : css.spaceBarBtn}
                style={{
                  color: sidebarView !== 'dms' && dmsHasNotif ? vars.color.textPrimary : undefined,
                }}
                aria-label={t('room.dm.directMessages')}
                onClick={() => onSelectView('dms', null)}
                {...dmMenuTrigger}
              >
                <span className={css.spacePill} />
                <ChatCircleIcon size={20} weight={sidebarView === 'dms' ? 'fill' : 'regular'} />
                {dmsHasCall && (
                  <span className={css.callBadge}>
                    <SpeakerHighIcon size={12} weight="fill" />
                  </span>
                )}
                {dmsHasNotif && (
                  <span className={dmsHasMention ? css.notifDotMention : css.notifDot} />
                )}
              </button>
            </Tooltip>
          )}

          {orderedSpaces.length > 0 && <div className={css.spacesSeparator} />}
        </>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={orderedSpaces.map((s) => s.roomId)}
          strategy={verticalListSortingStrategy}
        >
          <div className={css.spacesScrollArea}>
            {orderedSpaces.map((space) => {
              const isActive = sidebarView === 'space' && currentSpaceId === space.roomId;
              const showBefore =
                insertLine?.id === space.roomId && insertLine.position === 'before';
              const showAfter = insertLine?.id === space.roomId && insertLine.position === 'after';
              return (
                <Fragment key={space.roomId}>
                  {showBefore && <div className={css.insertionLine} />}
                  <SortableSpaceItem
                    space={space}
                    isActive={isActive}
                    onClick={() => {
                      if (sidebarView === 'space' && currentSpaceId === space.roomId) {
                        setDrawerOpen(false);
                        navigate(`/space/${encodeURIComponent(space.roomId)}`, {
                          state: { sidebarView: 'space', currentSpaceId: space.roomId },
                        });
                      } else {
                        onSelectView('space', space.roomId);
                      }
                    }}
                    onHover={() => prefetchSpace(space.roomId)}
                    buildContextMenu={() => buildSpaceMenuCb(space)}
                  >
                    <SpaceAvatar space={space} />
                  </SortableSpaceItem>
                  {showAfter && <div className={css.insertionLine} />}
                </Fragment>
              );
            })}

            <DragOverlay>
              {activeDragSpace ? (
                <div className={css.spaceBtnDragOverlay}>
                  <SpaceAvatar space={activeDragSpace} />
                </div>
              ) : null}
            </DragOverlay>

            <div className={css.spacesStickyBottom}>
              {orderedSpaces.length > 0 && <div className={css.spacesSeparator} />}
              {/* Create / Join Space button */}
              <Tooltip placement="right" content={t('space.add')}>
                <button
                  type="button"
                  className={createSpaceOpen.open ? css.spaceBarBtnActive : css.spaceBarBtn}
                  aria-label={t('space.create.title')}
                  onClick={() => setCreateSpaceOpen({ open: true })}
                >
                  <span className={css.spacePill} />
                  <PlusIcon size={20} weight={createSpaceOpen.open ? 'bold' : 'regular'} />
                </button>
              </Tooltip>
              {/* Explore button */}
              <Tooltip placement="right" content={t('explore.title')}>
                <button
                  type="button"
                  className={exploreOpen ? css.spaceBarBtnActive : css.spaceBarBtn}
                  aria-label={t('explore.title')}
                  onClick={() => openExplore(true)}
                >
                  <span className={css.spacePill} />
                  <CompassIcon size={20} weight={exploreOpen ? 'fill' : 'regular'} />
                </button>
              </Tooltip>
              <Tooltip placement="right" content={t('getApps.title')}>
                <button
                  type="button"
                  className={getAppsOpen ? css.spaceBarBtnActive : css.spaceBarBtn}
                  aria-label={t('getApps.title')}
                  onClick={() => openGetApps(true)}
                >
                  <span className={css.spacePill} />
                  <DownloadSimpleIcon size={20} weight={getAppsOpen ? 'bold' : 'regular'} />
                </button>
              </Tooltip>
            </div>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
