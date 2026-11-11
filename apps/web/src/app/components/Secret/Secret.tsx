import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import { streamerModeActiveAtom } from '@/app/store/atoms';
import { IconButton } from '@/app/components/Button';
import * as css from './Secret.css';

export const HIDDEN_TEXT = '••••••••••';

export function Secret({ value, className }: { value: string; className?: string }) {
  const { t } = useTranslation();
  const active = useAtomValue(streamerModeActiveAtom);
  const [shown, setShown] = useState(false);
  if (!active) return <span className={className}>{value}</span>;
  return (
    <span className={css.secret}>
      <span className={className}>{shown ? value : HIDDEN_TEXT}</span>
      <RevealButton
        shown={shown}
        onToggle={() => setShown(!shown)}
        label={t('streamerMode.hidden')}
      />
    </span>
  );
}

export function RevealButton({
  shown,
  onToggle,
  label,
}: {
  shown: boolean;
  onToggle: () => void;
  label?: string;
}) {
  const { t } = useTranslation();
  return (
    <IconButton
      size="xs"
      tooltip={shown ? t('common.hide') : (label ?? t('common.show'))}
      aria-label={shown ? t('common.hide') : t('common.show')}
      onClick={onToggle}
    >
      {shown ? <EyeSlashIcon size={14} /> : <EyeIcon size={14} />}
    </IconButton>
  );
}
