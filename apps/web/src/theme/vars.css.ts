import { vars as tokens } from '@wizardchat/design-tokens';

/**
 * The WizardChat style contract, backed by the shared design tokens (CSS variables set per
 * theme in themes.css.ts).
 */
export const vars = {
  color: {
    bgPrimary: tokens.color.bg.app,
    bgSecondary: tokens.color.bg.surface,
    bgTertiary: tokens.color.bg.raised,
    bgInput: tokens.color.bg.input,
    bgHover: tokens.color.bg.hover,
    bgActive: tokens.color.bg.active,
    accent: tokens.color.accent.default,
    accentRgb: 'var(--wz-accent-rgb)',
    accentHover: tokens.color.accent.hover,
    link: tokens.color.text.link,
    textPrimary: tokens.color.text.primary,
    textMuted: tokens.color.text.muted,
    textSecondary: tokens.color.text.disabled,
    border: tokens.color.border.default,
    msgMineBg: tokens.color.message.mine,
    msgOtherBg: tokens.color.message.other,
    mention: tokens.color.status.mention,
    error: tokens.color.status.error,
    danger: tokens.color.status.danger,
    success: tokens.color.status.success,
    info: tokens.color.status.info,
    warning: tokens.color.status.warning,
    bgAccentGlow1: tokens.color.accent.glow1,
    bgAccentGlow2: tokens.color.accent.glow2,
  },
  username: {
    c1: tokens.color.username.c1,
    c2: tokens.color.username.c2,
    c3: tokens.color.username.c3,
    c4: tokens.color.username.c4,
    c5: tokens.color.username.c5,
    c6: tokens.color.username.c6,
    c7: tokens.color.username.c7,
    c8: tokens.color.username.c8,
  },
  logo: {
    p0: tokens.color.logo.p0,
    p1: tokens.color.logo.p1,
    p2: tokens.color.logo.p2,
    p3: tokens.color.logo.p3,
    p4: tokens.color.logo.p4,
    p5: tokens.color.logo.p5,
    hover: tokens.color.logo.hover,
    hoverGlow: tokens.color.logo.hoverGlow,
  },
  radius: {
    sm: tokens.radius.sm,
    md: tokens.radius.md,
    lg: tokens.radius.xl,
  },
  font: {
    body: tokens.font.family.body,
  },
} as const;
