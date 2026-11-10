import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  themeAtom,
  messageLayoutAtom,
  prettifyLinksAtom,
  markdownAtom,
  showRoomAvatarsAtom,
  showPresenceDotsAtom,
  colorUsernamesAtom,
  groupImagesAtom,
  themedAppIconAtom,
  chatFontSizeAtom,
  chatDensityAtom,
  uiDensityAtom,
  uiScaleAtom,
  type ThemeName,
  type MessageLayout,
  type ChatDensity,
  type UiDensity,
  type UiScale,
} from '@/app/store/atoms';
import { CHAT_FONT_SIZES, DEFAULT_CHAT_FONT_SIZE } from '@/app/hooks/useChatDisplaySync';
import { THEMES, DEFAULT_THEME } from '@/theme/themes.css';
import { THEME_TOKENS } from '@/theme/themeTokens';
import { hasThemedLogo } from '@/theme/themeLogos';
import { useEffect, useMemo } from 'react';
import { useProfile } from '@/app/data';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { Avatar } from '@/app/components/Avatar';
import { Select } from '@/app/components/Select';
import { Slider } from '@/app/components/Slider';
import { ToggleRow } from '@/app/components/Toggle';
import { Tooltip } from '@/app/components/Tooltip';
import { markdownToHtml } from '@/util/markdownToHtml';
import * as timelineCss from '@/app/features/timeline/Timeline.css';
import * as css from './Appearance.css';
import * as layoutCss from '../Settings.css';
import { useUsernameColor } from '@/app/hooks/useUsernameColor';

const THEME_NAMES: ThemeName[] = [
  'Carbon',
  'Pewter',
  'Umbra',
  'Eclipse',
  'Parrot',
  'Hallow',
  'Garnet',
  'Ethereal',
  'Blossom',
];

const PREVIEW_OTHER_NAME = 'Merlin';
const PREVIEW_OTHER_ID = '@merlin:wizardchat.org';

const mentionMarkdown = (name: string, userId: string) =>
  `[${name}](https://matrix.to/#/${userId})`;

interface PreviewMessageProps {
  layout: MessageLayout;
  isOwn: boolean;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  html: string;
  time: string;
}

function PreviewMessage({
  layout,
  isOwn,
  senderId,
  senderName,
  senderAvatar,
  html,
  time,
}: PreviewMessageProps) {
  const client = getMatrixClientOrNull();
  const senderColor = useUsernameColor()(senderId);
  const contentClass =
    layout === 'classic'
      ? isOwn
        ? timelineCss.msgContentClassicOwn
        : timelineCss.msgContentClassic
      : timelineCss.msgContent;

  if (layout === 'compact') {
    return (
      <div className={timelineCss.msgRowCompact}>
        <div className={timelineCss.msgHoverRegion}>
          <div className={timelineCss.compactBody}>
            <div className={timelineCss.compactLine}>
              <span className={timelineCss.compactHeader}>
                <span className={timelineCss.compactTime}>{time}</span>
                <span className={css.previewSender} style={{ color: senderColor }}>
                  {senderName}
                </span>
              </span>
              <div className={timelineCss.compactText}>
                <span dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={timelineCss.msgRow}>
      <div className={timelineCss.msgHoverRegion}>
        <div className={timelineCss.msgAvatarCol}>
          <Avatar
            name={senderName}
            mxcUrl={senderAvatar}
            client={client}
            size="sm"
            placeholder="logo"
          />
        </div>
        <div className={timelineCss.msgBody}>
          <div className={timelineCss.msgMeta}>
            <span className={css.previewSender} style={{ color: senderColor }}>
              {senderName}
            </span>
            <span className={timelineCss.msgTime}>{time}</span>
          </div>
          <div className={contentClass}>
            <span dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatPreview({ layout, prettifyLinks }: { layout: MessageLayout; prettifyLinks: boolean }) {
  const { t, i18n } = useTranslation();
  const client = getMatrixClientOrNull();
  const myId = client?.userId() ?? undefined;
  const { data: me } = useProfile(myId);
  const myName = me?.displayName || myId || '';

  const otherHtml = useMemo(
    () =>
      markdownToHtml(
        t('settings.appearance.previewOtherMessage', {
          mention: mentionMarkdown(myName || 'You', myId ?? '@you:wizardchat.org'),
        }),
        myId,
        true,
        prettifyLinks
      ),
    [t, myId, myName, prettifyLinks]
  );
  const ownHtml = useMemo(
    () =>
      markdownToHtml(
        t('settings.appearance.previewOwnMessage', {
          mention: mentionMarkdown(PREVIEW_OTHER_NAME, PREVIEW_OTHER_ID),
        }),
        myId,
        true,
        prettifyLinks
      ),
    [t, myId, prettifyLinks]
  );

  const time = (offsetMin: number) =>
    new Date(Date.now() - offsetMin * 60_000).toLocaleTimeString(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className={css.preview} aria-hidden="true" onClickCapture={(e) => e.preventDefault()}>
      <PreviewMessage
        layout={layout}
        isOwn={false}
        senderId={PREVIEW_OTHER_ID}
        senderName={PREVIEW_OTHER_NAME}
        html={otherHtml}
        time={time(2)}
      />
      <PreviewMessage
        layout={layout}
        isOwn
        senderId={myId ?? '@you:wizardchat.org'}
        senderName={myName}
        senderAvatar={me?.avatarUrl}
        html={ownHtml}
        time={time(1)}
      />
    </div>
  );
}

export function Appearance() {
  const { t } = useTranslation();
  const [theme, setTheme] = useAtom(themeAtom);
  const [layout, setLayout] = useAtom(messageLayoutAtom);
  const [prettifyLinks, setPrettifyLinks] = useAtom(prettifyLinksAtom);
  const [markdown, setMarkdown] = useAtom(markdownAtom);
  const [showRoomAvatars, setShowRoomAvatars] = useAtom(showRoomAvatarsAtom);
  const [showPresenceDots, setShowPresenceDots] = useAtom(showPresenceDotsAtom);
  const [colorUsernames, setColorUsernames] = useAtom(colorUsernamesAtom);
  const [groupImages, setGroupImages] = useAtom(groupImagesAtom);
  const [themedAppIcon, setThemedAppIcon] = useAtom(themedAppIconAtom);
  const [chatFontSize, setChatFontSize] = useAtom(chatFontSizeAtom);
  const [chatDensity, setChatDensity] = useAtom(chatDensityAtom);
  const [uiDensity, setUiDensity] = useAtom(uiDensityAtom);
  const [uiScale, setUiScale] = useAtom(uiScaleAtom);
  const themeHasIcon = hasThemedLogo(theme);

  // Apply theme class immediately on change
  useEffect(() => {
    const themeClass = THEMES[theme] ?? THEMES[DEFAULT_THEME];
    Object.values(THEMES).forEach((cls) => document.documentElement.classList.remove(cls));
    document.documentElement.classList.add(themeClass);
  }, [theme]);

  return (
    <div>
      <h2 className={layoutCss.panelTitle}>{t('settings.appearance.title')}</h2>

      <div className={layoutCss.section}>
        <ChatPreview layout={layout} prettifyLinks={prettifyLinks} />

        <div className={layoutCss.settingRow}>
          <div className={layoutCss.settingInfo}>
            <span className={layoutCss.settingLabel}>{t('settings.appearance.theme')}</span>
          </div>
          <div
            className={css.swatchRow}
            role="radiogroup"
            aria-label={t('settings.appearance.theme')}
          >
            {THEME_NAMES.map((name) => {
              const { color } = THEME_TOKENS[name];
              const isActive = theme === name;
              return (
                <Tooltip key={name} content={name}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    aria-label={name}
                    onClick={() => setTheme(name)}
                    className={isActive ? css.swatchActive : css.swatch}
                    style={{
                      background: `linear-gradient(135deg, ${color.bgSecondary} calc(50% - 0.5px), ${color.accent} calc(50% + 0.5px))`,
                    }}
                  />
                </Tooltip>
              );
            })}
          </div>
        </div>

        <div className={layoutCss.settingRow}>
          <div className={layoutCss.settingInfo}>
            <span className={layoutCss.settingLabel}>{t('settings.appearance.messageLayout')}</span>
          </div>
          <Select<MessageLayout>
            aria-label={t('settings.appearance.messageLayout')}
            value={layout}
            options={[
              { value: 'modern', label: t('settings.appearance.modern') },
              { value: 'classic', label: t('settings.appearance.classic') },
              { value: 'compact', label: t('settings.appearance.compact') },
            ]}
            onChange={setLayout}
          />
        </div>

        <div className={layoutCss.settingRow}>
          <div className={layoutCss.settingInfo}>
            <span className={layoutCss.settingLabel}>{t('settings.appearance.textSize')}</span>
          </div>
          <Slider
            value={chatFontSize}
            stops={CHAT_FONT_SIZES}
            defaultValue={DEFAULT_CHAT_FONT_SIZE}
            onChange={setChatFontSize}
            onDoubleClick={() => setChatFontSize(DEFAULT_CHAT_FONT_SIZE)}
            aria-label={t('settings.appearance.textSize')}
          />
        </div>

        <div className={layoutCss.settingRow}>
          <div className={layoutCss.settingInfo}>
            <span className={layoutCss.settingLabel}>{t('settings.appearance.density')}</span>
          </div>
          <Select<ChatDensity>
            aria-label={t('settings.appearance.density')}
            value={chatDensity}
            options={[
              { value: 'compact', label: t('settings.appearance.densityCompact') },
              { value: 'default', label: t('settings.appearance.densityDefault') },
              { value: 'spacious', label: t('settings.appearance.densitySpacious') },
            ]}
            onChange={setChatDensity}
          />
        </div>

        <ToggleRow
          label={t('settings.appearance.colorUsernames')}
          checked={colorUsernames}
          onChange={setColorUsernames}
        />
        <ToggleRow
          label={t('settings.appearance.groupImages')}
          description={t('settings.appearance.groupImagesNote')}
          checked={groupImages}
          onChange={setGroupImages}
        />
        <ToggleRow
          label={t('settings.appearance.prettifyLinks')}
          description={t('settings.appearance.prettifyLinksNote')}
          checked={prettifyLinks}
          onChange={setPrettifyLinks}
        />
        <ToggleRow
          label={t('settings.appearance.themedAppIcon')}
          checked={themeHasIcon && themedAppIcon}
          disabled={!themeHasIcon}
          onChange={setThemedAppIcon}
        />
      </div>

      <div className={layoutCss.divider} />

      <div className={layoutCss.section}>
        <div className={layoutCss.settingRow}>
          <div className={layoutCss.settingInfo}>
            <span className={layoutCss.settingLabel}>{t('settings.appearance.uiDensity')}</span>
            <span className={layoutCss.settingNote}>{t('settings.appearance.uiDensityNote')}</span>
          </div>
          <Select<UiDensity>
            aria-label={t('settings.appearance.uiDensity')}
            value={uiDensity}
            options={[
              { value: 'compact', label: t('settings.appearance.densityCompact') },
              { value: 'default', label: t('settings.appearance.densityDefault') },
              { value: 'spacious', label: t('settings.appearance.densitySpacious') },
            ]}
            onChange={setUiDensity}
          />
        </div>

        <div className={layoutCss.settingRow}>
          <div className={layoutCss.settingInfo}>
            <span className={layoutCss.settingLabel}>{t('settings.appearance.uiScale')}</span>
            <span className={layoutCss.settingNote}>{t('settings.appearance.uiScaleNote')}</span>
          </div>
          <Select<UiScale>
            aria-label={t('settings.appearance.uiScale')}
            value={uiScale}
            options={[
              { value: 'auto', label: t('settings.appearance.uiScaleAuto') },
              { value: 'desktop', label: t('settings.appearance.uiScaleDesktop') },
              { value: 'touch', label: t('settings.appearance.uiScaleTouch') },
            ]}
            onChange={setUiScale}
          />
        </div>

        <ToggleRow
          label={t('settings.appearance.showRoomAvatars')}
          checked={showRoomAvatars}
          onChange={setShowRoomAvatars}
        />
        <ToggleRow
          label={t('settings.appearance.showPresenceDots')}
          description={t('settings.appearance.showPresenceDotsNote')}
          checked={showPresenceDots}
          onChange={setShowPresenceDots}
        />
        <ToggleRow
          label={t('settings.appearance.markdown')}
          description={t('settings.appearance.markdownNote')}
          checked={markdown}
          onChange={setMarkdown}
        />
      </div>
    </div>
  );
}
