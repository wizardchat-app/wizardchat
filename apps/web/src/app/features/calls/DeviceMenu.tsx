import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  CheckIcon,
  GearIcon,
  MicrophoneIcon,
  SpeakerHighIcon,
  VideoCameraIcon,
} from '@phosphor-icons/react';
import { listDevices as listMediaDevices, type DeviceKind, type NoiseFilter } from '@/call/media';
import { Popover } from '@/app/components/Popover';
import { Toggle } from '@/app/components/Toggle';
import { Tooltip } from '@/app/components/Tooltip';
import {
  callDevicesAtom,
  callSessionAtom,
  callVolumesAtom,
  noiseFilterAtom,
} from '@/app/store/atoms/call';
import { keybindsAtom, pushToTalkEnabledAtom } from '@/app/store/atoms/settings';
import { settingsHighlightAtom, settingsOpenAtom, settingsPageAtom } from '@/app/store/atoms';
import { VolumeSlider } from './VolumeSlider';
import * as css from './DeviceMenu.css';

const HEADINGS: Record<DeviceKind, string> = {
  audioinput: 'call.inputDevice',
  audiooutput: 'call.outputDevice',
  videoinput: 'call.camera',
};

export function useSelectDevice() {
  const session = useAtomValue(callSessionAtom);
  const [saved, setSaved] = useAtom(callDevicesAtom);
  const select = useCallback(
    (kind: DeviceKind, deviceId: string) => {
      setSaved((prev) => ({ ...prev, [kind]: deviceId }));
      void session?.switchDevice(kind, deviceId);
    },
    [session, setSaved]
  );
  const current = useCallback(
    (kind: DeviceKind) => session?.getActiveDevice(kind) ?? saved[kind],
    [session, saved]
  );
  return { select, current };
}

export function useDevices(kinds: DeviceKind[], requestPermissions = true, reloadKey?: unknown) {
  const [devices, setDevices] = useState<Partial<Record<DeviceKind, MediaDeviceInfo[]>>>({});
  const kindsKey = kinds.join(',');
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void Promise.all(
        kindsKey.split(',').map(async (kind) => {
          try {
            return [kind, await listMediaDevices(kind as DeviceKind, requestPermissions)] as const;
          } catch {
            return [kind, []] as const;
          }
        })
      ).then((entries) => {
        if (!cancelled) setDevices(Object.fromEntries(entries));
      });
    };
    load();
    navigator.mediaDevices?.addEventListener('devicechange', load);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener('devicechange', load);
    };
  }, [kindsKey, requestPermissions, reloadKey]);
  return devices;
}

export function useCallVolume(kind: 'input' | 'output') {
  const session = useAtomValue(callSessionAtom);
  const [volumes, setVolumes] = useAtom(callVolumesAtom);
  const set = (value: number) => {
    setVolumes((prev) => ({ ...prev, [kind]: value }));
    if (kind === 'input') void session?.setInputVolume(value);
    else session?.setOutputVolume(value);
  };
  return [volumes[kind], set] as const;
}

function VolumeRow({ kind }: { kind: 'input' | 'output' }) {
  const { t } = useTranslation();
  const [volume, set] = useCallVolume(kind);
  const Icon = kind === 'input' ? MicrophoneIcon : SpeakerHighIcon;
  return (
    <div className={css.volumeRow}>
      <Icon size={16} className={css.volumeIcon} />
      <VolumeSlider
        value={volume}
        max={kind === 'input' ? 2 : 1}
        label={t(kind === 'input' ? 'call.inputVolume' : 'call.outputVolume')}
        onChange={set}
      />
    </div>
  );
}

const FLYOUT_EDGE = 8;
const PSEUDO_DEVICES = new Set(['default', 'communications']);

export function deviceChoices(all: MediaDeviceInfo[], active: string | undefined) {
  const list = all.filter((d) => !PSEUDO_DEVICES.has(d.deviceId));
  const current = active ?? 'default';
  const pseudo = all.find((d) => d.deviceId === current && PSEUDO_DEVICES.has(d.deviceId));
  const resolved = pseudo ? list.find((d) => d.groupId === pseudo.groupId)?.deviceId : current;
  const selected = list.some((d) => d.deviceId === resolved) ? resolved : list[0]?.deviceId;
  return { list, selected };
}

interface Choice {
  value: string;
  label: string;
}

function ChoiceRow({
  heading,
  options,
  selected,
  open,
  onOpen,
  onLeave,
  onSelect,
}: {
  heading: string;
  options: Choice[];
  selected: string | undefined;
  open: boolean;
  onOpen: () => void;
  onLeave: () => void;
  onSelect: (value: string) => void;
}) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const currentName = options.find((o) => o.value === selected)?.label ?? t('call.noDevices');

  useLayoutEffect(() => {
    if (!open || !rowRef.current || !flyoutRef.current) {
      setPosition(null);
      return;
    }
    const row = rowRef.current.getBoundingClientRect();
    const { width, height } = flyoutRef.current.getBoundingClientRect();
    const right = row.right + 4;
    const left =
      right + width + FLYOUT_EDGE <= window.innerWidth
        ? right
        : Math.max(FLYOUT_EDGE, row.left - width - 4);
    const top = Math.max(
      FLYOUT_EDGE,
      Math.min(row.top - 6, window.innerHeight - height - FLYOUT_EDGE)
    );
    setPosition({ left, top });
  }, [open, options.length]);

  return (
    <div className={css.rowWrap} onMouseEnter={onOpen} onMouseLeave={onLeave}>
      <button
        ref={rowRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        className={open ? `${css.item} ${css.itemOpen}` : css.item}
        disabled={options.length === 0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onOpen();
        }}
      >
        <span className={css.rowText}>
          <span className={css.itemLabel}>{heading}</span>
          <span className={css.rowCurrent}>{currentName}</span>
        </span>
        <CaretRightIcon size={14} weight="bold" className={css.rowArrow} />
      </button>
      {open && options.length > 0 && (
        <div
          ref={flyoutRef}
          className={css.flyout}
          role="menu"
          aria-label={heading}
          style={position ?? { visibility: 'hidden' }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === selected}
              className={css.item}
              onClick={() => onSelect(option.value)}
            >
              <span className={css.itemLabel}>{option.label}</span>
              {option.value === selected ? (
                <CheckIcon size={16} weight="bold" className={css.check} />
              ) : (
                <span className={css.checkSpacer} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useFlyout() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  useEffect(() => cancelClose, []);
  return (key: string) => ({
    open: openKey === key,
    onOpen: () => {
      cancelClose();
      setOpenKey(key);
    },
    onLeave: () => {
      cancelClose();
      closeTimer.current = setTimeout(() => setOpenKey((k) => (k === key ? null : k)), 200);
    },
  });
}

function useDeviceChoices(kind: DeviceKind, devices: MediaDeviceInfo[]) {
  const { t } = useTranslation();
  const { current } = useSelectDevice();
  const { list, selected } = deviceChoices(devices, current(kind));
  const options = list.map((device, i) => ({
    value: device.deviceId,
    label: device.label || `${t(HEADINGS[kind])} ${i + 1}`,
  }));
  return { options, selected };
}

function DeviceChoiceRow({
  kind,
  devices,
  flyout,
  onDone,
}: {
  kind: DeviceKind;
  devices: MediaDeviceInfo[];
  flyout: ReturnType<ReturnType<typeof useFlyout>>;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const { select } = useSelectDevice();
  const { options, selected } = useDeviceChoices(kind, devices);
  if (kind === 'audiooutput' && options.length === 0) return null;
  return (
    <ChoiceRow
      heading={t(HEADINGS[kind])}
      options={options}
      selected={selected}
      {...flyout}
      onSelect={(deviceId) => {
        select(kind, deviceId);
        onDone?.();
      }}
    />
  );
}

const NOISE_FILTERS: NoiseFilter[] = ['off', 'standard', 'enhanced'];

function NoiseFilterRow({ flyout }: { flyout: ReturnType<ReturnType<typeof useFlyout>> }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useAtom(noiseFilterAtom);
  return (
    <ChoiceRow
      heading={t('settings.voiceVideo.noiseFilter.title')}
      options={NOISE_FILTERS.map((value) => ({
        value,
        label: t(`settings.voiceVideo.noiseFilter.${value}`),
      }))}
      selected={filter}
      {...flyout}
      onSelect={(value) => setFilter(value as NoiseFilter)}
    />
  );
}

function PushToTalkRow() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useAtom(pushToTalkEnabledAtom);
  const keybinds = useAtomValue(keybindsAtom);
  const label = t('settings.keybinds.pushToTalk');
  return (
    <label className={css.item}>
      <span className={css.rowText}>
        <span className={css.itemLabel}>{label}</span>
        {enabled && !keybinds.pushToTalk && (
          <span className={css.rowCurrent}>{t('settings.voiceVideo.noKey')}</span>
        )}
      </span>
      <Toggle size="sm" checked={enabled} onChange={setEnabled} ariaLabel={label} />
    </label>
  );
}

function SettingsLink({ video, onDone }: { video: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const setPage = useSetAtom(settingsPageAtom);
  const setHighlight = useSetAtom(settingsHighlightAtom);
  const setOpen = useSetAtom(settingsOpenAtom);
  return (
    <button
      type="button"
      role="menuitem"
      className={css.item}
      onClick={() => {
        onDone();
        setPage('voice-video');
        setHighlight(video ? t('settings.voiceVideo.video') : null);
        setOpen(true);
      }}
    >
      <GearIcon size={16} className={css.itemIcon} />
      <span className={css.itemLabel}>
        {video ? t('call.videoSettings') : t('call.voiceSettings')}
      </span>
    </button>
  );
}

function MenuCameraPreview({ deviceId }: { deviceId: string | undefined }) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    let cancelled = false;
    let stream: MediaStream | null = null;
    void navigator.mediaDevices
      ?.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true })
      .then((s) => {
        stream = s;
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        setFailed(false);
        if (video) video.srcObject = s;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [deviceId]);

  return (
    <div className={css.previewFrame}>
      {failed ? (
        <span className={css.previewError}>{t('settings.voiceVideo.cameraFailed')}</span>
      ) : (
        <video ref={videoRef} className={css.previewVideo} autoPlay muted playsInline />
      )}
    </div>
  );
}

function CameraPreviewPanel({
  devices,
  onBack,
}: {
  devices: MediaDeviceInfo[];
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const flyout = useFlyout();
  const { selected } = useDeviceChoices('videoinput', devices);
  return (
    <div className={css.menu}>
      <button type="button" className={css.item} onClick={onBack}>
        <CaretLeftIcon size={14} weight="bold" className={css.itemIcon} />
        <span className={css.itemLabel}>{t('settings.voiceVideo.previewCamera')}</span>
      </button>
      <MenuCameraPreview deviceId={selected} />
      <DeviceChoiceRow kind="videoinput" devices={devices} flyout={flyout('videoinput')} />
    </div>
  );
}

function DeviceList({ kinds, onDone }: { kinds: DeviceKind[]; onDone: () => void }) {
  const { t } = useTranslation();
  const devices = useDevices(kinds);
  const flyout = useFlyout();
  const [previewing, setPreviewing] = useState(false);
  const hasVideo = kinds.includes('videoinput');

  if (previewing) {
    return (
      <CameraPreviewPanel devices={devices.videoinput ?? []} onBack={() => setPreviewing(false)} />
    );
  }

  return (
    <div className={css.menu}>
      {kinds.map((kind, index) => (
        <Fragment key={kind}>
          {index > 0 && <div className={css.divider} role="separator" />}
          <DeviceChoiceRow
            kind={kind}
            devices={devices[kind] ?? []}
            flyout={flyout(kind)}
            onDone={onDone}
          />
          {kind === 'audioinput' && (
            <>
              <VolumeRow kind="input" />
              <NoiseFilterRow flyout={flyout('noise')} />
              <PushToTalkRow />
            </>
          )}
          {kind === 'audiooutput' && <VolumeRow kind="output" />}
          {kind === 'videoinput' && (
            <button
              type="button"
              role="menuitem"
              className={css.item}
              onClick={() => setPreviewing(true)}
            >
              <VideoCameraIcon size={16} className={css.itemIcon} />
              <span className={css.itemLabel}>{t('settings.voiceVideo.previewCamera')}</span>
            </button>
          )}
        </Fragment>
      ))}
      <div className={css.divider} role="separator" />
      <SettingsLink video={hasVideo} onDone={onDone} />
    </div>
  );
}

export function DeviceControl({
  kinds,
  label,
  variant,
  children,
}: {
  kinds: DeviceKind[];
  label: string;
  variant: 'bar' | 'panel';
  children: React.ReactElement;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <span ref={ref} className={open ? `${css.split} ${css.splitOpen}` : css.split}>
      {children}
      <Tooltip content={label}>
        <button
          type="button"
          className={css.caret[variant]}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <CaretUpIcon size={variant === 'bar' ? 12 : 10} weight="bold" />
        </button>
      </Tooltip>
      <Popover open={open} onClose={close} anchorRef={ref} placement="top-start" role="menu" dense>
        {open && <DeviceList kinds={kinds} onDone={close} />}
      </Popover>
    </span>
  );
}
