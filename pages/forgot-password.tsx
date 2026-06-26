import { useCallback, useEffect, useRef, useState } from 'react';
import type {} from 'altcha';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from '../styles/Login.module.css';
import PasswordInput from '../components/PasswordInput';
import { notifyError, notifySuccess } from '@/utils/notify';
import { getApiBaseUrl } from '@/utils/network';

interface ApiResponse {
  success: boolean;
  message: string;
  data?: {
    requireTOTP?: boolean;
    email?: string;
    needsSetup?: boolean;
    qrCodeUrl?: string;
    pairUrl?: string;
    secret?: string;
    verified?: boolean;
    emailCodeSent?: boolean;
    emailVerified?: boolean;
  };
}

interface CaptchaVerificationResponse {
  success: boolean;
  message?: string;
  data?: {
    verified?: boolean;
  };
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const API_BASE_URL = getApiBaseUrl();
  const BROWSER_ID_KEY = 'intruder_browser_id';

  const [accountEmail, setAccountEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showNotFoundWarningIcon, setShowNotFoundWarningIcon] = useState(false);
  const [showAltchaCaptcha, setShowAltchaCaptcha] = useState(false);
  const [altchaReady, setAltchaReady] = useState(false);
  const [altchaVerifying, setAltchaVerifying] = useState(false);
  const [altchaWidgetKey, setAltchaWidgetKey] = useState(0);
  const [captchaTimerText, setCaptchaTimerText] = useState('Protected');
  const [captchaStatusMessage, setCaptchaStatusMessage] = useState('');
  const [pendingSendRequest, setPendingSendRequest] = useState(false);
  const altchaWidgetRef = useRef<HTMLElement | null>(null);

  // Admin TOTP flow state
  const [step, setStep] = useState<'account' | 'totp' | 'email' | 'password'>('account');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [, setPairUrl] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const getBrowserId = useCallback(() => {
    if (typeof window === 'undefined') return 'server_browser';
    try {
      const existing = localStorage.getItem(BROWSER_ID_KEY);
      if (existing && /^[A-Za-z0-9_-]{8,45}$/.test(existing)) return existing;

      const generated = (window.crypto && typeof window.crypto.randomUUID === 'function')
        ? window.crypto.randomUUID().replace(/-/g, '')
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
      const browserId = generated.slice(0, 45);
      localStorage.setItem(BROWSER_ID_KEY, browserId);
      return browserId;
    } catch {
      return `anon_${Date.now().toString(36)}`;
    }
  }, [BROWSER_ID_KEY]);

  const getRawFetch = useCallback(() => {
    return fetch;
  }, []);

  useEffect(() => {
    const q = router.query.email;
    if (typeof q === 'string' && q.trim()) setAccountEmail(q.trim());
  }, [router.query.email]);

  useEffect(() => {
    if (!error) return;
    void notifyError(error);
    setError(null);
  }, [error]);

  useEffect(() => {
    if (!success) return;
    void notifySuccess(success);
    setSuccess(null);
  }, [success]);

  useEffect(() => {
    let isActive = true;
    void import('altcha')
      .then(() => {
        if (isActive) setAltchaReady(true);
      })
      .catch(() => {
        if (isActive) {
          setCaptchaStatusMessage('ALTCHA failed to load. Refresh and try again.');
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const openAltchaCaptcha = useCallback(() => {
    setShowAltchaCaptcha(true);
    setCaptchaTimerText('Ready');
    setCaptchaStatusMessage('Complete ALTCHA to continue.');
    setAltchaWidgetKey((current) => current + 1);
  }, []);

  const closeAltchaCaptcha = useCallback(() => {
    if (altchaVerifying) return;
    setShowAltchaCaptcha(false);
    setPendingSendRequest(false);
    setCaptchaTimerText('Protected');
    setCaptchaStatusMessage('ALTCHA was canceled.');
  }, [altchaVerifying]);

  const refreshAltchaWidget = useCallback(() => {
    if (altchaVerifying) return;
    setCaptchaTimerText('Refreshing');
    setCaptchaStatusMessage('Requesting a new ALTCHA challenge...');
    setAltchaWidgetKey((current) => current + 1);
  }, [altchaVerifying]);

  const requestForgotPassword = useCallback(async () => {
    const v = accountEmail.trim();
    if (!v) return;

    setLoading(true);
    try {
      const rawFetch = getRawFetch();
      const res = await rawFetch(`${API_BASE_URL}/auth.php?action=forgot_password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Browser-ID': getBrowserId(),
        },
        credentials: 'include',
        body: JSON.stringify({ email: v }),
      });

      const data: ApiResponse = await res.json();

      if (data.success) {
        if (data.data?.requireTOTP) {
          // Admin -> keep existing TOTP + email flow
          setNeedsSetup(!!data.data.needsSetup);
          setQrCodeUrl(data.data.qrCodeUrl || null);
          setPairUrl(data.data.pairUrl || null);
          setTotpSecret(data.data.secret || null);
          setStep('totp');
        } else {
          setSuccess(data.message || 'If the account exists, a password reset email has been sent.');
        }
      } else if (res.status === 404) {
        setError(null);
        setShowNotFoundWarningIcon(true);
      } else {
        const msg = data.message || 'Request failed.';
        setError(msg);
      }
    } catch (err) {
      console.error(err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL, accountEmail, getBrowserId, getRawFetch]);

  const verifyForgotAltchaPayload = useCallback(async (payload: string) => {
    if (!payload || !pendingSendRequest || altchaVerifying) return;
    setAltchaVerifying(true);
    setCaptchaTimerText('Verifying');
    setCaptchaStatusMessage('Validating ALTCHA...');

    try {
      const rawFetch = getRawFetch();
      const res = await rawFetch(`${API_BASE_URL}/altcha.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          payload,
          scope: 'forgot_password',
        }),
      });

      const data = await res.json() as CaptchaVerificationResponse;
      if (!res.ok || !data.success || !data.data?.verified) {
        throw new Error(data.message || 'ALTCHA verification failed.');
      }

      setCaptchaTimerText('Verified');
      setCaptchaStatusMessage('ALTCHA verified. Sending request...');
      setShowAltchaCaptcha(false);
      setPendingSendRequest(false);
      await requestForgotPassword();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ALTCHA verification failed.';
      setCaptchaTimerText('Retry required');
      setCaptchaStatusMessage(msg);
    } finally {
      setAltchaVerifying(false);
    }
  }, [API_BASE_URL, altchaVerifying, getRawFetch, pendingSendRequest, requestForgotPassword]);

  useEffect(() => {
    if (!showAltchaCaptcha || !altchaReady) return;
    const widget = altchaWidgetRef.current;
    if (!widget) return;

    const handleStateChange = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: string }>).detail;
      const state = String(detail?.state ?? '').toLowerCase();

      if (state === 'verifying') {
        setCaptchaTimerText('Solving');
        setCaptchaStatusMessage('ALTCHA is solving the challenge...');
      } else if (state === 'verified') {
        setCaptchaTimerText('Verifying');
        setCaptchaStatusMessage('Validating ALTCHA...');
      } else if (state === 'expired') {
        setCaptchaTimerText('Expired');
        setCaptchaStatusMessage('ALTCHA expired. Refresh the challenge and try again.');
      } else if (state === 'error') {
        setCaptchaTimerText('Error');
        setCaptchaStatusMessage('ALTCHA failed. Refresh and try again.');
      } else {
        setCaptchaTimerText('Ready');
      }
    };

    const handleVerified = (event: Event) => {
      const detail = (event as CustomEvent<{ payload?: string }>).detail;
      if (typeof detail?.payload === 'string' && detail.payload) {
        void verifyForgotAltchaPayload(detail.payload);
      }
    };

    widget.addEventListener('statechange', handleStateChange as EventListener);
    widget.addEventListener('verified', handleVerified as EventListener);

    return () => {
      widget.removeEventListener('statechange', handleStateChange as EventListener);
      widget.removeEventListener('verified', handleVerified as EventListener);
    };
  }, [altchaReady, showAltchaCaptcha, altchaWidgetKey, verifyForgotAltchaPayload]);

  // Step 1: Submit email - show captcha before request
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setShowNotFoundWarningIcon(false);

    const v = accountEmail.trim();
    if (!v) {
      setError('Please enter your email.');
      return;
    }

    setPendingSendRequest(true);
    openAltchaCaptcha();
  };

  // Step 2: Verify TOTP code only
  const handleVerifyTOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cleanPin = pin.trim().replace(/\D/g, '');
    if (cleanPin.length !== 6) {
      setError('Enter a valid 6-digit authenticator code.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth.php?action=forgot_password_verify_totp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: accountEmail.trim(),
          pin: cleanPin,
        }),
      });

      const data: ApiResponse = await res.json();

      if (data.success) {
        setStep('email');
        setEmailCode('');
        setSuccess(null);
        setError(null);
      } else {
        setError(data.message || 'Invalid code.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Verify email code sent after authenticator verification
  const handleVerifyEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cleanEmailCode = emailCode.trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (cleanEmailCode.length !== 6) {
      setError('Enter the 6-letter code sent to your admin email.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth.php?action=forgot_password_verify_email_code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: accountEmail.trim(),
          emailCode: cleanEmailCode,
        }),
      });

      const data: ApiResponse = await res.json();

      if (data.success) {
        setStep('password');
        setError(null);
        setSuccess(null);
      } else {
        setError(data.message || 'Invalid email verification code.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Submit new password after authenticator + email code verification
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth.php?action=forgot_password_totp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: accountEmail.trim(),
          newPassword,
        }),
      });

      const data: ApiResponse = await res.json();

      if (data.success) {
        setSuccess(data.message || 'Password reset successfully. Redirecting to login...');
        setStep('account');
        setPin('');
        setEmailCode('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => router.push('/'), 1500);
      } else {
        const lower = (data.message || '').toLowerCase();
        if (lower.includes('authenticator')) {
          setError((data.message || 'Authenticator verification expired.') + ' Please verify again.');
          setStep('totp');
          setPin('');
          setEmailCode('');
        } else if (lower.includes('email code')) {
          setError((data.message || 'Email code verification expired.') + ' Please verify your email code again.');
          setStep('email');
          setEmailCode('');
        } else {
          setError(data.message || 'Reset failed.');
        }
      }
    } catch (err) {
      console.error(err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setStep('account');
    setError(null);
    setSuccess(null);
    setShowNotFoundWarningIcon(false);
    setPendingSendRequest(false);
    setShowAltchaCaptcha(false);
    setCaptchaTimerText('Protected');
    setCaptchaStatusMessage('');
    setPin('');
    setEmailCode('');
    setNewPassword('');
    setConfirmPassword('');
    setNeedsSetup(false);
    setQrCodeUrl(null);
    setPairUrl(null);
    setTotpSecret(null);
  };

  const getTitle = () => {
    switch (step) {
      case 'totp': return needsSetup ? 'Set up Authenticator' : 'Verify Authenticator';
      case 'email': return 'Verify Email Code';
      case 'password': return 'Set new password';
      default: return 'Forgot password';
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'transparent', position: 'relative' }}>
      <Head>
        <title>Forgot Password</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage: "url('/login-background.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          zIndex: -2,
        }}
      />
      <div aria-hidden style={{ position: 'fixed', inset: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.45), rgba(0,0,0,0.25))', zIndex: -1 }} />

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div className={styles.card} style={{ width: '100%', maxWidth: 440, opacity: 0.9, position: 'relative', overflow: 'hidden' }}>
          <div className={styles.header}>
            <h1 style={{ lineHeight: 1.2, fontSize: '14px' }}>{getTitle()}</h1>

            {/* Step indicator for admin TOTP flow */}
            {step !== 'account' && (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8 }}>
                {['Verify', 'Email', 'Password'].map((label, i) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: (step === 'totp' && i === 0) || (step === 'email' && i <= 1) || (step === 'password' && i <= 2)
                        ? ((step === 'email' && i === 0) || (step === 'password' && i <= 1) ? '#059669' : '#1e3a8a')
                        : '#d1d5db',
                      color: '#fff',
                      fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {i + 1}
                    </div>
                    <span style={{ fontSize: 11, color: '#374151' }}>{label}</span>
                    {i < 2 && <div style={{ width: 20, height: 1, background: '#d1d5db', margin: '0 2px' }} />}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ====== STEP 1: Email ====== */}
          {step === 'account' && (
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="accountEmail">Email</label>
                <input
                  className={styles.input}
                  id="accountEmail"
                  type="email"
                  value={accountEmail}
                  onChange={(e) => {
                    setAccountEmail(e.target.value);
                    setShowNotFoundWarningIcon(false);
                  }}
                  placeholder="Enter your email"
                  disabled={loading}
                />
              </div>

              {showNotFoundWarningIcon && (
                <div className={styles.warningIconOnly} role="alert" aria-label="Email not found">
                  <span className={styles.warningIconBadge} aria-hidden="true">!</span>
                </div>
              )}
              <button type="submit" className={styles.loginButton} disabled={loading}>
                {loading ? 'Checking...' : 'Send'}
              </button>

              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  disabled={loading}
                  style={{
                    background: 'transparent', border: 'none', color: '#1e3a8a',
                    cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13,
                  }}
                >
                  Back to login
                </button>
              </div>
            </form>
          )}

          {/* ====== STEP 2: TOTP Verification (admin only) ====== */}
          {step === 'totp' && (
            <form className={styles.form} onSubmit={handleVerifyTOTP}>
              {/* QR Setup panel if first time */}
              {needsSetup && (
                <div style={{
                  background: '#f0f4ff',
                  border: '1px solid #c7d2fe',
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                }}>
                  <p style={{ fontSize: 12, color: '#1e3a8a', fontWeight: 600, margin: '0 0 8px 0' }}>
                    First time? Scan this QR code with Google Authenticator:
                  </p>

                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    {qrCodeUrl && (
                      <div style={{
                        background: '#fff', border: '1px solid #d1d5db',
                        borderRadius: 8, padding: 6, display: 'inline-block',
                      }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrCodeUrl} alt="QR Code" width={150} height={150} style={{ display: 'block' }} />
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 140 }}>
                      <p style={{ margin: '0 0 6px 0', fontSize: 12, color: '#374151' }}>
                        1. Open <strong>Google Authenticator</strong>
                      </p>
                      <p style={{ margin: '0 0 6px 0', fontSize: 12, color: '#374151' }}>
                        2. Tap <strong>+</strong> → <strong>Scan QR code</strong>
                      </p>
                      <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#374151' }}>
                        3. Enter the 6-digit code below
                      </p>

                      {totpSecret && (
                        <div>
                          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Manual key:</div>
                          <code style={{
                            display: 'inline-block', background: '#fff', border: '1px solid #d1d5db',
                            borderRadius: 4, padding: '3px 6px', fontSize: 11, letterSpacing: 1.5,
                            fontFamily: 'monospace', color: '#111827', userSelect: 'all',
                          }}>
                            {totpSecret}
                          </code>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!needsSetup && (
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px 0' }}>
                  Enter the 6-digit code from your Google Authenticator app.
                </p>
              )}

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="totpPin">Authenticator code</label>
                <input
                  className={styles.input}
                  id="totpPin"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  disabled={loading}
                  autoFocus
                  style={{ letterSpacing: 6, textAlign: 'center', fontFamily: 'monospace', fontSize: 14 }}
                />
              </div>

              <button
                type="submit"
                className={styles.loginButton}
                disabled={loading || pin.length !== 6}
                style={{ opacity: (loading || pin.length !== 6) ? 0.6 : 1 }}
              >
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>

              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <button
                  type="button"
                  onClick={resetAll}
                  disabled={loading}
                  style={{
                    background: 'transparent', border: 'none', color: '#1e3a8a',
                    cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13,
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  disabled={loading}
                  style={{
                    background: 'transparent', border: 'none', color: '#1e3a8a',
                    cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13,
                  }}
                >
                  Back to login
                </button>
              </div>
            </form>
          )}

          {/* ====== STEP 3: Email Code Verification ====== */}
          {step === 'email' && (
            <form className={styles.form} onSubmit={handleVerifyEmailCode}>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px 0' }}>
                Enter the 6-letter code sent to your admin email.
              </p>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="adminEmailCode">Email code</label>
                <input
                  className={styles.input}
                  id="adminEmailCode"
                  type="text"
                  maxLength={6}
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6))}
                  placeholder="ABCDEF"
                  disabled={loading}
                  autoFocus
                  style={{ letterSpacing: 4, textAlign: 'center', fontFamily: 'monospace', fontSize: 14 }}
                />
              </div>

              <button
                type="submit"
                className={styles.loginButton}
                disabled={loading || emailCode.trim().length !== 6}
                style={{ opacity: (loading || emailCode.trim().length !== 6) ? 0.6 : 1 }}
              >
                {loading ? 'Verifying...' : 'Verify Email Code'}
              </button>

              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    setStep('totp');
                    setEmailCode('');
                    setError(null);
                    setSuccess(null);
                  }}
                  disabled={loading}
                  style={{
                    background: 'transparent', border: 'none', color: '#1e3a8a',
                    cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13,
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={resetAll}
                  disabled={loading}
                  style={{
                    background: 'transparent', border: 'none', color: '#1e3a8a',
                    cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13,
                  }}
                >
                  Start over
                </button>
              </div>
            </form>
          )}

          {/* ====== STEP 4: New Password (after TOTP + email verified) ====== */}
          {step === 'password' && (
            <form className={styles.form} onSubmit={handleResetPassword}>
              <div style={{
                background: '#ecfdf5',
                border: '1px solid #86efac',
                borderRadius: 8,
                padding: '8px 12px',
                marginBottom: 12,
                fontSize: 13,
                color: '#065f46',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span>OK</span> Authenticator and email code verified. Enter your new password.
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="newPassword">New password</label>
                <PasswordInput
                  className={styles.input}
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  disabled={loading}
                  autoFocus
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="confirmPassword">Confirm password</label>
                <PasswordInput
                  className={styles.input}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  disabled={loading}
                />
              </div>

              <button type="submit" className={styles.loginButton} disabled={loading}>
                {loading ? 'Resetting...' : 'Reset password'}
              </button>

              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <button
                  type="button"
                  onClick={resetAll}
                  disabled={loading}
                  style={{
                    background: 'transparent', border: 'none', color: '#1e3a8a',
                    cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13,
                  }}
                >
                  Start over
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  disabled={loading}
                  style={{
                    background: 'transparent', border: 'none', color: '#1e3a8a',
                    cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13,
                  }}
                >
                  Back to login
                </button>
              </div>
            </form>
          )}

          <div className={styles.footer}>
            <p>
              &copy; 2026 LLB Accountants. All rights reserved.{' '}
              <Link href="/privacy-policy" style={{ color: '#5568d3', textDecoration: 'underline' }}>
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
      {showAltchaCaptcha && (
        <div className={styles.orbitCaptchaOverlay} role="dialog" aria-modal="true" aria-labelledby="forgot-altcha-title">
          <div className={styles.orbitCaptchaCard}>
            <button
              type="button"
              className={styles.orbitCaptchaCloseBtn}
              onClick={closeAltchaCaptcha}
              aria-label="Close captcha"
              title="Close captcha"
              disabled={altchaVerifying}
            >
              ✕
            </button>

            <div className={styles.orbitCaptchaHeader}>
              <span className={styles.orbitCaptchaEyebrow}>Security Verification</span>
              <h2 id="forgot-altcha-title" className={styles.orbitCaptchaTitle}>ALTCHA Verification</h2>
              <p className={styles.orbitCaptchaInstruction}>
                Complete ALTCHA to continue your forgot-password request.
              </p>
            </div>

            <div className={styles.orbitCaptchaStatusRow}>
              <span className={styles.captchaTimer}>{captchaTimerText}</span>
              <button
                type="button"
                className={styles.refreshButton}
                onClick={refreshAltchaWidget}
                disabled={altchaVerifying}
                title="Refresh ALTCHA"
              >
                ↻
              </button>
            </div>

            <div
              style={{
                borderRadius: 20,
                border: '1px solid rgba(148, 163, 184, 0.22)',
                background: 'rgba(15, 23, 42, 0.34)',
                padding: 18,
                minHeight: 160,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {altchaReady ? (
                <div key={altchaWidgetKey} style={{ display: 'contents' }}>
                <altcha-widget
                  ref={altchaWidgetRef}
                  challengeurl={`${API_BASE_URL}/altcha.php?scope=forgot_password`}
                  credentials="include"
                  auto="onload"
                  style={{
                    width: '100%',
                    maxWidth: '420px',
                    '--altcha-border-width': '0px',
                    '--altcha-color-base': '#0f172a',
                    '--altcha-color-border': 'rgba(148, 163, 184, 0.35)',
                    '--altcha-color-text': '#e2e8f0',
                    '--altcha-color-text-light': '#cbd5e1',
                    '--altcha-max-width': '100%',
                  } as any}
                />
                </div>
              ) : (
                <div style={{ color: '#cbd5e1', fontSize: 14 }}>Loading ALTCHA...</div>
              )}
            </div>

            <div className={styles.physicsStatus}>
              {captchaStatusMessage}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
