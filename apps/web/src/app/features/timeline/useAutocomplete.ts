import { useState, useCallback, useMemo, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { WizardClient } from '@wizardchat/core';
import { useAllJoinedSpaces, useAllRooms, useMembers, useRoom } from '@/app/data';
import { makeRoomPermalink } from '@/util/matrix';
import { Editor, Transforms, Range } from 'slate';
import { ReactEditor } from 'slate-react';
import { emojiFrequencyAtom } from '@/app/store/atoms';
import emojibaseData from 'emojibase-data/en/data.json';
import emojibaseShortcodes from 'emojibase-data/en/shortcodes/emojibase.json';
import { useImagePacks } from '@/app/hooks/useImagePacks';
import { getCommandSuggestions } from './composer/commands';
import type {
  CustomEditor,
  EmoticonElement,
  MentionElement,
  RoomLinkElement,
  RoomMentionElement,
} from './composer/editor/types';

interface EmojiEntry {
  id: string;
  char: string;
  searchKeys: string[];
  mxcUrl?: string;
}

let EMOJI_LIST: EmojiEntry[] | null = null;

function unicodeToChar(hexcode: string): string {
  try {
    return String.fromCodePoint(...hexcode.split('-').map((h) => parseInt(h, 16)));
  } catch {
    return '';
  }
}

function getEmojiList(): EmojiEntry[] {
  if (EMOJI_LIST) return EMOJI_LIST;

  const shortcodeMap = emojibaseShortcodes as Record<string, string | string[]>;

  EMOJI_LIST = (emojibaseData as Array<{ hexcode: string; label: string; tags?: string[] }>)
    .filter((e) => shortcodeMap[e.hexcode])
    .map((e) => {
      const sc = shortcodeMap[e.hexcode];
      const allShortcodes: string[] = Array.isArray(sc) ? sc : [sc];
      const tags = (e.tags ?? []).map((t) => t.toLowerCase());
      return {
        id: allShortcodes[0],
        char: unicodeToChar(e.hexcode),
        searchKeys: [...new Set([...allShortcodes, ...tags, e.label.toLowerCase()])],
      };
    })
    .filter((e) => e.char.length > 0 && e.id.length > 0);

  return EMOJI_LIST;
}

const MAX_TRACKED = 100;

export type AutocompleteMode = 'emoji' | 'mention' | 'room' | 'command';

export interface EmojiSuggestion {
  kind: 'emoji';
  id: string;
  char: string;
  mxcUrl?: string;
}

export interface MentionSuggestion {
  kind: 'mention';
  userId: string;
  displayName: string;
  avatarMxc: string | null;
}

export interface RoomMentionSuggestion {
  kind: 'room-mention';
  label: string;
  roomAvatarMxc: string | null;
}

export interface RoomLinkSuggestion {
  kind: 'room-link';
  roomId: string;
  name: string;
  alias: string | null;
  avatarMxc: string | null;
  isSpace: boolean;
  url: string;
}

export interface CommandSuggestion {
  kind: 'command';
  command: string;
  description: (t: (key: string) => string) => string;
}

export type Suggestion =
  | EmojiSuggestion
  | MentionSuggestion
  | RoomMentionSuggestion
  | RoomLinkSuggestion
  | CommandSuggestion;

const ROOM_MENTION_OPTIONS = ['@room', '@everyone', '@all'];

export interface AutocompleteState {
  open: boolean;
  mode: AutocompleteMode;
  suggestions: Suggestion[];
  selectedIndex: number;
  triggerRange: Range | null;
}

const CLOSED: AutocompleteState = {
  open: false,
  mode: 'emoji',
  suggestions: [],
  selectedIndex: 0,
  triggerRange: null,
};

export function useAutocomplete(
  client: WizardClient,
  roomId: string,
  options?: { disableCommands?: boolean }
) {
  const { disableCommands = false } = options ?? {};
  const room = useRoom(roomId);
  const { data: roomMembers } = useMembers(roomId);
  const roomRef = useRef(room);
  roomRef.current = room;
  const membersRef = useRef(roomMembers);
  membersRef.current = roomMembers;
  const allRooms = useAllRooms();
  const allSpaces = useAllJoinedSpaces();
  const allRoomsRef = useRef(allRooms);
  allRoomsRef.current = allRooms;
  const allSpacesRef = useRef(allSpaces);
  allSpacesRef.current = allSpaces;
  const { packs } = useImagePacks(client, roomId);
  const customEmojis = useMemo(() => {
    const list: EmojiEntry[] = [];
    for (const [shortcode, img] of packs) {
      if (!img.usage.includes('emoticon') || !img.url.startsWith('mxc://')) continue;
      list.push({
        id: shortcode,
        char: `:${shortcode}:`,
        searchKeys: [shortcode.toLowerCase()],
        mxcUrl: img.url,
      });
    }
    return list;
  }, [packs]);
  const customEmojisRef = useRef(customEmojis);
  customEmojisRef.current = customEmojis;
  const [state, setState] = useState<AutocompleteState>(CLOSED);
  const freq = useAtomValue(emojiFrequencyAtom);
  const setFreq = useSetAtom(emojiFrequencyAtom);

  const close = useCallback(() => setState(CLOSED), []);

  // Maps a block-level character offset
  function pointAtOffset(
    editor: CustomEditor,
    blockPath: number[],
    charOffset: number,
    fallback: { path: number[]; offset: number }
  ) {
    let remaining = charOffset;
    for (const [node, path] of Editor.nodes(editor, {
      at: blockPath,
      match: (n) => 'text' in n,
    })) {
      const len = (node as { text: string }).text.length;
      if (remaining <= len) return { path, offset: remaining };
      remaining -= len;
    }
    return fallback;
  }

  const onEditorChange = useCallback(
    (editor: CustomEditor) => {
      const { selection } = editor;
      if (!selection || !Range.isCollapsed(selection)) {
        setState(CLOSED);
        return;
      }

      const [cursor] = Range.edges(selection);

      const blockEntry = Editor.above(editor, {
        at: cursor,
        match: (n) => Editor.isBlock(editor, n as never),
      });
      if (!blockEntry) {
        setState(CLOSED);
        return;
      }

      const [, blockPath] = blockEntry;
      const blockStart = Editor.start(editor, blockPath);
      const beforeRange: Range = { anchor: blockStart, focus: cursor };
      const textBefore = Editor.string(editor, beforeRange);

      const emojiMatch = textBefore.match(/:([a-zA-Z0-9_-]*)$/);
      if (emojiMatch && emojiMatch[1].length >= 1) {
        const query = emojiMatch[1].toLowerCase();
        const triggerCharOffset = textBefore.lastIndexOf(':');
        const triggerRange: Range = {
          anchor: pointAtOffset(editor, blockPath as number[], triggerCharOffset, cursor),
          focus: cursor,
        };

        const list = [...customEmojisRef.current, ...getEmojiList()];
        const results = list
          .filter((e) => e.searchKeys.some((k) => k.startsWith(query)))
          .map((e) => ({ ...e, freq: freq[e.mxcUrl ?? e.char] ?? 0 }))
          .sort((a, b) => {
            const aExact = a.id.toLowerCase() === query,
              bExact = b.id.toLowerCase() === query;
            if (aExact !== bExact) return aExact ? -1 : 1;
            const aId = a.id.toLowerCase().startsWith(query),
              bId = b.id.toLowerCase().startsWith(query);
            if (aId !== bId) return aId ? -1 : 1;
            if (a.id.length !== b.id.length) return a.id.length - b.id.length;
            return b.freq - a.freq;
          })
          .slice(0, 20)
          .map((e): EmojiSuggestion => ({
            kind: 'emoji',
            id: e.id,
            char: e.char,
            mxcUrl: e.mxcUrl,
          }));

        if (results.length > 0) {
          setState({
            open: true,
            mode: 'emoji',
            suggestions: results,
            selectedIndex: 0,
            triggerRange,
          });
          return;
        }
      }

      // Mention @query
      const mentionMatch = textBefore.match(/@([^\s@]*)$/);
      if (mentionMatch) {
        const query = mentionMatch[1].toLowerCase();
        const triggerCharOffset = textBefore.lastIndexOf('@');
        const triggerRange: Range = {
          anchor: pointAtOffset(editor, blockPath as number[], triggerCharOffset, cursor),
          focus: cursor,
        };

        const room = roomRef.current;
        const members = (membersRef.current ?? []).filter((m) => !m.isInvite);

        const roomMentionResults: RoomMentionSuggestion[] =
          room && !room.isInvite && !room.isDirect
            ? ROOM_MENTION_OPTIONS.filter(
                (opt) =>
                  query === '' || opt.slice(1).startsWith(query) || opt.startsWith('@' + query)
              )
                .slice(0, query === '' ? 1 : 3)
                .map((label): RoomMentionSuggestion => ({
                  kind: 'room-mention',
                  label,
                  roomAvatarMxc: room.avatarUrl ?? null,
                }))
            : [];

        const memberResults: MentionSuggestion[] = members
          .filter(
            (m) =>
              (m.displayName ?? m.userId).toLowerCase().includes(query) ||
              m.userId.toLowerCase().includes(query)
          )
          .slice(0, 20)
          .map((m): MentionSuggestion => ({
            kind: 'mention',
            userId: m.userId,
            displayName: m.displayName ?? m.userId,
            avatarMxc: m.avatarUrl ?? null,
          }));

        const results: Suggestion[] = [...roomMentionResults, ...memberResults];

        if (results.length > 0) {
          setState({
            open: true,
            mode: 'mention',
            suggestions: results,
            selectedIndex: 0,
            triggerRange,
          });
          return;
        }
      }

      const roomMatch = textBefore.match(/(?:^|\s)#([^\s#]*)$/);
      if (roomMatch) {
        const query = roomMatch[1].toLowerCase();
        const triggerCharOffset = textBefore.lastIndexOf('#');
        const triggerRange: Range = {
          anchor: pointAtOffset(editor, blockPath as number[], triggerCharOffset, cursor),
          focus: cursor,
        };
        const rooms = allRoomsRef.current
          .filter((r) => !r.isInvite && !r.isDirect && !r.isTombstoned)
          .map((r) => ({
            id: r.id,
            name: r.name || r.canonicalAlias || r.id,
            alias: r.canonicalAlias ?? null,
            avatarMxc: r.avatarUrl ?? null,
            isSpace: r.isSpace,
            lastActivity: r.lastActivity ?? 0,
          }));
        const spaces = allSpacesRef.current
          .filter((s) => !rooms.some((r) => r.id === s.id))
          .map((s) => ({
            id: s.id,
            name: s.name || s.id,
            alias: null,
            avatarMxc: s.avatarUrl ?? null,
            isSpace: true,
            lastActivity: 0,
          }));
        const results = [...rooms, ...spaces]
          .filter(
            (r) =>
              r.name.toLowerCase().includes(query) || (r.alias ?? '').toLowerCase().includes(query)
          )
          .sort((a, b) => {
            const aStarts = a.name.toLowerCase().startsWith(query);
            const bStarts = b.name.toLowerCase().startsWith(query);
            if (aStarts !== bStarts) return aStarts ? -1 : 1;
            return b.lastActivity - a.lastActivity;
          })
          .slice(0, 20)
          .map((r): RoomLinkSuggestion => ({
            kind: 'room-link',
            roomId: r.id,
            name: r.name,
            alias: r.alias,
            avatarMxc: r.avatarMxc,
            isSpace: r.isSpace,
            url: makeRoomPermalink({ id: r.id, canonicalAlias: r.alias }),
          }));
        if (results.length > 0) {
          setState({
            open: true,
            mode: 'room',
            suggestions: results,
            selectedIndex: 0,
            triggerRange,
          });
          return;
        }
      }

      // Command /query
      const commandMatch = textBefore.match(/^\/([\w-]*)$/);
      if (commandMatch && !disableCommands) {
        const query = commandMatch[1];
        const results = getCommandSuggestions(query);
        if (results.length > 0) {
          const triggerRange: Range = { anchor: blockStart, focus: cursor };
          setState({
            open: true,
            mode: 'command',
            suggestions: results.map((c): CommandSuggestion => ({
              kind: 'command',
              command: c.command,
              description: c.description,
            })),
            selectedIndex: 0,
            triggerRange,
          });
          return;
        }
      }

      setState(CLOSED);
    },
    [disableCommands]
  );

  const onArrow = useCallback(
    (direction: 'up' | 'down'): boolean => {
      if (!state.open) return false;
      setState((prev) => ({
        ...prev,
        selectedIndex:
          direction === 'down'
            ? Math.min(prev.selectedIndex + 1, prev.suggestions.length - 1)
            : Math.max(prev.selectedIndex - 1, 0),
      }));
      return true;
    },
    [state.open]
  );

  const select = useCallback((index: number): void => {
    setState((prev) => {
      if (!prev.open || index === prev.selectedIndex) return prev;
      if (index < 0 || index >= prev.suggestions.length) return prev;
      return { ...prev, selectedIndex: index };
    });
  }, []);

  const confirm = useCallback(
    (editor: CustomEditor, explicit?: Suggestion): boolean => {
      if (!state.open || state.suggestions.length === 0 || !state.triggerRange) return false;
      const suggestion = explicit ?? state.suggestions[state.selectedIndex];
      if (!suggestion) return false;

      if (suggestion.kind === 'emoji') {
        Transforms.select(editor, state.triggerRange);
        if (suggestion.mxcUrl) {
          Transforms.delete(editor);
          const emoticonNode: EmoticonElement = {
            type: 'emoticon',
            mxcUrl: suggestion.mxcUrl,
            shortcode: suggestion.id,
            children: [{ text: '' }],
          };
          Transforms.insertNodes(editor, emoticonNode);
          Transforms.move(editor, { unit: 'offset' });
          Transforms.insertText(editor, ' ');
        } else {
          Transforms.insertText(editor, suggestion.char + ' ');
        }
        const char = suggestion.mxcUrl ?? suggestion.char;
        setFreq((prev) => {
          const next = { ...prev, [char]: (prev[char] ?? 0) + 1 };
          const entries = Object.entries(next);
          if (entries.length > MAX_TRACKED) {
            entries.sort((a, b) => b[1] - a[1]);
            return Object.fromEntries(entries.slice(0, MAX_TRACKED));
          }
          return next;
        });
      } else if (suggestion.kind === 'command') {
        Transforms.select(editor, state.triggerRange);
        Transforms.insertText(editor, '/' + suggestion.command + ' ');
      } else if (suggestion.kind === 'room-link') {
        Transforms.select(editor, state.triggerRange);
        Transforms.delete(editor);
        const roomLinkNode: RoomLinkElement = {
          type: 'room-link',
          url: suggestion.url,
          name: suggestion.name,
          children: [{ text: '' }],
        };
        Transforms.insertNodes(editor, roomLinkNode);
        Transforms.move(editor, { unit: 'offset' });
        Transforms.insertText(editor, ' ');
      } else if (suggestion.kind === 'room-mention') {
        Transforms.select(editor, state.triggerRange);
        Transforms.delete(editor);
        const roomMentionNode: RoomMentionElement = {
          type: 'room-mention',
          label: suggestion.label,
          children: [{ text: '' }],
        };
        Transforms.insertNodes(editor, roomMentionNode);
        Transforms.move(editor, { unit: 'offset' });
        Transforms.insertText(editor, ' ');
      } else {
        Transforms.select(editor, state.triggerRange);
        Transforms.delete(editor);
        const mentionNode: MentionElement = {
          type: 'mention',
          userId: suggestion.userId,
          displayName: suggestion.displayName,
          children: [{ text: '' }],
        };
        Transforms.insertNodes(editor, mentionNode);
        Transforms.move(editor, { unit: 'offset' });
        Transforms.insertText(editor, ' ');
      }

      setState(CLOSED);
      ReactEditor.focus(editor);
      return true;
    },
    [state, setFreq]
  );

  return { state, onEditorChange, onArrow, select, confirm, close };
}
