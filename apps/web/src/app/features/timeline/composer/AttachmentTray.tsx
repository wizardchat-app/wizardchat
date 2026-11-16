import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import {
  EyeIcon,
  EyeSlashIcon,
  FileAudioIcon,
  FileTextIcon,
  PencilSimpleIcon,
  TrashIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import { serverUploadLimitAtom, type ComposerAttachment } from '@/app/store/atoms';
import { Tooltip } from '@/app/components/Tooltip';
import { Dialog } from '@/app/components/Dialog/Dialog';
import { Button } from '@/app/components/Button';
import { Input, Textarea } from '@/app/components/Input';
import { ToggleRow } from '@/app/components/Toggle';
import { MediaLightbox } from '@/app/components/MediaLightbox/MediaLightbox';
import { formatFileSize } from '@/util/format';
import type { ComposerState } from './useComposer';
import { useAttachmentUpload } from './attachmentUploads';
import * as css from './AttachmentTray.css';

function isImage(file: File): boolean {
  return file.type.startsWith('image/');
}

function isVideo(file: File): boolean {
  return file.type.startsWith('video/');
}

function isSpoilable(file: File): boolean {
  return (isImage(file) && file.type !== 'image/svg+xml') || isVideo(file);
}

function extension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1) : '';
}

interface AttachmentTrayProps {
  attachments: ComposerAttachment[];
  onRemove: ComposerState['removeAttachment'];
  onUpdate: ComposerState['updateAttachment'];
}

export function AttachmentTray({ attachments, onRemove, onUpdate }: AttachmentTrayProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ComposerAttachment | null>(null);
  const editing = attachments.find((a) => a.id === editingId) ?? null;

  if (attachments.length === 0) return null;

  return (
    <>
      <div className={css.tray}>
        {attachments.map((attachment) => (
          <AttachmentTile
            key={attachment.id}
            attachment={attachment}
            onToggleSpoiler={() => onUpdate(attachment.id, { spoiler: !attachment.spoiler })}
            onEdit={() => setEditingId(attachment.id)}
            onRemove={() => onRemove(attachment.id)}
            onPreview={() => setLightbox(attachment)}
          />
        ))}
      </div>

      {editing && (
        <AttachmentEditModal
          attachment={editing}
          onClose={() => setEditingId(null)}
          onSave={(patch) => {
            onUpdate(editing.id, patch);
            setEditingId(null);
          }}
        />
      )}

      {lightbox && (
        <MediaLightbox
          src={lightbox.previewUrl}
          type={isImage(lightbox.file) ? 'image' : 'video'}
          filename={lightbox.file.name}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}

function AttachmentMedia({
  file,
  previewUrl,
  spoiler,
  iconSize = 32,
}: {
  file: File;
  previewUrl: string;
  spoiler: boolean;
  iconSize?: number;
}) {
  const { t } = useTranslation();
  const mediaClass = spoiler ? css.thumbMediaSpoiler : css.thumbMedia;
  if ((isImage(file) || isVideo(file)) && previewUrl) {
    return (
      <>
        {isImage(file) ? (
          <img src={previewUrl} alt={file.name} className={mediaClass} />
        ) : (
          <video src={previewUrl} className={mediaClass} muted preload="metadata" playsInline />
        )}
        {spoiler && <span className={css.spoilerChip}>{t('timeline.spoilerMedia')}</span>}
      </>
    );
  }
  return (
    <span className={css.fileIcon}>
      {file.type.startsWith('audio/') ? (
        <FileAudioIcon size={iconSize} />
      ) : (
        <FileTextIcon size={iconSize} />
      )}
      {extension(file.name) && <span className={css.fileExt}>{extension(file.name)}</span>}
    </span>
  );
}

interface AttachmentTileProps {
  attachment: ComposerAttachment;
  onToggleSpoiler: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onPreview: () => void;
}

function AttachmentTile({
  attachment,
  onToggleSpoiler,
  onEdit,
  onRemove,
  onPreview,
}: AttachmentTileProps) {
  const { t } = useTranslation();
  const maxUploadBytes = useAtomValue(serverUploadLimitAtom);
  const { file, previewUrl, spoiler, oversized, caption } = attachment;
  const upload = useAttachmentUpload(attachment.id);
  const image = isImage(file);
  const video = isVideo(file);
  const media = <AttachmentMedia file={file} previewUrl={previewUrl} spoiler={spoiler} />;

  const spoilerLabel = spoiler ? t('attachment.removeSpoiler') : t('attachment.markSpoiler');

  return (
    <div className={oversized ? css.tileOversized : css.tile}>
      {(image || video) && previewUrl ? (
        <button
          type="button"
          className={css.thumbButton}
          onClick={onPreview}
          aria-label={file.name}
        >
          {media}
        </button>
      ) : (
        <div className={css.thumb}>{media}</div>
      )}

      <div className={css.meta}>
        <Tooltip content={file.name} multiline>
          <span className={css.name}>{file.name}</span>
        </Tooltip>
        {oversized ? (
          <span className={css.detailError}>
            <WarningIcon size={12} weight="fill" className={css.detailErrorIcon} />
            {t('attachment.fileTooLarge', { limit: formatFileSize(maxUploadBytes) })}
          </span>
        ) : upload?.status === 'error' ? (
          <span className={css.detailError}>
            <WarningIcon size={12} weight="fill" className={css.detailErrorIcon} />
            {t('attachment.uploadFailedRetry')}
          </span>
        ) : (
          <span className={css.detail}>{formatFileSize(file.size)}</span>
        )}
        {upload?.status === 'uploading' && (
          <div
            className={css.progressTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={upload.progress > 0 ? Math.round(upload.progress * 100) : undefined}
            aria-label={t('attachment.uploading')}
          >
            {upload.progress > 0 ? (
              <div
                className={css.progressFill}
                style={{ width: `${Math.round(upload.progress * 100)}%` }}
              />
            ) : (
              <div className={css.progressIndeterminate} />
            )}
          </div>
        )}
        {caption && (
          <Tooltip content={caption} multiline>
            <span className={css.caption}>{caption}</span>
          </Tooltip>
        )}
      </div>

      <div className={css.actions}>
        {isSpoilable(file) && (
          <Tooltip content={spoilerLabel}>
            <button
              type="button"
              className={spoiler ? css.actionBtnActive : css.actionBtn}
              onClick={onToggleSpoiler}
              aria-label={spoilerLabel}
              aria-pressed={spoiler}
            >
              {spoiler ? <EyeSlashIcon size={15} weight="bold" /> : <EyeIcon size={15} />}
            </button>
          </Tooltip>
        )}
        <Tooltip content={t('attachment.edit')}>
          <button
            type="button"
            className={css.actionBtn}
            onClick={onEdit}
            aria-label={t('attachment.edit')}
          >
            <PencilSimpleIcon size={15} />
          </button>
        </Tooltip>
        <Tooltip content={t('common.remove')}>
          <button
            type="button"
            className={css.actionBtnDanger}
            onClick={onRemove}
            aria-label={t('common.remove')}
          >
            <TrashIcon size={15} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

interface AttachmentEditModalProps {
  attachment: ComposerAttachment;
  onClose: () => void;
  onSave: (patch: { name: string; caption: string; spoiler: boolean }) => void;
}

function AttachmentEditModal({ attachment, onClose, onSave }: AttachmentEditModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(attachment.file.name);
  const [caption, setCaption] = useState(attachment.caption);
  const [spoiler, setSpoiler] = useState(attachment.spoiler);
  const canSave = name.trim().length > 0;
  const save = () => {
    if (canSave) onSave({ name, caption, spoiler });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('attachment.edit')}
      maxWidth="550px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={save} disabled={!canSave}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className={css.editBody}>
        <div className={css.editPreview}>
          <AttachmentMedia
            file={attachment.file}
            previewUrl={attachment.previewUrl}
            spoiler={spoiler}
            iconSize={64}
          />
        </div>
        <Input
          label={t('attachment.fileName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
          autoFocus
        />
        <Textarea
          label={t('attachment.captionLabel')}
          placeholder={t('attachment.captionPlaceholder')}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={3}
        />
        {isSpoilable(attachment.file) && (
          <ToggleRow label={t('attachment.markSpoiler')} checked={spoiler} onChange={setSpoiler} />
        )}
      </div>
    </Dialog>
  );
}
