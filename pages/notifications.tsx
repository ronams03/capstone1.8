import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import { getBackendBaseUrl } from '@/utils/network';
import {
    countUnreadNotifications,
    getNotificationReadState,
    isNotificationRead,
    markNotificationsReadInStorage,
    markNotificationsUnreadInStorage,
    subscribeToNotificationReadState,
} from '@/utils/notificationReadState';
import { notifyError } from '@/utils/notify';
import { formatRouteLabel } from '@/utils/routeLabels';

const API_BASE_URL = getBackendBaseUrl();
const ITEMS_PER_PAGE = 12;

type SessionUser = {
    id?: number | string;
    username?: string;
    role?: string;
    [key: string]: unknown;
};

type TaskAssignmentNotificationMeta = {
    kind?: string;
    task_id?: number;
    task_title?: string;
    assigned_by_name?: string;
    assigned_by_role?: string;
    project_name?: string;
    client_name?: string;
    priority?: string;
    due_date?: string;
};

type NotificationRow = {
    id: string;
    read_key?: string;
    type: string;
    title: string;
    message: string;
    severity: 'info' | 'medium' | 'high' | 'success' | string;
    occurred_at: string;
    link?: string;
    meta?: {
        assignment?: TaskAssignmentNotificationMeta;
        [key: string]: unknown;
    };
};

type ApiResponse<T> = {
    success?: boolean;
    message?: string;
    data?: T;
};

export default function NotificationsPage() {
    const router = useRouter();
    const [user, setUser] = useState<SessionUser | null>(null);
    const [rows, setRows] = useState<NotificationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [severityFilter, setSeverityFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [readState, setReadState] = useState<Record<string, number>>({});
    const notificationClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const notificationReadStorageKey = useMemo(() => {
        const identity = String(user?.id ?? user?.username ?? user?.role ?? 'anonymous').trim().toLowerCase() || 'anonymous';
        return `notificationsRead:${identity}`;
    }, [user?.id, user?.role, user?.username]);

    useEffect(() => {
        const init = async () => {
            try {
                const sessionRes = await fetch(`${API_BASE_URL}/api/auth.php`, { credentials: 'include' });
                const sessionData = (await sessionRes.json()) as ApiResponse<SessionUser>;
                if (!sessionData.success || !sessionData.data) {
                    router.push('/');
                    return;
                }

                setUser(sessionData.data);
                await fetchNotifications();
            } catch {
                router.push('/');
            } finally {
                setLoading(false);
            }
        };

        init();
    }, [router]);

    const fetchNotifications = async () => {
        setError('');
        try {
            const res = await fetch(`${API_BASE_URL}/api/notifications.php`, { credentials: 'include' });
            const data = (await res.json()) as ApiResponse<NotificationRow[]>;
            if (data.success && Array.isArray(data.data)) {
                setRows(data.data);
            } else {
                setRows([]);
                setError(data.message || 'Failed to load notifications.');
            }
        } catch {
            setRows([]);
            setError('Failed to load notifications.');
        }
    };

    const visibleRows = useMemo(() => {
        const term = search.trim().toLowerCase();
        return rows.filter((row) => {
            if (typeFilter !== 'all' && String(row.type) !== typeFilter) return false;
            if (severityFilter !== 'all' && String(row.severity) !== severityFilter) return false;
            if (!term) return true;
            const haystack = `${row.title} ${row.message} ${row.type}`.toLowerCase();
            return haystack.includes(term);
        });
    }, [rows, typeFilter, severityFilter, search]);

    const paginatedRows = visibleRows.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    const unreadVisibleCount = useMemo(() => countUnreadNotifications(visibleRows, readState), [readState, visibleRows]);
    const unreadTotalCount = useMemo(() => countUnreadNotifications(rows, readState), [readState, rows]);

    const syncReadState = useCallback(() => {
        setReadState(getNotificationReadState(notificationReadStorageKey));
    }, [notificationReadStorageKey]);

    useEffect(() => {
        setCurrentPage(1);
    }, [typeFilter, severityFilter, search]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(visibleRows.length / ITEMS_PER_PAGE));
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [visibleRows.length, currentPage]);

    useEffect(() => {
        if (!error) return;
        void notifyError(error);
        setError('');
    }, [error]);

    useEffect(() => {
        syncReadState();
    }, [syncReadState]);

    useEffect(() => {
        return subscribeToNotificationReadState(notificationReadStorageKey, syncReadState);
    }, [notificationReadStorageKey, syncReadState]);

    useEffect(() => {
        return () => {
            if (notificationClickTimerRef.current) {
                clearTimeout(notificationClickTimerRef.current);
            }
        };
    }, []);

    const handleLogout = async () => {
        await fetch(`${API_BASE_URL}/api/auth.php?action=logout`, { method: 'POST', credentials: 'include' });
        router.push('/');
    };

    const handleMarkRowsAsRead = useCallback((items: NotificationRow[]) => {
        const nextState = markNotificationsReadInStorage(notificationReadStorageKey, items);
        setReadState(nextState);
    }, [notificationReadStorageKey]);

    const handleMarkRowsAsUnread = useCallback((items: NotificationRow[]) => {
        const nextState = markNotificationsUnreadInStorage(notificationReadStorageKey, items);
        setReadState(nextState);
    }, [notificationReadStorageKey]);

    const handleNotificationRowClick = useCallback((row: NotificationRow) => {
        if (notificationClickTimerRef.current) {
            clearTimeout(notificationClickTimerRef.current);
        }

        notificationClickTimerRef.current = setTimeout(() => {
            handleMarkRowsAsRead([row]);
            if (row.link) {
                void router.push(row.link);
            }
            notificationClickTimerRef.current = null;
        }, 220);
    }, [handleMarkRowsAsRead, router]);

    const handleNotificationRowDoubleClick = useCallback((row: NotificationRow) => {
        if (notificationClickTimerRef.current) {
            clearTimeout(notificationClickTimerRef.current);
            notificationClickTimerRef.current = null;
        }

        handleMarkRowsAsUnread([row]);
    }, [handleMarkRowsAsUnread]);

    const getAssignmentMeta = useCallback((row: NotificationRow) => {
        const assignment = row.meta?.assignment;
        if (!assignment || typeof assignment !== 'object') return null;
        const taskTitle = String(assignment.task_title || '').trim();
        const assignedByName = String(assignment.assigned_by_name || '').trim();
        if (taskTitle === '' && assignedByName === '') return null;
        return assignment;
    }, []);

    const formatAssignerRoleLabel = useCallback((value: string | undefined) => {
        const normalized = String(value || '').trim().toLowerCase();
        if (normalized === 'manager') return 'Manager';
        if (normalized === 'administrator' || normalized === 'admin') return 'Administrator';
        if (!normalized) return 'Administrator';
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }, []);

    if (loading) {

      return (

        <Layout role={String(user?.role || '')} user={user} onLogout={handleLogout}>

          <div style={{ padding: 20 }}>Loading...</div>

        </Layout>

      );

    }

    return (
        <Layout role={user?.role as string | undefined} user={user} onLogout={handleLogout}>
            <Head><title>Notifications</title></Head>
            <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
                <div className="pageHeaderInline" style={{ marginBottom: 8 }}>
                    <div className="pageHeaderText">
                        <h1 style={{ margin: 0, fontSize: 14, color: '#1f2937' }}>Notifications</h1>
                        <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: 13 }}>
                            {unreadTotalCount} unread across {rows.length} notifications. Click a card to open and mark it as read. Double-click any card to mark it as unread.
                        </p>
                    </div>
                    <div className="pageInlineFilters">
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search notifications..."
                            style={{ flex: '1 1 220px', minWidth: 180, padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                        />
                        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={filterStyle}>
                            <option value="all">All Types</option>
                            <option value="activity">Activity</option>
                            <option value="task">Task</option>
                            <option value="client">Client</option>
                            <option value="leave">Leave</option>
                            <option value="payroll">Payroll</option>
                            <option value="profile">Profile</option>
                            <option value="shift">Shift</option>
                            <option value="approval">Approval</option>
                        </select>
                        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} style={filterStyle}>
                            <option value="all">All Severity</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="info">Info</option>
                            <option value="success">Success</option>
                        </select>
                        <button
                            onClick={() => handleMarkRowsAsRead(visibleRows)}
                            disabled={visibleRows.length === 0 || unreadVisibleCount === 0}
                            style={secondaryButtonStyle(visibleRows.length === 0 || unreadVisibleCount === 0)}
                        >
                            Read all
                        </button>
                        <button onClick={fetchNotifications} style={primaryButtonStyle}>
                            Refresh
                        </button>
                    </div>
                </div>

                {visibleRows.length === 0 ? (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 22, color: '#64748b', textAlign: 'center' }}>
                        No notifications found.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                        {paginatedRows.map((row) => {
                            const rowIsRead = isNotificationRead(row, readState);
                            const assignmentMeta = getAssignmentMeta(row);
                            const assignedByName = String(assignmentMeta?.assigned_by_name || '').trim();
                            const assignedByRoleLabel = formatAssignerRoleLabel(assignmentMeta?.assigned_by_role);
                            const assignmentKindLabel = String(assignmentMeta?.kind || '').toLowerCase() === 'reassigned' ? 'Reassigned' : 'Assigned';

                            return (
                                <button
                                    key={row.id}
                                    onClick={() => handleNotificationRowClick(row)}
                                    onDoubleClick={() => handleNotificationRowDoubleClick(row)}
                                    title={rowIsRead ? 'Double-click to mark as unread.' : 'Click to open and mark as read.'}
                                    style={notificationRowStyle(rowIsRead)}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            {!rowIsRead && <span style={unreadDotStyle} />}
                                            <span style={severityDot(row.severity)} />
                                            <strong style={{ color: '#0f172a' }}>{row.title}</strong>
                                            <span style={readStatusStyle(rowIsRead)}>
                                                {rowIsRead ? 'Read' : 'Unread'}
                                            </span>
                                        </div>
                                        <span style={{ color: '#64748b', fontSize: 12 }}>{new Date(row.occurred_at).toLocaleString()}</span>
                                    </div>
                                    <div style={{ color: '#334155', fontSize: 13, marginBottom: 4 }}>{row.message}</div>
                                    {assignmentMeta && (
                                        <div style={assignmentPanelStyle}>
                                            <div style={assignmentPanelHeaderStyle}>
                                                <span style={assignmentBadgeStyle}>{assignmentKindLabel}</span>
                                                <span style={assignmentByStyle}>
                                                    Assigned by {assignedByName || 'Administrator'} ({assignedByRoleLabel})
                                                </span>
                                            </div>
                                            <div style={assignmentPillsWrapStyle}>
                                                {assignmentMeta.project_name && (
                                                    <span style={assignmentPillStyle}>Project: {assignmentMeta.project_name}</span>
                                                )}
                                                {assignmentMeta.client_name && (
                                                    <span style={assignmentPillStyle}>Client: {assignmentMeta.client_name}</span>
                                                )}
                                                {assignmentMeta.priority && (
                                                    <span style={assignmentPillStyle}>Priority: {assignmentMeta.priority}</span>
                                                )}
                                                {assignmentMeta.due_date && (
                                                    <span style={assignmentPillStyle}>Due: {assignmentMeta.due_date}</span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <div style={{ color: '#64748b', fontSize: 12, textTransform: 'capitalize' }}>
                                        Type: {row.type}
                                        {row.link ? ` | ${formatRouteLabel(row.link)}` : ''}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                <Pagination
                    currentPage={currentPage}
                    totalItems={visibleRows.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                    label="notifications"
                />
            </div>
        </Layout>
    );
}

const filterStyle: CSSProperties = {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    background: '#fff',
    color: '#1f2937',
};

const primaryButtonStyle: CSSProperties = {
    border: '1px solid #1e3a8a',
    background: '#1e3a8a',
    color: '#fff',
    borderRadius: 8,
    padding: '10px 14px',
    cursor: 'pointer',
    fontWeight: 700,
};

function secondaryButtonStyle(disabled: boolean): CSSProperties {
    return {
        border: '1px solid #cbd5e1',
        background: '#fff',
        color: disabled ? '#94a3b8' : '#1f2937',
        borderRadius: 8,
        padding: '10px 14px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 700,
        opacity: disabled ? 0.7 : 1,
    };
}

function notificationRowStyle(isRead: boolean): CSSProperties {
    return {
        textAlign: 'left',
        background: isRead ? '#fff' : 'linear-gradient(180deg, #ffffff 0%, #eff6ff 100%)',
        border: `1px solid ${isRead ? '#e2e8f0' : '#93c5fd'}`,
        borderRadius: 12,
        padding: '12px 14px',
        cursor: 'pointer',
        boxShadow: isRead ? 'none' : '0 14px 30px rgba(37, 99, 235, 0.1)',
        opacity: isRead ? 0.92 : 1,
    };
}

const unreadDotStyle: CSSProperties = {
    width: 9,
    height: 9,
    borderRadius: 999,
    background: '#2563eb',
    boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.14)',
    display: 'inline-block',
};

function readStatusStyle(isRead: boolean): CSSProperties {
    return {
        fontSize: 11,
        fontWeight: 700,
        color: isRead ? '#475569' : '#1d4ed8',
        background: isRead ? '#f8fafc' : '#dbeafe',
        border: `1px solid ${isRead ? '#e2e8f0' : '#bfdbfe'}`,
        borderRadius: 999,
        padding: '2px 8px',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
    };
}

function severityDot(severity: string): CSSProperties {
    const value = String(severity).toLowerCase();
    if (value === 'high') return { width: 10, height: 10, borderRadius: 999, background: '#dc2626', display: 'inline-block' };
    if (value === 'medium') return { width: 10, height: 10, borderRadius: 999, background: '#d97706', display: 'inline-block' };
    if (value === 'success') return { width: 10, height: 10, borderRadius: 999, background: '#16a34a', display: 'inline-block' };
    return { width: 10, height: 10, borderRadius: 999, background: '#2563eb', display: 'inline-block' };
}

const assignmentPanelStyle: CSSProperties = {
    marginBottom: 6,
    border: '1px solid #dbeafe',
    background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
    borderRadius: 10,
    padding: '8px 10px',
    display: 'grid',
    gap: 7,
};

const assignmentPanelHeaderStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
};

const assignmentBadgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 999,
    border: '1px solid #bfdbfe',
    background: '#dbeafe',
    color: '#1d4ed8',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    padding: '2px 8px',
};

const assignmentByStyle: CSSProperties = {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.4,
};

const assignmentPillsWrapStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
};

const assignmentPillStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 999,
    border: '1px solid #dbe4f0',
    background: '#ffffff',
    color: '#334155',
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1.35,
    padding: '3px 8px',
    wordBreak: 'break-word',
};
