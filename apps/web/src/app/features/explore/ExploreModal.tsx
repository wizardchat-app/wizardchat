import { useState, useRef, useCallback, useMemo, KeyboardEvent } from 'react';
import { useQuery, useQueries, keepPreviousData } from '@tanstack/react-query';
import type { PublicRoom, WizardClient as MatrixClient } from '@wizardchat/core';
import {
  MagnifyingGlassIcon,
  CompassIcon,
  UsersIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAtom } from 'jotai';
import { clientConfig } from '@/client/config';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useAllRooms, useJoinedSpaces, useSpaceGraph } from '@/app/data';
import { LogoHover } from '@/app/components/AppLoading';
import { currentRoomIdAtom, exploreOpenAtom } from '@/app/store/atoms';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { viaServersFor } from '@/util/matrix';
import { Dialog } from '@/app/components/Dialog/Dialog';
import { useAvatarBlobUrl } from '@/app/components/Avatar';
import { Select } from '@/app/components/Select';
import * as css from './ExploreModal.css';

type ExploreTab = 'featured' | 'server' | 'other';
type RoomFilter = 'all' | 'spaces' | 'rooms';

function getHueFromName(name: string): number {
  const code = (name || '?').codePointAt(0) ?? 63;
  return Math.round((code * 137.508) % 360);
}

function formatMembers(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

interface RoomCardProps {
  roomId: string;
  name: string;
  alias?: string | null;
  topic?: string | null;
  avatarMxc?: string | null;
  client?: MatrixClient | null;
  members: number;
  isSpace: boolean;
  isJoined: boolean;
  onJoin: (roomId: string, alias: string | null | undefined) => void;
  joiningId: string | null;
}

function RoomCard({
  roomId,
  name,
  alias,
  topic,
  avatarMxc,
  client,
  members,
  isSpace,
  isJoined,
  onJoin,
  joiningId,
}: RoomCardProps) {
  const { t } = useTranslation();
  const hue = getHueFromName(name);
  const { data: avatarBlob } = useAvatarBlobUrl(avatarMxc, client);
  const key = alias ?? roomId;
  const isJoining = joiningId === key;

  return (
    <div className={css.roomCard}>
      <div className={css.cardTop}>
        <div
          className={css.cardAvatar}
          style={
            avatarBlob
              ? { backgroundImage: `url(${avatarBlob})`, backgroundSize: 'cover' }
              : { backgroundColor: `hsl(${hue}, 55%, 42%)` }
          }
        >
          {!avatarBlob && name.charAt(0).toUpperCase()}
        </div>
        <div className={css.cardInfo}>
          <div className={css.cardName} title={name}>
            {name}
          </div>
          {alias && <div className={css.cardAlias}>{alias}</div>}
        </div>
        <span className={css.cardTypeBadge}>
          {isSpace ? t('explore.typeSpace') : t('explore.typeRoom')}
        </span>
      </div>

      {topic && <p className={css.cardTopic}>{topic}</p>}

      <div className={css.cardFooter}>
        <span className={css.cardMembers}>
          <UsersIcon size={12} />
          {formatMembers(members)} {t('explore.members')}
        </span>
        {isJoined ? (
          <span className={css.joinedBadge}>{t('explore.joined')}</span>
        ) : (
          <button
            type="button"
            className={css.joinBtn}
            disabled={isJoining}
            onClick={() => onJoin(roomId, alias)}
          >
            {isJoining ? t('explore.joining') : t('common.join')}
          </button>
        )}
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className={css.skeletonGrid}>
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className={css.skeletonCard} />
      ))}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className={css.emptyState}>
      <LogoHover size={60} />
      <p className={css.emptyTitle}>{title}</p>
      <p className={css.emptyBody}>{body}</p>
    </div>
  );
}

const PAGE_SIZE = 30;
const PAGE_SIZE_FILTERED = 60;

export function ExploreModal() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const navigate = useNavigate();
  const [open, setOpen] = useAtom(exploreOpenAtom);
  const [, setCurrentRoomId] = useAtom(currentRoomIdAtom);
  const toast = useToast();

  const homeDomain = client?.userId()?.split(':').slice(1).join(':') || 'your server';
  const allRooms = useAllRooms();
  const joinedSpaces = useJoinedSpaces();
  const spaceGraph = useSpaceGraph();
  const localJoinedIds = useMemo(
    () =>
      new Set([
        ...allRooms.filter((r) => !r.isInvite).map((r) => r.id),
        ...joinedSpaces.map((s) => s.id),
        ...spaceGraph.map((s) => s.spaceId),
      ]),
    [allRooms, joinedSpaces, spaceGraph]
  );

  const featured = clientConfig().featuredCommunities;
  const curated = featured.spaces.length + featured.rooms.length > 0;
  const listed = featured.servers;
  const featuredServer = curated ? null : listed ? (listed[0] ?? null) : 'matrix.org';
  const hasFeatured = curated || !!featuredServer;
  const serverPills = useMemo(
    () => (listed ? [...new Set(curated ? listed : listed.slice(1))] : [homeDomain]),
    [homeDomain, curated, listed]
  );
  const firstTab: ExploreTab = hasFeatured ? 'featured' : serverPills.length ? 'server' : 'other';

  const [activeTab, setActiveTab] = useState<ExploreTab>(firstTab);
  const [picked, setPickedServer] = useState<string | null>(null);
  const pickedServer = picked ?? serverPills[0] ?? homeDomain;
  const [otherInput, setOtherInput] = useState('');
  const [otherServer, setOtherServer] = useState('');
  const otherInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<RoomFilter>('all');

  // pageHistory[i] = the `since` token needed to fetch page i.
  // pageHistory[0] is always undefined (first page has no since token).
  const [pageHistory, setPageHistory] = useState<Array<string | undefined>>([undefined]);
  const [currentPage, setCurrentPage] = useState(0); // 0-indexed

  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinedIds, setJoinedIds] = useState(() => new Set<string>());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isFeatured = activeTab === 'featured';
  const showCurated = isFeatured && curated;
  const queryServer =
    activeTab === 'server'
      ? pickedServer
      : activeTab === 'other'
        ? otherServer
        : (featuredServer ?? '');

  const roomsQuery = useQuery({
    queryKey: [
      'publicRooms',
      queryServer,
      isFeatured,
      debouncedQuery,
      filter,
      pageHistory[currentPage],
    ],
    queryFn: async () => {
      if (!client || !queryServer)
        return { chunk: [] as PublicRoom[], nextBatch: undefined as string | undefined };
      const res = await client.publicRoomsPage(
        isFeatured ? '' : debouncedQuery.trim(),
        queryServer,
        null,
        !isFeatured && filter !== 'all' ? PAGE_SIZE_FILTERED : PAGE_SIZE,
        pageHistory[currentPage] ?? null
      );
      let chunk = res.rooms ?? [];
      if (isFeatured) return { chunk, nextBatch: res.next ?? undefined };
      if (filter === 'spaces') chunk = chunk.filter((r) => r.isSpace);
      else if (filter === 'rooms') chunk = chunk.filter((r) => !r.isSpace);
      return { chunk, nextBatch: res.next ?? undefined };
    },
    enabled: !!client && !!queryServer && !showCurated,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    gcTime: 300_000,
  });

  const curatedEntries = useMemo(
    () => [
      ...featured.spaces.map((id) => ({ id, section: 'spaces' as const })),
      ...featured.rooms.map((id) => ({ id, section: 'rooms' as const })),
    ],
    [featured.spaces, featured.rooms]
  );
  const previews = useQueries({
    queries: curatedEntries.map(({ id }) => ({
      queryKey: ['roomPreview', id],
      queryFn: () => client!.roomPreview(id, null),
      enabled: open && !!client && showCurated,
      staleTime: 300_000,
      gcTime: 600_000,
      retry: 1,
    })),
  });
  const curatedRooms = (section: 'spaces' | 'rooms') =>
    curatedEntries.flatMap((entry, i) =>
      entry.section === section && previews[i].data ? [previews[i].data] : []
    );
  const featuredSpaces = curatedRooms('spaces');
  const featuredRooms = curatedRooms('rooms');
  const curatedLoading = previews.some((q) => q.isPending && q.fetchStatus !== 'idle');

  const rooms = showCurated ? [] : (roomsQuery.data?.chunk ?? []);
  const nextBatch = showCurated ? undefined : roomsQuery.data?.nextBatch;
  const loading = showCurated ? curatedLoading : roomsQuery.isFetching;
  const error = !showCurated && roomsQuery.error ? getErrorMessage(roomsQuery.error) : null;

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (activeTab === 'featured') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(val);
      setPageHistory([undefined]);
      setCurrentPage(0);
    }, 400);
  };

  const handleNextPage = () => {
    if (!nextBatch) return;
    const newPage = currentPage + 1;
    setPageHistory((prev) => {
      const next = [...prev];
      next[newPage] = nextBatch;
      return next;
    });
    setCurrentPage(newPage);
  };

  const handlePrevPage = () => {
    if (currentPage === 0) return;
    const newPage = currentPage - 1;
    setCurrentPage(newPage);
  };

  const commitOtherServer = () => {
    const trimmed = otherInput.trim();
    if (!trimmed) return;
    setOtherServer(trimmed);
    setDebouncedQuery(query);
    setPageHistory([undefined]);
    setCurrentPage(0);
  };

  const handleOtherKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitOtherServer();
  };

  const switchTab = (tab: ExploreTab, server?: string) => {
    setActiveTab(tab);
    if (server) setPickedServer(server);
    setQuery('');
    setDebouncedQuery('');
    setFilter('all');
    setPageHistory([undefined]);
    setCurrentPage(0);
  };

  const renderCard = (room: PublicRoom) => (
    <RoomCard
      key={room.id}
      roomId={room.id}
      name={room.name ?? room.alias ?? room.id}
      alias={room.alias}
      topic={room.topic}
      avatarMxc={room.avatarUrl}
      client={client}
      members={room.memberCount}
      isSpace={room.isSpace}
      isJoined={isRoomJoined(room.id, room.alias)}
      onJoin={handleJoin}
      joiningId={joiningId}
    />
  );

  // When clicking the "other" pill, focus its input
  const handleOtherPillClick = () => {
    setActiveTab('other');
    setQuery('');
    setDebouncedQuery('');
    setFilter('all');
    setPageHistory([undefined]);
    setCurrentPage(0);
    setTimeout(() => otherInputRef.current?.focus(), 50);
  };

  const handleJoin = useCallback(
    async (roomId: string, alias: string | null | undefined) => {
      if (!client) return;
      const key = alias ?? roomId;
      setJoiningId(key);
      try {
        const targets = [alias, roomId].filter((t): t is string => !!t);
        let joinedRoomId: string | null = null;
        let lastErr: unknown;
        for (const target of targets) {
          const viaServers = viaServersFor(target, homeDomain).viaServers;
          try {
            joinedRoomId = await client.join(target, viaServers.length > 0 ? viaServers : null);
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (!joinedRoomId) throw lastErr;
        setJoinedIds((prev) => {
          const next = new Set(prev);
          next.add(key);
          next.add(joinedRoomId);
          return next;
        });
        setCurrentRoomId(joinedRoomId);
        setOpen(false);
        navigate(`/r/${encodeURIComponent(joinedRoomId)}`);
      } catch (err) {
        toast.error(t('common.joinFailed', { error: getErrorMessage(err) }));
      } finally {
        setJoiningId(null);
      }
    },
    [client, homeDomain, navigate, setCurrentRoomId, setOpen, toast, t]
  );

  const isRoomJoined = useCallback(
    (roomId: string, alias?: string | null): boolean => {
      if (joinedIds.has(roomId)) return true;
      if (alias && joinedIds.has(alias)) return true;
      return localJoinedIds.has(roomId);
    },
    [joinedIds, localJoinedIds]
  );

  // Reset state when closing
  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setActiveTab(firstTab);
      setPickedServer(null);
      setQuery('');
      setDebouncedQuery('');
      setFilter('all');
      setOtherInput('');
      setOtherServer('');
      setPageHistory([undefined]);
      setCurrentPage(0);
    }, 200);
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t('explore.title')}
      titleIcon={<CompassIcon size={18} weight="fill" />}
      zIndex={8000}
      maxWidth="1000px"
      height="80vh"
      bodyClassName={css.dialogBody}
    >
      {/* Controls row */}
      <div className={css.controlsRow}>
        {/* Server pill switcher */}
        <div className={css.pillGroup}>
          {hasFeatured && (
            <button
              type="button"
              className={activeTab === 'featured' ? css.pillActive : css.pill}
              onClick={() => switchTab('featured')}
            >
              {t('explore.tabFeatured')}
            </button>
          )}

          {serverPills.map((server) => (
            <button
              key={server}
              type="button"
              className={
                activeTab === 'server' && pickedServer === server ? css.pillActive : css.pill
              }
              onClick={() => switchTab('server', server)}
            >
              {server}
            </button>
          ))}

          {/* Other server: editable pill */}
          <div
            className={activeTab === 'other' ? css.pillOtherWrapperActive : css.pillOtherWrapper}
            onClick={activeTab !== 'other' ? handleOtherPillClick : undefined}
          >
            <input
              ref={otherInputRef}
              className={activeTab === 'other' ? css.pillOtherInputActive : css.pillOtherInput}
              value={otherInput}
              onChange={(e) => setOtherInput(e.target.value)}
              onKeyDown={handleOtherKeyDown}
              onFocus={() => activeTab !== 'other' && handleOtherPillClick()}
              placeholder={activeTab === 'other' ? 'mozilla.org' : t('explore.tabOther')}
              spellCheck={false}
            />
            {activeTab === 'other' && otherInput.trim() && (
              <button
                type="button"
                className={css.pillGoBtn}
                onClick={commitOtherServer}
                aria-label={t('explore.go')}
              >
                <ArrowRightIcon size={13} weight="bold" />
              </button>
            )}
          </div>
        </div>

        {/* Search + filter - slide in from left when not on featured tab */}
        <div
          className={
            activeTab !== 'featured' ? css.searchFilterSlotVisible : css.searchFilterSlotHidden
          }
        >
          <div className={css.searchWrapper}>
            <span className={css.searchIcon}>
              <MagnifyingGlassIcon size={14} />
            </span>
            <input
              className={css.searchInput}
              value={query}
              onChange={handleQueryChange}
              placeholder={t('explore.searchPlaceholder')}
              spellCheck={false}
              tabIndex={activeTab !== 'featured' ? 0 : -1}
            />
          </div>
          <Select
            className={css.filterSelect}
            aria-label={t('explore.filterLabel')}
            value={filter}
            options={[
              { value: 'all', label: t('explore.filterAll') },
              { value: 'spaces', label: t('explore.filterSpaces') },
              { value: 'rooms', label: t('explore.filterRooms') },
            ]}
            onChange={(v) => {
              setFilter(v as RoomFilter);
              setPageHistory([undefined]);
              setCurrentPage(0);
            }}
            tabIndex={activeTab !== 'featured' ? 0 : -1}
          />
        </div>
      </div>

      {/* Content */}
      <div className={css.scrollArea}>
        {/* Waiting for server input */}
        {activeTab === 'other' && !otherServer && !loading && (
          <EmptyState title={t('explore.emptyTitle')} body={t('explore.emptyBody')} />
        )}

        {error && <div className={css.errorBanner}>{t('explore.fetchError', { error })}</div>}

        {loading && !rooms.length && featuredSpaces.length + featuredRooms.length === 0 && (
          <SkeletonGrid />
        )}

        {rooms.length > 0 && (activeTab !== 'other' || otherServer) && (
          <>
            <p className={css.sectionTitle}>
              {isFeatured
                ? t('explore.featuredSpaces')
                : t('explore.publicRoomsOn', {
                    server: activeTab === 'server' ? pickedServer : otherServer,
                  })}
            </p>
            <div className={css.roomGrid}>{rooms.map(renderCard)}</div>
            {(currentPage > 0 || nextBatch) && (
              <div className={css.paginationRow}>
                <button
                  type="button"
                  className={css.pageBtn}
                  onClick={handlePrevPage}
                  disabled={currentPage === 0 || loading}
                >
                  <ArrowLeftIcon size={14} weight="bold" />
                  {t('explore.prevPage')}
                </button>
                <span className={css.pageIndicator}>
                  {t('explore.pageOf', { page: currentPage + 1 })}
                </span>
                <button
                  type="button"
                  className={css.pageBtn}
                  onClick={handleNextPage}
                  disabled={!nextBatch || loading}
                >
                  {t('explore.nextPage')}
                  <ArrowRightIcon size={14} weight="bold" />
                </button>
              </div>
            )}
          </>
        )}

        {showCurated && featuredSpaces.length > 0 && (
          <>
            <p className={css.sectionTitle}>{t('explore.featuredSpacesTitle')}</p>
            <div className={css.roomGrid}>{featuredSpaces.map(renderCard)}</div>
          </>
        )}

        {showCurated && featuredRooms.length > 0 && (
          <>
            <p className={css.sectionTitle}>{t('explore.featuredRoomsTitle')}</p>
            <div className={css.roomGrid}>{featuredRooms.map(renderCard)}</div>
          </>
        )}

        {showCurated && !loading && featuredSpaces.length + featuredRooms.length === 0 && (
          <EmptyState title={t('explore.featuredEmpty')} body={t('explore.featuredEmptyBody')} />
        )}

        {!showCurated &&
          !loading &&
          !error &&
          rooms.length === 0 &&
          (activeTab !== 'other' || otherServer) && (
            <EmptyState title={t('explore.noResults')} body={t('explore.noResultsBody')} />
          )}
      </div>
    </Dialog>
  );
}
