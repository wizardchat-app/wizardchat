import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MessageVersion, WizardClient } from '@wizardchat/core';
import { ClockCounterClockwiseIcon } from '@phosphor-icons/react';
import { Modal } from '@/app/components/Modal';
import { markdownToHtml, plainTextToHtml } from '@/util/markdownToHtml';
import { formatDateLabel, formatTime } from '@/util/format';
import * as css from './EditHistoryModal.css';

interface EditHistoryModalProps {
  roomId: string;
  eventId: string | null;
  client: WizardClient;
  onClose: () => void;
}

export function EditHistoryModal({ roomId, eventId, client, onClose }: EditHistoryModalProps) {
  const { t, i18n } = useTranslation();
  const [versions, setVersions] = useState<MessageVersion[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setVersions(null);
    setFailed(false);
    if (!eventId) return;
    let cancelled = false;
    client
      .editHistory(roomId, eventId)
      .then((list) => !cancelled && setVersions(list))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [client, roomId, eventId]);

  const newestFirst = versions ? [...versions].reverse() : [];

  return (
    <Modal
      open={!!eventId}
      onClose={onClose}
      title={t('timeline.editHistory')}
      titleIcon={<ClockCounterClockwiseIcon size={18} />}
      size="lg"
    >
      {failed ? (
        <p className={css.status}>{t('timeline.editHistoryFailed')}</p>
      ) : !versions ? (
        <p className={css.status}>{t('common.loading')}</p>
      ) : (
        <div className={css.list}>
          {newestFirst.map((version, index) => {
            const isOriginal = index === newestFirst.length - 1;
            const isCurrent = index === 0;
            const html = version.html
              ? markdownToHtml(version.html, undefined, false, false, true)
              : plainTextToHtml(version.body, undefined, false);
            return (
              <div key={version.eventId} className={css.version}>
                <div className={css.meta}>
                  {(isCurrent || isOriginal) && (
                    <span className={css.label}>
                      {t(
                        isCurrent ? 'timeline.editHistoryCurrent' : 'timeline.editHistoryOriginal'
                      )}
                    </span>
                  )}
                  <span>
                    {formatDateLabel(version.timestamp, t, i18n.language)}{' '}
                    {formatTime(version.timestamp, i18n.language)}
                  </span>
                </div>
                <div className={css.body} dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
