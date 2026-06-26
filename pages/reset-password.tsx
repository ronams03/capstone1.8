import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from '../styles/Login.module.css';
import CrudActionIcon from '../components/CrudActionIcon';
import PasswordInput from '../components/PasswordInput';
import { notifyError, notifySuccess } from '@/utils/notify';
import { getApiBaseUrl } from '@/utils/network';

interface ApiResponse {
  success: boolean;
  message: string;
  data?: {
    role?: string;
    [key: string]: unknown;
  } | null;
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const API_BASE_URL = getApiBaseUrl();

  const [token, setToken] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState<'token' | 'first_login'>('token');
  const [sessionRole, setSessionRole] = useState<string>('');
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const qMode = typeof router.query.mode === 'string' ? router.query.mode : '';
    const isFirstLoginMode = qMode === 'first_login';
    setMode(isFirstLoginMode ? 'first_login' : 'token');

    if (!isFirstLoginMode) {
      const t = router.query.token;
      setToken(typeof t === 'string' ? t : '');
      return;
    }

    let cancelled = false;
    setCheckingAccess(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth.php?action=session`, {
          method: 'GET',
          credentials: 'include',
        });
        const data: ApiResponse = await res.json();

        if (cancelled) return;

        if (!data.success) {
          setError('Please log in first to change your temporary password.');
          setTimeout(() => router.push('/'), 1000);
          return;
        }

        setSessionRole(typeof data?.data?.role === 'string' ? data.data.role : '');
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('Please log in first to change your temporary password.');
          setTimeout(() => router.push('/'), 1000);
        }
      } finally {
        if (!cancelled) setCheckingAccess(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [API_BASE_URL, router, router.query.mode, router.query.token]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (mode === 'token' && !token) {
      setError('Missing or invalid token.');
      return;
    }
    if (mode === 'first_login' && checkingAccess) {
      setError('Please wait while we verify your session.');
      return;
    }
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
      const action = mode === 'first_login' ? 'first_login_change_password' : 'reset_password';
      const body = mode === 'first_login'
        ? { newPassword }
        : { token, newPassword };

      const res = await fetch(`${API_BASE_URL}/auth.php?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data: ApiResponse = await res.json();

      if (data.success) {
        if (mode === 'first_login') {
          const nextPath = sessionRole === 'admin'
            ? '/admin/dashboard'
            : sessionRole === 'manager'
              ? '/manager/dashboard'
              : '/dashboard';
          setSuccess(data.message || 'Password updated. Redirecting...');
          setTimeout(() => router.push(nextPath), 1200);
        } else {
          setSuccess(data.message || 'Password updated. Redirecting to login...');
          setTimeout(() => router.push('/'), 1200);
        }
      } else {
        setError(data.message || 'Reset failed.');
      }
    } catch (err) {
      console.error(err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'transparent', position: 'relative' }}>
      <Head>
        <title>{mode === 'first_login' ? 'Change Temporary Password' : 'Reset Password'}</title>
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
        <div className={styles.card} style={{ width: '100%', maxWidth: 420, opacity: 0.9, position: 'relative', overflow: 'hidden' }}>
          <div className={styles.header}>
            <h1 style={{ lineHeight: 1.2, fontSize: '14px' }}>
              {mode === 'first_login' ? 'Change temporary password' : 'Reset password'}
            </h1>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            {mode === 'first_login' && (
              <div style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.6, color: '#334155' }}>
                You are logged in with a temporary password. Create a new password to continue.
              </div>
            )}
            {checkingAccess && (
              <div style={{ marginBottom: 12, fontSize: 13, color: '#1e3a8a' }}>
                Verifying your login session...
              </div>
            )}
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="newPassword">New password</label>
              <PasswordInput
                className={styles.input}
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter a new password"
                disabled={loading || checkingAccess}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="confirmPassword">Confirm password</label>
              <PasswordInput
                className={styles.input}
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter the new password"
                disabled={loading || checkingAccess}
              />
            </div>

            <button type="submit" className={styles.loginButton} disabled={loading || checkingAccess} title="Update password" aria-label="Update password">
              {loading ? 'Saving...' : 'Submit'}
            </button>

            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={() => router.push('/')}
                disabled={loading || checkingAccess}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#1e3a8a',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                  fontSize: 13,
                }}
              >
                Back to login
              </button>
            </div>
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
  );
}
