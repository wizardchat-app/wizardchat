import { useEffect, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/app/components/Modal/Modal';
import { Button } from '@/app/components/Button/Button';
import { Input } from '@/app/components/Input/Input';
import { Select } from '@/app/components/Select';
import { Field } from '@/app/components/Field';
import { ownCustomStatusAtom } from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import {
  clearAfterOf,
  customStatusDialogOpenAtom,
  expiryFor,
  isExpired,
  MAX_STATUS_LENGTH,
  useClearAfterOptions,
  useSetCustomStatus,
} from './customStatus';
import type { ClearAfter } from './customStatus';
import * as css from './CustomStatusDialog.css';

export function CustomStatusDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useAtom(customStatusDialogOpenAtom);
  const current = useAtomValue(ownCustomStatusAtom);
  const setStatus = useSetCustomStatus(getMatrixClientOrNull());
  const [text, setText] = useState('');
  const [clearAfter, setClearAfter] = useState<ClearAfter>('today');

  const active = current && !isExpired(current) ? current : null;

  useEffect(() => {
    if (!open) return;
    setText(active?.text ?? '');
    setClearAfter(clearAfterOf(active));
  }, [open]);

  const close = () => setOpen(false);
  const save = () => {
    const trimmed = text.trim();
    setStatus(trimmed ? { text: trimmed, expiresAt: expiryFor(clearAfter) } : null);
    close();
  };

  const options = useClearAfterOptions();

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('status.setCustomStatus')}
      size="sm"
      zIndex={7500}
      footer={
        <>
          {active && (
            <Button
              variant="secondary"
              size="md"
              className={css.clearButton}
              onClick={() => {
                setStatus(null);
                close();
              }}
            >
              {t('status.clearStatus')}
            </Button>
          )}
          <Button variant="secondary" size="md" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" size="md" onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className={css.body}>
        <Input
          label={t('status.whatsUp')}
          placeholder={t('status.placeholder')}
          value={text}
          maxLength={MAX_STATUS_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          data-dialog-autofocus
        />
        <Field label={t('status.clearAfter')}>
          <Select value={clearAfter} options={options} onChange={setClearAfter} />
        </Field>
      </div>
    </Modal>
  );
}
