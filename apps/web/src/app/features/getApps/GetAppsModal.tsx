import { useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  AndroidLogoIcon,
  AppleLogoIcon,
  ArrowSquareOutIcon,
  CaretDownIcon,
  CheckCircleIcon,
  DownloadSimpleIcon,
  GlobeSimpleIcon,
  GooglePlayLogoIcon,
  LinuxLogoIcon,
  WindowsLogoIcon,
} from '@phosphor-icons/react';
import { Dialog } from '@/app/components/Dialog/Dialog';
import { Popover } from '@/app/components/Popover';
import { getAppsOpenAtom } from '@/app/store/atoms';
import { isDesktop } from '@/bridge/desktop';
import {
  ANDROID_BETA_URL,
  ANDROID_OPTIONS_URL,
  IOS_OPTIONS_URL,
  RELEASES_URL,
  WEB_APP_URL,
  detectDesktopPlatform,
  useReleaseAssets,
  type DesktopAsset,
  type DesktopPlatform,
} from './releaseFeed';
import * as css from './GetAppsModal.css';

interface Variant {
  asset: DesktopAsset;
  labelKey: string;
}

const DESKTOP: {
  platform: DesktopPlatform;
  name: string;
  Icon: typeof WindowsLogoIcon;
  variants: Variant[];
}[] = [
  {
    platform: 'windows',
    name: 'Windows',
    Icon: WindowsLogoIcon,
    variants: [{ asset: 'windows', labelKey: 'getApps.download' }],
  },
  {
    platform: 'mac',
    name: 'macOS',
    Icon: AppleLogoIcon,
    variants: [
      { asset: 'mac-arm', labelKey: 'getApps.appleSilicon' },
      { asset: 'mac-intel', labelKey: 'getApps.intel' },
    ],
  },
  {
    platform: 'linux',
    name: 'Linux',
    Icon: LinuxLogoIcon,
    variants: [
      { asset: 'appimage', labelKey: 'getApps.appImage' },
      { asset: 'deb', labelKey: 'getApps.deb' },
      { asset: 'rpm', labelKey: 'getApps.rpm' },
      { asset: 'arch', labelKey: 'getApps.arch' },
      { asset: 'flatpak', labelKey: 'getApps.flatpak' },
      { asset: 'tarball', labelKey: 'getApps.tarball' },
    ],
  },
];

function ExternalButton({
  href,
  primary,
  children,
}: {
  href: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={primary ? css.buttonPrimary : css.button}
    >
      {children}
    </a>
  );
}

function DownloadButton({
  variants,
  link,
  primary,
}: {
  variants: Variant[];
  link: (asset: DesktopAsset) => string;
  primary: boolean;
}) {
  const { t } = useTranslation();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  if (variants.length === 1) {
    return (
      <ExternalButton href={link(variants[0].asset)} primary={primary}>
        <DownloadSimpleIcon size={16} />
        {t('getApps.download')}
      </ExternalButton>
    );
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={primary ? css.buttonPrimary : css.button}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <DownloadSimpleIcon size={16} />
        {t('getApps.download')}
        <CaretDownIcon size={12} weight="bold" />
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        placement="bottom-start"
        role="menu"
        matchAnchorWidth
        dense
      >
        <div className={css.menu}>
          {variants.map(({ asset, labelKey }) => (
            <a
              key={asset}
              role="menuitem"
              href={link(asset)}
              target="_blank"
              rel="noopener noreferrer"
              className={css.menuItem}
              onClick={() => setOpen(false)}
            >
              {t(labelKey)}
            </a>
          ))}
        </div>
      </Popover>
    </>
  );
}

function DesktopSection() {
  const { t } = useTranslation();
  const [open] = useAtom(getAppsOpenAtom);
  const { data } = useReleaseAssets(open);
  const current = detectDesktopPlatform();
  const link = (asset: DesktopAsset) => data?.links[asset] ?? RELEASES_URL;
  const desktop = [...DESKTOP].sort(
    (a, b) => Number(b.platform === current) - Number(a.platform === current)
  );

  return (
    <section className={css.section}>
      <h3 className={css.sectionTitle}>{t('getApps.desktop')}</h3>
      <div className={css.grid}>
        {desktop.map(({ platform, name, Icon, variants }) => {
          const mine = platform === current;
          const installed = mine && isDesktop;
          return (
            <div key={platform} className={mine ? css.cardCurrent : css.card}>
              <div className={css.cardHeader}>
                <Icon size={28} weight="fill" className={css.platformIcon} />
                <span className={css.platformName}>{name}</span>
                {mine && !installed && <span className={css.badge}>{t('getApps.yourSystem')}</span>}
              </div>
              <div className={css.actions}>
                {installed ? (
                  <span className={css.installed}>
                    <CheckCircleIcon size={16} weight="fill" />
                    {t('getApps.installed', { version: import.meta.env.APP_VERSION })}
                  </span>
                ) : (
                  <DownloadButton variants={variants} link={link} primary={mine} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MobileSection() {
  const { t } = useTranslation();
  return (
    <section className={css.section}>
      <h3 className={css.sectionTitle}>{t('getApps.mobile')}</h3>
      <div className={css.grid}>
        <div className={isDesktop ? css.cardCurrent : css.card}>
          <div className={css.cardHeader}>
            <AndroidLogoIcon size={28} weight="fill" className={css.platformIcon} />
            <span className={css.platformName}>Android</span>
          </div>
          <p className={css.note}>{t('getApps.androidNote')}</p>
          <div className={css.actions}>
            <ExternalButton href={ANDROID_BETA_URL} primary={isDesktop}>
              <GooglePlayLogoIcon size={16} weight="fill" />
              {t('getApps.joinBeta')}
            </ExternalButton>
            <ExternalButton href={ANDROID_OPTIONS_URL}>
              <ArrowSquareOutIcon size={16} />
              {t('getApps.withoutPlay')}
            </ExternalButton>
          </div>
        </div>
        <div className={css.card}>
          <div className={css.cardHeader}>
            <AppleLogoIcon size={28} weight="fill" className={css.platformIcon} />
            <span className={css.platformName}>iOS</span>
            <span className={css.badgeMuted}>{t('getApps.appStoreSoon')}</span>
          </div>
          <p className={css.note}>{t('getApps.iosNote')}</p>
          <div className={css.actions}>
            <ExternalButton href={IOS_OPTIONS_URL}>
              <ArrowSquareOutIcon size={16} />
              {t('getApps.sideload')}
            </ExternalButton>
          </div>
        </div>
        {isDesktop && (
          <div className={css.card}>
            <div className={css.cardHeader}>
              <GlobeSimpleIcon size={28} weight="fill" className={css.platformIcon} />
              <span className={css.platformName}>{t('getApps.web')}</span>
            </div>
            <p className={css.note}>{t('getApps.webNote')}</p>
            <div className={css.actions}>
              <ExternalButton href={WEB_APP_URL}>
                <ArrowSquareOutIcon size={16} />
                {t('getApps.openWeb')}
              </ExternalButton>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function GetAppsModal() {
  const { t } = useTranslation();
  const [open, setOpen] = useAtom(getAppsOpenAtom);

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      size="lg"
      title={t('getApps.title')}
      subtitle={t('getApps.subtitle')}
      bodyClassName={css.body}
    >
      {isDesktop ? (
        <>
          <MobileSection />
          <DesktopSection />
        </>
      ) : (
        <>
          <DesktopSection />
          <MobileSection />
        </>
      )}
      <footer className={css.footer}>
        <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className={css.link}>
          {t('getApps.allReleases')}
        </a>
      </footer>
    </Dialog>
  );
}
