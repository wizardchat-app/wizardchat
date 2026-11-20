import { useState } from 'react';
import { CheckIcon, XIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { vars } from '@/theme/vars.css';
import { getErrorMessage } from '@/util/error';
import { matrixErrcode } from '@/app/features/auth/matrixError';
import { checkPassword, isPasswordValid, type PasswordValidity } from '@/util/password';
import { generateClientSecret } from '@/util/clientSecret';
import {
  requestPasswordReset,
  completePasswordReset,
  type AuthCapabilities,
} from '@/app/features/sso/sso';
import { CUSTOM_SERVER, homeserverOptions } from '@/client/config';
import { SpinnerOverlay, Spinner } from '@/app/components/Spinner';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { Select } from '@/app/components/Select';
import * as css from './WelcomePage.css';

type ResetStep = 'email' | 'password' | 'done';

interface Props {
  onBackToLogin: () => void;
  serverSelect: string;
  customUrl: string;
  onServerSelect: (value: string) => void;
  onCustomUrlChange: (value: string) => void;
  serverUrl: string;
  capabilities: AuthCapabilities | null;
  capabilitiesLoading: boolean;
  onRetryDiscovery: () => void;
}

export function ResetPasswordForm({
  onBackToLogin,
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
  const [step, setStep] = useState<ResetStep>('email');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState<'error' | 'success'>('error');
  const [loading, setLoading] = useState(false);
  const [pwdValidity, setPwdValidity] = useState(() => checkPassword(''));

  // Persist these during the flow
  const [clientSecret] = useState(generateClientSecret);
  const [sid, setSid] = useState('');

  // Check if this server uses delegated auth (OIDC/MAS)
  const isDelegatedAuth = capabilities?.delegatedAuth && capabilities.accountManagementUri;
  const isChecking = capabilitiesLoading && !capabilities;

  const handleOpenAccountPortal = () => {
    if (capabilities?.accountManagementUri) {
      window.open(capabilities.accountManagementUri, '_blank', 'noopener');
    }
  };

  const handleRequestReset = async () => {
    if (!email.trim()) {
      setStatus(t('auth.emailRequired'));
      setStatusType('error');
      return;
    }

    setLoading(true);
    setStatus('');
    try {
      const requestSid = await requestPasswordReset(serverUrl, email.trim(), clientSecret);
      setSid(requestSid);
      setStep('password');
      setStatus(t('auth.resetLinkSent'));
      setStatusType('success');
    } catch (err) {
      // Check for 404/M_UNRECOGNIZED (password reset not supported)
      const isNotSupported = matrixErrcode(err) === 'M_UNRECOGNIZED';

      if (isNotSupported && isDelegatedAuth) {
        setStatus(t('auth.resetNotSupported'));
      } else if (isNotSupported) {
        setStatus(t('auth.resetNotSupported'));
      } else {
        setStatus(getErrorMessage(err));
      }
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteReset = async () => {
    if (!newPassword || !confirmPassword) {
      setStatus(t('auth.fillAllFields'));
      setStatusType('error');
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus(t('common.passwordMismatch'));
      setStatusType('error');
      return;
    }
    if (!isPasswordValid(pwdValidity)) {
      setStatus(t('auth.passwordRequirements.title'));
      setStatusType('error');
      return;
    }

    setLoading(true);
    setStatus('');
    try {
      await completePasswordReset(serverUrl, sid, clientSecret, newPassword);
      setStep('done');
      setStatus(t('auth.resetSuccess'));
      setStatusType('success');
    } catch (err) {
      const errMsg = getErrorMessage(err);
      // Check for common password reset errors
      if (matrixErrcode(err) === 'M_UNAUTHORIZED') {
        setStatus(t('auth.resetClickLinkFirst'));
      } else {
        setStatus(errMsg);
      }
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={css.formSection}>
      <h2 className={css.formTitle}>{t('auth.resetTitle')}</h2>

      <div className={css.serverGroup}>
        <Select
          aria-label={t('auth.customServer')}
          value={serverSelect}
          options={homeserverOptions(t('auth.customServer'))}
          onChange={onServerSelect}
          disabled={step !== 'email'}
        />
        {serverSelect === CUSTOM_SERVER && (
          <Input
            type="text"
            placeholder={t('auth.serverUrl')}
            aria-label={t('auth.serverUrl')}
            value={customUrl}
            onChange={(e) => onCustomUrlChange(e.target.value)}
            onBlur={onRetryDiscovery}
            disabled={step !== 'email'}
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
          {isDelegatedAuth ? (
            <>
              <p className={css.infoText}>{t('auth.resetDelegatedInfo')}</p>
              <Button fullWidth size="lg" variant="primary" onClick={handleOpenAccountPortal}>
                {t('auth.resetOpenAccountPortal')}
              </Button>
            </>
          ) : (
            <>
              {step === 'email' && (
                <>
                  <p className={css.infoText}>{t('auth.resetEmailPrompt')}</p>
                  <Input
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    aria-label="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    onKeyDown={(e) => e.key === 'Enter' && handleRequestReset()}
                  />
                  <Button
                    fullWidth
                    size="lg"
                    variant="primary"
                    onClick={handleRequestReset}
                    disabled={loading}
                  >
                    {loading ? t('auth.sending') : t('auth.resetSendCode')}
                  </Button>
                </>
              )}

              {step === 'password' && (
                <>
                  <p className={css.infoText}>{t('auth.resetCheckEmail')}</p>
                  <Input
                    type="password"
                    placeholder={t('auth.password')}
                    aria-label={t('auth.password')}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setPwdValidity(checkPassword(e.target.value));
                    }}
                    autoComplete="new-password"
                    showPasswordToggle
                    disabled={loading}
                  />
                  <Input
                    type="password"
                    placeholder={t('auth.confirmPassword')}
                    aria-label={t('auth.confirmPassword')}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    showPasswordToggle
                    disabled={loading}
                    onKeyDown={(e) => e.key === 'Enter' && handleCompleteReset()}
                  />

                  <div className={css.passwordReqs}>
                    <p>{t('auth.passwordRequirements.title')}</p>
                    <ul>
                      {(
                        [
                          ['length', t('auth.passwordRequirements.length')],
                          ['uppercase', t('auth.passwordRequirements.uppercase')],
                          ['lowercase', t('auth.passwordRequirements.lowercase')],
                          ['number', t('auth.passwordRequirements.number')],
                          ['special', t('auth.passwordRequirements.special')],
                        ] as [keyof PasswordValidity, string][]
                      ).map(([key, label]) => {
                        const met = pwdValidity[key];
                        return (
                          <li key={key} className={css.reqItem}>
                            {met ? (
                              <CheckIcon size={14} weight="bold" color={vars.color.success} />
                            ) : (
                              <XIcon size={14} weight="bold" color={vars.color.error} />
                            )}
                            {label}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <Button
                    fullWidth
                    size="lg"
                    variant="primary"
                    onClick={handleCompleteReset}
                    disabled={loading}
                  >
                    {loading ? t('auth.resetting') : t('auth.resetComplete')}
                  </Button>
                </>
              )}

              {step === 'done' && (
                <>
                  <p className={css.statusSuccess}>{t('auth.resetSuccess')}</p>
                  <Button fullWidth size="lg" variant="primary" onClick={onBackToLogin}>
                    {t('auth.backToLogin')}
                  </Button>
                </>
              )}
            </>
          )}

          {status && (
            <p className={statusType === 'success' ? css.statusSuccess : css.statusText}>
              {status}
            </p>
          )}

          {!loading && step !== 'done' && (
            <p className={css.switchText}>
              <button type="button" className={css.switchLink} onClick={onBackToLogin}>
                {t('auth.backToLogin')}
              </button>
            </p>
          )}
        </>
      )}

      {loading && <SpinnerOverlay />}
    </div>
  );
}
