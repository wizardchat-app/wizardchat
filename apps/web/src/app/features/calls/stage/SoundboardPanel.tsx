import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  ClockIcon,
  HashIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  XIcon,
} from '@phosphor-icons/react';
import { VolumeSlider } from '../VolumeSlider';
import { Popover } from '@/app/components/Popover';
import type { SoundPack, SoundboardSound } from '@wizardchat/core';
import type { CallMedia } from '@/call/media';
import { SOUNDBOARD_COOLDOWN_MS, soundboardEmoji } from '@/call/soundboard';
import { useClient, useRoom } from '@/app/data';
import { Tooltip } from '@/app/components/Tooltip';
import {
  roomSettingsRoomIdAtom,
  roomSettingsTabAtom,
  soundboardVolumeAtom,
} from '@/app/store/atoms';
import {
  cachedSoundPacks,
  loadSoundPacks,
  soundLabel,
  soundPackTitle,
} from '@/app/features/soundboard/soundPacks';
import { useDismiss } from './useDismiss';
import * as css from './CallStage.css';
import * as editorCss from '@/app/features/soundboard/SoundPackEditor.css';
import * as pickerCss from '@/app/features/widget/NativeStickerPicker.css';

export function SoundboardPanel({ session, onClose }: { session: CallMedia; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useClient();
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  const [packs, setPacks] = useState<SoundPack[] | null>(
    () => cachedSoundPacks(client, session.roomId) ?? null
  );
  const [failed, setFailed] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const setRoomSettingsTab = useSetAtom(roomSettingsTabAtom);
  const setRoomSettingsId = useSetAtom(roomSettingsRoomIdAtom);
  const roomName = useRoom(session.roomId)?.name ?? '';

  useEffect(() => {
    let cancelled = false;
    loadSoundPacks(client, session.roomId)
      .then((list) => {
        if (cancelled) return;
        setPacks(list);
        const frequent = list.find((pack) => pack.source === 'frequent');
        for (const sound of frequent?.sounds ?? []) session.prefetchSound(sound.url);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [client, session]);

  useEffect(() => {
    if (!coolingDown) return;
    const timer = setTimeout(() => setCoolingDown(false), SOUNDBOARD_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [coolingDown]);

  const play = (sound: SoundboardSound) => {
    setCoolingDown(true);
    void session.playSound(sound.url, sound.shortcode, sound.emoji).catch(() => {});
    void client.recordSoundPlayed(sound.url).catch(() => {});
  };

  const [query, setQuery] = useState('');
  const [volume, setVolume] = useAtom(soundboardVolumeAtom);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeRef = useRef<HTMLSpanElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const [activeNav, setActiveNav] = useState('');

  const sections = useMemo(() => {
    const list: (SoundPack | 'room')[] = packs ? [...packs] : [];
    if (packs && !packs.some((pack) => pack.source === 'room')) {
      const builtIn = list.findIndex((pack) => pack !== 'room' && pack.source === 'builtIn');
      list.splice(builtIn + 1, 0, 'room');
    }
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.flatMap((pack) => {
      if (pack === 'room' || pack.source === 'frequent') return [];
      const title = soundPackTitle(t, pack).toLowerCase();
      const sounds = pack.sounds.filter(
        (sound) =>
          title.includes(q) ||
          soundLabel(t, sound).toLowerCase().includes(q) ||
          sound.shortcode.toLowerCase().includes(q)
      );
      return sounds.length > 0 ? [{ ...pack, sounds }] : [];
    });
  }, [packs, query, t]);

  const sectionId = (pack: SoundPack | 'room') => (pack === 'room' ? 'room' : pack.id);

  useEffect(() => {
    if (!bodyRef.current || query) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let best = '';
        let bestRatio = 0;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            best = entry.target.getAttribute('data-pack-id') ?? '';
            bestRatio = entry.intersectionRatio;
          }
        }
        if (best) setActiveNav(best);
      },
      { root: bodyRef.current, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections, query]);

  const sectionRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) sectionRefs.current.set(id, el);
      else sectionRefs.current.delete(id);
    },
    []
  );

  const openRoomSettings = () => {
    onClose();
    setRoomSettingsTab('sounds');
    setRoomSettingsId(session.roomId);
  };

  const navIcon = (pack: SoundPack | 'room') => {
    if (pack === 'room') return <HashIcon size={18} />;
    if (pack.source === 'frequent') return <ClockIcon size={18} />;
    const first = pack.sounds[0];
    return (
      <span className={css.soundNavEmoji} aria-hidden>
        {first ? soundboardEmoji(first.shortcode, first.emoji) : '🔊'}
      </span>
    );
  };

  const titleOf = (pack: SoundPack | 'room') =>
    pack === 'room' ? roomName : soundPackTitle(t, pack);

  return (
    <div
      ref={ref}
      className={`${css.panel} ${css.soundPanel}`}
      role="dialog"
      aria-label={t('call.soundboard.title')}
    >
      <div className={`${pickerCss.searchWrap} ${css.soundSearchRow}`}>
        <div className={pickerCss.searchInner} style={{ flex: 1 }}>
          <input
            className={pickerCss.searchInput}
            type="text"
            placeholder={t('call.soundboard.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className={pickerCss.searchClearBtn}
            onClick={() => setQuery('')}
            aria-label={t('common.clear')}
            style={{ visibility: query ? 'visible' : 'hidden' }}
          >
            <XIcon size={14} />
          </button>
        </div>
        <span ref={volumeRef} className={css.soundVolumeAnchor}>
          <Tooltip content={t('call.soundboard.volume')}>
            <button
              type="button"
              className={css.soundSettingsBtn}
              aria-label={t('call.soundboard.volume')}
              aria-expanded={volumeOpen}
              onClick={() => setVolumeOpen((open) => !open)}
            >
              {volume > 0 ? <SpeakerHighIcon size={18} /> : <SpeakerSlashIcon size={18} />}
            </button>
          </Tooltip>
        </span>
      </div>
      <Popover
        open={volumeOpen}
        onClose={() => setVolumeOpen(false)}
        anchorRef={volumeRef}
        placement="right-start"
      >
        <div className={css.soundVolumePop} data-call-panel-toggle>
          <span className={css.soundVolumeTitle}>{t('call.soundboard.volume')}</span>
          <VolumeSlider value={volume} label={t('call.soundboard.volume')} onChange={setVolume} />
        </div>
      </Popover>
      <div className={`${pickerCss.body} ${css.soundBody}`}>
        {!query && sections.length > 0 && (
          <div className={pickerCss.navSidebar}>
            {sections.map((pack) => {
              const id = sectionId(pack);
              return (
                <Tooltip key={id} placement="right" content={titleOf(pack)}>
                  <button
                    type="button"
                    className={`${pickerCss.navBtn} ${activeNav === id ? pickerCss.navBtnActive : ''}`}
                    onClick={() => {
                      setActiveNav(id);
                      sectionRefs.current.get(id)?.scrollIntoView({ block: 'start' });
                    }}
                    aria-label={titleOf(pack)}
                  >
                    <span className={pickerCss.navPill} />
                    {navIcon(pack)}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        )}
        <div className={pickerCss.contentCol}>
          <div ref={bodyRef} className={pickerCss.stickerBody}>
            {failed && !packs ? (
              <div className={pickerCss.emptyState}>{t('call.soundboard.failed')}</div>
            ) : !packs ? (
              <div className={pickerCss.packSection} aria-busy="true">
                <div className={pickerCss.packLabel}>
                  <div className={pickerCss.skeletonLabel} />
                </div>
                <div className={pickerCss.grid}>
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className={`${css.soundBtn} ${editorCss.skeleton}`} />
                  ))}
                </div>
              </div>
            ) : sections.length === 0 ? (
              <div className={pickerCss.emptyState}>{t('call.soundboard.noResults')}</div>
            ) : (
              sections.map((pack) => {
                const id = sectionId(pack);
                return (
                  <section
                    key={id}
                    ref={sectionRef(id)}
                    data-pack-id={id}
                    className={pickerCss.packSection}
                    aria-label={titleOf(pack)}
                  >
                    <div className={pickerCss.packLabel}>{titleOf(pack)}</div>
                    {pack === 'room' ? (
                      <div className={pickerCss.emptyState}>
                        {t('call.soundboard.noRoomSounds')}
                        <br />
                        <button
                          type="button"
                          className={pickerCss.emptyLink}
                          onClick={openRoomSettings}
                        >
                          {t('room.settings.sounds.title')}
                        </button>
                      </div>
                    ) : (
                      <div className={pickerCss.grid}>
                        {pack.sounds.map((sound) => {
                          const label = soundLabel(t, sound);
                          return (
                            <button
                              key={`${sound.url}${sound.shortcode}`}
                              type="button"
                              className={css.soundBtn}
                              disabled={coolingDown}
                              title={label}
                              onClick={() => play(sound)}
                            >
                              <span className={css.soundEmoji} aria-hidden>
                                {soundboardEmoji(sound.shortcode, sound.emoji)}
                              </span>
                              <span className={css.soundLabel}>{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })
            )}
          </div>
        </div>
      </div>
      <div className={css.soundFooter}>
        <p className={css.soundNote}>{t('call.soundboard.note')}</p>
      </div>
    </div>
  );
}
