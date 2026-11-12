import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { fast } from '@/theme/animations.css';

const CONTROL_BAR_SPACE = 76;
const DISCORD_SPEAKING = '#23a55a';

export const stage = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  padding: `12px 12px ${CONTROL_BAR_SPACE}px`,
  boxSizing: 'border-box',
  overflow: 'hidden',
});

export const stageCompact = style([stage, { padding: '6px' }]);

const AREA_GAP = 8;
const STRIP_HEIGHT = 104;

export const area = style({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: `${AREA_GAP}px`,
  containerType: 'size',
});

export const grid = style({
  flex: 1,
  minHeight: 0,
  width: '100%',
  margin: '0 auto',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  justifyContent: 'center',
  alignContent: 'center',
});

export const gridItem = style({ aspectRatio: '16 / 9', flexShrink: 0 });

export const stageMain = style({
  display: 'flex',
  justifyContent: 'center',
  flexShrink: 0,
});

export const stageFocus = style({
  aspectRatio: '16 / 9',
  width: 'min(100cqw, calc(100cqh * 16 / 9))',
  flexShrink: 0,
});

export const stageFocusWithStrip = style([
  stageFocus,
  { width: `min(100cqw, calc((100cqh - ${STRIP_HEIGHT + AREA_GAP}px) * 16 / 9))` },
]);

export const strip = style({
  display: 'flex',
  justifyContent: 'safe center',
  gap: '8px',
  height: `${STRIP_HEIGHT}px`,
  flexShrink: 0,
  overflowX: 'auto',
});

export const stripItem = style({
  height: '100%',
  aspectRatio: '16 / 9',
  flexShrink: 0,
});

export const tile = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  borderRadius: vars.radius.md,
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: vars.color.bgTertiary,
  selectors: {
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      zIndex: 2,
      borderRadius: 'inherit',
      boxShadow: 'inset 0 0 0 2px transparent',
      transition: `box-shadow ${fast}`,
      pointerEvents: 'none',
    },
  },
});

export const tileScreen = style({ backgroundColor: '#000' });

export const tileSpeaking = style({
  selectors: { '&::after': { boxShadow: `inset 0 0 0 3px ${DISCORD_SPEAKING}` } },
});

export const tileSoundboard = style({
  selectors: { '&::after': { boxShadow: `inset 0 0 0 3px ${vars.color.info}` } },
});

export const tileFocused = style({});

export const tileClickable = style({
  cursor: 'pointer',
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' },
});

export const backdrop = style({
  position: 'absolute',
  inset: 0,
  opacity: 0.85,
});

export const avatar = style({
  position: 'relative',
  display: 'inline-flex',
  borderRadius: '50%',
});

export const video = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  backgroundColor: '#000',
});

export const videoContain = style({ objectFit: 'contain' });

export const mirrored = style({ transform: 'scaleX(-1)' });

export const label = style({
  position: 'absolute',
  left: '8px',
  bottom: '8px',
  maxWidth: 'calc(100% - 16px)',
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  padding: '3px 8px',
  borderRadius: vars.radius.sm,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  color: '#fff',
  fontSize: '0.8rem',
  fontWeight: 600,
});

export const labelName = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const mutedIcon = style({ flexShrink: 0, color: '#f23f43' });

export const liveRow = style({
  position: 'absolute',
  top: '8px',
  left: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
});

export const viewersChip = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '0 7px',
  borderRadius: '999px',
  background: 'rgba(0, 0, 0, 0.6)',
  color: '#ffffff',
  fontSize: '0.68rem',
  fontWeight: 700,
  lineHeight: '18px',
  fontVariantNumeric: 'tabular-nums',
  userSelect: 'none',
});

export const liveBadge = style({
  padding: '0 7px',
  borderRadius: '999px',
  background: '#593695',
  color: '#ffffff',
  fontSize: '0.68rem',
  fontWeight: 700,
  lineHeight: '18px',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  userSelect: 'none',
});

export const keyMissing = style({
  position: 'absolute',
  top: '8px',
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  maxWidth: 'calc(100% - 96px)',
  padding: '3px 9px',
  borderRadius: '999px',
  backgroundColor: 'rgba(0, 0, 0, 0.65)',
  color: '#ffd166',
  fontSize: '0.72rem',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  zIndex: 2,
});

export const badge = style({
  position: 'absolute',
  top: '8px',
  left: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  backgroundColor: 'rgba(0, 0, 0, 0.55)',
  fontSize: '1rem',
});

const pop = keyframes({
  '0%': { transform: 'scale(0.4)', opacity: 0 },
  '20%': { transform: 'scale(1.15)', opacity: 1 },
  '80%': { transform: 'scale(1)', opacity: 1 },
  '100%': { transform: 'scale(1)', opacity: 0 },
});

export const reaction = style({
  position: 'absolute',
  top: '8px',
  right: '10px',
  fontSize: '2rem',
  animation: `${pop} 3s ease-out forwards`,
  pointerEvents: 'none',
});

export const panel = style({
  position: 'absolute',
  left: '50%',
  bottom: `${CONTROL_BAR_SPACE}px`,
  transform: 'translateX(-50%)',
  zIndex: 80,
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '12px',
  minWidth: '280px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
  pointerEvents: 'auto',
});

export const reactionRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
  justifyContent: 'center',
});

export const reactionBtn = style({
  width: '38px',
  height: '38px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'none',
  fontSize: '1.3rem',
  cursor: 'pointer',
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const dockedRow = style({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  alignContent: 'center',
  justifyContent: 'center',
  gap: '16px',
  overflow: 'hidden',
});

export const dockedVideo = style({
  height: 'min(100%, 200px)',
  aspectRatio: '16 / 9',
  flexShrink: 0,
});

export const bubble = style({
  position: 'relative',
  display: 'inline-flex',
  flexShrink: 0,
});

export const bubbleRing = style({
  display: 'inline-flex',
  width: '136px',
  height: '136px',
  overflow: 'hidden',
  borderRadius: '50%',
  boxShadow: '0 0 0 3px transparent',
  transition: `box-shadow ${fast}`,
});

export const bubbleRingSpeaking = style([
  bubbleRing,
  { boxShadow: `0 0 0 3px ${DISCORD_SPEAKING}` },
]);

export const bubbleRingSoundboard = style([
  bubbleRing,
  { boxShadow: `0 0 0 3px ${vars.color.info}` },
]);

export const bubbleMuted = style({
  position: 'absolute',
  right: '6px',
  bottom: '6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
  color: '#f23f43',
  border: `3px solid ${vars.color.bgTertiary}`,
  boxSizing: 'border-box',
});

export const bubbleHand = style({
  position: 'absolute',
  left: '-4px',
  top: '-4px',
  fontSize: '1.1rem',
});

export const bubbleReaction = style([
  reaction,
  { top: '-10px', right: '-14px', fontSize: '1.6rem' },
]);

export const previewHidden = style({
  padding: '0 16px',
  color: 'rgba(255, 255, 255, 0.7)',
  fontSize: '0.85rem',
  textAlign: 'center',
});

export const empty = style({
  margin: 'auto',
  color: vars.color.textMuted,
  fontSize: '0.9rem',
});

export const tileMenuBtn = style({
  position: 'absolute',
  right: '8px',
  bottom: '8px',
  zIndex: 3,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  border: 'none',
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  color: '#fff',
  cursor: 'pointer',
  opacity: 0,
  transition: `opacity ${fast}, background-color ${fast}`,
  ':hover': { backgroundColor: 'rgba(0, 0, 0, 0.8)' },
  ':focus-visible': { opacity: 1, outline: `2px solid ${vars.color.accent}` },
});

globalStyle(`${tile}:hover ${tileMenuBtn}`, { opacity: 1 });

export const tileFullscreenBtn = style([tileMenuBtn, { right: '42px' }]);

export const videoHiddenBadge = style({
  position: 'absolute',
  right: '8px',
  bottom: '8px',
  zIndex: 3,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  color: '#fff',
});

export const tileMenuBtnShifted = style([tileMenuBtn, { right: '42px' }]);
export const tileFullscreenBtnShifted = style([tileMenuBtn, { right: '76px' }]);

globalStyle(`${tile}:fullscreen`, { borderRadius: 0 });
globalStyle(`${tile}:fullscreen ${video}`, { objectFit: 'contain' });

export const watchOverlay = style({
  position: 'absolute',
  inset: 0,
  zIndex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.35)',
});

export const watchBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 16px',
  border: 'none',
  borderRadius: '999px',
  backgroundColor: 'rgba(255, 255, 255, 0.92)',
  color: '#111',
  fontSize: '0.88rem',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
  transition: `transform ${fast}, background-color ${fast}`,
  ':hover': { backgroundColor: '#fff', transform: 'scale(1.04)' },
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' },
});

export const handBtn = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '38px',
  height: '38px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'none',
  color: vars.color.textPrimary,
  cursor: 'pointer',
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const handBtnActive = style([
  handBtn,
  {
    backgroundColor: vars.color.accent,
    color: '#fff',
    ':hover': { backgroundColor: vars.color.accentHover },
  },
]);

export const reactionDivider = style({
  alignSelf: 'stretch',
  width: '1px',
  margin: '4px 4px',
  backgroundColor: vars.color.border,
});

export const userMenu = style({
  position: 'fixed',
  zIndex: 6500,
  width: '220px',
  display: 'flex',
  flexDirection: 'column',
  padding: '6px',
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
});

export const userMenuName = style({
  padding: '6px 8px 4px',
  fontSize: '0.85rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const userMenuRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px',
  minHeight: '36px',
  boxSizing: 'border-box',
});

export const userMenuIcon = style({ flexShrink: 0, color: vars.color.textMuted });

export const userMenuText = style({
  flex: 1,
  minWidth: 0,
  fontSize: '0.88rem',
  color: vars.color.textPrimary,
});

export const volumeRange = style({
  flex: 1,
  minWidth: 0,
  height: '16px',
  margin: 0,
  appearance: 'none',
  background: 'transparent',
  cursor: 'pointer',
  ':disabled': { opacity: 0.4, cursor: 'not-allowed' },
  ':focus-visible': { outline: 'none' },
});

const rangeTrack = {
  height: '4px',
  borderRadius: '2px',
  background: `linear-gradient(to right, ${vars.color.accent} var(--volume, 100%), ${vars.color.border} var(--volume, 100%))`,
};
const rangeThumb = {
  appearance: 'none',
  width: '14px',
  height: '14px',
  marginTop: '-5px',
  borderRadius: '50%',
  border: 'none',
  backgroundColor: '#fff',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
} as const;

globalStyle(`${volumeRange}::-webkit-slider-runnable-track`, rangeTrack);
globalStyle(`${volumeRange}::-moz-range-track`, rangeTrack);
globalStyle(`${volumeRange}::-webkit-slider-thumb`, rangeThumb);
globalStyle(`${volumeRange}::-moz-range-thumb`, { ...rangeThumb, marginTop: 0 });
globalStyle(`${volumeRange}:focus-visible::-webkit-slider-thumb`, {
  boxShadow: `0 0 0 3px rgba(${vars.color.accentRgb}, 0.45)`,
});

export const userMenuDivider = style({
  height: '1px',
  margin: '2px 4px',
  backgroundColor: vars.color.border,
});

export const userMenuItem = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '10px',
  padding: '8px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'none',
  color: vars.color.textPrimary,
  fontSize: '0.88rem',
  textAlign: 'left',
  cursor: 'pointer',
  transition: `background-color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
});

export const bubbleRingSmall = style({ width: '72px', height: '72px' });

const ringPulseKeyframes = keyframes({
  '0%': { boxShadow: `0 0 0 0 rgba(${vars.color.accentRgb}, 0.6)` },
  '70%': { boxShadow: `0 0 0 18px rgba(${vars.color.accentRgb}, 0)` },
  '100%': { boxShadow: `0 0 0 0 rgba(${vars.color.accentRgb}, 0)` },
});

export const ringPulse = style({
  animation: `${ringPulseKeyframes} 1.6s ease-out infinite`,
});

export const calling = style({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '14px',
});

export const callingRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '28px',
});

export const callingStatus = style({
  color: vars.color.textPrimary,
  fontSize: '0.95rem',
  fontWeight: 600,
  textAlign: 'center',
});

const connectingSpin = keyframes({ to: { transform: 'rotate(360deg)' } });

export const connectingSpinner = style({
  flexShrink: 0,
  width: '11px',
  height: '11px',
  borderRadius: '50%',
  border: '2px solid rgba(255, 255, 255, 0.3)',
  borderTopColor: '#fff',
  animation: `${connectingSpin} 0.8s linear infinite`,
});

export const connecting = style({ opacity: 0.5 });

export const bubbleConnecting = style({
  position: 'absolute',
  left: '6px',
  bottom: '6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  backgroundColor: vars.color.bgTertiary,
});

export const soundBtn = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  height: '68px',
  padding: '4px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'none',
  color: vars.color.textPrimary,
  cursor: 'pointer',
  transition: `background-color ${fast}, opacity ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover },
  ':disabled': { opacity: 0.5, cursor: 'default', backgroundColor: 'transparent' },
});

export const soundEmoji = style({
  fontSize: '1.5rem',
  lineHeight: 1,
});

export const soundLabel = style({
  maxWidth: '100%',
  fontSize: '0.75rem',
  textAlign: 'center',
  lineHeight: 1.2,
  overflow: 'hidden',
  overflowWrap: 'anywhere',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
});

export const soundNote = style({
  margin: 0,
  fontSize: '0.75rem',
  color: vars.color.textMuted,
  textAlign: 'center',
});

export const soundFooter = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '6px 10px',
  borderTop: `1px solid ${vars.color.border}`,
});

export const soundSettingsBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  flexShrink: 0,
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'none',
  color: vars.color.textMuted,
  cursor: 'pointer',
  transition: `background-color ${fast}, color ${fast}`,
  ':hover': { backgroundColor: vars.color.bgHover, color: vars.color.textPrimary },
});

export const soundPanel = style({
  width: '352px',
  padding: 0,
  gap: 0,
  overflow: 'hidden',
});

export const soundBody = style({
  height: 'min(300px, 45vh)',
  flex: 'none',
  borderTop: `1px solid ${vars.color.border}`,
});

export const soundNavEmoji = style({
  fontSize: '1rem',
  lineHeight: 1,
});

export const soundSearchRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
});

export const soundVolumePop = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  width: '180px',
  padding: '10px 12px',
});

export const soundVolumeTitle = style({
  fontSize: '0.8rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const soundVolumeAnchor = style({
  display: 'inline-flex',
  flexShrink: 0,
});
