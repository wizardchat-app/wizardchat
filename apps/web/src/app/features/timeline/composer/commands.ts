import type {
  Member,
  MessageKind,
  RoomSummary,
  RoomTimeline,
  WizardClient,
} from '@wizardchat/core';
import { Text, type Descendant } from 'slate';
import { fromMarkdown, type MentionResolver } from './editor/fromMarkdown';
import { buildTextContent } from './editor/buildTextContent';
import { sendTextMessage, textMessageFrom, type ReplyTarget } from './sendMessageContent';
import { viaServersFor } from '@/util/matrix';
import type { CustomElement, EmoticonElement } from './editor/types';

export interface CommandContext {
  client: WizardClient;
  roomId: string;
  threadId?: string | null;
  replyTo?: ReplyTarget | null;
  getTimeline: () => Promise<RoomTimeline>;
  members: Member[];
  rooms: RoomSummary[];
  editorValue?: Descendant[];
  navigate: (path: string) => void;
  t: (key: string, opts?: Record<string, string>) => string;
  toast: {
    success: (msg: string) => void;
    error: (msg: string) => void;
  };
  confirm?: (title: string, message: string, danger?: boolean) => Promise<boolean>;
  placeCall?: (roomId: string) => Promise<void> | void;
  joinVoice?: (roomId: string) => Promise<void> | void;
  hangup?: () => void;
  callActive: boolean;
  markdown: boolean;
  myId: string;
}

export interface CommandDefinition {
  command: string;
  aliases: string[];
  description: (t: (key: string) => string) => string;
  usage: string;
  fn: (args: string, ctx: CommandContext) => Promise<void>;
}

type CommandHandler = (args: string, ctx: CommandContext) => Promise<void>;

async function resolveTargetRoomId(ctx: CommandContext, args: string): Promise<string> {
  const alias = args.trim();
  if (!alias) return ctx.roomId;
  try {
    return (await ctx.client.resolveAlias(alias)).roomId;
  } catch {
    throw new Error(ctx.t('timeline.commands.roomNotFound', { alias }));
  }
}

function resolveUserId(members: Member[], raw: string): { userId: string; displayName: string } {
  const stripped = raw.startsWith('@') ? raw.slice(1) : raw;

  for (const m of members) {
    const displayName = m.displayName ?? m.userId;
    if (displayName === stripped || m.userId === raw || m.userId === `@${stripped}`) {
      return { userId: m.userId, displayName };
    }
  }

  return { userId: `@${stripped}`, displayName: stripped };
}

function buildRoomMentionResolver(members: Member[]): MentionResolver | undefined {
  if (members.length === 0) return undefined;
  const tokens: MentionResolver['tokens'] = [];
  const seen = new Set<string>();
  for (const m of members) {
    const name = m.displayName ?? m.userId;
    const add = (token: string) => {
      if (token.length < 2 || seen.has(token)) return;
      seen.add(token);
      tokens.push({ token, userId: m.userId, displayName: name });
    };
    add(`@${name}`);
    add(`@${m.userId}`);
  }
  tokens.sort((a, b) => b.token.length - a.token.length);
  return tokens.length > 0 ? { tokens } : undefined;
}

const SHORTCODE_RE = /:([a-zA-Z0-9_-]+):/g;

function collectEmoticons(editorValue: Descendant[]): Map<string, string> {
  const map = new Map<string, string>();
  const visit = (nodes: Descendant[]) => {
    for (const node of nodes) {
      const el = node as CustomElement;
      if (el.type === 'emoticon') {
        const e = el as EmoticonElement;
        if (!map.has(e.shortcode)) map.set(e.shortcode, e.mxcUrl);
      }
      if (el.children && Array.isArray(el.children)) visit(el.children as Descendant[]);
    }
  };
  visit(editorValue);
  return map;
}

function injectEmoticons(nodes: Descendant[], emoticons: Map<string, string>): Descendant[] {
  if (emoticons.size === 0) return nodes;
  const out: Descendant[] = [];
  for (const node of nodes) {
    if (Text.isText(node)) {
      const leaf = node as Text;
      const text = leaf.text;
      if (!text.includes(':')) {
        out.push(leaf);
        continue;
      }
      SHORTCODE_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      let last = 0;
      let replaced = false;
      while ((match = SHORTCODE_RE.exec(text)) !== null) {
        const mxcUrl = emoticons.get(match[1]);
        if (!mxcUrl) continue;
        replaced = true;
        if (match.index > last) out.push({ ...leaf, text: text.slice(last, match.index) });
        out.push({
          type: 'emoticon',
          shortcode: match[1],
          mxcUrl,
          children: [{ text: '' }],
        } as EmoticonElement);
        last = match.index + match[0].length;
      }
      if (!replaced) {
        out.push(leaf);
        continue;
      }
      if (last < text.length) out.push({ ...leaf, text: text.slice(last) });
    } else {
      const el = node as CustomElement;
      if (el.type === 'code-block') {
        out.push(el);
        continue;
      }
      if (el.children && Array.isArray(el.children)) {
        out.push({ ...el, children: injectEmoticons(el.children, emoticons) } as CustomElement);
      } else {
        out.push(el);
      }
    }
  }
  return out;
}

function buildCommandText(
  ctx: CommandContext,
  text: string,
  editorValue: Descendant[] | undefined,
  markdown: boolean
) {
  const resolver = buildRoomMentionResolver(ctx.members);
  const emoticons = editorValue ? collectEmoticons(editorValue) : new Map();
  const nodes = injectEmoticons(fromMarkdown(text, resolver, { formatting: markdown }), emoticons);
  return buildTextContent(nodes, { myId: ctx.myId });
}

async function sendCommandText(
  ctx: CommandContext,
  kind: MessageKind,
  text: string,
  markdown: boolean
) {
  const built = buildCommandText(ctx, text, ctx.editorValue, markdown);
  const timeline = await ctx.getTimeline();
  await sendTextMessage(timeline, textMessageFrom(kind, built), {
    replyTo: ctx.replyTo,
    myId: ctx.myId,
  });
}

const handlePlain: CommandHandler = async (args, ctx) => {
  if (!args.trim()) throw new Error('Usage: /plain <message>');
  await sendCommandText(ctx, 'text', args, false);
};

const handleMe: CommandHandler = async (args, ctx) => {
  if (!args.trim()) throw new Error('Usage: /me <message>');
  await sendCommandText(ctx, 'emote', args, ctx.markdown);
};

const handleNotice: CommandHandler = async (args, ctx) => {
  if (!args.trim()) throw new Error('Usage: /notice <message>');
  await sendCommandText(ctx, 'notice', args, ctx.markdown);
};

const handleJoin: CommandHandler = async (args, ctx) => {
  const trimmed = args.trim();
  const voiceMatch = trimmed.match(/^voice(?:\s+(.*))?$/i);
  if (voiceMatch) {
    await handleJoinVoice(voiceMatch[1] ?? '', ctx);
    return;
  }
  const alias = trimmed;
  if (!alias) throw new Error('Usage: /join <room_alias>');
  const homeDomain = ctx.myId.split(':').slice(1).join(':');
  const viaServers = viaServersFor(alias, homeDomain).viaServers;
  await ctx.client.join(alias, viaServers.length > 0 ? viaServers : null);
  ctx.toast.success(ctx.t('timeline.commands.join.joined', { alias }));
};

const handleJoinVoice: CommandHandler = async (args, ctx) => {
  if (!ctx.joinVoice) throw new Error(ctx.t('timeline.commands.callUnavailable'));
  const targetRoomId = await resolveTargetRoomId(ctx, args);
  await ctx.joinVoice(targetRoomId);
};

const handleCall: CommandHandler = async (args, ctx) => {
  if (ctx.callActive) throw new Error(ctx.t('call.toastAlreadyInCall'));
  if (!ctx.placeCall) throw new Error(ctx.t('timeline.commands.callUnavailable'));
  const targetRoomId = await resolveTargetRoomId(ctx, args);
  await ctx.placeCall(targetRoomId);
};

const handleHangup: CommandHandler = async (_args, ctx) => {
  if (ctx.callActive) {
    ctx.hangup?.();
    return;
  }
  throw new Error(ctx.t('call.noActiveCall'));
};

const handlePart: CommandHandler = async (
  _args,
  { client, roomId, rooms, navigate, t, confirm, toast }
) => {
  const name = rooms.find((r) => r.id === roomId)?.name ?? roomId;
  const ok = confirm
    ? await confirm(t('room.leaveRoom'), t('room.leaveRoomConfirm', { name }), true)
    : true;
  if (!ok) return;
  await client.leave(roomId);
  toast.success(t('room.leaveSuccess', { name }));
  navigate('/');
};

const handleKick: CommandHandler = async (args, { client, roomId, members }) => {
  const parts = args.trim().split(/\s+/);
  if (!parts[0]) throw new Error('Usage: /kick <user> [reason]');
  const { userId } = resolveUserId(members, parts[0]);
  const reason = parts.slice(1).join(' ') || null;
  await client.kick(roomId, userId, reason);
};

const handleBan: CommandHandler = async (args, { client, roomId, members }) => {
  const parts = args.trim().split(/\s+/);
  if (!parts[0]) throw new Error('Usage: /ban <user> [reason]');
  const { userId } = resolveUserId(members, parts[0]);
  const reason = parts.slice(1).join(' ') || null;
  await client.ban(roomId, userId, reason);
};

const handleUnban: CommandHandler = async (args, { client, roomId, members }) => {
  const raw = args.trim();
  if (!raw) throw new Error('Usage: /unban <user>');
  const { userId } = resolveUserId(members, raw);
  await client.unban(roomId, userId);
};

const handleInvite: CommandHandler = async (args, { client, roomId, members }) => {
  const raw = args.trim();
  if (!raw) throw new Error('Usage: /invite <user>');
  const { userId } = resolveUserId(members, raw);
  await client.invite(roomId, userId);
};

const handleTopic: CommandHandler = async (args, { client, roomId }) => {
  const topic = args.trim();
  if (!topic) throw new Error('Usage: /topic <new_topic>');
  const { permissions } = await client.roomDetails(roomId);
  if (!permissions.changeTopic) {
    throw new Error('You do not have permission to change the room topic');
  }
  await client.setRoomTopic(roomId, topic);
};

const handleRoomName: CommandHandler = async (args, { client, roomId }) => {
  const name = args.trim();
  if (!name) throw new Error('Usage: /roomname <new_name>');
  const { permissions } = await client.roomDetails(roomId);
  if (!permissions.changeName) {
    throw new Error('You do not have permission to rename the room');
  }
  await client.setRoomName(roomId, name);
};

const handleNick: CommandHandler = async (args, { client }) => {
  const name = args.trim();
  if (!name) throw new Error('Usage: /nick <display_name>');
  await client.setDisplayName(name);
};

const handleRoomNick: CommandHandler = async (args, { client, roomId }) => {
  await client.setRoomNickname(roomId, args.trim());
};

const handleSpoiler: CommandHandler = async (args, ctx) => {
  if (!args.trim()) throw new Error('Usage: /spoiler ["reason"] <message>');
  let reason = '';
  let body = args;
  const reasonMatch = args.match(/^"(.+?)"\s+(.*)/s);
  if (reasonMatch) {
    reason = reasonMatch[1];
    body = reasonMatch[2];
  }
  const built = buildCommandText(ctx, body, ctx.editorValue, ctx.markdown);
  const escapedReason = reason.replace(/"/g, '&quot;');
  const message = textMessageFrom('text', built);
  message.html = reason
    ? `<span data-mx-spoiler="${escapedReason}">${built.formattedBody}</span>`
    : `<span data-mx-spoiler>${built.formattedBody}</span>`;
  const timeline = await ctx.getTimeline();
  await sendTextMessage(timeline, message, { replyTo: ctx.replyTo, myId: ctx.myId });
};

export const COMMANDS: CommandDefinition[] = [
  {
    command: 'plain',
    aliases: [],
    description: (t) => t('timeline.commands.plain.description'),
    usage: '/plain <message>',
    fn: handlePlain,
  },
  {
    command: 'me',
    aliases: [],
    description: (t) => t('timeline.commands.me.description'),
    usage: '/me <message>',
    fn: handleMe,
  },
  {
    command: 'notice',
    aliases: [],
    description: (t) => t('timeline.commands.notice.description'),
    usage: '/notice <message>',
    fn: handleNotice,
  },
  {
    command: 'join',
    aliases: [],
    description: (t) => t('timeline.commands.join.description'),
    usage: '/join <room_alias>',
    fn: handleJoin,
  },
  {
    command: 'join-voice',
    aliases: [],
    description: (t) => t('timeline.commands.joinVoice.description'),
    usage: '/join-voice [room]',
    fn: handleJoinVoice,
  },
  {
    command: 'call',
    aliases: [],
    description: (t) => t('timeline.commands.call.description'),
    usage: '/call [room]',
    fn: handleCall,
  },
  {
    command: 'hangup',
    aliases: [],
    description: (t) => t('timeline.commands.hangup.description'),
    usage: '/hangup',
    fn: handleHangup,
  },
  {
    command: 'part',
    aliases: ['leave'],
    description: (t) => t('timeline.commands.part.description'),
    usage: '/part',
    fn: handlePart,
  },
  {
    command: 'kick',
    aliases: [],
    description: (t) => t('timeline.commands.kick.description'),
    usage: '/kick <user> [reason]',
    fn: handleKick,
  },
  {
    command: 'ban',
    aliases: [],
    description: (t) => t('timeline.commands.ban.description'),
    usage: '/ban <user> [reason]',
    fn: handleBan,
  },
  {
    command: 'unban',
    aliases: [],
    description: (t) => t('timeline.commands.unban.description'),
    usage: '/unban <user>',
    fn: handleUnban,
  },
  {
    command: 'invite',
    aliases: [],
    description: (t) => t('timeline.commands.invite.description'),
    usage: '/invite <user>',
    fn: handleInvite,
  },
  {
    command: 'topic',
    aliases: [],
    description: (t) => t('timeline.commands.topic.description'),
    usage: '/topic <new_topic>',
    fn: handleTopic,
  },
  {
    command: 'roomname',
    aliases: [],
    description: (t) => t('timeline.commands.roomname.description'),
    usage: '/roomname <new_name>',
    fn: handleRoomName,
  },
  {
    command: 'nick',
    aliases: [],
    description: (t) => t('timeline.commands.nick.description'),
    usage: '/nick <display_name>',
    fn: handleNick,
  },
  {
    command: 'myroomnick',
    aliases: ['roomnick'],
    description: (t) => t('timeline.commands.myroomnick.description'),
    usage: '/myroomnick [display_name]',
    fn: handleRoomNick,
  },
  {
    command: 'spoiler',
    aliases: ['cw', 'content-warning'],
    description: (t) => t('timeline.commands.spoiler.description'),
    usage: '/spoiler ["reason"] <message>',
    fn: handleSpoiler,
  },
];

const ALL_COMMANDS = new Map<string, CommandDefinition>();
for (const cmd of COMMANDS) {
  ALL_COMMANDS.set(cmd.command, cmd);
  for (const alias of cmd.aliases) {
    ALL_COMMANDS.set(alias, cmd);
  }
}

export function parseCommand(text: string): { command: string; args: string } | null {
  const match = text.match(/^\/([\w-]+)(?:\s+(.*))?$/s);
  if (!match) return null;
  return { command: match[1].toLowerCase(), args: match[2] ?? '' };
}

export function getCommandDefinition(command: string): CommandDefinition | undefined {
  return ALL_COMMANDS.get(command);
}

export function getCommandSuggestions(query: string): CommandDefinition[] {
  const q = query.toLowerCase();
  return COMMANDS.filter(
    (cmd) => cmd.command.startsWith(q) || cmd.aliases.some((a) => a.startsWith(q))
  );
}
