import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import CrudActionIcon from '../../components/CrudActionIcon';
import SettingsLayout from '../../components/SettingsLayout';
import { SettingsPageHeader } from '../../components/SettingsPageShell';
import { useAdminSettingsPage } from '../../components/useAdminSettingsPage';
import { notifyError, notifySuccess } from '@/utils/notify';
import { getApiBaseUrl } from '@/utils/network';

const API_BASE = getApiBaseUrl();

const clampItemsPerPage = (value: number) => {
    if (Number.isNaN(value)) return 10;
    return Math.max(1, Math.min(100, Math.trunc(value)));
};

export default function PaginationSettings() {
    const router = useRouter();
    const embedded = true;
    const { user, loading: authLoading, logout } = useAdminSettingsPage();
    const [pageLoading, setPageLoading] = useState(true);
    const [itemsPerPage, setItemsPerPage] = useState(10);
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
            const res = await fetch(`${API_BASE}/settings_api.php?keys=pagination_items_per_page`, { credentials: 'include' });
            const data = await res.json();
            if (data.success && data.data) {
                setItemsPerPage(clampItemsPerPage(Number(data.data.pagination_items_per_page ?? 10)));
            }
        } catch {
            // Keep fallback value when settings are unavailable.
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        setErr(null);

        const sanitized = clampItemsPerPage(itemsPerPage);
        setItemsPerPage(sanitized);

        try {
            const res = await fetch(`${API_BASE}/settings_api.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    settings: {
                        pagination_items_per_page: sanitized,
                    },
                }),
            });
            const data = await res.json();
            if (data.success) {
                setMsg('Pagination setting saved.');
            } else {
                setErr(data.message || 'Failed to save pagination setting.');
            }
        } catch {
            setErr('Network error.');
        } finally {
            setSaving(false);
        }
    };

    if (authLoading || pageLoading) {
        return (
            <SettingsLayout activeSection="pagination" user={user} onLogout={logout}>
                <div style={{ padding: 20 }}>Loading...</div>
            </SettingsLayout>
        );
    }

    return (
        <SettingsLayout activeSection="pagination" user={user} onLogout={logout}>
            <SettingsPageHeader embedded={embedded} title="Pagination Settings" onBack={() => router.push('/settings')} />

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
                    <h2 style={{ margin: '0 0 6px 0', fontSize: 14, fontWeight: 700, color: '#111827' }}>System Pagination</h2>
                    <p style={{ margin: '0 0 18px 0', fontSize: 13, color: '#6b7280' }}>
                        Set the default number of rows shown per page for admin paginated lists.
                    </p>

                    <div style={{ display: 'grid', gap: 6, maxWidth: 260 }}>
                        <label style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Items Per Page</label>
                        <input
                            type="number"
                            min={1}
                            max={100}
                            value={itemsPerPage}
                            onChange={(e) => setItemsPerPage(clampItemsPerPage(Number(e.target.value)))}
                            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, color: '#111' }}
                        />
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>Allowed range: 1 to 100</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            title="Save Settings"
                            aria-label="Save pagination settings"
                            style={{
                                background: '#1e3a8a', color: '#fff', border: 'none', padding: '10px 20px',
                                borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 14, opacity: saving ? 0.7 : 1,
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
