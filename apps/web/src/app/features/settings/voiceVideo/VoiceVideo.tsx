import { useEffect, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  keybindsAtom,
  pushToTalkEnabledAtom,
  settingsPageAtom,
  soundboardVolumeAtom,
  voiceSoundsAtom,
} from '@/app/store/atoms';
import { ToggleRow } from '@/app/components/Toggle';
import { Button } from '@/app/components/Button';
import { Select } from '@/app/components/Select';
import { KeyCaps } from '@/app/components/KeyCaps';
import { VolumeSlider } from '@/app/features/calls/VolumeSlider';
import {
  deviceChoices,
  useCallVolume,
  useDevices,
  useSelectDevice,
} from '@/app/features/calls/DeviceMenu';
import { comboKeys, parseCombo } from '@/app/features/keyboardShortcuts/keyCombo';
import { VOICE_SOUND_TOGGLES, type VoiceSoundToggle } from '@/app/features/voice/voiceSounds';
import { useKeyboardHints } from '@/app/hooks/useKeyboardHints';
import type { DeviceKind } from '@/call/media';
import { CameraPreview } from './CameraPreview';
import { MicTest } from './MicTest';
import * as layoutCss from '../Settings.css';
import * as css from './VoiceVideo.css';

const AUDIO_KINDS: DeviceKind[] = ['audioinput', 'audiooutput'];
const VIDEO_KINDS: DeviceKind[] = ['videoinput'];

const DEVICE_LABELS: Record<DeviceKind, string> = {
  audioinput: 'call.inputDevice',
  audiooutput: 'call.outputDevice',
  videoinput: 'call.camera',
};

function DeviceSelect({
  kind,
  devices,
  selected,
  placeholder,
  onSelect,
}: {
  kind: DeviceKind;
  devices: MediaDeviceInfo[];
  selected: string | undefined;
  placeholder?: string;
  onSelect: (deviceId: string) => void;
}) {
  const { t } = useTranslation();
  const label = t(DEVICE_LABELS[kind]);
  return (
    <div className={css.field}>
      <span className={layoutCss.fieldLabel}>{label}</span>
      <Select
        label={label}
        value={selected ?? ''}
        disabled={devices.length === 0}
        options={
          devices.length > 0
            ? devices.map((device, i) => ({
                value: device.deviceId,
                label: device.label || `${label} ${i + 1}`,
              }))
            : [{ value: '', label: placeholder ?? t('call.noDevices') }]
        }
        onChange={onSelect}
      />
    </div>
  );
}

function VolumeField({ kind }: { kind: 'input' | 'output' }) {
  const { t } = useTranslation();
  const [volume, setVolume] = useCallVolume(kind);
  const label = t(kind === 'input' ? 'call.inputVolume' : 'call.outputVolume');
  return (
    <div className={css.field}>
      <span className={layoutCss.fieldLabel}>{label}</span>
      <VolumeSlider
        value={volume}
        max={kind === 'input' ? 2 : 1}
        label={label}
        onChange={setVolume}
      />
    </div>
  );
}

function PushToTalk() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useAtom(pushToTalkEnabledAtom);
  const keybinds = useAtomValue(keybindsAtom);
  const setSettingsPage = useSetAtom(settingsPageAtom);
  const keyboardHints = useKeyboardHints();
  const desktop = window.desktopAPI;
  const [permission, setPermission] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) return;
    void desktop?.getPushToTalkPermission?.().then(setPermission);
  }, [enabled, desktop]);

  const combo = parseCombo(keybinds.pushToTalk ?? '');

  return (
    <div className={layoutCss.section}>
      <h3 className={layoutCss.sectionTitle}>{t('settings.voiceVideo.inputMode')}</h3>
      <ToggleRow
        label={t('settings.keybinds.pushToTalk')}
        checked={enabled}
        onChange={setEnabled}
      />
      {enabled && !desktop?.setGlobalKey && (
        <p className={layoutCss.settingNote}>{t('settings.voiceVideo.pushToTalkBrowserHint')}</p>
      )}
      {enabled && permission === false && (
        <div className={layoutCss.settingRow}>
          <div className={layoutCss.settingInfo}>
            <span className={layoutCss.settingNote}>
              {t('settings.voiceVideo.pushToTalkPermission')}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              const granted = await desktop?.requestPushToTalkPermission?.();
              setPermission(!!granted);
            }}
          >
            {t('settings.voiceVideo.pushToTalkGrant')}
          </Button>
        </div>
      )}
      {enabled && keyboardHints && (
        <div className={layoutCss.settingRow}>
          <span className={layoutCss.settingLabel}>{t('settings.voiceVideo.pushToTalkKey')}</span>
          {combo ? (
            <KeyCaps keys={comboKeys(combo)} />
          ) : (
            <span className={layoutCss.settingNote}>{t('settings.voiceVideo.noKey')}</span>
          )}
        </div>
      )}
      {keyboardHints && (
        <div className={layoutCss.settingRow}>
          <span className={layoutCss.settingNote}>{t('settings.voiceVideo.keybindsHint')}</span>
          <Button variant="secondary" size="sm" onClick={() => setSettingsPage('keybinds')}>
            {t('settings.voiceVideo.openKeybinds')}
          </Button>
        </div>
      )}
    </div>
  );
}

function Camera() {
  const { t } = useTranslation();
  const [accessCount, setAccessCount] = useState(0);
  const devices = useDevices(VIDEO_KINDS, false, accessCount);
  const { select, current } = useSelectDevice();
  const all = devices.videoinput ?? [];
  const granted = all.some((device) => device.label);
  const { list, selected } = deviceChoices(
    granted ? all.filter((device) => device.deviceId) : [],
    current('videoinput')
  );
  return (
    <div className={layoutCss.section}>
      <h3 className={layoutCss.sectionTitle}>{t('settings.voiceVideo.video')}</h3>
      <DeviceSelect
        kind="videoinput"
        devices={list}
        selected={selected}
        placeholder={
          all.length > 0 && !granted ? t('settings.voiceVideo.cameraPermission') : undefined
        }
        onSelect={(id) => select('videoinput', id)}
      />
      <CameraPreview
        deviceId={granted ? selected : undefined}
        onAccess={() => {
          if (!granted) setAccessCount((n) => n + 1);
        }}
      />
    </div>
  );
}

function Sounds() {
  const { t } = useTranslation();
  const [sounds, setSounds] = useAtom(voiceSoundsAtom);
  return (
    <div className={layoutCss.section}>
      <h3 className={layoutCss.sectionTitle}>{t('settings.voiceVideo.sounds')}</h3>
      {(Object.keys(VOICE_SOUND_TOGGLES) as VoiceSoundToggle[]).map((id) => (
        <ToggleRow
          key={id}
          label={t(`settings.voiceVideo.sound.${id}`)}
          checked={sounds[id] !== false}
          onChange={(on) => setSounds({ ...sounds, [id]: on })}
        />
      ))}
    </div>
  );
}

function Soundboard() {
  const { t } = useTranslation();
  const [volume, setVolume] = useAtom(soundboardVolumeAtom);
  const label = t('settings.voiceVideo.soundboard.volume');
  return (
    <div className={layoutCss.section}>
      <h3 className={layoutCss.sectionTitle}>{t('settings.voiceVideo.soundboard.title')}</h3>
      <div className={css.field}>
        <span className={layoutCss.fieldLabel}>{label}</span>
        <VolumeSlider value={volume} label={label} onChange={setVolume} />
      </div>
    </div>
  );
}

export function VoiceVideo() {
  const { t } = useTranslation();
  const devices = useDevices(AUDIO_KINDS);
  const { select, current } = useSelectDevice();
  const [inputVolume] = useCallVolume('input');
  const choices = Object.fromEntries(
    AUDIO_KINDS.map((kind) => [kind, deviceChoices(devices[kind] ?? [], current(kind))])
  ) as Record<'audioinput' | 'audiooutput', ReturnType<typeof deviceChoices>>;
  const hasOutputs = choices.audiooutput.list.length > 0;

  return (
    <div>
      <h2 className={layoutCss.panelTitle}>{t('settings.voiceVideo.title')}</h2>

      <div className={layoutCss.section}>
        <h3 className={layoutCss.sectionTitle}>{t('settings.voiceVideo.voice')}</h3>
        <div className={css.columns}>
          <DeviceSelect
            kind="audioinput"
            devices={choices.audioinput.list}
            selected={choices.audioinput.selected}
            onSelect={(id) => select('audioinput', id)}
          />
          {hasOutputs && (
            <DeviceSelect
              kind="audiooutput"
              devices={choices.audiooutput.list}
              selected={choices.audiooutput.selected}
              onSelect={(id) => select('audiooutput', id)}
            />
          )}
          <VolumeField kind="input" />
          <VolumeField kind="output" />
        </div>
        <MicTest deviceId={choices.audioinput.selected} volume={inputVolume} />
      </div>

      <div className={layoutCss.divider} />
      <PushToTalk />

      <div className={layoutCss.divider} />
      <Camera />

      <div className={layoutCss.divider} />
      <Sounds />

      <div className={layoutCss.divider} />
      <Soundboard />
    </div>
  );
}
