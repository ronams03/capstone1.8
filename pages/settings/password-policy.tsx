import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import SettingsLayout from '../../components/SettingsLayout';
import { useAdminSettingsPage } from '../../components/useAdminSettingsPage';
import { notifyError, notifySuccess } from '@/utils/notify';
import { getApiBaseUrl } from '@/utils/network';

const API_BASE = getApiBaseUrl();

export default function PasswordPolicySettings() {
    const router = useRouter();
    const { user, loading: authLoading, logout } = useAdminSettingsPage();
    const [pageLoading, setPageLoading] = useState(true);
    const [maxAgeDays, setMaxAgeDays] = useState(90);
    const [historyCount, setHistoryCount] = useState(5);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const fetchPolicy = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/auth.php?action=password_policy`, { credentials: 'include' });
            const data = await res.json();
            if (data.success && data.data) {
                setMaxAgeDays(data.data.max_age_days ?? 90);
                setHistoryCount(data.data.history_count ?? 5);
            }
        } catch {
            // keep defaults
        }
    }, []);

    useEffect(() => {
        if (authLoading || !user) return;
        let active = true;
        const load = async () => {
            try {
                await fetchPolicy();
            } finally {
                if (active) setPageLoading(false);
            }
        };
        void load();
        return () => { active = false; };
    }, [authLoading, fetchPolicy, user]);

    const handleSave = async () => {
        setErr(null);
        const days = Math.max(1, Math.min(365, Math.trunc(maxAgeDays)));
        const history = Math.max(1, Math.min(50, Math.trunc(historyCount)));
        setMaxAgeDays(days);
        setHistoryCount(history);
        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/auth.php?action=update_password_policy`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ max_age_days: days, history_count: history }),
            });
            const data = await res.json();
            if (data.success) {
                if (data.data) {
                    setMaxAgeDays(data.data.max_age_days ?? days);
                    setHistoryCount(data.data.history_count ?? history);
                }
                notifySuccess('Password policy updated');
            } else {
                setErr(data.message || 'Failed to update policy');
            }
        } catch {
            setErr('Network error');
        } finally {
            setSaving(false);
        }
    };

    if (authLoading || pageLoading) {
        return (
            <SettingsLayout activeSection="password-policy" user={user} onLogout={logout}>
                <div style={{ padding: 20 }}>Loading...</div>
            </SettingsLayout>
        );
    }

    return (
        <SettingsLayout activeSection="password-policy" user={user} onLogout={logout}>
            <div style={{ maxWidth: 600 }}>
                <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: 14, color: '#1c2537' }}>Password Expiration & History</h3>
                    <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6b7280' }}>
                        Force password change every N days and prevent reuse of recent passwords.
                    </p>

                    {err && (
                        <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fee2e2', color: '#b91c1c', fontSize: 13, marginBottom: 18, border: '1px solid #fecaca' }}>
                            {err}
                        </div>
                    )}

                    <div style={{ display: 'grid', gap: 20 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Max Password Age (days)</label>
                            <input
                                type="number"
                                min={1}
                                max={365}
                                value={maxAgeDays}
                                onChange={(e) => setMaxAgeDays(Number(e.target.value))}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
                            />
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                                Users must change their password every {maxAgeDays} day{maxAgeDays !== 1 ? 's' : ''}. Set to 365 for yearly, or lower for stricter rotation.
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Password History Count</label>
                            <input
                                type="number"
                                min={1}
                                max={50}
                                value={historyCount}
                                onChange={(e) => setHistoryCount(Number(e.target.value))}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
                            />
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                                Prevents reuse of the last {historyCount} password{historyCount !== 1 ? 's' : ''}. Higher values increase security but may frustrate users.
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                padding: '10px 24px',
                                borderRadius: 10,
                                border: 'none',
                                background: saving ? '#93c5fd' : '#1e3a8a',
                                color: '#ffffff',
                                fontSize: 14,
                                cursor: saving ? 'default' : 'pointer',
                                fontWeight: 600,
                            }}
                        >
                            {saving ? 'Saving...' : 'Save Policy'}
                        </button>
                    </div>
                </div>
            </div>
        </SettingsLayout>
    );
}
