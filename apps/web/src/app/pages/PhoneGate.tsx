import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoHover } from '@/app/components/AppLoading';
import { Button } from '@/app/components/Button';
import { isDesktop } from '@/bridge/desktop';
import * as css from './PhoneGate.css';

const IS_PHONE =
  !isDesktop &&
  ((navigator as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile ??
    /iPhone|iPod|Android.+Mobile/i.test(navigator.userAgent));

export function PhoneGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  if (!IS_PHONE) return children;

  return (
    <div className={css.page}>
      <div className={css.card}>
        <LogoHover size={72} />
        <h1 className={css.title}>{t('phoneGate.title')}</h1>
        <p className={css.body}>{t('phoneGate.body')}</p>
        <Button
          fullWidth
          size="lg"
          onClick={() => window.location.assign(`${import.meta.env.APP_HOME_URL}/download/#mobile`)}
        >
          {t('phoneGate.getApp')}
        </Button>
      </div>
    </div>
  );
}
