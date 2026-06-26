import { useState, useEffect, useRef, useCallback, type ChangeEvent } from 'react';
import { useRouter } from 'next/router';
import Pagination from '../../components/Pagination';
import CrudActionIcon from '../../components/CrudActionIcon';
import SettingsLayout from '../../components/SettingsLayout';
import { SettingsPageHeader } from '../../components/SettingsPageShell';
import { useAdminSettingsPage } from '../../components/useAdminSettingsPage';
import { confirmAction, notifyError, notifySuccess } from '@/utils/notify';
import { getApiBaseUrl } from '@/utils/network';

const API_BASE = getApiBaseUrl();

interface BackupFile {
    filename: string;
    size: number;
    created_at: string;
}

const MANILA_TIMEZONE = 'Asia/Manila';
const AUTO_BACKUP_TRIGGER_STORAGE_PREFIX = 'llb_auto_backup_last_trigger';

const WEEKDAY_INDEX: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
};

function getManilaTimeParts() {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: MANILA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        weekday: 'short',
    });

    const parts = formatter.formatToParts(new Date());
    const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';

    const year = Number(pick('year') || 0);
    const month = Number(pick('month') || 0);
    const day = Number(pick('day') || 0);
    const hour = pick('hour') || '00';
    const minute = pick('minute') || '00';
    const weekdayShort = pick('weekday');
    const weekday = WEEKDAY_INDEX[weekdayShort] ?? -1;

    return {
        year,
        month,
        day,
        hour,
        minute,
        weekday,
        slotKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${hour}:${minute}`,
    };
}

export default function SystemBackup() {
    const router = useRouter();
    const embedded = true;
    const ITEMS_PER_PAGE = 10;
    const { user, loading: authLoading, logout } = useAdminSettingsPage();
    const [pageLoading, setPageLoading] = useState(true);

    // Backup state
    const [backups, setBackups] = useState<BackupFile[]>([]);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importingUpload, setImportingUpload] = useState(false);
    const [restoringBackup, setRestoringBackup] = useState<string | null>(null);
    const [isManualBackupOpen, setIsManualBackupOpen] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    // Schedule state
    const [frequency, setFrequency] = useState('off');
    const [backupTime, setBackupTime] = useState('02:00');
    const [dayOfWeek, setDayOfWeek] = useState('0');
    const [dayOfMonth, setDayOfMonth] = useState('1');
    const [savingSchedule, setSavingSchedule] = useState(false);
    const [scheduleMsg, setScheduleMsg] = useState<string | null>(null);
    const [scheduleErr, setScheduleErr] = useState<string | null>(null);
    const autoBackupRunningRef = useRef(false);
    const importInputRef = useRef<HTMLInputElement | null>(null);

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

    useEffect(() => {
        if (!scheduleMsg) return;
        void notifySuccess(scheduleMsg);
        setScheduleMsg(null);
    }, [scheduleMsg]);

    useEffect(() => {
        if (!scheduleErr) return;
        void notifyError(scheduleErr);
        setScheduleErr(null);
    }, [scheduleErr]);

    useEffect(() => {
        if (!isManualBackupOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsManualBackupOpen(false);
            }
        };

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = originalOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isManualBackupOpen]);

    const fetchBackups = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/backup.php?action=list`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) setBackups(data.data || []);
        } catch (e) { console.error(e); }
    }, []);

    const fetchSchedule = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/backup.php?action=get_schedule`, { credentials: 'include' });
            const data = await res.json();
            if (data.success && data.data) {
                setFrequency(data.data.backup_frequency || 'off');
                setBackupTime(data.data.backup_time || '02:00');
                setDayOfWeek(data.data.backup_day_of_week || '0');
                setDayOfMonth(data.data.backup_day_of_month || '1');
            }
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => {
        if (authLoading || !user) return;

        let active = true;
        const loadPage = async () => {
            try {
                await Promise.all([fetchBackups(), fetchSchedule()]);
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
    }, [authLoading, fetchBackups, fetchSchedule, user]);

    const handleCreateBackup = async () => {
        setCreating(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch(`${API_BASE}/backup.php?action=create`, {
                method: 'POST',
                credentials: 'include',
            });
            const data = await res.json();
            if (data.success) {
                setMsg(`Backup created: ${data.data.filename}`);
                setBackups(prev => [data.data, ...prev]);
                closeManualBackupDialog();
            } else {
                setErr(data.message || 'Failed to create backup.');
            }
        } catch {
            setErr('Network error.');
        } finally {
            setCreating(false);
        }
    };

    const clearImportFileSelection = () => {
        setImportFile(null);
        if (importInputRef.current) {
            importInputRef.current.value = '';
        }
    };

    const closeManualBackupDialog = () => {
        setIsManualBackupOpen(false);
        clearImportFileSelection();
    };

    const handleImportFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] || null;
        setImportFile(file);
    };

    const handleImportUpload = async () => {
        if (!importFile) {
            setErr('Please choose a .sql backup file to import.');
            return;
        }

        if (!(await confirmAction({
            title: `Import backup "${importFile.name}"?`,
            text: 'This will overwrite current database tables and data.',
            confirmButtonText: 'Import Backup',
            icon: 'warning',
            danger: true,
        }))) return;

        setImportingUpload(true);
        setErr(null);
        setMsg(null);

        try {
            const formData = new FormData();
            formData.append('backup_file', importFile);

            const res = await fetch(`${API_BASE}/backup.php?action=import`, {
                method: 'POST',
                credentials: 'include',
                body: formData,
            });
            const data = await res.json();

            if (data.success) {
                setMsg(`Backup imported: ${data.data?.source || importFile.name}`);
                setBackups(prev => [data.data, ...prev]);
                closeManualBackupDialog();
            } else {
                setErr(data.message || 'Failed to import backup.');
            }
        } catch {
            setErr('Network error.');
        } finally {
            setImportingUpload(false);
        }
    };

    const handleRestoreBackup = async (filename: string) => {
        if (!(await confirmAction({
            title: `Restore backup "${filename}"?`,
            text: 'This will overwrite current database tables and data.',
            confirmButtonText: 'Restore Backup',
            icon: 'warning',
            danger: true,
        }))) return;

        setRestoringBackup(filename);
        setErr(null);
        setMsg(null);

        try {
            const res = await fetch(`${API_BASE}/backup.php?action=import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ filename }),
            });
            const data = await res.json();

            if (data.success) {
                setMsg(`Backup restored: ${filename}`);
            } else {
                setErr(data.message || 'Failed to restore backup.');
            }
        } catch {
            setErr('Network error.');
        } finally {
            setRestoringBackup(null);
        }
    };

    const handleDelete = async (filename: string) => {
        if (!(await confirmAction({
            title: `Delete backup "${filename}"?`,
            text: 'This action cannot be undone.',
            confirmButtonText: 'Delete',
            icon: 'warning',
            danger: true
        }))) return;
        setDeleting(filename);
        try {
            const res = await fetch(`${API_BASE}/backup.php?action=delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ filename }),
            });
            const data = await res.json();
            if (data.success) {
                setBackups(prev => prev.filter(b => b.filename !== filename));
                setMsg('Backup deleted.');
            } else {
                setErr(data.message || 'Failed to delete.');
            }
        } catch {
            setErr('Network error.');
        } finally {
            setDeleting(null);
        }
    };

    const downloadBackupFile = async (filename: string) => {
        const res = await fetch(`${API_BASE}/backup.php?action=download&file=${encodeURIComponent(filename)}`, {
            method: 'GET',
            credentials: 'include',
        });
        if (!res.ok) {
            throw new Error(`Download failed (${res.status})`);
        }

        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
    };

    const handleDownload = async (filename: string) => {
        try {
            await downloadBackupFile(filename);
        } catch {
            setErr('Failed to download backup file.');
        }
    };

    const handleSaveSchedule = async () => {
        setSavingSchedule(true);
        setScheduleMsg(null);
        setScheduleErr(null);
        try {
            const res = await fetch(`${API_BASE}/backup.php?action=set_schedule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    backup_frequency: frequency,
                    backup_time: backupTime,
                    backup_day_of_week: dayOfWeek,
                    backup_day_of_month: dayOfMonth,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setScheduleMsg('Schedule saved successfully.');
            } else {
                setScheduleErr(data.message || 'Failed to save schedule.');
            }
        } catch {
            setScheduleErr('Network error.');
        } finally {
            setSavingSchedule(false);
        }
    };

    useEffect(() => {
        if (authLoading || pageLoading) return;
        if (frequency === 'off') return;
        if (!user || user.role !== 'admin') return;

        const scheduleSignature = [frequency, backupTime, dayOfWeek, dayOfMonth].join('|');
        const storageKey = `${AUTO_BACKUP_TRIGGER_STORAGE_PREFIX}:${scheduleSignature}`;

        const isDueNow = () => {
            const now = getManilaTimeParts();
            const nowTime = `${now.hour}:${now.minute}`;
            if (nowTime !== backupTime) return { due: false, slotKey: now.slotKey };

            if (frequency === 'daily') return { due: true, slotKey: now.slotKey };
            if (frequency === 'weekly') {
                return { due: now.weekday === Number(dayOfWeek), slotKey: now.slotKey };
            }
            if (frequency === 'monthly') {
                return { due: now.day === Number(dayOfMonth), slotKey: now.slotKey };
            }
            return { due: false, slotKey: now.slotKey };
        };

        const runAutomaticBackupIfDue = async () => {
            if (autoBackupRunningRef.current) return;

            const due = isDueNow();
            if (!due.due) return;

            let lastTriggered = '';
            try {
                lastTriggered = localStorage.getItem(storageKey) || '';
            } catch {
                lastTriggered = '';
            }
            if (lastTriggered === due.slotKey) {
                return;
            }

            autoBackupRunningRef.current = true;
            try {
                const res = await fetch(`${API_BASE}/backup.php?action=create`, {
                    method: 'POST',
                    credentials: 'include',
                });
                const data = await res.json();
                if (!data.success) {
                    throw new Error(data.message || 'Automatic backup failed.');
                }

                const filename = String(data?.data?.filename || '');
                if (!filename) {
                    throw new Error('Automatic backup created without filename.');
                }

                await downloadBackupFile(filename);
                await fetchBackups();
                setMsg(`Automatic backup created and downloaded: ${filename}`);
                try {
                    localStorage.setItem(storageKey, due.slotKey);
                } catch {
                    // Non-fatal if local storage is unavailable.
                }
            } catch (e) {
                const message = e instanceof Error ? e.message : 'Automatic backup failed.';
                setErr(message);
            } finally {
                autoBackupRunningRef.current = false;
            }
        };

        void runAutomaticBackupIfDue();
        const timer = window.setInterval(() => {
            void runAutomaticBackupIfDue();
        }, 15000);

        return () => {
            window.clearInterval(timer);
        };
    }, [authLoading, backupTime, dayOfMonth, dayOfWeek, fetchBackups, frequency, pageLoading, user]);

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    };

    const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const paginatedBackups = backups.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(backups.length / ITEMS_PER_PAGE));
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [backups.length, currentPage]);

    if (authLoading || pageLoading) {
        return (
            <SettingsLayout activeSection="system-backup" user={user} onLogout={logout}>
                <div style={{ padding: 20 }}>Loading...</div>
            </SettingsLayout>
        );
    }

    return (
        <SettingsLayout activeSection="system-backup" user={user} onLogout={logout}>
            <SettingsPageHeader
                embedded={embedded}
                title="System Backup"
                onBack={() => router.push('/settings')}
                actions={(
                    <button
                        type="button"
                        onClick={() => setIsManualBackupOpen(true)}
                        style={{
                            background: '#1e3a8a',
                            color: '#fff',
                            border: 'none',
                            padding: '8px 14px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontWeight: 700,
                            fontSize: 13,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        <CrudActionIcon action="create" />
                        Manual Backup
                    </button>
                )}
            />

            {isManualBackupOpen ? (
                <div
                    role="presentation"
                    onClick={closeManualBackupDialog}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.5)',
                        zIndex: 1200,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 16,
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Manual Backup"
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            width: '100%',
                            maxWidth: 560,
                            background: '#fff',
                            borderRadius: 'var(--modal-radius)',
                            border: '1px solid #e5e7eb',
                            boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)',
                            overflow: 'hidden',
                        }}
                    >
                        <div style={{ padding: '16px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>Manual Backup</h2>
                                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>Create a backup or upload a `.sql` file to import.</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeManualBackupDialog}
                                aria-label="Close manual backup modal"
                                style={{
                                    border: '1px solid #d1d5db',
                                    background: '#fff',
                                    color: '#374151',
                                    width: 30,
                                    height: 30,
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                    fontSize: 14,
                                    lineHeight: 1,
                                }}
                            >
                                x
                            </button>
                        </div>
                        <div style={{ padding: 18, display: 'grid', gap: 14 }}>
                            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                <div style={{ minWidth: 220 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Create Backup</div>
                                    <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>Generate and store a new SQL backup now.</div>
                                </div>
                                <button
                                    onClick={handleCreateBackup}
                                    disabled={creating || importingUpload || restoringBackup !== null}
                                    style={{
                                        background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '9px 14px',
                                        borderRadius: 8,
                                        cursor: creating || importingUpload || restoringBackup !== null ? 'not-allowed' : 'pointer',
                                        fontWeight: 700,
                                        fontSize: 13,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        opacity: creating || importingUpload || restoringBackup !== null ? 0.7 : 1,
                                    }}
                                >
                                    {creating ? (
                                        <>
                                            <span style={{
                                                display: 'inline-block', width: 15, height: 15, border: '2px solid rgba(255,255,255,0.35)',
                                                borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                                            }} />
                                            Creating...
                                        </>
                                    ) : (
                                        <>
                                            <CrudActionIcon action="create" />
                                            Backup Now
                                        </>
                                    )}
                                </button>
                            </div>

                            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, display: 'grid', gap: 8 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Import Backup</div>
                                <div style={{ fontSize: 12, color: '#6b7280' }}>Upload a `.sql` backup file to restore database tables and data.</div>
                                <input
                                    ref={importInputRef}
                                    type="file"
                                    accept=".sql"
                                    onChange={handleImportFileChange}
                                    disabled={importingUpload || creating}
                                    style={{ fontSize: 13, color: '#111827' }}
                                />
                                <div style={{ fontSize: 12, color: '#6b7280' }}>
                                    {importFile ? `Selected: ${importFile.name}` : 'No file selected.'}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        onClick={handleImportUpload}
                                        disabled={importingUpload || creating || restoringBackup !== null || !importFile}
                                        style={{
                                            background: '#b45309',
                                            color: '#fff',
                                            border: 'none',
                                            padding: '9px 14px',
                                            borderRadius: 8,
                                            cursor: importingUpload || creating || restoringBackup !== null || !importFile ? 'not-allowed' : 'pointer',
                                            fontWeight: 700,
                                            fontSize: 13,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            opacity: importingUpload || creating || restoringBackup !== null || !importFile ? 0.7 : 1,
                                        }}
                                    >
                                        {importingUpload ? 'Importing...' : <><CrudActionIcon action="restore" /> Import Backup</>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* ---- Backup History Card ---- */}
            <div style={{
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20,
            }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>Backup History</h2>
                        <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 12,
                            fontWeight: 700, background: '#f0f9ff', color: '#1d4ed8',
                            border: '1px solid #93c5fd',
                        }}>
                            {backups.length}
                        </span>
                    </div>

                    {backups.length === 0 ? (
                        <div style={{ padding: '30px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 8px', display: 'block' }}>
                                <ellipse cx="12" cy="5" rx="9" ry="3" />
                                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                            </svg>
                            <p style={{ margin: 0 }}>No backups yet. Use the Manual Backup button above.</p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                                        <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontSize: 12, fontWeight: 700 }}>Filename</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontSize: 12, fontWeight: 700 }}>Size</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', fontSize: 12, fontWeight: 700 }}>Issued At</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7280', fontSize: 12, fontWeight: 700 }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedBackups.map(b => (
                                        <tr key={b.filename} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '12px', color: '#111827', fontSize: 13, fontWeight: 600 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                        <polyline points="14 2 14 8 20 8" />
                                                    </svg>
                                                    {b.filename}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px', color: '#6b7280', fontSize: 13 }}>
                                                {formatSize(b.size)}
                                            </td>
                                            <td style={{ padding: '12px', color: '#6b7280', fontSize: 13 }}>
                                                {b.created_at}
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                                    <button
                                                        onClick={() => handleDownload(b.filename)}
                                                        style={{
                                                            background: '#2563eb', color: '#fff', border: 'none',
                                                            padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                                                            fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
                                                        }}
                                                    >
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                            <polyline points="7 10 12 15 17 10" />
                                                            <line x1="12" y1="15" x2="12" y2="3" />
                                                        </svg>
                                                        Download
                                                    </button>
                                                    <button
                                                        onClick={() => handleRestoreBackup(b.filename)}
                                                        disabled={restoringBackup !== null || importingUpload}
                                                        title="Restore"
                                                        aria-label={`Restore backup ${b.filename}`}
                                                        style={{
                                                            background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
                                                            padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                                                            fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4,
                                                            opacity: restoringBackup !== null ? 0.5 : 1,
                                                        }}
                                                    >
                                                        {restoringBackup === b.filename ? 'Restoring...' : <><CrudActionIcon action="restore" /> Restore</>}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(b.filename)}
                                                        disabled={deleting === b.filename || restoringBackup !== null}
                                                        title="Delete"
                                                        aria-label={`Delete backup ${b.filename}`}
                                                        style={{
                                                            background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5',
                                                            padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                                                            fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                            opacity: deleting === b.filename || restoringBackup !== null ? 0.5 : 1,
                                                        }}
                                                    >
                                                        {deleting === b.filename ? 'Deleting...' : <CrudActionIcon action="delete" />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <Pagination
                                currentPage={currentPage}
                                totalItems={backups.length}
                                itemsPerPage={ITEMS_PER_PAGE}
                                onPageChange={setCurrentPage}
                                label="backups"
                            />
                        </div>
                    )}
            </div>

            {/* ---- Auto-Schedule Card ---- */}
            <div style={{
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20,
            }}>
                    <h2 style={{ margin: '0 0 6px 0', fontSize: 14, fontWeight: 700, color: '#111827' }}>Automatic Backup Schedule</h2>
                    <p style={{ margin: '0 0 18px 0', fontSize: 13, color: '#6b7280' }}>
                        Configure the system to automatically create backups on a recurring schedule.
                    </p>

                    {/* Frequency */}
                    <div style={{ display: 'grid', gap: 16 }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                            <label style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Frequency</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {(['off', 'daily', 'weekly', 'monthly'] as const).map(f => (
                                    <button
                                        key={f}
                                        type="button"
                                        onClick={() => setFrequency(f)}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: 8,
                                            border: frequency === f ? '2px solid #1e3a8a' : '1px solid #d1d5db',
                                            background: frequency === f ? '#eff6ff' : '#fff',
                                            color: frequency === f ? '#1e3a8a' : '#374151',
                                            fontWeight: frequency === f ? 700 : 500,
                                            fontSize: 13,
                                            cursor: 'pointer',
                                            textTransform: 'capitalize',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {frequency !== 'off' && (
                            <>
                                {/* Time */}
                                <div style={{ display: 'grid', gap: 6 }}>
                                    <label style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Backup Time</label>
                                    <input
                                        type="time"
                                        value={backupTime}
                                        onChange={e => setBackupTime(e.target.value)}
                                        style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, maxWidth: 200, color: '#111' }}
                                    />
                                    <span style={{ fontSize: 11, color: '#9ca3af' }}>Server timezone: Asia/Manila</span>
                                </div>

                                {/* Day of week (weekly) */}
                                {frequency === 'weekly' && (
                                    <div style={{ display: 'grid', gap: 6 }}>
                                        <label style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Day of Week</label>
                                        <select
                                            value={dayOfWeek}
                                            onChange={e => setDayOfWeek(e.target.value)}
                                            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, maxWidth: 200, color: '#111' }}
                                        >
                                            {weekDays.map((d, i) => (
                                                <option key={i} value={String(i)}>{d}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Day of month (monthly) */}
                                {frequency === 'monthly' && (
                                    <div style={{ display: 'grid', gap: 6 }}>
                                        <label style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Day of Month</label>
                                        <select
                                            value={dayOfMonth}
                                            onChange={e => setDayOfMonth(e.target.value)}
                                            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, maxWidth: 200, color: '#111' }}
                                        >
                                            {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                                                <option key={d} value={String(d)}>{d}</option>
                                            ))}
                                        </select>
                                        <span style={{ fontSize: 11, color: '#9ca3af' }}>Max 28 to avoid end-of-month issues</span>
                                    </div>
                                )}

                                {/* Schedule summary */}
                                <div style={{
                                    background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '12px 16px',
                                    display: 'flex', alignItems: 'center', gap: 10,
                                }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                    <span style={{ fontSize: 13, color: '#0c4a6e', fontWeight: 600 }}>
                                        {frequency === 'daily' && `Every day at ${backupTime}`}
                                        {frequency === 'weekly' && `Every ${weekDays[parseInt(dayOfWeek)]} at ${backupTime}`}
                                        {frequency === 'monthly' && `Every month on day ${dayOfMonth} at ${backupTime}`}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                        <button
                            onClick={handleSaveSchedule}
                            disabled={savingSchedule}
                            title="Save Schedule"
                            aria-label="Save backup schedule"
                            style={{
                                background: '#1e3a8a', color: '#fff', border: 'none', padding: '10px 20px',
                                borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 14,
                                opacity: savingSchedule ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            {savingSchedule ? 'Saving...' : 'Submit'}
                        </button>
                    </div>
            </div>

            <style jsx>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </SettingsLayout>
    );
}
