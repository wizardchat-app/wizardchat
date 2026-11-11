import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type ClipboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { RoomTimeline, WizardClient } from '@wizardchat/core';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  typingIndicatorsAtom,
  markdownAtom,
  emoticonsToEmojiAtom,
  serverUploadLimitAtom,
  composerAttachmentsAtom,
  composerDraftKey,
  composerFocusRequestAtom,
  mentionInsertAtom,
  commandActionsAtom,
  editMessageAtom,
  type ComposerAttachment,
} from '@/app/store/atoms';
import { useAllRooms, useMembers } from '@/app/data';
import { useToast } from '@/app/hooks/useToast';
import { useConfirm } from '@/app/hooks/useConfirm';
import { getErrorMessage } from '@/util/error';
import { formatFileSize } from '@/util/format';
import { Editor, Transforms, type Descendant } from 'slate';
import { ReactEditor } from 'slate-react';
import { useAutocomplete } from '../useAutocomplete';
import type { Suggestion } from '../useAutocomplete';
import { callUiAtom } from '@/app/store/atoms/call';
import {
  cancelAttachmentUpload,
  forgetAttachmentUpload,
  getAttachmentUpload,
  startAttachmentUpload,
  subscribeAttachmentUpload,
  type PreparedAttachment,
} from './attachmentUploads';
import { parseCommand, getCommandDefinition } from './commands';
import type { FormatType } from './FormatToolbar';
import type { CommandContext } from './commands';
import { toMarkdown } from './editor/toMarkdown';
import { buildTextContent } from './editor/buildTextContent';
import { applyInlineMarkdown } from './editor/applyMarkdown';
import { withEmoticons } from './editor/emoticons';
import {
  replyMentions,
  sendTextMessage,
  textMessageFrom,
  type ReplyTarget,
  type TextMessage,
} from './sendMessageContent';
import { editStateFor, findAdjacentEditableMessage } from '../message/editNavigation';
import { useRichEditor } from './useRichEditor';
import type { CustomEditor, MentionElement } from './editor/types';

const EMPTY_ATTACHMENTS: ComposerAttachment[] = [];

interface UseComposerOptions {
  client: WizardClient;
  roomId: string;
  threadId?: string | null;
  getTimeline: () => Promise<RoomTimeline>;
  replyTo: ReplyTarget | null;
  onClearReply: () => void;
  onSent?: () => void;
  droppedFile?: File[] | null;
  onDroppedFileConsumed?: () => void;
}

export interface ComposerState {
  editor: CustomEditor;
  editorValue: Descendant[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  composerWrapRef: React.RefObject<HTMLDivElement | null>;

  toolbar: { activeFormats: FormatType[] } | null;
  autocomplete: ReturnType<typeof useAutocomplete>;

  uploadProgress: number | null;
  uploadFileInfo: { name: string; size: number; current: number; total: number } | null;

  cancelUpload: () => void;
  handleEditorChange: (value: Descendant[]) => void;
  handleEditorKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  handlePaste: (e: ClipboardEvent<HTMLDivElement>) => void;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAutocompleteSelect: (suggestion: Suggestion) => void;
  handleAutocompleteHover: (index: number) => void;
  applyFormat: (fmt: FormatType, e?: React.MouseEvent) => Promise<void>;
  updateToolbar: () => void;
  linkPopover: { defaultValue: string } | null;
  submitLink: (url: string) => void;
  cancelLink: () => void;
  sendMessage: () => Promise<void>;
  isEmpty: boolean;
  attachments: ComposerAttachment[];
  removeAttachment: (id: string) => void;
  updateAttachment: (
    id: string,
    patch: Partial<Pick<ComposerAttachment, 'caption' | 'spoiler'>> & { name?: string }
  ) => void;
}

interface LeadingText {
  message: TextMessage;
  replyTo: ReplyTarget | null;
  attachmentIds: string[];
}

interface UploadQueueItem {
  attachmentId: string;
  file: File;
  caption: string;
  captionExtra?: TextMessage;
  leadingText?: LeadingText;
  spoiler: boolean;
  replyTo: ReplyTarget | null;
}

function revokeAttachment(item: ComposerAttachment): void {
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
}

export function useComposer({
  client,
  roomId,
  threadId,
  getTimeline,
  replyTo,
  onClearReply,
  onSent,
  droppedFile,
  onDroppedFileConsumed,
}: UseComposerOptions): ComposerState {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const typingIndicators = useAtomValue(typingIndicatorsAtom);
  const markdownEnabled = useAtomValue(markdownAtom);
  const emoticonsToEmoji = useAtomValue(emoticonsToEmojiAtom);
  const maxUploadBytes = useAtomValue(serverUploadLimitAtom);
  const [mentionInsert, setMentionInsert] = useAtom(mentionInsertAtom);
  const setEditMessage = useSetAtom(editMessageAtom);
  const confirmDialog = useConfirm();
  const toast = useToast();
  const commandActions = useAtomValue(commandActionsAtom);
  const callUi = useAtomValue(callUiAtom);
  const { data: members } = useMembers(roomId);
  const rooms = useAllRooms();
  const myId = client.userId() ?? '';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerWrapRef = useRef<HTMLDivElement>(null);

  const {
    editor,
    value: editorValue,
    toolbar,
    updateToolbar,
    applyFormat,
    linkPopover,
    submitLink,
    cancelLink,
    autocomplete,
    handleChange: handleRichChange,
    handleKeyDown: handleRichKeyDown,
    handleAutocompleteSelect,
    handleAutocompleteHover,
    clearValue: clearEditor,
    isEmpty,
  } = useRichEditor({
    client,
    roomId,
  });

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const draftKey = composerDraftKey(roomId, threadId);
  const [allAttachments, setAllAttachments] = useAtom(composerAttachmentsAtom);
  const attachments = allAttachments[draftKey] ?? EMPTY_ATTACHMENTS;
  const setAttachments = useCallback(
    (update: (prev: ComposerAttachment[]) => ComposerAttachment[]) =>
      setAllAttachments((all) => {
        const next = update(all[draftKey] ?? EMPTY_ATTACHMENTS);
        const copy = { ...all };
        if (next.length > 0) copy[draftKey] = next;
        else delete copy[draftKey];
        return copy;
      }),
    [draftKey, setAllAttachments]
  );

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadFileInfo, setUploadFileInfo] = useState<{
    name: string;
    size: number;
    current: number;
    total: number;
  } | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadQueueRef = useRef<UploadQueueItem[]>([]);
  const uploadingRef = useRef(false);
  const uploadPosRef = useRef(0);

  const sendTyping = useCallback(
    (typing: boolean) => {
      if (!typingIndicators || threadId) return;
      if (typing === isTypingRef.current) return;
      isTypingRef.current = typing;
      getTimeline()
        .then((timeline) => timeline.setTyping(typing))
        .catch(() => {});
    },
    [getTimeline, threadId, typingIndicators]
  );

  useEffect(() => {
    return () => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        getTimeline()
          .then((timeline) => timeline.setTyping(false))
          .catch(() => {});
      }
    };
  }, [getTimeline]);

  useEffect(() => {
    if (replyTo) {
      ReactEditor.focus(editor);
    }
  }, [replyTo, editor]);

  useEffect(() => {
    if (!mentionInsert) return;
    const mentionNode: MentionElement = {
      type: 'mention',
      userId: mentionInsert.userId,
      displayName: mentionInsert.displayName,
      children: [{ text: '' }],
    };
    ReactEditor.focus(editor);
    Transforms.insertNodes(editor, mentionNode);
    Transforms.move(editor, { unit: 'offset' });
    Transforms.insertText(editor, ' ');
    setMentionInsert(null);
  }, [mentionInsert, editor, setMentionInsert]);

  const handleEditorChange = useCallback(
    (value: Descendant[]) => {
      handleRichChange(value);
      sendTyping(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => sendTyping(false), 4000);
    },
    [handleRichChange, sendTyping]
  );

  const sendingRef = useRef(false);
  const enqueueUploadsRef = useRef<(items: UploadQueueItem[]) => void>(() => {});

  const sendAttachments = useCallback(
    (replyToEvent: ReplyTarget | null, text?: TextMessage) => {
      if (attachments.length === 0) return;
      const items: UploadQueueItem[] = attachments.map((a, i) => ({
        attachmentId: a.id,
        file: a.file,
        caption: a.caption.trim(),
        spoiler: a.spoiler,
        replyTo: i === 0 ? replyToEvent : null,
      }));
      if (text && items.length === 1 && !items[0].caption) {
        items[0].caption = text.body;
        items[0].captionExtra = text;
      } else if (text) {
        items[0].replyTo = null;
        items[0].leadingText = {
          message: text,
          replyTo: replyToEvent,
          attachmentIds: items.map((item) => item.attachmentId),
        };
      }
      enqueueUploadsRef.current(items);
      attachments.forEach(revokeAttachment);
      setAttachments(() => []);
      if (replyToEvent) onClearReply();
    },
    [attachments, setAttachments, onClearReply]
  );

  const sendMessage = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    try {
      if (attachments.some((a) => a.oversized)) {
        toast.error(t('attachment.removeOversized', { limit: formatFileSize(maxUploadBytes) }));
        return;
      }
      if (isEmpty) {
        sendAttachments(replyTo);
        return;
      }
      autocomplete.close();

      const { markdown } = toMarkdown(editorValue);
      const text = markdown.trim();
      if (!text) {
        sendAttachments(replyTo);
        return;
      }

      clearEditor();
      sendTyping(false);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);

      try {
        const parsed = parseCommand(text);
        if (parsed) {
          const cmd = getCommandDefinition(parsed.command);
          if (cmd) {
            const ctx: CommandContext = {
              client,
              roomId,
              threadId,
              replyTo,
              getTimeline,
              members: members ?? [],
              rooms,
              myId,
              editorValue,
              navigate,
              t,
              toast,
              confirm: (title: string, message: string, danger?: boolean) =>
                confirmDialog({ title, message, danger }),
              placeCall: commandActions?.placeCall,
              joinVoice: commandActions?.joinVoice,
              hangup: commandActions?.hangup,
              callActive: callUi.phase === 'joined',
              markdown: markdownEnabled,
            };
            try {
              await cmd.fn(parsed.args, ctx);
            } catch (cmdErr) {
              toast.error(getErrorMessage(cmdErr));
            }
            if (replyTo) onClearReply();
            return;
          }
          // Not a known command: fall through and send as literal text.
        }

        const formatted = markdownEnabled ? applyInlineMarkdown(editorValue) : editorValue;
        const built = buildTextContent(emoticonsToEmoji ? withEmoticons(formatted) : formatted, {
          forceFormatted: !!replyTo,
          myId,
        });
        const message = textMessageFrom('text', built);
        if (attachments.length > 0) {
          sendAttachments(replyTo, message);
          onSent?.();
          return;
        }
        const timeline = await getTimeline();
        await sendTextMessage(timeline, message, { replyTo, myId });
        if (replyTo) onClearReply();
        onSent?.();
      } catch (err) {
        toast.error(t('timeline.sendFailed', { error: getErrorMessage(err) }));
      }
    } finally {
      sendingRef.current = false;
    }
  }, [
    attachments,
    sendAttachments,
    maxUploadBytes,
    isEmpty,
    editorValue,
    markdownEnabled,
    emoticonsToEmoji,
    autocomplete,
    clearEditor,
    sendTyping,
    client,
    roomId,
    threadId,
    getTimeline,
    members,
    rooms,
    myId,
    replyTo,
    onClearReply,
    onSent,
    t,
    toast,
    confirmDialog,
    commandActions,
    callUi,
    navigate,
  ]);

  const handleEditorKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (handleRichKeyDown(e)) return;
      if (e.key === 'Escape' && replyTo) {
        e.preventDefault();
        onClearReply();
        return;
      }
      const plain = !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
      if (e.key === 'ArrowUp' && plain && isEmpty && attachments.length === 0) {
        const last = findAdjacentEditableMessage(client, roomId, threadId, null, 'previous');
        if (!last) return;
        e.preventDefault();
        setEditMessage(editStateFor(last, roomId, threadId));
      }
    },
    [
      handleRichKeyDown,
      replyTo,
      onClearReply,
      isEmpty,
      attachments.length,
      client,
      roomId,
      threadId,
      setEditMessage,
    ]
  );

  const addFilesToPreview = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const items = files.map((file) => {
        const oversized = file.size > maxUploadBytes;
        const previewUrl =
          file.type.startsWith('image/') ||
          file.type.startsWith('video/') ||
          file.type.startsWith('audio/')
            ? URL.createObjectURL(file)
            : '';
        return {
          id: crypto.randomUUID(),
          file,
          previewUrl,
          oversized,
          caption: '',
          spoiler: false,
        };
      });
      setAttachments((prev) => [...prev, ...items]);
      for (const item of items) {
        if (!item.oversized) void startAttachmentUpload(item.id, item.file, getTimeline);
      }
      requestAnimationFrame(() => ReactEditor.focus(editor));
    },
    [maxUploadBytes, setAttachments, editor, getTimeline]
  );

  const focusRequest = useAtomValue(composerFocusRequestAtom);
  useEffect(() => {
    if (focusRequest?.key !== draftKey) return;
    requestAnimationFrame(() => {
      try {
        Transforms.select(editor, Editor.end(editor, []));
        ReactEditor.focus(editor);
      } catch {
        // editor not mounted
      }
    });
  }, [focusRequest, draftKey, editor]);

  const removeAttachment = useCallback(
    (id: string) => {
      cancelAttachmentUpload(id);
      setAttachments((prev) => {
        const item = prev.find((a) => a.id === id);
        if (item) revokeAttachment(item);
        return prev.filter((a) => a.id !== id);
      });
    },
    [setAttachments]
  );

  const updateAttachment = useCallback<ComposerState['updateAttachment']>(
    (id, { name, ...patch }) =>
      setAttachments((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          const trimmed = name?.trim();
          const file =
            trimmed && trimmed !== a.file.name
              ? new File([a.file], trimmed, {
                  type: a.file.type,
                  lastModified: a.file.lastModified,
                })
              : a.file;
          return { ...a, ...patch, file };
        })
      ),
    [setAttachments]
  );

  useEffect(() => {
    if (!droppedFile || droppedFile.length === 0) return;
    addFilesToPreview(droppedFile);
    onDroppedFileConsumed?.();
  }, [droppedFile, addFilesToPreview, onDroppedFileConsumed]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFilesToPreview(Array.from(e.target.files));
    e.target.value = '';
  };

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== 'file') continue;
        const file = item.getAsFile();
        if (file) files.push(file);
      }
      if (files.length === 0) return;
      e.preventDefault();
      addFilesToPreview(files);
    },
    [addFilesToPreview]
  );

  const uploadOne = useCallback(
    async (
      attachmentId: string,
      file: File,
      caption: string,
      spoiler: boolean,
      replyToEvent: ReplyTarget | null,
      abortController?: AbortController,
      captionExtra?: TextMessage
    ): Promise<void> => {
      const isImage = file.type.startsWith('image/') && file.type !== 'image/svg+xml';
      const isVideo = file.type.startsWith('video/');
      const resultPromise = startAttachmentUpload(attachmentId, file, getTimeline);
      const syncProgress = () =>
        setUploadProgress(getAttachmentUpload(attachmentId)?.progress ?? 0);
      syncProgress();
      const unsubscribe = subscribeAttachmentUpload(attachmentId, syncProgress);
      const onAbort = () => cancelAttachmentUpload(attachmentId);
      abortController?.signal.addEventListener('abort', onAbort);
      let prepared: PreparedAttachment;
      try {
        prepared = await resultPromise;
      } finally {
        unsubscribe();
        abortController?.signal.removeEventListener('abort', onAbort);
      }
      if (abortController?.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      forgetAttachmentUpload(attachmentId);
      setUploadProgress(0);
      const timeline = await getTimeline();
      const mentionedUserIds = captionExtra?.mentionedUserIds ?? [];
      const mentions =
        captionExtra || replyToEvent?.eventId
          ? replyMentions(
              { replyTo: replyToEvent, myId, mentionedUserIds },
              captionExtra?.roomMentioned ?? false
            )
          : null;
      await timeline.sendUploaded({
        source: prepared.source,
        size: prepared.size,
        filename: file.name,
        mimetype: file.type || 'application/octet-stream',
        caption: caption.length > 0 ? caption : null,
        captionHtml: captionExtra?.html ?? null,
        mentions,
        width: isImage || isVideo ? (prepared.width ?? null) : null,
        height: isImage || isVideo ? (prepared.height ?? null) : null,
        durationMs: isVideo ? (prepared.durationMs ?? null) : null,
        thumbnail: isImage || isVideo ? prepared.thumbnail : null,
        isAnimated: isImage ? (prepared.isAnimated ?? false) : false,
        spoiler: spoiler && (isImage || isVideo),
        replyTo: replyToEvent?.eventId ?? null,
      });
      setUploadProgress(1);
    },
    [getTimeline, myId]
  );

  const sendLeadingText = useCallback(
    async (leading: LeadingText) => {
      try {
        const timeline = await getTimeline();
        await sendTextMessage(timeline, leading.message, { replyTo: leading.replyTo, myId });
      } catch (err) {
        toast.error(t('timeline.sendFailed', { error: getErrorMessage(err) }));
      }
    },
    [getTimeline, myId, toast, t]
  );

  const processUploadQueue = useCallback(async () => {
    if (uploadingRef.current) return;
    if (uploadQueueRef.current.length === 0) return;
    uploadingRef.current = true;
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    let index = 0;
    let failed = 0;
    uploadPosRef.current = 0;
    try {
      while (index < uploadQueueRef.current.length) {
        if (controller.signal.aborted) break;
        const total = uploadQueueRef.current.length;
        const item = uploadQueueRef.current[index];
        uploadPosRef.current = index;
        setUploadFileInfo({
          name: item.file.name,
          size: item.file.size,
          current: index + 1,
          total,
        });
        if (item.leadingText) {
          const leading = item.leadingText;
          item.leadingText = undefined;
          // Wait for the whole batch, so the text and its files arrive back-to-back
          const batch = uploadQueueRef.current.filter((q) =>
            leading.attachmentIds.includes(q.attachmentId)
          );
          await Promise.allSettled(
            batch.map((q) => startAttachmentUpload(q.attachmentId, q.file, getTimeline))
          );
          await sendLeadingText(leading);
        }
        try {
          await uploadOne(
            item.attachmentId,
            item.file,
            item.caption,
            item.spoiler,
            item.replyTo,
            controller,
            item.captionExtra
          );
          onSent?.();
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') break;
          failed += 1;
          toast.error(t('timeline.uploadFailed', { error: getErrorMessage(err) }));
        }
        index += 1;
      }
      if (failed > 0 && uploadQueueRef.current.length > 1) {
        toast.error(
          t('timeline.uploadFailedMany', { failed, total: uploadQueueRef.current.length })
        );
      }
    } finally {
      uploadingRef.current = false;
      uploadQueueRef.current = [];
      setUploadProgress(null);
      setUploadFileInfo(null);
      uploadAbortRef.current = null;
    }
  }, [uploadOne, sendLeadingText, onSent, toast, t, getTimeline]);

  const cancelUpload = useCallback(() => {
    // Cancelling drops the files, but text sent along with them still goes out
    const texts = uploadQueueRef.current.flatMap((item) => {
      const leading = item.leadingText;
      item.leadingText = undefined;
      return leading ? [leading] : [];
    });
    uploadAbortRef.current?.abort();
    uploadQueueRef.current.forEach((item) => cancelAttachmentUpload(item.attachmentId));
    uploadQueueRef.current = [];
    texts.forEach((leading) => void sendLeadingText(leading));
  }, [sendLeadingText]);

  const enqueueUploads = useCallback(
    (items: UploadQueueItem[]) => {
      uploadQueueRef.current.push(...items);
      if (uploadingRef.current) {
        const item = uploadQueueRef.current[uploadPosRef.current];
        if (item) {
          setUploadFileInfo({
            name: item.file.name,
            size: item.file.size,
            current: uploadPosRef.current + 1,
            total: uploadQueueRef.current.length,
          });
        }
      } else {
        void processUploadQueue();
      }
    },
    [processUploadQueue]
  );
  enqueueUploadsRef.current = enqueueUploads;

  return {
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
  };
}
