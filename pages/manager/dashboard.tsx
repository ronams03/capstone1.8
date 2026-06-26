/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useProtectedPage } from '@/components/AuthProvider';
import ExpandIconButton from '@/components/ExpandIconButton';
import Layout from '../../components/Layout';
import Pagination from '../../components/Pagination';
import CrudActionIcon from '../../components/CrudActionIcon';
import { DashboardCalendarMini, DashboardCalendarOverlay, type DashboardCalendarEventMap } from '../../components/DashboardCalendar';
import styles from '../../styles/Layout.module.css';
import { getApiBaseUrl } from '@/utils/network';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler } from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import { getProfileDocumentSummary, type ProfileDocumentStatusRecord } from '@/utils/profileDocuments';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler);
const API_BASE = getApiBaseUrl();
const ACTIVITY_LOG_PREVIEW_LIMIT = 6;

function formatDateKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeDateKey(value: unknown) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const directMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directMatch) {
        return directMatch[1];
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }

    return formatDateKey(parsed);
}

function isOpenTask(status: unknown) {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized !== 'completed' && normalized !== 'cancelled';
}

interface AnalyticsCounts {
    total_users: number;
    total_projects: number;
    total_clients: number;
    tasks_total: number;
    tasks_pending: number;
    tasks_in_progress: number;
    tasks_completed: number;
    payroll_pending: number;
}

interface TrendPoint { date: string; created: number; completed: number }

interface TaskCommentRow {
    comment_id: number;
    task_id: number;
    comment_text: string | null;
    attachment_name?: string | null;
    attachment_path?: string | null;
    commenter_name?: string | null;
    commenter_role?: string | null;
    created_at?: string | null;
}

interface ActivityLogItem {
    id: number;
    user_id: number | null;
    action: string;
    description: string | null;
    activity_type: string | null;
    ip_address: string | null;
    created_at: string;
    first_name: string | null;
    last_name: string | null;
}

type ActivityLogsFetchOverrides = {
    search?: string;
    date_from?: string;
    date_to?: string;
    user_id?: string;
    activity_type?: string;
    page?: number;
    page_size?: number;
};

type ActivityLogsFetchOptions = {
    silent?: boolean;
};

// Calendar utils
function buildMonth(year: number, month: number) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDay = first.getDay();
    const daysInMonth = last.getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function CalendarMini({
    events = {},
    onDayClick,
}: {
    events?: Record<string, { start?: boolean; end?: boolean; projectIds: number[] }>;
    onDayClick?: (date: string) => void;
}) {
    const today = new Date();
    const [y, setY] = useState(today.getFullYear());
    const [m, setM] = useState(today.getMonth());
    const weeks = buildMonth(y, m);
    const monthName = new Date(y, m, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
    const isToday = (d: number | null) => d !== null && y === today.getFullYear() && m === today.getMonth() && d === today.getDate();

    const prevMonth = () => { const nm = m - 1; if (nm < 0) { setM(11); setY(y - 1); } else { setM(nm); } };
    const nextMonth = () => { const nm = m + 1; if (nm > 11) { setM(0); setY(y + 1); } else { setM(nm); } };
    const prevYear = () => setY(y - 1);
    const nextYear = () => setY(y + 1);

    const dayCell = (d: number | null, i: number) => {
        const dateStr = d ? `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
        const ev = dateStr ? (events as any)[dateStr] : undefined;
        const clickable = !!(ev && ev.projectIds && ev.projectIds.length);
        return (
            <div key={i}
                onClick={() => clickable && onDayClick && onDayClick(dateStr)}
                style={{ textAlign: 'center', padding: '4px 0', borderRadius: 4, background: isToday(d) ? 'rgba(0,0,0,0.06)' : 'transparent', fontWeight: isToday(d) ? 700 as any : 400 as any, cursor: clickable ? 'pointer' : 'default', position: 'relative' }}>
                {d ?? ''}
                {ev && (
                    <div style={{ position: 'absolute', left: '50%', bottom: 2, transform: 'translateX(-50%)', display: 'flex', gap: 3 }}>
                        {ev.start && <span style={{ width: 6, height: 6, background: '#22c55e', borderRadius: '50%' }} />}
                        {ev.end && <span style={{ width: 6, height: 6, background: '#ef4444', borderRadius: '50%' }} />}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', color: '#111827', borderRadius: 8, padding: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={prevYear} title="Prev Year" style={{ background: 'transparent', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 4, padding: '0 4px', fontSize: 10, cursor: 'pointer' }}>«</button>
                    <button onClick={prevMonth} title="Prev Month" style={{ background: 'transparent', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 4, padding: '0 4px', fontSize: 10, cursor: 'pointer' }}>‹</button>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'center' }}>{monthName}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={nextMonth} title="Next Month" style={{ background: 'transparent', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 4, padding: '0 4px', fontSize: 10, cursor: 'pointer' }}>›</button>
                    <button onClick={nextYear} title="Next Year" style={{ background: 'transparent', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 4, padding: '0 4px', fontSize: 10, cursor: 'pointer' }}>»</button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, fontSize: 10 }}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (<div key={i} style={{ textAlign: 'center', opacity: 0.8 }}>{d}</div>))}
                {weeks.flat().map((d, i) => dayCell(d, i))}
            </div>
        </div>
    );
}

function ActivityLogsPreview({
    logLoading,
    activityLogs,
    onExpand,
}: {
    logLoading: boolean;
    activityLogs: ActivityLogItem[];
    onExpand: () => void;
}) {
    return (
        <div style={{ background: 'white', padding: '12px', borderRadius: '10px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                <h3 style={{ margin: 0, color: '#4b5563', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    Activity Logs
                </h3>
                <ExpandIconButton
                    label="Expand activity logs"
                    onClick={onExpand}
                />
            </div>
            {logLoading && activityLogs.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>Loading logs...</div>
            ) : activityLogs.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>No activity logs found.</div>
            ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#4b5563', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>Time</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#4b5563', fontWeight: 600, fontSize: 12 }}>User</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#4b5563', fontWeight: 600, fontSize: 12 }}>Action</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#4b5563', fontWeight: 600, fontSize: 12 }}>Description</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#4b5563', fontWeight: 600, fontSize: 12 }}>Type</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activityLogs.slice(0, ACTIVITY_LOG_PREVIEW_LIMIT).map((log) => (
                                <tr key={log.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '8px 10px', color: '#6b7280', whiteSpace: 'nowrap', fontSize: 12 }}>{new Date(log.created_at).toLocaleString()}</td>
                                    <td style={{ padding: '8px 10px', color: '#111827' }}>{log.first_name ? `${log.first_name} ${log.last_name}` : <span style={{ color: '#9ca3af' }}>System</span>}</td>
                                    <td style={{ padding: '8px 10px' }}>
                                        <span style={{ background: '#eff6ff', color: '#1e3a8a', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>{log.action}</span>
                                    </td>
                                    <td style={{ padding: '8px 10px', color: '#374151', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.description || 'â€”'}</td>
                                    <td style={{ padding: '8px 10px' }}>
                                        <span style={{ background: '#f0fdf4', color: '#166534', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500 }}>{log.activity_type || 'â€”'}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                    {activityLogs.length > ACTIVITY_LOG_PREVIEW_LIMIT ? (
                        <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700, letterSpacing: '0.03em' }}>
                            Showing {ACTIVITY_LOG_PREVIEW_LIMIT} of {activityLogs.length} recent logs.
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}

export default function ManagerDashboard() {
    const router = useRouter();
    const { user, loading: authLoading, logout } = useProtectedPage({
        allowedRoles: ['manager'],
        unauthorizedRedirect: '/dashboard',
    });
    const ITEMS_PER_PAGE = 10;
    const [loading, setLoading] = useState(true);
    const [counts, setCounts] = useState<AnalyticsCounts | null>(null);
    const [trend, setTrend] = useState<TrendPoint[]>([]);
    const [lineTrendAnimated, setLineTrendAnimated] = useState(false);
    const [projects, setProjects] = useState<any[]>([]);
    const [services, setServices] = useState<any[]>([]);
    const [myTaskSummary, setMyTaskSummary] = useState({ total: 0, pending: 0, in_progress: 0, completed: 0, due_today: 0, overdue: 0 });
    const [dateEvents, setDateEvents] = useState<DashboardCalendarEventMap>({});
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [dateModalOpen, setDateModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [dateTasks, setDateTasks] = useState<any[]>([]);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [dateTasksPage, setDateTasksPage] = useState(1);
    const [staff, setStaff] = useState<any[]>([]);

    // Task editing + comments
    const [taskModalOpen, setTaskModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<{ id?: number; title: string; description: string; project_id: string; service_id: string; assigned_to: string; due_date: string; priority: string; status: string }>(
        { title: '', description: '', project_id: '', service_id: '', assigned_to: '', due_date: '', priority: 'medium', status: 'pending' }
    );
    const [taskSaving, setTaskSaving] = useState(false);
    const [taskComments, setTaskComments] = useState<TaskCommentRow[]>([]);
    const [taskCommentsLoading, setTaskCommentsLoading] = useState(false);
    const [taskCommentText, setTaskCommentText] = useState('');
    const [taskCommentSaving, setTaskCommentSaving] = useState(false);
    const [initialTaskAssignee, setInitialTaskAssignee] = useState('');

    // Activity Logs state (view-only, branch-scoped via API)
    const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
    const [activityLogsTotal, setActivityLogsTotal] = useState(0);
    const [activityLogsExpanded, setActivityLogsExpanded] = useState(false);
    const [logSearch, setLogSearch] = useState('');
    const [logDateFrom, setLogDateFrom] = useState('');
    const [logDateTo, setLogDateTo] = useState('');
    const [logUserId, setLogUserId] = useState('');
    const [logType, setLogType] = useState('');
    const [logUsers, setLogUsers] = useState<any[]>([]);
    const [logTypes, setLogTypes] = useState<string[]>([]);
    const [logPage, setLogPage] = useState(0);
    const [logLoading, setLogLoading] = useState(false);
    const [selectedActivityLogId, setSelectedActivityLogId] = useState<number | null>(null);
    const [logDetailCardOpen, setLogDetailCardOpen] = useState(false);
    const [documentSummary, setDocumentSummary] = useState(() => getProfileDocumentSummary(null));
    const [documentsLoaded, setDocumentsLoaded] = useState(false);
    const logPageSize = ITEMS_PER_PAGE;
    const logQueryRef = useRef<ActivityLogsFetchOverrides>({
        search: '',
        date_from: '',
        date_to: '',
        user_id: '',
        activity_type: '',
        page: 0,
        page_size: ITEMS_PER_PAGE,
    });

    // The dashboard bootstrap is intentionally keyed to session readiness.
    useEffect(() => {
        if (String(user?.role || '').toLowerCase() !== 'manager') {
            if (!authLoading) {
                setLoading(false);
            }
            return;
        }

        let active = true;

        const loadDashboard = async () => {
            setLoading(true);
            try {
                await fetchAnalytics();
                await fetchProjectsAndServices();
                await fetchMyTaskSummary(Number(user?.id || 0));
                await fetchProfileDocumentSummary(Number(user?.id || 0));
                await fetchStaff();
                await fetchActivityLogsMeta();
                await fetchActivityLogs({ page_size: logPageSize });
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        void loadDashboard();

        return () => {
            active = false;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, logPageSize, user?.id, user?.role]);

    useEffect(() => {
        logQueryRef.current = {
            search: logSearch,
            date_from: logDateFrom,
            date_to: logDateTo,
            user_id: logUserId,
            activity_type: logType,
            page: logPage,
            page_size: logPageSize,
        };
    }, [logSearch, logDateFrom, logDateTo, logUserId, logType, logPage, logPageSize]);

    const fetchAnalytics = async () => {
        try {
            const res = await fetch(`${API_BASE}/analytics.php`, { credentials: 'include' });
            const d = await res.json();
            if (d.success) {
                setCounts(d.data.counts);
                setTrend(d.data.trend || []);
            }
        } catch (e) { /* noop */ }
    };

    const buildEventsFromProjects = (list: any[]) => {
        const map: DashboardCalendarEventMap = {};
        const activeList = list.filter((p: any) => p.status !== 'archived');
        for (const p of activeList) {
            if (p.start_date) {
                const sd = new Date(p.start_date);
                const k = `${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, '0')}-${String(sd.getDate()).padStart(2, '0')}`;
                map[k] = map[k] || { projectIds: [] };
                map[k].start = true;
                if (!map[k].projectIds.includes(p.id)) map[k].projectIds.push(p.id);
            }
            if (p.end_date) {
                const ed = new Date(p.end_date);
                const k2 = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`;
                map[k2] = map[k2] || { projectIds: [] };
                map[k2].end = true;
                if (!map[k2].projectIds.includes(p.id)) map[k2].projectIds.push(p.id);
            }
        }
        setDateEvents(map);
    };

    const fetchProjectsAndServices = async () => {
        try {
            const [pRes, sRes] = await Promise.all([
                fetch(`${API_BASE}/projects.php`, { credentials: 'include' }),
                fetch(`${API_BASE}/services.php?checklists=1`, { credentials: 'include' })
            ]);
            const p = await pRes.json();
            const s = await sRes.json();
            if (p.success) { setProjects(p.data); buildEventsFromProjects(p.data); }
            if (s.success) setServices(s.data);
        } catch (e) { /* noop */ }
    };

    const fetchStaff = async () => {
        try {
            const res = await fetch(`${API_BASE}/users.php`, { credentials: 'include' });
            const d = await res.json();
            if (d.success) setStaff(d.data);
        } catch { /* noop */ }
    };

    const fetchMyTaskSummary = async (userId: number) => {
        const emptySummary = { total: 0, pending: 0, in_progress: 0, completed: 0, due_today: 0, overdue: 0 };
        if (userId <= 0) {
            setMyTaskSummary(emptySummary);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/tasks.php?assigned_to=${userId}&include_collaborations=1`, { credentials: 'include' });
            const d = await res.json();
            if (!res.ok || !d.success || !Array.isArray(d.data)) {
                setMyTaskSummary(emptySummary);
                return;
            }

            const todayKey = formatDateKey(new Date());
            const nextSummary = { total: d.data.length, pending: 0, in_progress: 0, completed: 0, due_today: 0, overdue: 0 };
            d.data.forEach((task: any) => {
                const status = String(task?.status || '').toLowerCase();
                if (status === 'pending') nextSummary.pending += 1;
                else if (status === 'in_progress') nextSummary.in_progress += 1;
                else if (status === 'completed') nextSummary.completed += 1;

                const dueKey = normalizeDateKey(task?.due_date);
                if (dueKey && isOpenTask(status)) {
                    if (dueKey === todayKey) nextSummary.due_today += 1;
                    else if (dueKey < todayKey) nextSummary.overdue += 1;
                }
            });

            setMyTaskSummary(nextSummary);
        } catch {
            setMyTaskSummary(emptySummary);
        }
    };

    const fetchProfileDocumentSummary = async (userId: number) => {
        if (userId <= 0) {
            setDocumentSummary(getProfileDocumentSummary(null));
            setDocumentsLoaded(false);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/users.php?id=${userId}`, { credentials: 'include' });
            const d = await res.json();
            if (!res.ok || !d.success) {
                setDocumentSummary(getProfileDocumentSummary(null));
                setDocumentsLoaded(false);
                return;
            }

            setDocumentSummary(getProfileDocumentSummary((d.data || null) as ProfileDocumentStatusRecord | null));
            setDocumentsLoaded(true);
        } catch {
            setDocumentSummary(getProfileDocumentSummary(null));
            setDocumentsLoaded(false);
        }
    };

    const normalizeAssignableRole = (candidate: any) => String(candidate?.role || '').trim().toLowerCase();
    const dedupeAssignableUsers = (items: any[]) => items.filter((candidate: any, index: number, arr: any[]) => {
        return arr.findIndex((entry: any) => String(entry?.id) === String(candidate?.id)) === index;
    });
    const managerBranchId = Number(user?.branch_id || 0);
    const activeProjectsCount = projects.filter((project: any) => project?.status !== 'archived').length;
    const assignableStaffOptions = staff.filter((candidate: any) => {
        return normalizeAssignableRole(candidate) === 'staff'
            && managerBranchId > 0
            && Number(candidate?.branch_id || 0) === managerBranchId;
    });
    const resolveTaskAssigneeOptions = (selectedUserId?: string | number | null) => {
        const options = [...assignableStaffOptions];
        const selectedKey = String(selectedUserId || '').trim();
        if (selectedKey && !options.some((candidate: any) => String(candidate?.id) === selectedKey)) {
            const legacyAssignee = staff.find((candidate: any) => String(candidate?.id) === selectedKey)
                || { id: selectedKey, first_name: 'Current', last_name: `assignee #${selectedKey}`, role: 'staff' };
            options.unshift(legacyAssignee);
        }
        return dedupeAssignableUsers(options);
    };

    const fetchActivityLogs = async (overrides?: ActivityLogsFetchOverrides, options?: ActivityLogsFetchOptions) => {
        const silent = !!options?.silent;
        if (!silent) setLogLoading(true);
        try {
            const p = new URLSearchParams();
            const current = logQueryRef.current;
            const s = overrides?.search ?? current.search ?? '';
            const df = overrides?.date_from ?? current.date_from ?? '';
            const dt = overrides?.date_to ?? current.date_to ?? '';
            const uid = overrides?.user_id ?? current.user_id ?? '';
            const at = overrides?.activity_type ?? current.activity_type ?? '';
            const pg = overrides?.page ?? current.page ?? 0;
            const pageSize = Math.max(1, Math.min(100, Math.trunc(overrides?.page_size ?? current.page_size ?? logPageSize)));
            if (s) p.set('search', s);
            if (df) p.set('date_from', df);
            if (dt) p.set('date_to', dt);
            if (uid) p.set('user_id', uid);
            if (at) p.set('activity_type', at);
            p.set('limit', String(pageSize));
            p.set('offset', String(pg * pageSize));
            const res = await fetch(`${API_BASE}/activity-logs.php?${p.toString()}`, { credentials: 'include' });
            const d = await res.json();
            if (!res.ok || !d.success) {
                return;
            }
            const rows: ActivityLogItem[] = (Array.isArray(d.data) ? d.data : (Array.isArray(d.data?.rows) ? d.data.rows : []))
                .map((row: any): ActivityLogItem => ({
                    id: Number(row?.id ?? 0),
                    user_id: row?.user_id == null ? null : Number(row.user_id),
                    action: String(row?.action ?? ''),
                    description: row?.description == null ? null : String(row.description),
                    activity_type: row?.activity_type == null ? null : String(row.activity_type),
                    ip_address: row?.ip_address == null ? null : String(row.ip_address),
                    created_at: String(row?.created_at ?? ''),
                    first_name: row?.first_name == null ? null : String(row.first_name),
                    last_name: row?.last_name == null ? null : String(row.last_name),
                }));
            const total = typeof d.total === 'number' ? d.total : (typeof d.data?.total === 'number' ? d.data.total : rows.length);
            setActivityLogs(rows);
            setActivityLogsTotal(total);
            if (rows.length === 0) {
                setLogDetailCardOpen(false);
            }
            setSelectedActivityLogId((currentSelectedId) => {
                if (rows.length === 0) return null;
                if (currentSelectedId === null) return null;
                if (rows.some((row) => row.id === currentSelectedId)) return currentSelectedId;
                return rows[0]?.id ?? null;
            });
        } catch { /* noop */ }
        finally { if (!silent) setLogLoading(false); }
    };

    const fetchActivityLogsMeta = async () => {
        try {
            const res = await fetch(`${API_BASE}/activity-logs.php?meta=1`, { credentials: 'include' });
            const d = await res.json();
            if (!res.ok || !d.success) return;
            const users = Array.isArray(d.users) ? d.users : (Array.isArray(d.data?.users) ? d.data.users : []);
            const types = Array.isArray(d.types) ? d.types : (Array.isArray(d.data?.types) ? d.data.types : []);
            setLogUsers(users);
            setLogTypes(types);
        } catch { /* noop */ }
    };

    const applyLogFilters = (overrides?: ActivityLogsFetchOverrides) => {
        setLogPage(0);
        fetchActivityLogs({ ...overrides, page: 0 });
    };

    const clearLogFilters = () => {
        setLogSearch('');
        setLogDateFrom('');
        setLogDateTo('');
        setLogUserId('');
        setLogType('');
        setLogPage(0);
        fetchActivityLogs({ search: '', date_from: '', date_to: '', user_id: '', activity_type: '', page: 0 });
    };

    const formatTaskLabel = (t: any) => {
        if (!t?.title) return '';
        try {
            for (const sv of services) {
                if (sv.checklists) {
                    const found = sv.checklists.find((cl: any) => cl.task_name === t.title);
                    if (found) return `${sv.service_name}: ${found.task_name}`;
                }
            }
        } catch { /* ignore */ }
        return t.title;
    };

    const openTasksForDate = async (dateStr: string) => {
        setSelectedDate(dateStr);
        const ev = dateEvents[dateStr];
        if (!ev || !ev.projectIds?.length) { setDateTasks([]); setDateModalOpen(true); return; }
        setLoadingTasks(true);
        try {
            const results = await Promise.all(ev.projectIds.map((pid) => fetch(`${API_BASE}/tasks.php?project_id=${pid}`, { credentials: 'include' }).then(r => r.json())));
            const tasks = results.filter(r => r.success).flatMap(r => r.data || []);
            setDateTasks(tasks);
        } catch { setDateTasks([]); }
        finally { setLoadingTasks(false); setDateModalOpen(true); }
    };

    const updateLocalTask = (id: number, patch: any) => {
        setDateTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    };

    const paginatedDateTasks = dateTasks.slice((dateTasksPage - 1) * ITEMS_PER_PAGE, dateTasksPage * ITEMS_PER_PAGE);

    const saveTask = async (t: any) => {
        try {
            await fetch(`${API_BASE}/tasks.php`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ id: t.id, status: t.status, due_date: t.due_date })
            });
            // Task already updated locally via updateLocalTask()
        } catch { /* noop */ }
    };

    const fetchTaskComments = async (taskId: number) => {
        if (!taskId) return;
        setTaskCommentsLoading(true);
        try {
            const res = await fetch(`${API_BASE}/task-comments.php?task_id=${taskId}`, { credentials: 'include' });
            const d = await res.json();
            if (d?.success && Array.isArray(d.data)) {
                setTaskComments(d.data);
            } else {
                setTaskComments([]);
            }
        } catch {
            setTaskComments([]);
        } finally {
            setTaskCommentsLoading(false);
        }
    };

    const openEditTask = (task: any) => {
        setEditingTask({
            id: task.id,
            title: task.title,
            description: task.description || '',
            project_id: task.project_id,
            service_id: task.service_id ? String(task.service_id) : '',
            assigned_to: task.assigned_to || '',
            due_date: task.due_date ? String(task.due_date).slice(0, 10) : '',
            priority: task.priority || 'medium',
            status: task.status || 'pending'
        });
        setInitialTaskAssignee(task?.assigned_to ? String(task.assigned_to) : '');
        setTaskComments([]);
        setTaskCommentText('');
        if (task?.id) {
            fetchTaskComments(task.id);
        }
        setTaskModalOpen(true);
    };

    const closeTaskModal = () => {
        setTaskModalOpen(false);
        setInitialTaskAssignee('');
        setTaskComments([]);
        setTaskCommentText('');
    };

    const submitTaskComment = async () => {
        const text = taskCommentText.trim();
        if (!editingTask.id || !text) return;
        setTaskCommentSaving(true);
        try {
            const res = await fetch(`${API_BASE}/task-comments.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ task_id: editingTask.id, comment_text: text })
            });
            const d = await res.json();
            if (d?.success) {
                setTaskCommentText('');
                fetchTaskComments(editingTask.id);
            } else {
                alert(d?.message || 'Failed to post comment');
            }
        } catch {
            alert('Error posting comment');
        } finally {
            setTaskCommentSaving(false);
        }
    };

    const handleSaveTask = async () => {
        if (!editingTask.title.trim() || !editingTask.project_id) return;
        setTaskSaving(true);
        try {
            const isEdit = !!editingTask.id;
            const method = isEdit ? 'PUT' : 'POST';
            const body: any = {
                title: editingTask.title,
                description: editingTask.description,
                project_id: parseInt(editingTask.project_id),
                service_id: editingTask.service_id ? parseInt(editingTask.service_id) : null,
                due_date: editingTask.due_date || null,
                priority: editingTask.priority || 'medium',
                status: editingTask.status || 'pending'
            };
            if (isEdit) body.id = editingTask.id;
            if (!isEdit || editingTask.assigned_to !== initialTaskAssignee) {
                body.assigned_to = editingTask.assigned_to ? parseInt(editingTask.assigned_to) : null;
            }

            const res = await fetch(`${API_BASE}/tasks.php`, {
                method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body)
            });
            const d = await res.json();
            if (d.success) {
                closeTaskModal();
                if (d.data) {
                    setDateTasks(prev => {
                        const exists = prev.some(t => t.id === d.data.id);
                        if (exists) return prev.map(t => t.id === d.data.id ? { ...t, ...d.data } : t);
                        return [...prev, d.data];
                    });
                }
                if (selectedDate) openTasksForDate(selectedDate);
            } else {
                alert(d.message || 'Failed to save task');
            }
        } catch { alert('Error saving task'); }
        finally { setTaskSaving(false); }
    };

    useEffect(() => {
        const refresh = () => {
            fetchAnalytics();
            fetchProjectsAndServices();
            fetchMyTaskSummary(Number(user?.id || 0));
            fetchProfileDocumentSummary(Number(user?.id || 0));
        };
        const onFocus = () => { refresh(); };
        const onVis = () => { if (!document.hidden) refresh(); };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVis);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVis);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    useEffect(() => {
        setDateTasksPage(1);
    }, [selectedDate, dateModalOpen]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(dateTasks.length / ITEMS_PER_PAGE));
        if (dateTasksPage > totalPages) setDateTasksPage(totalPages);
    }, [dateTasks.length, dateTasksPage]);

    // Live-sync task list/calendar when documents auto-complete tasks.
    useEffect(() => {
        const syncTaskViews = () => {
            fetchAnalytics();
            fetchProjectsAndServices();
            fetchMyTaskSummary(Number(user?.id || 0));
            fetchProfileDocumentSummary(Number(user?.id || 0));
            if (dateModalOpen && selectedDate) {
                openTasksForDate(selectedDate);
            }
        };

        const onCustomSync = () => syncTaskViews();
        const onStorageSync = (event: StorageEvent) => {
            if (event.key === 'capstone_tasks_sync') {
                syncTaskViews();
            }
        };

        window.addEventListener('capstone:tasks-sync', onCustomSync as EventListener);
        window.addEventListener('storage', onStorageSync);

        return () => {
            window.removeEventListener('capstone:tasks-sync', onCustomSync as EventListener);
            window.removeEventListener('storage', onStorageSync);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateModalOpen, selectedDate, user?.id]);

    const trendPointCount = Math.max(1, trend.length);
    const snakePointDelay = Math.max(80, Math.floor(900 / trendPointCount));
    const shouldAnimateTrendLine = trend.length > 0 && !lineTrendAnimated;
    const selectedActivityLog = selectedActivityLogId === null
        ? null
        : activityLogs.find((log) => log.id === selectedActivityLogId) || null;
    const selectedActivityLogUserName = selectedActivityLog?.first_name
        ? `${selectedActivityLog.first_name} ${selectedActivityLog.last_name ?? ''}`.trim()
        : 'System';

    if (authLoading || loading) {

      return (

        <Layout role={String(user?.role || '')} user={user} onLogout={logout}>

          <div style={{ padding: 20 }}>Loading...</div>

        </Layout>

      );

    }

    return (
        <Layout role="manager" user={user} onLogout={logout}>
            <Head>
                <title>Manager Dashboard</title>
            </Head>

            {/* Analytics Overview (same metrics/charts as admin dashboard, without activity logs) */}
            <div className={styles.banner}>
                <div className={styles.bannerOverlay}></div>
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div
                        style={{
                            padding: '6px 10px',
                            flex: 1,
                            minWidth: 0,
                        }}
                    >
                        <div>
                            <h1 style={{ margin: 0, fontSize: '14px' }}>Welcome back, Manager!</h1>
                            <p style={{ margin: '2px 0 0 0', opacity: 0.9, fontSize: '12px' }}>Here&apos;s what&apos;s happening with your system today.</p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, padding: 4, flexShrink: 0 }}>
                        <div style={{ width: 620, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                            <div className={styles.statsCard}>
                                <div className={styles.statsIconBox} style={{ background: '#1e3a8a' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '14px', color: '#333' }}>{counts?.total_users ?? '-'}</h2>
                                    <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Total Users</p>
                                </div>
                            </div>

                            <div className={styles.statsCard}>
                                <div className={styles.statsIconBox} style={{ background: '#fbbf24' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '14px', color: '#333' }}>{counts?.tasks_pending ?? '-'}</h2>
                                    <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Pending Tasks</p>
                                </div>
                            </div>

                            <div className={styles.statsCard}>
                                <div className={styles.statsIconBox} style={{ background: '#1e3a8a' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '14px', color: '#333' }}>{counts?.tasks_completed ?? '-'}</h2>
                                    <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Completed Tasks</p>
                                </div>
                            </div>

                            <div className={styles.statsCard}>
                                <div className={styles.statsIconBox} style={{ background: '#fbbf24' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '14px', color: '#333' }}>{counts?.payroll_pending ?? '-'}</h2>
                                    <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Payroll Pending</p>
                                </div>
                            </div>

                            <div className={styles.statsCard}>
                                <div className={styles.statsIconBox} style={{ background: '#1e3a8a' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '14px', color: '#333' }}>{counts?.total_projects ?? '-'}</h2>
                                    <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Projects</p>
                                </div>
                            </div>

                            <div className={styles.statsCard}>
                                <div className={styles.statsIconBox} style={{ background: '#fbbf24' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '14px', color: '#333' }}>{counts?.total_clients ?? '-'}</h2>
                                    <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Clients</p>
                                </div>
                            </div>
                        </div>
                        <div style={{ width: 250, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                            <DashboardCalendarMini
                                onExpand={() => setCalendarOpen(true)}
                                events={dateEvents}
                                onDayClick={(d) => openTasksForDate(d)}
                                theme="light"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                <button
                    type="button"
                    onClick={() => void router.push('/my-tasks')}
                    style={{
                        background: 'white',
                        border: '1px solid #dbeafe',
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        textAlign: 'left',
                        cursor: 'pointer',
                        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#1d4ed8' }}>My Tasks</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{myTaskSummary.total}</span>
                        <span style={{ fontSize: 13, color: '#64748b' }}>{myTaskSummary.pending} pending, {myTaskSummary.in_progress} in progress</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a' }}>Open</span>
                </button>

                <button
                    type="button"
                    onClick={() => void router.push('/projects')}
                    style={{
                        background: 'white',
                        border: '1px solid #d1fae5',
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        textAlign: 'left',
                        cursor: 'pointer',
                        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#059669' }}>Projects</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{activeProjectsCount}</span>
                        <span style={{ fontSize: 13, color: '#64748b' }}>Open your active projects and details</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#047857' }}>Open</span>
                </button>
            </div>

            {/* Charts Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '10px' }}>
                <div style={{ background: 'white', padding: '14px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', minHeight: '280px', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ margin: '0 0 8px 0', color: '#111827', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        Task Distribution
                    </h3>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                        <div style={{ width: '100%', maxWidth: 260, aspectRatio: '1', margin: '0 auto' }}>
                            <Doughnut
                                data={{
                                    labels: ['Pending', 'In Progress', 'Completed', 'Cancelled'],
                                    datasets: [{
                                        data: [
                                            counts?.tasks_pending ?? 0,
                                            counts?.tasks_in_progress ?? 0,
                                            counts?.tasks_completed ?? 0,
                                            Math.max(0, (counts?.tasks_total ?? 0) - (counts?.tasks_pending ?? 0) - (counts?.tasks_in_progress ?? 0) - (counts?.tasks_completed ?? 0))
                                        ],
                                        backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444'],
                                        borderColor: ['#fde68a', '#93c5fd', '#6ee7b7', '#fca5a5'],
                                        borderWidth: 1.5,
                                        hoverOffset: 10,
                                        spacing: 2,
                                    }]
                                }}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: true,
                                    cutout: '52%',
                                    layout: { padding: { top: 4, bottom: 18, left: 8, right: 8 } },
                                    plugins: {
                                        legend: {
                                            position: 'bottom',
                                            labels: {
                                                padding: 16,
                                                usePointStyle: true,
                                                pointStyle: 'circle',
                                                font: { size: 12, weight: 'bold' }
                                            }
                                        },
                                        tooltip: {
                                            backgroundColor: 'rgba(17,24,39,0.9)',
                                            titleFont: { size: 13, weight: 'bold' },
                                            bodyFont: { size: 12 },
                                            padding: 10,
                                            cornerRadius: 8,
                                            callbacks: {
                                                label: (ctx: any) => {
                                                    const total = ctx.dataset.data.reduce((a: number, b: number) => a + b, 0);
                                                    const pct = total ? ((ctx.raw / total) * 100).toFixed(1) : '0';
                                                    return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
                                                }
                                            }
                                        }
                                    },
                                    animation: {
                                        animateRotate: true,
                                        animateScale: true,
                                        duration: 1200,
                                        easing: 'easeOutQuart'
                                    }
                                }}
                            />
                        </div>
                        <div style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{counts?.tasks_total ?? 0}</div>
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Total Tasks</div>
                        </div>
                    </div>
                </div>

                <div style={{ background: 'white', padding: '14px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', minHeight: '280px', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ margin: '0 0 8px 0', color: '#111827', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
                        Task Activity Trends (Last 7 Days)
                    </h3>
                    <div style={{ flex: 1, minHeight: 0 }}>
                        <Line
                            data={{
                                labels: trend.map(t => {
                                    const d = new Date(t.date + 'T00:00:00');
                                    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                }),
                                datasets: [
                                    {
                                        label: 'Created',
                                        data: trend.map(t => t.created),
                                        borderColor: '#1e3a8a',
                                        backgroundColor: 'rgba(30,58,138,0.08)',
                                        fill: true,
                                        tension: 0.4,
                                        pointRadius: 5,
                                        pointHoverRadius: 7,
                                        pointBackgroundColor: '#1e3a8a',
                                        pointBorderColor: '#fff',
                                        pointBorderWidth: 2,
                                        borderWidth: 3,
                                    },
                                    {
                                        label: 'Completed',
                                        data: trend.map(t => t.completed),
                                        borderColor: '#f59e0b',
                                        backgroundColor: 'rgba(245,158,11,0.08)',
                                        fill: true,
                                        tension: 0.4,
                                        pointRadius: 5,
                                        pointHoverRadius: 7,
                                        pointBackgroundColor: '#f59e0b',
                                        pointBorderColor: '#fff',
                                        pointBorderWidth: 2,
                                        borderWidth: 3,
                                    }
                                ]
                            }}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                interaction: { mode: 'index', intersect: false },
                                plugins: {
                                    legend: {
                                        position: 'top',
                                        align: 'end',
                                        labels: {
                                            usePointStyle: true,
                                            pointStyle: 'circle',
                                            padding: 16,
                                            font: { size: 12, weight: 'bold' }
                                        }
                                    },
                                    tooltip: {
                                        backgroundColor: 'rgba(17,24,39,0.9)',
                                        titleFont: { size: 13, weight: 'bold' },
                                        bodyFont: { size: 12 },
                                        padding: 10,
                                        cornerRadius: 8
                                    }
                                },
                                scales: {
                                    x: {
                                        grid: { display: false },
                                        ticks: { font: { size: 11, weight: 'bold' }, color: '#6b7280' }
                                    },
                                    y: {
                                        beginAtZero: true,
                                        ticks: {
                                            stepSize: 1,
                                            font: { size: 11 },
                                            color: '#6b7280'
                                        },
                                        grid: { color: 'rgba(0,0,0,0.04)' }
                                    }
                                },
                                animation: {
                                    duration: shouldAnimateTrendLine ? (trend.length * snakePointDelay * 2) + 300 : 0,
                                    easing: 'linear',
                                    onComplete: () => {
                                        if (shouldAnimateTrendLine) setLineTrendAnimated(true);
                                    }
                                },
                                animations: shouldAnimateTrendLine ? {
                                    x: {
                                        type: 'number',
                                        easing: 'linear',
                                        duration: snakePointDelay,
                                        from: NaN,
                                        delay: (ctx: any) => {
                                            if (ctx.type !== 'data' || ctx.mode !== 'default') return 0;
                                            if (ctx.xStarted) return 0;
                                            ctx.xStarted = true;
                                            return ((ctx.datasetIndex * trend.length) + ctx.dataIndex) * snakePointDelay;
                                        }
                                    },
                                    y: {
                                        type: 'number',
                                        easing: 'linear',
                                        duration: snakePointDelay,
                                        from: (ctx: any) => {
                                            if (ctx.type !== 'data' || ctx.mode !== 'default') return 0;
                                            const yScale = ctx.chart.scales.y;
                                            if (ctx.dataIndex === 0) return yScale.getPixelForValue(0);
                                            const prev = ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.dataIndex - 1];
                                            return prev ? prev.getProps(['y'], true).y : yScale.getPixelForValue(0);
                                        },
                                        delay: (ctx: any) => {
                                            if (ctx.type !== 'data' || ctx.mode !== 'default') return 0;
                                            if (ctx.yStarted) return 0;
                                            ctx.yStarted = true;
                                            return ((ctx.datasetIndex * trend.length) + ctx.dataIndex) * snakePointDelay;
                                        }
                                    }
                                } : {}
                            }}
                        />
                    </div>
                </div>
            </div>

            <div style={{ marginTop: 10 }}>
                <ActivityLogsPreview
                    logLoading={logLoading}
                    activityLogs={activityLogs}
                    onExpand={() => {
                        setActivityLogsExpanded(true);
                        void fetchActivityLogs({ page_size: logPageSize });
                    }}
                />
            </div>
            {dateModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '90%', maxWidth: 900, background: 'white', borderRadius: 10, padding: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ fontWeight: 700, color: '#111827' }}>Tasks on {selectedDate}</div>
                            <button onClick={() => setDateModalOpen(false)} style={{ background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>Close</button>
                        </div>
                        {loadingTasks ? (
                            <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Loading tasks...</div>
                        ) : dateTasks.length === 0 ? (
                            <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>No tasks for projects on this date.</div>
                        ) : (
                            <>
                            <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead style={{ background: '#f8fafc' }}>
                                        <tr>
                                            <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#4b5563' }}>Task</th>
                                            <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#4b5563' }}>Client</th>
                                            <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#4b5563' }}>Project</th>
                                            <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#4b5563' }}>Status</th>
                                            <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#4b5563' }}>Due Date</th>
                                            <th style={{ width: 140 }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedDateTasks.map((t: any) => {
                                            const isDone = t.status === 'completed';
                                            return (
                                                <tr key={t.id} style={{ borderTop: '1px solid #e5e7eb', background: isDone ? 'linear-gradient(90deg, rgba(16,185,129,0.10), rgba(255,255,255,0))' : 'transparent' }}>
                                                    <td style={{ padding: '8px 10px', fontSize: 13, color: '#111827' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span style={{ textDecoration: isDone ? 'line-through' : 'none', color: isDone ? '#6b7280' : '#111827' }}>
                                                                {formatTaskLabel(t)}
                                                            </span>
                                                            {isDone && (
                                                                <span style={{ background: '#10b981', color: '#ffffff', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: '0.03em' }}>
                                                                    DONE
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#6b7280' }}>{t.client_name || '-'}</td>
                                                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#6b7280' }}>{t.project_name}</td>
                                                    <td style={{ padding: '8px 10px' }}>
                                                        <select id={`status-${t.id}`} value={t.status} onChange={(e) => updateLocalTask(t.id, { status: e.target.value })} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}>
                                                            <option value="pending">Pending</option>
                                                            <option value="in_progress">In Progress</option>
                                                            <option value="completed">Completed</option>
                                                        </select>
                                                    </td>
                                                    <td style={{ padding: '8px 10px' }}>
                                                        <input id={`due_date-${t.id}`} type="date" value={t.due_date ? String(t.due_date).slice(0, 10) : ''} onChange={(e) => updateLocalTask(t.id, { due_date: e.target.value })} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                                                    </td>
                                                    <td style={{ padding: '8px 10px' }}>
                                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                            <button onClick={() => openEditTask(t)} title="Edit" aria-label={`Edit task ${t.title || t.id}`} style={{ padding: '6px 10px', background: 'white', color: '#1e3a8a', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><CrudActionIcon action="edit" /></button>
                                                            <button onClick={() => saveTask(t)} title="Save" aria-label={`Save task ${t.title || t.id}`} style={{ padding: '6px 10px', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><CrudActionIcon action="save" /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <Pagination
                                currentPage={dateTasksPage}
                                totalItems={dateTasks.length}
                                itemsPerPage={ITEMS_PER_PAGE}
                                onPageChange={setDateTasksPage}
                                label="tasks"
                            />
                            </>
                        )}
                    </div>
                </div>
            )}
            <DashboardCalendarOverlay open={calendarOpen} onClose={() => setCalendarOpen(false)} events={dateEvents} onDayClick={(d) => openTasksForDate(d)} />

            {/* Activity Logs Fullscreen Modal */}
            {activityLogsExpanded && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 25000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div style={{ width: '100%', height: '100%', background: 'white', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', position: 'relative' }}>
                        {/* Header */}
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                            <h2 style={{ margin: 0, fontSize: 14, color: '#111827', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                Activity Logs
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 400, marginLeft: 4 }}>({activityLogsTotal} total)</span>
                            </h2>
                            <button onClick={() => { setActivityLogsExpanded(false); setSelectedActivityLogId(null); setLogDetailCardOpen(false); }} style={{ background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                Close
                            </button>
                        </div>

                        {/* Filters */}
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', flexShrink: 0, background: '#fafbfc' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Search</label>
                                <input
                                    type="text" placeholder="Search action or description…" value={logSearch}
                                    onChange={e => setLogSearch(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && applyLogFilters({ search: logSearch })}
                                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, width: 220 }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>From</label>
                                <input type="date" value={logDateFrom} onChange={e => setLogDateFrom(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</label>
                                <input type="date" value={logDateTo} onChange={e => setLogDateTo(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>User</label>
                                <select value={logUserId} onChange={e => setLogUserId(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, background: 'white', minWidth: 150 }}>
                                    <option value="">All Users</option>
                                    {logUsers.map((u: any) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</label>
                                <select value={logType} onChange={e => setLogType(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, background: 'white', minWidth: 150 }}>
                                    <option value="">All Types</option>
                                    {logTypes.map((t: string) => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <button onClick={() => applyLogFilters()} style={{ padding: '8px 16px', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, alignSelf: 'flex-end' }}>Apply</button>
                            <button onClick={() => clearLogFilters()} style={{ padding: '8px 16px', background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontSize: 13, alignSelf: 'flex-end' }}>Clear</button>
                        </div>

                        {logDetailCardOpen && selectedActivityLog && (
                            <div
                                onClick={() => setLogDetailCardOpen(false)}
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    zIndex: 20,
                                    background: 'rgba(15, 23, 42, 0.28)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: 20
                                }}
                            >
                                <div
                                    onClick={(event) => event.stopPropagation()}
                                    style={{
                                        width: 'min(1180px, 96%)',
                                        maxHeight: '85vh',
                                        overflow: 'auto',
                                        borderRadius: 14,
                                        border: '1px solid #dbeafe',
                                        background: 'linear-gradient(90deg, #f8fbff 0%, #f8fafc 100%)',
                                        boxShadow: '0 18px 48px rgba(15, 23, 42, 0.32)',
                                        padding: 18
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                                        <h3 style={{ margin: 0, fontSize: 14, color: '#111827' }}>Activity Log Details</h3>
                                        <button
                                            onClick={() => setLogDetailCardOpen(false)}
                                            style={{ background: 'transparent', border: '1px solid #cbd5e1', borderRadius: 8, color: '#374151', fontSize: 13, padding: '6px 12px', cursor: 'pointer' }}
                                        >
                                            Close
                                        </button>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                                        <div>
                                            <div style={{ fontSize: 11, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Time</div>
                                            <div style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>{new Date(selectedActivityLog.created_at).toLocaleString()}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 11, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>User</div>
                                            <div style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>{selectedActivityLogUserName}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 11, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Action</div>
                                            <div style={{ fontSize: 13, color: '#1e3a8a', fontWeight: 600 }}>{selectedActivityLog.action || '-'}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 11, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Type</div>
                                            <div style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>{selectedActivityLog.activity_type || '-'}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 11, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>IP Address</div>
                                            <div style={{ fontSize: 13, color: '#111827', fontFamily: 'monospace' }}>{selectedActivityLog.ip_address || '-'}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 11, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Log ID</div>
                                            <div style={{ fontSize: 13, color: '#111827', fontFamily: 'monospace' }}>{selectedActivityLog.id}</div>
                                        </div>
                                        <div style={{ gridColumn: '1 / -1', background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' }}>
                                            <div style={{ fontSize: 11, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Description</div>
                                            <div style={{ fontSize: 14, color: '#111827', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{selectedActivityLog.description || '-'}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Table */}
                        <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
                            {logLoading && activityLogs.length === 0 ? (
                                <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading…</div>
                            ) : activityLogs.length === 0 ? (
                                <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No activity logs match your filters.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
                                        <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                                            <th style={{ textAlign: 'left', padding: '12px 10px', color: '#4b5563', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>Time</th>
                                            <th style={{ textAlign: 'left', padding: '12px 10px', color: '#4b5563', fontWeight: 600, fontSize: 12 }}>User</th>
                                            <th style={{ textAlign: 'left', padding: '12px 10px', color: '#4b5563', fontWeight: 600, fontSize: 12 }}>Action</th>
                                            <th style={{ textAlign: 'left', padding: '12px 10px', color: '#4b5563', fontWeight: 600, fontSize: 12 }}>Description</th>
                                            <th style={{ textAlign: 'left', padding: '12px 10px', color: '#4b5563', fontWeight: 600, fontSize: 12 }}>Type</th>
                                            <th style={{ textAlign: 'left', padding: '12px 10px', color: '#4b5563', fontWeight: 600, fontSize: 12 }}>IP</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activityLogs.map((log) => {
                                            const isSelected = log.id === selectedActivityLogId;
                                            const logUserName = log.first_name ? `${log.first_name} ${log.last_name ?? ''}`.trim() : null;
                                            return (
                                            <tr
                                                key={log.id}
                                                onClick={() => { setSelectedActivityLogId(log.id); setLogDetailCardOpen(true); }}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        setSelectedActivityLogId(log.id);
                                                        setLogDetailCardOpen(true);
                                                    }
                                                }}
                                                tabIndex={0}
                                                role="button"
                                                aria-label={`View details for log ${log.id}`}
                                                style={{
                                                    borderTop: '1px solid #f1f5f9',
                                                    cursor: 'pointer',
                                                    background: isSelected ? '#eff6ff' : 'white',
                                                    boxShadow: isSelected ? 'inset 3px 0 0 #1e3a8a' : 'none',
                                                    transition: 'background 0.16s ease'
                                                }}
                                            >
                                                <td style={{ padding: '10px 10px', color: '#6b7280', whiteSpace: 'nowrap', fontSize: 12 }}>{new Date(log.created_at).toLocaleString()}</td>
                                                <td style={{ padding: '10px 10px', color: '#111827', fontWeight: 500 }}>{logUserName || <span style={{ color: '#9ca3af' }}>System</span>}</td>
                                                <td style={{ padding: '10px 10px' }}>
                                                    <span style={{ background: '#eff6ff', color: '#1e3a8a', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>{log.action}</span>
                                                </td>
                                                <td style={{ padding: '10px 10px', color: '#374151', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.description || '-'}</td>
                                                <td style={{ padding: '10px 10px' }}>
                                                    <span style={{ background: '#f0fdf4', color: '#166534', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500 }}>{log.activity_type || '-'}</span>
                                                </td>
                                                <td style={{ padding: '10px 10px', color: '#9ca3af', fontSize: 12, fontFamily: 'monospace' }}>{log.ip_address || '-'}</td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Pagination */}
                        <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: '#fafbfc' }}>
                            <span style={{ fontSize: 13, color: '#6b7280' }}>
                                Showing {Math.min(logPage * logPageSize + 1, activityLogsTotal)}–{Math.min((logPage + 1) * logPageSize, activityLogsTotal)} of {activityLogsTotal}
                            </span>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                    disabled={logPage === 0}
                                    onClick={() => { const p = logPage - 1; setLogPage(p); fetchActivityLogs({ page: p }); }}
                                    style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e5e7eb', background: logPage === 0 ? '#f3f4f6' : 'white', cursor: logPage === 0 ? 'default' : 'pointer', fontSize: 13, color: logPage === 0 ? '#9ca3af' : '#374151' }}
                                >← Prev</button>
                                <button
                                    disabled={(logPage + 1) * logPageSize >= activityLogsTotal}
                                    onClick={() => { const p = logPage + 1; setLogPage(p); fetchActivityLogs({ page: p }); }}
                                    style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e5e7eb', background: (logPage + 1) * logPageSize >= activityLogsTotal ? '#f3f4f6' : 'white', cursor: (logPage + 1) * logPageSize >= activityLogsTotal ? 'default' : 'pointer', fontSize: 13, color: (logPage + 1) * logPageSize >= activityLogsTotal ? '#9ca3af' : '#374151' }}
                                >Next →</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {taskModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '95%', maxWidth: 550, background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0, color: '#111827', fontSize: 14 }}>{editingTask.id ? 'Edit Task' : 'Create Task'}</h3>
                            <button onClick={closeTaskModal} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4 }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <div style={{ display: 'grid', gap: 16 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6, fontWeight: 500 }}>Title <span style={{ color: '#ef4444' }}>*</span></label>
                                <input type="text" value={editingTask.title} onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }} placeholder="What needs to be done?" />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6, fontWeight: 500 }}>Description / Comments</label>
                                <textarea value={editingTask.description} onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', minHeight: 80, fontSize: 14 }} placeholder="Add details..." />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6, fontWeight: 500 }}>Service Type</label>
                                    <select value={editingTask.service_id} onChange={(e) => setEditingTask({ ...editingTask, service_id: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', fontSize: 14 }}>
                                        <option value="">-- None --</option>
                                        {services.map(s => (<option key={s.service_id} value={s.service_id}>{s.service_name}</option>))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6, fontWeight: 500 }}>Project <span style={{ color: '#ef4444' }}>*</span></label>
                                    <select value={editingTask.project_id} onChange={(e) => setEditingTask({ ...editingTask, project_id: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', fontSize: 14 }}>
                                        <option value="">Select project...</option>
                                        {projects.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6, fontWeight: 500 }}>Assignee</label>
                                    <select value={editingTask.assigned_to} onChange={(e) => setEditingTask({ ...editingTask, assigned_to: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', fontSize: 14 }}>
                                        <option value="">Unassigned</option>
                                        {resolveTaskAssigneeOptions(editingTask.assigned_to).map((s: any) => (<option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>))}
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6, fontWeight: 500 }}>Due Date</label>
                                    <input type="date" value={editingTask.due_date} onChange={(e) => setEditingTask({ ...editingTask, due_date: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6, fontWeight: 500 }}>Priority</label>
                                    <select value={editingTask.priority} onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', fontSize: 14 }}>
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                        <option value="urgent">Urgent</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6, fontWeight: 500 }}>Status</label>
                                    <select value={editingTask.status} onChange={(e) => setEditingTask({ ...editingTask, status: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', fontSize: 14 }}>
                                        <option value="pending">Pending</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="completed">Completed</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                </div>
                            </div>
                            {editingTask.id && (
                                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <div style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Comments</div>
                                        <button
                                            type="button"
                                            onClick={() => fetchTaskComments(editingTask.id!)}
                                            style={{ background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: '#374151' }}
                                        >
                                            Refresh
                                        </button>
                                    </div>
                                    <div style={{ maxHeight: 160, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, background: '#f9fafb' }}>
                                        {taskCommentsLoading ? (
                                            <div style={{ fontSize: 12, color: '#6b7280' }}>Loading comments...</div>
                                        ) : taskComments.length === 0 ? (
                                            <div style={{ fontSize: 12, color: '#6b7280' }}>No comments yet.</div>
                                        ) : (
                                            taskComments.map((comment) => {
                                                const text = comment.comment_text?.trim()
                                                    || (comment.attachment_name ? `Uploaded file: ${comment.attachment_name}` : '-');
                                                return (
                                                    <div key={comment.comment_id} style={{ padding: '8px 0', borderBottom: '1px solid #eef2f7' }}>
                                                        <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                                            <span>{comment.commenter_name || 'User'}{comment.commenter_role ? ` • ${comment.commenter_role}` : ''}</span>
                                                            <span>{comment.created_at ? new Date(comment.created_at).toLocaleString() : ''}</span>
                                                        </div>
                                                        <div style={{ fontSize: 13, color: '#111827', marginTop: 4, whiteSpace: 'pre-wrap' }}>{text}</div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                                        <textarea
                                            value={taskCommentText}
                                            onChange={(e) => setTaskCommentText(e.target.value)}
                                            placeholder="Add a comment..."
                                            style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', minHeight: 70, fontSize: 13 }}
                                        />
                                        <button
                                            type="button"
                                            onClick={submitTaskComment}
                                            disabled={taskCommentSaving || !taskCommentText.trim()}
                                            style={{ alignSelf: 'flex-end', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12, opacity: (taskCommentSaving || !taskCommentText.trim()) ? 0.7 : 1 }}
                                        >
                                            {taskCommentSaving ? 'Posting...' : 'Post Comment'}
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 10, gap: 10 }}>
                                <button onClick={closeTaskModal} style={{ background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14, color: '#374151', fontWeight: 500 }}>Cancel</button>
                                <button
                                    onClick={handleSaveTask}
                                    disabled={taskSaving || !editingTask.title.trim() || !editingTask.project_id}
                                    title={editingTask.id ? 'Save Changes' : 'Create Task'}
                                    aria-label={editingTask.id ? 'Save Changes' : 'Create Task'}
                                    style={{ background: '#1e3a8a', color: 'white', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 500, opacity: (taskSaving || !editingTask.title.trim() || !editingTask.project_id) ? 0.7 : 1, fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    {taskSaving ? 'Saving...' : 'Submit'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
