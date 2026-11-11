import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { watchRoomPills } from '../roomPills';
import { useTranslation } from 'react-i18next';
import { useAtomValue, useStore } from 'jotai';
import type {
  MediaInfo,
  RoomTimeline,
  UtdReason,
  WizardClient as MatrixClient,
} from '@wizardchat/core';
import {
  FileTextIcon,
  DownloadSimpleIcon,
  ProhibitIcon,
  LockIcon,
  ShieldCheckIcon,
  TrashIcon,
  MapPinIcon,
  ArrowsOutSimpleIcon,
  StickerIcon,
} from '@phosphor-icons/react';
import { CopyButton } from '@/app/components/Button';
import { Tooltip } from '@/app/components/Tooltip';
import { highlightQuery } from '@/app/hooks/useSearch';
import type { ImagePackImage } from '@/app/hooks/useImagePacks';
import { useRoom } from '@/app/data';
import {
  renderTextContent,
  isRenderedEmojiOnly,
  getMediaCaption,
  textRenderContent,
} from './textContent';
import { getMediaBlobUrl, getMediaAnimates, plainMediaUrl } from './media';
import { MediaSpoiler } from './MediaSpoiler';
import type { MediaCover } from './MediaSpoiler';
import { AnimatedImage } from './AnimatedImage';
import { largeEmojiAtom, prettifyLinksAtom, sessionVerificationAtom } from '@/app/store/atoms';
import { AudioFilePlayer } from '@/app/components/AudioFilePlayer/AudioFilePlayer';
import { VoiceMessagePlayer } from '@/app/components/VoiceMessagePlayer/VoiceMessagePlayer';
import { PollViewer } from './PollViewer';
import { LinkPreview } from './LinkPreview';
import { extractFirstUrl } from '@/util/extractFirstUrl';
import { formatFileSize } from '@/util/format';
import { fetchMediaBlobUrl } from '@/app/components/Avatar';
import type { EventEntry } from './entry';
import * as css from '../Timeline.css';
import * as headerCss from '../RoomHeader.css';

function parseGeoUri(uri: string | undefined): { lat: number; lon: number } | null {
  if (!uri) return null;
  const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(uri);
  if (!m) return null;
  const lat = Number.parseFloat(m[1]);
  const lon = Number.parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

const packsCache = new WeakMap<Map<string, ImagePackImage>, Map<string, string>>();

function applyImagePacks(baseHtml: string, imagePacks: Map<string, ImagePackImage>): string {
  let inner = packsCache.get(imagePacks);
  if (!inner) {
    inner = new Map();
    packsCache.set(imagePacks, inner);
  }
  const cached = inner.get(baseHtml);
  if (cached !== undefined) return cached;
  const scratchDiv = document.createElement('div');
  scratchDiv.innerHTML = baseHtml;
  const SHORTCODE_RE = /:([a-zA-Z0-9_-]+):/g;
  const walker = document.createTreeWalker(scratchDiv, NodeFilter.SHOW_TEXT);
  const replacements: Array<{ node: Text; fragments: (string | HTMLImageElement)[] }> = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.nodeValue ?? '';
    if (!text.includes(':')) continue;
    SHORTCODE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    let lastIdx = 0;
    const fragments: (string | HTMLImageElement)[] = [];
    let hadMatch = false;
    while ((match = SHORTCODE_RE.exec(text)) !== null) {
      const shortcode = match[1];
      const pack = imagePacks.get(shortcode);
      if (!pack || !pack.usage.includes('emoticon')) continue;
      if (!pack.url.startsWith('mxc://')) continue;
      hadMatch = true;
      if (match.index > lastIdx) fragments.push(text.slice(lastIdx, match.index));
      const img = document.createElement('img');
      img.alt = '';
      img.title = match[0];
      img.className = css.inlinePackEmoji;
      img.dataset.mediaMxc = pack.url;
      fragments.push(img);
      lastIdx = match.index + match[0].length;
    }
    if (hadMatch) {
      if (lastIdx < text.length) fragments.push(text.slice(lastIdx));
      replacements.push({ node, fragments });
    }
  }
  for (const { node: textNode, fragments } of replacements) {
    const parent = textNode.parentNode;
    if (!parent) continue;
    for (const frag of fragments) {
      if (typeof frag === 'string') {
        parent.insertBefore(document.createTextNode(frag), textNode);
      } else {
        parent.insertBefore(frag, textNode);
      }
    }
    parent.removeChild(textNode);
  }
  const result = scratchDiv.innerHTML;
  if (inner.size > 200) inner.clear();
  inner.set(baseHtml, result);
  return result;
}

function renderRichTextHtml(
  content: Record<string, unknown>,
  imagePacks: Map<string, ImagePackImage> | undefined,
  myId: string,
  prettifyLinks: boolean
): string {
  // The sanitizer drops mxc:// sources, so move them aside first; RichHtml loads them through the
  // core (authenticated media)
  const formattedBody = content.formatted_body;
  const renderContent =
    typeof formattedBody === 'string' && formattedBody.includes('mxc://')
      ? {
          ...content,
          formatted_body: formattedBody.replace(
            /(<img\b[^>]*?)\ssrc=(["'])(mxc:\/\/[^"']+)\2/gi,
            '$1 data-media-mxc="$3"'
          ),
        }
      : content;
  let html = renderTextContent(renderContent, myId, prettifyLinks);
  const baseHtml = html;
  if (imagePacks && imagePacks.size > 0) {
    html = applyImagePacks(baseHtml, imagePacks);
  }
  return html;
}

type RichSegment =
  | { type: 'html'; html: string }
  | { type: 'code'; element: HTMLElement }
  | { type: 'spoiler'; index: number; element: HTMLElement };

type RichEntry =
  | { kind: 'html'; html: string }
  | { kind: 'code'; element: HTMLElement }
  | { kind: 'spoiler'; index: number; element: HTMLElement };

function escapeHtmlText(text: string): string {
  return text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}

function serializeOpenTag(el: HTMLElement): string {
  let out = `<${el.tagName.toLowerCase()}`;
  for (const attr of Array.from(el.attributes)) {
    out += ` ${attr.name}="${attr.value.replace(/"/g, '&quot;')}"`;
  }
  return `${out}>`;
}

function splitRichHtml(html: string): RichSegment[] {
  if (!html.includes('<pre') && !html.includes('data-mx-spoiler')) {
    return [{ type: 'html', html }];
  }
  const div = document.createElement('div');
  div.innerHTML = html;
  const out: RichEntry[] = [];
  const pushHtml = (chunk: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === 'html') last.html += chunk;
    else out.push({ kind: 'html', html: chunk });
  };
  let spoilerIndex = 0;
  const walkChildren = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        pushHtml(escapeHtmlText(child.nodeValue ?? ''));
        continue;
      }
      const el = child as HTMLElement;
      if (el.tagName === 'PRE') {
        out.push({ kind: 'code', element: el });
        continue;
      }
      if (el.hasAttribute('data-mx-spoiler')) {
        out.push({ kind: 'spoiler', index: spoilerIndex++, element: el });
        continue;
      }
      if (el.querySelector('pre, [data-mx-spoiler]')) {
        pushHtml(serializeOpenTag(el));
        walkChildren(el);
        pushHtml(`</${el.tagName.toLowerCase()}>`);
      } else {
        pushHtml(el.outerHTML);
      }
    }
  };
  walkChildren(div);
  return out.map((e) =>
    e.kind === 'html'
      ? { type: 'html', html: e.html }
      : e.kind === 'code'
        ? { type: 'code', element: e.element }
        : { type: 'spoiler', index: e.index, element: e.element }
  );
}

function CodeBlock({ element }: { element: HTMLElement }) {
  const codeEl = element.querySelector('code');
  const text = codeEl?.textContent ?? element.textContent ?? '';
  const codeHtml = codeEl?.innerHTML ?? element.innerHTML;
  return (
    <div className={css.codeBlock}>
      <div className={css.codeBlockHeader}>
        <span className={css.codeBlockLabel}>code</span>
        <CopyButton text={text} className={css.codeCopyBtn} />
      </div>
      <pre dangerouslySetInnerHTML={{ __html: codeHtml }} />
    </div>
  );
}

function Spoiler({
  element,
  revealed,
  onReveal,
}: {
  element: HTMLElement;
  revealed: boolean;
  onReveal: () => void;
}) {
  const reason = element.getAttribute('data-mx-spoiler');
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onReveal();
    }
  };
  return (
    <>
      {reason && <span className="spoiler-reason">{`(${reason})`}</span>}
      <span
        data-mx-spoiler={reason ?? ''}
        data-mx-spoiler-revealed={revealed ? 'true' : undefined}
        role="button"
        tabIndex={0}
        onClick={onReveal}
        onKeyDown={handleKeyDown}
        dangerouslySetInnerHTML={{ __html: element.innerHTML }}
      />
    </>
  );
}

interface RichHtmlProps {
  html: string;
  className?: string;
  client?: MatrixClient | null;
  onClick?: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  revealedSpoilers: ReadonlySet<number>;
  onRevealSpoiler: (index: number) => void;
}

function RichHtml({
  html,
  className,
  client,
  onClick,
  onKeyDown,
  revealedSpoilers,
  onRevealSpoiler,
}: RichHtmlProps) {
  const segments = useMemo(() => splitRichHtml(html), [html]);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = wrapRef.current;
    if (!root || !client) return;

    for (const img of root.querySelectorAll<HTMLImageElement>('img')) {
      if (img.dataset.mediaLoadHooked === 'done') continue;
      img.dataset.mediaLoadHooked = 'done';
      if (img.complete && img.naturalWidth > 0) {
        img.dataset.mediaLoaded = 'true';
      } else {
        img.addEventListener('load', () => {
          img.dataset.mediaLoaded = 'true';
        });
      }
    }

    const pending = root.querySelectorAll<HTMLImageElement>('img[data-media-mxc]:not([src])');
    for (const img of pending) {
      if (img.dataset.mediaMxcDone === 'done') continue;
      img.dataset.mediaMxcDone = 'done';
      const mxc = img.dataset.mediaMxc;
      if (!mxc) continue;
      fetchMediaBlobUrl(mxc, client)
        .then((url) => {
          if (url && url.startsWith('blob:') && img.isConnected) {
            img.src = url;
          }
        })
        .catch(() => {
          // Keep the placeholder glyph instead of showing a broken image.
        });
    }
  }, [html, client, revealedSpoilers]);

  const store = useStore();
  useEffect(() => {
    const root = wrapRef.current;
    return root ? watchRoomPills(root, store) : undefined;
  }, [html, revealedSpoilers, store]);

  return (
    <span ref={wrapRef} className={className} onClick={onClick} onKeyDown={onKeyDown}>
      {segments.map((seg, i) => {
        if (seg.type === 'html') {
          return (
            <span
              key={i}
              className={css.richHtmlSegment}
              dangerouslySetInnerHTML={{ __html: seg.html }}
            />
          );
        }
        if (seg.type === 'code') {
          return <CodeBlock key={i} element={seg.element} />;
        }
        return (
          <Spoiler
            key={i}
            element={seg.element}
            revealed={revealedSpoilers.has(seg.index)}
            onReveal={() => onRevealSpoiler(seg.index)}
          />
        );
      })}
    </span>
  );
}

interface MediaSkeletonProps {
  className: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

function MediaSkeleton({ className, style, children }: MediaSkeletonProps) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

function decryptionFailureKey(reason: UtdReason | null, sessionVerified: boolean): string {
  switch (reason) {
    case 'withheldForUnverifiedOrInsecureDevice':
      return 'timeline.decryptUnverifiedSession';
    case 'withheldBySender':
      return 'timeline.decryptWithheld';
    case 'unsignedDevice':
    case 'unknownDevice':
      return 'timeline.decryptUnverifiedSender';
    case 'verificationViolation':
      return 'timeline.decryptSenderIdentityReset';
    case 'sentBeforeWeJoined':
      return 'timeline.decryptBeforeJoined';
    case 'historicalMessageAndDeviceIsUnverified':
      return 'timeline.decryptHistoryVerify';
    case 'historicalMessageAndBackupIsDisabled':
      return 'timeline.decryptHistoryNoKey';
    case 'unknown':
      return sessionVerified
        ? 'timeline.decryptWaitingForKey'
        : 'timeline.decryptUnverifiedSession';
    default:
      return 'timeline.couldNotDecrypt';
  }
}

function MediaError() {
  const { t } = useTranslation();
  return (
    <span className={css.mediaError}>
      <LockIcon size={14} />
      <span>{t('timeline.couldNotDecrypt')}</span>
    </span>
  );
}

interface StickerBoxProps {
  src: string | null;
  alt: string;
  mimeType?: string;
  isAnimated: boolean;
  mediaFailed: boolean;
  width?: number | null;
  height?: number | null;
  requestFullRes?: () => Promise<string | null>;
}

function StickerBox({
  src,
  alt,
  mimeType,
  isAnimated,
  mediaFailed,
  width,
  height,
  requestFullRes,
}: StickerBoxProps) {
  const [measured, setMeasured] = useState<{ src: string; w: number; h: number } | null>(null);
  const infoW = typeof width === 'number' && width > 0 ? width : undefined;
  const infoH = typeof height === 'number' && height > 0 ? height : undefined;
  const current = measured?.src === src ? measured : undefined;
  const w = infoW ?? current?.w;
  const h = infoH ?? current?.h;
  const boxStyle = w && h ? { aspectRatio: `${w} / ${h}` } : { aspectRatio: '1 / 1' };

  return (
    <div className={css.stickerBox} style={boxStyle}>
      {src ? (
        <AnimatedImage
          src={src}
          alt={alt}
          mimeType={mimeType}
          className={css.mediaFill}
          wrapperClassName={css.mediaBoxFillWrap}
          isAnimated={isAnimated}
          requestFullRes={requestFullRes}
          onLoad={
            infoW && infoH
              ? undefined
              : (img) => {
                  if (img.naturalWidth > 0 && img.naturalHeight > 0 && src) {
                    setMeasured({ src, w: img.naturalWidth, h: img.naturalHeight });
                  }
                }
          }
        />
      ) : mediaFailed ? (
        <MediaError />
      ) : (
        <div className={css.mediaBoxPulse}>
          <StickerIcon size={32} className={css.stickerPulseGlyph} />
        </div>
      )}
    </div>
  );
}

interface MessageContentProps {
  event: EventEntry;
  client: MatrixClient;
  timeline?: RoomTimeline | null;
  mediaSrc: string | null;
  thumbnailSrc?: string | null;
  isDecrypting: boolean;
  mediaFailed: boolean;
  isRedacted: boolean;
  isEventDecrypting: boolean;
  isUndecryptable: boolean;
  searchQuery: string;
  myId: string;
  senderName: string;
  onMediaLoad: (url: string) => void;
  onMediaClick?: (src: string, type?: 'image' | 'video', opts?: { currentTime?: number }) => void;
  roomId?: string;
  onMentionClick?: (userId: string, rect: DOMRect) => void;
  optimisticBody?: string | null;
  imagePacks?: Map<string, ImagePackImage>;
  requestFullRes?: () => Promise<string | null>;
  mediaCover?: MediaCover | null;
  onRevealMedia?: () => void;
  hideCaption?: boolean;
}

export function MessageContent({
  event,
  client,
  timeline = null,
  mediaSrc,
  thumbnailSrc = null,
  isDecrypting,
  mediaFailed,
  isRedacted,
  isEventDecrypting,
  isUndecryptable,
  searchQuery,
  myId,
  senderName,
  onMediaLoad,
  onMediaClick,
  onMentionClick,
  roomId,
  optimisticBody = null,
  imagePacks,
  requestFullRes,
  mediaCover = null,
  onRevealMedia,
  hideCaption = false,
}: MessageContentProps) {
  const { t } = useTranslation();
  const prettifyLinks = useAtomValue(prettifyLinksAtom);
  const largeEmoji = useAtomValue(largeEmojiAtom);
  const sessionVerified = useAtomValue(sessionVerificationAtom).status !== 'unverified';
  const room = useRoom(roomId);

  const handleContentClick = useCallback(
    (e: React.MouseEvent) => {
      const pill = (e.target as HTMLElement).closest('.mention-pill');
      if (pill && onMentionClick) {
        const userId = pill.getAttribute('data-user-id');
        if (userId) {
          onMentionClick(userId, pill.getBoundingClientRect());
        }
      }
    },
    [onMentionClick]
  );

  const handleContentKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const pill = (e.target as HTMLElement).closest('.mention-pill');
      if (!pill || !onMentionClick) return;
      e.preventDefault();
      const userId = pill.getAttribute('data-user-id');
      if (userId) {
        onMentionClick(userId, pill.getBoundingClientRect());
      }
    },
    [onMentionClick]
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const [revealedSpoilers, setRevealedSpoilers] = useState<ReadonlySet<number>>(() => new Set());
  const handleRevealSpoiler = useCallback((index: number) => {
    setRevealedSpoilers((prev) => new Set(prev).add(index));
  }, []);

  const renderCaptionHtml = useCallback(
    (media: MediaInfo): string | undefined => {
      if (hideCaption) return undefined;
      const caption = getMediaCaption(media);
      if (caption === undefined) return undefined;
      const captionContent: Record<string, unknown> = media.captionHtml
        ? { body: caption, format: 'org.matrix.custom.html', formatted_body: media.captionHtml }
        : { body: caption };
      return renderRichTextHtml(captionContent, imagePacks, myId, prettifyLinks);
    },
    [myId, prettifyLinks, imagePacks, hideCaption]
  );

  if (isRedacted) {
    const isUserDeleted =
      event.content.type === 'redacted' ? event.content.by === event.sender : true;
    return (
      <span className={css.redactedMsg}>
        {isUserDeleted ? <TrashIcon size={14} /> : <ProhibitIcon size={14} />}{' '}
        {t('timeline.messageDeleted')}
      </span>
    );
  }

  if (isUndecryptable || event.content.type === 'unableToDecrypt') {
    const reason = event.content.type === 'unableToDecrypt' ? event.content.reason : null;
    return (
      <span className={css.redactedMsg}>
        <LockIcon size={14} /> {t(decryptionFailureKey(reason, sessionVerified))}
      </span>
    );
  }

  if (isEventDecrypting) {
    return (
      <span className={css.redactedMsg}>
        <LockIcon size={14} /> {t('timeline.decrypting')}
      </span>
    );
  }

  const content = event.content;

  if (content.type === 'poll') {
    return <PollViewer event={event} timeline={timeline} />;
  }

  if (content.type === 'verificationRequest') {
    return (
      <span className={css.redactedMsg}>
        <ShieldCheckIcon size={14} /> {t('timeline.verificationRequest')}
      </span>
    );
  }

  if (content.type === 'sticker') {
    const { media } = content;
    const mxcUrl = plainMediaUrl(media.source);
    const src =
      mediaSrc ??
      (mxcUrl && mxcUrl.startsWith('mxc://') ? getMediaBlobUrl(mxcUrl, client, onMediaLoad) : null);
    return (
      <StickerBox
        src={src}
        alt={content.body || 'sticker'}
        mimeType={media.mimetype ?? undefined}
        mediaFailed={mediaFailed}
        isAnimated={getMediaAnimates(media)}
        width={media.width}
        height={media.height}
        requestFullRes={requestFullRes}
      />
    );
  }

  if (content.type === 'image') {
    const { media } = content;
    const mxcUrl = plainMediaUrl(media.source);
    const body = media.caption ?? media.filename;

    // File types that should not be rendered inline (SVG, TIFF, etc.)
    const mimetype = media.mimetype ?? '';
    const noInline = ['image/svg+xml'];
    if (noInline.includes(mimetype)) {
      return <span>{body || 'file'}</span>;
    }

    const isCovered = mediaCover != null;
    const src =
      mediaSrc ?? (!isCovered && mxcUrl ? getMediaBlobUrl(mxcUrl, client, onMediaLoad) : null);

    const imgW = media.width;
    const imgH = media.height;
    const hasDimensions =
      typeof imgW === 'number' && typeof imgH === 'number' && imgW > 0 && imgH > 0;
    // Reserve a fixed box from the event metadata so the layout never changes
    // while the media bytes are fetched, decrypted or loaded.
    const boxStyle = hasDimensions ? { aspectRatio: `${imgW} / ${imgH}` } : { height: 200 };

    const captionHtml = renderCaptionHtml(media);
    const mediaEl = isCovered ? (
      <div className={css.mediaBox} style={boxStyle}>
        <MediaSpoiler
          label={mediaCover?.label}
          reason={mediaCover?.reason}
          onReveal={() => onRevealMedia?.()}
        />
      </div>
    ) : src ? (
      <div className={css.mediaBox} style={boxStyle}>
        <AnimatedImage
          src={src}
          alt={body || 'image'}
          mimeType={mimetype}
          className={[css.mediaFill, css.mediaClickable].join(' ')}
          wrapperClassName={css.mediaBoxFillWrap}
          isAnimated={getMediaAnimates(media)}
          onClick={() => onMediaClick?.(src)}
          requestFullRes={requestFullRes}
        />
      </div>
    ) : mediaFailed ? (
      <MediaError />
    ) : (
      <div className={css.mediaBox} style={boxStyle}>
        <div className={css.mediaBoxPulse} />
      </div>
    );
    return captionHtml ? (
      <div className={css.mediaWrap}>
        {mediaEl}
        <RichHtml
          html={captionHtml}
          client={client}
          className={css.mediaCaption}
          onClick={handleContentClick}
          onKeyDown={handleContentKeyDown}
          revealedSpoilers={revealedSpoilers}
          onRevealSpoiler={handleRevealSpoiler}
        />
      </div>
    ) : (
      mediaEl
    );
  }

  if (content.type === 'audio') {
    const { media } = content;
    const mxcUrl = plainMediaUrl(media.source);
    const src = mediaSrc ?? (mxcUrl ? getMediaBlobUrl(mxcUrl, client, onMediaLoad) : null);
    const durationMs = media.durationMs ?? undefined;
    const waveform = media.waveform ?? undefined;
    const isVoiceMessage = media.voice || media.waveform !== null;
    if (isDecrypting) {
      return isVoiceMessage ? (
        <MediaSkeleton className={css.msgAudioSkeleton} />
      ) : (
        <MediaSkeleton className={css.fileSkeleton}>
          <FileTextIcon size={20} />
        </MediaSkeleton>
      );
    }
    if (src) {
      if (isVoiceMessage) {
        return <VoiceMessagePlayer src={src} waveform={waveform} durationMs={durationMs} />;
      }
      const fileName = (media.caption ?? media.filename) || t('timeline.audioFile');
      const size = typeof media.size === 'number' && media.size >= 0 ? media.size : undefined;
      return <AudioFilePlayer src={src} fileName={fileName} size={size} durationMs={durationMs} />;
    }
    return mediaFailed ? (
      <MediaError />
    ) : isVoiceMessage ? (
      <MediaSkeleton className={css.msgAudioSkeleton} />
    ) : (
      <MediaSkeleton className={css.fileSkeleton}>
        <FileTextIcon size={20} />
      </MediaSkeleton>
    );
  }

  if (content.type === 'video') {
    const { media } = content;
    const mxcUrl = plainMediaUrl(media.source);
    const body = media.caption ?? media.filename;
    const isCovered = mediaCover != null;
    const src =
      mediaSrc ?? (!isCovered && mxcUrl ? getMediaBlobUrl(mxcUrl, client, onMediaLoad) : null);
    const vidW = media.width;
    const vidH = media.height;
    const hasDimensions =
      typeof vidW === 'number' && typeof vidH === 'number' && vidW > 0 && vidH > 0;
    const boxStyle = hasDimensions ? { aspectRatio: `${vidW} / ${vidH}` } : { height: 200 };
    const captionHtml = renderCaptionHtml(media);
    const mediaEl = isCovered ? (
      <div className={css.mediaBox} style={boxStyle}>
        <MediaSpoiler
          label={mediaCover?.label}
          reason={mediaCover?.reason}
          onReveal={() => onRevealMedia?.()}
        />
      </div>
    ) : src || thumbnailSrc ? (
      <div className={css.mediaBox} style={boxStyle}>
        <video
          ref={videoRef}
          src={src ?? undefined}
          poster={thumbnailSrc ?? undefined}
          controls
          playsInline
          className={css.mediaFill}
        />
        {src && (
          <button
            type="button"
            className={css.videoExpandBtn}
            onClick={(e) => {
              e.stopPropagation();
              videoRef.current?.pause();
              onMediaClick?.(src, 'video', {
                currentTime: videoRef.current?.currentTime ?? 0,
              });
            }}
            aria-label={body || 'video'}
          >
            <ArrowsOutSimpleIcon size={16} weight="bold" />
          </button>
        )}
      </div>
    ) : mediaFailed ? (
      <MediaError />
    ) : (
      <div className={css.mediaBox} style={boxStyle}>
        <div className={css.mediaBoxPulse} />
      </div>
    );
    return captionHtml ? (
      <div className={css.mediaWrap}>
        {mediaEl}
        <RichHtml
          html={captionHtml}
          client={client}
          className={css.mediaCaption}
          onClick={handleContentClick}
          onKeyDown={handleContentKeyDown}
          revealedSpoilers={revealedSpoilers}
          onRevealSpoiler={handleRevealSpoiler}
        />
      </div>
    ) : (
      mediaEl
    );
  }

  if (content.type === 'file') {
    const { media } = content;
    const mxcUrl = plainMediaUrl(media.source);
    const filename = media.filename || 'file';
    const src = mediaSrc ?? (mxcUrl ? getMediaBlobUrl(mxcUrl, client, onMediaLoad) : null);
    if (isDecrypting) {
      return (
        <MediaSkeleton className={css.fileSkeleton}>
          <FileTextIcon size={20} />
        </MediaSkeleton>
      );
    }
    const captionHtml = renderCaptionHtml(media);
    const size = typeof media.size === 'number' && media.size >= 0 ? media.size : undefined;
    const mediaEl = src ? (
      <div className={css.fileCard}>
        <span className={css.fileIcon}>
          <FileTextIcon size={20} />
        </span>
        <span className={css.fileInfo}>
          <Tooltip content={filename} multiline>
            <span className={css.fileName}>{filename}</span>
          </Tooltip>
          {size !== undefined && <span className={css.fileSize}>{formatFileSize(size)}</span>}
        </span>
        <Tooltip content={t('common.download')}>
          <a
            href={src}
            download={filename}
            className={css.fileDownload}
            aria-label={t('common.download')}
          >
            <DownloadSimpleIcon size={16} />
          </a>
        </Tooltip>
      </div>
    ) : mediaFailed ? (
      <MediaError />
    ) : (
      <MediaSkeleton className={css.fileSkeleton}>
        <FileTextIcon size={20} />
      </MediaSkeleton>
    );
    return captionHtml ? (
      <div className={css.mediaWrap}>
        {mediaEl}
        <RichHtml
          html={captionHtml}
          client={client}
          className={css.mediaCaption}
          onClick={handleContentClick}
          onKeyDown={handleContentKeyDown}
          revealedSpoilers={revealedSpoilers}
          onRevealSpoiler={handleRevealSpoiler}
        />
      </div>
    ) : (
      mediaEl
    );
  }

  if (content.type === 'location') {
    const geo = parseGeoUri(content.geoUri);
    const label = content.description;
    return (
      <span className={css.locationMsg}>
        <MapPinIcon size={14} weight="fill" />
        <span>{label ?? t('timeline.locationShared')}</span>
        {geo && (
          <a
            href={`https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lon}#map=16/${geo.lat}/${geo.lon}`}
            target="_blank"
            rel="noopener noreferrer"
            className={css.locationLink}
          >
            {t('timeline.openInOpenStreetMap')}
          </a>
        )}
      </span>
    );
  }

  if (content.type !== 'text' && content.type !== 'notice' && content.type !== 'emote') {
    return null;
  }

  // When an edit is in-flight, use the optimistic body instead of the core content
  const textBody = optimisticBody ?? content.body;
  const textHtml = optimisticBody !== null ? null : content.html;
  const textContent = textRenderContent(textBody, textHtml);

  if (content.type === 'emote') {
    const html = renderRichTextHtml(textContent, imagePacks, myId, prettifyLinks);
    return (
      <em className={css.emoteMsg}>
        * {senderName}{' '}
        <RichHtml
          html={html}
          client={client}
          onClick={handleContentClick}
          onKeyDown={handleContentKeyDown}
          revealedSpoilers={revealedSpoilers}
          onRevealSpoiler={handleRevealSpoiler}
        />
      </em>
    );
  }

  if (content.type === 'notice') {
    const html = renderRichTextHtml(textContent, imagePacks, myId, prettifyLinks);
    return (
      <RichHtml
        html={html}
        client={client}
        className={css.noticeMsg}
        onClick={handleContentClick}
        onKeyDown={handleContentKeyDown}
        revealedSpoilers={revealedSpoilers}
        onRevealSpoiler={handleRevealSpoiler}
      />
    );
  }

  const body = textBody;
  if (searchQuery && body) {
    const parts = highlightQuery(body, searchQuery);
    return (
      <span>
        {parts.map((p, i) =>
          p.highlighted ? (
            <mark key={i} className={headerCss.searchHighlight}>
              {p.text}
            </mark>
          ) : (
            <span key={i}>{p.text}</span>
          )
        )}
      </span>
    );
  }

  const html = renderRichTextHtml(textContent, imagePacks, myId, prettifyLinks);
  const firstUrl = extractFirstUrl(textBody, textHtml ?? undefined);
  const isEncrypted = !!roomId && room?.isEncrypted === true;
  const emojiOnlyMsg = largeEmoji && isRenderedEmojiOnly(html);

  return (
    <div style={{ display: 'block' }}>
      <RichHtml
        html={html}
        client={client}
        className={emojiOnlyMsg ? css.emojiOnly : undefined}
        onClick={handleContentClick}
        onKeyDown={handleContentKeyDown}
        revealedSpoilers={revealedSpoilers}
        onRevealSpoiler={handleRevealSpoiler}
      />
      {firstUrl && <LinkPreview url={firstUrl} client={client} isEncrypted={isEncrypted} />}
    </div>
  );
}
