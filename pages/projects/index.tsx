import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useProtectedPage } from '@/components/AuthProvider';
import Layout from '../../components/Layout';
import Pagination from '../../components/Pagination';
import CrudActionIcon from '../../components/CrudActionIcon';
import { notifyError, notifySuccess } from '@/utils/notify';
import { getApiBaseUrl } from '@/utils/network';

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

function toDateTimeLocalValue(value: unknown) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function formatDateTime(value: unknown) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
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

export default function Projects() {
    const router = useRouter();
    const { user, loading: authLoading, logout } = useProtectedPage();
    const API_BASE = getApiBaseUrl();
    const ITEMS_PER_PAGE = 10;
    const [projects, setProjects] = useState<any[]>([]);
    const [clients, setClients] = useState<any[]>([]);
    const [managers, setManagers] = useState<any[]>([]);
    const [allServices, setAllServices] = useState<any[]>([]);
    const [clientServices, setClientServices] = useState<any[]>([]); // Filtered for selected client
    const [selectedTasks, setSelectedTasks] = useState<number[]>([]); // Custom selection
    const [loading, setLoading] = useState(true);
    const [showArchiveView, setShowArchiveView] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [projectSearch, setProjectSearch] = useState('');
    const [projectStatusFilter, setProjectStatusFilter] = useState('all');
    const [deadlineFilter, setDeadlineFilter] = useState('all');
    const [personalTaskSummaryByProject, setPersonalTaskSummaryByProject] = useState<Record<number, { total: number; completed: number; overdue: number }>>({});

    // Add Task Form State
    const [showAddTask, setShowAddTask] = useState(false);
    const [newTaskServiceId, setNewTaskServiceId] = useState('');
    const [newTaskName, setNewTaskName] = useState('');

    // Modals
    const [showModal, setShowModal] = useState(false);
    const [editingProject, setEditingProject] = useState<any>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState<any>(null);
    const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
    const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
    const dropdownMenuRef = useRef<HTMLDivElement | null>(null);
    const actionButtonRefs = useRef<Record<number, HTMLButtonElement | null>>({});

    // Form Data
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        client_id: '',
        manager_id: '',
        status: 'active',
        start_date: '',
        end_date: ''
    });

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const getClientById = (clientId: string) => {
        return clients.find((client) => String(client.client_id) === String(clientId));
    };

    const getApplicableServicesForClient = (clientId: string, servicesSource = allServices) => {
        const client = getClientById(clientId);
        if (!client || !Array.isArray(client.services) || client.services.length === 0) {
            return [];
        }

        const clientServiceIds = client.services.map((service: any) => Number(service.service_id));
        return servicesSource.filter((service: any) => clientServiceIds.includes(Number(service.service_id)));
    };

    const buildGeneratedProjectName = (clientId: string, servicesSource = allServices) => {
        const client = getClientById(clientId);
        if (!client) return '';

        const applicableServices = getApplicableServicesForClient(clientId, servicesSource);
        const serviceNames = applicableServices
            .map((service: any) => String(service.service_name || '').trim())
            .filter(Boolean);

        if (serviceNames.length === 0) {
            return String(client.client_name || '').trim();
        }

        return `${String(client.client_name || '').trim()} - ${serviceNames.join(' / ')}`;
    };

    // Route data should load only after the shared auth state is ready.
    /* eslint-disable react-hooks/exhaustive-deps */
    useEffect(() => {
        if (!user?.id) {
            if (!authLoading) {
                setLoading(false);
            }
            return;
        }

        let active = true;

        const loadProjectsPage = async () => {
            setLoading(true);
            try {
                await Promise.all([fetchProjects(), fetchClients(), fetchManagers(), fetchServices(), fetchPersonalTaskSummary()]);
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        void loadProjectsPage();

        return () => {
            active = false;
        };
    }, [authLoading, user?.id]);
    /* eslint-enable react-hooks/exhaustive-deps */

    // Close dropdown on outside click/escape/viewport changes.
    useEffect(() => {
        const closeDropdown = () => {
            setActiveDropdown(null);
            setDropdownPosition(null);
        };

        const handleDocumentMouseDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;

            if (dropdownMenuRef.current?.contains(target)) return;

            const clickedToggle = Object.values(actionButtonRefs.current).some((buttonEl) => {
                return buttonEl?.contains(target) ?? false;
            });
            if (clickedToggle) return;

            closeDropdown();
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeDropdown();
            }
        };

        document.addEventListener('mousedown', handleDocumentMouseDown);
        document.addEventListener('keydown', handleEscape);
        window.addEventListener('resize', closeDropdown);
        window.addEventListener('scroll', closeDropdown, true);

        return () => {
            document.removeEventListener('mousedown', handleDocumentMouseDown);
            document.removeEventListener('keydown', handleEscape);
            window.removeEventListener('resize', closeDropdown);
            window.removeEventListener('scroll', closeDropdown, true);
        };
    }, []);

    useEffect(() => {
        if (!error) return;
        void notifyError(error);
        setError('');
    }, [error]);

    useEffect(() => {
        if (!success) return;
        void notifySuccess(success);
        setSuccess('');
    }, [success]);

    const fetchProjects = async () => {
        try {
            const res = await fetch(`${API_BASE}/projects.php`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) setProjects(data.data);
        } catch (err) { console.error('Failed to fetch projects'); }
    };

    const fetchClients = async () => {
        try {
            const res = await fetch(`${API_BASE}/clients.php`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) setClients(data.data);
        } catch (err) { console.error('Failed to fetch clients'); }
    };

    const fetchServices = async () => {
        try {
            const res = await fetch(`${API_BASE}/services.php?checklists=1`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) setAllServices(data.data);
        } catch (err) { console.error('Failed to fetch services'); }
    };

    const fetchManagers = async () => {
        try {
            // Fetch users with manager role for the dropdown
            const res = await fetch(`${API_BASE}/users.php?role=manager`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) setManagers(data.data);
        } catch (err) { console.error('Failed to fetch managers'); }
    };

    const fetchPersonalTaskSummary = async () => {
        const userId = Number(user?.id || 0);
        if (userId <= 0) {
            setPersonalTaskSummaryByProject({});
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/tasks.php?assigned_to=${userId}&include_collaborations=1`, { credentials: 'include' });
            const data = await res.json();
            if (!data.success || !Array.isArray(data.data)) {
                setPersonalTaskSummaryByProject({});
                return;
            }

            const todayKey = formatDateKey(new Date());
            const summary = data.data.reduce((acc: Record<number, { total: number; completed: number; overdue: number }>, task: any) => {
                const projectId = Number(task?.project_id || 0);
                if (projectId <= 0) return acc;

                if (!acc[projectId]) {
                    acc[projectId] = { total: 0, completed: 0, overdue: 0 };
                }

                acc[projectId].total += 1;
                if (String(task?.status || '') === 'completed') {
                    acc[projectId].completed += 1;
                }

                const dueKey = normalizeDateKey(task?.due_date);
                const normalizedStatus = String(task?.status || '').trim().toLowerCase();
                if (dueKey && normalizedStatus !== 'completed' && normalizedStatus !== 'cancelled' && dueKey < todayKey) {
                    acc[projectId].overdue += 1;
                }

                return acc;
            }, {});

            setPersonalTaskSummaryByProject(summary);
        } catch (err) {
            console.error('Failed to fetch personal project task summary');
            setPersonalTaskSummaryByProject({});
        }
    };

    const handleInputChange = (e: any) => {
        const { name, value } = e.target;
        const nextFormData = { ...formData, [name]: value };

        if (name === 'client_id') {
            updateClientServices(value);
            if (!editingProject) {
                nextFormData.name = buildGeneratedProjectName(value);
            }
        }

        setFormData(nextFormData);
    };

    const updateClientServices = (clientId: string) => {
        if (!clientId) {
            setClientServices([]);
            setSelectedTasks([]);
            return;
        }

        const applicableServices = getApplicableServicesForClient(clientId);
        if (applicableServices.length > 0) {
            setClientServices(applicableServices);

            // Default select ALL tasks from these services
            const allTaskIds: number[] = [];
            applicableServices.forEach(s => {
                if (s.checklists) {
                    s.checklists.forEach((cl: any) => allTaskIds.push(cl.checklist_id));
                }
            });
            setSelectedTasks(allTaskIds);
        } else {
            setClientServices([]);
            setSelectedTasks([]);
        }
    };

    const handleTaskToggle = (checklistId: number) => {
        setSelectedTasks(prev =>
            prev.includes(checklistId)
                ? prev.filter(id => id !== checklistId)
                : [...prev, checklistId]
        );
    };

    const handleAddTask = async () => {
        if (!newTaskServiceId || !newTaskName) return;

        try {
            const res = await fetch(`${API_BASE}/services.php?type=checklist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    service_id: newTaskServiceId,
                    task_name: newTaskName,
                    is_required: 1
                })
            });
            const data = await res.json();

            if (data.success) {
                // 1. Refresh global services
                const servicesRes = await fetch(`${API_BASE}/services.php?checklists=1`, { credentials: 'include' });
                const servicesData = await servicesRes.json();

                if (servicesData.success) {
                    const updatedServices = servicesData.data;
                    setAllServices(updatedServices);

                    // 2. Re-filter client services to show the new task
                    // Need to replicate updateClientServices logic but with new data
                    if (formData.client_id) {
                        const applicableServices = getApplicableServicesForClient(formData.client_id, updatedServices);
                        setClientServices(applicableServices);
                    }

                    // 3. Auto-select the new task
                    if (data.data && data.data.checklist_id) {
                        setSelectedTasks(prev => [...prev, data.data.checklist_id]);
                    }

                    // 4. Clear input for continuous adding
                    setNewTaskName('');
                    // setNewTaskServiceId(''); // Keep service selected for convenience? User asked for continuous add, usually implies same category. Let's keep it.
                }
            } else {
                alert(data.message || 'Failed to add task');
            }
        } catch (err) {
            console.error(err);
            alert('An error occurred');
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            client_id: '',
            manager_id: '',
            status: 'active',
            start_date: '',
            end_date: ''
        });
        setEditingProject(null);
        setClientServices([]);
        setSelectedTasks([]);
        setError('');
        setSuccess('');
    };

    const openAddModal = () => {
        resetForm();
        setShowModal(true);
    };

    const openEditModal = (p: any) => {
        setEditingProject(p);
        setFormData({
            name: p.name || '',
            description: p.description || '',
            client_id: p.client_id ? String(p.client_id) : '',
            manager_id: p.manager_id ? String(p.manager_id) : '',
            status: p.status || 'active',
            start_date: toDateTimeLocalValue(p.start_date),
            end_date: toDateTimeLocalValue(p.end_date)
        });
        setError('');
        setSuccess('');
        setShowModal(true);
        setActiveDropdown(null);
        setDropdownPosition(null);
    };

    useEffect(() => {
        if (editingProject || !formData.client_id) return;
        setFormData((prev) => ({
            ...prev,
            name: buildGeneratedProjectName(prev.client_id),
        }));
    }, [allServices, clients, editingProject, formData.client_id]);

    const handleSubmit = async (e: any) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        try {
            const isEdit = !!editingProject;
            const url = `${API_BASE}/projects.php`;
            const method = isEdit ? 'PUT' : 'POST';

            const payload = isEdit
                ? { ...formData, id: editingProject.id }
                : { ...formData, custom_tasks: selectedTasks }; // Send custom tasks only on create

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                setSuccess(isEdit ? 'Project updated successfully!' : 'Project created successfully!');
                setShowModal(false);
                resetForm();

                if (isEdit && editingProject) {
                    // Optimistic update for PUT
                    setProjects((prev) =>
                        (prev || []).map((p) =>
                            p.id === editingProject.id ? { ...p, ...payload } : p
                        )
                    );
                } else {
                    // Optimistic insert for POST
                    const newProject = {
                        id: Number(data?.data?.project_id || 0),
                        name: String(formData.name || '').trim(),
                        description: formData.description || '',
                        client_id: Number(formData.client_id || 0),
                        manager_id: Number(formData.manager_id || 0),
                        status: formData.status || 'active',
                        start_date: new Date().toISOString(),
                        end_date: formData.end_date,
                    };
                    setProjects((prev) => [newProject, ...(prev || [])]);
                }
            } else {
                setError(data.message || `Failed to ${isEdit ? 'update' : 'create'} project`);
            }
        } catch (err) {
            setError('An error occurred');
        }
    };

    const handleDeleteClick = (p: any) => {
        setProjectToDelete(p);
        setShowDeleteConfirm(true);
        setActiveDropdown(null);
        setDropdownPosition(null);
    };

    const handleDeleteConfirm = async () => {
        if (!projectToDelete) return;

        try {
            const url = `${API_BASE}/projects.php?id=${projectToDelete.id}`;
            const res = await fetch(url, {
                method: 'DELETE',
                credentials: 'include'
            });
            const data = await res.json();

            if (data.success) {
                setProjects((prev) =>
                    (prev || []).map((p) =>
                        p.id === projectToDelete.id ? { ...p, status: 'archived' } : p
                    )
                );
                setShowDeleteConfirm(false);
                setProjectToDelete(null);
            } else {
                alert(data.message || 'Failed to archive project');
            }
        } catch (err) {
            alert('An error occurred while archiving');
        }
    };

    const toggleDropdown = (e: React.MouseEvent, projectId: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeDropdown === projectId) {
            setActiveDropdown(null);
            setDropdownPosition(null);
            return;
        }

        const buttonRect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
        const menuWidth = 180;
        const viewportPadding = 8;
        const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
        const computedLeft = Math.min(Math.max(buttonRect.right - menuWidth, viewportPadding), maxLeft);

        setDropdownPosition({
            top: buttonRect.bottom + 6,
            left: computedLeft,
        });
        setActiveDropdown(projectId);
    };

    const handleRestore = async (projectId: number) => {
        try {
            const res = await fetch(`${API_BASE}/projects.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: projectId, status: 'active' })
            });
            const data = await res.json();
            if (data.success) {
                setProjects((prev) =>
                    (prev || []).map((p) =>
                        p.id === projectId ? { ...p, status: 'active' } : p
                    )
                );
            }
        } catch (err) { alert('Error restoring project'); }
    };

    const handleRestoreAll = async (archived: any[]) => {
        for (const p of archived) { await handleRestore(p.id); }
        setProjects((prev) =>
            (prev || []).map((p) =>
                archived.some((a) => a.id === p.id) ? { ...p, status: 'active' } : p
            )
        );
    };

    const handleArchiveAll = async () => {
        if (activeProjects.length === 0) {
            alert('No active projects available to archive.');
            return;
        }
        
        const confirmed = confirm(`This will archive ${activeProjects.length} project(s). Are you sure?`);
        if (!confirmed) return;

        for (const p of activeProjects) { 
            try {
                const res = await fetch(`${API_BASE}/projects.php?id=${p.id}`, { 
                    method: 'DELETE', 
                    credentials: 'include' 
                });
                const data = await res.json();
                if (data.success) {
                    // Continue with next project
                }
            } catch (err) { 
                console.error('Failed to archive project', p.id, err); 
            }
        }
        setProjects((prev) =>
            (prev || []).map((p) =>
                activeProjects.some((a) => a.id === p.id) ? { ...p, status: 'archived' } : p
            )
        );
    };

    const tableHeaderStyle = { padding: '12px 15px', textAlign: 'left' as const, borderBottom: '2px solid #e2e8f0', color: '#4a5568', fontWeight: 'bold' };
    const tableCellStyle = { padding: '12px 15px', borderBottom: '1px solid #e2e8f0', color: '#2d3748' };

    const activeProjects = projects.filter(p => p.status !== 'archived');
    const archivedProjects = projects.filter(p => p.status === 'archived');
    const visibleProjects = showArchiveView ? archivedProjects : activeProjects;
    const filteredProjects = useMemo(() => {
        const term = projectSearch.trim().toLowerCase();
        const todayKey = formatDateKey(new Date());
        const upcomingThreshold = new Date();
        upcomingThreshold.setDate(upcomingThreshold.getDate() + 7);
        const upcomingThresholdKey = formatDateKey(upcomingThreshold);

        return visibleProjects.filter((project: any) => {
            const normalizedStatus = String(project?.status || '').trim().toLowerCase();
            if (projectStatusFilter !== 'all' && normalizedStatus !== projectStatusFilter) {
                return false;
            }

            if (deadlineFilter !== 'all') {
                const deadlineKey = normalizeDateKey(project?.end_date);
                if (deadlineFilter === 'overdue' && (!deadlineKey || deadlineKey >= todayKey)) {
                    return false;
                }
                if (deadlineFilter === 'due_soon' && (!deadlineKey || deadlineKey < todayKey || deadlineKey > upcomingThresholdKey)) {
                    return false;
                }
            }

            if (!term) {
                return true;
            }

            const haystack = [
                project?.name || '',
                project?.description || '',
                project?.client_name || '',
                project?.manager_name || '',
                project?.status || '',
            ].join(' ').toLowerCase();

            return haystack.includes(term);
        });
    }, [deadlineFilter, projectSearch, projectStatusFilter, visibleProjects]);
    const paginatedProjects = filteredProjects.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const overviewStats = useMemo(() => {
        const todayKey = formatDateKey(new Date());
        const dueSoonThreshold = new Date();
        dueSoonThreshold.setDate(dueSoonThreshold.getDate() + 7);
        const dueSoonThresholdKey = formatDateKey(dueSoonThreshold);

        return filteredProjects.reduce(
            (acc, project: any) => {
                const deadlineKey = normalizeDateKey(project?.end_date);
                const projectId = Number(project?.id || 0);
                const personalSummary = personalTaskSummaryByProject[projectId] || { total: 0, completed: 0, overdue: 0 };

                acc.projects += 1;
                acc.myOpenTasks += Math.max(0, personalSummary.total - personalSummary.completed);
                acc.myOverdueTasks += personalSummary.overdue;

                if (deadlineKey) {
                    if (deadlineKey < todayKey) {
                        acc.overdueProjects += 1;
                    } else if (deadlineKey <= dueSoonThresholdKey) {
                        acc.dueSoonProjects += 1;
                    }
                }

                return acc;
            },
            { projects: 0, dueSoonProjects: 0, overdueProjects: 0, myOpenTasks: 0, myOverdueTasks: 0 }
        );
    }, [filteredProjects, personalTaskSummaryByProject]);

    useEffect(() => {
        setCurrentPage(1);
    }, [deadlineFilter, projectSearch, projectStatusFilter, showArchiveView]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(filteredProjects.length / ITEMS_PER_PAGE));
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [filteredProjects.length, currentPage]);

    if (authLoading || loading) {

      return (

        <Layout role={String(user?.role || '')} user={user} onLogout={logout}>

          <div style={{ padding: 20 }}>Loading...</div>

        </Layout>

      );

    }

    return (
        <Layout role={user?.role} user={user} onLogout={logout}>
            <Head>
                <title>{showArchiveView ? 'Archived Projects' : 'Project Management'}</title>
            </Head>

            <div className="pageHeaderInline" style={{ marginBottom: '14px' }}>
                <div className="pageHeaderText">
                    <h1 style={{ fontSize: '14px', fontWeight: 'bold', color: '#1a202c', margin: 0 }}>{showArchiveView ? 'Archived Projects' : 'Project Management'}</h1>
                </div>
                <div className="pageInlineFilters">
                    <input
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        placeholder="Search project, client, or manager..."
                        style={{ flex: '1 1 220px', minWidth: 220, padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                    />
                    <select value={projectStatusFilter} onChange={(e) => setProjectStatusFilter(e.target.value)} style={{ flex: '0 0 170px', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }}>
                        <option value="all">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                        <option value="on_hold">On Hold</option>
                        <option value="archived">Archived</option>
                    </select>
                    <select value={deadlineFilter} onChange={(e) => setDeadlineFilter(e.target.value)} style={{ flex: '0 0 180px', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }}>
                        <option value="all">All Deadlines</option>
                        <option value="due_soon">Due In 7 Days</option>
                        <option value="overdue">Overdue</option>
                    </select>
                    {!showArchiveView ? (
                        <>
                        <button className="app-action-btn" onClick={() => setShowArchiveView(true)}>{`Archive (${archivedProjects.length})`}</button>
                        {activeProjects.length > 0 && user?.role !== 'staff' && (
                            <button
                                className="app-action-btn app-action-btn-danger"
                                onClick={handleArchiveAll}
                                title="Archive All"
                                aria-label="Archive All projects"
                                style={{ padding: '10px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <CrudActionIcon action="archive" />
                                Archive All
                            </button>
                        )}
                        {user?.role !== 'staff' && (
                            <button
                                className="app-action-btn app-action-btn-primary"
                                onClick={openAddModal}
                                title="Add Project"
                                aria-label="Add Project"
                                style={{ padding: '10px 20px', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <CrudActionIcon action="create" size={18} />
                            </button>
                        )}
                        </>
                    ) : (
                        <>
                        <button className="app-action-btn app-action-btn-primary" onClick={() => setShowArchiveView(false)} style={{ padding: '10px 12px', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Back to Active</button>
                        {archivedProjects.length > 0 && (
                            <button className="app-action-btn app-action-btn-success" onClick={() => handleRestoreAll(archivedProjects)} title="Restore All" aria-label="Restore All projects" style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <CrudActionIcon action="restore" />
                            </button>
                        )}
                        </>
                    )}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                <SummaryCard label={showArchiveView ? 'Archived Projects' : 'Visible Projects'} value={overviewStats.projects} subtitle="After current filters" tone="neutral" />
                <SummaryCard label="Due Soon" value={overviewStats.dueSoonProjects} subtitle="Deadlines within 7 days" tone="warning" />
                <SummaryCard label="Project Deadlines Missed" value={overviewStats.overdueProjects} subtitle="Projects past their target date" tone="danger" />
                <SummaryCard label="My Open Tasks" value={overviewStats.myOpenTasks} subtitle="Assigned or shared across projects" tone="primary" />
                <SummaryCard label="My Overdue Tasks" value={overviewStats.myOverdueTasks} subtitle="Need attention first" tone="danger" />
            </div>

            {/* Projects Table */}
            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 1080, borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f8fafc' }}>
                        <tr>
                            <th style={tableHeaderStyle}>Project Name</th>
                            <th style={tableHeaderStyle}>Client</th>
                            <th style={tableHeaderStyle}>Manager</th>
                            <th style={tableHeaderStyle}>Status</th>
                            <th style={tableHeaderStyle}>Progress</th>
                            <th style={tableHeaderStyle}>My Tasks</th>
                            <th style={tableHeaderStyle}>Deadline</th>
                            <th style={{ ...tableHeaderStyle, textAlign: 'center', width: '60px' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredProjects.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: '#666' }}>{showArchiveView ? 'No archived projects match the current filters.' : 'No projects found for the current filters.'}</td>
                            </tr>
                        ) : paginatedProjects.map((p: any) => (
                            <tr key={p.id} style={{ transition: 'background-color 0.2s' }}>
                                <td style={tableCellStyle}>
                                    <div
                                        onClick={() => router.push(`/projects/detail?id=${p.id}`)}
                                        style={{ fontWeight: 'bold', cursor: 'pointer', color: '#1e3a8a' }}
                                    >
                                        {p.name}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
                                        {p.description ? `${String(p.description).substring(0, 60)}${String(p.description).length > 60 ? '...' : ''}` : 'No description provided.'}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 6 }}>
                                        Starts: {formatDateTime(p.start_date)}
                                    </div>
                                </td>
                                <td style={tableCellStyle}>{p.client_name || '-'}</td>
                                <td style={tableCellStyle}>{p.manager_name || '-'}</td>
                                <td style={tableCellStyle}>
                                    {(() => {
                                        if (showArchiveView) {
                                            return (
                                                <span style={{
                                                    padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold',
                                                    background: '#fee2e2', color: '#991b1b', textTransform: 'capitalize'
                                                }}>
                                                    Archived
                                                </span>
                                            );
                                        }
                                        const allDone = parseInt(p.task_count) > 0 && parseInt(p.task_count) === parseInt(p.completed_task_count);
                                        const displayStatus = allDone ? 'fulfilled' : (p.status || 'active');
                                        const badgeColors: Record<string, { bg: string; text: string }> = {
                                            fulfilled: { bg: '#fef3c7', text: '#92400e' },
                                            active: { bg: '#dcfce7', text: '#15803d' },
                                            completed: { bg: '#e0f2fe', text: '#0369a1' },
                                            on_hold: { bg: '#f1f5f9', text: '#64748b' },
                                        };
                                        const colors = badgeColors[displayStatus] || { bg: '#f1f5f9', text: '#64748b' };
                                        return (
                                            <span style={{
                                                padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold',
                                                background: colors.bg, color: colors.text, textTransform: 'capitalize'
                                            }}>
                                                {allDone ? '✦ Fulfilled' : (p.status || 'active')}
                                            </span>
                                        );
                                    })()}
                                </td>
                                <td style={tableCellStyle}>
                                    {(() => {
                                        const totalTasks = Number(p.task_count || 0);
                                        const completedTasks = Number(p.completed_task_count || 0);
                                        const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

                                        return (
                                            <div style={{ minWidth: 150 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, fontSize: 11, color: '#475569' }}>
                                                    <span>{completedTasks}/{totalTasks} done</span>
                                                    <strong>{progressPercent}%</strong>
                                                </div>
                                                <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                                                    <div style={{ width: `${progressPercent}%`, height: '100%', background: progressPercent === 100 ? '#16a34a' : '#2563eb', borderRadius: 999 }} />
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </td>
                                <td style={tableCellStyle}>
                                    {(() => {
                                        const summary = personalTaskSummaryByProject[Number(p.id)] || { total: 0, completed: 0, overdue: 0 };
                                        const openTasks = Math.max(0, summary.total - summary.completed);

                                        return (
                                            <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                                                <div><strong>{summary.total}</strong> assigned/shared</div>
                                                <div style={{ color: '#475569' }}>{openTasks} open</div>
                                                <div style={{ color: summary.overdue > 0 ? '#b91c1c' : '#64748b' }}>{summary.overdue} overdue</div>
                                            </div>
                                        );
                                    })()}
                                </td>
                                <td style={tableCellStyle}>
                                    {(() => {
                                        const deadlineKey = normalizeDateKey(p.end_date);
                                        const todayKey = formatDateKey(new Date());
                                        const isOverdue = !!deadlineKey && deadlineKey < todayKey && String(p.status || '').trim().toLowerCase() !== 'completed';

                                        return (
                                            <div style={{ display: 'grid', gap: 4 }}>
                                                <div>{formatDateTime(p.end_date)}</div>
                                                {isOverdue && (
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c' }}>Past deadline</span>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </td>
                                <td style={{ ...tableCellStyle, textAlign: 'center', position: 'relative' }}>
                                    <button
                                        ref={(el) => { actionButtonRefs.current[p.id] = el; }}
                                        onClick={(e) => toggleDropdown(e, p.id)}
                                        aria-expanded={activeDropdown === p.id}
                                        aria-haspopup="menu"
                                        aria-label={`Actions for ${p.name}`}
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '5px' }}
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#666">
                                            <circle cx="12" cy="5" r="2"></circle>
                                            <circle cx="12" cy="12" r="2"></circle>
                                            <circle cx="12" cy="19" r="2"></circle>
                                        </svg>
                                    </button>
                                    {/* Dropdown Menu */}
                                    {activeDropdown === p.id && (
                                        <div style={{
                                            position: 'fixed',
                                            top: dropdownPosition?.top ?? 0,
                                            left: dropdownPosition?.left ?? 0,
                                            background: 'white',
                                            border: '1px solid #e2e8f0', borderRadius: '8px',
                                            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.24)',
                                            zIndex: 1400,
                                            minWidth: '160px'
                                        }}
                                            ref={dropdownMenuRef}
                                            onClick={(e) => e.stopPropagation()}
                                            role="menu"
                                        >
                                            {!showArchiveView ? (
                                                <>
                                                    <button onClick={() => router.push(`/projects/detail?id=${p.id}`)} title="View Details" aria-label={`View details for ${p.name}`} style={{ display: 'block', width: '100%', padding: '10px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', color: '#1e3a8a' }}>
                                                        <CrudActionIcon action="view" />
                                                    </button>
                                                    {user?.role !== 'staff' && (
                                                        <>
                                                            <button onClick={() => openEditModal(p)} title="Edit" aria-label={`Edit ${p.name}`} style={{ display: 'block', width: '100%', padding: '10px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                                <CrudActionIcon action="edit" />
                                                            </button>
                                                            <button onClick={() => handleDeleteClick(p)} title="Archive" aria-label={`Archive ${p.name}`} style={{ display: 'block', width: '100%', padding: '10px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'red' }}>
                                                                <CrudActionIcon action="archive" />
                                                            </button>
                                                        </>
                                                    )}
                                                </>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', padding: '8px' }}>
                                                    <button onClick={() => handleRestore(p.id)} title="Restore" aria-label={`Restore ${p.name}`} style={{ padding: '6px 10px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <CrudActionIcon action="restore" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Pagination
                currentPage={currentPage}
                totalItems={filteredProjects.length}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={setCurrentPage}
                label={showArchiveView ? 'archived projects' : 'projects'}
            />

            {/* Add/Edit Modal */}
            {showModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '600px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>
                            {editingProject ? 'Edit Project' : 'New Project'}
                        </h2>

                        <form onSubmit={handleSubmit}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Client</label>
                                    <select name="client_id" value={formData.client_id} onChange={handleInputChange} required
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: 'white', color: '#333' }}>
                                        <option value="">-- Select Client --</option>
                                        {clients.map(c => (
                                            <option key={c.client_id} value={c.client_id}>{c.client_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Manager</label>
                                    <select name="manager_id" value={formData.manager_id} onChange={handleInputChange} required={!editingProject}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: 'white', color: '#333' }}>
                                        <option value="">-- Select Manager --</option>
                                        {managers.length > 0 ? managers.map(m => (
                                            <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                                        )) : (
                                            /* If no managers, try showing all users for now fallback */
                                            <option disabled>No managers found</option>
                                        )}
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>
                                    {editingProject ? 'Project Name' : 'Generated Project Name'}
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    required
                                    readOnly={!editingProject}
                                    placeholder={editingProject ? '' : 'Choose a client first'}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '6px',
                                        border: '1px solid #ccc',
                                        color: '#000',
                                        backgroundColor: editingProject ? '#fff' : '#f8fafc',
                                    }}
                                />
                                {!editingProject && (
                                    <div style={{ marginTop: 6, fontSize: '12px', color: '#64748b' }}>
                                        The system creates one project and tags it with the client&apos;s active service branches automatically.
                                    </div>
                                )}
                            </div>

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Description</label>
                                <textarea name="description" value={formData.description} onChange={handleInputChange}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', minHeight: '80px', color: '#000', backgroundColor: '#fff' }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: editingProject ? '1fr 1fr' : '1fr', gap: '15px', marginBottom: '15px' }}>
                                {editingProject && (
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Start Date</label>
                                        <input type="datetime-local" name="start_date" value={formData.start_date} onChange={handleInputChange}
                                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', color: '#333', backgroundColor: 'white' }} />
                                    </div>
                                )}
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Due Date</label>
                                    <input type="datetime-local" name="end_date" value={formData.end_date} onChange={handleInputChange} required={!editingProject}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', color: '#333', backgroundColor: 'white' }} />
                                    {!editingProject && (
                                        <div style={{ marginTop: 6, fontSize: '12px', color: '#64748b' }}>
                                            Start date is set automatically when the project is created.
                                        </div>
                                    )}
                                </div>
                            </div>


                            {/* Service / Scope Selection */}
                            {!editingProject && clientServices.length > 0 && (
                                <div style={{ marginBottom: '20px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '15px', background: '#f8fafc' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <div>
                                            <h3 style={{ marginTop: 0, marginBottom: '2px', fontSize: '14px', color: '#2d3748' }}>Project Scope</h3>
                                            <p style={{ margin: 0, fontSize: '12px', color: '#718096' }}>
                                                One project will be created, and each client service below will act as its service branch.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowAddTask(!showAddTask)}
                                            title="Add Task"
                                            aria-label="Add Task"
                                            style={{ background: 'none', border: 'none', color: '#1e3a8a', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <CrudActionIcon action="create" size={14} strokeWidth={3} />
                                        </button>
                                    </div>

                                    {/* Add Task Form */}
                                    {showAddTask && (
                                        <div style={{ marginBottom: '15px', padding: '10px', background: '#e0f2fe', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '8px', alignItems: 'center' }}>
                                                <select
                                                    value={newTaskServiceId}
                                                    onChange={(e) => setNewTaskServiceId(e.target.value)}
                                                    style={{ padding: '6px', borderRadius: '4px', border: '1px solid #94a3b8', fontSize: '13px', color: '#000', backgroundColor: '#fff' }}
                                                >
                                                    <option value="">Select Service...</option>
                                                    {clientServices.map(s => (
                                                        <option key={s.service_id} value={s.service_id}>{s.service_name}</option>
                                                    ))}
                                                </select>
                                                <input
                                                    type="text"
                                                    placeholder="New Task Name"
                                                    value={newTaskName}
                                                    onChange={(e) => setNewTaskName(e.target.value)}
                                                    style={{ padding: '6px', borderRadius: '4px', border: '1px solid #94a3b8', fontSize: '13px', width: '100%', color: '#000', backgroundColor: '#fff' }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleAddTask}
                                                    disabled={!newTaskServiceId || !newTaskName}
                                                    title="Add and Keep Adding"
                                                    style={{
                                                        background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '4px',
                                                        width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                                        opacity: (!newTaskServiceId || !newTaskName) ? 0.6 : 1
                                                    }}
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxHeight: '200px', overflowY: 'auto' }}>
                                        {clientServices.map(s => (
                                            <div key={s.service_id}>
                                                <div style={{ fontWeight: 'bold', color: '#4a5568', marginBottom: '5px', fontSize: '14px' }}>{s.service_name}</div>
                                                <div style={{ paddingLeft: '15px' }}>
                                                    {s.checklists && s.checklists.length > 0 ? s.checklists.map((cl: any) => (
                                                        <div key={cl.checklist_id} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                                                            <input
                                                                type="checkbox"
                                                                id={`task-${cl.checklist_id}`}
                                                                checked={selectedTasks.includes(cl.checklist_id)}
                                                                onChange={() => handleTaskToggle(cl.checklist_id)}
                                                                style={{ marginRight: '8px' }}
                                                            />
                                                            <label htmlFor={`task-${cl.checklist_id}`} style={{ fontSize: '13px', color: '#333' }}>{cl.task_name}</label>
                                                        </div>
                                                    )) : <div style={{ fontSize: '12px', color: '#a0aec0' }}>No tasks defined</div>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {editingProject && (
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Status</label>
                                    <select name="status" value={formData.status} onChange={handleInputChange}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: 'white', color: '#333' }}>
                                        <option value="active">Active</option>
                                        <option value="completed">Completed</option>
                                        <option value="on_hold">On Hold</option>
                                        <option value="archived">Archived</option>
                                    </select>
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => { setShowModal(false); resetForm(); }}
                                    style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', color: '#666' }}>
                                    Cancel
                                </button>
                                <button type="submit"
                                    title={editingProject ? 'Update Project' : 'Create Project'}
                                    aria-label={editingProject ? 'Update Project' : 'Create Project'}
                                    style={{ padding: '10px 20px', background: '#1e3a8a', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'white', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                    Submit
                                </button>
                            </div>
                        </form>
                    </div>
                </div >
            )
            }

            {/* Delete/Archive Confirmation Modal */}
            {showDeleteConfirm && projectToDelete && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
                    <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '400px', maxWidth: '90%', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>Archive Project?</h3>
                        <p style={{ margin: '0 0 20px 0', color: '#666' }}>
                            Are you sure you want to archive <strong>{projectToDelete.name}</strong>? This will hide it from active lists.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                            <button onClick={() => { setShowDeleteConfirm(false); setProjectToDelete(null); }} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', color: '#666' }}>Cancel</button>
                            <button onClick={handleDeleteConfirm} title="Archive" aria-label="Archive project" style={{ padding: '10px 20px', background: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'white', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CrudActionIcon action="archive" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout >
    );
}

function SummaryCard({
    label,
    value,
    subtitle,
    tone,
}: {
    label: string;
    value: number;
    subtitle: string;
    tone: 'neutral' | 'primary' | 'warning' | 'danger';
}) {
    const tones = {
        neutral: { background: '#f8fafc', border: '#e2e8f0', label: '#475569', value: '#0f172a' },
        primary: { background: '#eff6ff', border: '#bfdbfe', label: '#1d4ed8', value: '#1e3a8a' },
        warning: { background: '#fffbeb', border: '#fde68a', label: '#b45309', value: '#92400e' },
        danger: { background: '#fef2f2', border: '#fecaca', label: '#b91c1c', value: '#991b1b' },
    } as const;

    const palette = tones[tone];

    return (
        <div style={{ background: palette.background, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: palette.label, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800, color: palette.value }}>{value}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>{subtitle}</div>
        </div>
    );
}
