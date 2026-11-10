import { useState, useCallback, useEffect, useLayoutEffect, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoomTimeline, WizardClient as MatrixClient } from '@wizardchat/core';
import {
  PlusIcon,
  SmileyIcon,
  StickerIcon,
  PaperPlaneRightIcon,
  XIcon,
  ChartBarHorizontalIcon,
  DotsThreeVerticalIcon,
  GifIcon,
  MapPinIcon,
  MicrophoneIcon,
  SpinnerGapIcon,
} from '@phosphor-icons/react';
import { formatFileSize } from '@/util/format';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  stickerPickerAtom,
  editMessageAtom,
  editComposerEmojiInserterAtom,
} from '@/app/store/atoms';
import type { RoomWidget } from '@/app/hooks/useWidgets';
import { StickerPicker } from '@/app/features/widget/StickerPicker';
import {
  ComposerMediaPicker,
  type MediaTab,
} from '@/app/features/timeline/composer/ComposerMediaPicker';
import { Tooltip } from '@/app/components/Tooltip';
import { AutocompleteDropdown } from '../AutocompleteDropdown';
import { ReplyPreview } from './ReplyPreview';
import { FormatToolbar } from './FormatToolbar';
import { LinkInputPopover } from './LinkInputPopover';
import { ComposerStatus } from './TypingIndicator';
import { useComposer } from './useComposer';
import { PollCreatorModal } from './PollCreatorModal';
import { LocationShareModal } from './LocationShareModal';
import { VoiceRecordComposerTile } from './VoiceRecordComposerTile';
import { AttachmentTray } from './AttachmentTray';
import { RichComposer } from './editor/RichComposer';
import { insertEmoji } from './editor/insertEmoji';
import { isMod } from './editor/keyboard';
import { ReactEditor } from 'slate-react';
import { Editor, Transforms } from 'slate';
import { anchorFromElement, isMenuOpenKey, useContextMenu } from '@/app/hooks/useContextMenu';
import { contextMenuAtom } from '@/app/features/contextMenu/contextMenuAtom';
import type { ContextMenuItem } from '@/app/features/contextMenu/contextMenuAtom';
import { IdentityWarning } from './IdentityWarning';
import { ComposerTimelineContext, useSendTimeline } from './composerTimeline';
import type { ReplyTarget } from './sendMessageContent';
import { DEFAULT_KEYBINDS, keybindsAtom, pushToTalkEnabledAtom } from '@/app/store/atoms';
import { isInCallAtom } from '@/app/store/atoms/call';
import { matchesComboDown, parseCombo } from '@/app/features/keyboardShortcuts/keyCombo';
import * as css from '../Composer.css';

interface Props {
  client: MatrixClient;
  roomId: string;
  threadId?: string | null;
  replyTo: ReplyTarget | null;
  onClearReply: () => void;
  timeline?: RoomTimeline | null;
  onSent?: () => void;
  stickerWidget?: RoomWidget | null;
  droppedFile?: File[] | null;
  onDroppedFileConsumed?: () => void;
  className?: string;
}

export function Composer({
  client,
  roomId,
  threadId,
  replyTo,
  onClearReply,
  onSent,
  stickerWidget,
  droppedFile,
  onDroppedFileConsumed,
  className,
  timeline: providedTimeline,
}: Props) {
  const { t } = useTranslation();
  const { timeline, getTimeline } = useSendTimeline(client, roomId, threadId, providedTimeline);
  const timelineContext = useMemo(
    () => ({ roomId, threadId: threadId ?? null, getTimeline }),
    [roomId, threadId, getTimeline]
  );
  const stickerPickerOpen = useAtomValue(stickerPickerAtom);
  const setStickerPickerOpen = useSetAtom(stickerPickerAtom);
  const editState = useAtomValue(editMessageAtom);
  const editComposerEmojiInserter = useAtomValue(editComposerEmojiInserterAtom);
  const editingInThisRoom = editState?.roomId === roomId && editComposerEmojiInserter != null;
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTab, setMediaPickerTab] = useState<MediaTab>('emoji');
  const emojiActive = mediaPickerOpen && mediaPickerTab === 'emoji';
  const stickerActive = mediaPickerOpen && mediaPickerTab === 'sticker';
  const gifActive = mediaPickerOpen && mediaPickerTab === 'gif';
  const [gifSending, setGifSending] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const autocompleteListId = useId();

  const { openContextMenuAt } = useContextMenu();
  const contextMenu = useAtomValue(contextMenuAtom);
  const [moreOpener, setMoreOpener] = useState<HTMLElement | null>(null);
  const moreOpen = !!contextMenu && contextMenu.opener === moreOpener;

  const openMoreMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>) => {
      const trigger = e.currentTarget;
      const items: ContextMenuItem[] = [
        {
          label: t('composer.poll.create'),
          icon: <ChartBarHorizontalIcon size={14} />,
          onClick: () => setPollOpen(true),
        },
        {
          label: t('composer.location.share'),
          icon: <MapPinIcon size={14} />,
          onClick: () => setLocationOpen(true),
        },
        {
          label: t('composer.voice.record'),
          icon: <MicrophoneIcon size={14} />,
          onClick: () => setVoiceOpen(true),
        },
      ];
      if (stickerWidget) {
        items.push({
          label: stickerWidget.name || t('composer.stickers'),
          icon: <StickerIcon size={14} />,
          onClick: () => setStickerPickerOpen(true),
        });
      }
      setMoreOpener(trigger);
      openContextMenuAt(items, anchorFromElement(trigger), trigger);
    },
    [openContextMenuAt, setStickerPickerOpen, stickerWidget, t]
  );

  const {
    editor,
    editorValue,
    fileInputRef,
    composerWrapRef,
    toolbar,
    autocomplete,
    uploadProgress,
    uploadFileInfo,
    cancelUpload,
    handleEditorChange,
    handleEditorKeyDown,
    handlePaste,
    handleFileSelect,
    handleAutocompleteSelect,
    handleAutocompleteHover,
    applyFormat,
    updateToolbar,
    linkPopover,
    submitLink,
    cancelLink,
    sendMessage,
    isEmpty,
    attachments,
    removeAttachment,
    updateAttachment,
  } = useComposer({
    client,
    roomId,
    threadId,
    getTimeline,
    replyTo,
    onClearReply,
    onSent,
    droppedFile,
    onDroppedFileConsumed,
  });

  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const inCall = useAtomValue(isInCallAtom);
  const keybinds = useAtomValue(keybindsAtom);
  const pushToTalk = useAtomValue(pushToTalkEnabledAtom);

  useEffect(() => {
    if (threadId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;
      const active = document.activeElement;
      if (active?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === ' ' && active?.closest('button, a, [role="button"]')) return;
      if (
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'
        )
      ) {
        return;
      }
      if (inCall) {
        const bound = [
          keybinds.toggleMute,
          keybinds.toggleDeafen,
          keybinds.toggleScreenShare ?? DEFAULT_KEYBINDS.toggleScreenShare ?? '',
          keybinds.toggleCamera ?? DEFAULT_KEYBINDS.toggleCamera ?? '',
          pushToTalk ? keybinds.pushToTalk : '',
        ];
        if (bound.some((combo) => matchesComboDown(e, parseCombo(combo)))) return;
      }
      const wrap = composerWrapRef.current;
      if (!wrap || !wrap.isConnected || wrap.getClientRects().length === 0) return;
      e.preventDefault();
      ReactEditor.focus(editor);
      Transforms.select(editor, Editor.end(editor, []));
      editor.insertText(e.key);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [threadId, editor, composerWrapRef, inCall, keybinds, pushToTalk]);

  useLayoutEffect(() => {
    const wrap = composerWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    setPopoverStyle({
      right: window.innerWidth - rect.right + 12,
      bottom: window.innerHeight - rect.top + 4,
    });
  }, [composerWrapRef, mediaPickerOpen]);

  return (
    <ComposerTimelineContext.Provider value={timelineContext}>
      <div
        ref={composerWrapRef}
        className={`${css.composerWrap}${className ? ` ${className}` : ''}`}
        onKeyDown={(e) => {
          if (isMod(e) && e.key === ';') {
            e.preventDefault();
            if (emojiActive) {
              setMediaPickerOpen(false);
              requestAnimationFrame(() => ReactEditor.focus(editor));
            } else {
              setMediaPickerTab('emoji');
              setMediaPickerOpen(true);
            }
          }
        }}
      >
        <ComposerStatus
          client={client}
          roomId={roomId}
          timeline={timeline}
          showTyping={!threadId}
        />

        <AutocompleteDropdown
          state={autocomplete.state}
          client={client}
          onSelect={handleAutocompleteSelect}
          onHover={handleAutocompleteHover}
          anchorRef={composerWrapRef}
          listId={autocompleteListId}
        />

        <div className={css.inputArea}>
          {toolbar && (
            <FormatToolbar activeFormats={toolbar.activeFormats} onFormat={applyFormat} />
          )}

          {linkPopover && (
            <LinkInputPopover
              defaultUrl={linkPopover.defaultValue}
              onSubmit={submitLink}
              onCancel={cancelLink}
            />
          )}

          <div className={css.composerBox}>
            <IdentityWarning client={client} roomId={roomId} />
            {gifSending && (
              <div className={css.statusStrip} role="status">
                <SpinnerGapIcon size={14} className={`icon-spin ${css.replyIcon}`} />
                <span className={css.replyText}>{t('composer.sendingGif')}</span>
              </div>
            )}
            {uploadProgress !== null && uploadFileInfo && (
              <div className={css.uploadStrip} role="status">
                <SpinnerGapIcon size={14} className={`icon-spin ${css.replyIcon}`} />
                <span className={css.replyText}>
                  <span className={css.statusName}>{uploadFileInfo.name}</span>
                  <span className={css.statusMeta}>
                    {uploadFileInfo.total > 1 &&
                      `${uploadFileInfo.current}/${uploadFileInfo.total} · `}
                    {formatFileSize(uploadFileInfo.size)} · {Math.round(uploadProgress * 100)}%
                  </span>
                </span>
                <Tooltip content={t('composer.cancelUpload')}>
                  <button
                    type="button"
                    className={css.replyCancel}
                    onClick={cancelUpload}
                    aria-label={t('composer.cancelUpload')}
                  >
                    <XIcon size={14} />
                  </button>
                </Tooltip>
                <div className={css.uploadProgressTrack}>
                  <div
                    className={css.uploadProgressFill}
                    style={{ width: `${Math.round(uploadProgress * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {replyTo && (
              <ReplyPreview
                replyTo={replyTo}
                onClear={onClearReply}
                client={client}
                roomId={roomId}
              />
            )}
            <AttachmentTray
              attachments={attachments}
              onRemove={removeAttachment}
              onUpdate={updateAttachment}
            />
            <div className={css.inputRow}>
              <Tooltip content={t('composer.attach')}>
                <button
                  type="button"
                  className={css.attachBtn}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label={t('composer.attach')}
                >
                  <PlusIcon size={18} />
                </button>
              </Tooltip>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className={css.hiddenInput}
                onChange={handleFileSelect}
              />

              <RichComposer
                editor={editor}
                value={editorValue}
                onChange={handleEditorChange}
                onSend={sendMessage}
                onKeyDown={handleEditorKeyDown}
                onSelectionChange={updateToolbar}
                onPaste={handlePaste}
                placeholder={t('composer.typeMessage')}
                className={css.richEditor}
                client={client}
                ariaLabel={t('composer.messageInput')}
                autocompleteListId={autocompleteListId}
                autocompleteOpen={
                  autocomplete.state.open && autocomplete.state.suggestions.length > 0
                }
                autocompleteActiveId={
                  autocomplete.state.open && autocomplete.state.suggestions.length > 0
                    ? `${autocompleteListId}-option-${autocomplete.state.selectedIndex}`
                    : undefined
                }
              />

              {voiceOpen ? (
                <VoiceRecordComposerTile
                  client={client}
                  roomId={roomId}
                  threadId={threadId}
                  replyTo={replyTo}
                  myId={client.userId() ?? undefined}
                  onReplySent={onClearReply}
                  onClose={() => setVoiceOpen(false)}
                />
              ) : (
                <>
                  <Tooltip content={t('common.emoji')}>
                    <button
                      type="button"
                      className={emojiActive ? css.emojiBtnActive : css.emojiBtn}
                      aria-label={t('common.emoji')}
                      aria-pressed={emojiActive}
                      onClick={() => {
                        if (emojiActive) {
                          setMediaPickerOpen(false);
                        } else {
                          setMediaPickerTab('emoji');
                          setMediaPickerOpen(true);
                        }
                      }}
                    >
                      <SmileyIcon size={20} weight={emojiActive ? 'fill' : 'regular'} />
                    </button>
                  </Tooltip>

                  <Tooltip content={t('composer.stickers')}>
                    <button
                      type="button"
                      className={stickerActive ? css.emojiBtnActive : css.emojiBtn}
                      aria-label={t('composer.stickers')}
                      aria-pressed={stickerActive}
                      onClick={() => {
                        if (stickerActive) {
                          setMediaPickerOpen(false);
                        } else {
                          setMediaPickerTab('sticker');
                          setMediaPickerOpen(true);
                        }
                      }}
                    >
                      <StickerIcon size={20} weight={stickerActive ? 'fill' : 'regular'} />
                    </button>
                  </Tooltip>

                  <Tooltip content={t('composer.gif')}>
                    <button
                      type="button"
                      className={gifActive ? css.emojiBtnActive : css.emojiBtn}
                      aria-label={t('composer.gif')}
                      aria-pressed={gifActive}
                      onClick={() => {
                        if (gifActive) {
                          setMediaPickerOpen(false);
                        } else {
                          setMediaPickerTab('gif');
                          setMediaPickerOpen(true);
                        }
                      }}
                    >
                      <GifIcon size={20} weight="bold" />
                    </button>
                  </Tooltip>

                  <Tooltip content={t('common.moreOptions')}>
                    <button
                      type="button"
                      className={moreOpen ? css.moreBtnActive : css.moreBtn}
                      aria-label={t('common.moreOptions')}
                      aria-haspopup="menu"
                      aria-expanded={moreOpen}
                      onClick={openMoreMenu}
                      onKeyDown={(e) => {
                        if (!isMenuOpenKey(e)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        openMoreMenu(e);
                      }}
                    >
                      <DotsThreeVerticalIcon size={20} weight="bold" />
                    </button>
                  </Tooltip>

                  <Tooltip content={t('composer.send')}>
                    <button
                      type="button"
                      className={css.sendBtn}
                      onClick={sendMessage}
                      disabled={
                        (isEmpty && attachments.length === 0) ||
                        attachments.some((a) => a.oversized)
                      }
                      aria-label={t('composer.send')}
                    >
                      <PaperPlaneRightIcon size={18} weight="fill" />
                    </button>
                  </Tooltip>
                </>
              )}
            </div>
          </div>
        </div>

        {stickerWidget && stickerPickerOpen && (
          <div className={css.popoverLayerFixed} style={popoverStyle}>
            <StickerPicker
              client={client}
              roomId={roomId}
              threadId={threadId}
              widgetUrl={stickerWidget.url}
              widgetName={stickerWidget.name}
              replyTo={replyTo}
              onReplySent={onClearReply}
            />
          </div>
        )}
        {mediaPickerOpen && (
          <div className={css.popoverLayerFixed} style={popoverStyle}>
            <ComposerMediaPicker
              client={client}
              roomId={roomId}
              threadId={threadId}
              tab={mediaPickerTab}
              onTabChange={setMediaPickerTab}
              replyTo={replyTo}
              onReplySent={onClearReply}
              onPickEmoji={(emoji: string, mxcUrl?: string) => {
                if (editingInThisRoom && editComposerEmojiInserter) {
                  editComposerEmojiInserter(emoji, mxcUrl);
                } else {
                  insertEmoji(editor, emoji, mxcUrl);
                }
              }}
              onClose={() => setMediaPickerOpen(false)}
              onGifStatusChange={setGifSending}
            />
          </div>
        )}
      </div>

      <PollCreatorModal
        open={pollOpen}
        onClose={() => setPollOpen(false)}
        client={client}
        roomId={roomId}
        threadId={threadId}
      />

      <LocationShareModal
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        client={client}
        roomId={roomId}
        threadId={threadId}
        replyTo={replyTo}
        myId={client.userId() ?? undefined}
        onReplySent={onClearReply}
      />
    </ComposerTimelineContext.Provider>
  );
}
