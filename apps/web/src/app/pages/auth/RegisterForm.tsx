import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WizardClient } from '@wizardchat/core';
import { loadCore, normalizeUrl, register } from '@/client/initMatrix';
import { useSetAtom } from 'jotai';
import { credentialsAtom } from '@/app/store/atoms';
import { getErrorMessage, MatrixErrorCode } from '@/util/error';
import { passwordStrength } from '@/util/password';
import { matrixErrcode } from '@/app/features/auth/matrixError';
import {
  resolveIdpIconUrl,
  isPopupClosed,
  startOAuthPopupLogin,
  startSsoPopupLogin,
  RegisterStatus,
  DiscoveryStatus,
  type AuthCapabilities,
} from '@/app/features/sso/sso';
import { CUSTOM_SERVER, homeserverOptions } from '@/client/config';
import { SpinnerOverlay, Spinner } from '@/app/components/Spinner';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { Select } from '@/app/components/Select';
import { SERVER_LIST_URL } from '@/const/links';
import * as css from './WelcomePage.css';

const LOCALPART_RE = /^[a-z0-9._=\-/+]+$/;
const USERNAME_CHECK_DELAY_MS = 500;

type UsernameState = 'idle' | 'checking' | 'available' | 'taken' | 'reserved' | 'invalid';

const STRENGTH_BARS = { weak: 1, okay: 2, strong: 3 } as const;
const STRENGTH_CLASS = {
  weak: css.strengthBarWeak,
  okay: css.strengthBarOkay,
  strong: css.strengthBarStrong,
} as const;

function serverNameOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).host;
  } catch {
    return '';
  }
}

interface Props {
  onSuccess: () => void;
  onShowLogin: () => void;
  serverSelect: string;
  customUrl: string;
  onServerSelect: (value: string) => void;
  onCustomUrlChange: (value: string) => void;
  serverUrl: string;
  capabilities: AuthCapabilities | null;
  capabilitiesLoading: boolean;
  onRetryDiscovery: () => void;
}

export function RegisterForm({
  onSuccess,
  onShowLogin,
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
  const [usernameState, setUsernameState] = useState<UsernameState>('idle');
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState<'error' | 'success'>('error');
  const [loading, setLoading] = useState(false);

  const serverName = serverNameOf(serverSelect === CUSTOM_SERVER ? customUrl : serverSelect);
  const localpart = username.trim().replace(/^@/, '');
  const fullId = localpart && serverName ? `@${localpart}:${serverName}` : '';
  const strength = password ? passwordStrength(password) : null;
  const passwordTooShort = password.length > 0 && password.length < 8;

  const oidcMetadata = capabilities?.delegatedAuth ?? false;
  const ssoProviders = capabilities?.ssoProviders ?? [];
  const hasSso = !oidcMetadata && ssoProviders.length > 0;
  const idps = ssoProviders.flatMap((idp) => (idp.id ? [{ ...idp, id: idp.id }] : []));

  const registerStatus = capabilities?.registerStatus;
  const hasPasswordRegister = !oidcMetadata && registerStatus === RegisterStatus.Available;
  const isRateLimited = !oidcMetadata && registerStatus === RegisterStatus.RateLimited;
  const discoveryStatus = capabilities?.discoveryStatus;
  const serverUnreachable = discoveryStatus === DiscoveryStatus.Unreachable;
  const wellKnownInvalid = discoveryStatus === DiscoveryStatus.WellKnownInvalid;
  const isChecking = capabilitiesLoading && !capabilities;

  useEffect(() => {
    if (!localpart || !hasPasswordRegister) {
      setUsernameState('idle');
      return;
    }
    if (!LOCALPART_RE.test(localpart)) {
      setUsernameState('invalid');
      return;
    }
    setUsernameState('checking');
    let cancelled = false;
    const timer = setTimeout(() => {
      loadCore()
        .then(() => WizardClient.usernameAvailable(serverUrl, localpart))
        .then((available) => {
          if (!cancelled) setUsernameState(available ? 'available' : 'taken');
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const errcode = matrixErrcode(err);
          if (errcode === MatrixErrorCode.USER_IN_USE) setUsernameState('taken');
          else if (errcode === MatrixErrorCode.INVALID_USERNAME) setUsernameState('invalid');
          else if (errcode === MatrixErrorCode.EXCLUSIVE) setUsernameState('reserved');
          else setUsernameState('idle');
        });
    }, USERNAME_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [localpart, serverUrl, hasPasswordRegister]);

  const usernameError =
    usernameState === 'taken'
      ? t('auth.usernameTaken')
      : usernameState === 'reserved'
        ? t('auth.usernameReserved')
        : usernameState === 'invalid'
          ? t('auth.usernameInvalidChars')
          : undefined;
  const usernameHint = !fullId
    ? undefined
    : usernameState === 'available'
      ? t('auth.usernameAvailable', { id: fullId })
      : usernameState === 'checking'
        ? t('auth.usernameChecking', { id: fullId })
        : t('auth.usernameHint', { id: fullId });

  const canSubmit =
    !!localpart &&
    password.length >= 8 &&
    usernameState !== 'taken' &&
    usernameState !== 'reserved' &&
    usernameState !== 'invalid';

  const handleRegister = async () => {
    if (!localpart || !password) {
      setStatus(t('auth.fillAllFields'));
      setStatusType('error');
      return;
    }
    if (!canSubmit) return;

    setLoading(true);
    setStatus('');

    try {
      const flows = capabilities?.registerFlows ?? [];
      const dummyOnly = (stages: string[]) => stages.length === 1 && stages[0] === 'm.login.dummy';
      if (flows.length > 0 && !flows.some(dummyOnly)) {
        const names = flows.map((stages) => stages.join(' -> ')).join(', ');
        throw new Error(t('auth.additionalVerification', { names: names || 'unknown' }));
      }

      const credentials = await register(serverUrl, localpart, password);
      setCredentials(credentials);
      onSuccess();
    } catch (err) {
      const message = getErrorMessage(err);
      const errcode = matrixErrcode(err);
      if (errcode === MatrixErrorCode.USER_IN_USE) {
        setStatus(t('auth.usernameTaken'));
      } else if (errcode === MatrixErrorCode.INVALID_USERNAME) {
        setStatus(t('auth.invalidUsername'));
      } else if (errcode === MatrixErrorCode.EXCLUSIVE) {
        setStatus(t('auth.usernameReserved'));
      } else if (errcode === MatrixErrorCode.WEAK_PASSWORD) {
        setStatus(t('auth.weakPassword', { error: message }));
      } else {
        setStatus(t('auth.registrationFailed', { error: message }));
      }
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleSso = (idpId?: string) => {
    setStatus('');
    startSsoPopupLogin(serverUrl, idpId).then(
      (credentials) => {
        setCredentials(credentials);
        onSuccess();
      },
      (err) => {
        if (isPopupClosed(err)) return;
        setStatus(t('auth.registrationFailed', { error: getErrorMessage(err) }));
        setStatusType('error');
      }
    );
  };

  const handleOidc = () => {
    if (!oidcMetadata) return;
    setLoading(true);
    setStatus('');
    startOAuthPopupLogin(serverUrl, true).then(
      (credentials) => {
        setCredentials(credentials);
        onSuccess();
      },
      (err) => {
        if (!isPopupClosed(err)) {
          setStatus(t('auth.registrationFailed', { error: getErrorMessage(err) }));
          setStatusType('error');
        }
        setLoading(false);
      }
    );
  };

  return (
    <div className={css.formSection}>
      <h2 className={css.formTitle}>{t('auth.register')}</h2>

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
        <p className={css.switchText}>
          <a
            href={SERVER_LIST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={css.switchLink}
          >
            {t('auth.whichServer')}
          </a>
        </p>
      </div>

      {isChecking ? (
        <div className={css.checkingServer}>
          <Spinner size="sm" />
          <span>{t('auth.checkingServer')}</span>
        </div>
      ) : (
        <>
          {oidcMetadata && (
            <Button fullWidth size="lg" variant="primary" onClick={handleOidc} disabled={loading}>
              {loading ? t('auth.redirecting') : t('auth.oidcRegister')}
            </Button>
          )}

          {hasPasswordRegister && (
            <>
              <Input
                type="text"
                placeholder={t('auth.username')}
                aria-label={t('auth.username')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                helperText={usernameError ? undefined : usernameHint}
                error={usernameError}
              />
              <Input
                type="password"
                placeholder={t('auth.password')}
                aria-label={t('auth.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                showPasswordToggle
                error={passwordTooShort ? t('auth.passwordTooShort') : undefined}
                onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
              />

              {strength && !passwordTooShort && (
                <div className={css.strength} aria-live="polite">
                  <div className={css.strengthBars}>
                    {[1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={
                          i <= STRENGTH_BARS[strength] ? STRENGTH_CLASS[strength] : css.strengthBar
                        }
                      />
                    ))}
                  </div>
                  <span>{t(`auth.passwordStrength.${strength}`)}</span>
                </div>
              )}

              <Button
                fullWidth
                size="lg"
                variant="primary"
                onClick={handleRegister}
                disabled={loading || !canSubmit}
              >
                {loading ? t('auth.registering') : t('auth.registerSubmit')}
              </Button>
            </>
          )}

          {hasSso && (
            <>
              {hasPasswordRegister && <div className={css.divider}>{t('common.or')}</div>}
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

          {isRateLimited && <p className={css.statusText}>{t('auth.registrationRateLimited')}</p>}

          {!capabilitiesLoading &&
            !hasPasswordRegister &&
            !hasSso &&
            !isRateLimited &&
            !oidcMetadata && (
              <p className={css.statusText}>
                {serverUnreachable && t('auth.serverUnreachable')}
                {wellKnownInvalid && t('auth.notMatrixServer')}
                {!serverUnreachable && !wellKnownInvalid && t('auth.registrationUnavailable')}
              </p>
            )}
        </>
      )}

      {status && (
        <p className={statusType === 'success' ? css.statusSuccess : css.statusText}>{status}</p>
      )}

      <p className={css.switchText}>
        {t('auth.haveAccount')}{' '}
        <button type="button" className={css.switchLink} onClick={onShowLogin}>
          {t('auth.login')}
        </button>
      </p>

      {loading && <SpinnerOverlay />}
    </div>
  );
}
