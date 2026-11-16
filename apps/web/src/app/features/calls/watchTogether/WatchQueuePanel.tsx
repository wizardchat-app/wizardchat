import { useEffect, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  ArrowLineUpIcon,
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretRightIcon,
  DotsSixVerticalIcon,
  PlayIcon,
  ShuffleIcon,
  StopIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { Spinner } from '@/app/components/Spinner';
import { useConfirm } from '@/app/hooks/useConfirm';
import {
  QUEUE_LIMIT,
  expectedPosition,
  parseYouTubeLink,
  watchActionsAtom,
  watchQueueOpenAtom,
  watchStateAtom,
  youtubeThumbnail,
  youtubeWatchUrl,
  type QueueItem,
} from './watchTogether';
import { fetchPlaylistIds, fetchVideoInfo } from './youtube';
import * as css from './WatchQueue.css';

function useVideoInfo(videoId: string) {
  return useQuery({
    queryKey: ['youtubeVideoInfo', videoId],
    queryFn: () => fetchVideoInfo(videoId),
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: 1,
  });
}

interface RowProps {
  item: QueueItem;
  addedByName: string;
  current?: boolean;
  children?: React.ReactNode;
  handle?: React.ReactNode;
}

function VideoRow({ item, addedByName, current, children, handle }: RowProps) {
  const { t } = useTranslation();
  const { data } = useVideoInfo(item.videoId);
  return (
    <>
      {handle}
      <img
        className={css.thumb}
        src={youtubeThumbnail(item.videoId)}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <span className={css.text}>
        <span className={current ? css.titleCurrent : css.title}>
          {data?.title ?? item.videoId}
        </span>
        <span className={css.meta}>
          {t('call.watchTogether.queue.addedBy', { name: addedByName })}
        </span>
      </span>
      {children && <span className={css.actions}>{children}</span>}
    </>
  );
}

function IconAction({
  label,
  onClick,
  children,
  danger,
  destructive,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  destructive?: boolean;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        className={destructive ? css.actionDestructive : danger ? css.actionDanger : css.action}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
}

interface SortableRowProps {
  item: QueueItem;
  addedByName: string;
  onPlay: () => void;
  onPlayNext?: () => void;
  onRemove: () => void;
}

function SortableRow({ item, addedByName, onPlay, onPlayNext, onRemove }: SortableRowProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  return (
    <li
      ref={setNodeRef}
      className={isDragging ? css.rowDragging : css.row}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      onDoubleClick={onPlay}
    >
      <VideoRow
        item={item}
        addedByName={addedByName}
        handle={
          <span
            className={css.handle}
            aria-label={t('call.watchTogether.queue.reorder')}
            {...attributes}
            {...listeners}
          >
            <DotsSixVerticalIcon size={16} weight="bold" />
          </span>
        }
      >
        <IconAction label={t('call.watchTogether.queue.playNow')} onClick={onPlay}>
          <PlayIcon size={14} weight="fill" />
        </IconAction>
        {onPlayNext && (
          <IconAction label={t('call.watchTogether.queue.playNext')} onClick={onPlayNext}>
            <ArrowLineUpIcon size={14} />
          </IconAction>
        )}
        <IconAction label={t('call.watchTogether.queue.remove')} onClick={onRemove} danger>
          <XIcon size={14} />
        </IconAction>
      </VideoRow>
    </li>
  );
}

export function WatchQueuePanel({ nameOf }: { nameOf: (userId: string) => string }) {
  const { t } = useTranslation();
  const state = useAtomValue(watchStateAtom);
  const actions = useAtomValue(watchActionsAtom);
  const [, setOpen] = useAtom(watchQueueOpenAtom);
  const confirm = useConfirm();
  const [link, setLink] = useState('');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"][aria-modal="true"]'))
        return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [setOpen]);

  if (!state || !actions) return null;
  const { queue, history } = state;
  const full = queue.length >= QUEUE_LIMIT;

  const add = async () => {
    const parsed = parseYouTubeLink(link);
    if (!parsed) {
      setNotice({ text: t('call.watchTogether.invalidLink'), error: true });
      return;
    }
    if (!parsed.listId && parsed.videoId) {
      actions.enqueue([parsed.videoId]);
      setLink('');
      setNotice(null);
      return;
    }
    setAdding(true);
    setNotice(null);
    try {
      const ids = await fetchPlaylistIds(parsed.listId!);
      const start = parsed.videoId ? ids.indexOf(parsed.videoId) : -1;
      const ordered = start > 0 ? [...ids.slice(start), ...ids.slice(0, start)] : ids;
      const dropped = actions.enqueue(ordered);
      setLink('');
      setNotice({
        text:
          dropped > 0
            ? t('call.watchTogether.queue.addedSome', {
                count: ordered.length - dropped,
                dropped,
              })
            : t('call.watchTogether.queue.addedPlaylist', { count: ordered.length }),
        error: false,
      });
    } catch {
      if (parsed.videoId) {
        actions.enqueue([parsed.videoId]);
        setLink('');
      } else {
        setNotice({ text: t('call.watchTogether.queue.playlistFailed'), error: true });
      }
    } finally {
      setAdding(false);
    }
  };

  const clear = async () => {
    const ok = await confirm({
      title: t('call.watchTogether.queue.clearConfirm'),
      message: t('call.watchTogether.queue.clearMessage', { count: queue.length }),
      confirmLabel: t('call.watchTogether.queue.clear'),
      danger: true,
    });
    if (ok) actions.clear();
  };

  const stopForEveryone = async () => {
    const ok = await confirm({
      title: t('call.watchTogether.stopConfirm'),
      message: t('call.watchTogether.stopMessage'),
      confirmLabel: t('call.watchTogether.stopForEveryone'),
      danger: true,
    });
    if (ok) actions.stop();
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = queue.map((item) => item.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    actions.reorder(arrayMove(ids, from, to));
  };

  const current: QueueItem = { id: 'current', videoId: state.videoId, addedBy: state.addedBy };

  return (
    <div className={css.panel} role="dialog" aria-label={t('call.watchTogether.queue.title')}>
      <div className={css.header}>
        <span className={css.heading}>
          {t('call.watchTogether.queue.title')}
          <span className={css.count}>
            {queue.length}/{QUEUE_LIMIT}
          </span>
        </span>
        <span className={css.headerActions}>
          <IconAction
            label={t('call.watchTogether.stopForEveryone')}
            onClick={() => void stopForEveryone()}
            destructive
          >
            <StopIcon size={16} weight="fill" />
          </IconAction>
          <IconAction label={t('common.close')} onClick={() => setOpen(false)}>
            <XIcon size={16} />
          </IconAction>
        </span>
      </div>

      <form
        className={css.addRow}
        onSubmit={(e) => {
          e.preventDefault();
          if (link.trim() && !adding && !full) void add();
        }}
      >
        <input
          ref={inputRef}
          className={css.addInput}
          value={link}
          placeholder={t('call.watchTogether.queue.addPlaceholder')}
          aria-label={t('call.watchTogether.queue.addPlaceholder')}
          onChange={(e) => {
            setLink(e.target.value);
            setNotice(null);
          }}
          disabled={adding || full}
        />
        <button type="submit" className={css.addButton} disabled={!link.trim() || adding || full}>
          {adding ? <Spinner size="sm" /> : t('call.watchTogether.queue.add')}
        </button>
      </form>
      {(notice || full) && (
        <div className={notice?.error ? css.noticeError : css.notice}>
          {notice?.text ?? t('call.watchTogether.queue.full', { count: QUEUE_LIMIT })}
        </div>
      )}

      <div className={css.body}>
        <div className={css.sectionLabel}>{t('call.watchTogether.queue.nowPlaying')}</div>
        <div className={css.rowCurrent}>
          <VideoRow item={current} addedByName={nameOf(current.addedBy)} current>
            <IconAction
              label={t('call.watchTogether.openOnYouTube')}
              onClick={() =>
                window.open(
                  youtubeWatchUrl(state.videoId, expectedPosition(state)),
                  '_blank',
                  'noopener,noreferrer'
                )
              }
            >
              <ArrowSquareOutIcon size={14} />
            </IconAction>
          </VideoRow>
        </div>

        <div className={css.sectionRow}>
          <div className={css.sectionLabel}>{t('call.watchTogether.queue.upNext')}</div>
          {queue.length > 0 && (
            <span className={css.headerActions}>
              {queue.length > 1 && (
                <IconAction
                  label={t('call.watchTogether.queue.shuffle')}
                  onClick={() => actions.shuffle()}
                >
                  <ShuffleIcon size={15} />
                </IconAction>
              )}
              <IconAction
                label={t('call.watchTogether.queue.clear')}
                onClick={() => void clear()}
                destructive
              >
                <TrashIcon size={15} />
              </IconAction>
            </span>
          )}
        </div>
        {queue.length === 0 ? (
          <div className={css.empty}>{t('call.watchTogether.queue.empty')}</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={queue.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <ol className={css.list}>
                {queue.map((item, index) => (
                  <SortableRow
                    key={item.id}
                    item={item}
                    addedByName={nameOf(item.addedBy)}
                    onPlay={() => actions.playNow(item)}
                    onPlayNext={index > 0 ? () => actions.playNext(item.id) : undefined}
                    onRemove={() => actions.remove(item.id)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}

        {history.length > 0 && (
          <>
            <button
              type="button"
              className={css.historyToggle}
              onClick={() => setHistoryOpen((open) => !open)}
              aria-expanded={historyOpen}
            >
              {historyOpen ? <CaretDownIcon size={12} /> : <CaretRightIcon size={12} />}
              {t('call.watchTogether.queue.history', { count: history.length })}
            </button>
            {historyOpen && (
              <ol className={css.list}>
                {history.map((item) => (
                  <li
                    key={item.id}
                    className={css.rowPlayed}
                    onDoubleClick={() => actions.playNow(item)}
                  >
                    <VideoRow item={item} addedByName={nameOf(item.addedBy)}>
                      <IconAction
                        label={t('call.watchTogether.queue.playAgain')}
                        onClick={() => actions.playNow(item)}
                      >
                        <PlayIcon size={14} weight="fill" />
                      </IconAction>
                    </VideoRow>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  );
}
