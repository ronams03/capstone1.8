import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import CrudActionIcon from '../../components/CrudActionIcon';
import PasswordInput from '../../components/PasswordInput';
import SettingsLayout from '../../components/SettingsLayout';
import { SettingsPageHeader } from '../../components/SettingsPageShell';
import { useAdminSettingsPage } from '../../components/useAdminSettingsPage';
import { confirmAction, notifyError, notifySuccess } from '@/utils/notify';
import { getApiBaseUrl } from '@/utils/network';

const API_BASE = getApiBaseUrl();

type ApiResponse<T = unknown> = {
    success?: boolean;
    data?: T;
    message?: string;
    error?: string;
};

type DataDeletionAccessStatus = {
    verified?: boolean;
    verified_until?: string | null;
    code_requested?: boolean;
    code_expires_at?: string | null;
    email_masked?: string;
};

type DeletionItem = {
    id: number;
    title: string;
    meta: string;
};

type ResourceKey =
    | 'users'
    | 'branches'
    | 'clients'
    | 'projects'
    | 'roles'
    | 'shifts'
    | 'documents'
    | 'payroll'
    | 'overtime';

type SectionState = {
    loading: boolean;
    items: DeletionItem[];
    deletingId: number | null;
    error: string;
};

type ResourceConfig = {
    label: string;
    subtitle: string;
    emptyText: string;
    load: () => Promise<DeletionItem[]>;
    deleteOne: (id: number) => Promise<ApiResponse<unknown>>;
};

const RESOURCE_ORDER: ResourceKey[] = [
    'users',
    'branches',
    'clients',
    'projects',
    'roles',
    'shifts',
    'documents',
    'payroll',
    'overtime',
];

const createInitialSections = (): Record<ResourceKey, SectionState> => ({
    users: { loading: false, items: [], deletingId: null, error: '' },
    branches: { loading: false, items: [], deletingId: null, error: '' },
    clients: { loading: false, items: [], deletingId: null, error: '' },
    projects: { loading: false, items: [], deletingId: null, error: '' },
    roles: { loading: false, items: [], deletingId: null, error: '' },
    shifts: { loading: false, items: [], deletingId: null, error: '' },
    documents: { loading: false, items: [], deletingId: null, error: '' },
    payroll: { loading: false, items: [], deletingId: null, error: '' },
    overtime: { loading: false, items: [], deletingId: null, error: '' },
});

const createInitialFilters = (): Record<ResourceKey, string> => ({
    users: '',
    branches: '',
    clients: '',
    projects: '',
    roles: '',
    shifts: '',
    documents: '',
    payroll: '',
    overtime: '',
});

const parseResourceKey = (value: string | string[] | undefined): ResourceKey | null => {
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw) return null;
    return RESOURCE_ORDER.includes(raw as ResourceKey) ? (raw as ResourceKey) : null;
};

const getMessage = (payload: ApiResponse<unknown>, fallback: string) =>
    String(payload.message || payload.error || fallback);

const stringValue = (value: unknown) => String(value ?? '').trim();
const numberValue = (value: unknown) => Number(value ?? 0);
const objectValue = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
    const response = await fetch(url, { credentials: 'include', ...init });
    return (await response.json()) as ApiResponse<T>;
}

export default function DataDeletionSettingsPage() {
    const router = useRouter();
    const embedded = true;
    const { user, loading: authLoading, logout } = useAdminSettingsPage();
    const [loadingPage, setLoadingPage] = useState(true);
    const [sections, setSections] = useState<Record<ResourceKey, SectionState>>(createInitialSections());
    const [filters, setFilters] = useState<Record<ResourceKey, string>>(createInitialFilters());
    const [accessGranted, setAccessGranted] = useState(false);
    const [codeRequested, setCodeRequested] = useState(false);
    const [emailMasked, setEmailMasked] = useState('');
    const [passwordInput, setPasswordInput] = useState('');
    const [codeInput, setCodeInput] = useState('');
    const [accessBusy, setAccessBusy] = useState(false);
    const [accessError, setAccessError] = useState('');
    const [accessMessage, setAccessMessage] = useState('');

    const resources = useMemo<Record<ResourceKey, ResourceConfig>>(
        () => ({
            users: {
                label: 'Users',
                subtitle: 'Inactive accounts',
                emptyText: 'No inactive users available for permanent deletion.',
                load: async () => {
                    const payload = await requestJson<Record<string, unknown>[]>(`${API_BASE}/users.php?status=inactive`);
                    if (!payload.success || !Array.isArray(payload.data)) return [];
                    return payload.data.map((entry) => {
                        const row = objectValue(entry);
                        const id = numberValue(row.id);
                        const firstName = stringValue(row.first_name);
                        const lastName = stringValue(row.last_name);
                        const username = stringValue(row.username);
                        const email = stringValue(row.email);

                        return {
                            id,
                            title: `${firstName} ${lastName}`.trim() || username || `User #${id}`,
                            meta: [username ? `@${username}` : null, email || null].filter(Boolean).join(' | '),
                        };
                    });
                },
                deleteOne: (id: number) =>
                    requestJson(`${API_BASE}/users.php?id=${id}&permanent=1`, { method: 'DELETE' }),
            },
            branches: {
                label: 'Branches',
                subtitle: 'Inactive branches',
                emptyText: 'No inactive branches available for permanent deletion.',
                load: async () => {
                    const payload = await requestJson<Record<string, unknown>[]>(`${API_BASE}/branches.php?status=inactive`);
                    if (!payload.success || !Array.isArray(payload.data)) return [];
                    return payload.data.map((entry) => {
                        const row = objectValue(entry);
                        const id = numberValue(row.branch_id);
                        return {
                            id,
                            title: stringValue(row.branch_name) || `Branch #${id}`,
                            meta: stringValue(row.location) || 'No location',
                        };
                    });
                },
                deleteOne: (id: number) =>
                    requestJson(`${API_BASE}/branches.php?id=${id}&permanent=1`, { method: 'DELETE' }),
            },
            clients: {
                label: 'Clients',
                subtitle: 'Inactive clients',
                emptyText: 'No inactive clients available for permanent deletion.',
                load: async () => {
                    const payload = await requestJson<Record<string, unknown>[]>(`${API_BASE}/clients.php?status=inactive`);
                    if (!payload.success || !Array.isArray(payload.data)) return [];
                    return payload.data.map((entry) => {
                        const row = objectValue(entry);
                        const id = numberValue(row.client_id);
                        const contactPerson = stringValue(row.contact_person);
                        const email = stringValue(row.email);

                        return {
                            id,
                            title: stringValue(row.client_name) || `Client #${id}`,
                            meta: [contactPerson || null, email || null].filter(Boolean).join(' | '),
                        };
                    });
                },
                deleteOne: (id: number) =>
                    requestJson(`${API_BASE}/clients.php?id=${id}&permanent=1`, { method: 'DELETE' }),
            },
            projects: {
                label: 'Projects',
                subtitle: 'Archived projects',
                emptyText: 'No archived projects available for permanent deletion.',
                load: async () => {
                    const payload = await requestJson<Record<string, unknown>[]>(`${API_BASE}/projects.php?status=archived`);
                    if (!payload.success || !Array.isArray(payload.data)) return [];
                    return payload.data.map((entry) => {
                        const row = objectValue(entry);
                        const id = numberValue(row.id);
                        return {
                            id,
                            title: stringValue(row.name) || `Project #${id}`,
                            meta: stringValue(row.client_name) || 'No client',
                        };
                    });
                },
                deleteOne: (id: number) =>
                    requestJson(`${API_BASE}/projects.php?id=${id}&permanent=1`, { method: 'DELETE' }),
            },
            roles: {
                label: 'Roles',
                subtitle: 'Archived roles',
                emptyText: 'No archived roles available for permanent deletion.',
                load: async () => {
                    const payload = await requestJson<Record<string, unknown>[]>(`${API_BASE}/roles.php?status=archived`);
                    if (!payload.success || !Array.isArray(payload.data)) return [];
                    return payload.data.map((entry) => {
                        const row = objectValue(entry);
                        const id = numberValue(row.role_id);
                        return {
                            id,
                            title: stringValue(row.role_name) || `Role #${id}`,
                            meta: `${numberValue(row.employee_count)} assigned employees`,
                        };
                    });
                },
                deleteOne: (id: number) =>
                    requestJson(`${API_BASE}/roles.php?id=${id}&permanent=1`, { method: 'DELETE' }),
            },
            shifts: {
                label: 'Shift Schedules',
                subtitle: 'Cancelled shifts',
                emptyText: 'No cancelled shifts available for permanent deletion.',
                load: async () => {
                    const payload = await requestJson<Record<string, unknown>[]>(`${API_BASE}/shift-schedules.php?status=cancelled`);
                    if (!payload.success || !Array.isArray(payload.data)) return [];
                    return payload.data.map((entry) => {
                        const row = objectValue(entry);
                        const id = numberValue(row.shift_schedule_id);
                        const employeeName = stringValue(row.employee_name);
                        const employeeId = numberValue(row.employee_id);
                        const shiftDate = stringValue(row.shift_date);
                        const shiftStart = stringValue(row.shift_start).slice(0, 5);
                        const shiftEnd = stringValue(row.shift_end).slice(0, 5);

                        return {
                            id,
                            title: `${employeeName || `Employee #${employeeId}`}${shiftDate ? ` | ${shiftDate}` : ''}`,
                            meta: `${shiftStart} - ${shiftEnd}`,
                        };
                    });
                },
                deleteOne: (id: number) =>
                    requestJson(`${API_BASE}/shift-schedules.php?id=${id}&permanent=1`, { method: 'DELETE' }),
            },
            documents: {
                label: 'Documents',
                subtitle: 'Archived document records',
                emptyText: 'No archived document records available for permanent deletion.',
                load: async () => {
                    const payload = await requestJson<Record<string, unknown>[]>(`${API_BASE}/documents.php?action=list_received&status=archived`);
                    if (!payload.success || !Array.isArray(payload.data)) return [];
                    return payload.data.map((entry) => {
                        const row = objectValue(entry);
                        const id = numberValue(row.document_id);
                        const clientName = stringValue(row.client_name);
                        const receivedDate = stringValue(row.received_date);

                        return {
                            id,
                            title: stringValue(row.document_name) || `Document #${id}`,
                            meta: [clientName || null, receivedDate || null].filter(Boolean).join(' | '),
                        };
                    });
                },
                deleteOne: (id: number) =>
                    requestJson(`${API_BASE}/documents.php?action=delete_received`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ document_id: id }),
                    }),
            },
            payroll: {
                label: 'Payroll',
                subtitle: 'Archived payroll records',
                emptyText: 'No archived payroll records available for permanent deletion.',
                load: async () => {
                    const payload = await requestJson<Record<string, unknown>[]>(`${API_BASE}/payroll.php?status=archived`);
                    if (!payload.success || !Array.isArray(payload.data)) return [];
                    return payload.data.map((entry) => {
                        const row = objectValue(entry);
                        const id = numberValue(row.id);
                        const fullName = stringValue(row.full_employee_name);
                        const employeeName = stringValue(row.employee_name);
                        const periodStart = stringValue(row.pay_period_start) || '-';
                        const periodEnd = stringValue(row.pay_period_end) || '-';

                        return {
                            id,
                            title: fullName || employeeName || `Payroll #${id}`,
                            meta: `${periodStart} to ${periodEnd}`,
                        };
                    });
                },
                deleteOne: (id: number) =>
                    requestJson(`${API_BASE}/payroll.php?id=${id}`, { method: 'DELETE' }),
            },
            overtime: {
                label: 'Overtime Requests',
                subtitle: 'Archived rejected overtime requests',
                emptyText: 'No archived overtime requests available for permanent deletion.',
                load: async () => {
                    const payload = await requestJson<Record<string, unknown>[]>(`${API_BASE}/overtime-requests.php?archived=1`);
                    if (!payload.success || !Array.isArray(payload.data)) return [];
                    return payload.data.map((entry) => {
                        const row = objectValue(entry);
                        const id = numberValue(row.overtime_request_id);
                        const employeeName = stringValue(row.employee_name);
                        const employeeId = numberValue(row.employee_id);
                        const workDate = stringValue(row.work_date);
                        const archivedAt = stringValue(row.archived_at);

                        return {
                            id,
                            title: `${employeeName || `Employee #${employeeId}`}${workDate ? ` | ${workDate}` : ''}`,
                            meta: [stringValue(row.status) || null, archivedAt ? `Archived ${archivedAt}` : null].filter(Boolean).join(' | '),
                        };
                    });
                },
                deleteOne: (id: number) =>
                    requestJson(`${API_BASE}/overtime-requests.php?id=${id}`, { method: 'DELETE' }),
            },
        }),
        []
    );

    const loadSection = useCallback(async (key: ResourceKey) => {
        setSections((prev) => ({
            ...prev,
            [key]: { ...prev[key], loading: true, error: '' },
        }));

        try {
            const items = await resources[key].load();
            setSections((prev) => ({
                ...prev,
                [key]: { ...prev[key], loading: false, items, error: '' },
            }));
        } catch {
            setSections((prev) => ({
                ...prev,
                [key]: {
                    ...prev[key],
                    loading: false,
                    error: `Failed to load ${resources[key].label.toLowerCase()}.`,
                },
            }));
        }
    }, [resources]);

    const loadAllSections = useCallback(async () => {
        await Promise.all(RESOURCE_ORDER.map(async (key) => {
            await loadSection(key);
        }));
    }, [loadSection]);

    const loadAccessStatus = useCallback(async () => {
        const payload = await requestJson<DataDeletionAccessStatus>(`${API_BASE}/auth.php?action=data_deletion_access_status`);
        if (!payload.success) {
            setAccessGranted(false);
            setCodeRequested(false);
            setEmailMasked('');
            return false;
        }

        const verified = !!payload.data?.verified;
        setAccessGranted(verified);
        setCodeRequested(!!payload.data?.code_requested);
        setEmailMasked(String(payload.data?.email_masked || ''));
        return verified;
    }, []);

    useEffect(() => {
        if (authLoading || !user) return;

        let active = true;
        const loadPage = async () => {
            try {
                const verified = await loadAccessStatus();
                if (verified) {
                    await loadAllSections();
                }
            } finally {
                if (active) {
                    setLoadingPage(false);
                }
            }
        };

        void loadPage();
        return () => {
            active = false;
        };
    }, [authLoading, loadAccessStatus, loadAllSections, user]);

    useEffect(() => {
        if (!accessError) return;
        void notifyError(accessError);
        setAccessError('');
    }, [accessError]);

    useEffect(() => {
        if (!accessMessage) return;
        void notifySuccess(accessMessage);
        setAccessMessage('');
    }, [accessMessage]);

    useEffect(() => {
        const sectionErrors = RESOURCE_ORDER
            .map((key) => sections[key].error)
            .filter((message): message is string => Boolean(message));
        if (sectionErrors.length === 0) return;

        sectionErrors.forEach((message) => {
            void notifyError(message);
        });

        setSections((prev) => {
            const next = { ...prev };
            RESOURCE_ORDER.forEach((key) => {
                if (!next[key].error) return;
                next[key] = { ...next[key], error: '' };
            });
            return next;
        });
    }, [sections]);

    const activeResource = useMemo<ResourceKey>(
        () => parseResourceKey(router.query.resource) || RESOURCE_ORDER[0],
        [router.query.resource]
    );

    useEffect(() => {
        if (!router.isReady) return;
        if (parseResourceKey(router.query.resource)) return;

        void router.replace(
            {
                pathname: router.pathname,
                query: { ...router.query, resource: RESOURCE_ORDER[0] },
            },
            undefined,
            { shallow: true }
        );
    }, [router.isReady, router.pathname, router.query, router]);

    const selectResource = (key: ResourceKey) => {
        if (key === activeResource) return;

        void router.push(
            {
                pathname: router.pathname,
                query: { ...router.query, resource: key },
            },
            undefined,
            { shallow: true }
        );
    };

    const handleRequestAccessCode = async () => {
        if (!passwordInput.trim()) {
            setAccessError('Enter your admin password first.');
            return;
        }

        setAccessBusy(true);
        setAccessError('');
        setAccessMessage('');
        try {
            const payload = await requestJson<{ email_masked?: string }>(`${API_BASE}/auth.php?action=data_deletion_request_code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: passwordInput }),
            });

            if (!payload.success) {
                setAccessError(getMessage(payload, 'Failed to send verification code.'));
                return;
            }

            setCodeRequested(true);
            setEmailMasked(String(payload.data?.email_masked || emailMasked));
            setAccessMessage('An 8-digit verification code was sent to your admin email.');
        } catch {
            setAccessError('Network error while requesting the verification code.');
        } finally {
            setAccessBusy(false);
        }
    };

    const handleVerifyAccessCode = async () => {
        const cleanCode = codeInput.replace(/\D/g, '').slice(0, 8);
        if (cleanCode.length !== 8) {
            setAccessError('Enter the 8-digit verification code.');
            return;
        }

        setAccessBusy(true);
        setAccessError('');
        setAccessMessage('');
        try {
            const payload = await requestJson(`${API_BASE}/auth.php?action=data_deletion_verify_code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: cleanCode }),
            });

            if (!payload.success) {
                setAccessError(getMessage(payload, 'Failed to verify code.'));
                return;
            }

            setAccessGranted(true);
            setCodeRequested(false);
            setPasswordInput('');
            setCodeInput('');
            setAccessMessage('Verification successful. Data Deletion Control is now unlocked.');
            await loadAllSections();
        } catch {
            setAccessError('Network error while verifying code.');
        } finally {
            setAccessBusy(false);
        }
    };

    const handleDeleteOne = async (key: ResourceKey, item: DeletionItem) => {
        const confirmed = await confirmAction({
            title: `Delete ${resources[key].label.toLowerCase()} permanently?`,
            text: `${item.title} will be deleted permanently. This cannot be undone.`,
            confirmButtonText: 'Delete Permanently',
            icon: 'warning',
            danger: true,
        });
        if (!confirmed) return;

        setSections((prev) => ({
            ...prev,
            [key]: { ...prev[key], deletingId: item.id },
        }));

        try {
            const payload = await resources[key].deleteOne(item.id);
            if (!payload.success) {
                alert(getMessage(payload, `Failed to delete ${resources[key].label.toLowerCase()}.`));
                return;
            }
            await loadSection(key);
        } catch {
            alert(`Network error while deleting ${resources[key].label.toLowerCase()}.`);
        } finally {
            setSections((prev) => ({
                ...prev,
                [key]: { ...prev[key], deletingId: null },
            }));
        }
    };

    const handleDeleteAll = async (key: ResourceKey) => {
        const items = sections[key].items;
        if (items.length === 0) return;

        const confirmed = await confirmAction({
            title: `Delete all ${resources[key].label.toLowerCase()} records?`,
            text: `${items.length} record(s) will be permanently deleted. This cannot be undone.`,
            confirmButtonText: 'Delete All Permanently',
            icon: 'warning',
            danger: true,
        });
        if (!confirmed) return;

        setSections((prev) => ({
            ...prev,
            [key]: { ...prev[key], deletingId: -1 },
        }));

        let failed = 0;
        for (const item of items) {
            try {
                const payload = await resources[key].deleteOne(item.id);
                if (!payload.success) failed += 1;
            } catch {
                failed += 1;
            }
        }

        await loadSection(key);
        setSections((prev) => ({
            ...prev,
            [key]: { ...prev[key], deletingId: null },
        }));

        if (failed > 0) {
            alert(`${failed} record(s) could not be deleted. Review dependencies and try again.`);
        }
    };

    const totalCandidates = RESOURCE_ORDER.reduce(
        (sum, key) => sum + sections[key].items.length,
        0
    );
    const activeState = sections[activeResource];
    const activeConfig = resources[activeResource];
    const activeFilter = filters[activeResource];
    const filteredItems = activeState.items.filter((item) =>
        `${item.title} ${item.meta}`.toLowerCase().includes(activeFilter.trim().toLowerCase())
    );
    const deletingAll = activeState.deletingId === -1;

    if (authLoading || loadingPage) {
        return (
            <SettingsLayout activeSection="data-deletion" user={user} onLogout={logout}>
                <div style={{ padding: 20 }}>Loading...</div>
            </SettingsLayout>
        );
    }
    if (!user) return null;

    return (
        <SettingsLayout activeSection="data-deletion" user={user} onLogout={logout}>
            <div style={{ display: 'grid', gap: 20, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                        <SettingsPageHeader embedded={embedded} title="Data Deletion Control" onBack={() => router.push('/settings')} />
                        <p style={{ margin: '6px 0 0 0', color: '#6b7280', fontSize: 13 }}>
                            Permanent deletion is restricted to admin settings. Candidate records: <strong>{totalCandidates}</strong>
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: '0 0 auto', marginLeft: 'auto' }}>
                        {accessGranted && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => selectResource('payroll')}
                                    style={{ padding: '8px 14px', border: '1px solid #1d4ed8', borderRadius: 8, background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontWeight: 700 }}
                                >
                                    Payroll
                                </button>
                                <button
                                    type="button"
                                    onClick={() => selectResource('overtime')}
                                    style={{ padding: '8px 14px', border: '1px solid #1d4ed8', borderRadius: 8, background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontWeight: 700 }}
                                >
                                    Overtime
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void loadAllSections()}
                                    style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 8, background: 'white', color: '#374151', cursor: 'pointer', fontWeight: 600 }}
                                >
                                    Refresh All
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {!accessGranted ? (
                    <>
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '12px 14px', marginBottom: 18, fontSize: 13 }}>
                            This page is locked. Enter your admin password, then verify using the 8-digit code sent to your admin email.
                        </div>

                        <section style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, maxWidth: 620 }}>
                            <h2 style={{ margin: 0, fontSize: 14, color: '#111827' }}>Admin Verification Required</h2>
                            <p style={{ margin: '8px 0 14px 0', fontSize: 13, color: '#6b7280' }}>
                                Step 1: confirm your password. Step 2: enter the 8-digit code from {emailMasked || 'your admin email'}.
                            </p>

                            <div style={{ display: 'grid', gap: 10 }}>
                                <div style={{ display: 'grid', gap: 6 }}>
                                    <label style={{ fontSize: 12, color: '#374151' }}>Admin password</label>
                                    <PasswordInput
                                        value={passwordInput}
                                        onChange={(event) => setPasswordInput(event.target.value)}
                                        placeholder="Enter admin password"
                                        disabled={accessBusy}
                                        style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => void handleRequestAccessCode()}
                                        disabled={accessBusy}
                                        style={{ padding: '8px 12px', border: '1px solid #1d4ed8', background: '#1d4ed8', color: '#ffffff', borderRadius: 8, fontWeight: 600, cursor: accessBusy ? 'default' : 'pointer', opacity: accessBusy ? 0.7 : 1 }}
                                    >
                                        {accessBusy ? 'Sending...' : 'Send 8-digit Code'}
                                    </button>
                                </div>

                                {codeRequested && (
                                    <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
                                        <div style={{ display: 'grid', gap: 6 }}>
                                            <label style={{ fontSize: 12, color: '#374151' }}>Verification code</label>
                                            <input
                                                type="text"
                                                value={codeInput}
                                                onChange={(event) => setCodeInput(event.target.value.replace(/\D/g, '').slice(0, 8))}
                                                inputMode="numeric"
                                                maxLength={8}
                                                placeholder="Enter 8-digit code"
                                                disabled={accessBusy}
                                                style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, letterSpacing: 2 }}
                                            />
                                        </div>
                                        <div>
                                            <button
                                                type="button"
                                                onClick={() => void handleVerifyAccessCode()}
                                                disabled={accessBusy}
                                                style={{ padding: '8px 12px', border: '1px solid #111827', background: '#111827', color: '#ffffff', borderRadius: 8, fontWeight: 600, cursor: accessBusy ? 'default' : 'pointer', opacity: accessBusy ? 0.7 : 1 }}
                                            >
                                                {accessBusy ? 'Verifying...' : 'Verify and Unlock'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                            </div>
                        </section>
                    </>
                ) : (
                    <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, width: '100%' }}>
                            {RESOURCE_ORDER.map((key) => {
                                const config = resources[key];
                                const isActive = key === activeResource;
                                const count = sections[key].items.length;

                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => selectResource(key)}
                                        style={{
                                            padding: '8px 12px',
                                            borderRadius: 8,
                                            border: isActive ? '1px solid #1d4ed8' : '1px solid #d1d5db',
                                            background: isActive ? '#eff6ff' : '#ffffff',
                                            color: isActive ? '#1d4ed8' : '#374151',
                                            fontWeight: 600,
                                            fontSize: 13,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            flexShrink: 0,
                                        }}
                                    >
                                        <span>{config.label}</span>
                                        <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 999, background: isActive ? '#dbeafe' : '#f3f4f6' }}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '12px 14px', marginBottom: 18, fontSize: 13 }}>
                            Warning: Permanent deletion cannot be undone. Review each record carefully before confirming.
                        </div>

                        <section style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', minWidth: 0 }}>
                            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'grid', gap: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: 14, color: '#111827' }}>{activeConfig.label}</h2>
                                        <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#6b7280' }}>{activeConfig.subtitle}</p>
                                    </div>
                                    <span style={{ fontSize: 12, color: '#6b7280' }}>
                                        Showing {filteredItems.length} of {activeState.items.length} item(s)
                                    </span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0, flex: '1 1 260px' }}>
                                        <input
                                            type="text"
                                            value={activeFilter}
                                            onChange={(event) =>
                                                setFilters((prev) => ({ ...prev, [activeResource]: event.target.value }))
                                            }
                                            placeholder={`Filter ${activeConfig.label.toLowerCase()}...`}
                                            style={{ minWidth: 0, width: 'min(100%, 290px)', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, color: '#111827' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setFilters((prev) => ({ ...prev, [activeResource]: '' }))}
                                            disabled={!activeFilter}
                                            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 8, background: 'white', color: '#374151', cursor: activeFilter ? 'pointer' : 'default', opacity: activeFilter ? 1 : 0.6 }}
                                        >
                                            Clear
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: '0 0 auto' }}>
                                        <button
                                            type="button"
                                            onClick={() => void loadSection(activeResource)}
                                            disabled={activeState.loading || deletingAll}
                                            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 8, background: 'white', color: '#374151', cursor: activeState.loading || deletingAll ? 'default' : 'pointer', opacity: activeState.loading || deletingAll ? 0.6 : 1 }}
                                        >
                                            Refresh
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleDeleteAll(activeResource)}
                                            disabled={activeState.items.length === 0 || activeState.loading || deletingAll}
                                            title="Delete All"
                                            aria-label={`Delete all ${activeConfig.label}`}
                                            style={{ padding: '6px 10px', border: 'none', borderRadius: 8, background: '#b91c1c', color: 'white', cursor: activeState.items.length === 0 || activeState.loading || deletingAll ? 'default' : 'pointer', opacity: activeState.items.length === 0 || activeState.loading || deletingAll ? 0.6 : 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            {deletingAll ? 'Deleting...' : <CrudActionIcon action="delete" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {activeState.loading ? (
                                <div style={{ padding: 16, color: '#6b7280', fontSize: 13 }}>Loading...</div>
                            ) : activeState.items.length === 0 ? (
                                <div style={{ padding: 16, color: '#94a3b8', fontSize: 13 }}>{activeConfig.emptyText}</div>
                            ) : filteredItems.length === 0 ? (
                                <div style={{ padding: 16, color: '#94a3b8', fontSize: 13 }}>
                                    No records match the current filter.
                                </div>
                            ) : (
                                <div style={{ width: '100%', overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead style={{ background: '#f8fafc' }}>
                                            <tr>
                                                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 12, color: '#6b7280' }}>Record</th>
                                                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 12, color: '#6b7280' }}>Details</th>
                                                <th style={{ textAlign: 'right', padding: '10px 16px', fontSize: 12, color: '#6b7280' }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredItems.map((item) => (
                                                <tr key={`${activeResource}-${item.id}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '10px 16px', fontSize: 13, color: '#111827', fontWeight: 600 }}>{item.title}</td>
                                                    <td style={{ padding: '10px 16px', fontSize: 13, color: '#6b7280' }}>{item.meta || '-'}</td>
                                                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleDeleteOne(activeResource, item)}
                                                            disabled={activeState.deletingId === item.id || deletingAll}
                                                            title="Delete Permanently"
                                                            aria-label={`Delete ${item.title}`}
                                                            style={{ padding: '6px 10px', border: 'none', borderRadius: 8, background: '#dc2626', color: 'white', cursor: activeState.deletingId === item.id || deletingAll ? 'default' : 'pointer', opacity: activeState.deletingId === item.id || deletingAll ? 0.6 : 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                        >
                                                            {activeState.deletingId === item.id ? 'Deleting...' : <CrudActionIcon action="delete" />}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>
        </SettingsLayout>
    );
}
