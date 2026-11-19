export interface ThemeLogoTokens {
  logo: {
    p0: string;
    p1: string;
    p2: string;
    p3: string;
    p4: string;
    p5: string;
    hover: string;
    hoverGlow: string;
  };
}

export interface ThemeColorTokens extends ThemeLogoTokens {
  color: {
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    bgInput: string;
    bgHover: string;
    bgActive: string;
    accent: string;
    accentRgb: string;
    accentHover: string;
    link: string;
    textPrimary: string;
    textMuted: string;
    textSecondary: string;
    border: string;
    msgMineBg: string;
    msgOtherBg: string;
    mention: string;
    error: string;
    danger: string;
    success: string;
    warning: string;
    bgAccentGlow1: string;
    bgAccentGlow2: string;
  };
  username: Record<'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'c7' | 'c8', string>;
  radius: { sm: string; md: string; lg: string };
  font: { body: string };
}

const DARK_USERNAME: ThemeColorTokens['username'] = {
  c1: '#4EA8FF',
  c2: '#D66BD1',
  c3: '#2BD4A0',
  c4: '#FF6B92',
  c5: '#FF9A4D',
  c6: '#3FD3D6',
  c7: '#8C87FF',
  c8: '#8FDB4A',
};

const LIGHT_USERNAME: ThemeColorTokens['username'] = {
  c1: '#1F6FD1',
  c2: '#A3329F',
  c3: '#0A8F68',
  c4: '#D23F69',
  c5: '#C75A12',
  c6: '#14898C',
  c7: '#4F49E0',
  c8: '#4A8F12',
};

export const BASE_LOGO: ThemeLogoTokens['logo'] = {
  p0: '#6A329F',
  p1: '#784CC8',
  p2: '#6A329F',
  p3: '#784CC8',
  p4: '#5E3079',
  p5: '#885EE7',
  hover: '#9B75F0',
  hoverGlow: '#9B75F099',
};

const PARROT_LOGO: ThemeLogoTokens['logo'] = {
  p0: '#1E5128',
  p1: '#34743E',
  p2: '#1E5128',
  p3: '#34743E',
  p4: '#123C12',
  p5: '#4BA157',
  hover: '#79C183',
  hoverGlow: '#79C18399',
};

const HALLOW_LOGO: ThemeLogoTokens['logo'] = {
  p0: '#D95B00',
  p1: '#FF7B00',
  p2: '#D95B00',
  p3: '#FF7B00',
  p4: '#993D00',
  p5: '#FF9D00',
  hover: '#FFB84D',
  hoverGlow: '#FFB84D99',
};

const ETHEREAL_LOGO: ThemeLogoTokens['logo'] = {
  p0: '#4F46E5',
  p1: '#6366F1',
  p2: '#4F46E5',
  p3: '#6366F1',
  p4: '#3730A3',
  p5: '#8B8DF7',
  hover: '#A5A7FA',
  hoverGlow: '#A5A7FA99',
};

const PEWTER_LOGO: ThemeLogoTokens['logo'] = {
  p0: '#6D7178',
  p1: '#8E9297',
  p2: '#6D7178',
  p3: '#8E9297',
  p4: '#4E5157',
  p5: '#B5BAC1',
  hover: '#CDD1D7',
  hoverGlow: '#CDD1D799',
};

const UMBRA_LOGO: ThemeLogoTokens['logo'] = {
  p0: '#4752C4',
  p1: '#5865F2',
  p2: '#4752C4',
  p3: '#5865F2',
  p4: '#363E99',
  p5: '#7983F5',
  hover: '#9AA2F8',
  hoverGlow: '#9AA2F899',
};

const ECLIPSE_LOGO: ThemeLogoTokens['logo'] = {
  p0: '#6D3FD6',
  p1: '#8B5CF6',
  p2: '#6D3FD6',
  p3: '#8B5CF6',
  p4: '#4C2A9E',
  p5: '#A78BFA',
  hover: '#C4B1FC',
  hoverGlow: '#C4B1FC99',
};

const GARNET_LOGO: ThemeLogoTokens['logo'] = {
  p0: '#B82A42',
  p1: '#E23D55',
  p2: '#B82A42',
  p3: '#E23D55',
  p4: '#7E1A2C',
  p5: '#F05A70',
  hover: '#F5808F',
  hoverGlow: '#F5808F99',
};

const BLOSSOM_LOGO: ThemeLogoTokens['logo'] = {
  p0: '#B8325F',
  p1: '#D6457A',
  p2: '#B8325F',
  p3: '#D6457A',
  p4: '#7F1F42',
  p5: '#E9729C',
  hover: '#F097B6',
  hoverGlow: '#F097B699',
};

const OPALINE_LOGO: ThemeLogoTokens['logo'] = {
  p0: '#EE97A9',
  p1: '#5BCEFA',
  p2: '#EE97A9',
  p3: '#F5A9B8',
  p4: '#E9EEF2',
  p5: '#5BCEFA',
  hover: '#7DD8FB',
  hoverGlow: '#7DD8FB99',
};

const PRISM_LOGO: ThemeLogoTokens['logo'] = {
  p0: '#008026',
  p1: '#004DFF',
  p2: '#732982',
  p3: '#FF8C00',
  p4: '#FFED00',
  p5: '#E40303',
  hover: '#FF5A5A',
  hoverGlow: '#FF5A5A99',
};

export const THEME_TOKENS: Record<string, ThemeColorTokens> = {
  Carbon: {
    logo: BASE_LOGO,
    color: {
      bgPrimary: '#11111e',
      bgSecondary: '#1c1c30',
      bgTertiary: '#252540',
      bgInput: '#1a1a2e',
      bgHover: 'rgba(255, 255, 255, 0.05)',
      bgActive: 'rgba(88, 101, 242, 0.2)',
      accent: '#5865f2',
      accentRgb: '88, 101, 242',
      accentHover: '#4752c4',
      link: '#4EA8FF',
      textPrimary: '#e8e8f0',
      textMuted: '#8e8ea8',
      textSecondary: '#6d6e82',
      border: '#2e2e50',
      msgMineBg: '#3a3f9e',
      msgOtherBg: '#252540',
      mention: '#f06428',
      error: '#ff6b6b',
      danger: '#b94a48',
      success: '#3ba55d',
      warning: '#ff9d00',
      bgAccentGlow1: 'rgba(88, 101, 242, 0.08)',
      bgAccentGlow2: 'rgba(88, 101, 242, 0.05)',
    },
    username: DARK_USERNAME,
    radius: { sm: '4px', md: '8px', lg: '18px' },
    font: { body: "'Roboto', sans-serif" },
  },
  Parrot: {
    logo: PARROT_LOGO,
    color: {
      bgPrimary: '#0d1117',
      bgSecondary: '#161b22',
      bgTertiary: '#21262d',
      bgInput: '#0d1117',
      bgHover: 'rgba(63, 185, 80, 0.08)',
      bgActive: 'rgba(63, 185, 80, 0.18)',
      accent: '#3fb950',
      accentRgb: '63, 185, 80',
      accentHover: '#56d364',
      link: '#4EA8FF',
      textPrimary: '#e6edf3',
      textMuted: '#8b949e',
      textSecondary: '#6e7681',
      border: '#30363d',
      msgMineBg: '#0f2d1a',
      msgOtherBg: '#1c2128',
      mention: '#f06428',
      error: '#f85149',
      danger: '#f85149',
      success: '#3fb950',
      warning: '#e3a008',
      bgAccentGlow1: 'rgba(63, 185, 80, 0.08)',
      bgAccentGlow2: 'rgba(63, 185, 80, 0.05)',
    },
    username: DARK_USERNAME,
    radius: { sm: '4px', md: '8px', lg: '18px' },
    font: { body: "'Roboto', sans-serif" },
  },
  Hallow: {
    logo: HALLOW_LOGO,
    color: {
      bgPrimary: '#170f07',
      bgSecondary: '#22160c',
      bgTertiary: '#2e1e11',
      bgInput: '#1f140a',
      bgHover: 'rgba(255, 123, 0, 0.08)',
      bgActive: 'rgba(255, 123, 0, 0.18)',
      accent: '#ff7b00',
      accentRgb: '255, 123, 0',
      accentHover: '#ff9d00',
      link: '#4EA8FF',
      textPrimary: '#f2e6da',
      textMuted: '#a88a72',
      textSecondary: '#7d6455',
      border: '#3a2818',
      msgMineBg: '#8f4000',
      msgOtherBg: '#2e1e11',
      mention: '#f06428',
      error: '#ff6b6b',
      danger: '#c0392b',
      success: '#3ba55d',
      warning: '#ff9d00',
      bgAccentGlow1: 'rgba(255, 123, 0, 0.08)',
      bgAccentGlow2: 'rgba(255, 123, 0, 0.05)',
    },
    username: DARK_USERNAME,
    radius: { sm: '4px', md: '8px', lg: '18px' },
    font: { body: "'Roboto', sans-serif" },
  },
  Ethereal: {
    logo: ETHEREAL_LOGO,
    color: {
      bgPrimary: '#ffffff',
      bgSecondary: '#f5f3ff',
      bgTertiary: '#ede9fe',
      bgInput: '#ffffff',
      bgHover: 'rgba(99, 102, 241, 0.07)',
      bgActive: 'rgba(99, 102, 241, 0.14)',
      accent: '#6366f1',
      accentRgb: '99, 102, 241',
      accentHover: '#4f46e5',
      link: '#1F6FD1',
      textPrimary: '#1a1a2e',
      textMuted: '#6b6b8a',
      textSecondary: '#9292b0',
      border: '#e5e3f0',
      msgMineBg: '#ddd9fb',
      msgOtherBg: '#ede9fe',
      mention: '#f06428',
      error: '#dc2626',
      danger: '#b91c1c',
      success: '#16a34a',
      warning: '#d97706',
      bgAccentGlow1: 'rgba(99, 102, 241, 0.08)',
      bgAccentGlow2: 'rgba(99, 102, 241, 0.04)',
    },
    username: LIGHT_USERNAME,
    radius: { sm: '4px', md: '8px', lg: '18px' },
    font: { body: "'Roboto', sans-serif" },
  },
  Pewter: {
    logo: PEWTER_LOGO,
    color: {
      bgPrimary: '#1e1f22',
      bgSecondary: '#2b2d31',
      bgTertiary: '#383a40',
      bgInput: '#232428',
      bgHover: 'rgba(255, 255, 255, 0.04)',
      bgActive: 'rgba(88, 101, 242, 0.2)',
      accent: '#5865f2',
      accentRgb: '88, 101, 242',
      accentHover: '#4752c4',
      link: '#4EA8FF',
      textPrimary: '#dbdee1',
      textMuted: '#949ba4',
      textSecondary: '#80848e',
      border: '#3f4147',
      msgMineBg: '#3c45a5',
      msgOtherBg: '#383a40',
      mention: '#f06428',
      error: '#ff6b6b',
      danger: '#da373c',
      success: '#23a55a',
      warning: '#f0b232',
      bgAccentGlow1: 'rgba(88, 101, 242, 0.06)',
      bgAccentGlow2: 'rgba(88, 101, 242, 0.04)',
    },
    username: DARK_USERNAME,
    radius: { sm: '4px', md: '8px', lg: '18px' },
    font: { body: "'Roboto', sans-serif" },
  },
  Umbra: {
    logo: UMBRA_LOGO,
    color: {
      bgPrimary: '#0b0b0d',
      bgSecondary: '#111114',
      bgTertiary: '#1a1a1f',
      bgInput: '#0e0e11',
      bgHover: 'rgba(255, 255, 255, 0.045)',
      bgActive: 'rgba(88, 101, 242, 0.2)',
      accent: '#5865f2',
      accentRgb: '88, 101, 242',
      accentHover: '#4752c4',
      link: '#4EA8FF',
      textPrimary: '#e3e3e8',
      textMuted: '#8b8b98',
      textSecondary: '#686875',
      border: '#222228',
      msgMineBg: '#2c3280',
      msgOtherBg: '#1a1a1f',
      mention: '#f06428',
      error: '#ff6b6b',
      danger: '#c93b3b',
      success: '#3ba55d',
      warning: '#ff9d00',
      bgAccentGlow1: 'rgba(88, 101, 242, 0.06)',
      bgAccentGlow2: 'rgba(88, 101, 242, 0.04)',
    },
    username: DARK_USERNAME,
    radius: { sm: '4px', md: '8px', lg: '18px' },
    font: { body: "'Roboto', sans-serif" },
  },
  Eclipse: {
    logo: ECLIPSE_LOGO,
    color: {
      bgPrimary: '#000000',
      bgSecondary: '#050507',
      bgTertiary: '#121216',
      bgInput: '#08080a',
      bgHover: 'rgba(255, 255, 255, 0.05)',
      bgActive: 'rgba(139, 92, 246, 0.2)',
      accent: '#8b5cf6',
      accentRgb: '139, 92, 246',
      accentHover: '#7c4dea',
      link: '#4EA8FF',
      textPrimary: '#ececf1',
      textMuted: '#8a8a96',
      textSecondary: '#62626d',
      border: '#1c1c22',
      msgMineBg: '#3b2475',
      msgOtherBg: '#121216',
      mention: '#f06428',
      error: '#ff6b6b',
      danger: '#c93b3b',
      success: '#3ba55d',
      warning: '#ff9d00',
      bgAccentGlow1: 'rgba(139, 92, 246, 0.06)',
      bgAccentGlow2: 'rgba(139, 92, 246, 0.03)',
    },
    username: DARK_USERNAME,
    radius: { sm: '4px', md: '8px', lg: '18px' },
    font: { body: "'Roboto', sans-serif" },
  },
  Garnet: {
    logo: GARNET_LOGO,
    color: {
      bgPrimary: '#140a0c',
      bgSecondary: '#1f0f13',
      bgTertiary: '#2b151a',
      bgInput: '#1a0c10',
      bgHover: 'rgba(226, 61, 85, 0.08)',
      bgActive: 'rgba(226, 61, 85, 0.18)',
      accent: '#e23d55',
      accentRgb: '226, 61, 85',
      accentHover: '#f05a70',
      link: '#4EA8FF',
      textPrimary: '#f3e4e7',
      textMuted: '#b08990',
      textSecondary: '#85636a',
      border: '#3d1d24',
      msgMineBg: '#8a1e30',
      msgOtherBg: '#2b151a',
      mention: '#f06428',
      error: '#ff6b6b',
      danger: '#c0392b',
      success: '#3ba55d',
      warning: '#ff9d00',
      bgAccentGlow1: 'rgba(226, 61, 85, 0.08)',
      bgAccentGlow2: 'rgba(226, 61, 85, 0.05)',
    },
    username: DARK_USERNAME,
    radius: { sm: '4px', md: '8px', lg: '18px' },
    font: { body: "'Roboto', sans-serif" },
  },
  Blossom: {
    logo: BLOSSOM_LOGO,
    color: {
      bgPrimary: '#ffffff',
      bgSecondary: '#fff1f5',
      bgTertiary: '#fde2ea',
      bgInput: '#ffffff',
      bgHover: 'rgba(214, 69, 122, 0.07)',
      bgActive: 'rgba(214, 69, 122, 0.14)',
      accent: '#d6457a',
      accentRgb: '214, 69, 122',
      accentHover: '#bd3568',
      link: '#1F6FD1',
      textPrimary: '#2d1a22',
      textMuted: '#8a6573',
      textSecondary: '#b08a98',
      border: '#f6d5df',
      msgMineBg: '#fbd3e0',
      msgOtherBg: '#fde2ea',
      mention: '#f06428',
      error: '#dc2626',
      danger: '#b91c1c',
      success: '#16a34a',
      warning: '#d97706',
      bgAccentGlow1: 'rgba(214, 69, 122, 0.08)',
      bgAccentGlow2: 'rgba(214, 69, 122, 0.04)',
    },
    username: LIGHT_USERNAME,
    radius: { sm: '4px', md: '8px', lg: '18px' },
    font: { body: "'Roboto', sans-serif" },
  },
  Opaline: {
    logo: OPALINE_LOGO,
    color: {
      bgPrimary: '#ffffff',
      bgSecondary: '#eef8fe',
      bgTertiary: '#fdeaef',
      bgInput: '#ffffff',
      bgHover: 'rgba(31, 138, 192, 0.07)',
      bgActive: 'rgba(31, 138, 192, 0.14)',
      accent: '#1f8ac0',
      accentRgb: '31, 138, 192',
      accentHover: '#1a76a6',
      link: '#C23D6A',
      textPrimary: '#1d2733',
      textMuted: '#6e7f93',
      textSecondary: '#a3b1c0',
      border: '#d6ecf8',
      msgMineBg: '#d5effd',
      msgOtherBg: '#fdeaef',
      mention: '#f06428',
      error: '#dc2626',
      danger: '#b91c1c',
      success: '#16a34a',
      warning: '#d97706',
      bgAccentGlow1: 'rgba(91, 206, 250, 0.12)',
      bgAccentGlow2: 'rgba(245, 169, 184, 0.1)',
    },
    username: LIGHT_USERNAME,
    radius: { sm: '4px', md: '8px', lg: '18px' },
    font: { body: "'Roboto', sans-serif" },
  },
  Prism: {
    logo: PRISM_LOGO,
    color: {
      bgPrimary: '#0e0d12',
      bgSecondary: '#15141b',
      bgTertiary: '#1e1c26',
      bgInput: '#121117',
      bgHover: 'rgba(255, 255, 255, 0.045)',
      bgActive: 'rgba(139, 92, 246, 0.2)',
      accent: '#8b5cf6',
      accentRgb: '139, 92, 246',
      accentHover: '#7643e0',
      link: '#4EA8FF',
      textPrimary: '#e3e3e8',
      textMuted: '#8b8b98',
      textSecondary: '#686875',
      border: '#26232f',
      msgMineBg: '#3b2a6b',
      msgOtherBg: '#1e1c26',
      mention: '#f06428',
      error: '#ff6b6b',
      danger: '#c93b3b',
      success: '#3ba55d',
      warning: '#ff9d00',
      bgAccentGlow1: 'rgba(228, 3, 3, 0.05)',
      bgAccentGlow2: 'rgba(0, 77, 255, 0.05)',
    },
    username: DARK_USERNAME,
    radius: { sm: '4px', md: '8px', lg: '18px' },
    font: { body: "'Roboto', sans-serif" },
  },
};

export const LIGHT_THEMES: ReadonlySet<string> = new Set(['Ethereal', 'Blossom', 'Opaline']);
