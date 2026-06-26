import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Pagination from '../../components/Pagination';
import CrudActionIcon from '../../components/CrudActionIcon';
import SettingsLayout from '../../components/SettingsLayout';
import { SettingsPageHeader } from '../../components/SettingsPageShell';
import { useAdminSettingsPage } from '../../components/useAdminSettingsPage';
import { notifyError, notifySuccess } from '@/utils/notify';
import { getApiBaseUrl } from '@/utils/network';

const API_BASE = getApiBaseUrl();

interface BlockedBrowser {
    browser_id: string;
    failed_count: number;
    window_start?: string | null;
    blocked_until?: string | null;
    blocked_since?: string | null;
    updated_at?: string | null;
    remaining_minutes: number;
    remaining_hours: number;
    requires_admin_unblock?: boolean;
}

export default function IntruderIPLockoutSettings() {
    const router = useRouter();
    const embedded = true;
    const ITEMS_PER_PAGE = 10;
    const { user, loading: authLoading, logout } = useAdminSettingsPage();
    const [pageLoading, setPageLoading] = useState(true);

    const [intruderEnabled, setIntruderEnabled] = useState(true);
    const [intruderThreshold, setIntruderThreshold] = useState(10);
    const [intruderWindowHours, setIntruderWindowHours] = useState(24);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [blockedBrowsers, setBlockedBrowsers] = useState<BlockedBrowser[]>([]);
    const [blockedLoading, setBlockedLoading] = useState(false);
    const [unblockingBrowserId, setUnblockingBrowserId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        if (authLoading || !user) return;

        let active = true;
        const loadPage = async () => {
            try {
                await Promise.all([fetchSettings(), fetchBlockedBrowsers()]);
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
            const res = await fetch(
                `${API_BASE}/settings_api.php?keys=intruder_ip_lockout_enabled,intruder_ip_lockout_threshold,intruder_ip_lockout_window_hours`,
                { credentials: 'include' }
            );
            const data = await res.json();
            if (data.success && data.data) {
                setIntruderEnabled(data.data.intruder_ip_lockout_enabled ?? true);
                setIntruderThreshold(data.data.intruder_ip_lockout_threshold ?? 10);
                setIntruderWindowHours(data.data.intruder_ip_lockout_window_hours ?? 24);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchBlockedBrowsers = async () => {
        setBlockedLoading(true);
        try {
            const res = await fetch(`${API_BASE}/intruder-lockouts.php`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                setBlockedBrowsers(data.data || []);
            } else {
                setErr(data.message || 'Failed to load blocked browsers.');
            }
        } catch {
            setErr('Failed to load blocked browsers.');
        } finally {
            setBlockedLoading(false);
        }
    };

    const handleUnblockBrowser = async (browserId: string) => {
        if (!browserId) return;
        setUnblockingBrowserId(browserId);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch(`${API_BASE}/intruder-lockouts.php?action=unblock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ browser_id: browserId }),
            });
            const data = await res.json();
            if (data.success) {
                setBlockedBrowsers(prev => prev.filter(row => row.browser_id !== browserId));
                setMsg('Browser was unblocked successfully.');
            } else {
                setErr(data.message || 'Failed to unblock browser.');
            }
        } catch {
            setErr('Network error while unblocking browser.');
        } finally {
            setUnblockingBrowserId(null);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch(`${API_BASE}/settings_api.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    settings: {
                        intruder_ip_lockout_enabled: intruderEnabled,
                        intruder_ip_lockout_threshold: intruderThreshold,
                        intruder_ip_lockout_window_hours: intruderWindowHours,
                    }
                }),
            });
            const data = await res.json();
            if (data.success) {
                setMsg('Intruder browser lockout settings saved.');
                await fetchBlockedBrowsers();
            } else {
                setErr(data.message || 'Failed to save settings.');
            }
        } catch {
            setErr('Network error.');
        } finally {
            setSaving(false);
        }
    };

    const paginatedBlockedBrowsers = blockedBrowsers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(blockedBrowsers.length / ITEMS_PER_PAGE));
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [blockedBrowsers.length, currentPage]);

    if (authLoading || pageLoading) {
        return (
            <SettingsLayout activeSection="intruder-ip-lockout" user={user} onLogout={logout}>
                <div style={{ padding: 20 }}>Loading...</div>
            </SettingsLayout>
        );
    }

    return (
        <SettingsLayout activeSection="intruder-ip-lockout" user={user} onLogout={logout}>
            <SettingsPageHeader embedded={embedded} title="Intruder Browser Lockout" onBack={() => router.push('/settings')} />

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
                    <h2 style={{ margin: '0 0 6px 0', fontSize: 14, fontWeight: 700, color: '#111827' }}>System-Wide Intruder Browser Guard</h2>
                    <p style={{ margin: '0 0 18px 0', fontSize: 13, color: '#6b7280' }}>
                        Triggered by unknown email attempts in forgot password. Once a browser reaches the threshold,
                        login/session checks and protected API access from that same browser are blocked immediately and
                        stay blocked until an administrator manually unblocks that browser.
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                        <label style={{ fontSize: 14, color: '#374151', fontWeight: 600, minWidth: 170 }}>Enable Browser Lockout</label>
                        <button
                            type="button"
                            onClick={() => setIntruderEnabled(!intruderEnabled)}
                            style={{
                                width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                                background: intruderEnabled ? '#991b1b' : '#d1d5db',
                                position: 'relative', transition: 'background 0.2s',
                            }}
                        >
                            <div style={{
                                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                                position: 'absolute', top: 3,
                                left: intruderEnabled ? 25 : 3,
                                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                            }} />
                        </button>
                        <span style={{ fontSize: 12, color: intruderEnabled ? '#991b1b' : '#9ca3af', fontWeight: 700 }}>
                            {intruderEnabled ? 'Active' : 'Disabled'}
                        </span>
                    </div>

                    {intruderEnabled && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                            <div style={{ display: 'grid', gap: 6 }}>
                                <label style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Block after (attempts)</label>
                                <input
                                    type="number" min={1} max={1000}
                                    value={intruderThreshold}
                                    onChange={(e) => setIntruderThreshold(Math.max(1, parseInt(e.target.value) || 1))}
                                    style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, color: '#111' }}
                                />
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>Default is 10 attempts</span>
                            </div>

                            <div style={{ display: 'grid', gap: 6 }}>
                                <label style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Detection window (hours)</label>
                                <input
                                    type="number" min={1} max={720}
                                    value={intruderWindowHours}
                                    onChange={(e) => setIntruderWindowHours(Math.max(1, parseInt(e.target.value) || 1))}
                                    style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, color: '#111' }}
                                />
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>Attempts reset after this window if the browser is not blocked</span>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            title="Save Settings"
                            aria-label="Save intruder lockout settings"
                            style={{
                                background: '#991b1b', color: '#fff', border: 'none', padding: '10px 20px',
                                borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 14,
                                opacity: saving ? 0.7 : 1,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            {saving ? 'Saving...' : 'Submit'}
                        </button>
                    </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>Blocked Browsers</h2>
                            <span style={{
                                display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 12,
                                fontWeight: 700, background: blockedBrowsers.length > 0 ? '#fef2f2' : '#f0fdf4',
                                color: blockedBrowsers.length > 0 ? '#dc2626' : '#16a34a',
                                border: `1px solid ${blockedBrowsers.length > 0 ? '#fca5a5' : '#86efac'}`,
                            }}>
                                {blockedBrowsers.length}
                            </span>
                        </div>
                        <button
                            onClick={fetchBlockedBrowsers}
                            disabled={blockedLoading}
                            style={{
                                background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1',
                                padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12,
                                opacity: blockedLoading ? 0.7 : 1,
                            }}
                        >
                            {blockedLoading ? 'Refreshing...' : 'Refresh'}
                        </button>
                    </div>

                    {blockedLoading ? (
                        <div style={{ padding: '16px 0', color: '#64748b', fontSize: 14 }}>Loading blocked browsers...</div>
                    ) : blockedBrowsers.length === 0 ? (
                        <div style={{ padding: '16px 0', color: '#9ca3af', fontSize: 14 }}>No blocked browsers.</div>
                    ) : (
                        <>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontSize: 12, fontWeight: 700 }}>Browser ID</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontSize: 12, fontWeight: 700 }}>Attempts</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontSize: 12, fontWeight: 700 }}>Blocked Since</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontSize: 12, fontWeight: 700 }}>Status</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontSize: 12, fontWeight: 700 }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedBlockedBrowsers.map((row) => {
                                    const statusLabel = row.requires_admin_unblock
                                        ? 'Blocked until admin unblocks'
                                        : 'Blocked';

                                    return (
                                        <tr key={row.browser_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '12px', fontSize: 13, color: '#111827', fontFamily: 'monospace' }}>
                                                {row.browser_id}
                                            </td>
                                            <td style={{ padding: '12px', fontSize: 14, color: '#b91c1c', fontWeight: 700 }}>
                                                {row.failed_count}
                                            </td>
                                            <td style={{ padding: '12px', fontSize: 13, color: '#374151' }}>
                                                {row.blocked_since || row.updated_at || '-'}
                                            </td>
                                            <td style={{ padding: '12px', fontSize: 13, color: '#374151' }}>
                                                {statusLabel}
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => handleUnblockBrowser(row.browser_id)}
                                                    disabled={unblockingBrowserId === row.browser_id}
                                                    style={{
                                                        background: '#16a34a', color: '#fff', border: 'none',
                                                        padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                                                        fontWeight: 700, fontSize: 12, opacity: unblockingBrowserId === row.browser_id ? 0.6 : 1,
                                                    }}
                                                >
                                                    {unblockingBrowserId === row.browser_id ? 'Unblocking...' : 'Unblock'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <Pagination
                            currentPage={currentPage}
                            totalItems={blockedBrowsers.length}
                            itemsPerPage={ITEMS_PER_PAGE}
                            onPageChange={setCurrentPage}
                            label="blocked browsers"
                        />
                        </>
                    )}
            </div>
        </SettingsLayout>
    );
}
