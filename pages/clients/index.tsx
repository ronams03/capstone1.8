import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import Pagination from '../../components/Pagination';
import CrudActionIcon from '../../components/CrudActionIcon';
import { notifyError, notifySuccess } from '@/utils/notify';
import { getApiBaseUrl } from '@/utils/network';
import {
    DEFAULT_PHONE_COUNTRY_CODE,
    getPhoneInputDefault,
    isPhoneDraftEmpty,
    normalizeInternationalPhoneNumber,
    sanitizeInternationalPhoneDraft
} from '@/utils/phone';

type ServiceChecklistItem = {
    checklist_id: number;
    task_name: string;
    description?: string | null;
    is_deleted?: number | boolean;
};

type AvailableService = {
    service_id: number;
    service_name: string;
    description?: string | null;
    checklists?: ServiceChecklistItem[];
};

type ManagerOption = {
    id: number | string;
    first_name?: string | null;
    last_name?: string | null;
    status?: string | null;
};

type ClientServiceAssignment = AvailableService;
type ProjectPromptClient = {
    client_id: number;
    client_name: string;
    manager_id: string;
    end_date: string;
};

function toDateTimeLocalValue(value: Date) {
    const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function getDefaultProjectDueDateValue() {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(17, 0, 0, 0);
    return toDateTimeLocalValue(nextWeek);
}

function resolveDefaultManagerId(source: ManagerOption[], user: any) {
    const activeManagers = Array.isArray(source)
        ? source.filter((manager) => String(manager?.status || 'active') !== 'inactive')
        : [];
    const currentUserId = String(user?.id || '');
    const currentUserRole = String(user?.role || '').trim().toLowerCase();

    if (currentUserRole === 'manager') {
        const currentManager = activeManagers.find((manager) => String(manager?.id) === currentUserId);
        if (currentManager) {
            return String(currentManager.id);
        }
    }

    if (activeManagers.length === 1) {
        return String(activeManagers[0].id);
    }

    return '';
}

export default function Clients() {
    const router = useRouter();
    const API_BASE = getApiBaseUrl();
    const ITEMS_PER_PAGE = 10;
    const [user, setUser] = useState<any>(null);
    const [clients, setClients] = useState<any[]>([]);
    const [availableServices, setAvailableServices] = useState<AvailableService[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showArchiveView, setShowArchiveView] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    // Modals
    const [showModal, setShowModal] = useState(false);
    const [editingClient, setEditingClient] = useState<any>(null);
    const [viewClient, setViewClient] = useState<any>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [clientToDelete, setClientToDelete] = useState<any>(null);
    const [projectPromptClient, setProjectPromptClient] = useState<ProjectPromptClient | null>(null);
    const [managers, setManagers] = useState<ManagerOption[]>([]);
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const [collapsedViewServiceChecklistIds, setCollapsedViewServiceChecklistIds] = useState<number[]>([]);
    const [activeViewChecklistServiceId, setActiveViewChecklistServiceId] = useState<number | null>(null);

    // Form Data
    const [formData, setFormData] = useState({
        client_name: '',
        contact_first_name: '',
        contact_last_name: '',
        email: '',
        phone: DEFAULT_PHONE_COUNTRY_CODE,
        address: '',
        service_ids: [] as number[]
    });
    const [checklistDraftByService, setChecklistDraftByService] = useState<Record<number, { task_name: string; description: string }>>({});
    const [collapsedServiceChecklistIds, setCollapsedServiceChecklistIds] = useState<number[]>([]);
    const [activeChecklistServiceId, setActiveChecklistServiceId] = useState<number | null>(null);

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        checkSession();
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

    const projectPromptClientId = Number(projectPromptClient?.client_id || 0);
    const projectPromptManagerId = String(projectPromptClient?.manager_id || '');
    const currentUserId = Number(user?.id || 0);
    const currentUserRole = String(user?.role || '');

    useEffect(() => {
        if (!projectPromptClientId || projectPromptManagerId) return;

        const defaultManagerId = resolveDefaultManagerId(managers, { id: currentUserId, role: currentUserRole });
        if (!defaultManagerId) return;

        setProjectPromptClient((prev) => (
            prev ? { ...prev, manager_id: defaultManagerId } : prev
        ));
    }, [currentUserId, currentUserRole, managers, projectPromptClientId, projectPromptManagerId]);

    const checkSession = async () => {
        try {
            const res = await fetch(`${API_BASE}/auth.php`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                setUser(data.data);
                fetchClients();
                fetchAvailableServices();
                fetchManagers();
            } else {
                router.push('/');
            }
        } catch {
            router.push('/');
        } finally {
            setLoading(false);
        }
    };

    const fetchClients = async () => {
        try {
            const res = await fetch(`${API_BASE}/clients.php`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) setClients(data.data);
        } catch (err) { console.error('Failed to fetch clients'); }
    };

    const fetchAvailableServices = async () => {
        try {
            const res = await fetch(`${API_BASE}/services.php?checklists=1`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                const activeServices = (Array.isArray(data.data) ? data.data : [])
                    .filter((s: AvailableService) => {
                        const desc = String(s.description ?? '').trim().toUpperCase();
                        return !desc.startsWith('[ARCHIVED]');
                    })
                    .map((s: AvailableService) => ({
                        ...s,
                        checklists: Array.isArray(s.checklists)
                            ? s.checklists.filter((cl: ServiceChecklistItem) => Number(cl?.is_deleted || 0) !== 1)
                            : []
                    }));
                setAvailableServices(activeServices);
            }
        } catch (err) { console.error('Failed to fetch services'); }
    };

    const fetchManagers = async () => {
        try {
            const res = await fetch(`${API_BASE}/users.php?role=manager&status=active`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) setManagers(Array.isArray(data.data) ? data.data : []);
        } catch { console.error('Failed to fetch managers'); }
    };

    const handleInputChange = (e: any) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: name === 'phone' ? sanitizeInternationalPhoneDraft(value) : value
        });
    };

    const splitContactPerson = (value: string) => {
        const normalized = String(value || '').trim().replace(/\s+/g, ' ');
        if (!normalized) {
            return { first: '', last: '' };
        }

        const parts = normalized.split(' ');
        return {
            first: parts[0] || '',
            last: parts.slice(1).join(' ')
        };
    };

    const resetForm = () => {
        setFormData({
            client_name: '',
            contact_first_name: '',
            contact_last_name: '',
            email: '',
            phone: DEFAULT_PHONE_COUNTRY_CODE,
            address: '',
            service_ids: []
        });
        setChecklistDraftByService({});
        setCollapsedServiceChecklistIds([]);
        setActiveChecklistServiceId(null);
        setEditingClient(null);
        setError('');
        setSuccess('');
    };

    const handleServiceSelectionChange = (serviceId: number, checked: boolean) => {
        const nextServiceIds = checked
            ? Array.from(new Set([...formData.service_ids, serviceId]))
            : formData.service_ids.filter(id => id !== serviceId);

        setFormData(prev => ({
            ...prev,
            service_ids: nextServiceIds
        }));

        if (checked) {
            setActiveChecklistServiceId(prev => prev ?? serviceId);
        } else {
            setActiveChecklistServiceId(prev =>
                prev === serviceId
                    ? (nextServiceIds.length > 0 ? nextServiceIds[0] : null)
                    : prev
            );
        }

        if (!checked) {
            setChecklistDraftByService(prev => {
                const next = { ...prev };
                delete next[serviceId];
                return next;
            });
            setCollapsedServiceChecklistIds(prev => prev.filter(id => id !== serviceId));
        } else {
            setCollapsedServiceChecklistIds(prev => prev.filter(id => id !== serviceId));
        }
    };

    const updateChecklistDraft = (serviceId: number, field: 'task_name' | 'description', value: string) => {
        setChecklistDraftByService(prev => ({
            ...prev,
            [serviceId]: {
                task_name: prev[serviceId]?.task_name ?? '',
                description: prev[serviceId]?.description ?? '',
                [field]: value
            }
        }));
    };

    const handleAddChecklistTask = async (serviceId: number) => {
        const draft = checklistDraftByService[serviceId] || { task_name: '', description: '' };
        const task_name = String(draft.task_name || '').trim();
        const description = String(draft.description || '').trim();

        if (!task_name) {
            setError('Task name is required to add a checklist item.');
            return;
        }

        setError('');
        setSuccess('');

        try {
            const res = await fetch(`${API_BASE}/services.php?type=checklist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ service_id: serviceId, task_name, description, is_required: 1 })
            });
            const data = await res.json();

            if (data.success) {
                setChecklistDraftByService(prev => ({
                    ...prev,
                    [serviceId]: { task_name: '', description: '' }
                }));
                setSuccess('Checklist item added and saved permanently.');
                await fetchAvailableServices();
            } else {
                setError(data.message || 'Failed to add checklist item.');
            }
        } catch (err) {
            setError('An error occurred while adding checklist item.');
        }
    };

    const toggleServiceChecklistCollapse = (serviceId: number) => {
        setCollapsedServiceChecklistIds(prev =>
            prev.includes(serviceId)
                ? prev.filter(id => id !== serviceId)
                : [...prev, serviceId]
        );
    };

    const handleRemoveChecklistTask = async (checklistId: number, taskName: string) => {
        const confirmed = typeof window === 'undefined'
            ? true
            : window.confirm(`Remove checklist task "${taskName}"?`);
        if (!confirmed) return;

        setError('');
        setSuccess('');

        try {
            const res = await fetch(`${API_BASE}/services.php?type=checklist&id=${checklistId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                setSuccess('Checklist item removed successfully.');
                await fetchAvailableServices();
            } else {
                setError(data.message || 'Failed to remove checklist item.');
            }
        } catch (err) {
            setError('An error occurred while removing checklist item.');
        }
    };

    const openAddModal = () => {
        resetForm();
        setShowModal(true);
    };

    const openEditModal = (c: any) => {
        const contact = splitContactPerson(c.contact_person || '');
        const clientServices: ClientServiceAssignment[] = Array.isArray(c.services) ? c.services : [];
        setEditingClient(c);
        setFormData({
            client_name: c.client_name || '',
            contact_first_name: contact.first,
            contact_last_name: contact.last,
            email: c.email || '',
            phone: getPhoneInputDefault(c.phone),
            address: c.address || '',
            service_ids: clientServices.map((service) => Number(service.service_id))
        });
        const initialServiceId = clientServices.length > 0 ? Number(clientServices[0].service_id) : null;
        setActiveChecklistServiceId(initialServiceId);
        setError('');
        setSuccess('');
        setChecklistDraftByService({});
        setCollapsedServiceChecklistIds([]);
        setShowModal(true);
    };

    const openViewModal = (c: any) => {
        setViewClient(c);
        setCollapsedViewServiceChecklistIds([]);
        const initialServiceId = c.services && c.services.length > 0 ? Number(c.services[0].service_id) : null;
        setActiveViewChecklistServiceId(initialServiceId);
    };

    const closeViewModal = () => {
        setViewClient(null);
        setCollapsedViewServiceChecklistIds([]);
        setActiveViewChecklistServiceId(null);
    };

    const toggleViewServiceChecklistCollapse = (serviceId: number) => {
        setCollapsedViewServiceChecklistIds(prev =>
            prev.includes(serviceId)
                ? prev.filter(id => id !== serviceId)
                : [...prev, serviceId]
        );
    };

    const getServiceChecklistItems = (serviceId: number) => {
        const service = availableServices.find((s) => Number(s.service_id) === Number(serviceId));
        return Array.isArray(service?.checklists) ? service.checklists : [];
    };

    const handleSubmit = async (e: any) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!Array.isArray(formData.service_ids) || formData.service_ids.length === 0) {
            setError('Please select at least one service.');
            return;
        }

        const normalizedPhone = normalizeInternationalPhoneNumber(formData.phone, DEFAULT_PHONE_COUNTRY_CODE);
        if (!isPhoneDraftEmpty(formData.phone, DEFAULT_PHONE_COUNTRY_CODE) && !normalizedPhone) {
            setError('Phone number must be a valid international number with a country code, like +639123456789.');
            return;
        }

        try {
            const isEdit = !!editingClient;
            const url = `${API_BASE}/clients.php`;
            const method = isEdit ? 'PUT' : 'POST';
            const contact_person = `${formData.contact_first_name} ${formData.contact_last_name}`.trim();
            const service_assignments = formData.service_ids.map((serviceId) => ({ service_id: serviceId }));

            const basePayload = {
                client_name: formData.client_name,
                contact_first_name: formData.contact_first_name,
                contact_last_name: formData.contact_last_name,
                contact_person,
                email: formData.email,
                phone: normalizedPhone || '',
                address: formData.address,
                service_ids: formData.service_ids,
                service_assignments
            };

            const payload = isEdit
                ? { ...basePayload, client_id: editingClient.client_id }
                : basePayload;

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                const defaultSuccess = isEdit ? 'Client updated successfully!' : 'Client added successfully!';
                setShowModal(false);
                resetForm();

                if (isEdit && editingClient) {
                    // Optimistic update for PUT
                    setClients((prev) =>
                        (prev || []).map((c) =>
                            c.client_id === editingClient.client_id ? { ...c, ...payload } : c
                        )
                    );
                    setSuccess(data.message || defaultSuccess);
                } else {
                    // Optimistic insert for POST
                    const newClient = {
                        client_id: Number(data?.data?.client_id || 0),
                        client_name: String(payload.client_name || '').trim(),
                        contact_person: payload.contact_person || '',
                        email: payload.email || '',
                        phone: payload.phone || '',
                        address: payload.address || '',
                        status: 'active',
                        registration_date: new Date().toISOString().split('T')[0],
                    };
                    setClients((prev) => [newClient, ...(prev || [])]);
                    const createdClientId = Number(data?.data?.client_id || 0);
                    const createdClientName = String(payload.client_name || '').trim();
                    if (createdClientId > 0) {
                        setProjectPromptClient({
                            client_id: createdClientId,
                            client_name: createdClientName || 'this client',
                            manager_id: resolveDefaultManagerId(managers, user),
                            end_date: getDefaultProjectDueDateValue()
                        });
                    } else {
                        setSuccess(data.message || defaultSuccess);
                    }
                }
            } else {
                setError(data.message || `Failed to ${isEdit ? 'update' : 'add'} client`);
            }
        } catch (err) {
            setError('An error occurred');
        }
    };

    const handleCreateProjectForClient = async () => {
        if (!projectPromptClient) return;

        if (!projectPromptClient.manager_id) {
            setError('Please choose a manager for the new project.');
            return;
        }

        if (!projectPromptClient.end_date) {
            setError('Please choose a due date for the new project.');
            return;
        }

        setIsCreatingProject(true);

        try {
            const res = await fetch(`${API_BASE}/projects.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    client_id: projectPromptClient.client_id,
                    manager_id: Number(projectPromptClient.manager_id),
                    end_date: projectPromptClient.end_date
                })
            });
            const raw = await res.text();
            let data: any = null;
            try {
                data = raw ? JSON.parse(raw) : null;
            } catch {
                data = null;
            }

            if (!res.ok || !data?.success) {
                const messageFromPayload = String(data?.message || '').trim();
                const messageFromBody = raw && !messageFromPayload
                    ? raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
                    : '';
                setError(
                    messageFromPayload
                    || messageFromBody
                    || 'Failed to create project for this client.'
                );
                return;
            }

            const createdProjectId = Number(data?.data?.project_id || 0);
            const promptClientName = projectPromptClient.client_name;

            setProjectPromptClient(null);
            setSuccess(`Project created for ${promptClientName}.`);
            await fetchClients();

            if (createdProjectId > 0) {
                await router.push(`/projects/detail?id=${createdProjectId}`);
            }
        } catch {
            setError('An error occurred while creating the project.');
        } finally {
            setIsCreatingProject(false);
        }
    };

    const handleSkipProjectCreation = () => {
        if (!projectPromptClient) return;

        const promptClient = projectPromptClient;
        setProjectPromptClient(null);
        setSuccess(`Client ${promptClient.client_name} created successfully.`);
    };

    const handleProjectPromptChange = (field: 'manager_id' | 'end_date', value: string) => {
        setProjectPromptClient((prev) => (
            prev ? { ...prev, [field]: value } : prev
        ));
    };

    const handleArchiveClick = (c: any) => {
        setClientToDelete(c);
        setShowDeleteConfirm(true);
    };

    const handleDeleteConfirm = async () => {
        if (!clientToDelete) return;

        try {
            const url = `${API_BASE}/clients.php?id=${clientToDelete.client_id}`;
            const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
            const data = await res.json();

            if (data.success) {
                setClients((prev) =>
                    (prev || []).map((c) =>
                        c.client_id === clientToDelete.client_id ? { ...c, status: 'inactive' } : c
                    )
                );
                setShowDeleteConfirm(false);
                setClientToDelete(null);
            } else {
                alert(data.message || 'Failed to archive client');
            }
        } catch (err) {
            alert('An error occurred while archiving');
        }
    };

    const handleRestore = async (clientId: number) => {
        try {
            const res = await fetch(`${API_BASE}/clients.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ client_id: clientId, status: 'active' })
            });
            const data = await res.json();
            if (data.success) {
                setClients((prev) =>
                    (prev || []).map((c) =>
                        c.client_id === clientId ? { ...c, status: 'active' } : c
                    )
                );
            }
        } catch (err) { alert('Error restoring client'); }
    };

    const handleArchiveAll = async () => {
        const active = clients.filter(c => c.status === 'active');
        
        if (active.length === 0) {
            alert('No active clients available to archive.');
            return;
        }
        
        const confirmed = confirm(`This will archive ${active.length} client(s). Are you sure?`);
        if (!confirmed) return;

        for (const c of active) { 
            try {
                const res = await fetch(`${API_BASE}/clients.php?id=${c.client_id}`, { 
                    method: 'DELETE', 
                    credentials: 'include' 
                });
                const data = await res.json();
                if (data.success) {
                    // Continue with next client
                }
            } catch (err) { 
                console.error('Failed to archive client', c.client_id, err); 
            }
        }
        setClients((prev) =>
            (prev || []).map((c) =>
                active.some((a) => a.client_id === c.client_id) ? { ...c, status: 'inactive' } : c
            )
        );
    };

    const handleRestoreAll = async () => {
        const archived = clients.filter(c => c.status === 'inactive');
        for (const c of archived) { await handleRestore(c.client_id); }
        setClients((prev) =>
            (prev || []).map((c) =>
                archived.some((a) => a.client_id === c.client_id) ? { ...c, status: 'active' } : c
            )
        );
    };

    // Filter clients
    const activeClients = clients.filter(c => c.status === 'active');
    const archivedClients = clients.filter(c => c.status === 'inactive');

    const filtered = (showArchiveView ? archivedClients : activeClients).filter(c =>
        (c.client_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (c.contact_person?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (c.email?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
    const paginatedClients = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => {
        setCurrentPage(1);
    }, [showArchiveView, searchTerm]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [filtered.length, currentPage]);

    useEffect(() => {
        if (formData.service_ids.length === 0) {
            if (activeChecklistServiceId !== null) setActiveChecklistServiceId(null);
            return;
        }

        const hasActive = formData.service_ids.some(id => Number(id) === Number(activeChecklistServiceId));
        if (!hasActive) {
            setActiveChecklistServiceId(Number(formData.service_ids[0]));
        }
    }, [formData.service_ids, activeChecklistServiceId]);

    useEffect(() => {
        const clientServices: ClientServiceAssignment[] = Array.isArray(viewClient?.services) ? viewClient.services : [];
        if (clientServices.length === 0) {
            if (activeViewChecklistServiceId !== null) setActiveViewChecklistServiceId(null);
            return;
        }

        const hasActive = clientServices.some((s) => Number(s.service_id) === Number(activeViewChecklistServiceId));
        if (!hasActive) {
            setActiveViewChecklistServiceId(Number(clientServices[0].service_id));
        }
    }, [viewClient, activeViewChecklistServiceId]);

    const selectedServices = availableServices.filter((s) => formData.service_ids.includes(s.service_id));
    const viewClientServices: ClientServiceAssignment[] = Array.isArray(viewClient?.services) ? viewClient.services : [];
    const activeFormChecklistService = selectedServices.find((s) => Number(s.service_id) === Number(activeChecklistServiceId)) || null;
    const activeViewChecklistService = viewClientServices.find((s) => Number(s.service_id) === Number(activeViewChecklistServiceId)) || null;
    const activeFormChecklistItems = Array.isArray(activeFormChecklistService?.checklists) ? activeFormChecklistService.checklists : [];
    const activeViewChecklistItems = activeViewChecklistService ? getServiceChecklistItems(activeViewChecklistService.service_id) : [];
    const isActiveFormChecklistCollapsed = activeFormChecklistService ? collapsedServiceChecklistIds.includes(activeFormChecklistService.service_id) : false;
    const isActiveViewChecklistCollapsed = activeViewChecklistService ? collapsedViewServiceChecklistIds.includes(activeViewChecklistService.service_id) : false;
    const activeFormChecklistDraft = activeFormChecklistService
        ? (checklistDraftByService[activeFormChecklistService.service_id] || { task_name: '', description: '' })
        : { task_name: '', description: '' };

    const tableHeaderStyle = { padding: '12px 15px', textAlign: 'left' as const, borderBottom: '2px solid #e2e8f0', color: '#4a5568', fontWeight: 'bold', fontSize: '14px' };
    const tableCellStyle = { padding: '12px 15px', borderBottom: '1px solid #e2e8f0', color: '#2d3748', fontSize: '14px' };

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
            <Head>
                <title>{showArchiveView ? 'Archived Clients' : 'Client Management'}</title>
            </Head>

            <div className="pageHeaderInline" style={{ marginBottom: '20px' }}>
                <div className="pageHeaderText">
                    <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1a202c', margin: 0 }}>
                        {showArchiveView ? 'Archived Clients' : 'Client Management'}
                    </h1>
                </div>
                <div className="pageInlineFilters">
                    <div style={{ flex: '0 1 260px', minWidth: '200px', position: 'relative' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}>
                            <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input
                            id="search-clients"
                            type="text"
                            placeholder="Search clients..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%', padding: '10px 10px 10px 40px', borderRadius: '8px',
                                border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none',
                                color: '#000', backgroundColor: '#fff'
                            }}
                        />
                    </div>
                {!showArchiveView ? (
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={() => setShowArchiveView(!showArchiveView)}
                            title={showArchiveView ? 'Back to Active Clients' : 'View Archived Clients'}
                            style={{
                                padding: '10px 12px',
                                background: showArchiveView ? '#1e3a8a' : '#f1f5f9',
                                color: showArchiveView ? 'white' : '#64748b',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '14px'
                            }}
                        >
                            {showArchiveView ? 'Back to Active' : `Archive (${archivedClients.length})`}
                        </button>
                        {activeClients.length > 0 && (
                            <button
                                onClick={handleArchiveAll}
                                title="Archive All"
                                aria-label="Archive All"
                                style={{
                                    padding: '10px 16px',
                                    background: '#dc2626',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '14px'
                                }}
                            >
                                <CrudActionIcon action="archive" />
                                Archive All
                            </button>
                        )}
                        <button
                            onClick={openAddModal}
                            title="Add Client"
                            aria-label="Add Client"
                            style={{
                                padding: '10px 20px',
                                background: '#1e3a8a',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '14px'
                            }}
                        >
                            <CrudActionIcon action="create" size={18} />
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={() => setShowArchiveView(false)}
                            style={{ padding: '10px 12px', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                        >Back to Active</button>
                        {archivedClients.length > 0 && (
                            <>
                                <button onClick={handleRestoreAll} title="Restore All" aria-label="Restore All clients" style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <CrudActionIcon action="restore" />
                                </button>
                            </>
                        )}
                    </div>
                )}
                </div>
            </div>

            {/* Clients Table */}
            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'visible' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f8fafc' }}>
                        <tr>
                            <th style={tableHeaderStyle}>Client Name</th>
                            <th style={tableHeaderStyle}>Contact Person</th>
                            <th style={tableHeaderStyle}>Services</th>
                            <th style={tableHeaderStyle}>Email / Phone</th>
                            {!showArchiveView && <th style={tableHeaderStyle}>Status</th>}
                            <th style={tableHeaderStyle}>Projects</th>
                            <th style={{ ...tableHeaderStyle, textAlign: 'center', width: showArchiveView ? '80px' : '170px' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={showArchiveView ? 6 : 7} style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
                                    {showArchiveView ? 'No archived clients.' : 'No clients found.'}
                                </td>
                            </tr>
                        ) : paginatedClients.map((c: any) => (
                            <tr key={c.client_id} style={{ transition: 'background-color 0.2s' }}>
                                <td style={tableCellStyle}>
                                    <div style={{ fontWeight: 'bold' }}>{c.client_name}</div>
                                    <div style={{ fontSize: '12px', color: '#666' }}>Since {c.registration_date ? new Date(c.registration_date).toLocaleDateString() : '-'}</div>
                                </td>
                                <td style={tableCellStyle}>{c.contact_person || '-'}</td>
                                <td style={tableCellStyle}>
                                    {c.services && c.services.length > 0
                                        ? (c.services as ClientServiceAssignment[]).map((s) => s.service_name).join(' - ')
                                        : '-'}
                                </td>
                                <td style={tableCellStyle}>
                                    <div style={{ fontSize: '14px' }}>{c.email || '-'}</div>
                                    <div style={{ fontSize: '12px', color: '#666' }}>{c.phone || '-'}</div>
                                </td>
                                {!showArchiveView && (
                                    <td style={tableCellStyle}>
                                        <select
                                            id={`client-status-${c.client_id}`}
                                            value={c.status}
                                            onChange={async (e) => {
                                                const newStatus = e.target.value;
                                                try {
                                                    await fetch(`${API_BASE}/clients.php`, {
                                                        method: 'PUT',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        credentials: 'include',
                                                        body: JSON.stringify({ client_id: c.client_id, status: newStatus })
                                                    });
                                                    fetchClients();
                                                } catch (err) { /* noop */ }
                                            }}
                                            style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontSize: '12px', textTransform: 'capitalize' }}
                                        >
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                            <option value="suspended">Suspended</option>
                                        </select>
                                    </td>
                                )}
                                <td style={tableCellStyle}>
                                    <span style={{ background: '#eff6ff', color: '#1e3a8a', padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold' }}>
                                        {c.project_count || 0}
                                    </span>
                                </td>
                                <td style={{ ...tableCellStyle, textAlign: 'center', position: 'relative' }}>
                                    {showArchiveView ? (
                                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                                            <button
                                                onClick={() => handleRestore(c.client_id)}
                                                title="Restore"
                                                aria-label={`Restore ${c.client_name}`}
                                                style={{
                                                    width: '34px',
                                                    height: '34px',
                                                    background: '#16a34a',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                <CrudActionIcon action="restore" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                            <button
                                                onClick={() => openViewModal(c)}
                                                title="View"
                                                aria-label={`View ${c.client_name}`}
                                                style={{
                                                    width: '34px',
                                                    height: '34px',
                                                    background: '#eff6ff',
                                                    color: '#1d4ed8',
                                                    border: '1px solid #bfdbfe',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                <CrudActionIcon action="view" />
                                            </button>
                                            <button
                                                onClick={() => openEditModal(c)}
                                                title="Edit"
                                                aria-label={`Edit ${c.client_name}`}
                                                style={{
                                                    width: '34px',
                                                    height: '34px',
                                                    background: '#ecfeff',
                                                    color: '#0f766e',
                                                    border: '1px solid #99f6e4',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                <CrudActionIcon action="edit" />
                                            </button>
                                            <button
                                                onClick={() => handleArchiveClick(c)}
                                                title="Archive"
                                                aria-label={`Archive ${c.client_name}`}
                                                style={{
                                                    width: '34px',
                                                    height: '34px',
                                                    background: '#fff1f2',
                                                    color: '#dc2626',
                                                    border: '1px solid #fecdd3',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                <CrudActionIcon action="archive" />
                                            </button>
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
                totalItems={filtered.length}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={setCurrentPage}
                label={showArchiveView ? 'archived clients' : 'clients'}
            />

            {/* View Client Modal */}
            {viewClient && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        background: 'white',
                        borderRadius: '12px',
                        width: '1100px',
                        maxWidth: '96vw',
                        maxHeight: '92vh',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div style={{
                            padding: '18px 20px',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <h2 style={{ margin: 0, color: '#1e3a8a' }}>Client Details</h2>
                                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '12px' }}>
                                    View complete client information, services, and checklist templates.
                                </p>
                            </div>
                            <button
                                onClick={closeViewModal}
                                title="Close"
                                aria-label="Close"
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#64748b',
                                    fontSize: '14px',
                                    lineHeight: 1,
                                    cursor: 'pointer'
                                }}
                            >
                                x
                            </button>
                        </div>

                        <div style={{ padding: '18px 20px', overflowY: 'auto' }}>
                            <div style={{
                                border: '1px solid #dbe4f0',
                                borderRadius: '10px',
                                padding: '12px',
                                background: '#f8fafc',
                                marginBottom: '14px'
                            }}>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937' }}>{viewClient.client_name || '-'}</div>
                                <div style={{ marginTop: '5px', color: '#475569', fontSize: '13px' }}>
                                    Registered: {viewClient.registration_date ? new Date(viewClient.registration_date).toLocaleDateString() : '-'}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
                                    <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '6px' }}>Contact Person</div>
                                    <div style={{ color: '#1f2937', fontWeight: 600, fontSize: '14px' }}>{viewClient.contact_person || '-'}</div>
                                </div>
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
                                    <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '6px' }}>Email</div>
                                    <div style={{ color: '#1f2937', fontWeight: 600, fontSize: '14px' }}>{viewClient.email || '-'}</div>
                                </div>
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
                                    <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '6px' }}>Phone</div>
                                    <div style={{ color: '#1f2937', fontWeight: 600, fontSize: '14px' }}>{viewClient.phone || '-'}</div>
                                </div>
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
                                    <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '6px' }}>Status</div>
                                    <span style={{
                                        color: viewClient.status === 'active' ? '#15803d' : '#b91c1c',
                                        background: viewClient.status === 'active' ? '#dcfce7' : '#fee2e2',
                                        borderRadius: '999px',
                                        padding: '3px 10px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        textTransform: 'capitalize'
                                    }}>
                                        {viewClient.status || '-'}
                                    </span>
                                </div>
                            </div>

                            <div style={{ marginBottom: '14px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
                                <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '6px' }}>Address</div>
                                <div style={{ color: '#1f2937', fontSize: '14px', whiteSpace: 'pre-wrap' }}>{viewClient.address || '-'}</div>
                            </div>

                            <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px', background: '#f8fafc' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
                                    <h3 style={{ margin: 0, color: '#1f2937', fontSize: '14px' }}>Services and Checklist</h3>
                                    <span style={{ fontSize: '12px', color: '#475569' }}>
                                        {viewClientServices.length} service(s)
                                    </span>
                                </div>

                                {viewClientServices.length === 0 ? (
                                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>No active services assigned.</p>
                                ) : (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '10px' }}>
                                            {viewClientServices.map((service) => {
                                                const isActive = Number(activeViewChecklistServiceId) === Number(service.service_id);
                                                return (
                                                    <button
                                                        key={`view-checklist-btn-${service.service_id}`}
                                                        type="button"
                                                        onClick={() => setActiveViewChecklistServiceId(Number(service.service_id))}
                                                        style={{
                                                            border: isActive ? '1px solid #1e3a8a' : '1px solid #cbd5e1',
                                                            background: isActive ? '#1e3a8a' : '#fff',
                                                            color: isActive ? '#fff' : '#334155',
                                                            borderRadius: '8px',
                                                            padding: '8px 10px',
                                                            fontSize: '12px',
                                                            fontWeight: 700,
                                                            cursor: 'pointer',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                        title={service.service_name}
                                                        aria-label={`Show ${service.service_name} checklist`}
                                                    >
                                                        {service.service_name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {activeViewChecklistService && (
                                            <div style={{ border: '1px solid #dbe4f0', borderRadius: '8px', background: 'white', padding: '10px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
                                                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937' }}>{activeViewChecklistService.service_name}</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '11px', color: '#64748b' }}>{activeViewChecklistItems.length} item(s)</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleViewServiceChecklistCollapse(activeViewChecklistService.service_id)}
                                                            style={{
                                                                border: '1px solid #cbd5e1',
                                                                borderRadius: '4px',
                                                                background: '#f8fafc',
                                                                color: '#334155',
                                                                fontSize: '11px',
                                                                padding: '3px 8px',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            {isActiveViewChecklistCollapsed ? 'Maximize' : 'Minimize'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {!isActiveViewChecklistCollapsed && (
                                                    activeViewChecklistItems.length === 0 ? (
                                                        <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>
                                                            No checklist items available for this service.
                                                        </p>
                                                    ) : (
                                                        <div style={{ display: 'grid', gap: '6px' }}>
                                                            {activeViewChecklistItems.map((item: any) => (
                                                                <div key={`view-checklist-${item.checklist_id}`} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px' }}>
                                                                    <div style={{ color: '#1f2937', fontSize: '12px', fontWeight: 700 }}>{item.task_name}</div>
                                                                    {item.description && (
                                                                        <div style={{ color: '#64748b', fontSize: '12px', marginTop: '3px' }}>{item.description}</div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        <div style={{
                            padding: '14px 20px',
                            borderTop: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '10px',
                            background: 'white'
                        }}>
                            <button
                                type="button"
                                onClick={closeViewModal}
                                style={{
                                    padding: '10px 16px',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    background: 'white',
                                    color: '#334155',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                }}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const targetClient = viewClient;
                                    closeViewModal();
                                    openEditModal(targetClient);
                                }}
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    border: 'none',
                                    borderRadius: '8px',
                                    background: '#0f766e',
                                    color: 'white',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                title="Edit Client"
                                aria-label="Edit Client"
                            >
                                <CrudActionIcon action="edit" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '1100px', maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#333' }}>
                            {editingClient ? 'Edit Client' : 'Add New Client'}
                        </h2>

                        <form onSubmit={handleSubmit}>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Client Name <span style={{ color: 'red' }}>*</span></label>
                                <input type="text" name="client_name" value={formData.client_name} onChange={handleInputChange} required
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', color: '#000', backgroundColor: '#fff', fontSize: '14px' }} placeholder="e.g. Acme Corp" />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Contact First Name</label>
                                    <input type="text" name="contact_first_name" value={formData.contact_first_name} onChange={handleInputChange}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', color: '#000', backgroundColor: '#fff', fontSize: '14px' }} placeholder="First Name" />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Contact Last Name</label>
                                    <input type="text" name="contact_last_name" value={formData.contact_last_name} onChange={handleInputChange}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', color: '#000', backgroundColor: '#fff', fontSize: '14px' }} placeholder="Last Name" />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Email</label>
                                    <input type="email" name="email" value={formData.email} onChange={handleInputChange}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', color: '#000', backgroundColor: '#fff', fontSize: '14px' }} placeholder="client@phinmaed.com" />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Phone</label>
                                    <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} inputMode="tel"
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', color: '#000', backgroundColor: '#fff', fontSize: '14px' }} placeholder="+639123456789" />
                                    <div style={{ marginTop: '6px', color: '#64748b', fontSize: '12px' }}>
                                        Defaults to +63. Replace the country code for any international number.
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Services</label>
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', overflowX: 'auto' }}>
                                    {availableServices.length === 0 ? <p style={{ margin: 0, color: '#999', fontSize: '12px' }}>No services available. Create them in Service Management.</p> : (
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 'max-content' }}>
                                            {availableServices.map((s, index) => (
                                                <div key={s.service_id} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                    <label
                                                        htmlFor={`srv-${s.service_id}`}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            fontSize: '13px',
                                                            color: '#1f2937',
                                                            cursor: 'pointer',
                                                            border: formData.service_ids.includes(s.service_id) ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                                                            background: formData.service_ids.includes(s.service_id) ? '#eff6ff' : '#fff',
                                                            borderRadius: '8px',
                                                            padding: '6px 10px',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            id={`srv-${s.service_id}`}
                                                            checked={formData.service_ids.includes(s.service_id)}
                                                            onChange={(e) => handleServiceSelectionChange(s.service_id, e.target.checked)}
                                                            style={{ marginRight: '6px', flex: '0 0 auto' }}
                                                        />
                                                        <span>{s.service_name}</span>
                                                    </label>
                                                    {index < availableServices.length - 1 && (
                                                        <span style={{ color: '#94a3b8', fontWeight: 700 }}>-</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {formData.service_ids.length === 0 && (
                                    <p style={{ margin: '6px 2px 0 2px', color: '#b91c1c', fontSize: '11px', fontWeight: 600 }}>
                                        Select at least one service to save this client.
                                    </p>
                                )}
                            </div>

                            {formData.service_ids.length > 0 && (
                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{ display: 'block', marginBottom: '6px', color: '#555', fontSize: '14px' }}>
                                        Service Checklist
                                    </label>
                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', background: '#f8fafc', maxHeight: '360px', overflowY: 'auto' }}>
                                        {selectedServices.length === 0 ? (
                                            <p style={{ margin: 0, color: '#999', fontSize: '12px' }}>
                                                Select at least one service to view checklist items.
                                            </p>
                                        ) : (
                                            <>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '10px' }}>
                                                    {selectedServices.map((service) => {
                                                        const isActive = Number(activeChecklistServiceId) === Number(service.service_id);
                                                        return (
                                                            <button
                                                                key={`form-checklist-btn-${service.service_id}`}
                                                                type="button"
                                                                onClick={() => setActiveChecklistServiceId(Number(service.service_id))}
                                                                style={{
                                                                    border: isActive ? '1px solid #1e3a8a' : '1px solid #cbd5e1',
                                                                    background: isActive ? '#1e3a8a' : '#fff',
                                                                    color: isActive ? '#fff' : '#334155',
                                                                    borderRadius: '8px',
                                                                    padding: '8px 10px',
                                                                    fontSize: '12px',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    whiteSpace: 'nowrap'
                                                                }}
                                                                title={service.service_name}
                                                                aria-label={`Show ${service.service_name} checklist`}
                                                            >
                                                                {service.service_name}
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {activeFormChecklistService && (
                                                    <div
                                                        key={`service-checklist-${activeFormChecklistService.service_id}`}
                                                        style={{
                                                            border: '1px solid #dbe4f0',
                                                            borderRadius: '6px',
                                                            padding: '10px',
                                                            background: '#fff'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '8px' }}>{activeFormChecklistService.service_name}</span>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                                                <span style={{ fontSize: '11px', color: '#64748b' }}>{activeFormChecklistItems.length} item(s)</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleServiceChecklistCollapse(activeFormChecklistService.service_id)}
                                                                    style={{
                                                                        border: '1px solid #cbd5e1',
                                                                        background: '#f8fafc',
                                                                        color: '#334155',
                                                                        borderRadius: '4px',
                                                                        fontSize: '11px',
                                                                        padding: '4px 8px',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    {isActiveFormChecklistCollapsed ? 'Maximize' : 'Minimize'}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {!isActiveFormChecklistCollapsed && (
                                                            <>
                                                                {activeFormChecklistItems.length === 0 ? (
                                                                    <p style={{ margin: '0 0 8px 0', color: '#94a3b8', fontSize: '12px' }}>
                                                                        No checklist items yet.
                                                                    </p>
                                                                ) : (
                                                                    <div style={{ marginBottom: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                                                                        {activeFormChecklistItems.map((cl: any) => (
                                                                            <div key={cl.checklist_id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                                                                                <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.3 }}>
                                                                                    <strong>{cl.task_name}</strong>
                                                                                    {cl.description ? ` - ${cl.description}` : ''}
                                                                                </div>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleRemoveChecklistTask(cl.checklist_id, cl.task_name)}
                                                                                    style={{
                                                                                        border: '1px solid #fecaca',
                                                                                        background: '#fff1f2',
                                                                                        color: '#b91c1c',
                                                                                        borderRadius: '4px',
                                                                                        fontSize: '11px',
                                                                                        padding: '4px 8px',
                                                                                        cursor: 'pointer',
                                                                                        whiteSpace: 'nowrap'
                                                                                    }}
                                                                                >
                                                                                    Remove
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', marginBottom: '6px' }}>
                                                                    <input
                                                                        type="text"
                                                                        value={activeFormChecklistDraft.task_name}
                                                                        onChange={(e) => updateChecklistDraft(activeFormChecklistService.service_id, 'task_name', e.target.value)}
                                                                        placeholder="New checklist task"
                                                                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', color: '#111827', backgroundColor: '#fff' }}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleAddChecklistTask(activeFormChecklistService.service_id)}
                                                                        style={{
                                                                            border: 'none',
                                                                            background: '#1e3a8a',
                                                                            color: '#fff',
                                                                            borderRadius: '4px',
                                                                            fontSize: '12px',
                                                                            fontWeight: 'bold',
                                                                            padding: '8px 10px',
                                                                            cursor: 'pointer'
                                                                        }}
                                                                    >
                                                                        Add
                                                                    </button>
                                                                </div>
                                                                <textarea
                                                                    value={activeFormChecklistDraft.description}
                                                                    onChange={(e) => updateChecklistDraft(activeFormChecklistService.service_id, 'description', e.target.value)}
                                                                    placeholder="Task description (optional)"
                                                                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', minHeight: '54px', color: '#111827', backgroundColor: '#fff', fontSize: '12px', resize: 'vertical' }}
                                                                />
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    <p style={{ margin: '6px 2px 0 2px', color: '#64748b', fontSize: '11px' }}>
                                        Checklist updates apply to the selected service template and will be reflected in future project task generation.
                                    </p>
                                </div>
                            )}

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', color: '#555', fontSize: '14px' }}>Address</label>
                                <textarea name="address" value={formData.address} onChange={handleInputChange}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', minHeight: '80px', color: '#000', backgroundColor: '#fff', fontSize: '14px' }} placeholder="Full address" />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => { setShowModal(false); resetForm(); }}
                                    style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', color: '#666', fontSize: '14px' }}>
                                    Cancel
                                </button>
                                <button type="submit"
                                    title={editingClient ? 'Update Client' : 'Create Client'}
                                    aria-label={editingClient ? 'Update Client' : 'Create Client'}
                                    disabled={formData.service_ids.length === 0}
                                    style={{ padding: '10px 20px', background: '#1e3a8a', border: 'none', borderRadius: '6px', cursor: formData.service_ids.length === 0 ? 'not-allowed' : 'pointer', opacity: formData.service_ids.length === 0 ? 0.6 : 1, color: 'white', fontWeight: 'bold', fontSize: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                    Submit
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete/Archive Confirmation Modal */}
            {showDeleteConfirm && clientToDelete && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001
                }}>
                    <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '450px', maxWidth: '90%', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>Archive Client?</h3>
                        <p style={{ margin: '0 0 12px 0', color: '#666', fontSize: '14px' }}>
                            Are you sure you want to archive <strong>{clientToDelete.client_name}</strong>?
                        </p>
                        <div style={{
                            background: '#fffbeb',
                            border: '1px solid #fde68a',
                            borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', textAlign: 'left', fontSize: '13px',
                            color: '#92400e'
                        }}>
                            <strong>Warning: Archiving will also:</strong>
                            <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px' }}>
                                <li>Archive all projects for this client</li>
                                <li>Cancel all pending/in-progress tasks</li>
                                <li>Deactivate client service assignments</li>
                            </ul>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                            <button
                                onClick={() => { setShowDeleteConfirm(false); setClientToDelete(null); }}
                                style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', color: '#666', fontSize: '14px' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteConfirm}
                                title="Archive"
                                aria-label="Archive client"
                                style={{ padding: '10px 20px', background: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'white', fontWeight: 'bold', fontSize: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <CrudActionIcon action="archive" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {projectPromptClient && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    background: 'rgba(15, 23, 42, 0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1002,
                    padding: '16px'
                }}>
                    <div style={{
                        width: '100%',
                        maxWidth: '460px',
                        background: '#ffffff',
                        borderRadius: '16px',
                        border: '1px solid #dbeafe',
                        boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)',
                        padding: '24px'
                    }}>
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '6px 10px',
                            borderRadius: '999px',
                            background: '#dbeafe',
                            color: '#1d4ed8',
                            fontSize: '12px',
                            fontWeight: 700,
                            marginBottom: '12px'
                        }}>
                            Next Step
                        </div>
                        <h3 style={{ margin: '0 0 10px 0', color: '#0f172a', fontSize: '22px' }}>
                            Create project for this client?
                        </h3>
                        <p style={{ margin: '0 0 18px 0', color: '#475569', fontSize: '14px', lineHeight: 1.6 }}>
                            <strong>{projectPromptClient.client_name}</strong> was created successfully. Choosing
                            &nbsp;Create Project will automatically generate one project for this client using the
                            active services you just assigned.
                        </p>
                        <div style={{ display: 'grid', gap: '14px', marginBottom: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', color: '#334155', fontSize: '13px', fontWeight: 700 }}>
                                    Assign Manager
                                </label>
                                <select
                                    value={projectPromptClient.manager_id}
                                    onChange={(e) => handleProjectPromptChange('manager_id', e.target.value)}
                                    disabled={isCreatingProject}
                                    style={{
                                        width: '100%',
                                        padding: '11px 12px',
                                        borderRadius: '10px',
                                        border: '1px solid #cbd5e1',
                                        background: '#ffffff',
                                        color: '#0f172a'
                                    }}
                                >
                                    <option value="">-- Select Manager --</option>
                                    {managers.map((manager) => (
                                        <option key={manager.id} value={manager.id}>
                                            {manager.first_name} {manager.last_name}
                                        </option>
                                    ))}
                                </select>
                                {managers.length === 0 && (
                                    <div style={{ marginTop: '6px', fontSize: '12px', color: '#b45309' }}>
                                        No active managers are available for project assignment.
                                    </div>
                                )}
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', color: '#334155', fontSize: '13px', fontWeight: 700 }}>
                                    Due Date
                                </label>
                                <input
                                    type="datetime-local"
                                    value={projectPromptClient.end_date}
                                    onChange={(e) => handleProjectPromptChange('end_date', e.target.value)}
                                    disabled={isCreatingProject}
                                    style={{
                                        width: '100%',
                                        padding: '11px 12px',
                                        borderRadius: '10px',
                                        border: '1px solid #cbd5e1',
                                        background: '#ffffff',
                                        color: '#0f172a'
                                    }}
                                />
                            </div>
                        </div>
                        <div style={{ marginBottom: '20px', color: '#64748b', fontSize: '12px', lineHeight: 1.6 }}>
                            Creating the project will open its detail page immediately.
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button
                                type="button"
                                onClick={handleSkipProjectCreation}
                                disabled={isCreatingProject}
                                style={{
                                    padding: '10px 18px',
                                    background: '#ffffff',
                                    color: '#475569',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '10px',
                                    cursor: isCreatingProject ? 'not-allowed' : 'pointer',
                                    opacity: isCreatingProject ? 0.7 : 1,
                                    fontWeight: 600
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateProjectForClient}
                                disabled={isCreatingProject || managers.length === 0}
                                style={{
                                    padding: '10px 18px',
                                    background: '#1e3a8a',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '10px',
                                    cursor: isCreatingProject || managers.length === 0 ? 'not-allowed' : 'pointer',
                                    opacity: isCreatingProject || managers.length === 0 ? 0.7 : 1,
                                    fontWeight: 700
                                }}
                            >
                                {isCreatingProject ? 'Creating...' : 'Create Project'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
