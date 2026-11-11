import { Secret } from '@/app/components/Secret';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon, SpinnerGapIcon } from '@phosphor-icons/react';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useToast } from '@/app/hooks/useToast';
import { useConfirm } from '@/app/hooks/useConfirm';
import { getErrorMessage } from '@/util/error';
import { generateClientSecret } from '@/util/clientSecret';
import type { ThirdPartyId, UiaOutcome } from '@wizardchat/core';
import { errorCode } from '@/core/client';
import {
  UiaPanel,
  confirmWithSso,
  isSsoCancelled,
  offersPassword,
  offersSso,
  passwordAuth,
  uiaChallenge,
  type UiaChallenge,
} from '../sessions/UiaPanel';
import { Input } from '@/app/components/Input';
import { Button } from '@/app/components/Button';
import * as css from '../Settings.css';

export function EmailSettings() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const toast = useToast();
  const confirm = useConfirm();

  const [threepids, setThreepids] = useState<ThirdPartyId[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [token, setToken] = useState('');
  const [sid, setSid] = useState('');
  const [clientSecret] = useState(generateClientSecret);
  const [error, setError] = useState('');
  const [challenge, setChallenge] = useState<UiaChallenge | null>(null);

  const loadThreepids = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      setThreepids(await client.emailAddresses());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadThreepids();
  }, [loadThreepids]);

  if (!client) return null;

  const handleAddEmail = async () => {
    if (!newEmail.trim()) return;
    setError('');
    setAdding(true);
    try {
      setSid(await client.requestEmailToken(newEmail.trim(), clientSecret, 1));
      setVerifying(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const finishAddEmail = async (outcome: UiaOutcome) => {
    if (outcome.status === 'authRequired') {
      const next = uiaChallenge(outcome);
      if (!offersPassword(next.flows) && !offersSso(next.flows)) {
        setChallenge(null);
        setError(t('settings.account.authMethodUnsupported'));
        return;
      }
      setChallenge(next);
      return;
    }
    toast.success(t('settings.account.emailAdded'));
    setNewEmail('');
    setVerifying(false);
    setToken('');
    setSid('');
    setChallenge(null);
    await loadThreepids();
  };

  const handleVerifyToken = async () => {
    if (!token.trim()) return;
    setError('');
    setAdding(true);
    try {
      await finishAddEmail(await client.addEmailWithAuth(clientSecret, sid, token.trim(), null));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const handlePassword = async (password: string) => {
    if (!challenge) return;
    setAdding(true);
    try {
      await finishAddEmail(
        await client.addEmailWithAuth(clientSecret, sid, null, passwordAuth(challenge, password))
      );
    } catch (err) {
      if (errorCode(err) === 'invalidCredentials') throw err;
      setChallenge(null);
      setError(getErrorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const handleSso = async () => {
    if (!challenge) return;
    setAdding(true);
    try {
      await finishAddEmail(
        await client.addEmailWithAuth(clientSecret, sid, null, await confirmWithSso(challenge))
      );
    } catch (err) {
      setChallenge(null);
      setError(isSsoCancelled(err) ? t('settings.sessions.ssoCancelled') : getErrorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveEmail = async (address: string) => {
    const ok = await confirm({
      title: t('settings.account.removeEmail'),
      message: t('settings.account.removeEmailConfirm', { email: address }),
      danger: true,
    });
    if (!ok) return;

    try {
      await client.removeEmail(address);
      toast.success(t('settings.account.emailRemoved'));
      await loadThreepids();
    } catch (err) {
      toast.error(t('settings.account.removeEmailFailed', { error: getErrorMessage(err) }));
    }
  };

  const emails = threepids.filter((tp) => tp.medium === 'email');

  if (challenge) {
    return (
      <UiaPanel
        challenge={challenge}
        onSubmitPassword={handlePassword}
        onSso={handleSso}
        onCancel={() => setChallenge(null)}
        submitting={adding}
        description={t('settings.account.uiaPasswordDesc')}
        submitLabel={t('settings.account.addEmail')}
      />
    );
  }

  return (
    <div className={css.fieldGroup}>
      {loading ? (
        <div className={css.actions}>
          <SpinnerGapIcon size={16} className="icon-spin" />
        </div>
      ) : (
        <>
          {emails.length > 0 && (
            <div className={css.fieldGroup}>
              {emails.map((tp) => (
                <div key={tp.address} className={css.settingRow}>
                  <div className={css.settingInfo}>
                    <Secret value={tp.address} className={css.settingLabel} />
                  </div>
                  <button
                    type="button"
                    className={css.clearBtn}
                    onClick={() => handleRemoveEmail(tp.address)}
                    aria-label={t('common.remove')}
                  >
                    <XIcon size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {emails.length === 0 && (
            <p className={css.settingNote}>{t('settings.account.noEmails')}</p>
          )}

          {verifying ? (
            <div className={css.fieldGroup}>
              <p className={css.settingNote}>{t('settings.account.checkEmail')}</p>
              <Input
                label={t('settings.account.validationCode')}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className={css.inputFull}
                disabled={adding}
              />
              {error && <p className={css.warningBox}>{error}</p>}
              <div className={css.actions}>
                <Button variant="primary" loading={adding} onClick={handleVerifyToken}>
                  {t('settings.account.verify')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setVerifying(false);
                    setToken('');
                    setSid('');
                    setError('');
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <div className={css.flexRow}>
              <div className={css.flexOne}>
                <Input
                  placeholder={t('settings.account.emailPlaceholder')}
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className={css.inputFull}
                  disabled={adding}
                />
              </div>
              <Button variant="primary" loading={adding} onClick={handleAddEmail}>
                {t('settings.account.addEmail')}
              </Button>
            </div>
          )}
          {error && !verifying && <p className={css.warningBox}>{error}</p>}
        </>
      )}
    </div>
  );
}
