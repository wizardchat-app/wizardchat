import { useEffect, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/app/components/Modal/Modal';
import { Button } from '@/app/components/Button/Button';
import { Input } from '@/app/components/Input/Input';
import {
  QUEUE_LIMIT,
  parseYouTubeLink,
  watchActionsAtom,
  watchDialogOpenAtom,
  watchingVideoIdAtom,
  youtubeConsentAtom,
} from './watchTogether';
import { fetchPlaylistIds } from './youtube';
import * as css from './WatchTogether.css';

export function WatchTogetherDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useAtom(watchDialogOpenAtom);
  const actions = useAtomValue(watchActionsAtom);
  const setWatching = useSetAtom(watchingVideoIdAtom);
  const setConsent = useSetAtom(youtubeConsentAtom);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLink('');
    setError(undefined);
    setLoading(false);
  }, [open]);

  const close = () => setOpen(false);
  const begin = (videoIds: string[]) => {
    const [first] = videoIds;
    if (!first) return;
    setConsent(true);
    setWatching(first);
    actions?.start(videoIds.slice(0, QUEUE_LIMIT + 1));
    close();
  };

  const start = async () => {
    if (loading) return;
    const parsed = parseYouTubeLink(link);
    if (!parsed) {
      setError(t('call.watchTogether.invalidLink'));
      return;
    }
    if (!parsed.listId) {
      begin([parsed.videoId!]);
      return;
    }
    setLoading(true);
    try {
      const ids = await fetchPlaylistIds(parsed.listId);
      const from = parsed.videoId ? ids.indexOf(parsed.videoId) : -1;
      begin(from > 0 ? [...ids.slice(from), ...ids.slice(0, from)] : ids);
    } catch {
      if (parsed.videoId) begin([parsed.videoId]);
      else setError(t('call.watchTogether.queue.playlistFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open && !!actions}
      onClose={close}
      title={t('call.watchTogether.title')}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => void start()}
            disabled={!link.trim()}
            loading={loading}
          >
            {t('call.watchTogether.start')}
          </Button>
        </>
      }
    >
      <div className={css.dialogBody}>
        <Input
          label={t('call.watchTogether.linkLabel')}
          placeholder="https://www.youtube.com/watch?v=..."
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setError(undefined);
          }}
          onKeyDown={(e) => e.key === 'Enter' && void start()}
          error={error}
          data-dialog-autofocus
        />
        <p className={css.dialogNote}>{t('call.watchTogether.privacyNote')}</p>
      </div>
    </Modal>
  );
}
