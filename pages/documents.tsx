import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import CrudActionIcon from '../components/CrudActionIcon';
import { confirmAction, promptAction, showLoadingModal, closeLoadingModal, notifyError } from '@/utils/notify';
import { getApiBaseUrl } from '@/utils/network';

const API_BASE = getApiBaseUrl();

export default function DocumentsPage() {
    const router = useRouter();
    const ITEMS_PER_PAGE = 10;
    const [user, setUser] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'received' | 'submissions'>('received');
    const [loading, setLoading] = useState(true);

    // Data
    const [receivedDocs, setReceivedDocs] = useState<any[]>([]);
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [clients, setClients] = useState<any[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);

    // Task Integration Data
    const [tasks, setTasks] = useState<any[]>([]);

    // UI
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalData, setModalData] = useState<any>({});
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
    const [submitting, setSubmitting] = useState(false);
    const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [receivedPage, setReceivedPage] = useState(1);
    const [submissionsPage, setSubmissionsPage] = useState(1);

    type ClientService = {
        service_id: number;
        service_name: string;
    };

    useEffect(() => { checkSession(); }, []);

    const checkSession = async () => {
        try {
            const res = await fetch(`${API_BASE}/auth.php`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                setUser(data.data);
                fetchInitialData();
            } else {
                router.push('/');
            }
        } catch { router.push('/'); } finally { setLoading(false); }
    };

    const fetchInitialData = async () => {
        fetchReceived();
        fetchSubmissions();
        fetchClients();
        fetchEmployees();
    };

    const fetchReceived = async () => {
        try {
            const res = await fetch(`${API_BASE}/documents.php?action=list_received&search=${encodeURIComponent(search)}`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) setReceivedDocs(data.data || []);
        } catch { }
    };

    const fetchSubmissions = async () => {
        try {
            const res = await fetch(`${API_BASE}/documents.php?action=tracking_analytics`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) setSubmissions(data.data || []);
        } catch { }
    };

    const fetchClients = async () => {
        try {
            const res = await fetch(`${API_BASE}/clients.php`, { credentials: 'include' });
            const data = await res.json();
            setClients(data.data || []);
        } catch { }
    };

    const fetchEmployees = async () => {
        try {
            const res = await fetch(`${API_BASE}/employees.php`, { credentials: 'include' });
            const data = await res.json();
            setEmployees(data.data || []);
        } catch { }
    };

    // Task Integration Fetches
    const fetchTasksByClient = async (client_id: number) => {
        try {
            // Fetch tasks for client (spanning all projects)
            const res = await fetch(`${API_BASE}/tasks.php?client_id=${client_id}`, { credentials: 'include' });
            const data = await res.json();
            setTasks(data.data || []);
        } catch { setTasks([]); }
    };

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (activeTab === 'received') fetchReceived();
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    const getClientServices = (clientId: string | number | undefined | null): ClientService[] => {
        const cid = Number(clientId);
        if (!cid) return [];
        const client = clients.find(c => Number(c.client_id) === cid);
        return Array.isArray(client?.services) ? (client.services as ClientService[]) : [];
    };

    const handleOpenModal = (mode: 'create' | 'edit', item: any = {}) => {
        setModalMode(mode);
        const initialData = item.document_id
            ? item
            : { received_date: new Date().toISOString().split('T')[0], status: 'received' };

        setModalData(initialData);

        if (item.client_id) {
            fetchTasksByClient(item.client_id);
        } else {
            setTasks([]);
        }

        setIsModalOpen(true);
        setMsg(null);
    };

    const handleClientChange = (clientId: string) => {
        const cid = parseInt(clientId);
        const services = getClientServices(clientId);
        const defaultType = services.length > 0 ? services[0].service_name : '';
        setModalData((prev: Record<string, unknown>) => ({
            ...prev,
            client_id: clientId,
            task_id: null,
            document_type: defaultType
        }));
        if (cid) fetchTasksByClient(cid);
        else setTasks([]);
    };

    const handleTaskChange = (taskId: string) => {
        const tId = parseInt(taskId);
        const task = tasks.find(t => t.id === tId);
        setModalData((prev: Record<string, unknown>) => {
            const services = getClientServices(prev.client_id as string | number | undefined | null);
            const defaultType = services.length > 0 ? services[0].service_name : '';

            return {
                ...prev,
                task_id: taskId,
                document_name: task ? task.title : (prev.document_name as string | undefined),
                document_type: task && task.service_name ? task.service_name : ((prev.document_type as string | undefined) || defaultType)
            };
        });
    };

    const notifyTaskCalendarSync = () => {
        if (typeof window === 'undefined') return;
        const stamp = String(Date.now());
        try {
            localStorage.setItem('capstone_tasks_sync', stamp);
        } catch {
            // Ignore storage errors (private mode, quota, etc.)
        }
        window.dispatchEvent(new CustomEvent('capstone:tasks-sync', { detail: { source: 'documents', stamp } }));
    };

    const promptToSendLinkedTaskReport = async (taskId: number, clientId?: number | string | null, taskTitle?: string) => {
        if (!taskId) return;

        const linkedTask = tasks.find((entry) => Number(entry?.id) === Number(taskId));
        const linkedClient = clients.find((entry) => Number(entry?.client_id) === Number(clientId));
        const clientLabel = linkedClient?.client_name || 'this client';
        const isResend = Number(linkedTask?.has_completion_report ?? 0) === 1;

        const shouldSend = await confirmAction({
            title: isResend ? 'Resend completion report?' : 'Send completion report?',
            text: `Document saved successfully. Do you want to ${isResend ? 'resend' : 'send'} the completion report to ${clientLabel} now?`,
            confirmButtonText: isResend ? 'Resend report' : 'Send report',
            cancelButtonText: 'Later',
            icon: 'question',
        });
        if (!shouldSend) return;

        const reportDefault = `Task "${linkedTask?.title || taskTitle || 'Task'}" for client "${clientLabel}" has been completed successfully.`;
        const promptLabel = isResend
            ? 'Update and resend completion report for the client (optional):'
            : 'Enter completion report for the client (optional):';
        const reportBody = await promptAction({
            title: isResend ? 'Resend completion report' : 'Send completion report',
            text: `Review the message before sending it to ${clientLabel}.`,
            inputLabel: promptLabel,
            inputValue: reportDefault,
            confirmButtonText: isResend ? 'Resend report' : 'Send report',
            cancelButtonText: 'Cancel',
            icon: 'question',
            large: true, // Use large textarea for better editing
        });
        if (reportBody === null) return;

        // Show loading modal with clock loader
        showLoadingModal(
            'Sending Completion Report...',
            'Preparing and sending report to client. This may take a moment...'
        );

        try {
            const res = await fetch(`${API_BASE}/task-reports.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    task_id: taskId,
                    report_body: reportBody.trim(),
                }),
            });
            const data = await res.json();
            if (!data.success) {
                closeLoadingModal();
                notifyError(data.message || 'Failed to send completion report.');
                return;
            }
            closeLoadingModal();
            // Success notification auto-shown via global fetch wrapper
            if (clientId) {
                await fetchTasksByClient(Number(clientId));
            }
        } catch {
            closeLoadingModal();
            notifyError('Failed to send completion report.');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const action = modalMode === 'create' ? 'create_received' : 'update_received';

            const payload = modalMode === 'create'
                ? { ...modalData, status: 'received' }
                : modalData;

            const res = await fetch(`${API_BASE}/documents.php?action=${action}`, {
                method: modalMode === 'create' ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                setMsg('Saved successfully!');
                setIsModalOpen(false);
                setReceivedDocs(prev => {
                    if (modalMode === 'edit') {
                        return prev.map(doc => doc.document_id === modalData.document_id ? { ...doc, ...modalData } : doc);
                    }
                    return [{ ...modalData, status: 'received', document_id: Date.now() }, ...prev];
                });
                notifyTaskCalendarSync();

                const linkedTaskId = Number(payload.task_id || 0);
                if (modalMode === 'create' && linkedTaskId > 0) {
                    await promptToSendLinkedTaskReport(
                        linkedTaskId,
                        payload.client_id as number | string | null | undefined,
                        String(payload.document_name || '')
                    );
                }
            } else {
                alert(data.message || 'Error saving');
            }
        } catch { alert('Network error'); }
        setSubmitting(false);
    };

    const handleArchive = async (id: number) => {
        if (!(await confirmAction({
            title: 'Archive this document record?',
            text: 'This will hide it from active document lists.',
            confirmButtonText: 'Archive',
            icon: 'warning',
            danger: true
        }))) return;

        try {
            const res = await fetch(`${API_BASE}/documents.php?action=update_received`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ document_id: id, status: 'archived' })
            });
            const data = await res.json();
            if (data.success) {
                setReceivedDocs(prev => prev.filter(doc => doc.document_id !== id));
                notifyTaskCalendarSync();
            } else {
                alert(data.message || 'Failed to archive document');
            }
        } catch { }
    };

    const handleChangeReceivedStatus = async (documentId: number, status: string) => {
        setUpdatingStatusId(documentId);
        try {
            const res = await fetch(`${API_BASE}/documents.php?action=update_received`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ document_id: documentId, status })
            });
            const data = await res.json();
            if (data.success) {
                setReceivedDocs(prev =>
                    prev.map(doc => doc.document_id === documentId ? { ...doc, status } : doc)
                );
                notifyTaskCalendarSync();
            } else {
                alert(data.message || 'Failed to update status');
            }
        } catch {
            alert('Network error while updating status');
        } finally {
            setUpdatingStatusId(null);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'received': return '#3b82f6';
            case 'processing': return '#eab308';
            case 'completed': return '#22c55e';
            case 'archived': return '#64748b';
            case 'pending': return '#f97316';
            case 'submitted': return '#3b82f6';
            case 'accepted': return '#22c55e';
            case 'rejected': return '#ef4444';
            default: return '#64748b';
        }
    };

    const selectedClientServices = getClientServices(modalData.client_id);
    const paginatedReceivedDocs = receivedDocs.slice((receivedPage - 1) * ITEMS_PER_PAGE, receivedPage * ITEMS_PER_PAGE);
    const paginatedSubmissions = submissions.slice((submissionsPage - 1) * ITEMS_PER_PAGE, submissionsPage * ITEMS_PER_PAGE);

    useEffect(() => {
        if (activeTab === 'received') setReceivedPage(1);
        if (activeTab === 'submissions') setSubmissionsPage(1);
    }, [activeTab, search]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(receivedDocs.length / ITEMS_PER_PAGE));
        if (receivedPage > totalPages) setReceivedPage(totalPages);
    }, [receivedDocs.length, receivedPage]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(submissions.length / ITEMS_PER_PAGE));
        if (submissionsPage > totalPages) setSubmissionsPage(totalPages);
    }, [submissions.length, submissionsPage]);

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

    return (
        <Layout role={user?.role} user={user} onLogout={handleLogout}>
            <Head><title>Document Management</title></Head>
            <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
                <div className="pageHeaderInline" style={{ marginBottom: 20 }}>
                    <div className="pageHeaderText">
                        <h1 style={{ fontSize: 14, fontWeight: 'bold', margin: 0 }}>Document Management</h1>
                    </div>
                    <div className="pageInlineFilters">
                    {activeTab === 'received' && (
                        <input
                            type="text"
                            placeholder="Search documents or clients..."
                            value={search} onChange={e => setSearch(e.target.value)}
                            style={{ padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', width: 300 }}
                        />
                    )}
                    {activeTab === 'received' && (
                        <button
                            onClick={() => handleOpenModal('create')}
                            title="Add Document"
                            aria-label="Add Document"
                            style={{ background: '#1e3a8a', color: '#fff', padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600 }}
                        >
                            <CrudActionIcon action="create" />
                        </button>
                    )}
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20 }}>
                    <div
                        onClick={() => setActiveTab('received')}
                        style={{ padding: '10px 20px', cursor: 'pointer', borderBottom: activeTab === 'received' ? '2px solid #1e3a8a' : 'none', fontWeight: activeTab === 'received' ? 600 : 400, color: activeTab === 'received' ? '#1e3a8a' : '#64748b' }}
                    >
                        Received Documents
                    </div>
                    <div
                        onClick={() => setActiveTab('submissions')}
                        style={{ padding: '10px 20px', cursor: 'pointer', borderBottom: activeTab === 'submissions' ? '2px solid #1e3a8a' : 'none', fontWeight: activeTab === 'submissions' ? 600 : 400, color: activeTab === 'submissions' ? '#1e3a8a' : '#64748b' }}
                    >
                        Submissions Tracking
                    </div>
                </div>

                {/* Content */}
                {activeTab === 'received' && (
                    <>
                        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <tr>
                                        <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: '#64748b' }}>DOCUMENT</th>
                                        <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: '#64748b' }}>CLIENT</th>
                                        <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: '#64748b' }}>RECEIVED DATE</th>
                                        <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: '#64748b' }}>STATUS</th>
                                        <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: '#64748b' }}>LINKED TASK</th>
                                        <th style={{ padding: 14, textAlign: 'right', fontSize: 13, color: '#64748b' }}>ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {receivedDocs.length === 0 ? <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>No documents found.</td></tr> :
                                        paginatedReceivedDocs.map(doc => (
                                            <tr key={doc.document_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: 14 }}>
                                                    <div style={{ fontWeight: 600 }}>{doc.document_name}</div>
                                                    <div style={{ fontSize: 12, color: '#64748b' }}>{doc.document_type}</div>
                                                </td>
                                                <td style={{ padding: 14 }}>{doc.client_name || '-'}</td>
                                                <td style={{ padding: 14 }}>{doc.received_date}</td>
                                                <td style={{ padding: 14 }}>
                                                    <select
                                                        value={doc.status || 'received'}
                                                        disabled={updatingStatusId === doc.document_id}
                                                        onChange={e => handleChangeReceivedStatus(doc.document_id, e.target.value)}
                                                        style={{
                                                            width: '100%',
                                                            maxWidth: 150,
                                                            padding: '6px 8px',
                                                            borderRadius: 8,
                                                            border: '1px solid #e2e8f0',
                                                            background: '#fff',
                                                            color: getStatusColor(doc.status),
                                                            fontSize: 12,
                                                            fontWeight: 600,
                                                            textTransform: 'capitalize'
                                                        }}
                                                    >
                                                        <option value="received">Received</option>
                                                        <option value="processing">Processing</option>
                                                        <option value="completed">Completed</option>
                                                        <option value="archived">Archived</option>
                                                    </select>
                                                </td>
                                                <td style={{ padding: 14, fontSize: 13 }} title={doc.task_title}>
                                                    {doc.task_title ? (
                                                        <span style={{ color: '#059669', background: '#d1fae5', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                                                            ✓ {doc.task_title.length > 20 ? doc.task_title.substring(0, 20) + '...' : doc.task_title}
                                                        </span>
                                                    ) : <span style={{ color: '#94a3b8' }}>-</span>}
                                                </td>
                                                <td style={{ padding: 14, textAlign: 'right' }}>
                                                    <button onClick={() => handleOpenModal('edit', doc)} title="Edit" aria-label={`Edit ${doc.document_name}`} style={{ marginRight: 8, background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <CrudActionIcon action="edit" />
                                                    </button>
                                                    {doc.status !== 'archived' && (
                                                        <button onClick={() => handleArchive(doc.document_id)} title="Archive" aria-label={`Archive ${doc.document_name}`} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <CrudActionIcon action="archive" />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    }
                                </tbody>
                            </table>
                        </div>
                        <Pagination
                            currentPage={receivedPage}
                            totalItems={receivedDocs.length}
                            itemsPerPage={ITEMS_PER_PAGE}
                            onPageChange={setReceivedPage}
                            label="documents"
                        />
                    </>
                )}

                {activeTab === 'submissions' && (
                    <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <tr>
                                    <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: '#64748b' }}>CLIENT</th>
                                    <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: '#64748b' }}>TOTAL DOCUMENTS</th>
                                    <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: '#64748b' }}>RECEIVED</th>
                                    <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: '#64748b' }}>PROCESSING</th>
                                    <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: '#64748b' }}>COMPLETED</th>
                                    <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: '#64748b' }}>ARCHIVED</th>
                                    <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: '#64748b' }}>COMPLETION RATE</th>
                                    <th style={{ padding: 14, textAlign: 'left', fontSize: 13, color: '#64748b' }}>LAST RECEIVED</th>
                                </tr>
                            </thead>
                            <tbody>
                                {submissions.length === 0 ? <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>No tracking analytics found.</td></tr> :
                                    paginatedSubmissions.map(sub => (
                                        <tr key={sub.client_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: 14, fontWeight: 600 }}>{sub.client_name}</td>
                                            <td style={{ padding: 14 }}>{sub.total_documents}</td>
                                            <td style={{ padding: 14 }}>{sub.received_count}</td>
                                            <td style={{ padding: 14 }}>{sub.processing_count}</td>
                                            <td style={{ padding: 14 }}>{sub.completed_count}</td>
                                            <td style={{ padding: 14 }}>{sub.archived_count}</td>
                                            <td style={{ padding: 14 }}>
                                                <span style={{ background: '#eff6ff', color: '#1e3a8a', padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>
                                                    {sub.completion_rate}%
                                                </span>
                                            </td>
                                            <td style={{ padding: 14 }}>{sub.last_received_date || '-'}</td>
                                        </tr>
                                    ))
                                }
                            </tbody>
                        </table>
                        <Pagination
                            currentPage={submissionsPage}
                            totalItems={submissions.length}
                            itemsPerPage={ITEMS_PER_PAGE}
                            onPageChange={setSubmissionsPage}
                            label="submission summaries"
                        />
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && activeTab === 'received' && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                    <div style={{ background: '#fff', borderRadius: 'var(--modal-radius)', padding: 24, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 20 }}>
                            {modalMode === 'create' ? 'Add' : 'Edit'} Document
                        </h2>

                        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
                            {activeTab === 'received' ? (
                                <>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Client *</label>
                                        <select required value={modalData.client_id || ''} onChange={e => handleClientChange(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                            <option value="">-- Select Client --</option>
                                            {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.client_name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Select Task / Document Type</label>
                                        <select disabled={!modalData.client_id} value={modalData.task_id || ''} onChange={e => handleTaskChange(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', background: !modalData.client_id ? '#f1f5f9' : '#fff' }}>
                                            <option value="">-- Select Pending Task (Optional) --</option>
                                            {tasks.filter(t => t.status !== 'completed').map(t => (
                                                <option key={t.id} value={t.id}>
                                                    {t.title} ({t.project_name})
                                                </option>
                                            ))}
                                            <option value="" disabled>--- Completed Tasks ---</option>
                                            {tasks.filter(t => t.status === 'completed').map(t => (
                                                <option key={t.id} value={t.id} disabled>
                                                    {t.title} (Completed)
                                                </option>
                                            ))}
                                        </select>
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                            Selecting a task will auto-fill the document name and mark the task Completed.
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Document Name *</label>
                                        <input required type="text" value={modalData.document_name || ''} onChange={e => setModalData({ ...modalData, document_name: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Type *</label>
                                            <select
                                                required
                                                disabled={!modalData.client_id}
                                                value={modalData.document_type || ''}
                                                onChange={e => setModalData({ ...modalData, document_type: e.target.value })}
                                                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', background: !modalData.client_id ? '#f1f5f9' : '#fff' }}
                                            >
                                                <option value="">-- Select Service Type --</option>
                                                {selectedClientServices.map((s: ClientService) => (
                                                    <option key={s.service_id} value={s.service_name}>
                                                        {s.service_name}
                                                    </option>
                                                ))}
                                                {modalData.document_type && !selectedClientServices.some((s: ClientService) => s.service_name === modalData.document_type) && (
                                                    <option value={modalData.document_type}>{modalData.document_type}</option>
                                                )}
                                            </select>
                                            {modalData.client_id && selectedClientServices.length === 0 && (
                                                <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>
                                                    This client has no active service assigned yet.
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Received Date *</label>
                                            <input required type="date" value={modalData.received_date || ''} onChange={e => setModalData({ ...modalData, received_date: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>File Location / Path</label>
                                        <input type="text" value={modalData.file_path || ''} onChange={e => setModalData({ ...modalData, file_path: e.target.value })} placeholder="e.g., Cabinet A, Drawer 2 or URL" style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Document *</label>
                                        <select required disabled={modalMode === 'edit'} value={modalData.document_id || ''} onChange={e => setModalData({ ...modalData, document_id: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', background: modalMode === 'edit' ? '#f1f5f9' : '#fff' }}>
                                            <option value="">-- Select Document --</option>
                                            {receivedDocs.map(d => <option key={d.document_id} value={d.document_id}>{d.document_name}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Submission Date *</label>
                                            <input required type="date" value={modalData.submission_date || ''} onChange={e => setModalData({ ...modalData, submission_date: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Submitted By *</label>
                                            <select required value={modalData.submitted_by || ''} onChange={e => setModalData({ ...modalData, submitted_by: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                                <option value="">-- Employee --</option>
                                                {employees.map(emp => <option key={emp.employee_id} value={emp.employee_id}>{emp.first_name} {emp.last_name}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Status</label>
                                        <select value={modalData.status || 'pending'} onChange={e => setModalData({ ...modalData, status: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                            <option value="pending">Pending</option>
                                            <option value="submitted">Submitted</option>
                                            <option value="accepted">Accepted</option>
                                            <option value="rejected">Rejected</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Notes</label>
                                        <textarea value={modalData.notes || ''} onChange={e => setModalData({ ...modalData, notes: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                    </div>
                                </>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
                                <button type="button" onClick={() => setIsModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                <button type="submit" disabled={submitting} title="Save" aria-label="Save document" style={{ background: '#1e3a8a', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {submitting ? 'Saving...' : 'Submit'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
