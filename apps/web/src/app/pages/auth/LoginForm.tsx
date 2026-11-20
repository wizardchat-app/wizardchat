import { useState } from 'react';
import { QrCodeIcon } from '@phosphor-icons/react';
import { SignInWithQrModal } from '@/app/features/qrLogin/SignInWithQrModal';
import { useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { credentialsAtom } from '@/app/store/atoms';
import { login } from '@/client/initMatrix';
import { getErrorMessage } from '@/util/error';
import {
  resolveIdpIconUrl,
  isPopupClosed,
  startOAuthPopupLogin,
  startSsoPopupLogin,
  DiscoveryStatus,
  type AuthCapabilities,
} from '@/app/features/sso/sso';
import type { MatrixCredentials } from '@/client/types';
import { CUSTOM_SERVER, homeserverOptions } from '@/client/config';
import { SpinnerOverlay, Spinner } from '@/app/components/Spinner';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { Select } from '@/app/components/Select';
import * as css from './WelcomePage.css';

interface Props {
  onSuccess: () => void;
  onShowRegister: () => void;
  onShowReset: () => void;
  serverSelect: string;
  customUrl: string;
  onServerSelect: (value: string) => void;
  onCustomUrlChange: (value: string) => void;
  serverUrl: string;
  capabilities: AuthCapabilities | null;
  capabilitiesLoading: boolean;
  onRetryDiscovery: () => void;
}

export function LoginForm({
  onSuccess,
  onShowRegister,
  onShowReset,
  serverSelect,
  customUrl,
  onServerSelect,
  onCustomUrlChange,
  serverUrl,
  capabilities,
  capabilitiesLoading,
  onRetryDiscovery,
}: Props) {
  const { t } = useTranslation();
  const setCredentials = useSetAtom(credentialsAtom);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [oidcLoading, setOidcLoading] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const oidcMetadata = capabilities?.delegatedAuth ?? false;
  const hasPassword =
    !oidcMetadata &&
    (!capabilities ||
      capabilities.discoveryStatus !== DiscoveryStatus.Ok ||
      capabilities.hasPasswordLogin);
  const ssoProviders = capabilities?.ssoProviders ?? [];
  const hasSso = !oidcMetadata && ssoProviders.length > 0;
  const idps = ssoProviders.flatMap((idp) => (idp.id ? [{ ...idp, id: idp.id }] : []));
  const isChecking = capabilitiesLoading && !capabilities;
  const qrAvailable = oidcMetadata && !!serverUrl && !!capabilities?.qrLogin;

  const handleLogin = async () => {
    if (!username || !password) {
      setStatus(t('auth.fillAllFields'));
      return;
    }
    setLoading(true);
    setStatus('');
    try {
      const credentials = await login(serverUrl, username, password);
      setCredentials(credentials);
      onSuccess();
    } catch (err) {
      setStatus(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const finishPopupLogin = (signIn: Promise<MatrixCredentials>, done: () => void) => {
    setStatus('');
    signIn.then(
      (credentials) => {
        setCredentials(credentials);
        onSuccess();
      },
      (err) => {
        if (!isPopupClosed(err)) setStatus(getErrorMessage(err));
        done();
      }
    );
  };

  const handleSso = (idpId?: string) =>
    finishPopupLogin(startSsoPopupLogin(serverUrl, idpId), () => {});

  const handleOidc = () => {
    if (!oidcMetadata) return;
    setOidcLoading(true);
    finishPopupLogin(startOAuthPopupLogin(serverUrl), () => setOidcLoading(false));
  };

  const handleForgotPassword = () => {
    if (capabilities?.delegatedAuth && capabilities.accountManagementUri) {
      window.open(capabilities.accountManagementUri, '_blank', 'noopener');
    } else {
      onShowReset();
    }
  };

  return (
    <div className={css.formSection}>
      <h2 className={css.formTitle}>{t('auth.login')}</h2>

      <div className={css.serverGroup}>
        <Select
          aria-label={t('auth.customServer')}
          value={serverSelect}
          options={homeserverOptions(t('auth.customServer'))}
          onChange={onServerSelect}
        />
        {serverSelect === CUSTOM_SERVER && (
          <Input
            type="text"
            placeholder={t('auth.serverUrl')}
            aria-label={t('auth.serverUrl')}
            value={customUrl}
            onChange={(e) => onCustomUrlChange(e.target.value)}
            onBlur={onRetryDiscovery}
          />
        )}
      </div>

      {isChecking ? (
        <div className={css.checkingServer}>
          <Spinner size="sm" />
          <span>{t('auth.checkingServer')}</span>
        </div>
      ) : (
        <>
          {oidcMetadata && (
            <Button
              fullWidth
              size="lg"
              variant="primary"
              onClick={handleOidc}
              disabled={oidcLoading}
            >
              {oidcLoading ? t('auth.redirecting') : t('auth.oidcLogin')}
            </Button>
          )}

          {oidcMetadata && qrAvailable && (
            <Button fullWidth size="lg" variant="secondary" onClick={() => setQrOpen(true)}>
              <QrCodeIcon size={18} />
              {t('auth.qr.signInTitle')}
            </Button>
          )}
          {qrOpen && (
            <SignInWithQrModal
              serverUrl={serverUrl}
              onClose={() => setQrOpen(false)}
              onSuccess={onSuccess}
            />
          )}

          {hasPassword && (
            <>
              <Input
                type="text"
                placeholder={t('auth.username')}
                aria-label={t('auth.username')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
              <Input
                type="password"
                placeholder={t('auth.password')}
                aria-label={t('auth.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                showPasswordToggle
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />

              <p className={css.switchText}>
                <button type="button" className={css.switchLink} onClick={handleForgotPassword}>
                  {t('auth.forgotPassword')}
                </button>
              </p>

              <Button
                fullWidth
                size="lg"
                variant="primary"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? t('auth.loggingIn') : t('auth.login')}
              </Button>
            </>
          )}

          {hasSso && (
            <>
              {hasPassword && <div className={css.divider}>{t('common.or')}</div>}
              {idps.length === 0 ? (
                <Button fullWidth size="lg" variant="secondary" onClick={() => handleSso()}>
                  {t('common.continueWithSso')}
                </Button>
              ) : (
                idps.map((idp) => {
                  const iconUrl = resolveIdpIconUrl(serverUrl, idp.icon);
                  return (
                    <Button
                      key={idp.id}
                      fullWidth
                      variant="secondary"
                      onClick={() => handleSso(idp.id)}
                    >
                      {iconUrl && <img src={iconUrl} alt="" className={css.idpIcon} />}
                      {t('auth.continueWithIdp', { name: idp.name })}
                    </Button>
                  );
                })
              )}
            </>
          )}

          {!capabilitiesLoading && !hasPassword && !hasSso && !oidcMetadata && (
            <p className={css.statusText}>{t('auth.noLoginMethod')}</p>
          )}
        </>
      )}

      {status && <p className={css.statusText}>{status}</p>}

      <p className={css.switchText}>
        {t('auth.noAccount')}{' '}
        <button type="button" className={css.switchLink} onClick={onShowRegister}>
          {t('auth.register')}
        </button>
      </p>

      {loading && <SpinnerOverlay />}
    </div>
  );
}
