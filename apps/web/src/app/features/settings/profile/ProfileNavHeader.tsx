import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { PencilSimpleIcon } from '@phosphor-icons/react';
import { userIdAtom } from '@/app/store/atoms';
import { Avatar } from '@/app/components/Avatar';
import { useProfile } from '@/app/data';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { formatUserId } from '@/util/matrix';
import * as css from './Profile.css';

export function ProfileNavHeader({
  active = false,
  narrow = false,
  onSelect,
}: {
  active?: boolean;
  narrow?: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const userId = useAtomValue(userIdAtom);
  const { data: user } = useProfile(userId);
  const name = user?.displayName || (userId ? formatUserId(userId) : '');

  return (
    <button
      type="button"
      className={narrow ? css.navProfileNarrow : active ? css.navProfileActive : css.navProfile}
      aria-current={active ? 'page' : undefined}
      onClick={onSelect}
    >
      <Avatar
        name={name}
        mxcUrl={user?.avatarUrl ?? null}
        client={getMatrixClientOrNull()}
        size={narrow ? 'lg' : 'md'}
        placeholder="logo"
      />
      <span className={css.navProfileText}>
        <span className={css.navProfileName}>{name}</span>
        <span className={css.navProfileEdit}>
          {t('profile.editProfile')}
          <PencilSimpleIcon size={12} weight="fill" />
        </span>
      </span>
    </button>
  );
}
