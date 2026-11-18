import { useTranslation } from 'react-i18next';
import { QuestionIcon } from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { HELP_URL } from '@/const/links';
import * as css from './HelpButton.css';

export function HelpButton() {
  const { t } = useTranslation();
  const label = t('titleBar.help');

  return (
    <Tooltip placement="bottom" content={label}>
      <a
        href={HELP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={css.button}
        aria-label={label}
      >
        <QuestionIcon size={18} />
      </a>
    </Tooltip>
  );
}
