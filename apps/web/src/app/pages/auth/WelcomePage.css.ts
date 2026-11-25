import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/vars.css';
import { TITLE_BAR_HEIGHT } from '@/app/components/TitleBar/TitleBar.css';

export const page = style({
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '24px',
  backgroundColor: vars.color.bgPrimary,
  selectors: {
    'html.desktop &': {
      paddingTop: `${24 + TITLE_BAR_HEIGHT}px`,
    },
  },
  padding: '24px',
});

export const container = style({
  width: '100%',
  maxWidth: '420px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
  backgroundColor: vars.color.bgSecondary,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  padding: '40px 32px',
  margin: 'auto 0',
});

export const logo = style({
  width: '72px',
  height: '72px',
  objectFit: 'contain',
});

export const title = style({
  fontSize: '1.5rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
  textAlign: 'center',
});

export const tagline = style({
  color: vars.color.textMuted,
  fontSize: '0.9rem',
  textAlign: 'center',
  marginBottom: '8px',
});

export const footer = style({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: '6px 20px',
});

export const footerLink = style({
  fontSize: '0.8rem',
  color: vars.color.textMuted,
  textDecoration: 'none',
  ':hover': {
    color: vars.color.textPrimary,
  },
});

export const formSection = style({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const formTitle = style({
  fontSize: '1.1rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const serverGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const divider = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  color: vars.color.textMuted,
  fontSize: '0.85rem',
  '::before': {
    content: '""',
    flex: 1,
    height: '1px',
    backgroundColor: vars.color.border,
  },
  '::after': {
    content: '""',
    flex: 1,
    height: '1px',
    backgroundColor: vars.color.border,
  },
});

export const idpIcon = style({
  width: '18px',
  height: '18px',
  objectFit: 'contain',
});

export const checkingServer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  minHeight: '120px',
  color: vars.color.textMuted,
  fontSize: '0.9rem',
});

export const statusText = style({
  fontSize: '0.85rem',
  color: vars.color.error,
  textAlign: 'center',
  minHeight: '20px',
});

export const statusSuccess = style([statusText, { color: vars.color.success }]);

export const infoText = style({
  fontSize: '0.85rem',
  color: vars.color.textMuted,
  textAlign: 'center',
  minHeight: '20px',
});

export const switchText = style({
  fontSize: '0.85rem',
  color: vars.color.textMuted,
  textAlign: 'center',
});

export const switchLink = style({
  color: vars.color.accent,
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  padding: 0,
  font: 'inherit',
  ':hover': {
    textDecoration: 'underline',
  },
});

export const passwordReqs = style({
  fontSize: '0.8rem',
  color: vars.color.textMuted,
  paddingLeft: '4px',
});

export const reqItem = style({
  lineHeight: '1.6',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
});

export const strength = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginTop: '-4px',
  paddingLeft: '2px',
  fontSize: '0.8rem',
  color: vars.color.textMuted,
});

export const strengthBars = style({
  display: 'flex',
  gap: '4px',
  flex: 1,
});

export const strengthBar = style({
  flex: 1,
  height: '4px',
  borderRadius: '2px',
  backgroundColor: vars.color.border,
  transition: 'background-color 0.2s',
});

export const strengthBarWeak = style([strengthBar, { backgroundColor: vars.color.error }]);
export const strengthBarOkay = style([strengthBar, { backgroundColor: vars.color.warning }]);
export const strengthBarStrong = style([strengthBar, { backgroundColor: vars.color.success }]);

export const backButton = style({
  position: 'absolute',
  top: '24px',
  left: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 12px',
  border: 'none',
  borderRadius: vars.radius.sm,
  background: 'none',
  color: vars.color.textMuted,
  fontSize: '0.9rem',
  fontWeight: 500,
  cursor: 'pointer',
  ':hover': {
    color: vars.color.textPrimary,
    backgroundColor: vars.color.bgHover,
  },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: '2px',
  },
  selectors: {
    'html.desktop &': {
      top: `${24 + TITLE_BAR_HEIGHT}px`,
    },
  },
});
