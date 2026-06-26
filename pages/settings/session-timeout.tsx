import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import CrudActionIcon from '../../components/CrudActionIcon';
import SettingsLayout from '../../components/SettingsLayout';
import { SettingsPageHeader } from '../../components/SettingsPageShell';
import { useAdminSettingsPage } from '../../components/useAdminSettingsPage';
import { notifyError, notifySuccess } from '@/utils/notify';
import { getApiBaseUrl } from '@/utils/network';

const API_BASE = getApiBaseUrl();

type TimeoutUnit = 'minutes' | 'hours';
const clampTimeoutMinutes = (value: number) => {
    if (Number.isNaN(value)) return 30;
    return Math.max(1, Math.min(1440, Math.trunc(value)));
};

const timeoutValueToMinutes = (value: number, unit: TimeoutUnit, fallbackMinutes = 30) => {
    const raw = Number.isFinite(value) ? value : fallbackMinutes;
    const minutes = unit === 'hours'
        ? Math.round(raw * 60)
        : Math.round(raw);
    return clampTimeoutMinutes(minutes);
};

const minutesToTimeoutValue = (minutes: number, unit: TimeoutUnit) => {
    const safeMinutes = clampTimeoutMinutes(minutes);
    if (unit === 'hours') {
        return Number((safeMinutes / 60).toFixed(2));
    }
    return safeMinutes;
};

export default function SessionTimeoutSettings() {
    const router = useRouter();
    const embedded = true;
    const { user, loading: authLoading, logout } = useAdminSettingsPage();
    const [pageLoading, setPageLoading] = useState(true);
    const [timeoutEnabled, setTimeoutEnabled] = useState(true);
    const [managerUnit, setManagerUnit] = useState<TimeoutUnit>('minutes');
    const [staffUnit, setStaffUnit] = useState<TimeoutUnit>('minutes');
    const [managerTimeoutValue, setManagerTimeoutValue] = useState(30);
    const [staffTimeoutValue, setStaffTimeoutValue] = useState(30);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch(
                `${API_BASE}/settings_api.php?keys=session_timeout_enabled,session_timeout_manager_minutes,session_timeout_staff_minutes`,
                { credentials: 'include' }
            );
            const data = await res.json();
            if (data.success && data.data) {
                setTimeoutEnabled(Boolean(data.data.session_timeout_enabled ?? true));
                const managerMinutes = clampTimeoutMinutes(Number(data.data.session_timeout_manager_minutes ?? 30));
                const staffMinutes = clampTimeoutMinutes(Number(data.data.session_timeout_staff_minutes ?? 30));
                setManagerUnit('minutes');
                setStaffUnit('minutes');
                setManagerTimeoutValue(managerMinutes);
                setStaffTimeoutValue(staffMinutes);
            }
        } catch {
            // Keep defaults when settings are unavailable.
        }
    }, []);

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
    }, [authLoading, fetchSettings, user]);

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

    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        setErr(null);

        const managerValue = timeoutValueToMinutes(managerTimeoutValue, managerUnit, 30);
        const staffValue = timeoutValueToMinutes(staffTimeoutValue, staffUnit, 30);
        setManagerTimeoutValue(minutesToTimeoutValue(managerValue, managerUnit));
        setStaffTimeoutValue(minutesToTimeoutValue(staffValue, staffUnit));

        try {
            const res = await fetch(`${API_BASE}/settings_api.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    settings: {
                        session_timeout_enabled: timeoutEnabled,
                        session_timeout_manager_minutes: managerValue,
                        session_timeout_staff_minutes: staffValue,
                    },
                }),
            });
            const data = await res.json();
            if (data.success) {
                setMsg('Session timeout settings saved.');
            } else {
                setErr(data.message || 'Failed to save session timeout settings.');
            }
        } catch {
            setErr('Network error.');
        } finally {
            setSaving(false);
        }
    };

    const handleManagerUnitChange = (nextUnit: TimeoutUnit) => {
        if (nextUnit === managerUnit) return;
        const minutes = timeoutValueToMinutes(managerTimeoutValue, managerUnit, 30);
        setManagerUnit(nextUnit);
        setManagerTimeoutValue(minutesToTimeoutValue(minutes, nextUnit));
    };

    const handleStaffUnitChange = (nextUnit: TimeoutUnit) => {
        if (nextUnit === staffUnit) return;
        const minutes = timeoutValueToMinutes(staffTimeoutValue, staffUnit, 30);
        setStaffUnit(nextUnit);
        setStaffTimeoutValue(minutesToTimeoutValue(minutes, nextUnit));
    };

    if (authLoading || pageLoading) {
        return (
            <SettingsLayout activeSection="session-timeout" user={user} onLogout={logout}>
                <div style={{ padding: 20 }}>Loading...</div>
            </SettingsLayout>
        );
    }

    return (
        <SettingsLayout activeSection="session-timeout" user={user} onLogout={logout}>
            <SettingsPageHeader embedded={embedded} title="Session Timeout" onBack={() => router.push('/settings')} />

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
                    <h2 style={{ margin: '0 0 6px 0', fontSize: 14, fontWeight: 700, color: '#111827' }}>Manager and Staff Inactivity Timeout</h2>
                    <p style={{ margin: '0 0 18px 0', fontSize: 13, color: '#6b7280' }}>
                        Automatically signs out manager and staff sessions after inactivity. Admin sessions are not affected.
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                        <label style={{ fontSize: 14, color: '#374151', fontWeight: 600, minWidth: 180 }}>Enable Timeout</label>
                        <button
                            type="button"
                            onClick={() => setTimeoutEnabled(!timeoutEnabled)}
                            style={{
                                width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                                background: timeoutEnabled ? '#1e3a8a' : '#d1d5db',
                                position: 'relative', transition: 'background 0.2s',
                            }}
                        >
                            <div style={{
                                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                                position: 'absolute', top: 3,
                                left: timeoutEnabled ? 25 : 3,
                                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                            }} />
                        </button>
                        <span style={{ fontSize: 12, color: timeoutEnabled ? '#1e3a8a' : '#9ca3af', fontWeight: 700 }}>
                            {timeoutEnabled ? 'Active' : 'Disabled'}
                        </span>
                    </div>

                    {timeoutEnabled && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                            <div style={{ display: 'grid', gap: 6 }}>
                                <label style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Manager Timeout</label>
                                <select
                                    value={managerUnit}
                                    onChange={(e) => handleManagerUnitChange(e.target.value as TimeoutUnit)}
                                    style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, color: '#334155', background: '#f8fafc' }}
                                >
                                    <option value="minutes">Minute/s</option>
                                    <option value="hours">Hour/s</option>
                                </select>
                                <input
                                    type="number"
                                    min={managerUnit === 'hours' ? 0.25 : 1}
                                    max={managerUnit === 'hours' ? 24 : 1440}
                                    step={managerUnit === 'hours' ? 0.25 : 1}
                                    value={managerTimeoutValue}
                                    onChange={(e) => setManagerTimeoutValue(minutesToTimeoutValue(
                                        timeoutValueToMinutes(Number(e.target.value), managerUnit, 30),
                                        managerUnit
                                    ))}
                                    style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, color: '#111' }}
                                />
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                                    {managerUnit === 'hours' ? 'Allowed range: 0.25 to 24 hours' : 'Allowed range: 1 to 1440 minutes'}
                                </span>
                            </div>

                            <div style={{ display: 'grid', gap: 6 }}>
                                <label style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Staff Timeout</label>
                                <select
                                    value={staffUnit}
                                    onChange={(e) => handleStaffUnitChange(e.target.value as TimeoutUnit)}
                                    style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, color: '#334155', background: '#f8fafc' }}
                                >
                                    <option value="minutes">Minute/s</option>
                                    <option value="hours">Hour/s</option>
                                </select>
                                <input
                                    type="number"
                                    min={staffUnit === 'hours' ? 0.25 : 1}
                                    max={staffUnit === 'hours' ? 24 : 1440}
                                    step={staffUnit === 'hours' ? 0.25 : 1}
                                    value={staffTimeoutValue}
                                    onChange={(e) => setStaffTimeoutValue(minutesToTimeoutValue(
                                        timeoutValueToMinutes(Number(e.target.value), staffUnit, 30),
                                        staffUnit
                                    ))}
                                    style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, color: '#111' }}
                                />
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                                    {staffUnit === 'hours' ? 'Allowed range: 0.25 to 24 hours' : 'Allowed range: 1 to 1440 minutes'}
                                </span>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            title="Save Settings"
                            aria-label="Save session timeout settings"
                            style={{
                                background: '#1e3a8a', color: '#fff', border: 'none', padding: '10px 20px',
                                borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 14,
                                opacity: saving ? 0.7 : 1,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            {saving ? 'Saving...' : 'Submit'}
                        </button>
                    </div>
            </div>
        </SettingsLayout>
    );
}
