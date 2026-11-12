import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { pulse } from '@/theme/animations.css';
import { imageCard } from '@/app/features/room/roomsettings/RoomSettingsEmojiSticker.css';

export const card = style({
  minWidth: 0,
});

export const emojiBtn = style({
  width: '56px',
  height: '56px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1.75rem',
  lineHeight: 1,
  borderRadius: vars.radius.sm,
  border: 'none',
  backgroundColor: vars.color.bgTertiary,
  cursor: 'pointer',
  selectors: { '&:disabled': { cursor: 'default' } },
});

export const nameInput = style({
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  fontSize: '0.8rem',
  textAlign: 'center',
  border: `1px solid transparent`,
  borderRadius: 4,
  padding: '2px 4px',
  background: 'none',
  color: vars.color.textPrimary,
  outline: 'none',
  ':focus': { borderColor: vars.color.accent, backgroundColor: vars.color.bgInput },
  ':hover': { borderColor: vars.color.border },
});

export const playBtn = style({
  position: 'absolute',
  top: '4px',
  left: '4px',
  width: '22px',
  height: '22px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'rgba(0,0,0,0.5)',
  color: '#fff',
  cursor: 'pointer',
  opacity: 0,
  transition: 'opacity 0.15s',
  selectors: {
    [`${imageCard}:hover &`]: { opacity: 1 },
    '&:focus-visible': { opacity: 1 },
  },
});

export const playing = style({
  opacity: 1,
});

export const skeleton = style({
  borderRadius: vars.radius.sm,
  backgroundColor: vars.color.bgTertiary,
  animation: `${pulse} 1.4s ease-in-out infinite`,
});
