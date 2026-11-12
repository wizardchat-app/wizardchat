import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { TrayIcon, HashStraightIcon, StackIcon, ChecksIcon } from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { Avatar } from '@/app/components/Avatar';
import { Popover } from '@/app/components/Popover/Popover';
import { inboxOpenAtom, mobileDrawerOpenAtom, threadsPanelViewAtom } from '@/app/store/atoms';
import { sendReadReceiptsAtom } from '@/app/store/atoms/settings';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { formatRelativeTime } from '@/util/format';
import { markRoomsAsRead } from '@/app/pages/client/spaceContextMenu';
import { roomHasUnreadMention } from '@/util/mentions';
import { useAllRooms } from '@/app/data';
import { useInvites, type Invite } from './useInvites';
import { useMentions, useHasUnreadMentions } from './useMentions';
import { useUnreadThreads, useHasUnreadThreads } from './useUnreadThreads';
import * as css from './Inbox.css';
import { vars } from '@/theme/vars.css';

type Tab = 'invites' | 'mentions' | 'threads';

const ROUTE_PREFIX: Record<Invite['kind'], string> = {
  room: '/r/',
  dm: '/dm/',
  space: '/space/',
};

function InboxContent({ mobile = false }: { mobile?: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const client = getMatrixClientOrNull();
  const setOpen = useSetAtom(inboxOpenAtom);
  const setDrawerOpen = useSetAtom(mobileDrawerOpenAtom);
  const [tab, setTab] = useState<Tab>('invites');
  const [busyId, setBusyId] = useState<string | null>(null);
  const sendReadReceipts = useAtomValue(sendReadReceiptsAtom);
  const rooms = useAllRooms();

  const invites = useInvites();
  const { mentions, refresh: refreshMentions } = useMentions(true);
  const hasUnreadMentions = useHasUnreadMentions();
  const { threads } = useUnreadThreads(true);
  const setThreadsPanelView = useSetAtom(threadsPanelViewAtom);

  const activeCount =
    tab === 'invites' ? invites.length : tab === 'mentions' ? mentions.length : threads.length;

  const openRoom = (kind: Invite['kind'], roomId: string) => {
    setOpen(false);
    if (mobile) setDrawerOpen(false);
    navigate(ROUTE_PREFIX[kind] + encodeURIComponent(roomId));
  };

  const openThread = (kind: Invite['kind'], roomId: string, rootEventId: string) => {
    openRoom(kind, roomId);
    setThreadsPanelView({ type: 'thread', rootEventId });
  };

  const handleMarkRead = (roomId: string) => {
    if (!client) return;
    markRoomsAsRead(client, sendReadReceipts, [roomId]);
    refreshMentions();
  };

  const handleMarkAllRead = () => {
    if (!client) return;
    const roomIds = rooms
      .filter((room) => !room.isInvite && roomHasUnreadMention(room))
      .map((room) => room.id);
    markRoomsAsRead(client, sendReadReceipts, roomIds);
    refreshMentions();
  };

  const handleAccept = async (invite: Invite) => {
    if (!client || busyId) return;
    setBusyId(invite.roomId);
    try {
      await client.acceptInvite(invite.roomId);
      openRoom(invite.kind, invite.roomId);
    } catch (err) {
      toast.error(t('common.joinFailed', { error: getErrorMessage(err) }));
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async (invite: Invite) => {
    if (!client) return;
    setBusyId(invite.roomId);
    try {
      await client.declineInvite(invite.roomId);
    } catch (err) {
      toast.error(t('invite.declineFailed', { error: getErrorMessage(err) }));
    } finally {
      setBusyId(null);
    }
  };

  const markAllButton = tab === 'mentions' && hasUnreadMentions && (
    <Tooltip content={t('common.markAllRead')}>
      <button
        type="button"
        className={css.headerAction}
        onClick={handleMarkAllRead}
        aria-label={t('common.markAllRead')}
      >
        <ChecksIcon size={16} />
      </button>
    </Tooltip>
  );

  return (
    <>
      {!mobile && (
        <div className={css.header}>
          <span id="inbox-title" className={css.title}>
            <TrayIcon size={18} weight="fill" className={css.titleIcon} />
            {t('inbox.title')}
          </span>
          {markAllButton}
        </div>
      )}

      <div className={css.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'invites'}
          className={tab === 'invites' ? css.tabActive : css.tab}
          onClick={() => setTab('invites')}
        >
          {t('inbox.tabInvites')}
          {invites.length > 0 && (
            <span className={tab === 'invites' ? css.tabCountAccent : css.tabCount}>
              {invites.length > 99 ? '99+' : invites.length}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mentions'}
          className={tab === 'mentions' ? css.tabActive : css.tab}
          onClick={() => setTab('mentions')}
        >
          {t('inbox.tabMentions')}
          {mentions.length > 0 && (
            <span className={tab === 'mentions' ? css.tabCountAccent : css.tabCount}>
              {mentions.length > 99 ? '99+' : mentions.length}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'threads'}
          className={tab === 'threads' ? css.tabActive : css.tab}
          onClick={() => setTab('threads')}
        >
          {t('inbox.tabThreads')}
          {threads.length > 0 && (
            <span className={tab === 'threads' ? css.tabCountAccent : css.tabCount}>
              {threads.length > 99 ? '99+' : threads.length}
            </span>
          )}
        </button>
        {mobile && markAllButton}
      </div>

      <div className={css.content}>
        {activeCount === 0 ? (
          <div className={css.empty}>
            {tab === 'invites'
              ? t('inbox.emptyInvites')
              : tab === 'mentions'
                ? t('inbox.emptyMentions')
                : t('inbox.emptyThreads')}
          </div>
        ) : tab === 'invites' ? (
          invites.map((invite) => {
            const inviterName = invite.inviterDisplayName ?? t('invite.unknownInviter');
            const KindIcon = invite.kind === 'space' ? StackIcon : HashStraightIcon;
            const when = invite.ts != null ? formatRelativeTime(invite.ts, t, i18n.language) : '';
            return (
              <div key={invite.roomId} className={css.inviteItem}>
                <Avatar
                  name={invite.name}
                  mxcUrl={invite.avatarMxc}
                  client={client ?? undefined}
                  size="sm"
                />
                <div className={css.info}>
                  <span className={css.name}>
                    <span className={css.kindPrefix}>
                      {invite.kind === 'dm' ? '@' : <KindIcon size={13} weight="regular" />}
                    </span>
                    {invite.name}
                  </span>
                  <span className={css.subRow}>
                    <span className={css.sub}>{t('inbox.invitedBy', { name: inviterName })}</span>
                    {when && <span className={css.time}>{when}</span>}
                  </span>
                </div>
                <div className={css.actions}>
                  <button
                    type="button"
                    className={css.acceptButton}
                    disabled={busyId === invite.roomId}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleAccept(invite);
                    }}
                  >
                    {t('common.accept')}
                  </button>
                  <button
                    type="button"
                    className={css.declineButton}
                    disabled={busyId === invite.roomId}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDecline(invite);
                    }}
                  >
                    {t('common.decline')}
                  </button>
                </div>
              </div>
            );
          })
        ) : tab === 'threads' ? (
          threads.map((thread) => (
            <div
              key={`${thread.roomId}:${thread.rootEventId}`}
              className={css.item}
              role="button"
              tabIndex={0}
              onClick={() => openThread(thread.kind, thread.roomId, thread.rootEventId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openThread(thread.kind, thread.roomId, thread.rootEventId);
                }
              }}
            >
              <Avatar
                name={thread.roomName}
                mxcUrl={thread.roomAvatarMxc}
                client={client ?? undefined}
                size="sm"
              />
              <div className={css.info}>
                <span className={css.name}>
                  {thread.rootBody ? `${thread.roomName} · ${thread.rootBody}` : thread.roomName}
                </span>
                <span className={css.sub}>
                  {thread.latestBody
                    ? t('inbox.threadReply', { name: thread.senderName, text: thread.latestBody })
                    : t('inbox.threadReplied', { name: thread.senderName })}
                </span>
              </div>
              <span className={css.entryMeta}>
                <span className={css.time}>{formatRelativeTime(thread.ts, t, i18n.language)}</span>
                {thread.unread > 1 && (
                  <span className={css.tabCountAccent}>
                    {thread.unread > 99 ? '99+' : thread.unread}
                  </span>
                )}
              </span>
            </div>
          ))
        ) : (
          mentions.map((mention) => (
            <div
              key={mention.eventId || `${mention.roomId}:${mention.ts}`}
              className={css.item}
              role="button"
              tabIndex={0}
              onClick={() => openRoom(mention.kind, mention.roomId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openRoom(mention.kind, mention.roomId);
                }
              }}
            >
              <Avatar
                name={mention.roomName}
                mxcUrl={mention.roomAvatarMxc}
                client={client ?? undefined}
                size="sm"
              />
              <div className={css.info}>
                <span className={css.name}>{mention.roomName}</span>
                <span className={css.sub}>
                  {t('inbox.mentionedYou', { name: mention.senderName })}
                </span>
              </div>
              <span className={css.entryMeta}>
                <span className={css.time}>{formatRelativeTime(mention.ts, t, i18n.language)}</span>
                <Tooltip placement="left" content={t('common.markRead')}>
                  <button
                    type="button"
                    className={css.markReadButton}
                    aria-label={t('common.markRead')}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkRead(mention.roomId);
                    }}
                  >
                    <ChecksIcon size={14} />
                  </button>
                </Tooltip>
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

export function useInboxBadge() {
  const invites = useInvites();
  const hasUnreadMentions = useHasUnreadMentions();
  const hasUnreadThreads = useHasUnreadThreads();
  return {
    show: invites.length > 0 || hasUnreadMentions || hasUnreadThreads,
    mention: hasUnreadMentions,
  };
}

export function Inbox() {
  const { t } = useTranslation();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useAtom(inboxOpenAtom);
  const badge = useInboxBadge();

  return (
    <>
      <div ref={anchorRef} className={css.anchor}>
        <Tooltip placement="bottom" content={t('inbox.title')}>
          <button
            type="button"
            className={open ? css.inboxButtonActive : css.inboxButton}
            style={{ color: !open && badge.show ? vars.color.textPrimary : undefined }}
            aria-label={t('inbox.title')}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <TrayIcon size={18} weight={open ? 'fill' : 'regular'} />
            {badge.show && <span className={badge.mention ? css.notifDotMention : css.notifDot} />}
          </button>
        </Tooltip>
      </div>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        placement="bottom-end"
        shiftCrossAxis
        role="dialog"
        labelledBy="inbox-title"
        className={css.panel}
      >
        <InboxContent />
      </Popover>
    </>
  );
}

export function MobileInboxPage() {
  return (
    <section className={css.mobilePage}>
      <InboxContent mobile />
    </section>
  );
}
