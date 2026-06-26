import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import ExpandIconButton from '@/components/ExpandIconButton';
import FloatingListPanel from '@/components/FloatingListPanel';
import Layout from '../../components/Layout';
import Pagination from '../../components/Pagination';
import CrudActionIcon from '../../components/CrudActionIcon';
import { notifyError, promptAction, showLoadingModal, closeLoadingModal } from '@/utils/notify';
import { getApiBaseUrl, resolveBackendAssetUrl } from '@/utils/network';

type ProjectAttachmentRow = {
    comment_id: number;
    task_id: number;
    task_title: string;
    attachment_name?: string | null;
    attachment_path?: string | null;
    attachment_mime?: string | null;
    attachment_size?: number | null;
    attachment_archived?: number | boolean;
    commenter_name?: string | null;
    created_at?: string | null;
};

const PROJECT_DETAIL_PREVIEW_LIMIT = 3;
const PROJECT_DETAIL_EXPANDED_PAGE_SIZE = 8;

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

function formatAttachmentSize(bytes: number | null | undefined) {
    const value = Number(bytes || 0);
    if (value <= 0) return '';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectDetails() {
    const router = useRouter();
    const API_BASE = getApiBaseUrl();
    const ITEMS_PER_PAGE = 10;
    const { id } = router.query;

    const [user, setUser] = useState<any>(null);
    const [project, setProject] = useState<any>(null);
    const [tasks, setTasks] = useState<any[]>([]);
    const [staff, setStaff] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [taskSearch, setTaskSearch] = useState('');
    const [taskStatusFilter, setTaskStatusFilter] = useState('all');
    const [taskDeadlineFilter, setTaskDeadlineFilter] = useState('all');
    const [projectAttachments, setProjectAttachments] = useState<ProjectAttachmentRow[]>([]);
    const [attachmentsLoading, setAttachmentsLoading] = useState(false);

    const defaultTaskForm = { title: '', description: '', assigned_to: '', priority: 'medium', due_date: '' };
    const defaultEditTaskForm = { title: '', description: '', assigned_to: '', priority: 'medium', due_date: '', status: 'pending' };
    const defaultCollaboratorForm = { user_id: '', shift_mode: 'none', shift_start: '', shift_end: '' };

    // Add / Edit Task Modal
    const [showAddTask, setShowAddTask] = useState(false);
    const [showEditTask, setShowEditTask] = useState(false);
    const [taskForm, setTaskForm] = useState(defaultTaskForm);
    const [editTaskForm, setEditTaskForm] = useState(defaultEditTaskForm);
    const [editCollaborators, setEditCollaborators] = useState<any[]>([]);
    const [initialEditCollaborators, setInitialEditCollaborators] = useState<any[]>([]);
    const [taskError, setTaskError] = useState('');
    const [editTaskError, setEditTaskError] = useState('');

    // Delete Task Confirm
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [taskToDelete, setTaskToDelete] = useState<any>(null);
    const [taskToEdit, setTaskToEdit] = useState<any>(null);
    const [sendingReportTaskId, setSendingReportTaskId] = useState<number | null>(null);
    const [sendingProjectReportKind, setSendingProjectReportKind] = useState<string | null>(null);

    const [messages, setMessages] = useState<any[]>([]);
    const [expandedProjectList, setExpandedProjectList] = useState<'updates' | 'files' | null>(null);
    const [expandedProjectListPage, setExpandedProjectListPage] = useState(1);
    const [selectedTask, setSelectedTask] = useState<any | null>(null);

    useEffect(() => {
        if (!taskError) return;
        void notifyError(taskError);
        setTaskError('');
    }, [taskError]);

    useEffect(() => {
        if (!editTaskError) return;
        void notifyError(editTaskError);
        setEditTaskError('');
    }, [editTaskError]);

    const isManager = user?.role === 'admin' || user?.role === 'manager';
    const isTaskCollaborator = (task: any, targetUserId: any) => {
        if (!task || !targetUserId) return false;
        const collaborators = Array.isArray(task.collaborators) ? task.collaborators : [];
        return collaborators.some((collab: any) => String(collab?.user_id) === String(targetUserId));
    };
    const hasAccess = isManager || tasks.some((t: any) =>
        String(t.assigned_to) === String(user?.id) || isTaskCollaborator(t, user?.id)
    );

    const toDateTimeLocalValue = (value: any) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 16);
    };

    const currentDateTimeLocalValue = () => {
        const now = new Date();
        const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 16);
    };

    const formatCollaboratorShift = (collab: any) => {
        if (!collab) return '';
        const mode = String(collab.shift_mode || 'none');
        if (mode === 'current_time' && collab.shift_start) {
            const start = new Date(collab.shift_start);
            if (!Number.isNaN(start.getTime())) {
                return `starts ${start.toLocaleString()}`;
            }
        }
        if (mode === 'range' && collab.shift_start && collab.shift_end) {
            const start = new Date(collab.shift_start);
            const end = new Date(collab.shift_end);
            if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
                return `${start.toLocaleString()} - ${end.toLocaleString()}`;
            }
        }
        return '';
    };

    const getUserDisplayName = (u: any) => {
        if (!u) return 'Unassigned';
        if (u.full_name) return u.full_name;
        const full = `${u.first_name || ''} ${u.last_name || ''}`.trim();
        return full || u.username || u.email || 'Unknown User';
    };

    const normalizeUserRole = (u: any) => String(u?.role || '').trim().toLowerCase();
    const dedupeUsersById = (items: any[]) => items.filter((candidate: any, index: number, arr: any[]) => {
        return arr.findIndex((entry: any) => String(entry?.id) === String(candidate?.id)) === index;
    });
    const serializeCollaboratorDrafts = (items: any[]) => JSON.stringify(
        (Array.isArray(items) ? items : [])
            .map((collab: any) => ({
                user_id: String(collab?.user_id || '').trim(),
                shift_mode: String(collab?.shift_mode || 'none'),
                shift_start: String(collab?.shift_start || ''),
                shift_end: String(collab?.shift_end || ''),
            }))
            .filter((collab: any) => collab.user_id)
            .sort((a: any, b: any) => {
                if (a.user_id !== b.user_id) return a.user_id.localeCompare(b.user_id);
                if (a.shift_mode !== b.shift_mode) return a.shift_mode.localeCompare(b.shift_mode);
                if (a.shift_start !== b.shift_start) return a.shift_start.localeCompare(b.shift_start);
                return a.shift_end.localeCompare(b.shift_end);
            })
    );
    const viewerRole = String(user?.role || '').trim().toLowerCase();
    const viewerBranchId = Number(user?.branch_id || 0);
    const usersById = new Map((staff || []).map((u: any) => [String(u.id), u]));
    const admins = (staff || []).filter((u: any) => normalizeUserRole(u) === 'admin');
    const allStaffUsers = (staff || []).filter((u: any) => normalizeUserRole(u) === 'staff');
    const managers = (staff || []).filter((u: any) => normalizeUserRole(u) === 'manager');

    const managerFromUsers = managers.find((u: any) => String(u.id) === String(project?.manager_id));
    const managerAssigneeOption = managerFromUsers || (
        project?.manager_id
            ? { id: project.manager_id, full_name: project.manager_name || 'Assigned Manager', role: 'manager' }
            : null
    );

    const canAssignStaffInBranch = viewerRole === 'manager';
    const assignableStaffUsers = viewerRole === 'manager'
        ? allStaffUsers.filter((candidate: any) => viewerBranchId > 0 && Number(candidate?.branch_id || 0) === viewerBranchId)
        : [];
    const assignableUsers = dedupeUsersById(assignableStaffUsers);
    const resolveTaskAssigneeOptions = (selectedUserId?: string | number | null, fallbackLabel = '') => {
        const options = [...assignableUsers];
        const selectedKey = String(selectedUserId || '').trim();
        if (selectedKey && !options.some((candidate: any) => String(candidate?.id) === selectedKey)) {
            const legacyAssignee = usersById.get(selectedKey)
                || { id: selectedKey, full_name: fallbackLabel || `Current assignee #${selectedKey}`, role: 'staff' };
            options.unshift(legacyAssignee);
        }
        return dedupeUsersById(options);
    };
    const resolveCollaboratorStaffOptions = (selectedUserId?: string | number | null, fallbackLabel = '') => {
        const options = [...assignableStaffUsers];
        const selectedKey = String(selectedUserId || '').trim();
        if (selectedKey && !options.some((candidate: any) => String(candidate?.id) === selectedKey)) {
            const legacyCollaborator = usersById.get(selectedKey)
                || { id: selectedKey, full_name: fallbackLabel || `Current collaborator #${selectedKey}`, role: 'staff' };
            options.unshift(legacyCollaborator);
        }
        return dedupeUsersById(options);
    };

    const projectAssignedStaff = tasks.reduce((acc: any[], task: any) => {
        const appendUniqueStaff = (candidate: any) => {
            if (!candidate || candidate.role !== 'staff') return;
            if (acc.some((u) => String(u.id) === String(candidate.id))) return;
            acc.push(candidate);
        };

        if (task?.assigned_to) {
            const assigned = usersById.get(String(task.assigned_to));
            if (assigned) appendUniqueStaff(assigned);
        }

        const collaborators = Array.isArray(task?.collaborators) ? task.collaborators : [];
        collaborators.forEach((collab: any) => {
            const mapped = usersById.get(String(collab?.user_id));
            if (mapped) {
                appendUniqueStaff(mapped);
                return;
            }
            if (String(collab?.role || '').toLowerCase() === 'staff') {
                appendUniqueStaff({
                    id: collab.user_id,
                    full_name: collab.name || `User #${collab.user_id}`,
                    role: 'staff',
                });
            }
        });

        return acc;
    }, []);
    const fetchMessages = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/project_messages.php?project_id=${id}`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) setMessages(data.data || []);
        } catch (err) { console.error('Failed to fetch messages'); }
    }, [API_BASE, id]);

    useEffect(() => {
        if (!id || !hasAccess) return;
        void fetchMessages();
    }, [fetchMessages, hasAccess, id]);

    useEffect(() => {
        if (!hasAccess || tasks.length === 0) {
            setProjectAttachments([]);
            setAttachmentsLoading(false);
            return;
        }

        let active = true;

        const loadAttachments = async () => {
            setAttachmentsLoading(true);

            try {
                const results = await Promise.allSettled(
                    tasks.map(async (task: any) => {
                        const res = await fetch(`${API_BASE}/task-comments.php?task_id=${task.id}`, { credentials: 'include' });
                        const data = await res.json();
                        if (!data.success || !Array.isArray(data.data)) {
                            return [];
                        }

                        return data.data
                            .filter((comment: any) => comment?.attachment_path && Number(comment?.attachment_archived ?? 0) !== 1)
                            .map((comment: any) => ({
                                comment_id: Number(comment.comment_id || 0),
                                task_id: Number(task.id || 0),
                                task_title: String(task.title || `Task #${task.id}`),
                                attachment_name: comment.attachment_name || 'Attachment',
                                attachment_path: comment.attachment_path || '',
                                attachment_mime: comment.attachment_mime || '',
                                attachment_size: Number(comment.attachment_size || 0),
                                attachment_archived: Number(comment.attachment_archived || 0),
                                commenter_name: comment.commenter_name || '',
                                created_at: comment.created_at || '',
                            }));
                    })
                );

                if (!active) return;

                const nextAttachments = results
                    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
                    .sort((left, right) => {
                        const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
                        const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
                        return rightTime - leftTime;
                    });

                setProjectAttachments(nextAttachments);
            } catch (error) {
                if (active) {
                    console.error('Failed to load project attachments', error);
                    setProjectAttachments([]);
                }
            } finally {
                if (active) {
                    setAttachmentsLoading(false);
                }
            }
        };

        void loadAttachments();

        return () => {
            active = false;
        };
    }, [API_BASE, hasAccess, tasks]);

    const checkSession = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/auth.php`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                setUser(data.data);
            } else {
                router.push('/');
            }
        } catch (err) {
            router.push('/');
        }
    }, [API_BASE, router]);

    const fetchData = useCallback(async () => {
        try {
            const [projRes, tasksRes, staffRes] = await Promise.all([
                fetch(`${API_BASE}/projects.php?id=${id}`, { credentials: 'include' }),
                fetch(`${API_BASE}/tasks.php?project_id=${id}`, { credentials: 'include' }),
                fetch(`${API_BASE}/users.php`, { credentials: 'include' })
            ]);

            const projData = await projRes.json();
            const tasksData = await tasksRes.json();
            const staffData = await staffRes.json();

            if (projData.success) setProject(projData.data);
            if (tasksData.success) setTasks(tasksData.data);
            if (staffData.success) setStaff(staffData.data);

        } catch (err) { console.error('Failed to fetch data'); }
        finally { setLoading(false); }
    }, [API_BASE, id]);

    useEffect(() => {
        if (id) {
            void checkSession().then(() => fetchData());
        }
    }, [checkSession, fetchData, id]);

    const handleAssignTask = async (taskId: number, userId: string) => {
        try {
            const assignedTo = userId ? parseInt(userId) : null;
            const res = await fetch(`${API_BASE}/tasks.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: taskId, assigned_to: assignedTo })
            });
            const data = await res.json();
            if (data.success) {
                setTasks(prev => prev.map(t => t.id === taskId ? { ...t, assigned_to: userId } : t));
            } else {
                alert(data.message || 'Failed to assign task');
            }
        } catch (err) { alert('Error assigning task'); }
    };

    const handleStatusChange = async (taskId: number, status: string) => {
        try {
            const res = await fetch(`${API_BASE}/tasks.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: taskId, status })
            });
            const data = await res.json();
            if (data.success) {
                setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
            } else {
                alert(data.message || 'Failed to update status');
            }
        } catch (err) { alert('Error updating status'); }
    };

    const handleProofPreferenceChange = async (taskId: number, requireProof: boolean) => {
        try {
            const res = await fetch(`${API_BASE}/tasks.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: taskId, require_completion_proof: requireProof ? 1 : 0 })
            });
            const data = await res.json();
            if (data.success) {
                setTasks(prev => prev.map(t => t.id === taskId ? { ...t, require_completion_proof: requireProof ? 1 : 0 } : t));
            } else {
                alert(data.message || 'Failed to update proof preference');
            }
        } catch (err) { alert('Error updating proof preference'); }
    };

    const handleSendCompletionReport = async (task: any) => {
        if (!task || task.status !== 'completed') return;

        const isResend = Number(task.has_completion_report ?? 0) === 1;

        const defaultReport = `Task "${task.title}" for project "${project?.name || task.project_name || 'Project'}" has been completed successfully.`;
        const promptLabel = isResend
            ? 'Update and resend completion report for the client (optional):'
            : 'Enter completion report for the client (optional):';
        const reportBody = await promptAction({
            title: isResend ? 'Resend completion report' : 'Send completion report',
            text: `Review the client report for task "${task.title}".`,
            inputLabel: promptLabel,
            inputValue: defaultReport,
            confirmButtonText: isResend ? 'Resend report' : 'Send report',
            cancelButtonText: 'Cancel',
            icon: 'question',
        });
        if (reportBody === null) return;

        setSendingReportTaskId(task.id);
        try {
            const res = await fetch(`${API_BASE}/task-reports.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    task_id: task.id,
                    report_body: reportBody.trim()
                })
            });
            const data = await res.json();
            if (data.success) {
                alert(isResend ? 'Completion report resent to client successfully.' : 'Completion report sent to client successfully.');
                setTasks(prev => prev.map(t => t.id === task.id ? { ...t, has_completion_report: 1 } : t));
            } else {
                alert(data.message || 'Failed to send completion report.');
            }
        } catch (err) {
            alert('Error sending completion report.');
        } finally {
            setSendingReportTaskId(null);
        }
    };

    const handleSendProjectReport = async (reportKind: 'major_report') => {
        if (!project || !isManager) return;
        if (totalTasks <= 0 || completedTasks !== totalTasks) return;

        const reportReference = `LLB-PRJ-${String(project.id || 0).padStart(4, '0')}-FINAL`;
        const issueDate = new Date().toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        const completionSummary = `${completedTasks}/${totalTasks} tasks completed`;
        const isResend = Number(project.has_major_completion_report ?? 0) === 1;
        const reportLabel = 'final report';
        const defaultReport = [
            'FINAL PROJECT REPORT',
            `Reference No.: ${reportReference}`,
            `Issue Date: ${issueDate}`,
            `Project: ${project.name}`,
            `Client: ${project.client_name || 'Client'}`,
            `Completion Summary: ${completionSummary}`,
            '',
            'Executive Summary:',
            'We are pleased to formally confirm that all agreed deliverables and planned tasks under the above project have been completed successfully and in accordance with the approved scope of work.',
            '',
            'Project Status:',
            '- All required tasks have been completed.',
            '- Supporting outputs have been prepared for client review and turnover as applicable.',
            '- The engagement is ready for formal closeout.',
            '',
            'This final report serves as formal confirmation that the project has been successfully completed.',
            '',
            'Prepared by:',
            'LLB Accountants',
        ].join('\n');
        const promptLabel = isResend
            ? `Update and resend the ${reportLabel} for this project (optional):`
            : `Enter the ${reportLabel} for this completed project (optional):`;
        const reportBody = await promptAction({
            title: isResend
                ? `Resend ${reportLabel}`
                : `Send ${reportLabel}`,
            text: `Review the ${reportLabel} for project "${project.name}".`,
            inputLabel: promptLabel,
            inputValue: defaultReport,
            confirmButtonText: isResend ? `Resend ${reportLabel}` : `Send ${reportLabel}`,
            cancelButtonText: 'Cancel',
            icon: 'question',
            large: true, // Use large textarea for better editing
        });
        if (reportBody === null) return;

        setSendingProjectReportKind(reportKind);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);
        
        // Show loading notification with clock loader
        showLoadingModal(
            'Sending Report...',
            'Preparing the final report and sending email. This may take a moment...'
        );
        
        try {
            const res = await fetch(`${API_BASE}/task-reports.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                signal: controller.signal,
                body: JSON.stringify({
                    project_id: project.id,
                    report_kind: reportKind,
                    report_body: reportBody.trim(),
                })
            });
            clearTimeout(timeout);
            const data = await res.json();
            if (data.success) {
                closeLoadingModal();
                // Success notification will auto-show via the global fetch wrapper in notify.ts
                setProject((prev: any) => prev ? { ...prev, has_major_completion_report: 1 } : prev);
            } else {
                closeLoadingModal();
                notifyError(data.message || 'Failed to send project report.');
            }
        } catch (err: any) {
            clearTimeout(timeout);
            closeLoadingModal();
            if (err.name === 'AbortError') {
                notifyError('The request is taking longer than expected. The email may still be sent in the background. Please check shortly.');
            } else {
                notifyError('Error sending project report.');
            }
        } finally {
            setSendingProjectReportKind(null);
        }
    };

    // Add Task
    const handleAddTask = async (e: any) => {
        e.preventDefault();
        setTaskError('');
        if (!taskForm.title.trim()) { setTaskError('Task title is required'); return; }
        try {
            const payload: any = {
                title: taskForm.title,
                description: taskForm.description,
                project_id: id,
                priority: taskForm.priority,
            };
            if (canAssignStaffInBranch && taskForm.assigned_to) payload.assigned_to = parseInt(taskForm.assigned_to);
            if (taskForm.due_date) payload.due_date = taskForm.due_date;

            const res = await fetch(`${API_BASE}/tasks.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                setShowAddTask(false);
                setTaskForm({ ...defaultTaskForm });
                setTasks(prev => [...prev, data.data]);
            } else {
                setTaskError(data.message || 'Failed to create task');
            }
        } catch (err) { setTaskError('An error occurred'); }
    };

    const addEditCollaboratorRow = () => {
        setEditCollaborators((prev) => [...prev, { ...defaultCollaboratorForm }]);
    };

    const updateEditCollaboratorField = (index: number, patch: any) => {
        setEditCollaborators((prev) =>
            prev.map((item, currentIndex) => {
                if (currentIndex !== index) return item;
                const next = { ...item, ...patch };
                if (next.shift_mode === 'none') {
                    next.shift_start = '';
                    next.shift_end = '';
                } else if (next.shift_mode === 'current_time') {
                    next.shift_end = '';
                }
                return next;
            })
        );
    };

    const removeEditCollaboratorRow = (index: number) => {
        setEditCollaborators((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
    };

    const applyCurrentShiftToCollaboratorRow = (index: number) => {
        updateEditCollaboratorField(index, { shift_mode: 'current_time', shift_start: currentDateTimeLocalValue(), shift_end: '' });
    };

    const openEditTaskModal = (task: any) => {
        if (String(task?.status || '') === 'completed') {
            alert('This task is closed because it is completed. Change status first to reopen it.');
            return;
        }
        setTaskToEdit(task);
        setEditTaskError('');
        setEditTaskForm({
            title: task?.title || '',
            description: task?.description || '',
            assigned_to: task?.assigned_to ? String(task.assigned_to) : '',
            priority: task?.priority || 'medium',
            due_date: toDateTimeLocalValue(task?.due_date),
            status: task?.status || 'pending',
        });

        const collaborators = Array.isArray(task?.collaborators) ? task.collaborators : [];
        const mappedCollaborators = collaborators
            .filter((collab: any) => String(collab?.role || '').toLowerCase() === 'staff')
            .map((collab: any) => ({
                user_id: collab?.user_id ? String(collab.user_id) : '',
                name: collab?.name || usersById.get(String(collab?.user_id))?.full_name || `User #${collab?.user_id}`,
                shift_mode: collab?.shift_mode || 'none',
                shift_start: toDateTimeLocalValue(collab?.shift_start),
                shift_end: toDateTimeLocalValue(collab?.shift_end),
            }))
            .filter((collab: any) => collab.user_id !== String(task?.assigned_to || ''));

        setEditCollaborators(mappedCollaborators);
        setInitialEditCollaborators(mappedCollaborators);
        setShowEditTask(true);
    };

    const handleUpdateTask = async (e: any) => {
        e.preventDefault();
        if (!taskToEdit?.id) return;

        setEditTaskError('');
        if (!editTaskForm.title.trim()) {
            setEditTaskError('Task title is required');
            return;
        }

        const selectedAssignee = editTaskForm.assigned_to ? String(editTaskForm.assigned_to) : '';
        const collaboratorByUser = new Map<string, any>();
        const collaboratorsChanged = serializeCollaboratorDrafts(editCollaborators) !== serializeCollaboratorDrafts(initialEditCollaborators);

        for (const collaborator of editCollaborators) {
            const userId = String(collaborator?.user_id || '').trim();
            if (!userId) continue;
            if (userId === selectedAssignee) continue;
            if (collaboratorByUser.has(userId)) {
                setEditTaskError('Duplicate collaborator selected.');
                return;
            }

            const shiftMode = String(collaborator?.shift_mode || 'none');
            const normalized: any = {
                user_id: parseInt(userId, 10),
                shift_mode: shiftMode,
            };

            if (shiftMode === 'current_time') {
                normalized.shift_start = collaborator?.shift_start || currentDateTimeLocalValue();
            } else if (shiftMode === 'range') {
                if (!collaborator?.shift_start || !collaborator?.shift_end) {
                    setEditTaskError('Collaborator shift range requires both start and end datetime.');
                    return;
                }
                if (new Date(collaborator.shift_end).getTime() < new Date(collaborator.shift_start).getTime()) {
                    setEditTaskError('Collaborator shift end must be after start.');
                    return;
                }
                normalized.shift_start = collaborator.shift_start;
                normalized.shift_end = collaborator.shift_end;
            }

            collaboratorByUser.set(userId, normalized);
        }

        try {
            const originalAssignee = taskToEdit?.assigned_to ? String(taskToEdit.assigned_to) : '';
            const payload: any = {
                id: taskToEdit.id,
                title: editTaskForm.title,
                description: editTaskForm.description,
                priority: editTaskForm.priority,
                status: editTaskForm.status,
            };

            if (canAssignStaffInBranch && selectedAssignee !== originalAssignee) {
                payload.assigned_to = selectedAssignee ? parseInt(selectedAssignee, 10) : null;
            }

            if (collaboratorsChanged) {
                payload.collaborators = Array.from(collaboratorByUser.values());
            }

            if (editTaskForm.due_date) {
                payload.due_date = editTaskForm.due_date;
            }

            const res = await fetch(`${API_BASE}/tasks.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                setShowEditTask(false);
                setTaskToEdit(null);
                setEditTaskForm({ ...defaultEditTaskForm });
                setEditCollaborators([]);
                setInitialEditCollaborators([]);
                fetchData();
            } else {
                setEditTaskError(data.message || 'Failed to update task');
            }
        } catch (err) {
            setEditTaskError('An error occurred');
        }
    };

    // Archive Task
    const handleDeleteTask = async () => {
        if (!taskToDelete) return;
        try {
            const res = await fetch(`${API_BASE}/tasks.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: taskToDelete.id, status: 'cancelled' })
            });
            const data = await res.json();
            if (data.success) {
                fetchData();
            } else {
                alert(data.message || 'Failed to archive task');
            }
        } catch (err) { alert('Error archiving task'); }
        finally {
            setShowDeleteConfirm(false);
            setTaskToDelete(null);
        }
    };

    // Progress calculation
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const totalTasks = tasks.length;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const allProjectTasksCompleted = totalTasks > 0 && completedTasks === totalTasks;
    const hasMajorProjectReport = Number(project?.has_major_completion_report ?? 0) === 1;
    const filteredTasks = useMemo(() => {
        const term = taskSearch.trim().toLowerCase();
        const todayKey = formatDateKey(new Date());

        return tasks.filter((task: any) => {
            if (taskStatusFilter !== 'all' && String(task?.status || '') !== taskStatusFilter) {
                return false;
            }

            if (taskDeadlineFilter !== 'all') {
                const dueKey = normalizeDateKey(task?.due_date);
                const taskIsOpen = isOpenTask(task?.status);
                if (taskDeadlineFilter === 'due_today' && (!taskIsOpen || dueKey !== todayKey)) {
                    return false;
                }
                if (taskDeadlineFilter === 'overdue' && (!taskIsOpen || !dueKey || dueKey >= todayKey)) {
                    return false;
                }
            }

            if (!term) {
                return true;
            }

            const haystack = [
                task?.title || '',
                task?.description || '',
                task?.status || '',
                task?.priority || '',
                task?.assigned_name || '',
            ].join(' ').toLowerCase();

            return haystack.includes(term);
        });
    }, [taskDeadlineFilter, taskSearch, taskStatusFilter, tasks]);
    const paginatedTasks = filteredTasks.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    const staffVisibleTasks = useMemo(() => (
        tasks.filter((task: any) => String(task?.assigned_to) === String(user?.id) || isTaskCollaborator(task, user?.id))
    ), [tasks, user?.id]);
    const visibleTaskCount = user?.role === 'staff' ? staffVisibleTasks.length : tasks.length;
    const visibleCompletedTaskCount = user?.role === 'staff'
        ? staffVisibleTasks.filter((task: any) => String(task?.status || '') === 'completed').length
        : completedTasks;
    const visibleProgressPercent = visibleTaskCount > 0 ? Math.round((visibleCompletedTaskCount / visibleTaskCount) * 100) : 0;
    const overdueTaskCount = useMemo(() => {
        const todayKey = formatDateKey(new Date());
        return tasks.filter((task: any) => {
            const dueKey = normalizeDateKey(task?.due_date);
            return !!dueKey && dueKey < todayKey && isOpenTask(task?.status);
        }).length;
    }, [tasks]);
    const nextDeadlineLabel = useMemo(() => {
        const upcomingTask = [...tasks]
            .filter((task: any) => {
                const dueKey = normalizeDateKey(task?.due_date);
                return !!dueKey && isOpenTask(task?.status);
            })
            .sort((left: any, right: any) => {
                const leftTime = left?.due_date ? new Date(left.due_date).getTime() : Number.MAX_SAFE_INTEGER;
                const rightTime = right?.due_date ? new Date(right.due_date).getTime() : Number.MAX_SAFE_INTEGER;
                return leftTime - rightTime;
            })[0];

        return upcomingTask?.due_date ? formatDateTime(upcomingTask.due_date, 'No upcoming deadline') : 'No upcoming deadline';
    }, [tasks]);
    const projectStatusPalette = useMemo(() => {
        if (project?.status === 'active') {
            return {
                background: 'rgba(34, 197, 94, 0.14)',
                color: '#166534',
                border: '1px solid rgba(34, 197, 94, 0.26)',
            };
        }
        if (project?.status === 'completed') {
            return {
                background: 'rgba(37, 99, 235, 0.14)',
                color: '#1d4ed8',
                border: '1px solid rgba(59, 130, 246, 0.26)',
            };
        }
        return {
            background: 'rgba(148, 163, 184, 0.14)',
            color: '#475569',
            border: '1px solid rgba(148, 163, 184, 0.24)',
        };
    }, [project?.status]);
    const sortedMessages = useMemo(() => (
        [...messages]
            .sort((left, right) => {
                const leftTime = left?.created_at ? new Date(left.created_at).getTime() : 0;
                const rightTime = right?.created_at ? new Date(right.created_at).getTime() : 0;
                return rightTime - leftTime;
            })
    ), [messages]);
    const latestMessages = useMemo(() => sortedMessages.slice(0, PROJECT_DETAIL_PREVIEW_LIMIT), [sortedMessages]);
    const recentAttachments = useMemo(() => projectAttachments.slice(0, PROJECT_DETAIL_PREVIEW_LIMIT), [projectAttachments]);
    const paginatedExpandedMessages = useMemo(() => {
        const startIndex = (expandedProjectListPage - 1) * PROJECT_DETAIL_EXPANDED_PAGE_SIZE;
        return sortedMessages.slice(startIndex, startIndex + PROJECT_DETAIL_EXPANDED_PAGE_SIZE);
    }, [expandedProjectListPage, sortedMessages]);
    const paginatedExpandedAttachments = useMemo(() => {
        const startIndex = (expandedProjectListPage - 1) * PROJECT_DETAIL_EXPANDED_PAGE_SIZE;
        return projectAttachments.slice(startIndex, startIndex + PROJECT_DETAIL_EXPANDED_PAGE_SIZE);
    }, [expandedProjectListPage, projectAttachments]);

    const getStatusStyles = (status: string) => {
        if (status === 'completed') return { background: '#dcfce7', color: '#15803d' };
        if (status === 'in_progress') return { background: '#e0f2fe', color: '#0369a1' };
        if (status === 'cancelled') return { background: '#fee2e2', color: '#b91c1c' };
        return { background: '#f1f5f9', color: '#64748b' };
    };

    const getPriorityStyles = (priority: string) => {
        if (priority === 'high') return { background: '#fee2e2', color: '#dc2626' };
        if (priority === 'medium') return { background: '#fef3c7', color: '#d97706' };
        return { background: '#dcfce7', color: '#16a34a' };
    };

    const renderTaskDetailContent = (t: any) => {
        const assignedUser = t?.assigned_to ? usersById.get(String(t.assigned_to)) : null;
        const taskStaffAssignee = assignedUser?.role === 'staff' ? assignedUser : null;
        const taskCollaborators = Array.isArray(t?.collaborators) ? t.collaborators : [];
        const staffTaskCollaborators = taskCollaborators.filter((collab: any) =>
            String(collab?.role || '').toLowerCase() === 'staff' && String(collab?.user_id) !== String(t?.assigned_to || '')
        );
        const staffCollaboratorLabels = staffTaskCollaborators.map((collab: any) => {
            const display = collab?.name || usersById.get(String(collab?.user_id))?.full_name || `User #${collab?.user_id}`;
            const shift = formatCollaboratorShift(collab);
            return shift ? `${display} (${shift})` : display;
        });
        const managerCollaborator = assignedUser?.role === 'manager' ? assignedUser : managerAssigneeOption;
        const statusStyles = getStatusStyles(t.status);
        const priorityStyles = getPriorityStyles(t.priority || 'medium');
        const hasCompletionReport = Number(t.has_completion_report ?? 0) === 1;
        const requiresCompletionProof = Number(t.require_completion_proof ?? 0) === 1;
        const hasProofAttachment = projectAttachments.some((attachment) => Number(attachment.task_id || 0) === Number(t.id || 0) && Number(attachment.attachment_archived ?? 0) !== 1);
        const isTaskClosed = String(t.status) === 'completed';
        const currentUserIsCollaborator = isTaskCollaborator(t, user?.id);
        const canSendCompletionReport = isTaskClosed && (isManager || String(t.assigned_to) === String(user?.id) || currentUserIsCollaborator);
        const canMarkDone = String(t.assigned_to) === String(user?.id) || currentUserIsCollaborator;

        return (
            <div style={{ display: 'grid', gap: '14px', paddingTop: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>{t.title}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: 4 }}>Task #{t.id}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ padding: '5px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 'bold', ...statusStyles }}>
                            {t.status === 'in_progress' ? 'In Progress' : t.status}
                        </span>
                        <span style={{ padding: '5px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 'bold', ...priorityStyles }}>
                            {(t.priority || 'medium').toUpperCase()}
                        </span>
                    </div>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', padding: '14px 16px' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Description</div>
                    <div style={{ fontSize: '14px', color: '#334155', lineHeight: 1.65 }}>
                        {t.description || 'No description provided.'}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', padding: '14px 16px' }}>
                        <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Schedule</div>
                        <div style={{ fontSize: '14px', color: '#0f172a', fontWeight: 700 }}>
                            {formatDateTime(t.due_date, 'No due date')}
                        </div>
                    </div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', padding: '14px 16px' }}>
                        <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Client Report</div>
                        <div style={{ fontSize: '14px', color: hasCompletionReport ? '#15803d' : '#334155', fontWeight: 700 }}>
                            {hasCompletionReport
                                ? `Sent${t.completion_report_sent_at ? ` (${new Date(t.completion_report_sent_at).toLocaleString()})` : ''}`
                                : 'Not yet sent'}
                        </div>
                    </div>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', padding: '14px 16px' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Collaborators</div>
                    <div style={{ display: 'grid', gap: '6px' }}>
                        <div style={{ fontSize: '13px', color: '#334155' }}>
                            <strong>Admin:</strong>{' '}
                            {admins.length > 0 ? admins.map((a: any) => getUserDisplayName(a)).join(', ') : 'Not available in this view'}
                        </div>
                        <div style={{ fontSize: '13px', color: '#334155' }}>
                            <strong>Manager:</strong>{' '}
                            {managerCollaborator ? getUserDisplayName(managerCollaborator) : 'Unassigned'}
                        </div>
                        <div style={{ fontSize: '13px', color: '#334155' }}>
                            <strong>Staff assignee:</strong>{' '}
                            {taskStaffAssignee ? getUserDisplayName(taskStaffAssignee) : (assignedUser ? `${getUserDisplayName(assignedUser)} (${assignedUser.role})` : 'Unassigned')}
                        </div>
                        <div style={{ fontSize: '13px', color: '#334155' }}>
                            <strong>Staff collaborators:</strong>{' '}
                            {staffCollaboratorLabels.length > 0 ? staffCollaboratorLabels.join(', ') : 'None'}
                        </div>
                    </div>
                </div>

                {isManager ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                        {viewerRole === 'manager' ? (
                            <div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Assignee</div>
                                <select
                                    value={t.assigned_to || ''}
                                    onChange={(e) => handleAssignTask(t.id, e.target.value)}
                                    disabled={isTaskClosed}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', color: '#1f2937', backgroundColor: 'white' }}
                                >
                                    <option value="">Unassigned</option>
                                    {resolveTaskAssigneeOptions(t.assigned_to, t.assigned_name || '').map((candidate: any) => (
                                        <option key={candidate.id} value={candidate.id}>
                                            {getUserDisplayName(candidate)} (Staff)
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Assignment</div>
                                <div style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', color: '#475569', backgroundColor: '#f8fafc' }}>
                                    Admin can view assignees, but only the manager can assign branch staff.
                                </div>
                            </div>
                        )}
                        <div>
                            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Status</div>
                            <select
                                value={t.status}
                                onChange={(e) => handleStatusChange(t.id, e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', color: '#1f2937', backgroundColor: 'white' }}
                            >
                                <option value="pending">Pending</option>
                                <option value="in_progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                            {isTaskClosed ? (
                                <div style={{ marginTop: '6px', fontSize: '11px', color: '#b45309' }}>
                                    Task closed. Change status to reopen.
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', color: '#334155' }}>
                            <strong>Access:</strong>{' '}
                            {String(t.assigned_to) === String(user?.id)
                                ? 'Primary assignee'
                                : (currentUserIsCollaborator ? 'Collaborator' : (t.assigned_name || 'Unassigned'))}
                        </span>
                        <span style={{ fontSize: '12px', color: requiresCompletionProof ? '#b45309' : '#475569' }}>
                            <strong>Proof:</strong> {requiresCompletionProof ? (hasProofAttachment ? 'Required and uploaded' : 'Required') : 'Not required'}
                        </span>
                        {canMarkDone ? (
                            <>
                                <button
                                    onClick={() => handleProofPreferenceChange(t.id, true)}
                                    style={{ padding: '7px 12px', borderRadius: '8px', border: requiresCompletionProof ? '1px solid #1d4ed8' : '1px solid #cbd5e1', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: requiresCompletionProof ? '#dbeafe' : '#fff', color: requiresCompletionProof ? '#1d4ed8' : '#334155' }}
                                >
                                    Require Proof
                                </button>
                                <button
                                    onClick={() => handleProofPreferenceChange(t.id, false)}
                                    style={{ padding: '7px 12px', borderRadius: '8px', border: !requiresCompletionProof ? '1px solid #15803d' : '1px solid #cbd5e1', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: !requiresCompletionProof ? '#dcfce7' : '#fff', color: !requiresCompletionProof ? '#166534' : '#334155' }}
                                >
                                    No Proof
                                </button>
                                <button
                                    onClick={() => handleStatusChange(t.id, 'completed')}
                                    disabled={requiresCompletionProof && !hasProofAttachment}
                                    style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', cursor: requiresCompletionProof && !hasProofAttachment ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold', background: '#dcfce7', color: '#15803d', opacity: requiresCompletionProof && !hasProofAttachment ? 0.6 : 1 }}
                                >
                                    Complete Task
                                </button>
                            </>
                        ) : null}
                    </div>
                )}

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '13px', color: '#475569' }}>
                        Opened from the task list. Updates here apply immediately.
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {canSendCompletionReport ? (
                            <button
                                type="button"
                                onClick={() => handleSendCompletionReport(t)}
                                disabled={sendingReportTaskId === t.id}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    cursor: sendingReportTaskId === t.id ? 'not-allowed' : 'pointer',
                                    background: hasCompletionReport ? '#0f766e' : '#1e3a8a',
                                    color: 'white',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    opacity: sendingReportTaskId === t.id ? 0.7 : 1
                                }}
                            >
                                {sendingReportTaskId === t.id ? 'Sending...' : (hasCompletionReport ? 'Resend report' : 'Send report')}
                            </button>
                        ) : null}

                        {isManager && !isTaskClosed ? (
                            <>
                                <button
                                    onClick={() => openEditTaskModal(t)}
                                    title="Edit Task"
                                    aria-label={`Edit ${t.title}`}
                                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                >
                                    <CrudActionIcon action="edit" />
                                    Edit
                                </button>
                                <button
                                    onClick={() => { setTaskToDelete(t); setShowDeleteConfirm(true); }}
                                    title="Archive Task"
                                    aria-label={`Archive ${t.title}`}
                                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fff1f2', color: '#be123c', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                >
                                    <CrudActionIcon action="archive" />
                                    Archive
                                </button>
                            </>
                        ) : null}
                    </div>
                </div>
            </div>
        );
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [id, taskDeadlineFilter, taskSearch, taskStatusFilter]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(filteredTasks.length / ITEMS_PER_PAGE));
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [filteredTasks.length, currentPage]);

    useEffect(() => {
        setExpandedProjectListPage(1);
    }, [expandedProjectList]);

    const handleLogout = async () => {
        await fetch(`${API_BASE}/auth.php?action=logout`, { method: 'POST', credentials: 'include' });
        router.push('/');
    };

    if (loading) {

      return (

        <Layout role={String(user?.role || '')} user={user} onLogout={handleLogout}>

          <div style={{ padding: 20 }}>Loading...</div>

        </Layout>

      );

    }
    if (!project) return <div>Project not found</div>;

    return (
        <Layout role={user?.role} user={user} onLogout={handleLogout}>
            <Head>
                <title>{project.name} - Details</title>
            </Head>

            <div style={{ display: 'grid', gap: '18px', paddingBottom: '16px' }}>
                <button
                    onClick={() => router.push('/projects')}
                    style={{
                        justifySelf: 'flex-start',
                        background: '#ffffff',
                        border: '1px solid #dbe4f0',
                        borderRadius: '999px',
                        cursor: 'pointer',
                        color: '#334155',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '9px 14px',
                        fontSize: '12px',
                        fontWeight: 700,
                        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                    Back to Projects
                </button>

                <div
                    style={{
                        background: 'linear-gradient(135deg, #f8fbff 0%, #ffffff 44%, #eef6ff 100%)',
                        border: '1px solid #dbe7f5',
                        borderRadius: '24px',
                        boxShadow: '0 24px 60px rgba(15, 23, 42, 0.09)',
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: '18px',
                            padding: '24px',
                            alignItems: 'start',
                        }}
                    >
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                <span style={{ padding: '7px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', ...projectStatusPalette }}>
                                    {String(project.status || 'unknown')}
                                </span>
                                <span style={{ padding: '7px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, color: '#1d4ed8', background: 'rgba(37, 99, 235, 0.10)', border: '1px solid rgba(59, 130, 246, 0.18)' }}>
                                    Project Overview
                                </span>
                            </div>
                            <h1 style={{ margin: 0, fontSize: 'clamp(22px, 3.2vw, 32px)', color: '#0f172a', lineHeight: 1.08, letterSpacing: '-0.03em', wordBreak: 'break-word' }}>
                                {project.name}
                            </h1>
                            <p style={{ color: '#475569', margin: '14px 0 0', fontSize: '14px', lineHeight: 1.75, maxWidth: '780px' }}>
                                {project.description || 'No project description has been added yet.'}
                            </p>
                        </div>

                        <div
                            style={{
                                background: 'rgba(255,255,255,0.82)',
                                border: '1px solid rgba(219, 231, 245, 0.96)',
                                borderRadius: '20px',
                                padding: '18px',
                                boxShadow: '0 14px 30px rgba(15, 23, 42, 0.05)'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    Delivery Progress
                                </div>
                                <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>{progressPercent}%</div>
                            </div>
                            <div style={{ width: '100%', height: '9px', background: '#dbeafe', borderRadius: '999px', overflow: 'hidden' }}>
                                <div style={{
                                    width: `${progressPercent}%`,
                                    height: '100%',
                                    background: progressPercent === 100 ? 'linear-gradient(90deg, #16a34a 0%, #22c55e 100%)' : 'linear-gradient(90deg, #1d4ed8 0%, #38bdf8 100%)',
                                    borderRadius: '999px',
                                    transition: 'width 0.3s ease'
                                }} />
                            </div>
                            <div style={{ marginTop: '10px', fontSize: '13px', color: '#475569', lineHeight: 1.55 }}>
                                {completedTasks} of {totalTasks} tasks completed.
                            </div>
                            {isManager && allProjectTasksCompleted ? (
                                <button
                                    type="button"
                                    onClick={() => void handleSendProjectReport('major_report')}
                                    disabled={sendingProjectReportKind === 'major_report'}
                                    style={{
                                        marginTop: '16px',
                                        width: '100%',
                                        padding: '11px 14px',
                                        borderRadius: '12px',
                                        border: 'none',
                                        background: hasMajorProjectReport ? '#0f766e' : '#1e3a8a',
                                        color: 'white',
                                        cursor: sendingProjectReportKind === 'major_report' ? 'not-allowed' : 'pointer',
                                        fontWeight: 800,
                                        fontSize: '13px',
                                        opacity: sendingProjectReportKind === 'major_report' ? 0.7 : 1,
                                    }}
                                >
                                    {sendingProjectReportKind === 'major_report'
                                        ? 'Sending...'
                                        : (hasMajorProjectReport ? 'Resend final report' : 'Send final report')}
                                </button>
                            ) : null}
                        </div>
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                            gap: '12px',
                            padding: '0 24px 24px',
                        }}
                    >
                        <div style={{ background: 'rgba(255,255,255,0.78)', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '14px 16px' }}>
                            <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px', fontWeight: 800 }}>Client</div>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{project.client_name || 'Not assigned'}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.78)', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '14px 16px' }}>
                            <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px', fontWeight: 800 }}>Manager</div>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{project.manager_name || 'Unassigned'}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.78)', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '14px 16px' }}>
                            <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px', fontWeight: 800 }}>Start Date</div>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{formatDateTime(project.start_date)}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.78)', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '14px 16px' }}>
                            <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px', fontWeight: 800 }}>End Date</div>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{formatDateTime(project.end_date)}</div>
                        </div>
                        {isManager && allProjectTasksCompleted ? (
                            <div style={{ background: 'rgba(255,255,255,0.78)', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '14px 16px' }}>
                                <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px', fontWeight: 800 }}>Final Client Docs</div>
                                <div style={{ fontSize: '13px', color: '#0f172a', lineHeight: 1.6, fontWeight: 700 }}>
                                    {hasMajorProjectReport
                                        ? `Final report sent${project?.major_completion_report_sent_at ? ` on ${new Date(project.major_completion_report_sent_at).toLocaleString()}` : ''}`
                                        : 'Final report not yet sent'}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                <DetailStatCard
                    title={user?.role === 'staff' ? 'My Visible Tasks' : 'Project Tasks'}
                    value={visibleTaskCount}
                    detail={`${visibleCompletedTaskCount} completed • ${visibleProgressPercent}% progress`}
                    tone="primary"
                />
                <DetailStatCard
                    title="Next Deadline"
                    value={nextDeadlineLabel}
                    detail="Nearest open task due date"
                    tone="warning"
                />
                <DetailStatCard
                    title="Overdue Tasks"
                    value={overdueTaskCount}
                    detail="Open tasks past due date"
                    tone="danger"
                />
                <DetailStatCard
                    title="Recent Updates"
                    value={messages.length}
                    detail="Messages logged on this project"
                    tone="neutral"
                />
                <DetailStatCard
                    title="Project Files"
                    value={projectAttachments.length}
                    detail="Latest shared attachments"
                    tone="neutral"
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                <section style={{ background: 'white', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <div>
                            <h2 style={{ fontSize: '14px', color: '#2d3748', margin: 0 }}>Recent Updates</h2>
                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: 4 }}>Latest project updates and notes.</div>
                        </div>
                        <ExpandIconButton
                            label="Expand recent updates"
                            onClick={() => setExpandedProjectList('updates')}
                        />
                    </div>
                    {latestMessages.length === 0 ? (
                        <div style={{ border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '14px', color: '#64748b', fontSize: '13px' }}>
                            No project updates yet.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '10px' }}>
                            {latestMessages.map((message) => (
                                <div key={message.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: 6 }}>
                                        <strong style={{ fontSize: '13px', color: '#1f2937' }}>{message.sender_name || 'Project update'}</strong>
                                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                                            {message.created_at ? new Date(message.created_at).toLocaleString() : ''}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                                        {String(message?.message || message?.content || message?.body || message?.text || 'No message content.')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {sortedMessages.length > PROJECT_DETAIL_PREVIEW_LIMIT ? (
                        <div style={{ marginTop: 10, color: '#64748b', fontSize: '11px', fontWeight: 700, letterSpacing: '0.03em' }}>
                            Showing {PROJECT_DETAIL_PREVIEW_LIMIT} of {sortedMessages.length} updates.
                        </div>
                    ) : null}
                </section>

                <section style={{ background: 'white', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <div>
                            <h2 style={{ fontSize: '14px', color: '#2d3748', margin: 0 }}>Project Files</h2>
                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: 4 }}>Recent attachments shared through task discussions.</div>
                        </div>
                        <ExpandIconButton
                            label="Expand project files"
                            onClick={() => setExpandedProjectList('files')}
                        />
                    </div>
                    {attachmentsLoading ? (
                        <div style={{ border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '14px', color: '#64748b', fontSize: '13px' }}>
                            Loading project files...
                        </div>
                    ) : recentAttachments.length === 0 ? (
                        <div style={{ border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '14px', color: '#64748b', fontSize: '13px' }}>
                            No attachments have been shared on this project yet.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '10px' }}>
                            {recentAttachments.map((attachment) => (
                                <div key={`${attachment.comment_id}-${attachment.task_id}`} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: 6 }}>
                                        <strong style={{ fontSize: '13px', color: '#1f2937' }}>{attachment.attachment_name || 'Attachment'}</strong>
                                        <span style={{ fontSize: '11px', color: '#64748b' }}>{formatAttachmentSize(attachment.attachment_size)}</span>
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5 }}>
                                        Task: <strong>{attachment.task_title}</strong>
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: 4 }}>
                                        Shared by {attachment.commenter_name || 'Unknown user'}{attachment.created_at ? ` on ${new Date(attachment.created_at).toLocaleString()}` : ''}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => window.open(resolveBackendAssetUrl(attachment.attachment_path || ''), '_blank', 'noopener,noreferrer')}
                                        style={{ marginTop: 8, padding: '7px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#1d4ed8', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}
                                    >
                                        Open File
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {!attachmentsLoading && projectAttachments.length > PROJECT_DETAIL_PREVIEW_LIMIT ? (
                        <div style={{ marginTop: 10, color: '#64748b', fontSize: '11px', fontWeight: 700, letterSpacing: '0.03em' }}>
                            Showing {PROJECT_DETAIL_PREVIEW_LIMIT} of {projectAttachments.length} files.
                        </div>
                    ) : null}
                </section>
            </div>

            {/* Collaborators */}
            <div style={{ background: 'white', padding: '16px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '14px', color: '#2d3748', marginTop: 0, marginBottom: '10px' }}>Collaborators</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Admin</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {admins.length > 0 ? admins.map((admin: any) => (
                                <span key={admin.id} style={{ fontSize: '11px', padding: '3px 7px', borderRadius: '999px', background: '#dbeafe', color: '#1d4ed8', fontWeight: 'bold' }}>
                                    {getUserDisplayName(admin)}
                                </span>
                            )) : (
                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>No admin users available in this view.</span>
                            )}
                        </div>
                    </div>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Manager (1 Assignee)</div>
                        <div style={{ fontSize: '13px', color: '#2d3748', fontWeight: 'bold' }}>
                            {managerAssigneeOption ? getUserDisplayName(managerAssigneeOption) : (project.manager_name || 'Unassigned')}
                        </div>
                    </div>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Staff On Tasks</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {projectAssignedStaff.length > 0 ? projectAssignedStaff.map((member: any) => (
                                <span key={member.id} style={{ fontSize: '11px', padding: '3px 7px', borderRadius: '999px', background: '#ecfeff', color: '#0e7490', fontWeight: 'bold' }}>
                                    {getUserDisplayName(member)}
                                </span>
                            )) : (
                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>No staff assigned yet.</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Tasks Section */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '14px', color: '#2d3748', margin: 0 }}>
                        {user?.role === 'staff' ? 'My Task Cards' : 'Project Task Cards'}
                    </h2>
                    {isManager && (
                        <button
                            onClick={() => setShowAddTask(true)}
                            title="Add Task"
                            aria-label="Add Task"
                            style={{
                                padding: '8px 14px', background: '#1e3a8a', color: 'white',
                                border: 'none', borderRadius: '6px', cursor: 'pointer',
                                fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                        >
                            <CrudActionIcon action="create" size={14} />
                        </button>
                    )}
                </div>

                <div style={{ background: 'white', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '12px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <input
                            value={taskSearch}
                            onChange={(e) => setTaskSearch(e.target.value)}
                            placeholder="Search task title, assignee, or status..."
                            style={{ flex: '1 1 280px', minWidth: 220, padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                        />
                        <select value={taskStatusFilter} onChange={(e) => setTaskStatusFilter(e.target.value)} style={{ flex: '0 0 170px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}>
                            <option value="all">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                        <select value={taskDeadlineFilter} onChange={(e) => setTaskDeadlineFilter(e.target.value)} style={{ flex: '0 0 170px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff' }}>
                            <option value="all">All Deadlines</option>
                            <option value="due_today">Due Today</option>
                            <option value="overdue">Overdue</option>
                        </select>
                    </div>
                </div>

                {paginatedTasks.length === 0 ? (
                    <div style={{ background: 'white', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '22px', textAlign: 'center', color: '#718096', fontSize: '13px' }}>
                        {user?.role === 'staff' ? 'No tasks assigned or shared with you match the current filters.' : 'No tasks found for the current filters.'}
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '10px' }}>
                        {paginatedTasks.map((t: any) => {
                            const assignedUser = t?.assigned_to ? usersById.get(String(t.assigned_to)) : null;
                            const statusStyles = getStatusStyles(t.status);
                            const priorityStyles = getPriorityStyles(t.priority || 'medium');
                            const hasCompletionReport = Number(t.has_completion_report ?? 0) === 1;

                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setSelectedTask(t)}
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        background: 'white',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '12px',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                        padding: '14px 16px',
                                        display: 'grid',
                                        gap: '12px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.2fr) minmax(140px, 0.8fr) minmax(150px, 0.9fr) auto', gap: '12px', alignItems: 'center' }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1f2937', marginBottom: '4px' }}>{t.title}</div>
                                            <div style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {t.description || 'No description provided.'}
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#334155' }}>
                                            <div style={{ fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>Assignee</div>
                                            <div>{assignedUser ? getUserDisplayName(assignedUser) : 'Unassigned'}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 'bold', ...statusStyles }}>
                                                {t.status === 'in_progress' ? 'In Progress' : t.status}
                                            </span>
                                            <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 'bold', ...priorityStyles }}>
                                                {(t.priority || 'medium').toUpperCase()}
                                            </span>
                                        </div>
                                        <div style={{ textAlign: 'right', fontSize: '12px', color: '#475569' }}>
                                            <div>Due {formatDateTime(t.due_date)}</div>
                                            <div style={{ marginTop: '4px', color: hasCompletionReport ? '#15803d' : '#64748b', fontWeight: 700 }}>
                                                {hasCompletionReport ? 'Report sent' : 'No report yet'}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                                            Click to view task details and actions in a floating panel.
                                        </div>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8' }}>
                                            View details
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
                <Pagination
                    currentPage={currentPage}
                    totalItems={filteredTasks.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                    label="tasks"
                />
            </div>

            <FloatingListPanel
                open={expandedProjectList !== null}
                onClose={() => setExpandedProjectList(null)}
                title={expandedProjectList === 'files' ? 'Project Files' : 'Recent Updates'}
                description={
                    expandedProjectList === 'files'
                        ? `${projectAttachments.length} attachment${projectAttachments.length === 1 ? '' : 's'} shared through project tasks.`
                        : `${sortedMessages.length} project update${sortedMessages.length === 1 ? '' : 's'} captured on this project.`
                }
            >
                {expandedProjectList === 'files' ? (
                    attachmentsLoading ? (
                        <div style={{ padding: '12px 0', color: '#64748b', fontSize: '13px' }}>Loading project files...</div>
                    ) : projectAttachments.length === 0 ? (
                        <div style={{ padding: '12px 0', color: '#64748b', fontSize: '13px' }}>No attachments have been shared on this project yet.</div>
                    ) : (
                        <>
                            <div style={{ display: 'grid', gap: '12px' }}>
                                {paginatedExpandedAttachments.map((attachment) => (
                                    <div key={`expanded-${attachment.comment_id}-${attachment.task_id}`} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', background: '#f8fafc' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: 8 }}>
                                            <strong style={{ fontSize: '14px', color: '#1f2937' }}>{attachment.attachment_name || 'Attachment'}</strong>
                                            <span style={{ fontSize: '12px', color: '#64748b' }}>{formatAttachmentSize(attachment.attachment_size)}</span>
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.55 }}>
                                            Task: <strong>{attachment.task_title}</strong>
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: 6 }}>
                                            Shared by {attachment.commenter_name || 'Unknown user'}{attachment.created_at ? ` on ${new Date(attachment.created_at).toLocaleString()}` : ''}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => window.open(resolveBackendAssetUrl(attachment.attachment_path || ''), '_blank', 'noopener,noreferrer')}
                                            style={{ marginTop: 10, padding: '8px 12px', borderRadius: '9px', border: '1px solid #cbd5e1', background: '#fff', color: '#1d4ed8', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}
                                        >
                                            Open File
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <Pagination
                                currentPage={expandedProjectListPage}
                                totalItems={projectAttachments.length}
                                itemsPerPage={PROJECT_DETAIL_EXPANDED_PAGE_SIZE}
                                onPageChange={setExpandedProjectListPage}
                                label="files"
                            />
                        </>
                    )
                ) : (
                    sortedMessages.length === 0 ? (
                        <div style={{ padding: '12px 0', color: '#64748b', fontSize: '13px' }}>No project updates yet.</div>
                    ) : (
                        <>
                            <div style={{ display: 'grid', gap: '12px' }}>
                                {paginatedExpandedMessages.map((message) => (
                                    <div key={`expanded-message-${message.id}`} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', background: '#f8fafc' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: 8 }}>
                                            <strong style={{ fontSize: '14px', color: '#1f2937' }}>{message.sender_name || 'Project update'}</strong>
                                            <span style={{ fontSize: '12px', color: '#64748b' }}>
                                                {message.created_at ? new Date(message.created_at).toLocaleString() : ''}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                            {String(message?.message || message?.content || message?.body || message?.text || 'No message content.')}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Pagination
                                currentPage={expandedProjectListPage}
                                totalItems={sortedMessages.length}
                                itemsPerPage={PROJECT_DETAIL_EXPANDED_PAGE_SIZE}
                                onPageChange={setExpandedProjectListPage}
                                label="updates"
                            />
                        </>
                    )
                )}
            </FloatingListPanel>

            <FloatingListPanel
                open={selectedTask !== null}
                onClose={() => setSelectedTask(null)}
                title={selectedTask?.title || 'Task Details'}
                description={selectedTask ? `Task #${selectedTask.id}` : undefined}
                width="min(980px, 96vw)"
            >
                {selectedTask ? renderTaskDetailContent(selectedTask) : null}
            </FloatingListPanel>

            {/* Add Task Modal */}
            {showAddTask && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '500px', maxWidth: '90%' }}>
                        <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>Add New Task</h2>

                        <form onSubmit={handleAddTask}>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Task Title *</label>
                                <input
                                    type="text" value={taskForm.title}
                                    onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                                    required
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', color: '#000', backgroundColor: '#fff' }}
                                />
                            </div>

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Description</label>
                                <textarea
                                    value={taskForm.description}
                                    onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', minHeight: '70px', color: '#000', backgroundColor: '#fff' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>
                                        {viewerRole === 'manager' ? 'Assign To (Staff in Your Branch)' : 'Assignee'}
                                    </label>
                                    {canAssignStaffInBranch ? (
                                        <select
                                            value={taskForm.assigned_to}
                                            onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
                                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: 'white', color: '#333' }}
                                        >
                                            <option value="">-- Unassigned --</option>
                                            {resolveTaskAssigneeOptions(taskForm.assigned_to).map((candidate: any) => (
                                                <option key={candidate.id} value={candidate.id}>
                                                    {getUserDisplayName(candidate)} (Staff)
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div style={{ padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '13px' }}>
                                            Only the project manager can assign staff from their branch.
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Priority</label>
                                    <select
                                        value={taskForm.priority}
                                        onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: 'white', color: '#333' }}
                                    >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Due Date</label>
                                <input
                                    type="datetime-local" value={taskForm.due_date}
                                    onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', color: '#333', backgroundColor: 'white' }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => { setShowAddTask(false); setTaskError(''); setTaskForm({ ...defaultTaskForm }); }}
                                    style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', color: '#666' }}>Cancel</button>
                                <button type="submit"
                                    title="Create Task"
                                    aria-label="Create Task"
                                    style={{ padding: '10px 20px', background: '#1e3a8a', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'white', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                    Submit
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Task Modal */}
            {showEditTask && taskToEdit && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '640px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>Edit Task</h2>

                        <form onSubmit={handleUpdateTask}>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Task Title *</label>
                                <input
                                    type="text"
                                    value={editTaskForm.title}
                                    onChange={(e) => setEditTaskForm({ ...editTaskForm, title: e.target.value })}
                                    required
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', color: '#000', backgroundColor: '#fff' }}
                                />
                            </div>

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Description</label>
                                <textarea
                                    value={editTaskForm.description}
                                    onChange={(e) => setEditTaskForm({ ...editTaskForm, description: e.target.value })}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', minHeight: '70px', color: '#000', backgroundColor: '#fff' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Assignee</label>
                                    {canAssignStaffInBranch ? (
                                        <select
                                            value={editTaskForm.assigned_to}
                                            onChange={(e) => setEditTaskForm({ ...editTaskForm, assigned_to: e.target.value })}
                                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: 'white', color: '#333' }}
                                        >
                                            <option value="">-- Unassigned --</option>
                                            {resolveTaskAssigneeOptions(editTaskForm.assigned_to, taskToEdit?.assigned_name || '').map((candidate: any) => (
                                                <option key={candidate.id} value={candidate.id}>
                                                    {getUserDisplayName(candidate)} (Staff)
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div style={{ padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '13px' }}>
                                            Only the project manager can assign staff from their branch.
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Priority</label>
                                    <select
                                        value={editTaskForm.priority}
                                        onChange={(e) => setEditTaskForm({ ...editTaskForm, priority: e.target.value })}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: 'white', color: '#333' }}
                                    >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Status</label>
                                    <select
                                        value={editTaskForm.status}
                                        onChange={(e) => setEditTaskForm({ ...editTaskForm, status: e.target.value })}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: 'white', color: '#333' }}
                                    >
                                        <option value="pending">Pending</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="completed">Completed</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Due Date</label>
                                    <input
                                        type="datetime-local"
                                        value={editTaskForm.due_date}
                                        onChange={(e) => setEditTaskForm({ ...editTaskForm, due_date: e.target.value })}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', color: '#333', backgroundColor: 'white' }}
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '20px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>Additional Collaborators (Staff)</div>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>Add staff who can access this task and optionally set shift windows.</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={addEditCollaboratorRow}
                                        style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                                    >
                                        + Add collaborator
                                    </button>
                                </div>

                                {editCollaborators.length === 0 ? (
                                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>No additional collaborators.</div>
                                ) : (
                                    <div style={{ display: 'grid', gap: '10px' }}>
                                        {editCollaborators.map((collab: any, index: number) => (
                                            <div key={`${collab.user_id || 'new'}-${index}`} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white', padding: '10px' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px', alignItems: 'end', marginBottom: collab.shift_mode !== 'none' ? '8px' : 0 }}>
                                                    <div style={{ minWidth: 0 }}>
                                                        <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '12px' }}>Staff User</label>
                                                        <select
                                                            value={collab.user_id}
                                                            onChange={(e) => updateEditCollaboratorField(index, { user_id: e.target.value })}
                                                            style={{ width: '100%', minWidth: 0, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: 'white', color: '#333' }}
                                                        >
                                                            <option value="">-- Select staff --</option>
                                                            {resolveCollaboratorStaffOptions(collab.user_id, collab.name || '').map((candidate: any) => (
                                                                <option key={candidate.id} value={candidate.id}>
                                                                    {getUserDisplayName(candidate)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div style={{ minWidth: 0 }}>
                                                        <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '12px' }}>Shift</label>
                                                        <select
                                                            value={collab.shift_mode || 'none'}
                                                            onChange={(e) => updateEditCollaboratorField(index, { shift_mode: e.target.value })}
                                                            style={{ width: '100%', minWidth: 0, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: 'white', color: '#333' }}
                                                        >
                                                            <option value="none">No shift</option>
                                                            <option value="current_time">Current time</option>
                                                            <option value="range">Between dates</option>
                                                        </select>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => removeEditCollaboratorRow(index)}
                                                        style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff1f2', color: '#be123c', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', width: '100%', maxWidth: '120px', whiteSpace: 'nowrap' }}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>

                                                {collab.shift_mode === 'current_time' && (
                                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'end', flexWrap: 'wrap' }}>
                                                        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                                                            <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '12px' }}>Shift Start</label>
                                                            <input
                                                                type="datetime-local"
                                                                value={collab.shift_start}
                                                                onChange={(e) => updateEditCollaboratorField(index, { shift_start: e.target.value })}
                                                                style={{ width: '100%', minWidth: 0, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', color: '#333', backgroundColor: 'white' }}
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => applyCurrentShiftToCollaboratorRow(index)}
                                                            style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' }}
                                                        >
                                                            Set current
                                                        </button>
                                                    </div>
                                                )}

                                                {collab.shift_mode === 'range' && (
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px' }}>
                                                        <div style={{ minWidth: 0 }}>
                                                            <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '12px' }}>Shift Start</label>
                                                            <input
                                                                type="datetime-local"
                                                                value={collab.shift_start}
                                                                onChange={(e) => updateEditCollaboratorField(index, { shift_start: e.target.value })}
                                                                style={{ width: '100%', minWidth: 0, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', color: '#333', backgroundColor: 'white' }}
                                                            />
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '12px' }}>Shift End</label>
                                                            <input
                                                                type="datetime-local"
                                                                value={collab.shift_end}
                                                                onChange={(e) => updateEditCollaboratorField(index, { shift_end: e.target.value })}
                                                                style={{ width: '100%', minWidth: 0, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', color: '#333', backgroundColor: 'white' }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowEditTask(false);
                                        setTaskToEdit(null);
                                        setEditTaskError('');
                                        setEditTaskForm({ ...defaultEditTaskForm });
                                        setEditCollaborators([]);
                                        setInitialEditCollaborators([]);
                                    }}
                                    style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', color: '#666' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    title="Update Task"
                                    aria-label="Update Task"
                                    style={{ padding: '10px 20px', background: '#1e3a8a', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'white', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    Submit
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Archive Task Confirmation */}
            {showDeleteConfirm && taskToDelete && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
                    <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '400px', maxWidth: '90%', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>Archive Task?</h3>
                        <p style={{ margin: '0 0 20px 0', color: '#666' }}>
                            Are you sure you want to archive <strong>{taskToDelete.title}</strong>?
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                            <button onClick={() => { setShowDeleteConfirm(false); setTaskToDelete(null); }}
                                style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', color: '#666' }}>Cancel</button>
                            <button onClick={handleDeleteTask}
                                title="Archive"
                                aria-label="Archive task"
                                style={{ padding: '10px 20px', background: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'white', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CrudActionIcon action="archive" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </Layout>
    );
}

function DetailStatCard({
    title,
    value,
    detail,
    tone,
}: {
    title: string;
    value: string | number;
    detail: string;
    tone: 'neutral' | 'primary' | 'warning' | 'danger';
}) {
    const tones = {
        neutral: { background: '#f8fafc', border: '#e2e8f0', title: '#475569', value: '#0f172a' },
        primary: { background: '#eff6ff', border: '#bfdbfe', title: '#1d4ed8', value: '#1e3a8a' },
        warning: { background: '#fffbeb', border: '#fde68a', title: '#b45309', value: '#92400e' },
        danger: { background: '#fef2f2', border: '#fecaca', title: '#b91c1c', value: '#991b1b' },
    } as const;

    const palette = tones[tone];

    return (
        <div style={{ background: palette.background, border: `1px solid ${palette.border}`, borderRadius: '18px', padding: '16px', boxShadow: '0 12px 28px rgba(15, 23, 42, 0.04)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: palette.title }}>{title}</div>
            <div style={{ marginTop: 10, fontSize: '20px', fontWeight: 900, color: palette.value, lineHeight: 1.15 }}>{value}</div>
            <div style={{ marginTop: 8, fontSize: '12px', color: '#64748b', lineHeight: 1.55 }}>{detail}</div>
        </div>
    );
}
