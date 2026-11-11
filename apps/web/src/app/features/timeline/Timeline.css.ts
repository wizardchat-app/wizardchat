import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { backdrop } from '@/theme/backdrop';
import { vars } from '@/theme/vars.css';
import { chatSize, chatSpace } from './chatDisplay';
import { TOUCH_FIRST_QUERY } from '@/theme/uiDensity';
import { fast, fadeInUp, scaleIn } from '@/theme/animations.css';
import { TYPING_INDICATOR_BAND_HEIGHT } from './composer/TypingIndicator.css';

export const timelineContainer = style({
  flex: 1,
  ...backdrop('secondary'),
  overflowY: 'auto',
  overflowX: 'hidden',
  overflowAnchor: 'none',
});

export const timelineBody = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  minHeight: '100%',
  padding: `8px 0 ${TYPING_INDICATOR_BAND_HEIGHT}px`,
});

export const timelineIntro = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '40px 16px 32px',
  flexShrink: 0,
});

export const timelinePlaceholder = style({
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
});

const shimmer = keyframes({
  '0%': { backgroundPosition: '-400px 0' },
  '100%': { backgroundPosition: '400px 0' },
});

const pulse = keyframes({
  '0%': { opacity: 0.6 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.6 },
});

export const skeletonRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  padding: '8px 16px',
  flexShrink: 0,
});

export const skeletonAvatar = style({
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  flexShrink: 0,
  backgroundImage: `linear-gradient(90deg, ${vars.color.bgTertiary} 25%, ${vars.color.bgHover} 50%, ${vars.color.bgTertiary} 75%)`,
  backgroundSize: '800px 100%',
  animationName: shimmer,
  animationDuration: '1.4s',
  animationTimingFunction: 'linear',
  animationIterationCount: 'infinite',
});

export const skeletonLines = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  paddingTop: '4px',
});

export const skeletonLine = style({
  height: '12px',
  borderRadius: '6px',
  backgroundImage: `linear-gradient(90deg, ${vars.color.bgTertiary} 25%, ${vars.color.bgHover} 50%, ${vars.color.bgTertiary} 75%)`,
  backgroundSize: '800px 100%',
  animationName: shimmer,
  animationDuration: '1.4s',
  animationTimingFunction: 'linear',
  animationIterationCount: 'infinite',
});
export const predecessorNotice = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '12px 16px',
  fontSize: chatSize(0.82),
  color: vars.color.textMuted,
  textAlign: 'center',
  flexShrink: 0,
  borderBottom: `1px solid ${vars.color.border}`,
});

export const predecessorNoticeBtn = style({
  background: 'none',
  border: 'none',
  color: vars.color.accent,
  cursor: 'pointer',
  fontSize: chatSize(0.82),
  fontWeight: 600,
  fontFamily: 'inherit',
  padding: 0,
  textDecoration: 'underline',
  whiteSpace: 'nowrap',
});

export const timelineStart = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '6px',
  padding: '24px 16px 8px',
  color: vars.color.textMuted,
  fontSize: chatSize(0.82),
  textAlign: 'center',
  flexShrink: 0,
  userSelect: 'none',
});

export const timelineStartIcon = style({
  width: '40px',
  height: '40px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: '4px',
  color: vars.color.textMuted,
});

export const timelineStartTitle = style({
  fontWeight: 600,
  fontSize: chatSize(0.88),
  color: vars.color.textSecondary,
});

const spin = keyframes({ to: { transform: 'rotate(360deg)' } });
export const spinner = style({
  width: '24px',
  height: '24px',
  border: `2px solid ${vars.color.border}`,
  borderTopColor: vars.color.accent,
  borderRadius: '50%',
  animationName: spin,
  animationDuration: '0.8s',
  animationTimingFunction: 'linear',
  animationIterationCount: 'infinite',
});

export const dateSeparator = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '12px 16px 4px',
  fontSize: chatSize(0.78),
  color: vars.color.textMuted,
  fontWeight: 600,
  letterSpacing: '0.04em',
  '::before': { content: '""', flex: 1, height: '1px', backgroundColor: vars.color.border },
  '::after': { content: '""', flex: 1, height: '1px', backgroundColor: vars.color.border },
});

export const msgAvatarCol = style({
  flexShrink: 0,
  width: '36px',
  display: 'flex',
  justifyContent: 'center',
  paddingTop: '2px',
});

export const msgRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  padding: `${chatSpace(6)} 16px ${chatSpace(2)}`,
  position: 'relative',
  containerType: 'inline-size',
});

export const msgRowGrouped = style([
  msgRow,
  { paddingTop: chatSpace(1), paddingBottom: chatSpace(1) },
]);

export const msgRowActive = style({
  zIndex: 1,
});

// Hover highlight region wrapping avatar + message body; the read-receipts column sits to its right
// so the highlight stops at the box edge. Highlighting also triggers from a row hover (e.g. moving
// the pointer over the receipts column) so the toolbar and the highlight stay in sync.
export const msgHoverRegion = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  flex: 1,
  minWidth: 0,
  position: 'relative',
  borderRadius: '12px',
  selectors: {
    '&:hover': { backgroundColor: vars.color.bgHover },
    [`${msgRow}:hover &`]: { backgroundColor: vars.color.bgHover },
    [`${msgRowGrouped}:hover &`]: { backgroundColor: vars.color.bgHover },
  },
});

// Sender name + timestamp row (sits above the first message content)
export const msgMeta = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  flexWrap: 'wrap',
});
export const msgSender = style({
  font: 'inherit',
  fontWeight: 600,
  fontSize: chatSize(0.95),
  lineHeight: 1.15,
  color: vars.color.textPrimary,
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  padding: 0,
  ':hover': { textDecoration: 'underline' },
});
export const msgTime = style({
  color: vars.color.textMuted,
  fontSize: chatSize(0.72),
  opacity: 0,
  transition: `opacity ${fast}`,
  selectors: {
    [`${msgRow}:hover &`]: { opacity: 1 },
    [`${msgRowGrouped}:hover &`]: { opacity: 1 },
  },
});

export const msgBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  flex: 1,
  minWidth: 0,
  paddingRight: '12px',
});

export const msgContent = style({
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  fontSize: chatSize(0.95),
  lineHeight: '1.375',
  wordBreak: 'break-word',
  position: 'relative',
  display: 'inline',
});

// Grouped follow-up: content only, already indented by avatar spacer
export const msgContentGrouped = style([
  msgContent,
  {
    display: 'inline-flex',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: '0 6px',
    maxWidth: '100%',
  },
]);

// Classic variant: same baseline structure, message content rendered inside bubbles.
const msgBubbleBase = {
  backgroundColor: vars.color.msgOtherBg,
  padding: '7px 12px',
  borderRadius: '12px',
};

export const msgContentClassic = style([
  msgContent,
  msgBubbleBase,
  { display: 'inline-block', alignSelf: 'flex-start' },
]);

export const msgContentClassicOwn = style([
  msgContentClassic,
  { backgroundColor: vars.color.msgMineBg },
]);

export const msgContentClassicGrouped = style([
  msgContentGrouped,
  msgBubbleBase,
  { alignSelf: 'flex-start' },
]);

export const msgContentClassicGroupedOwn = style([
  msgContentClassicGrouped,
  { backgroundColor: vars.color.msgMineBg },
]);

export const mediaBox = style({
  position: 'relative',
  overflow: 'hidden',
  width: '100%',
  maxWidth: '320px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.border,
  selectors: {
    [`${msgContentClassic} &, ${msgContentClassicOwn} &, ${msgContentClassicGrouped} &, ${msgContentClassicGroupedOwn} &`]:
      {
        width: '320px',
      },
  },
});

export const stickerBox = style({
  position: 'relative',
  overflow: 'hidden',
  width: '152px',
  borderRadius: vars.radius.sm,
});

export const mediaBoxPulse = style({
  position: 'absolute',
  inset: 0,
  animation: `${pulse} 1.5s ease-in-out infinite`,
  selectors: {
    [`${stickerBox} &`]: {
      backgroundColor: vars.color.border,
    },
  },
});

export const stickerPulseGlyph = style({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  color: vars.color.textMuted,
});

export const mediaBoxFillWrap = style({
  position: 'absolute',
  inset: 0,
  display: 'block',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
});

export const mediaFill = style({
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  display: 'block',
});

export const mediaClickable = style({
  cursor: 'pointer',
  border: 'none',
  padding: 0,
  background: 'none',
  textAlign: 'initial',
});

export const videoExpandBtn = style({
  position: 'absolute',
  top: '8px',
  right: '8px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '30px',
  height: '30px',
  borderRadius: vars.radius.sm,
  border: 'none',
  backgroundColor: 'rgba(0,0,0,0.5)',
  color: '#fff',
  cursor: 'pointer',
  zIndex: 1,
  transition: `background-color ${fast}`,
  ':hover': {
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
  },
});

export const msgAudioSkeleton = style({
  width: '280px',
  height: '56px',
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.border,
  animation: `${pulse} 1.5s ease-in-out infinite`,
});

export const mediaWrap = style({
  display: 'block',
  width: '100%',
});

export const mediaCaption = style({
  display: 'block',
  color: vars.color.textPrimary,
  fontSize: chatSize(0.9),
  lineHeight: '1.5',
  wordBreak: 'break-word',
  marginTop: '4px',
});

export const mediaError = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  maxWidth: '320px',
  padding: '4px 0',
  fontSize: chatSize(0.85),
  color: vars.color.textMuted,
});

export const mediaSpoilerOverlay = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  width: '100%',
  height: '100%',
  border: 'none',
  padding: '12px',
  cursor: 'pointer',
  backgroundColor: 'rgba(0, 0, 0, 0.55)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  transition: 'background-color 0.2s ease',
  ':hover': {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: '2px',
  },
});

export const mediaSpoilerChip = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 10px',
  borderRadius: '999px',
  lineHeight: '20px',
  fontSize: chatSize(0.72),
  fontWeight: 600,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: '#fff',
  backgroundColor: 'rgba(0, 0, 0, 0.45)',
  userSelect: 'none',
});

export const mediaSpoilerReason = style({
  maxWidth: '100%',
  fontSize: chatSize(0.78),
  lineHeight: '1.4',
  color: 'rgba(255, 255, 255, 0.85)',
  textAlign: 'center',
  wordBreak: 'break-word',
});

export const animatedImageFill = style({
  position: 'relative',
  display: 'block',
  width: '100%',
  height: '100%',
});

export const animatedImageBadge = style({
  position: 'absolute',
  top: '6px',
  left: '6px',
  zIndex: 1,
  padding: '0 6px',
  lineHeight: '18px',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.5px',
  color: '#fff',
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  borderRadius: '6px',
  pointerEvents: 'none',
  userSelect: 'none',
});

export const gallery = style({
  display: 'grid',
  gap: '4px',
  maxWidth: '400px',
  width: '100%',
  borderRadius: '12px',
  padding: '2px',
  selectors: {
    [`${msgContentClassic} &, ${msgContentClassicOwn} &, ${msgContentClassicGrouped} &, ${msgContentClassicGroupedOwn} &`]:
      {
        width: '400px',
      },
  },
});

export const galleryTile = style({
  position: 'relative',
  overflow: 'hidden',
  border: 'none',
  padding: 0,
  margin: 0,
  display: 'block',
  minHeight: 0,
  minWidth: 0,
  width: '100%',
  borderRadius: '8px',
  backgroundColor: vars.color.border,
  cursor: 'zoom-in',
  ':hover': {
    filter: 'brightness(1.08)',
  },
});

export const galleryTileImg = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
  userSelect: 'none',
});

export const galleryTileSkeleton = style({
  width: '100%',
  height: '100%',
  minHeight: '48px',
  backgroundColor: vars.color.border,
  animation: `${pulse} 1.5s ease-in-out infinite`,
});

export const galleryMore = style([
  galleryTile,
  {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: chatSize(1.1),
    fontWeight: 600,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    cursor: 'zoom-in',
    ':hover': {
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
    },
  },
]);

export const fileCard = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  maxWidth: '320px',
  padding: '8px 10px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  selectors: {
    [`${msgContentClassic} &, ${msgContentClassicOwn} &, ${msgContentClassicGrouped} &, ${msgContentClassicGroupedOwn} &`]:
      { width: '320px' },
  },
});

export const fileIcon = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  flexShrink: 0,
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.accent,
});

export const fileInfo = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '2px',
  flex: 1,
  minWidth: 0,
});

export const fileName = style({
  fontSize: chatSize(0.9),
  fontWeight: 500,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const fileSize = style({
  fontSize: chatSize(0.78),
  color: vars.color.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const fileDownload = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  flexShrink: 0,
  borderRadius: vars.radius.sm,
  color: vars.color.textMuted,
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

globalStyle(`${fileCard} a, ${fileCard} a:hover`, {
  textDecoration: 'none',
});

export const fileSkeleton = style([
  fileCard,
  {
    color: vars.color.accent,
    opacity: 0.5,
    animation: `${pulse} 1.5s ease-in-out infinite`,
  },
]);

export const loadingText = style({
  opacity: 0.5,
  fontSize: chatSize(0.8),
});

export const emoteMsg = style({
  color: 'inherit',
  opacity: 0.85,
});

export const actionsVisible = style({
  display: 'flex',
});

const editedMarkerBase = {
  fontSize: chatSize(0.72),
  color: vars.color.textMuted,
  fontStyle: 'italic',
  whiteSpace: 'nowrap',
  padding: 0,
  border: 'none',
  background: 'none',
  fontFamily: 'inherit',
  cursor: 'pointer',
  ':hover': { textDecoration: 'underline' },
} as const;

// Inline next to the sender name, revealed on row hover
export const editedMarkerHeader = style([
  editedMarkerBase,
  {
    opacity: 0,
    transition: `opacity ${fast}`,
    selectors: {
      [`${msgRow}:hover &`]: { opacity: 1 },
      [`${msgRowGrouped}:hover &`]: { opacity: 1 },
    },
  },
]);

// Sits inside grouped content next to the message text, revealed on row hover
export const editedMarkerGrouped = style([
  editedMarkerBase,
  {
    lineHeight: '1.375',
    alignSelf: 'flex-end',
    flexShrink: 0,
    opacity: 0,
    transition: `opacity ${fast}`,
    selectors: {
      [`${msgRow}:hover &`]: { opacity: 1 },
      [`${msgRowGrouped}:hover &`]: { opacity: 1 },
    },
  },
]);

// Same spot but always visible (classic variant)
export const editedMarkerGroupedClassic = style([
  editedMarkerBase,
  {
    lineHeight: '1.375',
    alignSelf: 'flex-end',
    flexShrink: 0,
  },
]);

export const redactedMsg = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontStyle: 'italic',
  color: vars.color.textMuted,
  fontSize: chatSize(0.85),
});

export const noticeMsg = style({
  color: vars.color.textMuted,
  fontSize: chatSize(0.85),
});

const markdownContentClasses = [
  msgContent,
  msgContentGrouped,
  msgContentClassic,
  msgContentClassicOwn,
  msgContentClassicGrouped,
  msgContentClassicGroupedOwn,
  emoteMsg,
  noticeMsg,
];

const scopedContentSelectors = (children: string): string =>
  children
    .split(',')
    .map((child) => child.trim())
    .flatMap((child) => markdownContentClasses.map((c) => `${c} ${child}`))
    .join(', ');

globalStyle(scopedContentSelectors('ol, ul'), {
  margin: '6px 0',
  paddingLeft: '1.6em',
  listStylePosition: 'outside',
});
globalStyle(scopedContentSelectors('ol'), {
  listStyleType: 'decimal',
});
globalStyle(scopedContentSelectors('ul'), {
  listStyleType: 'disc',
});
globalStyle(scopedContentSelectors('li'), {
  margin: '2px 0',
});
globalStyle(scopedContentSelectors('ol ol, ul ul, ol ul, ul ol'), {
  marginTop: '2px',
  marginBottom: '2px',
});

globalStyle(scopedContentSelectors('h1'), {
  fontSize: '1.4em',
  fontWeight: 600,
  lineHeight: 1.3,
  margin: '8px 0 4px',
});
globalStyle(scopedContentSelectors('h2'), {
  fontSize: '1.28em',
  fontWeight: 600,
  lineHeight: 1.3,
  margin: '8px 0 4px',
});
globalStyle(scopedContentSelectors('h3'), {
  fontSize: '1.16em',
  fontWeight: 600,
  lineHeight: 1.3,
  margin: '8px 0 4px',
});
globalStyle(scopedContentSelectors('h4'), {
  fontSize: '1.06em',
  fontWeight: 600,
  lineHeight: 1.3,
  margin: '8px 0 4px',
});
globalStyle(scopedContentSelectors('h5'), {
  fontSize: '0.98em',
  fontWeight: 600,
  lineHeight: 1.3,
  margin: '8px 0 4px',
});
globalStyle(scopedContentSelectors('h6'), {
  fontSize: '0.9em',
  fontWeight: 600,
  lineHeight: 1.3,
  margin: '8px 0 4px',
  color: vars.color.textMuted,
});
globalStyle(
  scopedContentSelectors(
    'h1:first-child, h2:first-child, h3:first-child, h4:first-child, h5:first-child, h6:first-child'
  ),
  {
    marginTop: 0,
  }
);

globalStyle(scopedContentSelectors('hr'), {
  border: 'none',
  borderTop: `1px solid ${vars.color.border}`,
  margin: '10px 0',
});

globalStyle(scopedContentSelectors('table'), {
  borderCollapse: 'collapse',
  margin: '8px 0',
  maxWidth: '100%',
  display: 'block',
  overflowX: 'auto',
});
globalStyle(scopedContentSelectors('th, td'), {
  border: `1px solid ${vars.color.border}`,
  padding: '4px 8px',
  textAlign: 'left',
});
globalStyle(scopedContentSelectors('th'), {
  backgroundColor: vars.color.bgTertiary,
  fontWeight: 600,
});
globalStyle(scopedContentSelectors('caption'), {
  fontSize: '0.85em',
  color: vars.color.textMuted,
  padding: '4px 0',
  textAlign: 'left',
});

globalStyle(scopedContentSelectors('details'), {
  margin: '6px 0',
});
globalStyle(scopedContentSelectors('summary'), {
  cursor: 'pointer',
  fontWeight: 500,
});

export const locationMsg = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  color: vars.color.textSecondary,
});

export const locationLink = style({
  color: vars.color.accent,
  textDecoration: 'none',
  fontWeight: 500,
  selectors: {
    '&:hover': { textDecoration: 'underline' },
  },
});

export const emojiOnly = style({
  fontSize: chatSize(2.5),
  lineHeight: 1.2,
});

export const replyQuote = style({
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  color: vars.color.textMuted,
  borderLeft: `3px solid ${vars.color.accent}`,
  paddingLeft: '8px',
  marginBottom: '4px',
  fontSize: chatSize(0.95),
  borderRadius: '2px',
  cursor: 'pointer',
  ':hover': {
    color: vars.color.textPrimary,
  },
});

export const replyMediaRow = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  maxWidth: '100%',
  verticalAlign: 'middle',
});

export const replyMediaThumb = style({
  width: '36px',
  height: '36px',
  objectFit: 'cover',
  borderRadius: '4px',
  flexShrink: 0,
  verticalAlign: 'middle',
});

export const replyMediaThumbWrap = style({
  position: 'relative',
  display: 'inline-flex',
  width: '36px',
  height: '36px',
  flexShrink: 0,
  verticalAlign: 'middle',
});

export const replyMediaIcon = style({
  width: '36px',
  height: '36px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '4px',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  color: vars.color.accent,
  flexShrink: 0,
});

export const replyMediaText = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const replyMediaCover = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  height: '20px',
  padding: '0 8px',
  borderRadius: '10px',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textSecondary,
  fontSize: chatSize(0.75),
  fontWeight: 600,
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
  flexShrink: 0,
  verticalAlign: 'middle',
});

export const reactionsBar = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
  marginTop: '4px',
});

export const reactionChip = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: '12px',
  padding: '2px 8px',
  fontSize: chatSize(0.95),
  cursor: 'pointer',
  userSelect: 'none',
  fontFamily: 'inherit',
  color: vars.color.textPrimary,
  transition: `opacity ${fast}, border-color ${fast}, background-color ${fast}`,
  ':hover': { borderColor: vars.color.accent, backgroundColor: vars.color.bgHover },
  animationName: scaleIn,
  animationDuration: '120ms',
  animationTimingFunction: 'ease-out',
  selectors: {
    '[data-hovered="false"] &': { opacity: 0.8 },
    '[data-hovered="true"] &': { opacity: 1 },
  },
});

export const reactionChipOwn = style([
  reactionChip,
  {
    borderColor: vars.color.accent,
    backgroundColor: vars.color.bgActive,
    ':hover': { backgroundColor: vars.color.bgActive, borderColor: vars.color.accentHover },
  },
]);

export const reactionImg = style({
  width: '1.1rem',
  height: '1.1rem',
  verticalAlign: 'middle',
  objectFit: 'contain',
});

const EMOJI_GLYPH_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cpath fill='%238e8ea8' d='M174.92,156c-10.29,17.79-27.39,28-46.92,28s-36.63-10.2-46.93-28a8,8,0,1,1,13.86-8c7.46,12.91,19.2,20,33.07,20s25.61-7.1,33.08-20a8,8,0,1,1,13.84,8ZM232,128a104.35,104.35,0,0,1-4.56,30.56,8,8,0,0,1-2,3.31l-63.57,63.57a7.9,7.9,0,0,1-3.3,2A104,104,0,1,1,232,128Zm-16,0a87.89,87.89,0,1,0-64,84.69L212.69,152A88.05,88.05,0,0,0,216,128ZM92,120a12,12,0,1,0-12-12A12,12,0,0,0,92,120Zm72-24a12,12,0,1,0,12,12A12,12,0,0,0,164,96Z'/%3E%3C/svg%3E";

const inlineEmojiPlaceholder = {
  aspectRatio: '1 / 1',
  borderRadius: '3px',
  backgroundColor: vars.color.border,
  backgroundImage: `url("${EMOJI_GLYPH_URI}")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'center',
  backgroundSize: '65% 65%',
  animation: `${pulse} 1.5s ease-in-out infinite`,
  color: 'transparent',
};

export const inlinePackEmoji = style({
  display: 'inline-block',
  width: 'auto',
  height: '1em',
  verticalAlign: 'middle',
  objectFit: 'contain',
  margin: '0 1px',
  selectors: {
    '&:not([data-media-loaded])': inlineEmojiPlaceholder,
  },
});

globalStyle('img[data-mx-emoticon]', {
  display: 'inline-block',
  width: 'auto',
  height: '1em',
  verticalAlign: 'middle',
  objectFit: 'contain',
  margin: '0 1px',
});

globalStyle('img[data-mx-emoticon]:not([data-media-loaded])', inlineEmojiPlaceholder);

export const reactionQuickAdd = style([
  reactionChip,
  {
    padding: '2px 8px',
    color: vars.color.textMuted,
    opacity: 0,
    transition: `opacity ${fast}, border-color ${fast}, background-color ${fast}`,
    selectors: {
      '[data-hovered="false"] &': { opacity: 0 },
      '[data-hovered="true"] &': { opacity: 1 },
    },
    '@media': {
      '(pointer: coarse)': {
        opacity: 1,
      },
    },
  },
]);

export const reactionQuickAddIconWrap = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const reactionQuickAddPlus = style({
  position: 'absolute',
  top: '-5px',
  right: '-5px',
  fontSize: chatSize(0.55),
  fontWeight: 800,
  lineHeight: 1,
  color: 'inherit',
  backgroundColor: vars.color.bgSecondary,
  borderRadius: '50%',
  width: '8px',
  height: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const msgActions = style({
  position: 'absolute',
  right: '48px',
  top: '-30px',
  gap: '3px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: '3px 5px',
  zIndex: 10,
  '@container': {
    '(max-width: 420px)': {
      right: '12px',
    },
  },
  '@media': {
    [TOUCH_FIRST_QUERY]: { selectors: { '&&': { display: 'none' } } },
  },
});

export const swipeReplyIcon = style({
  position: 'absolute',
  left: '16px',
  top: '50%',
  width: '32px',
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  opacity: 0,
  transform: 'translateY(-50%) scale(0.6)',
  pointerEvents: 'none',
});

export const msgActionBtn = style({
  width: '30px',
  height: '30px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  color: vars.color.textMuted,
  fontSize: chatSize(0.83),
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
});

export const msgActionBtnPinned = style([
  msgActionBtn,
  {
    color: vars.color.accent,
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.accent },
  },
]);

export const editContainer = style({
  borderRadius: '10px',
  border: `2px solid ${vars.color.accent}`,
  backgroundColor: vars.color.bgSecondary,
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  width: '100%',
  maxWidth: '90%',
  alignSelf: 'flex-start',
  position: 'relative',
});

// Slate rich editor inside the inline edit bubble
export const editRichEditor = style({
  width: '100%',
  minHeight: '50px',
  maxHeight: '200px',
  border: 'none',
  outline: 'none',
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  fontFamily: 'inherit',
  fontSize: chatSize(0.95),
  lineHeight: '1.375',
  padding: '4px 0',
  overflowY: 'auto',
  wordBreak: 'break-word',
});

globalStyle(`${editRichEditor} p`, { margin: 0 });
globalStyle(`${editRichEditor} p + p`, { marginTop: '2px' });
globalStyle(`${editRichEditor} blockquote`, {
  margin: '2px 0',
  paddingLeft: '10px',
  borderLeft: `3px solid ${vars.color.accent}`,
  color: vars.color.textMuted,
});
globalStyle(`${editRichEditor} pre`, {
  margin: '2px 0',
  padding: '4px 8px',
  backgroundColor: vars.color.bgTertiary,
  borderRadius: '4px',
  fontFamily: 'monospace',
  fontSize: '0.9em',
  overflowX: 'auto',
});
globalStyle(`${editRichEditor} code`, {
  backgroundColor: vars.color.bgTertiary,
  borderRadius: '3px',
  padding: '1px 4px',
  fontFamily: 'monospace',
  fontSize: '0.9em',
});
globalStyle(`${editRichEditor} a`, {
  color: vars.color.link,
  textDecoration: 'underline',
  cursor: 'pointer',
});
globalStyle(`${editRichEditor} [data-slate-placeholder]`, {
  color: vars.color.textMuted,
  pointerEvents: 'none',
  userSelect: 'none',
});
globalStyle(`${editRichEditor} .mention-pill`, {
  display: 'inline-block',
  backgroundColor: `color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  color: vars.color.accent,
  borderRadius: '4px',
  padding: '0 4px',
  fontSize: '0.9em',
  fontWeight: 600,
  userSelect: 'none',
  cursor: 'default',
});

export const editActions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '6px',
  alignItems: 'center',
});

export const editBtn = style({
  padding: '4px 12px',
  borderRadius: vars.radius.sm,
  fontSize: chatSize(0.82),
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 600,
  transition: `background-color ${fast}`,
});

export const editBtnSave = style([
  editBtn,
  {
    backgroundColor: vars.color.accent,
    color: '#fff',
    ':hover': { backgroundColor: vars.color.accentHover },
    ':disabled': { opacity: 0.5, cursor: 'default' },
  },
]);

export const editBtnCancel = style([
  editBtn,
  {
    backgroundColor: vars.color.bgTertiary,
    color: vars.color.textPrimary,
    ':hover': { backgroundColor: vars.color.bgHover },
  },
]);

export const unreadDivider = style({
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 16px',
});

export const unreadDividerLines = style({
  flex: 1,
  height: '1px',
  backgroundColor: vars.color.accent,
});

export const unreadDividerLabel = style({
  textAlign: 'center',
  fontSize: chatSize(0.75),
  color: vars.color.accent,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  userSelect: 'none',
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
});

export const unreadDividerRight = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const unreadDividerDismiss = style({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  border: 'none',
  backgroundColor: vars.color.accent,
  color: '#fff',
  cursor: 'pointer',
  padding: 0,
  opacity: 0.8,
  ':hover': { opacity: 1 },
});

const fadeIn = keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const scrollToBottomAnchor = style({
  position: 'relative',
  height: 0,
  flexShrink: 0,
});

export const scrollToBottomBtn = style({
  position: 'absolute',
  bottom: '12px',
  right: '20px',
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  backgroundColor: vars.color.accent,
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  fontSize: chatSize(0.9),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10,
  animationName: fadeIn,
  animationDuration: '120ms',
  animationTimingFunction: 'ease-out',
  ':hover': { backgroundColor: vars.color.accentHover },
});

export const tombstoneBanner = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 16px',
  backgroundColor: vars.color.bgTertiary,
  borderBottom: `1px solid ${vars.color.border}`,
  fontSize: chatSize(0.9),
  color: vars.color.textPrimary,
  flexShrink: 0,
});

export const tombstoneBannerText = style({
  flex: 1,
});

export const tombstoneBannerBtn = style({
  padding: '6px 14px',
  borderRadius: vars.radius.sm,
  border: 'none',
  backgroundColor: vars.color.accent,
  color: '#fff',
  fontSize: chatSize(0.85),
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  ':hover': {
    backgroundColor: vars.color.accentHover,
  },
});

export const searchBanner = style({
  padding: '4px 16px',
  fontSize: chatSize(0.8),
  backgroundColor: vars.color.bgAccentGlow1,
  color: vars.color.accent,
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const searchMatchActive = style({
  outline: `2px solid ${vars.color.accent}`,
  outlineOffset: '-2px',
  borderRadius: '4px',
});

const jumpFlashKeyframes = keyframes({
  '0%': { backgroundColor: vars.color.bgActive },
  '100%': { backgroundColor: 'transparent' },
});

export const msgJumpFlash = style({
  selectors: {
    [`&[data-flashing='true']::before`]: {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: '12px',
      pointerEvents: 'none',
      zIndex: 0,
      animationName: jumpFlashKeyframes,
      animationDuration: '1.5s',
      animationTimingFunction: 'ease-out',
      animationFillMode: 'forwards',
    },
  },
});

export const msgLive = style({
  animationName: fadeInUp,
  animationDuration: '120ms',
  animationTimingFunction: 'ease-out',
});

export const systemMsgRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '4px 16px',
  color: vars.color.textMuted,
  fontSize: chatSize(0.82),
  fontStyle: 'italic',
  userSelect: 'none',
});

export const systemMsgText = style({
  textAlign: 'center',
});

export const systemMsgInlineName = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  marginLeft: '4px',
  verticalAlign: 'middle',
});

export const systemMsgName = style({
  font: 'inherit',
  color: 'inherit',
  background: 'none',
  border: 'none',
  padding: 0,
  margin: 0,
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      textDecoration: 'underline',
    },
    '&:focus-visible': {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: '2px',
      borderRadius: '2px',
    },
  },
});

export const callLine = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: `${chatSpace(6)} 16px ${chatSpace(4)}`,
  color: vars.color.textMuted,
  fontSize: chatSize(0.95),
  lineHeight: 1.375,
});

export const callLineIcon = style({
  flexShrink: 0,
  width: '36px',
  display: 'flex',
  justifyContent: 'center',
  color: vars.color.success,
});

export const callLineIconMissed = style([callLineIcon, { color: vars.color.error }]);

export const callLineText = style({
  minWidth: 0,
  wordBreak: 'break-word',
});

export const callLineName = style({
  font: 'inherit',
  fontWeight: 600,
  color: vars.color.textPrimary,
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  ':hover': { textDecoration: 'underline' },
});

export const callLineTime = style({
  fontSize: chatSize(0.72),
  whiteSpace: 'nowrap',
  opacity: 0,
  transition: `opacity ${fast}`,
  selectors: { [`${callLine}:hover &`]: { opacity: 1 } },
});

export const callLineJoin = style({
  padding: '3px 12px',
  borderRadius: vars.radius.sm,
  border: 'none',
  backgroundColor: vars.color.success,
  color: '#fff',
  fontSize: chatSize(0.8),
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  ':hover': {
    filter: 'brightness(1.1)',
  },
});

export const searchEmpty = style({
  padding: '32px 16px',
  textAlign: 'center',
  color: vars.color.textMuted,
  fontSize: chatSize(0.9),
});

globalStyle('blockquote', {
  borderLeft: `2px solid ${vars.color.accent}`,
  paddingLeft: '12px',
  margin: '8px 0',
  color: vars.color.textMuted,
});

globalStyle('code', {
  backgroundColor: vars.color.bgTertiary,
  borderRadius: '4px',
  padding: '1px 5px',
  fontSize: '0.88em',
  fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
});

globalStyle('pre', {
  backgroundColor: vars.color.bgTertiary,
  borderRadius: '6px',
  padding: '12px',
  margin: '8px 0',
  overflowX: 'auto',
  position: 'relative',
});

globalStyle('pre code', {
  backgroundColor: 'transparent',
  borderRadius: 0,
  padding: 0,
  fontSize: '0.85em',
});

export const richHtmlSegment = style({
  display: 'contents',
});

export const codeBlock = style({
  margin: '8px 0',
  borderRadius: '6px',
  overflow: 'hidden',
});

globalStyle(`${codeBlock} pre`, {
  margin: 0,
  borderRadius: 0,
});

export const codeBlockHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '4px 12px',
  backgroundColor: vars.color.bgTertiary,
  borderBottom: `1px solid ${vars.color.border}`,
});

export const codeBlockLabel = style({
  fontSize: chatSize(0.72),
  fontWeight: 600,
  color: vars.color.textMuted,
  textTransform: 'lowercase',
  fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
});

export const codeCopyBtn = style({
  flexShrink: 0,
});

globalStyle('.mention-pill', {
  display: 'inline',
  backgroundColor: `rgba(${vars.color.accentRgb}, 0.18)`,
  color: vars.color.accent,
  borderRadius: '4px',
  padding: '0 4px',
  fontSize: '0.92em',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  userSelect: 'text',
});

globalStyle('.mention-pill:focus-visible', {
  outline: `2px solid ${vars.color.accent}`,
  outlineOffset: '1px',
});

globalStyle('a.mention-pill.room-pill', {
  color: vars.color.accent,
  textDecoration: 'none',
});

globalStyle('a.mention-pill.room-pill:hover', {
  textDecoration: 'underline',
});

globalStyle('.mention-pill-self', {
  backgroundColor: `color-mix(in srgb, ${vars.color.mention} 18%, transparent)`,
  color: vars.color.mention,
});

globalStyle('.room-mention', {
  backgroundColor: `color-mix(in srgb, ${vars.color.mention} 16%, transparent)`,
  color: vars.color.mention,
  borderRadius: '3px',
  padding: '0 2px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
});

globalStyle('.mention-pill.room-mention-pill', {
  backgroundColor: `color-mix(in srgb, ${vars.color.mention} 22%, transparent)`,
  color: vars.color.mention,
});

const bubbleClasses = [
  msgContentClassic,
  msgContentClassicOwn,
  msgContentClassicGrouped,
  msgContentClassicGroupedOwn,
];
const bubbleSelector = (descendant: string) =>
  bubbleClasses.map((c) => `${c} ${descendant}`).join(', ');

// Classic bubbles: other users' pills take the bubble's text colour so they read on any bubble;
// self and room mentions keep the mention colour from the rules above
globalStyle(bubbleSelector('.mention-pill:not(.mention-pill-self):not(.room-mention-pill)'), {
  color: 'inherit',
  backgroundColor: 'color-mix(in srgb, currentColor 14%, transparent)',
});

// Spoiler / content warning - blurred until clicked
globalStyle('[data-mx-spoiler]', {
  filter: 'blur(5px)',
  cursor: 'pointer',
  userSelect: 'none',
  borderRadius: vars.radius.sm,
  transition: 'filter 0.2s ease',
});

globalStyle('[data-mx-spoiler-revealed="true"]', {
  filter: 'none',
  cursor: 'default',
  userSelect: 'auto',
});

// Spoiler reason label - displayed above the blurred content
globalStyle('.spoiler-reason', {
  display: 'block',
  fontSize: chatSize(0.72),
  color: vars.color.textMuted,
  marginBottom: '2px',
});

// Prettified link
globalStyle('a.prettified-link', {
  display: 'inline-grid',
  gridTemplateColumns: 'minmax(0, auto)',
  position: 'relative',
  backgroundColor: `color-mix(in srgb, ${vars.color.link} 12%, transparent)`,
  color: vars.color.link,
  borderRadius: '4px',
  padding: '0 6px',
  fontSize: '0.85em',
  fontWeight: 500,
  textDecoration: 'none',
  lineHeight: '1.6',
  maxWidth: '100%',
  transition: `background-color ${fast}, color ${fast}, text-decoration ${fast}`,
});

globalStyle('a.prettified-link .pretty-text', {
  gridArea: '1 / 1',
  whiteSpace: 'nowrap',
});

globalStyle('a.prettified-link .full-text', {
  gridArea: '1 / 1',
  display: 'none',
});

globalStyle('a.prettified-link:hover', {
  backgroundColor: 'transparent',
  color: vars.color.link,
  textDecoration: 'underline',
});

globalStyle('a.prettified-link:hover .pretty-text', {
  display: 'none',
});

globalStyle('a.prettified-link:hover .full-text', {
  display: 'block',
  whiteSpace: 'normal',
  wordBreak: 'break-all',
  textDecoration: 'underline',
});

globalStyle(bubbleSelector('a'), {
  color: vars.color.textPrimary,
  textDecoration: 'underline',
});
globalStyle(bubbleSelector('a.prettified-link'), {
  border: `1px solid rgba(${vars.color.accentRgb}, 0.25)`,
  color: vars.color.textPrimary,
  textDecoration: 'none',
});
globalStyle(bubbleSelector('a.prettified-link:hover'), {
  backgroundColor: 'transparent',
  color: vars.color.textPrimary,
  textDecoration: 'underline',
});

export const readReceiptRow = style({
  display: 'flex',
  alignItems: 'center',
  alignSelf: 'flex-end',
  flexShrink: 0,
  width: '52px',
  minHeight: '16px',
});

export const readReceiptRowSpaced = style({
  marginTop: 0,
  paddingTop: '2px',
});

export const threadBadge = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  alignSelf: 'flex-start',
  maxWidth: '100%',
  minWidth: 0,
  marginTop: '4px',
  padding: '3px 10px 3px 7px',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  background: vars.color.bgSecondary,
  color: vars.color.textSecondary,
  fontSize: chatSize(0.8125),
  fontFamily: 'inherit',
  lineHeight: 1.35,
  textAlign: 'left',
  cursor: 'pointer',
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgTertiary },
});

export const threadBadgeIconWrap = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

export const threadBadgeDot = style({
  position: 'absolute',
  right: '-2px',
  bottom: '-2px',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: vars.color.accent,
  boxShadow: `0 0 0 2px ${vars.color.bgSecondary}`,
});

export const threadBadgeCount = style({
  flexShrink: 0,
  fontWeight: 600,
  color: vars.color.textPrimary,
  fontVariantNumeric: 'tabular-nums',
});

export const threadBadgeName = style({
  display: 'flex',
  flexShrink: 0,
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const threadBadgeNameText = style({
  maxWidth: '10ch',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const threadBadgeBody = style({
  flex: '1 1 auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: vars.color.textPrimary,
});

export const readReceiptAvatar = style({
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: chatSize(0.55),
  fontWeight: 700,
  color: '#fff',
  flexShrink: 0,
  overflow: 'hidden',
  userSelect: 'none',
  border: `1px solid ${vars.color.bgPrimary}`,
  marginLeft: '-6px',
  ':first-child': { marginLeft: 0 },
  cursor: 'default',
});

export const readReceiptAvatarImg = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  borderRadius: 'inherit',
});

export const readReceiptAvatarMark = style({
  width: '58%',
  height: '58%',
  display: 'block',
  color: '#fff',
});

export const readReceiptOverflow = style({
  fontSize: chatSize(0.6),
  color: vars.color.textMuted,
  marginLeft: '3px',
  marginRight: '2px',
  whiteSpace: 'nowrap',
  userSelect: 'none',
});

export const readReceiptAvatarBtn = style({
  padding: 0,
  border: 'none',
  background: 'none',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
});

export const readReceiptOverflowBtn = style({
  fontSize: chatSize(0.6),
  color: vars.color.textMuted,
  marginLeft: '3px',
  marginRight: '2px',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  padding: 0,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: `color ${fast}`,
  ':hover': { color: vars.color.textPrimary },
});

export const receiptPopoverTitle = style({
  fontSize: chatSize(0.72),
  fontWeight: 600,
  color: vars.color.textMuted,
  letterSpacing: '0.04em',
  padding: '2px 8px',
});

export const receiptPopoverItem = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
});

export const receiptPopoverRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '5px 8px',
  border: 'none',
  background: 'none',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  color: vars.color.textPrimary,
  fontFamily: 'inherit',
  textAlign: 'left',
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const receiptPopoverMeta = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  flex: 1,
});

export const receiptPopoverUserName = style({
  fontSize: chatSize(0.85),
  fontWeight: 500,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const receiptPopoverTime = style({
  fontSize: chatSize(0.72),
  color: vars.color.textMuted,
});

export const msgSending = style({
  opacity: 0.6,
});

export const msgFailed = style({
  opacity: 0.6,
});

export const sendFailedRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexBasis: '100%',
  marginTop: '6px',
  paddingTop: '6px',
  borderTop: `1px solid ${vars.color.error}33`,
  opacity: 1,
  fontSize: chatSize(0.78),
  flexWrap: 'wrap',
});

export const sendFailedIcon = style({
  color: vars.color.error,
  flexShrink: 0,
});

export const sendFailedText = style({
  color: vars.color.error,
  fontSize: chatSize(0.78),
  fontWeight: 500,
});

const failedPill = style({
  fontSize: chatSize(0.72),
  padding: '2px 8px',
  borderRadius: '10px',
  border: `1px solid ${vars.color.border}`,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 600,
  lineHeight: 1.4,
  background: 'none',
  transition: `border-color ${fast}, background-color ${fast}`,
});

export const sendRetryBtn = style([
  failedPill,
  {
    color: vars.color.accent,
    borderColor: vars.color.accent,
    ':hover': { backgroundColor: vars.color.bgActive, borderColor: vars.color.accentHover },
  },
]);

export const sendDiscardBtn = style([
  failedPill,
  {
    color: vars.color.textMuted,
    ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
  },
]);

export const chatDropZone = style({
  position: 'absolute',
  inset: 0,
  backgroundColor: 'rgba(88,101,242,0.12)',
  border: `2px dashed ${vars.color.accent}`,
  borderRadius: '12px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
  color: vars.color.accent,
  fontSize: chatSize(1.2),
  fontWeight: 600,
  zIndex: 200,
  pointerEvents: 'none',
  backdropFilter: 'blur(3px)',
});

const COMPACT_TIME_WIDTH = chatSize(3.4);
const COMPACT_GAP = '8px';
const COMPACT_INDENT = `calc(${COMPACT_TIME_WIDTH} + ${COMPACT_GAP})`;

export const msgRowCompact = style([
  msgRow,
  { paddingTop: chatSpace(1), paddingBottom: chatSpace(1) },
]);

export const compactBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flex: 1,
  minWidth: 0,
  paddingLeft: COMPACT_INDENT,
  paddingRight: '12px',
});

export const compactLine = style({
  display: 'flow-root',
  minWidth: 0,
  color: vars.color.textPrimary,
  fontSize: chatSize(0.95),
  lineHeight: '1.55',
  wordBreak: 'break-word',
});

export const compactHeader = style({
  float: 'left',
  display: 'flex',
  alignItems: 'baseline',
  gap: COMPACT_GAP,
  marginLeft: `calc(-1 * ${COMPACT_INDENT})`,
  marginRight: '6px',
  whiteSpace: 'nowrap',
});

globalStyle(`${compactLine} ${compactHeader} > *`, { lineHeight: 'inherit' });

export const compactTime = style({
  width: COMPACT_TIME_WIDTH,
  flexShrink: 0,
  textAlign: 'right',
  color: vars.color.textMuted,
  fontSize: chatSize(0.72),
  fontVariantNumeric: 'tabular-nums',
});

export const compactText = style({
  display: 'block',
  minWidth: 0,
});

export const compactBlock = style({
  minWidth: 0,
  color: vars.color.textPrimary,
  fontSize: chatSize(0.95),
  lineHeight: '1.55',
});

globalStyle(
  `${compactText} ${codeBlock}, ${compactText} pre, ${compactText} blockquote, ${compactText} table, ${compactText} ul, ${compactText} ol`,
  { clear: 'left' }
);
globalStyle(`${compactText} > div > :not(:first-child)`, { clear: 'left' });

globalStyle(`${compactLine} ${emojiOnly}`, { fontSize: 'inherit', lineHeight: 'inherit' });

globalStyle(`${compactBlock} ${mediaBox}`, { maxWidth: '240px' });
globalStyle(`${compactBlock} ${stickerBox}`, { width: '112px' });
