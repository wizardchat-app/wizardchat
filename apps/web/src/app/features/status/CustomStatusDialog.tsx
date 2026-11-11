import { useEffect, useRef, useState } from 'react';
import { SmileyIcon, XIcon } from '@phosphor-icons/react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/app/components/Modal/Modal';
import { Button, IconButton } from '@/app/components/Button';
import { Input } from '@/app/components/Input/Input';
import { Select } from '@/app/components/Select';
import { Field } from '@/app/components/Field';
import { emojiPickerAtom, ownCustomStatusAtom } from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import {
  clearAfterOf,
  customStatusDialogOpenAtom,
  expiryFor,
  isExpired,
  joinStatusEmoji,
  MAX_STATUS_LENGTH,
  splitStatusEmoji,
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

  const [emoji, setEmoji] = useState('');
  const [text, setText] = useState('');
  const [clearAfter, setClearAfter] = useState<ClearAfter>('today');
  const [picker, setPicker] = useAtom(emojiPickerAtom);
  const pickerOpen = !!picker?.unicodeOnly;
  const inputRef = useRef<HTMLInputElement>(null);
  const client = getMatrixClientOrNull();

  const active = current && !isExpired(current) ? current : null;

  useEffect(() => {
    if (!open) return;
    const split = splitStatusEmoji(active?.text ?? '');
    setEmoji(split.emoji);
    setText(split.rest);
    setClearAfter(clearAfterOf(active));
  }, [open]);

  const close = () => {
    if (pickerOpen) setPicker(null);
    setOpen(false);
  };
  const save = () => {
    const full = joinStatusEmoji(emoji, text);
    setStatus(full ? { text: full, expiresAt: expiryFor(clearAfter) } : null);
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
      trapPaused={pickerOpen}
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
        <Field label={t('status.whatsUp')} htmlFor="custom-status-text">
          <div className={css.inputRow}>
            <div className={css.emojiSlot}>
              <IconButton
                size="md"
                active={pickerOpen}
                tooltip={emoji ? t('status.changeEmoji') : t('status.addEmoji')}
                aria-label={emoji ? t('status.changeEmoji') : t('status.addEmoji')}
                aria-expanded={pickerOpen}
                onClick={(e) => {
                  if (!client) return;
                  if (pickerOpen) {
                    setPicker(null);
                    return;
                  }
                  setPicker({
                    anchor: e.currentTarget,
                    client,
                    roomId: '',
                    unicodeOnly: true,
                    placement: 'left-start',
                    onPick: (picked, mxcUrl) => {
                      if (!mxcUrl) setEmoji(picked);
                      setPicker(null);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    },
                  });
                }}
              >
                {emoji ? <span className={css.emoji}>{emoji}</span> : <SmileyIcon size={20} />}
              </IconButton>
              {emoji && (
                <button
                  type="button"
                  className={css.emojiRemove}
                  aria-label={t('status.removeEmoji')}
                  onClick={() => setEmoji('')}
                >
                  <XIcon size={10} weight="bold" />
                </button>
              )}
            </div>
            <div className={css.inputGrow}>
              <Input
                ref={inputRef}
                id="custom-status-text"
                placeholder={t('status.placeholder')}
                value={text}
                maxLength={MAX_STATUS_LENGTH - (emoji ? emoji.length + 1 : 0)}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                data-dialog-autofocus
              />
            </div>
          </div>
        </Field>
        <Field label={t('status.clearAfter')}>
          <Select value={clearAfter} options={options} onChange={setClearAfter} />
        </Field>
      </div>
    </Modal>
  );
}
