import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { Modal } from '@/app/components/Modal/Modal';
import { Button } from '@/app/components/Button/Button';
import { Calendar } from '@/app/components/Calendar';
import { Field } from '@/app/components/Field';
import { getErrorMessage } from '@/util/error';

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

interface Props {
  client: MatrixClient;
  roomId: string;
  open: boolean;
  onClose: () => void;
  onJump: (eventId: string) => void;
}

export function JumpToDateDialog({ client, roomId, open, onClose, onJump }: Props) {
  const { t } = useTranslation();
  const [date, setDate] = useState(startOfToday);
  const [openedAt, setOpenedAt] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(startOfToday());
    setOpenedAt(Date.now());
    setError(undefined);
    setBusy(false);
  }, [open]);

  const jump = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const eventId = await client.eventAtTime(roomId, date.getTime());
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
          <Button variant="primary" size="md" onClick={() => void jump()} disabled={busy}>
            {t('room.jumpToDate.jump')}
          </Button>
        </>
      }
    >
      <Field error={error}>
        <Calendar
          key={openedAt}
          value={date}
          max={new Date()}
          autoFocus
          onChange={(next) => {
            setDate(next);
            setError(undefined);
          }}
          onSubmit={() => void jump()}
        />
      </Field>
    </Modal>
  );
}
