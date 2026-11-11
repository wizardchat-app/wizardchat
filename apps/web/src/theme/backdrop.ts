import { vars } from './vars.css';

export const backdrop = (level: 'primary' | 'secondary') => ({
  background: `var(--wz-backdrop-${level}, ${level === 'primary' ? vars.color.bgPrimary : vars.color.bgSecondary})`,
  backgroundAttachment: 'fixed',
});
