import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MonitorIcon } from '@phosphor-icons/react';
import { Modal } from '@/app/components/Modal';
import { useSourcePicker } from './useSourcePicker';

export function DesktopSourcePicker() {
  const { t } = useTranslation();
  const api = window.desktopAPI;
  const [open, setOpen] = useState(false);
  const picker = useSourcePicker((choice) => {
    setOpen(false);
    api?.selectDesktopSource?.(choice);
  });
  const { load } = picker;

  useEffect(() => {
    if (!api?.onOpenDesktopPicker || !api.getDesktopSources) return undefined;
    return api.onOpenDesktopPicker(() => {
      load();
      setOpen(true);
    });
  }, [api, load]);

  if (!api?.selectDesktopSource) return null;

  return (
    <Modal
      open={open}
      onClose={() => picker.finish(null)}
      size="lg"
      title={t('desktopPicker.title')}
      titleIcon={<MonitorIcon size={18} />}
      footer={picker.footer}
    >
      {picker.body}
    </Modal>
  );
}
