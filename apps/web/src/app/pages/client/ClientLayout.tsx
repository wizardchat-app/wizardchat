import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ThemeEditorPanel } from '@/app/features/themeEditor/ThemeEditorPanel';
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  currentSpaceIdAtom,
  currentRoomIdAtom,
  sidebarViewAtom,
  mobileDrawerOpenAtom,
  globalSearchOpenAtom,
  createSpaceOpenAtom,
  inboxOpenAtom,
  mobileYouOpenAtom,
  membersPanelOpenAtom,
  spaceMembersPanelOpenAtom,
  threadsPanelViewAtom,
  themeEditorAtom,
  threadPanelExpandedAtom,
  roomChatPanelOpenAtom,
  roomChatRoomIdAtom,
  closeRoomChatAtom,
  isInCallAtom,
  callActionsAtom,
  callRoomIdAtom,
  callEffectiveViewAtom,
  settingsOpenAtom,
  settingsPageAtom,
} from '@/app/store/atoms';
import { commandActionsAtom } from '@/app/store/atoms/call';
import type { SidebarView } from '@/app/store/atoms';
import { useSyncReady } from '@/app/hooks/useSync';
import { useMatrixToLinks } from '@/app/hooks/useMatrixToLinks';
import { useSettingsSync } from '@/app/hooks/useSettingsSync';
import { useVerification } from '@/app/hooks/useVerification';
import { useSessionVerification } from '@/app/hooks/useSessionVerification';
import { isEditableTarget, isModOnly } from '@/app/features/keyboardShortcuts/keyEvents';
import { useVoiceKeybinds } from '@/app/hooks/useKeybinds';
import { getMatrixClientOrNull, logout, onSessionInvalid } from '@/client/initMatrix';
import { roomsByIdAtom, useRoom, useSpaceGraph } from '@/app/data';
import { isChildOfSpace, findParentSpaceId, isVoiceRoom } from '@/util/matrix';
import { Timeline } from '@/app/features/timeline';
import { TitleBar, TitleBarSearch } from '@/app/components/TitleBar';
import { Inbox, MobileInboxPage } from '@/app/features/inbox';
import { MobileSettingsHome } from '@/app/features/settings/MobileSettingsHome';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { useEdgeSwipeBack, useLongPressContextMenu } from '@/app/hooks/useTouchGestures';
import { TOUCH_FIRST_QUERY } from '@/theme/uiDensity';
import { AccountSwitchGuard } from '@/app/components/AccountSwitchGuard';
import { CallLayer } from '@/app/features/calls/CallLayer';
import { useJoinVoiceRoom } from '@/app/features/calls/useJoinVoiceRoom';
import { CallContainerProvider, CallContainer } from '@/app/features/calls/CallContainer';
import { CallController } from '@/app/features/calls/CallController';
import { WatchTogetherController } from '@/app/features/calls/watchTogether/WatchTogetherController';
import { useTranslation } from 'react-i18next';
import { useClientNotifications } from './hooks/useClientNotifications';
import { useRecordLastRoom, useSwitchContext } from './hooks/useContextNavigation';
import { useFaviconBadge } from '@/app/hooks/useFaviconBadge';
import { useDocumentTitle } from '@/app/hooks/useDocumentTitle';
import { registerNotificationServiceWorker } from '@/app/hooks/useNotifications';
import { useUpdateCheck } from '@/app/hooks/useUpdateCheck';
import { usePresenceSender } from '@/app/hooks/usePresenceSender';
import { useBindFavouriteRooms } from '@/app/hooks/useBindFavouriteRooms';
import { usePresenceListener } from '@/app/hooks/usePresenceListener';
import { useConnectionStatusWatcher } from '@/app/hooks/useConnectionStatus';
import { useCustomStatusSync } from '@/app/features/status/customStatus';
import { UpdateButton } from '@/app/components/UpdateButton/UpdateButton';
import { EncryptionWarningButton } from '@/app/components/EncryptionWarningButton/EncryptionWarningButton';
import { SpacesList } from './SpacesList';
import { MobileTabBar } from './MobileTabBar';
import { useMobileListOpen } from './hooks/useMobileListOpen';
import { RoomListPanel } from './RoomListPanel';
import { MembersSidebar } from './MembersSidebar';
import * as sidebarCss from './MembersSidebar.css';
import * as threadPanelCss from './ThreadPanel.css';
import * as sidePanelCss from './SidePanel.css';
import { ThreadPanel } from './ThreadPanel';
import { ThreadListPanel } from './ThreadListPanel';
import { VoiceRoomChatPanel } from './VoiceRoomChatPanel';
import { VoiceRoomStage } from '@/app/features/calls/VoiceRoomStage';
import { MobileHeader } from './MobileHeader';
import { GlobalModals } from './GlobalModals';
import { SpaceOverview } from './SpaceOverview';
import { ActiveNowPanel } from './ActiveNowPanel';
import { HomeOverview } from '@/app/features/home';
import * as css from './ClientLayout.css';

function HomePage() {
  const client = getMatrixClientOrNull();
  if (!client) return null;
  return (
    <div className={css.homeLayout}>
      <HomeOverview client={client} />
      <ActiveNowPanel client={client} />
    </div>
  );
}

const RoomPage = memo(function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const client = getMatrixClientOrNull();
  const room = useRoom(roomId ? decodeURIComponent(roomId) : null);
  if (!client || !roomId) return null;
  const decodedRoomId = decodeURIComponent(roomId);
  if (room?.isInvite) return null;
  if (room && isVoiceRoom(room)) {
    return <VoiceRoomStage key={decodedRoomId} client={client} roomId={decodedRoomId} />;
  }
  return <Timeline key={decodedRoomId} client={client} roomId={decodedRoomId} />;
});

function SpaceOverviewPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  if (!spaceId) return null;
  const decodedSpaceId = decodeURIComponent(spaceId);
  return <SpaceOverview spaceId={decodedSpaceId} />;
}

export function ClientLayout() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const [currentSpaceId, setCurrentSpaceId] = useAtom(currentSpaceIdAtom);
  const [sidebarView, setSidebarView] = useAtom(sidebarViewAtom);
  const setDrawerOpen = useSetAtom(mobileDrawerOpenAtom);

  const currentSpaceIdRef = useRef(currentSpaceId);
  currentSpaceIdRef.current = currentSpaceId;
  const spaceGraph = useSpaceGraph();
  const spaceGraphRef = useRef(spaceGraph);
  spaceGraphRef.current = spaceGraph;
  const roomsById = useAtomValue(roomsByIdAtom);

  const switchContext = useSwitchContext();
  const handleSelectView = useCallback(
    (view: SidebarView, spaceId?: string | null) => {
      const nextSpaceId = spaceId ?? null;
      if (view === sidebarView && (view !== 'space' || nextSpaceId === currentSpaceId)) return;
      switchContext(view, nextSpaceId);
    },
    [sidebarView, currentSpaceId, switchContext]
  );

  const location = useLocation();
  useRecordLastRoom();

  useDocumentTitle();
  // Close the mobile sidebar drawer whenever the route changes, except on Home/DMs/space
  // switches, which keep it open so a room can be picked from the new list
  const keepDrawer = (location.state as { keepDrawer?: boolean } | null)?.keepDrawer === true;
  const keepDrawerRef = useRef(keepDrawer);
  keepDrawerRef.current = keepDrawer;
  useEffect(() => {
    if (!keepDrawerRef.current) setDrawerOpen(false);
  }, [location.pathname, setDrawerOpen]);
  const spaceOverviewMatch = location.pathname.match(/^\/space\/(.+)/);
  const spaceOverviewSpaceId = spaceOverviewMatch
    ? decodeURIComponent(spaceOverviewMatch[1])
    : null;
  const roomMatch = location.pathname.match(/^\/(?:r|dm)\/(.+)/);
  const currentRoomId = roomMatch ? decodeURIComponent(roomMatch[1]) : null;
  const sidebarRoomId = spaceOverviewSpaceId ?? currentRoomId;

  const setCurrentRoomId = useSetAtom(currentRoomIdAtom);

  // Extract stable values from mutable location.state
  const navState = location.state as
    { sidebarView?: SidebarView; currentSpaceId?: string | null } | null | undefined;
  const stateSidebar = navState?.sidebarView;
  const stateSpaceId = navState?.currentSpaceId;

  // Sync sidebar/space/room atoms with the current URL
  useLayoutEffect(() => {
    const path = location.pathname;

    const dmMatch = path.match(/^\/dm\/(.+)/);
    if (dmMatch) {
      const roomId = decodeURIComponent(dmMatch[1]);
      setSidebarView(stateSidebar ?? 'dms');
      setCurrentSpaceId(stateSpaceId !== undefined ? stateSpaceId : null);
      setCurrentRoomId(roomId);
      return;
    }

    const spaceMatch = path.match(/^\/space\/(.+)/);
    if (spaceMatch) {
      const spaceId = decodeURIComponent(spaceMatch[1]);
      setSidebarView(stateSidebar ?? 'space');
      setCurrentSpaceId(stateSpaceId ?? spaceId);
      setCurrentRoomId(null);
      return;
    }

    const roomMatch = path.match(/^\/r\/(.+)/);
    if (roomMatch) {
      const roomId = decodeURIComponent(roomMatch[1]);
      setCurrentRoomId(roomId);

      if (stateSidebar !== undefined || stateSpaceId !== undefined) {
        if (stateSidebar !== undefined) setSidebarView(stateSidebar);
        if (stateSpaceId !== undefined) setCurrentSpaceId(stateSpaceId);
        return;
      }

      const graph = spaceGraphRef.current;
      const keepSpaceId = !client
        ? null
        : currentSpaceIdRef.current && isChildOfSpace(roomId, currentSpaceIdRef.current, graph)
          ? currentSpaceIdRef.current
          : findParentSpaceId(roomId, graph);
      setSidebarView(keepSpaceId ? 'space' : 'home');
      setCurrentSpaceId(keepSpaceId);
      return;
    }

    if (path === '/') {
      setSidebarView(stateSidebar ?? 'home');
      setCurrentSpaceId(stateSpaceId !== undefined ? stateSpaceId : null);
      setCurrentRoomId(null);
    }
  }, [
    location.pathname,
    stateSidebar,
    stateSpaceId,
    client,
    setSidebarView,
    setCurrentSpaceId,
    setCurrentRoomId,
  ]);

  const openGlobalSearch = useSetAtom(globalSearchOpenAtom);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openGlobalSearch(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openGlobalSearch]);

  // Keyboard shortcuts settings
  const openSettings = useSetAtom(settingsOpenAtom);
  const setSettingsPage = useSetAtom(settingsPageAtom);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setSettingsPage('keybinds');
        openSettings(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openSettings, setSettingsPage]);

  const setInboxOpen = useSetAtom(inboxOpenAtom);
  const setCreateSpaceOpen = useSetAtom(createSpaceOpenAtom);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isModOnly(e) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'i' && !e.shiftKey && !isEditableTarget(e)) {
        e.preventDefault();
        setInboxOpen((open) => !open);
      } else if (key === 'n' && e.shiftKey) {
        e.preventDefault();
        setCreateSpaceOpen({ open: true });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setInboxOpen, setCreateSpaceOpen]);

  const syncReady = useSyncReady();

  useSettingsSync(client);
  useMatrixToLinks(client);

  // Session expiry
  useEffect(() => {
    if (!client) return;
    return onSessionInvalid(() => {
      void logout(client.userId());
    });
  }, [client]);

  // Security
  useVerification(client);
  useSessionVerification(client, syncReady);

  const callActions = useAtomValue(callActionsAtom);
  const isInCall = useAtomValue(isInCallAtom);
  const startCall = callActions?.start;
  const hangupCall = callActions?.hangup;
  const callToggleMute = callActions?.toggleMute;
  const callToggleDeafen = callActions?.toggleDeafen;
  const callToggleScreenShare = callActions?.toggleScreenshare;
  const callToggleCamera = callActions?.toggleVideo;

  const placeCall = useCallback(
    async (roomId: string) => {
      if (!client || !startCall) return;
      if (!roomsById.has(roomId)) return;
      await startCall(roomId, { voiceOnly: true, presentation: 'room', ring: true });
    },
    [client, startCall, roomsById]
  );

  const joinVoiceRoom = useJoinVoiceRoom(client);

  const setCommandActions = useSetAtom(commandActionsAtom);
  useEffect(() => {
    setCommandActions({
      placeCall,
      joinVoice: joinVoiceRoom,
      hangup: hangupCall,
    });
    return () => setCommandActions(null);
  }, [placeCall, joinVoiceRoom, hangupCall, setCommandActions]);

  // Keyboard shortcuts
  const [membersPanelOpen, setMembersPanelOpen] = useAtom(membersPanelOpenAtom);
  const [spaceMembersPanelOpen, setSpaceMembersPanelOpen] = useAtom(spaceMembersPanelOpenAtom);
  // The room members panel is hidden on a space overview
  const membersPanelVisible = spaceOverviewSpaceId ? spaceMembersPanelOpen : membersPanelOpen;
  const setMembersVisible = spaceOverviewSpaceId ? setSpaceMembersPanelOpen : setMembersPanelOpen;
  const [threadsPanelView, setThreadsPanelView] = useAtom(threadsPanelViewAtom);
  const themeEditorOpen = useAtomValue(themeEditorAtom) !== null;
  const threadPanelExpanded = useAtomValue(threadPanelExpandedAtom);

  const [threadsClosing, setThreadsClosing] = useState(false);
  const closeThreadsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelThreadsClose = useCallback(() => {
    if (closeThreadsTimer.current !== null) {
      clearTimeout(closeThreadsTimer.current);
      closeThreadsTimer.current = null;
    }
    setThreadsClosing(false);
  }, []);

  const closeThreads = useCallback(() => {
    if (!threadsPanelView) return;
    setThreadsClosing(true);
    if (closeThreadsTimer.current !== null) clearTimeout(closeThreadsTimer.current);
    closeThreadsTimer.current = setTimeout(() => {
      setThreadsPanelView(null);
      setThreadsClosing(false);
      closeThreadsTimer.current = null;
    }, 220);
  }, [threadsPanelView, setThreadsPanelView]);

  useEffect(() => () => cancelThreadsClose(), [cancelThreadsClose]);

  // A fresh open request cancels an in-flight closing animation
  useEffect(() => {
    if (threadsPanelView) cancelThreadsClose();
  }, [threadsPanelView, cancelThreadsClose]);

  // Voice-room chat panel (opened via the room list's "Open chat" action)
  const roomChatOpen = useAtomValue(roomChatPanelOpenAtom);
  const roomChatRoomId = useAtomValue(roomChatRoomIdAtom);
  const closeRoomChat = useSetAtom(closeRoomChatAtom);
  const callRoomId = useAtomValue(callRoomIdAtom);
  const callView = useAtomValue(callEffectiveViewAtom);
  const [roomChatClosing, setRoomChatClosing] = useState(false);
  const roomChatCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelRoomChatClose = useCallback(() => {
    if (roomChatCloseTimer.current !== null) {
      clearTimeout(roomChatCloseTimer.current);
      roomChatCloseTimer.current = null;
    }
    setRoomChatClosing(false);
  }, []);

  const closeRoomChatPanel = useCallback(() => {
    if (!roomChatOpen) return;
    setRoomChatClosing(true);
    if (roomChatCloseTimer.current !== null) clearTimeout(roomChatCloseTimer.current);
    roomChatCloseTimer.current = setTimeout(() => {
      closeRoomChat();
      setRoomChatClosing(false);
      roomChatCloseTimer.current = null;
    }, 220);
  }, [roomChatOpen, closeRoomChat]);

  useEffect(() => () => cancelRoomChatClose(), [cancelRoomChatClose]);

  useEffect(() => {
    if (roomChatOpen) cancelRoomChatClose();
  }, [roomChatOpen, cancelRoomChatClose]);

  useEffect(() => {
    if (!roomChatOpen || !roomChatRoomId) return;
    const room = currentRoomId ? roomsById.get(currentRoomId) : null;
    const sameRoom = !!room && room.id === roomChatRoomId;
    // Voice rooms have no timeline, so the panel is always the chat surface there.
    const voiceRoomChat = !!room && isVoiceRoom(room);
    // Normal rooms keep their own timeline visible except while a fullscreen call covers it.
    const callCoversTimeline = callRoomId === roomChatRoomId && callView === 'fullscreen';
    if (!sameRoom || (!voiceRoomChat && !callCoversTimeline)) closeRoomChatPanel();
  }, [
    roomChatOpen,
    roomChatRoomId,
    currentRoomId,
    roomsById,
    callRoomId,
    callView,
    closeRoomChatPanel,
  ]);

  const threadPanelRoomIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (threadsPanelView && currentRoomId) threadPanelRoomIdRef.current = currentRoomId;
  }, [threadsPanelView, currentRoomId]);

  const prevRoomIdRef = useRef<string | null>(currentRoomId);
  useEffect(() => {
    const prev = prevRoomIdRef.current;
    prevRoomIdRef.current = currentRoomId;
    if (
      currentRoomId !== null &&
      prev !== currentRoomId &&
      threadPanelRoomIdRef.current !== currentRoomId
    ) {
      cancelThreadsClose();
      setThreadsPanelView(null);
    }
  }, [currentRoomId, cancelThreadsClose, setThreadsPanelView]);

  useEffect(() => {
    if (membersPanelOpen) cancelThreadsClose();
  }, [membersPanelOpen, cancelThreadsClose]);

  useEffect(() => {
    if (spaceOverviewSpaceId) setSpaceMembersPanelOpen(false);
  }, [spaceOverviewSpaceId, setSpaceMembersPanelOpen]);

  useVoiceKeybinds(isInCall, {
    toggleMute: callToggleMute ?? (() => {}),
    toggleDeafen: callToggleDeafen ?? (() => {}),
    toggleScreenShare: callToggleScreenShare ?? (() => {}),
    toggleCamera: callToggleCamera ?? (() => {}),
  });

  useClientNotifications();

  useEffect(() => {
    registerNotificationServiceWorker();
  }, []);

  useFaviconBadge();
  useUpdateCheck();

  usePresenceSender(client);
  useBindFavouriteRooms();
  usePresenceListener(client);
  useConnectionStatusWatcher();
  useCustomStatusSync(client);

  const isMobile = useMediaQuery('(max-width: 768px)');
  const touchFirst = useMediaQuery(TOUCH_FIRST_QUERY);
  useLongPressContextMenu(touchFirst);
  useEdgeSwipeBack(touchFirst && isMobile);
  const mobileListOpen = useMobileListOpen();
  const inboxOpen = useAtomValue(inboxOpenAtom);
  const youOpen = useAtomValue(mobileYouOpenAtom);
  const sidebarClass = [
    css.sidebar,
    mobileListOpen ? css.sidebarOpen : null,
    sidebarView !== 'space' ? css.sidebarNoRail : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <AccountSwitchGuard client={client} />
      <MobileHeader />

      <CallContainerProvider>
        <div className={css.appFrame}>
          {!isMobile && (
            <TitleBar
              center={<TitleBarSearch />}
              end={
                <>
                  <UpdateButton />
                  <EncryptionWarningButton />
                  <Inbox />
                </>
              }
            />
          )}
          <div className={css.appShell}>
            {/* Sidebar: spaces column + room list panel */}
            <nav aria-label={t('nav.title')} className={sidebarClass} data-swipe-back-reveal>
              <SpacesList
                sidebarView={sidebarView}
                currentSpaceId={currentSpaceId}
                onSelectView={handleSelectView}
              />
              <RoomListPanel onVoiceJoin={joinVoiceRoom} />
            </nav>
            {mobileListOpen && youOpen && (
              <div className={css.mobileInbox}>
                <MobileSettingsHome />
              </div>
            )}
            {mobileListOpen && inboxOpen && !youOpen && (
              <div className={css.mobileInbox}>
                <MobileInboxPage />
              </div>
            )}
            {mobileListOpen && <MobileTabBar />}

            {/* Main content - call layer above the chat timeline */}
            <main
              data-swipe-back="screen"
              className={`${css.mainContent}${threadsPanelView && threadPanelExpanded ? ` ${css.mainContentHidden}` : ''}`}
            >
              <CallContainer />
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/space/:spaceId" element={<SpaceOverviewPage />} />
                <Route path="/r/:roomId" element={<RoomPage />} />
                <Route path="/dm/:roomId" element={<RoomPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <CallLayer client={client} />
              <CallController />
              <WatchTogetherController />
            </main>

            <MembersSidebar
              spaceId={sidebarRoomId}
              open={membersPanelVisible}
              onClose={() => setMembersVisible(false)}
              className={
                membersPanelVisible
                  ? sidebarCss.membersSidebarOpen
                  : sidebarCss.membersSidebarClosed
              }
            />
            {membersPanelVisible && (
              <div
                className={css.membersDrawerOverlay}
                role="presentation"
                data-back-dismiss
                onClick={() => setMembersVisible(false)}
              />
            )}

            {threadsPanelView && currentRoomId && client && (
              <>
                {threadsPanelView.type === 'list' ? (
                  <ThreadListPanel
                    client={client}
                    roomId={currentRoomId}
                    className={threadsClosing ? undefined : sidePanelCss.sidePanelOpen}
                    onSelectThread={(rootEventId) =>
                      setThreadsPanelView({ type: 'thread', rootEventId })
                    }
                    onClose={closeThreads}
                  />
                ) : (
                  <ThreadPanel
                    client={client}
                    roomId={currentRoomId}
                    rootEventId={threadsPanelView.rootEventId}
                    className={threadsClosing ? undefined : threadPanelCss.threadPanelOpen}
                    onClose={closeThreads}
                    onBack={() => setThreadsPanelView({ type: 'list' })}
                  />
                )}
                <div
                  className={css.drawerOverlay}
                  role="presentation"
                  data-back-dismiss
                  onClick={closeThreads}
                />
              </>
            )}

            {themeEditorOpen && <ThemeEditorPanel />}

            {roomChatOpen && roomChatRoomId && client && (
              <>
                <VoiceRoomChatPanel
                  client={client}
                  roomId={roomChatRoomId}
                  className={roomChatClosing ? undefined : sidePanelCss.sidePanelOpen}
                  onClose={closeRoomChatPanel}
                />
                <div
                  className={css.drawerOverlay}
                  role="presentation"
                  data-back-dismiss
                  onClick={closeRoomChatPanel}
                />
              </>
            )}
          </div>
        </div>
      </CallContainerProvider>

      <GlobalModals />
    </>
  );
}
