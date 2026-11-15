import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useClient } from '@/app/data';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { useToast } from '@/app/hooks/useToast';
import { useProfile } from '@/app/hooks/useProfile';
import { getErrorMessage } from '@/util/error';
import * as css from '@/app/components/Settings/Settings.css';

export function NicknameSection({ roomId, space }: { roomId: string; space?: boolean }) {
  const { t } = useTranslation();
  const client = useClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { profile } = useProfile();
  const key = ['roomNickname', roomId];
  const { data: current } = useQuery({
    queryKey: key,
    queryFn: () => client.roomNickname(roomId),
  });
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => setValue(current ?? ''), [current]);

  const save = async (name: string) => {
    setSaving(true);
    try {
      if (space) {
        const failed = await client.setSpaceNickname(roomId, name);
        if (failed > 0) toast.error(t('room.nickname.someFailed', { count: failed }));
        else toast.success(t('room.nickname.saved'));
      } else {
        await client.setRoomNickname(roomId, name);
        toast.success(t('room.nickname.saved'));
      }
      setValue(name.trim());
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const dirty = value.trim() !== (current ?? '');

  return (
    <div className={css.section}>
      <Input
        label={t('room.nickname.title')}
        helperText={t(space ? 'room.nickname.spaceNote' : 'room.nickname.roomNote')}
        placeholder={profile?.displayName}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && dirty && !saving) void save(value);
        }}
        maxLength={255}
      />
      {(dirty || current || space) && (
        <div className={css.actions}>
          {dirty && (
            <Button variant="primary" loading={saving} onClick={() => void save(value)}>
              {t('common.save')}
            </Button>
          )}
          {(current || space) && (
            <Button variant="secondary" disabled={saving} onClick={() => void save('')}>
              {t('room.nickname.reset')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
