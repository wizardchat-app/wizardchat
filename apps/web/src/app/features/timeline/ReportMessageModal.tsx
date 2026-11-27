import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom } from 'jotai';
import { reportMessageAtom } from '@/app/store/atoms';
import { Button } from '@/app/components/Button';
import { Dialog } from '@/app/components/Dialog/Dialog';
import * as css from './ReportMessageModal.css';

export function ReportMessageModal() {
  const { t } = useTranslation();
  const [state, setState] = useAtom(reportMessageAtom);
  const [reason, setReason] = useState('');

  const open = state.open;
  const isRoom = state.kind === 'room';
  const title = isRoom ? t('room.reportRoomTitle') : t('timeline.reportTitle');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const close = (submit: boolean) => {
    state.resolve?.(submit ? reason.trim() : null);
    setState({ open: false, roomId: '', eventId: '', senderId: '' });
  };

  return (
    <Dialog
      open={open}
      onClose={() => close(false)}
      size="lg"
      zIndex={7000}
      title={title}
      className={css.dialog}
      bodyClassName={css.dialogBody}
      ariaLabel={title}
    >
      <div className={css.infoDesc}>
        {isRoom ? t('room.reportRoomDesc') : t('timeline.reportDesc')}
      </div>

      <textarea
        className={css.reasonInput}
        placeholder={t('common.reasonOptional')}
        aria-label={t('timeline.reportReasonLabel')}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
        data-dialog-autofocus
      />

      <div className={css.footer}>
        <Button variant="secondary" size="sm" onClick={() => close(false)}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" size="sm" onClick={() => close(true)}>
          {isRoom ? t('room.reportRoom') : t('timeline.report')}
        </Button>
      </div>
    </Dialog>
  );
}
