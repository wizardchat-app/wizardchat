import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import { useRef, type ReactNode } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import {
  EyeSlashIcon,
  FileTextIcon,
  ImageIcon,
  MicrophoneIcon,
  MusicNoteIcon,
  VideoCameraIcon,
} from '@phosphor-icons/react';
import { hiddenMediaAtom } from '@/app/store/atoms';
import { useDecryptedMedia } from './encryption';
import { getMediaAnimates } from './media';
import { AnimatedImage } from './AnimatedImage';
import { getMediaInfoSpoiler } from './spoiler';
import { useMediaCoveredByPreference } from './privacy';
import { entryEventId, entryMedia, type EventEntry as MatrixEvent } from './entry';
import { getMediaCaption } from './textContent';
import * as css from '../Timeline.css';

export function isReplyMediaEvent(event: MatrixEvent): boolean {
  return entryMedia(event) !== null;
}

interface Props {
  event: MatrixEvent;
  client: MatrixClient;
  roomId: string;
  body: string;
  thumbClassName?: string;
  thumbWrapClassName?: string;
  rowClassName?: string;
  animate?: boolean;
}

export function ReplyMediaThumb({
  event,
  client,
  roomId,
  body,
  thumbClassName = css.replyMediaThumb,
  thumbWrapClassName = css.replyMediaThumbWrap,
  rowClassName = css.replyMediaRow,
  animate = false,
}: Props) {
  const { t } = useTranslation();
  const media = entryMedia(event);
  const type = event.content.type;
  const isImage = type === 'image';
  const isVideo = type === 'video';
  const isAudio = type === 'audio';
  const isSticker = type === 'sticker';
  const isVoice = isAudio && media?.voice === true;

  const hiddenMedia = useAtomValue(hiddenMediaAtom);
  const spoiler = getMediaInfoSpoiler(media);
  const coveredByPreference = useMediaCoveredByPreference(roomId);
  const isHidden = hiddenMedia[entryEventId(event)] === true;
  const covered = spoiler.isSpoiler || coveredByPreference || isHidden;

  const rowRef = useRef<HTMLSpanElement>(null);
  const { mediaSrc: src, thumbnailSrc } = useDecryptedMedia(event, client, {
    enabled: !covered,
    showErrors: false,
    targetRef: rowRef,
    previewOnly: true,
  });

  if (covered) {
    return (
      <span className={css.replyMediaCover} aria-hidden="true">
        <EyeSlashIcon size={13} weight="bold" />
        {spoiler.isSpoiler ? t('timeline.spoilerMedia') : t('timeline.showMedia')}
      </span>
    );
  }

  const text = isVoice
    ? t('nav.preview.voice')
    : isImage || isVideo
      ? ((media && getMediaCaption(media)) ?? '')
      : isSticker
        ? ''
        : body.trim();
  const label =
    text ||
    (isSticker && event.content.type === 'sticker'
      ? event.content.body
      : (media?.caption ?? media?.filename)) ||
    '';

  let visual: ReactNode;
  if ((isImage || isSticker) && src) {
    visual = (
      <AnimatedImage
        src={src}
        alt={label}
        mimeType={media?.mimetype ?? undefined}
        isAnimated={getMediaAnimates(media)}
        className={thumbClassName}
        wrapperClassName={thumbWrapClassName}
        alwaysStatic={!animate}
      />
    );
  } else if (isVideo && thumbnailSrc) {
    visual = <img className={thumbClassName} src={thumbnailSrc} alt={label} />;
  } else {
    const Icon = isVideo
      ? VideoCameraIcon
      : isVoice
        ? MicrophoneIcon
        : isAudio
          ? MusicNoteIcon
          : isImage || isSticker
            ? ImageIcon
            : FileTextIcon;
    visual = (
      <span className={css.replyMediaIcon} aria-hidden="true">
        <Icon size={18} />
      </span>
    );
  }

  return (
    <span ref={rowRef} className={rowClassName}>
      {visual}
      {text && <span className={css.replyMediaText}>{text}</span>}
    </span>
  );
}
