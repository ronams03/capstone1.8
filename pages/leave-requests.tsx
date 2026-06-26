import { type CSSProperties, FormEvent, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import CrudActionIcon from '../components/CrudActionIcon';
import { getBackendBaseUrl } from '@/utils/network';
import { confirmAction, notifyError } from '@/utils/notify';

const API_BASE_URL = getBackendBaseUrl();
const ITEMS_PER_PAGE = 10;

type SessionUser = {
    id?: number;
    role?: string;
    employee_id?: number;
    [key: string]: unknown;
};

type LeaveRequestRow = {
    leave_request_id: number;
    employee_id: number;
    employee_name?: string;
    employee_role?: string | null;
    leave_type: string;
    start_date: string;
    end_date: string;
    reason?: string | null;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled' | string;
    created_at?: string;
    comment_count?: number;
};

type LeaveCommentRow = {
    comment_id: number;
    leave_request_id: number;
    user_id: number;
    parent_comment_id?: number | null;
    comment_text: string;
    commenter_name?: string;
    commenter_role?: string;
    created_at?: string;
    updated_at?: string;
};

type EmployeeRow = {
    employee_id: number;
    first_name: string;
    last_name: string;
    position?: string | null;
    linked_user_role?: string | null;
    status?: string;
};

type LeaveTypeRow = {
    leave_type_id: number;
    type_key: string;
    type_name: string;
    is_active?: number | boolean | null;
};

type ApiResponse<T> = {
    success?: boolean;
    message?: string;
    data?: T;
};

type LeaveForm = {
    employee_id: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    reason: string;
};

function currentDate() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}

const initialForm = (): LeaveForm => ({
    employee_id: '',
    leave_type: 'vacation',
    start_date: currentDate(),
    end_date: currentDate(),
    reason: '',
});

function normalizeEmployeeRole(value: unknown) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'manager' || raw.includes('manager')) return 'manager';
    if (raw === 'staff' || raw.includes('staff')) return 'staff';
    if (raw === 'admin' || raw.includes('administrator')) return 'admin';
    return raw;
}

function fallbackLeaveTypeLabel(value: string) {
    const key = String(value || '').trim();
    if (!key) return '-';
    return key
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

export default function LeaveRequestsPage() {
    const router = useRouter();
    const [user, setUser] = useState<SessionUser | null>(null);
    const [rows, setRows] = useState<LeaveRequestRow[]>([]);
    const [employees, setEmployees] = useState<EmployeeRow[]>([]);
    const [leaveTypes, setLeaveTypes] = useState<LeaveTypeRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all');
    const [roleFilter, setRoleFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [form, setForm] = useState<LeaveForm>(initialForm());
    const [selectedRequest, setSelectedRequest] = useState<LeaveRequestRow | null>(null);
    const [comments, setComments] = useState<LeaveCommentRow[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [commentSaving, setCommentSaving] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [replyTarget, setReplyTarget] = useState<LeaveCommentRow | null>(null);
    const [autoOpenedRequestId, setAutoOpenedRequestId] = useState<number | null>(null);
    const [showLeaveRequestModal, setShowLeaveRequestModal] = useState(false);
    const [showCommentsModal, setShowCommentsModal] = useState(false);
    const [editingRequest, setEditingRequest] = useState<LeaveRequestRow | null>(null);
    const [requestForSelf, setRequestForSelf] = useState(false);
    const [bulkActionLoading, setBulkActionLoading] = useState(false);

    const role = String(user?.role || '').toLowerCase();
    const selfEmployeeId = Number(user?.employee_id || 0);
    const canApprove = role === 'manager' || role === 'admin';
    const canSubmit = role === 'staff' || role === 'manager' || role === 'admin';
    const canSelectEmployee = role === 'manager' || role === 'admin';
    const canRequestForSelf = role === 'manager';
    const isEditing = Boolean(editingRequest);
    const archiveFilterActive = statusFilter === 'archived';
    const archiveActionRows = useMemo(() => {
        if (!archiveFilterActive) return [];
        if (role === 'manager') {
            return rows.filter((row) => normalizeEmployeeRole(row.employee_role) === 'staff');
        }
        return rows;
    }, [archiveFilterActive, role, rows]);

    useEffect(() => {
        const init = async () => {
            try {
                const sessionRes = await fetch(`${API_BASE_URL}/api/auth.php`, { credentials: 'include' });
                const sessionData = (await sessionRes.json()) as ApiResponse<SessionUser>;
                if (!sessionData.success || !sessionData.data) {
                    router.push('/');
                    return;
                }

                const sessionUser = sessionData.data;
                setUser(sessionUser);
                const sessionRole = String(sessionUser.role || '').toLowerCase();
                await fetchLeaveTypes();
                if (sessionRole === 'manager' || sessionRole === 'admin') {
                    await fetchEmployees(sessionRole, Number(sessionUser.employee_id || 0));
                }
                if (sessionRole === 'staff') {
                    setForm((prev) => ({ ...prev, employee_id: String(sessionUser.employee_id || '') }));
                }
                await fetchRequests();
            } catch {
                router.push('/');
            } finally {
                setLoading(false);
            }
        };

        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    const fetchLeaveTypes = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/leave-types.php`, { credentials: 'include' });
            const data = (await res.json()) as ApiResponse<LeaveTypeRow[]>;
            if (data.success && Array.isArray(data.data)) {
                setLeaveTypes(data.data);
            } else {
                setLeaveTypes([]);
            }
        } catch {
            setLeaveTypes([]);
        }
    };

    useEffect(() => {
        if (!requestForSelf) return;
        if (selfEmployeeId > 0) {
            setForm((prev) => ({ ...prev, employee_id: String(selfEmployeeId) }));
        }
    }, [requestForSelf, selfEmployeeId]);

    const fetchEmployees = async (requestedByRole = role, requesterEmployeeId = selfEmployeeId) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/employees.php?status=active`, { credentials: 'include' });
            const data = (await res.json()) as ApiResponse<EmployeeRow[]>;
            if (data.success && Array.isArray(data.data)) {
                const requesterRole = String(requestedByRole || '').toLowerCase();
                const restrictToManagersAndStaff = requesterRole === 'admin' || requesterRole === 'manager';
                let nextEmployees = restrictToManagersAndStaff
                    ? data.data.filter((employee) => {
                        const linkedRole = normalizeEmployeeRole(employee.linked_user_role);
                        if (linkedRole) {
                            return linkedRole === 'manager' || linkedRole === 'staff';
                        }
                        const positionRole = normalizeEmployeeRole(employee.position);
                        return positionRole === 'manager' || positionRole === 'staff';
                    })
                    : data.data;

                if (requesterRole === 'manager' && requesterEmployeeId > 0) {
                    nextEmployees = nextEmployees.filter((employee) => employee.employee_id !== requesterEmployeeId);
                }

                setEmployees(nextEmployees);
            }
        } catch {
            setEmployees([]);
        }
    };

    const fetchRequests = async () => {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.set('status', statusFilter);
        if (role === 'admin' && roleFilter !== 'all') params.set('role', roleFilter);
        const endpoint = `${API_BASE_URL}/api/leave-requests.php${params.toString() ? `?${params.toString()}` : ''}`;

        try {
            const res = await fetch(endpoint, { credentials: 'include' });
            const data = (await res.json()) as ApiResponse<LeaveRequestRow[]>;
            if (data.success && Array.isArray(data.data)) {
                const archivedStatuses = new Set(['approved', 'rejected', 'archived', 'cancelled']);
                const nextRows = statusFilter === 'all'
                    ? data.data.filter((row) => !archivedStatuses.has(String(row.status || '').toLowerCase()))
                    : data.data;
                setRows(nextRows);
            } else {
                setRows([]);
                void notifyError(data.message || 'Failed to load leave requests.');
            }
        } catch {
            setRows([]);
            void notifyError('Failed to load leave requests.');
        }
    };

    const fetchComments = async (leaveRequestId: number) => {
        setCommentsLoading(true);
        try {
            const params = new URLSearchParams({ comments: '1', leave_request_id: String(leaveRequestId) });
            const res = await fetch(`${API_BASE_URL}/api/leave-requests.php?${params.toString()}`, { credentials: 'include' });
            const data = (await res.json()) as ApiResponse<LeaveCommentRow[]>;
            if (data.success && Array.isArray(data.data)) {
                setComments(data.data);
            } else {
                setComments([]);
                void notifyError(data.message || 'Failed to load comments.');
            }
        } catch {
            setComments([]);
            void notifyError('Failed to load comments.');
        } finally {
            setCommentsLoading(false);
        }
    };

    const openRequestComments = async (row: LeaveRequestRow) => {
        setSelectedRequest(row);
        setCommentText('');
        setReplyTarget(null);
        setShowCommentsModal(true);
        await fetchComments(row.leave_request_id);
    };

    useEffect(() => {
        if (user) {
            fetchRequests();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter, roleFilter]);

    const activeLeaveTypes = useMemo(
        () => leaveTypes.filter((leaveType) => Boolean(Number(leaveType.is_active ?? 1))),
        [leaveTypes]
    );

    const leaveTypeNameByKey = useMemo(() => {
        const map: Record<string, string> = {};
        leaveTypes.forEach((leaveType) => {
            const key = String(leaveType.type_key || '').trim();
            const name = String(leaveType.type_name || '').trim();
            if (key && name) map[key] = name;
        });
        return map;
    }, [leaveTypes]);

    const getLeaveTypeLabel = (leaveTypeKey: string) => {
        const key = String(leaveTypeKey || '').trim();
        if (!key) return '-';
        return leaveTypeNameByKey[key] || fallbackLeaveTypeLabel(key);
    };

    useEffect(() => {
        if (activeLeaveTypes.length === 0) {
            setForm((prev) => (prev.leave_type === '' ? prev : { ...prev, leave_type: '' }));
            return;
        }

        const isCurrentValid = activeLeaveTypes.some((leaveType) => leaveType.type_key === form.leave_type);
        if (!isCurrentValid) {
            setForm((prev) => ({ ...prev, leave_type: activeLeaveTypes[0].type_key }));
        }
    }, [activeLeaveTypes, form.leave_type]);

    useEffect(() => {
        if (!router.isReady || rows.length === 0) return;

        const raw = router.query.request_id ?? router.query.leave_request_id;
        const requestId = Number(Array.isArray(raw) ? raw[0] : raw);
        if (!Number.isFinite(requestId) || requestId <= 0) return;
        if (autoOpenedRequestId === requestId) return;

        const match = rows.find((row) => row.leave_request_id === requestId);
        if (!match) return;

        setAutoOpenedRequestId(requestId);
        void openRequestComments(match);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router.isReady, router.query.request_id, router.query.leave_request_id, rows, autoOpenedRequestId]);

    const handleLogout = async () => {
        await fetch(`${API_BASE_URL}/api/auth.php?action=logout`, { method: 'POST', credentials: 'include' });
        router.push('/');
    };

    const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmit) {
            void notifyError('Only admin, manager, or staff can submit leave requests.');
            return;
        }
        if (!form.leave_type.trim()) {
            void notifyError('Please select a leave type.');
            return;
        }
        setSaving(true);
        try {
            const isEditing = Boolean(editingRequest);
            const requestUrl = `${API_BASE_URL}/api/leave-requests.php`;
            let method: 'POST' | 'PUT' = 'POST';
            const payload: Record<string, unknown> = {};

            if (isEditing && editingRequest) {
                method = 'PUT';
                payload.leave_request_id = editingRequest.leave_request_id;
                payload.start_date = form.start_date;
                payload.end_date = form.end_date;
                payload.reason = form.reason.trim();
            } else {
                payload.leave_type = form.leave_type;
                payload.start_date = form.start_date;
                payload.end_date = form.end_date;
                payload.reason = form.reason.trim();

                if (canSelectEmployee) {
                    const resolvedEmployeeId = requestForSelf ? selfEmployeeId : Number(form.employee_id || 0);
                    if (!resolvedEmployeeId) {
                        void notifyError(requestForSelf
                            ? 'Your account is not linked to an employee record.'
                            : 'Please select an employee.');
                        return;
                    }
                    payload.employee_id = resolvedEmployeeId;
                }
            }

            const res = await fetch(requestUrl, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            const data = (await res.json()) as ApiResponse<{ leave_request_id: number }>;
            if (!data.success) {
                void notifyError(data.message || (isEditing ? 'Failed to update leave request.' : 'Failed to submit leave request.'));
                return;
            }

            setForm((prev) => ({ ...prev, reason: '' }));
            setEditingRequest(null);
            setShowLeaveRequestModal(false);
            await fetchRequests();
        } catch {
            void notifyError(editingRequest ? 'Failed to update leave request.' : 'Failed to submit leave request.');
        } finally {
            setSaving(false);
        }
    };

    const approveOrReject = async (leaveRequestId: number, action: 'approve' | 'reject') => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/leave-requests.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ leave_request_id: leaveRequestId, action: action === 'reject' ? 'archive' : 'approve' }),
            });
            const data = (await res.json()) as ApiResponse<null>;
            if (!data.success) {
                void notifyError(data.message || 'Failed to update leave request.');
                return;
            }
            const newStatus = action === 'approve' ? 'approved' : 'archived';
            setRows((prev) =>
                prev.map((r) =>
                    r.leave_request_id === leaveRequestId
                        ? { ...r, status: newStatus }
                        : r
                )
            );
            if (selectedRequest?.leave_request_id === leaveRequestId) {
                setSelectedRequest((prev) => prev ? { ...prev, status: newStatus } : null);
            }
        } catch {
            void notifyError('Failed to update leave request.');
        }
    };

    const canCancelPendingRequest = (row: LeaveRequestRow) => {
        const normalizedStatus = String(row.status || '').toLowerCase();
        if (normalizedStatus !== 'pending') return false;
        if (role === 'staff') {
            return selfEmployeeId > 0 && Number(row.employee_id) === selfEmployeeId;
        }
        return role === 'admin' || role === 'manager';
    };

    const cancelRequest = async (row: LeaveRequestRow) => {
        const ok = await confirmAction({
            title: 'Cancel leave request?',
            text: `Cancel leave request #${row.leave_request_id}?`,
            confirmButtonText: 'Cancel Request',
            icon: 'warning',
            danger: true,
        });
        if (!ok) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/leave-requests.php?id=${row.leave_request_id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const data = (await res.json()) as ApiResponse<null>;
            if (!data.success) {
                void notifyError(data.message || 'Failed to cancel leave request.');
                return;
            }

            if (selectedRequest?.leave_request_id === row.leave_request_id) {
                setShowCommentsModal(false);
                setSelectedRequest(null);
                setComments([]);
                setCommentText('');
                setReplyTarget(null);
            }
            setRows((prev) =>
                prev.map((r) =>
                    r.leave_request_id === row.leave_request_id
                        ? { ...r, status: 'cancelled' }
                        : r
                )
            );
        } catch {
            void notifyError('Failed to cancel leave request.');
        }
    };

    const deleteRequest = async (leaveRequestId: number) => {
        const ok = await confirmAction({
            title: 'Delete archived leave request?',
            text: 'This will permanently remove the leave request and its comments.',
            confirmButtonText: 'Delete',
            icon: 'warning',
            danger: true,
        });
        if (!ok) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/leave-requests.php?id=${leaveRequestId}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const data = (await res.json()) as ApiResponse<null>;
            if (!data.success) {
                void notifyError(data.message || 'Failed to delete leave request.');
                return;
            }
            setRows((prev) => prev.filter((r) => r.leave_request_id !== leaveRequestId));
            if (selectedRequest?.leave_request_id === leaveRequestId) {
                setSelectedRequest(null);
                setComments([]);
            }
        } catch {
            void notifyError('Failed to delete leave request.');
        }
    };

    const restoreRequest = async (leaveRequestId: number) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/leave-requests.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ leave_request_id: leaveRequestId, action: 'restore' }),
            });
            const data = (await res.json()) as ApiResponse<null>;
            if (!data.success) {
                void notifyError(data.message || 'Failed to restore leave request.');
                return;
            }
            setRows((prev) => prev.filter((r) => r.leave_request_id !== leaveRequestId));
            if (selectedRequest?.leave_request_id === leaveRequestId) {
                setSelectedRequest(null);
                setComments([]);
            }
        } catch {
            void notifyError('Failed to restore leave request.');
        }
    };

    const restoreAllArchived = async () => {
        if (!archiveFilterActive || bulkActionLoading || archiveActionRows.length === 0) return;
        const ok = await confirmAction({
            title: 'Restore all archived requests?',
            text: `Restore ${archiveActionRows.length} archived leave request(s) to pending.`,
            confirmButtonText: 'Restore All',
            icon: 'question',
        });
        if (!ok) return;

        setBulkActionLoading(true);
        try {
            const results = await Promise.all(
                archiveActionRows.map((row) =>
                    fetch(`${API_BASE_URL}/api/leave-requests.php`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ leave_request_id: row.leave_request_id, action: 'restore' }),
                    }).then((res) => res.json())
                )
            );
            const failed = results.filter((r) => !r?.success).length;
            if (failed > 0) {
                void notifyError(`${failed} leave request(s) could not be restored.`);
            }
            const idsToRemove = new Set(archiveActionRows.map((r) => r.leave_request_id));
            setRows((prev) => prev.filter((r) => !idsToRemove.has(r.leave_request_id)));
            if (selectedRequest && idsToRemove.has(selectedRequest.leave_request_id)) {
                setSelectedRequest(null);
                setComments([]);
            }
        } catch {
            void notifyError('Failed to restore archived leave requests.');
        } finally {
            setBulkActionLoading(false);
        }
    };

    const submitComment = async () => {
        if (!selectedRequest) return;
        const text = commentText.trim();
        if (!text) {
            void notifyError('Comment cannot be empty.');
            return;
        }

        setCommentSaving(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/leave-requests.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    action: 'comment',
                    leave_request_id: selectedRequest.leave_request_id,
                    comment: text,
                    parent_comment_id: replyTarget?.comment_id ?? null,
                }),
            });
            const data = (await res.json()) as ApiResponse<{ comment_id: number }>;
            if (!data.success) {
                void notifyError(data.message || 'Failed to post comment.');
                return;
            }

            setCommentText('');
            setReplyTarget(null);
            await fetchComments(selectedRequest.leave_request_id);
        } catch {
            void notifyError('Failed to post comment.');
        } finally {
            setCommentSaving(false);
        }
    };

    const paginatedRows = useMemo(
        () => rows.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
        [rows, currentPage]
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [rows.length, statusFilter, roleFilter]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [rows.length, currentPage]);

    useEffect(() => {
        if (!canSubmit && showLeaveRequestModal) {
            setShowLeaveRequestModal(false);
        }
    }, [canSubmit, showLeaveRequestModal]);

    useEffect(() => {
        if (!showLeaveRequestModal) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [showLeaveRequestModal]);

    useEffect(() => {
        if (showLeaveRequestModal) return;
        setEditingRequest(null);
        setRequestForSelf(false);
        setForm(() => {
            const next = initialForm();
            if (role === 'staff' && user?.employee_id) {
                next.employee_id = String(user.employee_id);
            }
            return next;
        });
    }, [showLeaveRequestModal, role, user?.employee_id]);

    useEffect(() => {
        if (!showCommentsModal) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [showCommentsModal]);

    const openEditRequest = (row: LeaveRequestRow) => {
        setEditingRequest(row);
        setForm({
            employee_id: String(row.employee_id || ''),
            leave_type: row.leave_type || '',
            start_date: row.start_date,
            end_date: row.end_date,
            reason: row.reason || '',
        });
        setRequestForSelf(false);
        setShowLeaveRequestModal(true);
    };

    if (loading) {

      return (

        <Layout role={String(user?.role || '')} user={user} onLogout={handleLogout}>

          <div style={{ padding: 20 }}>Loading...</div>

        </Layout>

      );

    }

    return (
        <Layout role={user?.role as string | undefined} user={user} onLogout={handleLogout}>
            <Head><title>Leave Requests</title></Head>
            <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
                <h1 style={{ margin: '0 0 6px 0', fontSize: 14, color: '#1f2937' }}>Leave Requests</h1>
                <p style={{ margin: '0 0 14px 0', color: '#64748b', fontSize: 13 }}>
                    {canApprove
                        ? 'Review leave requests and replies.'
                        : 'Submit and track leave requests.'}
                </p>

                {showLeaveRequestModal && (
                    <div
                        style={modalOverlayStyle}
                        onClick={() => setShowLeaveRequestModal(false)}
                    >
                        <div
                            style={modalSquareStyle}
                            onClick={(event) => event.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                            aria-label="New Leave Request"
                        >
                            <div style={modalHeaderStyle}>
                                <h2 style={{ margin: 0, fontSize: 14, color: '#0f172a' }}>
                                    {isEditing ? 'Edit Leave Request' : 'New Leave Request'}
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => setShowLeaveRequestModal(false)}
                                    title="Close"
                                    aria-label="Close new leave request form"
                                    style={iconActionButton('#64748b')}
                                >
                                    <CrudActionIcon action="cancel" />
                                </button>
                            </div>

                            <form onSubmit={submitRequest} style={{ display: 'grid', gap: 10 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                                    {canSelectEmployee && (
                                        <div>
                                            {canRequestForSelf && (
                                                <>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                        <input
                                                            id="leave-request-self"
                                                            type="checkbox"
                                                            checked={requestForSelf}
                                                            onChange={(e) => {
                                                                const checked = e.target.checked;
                                                                setRequestForSelf(checked);
                                                                setForm((prev) => ({
                                                                    ...prev,
                                                                    employee_id: checked ? String(selfEmployeeId || '') : '',
                                                                }));
                                                            }}
                                                        />
                                                        <label htmlFor="leave-request-self" style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>
                                                            Request for myself
                                                        </label>
                                                    </div>
                                                    {requestForSelf && selfEmployeeId <= 0 && (
                                                        <div style={{ fontSize: 11, color: '#b91c1c', marginBottom: 6 }}>
                                                            Your account is not linked to an employee record.
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            <label style={labelStyle}>Employee</label>
                                            <select
                                                value={form.employee_id}
                                                onChange={(e) => setForm((prev) => ({ ...prev, employee_id: e.target.value }))}
                                                required={canRequestForSelf ? !requestForSelf : true}
                                                disabled={isEditing || (canRequestForSelf ? requestForSelf : false)}
                                                style={inputStyle}
                                            >
                                                <option value="">
                                                    {role === 'admin' || role === 'manager' ? 'Select manager or staff' : 'Select employee'}
                                                </option>
                                                {employees.map((employee) => (
                                                    <option key={employee.employee_id} value={employee.employee_id}>
                                                        {employee.first_name} {employee.last_name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    <div>
                                        <label style={labelStyle}>Leave Type</label>
                                        <select
                                            value={form.leave_type}
                                            onChange={(e) => setForm((prev) => ({ ...prev, leave_type: e.target.value }))}
                                            style={inputStyle}
                                            required
                                            disabled={isEditing}
                                        >
                                            {activeLeaveTypes.length === 0 && <option value="">No active leave types</option>}
                                            {activeLeaveTypes.map((leaveType) => (
                                                <option key={leaveType.leave_type_id} value={leaveType.type_key}>
                                                    {leaveType.type_name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Start Date</label>
                                        <input type="date" value={form.start_date} onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))} style={inputStyle} required />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>End Date</label>
                                        <input type="date" value={form.end_date} onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))} style={inputStyle} required />
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>Reason</label>
                                    <textarea value={form.reason} onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))} style={{ ...inputStyle, minHeight: 74 }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: '#1e3a8a', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
                                    >
                                        {saving ? (isEditing ? 'Saving...' : 'Submitting...') : (isEditing ? 'Save Changes' : 'Submit Request')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                <div className="pageHeaderInline" style={{ marginBottom: 8 }}>
                    <h2 style={{ margin: 0, fontSize: 14, color: '#1f2937' }}>Request History</h2>
                    <div className="pageInlineFilters">
                        {role === 'admin' && (
                            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={toolbarSelectStyle}>
                                <option value="all">All Roles</option>
                                <option value="manager">Manager</option>
                                <option value="staff">Staff</option>
                                <option value="admin">Admin</option>
                            </select>
                        )}
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={toolbarSelectStyle}>
                            <option value="all">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="archived">Archived</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                        <button
                            type="button"
                            onClick={() => setStatusFilter((prev) => (prev === 'archived' ? 'all' : 'archived'))}
                            style={{ ...actionButton(archiveFilterActive ? '#1e3a8a' : '#64748b'), padding: '8px 12px' }}
                            title={archiveFilterActive ? 'Back to all requests' : 'Show archived requests'}
                            aria-label={archiveFilterActive ? 'Back to all requests' : 'Show archived requests'}
                        >
                            <CrudActionIcon action="archive" size={14} />
                            {archiveFilterActive ? 'Back to Active' : 'Archive Storage'}
                        </button>
                        {archiveFilterActive && canApprove && archiveActionRows.length > 0 && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => void restoreAllArchived()}
                                    disabled={bulkActionLoading}
                                    title="Restore all archived requests"
                                    aria-label="Restore all archived leave requests"
                                    style={{ ...actionButton('#16a34a'), padding: '8px 12px', opacity: bulkActionLoading ? 0.7 : 1 }}
                                >
                                    <CrudActionIcon action="restore" size={14} />
                                    <span style={{ marginLeft: 6 }}>Restore All</span>
                                </button>
                            </>
                        )}
                        {!archiveFilterActive && (
                            <button
                                type="button"
                                onClick={() => {
                                    if (!canSubmit) {
                                        void notifyError('You do not have permission to submit leave requests.');
                                        return;
                                    }
                                    setShowLeaveRequestModal(true);
                                }}
                                title={canSubmit ? 'New Leave Request' : 'Leave request unavailable'}
                                aria-label={canSubmit ? 'Open new leave request form' : 'Leave request unavailable'}
                                style={floatingNewRequestButton(canSubmit)}
                            >
                                <CrudActionIcon action="create" size={16} />
                                <span style={{ marginLeft: 6 }}>New Request</span>
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#f8fafc' }}>
                            <tr>
                                <th style={thStyle}>Employee</th>
                                <th style={thStyle}>Type</th>
                                <th style={thStyle}>Date Range</th>
                                <th style={thStyle}>Reason</th>
                                <th style={thStyle}>Status</th>
                                <th style={thStyle}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No leave requests found.</td></tr>
                            ) : (
                                paginatedRows.map((row) => {
                                    const normalizedStatus = String(row.status || '').toLowerCase();
                                    const targetRole = normalizeEmployeeRole(row.employee_role);
                                    const canReview = normalizedStatus === 'pending'
                                        && (role === 'admin' || (role === 'manager' && targetRole === 'staff'));
                                    const canEdit = normalizedStatus === 'pending'
                                        && (role === 'admin'
                                            || role === 'manager'
                                            || (role === 'staff' && selfEmployeeId > 0 && row.employee_id === selfEmployeeId));
                                    const isArchivedStatus = ['approved', 'rejected', 'archived', 'cancelled'].includes(normalizedStatus);
                                    const canManageArchive = canApprove
                                        && archiveFilterActive
                                        && isArchivedStatus
                                        && (role === 'admin' || (role === 'manager' && targetRole === 'staff'));
                                    const canRestore = canManageArchive;
                                    const canCancel = canCancelPendingRequest(row);
                                    return (
                                        <tr
                                            key={row.leave_request_id}
                                            style={{
                                                borderTop: '1px solid #eef2f7',
                                                cursor: canApprove ? 'pointer' : 'default',
                                                background: selectedRequest?.leave_request_id === row.leave_request_id ? '#f8fafc' : 'transparent',
                                            }}
                                            onClick={() => {
                                                if (!canApprove) return;
                                                void openRequestComments(row);
                                            }}
                                        >
                                            <td style={tdStyle}>{row.employee_name || `Employee #${row.employee_id}`}</td>
                                            <td style={tdStyle}>{getLeaveTypeLabel(row.leave_type)}</td>
                                            <td style={tdStyle}>{row.start_date} - {row.end_date}</td>
                                            <td style={tdStyle}>{truncateText(row.reason || '-', 90)}</td>
                                            <td style={tdStyle}><span style={statusPill(normalizedStatus)}>{statusLabel(normalizedStatus)}</span></td>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                    {canReview && (
                                                        <>
                                                            <button
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    void approveOrReject(row.leave_request_id, 'approve');
                                                                }}
                                                                title="Approve"
                                                                aria-label="Approve leave request"
                                                                style={listActionButton('#16a34a')}
                                                            >
                                                                <CrudActionIcon action="approve" />
                                                                <span>Approve</span>
                                                            </button>
                                                            <button
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    void approveOrReject(row.leave_request_id, 'reject');
                                                                }}
                                                                title="Reject"
                                                                aria-label="Reject leave request"
                                                                style={listActionButton('#dc2626')}
                                                            >
                                                                <CrudActionIcon action="cancel" />
                                                                <span>Reject</span>
                                                            </button>
                                                        </>
                                                    )}
                                                    {canEdit && (
                                                        <button
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                openEditRequest(row);
                                                            }}
                                                            title="Edit"
                                                            aria-label="Edit leave request"
                                                            style={listActionButton('#0ea5e9')}
                                                        >
                                                            <CrudActionIcon action="edit" />
                                                            <span>Edit</span>
                                                        </button>
                                                    )}
                                                    {canCancel && (
                                                        <button
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                void cancelRequest(row);
                                                            }}
                                                            title="Cancel"
                                                            aria-label="Cancel leave request"
                                                            style={listActionButton('#475569')}
                                                        >
                                                            <CrudActionIcon action="cancel" />
                                                            <span>Cancel</span>
                                                        </button>
                                                    )}
                                                    {canRestore && (
                                                        <button
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                void restoreRequest(row.leave_request_id);
                                                            }}
                                                            title="Restore"
                                                            aria-label="Restore leave request"
                                                            style={listActionButton('#166534')}
                                                        >
                                                            <CrudActionIcon action="restore" />
                                                            <span>Restore</span>
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            void openRequestComments(row);
                                                        }}
                                                        title={row.comment_count ? `Read comments (${row.comment_count})` : 'Read comments'}
                                                        aria-label="View leave request comments"
                                                        style={listActionButton('#1e3a8a')}
                                                    >
                                                        <CrudActionIcon action="view" />
                                                        <span>{row.comment_count ? `Read (${row.comment_count})` : 'Read'}</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {showCommentsModal && selectedRequest && (
                    <div
                        style={modalOverlayStyle}
                        onClick={() => setShowCommentsModal(false)}
                    >
                        <div
                            style={commentModalStyle}
                            onClick={(event) => event.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                            aria-label="Leave Request Discussion"
                        >
                            <div style={modalHeaderStyle}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: 14, color: '#0f172a' }}>
                                        Leave Request #{selectedRequest.leave_request_id} Discussion
                                    </h3>
                                    <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: 12 }}>
                                        {selectedRequest.employee_name || `Employee #${selectedRequest.employee_id}`} | {getLeaveTypeLabel(selectedRequest.leave_type)} | {selectedRequest.start_date} - {selectedRequest.end_date}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {canCancelPendingRequest(selectedRequest) && (
                                        <button
                                            type="button"
                                            onClick={() => void cancelRequest(selectedRequest)}
                                            title="Cancel leave request"
                                            aria-label="Cancel leave request"
                                            style={{ ...actionButton('#475569'), whiteSpace: 'nowrap' }}
                                        >
                                            Cancel Request
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowCommentsModal(false);
                                            setSelectedRequest(null);
                                            setComments([]);
                                            setCommentText('');
                                            setReplyTarget(null);
                                        }}
                                        title="Close"
                                        aria-label="Close leave request discussion"
                                        style={iconActionButton('#64748b')}
                                    >
                                        <CrudActionIcon action="cancel" />
                                    </button>
                                </div>
                            </div>

                            <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
                                    Reason
                                </div>
                                <div style={{ color: '#334155', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                                    {selectedRequest.reason || 'No reason provided.'}
                                </div>
                            </div>

                            {replyTarget && (
                                <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #dbeafe', background: '#eff6ff', color: '#1e3a8a', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                    <span>
                                        Replying to {replyTarget.commenter_name || 'User'}: &quot;{replyTarget.comment_text}&quot;
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setReplyTarget(null)}
                                        style={{ border: 'none', background: 'transparent', color: '#1e3a8a', cursor: 'pointer', fontWeight: 700 }}
                                    >
                                        Clear
                                    </button>
                                </div>
                            )}

                            <div style={{ display: 'grid', gap: 8 }}>
                                <textarea
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    placeholder="Write a comment or reply..."
                                    style={{ ...inputStyle, minHeight: 76 }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        onClick={() => void submitComment()}
                                        disabled={commentSaving || !commentText.trim()}
                                        style={{ ...actionButton('#1e3a8a'), opacity: commentSaving || !commentText.trim() ? 0.7 : 1, cursor: commentSaving || !commentText.trim() ? 'not-allowed' : 'pointer' }}
                                    >
                                        {commentSaving ? 'Posting...' : 'Post Comment'}
                                    </button>
                                </div>
                            </div>

                            <div style={{ marginTop: 12, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                                {commentsLoading ? (
                                    <div style={{ color: '#64748b', fontSize: 13 }}>Loading comments...</div>
                                ) : comments.length === 0 ? (
                                    <div style={{ color: '#64748b', fontSize: 13 }}>No comments yet.</div>
                                ) : (
                                    <div style={{ display: 'grid', gap: 8 }}>
                                        {comments.map((comment) => (
                                            <div key={comment.comment_id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '9px 10px', background: comment.parent_comment_id ? '#f8fafc' : '#fff' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                        <strong style={{ color: '#0f172a', fontSize: 13 }}>{comment.commenter_name || 'User'}</strong>
                                                        <span style={{ fontSize: 11, color: '#64748b', textTransform: 'capitalize' }}>{comment.commenter_role || '-'}</span>
                                                        {comment.parent_comment_id && (
                                                            <span style={{ fontSize: 11, color: '#2563eb' }}>Reply</span>
                                                        )}
                                                    </div>
                                                    <span style={{ fontSize: 11, color: '#64748b' }}>
                                                        {comment.created_at ? new Date(comment.created_at).toLocaleString() : '-'}
                                                    </span>
                                                </div>
                                                <div style={{ color: '#334155', fontSize: 13, whiteSpace: 'pre-wrap' }}>{comment.comment_text}</div>
                                                <div style={{ marginTop: 7 }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setReplyTarget(comment)}
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
                    </div>
                )}

                <Pagination
                    currentPage={currentPage}
                    totalItems={rows.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                    label="leave requests"
                />
            </div>
        </Layout>
    );
}

const labelStyle: CSSProperties = {
    display: 'block',
    marginBottom: 4,
    fontSize: 12,
    color: '#475569',
    fontWeight: 700,
};

const inputStyle: CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    background: '#fff',
    color: '#1f2937',
};

const toolbarSelectStyle: CSSProperties = {
    ...inputStyle,
    width: 'auto',
    minWidth: 140,
};

const thStyle: CSSProperties = {
    padding: '12px 14px',
    textAlign: 'left',
    color: '#475569',
    fontSize: 13,
    fontWeight: 700,
};

const tdStyle: CSSProperties = {
    padding: '12px 14px',
    color: '#334155',
    fontSize: 13,
};

const modalOverlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.45)',
    zIndex: 1950,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
};

const modalSquareStyle: CSSProperties = {
    width: 'min(560px, 96vw)',
    minHeight: 320,
    maxHeight: '85vh',
    overflowY: 'auto',
    background: '#ffffff',
    border: '1px solid #dbe3ef',
    borderRadius: 'var(--modal-radius)',
    padding: 14,
    boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)',
};

const commentModalStyle: CSSProperties = {
    width: 'min(980px, 96vw)',
    minHeight: 320,
    maxHeight: '85vh',
    overflowY: 'auto',
    background: '#ffffff',
    border: '1px solid #dbe3ef',
    borderRadius: 'var(--modal-radius)',
    padding: 14,
    boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)',
};

const modalHeaderStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
};

function floatingNewRequestButton(enabled: boolean): CSSProperties {
    return {
        minHeight: 34,
        borderRadius: 8,
        border: 'none',
        background: enabled ? '#1e3a8a' : '#94a3b8',
        color: '#ffffff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: enabled ? 'pointer' : 'not-allowed',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.16)',
        gap: 6,
        padding: '0 12px',
    };
}

function statusPill(status: string): CSSProperties {
    const key = String(status).toLowerCase();
    if (key === 'approved') return { background: '#dcfce7', color: '#166534', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, textTransform: 'capitalize' };
    if (key === 'rejected') return { background: '#fee2e2', color: '#b91c1c', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, textTransform: 'capitalize' };
    if (key === 'cancelled') return { background: '#e5e7eb', color: '#4b5563', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, textTransform: 'capitalize' };
    return { background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, textTransform: 'capitalize' };
}

function statusLabel(status: string) {
    return String(status || 'pending').replace('_', ' ');
}

function iconActionButton(background: string): CSSProperties {
    return {
        background,
        color: '#fff',
        border: 'none',
        borderRadius: 7,
        width: 32,
        height: 32,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
    };
}

function listActionButton(background: string): CSSProperties {
    return {
        background,
        color: '#fff',
        border: 'none',
        borderRadius: 7,
        minHeight: 32,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '0 10px',
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: 'nowrap',
    };
}

function actionButton(background: string): CSSProperties {
    return {
        background,
        color: '#fff',
        border: 'none',
        borderRadius: 7,
        padding: '6px 10px',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
    };
}

function truncateText(value: string, max: number) {
    const text = String(value || '').trim();
    if (text.length <= max) return text || '-';
    return `${text.slice(0, Math.max(0, max - 3))}...`;
}
