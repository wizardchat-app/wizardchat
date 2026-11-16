import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StickerIcon, XIcon } from '@phosphor-icons/react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useToast } from '@/app/hooks/useToast';
import { useCoarsePointer } from '@/app/hooks/useCoarsePointer';
import { getErrorMessage } from '@/util/error';
import { useAtom } from 'jotai';
import { roomSettingsRoomIdAtom, roomSettingsTabAtom } from '@/app/store/atoms';
import { useRoomImagePacks, type ImagePack, type ImagePackImage } from '@/app/hooks/useImagePacks';
import { useDelayedFlag } from '@/app/hooks/useDelayedFlag';
import { AuthMediaImg } from '@/app/components/AuthMediaImg';
import { Tooltip } from '@/app/components/Tooltip';
import { PickerPreviewBar, type PreviewItem } from '@/app/components/PickerPreviewBar';
import { fetchMediaBlobUrl } from '@/app/components/Avatar';
import { getImageDimensions } from '@/app/features/timeline/composer/imageDimensions';
import {
  sendRawEvent,
  type ReplyTarget,
} from '@/app/features/timeline/composer/sendMessageContent';
import { useComposerTimeline } from '@/app/features/timeline/composer/composerTimeline';
import * as css from './NativeStickerPicker.css';

type StickerImage = ImagePackImage;

interface PackGroup {
  packName: string;
  stickers: StickerImage[];
}

function stickerGroups(packs: ImagePack[]): PackGroup[] {
  const byName = new Map<string, Map<string, StickerImage>>();
  for (const pack of packs) {
    for (const image of pack.images) {
      if (!image.usage.includes('sticker')) continue;
      const stickers = byName.get(pack.name) ?? new Map<string, StickerImage>();
      if (!stickers.has(image.shortcode)) stickers.set(image.shortcode, image);
      byName.set(pack.name, stickers);
    }
  }
  return Array.from(byName, ([packName, stickers]) => ({
    packName,
    stickers: Array.from(stickers.values()).sort((a, b) => a.shortcode.localeCompare(b.shortcode)),
  })).sort((a, b) => a.packName.localeCompare(b.packName));
}

function hasDimensions(info: Record<string, unknown> | undefined): boolean {
  return typeof info?.w === 'number' && info.w > 0 && typeof info.h === 'number' && info.h > 0;
}

const measuredDims = new Map<string, { w: number; h: number }>();

function rememberDims(url: string, img: HTMLImageElement): void {
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    measuredDims.set(url, { w: img.naturalWidth, h: img.naturalHeight });
  }
}

async function resolveStickerInfo(
  client: MatrixClient,
  url: string,
  baseInfo: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (hasDimensions(baseInfo)) return baseInfo;
  const measured = measuredDims.get(url);
  if (measured) return { ...baseInfo, ...measured };
  try {
    const blobUrl = await fetchMediaBlobUrl(url, client);
    if (!blobUrl) return baseInfo;
    const blob = await fetch(blobUrl).then((res) => res.blob());
    const dims = await getImageDimensions(blob);
    if (!dims) return baseInfo;
    return {
      ...baseInfo,
      w: dims.w,
      h: dims.h,
      size: blob.size,
      mimetype: baseInfo.mimetype ?? blob.type,
    };
  } catch {
    return baseInfo;
  }
}

interface Props {
  client: MatrixClient;
  roomId: string;
  threadId?: string | null;
  naked?: boolean;
  onClose: () => void;
  replyTo?: ReplyTarget | null;
  onReplySent?: () => void;
}

export function NativeStickerPicker({
  client,
  roomId,
  threadId,
  naked,
  onClose,
  replyTo,
  onReplySent,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const getTimeline = useComposerTimeline(client, roomId, threadId);
  const coarse = useCoarsePointer();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [, setRoomSettingsId] = useAtom(roomSettingsRoomIdAtom);
  const [, setRoomSettingsTab] = useAtom(roomSettingsTabAtom);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activeNav, setActiveNav] = useState('');
  const [preview, setPreview] = useState<PreviewItem | null>(null);
  const previewSticker = useCallback((sticker: StickerImage) => {
    setPreview({
      kind: 'image',
      url: sticker.url,
      shortcode: `:${sticker.shortcode}:`,
      label: sticker.packName,
    });
  }, []);

  const imagePacks = useRoomImagePacks(client, roomId);
  const grouped = useMemo(() => imagePacks && stickerGroups(imagePacks), [imagePacks]);
  const loading = grouped === null;
  const showSkeleton = useDelayedFlag(loading, 300);

  const filteredPacks = useMemo(() => {
    if (!grouped) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return grouped;
    return grouped
      .map((pack) => {
        const filtered = pack.stickers.filter(
          (s) => s.shortcode.toLowerCase().includes(q) || pack.packName.toLowerCase().includes(q)
        );
        if (filtered.length === 0) return null;
        return { ...pack, stickers: filtered };
      })
      .filter(Boolean) as PackGroup[];
  }, [grouped, searchQuery]);

  const sendSticker = useCallback(
    async (sticker: StickerImage) => {
      onClose();
      try {
        const baseInfo: Record<string, unknown> = { ...sticker.info };
        if (sticker.mimetype && !baseInfo.mimetype) baseInfo.mimetype = sticker.mimetype;
        const [info, timeline] = await Promise.all([
          resolveStickerInfo(client, sticker.url, baseInfo),
          getTimeline(),
        ]);
        const content: Record<string, unknown> = {
          body: sticker.body ?? sticker.shortcode,
          url: sticker.url,
          info,
        };
        await sendRawEvent('m.sticker', content, {
          timeline,
          threadId,
          replyTo,
          myId: client.userId() ?? '',
        });
        if (replyTo) onReplySent?.();
      } catch (err) {
        toast.error(t('room.settings.widgets.stickerSendFailed', { error: getErrorMessage(err) }));
      }
    },
    [client, threadId, getTimeline, onClose, replyTo, onReplySent, toast, t]
  );

  useEffect(() => {
    if (naked || !wrapRef.current) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleMouse = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleMouse);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleMouse);
    };
  }, [onClose, naked]);

  useEffect(() => {
    if (!coarse) searchRef.current?.focus();
  }, [coarse]);

  useEffect(() => {
    if (!bodyRef.current || filteredPacks.length === 0 || searchQuery) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let best = '';
        let bestRatio = 0;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            best = entry.target.getAttribute('data-pack-id') ?? '';
            bestRatio = entry.intersectionRatio;
          }
        }
        if (best) setActiveNav(best);
      },
      { root: bodyRef.current, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    const els: Element[] = [];
    sectionRefs.current.forEach((el) => {
      observer.observe(el);
      els.push(el);
    });
    return () => {
      els.forEach((el) => observer.unobserve(el));
    };
  }, [filteredPacks, searchQuery]);

  const handleNavClick = useCallback((packName: string) => {
    setActiveNav(packName);
    const el = sectionRefs.current.get(packName);
    if (el) {
      el.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, []);

  const sectionRefCb = useCallback(
    (packName: string) => (el: HTMLDivElement | null) => {
      if (el) sectionRefs.current.set(packName, el);
      else sectionRefs.current.delete(packName);
    },
    []
  );

  const openRoomSettings = useCallback(() => {
    setRoomSettingsTab('emojis');
    setRoomSettingsId(roomId);
    onClose();
  }, [setRoomSettingsTab, setRoomSettingsId, roomId, onClose]);

  const hasResults = filteredPacks.some((p) => p.stickers.length > 0);

  const firstPreview = useMemo<PreviewItem | null>(() => {
    const pack = filteredPacks.find((p) => p.stickers.length > 0);
    const sticker = pack?.stickers[0];
    if (!sticker) return null;
    return {
      kind: 'image',
      url: sticker.url,
      shortcode: `:${sticker.shortcode}:`,
      label: sticker.packName,
    };
  }, [filteredPacks]);

  useEffect(() => {
    setPreview(null);
  }, [searchQuery]);

  const stickerContent = (
    <>
      {showSkeleton && (
        <div className={css.packSection} aria-busy="true" aria-label={t('common.loading')}>
          <div className={css.packLabel}>
            <div className={css.skeletonLabel} />
          </div>
          <div className={css.grid}>
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className={css.skeletonTile} />
            ))}
          </div>
        </div>
      )}

      {!loading && filteredPacks.length === 0 && !hasResults && (
        <div className={css.emptyState}>
          {searchQuery ? t('composer.noEmojiFound') : t('room.settings.emojis.noStickers')}
          <br />
          <button type="button" className={css.emptyLink} onClick={openRoomSettings}>
            {t('room.settings.emojis.title')}
          </button>
        </div>
      )}

      {filteredPacks.map((pack) => (
        <div
          key={pack.packName}
          ref={sectionRefCb(pack.packName)}
          data-pack-id={pack.packName}
          className={css.packSection}
        >
          <div className={css.packLabel}>{pack.packName}</div>
          <div className={css.grid}>
            {pack.stickers.map((sticker) => (
              <button
                key={sticker.shortcode}
                type="button"
                className={css.item}
                onMouseEnter={() => previewSticker(sticker)}
                onClick={() => void sendSticker(sticker)}
              >
                <AuthMediaImg
                  client={client}
                  mxcUrl={sticker.url}
                  alt={sticker.shortcode}
                  className={css.image}
                  placeholder="sticker"
                  loading="lazy"
                  onLoad={(e) => rememberDims(sticker.url, e.currentTarget)}
                />
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );

  const navContent = (
    <>
      {filteredPacks.map((pack) => {
        const first = pack.stickers[0];
        return (
          <Tooltip key={pack.packName} placement="right" content={pack.packName}>
            <button
              type="button"
              className={`${css.navBtn} ${activeNav === pack.packName ? css.navBtnActive : ''}`}
              onClick={() => handleNavClick(pack.packName)}
              aria-label={pack.packName}
            >
              <span className={css.navPill} />
              {first ? (
                <AuthMediaImg
                  client={client}
                  mxcUrl={first.url}
                  width={18}
                  height={18}
                  alt=""
                  className={css.navImg}
                  placeholder="sticker"
                />
              ) : (
                <StickerIcon size={18} />
              )}
            </button>
          </Tooltip>
        );
      })}
    </>
  );

  const searchBar = (
    <div className={css.searchWrap}>
      <div className={css.searchInner}>
        <input
          ref={searchRef}
          className={css.searchInput}
          type="text"
          placeholder={t('composer.searchStickers')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button
          type="button"
          className={css.searchClearBtn}
          onClick={() => setSearchQuery('')}
          aria-label={t('common.clear')}
          style={{ visibility: searchQuery ? 'visible' : 'hidden' }}
        >
          <XIcon size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} className={naked ? css.popoverNaked : css.popover}>
      {naked ? (
        <div className={css.body}>
          {!searchQuery && filteredPacks.length > 0 && (
            <div className={css.navSidebar}>{navContent}</div>
          )}
          <div className={css.bodyMain}>
            {searchBar}
            <div className={css.contentCol}>
              <div ref={bodyRef} className={css.stickerBody}>
                {stickerContent}
              </div>
              <PickerPreviewBar
                client={client}
                item={hasResults ? (preview ?? firstPreview) : null}
                placeholder="sticker"
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          {searchBar}
          <div className={css.body}>
            {!searchQuery && filteredPacks.length > 0 && (
              <div className={css.navSidebar}>{navContent}</div>
            )}
            <div className={css.contentCol}>
              <div ref={bodyRef} className={css.stickerBody}>
                {stickerContent}
              </div>
              <PickerPreviewBar
                client={client}
                item={hasResults ? (preview ?? firstPreview) : null}
                placeholder="sticker"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
