import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import { getBackendBaseUrl } from '@/utils/network';
import { notifyError, promptAction, showLoadingModal, closeLoadingModal } from '@/utils/notify';

const API_BASE_URL = getBackendBaseUrl();
const ITEMS_PER_PAGE = 10;

type SessionUser = {
    id?: number;
    role?: string;
    first_name?: string;
    [key: string]: unknown;
};

type TaskRow = {
    id: number;
    title: string;
    description?: string | null;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | string;
    priority?: 'low' | 'medium' | 'high' | string;
    due_date?: string | null;
    project_id?: number;
    project_name?: string;
    client_name?: string;
    service_name?: string;
    has_completion_report?: number | boolean;
    completion_report_sent_at?: string | null;
    require_completion_proof?: number | boolean;
};

type TaskCommentRow = {
    comment_id: number;
    task_id: number;
    user_id: number;
    parent_comment_id?: number | null;
    comment_text?: string | null;
    attachment_path?: string | null;
    attachment_name?: string | null;
    attachment_mime?: string | null;
    attachment_size?: number | null;
    attachment_archived?: number | boolean;
    commenter_name?: string;
    commenter_role?: string;
    created_at?: string | null;
    updated_at?: string | null;
};

type TaskDocumentPreview = {
    name: string;
    url: string;
    mime?: string | null;
};

type ApiResponse<T> = {
    success?: boolean;
    message?: string;
    data?: T;
};

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

function formatDateTime(value: unknown, emptyLabel = '-') {
    const raw = String(value || '').trim();
    if (!raw) return emptyLabel;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function isOpenTask(status: unknown) {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized !== 'completed' && normalized !== 'cancelled';
}

export default function MyTasksPage() {
    const router = useRouter();
    const [user, setUser] = useState<SessionUser | null>(null);
    const [tasks, setTasks] = useState<TaskRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingTaskId, setSavingTaskId] = useState<number | null>(null);
    const [sendingReportTaskId, setSendingReportTaskId] = useState<number | null>(null);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [deadlineFilter, setDeadlineFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
    const [taskComments, setTaskComments] = useState<TaskCommentRow[]>([]);
    const [taskCommentsLoading, setTaskCommentsLoading] = useState(false);
    const [taskCommentSaving, setTaskCommentSaving] = useState(false);
    const [taskCommentText, setTaskCommentText] = useState('');
    const [taskCommentReplyTarget, setTaskCommentReplyTarget] = useState<TaskCommentRow | null>(null);
    const [taskCommentAttachments, setTaskCommentAttachments] = useState<File[]>([]);
    const [taskAttachmentActionCommentId, setTaskAttachmentActionCommentId] = useState<number | null>(null);
    const [showTaskDocumentViewer, setShowTaskDocumentViewer] = useState(false);
    const [taskDocumentPreview, setTaskDocumentPreview] = useState<TaskDocumentPreview | null>(null);
    const taskCommentFileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const init = async () => {
            try {
                const sessionRes = await fetch(`${API_BASE_URL}/api/auth.php`, { credentials: 'include' });
                const sessionData = (await sessionRes.json()) as ApiResponse<SessionUser>;
                if (!sessionData.success || !sessionData.data) {
                    router.push('/');
                    return;
                }

                const role = String(sessionData.data.role || '').toLowerCase();
                if (!['staff', 'manager', 'admin'].includes(role)) {
                    router.push('/dashboard');
                    return;
                }

                setUser(sessionData.data);
                const currentUserId = Number(sessionData.data.id || 0);
                if (currentUserId > 0) {
                    await fetchMyTasks(currentUserId);
                }
            } catch {
                router.push('/');
            } finally {
                setLoading(false);
            }
        };

        init();
    }, [router]);

    useEffect(() => {
        if (!router.isReady) return;

        const queryStatus = typeof router.query.status === 'string' ? router.query.status : 'all';
        const queryDeadline = typeof router.query.filter === 'string' ? router.query.filter : 'all';
        const allowedStatuses = new Set(['all', 'pending', 'in_progress', 'completed', 'cancelled']);
        const allowedDeadlines = new Set(['all', 'due_today', 'overdue']);

        setStatusFilter(allowedStatuses.has(queryStatus) ? queryStatus : 'all');
        setDeadlineFilter(allowedDeadlines.has(queryDeadline) ? queryDeadline : 'all');
    }, [router.isReady, router.query.filter, router.query.status]);

    const fetchMyTasks = async (userId: number) => {
        setError('');
        try {
            const res = await fetch(`${API_BASE_URL}/api/tasks.php?assigned_to=${userId}&include_collaborations=1`, { credentials: 'include' });
            const data = (await res.json()) as ApiResponse<TaskRow[]>;
            if (data.success && Array.isArray(data.data)) {
                setTasks(data.data);
            } else {
                setTasks([]);
                setError(data.message || 'Failed to load tasks.');
            }
        } catch {
            setTasks([]);
            setError('Failed to load tasks.');
        }
    };

    const handleLogout = async () => {
        await fetch(`${API_BASE_URL}/api/auth.php?action=logout`, { method: 'POST', credentials: 'include' });
        router.push('/');
    };

    const handleStatusChange = async (taskId: number, nextStatus: string) => {
        if (!user?.id) return;
        setSavingTaskId(taskId);
        setError('');
        try {
            const res = await fetch(`${API_BASE_URL}/api/tasks.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: taskId, status: nextStatus }),
            });
            const data = (await res.json()) as ApiResponse<null>;
            if (!data.success) {
                setError(data.message || 'Failed to update task status.');
                return;
            }
            setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)));
        } catch {
            setError('Failed to update task status.');
        } finally {
            setSavingTaskId(null);
        }
    };

    const handleProofPreferenceChange = async (taskId: number, requireProof: boolean) => {
        if (!user?.id) return;
        setSavingTaskId(taskId);
        setError('');
        try {
            const res = await fetch(`${API_BASE_URL}/api/tasks.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: taskId, require_completion_proof: requireProof ? 1 : 0 }),
            });
            const data = (await res.json()) as ApiResponse<null>;
            if (!data.success) {
                setError(data.message || 'Failed to update proof preference.');
                return;
            }
            setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, require_completion_proof: requireProof ? 1 : 0 } : t)));
        } catch {
            setError('Failed to update proof preference.');
        } finally {
            setSavingTaskId(null);
        }
    };

    const handleSendCompletionReport = async (task: TaskRow) => {
        if (!task || task.status !== 'completed') return;

        const defaultReport = `Task "${task.title}" has been completed successfully.`;
        const isResend = Number(task.has_completion_report ?? 0) === 1;
        const promptLabel = isResend
            ? 'Update and resend completion report for the client (optional):'
            : 'Enter completion report for the client (optional):';
        const reportBody = await promptAction({
            title: isResend ? 'Resend completion report' : 'Send completion report',
            text: `Review the client report for "${task.title}".`,
            inputLabel: promptLabel,
            inputValue: defaultReport,
            confirmButtonText: isResend ? 'Resend report' : 'Send report',
            cancelButtonText: 'Cancel',
            icon: 'question',
            large: true, // Use large textarea for better editing
        });
        if (reportBody === null) return;

        setSendingReportTaskId(task.id);
        setError('');
        
        // Show loading modal with clock loader
        showLoadingModal(
            'Sending Completion Report...',
            'Preparing and sending report to client. This may take a moment...'
        );
        
        try {
            const res = await fetch(`${API_BASE_URL}/api/task-reports.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    task_id: task.id,
                    report_body: reportBody.trim(),
                }),
            });
            const data = (await res.json()) as ApiResponse<null>;
            if (!data.success) {
                closeLoadingModal();
                setError(data.message || 'Failed to send completion report.');
                return;
            }
            closeLoadingModal();
            setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, has_completion_report: 1, completion_report_sent_at: new Date().toISOString() } : t)));
        } catch {
            setError('Failed to send completion report.');
        } finally {
            setSendingReportTaskId(null);
        }
    };

    const clearTaskCommentAttachments = () => {
        setTaskCommentAttachments([]);
        if (taskCommentFileInputRef.current) {
            taskCommentFileInputRef.current.value = '';
        }
    };

    const resetTaskDiscussionComposer = () => {
        setTaskCommentText('');
        setTaskCommentReplyTarget(null);
    };

    const addTaskCommentAttachments = (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) return;
        const incoming = Array.from(fileList);
        setTaskCommentAttachments((previous) => {
            const next = [...previous];
            incoming.forEach((file) => {
                const duplicate = next.some(
                    (existing) =>
                        existing.name === file.name &&
                        existing.size === file.size &&
                        existing.lastModified === file.lastModified
                );
                if (!duplicate) {
                    next.push(file);
                }
            });
            return next;
        });
    };

    const removeTaskCommentAttachmentAt = (index: number) => {
        setTaskCommentAttachments((previous) => previous.filter((_, idx) => idx !== index));
    };

    const fetchTaskComments = useCallback(async (taskId: number) => {
        setTaskCommentsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/task-comments.php?task_id=${taskId}`, { credentials: 'include' });
            const data = (await res.json()) as ApiResponse<TaskCommentRow[]>;
            if (data.success && Array.isArray(data.data)) {
                setTaskComments(data.data);
            } else {
                setTaskComments([]);
            }
        } catch {
            setTaskComments([]);
        } finally {
            setTaskCommentsLoading(false);
        }
    }, []);

    const submitTaskComment = async (task: TaskRow) => {
        const trimmed = taskCommentText.trim();
        if (!trimmed) {
            setError('Write a comment/reply first.');
            return;
        }

        setTaskCommentSaving(true);
        setError('');
        try {
            const formData = new FormData();
            formData.append('task_id', String(task.id));
            formData.append('comment_text', trimmed);
            if (taskCommentReplyTarget) formData.append('parent_comment_id', String(taskCommentReplyTarget.comment_id));

            const res = await fetch(`${API_BASE_URL}/api/task-comments.php`, {
                method: 'POST',
                credentials: 'include',
                body: formData,
            });
            const data = (await res.json()) as ApiResponse<{ comment_id: number }>;
            if (!data.success) {
                setError(data.message || 'Failed to post task comment.');
                return;
            }

            resetTaskDiscussionComposer();
            await fetchTaskComments(task.id);
        } catch {
            setError('Failed to post task comment.');
        } finally {
            setTaskCommentSaving(false);
        }
    };

    const uploadTaskDocuments = async (task: TaskRow) => {
        if (taskCommentAttachments.length === 0) {
            setError('Select at least one document/file first.');
            return;
        }

        setTaskCommentSaving(true);
        setError('');
        try {
            const formData = new FormData();
            formData.append('task_id', String(task.id));
            taskCommentAttachments.forEach((file) => {
                formData.append('attachments[]', file);
            });

            const res = await fetch(`${API_BASE_URL}/api/task-comments.php`, {
                method: 'POST',
                credentials: 'include',
                body: formData,
            });
            const data = (await res.json()) as ApiResponse<{ comment_id: number }>;
            if (!data.success) {
                setError(data.message || 'Failed to upload documents/files.');
                return;
            }

            clearTaskCommentAttachments();
            await fetchTaskComments(task.id);
        } catch {
            setError('Failed to upload documents/files.');
        } finally {
            setTaskCommentSaving(false);
        }
    };

    const setTaskDocumentArchiveStatus = async (task: TaskRow, commentId: number, archived: boolean) => {
        setTaskAttachmentActionCommentId(commentId);
        setError('');
        try {
            const res = await fetch(`${API_BASE_URL}/api/task-comments.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    action: 'archive_attachment',
                    comment_id: commentId,
                    archived: archived ? 1 : 0,
                }),
            });
            const data = (await res.json()) as ApiResponse<null>;
            if (!data.success) {
                setError(data.message || 'Failed to update document/file archive status.');
                return;
            }
            await fetchTaskComments(task.id);
        } catch {
            setError('Failed to update document/file archive status.');
        } finally {
            setTaskAttachmentActionCommentId(null);
        }
    };

    const removeTaskDocument = async (task: TaskRow, commentId: number) => {
        const confirmed = window.confirm('Remove this uploaded document/file?');
        if (!confirmed) return;

        setTaskAttachmentActionCommentId(commentId);
        setError('');
        try {
            const res = await fetch(`${API_BASE_URL}/api/task-comments.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    action: 'remove_attachment',
                    comment_id: commentId,
                }),
            });
            const data = (await res.json()) as ApiResponse<null>;
            if (!data.success) {
                setError(data.message || 'Failed to remove document/file.');
                return;
            }
            await fetchTaskComments(task.id);
        } catch {
            setError('Failed to remove document/file.');
        } finally {
            setTaskAttachmentActionCommentId(null);
        }
    };

    const openTaskDocumentPreview = (comment: TaskCommentRow) => {
        const relativePath = String(comment.attachment_path || '').replace(/^\/+/, '');
        if (!relativePath) {
            setError('Document/file path not found.');
            return;
        }

        setTaskDocumentPreview({
            name: comment.attachment_name || 'Document',
            url: `${API_BASE_URL}/${relativePath}`,
            mime: comment.attachment_mime || '',
        });
    };

    const visibleTasks = useMemo(() => {
        const term = search.trim().toLowerCase();
        const todayKey = formatDateKey(new Date());

        return tasks.filter((task) => {
            if (statusFilter !== 'all' && String(task.status) !== statusFilter) return false;
            if (priorityFilter !== 'all' && String(task.priority || 'medium') !== priorityFilter) return false;
            if (deadlineFilter !== 'all') {
                const dueKey = normalizeDateKey(task.due_date);
                const taskIsOpen = isOpenTask(task.status);
                if (deadlineFilter === 'due_today' && (!taskIsOpen || dueKey !== todayKey)) return false;
                if (deadlineFilter === 'overdue' && (!taskIsOpen || !dueKey || dueKey >= todayKey)) return false;
            }
            if (!term) return true;

            const haystack = [
                task.title || '',
                task.description || '',
                task.project_name || '',
                task.client_name || '',
                task.service_name || '',
                task.status || '',
                task.priority || '',
            ]
                .join(' ')
                .toLowerCase();

            return haystack.includes(term);
        });
    }, [deadlineFilter, priorityFilter, search, statusFilter, tasks]);

    const summary = useMemo(() => {
        return visibleTasks.reduce(
            (acc, task) => {
                if (task.status === 'pending') acc.pending += 1;
                if (task.status === 'in_progress') acc.inProgress += 1;
                if (task.status === 'completed') acc.completed += 1;
                if (task.status === 'cancelled') acc.cancelled += 1;
                const dueKey = normalizeDateKey(task.due_date);
                if (dueKey && isOpenTask(task.status)) {
                    const todayKey = formatDateKey(new Date());
                    if (dueKey === todayKey) acc.dueToday += 1;
                    if (dueKey < todayKey) acc.overdue += 1;
                }
                return acc;
            },
            { pending: 0, inProgress: 0, completed: 0, cancelled: 0, dueToday: 0, overdue: 0 }
        );
    }, [visibleTasks]);

    const paginatedTasks = visibleTasks.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => {
        setCurrentPage(1);
    }, [deadlineFilter, priorityFilter, search, statusFilter]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(visibleTasks.length / ITEMS_PER_PAGE));
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [visibleTasks.length, currentPage]);

    useEffect(() => {
        if (!error) return;
        void notifyError(error);
        setError('');
    }, [error]);

    useEffect(() => {
        if (expandedTaskId === null) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setExpandedTaskId(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [expandedTaskId]);

    useEffect(() => {
        if (expandedTaskId === null) {
            setTaskComments([]);
            setTaskCommentText('');
            setTaskCommentReplyTarget(null);
            setTaskCommentAttachments([]);
            if (taskCommentFileInputRef.current) {
                taskCommentFileInputRef.current.value = '';
            }
            setShowTaskDocumentViewer(false);
            setTaskAttachmentActionCommentId(null);
            setTaskDocumentPreview(null);
            return;
        }
        setShowTaskDocumentViewer(false);
        setTaskDocumentPreview(null);
        void fetchTaskComments(expandedTaskId);
    }, [expandedTaskId, fetchTaskComments]);

    const discussionComments = useMemo(
        () => taskComments.filter((comment) => String(comment.comment_text || '').trim() !== ''),
        [taskComments]
    );

    const taskDocumentComments = useMemo(
        () => taskComments.filter((comment) => String(comment.attachment_path || '').trim() !== ''),
        [taskComments]
    );

    const activeTaskDocuments = useMemo(
        () => taskDocumentComments.filter((comment) => Number(comment.attachment_archived ?? 0) !== 1),
        [taskDocumentComments]
    );

    const archivedTaskDocuments = useMemo(
        () => taskDocumentComments.filter((comment) => Number(comment.attachment_archived ?? 0) === 1),
        [taskDocumentComments]
    );

    if (loading) {

      return (

        <Layout role={String(user?.role || '')} user={user} onLogout={handleLogout}>

          <div style={{ padding: 20 }}>Loading...</div>

        </Layout>

      );

    }
    const isManagerView = String(user?.role || '').toLowerCase() === 'manager';
    const expandedTask = expandedTaskId === null
        ? null
        : tasks.find((task) => task.id === expandedTaskId) || null;
    const expandedTaskRequiresProof = Number(expandedTask?.require_completion_proof ?? 0) === 1;
    const expandedTaskHasProof = activeTaskDocuments.length > 0;

    return (
        <Layout role={user?.role as string | undefined} user={user} onLogout={handleLogout}>
            <Head><title>My Tasks</title></Head>
            <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
                <div className="pageHeaderInline" style={{ marginBottom: 12 }}>
                    <div className="pageHeaderText">
                    <h1 style={{ margin: '0 0 4px 0', fontSize: 14, color: '#1f2937' }}>My Tasks</h1>
                    <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                        Track your assigned tasks and update progress status.
                    </p>
                    </div>
                    <div className="pageInlineFilters">
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search task, project, client..."
                            style={{ flex: '1 1 260px', minWidth: 180, padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                        />
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }}>
                            <option value="all">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }}>
                            <option value="all">All Priority</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                        </select>
                        <select value={deadlineFilter} onChange={(e) => setDeadlineFilter(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }}>
                            <option value="all">All Deadlines</option>
                            <option value="due_today">Due Today</option>
                            <option value="overdue">Overdue</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
                    <StatCard label="Pending" value={summary.pending} color="#92400e" background="#fef3c7" />
                    <StatCard label="In Progress" value={summary.inProgress} color="#1d4ed8" background="#dbeafe" />
                    <StatCard label="Completed" value={summary.completed} color="#166534" background="#dcfce7" />
                    <StatCard label="Cancelled" value={summary.cancelled} color="#b91c1c" background="#fee2e2" />
                    <StatCard label="Due Today" value={summary.dueToday} color="#1e40af" background="#dbeafe" />
                    <StatCard label="Overdue" value={summary.overdue} color="#b91c1c" background="#fee2e2" />
                </div>

                {isManagerView && (
                    <div style={{ marginBottom: 12, fontSize: 12, color: '#334155', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '8px 10px' }}>
                        Manager view: full task details are visible. You can update task status and send completion reports only.
                    </div>
                )}

                {visibleTasks.length === 0 ? (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, textAlign: 'center', color: '#64748b' }}>
                        No tasks found.
                    </div>
                ) : (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 190px))',
                            justifyContent: 'start',
                            gap: 4
                        }}
                    >
                        {paginatedTasks.map((task) => {
                            const hasCompletionReport = Number(task.has_completion_report ?? 0) === 1;
                            const normalizedStatus = String(task.status || 'pending');
                            return (
                                <div
                                    key={task.id}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Open task ${task.title}`}
                                    onClick={() => setExpandedTaskId(task.id)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            setExpandedTaskId(task.id);
                                        }
                                    }}
                                    style={{
                                        background: 'white',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: 8,
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                                        padding: 8,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 6,
                                        aspectRatio: '1 / 1',
                                        overflowY: 'auto',
                                        scrollbarWidth: 'thin',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2937' }}>{task.title}</div>
                                            <div style={{ fontSize: 11, color: '#64748b' }}>Task #{task.id}</div>
                                            <div style={{ fontSize: 10, color: '#2563eb', fontWeight: 700 }}>Click to expand</div>
                                        </div>
                                        <span style={statusPill(normalizedStatus)}>{formatStatusLabel(normalizedStatus)}</span>
                                    </div>

                                    <div style={{ fontSize: 10, color: '#475569', lineHeight: 1.2, minHeight: 16, maxHeight: 22, overflow: 'hidden' }}>
                                        {task.description || 'No description provided.'}
                                    </div>

                                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                        <span style={priorityPill(task.priority || 'medium')}>{String(task.priority || 'medium').toUpperCase()}</span>
                                        <span style={{ padding: '2px 6px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}>
                                            Due: {formatDateTime(task.due_date)}
                                        </span>
                                        <span style={{ padding: '2px 6px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: '#ede9fe', color: '#5b21b6' }}>
                                            {task.service_name || 'No service'}
                                        </span>
                                    </div>

                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 7, background: '#f8fafc', padding: 5, display: 'grid', gap: 1 }}>
                                        <div style={{ fontSize: 10, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            <strong>Project:</strong> {task.project_name || '-'}
                                        </div>
                                        <div style={{ fontSize: 10, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            <strong>Client:</strong> {task.client_name || '-'}
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 6 }}>
                                        <div>
                                            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3 }}>Status</div>
                                            <div style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontSize: 10, color: '#334155', fontWeight: 700 }}>
                                                {formatStatusLabel(normalizedStatus)}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                            <span style={{ fontSize: 10, color: '#64748b' }}>
                                                <strong>Proof:</strong> {Number(task.require_completion_proof ?? 0) === 1 ? 'Required' : 'Not required'}
                                            </span>
                                        </div>
                                    </div>

                                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <div style={{ fontSize: 10, color: '#475569' }}>
                                            <strong>Client Report:</strong>{' '}
                                            {hasCompletionReport ? (
                                                <span style={{ color: '#15803d', fontWeight: 700 }}>
                                                    Sent{task.completion_report_sent_at ? ` (${new Date(task.completion_report_sent_at).toLocaleString()})` : ''}
                                                </span>
                                            ) : (
                                                'Not yet sent'
                                            )}
                                        </div>

                                        <span style={{ color: '#94a3b8', fontSize: 10 }}>Open task to set proof and complete.</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {expandedTask && (
                    <div
                        onClick={() => setExpandedTaskId(null)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(15,23,42,0.55)',
                            zIndex: 30000,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 16,
                        }}
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: 'min(1200px, 96vw)',
                                height: '92vh',
                                background: '#fff',
                                borderRadius: 12,
                                border: '1px solid #dbe2ea',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
                                display: 'flex',
                                flexDirection: 'column',
                                position: 'relative',
                                overflow: 'hidden',
                            }}
                        >
                            <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {expandedTask.title}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#64748b' }}>Task #{expandedTask.id}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={statusPill(String(expandedTask.status || 'pending'))}>{formatStatusLabel(String(expandedTask.status || 'pending'))}</span>
                                    <button
                                        onClick={() => setShowTaskDocumentViewer((previous) => !previous)}
                                        style={{ border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                                    >
                                        {showTaskDocumentViewer ? 'Flip to Task' : 'Flip to Documents'}
                                    </button>
                                    <button
                                        onClick={() => setExpandedTaskId(null)}
                                        style={{ border: '1px solid #d1d5db', background: '#fff', color: '#374151', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>

                            <div style={{ padding: 14, overflow: 'auto', display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                                {showTaskDocumentViewer && (
                                    <div style={{ border: '1px solid #dbeafe', borderRadius: 10, padding: 12, background: '#f8fbff', gridColumn: '1 / -1' }}>
                                        <div style={{ fontSize: 11, color: '#1d4ed8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>
                                            Documents / Files Viewer
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <input
                                                ref={taskCommentFileInputRef}
                                                type="file"
                                                multiple
                                                onChange={(e) => {
                                                    addTaskCommentAttachments(e.target.files);
                                                    e.currentTarget.value = '';
                                                }}
                                                style={{ maxWidth: 360, fontSize: 12 }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => void uploadTaskDocuments(expandedTask)}
                                                disabled={taskCommentSaving || taskCommentAttachments.length === 0}
                                                style={{
                                                    padding: '6px 10px',
                                                    borderRadius: 8,
                                                    border: 'none',
                                                    background: '#1e3a8a',
                                                    color: '#fff',
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    cursor: taskCommentSaving || taskCommentAttachments.length === 0 ? 'not-allowed' : 'pointer',
                                                    opacity: taskCommentSaving || taskCommentAttachments.length === 0 ? 0.7 : 1,
                                                }}
                                            >
                                                {taskCommentSaving ? 'Uploading...' : 'Add Documents/Files'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={clearTaskCommentAttachments}
                                                disabled={taskCommentAttachments.length === 0}
                                                style={{
                                                    padding: '6px 10px',
                                                    borderRadius: 8,
                                                    border: '1px solid #cbd5e1',
                                                    background: taskCommentAttachments.length > 0 ? '#fff' : '#f8fafc',
                                                    color: '#334155',
                                                    fontSize: 12,
                                                    cursor: taskCommentAttachments.length > 0 ? 'pointer' : 'not-allowed',
                                                    opacity: taskCommentAttachments.length > 0 ? 1 : 0.7,
                                                }}
                                            >
                                                Clear Queue
                                            </button>
                                        </div>

                                        {taskCommentAttachments.length > 0 && (
                                            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                                                {taskCommentAttachments.map((file, index) => (
                                                    <div key={`${file.name}-${file.lastModified}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 8px' }}>
                                                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {file.name} ({Math.ceil(file.size / 1024)} KB)
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeTaskCommentAttachmentAt(index)}
                                                            style={{ border: '1px solid #e2e8f0', background: '#fff', color: '#334155', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div style={{ marginTop: 12, borderTop: '1px solid #dbeafe', paddingTop: 12 }}>
                                            {taskCommentsLoading ? (
                                                <div style={{ color: '#64748b', fontSize: 13 }}>Loading files...</div>
                                            ) : taskDocumentComments.length === 0 ? (
                                                <div style={{ color: '#64748b', fontSize: 13 }}>No uploaded documents/files yet.</div>
                                            ) : (
                                                <div style={{ display: 'grid', gap: 10 }}>
                                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Active ({activeTaskDocuments.length})</div>
                                                    {activeTaskDocuments.length === 0 ? (
                                                        <div style={{ fontSize: 12, color: '#94a3b8' }}>No active documents/files.</div>
                                                    ) : (
                                                        activeTaskDocuments.map((fileComment) => (
                                                            <div key={fileComment.comment_id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '9px 10px', background: '#fff' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                                                    <div style={{ minWidth: 0 }}>
                                                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                            {fileComment.attachment_name || 'Document'}
                                                                        </div>
                                                                        <div style={{ fontSize: 11, color: '#64748b' }}>
                                                                            Uploaded by {fileComment.commenter_name || 'User'}{fileComment.created_at ? ` on ${new Date(fileComment.created_at).toLocaleString()}` : ''}
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => openTaskDocumentPreview(fileComment)}
                                                                            style={{ border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', borderRadius: 8, padding: '5px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                                                                        >
                                                                            View
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void setTaskDocumentArchiveStatus(expandedTask, fileComment.comment_id, true)}
                                                                            disabled={taskAttachmentActionCommentId === fileComment.comment_id}
                                                                            style={{ border: '1px solid #fcd34d', background: '#fffbeb', color: '#b45309', borderRadius: 8, padding: '5px 8px', fontSize: 11, fontWeight: 700, cursor: taskAttachmentActionCommentId === fileComment.comment_id ? 'not-allowed' : 'pointer' }}
                                                                        >
                                                                            Archive
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void removeTaskDocument(expandedTask, fileComment.comment_id)}
                                                                            disabled={taskAttachmentActionCommentId === fileComment.comment_id}
                                                                            style={{ border: '1px solid #fecaca', background: '#fff1f2', color: '#be123c', borderRadius: 8, padding: '5px 8px', fontSize: 11, fontWeight: 700, cursor: taskAttachmentActionCommentId === fileComment.comment_id ? 'not-allowed' : 'pointer' }}
                                                                        >
                                                                            Remove
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}

                                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Archived ({archivedTaskDocuments.length})</div>
                                                    {archivedTaskDocuments.length === 0 ? (
                                                        <div style={{ fontSize: 12, color: '#94a3b8' }}>No archived documents/files.</div>
                                                    ) : (
                                                        archivedTaskDocuments.map((fileComment) => (
                                                            <div key={fileComment.comment_id} style={{ border: '1px dashed #d1d5db', borderRadius: 10, padding: '9px 10px', background: '#f8fafc' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                                                    <div style={{ minWidth: 0 }}>
                                                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                            {fileComment.attachment_name || 'Document'}
                                                                        </div>
                                                                        <div style={{ fontSize: 11, color: '#64748b' }}>
                                                                            Archived file{fileComment.created_at ? ` (uploaded ${new Date(fileComment.created_at).toLocaleString()})` : ''}
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => openTaskDocumentPreview(fileComment)}
                                                                            style={{ border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', borderRadius: 8, padding: '5px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                                                                        >
                                                                            View
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void setTaskDocumentArchiveStatus(expandedTask, fileComment.comment_id, false)}
                                                                            disabled={taskAttachmentActionCommentId === fileComment.comment_id}
                                                                            style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: 8, padding: '5px 8px', fontSize: 11, fontWeight: 700, cursor: taskAttachmentActionCommentId === fileComment.comment_id ? 'not-allowed' : 'pointer' }}
                                                                        >
                                                                            Restore
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void removeTaskDocument(expandedTask, fileComment.comment_id)}
                                                                            disabled={taskAttachmentActionCommentId === fileComment.comment_id}
                                                                            style={{ border: '1px solid #fecaca', background: '#fff1f2', color: '#be123c', borderRadius: 8, padding: '5px 8px', fontSize: 11, fontWeight: 700, cursor: taskAttachmentActionCommentId === fileComment.comment_id ? 'not-allowed' : 'pointer' }}
                                                                        >
                                                                            Remove
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {!showTaskDocumentViewer && (
                                    <>
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#fafcff' }}>
                                    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>Overview</div>
                                    <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
                                        {expandedTask.description || 'No description provided.'}
                                    </div>
                                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        <span style={priorityPill(expandedTask.priority || 'medium')}>{String(expandedTask.priority || 'medium').toUpperCase()}</span>
                                        <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}>
                                            Due: {formatDateTime(expandedTask.due_date)}
                                        </span>
                                        <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#ede9fe', color: '#5b21b6' }}>
                                            {expandedTask.service_name || 'No service'}
                                        </span>
                                    </div>
                                </div>

                                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#fff' }}>
                                    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>Details</div>
                                    <div style={{ display: 'grid', gap: 8 }}>
                                        <div style={{ fontSize: 13, color: '#334155' }}><strong>Project:</strong> {expandedTask.project_name || '-'}</div>
                                        <div style={{ fontSize: 13, color: '#334155' }}><strong>Client:</strong> {expandedTask.client_name || '-'}</div>
                                        <div style={{ fontSize: 13, color: '#334155' }}><strong>Access:</strong> Limited (proof selection and completion only)</div>
                                        <div>
                                            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 6 }}>Status</label>
                                            <div style={{ width: '100%', maxWidth: 260, padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, fontWeight: 700, color: '#334155' }}>
                                                {formatStatusLabel(String(expandedTask.status || 'pending'))}
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 6 }}>Completion Proof</label>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    disabled={savingTaskId === expandedTask.id}
                                                    onClick={() => void handleProofPreferenceChange(expandedTask.id, true)}
                                                    style={{
                                                        padding: '8px 10px',
                                                        borderRadius: 8,
                                                        border: Number(expandedTask.require_completion_proof ?? 0) === 1 ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                                                        background: Number(expandedTask.require_completion_proof ?? 0) === 1 ? '#dbeafe' : '#fff',
                                                        color: Number(expandedTask.require_completion_proof ?? 0) === 1 ? '#1d4ed8' : '#334155',
                                                        fontSize: 12,
                                                        fontWeight: 700,
                                                        cursor: savingTaskId === expandedTask.id ? 'not-allowed' : 'pointer'
                                                    }}
                                                >
                                                    Require Proof
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={savingTaskId === expandedTask.id}
                                                    onClick={() => void handleProofPreferenceChange(expandedTask.id, false)}
                                                    style={{
                                                        padding: '8px 10px',
                                                        borderRadius: 8,
                                                        border: Number(expandedTask.require_completion_proof ?? 0) === 0 ? '1px solid #15803d' : '1px solid #cbd5e1',
                                                        background: Number(expandedTask.require_completion_proof ?? 0) === 0 ? '#dcfce7' : '#fff',
                                                        color: Number(expandedTask.require_completion_proof ?? 0) === 0 ? '#166534' : '#334155',
                                                        fontSize: 12,
                                                        fontWeight: 700,
                                                        cursor: savingTaskId === expandedTask.id ? 'not-allowed' : 'pointer'
                                                    }}
                                                >
                                                    No Proof
                                                </button>
                                            </div>
                                            <div style={{ marginTop: 6, fontSize: 12, color: expandedTaskRequiresProof ? '#b45309' : '#475569' }}>
                                                {expandedTaskRequiresProof
                                                    ? (expandedTaskHasProof ? 'Proof file detected. You can complete the task now.' : 'Upload a file in Documents before completing this task.')
                                                    : 'No file is required. You can complete the task directly.'}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            <button
                                                type="button"
                                                disabled={
                                                    savingTaskId === expandedTask.id
                                                    || String(expandedTask.status || '') === 'completed'
                                                    || (expandedTaskRequiresProof && !expandedTaskHasProof)
                                                }
                                                onClick={() => void handleStatusChange(expandedTask.id, 'completed')}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: 8,
                                                    border: 'none',
                                                    background: '#15803d',
                                                    color: '#fff',
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    cursor: savingTaskId === expandedTask.id || String(expandedTask.status || '') === 'completed' || (expandedTaskRequiresProof && !expandedTaskHasProof) ? 'not-allowed' : 'pointer',
                                                    opacity: savingTaskId === expandedTask.id || String(expandedTask.status || '') === 'completed' || (expandedTaskRequiresProof && !expandedTaskHasProof) ? 0.7 : 1
                                                }}
                                            >
                                                Complete Task
                                            </button>
                                            {String(expandedTask.status || '') === 'completed' ? (
                                                <button
                                                    type="button"
                                                    disabled={savingTaskId === expandedTask.id}
                                                    onClick={() => void handleStatusChange(expandedTask.id, 'in_progress')}
                                                    style={{
                                                        padding: '8px 12px',
                                                        borderRadius: 8,
                                                        border: '1px solid #fcd34d',
                                                        background: '#fffbeb',
                                                        color: '#b45309',
                                                        fontSize: 12,
                                                        fontWeight: 700,
                                                        cursor: savingTaskId === expandedTask.id ? 'not-allowed' : 'pointer'
                                                    }}
                                                >
                                                    Reopen Task
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#fff', gridColumn: '1 / -1' }}>
                                    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>Client Report</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ fontSize: 13, color: '#334155' }}>
                                            {Number(expandedTask.has_completion_report ?? 0) === 1 ? (
                                                <span style={{ color: '#15803d', fontWeight: 700 }}>
                                                    Sent{expandedTask.completion_report_sent_at ? ` (${new Date(expandedTask.completion_report_sent_at).toLocaleString()})` : ''}
                                                </span>
                                            ) : (
                                                'Not yet sent'
                                            )}
                                        </div>
                                        {String(expandedTask.status || '') === 'completed' ? (
                                            <button
                                                type="button"
                                                disabled={sendingReportTaskId === expandedTask.id}
                                                onClick={() => void handleSendCompletionReport(expandedTask)}
                                                style={{
                                                    padding: '7px 12px',
                                                    borderRadius: 8,
                                                    border: 'none',
                                                    background: '#1e3a8a',
                                                    color: '#fff',
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    cursor: sendingReportTaskId === expandedTask.id ? 'not-allowed' : 'pointer',
                                                    opacity: sendingReportTaskId === expandedTask.id ? 0.75 : 1,
                                                }}
                                            >
                                                {sendingReportTaskId === expandedTask.id ? 'Sending...' : (Number(expandedTask.has_completion_report ?? 0) === 1 ? 'Resend report' : 'Send report')}
                                            </button>
                                        ) : (
                                            <span style={{ color: '#94a3b8', fontSize: 12 }}>Complete the task first.</span>
                                        )}
                                    </div>
                                </div>

                                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#fff', gridColumn: '1 / -1' }}>
                                    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>
                                        Task Discussion (Comments / Replies)
                                    </div>

                                    {taskCommentReplyTarget && (
                                        <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #dbeafe', background: '#eff6ff', color: '#1e3a8a', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                            <span>
                                                Replying to {taskCommentReplyTarget.commenter_name || 'User'}: &quot;{taskCommentReplyTarget.comment_text || '-'}&quot;
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setTaskCommentReplyTarget(null)}
                                                style={{ border: 'none', background: 'transparent', color: '#1e3a8a', cursor: 'pointer', fontWeight: 700 }}
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    )}

                                    <div style={{ display: 'grid', gap: 8 }}>
                                        <textarea
                                            value={taskCommentText}
                                            onChange={(e) => setTaskCommentText(e.target.value)}
                                            placeholder="Write a comment or reply..."
                                            style={{
                                                width: '100%',
                                                minHeight: 72,
                                                padding: '10px 12px',
                                                borderRadius: 8,
                                                border: '1px solid #cbd5e1',
                                                resize: 'vertical',
                                                fontSize: 13,
                                                color: '#334155',
                                                fontFamily: 'inherit',
                                            }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <button
                                                type="button"
                                                onClick={() => void submitTaskComment(expandedTask)}
                                                disabled={taskCommentSaving || !taskCommentText.trim()}
                                                style={{
                                                    padding: '7px 12px',
                                                    borderRadius: 8,
                                                    border: 'none',
                                                    background: '#1e3a8a',
                                                    color: '#fff',
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    cursor: taskCommentSaving || !taskCommentText.trim() ? 'not-allowed' : 'pointer',
                                                    opacity: taskCommentSaving || !taskCommentText.trim() ? 0.7 : 1,
                                                }}
                                            >
                                                {taskCommentSaving ? 'Posting...' : 'Post Comment'}
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 12, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                                        {taskCommentsLoading ? (
                                            <div style={{ color: '#64748b', fontSize: 13 }}>Loading comments...</div>
                                        ) : discussionComments.length === 0 ? (
                                            <div style={{ color: '#64748b', fontSize: 13 }}>No comments yet.</div>
                                        ) : (
                                            <div style={{ display: 'grid', gap: 8 }}>
                                                {discussionComments.map((comment) => (
                                                    <div
                                                        key={comment.comment_id}
                                                        style={{
                                                            border: '1px solid #e2e8f0',
                                                            borderRadius: 10,
                                                            padding: '9px 10px',
                                                            background: comment.parent_comment_id ? '#f8fafc' : '#fff',
                                                            marginLeft: comment.parent_comment_id ? 18 : 0,
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                                <strong style={{ color: '#0f172a', fontSize: 13 }}>{comment.commenter_name || 'User'}</strong>
                                                                <span style={{ fontSize: 11, color: '#64748b', textTransform: 'capitalize' }}>{comment.commenter_role || '-'}</span>
                                                                {comment.parent_comment_id && <span style={{ fontSize: 11, color: '#2563eb' }}>Reply</span>}
                                                            </div>
                                                            <span style={{ fontSize: 11, color: '#64748b' }}>
                                                                {comment.created_at ? new Date(comment.created_at).toLocaleString() : '-'}
                                                            </span>
                                                        </div>
                                                        <div style={{ color: '#334155', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                                                            {comment.comment_text || '-'}
                                                        </div>
                                                        <div style={{ marginTop: 7 }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setTaskCommentReplyTarget(comment)}
                                                                style={{ border: 'none', background: 'transparent', color: '#1e3a8a', fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 700 }}
                                                            >
                                                                Reply
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                    </>
                                )}
                            </div>

                            {taskDocumentPreview && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        background: 'rgba(15,23,42,0.48)',
                                        zIndex: 10,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 14,
                                    }}
                                >
                                    <div style={{ width: 'min(1080px, 98%)', height: '90%', background: '#fff', border: '1px solid #dbe2ea', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.24)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {taskDocumentPreview.name}
                                                </div>
                                                <div style={{ fontSize: 11, color: '#64748b' }}>In-system document viewer</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setTaskDocumentPreview(null)}
                                                style={{ border: '1px solid #d1d5db', background: '#fff', color: '#374151', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                                            >
                                                Close Viewer
                                            </button>
                                        </div>

                                        <div style={{ flex: 1, background: '#f8fafc', padding: 10, overflow: 'auto' }}>
                                            <iframe
                                                src={taskDocumentPreview.url}
                                                title={`Preview ${taskDocumentPreview.name}`}
                                                style={{ width: '100%', height: '100%', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <Pagination
                    currentPage={currentPage}
                    totalItems={visibleTasks.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                    label="tasks"
                />
            </div>
        </Layout>
    );
}

function StatCard({ label, value, color, background }: { label: string; value: number; color: string; background: string }) {
    return (
        <div style={{ background, border: '1px solid rgba(15,23,42,0.06)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, color }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
        </div>
    );
}

function formatStatusLabel(status: string): string {
    if (status === 'in_progress') return 'In Progress';
    return String(status).replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function statusPill(status: string): CSSProperties {
    const value = String(status || '').toLowerCase();
    if (value === 'completed') {
        return {
            background: '#dcfce7',
            color: '#166534',
            borderRadius: 999,
            padding: '2px 6px',
            fontSize: 10,
            fontWeight: 700,
        };
    }
    if (value === 'in_progress') {
        return {
            background: '#dbeafe',
            color: '#1e40af',
            borderRadius: 999,
            padding: '2px 6px',
            fontSize: 10,
            fontWeight: 700,
        };
    }
    if (value === 'cancelled') {
        return {
            background: '#fee2e2',
            color: '#b91c1c',
            borderRadius: 999,
            padding: '2px 6px',
            fontSize: 10,
            fontWeight: 700,
        };
    }
    return {
        background: '#fef3c7',
        color: '#92400e',
        borderRadius: 999,
        padding: '2px 6px',
        fontSize: 10,
        fontWeight: 700,
    };
}

function priorityPill(priority: string): CSSProperties {
    const value = String(priority).toLowerCase();
    if (value === 'high') {
        return { background: '#fee2e2', color: '#b91c1c', borderRadius: 999, padding: '2px 7px', fontSize: 10, fontWeight: 700, textTransform: 'capitalize' };
    }
    if (value === 'low') {
        return { background: '#dcfce7', color: '#166534', borderRadius: 999, padding: '2px 7px', fontSize: 10, fontWeight: 700, textTransform: 'capitalize' };
    }
    return { background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '2px 7px', fontSize: 10, fontWeight: 700, textTransform: 'capitalize' };
}
