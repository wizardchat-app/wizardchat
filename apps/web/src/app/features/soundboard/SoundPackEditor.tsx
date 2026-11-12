import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon, PlayIcon, StopIcon, UploadSimpleIcon, XIcon } from '@phosphor-icons/react';
import type { SoundPack, SoundboardSound, WizardClient } from '@wizardchat/core';
import { soundboardEmoji } from '@/call/soundboard';
import { useToast } from '@/app/hooks/useToast';
import { Button, IconButton } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { Tooltip } from '@/app/components/Tooltip';
import { useAtom } from 'jotai';
import { emojiPickerAtom } from '@/app/store/atoms';
import * as packCss from '@/app/features/room/roomsettings/RoomSettingsEmojiSticker.css';
import * as panelCss from '@/app/components/Settings/Settings.css';
import { vars } from '@/theme/vars.css';
import {
  SOUND_FILE_TYPES,
  shortcodeFromName,
  soundErrorMessage,
  uploadSoundFile,
} from './soundPacks';
import * as css from './SoundPackEditor.css';

function usePreview(client: WizardClient) {
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = () => {
    audio.current?.pause();
    if (audio.current?.src) URL.revokeObjectURL(audio.current.src);
    audio.current = null;
    setPlaying(null);
  };
  useEffect(() => stop, []);
  const toggle = async (sound: SoundboardSound) => {
    const same = playing === sound.url;
    stop();
    if (same) return;
    setPlaying(sound.url);
    try {
      const data = await client.soundboardSound(sound.url);
      const element = new Audio(URL.createObjectURL(new Blob([data as BlobPart])));
      audio.current = element;
      element.onended = stop;
      await element.play();
    } catch {
      stop();
    }
  };
  return { playing, toggle };
}

function EmojiButton({
  client,
  sound,
  disabled,
  onPick,
}: {
  client: WizardClient;
  sound: SoundboardSound;
  disabled: boolean;
  onPick: (emoji: string) => void;
}) {
  const { t } = useTranslation();
  const [picker, setPicker] = useAtom(emojiPickerAtom);
  return (
    <button
      type="button"
      className={css.emojiBtn}
      disabled={disabled}
      aria-label={t('room.settings.sounds.emoji')}
      title={t('room.settings.sounds.emoji')}
      onClick={(e) => {
        if (picker) {
          setPicker(null);
          return;
        }
        setPicker({
          anchor: e.currentTarget,
          client,
          roomId: '',
          unicodeOnly: true,
          onPick: (emoji, mxcUrl) => {
            if (!mxcUrl) onPick(emoji);
            setPicker(null);
          },
        });
      }}
    >
      {soundboardEmoji(sound.shortcode, sound.emoji)}
    </button>
  );
}

export function SoundPackEditor({
  client,
  pack,
  isNew,
  onSave,
  onBack,
  readOnly = false,
}: {
  client: WizardClient;
  pack: SoundPack;
  isNew?: boolean;
  onSave: (name: string, attribution: string, sounds: SoundboardSound[]) => Promise<void>;
  onBack: () => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(pack.name ?? '');
  const [attribution, setAttribution] = useState(pack.attribution ?? '');
  const [sounds, setSounds] = useState<SoundboardSound[]>(pack.sounds);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const preview = usePreview(client);
  const title = pack.name || (isNew ? t('room.settings.emojis.newPack') : '');

  const update = (index: number, patch: Partial<SoundboardSound>) =>
    setSounds((prev) => prev.map((sound, i) => (i === index ? { ...sound, ...patch } : sound)));

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    const added: SoundboardSound[] = [];
    let failed: string | null = null;
    for (const file of files) {
      try {
        const uploaded = await uploadSoundFile(client, file);
        const body = file.name.replace(/\.[^.]+$/, '');
        added.push({ ...uploaded, shortcode: shortcodeFromName(body), body });
      } catch (error) {
        failed = soundErrorMessage(t, error);
      }
    }
    setSounds((prev) => [...prev, ...added]);
    if (failed) toast.error(failed);
    setUploading(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const used = new Set<string>();
      const named = sounds.map((sound) => {
        const base = sound.body?.trim() ? shortcodeFromName(sound.body) : sound.shortcode;
        let shortcode = base;
        for (let n = 2; used.has(shortcode); n += 1) shortcode = `${base}_${n}`;
        used.add(shortcode);
        return { ...sound, shortcode, body: sound.body?.trim() || null };
      });
      await onSave(name.trim(), attribution.trim(), named);
    } catch (error) {
      toast.error(soundErrorMessage(t, error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className={packCss.editorTitle}>
        <IconButton
          size="sm"
          onClick={onBack}
          aria-label={t('common.back')}
          tooltip={t('common.back')}
        >
          <ArrowLeftIcon size={16} />
        </IconButton>
        <span>{title}</span>
      </div>

      <div className={panelCss.divider} />

      <div className={packCss.editorSection}>
        <Input
          label={t('room.settings.emojis.packName')}
          value={name}
          disabled={readOnly}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('room.settings.sounds.packNamePlaceholder')}
        />
      </div>

      <div className={packCss.editorSection}>
        <Input
          label={t('room.settings.emojis.attribution')}
          value={attribution}
          disabled={readOnly}
          onChange={(e) => setAttribution(e.target.value)}
          placeholder={t('room.settings.emojis.attributionPlaceholder')}
        />
      </div>

      <div className={panelCss.divider} />

      <div className={packCss.editorSection}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: vars.color.textPrimary }}>
            {t('room.settings.sounds.sounds')} ({sounds.length})
          </span>
          <Button
            variant="secondary"
            size="sm"
            loading={uploading}
            disabled={readOnly}
            onClick={() => fileRef.current?.click()}
          >
            <UploadSimpleIcon size={14} />
            {t('room.settings.sounds.addSounds')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={SOUND_FILE_TYPES}
            className={panelCss.hiddenInput}
            multiple
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
        </div>
        <p className={panelCss.settingNote}>{t('call.soundboard.limits')}</p>

        {sounds.length === 0 ? (
          <div className={packCss.emptyPacks}>{t('room.settings.sounds.noSounds')}</div>
        ) : (
          <div className={packCss.imageGrid}>
            {sounds.map((sound, index) => {
              const isPlaying = preview.playing === sound.url;
              return (
                <div key={sound.url} className={`${packCss.imageCard} ${css.card}`}>
                  <Tooltip
                    content={
                      isPlaying ? t('call.soundboard.stopPreview') : t('call.soundboard.preview')
                    }
                  >
                    <button
                      type="button"
                      className={isPlaying ? `${css.playBtn} ${css.playing}` : css.playBtn}
                      onClick={() => void preview.toggle(sound)}
                      aria-label={
                        isPlaying ? t('call.soundboard.stopPreview') : t('call.soundboard.preview')
                      }
                    >
                      {isPlaying ? (
                        <StopIcon size={12} weight="fill" />
                      ) : (
                        <PlayIcon size={12} weight="fill" />
                      )}
                    </button>
                  </Tooltip>
                  {!readOnly && (
                    <Tooltip content={t('room.settings.sounds.removeSound')}>
                      <button
                        type="button"
                        className={packCss.imageRemoveBtn}
                        onClick={() => setSounds((prev) => prev.filter((_, i) => i !== index))}
                        aria-label={t('room.settings.sounds.removeSound')}
                      >
                        <XIcon size={12} weight="bold" />
                      </button>
                    </Tooltip>
                  )}
                  <EmojiButton
                    client={client}
                    sound={sound}
                    disabled={readOnly}
                    onPick={(emoji) => update(index, { emoji })}
                  />
                  <input
                    className={css.nameInput}
                    value={sound.body ?? ''}
                    placeholder={t('room.settings.sounds.name')}
                    maxLength={100}
                    disabled={readOnly}
                    aria-label={t('room.settings.sounds.name')}
                    onChange={(e) => update(index, { body: e.target.value })}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={packCss.actions}>
        <Button variant="secondary" onClick={onBack}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          loading={saving}
          spinnerWhileLoading
          onClick={() => void save()}
          disabled={readOnly || uploading}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
