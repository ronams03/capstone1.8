import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import CrudActionIcon from '../../components/CrudActionIcon';
import SettingsLayout from '../../components/SettingsLayout';
import { SettingsPageHeader } from '../../components/SettingsPageShell';
import { useAdminSettingsPage } from '../../components/useAdminSettingsPage';
import { notifyError, notifySuccess } from '@/utils/notify';
import { getApiBaseUrl } from '@/utils/network';

const API_BASE = getApiBaseUrl();

type CaptchaTimeoutUnit = 'seconds' | 'minutes' | 'hours';

const clampCaptchaTimeoutSeconds = (value: number) => {
    if (Number.isNaN(value)) return 300;
    return Math.max(30, Math.min(86400, Math.trunc(value)));
};

const captchaTimeoutValueToSeconds = (value: number, unit: CaptchaTimeoutUnit, fallbackSeconds = 300) => {
    const raw = Number.isFinite(value) ? value : fallbackSeconds;
    const seconds = unit === 'hours'
        ? Math.round(raw * 3600)
        : unit === 'minutes'
            ? Math.round(raw * 60)
            : Math.round(raw);
    return clampCaptchaTimeoutSeconds(seconds);
};

const secondsToCaptchaTimeoutValue = (seconds: number, unit: CaptchaTimeoutUnit) => {
    const safeSeconds = clampCaptchaTimeoutSeconds(seconds);
    if (unit === 'hours') {
        return Number((safeSeconds / 3600).toFixed(2));
    }
    if (unit === 'minutes') {
        return Number((safeSeconds / 60).toFixed(2));
    }
    return safeSeconds;
};

// ─── shared input / label styles ─────────────────────────────────────────────

const labelStyle: React.CSSProperties = { fontSize: 13, color: '#374151', fontWeight: 600 };
const descStyle: React.CSSProperties  = { margin: '0 0 4px 0', fontSize: 12, color: '#6b7280' };
const inputStyle: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, color: '#111', width: '100%', boxSizing: 'border-box' };
const hintStyle: React.CSSProperties  = { fontSize: 11, color: '#9ca3af' };

export default function MathCaptchaSettings() {
    const router = useRouter();
    const embedded = true;
    const { user, loading: authLoading, logout } = useAdminSettingsPage();
    const [pageLoading, setPageLoading] = useState(true);

    // ── Basic captcha settings ────────────────────────────────────────────────
    const [captchaEnabled,     setCaptchaEnabled]     = useState(true);
    const [captchaUnit,        setCaptchaUnit]        = useState<CaptchaTimeoutUnit>('minutes');
    const [captchaTimeoutValue,setCaptchaTimeoutValue]= useState(5);
    const [failedAttemptLimit, setFailedAttemptLimit] = useState(5);

    // ── Bot-resistance settings ───────────────────────────────────────────────
    const [minDragMs,      setMinDragMs]      = useState(400);
    const [maxAttempts,    setMaxAttempts]    = useState(3);
    const [suspiciousRiskThreshold, setSuspiciousRiskThreshold] = useState(3);
    const [tolerancePx,    setTolerancePx]    = useState(15);
    const [minPathPoints,  setMinPathPoints]  = useState(3);

    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (authLoading || !user) return;

        let active = true;
        const loadPage = async () => {
            try {
                await fetchSettings();
            } finally {
                if (active) {
                    setPageLoading(false);
                }
            }
        };

        void loadPage();
        return () => {
            active = false;
        };
    }, [authLoading, user]);

    useEffect(() => {
        if (!msg) return;
        void notifySuccess(msg);
        setMsg(null);
    }, [msg]);

    useEffect(() => {
        if (!err) return;
        void notifyError(err);
        setErr(null);
    }, [err]);

    const fetchSettings = async () => {
        try {
            const keys = [
                'login_math_captcha_enabled',
                'captcha_timeout_seconds',
                'login_failed_attempt_limit',
                'slider_min_drag_ms',
                'slider_max_attempts',
                'login_suspicious_risk_threshold',
                'slider_tolerance_px',
                'slider_min_path_points',
            ].join(',');
            const res  = await fetch(`${API_BASE}/settings_api.php?keys=${keys}`, { credentials: 'include' });
            const data = await res.json();
            if (data.success && data.data) {
                const d = data.data;
                setCaptchaEnabled(Boolean(d.login_math_captcha_enabled ?? true));
                const captchaSeconds = clampCaptchaTimeoutSeconds(Number(d.captcha_timeout_seconds ?? 300));
                const nextCaptchaUnit: CaptchaTimeoutUnit = captchaSeconds % 3600 === 0
                    ? 'hours'
                    : captchaSeconds % 60 === 0
                        ? 'minutes'
                        : 'seconds';
                setCaptchaUnit(nextCaptchaUnit);
                setCaptchaTimeoutValue(secondsToCaptchaTimeoutValue(captchaSeconds, nextCaptchaUnit));
                setFailedAttemptLimit(Math.max(1, Math.min(20,  Number(d.login_failed_attempt_limit ?? 5))));
                setMinDragMs(     Math.max(200, Math.min(5000, Number(d.slider_min_drag_ms      ?? 400))));
                setMaxAttempts(   Math.max(1,   Math.min(10,   Number(d.slider_max_attempts     ?? 3))));
                setSuspiciousRiskThreshold(Math.max(1, Math.min(10, Number(d.login_suspicious_risk_threshold ?? 3))));
                setTolerancePx(   Math.max(8,   Math.min(40,   Number(d.slider_tolerance_px     ?? 15))));
                setMinPathPoints( Math.max(1,   Math.min(20,   Number(d.slider_min_path_points  ?? 3))));
            }
        } catch {
            // Keep defaults when settings are unavailable.
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        setErr(null);

        const captchaValue     = captchaTimeoutValueToSeconds(captchaTimeoutValue, captchaUnit, 300);
        setCaptchaTimeoutValue(secondsToCaptchaTimeoutValue(captchaValue, captchaUnit));
        const nextAttemptLimit = Math.max(1, Math.min(20,   Math.trunc(Number(failedAttemptLimit) || 5)));
        const nextMinDragMs    = Math.max(200, Math.min(5000, Math.trunc(Number(minDragMs)    || 400)));
        const nextMaxAttempts  = Math.max(1,   Math.min(10,   Math.trunc(Number(maxAttempts)  || 3)));
        const nextRiskThreshold = Math.max(1,  Math.min(10,   Math.trunc(Number(suspiciousRiskThreshold) || 3)));
        const nextTolerancePx  = Math.max(8,   Math.min(40,   Math.trunc(Number(tolerancePx)  || 15)));
        const nextMinPathPts   = Math.max(1,   Math.min(20,   Math.trunc(Number(minPathPoints) || 3)));
        setFailedAttemptLimit(nextAttemptLimit);
        setMinDragMs(nextMinDragMs);
        setMaxAttempts(nextMaxAttempts);
        setSuspiciousRiskThreshold(nextRiskThreshold);
        setTolerancePx(nextTolerancePx);
        setMinPathPoints(nextMinPathPts);

        try {
            const res = await fetch(`${API_BASE}/settings_api.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    settings: {
                        login_math_captcha_enabled: captchaEnabled,
                        captcha_timeout_seconds:    captchaValue,
                        login_failed_attempt_limit: nextAttemptLimit,
                        slider_min_drag_ms:         nextMinDragMs,
                        slider_max_attempts:        nextMaxAttempts,
                        login_suspicious_risk_threshold: nextRiskThreshold,
                        slider_tolerance_px:        nextTolerancePx,
                        slider_min_path_points:     nextMinPathPts,
                    },
                }),
            });
            const data = await res.json();
            if (data.success) {
                setMsg('Captcha management settings saved.');
            } else {
                setErr(data.message || 'Failed to save captcha management settings.');
            }
        } catch {
            setErr('Network error.');
        } finally {
            setSaving(false);
        }
    };

    const handleCaptchaUnitChange = (nextUnit: CaptchaTimeoutUnit) => {
        if (nextUnit === captchaUnit) return;
        const seconds = captchaTimeoutValueToSeconds(captchaTimeoutValue, captchaUnit, 300);
        setCaptchaUnit(nextUnit);
        setCaptchaTimeoutValue(secondsToCaptchaTimeoutValue(seconds, nextUnit));
    };

    if (authLoading || pageLoading) {
        return (
            <SettingsLayout activeSection="math-captcha" user={user} onLogout={logout}>
                <div style={{ padding: 20 }}>Loading...</div>
            </SettingsLayout>
        );
    }

    const sectionCard = (children: React.ReactNode, title: string, subtitle: string) => (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ marginBottom: 16 }}>
                <h2 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 700, color: '#111827' }}>{title}</h2>
                <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>{subtitle}</p>
            </div>
            {children}
        </div>
    );

    return (
        <SettingsLayout activeSection="math-captcha" user={user} onLogout={logout}>
            <SettingsPageHeader embedded={embedded} title="Captcha Management" onBack={() => router.push('/settings')} />

            {/* ── Section 1: Enable / disable ─────────────────────────────── */}
            {sectionCard(
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>
                            {captchaEnabled
                                ? 'Login users must complete ALTCHA before signing in.'
                                : 'Login users can sign in without captcha checks.'}
                        </span>
                        <div style={{ display: 'inline-flex', gap: 8, padding: 4, borderRadius: 12, background: '#f3f4f6', border: '1px solid #e5e7eb' }}>
                            {(['On', 'Off'] as const).map((label) => {
                                const active = label === 'On' ? captchaEnabled : !captchaEnabled;
                                return (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() => setCaptchaEnabled(label === 'On')}
                                        disabled={saving}
                                        style={{
                                            border: 'none', borderRadius: 8, padding: '8px 16px',
                                            fontSize: 13, fontWeight: 700,
                                            cursor: saving ? 'not-allowed' : 'pointer',
                                            background: active ? (label === 'On' ? '#166534' : '#b91c1c') : 'transparent',
                                            color: active ? '#fff' : '#475569',
                                            opacity: saving ? 0.7 : 1,
                                        }}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: 18, maxWidth: 340, opacity: captchaEnabled ? 1 : 0.65 }}>
                        {/* Failed attempt limit */}
                        <div style={{ display: 'grid', gap: 6 }}>
                            <label style={labelStyle}>Failed Attempt Limit</label>
                            <p style={descStyle}>Wrong password or captcha attempts before the account is locked.</p>
                            <input
                                type="number" min={1} max={20} step={1}
                                value={failedAttemptLimit}
                                onChange={(e) => setFailedAttemptLimit(Math.max(1, Math.min(20, Math.trunc(Number(e.target.value) || 1))))}
                                style={inputStyle}
                            />
                            <span style={hintStyle}>Default: 5. Range: 1–20 attempts.</span>
                        </div>

                        {/* Expiry time */}
                        <div style={{ display: 'grid', gap: 6 }}>
                            <label style={labelStyle}>Expiry Time</label>
                            <p style={descStyle}>How long the captcha stays valid before it expires.</p>
                            <select
                                value={captchaUnit}
                                onChange={(e) => handleCaptchaUnitChange(e.target.value as CaptchaTimeoutUnit)}
                                disabled={!captchaEnabled}
                                style={{ ...inputStyle, fontSize: 13, background: '#f8fafc' }}
                            >
                                <option value="seconds">Second/s</option>
                                <option value="minutes">Minute/s</option>
                                <option value="hours">Hour/s</option>
                            </select>
                            <input
                                type="number"
                                min={captchaUnit === 'hours' ? 0.01 : captchaUnit === 'minutes' ? 0.5  : 30}
                                max={captchaUnit === 'hours' ? 24   : captchaUnit === 'minutes' ? 1440 : 86400}
                                step={captchaUnit === 'hours' ? 0.25 : captchaUnit === 'minutes' ? 0.5  : 30}
                                value={captchaTimeoutValue}
                                disabled={!captchaEnabled}
                                onChange={(e) => setCaptchaTimeoutValue(secondsToCaptchaTimeoutValue(
                                    captchaTimeoutValueToSeconds(Number(e.target.value), captchaUnit, 300),
                                    captchaUnit
                                ))}
                                style={inputStyle}
                            />
                            <span style={hintStyle}>
                                {captchaUnit === 'hours'
                                    ? 'Range: 0.01–24 hours.'
                                    : captchaUnit === 'minutes'
                                        ? 'Range: 0.5–1440 minutes.'
                                        : 'Range: 30–86400 seconds.'}
                            </span>
                        </div>
                    </div>
                </>,
                'Login Captcha',
                'Manage ALTCHA verification and set how many wrong attempts are allowed before account lockout.'
            )}

            {/* ── Section 2: Bot-resistance ───────────────────────────────── */}
            {sectionCard(
                <div style={{ display: 'grid', gap: 18, maxWidth: 340, opacity: captchaEnabled ? 1 : 0.55 }}>

                    {/* Minimum drag duration */}
                    <div style={{ display: 'grid', gap: 6 }}>
                        <label style={labelStyle}>Minimum Drag Duration (ms)</label>
                        <p style={descStyle}>
                            Submissions faster than this are rejected — bots answer in &lt;1 ms, humans take 500–2000 ms.
                        </p>
                        <input
                            type="number" min={200} max={5000} step={50}
                            value={minDragMs}
                            disabled={!captchaEnabled}
                            onChange={(e) => setMinDragMs(Math.max(200, Math.min(5000, Math.trunc(Number(e.target.value) || 400))))}
                            style={inputStyle}
                        />
                        <span style={hintStyle}>Default: 400 ms. Range: 200–5000 ms.</span>
                    </div>

                    {/* Max verification attempts per session */}
                    <div style={{ display: 'grid', gap: 6 }}>
                        <label style={labelStyle}>Max Puzzle Attempts per Session</label>
                        <p style={descStyle}>
                            After this many failed verifications, the captcha session is destroyed and the user must sign in again.
                        </p>
                        <input
                            type="number" min={1} max={10} step={1}
                            value={maxAttempts}
                            disabled={!captchaEnabled}
                            onChange={(e) => setMaxAttempts(Math.max(1, Math.min(10, Math.trunc(Number(e.target.value) || 3))))}
                            style={inputStyle}
                        />
                        <span style={hintStyle}>Default: 3. Range: 1–10 attempts.</span>
                    </div>

                    {/* Suspicious risk threshold */}
                    <div style={{ display: 'grid', gap: 6 }}>
                        <label style={labelStyle}>Suspicious Risk Threshold</label>
                        <p style={descStyle}>
                            Score cutoff for forcing manual ALTCHA challenge after the server auto-check. Lower values challenge more users.
                        </p>
                        <input
                            type="number" min={1} max={10} step={1}
                            value={suspiciousRiskThreshold}
                            disabled={!captchaEnabled}
                            onChange={(e) => setSuspiciousRiskThreshold(Math.max(1, Math.min(10, Math.trunc(Number(e.target.value) || 3))))}
                            style={inputStyle}
                        />
                        <span style={hintStyle}>Default: 3. Range: 1-10.</span>
                    </div>

                    {/* Placement tolerance */}
                    <div style={{ display: 'grid', gap: 6 }}>
                        <label style={labelStyle}>Placement Tolerance (px)</label>
                        <p style={descStyle}>
                            Maximum pixel distance between the piece and the slot centre to count as correct. Lower = harder for bots; 10–20 is comfortable on touchscreens.
                        </p>
                        <input
                            type="number" min={8} max={40} step={1}
                            value={tolerancePx}
                            disabled={!captchaEnabled}
                            onChange={(e) => setTolerancePx(Math.max(8, Math.min(40, Math.trunc(Number(e.target.value) || 15))))}
                            style={inputStyle}
                        />
                        <span style={hintStyle}>Default: 15 px. Range: 8–40 px.</span>
                    </div>

                    {/* Minimum path points */}
                    <div style={{ display: 'grid', gap: 6 }}>
                        <label style={labelStyle}>Minimum Pointer Path Samples</label>
                        <p style={descStyle}>
                            Number of pointer movement samples expected during client validation. Lower values are less strict.
                        </p>
                        <input
                            type="number" min={1} max={20} step={1}
                            value={minPathPoints}
                            disabled={!captchaEnabled}
                            onChange={(e) => setMinPathPoints(Math.max(1, Math.min(20, Math.trunc(Number(e.target.value) || 3))))}
                            style={inputStyle}
                        />
                        <span style={hintStyle}>Default: 3 samples. Range: 1–20.</span>
                    </div>
                </div>,
                'Bot-Resistance',
                'Advanced protections and suspicious-attempt scoring for deciding when manual challenge is required.'
            )}

            {/* ── Save button ─────────────────────────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    title="Save Settings"
                    aria-label="Save captcha management settings"
                    style={{
                        background: '#1e3a8a', color: '#fff', border: 'none',
                        padding: '10px 20px', borderRadius: 10,
                        cursor: 'pointer', fontWeight: 600, fontSize: 14,
                        opacity: saving ? 0.7 : 1,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    {saving ? 'Saving...' : 'Submit'}
                </button>
            </div>
        </SettingsLayout>
    );
}
