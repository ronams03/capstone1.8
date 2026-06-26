import { useState, useEffect, useCallback, useRef } from 'react';
import type { } from 'altcha';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '@/components/AuthProvider';
import styles from '../styles/Login.module.css';
import { getApiBaseUrl } from '@/utils/network';
import { notifyError, notifySuccess } from '@/utils/notify';
import { warmRoute } from '@/utils/routeWarmup';
import type { SessionUser } from '@/components/AuthProvider';
import Swal from 'sweetalert2';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

type LoginResponse = ApiResponse<{
  id: number;
  role: string;
  username: string;
  must_reset_password?: number | string;
  password_change_reason?: string;
  password_status?: {
    expired?: boolean;
    requires_change?: boolean;
    reason?: string;
    days_remaining?: number | null;
    password_expires_at?: string | null;
  };
}>;

type LoginErrorResponse = {
  success: boolean;
  message: string;
  errors?: {
    attempts_remaining?: number | null;
    failed_attempts?: number | null;
    lockout_threshold?: number | null;
    lockout_triggered?: boolean;
  };
};

type PublicLoginCaptchaSettingsResponse = ApiResponse<{
  login_math_captcha_enabled?: boolean;
  captcha_timeout_seconds?: number;
  login_failed_attempt_limit?: number;
}>;

type CaptchaVerificationResponse = ApiResponse<{
  success?: boolean;
}>;

type LoginNetworkSnapshot = {
  online?: boolean;
  effective_type?: string;
  downlink?: number;
  rtt?: number;
};

type AltchaWidgetStyle = {
  width?: string;
  maxWidth?: string;
  '--altcha-border-width'?: string;
  '--altcha-color-base'?: string;
  '--altcha-color-border'?: string;
  '--altcha-color-text'?: string;
  '--altcha-color-text-light'?: string;
  '--altcha-max-width'?: string;
};

type LoginPrecheckResponse = ApiResponse<{
  captcha_required?: boolean;
  captcha_mode?: 'altcha' | 'auto';
  expires_in?: number;
  auto_check_delay_ms?: number;
  risk_score?: number;
  manual_reason?: string;
}>;

class LoginRequestError extends Error {
  attemptsRemaining: number | null;

  constructor(message: string, attemptsRemaining?: number | null) {
    super(message);
    this.name = 'LoginRequestError';
    this.attemptsRemaining = typeof attemptsRemaining === 'number' ? attemptsRemaining : null;
  }
}

function getRememberedEmail() {
  if (typeof window === 'undefined') return '';

  try {
    return localStorage.getItem('remember_email') || localStorage.getItem('remember_username') || '';
  } catch {
    return '';
  }
}

function buildUnexpectedApiResponseMessage(fallbackMessage: string, status: number, body: string): string {
  const normalizedBody = body.replace(/\s+/g, ' ').trim();
  const preview = normalizedBody.slice(0, 120);
  const looksHtml = /^<!doctype html\b|^<html\b|^</i.test(normalizedBody);

  if (looksHtml) {
    return `${fallbackMessage} The server returned HTML instead of JSON (HTTP ${status}). This usually means the tunnel is not reaching the PHP backend route correctly.`;
  }

  if (preview) {
    return `${fallbackMessage} Server response preview: ${preview}`;
  }

  return `${fallbackMessage} HTTP ${status}.`;
}

async function readJsonResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  const body = await res.text();

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(buildUnexpectedApiResponseMessage(fallbackMessage, res.status, body));
  }
}

function getLoginNetworkSnapshot(): LoginNetworkSnapshot {
  if (typeof window === 'undefined') {
    return {};
  }

  const nav = window.navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
    };
  };

  const connection = nav.connection;
  const downlink = connection?.downlink;
  const rtt = connection?.rtt;

  return {
    online: typeof nav.onLine === 'boolean' ? nav.onLine : undefined,
    effective_type: typeof connection?.effectiveType === 'string' ? connection.effectiveType : undefined,
    downlink: typeof downlink === 'number' && Number.isFinite(downlink) ? downlink : undefined,
    rtt: typeof rtt === 'number' && Number.isFinite(rtt) ? rtt : undefined,
  };
}

function shouldFallbackToManualCaptcha(error: unknown): boolean {
  if (typeof window !== 'undefined' && window.navigator.onLine === false) {
    return true;
  }

  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  return /network|failed to fetch|offline|html instead of json|tunnel|server network verification is unavailable|internet validation is unavailable|timed out|connection/i.test(message);
}

export default function Login() {
  const router = useRouter();
  const { refreshSession, setSessionUser } = useAuth();
  const assetBasePath = router.basePath || '';
  const [email, setEmail] = useState(getRememberedEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(() => Boolean(getRememberedEmail()));
  const [rememberPulse, setRememberPulse] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [captchaTimerText, setCaptchaTimerText] = useState('Protected');
  const [captchaStatusMessage, setCaptchaStatusMessage] = useState('');
  const [loginMathCaptchaEnabled, setLoginMathCaptchaEnabled] = useState(true);
  const [captchaSettingsReady, setCaptchaSettingsReady] = useState(false);
  const [showAltchaCaptcha, setShowAltchaCaptcha] = useState(false);
  const [altchaVerifying, setAltchaVerifying] = useState(false);
  const [altchaWidgetKey, setAltchaWidgetKey] = useState(0);
  const [altchaReady, setAltchaReady] = useState(false);
  const altchaWidgetRef = useRef<HTMLElement | null>(null);

  const loginTitleLines = [
    'REAL TIME WORKFLOW, ACTIVITY LOG',
    'IN PAYROLL MANAGEMENT SYSTEM',
    'WITH INTEGRATED ANALYTICS',
    'FOR ACCOUNTING',
    'FIRMS',
  ];
  const reverseTriangleLineWidths = ['100%', '84%', '68%', '52%', '36%'];
  const reverseTriangleFontSizes = [
    '18px',
    '17px',
    '16px',
    '14px',
    '12px',
  ];

  // API Base URL
  const API_BASE_URL = getApiBaseUrl();

  const getRawFetch = useCallback(() => {
    if (typeof window !== 'undefined' && typeof window.__nativeFetch === 'function') {
      return window.__nativeFetch.bind(window);
    }
    return fetch;
  }, []);

  useEffect(() => {
    let isActive = true;

    void import('altcha')
      .then(() => {
        if (isActive) {
          setAltchaReady(true);
        }
      })
      .catch(() => {
        if (isActive) {
          setCaptchaStatusMessage('Verification failed. Refresh and try again.');
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    void notifyError(error);
  }, [error]);

  useEffect(() => {
    if (!success) return;
    void notifySuccess(success);
  }, [success]);

  useEffect(() => {
    let isActive = true;
    const rawFetch = getRawFetch();

    const fetchLoginCaptchaSettings = async () => {
      try {
        const res = await rawFetch(`${API_BASE_URL}/settings_api.php?action=public_login_captcha_settings`, {
          method: 'GET',
        });
        const data = await readJsonResponse<PublicLoginCaptchaSettingsResponse>(
          res,
          'Failed to read the captcha settings.'
        );
        if (!isActive) return;
        if (res.ok && data.success && data.data) {
          setLoginMathCaptchaEnabled(Boolean(data.data.login_math_captcha_enabled ?? true));
        }
      } catch {
        if (!isActive) return;
        setLoginMathCaptchaEnabled(true);
      } finally {
        if (isActive) {
          setCaptchaSettingsReady(true);
        }
      }
    };

    void fetchLoginCaptchaSettings();

    return () => {
      isActive = false;
    };
  }, [API_BASE_URL, getRawFetch]);

  useEffect(() => {
    if (!captchaSettingsReady) return;

    const timer = window.setTimeout(() => {
      if (!loginMathCaptchaEnabled) {
        setCaptchaLoading(false);
        setCaptchaVerified(true);
        setCaptchaTimerText('Captcha disabled');
        setCaptchaStatusMessage('');
        setShowAltchaCaptcha(false);
        return;
      }

      setCaptchaLoading(false);
      setCaptchaVerified(false);
      setCaptchaTimerText('Protected');
      setCaptchaStatusMessage('ALTCHA will appear after you enter your credentials and press Login.');
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [captchaSettingsReady, loginMathCaptchaEnabled]);

  const persistRememberPreference = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        if (remember) {
          localStorage.setItem('remember_email', email);
          localStorage.removeItem('remember_username');
        } else {
          localStorage.removeItem('remember_email');
          localStorage.removeItem('remember_username');
        }
      }
    } catch {
      // Ignore storage persistence errors.
    }
  }, [email, remember]);

  const performLogin = useCallback(async () => {
    const rawFetch = getRawFetch();

    const res = await rawFetch(`${API_BASE_URL}/auth.php?action=login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const data = await readJsonResponse<LoginResponse | LoginErrorResponse>(
      res,
      'Login failed because the server returned an unexpected response.'
    );

    if (!res.ok || !data.success) {
      const errorPayload = data as LoginErrorResponse;
      throw new LoginRequestError(
        errorPayload.message || 'Invalid email or password.',
        errorPayload.errors?.attempts_remaining
      );
    }

    return data as LoginResponse;
  }, [API_BASE_URL, email, getRawFetch, password]);

  const performLoginPrecheck = useCallback(async () => {
    const rawFetch = getRawFetch();

    const res = await rawFetch(`${API_BASE_URL}/auth.php?action=login_precheck`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        email,
        password,
        network: getLoginNetworkSnapshot(),
      }),
    });

    const data = await readJsonResponse<LoginPrecheckResponse | LoginErrorResponse>(
      res,
      'Credential check failed because the server returned an unexpected response.'
    );

    if (!res.ok || !data.success) {
      const errorPayload = data as LoginErrorResponse;
      throw new LoginRequestError(
        errorPayload.message || 'Invalid email or password.',
        errorPayload.errors?.attempts_remaining
      );
    }

    return data as LoginPrecheckResponse;
  }, [API_BASE_URL, email, getRawFetch, password]);

  const performLoginComplete = useCallback(async () => {
    const rawFetch = getRawFetch();

    const res = await rawFetch(`${API_BASE_URL}/auth.php?action=login_complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({}),
    });

    const data = await readJsonResponse<LoginResponse | LoginErrorResponse>(
      res,
      'Login could not be completed because the server returned an unexpected response.'
    );

    if (!res.ok || !data.success) {
      const errorPayload = data as LoginErrorResponse;
      throw new LoginRequestError(
        errorPayload.message || 'Login could not be completed.',
        errorPayload.errors?.attempts_remaining
      );
    }

    return data as LoginResponse;
  }, [API_BASE_URL, getRawFetch]);

  const completeSuccessfulLogin = useCallback(async (data: LoginResponse) => {
    persistRememberPreference();

    const role = String(data.data.role || '').toLowerCase();
    const mustResetPassword = Number(data?.data?.must_reset_password ?? 0) === 1;
    const passwordChangeReason = String(data?.data?.password_change_reason || 'expired').trim();
    const nextRaw = typeof router.query.next === 'string' ? router.query.next : '';
    const hasSafeNext = nextRaw.startsWith('/') && !nextRaw.startsWith('//');
    const nextPath = mustResetPassword
      ? passwordChangeReason === 'first_login'
        ? '/reset-password?mode=first_login'
        : `/change-password?reason=${passwordChangeReason === 'expired' ? 'expired' : 'manual'}`
      : hasSafeNext
        ? nextRaw
        : role === 'admin'
          ? '/admin/dashboard'
          : role === 'manager'
            ? '/manager/dashboard'
            : '/dashboard';

    warmRoute(router, nextPath);
    setSuccess(data.message || 'Login successful.');
    setSessionUser(data.data as SessionUser);

    void refreshSession({ force: true });
    void router.replace(nextPath);
  }, [persistRememberPreference, refreshSession, router, setSessionUser]);

  const handleLoginError = useCallback((err: unknown) => {
    console.error('Login error:', err);

    if (err instanceof LoginRequestError && typeof err.attemptsRemaining === 'number' && err.attemptsRemaining > 0) {
      const label = err.attemptsRemaining === 1 ? 'attempt' : 'attempts';
      void Swal.fire({
        icon: 'warning',
        title: 'Wrong Password',
        html: `<p style="font-size:13px;color:#475569;margin:0">Invalid email or password.<br/><strong>${err.attemptsRemaining} ${label}</strong> remaining before your account is locked.</p>`,
        timer: 3000,
        timerProgressBar: true,
        showConfirmButton: false,
        background: '#ffffff',
        color: '#0f172a',
      });
    } else {
      setError(err instanceof Error ? err.message : 'Network error. Please try again.');
    }
  }, []);

  const refreshAltchaWidget = useCallback((message = 'Requesting a new ALTCHA challenge...') => {
    setCaptchaVerified(false);
    setCaptchaLoading(true);
    setCaptchaTimerText('Loading ALTCHA');
    setCaptchaStatusMessage(message);
    setAltchaWidgetKey((current) => current + 1);
  }, []);

  const activateManualCaptchaFallback = useCallback((reason?: string) => {
    const fallbackMessage = reason || 'Network signal is unstable. Complete ALTCHA to continue login.';
    setShowAltchaCaptcha(true);
    setCaptchaVerified(false);
    setCaptchaLoading(true);
    setCaptchaTimerText('Manual check');
    setCaptchaStatusMessage(fallbackMessage);
    setAltchaWidgetKey((current) => current + 1);
    setLoading(false);
  }, []);

  const verifyAltchaPayload = useCallback(async (payload: string) => {
    if (!payload || altchaVerifying) return;

    const rawFetch = getRawFetch();
    setAltchaVerifying(true);
    setCaptchaLoading(true);
    setCaptchaTimerText('Verifying');
    setCaptchaStatusMessage('Validating ALTCHA with the server...');

    try {
      const res = await rawFetch(`${API_BASE_URL}/captcha.php?action=altcha_verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ payload }),
      });

      const data = await readJsonResponse<CaptchaVerificationResponse>(res, 'Failed to verify ALTCHA.');

      if (!res.ok || !data.success || !data.data?.success) {
        throw new Error(data.message || 'ALTCHA verification failed.');
      }

      setCaptchaVerified(true);
      setCaptchaTimerText('Verified');
      setCaptchaStatusMessage('Captcha solved. Finishing login...');
      setShowAltchaCaptcha(false);
      void notifySuccess('ALTCHA verified!', 1000);
      setLoading(true);

      const loginData = await performLoginComplete();
      await completeSuccessfulLogin(loginData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify ALTCHA.';
      setCaptchaVerified(false);
      setCaptchaLoading(false);
      setCaptchaTimerText('Retry required');
      setCaptchaStatusMessage(message);

      if (/expired|session|locked|administrator/i.test(message)) {
        setShowAltchaCaptcha(false);
        setLoading(false);
        handleLoginError(err);
      } else {
        window.setTimeout(() => {
          refreshAltchaWidget('Requesting a new ALTCHA challenge...');
        }, 500);
      }
    } finally {
      setAltchaVerifying(false);
    }
  }, [API_BASE_URL, altchaVerifying, completeSuccessfulLogin, getRawFetch, handleLoginError, performLoginComplete, refreshAltchaWidget]);

  useEffect(() => {
    if (!showAltchaCaptcha || !altchaReady) return;

    const widget = altchaWidgetRef.current;
    if (!widget) return;

    const handleStateChange = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: string }>).detail;
      const state = String(detail?.state ?? '').toLowerCase();

      if (state === 'verifying') {
        setCaptchaLoading(true);
        setCaptchaTimerText('Solving...');
        setCaptchaStatusMessage('ALTCHA is solving the challenge...');
        return;
      }

      if (state === 'verified') {
        setCaptchaLoading(true);
        setCaptchaTimerText('Verifying');
        setCaptchaStatusMessage('Validating ALTCHA with the server...');
        return;
      }

      if (state === 'expired') {
        setCaptchaLoading(false);
        setCaptchaTimerText('Expired');
        setCaptchaStatusMessage('ALTCHA expired. Refresh the challenge to continue.');
        return;
      }

      if (state === 'error') {
        setCaptchaLoading(false);
        setCaptchaTimerText('Error');
        setCaptchaStatusMessage('ALTCHA could not be completed. Refresh the challenge and try again.');
        return;
      }

      setCaptchaLoading(false);
      setCaptchaTimerText('Ready');
      setCaptchaStatusMessage((current) => current || 'ALTCHA is ready. Complete the challenge to continue login.');
    };

    const handleVerified = (event: Event) => {
      const detail = (event as CustomEvent<{ payload?: string }>).detail;
      const payload = detail?.payload;
      if (typeof payload === 'string' && payload) {
        void verifyAltchaPayload(payload);
      }
    };

    widget.addEventListener('statechange', handleStateChange as EventListener);
    widget.addEventListener('verified', handleVerified as EventListener);

    return () => {
      widget.removeEventListener('statechange', handleStateChange as EventListener);
      widget.removeEventListener('verified', handleVerified as EventListener);
    };
  }, [altchaReady, showAltchaCaptcha, altchaWidgetKey, verifyAltchaPayload]);

  const isFormDisabled = loading;
  const normalizedCaptchaTimerText = captchaTimerText.toLowerCase();
  const isCaptchaExpired = normalizedCaptchaTimerText.includes('expired');
  const captchaTimerClassName = [
    styles.captchaTimer,
    isCaptchaExpired ? styles.captchaTimerExpired : '',
    !captchaVerified && !captchaLoading && !isCaptchaExpired ? styles.captchaTimerWarning : '',
  ].filter(Boolean).join(' ');
  const loginButtonBlocked = isFormDisabled
    || !captchaSettingsReady
    || showAltchaCaptcha
    || altchaVerifying;

  const handleCaptchaClose = useCallback(async () => {
    if (altchaVerifying) return;

    try {
      const rawFetch = getRawFetch();
      await rawFetch(`${API_BASE_URL}/captcha.php?action=altcha_verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dismissed: true }),
      });
    } catch {
      // Even if the request fails, still close the modal.
    }

    setShowAltchaCaptcha(false);
    setCaptchaVerified(false);
    setCaptchaLoading(false);
    setLoading(false);
    setCaptchaStatusMessage('ALTCHA dismissed. You may try again.');
    setCaptchaTimerText('Protected');
  }, [API_BASE_URL, altchaVerifying, getRawFetch]);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    if (!captchaSettingsReady) {
      setError('Security settings are still loading. Please wait a moment.');
      return;
    }

    setLoading(true);

    try {
      if (!loginMathCaptchaEnabled) {
        const data = await performLogin();
        await completeSuccessfulLogin(data);
        return;
      }

      setCaptchaVerified(false);
      setCaptchaStatusMessage('');
      const precheck = await performLoginPrecheck();

      const autoCheckDelayMs = Math.max(0, Math.min(5000, Number(precheck.data?.auto_check_delay_ms ?? 0)));
      setShowAltchaCaptcha(false);
      setCaptchaLoading(true);
      setCaptchaTimerText('Checking...');
      setCaptchaStatusMessage('Running server-side security checks...');

      await new Promise((resolve) => {
        window.setTimeout(resolve, autoCheckDelayMs);
      });

      setCaptchaVerified(true);
      setCaptchaTimerText('Verified');
      setCaptchaStatusMessage('Security check passed. Finishing login...');
      setCaptchaLoading(false);

      let loginData: LoginResponse | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          loginData = await performLoginComplete();
          break;
        } catch (completeError) {
          const message = completeError instanceof Error ? completeError.message : '';
          if (attempt === 0 && /still running|wait a moment|retry_after/i.test(message)) {
            await new Promise((resolve) => window.setTimeout(resolve, 500));
            continue;
          }
          throw completeError;
        }
      }

      if (!loginData) {
        throw new Error('Login could not be completed. Please try again.');
      }

      await completeSuccessfulLogin(loginData);
    } catch (err) {
      setShowAltchaCaptcha(false);
      setCaptchaLoading(false);
      handleLoginError(err);
      setLoading(false);
    }
  };

  const rightPaneStyle = {
    width: '46%',
    minWidth: 320,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  } as const;

  return (
    <div style={{ height: '100vh', display: 'flex', background: 'transparent', position: 'relative', overflow: 'hidden' }}>
      <Head>
        <title>{loginTitleLines.join(' ')}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>{`
          html, body, #__next {
            height: 100%;
            overflow: hidden;
          }
          @media (max-width: 820px) {
            .split-wrap { flex-direction: column; }
            .left-pane { width: 100% !important; clip-path: none !important; padding: 28px 16px !important; }
            .right-pane { width: 100% !important; }
          }
          .grecaptcha-badge,
          iframe[src*="recaptcha"],
          iframe[title*="reCAPTCHA"],
          iframe[title*="recaptcha"],
          div[aria-label*="reCAPTCHA"],
          div[aria-label*="recaptcha"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
          }
        `}</style>
      </Head>

      {/* Fullscreen background image */}
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

      <div className="split-wrap" style={{ display: 'flex', flex: 1, justifyContent: 'flex-start' }}>
        {/* Left reverse-triangle title pane */}
        <div
          className="left-pane"
          style={{
            width: '54%',
            minWidth: 320,
            background: 'linear-gradient(135deg, #1e3a8a 0%, #172554 100%)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 28px',
            position: 'relative',
            clipPath: 'polygon(0 0, 100% 0, 85% 100%, 0% 100%)', // Adjusted slightly for better space
            boxShadow: '10px 0 30px rgba(0,0,0,0.3)',
            zIndex: 1
          }}
        >
            <div style={{
              maxWidth: 520,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '32px',
              textAlign: 'center'
            }}>
              {/* 3D Realistic Logo */}
              <div style={{
                filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.6))',
                transformStyle: 'preserve-3d'
              }}>
                <Image
                  src={`${assetBasePath}/logo.png`}
                  alt="Logo"
                  width={180}
                  height={180}
                  priority
                  style={{
                    width: '188px',
                    height: 'auto',
                    display: 'block'
                  }}
                />
              </div>

              <h1
                style={{
                  margin: 0,
                  width: '100%',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  color: '#ffffff',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.18em',
                }}
              >
                {/* Reverse Triangle (Inverted Pyramid) — biggest at top, smallest at bottom */}
                {loginTitleLines.map((line, idx) => (
                  <span
                    key={idx}
                    style={{
                      width: reverseTriangleLineWidths[idx] || '36%',
                      fontSize: reverseTriangleFontSizes[idx] || '16px',
                      display: 'block',
                      whiteSpace: 'nowrap',
                      lineHeight: 1.08,
                      letterSpacing: idx <= 1 ? '0.055em' : '0.045em',
                      textShadow: '0 3px 12px rgba(0, 0, 0, 0.3)',
                    }}
                  >
                    {line}
                  </span>
                ))}
              </h1>
            </div>
        </div>

        {/* Right form pane */}
        <div className="right-pane" style={rightPaneStyle}>
          <div className={styles.flipShell} style={{ width: '100%', maxWidth: 380 }}>
            <div className={styles.flipCard}>
              <div className={[styles.flipFace, styles.flipFront].join(' ')}>
                <div className={styles.card} style={{ width: '100%', maxWidth: 380, position: 'relative', overflow: 'hidden' }}>
                  {loginMathCaptchaEnabled && (
                    <div className={styles.captchaRibbon} aria-label={captchaTimerText}>
                      <span className={styles.captchaRibbonIcon} aria-hidden="true">🛡️</span>
                      <span className={styles.captchaRibbonText}>{captchaTimerText}</span>
                    </div>
                  )}
                  <div className={styles.header}>
                    <h1>Welcome back</h1>
                  </div>

                  <form className={styles.form} onSubmit={handleLogin} noValidate>
                    {/* Email Field */}
                    <div className={styles.formGroup}>
                      <label className={styles.label} htmlFor="email">Email</label>
                      <div className={styles.fieldWrapper}>
                        <input
                          className={styles.input}
                          type="email"
                          id="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Enter your email"
                          disabled={isFormDisabled}
                        />
                      </div>
                    </div>

                    {/* Password Field */}
                    <div className={styles.formGroup}>
                      <label className={styles.label} htmlFor="password">Password</label>
                      <div className={`${styles.fieldWrapper} ${styles.passwordFieldWrapper}`}>
                        <input
                          className={styles.input}
                          type={showPassword ? 'text' : 'password'}
                          id="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          disabled={isFormDisabled}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((p) => !p)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          title={showPassword ? 'Hide password' : 'Show password'}
                          disabled={isFormDisabled}
                          className={styles.passwordToggle}
                        >
                          {showPassword ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.11 1 12c.74-1.64 1.82-3.1 3.17-4.28" />
                              <path d="M22.54 11.88A10.94 10.94 0 0 0 12 4c-1.61 0-3.13.31-4.5.86" />
                              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className={styles.formGroup} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151', fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={remember}
                            disabled={isFormDisabled}
                            onChange={(e) => {
                              const v = e.target.checked;
                              setRemember(v);
                              if (v) {
                                setRememberPulse(true);
                                setTimeout(() => setRememberPulse(false), 500);
                              }
                            }}
                          />
                          Remember me
                        </label>
                        <span
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            left: '110%',
                            marginLeft: 8,
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 11,
                            background: '#ecfdf5',
                            color: '#065f46',
                            border: '1px solid #34d399',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            opacity: rememberPulse ? 1 : 0,
                            transform: rememberPulse ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.98)',
                            transition: 'opacity 180ms ease, transform 180ms ease',
                            pointerEvents: 'none'
                          }}
                        >
                          Saved
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const e = (email || '').trim();
                          if (!e) {
                            setError('Enter your email first.');
                            return;
                          }
                          setError(null);
                          setSuccess(null);
                          router.push(`/forgot-password?email=${encodeURIComponent(e)}`);
                        }}
                        disabled={isFormDisabled}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#1e3a8a',
                          fontSize: 13,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: 0
                        }}
                      >
                        Forgot password?
                      </button>
                    </div>

                    <button
                      type="submit"
                      className={styles.loginButton}
                      data-login-button="true"
                      disabled={loginButtonBlocked}
                    >
                      {loading ? 'Logging in...' : 'Login'}
                    </button>
                  </form>

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
            </div>
          </div>
        </div>
      </div>

      {showAltchaCaptcha && (
        <div
          className={styles.orbitCaptchaOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="orbit-captcha-title"
          onClick={(e) => {
            // Click on the backdrop (not the card) to close
            if (e.target === e.currentTarget) {
              handleCaptchaClose();
            }
          }}
        >
          <div className={styles.orbitCaptchaCard}>
            <button
              type="button"
              className={styles.orbitCaptchaCloseBtn}
              onClick={() => void handleCaptchaClose()}
              aria-label="Close captcha"
              title="Close captcha"
            >
              ✕
            </button>

            <div className={styles.orbitCaptchaHeader}>
              <h2 id="orbit-captcha-title" className={styles.orbitCaptchaTitle}>ALTCHA</h2>
              <p className={styles.orbitCaptchaInstruction}>
                Complete verification to continue login.
              </p>
            </div>

            <div className={styles.orbitCaptchaStatusRow}>
              <span className={captchaTimerClassName}>{captchaTimerText}</span>
              <button
                type="button"
                className={styles.refreshButton}
                onClick={() => refreshAltchaWidget()}
                disabled={captchaLoading || altchaVerifying}
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
                  challengeurl={`${API_BASE_URL}/captcha.php?action=altcha_challenge`}
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
                  } as AltchaWidgetStyle}
                />
                </div>
              ) : (
                <div style={{ color: '#cbd5e1', fontSize: 14 }}>Loading ALTCHA...</div>
              )}
            </div>

            <div className={styles.physicsStatus}>
              {captchaLoading ? 'Preparing ALTCHA...' : captchaStatusMessage}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
