import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Pagination from '../../components/Pagination';
import CrudActionIcon from '../../components/CrudActionIcon';
import SettingsLayout from '../../components/SettingsLayout';
import { SettingsPageHeader } from '../../components/SettingsPageShell';
import { useAdminSettingsPage } from '../../components/useAdminSettingsPage';
import { notifyError, notifySuccess } from '@/utils/notify';
import { getApiBaseUrl } from '@/utils/network';

const API_BASE = getApiBaseUrl();

interface LockedUser {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    role: string;
    reset_request_count: number;
}

export default function AccountLockoutSettings() {
    const router = useRouter();
    const embedded = true;
    const ITEMS_PER_PAGE = 10;
    const { user, loading: authLoading, logout } = useAdminSettingsPage();
    const [pageLoading, setPageLoading] = useState(true);

    // Settings state
    const [lockoutEnabled, setLockoutEnabled] = useState(true);
    const [thresholdManager, setThresholdManager] = useState(3);
    const [thresholdStaff, setThresholdStaff] = useState(3);
    const [windowHours, setWindowHours] = useState(24);
    const [saving, setSaving] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
    const [settingsErr, setSettingsErr] = useState<string | null>(null);

    // Locked users
    const [lockedUsers, setLockedUsers] = useState<LockedUser[]>([]);
    const [unlocking, setUnlocking] = useState<number | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        if (!settingsMsg) return;
        void notifySuccess(settingsMsg);
        setSettingsMsg(null);
    }, [settingsMsg]);

    useEffect(() => {
        if (!settingsErr) return;
        void notifyError(settingsErr);
        setSettingsErr(null);
    }, [settingsErr]);

    useEffect(() => {
        if (authLoading || !user) return;

        let active = true;
        const loadPage = async () => {
            try {
                await Promise.all([fetchSettings(), fetchLockedUsers()]);
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

    const fetchSettings = async () => {
        try {
            const res = await fetch(
                `${API_BASE}/settings_api.php?keys=lockout_enabled,lockout_threshold_manager,lockout_threshold_staff,lockout_window_hours`,
                { credentials: 'include' }
            );
            const data = await res.json();
            if (data.success && data.data) {
                setLockoutEnabled(data.data.lockout_enabled ?? true);
                setThresholdManager(data.data.lockout_threshold_manager ?? 3);
                setThresholdStaff(data.data.lockout_threshold_staff ?? 3);
                setWindowHours(data.data.lockout_window_hours ?? 24);
            }
        } catch (e) { console.error(e); }
    };

    const fetchLockedUsers = async () => {
        try {
            const res = await fetch(`${API_BASE}/users.php?action=locked`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                setLockedUsers(Array.isArray(data.data) ? data.data as LockedUser[] : []);
            }
        } catch (e) { console.error(e); }
    };

    const handleSave = async () => {
        setSaving(true);
        setSettingsMsg(null);
        setSettingsErr(null);
        try {
            const res = await fetch(`${API_BASE}/settings_api.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    settings: {
                        lockout_enabled: lockoutEnabled,
                        lockout_threshold_manager: thresholdManager,
                        lockout_threshold_staff: thresholdStaff,
                        lockout_window_hours: windowHours,
                    }
                }),
            });
            const data = await res.json();
            if (data.success) {
                setSettingsMsg('Settings saved successfully.');
            } else {
                setSettingsErr(data.message || 'Failed to save settings.');
            }
        } catch {
            setSettingsErr('Network error.');
        } finally {
            setSaving(false);
        }
    };

    const handleUnlock = async (userId: number) => {
        setUnlocking(userId);
        try {
            const res = await fetch(`${API_BASE}/users.php?action=unlock&id=${userId}`, {
                method: 'POST',
                credentials: 'include',
            });
            const data = await res.json();
            if (data.success) {
                setLockedUsers(prev => prev.filter(u => u.id !== userId));
            } else {
                alert(data.message || 'Failed to unlock user.');
            }
        } catch {
            alert('Network error.');
        } finally {
            setUnlocking(null);
        }
    };

    const paginatedLockedUsers = lockedUsers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(lockedUsers.length / ITEMS_PER_PAGE));
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [lockedUsers.length, currentPage]);

    if (authLoading || pageLoading) {
        return (
            <SettingsLayout activeSection="account-lockout" user={user} onLogout={logout}>
                <div style={{ padding: 20 }}>Loading...</div>
            </SettingsLayout>
        );
    }

    return (
        <SettingsLayout activeSection="account-lockout" user={user} onLogout={logout}>
            <SettingsPageHeader embedded={embedded} title="Account Lockout" onBack={() => router.push('/settings')} />

            {/* Settings Card */}
            <div style={{
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 24,
            }}>
                    <h2 style={{ margin: '0 0 6px 0', fontSize: 14, fontWeight: 700, color: '#111827' }}>Lockout Policy</h2>
                    <p style={{ margin: '0 0 18px 0', fontSize: 13, color: '#6b7280' }}>
                        When a manager or staff clicks login and enters the wrong password too many times within the time window, their account will be automatically locked.
                    </p>

                    {/* Enable toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                        <label style={{ fontSize: 14, color: '#374151', fontWeight: 600, minWidth: 140 }}>Enable Lockout</label>
                        <button
                            type="button"
                            onClick={() => setLockoutEnabled(!lockoutEnabled)}
                            style={{
                                width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                                background: lockoutEnabled ? '#1e3a8a' : '#d1d5db',
                                position: 'relative', transition: 'background 0.2s',
                            }}
                        >
                            <div style={{
                                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                                position: 'absolute', top: 3,
                                left: lockoutEnabled ? 25 : 3,
                                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                            }} />
                        </button>
                        <span style={{ fontSize: 12, color: lockoutEnabled ? '#166534' : '#9ca3af', fontWeight: 600 }}>
                            {lockoutEnabled ? 'Active' : 'Disabled'}
                        </span>
                    </div>

                    {lockoutEnabled && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div style={{ display: 'grid', gap: 6 }}>
                                <label style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Manager Threshold</label>
                                <input
                                    type="number" min={1} max={50}
                                    value={thresholdManager}
                                    onChange={e => setThresholdManager(Math.max(1, parseInt(e.target.value) || 1))}
                                    style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, color: '#111' }}
                                />
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>Max failed login attempts before lock</span>
                            </div>

                            <div style={{ display: 'grid', gap: 6 }}>
                                <label style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Staff Threshold</label>
                                <input
                                    type="number" min={1} max={50}
                                    value={thresholdStaff}
                                    onChange={e => setThresholdStaff(Math.max(1, parseInt(e.target.value) || 1))}
                                    style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, color: '#111' }}
                                />
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>Max failed login attempts before lock</span>
                            </div>

                            <div style={{ display: 'grid', gap: 6 }}>
                                <label style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Time Window (hours)</label>
                                <input
                                    type="number" min={1} max={720}
                                    value={windowHours}
                                    onChange={e => setWindowHours(Math.max(1, parseInt(e.target.value) || 1))}
                                    style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, color: '#111' }}
                                />
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>Counter resets after this period</span>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            title="Save Settings"
                            aria-label="Save account lockout settings"
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

            {/* Locked Users Card */}
            <div style={{
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20,
            }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>Locked Accounts</h2>
                        <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 12,
                            fontWeight: 700, background: lockedUsers.length > 0 ? '#fef2f2' : '#f0fdf4',
                            color: lockedUsers.length > 0 ? '#dc2626' : '#16a34a',
                            border: `1px solid ${lockedUsers.length > 0 ? '#fca5a5' : '#86efac'}`,
                        }}>
                            {lockedUsers.length}
                        </span>
                    </div>

                    {lockedUsers.length === 0 ? (
                        <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 8px' }}>
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <p style={{ margin: 0 }}>No locked accounts</p>
                        </div>
                    ) : (
                        <>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontSize: 12, fontWeight: 700 }}>User</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontSize: 12, fontWeight: 700 }}>Role</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontSize: 12, fontWeight: 700 }}>Failed Attempts</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontSize: 12, fontWeight: 700 }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedLockedUsers.map(u => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '12px', color: '#111827', fontSize: 14 }}>
                                            <div style={{ fontWeight: 600 }}>{u.first_name} {u.last_name}</div>
                                            <div style={{ fontSize: 12, color: '#9ca3af' }}>{u.email}</div>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <span style={{
                                                padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                                                background: u.role === 'manager' ? '#fef3c7' : '#dcfce7',
                                                color: u.role === 'manager' ? '#d97706' : '#15803d',
                                                textTransform: 'capitalize',
                                            }}>{u.role}</span>
                                        </td>
                                        <td style={{ padding: '12px', color: '#dc2626', fontWeight: 700, fontSize: 14 }}>
                                            {u.reset_request_count}
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => handleUnlock(u.id)}
                                                disabled={unlocking === u.id}
                                                style={{
                                                    background: '#16a34a', color: '#fff', border: 'none', padding: '6px 14px',
                                                    borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                                                    opacity: unlocking === u.id ? 0.6 : 1,
                                                }}
                                            >
                                                {unlocking === u.id ? 'Unlocking...' : '🔓 Unlock'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <Pagination
                            currentPage={currentPage}
                            totalItems={lockedUsers.length}
                            itemsPerPage={ITEMS_PER_PAGE}
                            onPageChange={setCurrentPage}
                            label="locked accounts"
                        />
                        </>
                    )}
            </div>
        </SettingsLayout>
    );
}
