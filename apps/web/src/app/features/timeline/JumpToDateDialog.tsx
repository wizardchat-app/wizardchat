import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { Modal } from '@/app/components/Modal/Modal';
import { Button } from '@/app/components/Button/Button';
import { Input } from '@/app/components/Input/Input';
import { getErrorMessage } from '@/util/error';

const dateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

interface Props {
  client: MatrixClient;
  roomId: string;
  open: boolean;
  onClose: () => void;
  onJump: (eventId: string) => void;
}

export function JumpToDateDialog({ client, roomId, open, onClose, onJump }: Props) {
  const { t } = useTranslation();
  const today = dateValue(new Date());
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(today);
    setError(undefined);
    setBusy(false);
  }, [open, today]);

  const jump = async () => {
    const [year, month, day] = date.split('-').map(Number);
    if (!year || !month || !day) return;
    setBusy(true);
    setError(undefined);
    try {
      const eventId = await client.eventAtTime(roomId, new Date(year, month - 1, day).getTime());
      if (!eventId) {
        setError(t('room.jumpToDate.notFound'));
        return;
      }
      onClose();
      onJump(eventId);
    } catch (err) {
      setError(t('room.jumpToDate.failed', { error: getErrorMessage(err) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('room.jumpToDate.title')}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" size="md" onClick={() => void jump()} disabled={!date || busy}>
            {t('room.jumpToDate.jump')}
          </Button>
        </>
      }
    >
      <Input
        type="date"
        label={t('room.jumpToDate.date')}
        value={date}
        max={today}
        onChange={(e) => {
          setDate(e.target.value);
          setError(undefined);
        }}
        onKeyDown={(e) => e.key === 'Enter' && void jump()}
        error={error}
        data-dialog-autofocus
      />
    </Modal>
  );
}
