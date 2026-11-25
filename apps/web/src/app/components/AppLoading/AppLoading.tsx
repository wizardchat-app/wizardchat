import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoLoader } from './LogoLoader';
import * as css from './AppLoading.css';

const CYCLE_MS = 2500;
export const FADE_OUT_MS = 300;

interface Props {
  hiding?: boolean;
}

export function AppLoading({ hiding = false }: Props) {
  const { t } = useTranslation();
  const loaded: unknown = t('loading.messages', { returnObjects: true });
  const messages =
    loaded && typeof loaded === 'object'
      ? Object.values(loaded as Record<string, string>)
      : [String(loaded)];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIdx((i) => (i + 1) % messages.length), CYCLE_MS);
    return () => clearInterval(timer);
  }, [messages.length]);

  return (
    <div className={hiding ? `${css.overlay} ${css.overlayHiding}` : css.overlay}>
      <LogoLoader />
      <p className={css.text}>{messages[idx]}</p>
    </div>
  );
}
