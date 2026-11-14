import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { EyeIcon } from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { useProfile } from '@/app/data';
import { watchViewersAtom } from './watchTogether';
import * as css from './WatchTogether.css';

function ViewerName({ userId }: { userId: string }) {
  const { data } = useProfile(userId);
  return <div>{data?.displayName || userId}</div>;
}

export function WatchViewers() {
  const { t } = useTranslation();
  const viewers = useAtomValue(watchViewersAtom);
  if (viewers.length === 0) return null;
  return (
    <Tooltip
      content={viewers.map((userId) => (
        <ViewerName key={userId} userId={userId} />
      ))}
    >
      <span
        className={css.viewersChip}
        aria-label={t('call.streamViewers', { count: viewers.length })}
      >
        <EyeIcon size={12} weight="bold" />
        {viewers.length}
      </span>
    </Tooltip>
  );
}
