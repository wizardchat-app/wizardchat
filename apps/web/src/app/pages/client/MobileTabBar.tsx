import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { mergeHomeAndDmsAtom } from '@/app/store/atoms/settings';
import {
  ChatCircleIcon,
  HouseIcon,
  SpeakerHighIcon,
  StackIcon,
  TrayIcon,
} from '@phosphor-icons/react';
import {
  currentSpaceIdAtom,
  inboxOpenAtom,
  mobileYouOpenAtom,
  mobileDrawerOpenAtom,
  mobileLastSpaceIdAtom,
  sidebarViewAtom,
  userIdAtom,
  type SidebarView,
} from '@/app/store/atoms';
import { useSpaces } from '@/app/features/room/useRooms';
import { useInboxBadge } from '@/app/features/inbox';
import { Avatar } from '@/app/components/Avatar';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useProfile } from '@/app/data';
import { useSwitchContext } from './hooks/useContextNavigation';
import * as css from './MobileTabBar.css';

interface TabProps {
  id: string;
  label: string;
  active?: boolean;
  icon: ReactNode;
  notif?: boolean;
  mention?: boolean;
  call?: boolean;
  onClick: () => void;
}

function Tab({ id, label, active, icon, notif, mention, call, onClick }: TabProps) {
  return (
    <button
      type="button"
      className={active ? css.tabActive : css.tab}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      data-native-tab={id}
      data-badge={notif ? (mention ? 'mention' : 'dot') : undefined}
      data-call={call || undefined}
    >
      <span className={css.tabIcon}>
        {icon}
        {notif && <span className={mention ? css.notifDotMention : css.notifDot} />}
        {call && (
          <span className={css.callBadge}>
            <SpeakerHighIcon size={12} weight="fill" />
          </span>
        )}
      </span>
      {label}
    </button>
  );
}

export function MobileTabBar() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const userId = useAtomValue(userIdAtom);
  const sidebarView = useAtomValue(sidebarViewAtom);
  const mergeHomeAndDms = useAtomValue(mergeHomeAndDmsAtom);
  const currentSpaceId = useAtomValue(currentSpaceIdAtom);
  const [lastSpaceId, setLastSpaceId] = useAtom(mobileLastSpaceIdAtom);
  const setDrawerOpen = useSetAtom(mobileDrawerOpenAtom);
  const [inboxOpen, setInboxOpen] = useAtom(inboxOpenAtom);
  const [youOpen, setYouOpen] = useAtom(mobileYouOpenAtom);
  const inboxBadge = useInboxBadge();
  const switchContext = useSwitchContext();
  const {
    spaces,
    homeHasNotif,
    homeHasMention,
    homeHasCall,
    dmsHasNotif,
    dmsHasMention,
    dmsHasCall,
  } = useSpaces();

  useEffect(() => {
    if (sidebarView === 'space' && currentSpaceId) setLastSpaceId(currentSpaceId);
  }, [sidebarView, currentSpaceId, setLastSpaceId]);

  const open = (view: SidebarView, spaceId: string | null) => {
    setInboxOpen(false);
    setYouOpen(false);
    if (view === sidebarView && (view !== 'space' || spaceId === currentSpaceId)) return;
    setDrawerOpen(true);
    switchContext(view, spaceId);
  };

  const openSpaces = () => {
    const known = (id: string | null) => !!id && spaces.some((s) => s.roomId === id);
    const spaceId = known(lastSpaceId) ? lastSpaceId : (spaces[0]?.roomId ?? null);
    open('space', spaceId);
  };

  const { data: me } = useProfile(userId);
  const activeTab = youOpen ? 'you' : inboxOpen ? 'inbox' : sidebarView;

  return (
    <nav className={css.tabBar} aria-label={t('nav.title')} data-back-root>
      <Tab
        id="home"
        label={t('nav.home')}
        active={activeTab === 'home'}
        icon={<HouseIcon size={22} weight={activeTab === 'home' ? 'fill' : 'regular'} />}
        notif={homeHasNotif}
        mention={homeHasMention}
        call={homeHasCall}
        onClick={() => open('home', null)}
      />
      {!mergeHomeAndDms && (
        <Tab
          id="dms"
          label={t('nav.dms')}
          active={activeTab === 'dms'}
          icon={<ChatCircleIcon size={22} weight={activeTab === 'dms' ? 'fill' : 'regular'} />}
          notif={dmsHasNotif}
          mention={dmsHasMention}
          call={dmsHasCall}
          onClick={() => open('dms', null)}
        />
      )}
      <Tab
        id="spaces"
        label={t('nav.spaces')}
        active={activeTab === 'space'}
        icon={<StackIcon size={22} weight={activeTab === 'space' ? 'fill' : 'regular'} />}
        notif={spaces.some((s) => s.hasNotif)}
        mention={spaces.some((s) => s.hasMention)}
        call={spaces.some((s) => s.hasCall)}
        onClick={openSpaces}
      />
      <Tab
        id="inbox"
        label={t('inbox.title')}
        active={activeTab === 'inbox'}
        icon={<TrayIcon size={22} weight={activeTab === 'inbox' ? 'fill' : 'regular'} />}
        notif={inboxBadge.show}
        mention={inboxBadge.mention}
        onClick={() => {
          setYouOpen(false);
          setInboxOpen(true);
        }}
      />
      <Tab
        id="you"
        label={t('nav.you')}
        icon={
          <Avatar
            name={me?.displayName ?? userId ?? ''}
            mxcUrl={me?.avatarUrl ?? null}
            client={client ?? undefined}
            size="xs"
            placeholder="logo"
          />
        }
        active={activeTab === 'you'}
        onClick={() => {
          setInboxOpen(false);
          setYouOpen(true);
        }}
      />
    </nav>
  );
}
