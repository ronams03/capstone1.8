import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import Pagination from '../../components/Pagination';
import CrudActionIcon from '../../components/CrudActionIcon';
import { confirmAction } from '@/utils/notify';
import { getApiBaseUrl } from '@/utils/network';

export default function Services() {
    const router = useRouter();
    const API_BASE = getApiBaseUrl();
    const ITEMS_PER_PAGE = 10;
    const [user, setUser] = useState<any>(null);
    const [services, setServices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showArchiveView, setShowArchiveView] = useState(false);
    const [showChecklistArchiveView, setShowChecklistArchiveView] = useState(false);

    // Modals
    const [showServiceModal, setShowServiceModal] = useState(false);
    const [editingService, setEditingService] = useState<any>(null);
    const [serviceFormData, setServiceFormData] = useState({ service_name: '', description: '' });

    const [showChecklistModal, setShowChecklistModal] = useState(false);
    const [activeServiceForChecklist, setActiveServiceForChecklist] = useState<any>(null);
    const [checklistFormData, setChecklistFormData] = useState({ task_name: '', description: '', is_required: true });

    // UI state
    const [expandedServiceId, setExpandedServiceId] = useState<number | null>(null);
    const [servicePage, setServicePage] = useState(1);
    const [archivedChecklistPage, setArchivedChecklistPage] = useState(1);
    const [selectedArchivedChecklistServiceId, setSelectedArchivedChecklistServiceId] = useState<number | null>(null);

    useEffect(() => {
        checkSession();
    }, []);

    const checkSession = async () => {
        try {
            const res = await fetch(`${API_BASE}/auth.php`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                setUser(data.data);
                fetchServices();
            } else {
                router.push('/');
            }
        } catch (err) {
            router.push('/');
        } finally {
            setLoading(false);
        }
    };

    const fetchServices = async () => {
        try {
            const res = await fetch(`${API_BASE}/services.php?checklists=1&with_archived_checklists=1`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) setServices(data.data);
        } catch (err) { console.error('Failed to fetch services'); }
    };

    // --- Service Handlers ---

    const openServiceModal = (s: any = null) => {
        if (s) {
            setEditingService(s);
            setServiceFormData({ service_name: s.service_name, description: s.description });
        } else {
            setEditingService(null);
            setServiceFormData({ service_name: '', description: '' });
        }
        setShowServiceModal(true);
    };

    const handleServiceSubmit = async (e: any) => {
        e.preventDefault();
        try {
            const isEdit = !!editingService;
            const url = `${API_BASE}/services.php?type=service${isEdit ? `&id=${editingService.service_id}` : ''}`;
            const method = isEdit ? 'PUT' : 'POST';
            const payload = serviceFormData;
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Failed to save service');
            setShowServiceModal(false);

            if (isEdit && editingService) {
                // Optimistic update for PUT
                setServices((prev) =>
                    (prev || []).map((s) =>
                        s.service_id === editingService.service_id ? { ...s, ...payload } : s
                    )
                );
            } else {
                // Optimistic insert for POST
                const newService = {
                    service_id: Number(data?.data?.service_id || 0),
                    service_name: payload.service_name,
                    description: payload.description,
                    checklists: [],
                };
                setServices((prev) => [newService, ...(prev || [])]);
            }
        } catch (err) { alert('Error saving service: ' + (err as Error).message); }
    };

    const handleArchiveService = async (id: number) => {
        const target = services.find(s => s.service_id === id);
        if (!target) return;
        const originalDesc = target.description || '';
        const isArchived = originalDesc.startsWith('[ARCHIVED]');
        if (!isArchived) {
            if (!(await confirmAction({
                title: 'Archive this service?',
                confirmButtonText: 'Archive',
                icon: 'warning'
            }))) return;
            try {
                const res = await fetch(`${API_BASE}/services.php?type=service&id=${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ service_name: target.service_name, description: `[ARCHIVED] ${originalDesc}`.trim() })
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.message || 'Failed to archive');
                setServices((prev) =>
                    (prev || []).map((s) =>
                        s.service_id === id ? { ...s, description: `[ARCHIVED] ${originalDesc}`.trim() } : s
                    )
                );
            } catch (err) { alert('Error archiving service: ' + (err as Error).message); }
        }
    };

    const handleRestoreService = async (id: number) => {
        const target = services.find(s => s.service_id === id);
        if (!target) return;
        const originalDesc = target.description || '';
        if (!originalDesc.startsWith('[ARCHIVED]')) return;
        const restoredDesc = originalDesc.replace(/^\[ARCHIVED\]\s?/, '');
        try {
            const res = await fetch(`${API_BASE}/services.php?type=service&id=${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ service_name: target.service_name, description: restoredDesc })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Failed to restore');
            setServices((prev) =>
                (prev || []).map((s) =>
                    s.service_id === id ? { ...s, description: restoredDesc } : s
                )
            );
        } catch (err) { alert('Error restoring service: ' + (err as Error).message); }
    };

    // --- Checklist Handlers ---

    const openChecklistModal = (service: any) => {
        setActiveServiceForChecklist(service);
        setChecklistFormData({ task_name: '', description: '', is_required: true });
        setShowChecklistModal(true);
    };

    const handleChecklistSubmit = async (e: any) => {
        e.preventDefault();
        try {
            const payload = { ...checklistFormData, service_id: activeServiceForChecklist.service_id };
            const res = await fetch(`${API_BASE}/services.php?type=checklist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Failed to add checklist item');
            setShowChecklistModal(false);

            // Optimistic insert for checklist
            const newChecklist = {
                checklist_id: Number(data?.data?.checklist_id || 0),
                service_id: payload.service_id,
                task_name: payload.task_name,
                description: payload.description,
                is_required: payload.is_required,
            };
            setServices((prev) =>
                (prev || []).map((s) =>
                    s.service_id === payload.service_id
                        ? { ...s, checklists: [...(s.checklists || []), newChecklist] }
                        : s
                )
            );
        } catch (err) { alert('Error adding checklist item: ' + (err as Error).message); }
    };

    const deleteChecklist = async (id: number) => {
        if (!(await confirmAction({
            title: 'Archive this checklist item?',
            text: 'This checklist will be hidden from future project templates.',
            confirmButtonText: 'Archive',
            icon: 'warning'
        }))) return;
        try {
            const res = await fetch(`${API_BASE}/services.php?type=checklist&id=${id}`, { method: 'DELETE', credentials: 'include' });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Failed to archive checklist item');
            // Optimistic update: mark checklist as deleted
            setServices((prev) =>
                (prev || []).map((s) => ({
                    ...s,
                    checklists: (s.checklists || []).map((cl: any) =>
                        cl.checklist_id === id ? { ...cl, is_deleted: 1 } : cl
                    ),
                }))
            );
        } catch (err) { alert('Error archiving checklist item: ' + (err as Error).message); }
    };

    const restoreChecklist = async (id: number, refresh = true) => {
        try {
            const res = await fetch(`${API_BASE}/services.php?type=checklist&id=${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ restore: true })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Failed to restore checklist item');
            // Optimistic update: mark checklist as restored
            setServices((prev) =>
                (prev || []).map((s) => ({
                    ...s,
                    checklists: (s.checklists || []).map((cl: any) =>
                        cl.checklist_id === id ? { ...cl, is_deleted: 0 } : cl
                    ),
                }))
            );
        } catch (err) { alert('Error restoring checklist item: ' + (err as Error).message); }
    };

    const handleRestoreAllArchivedChecklists = async () => {
        const groupsToRestore = selectedArchivedChecklistServiceId === null
            ? archivedChecklistGroups
            : archivedChecklistGroups.filter(group => group.service_id === selectedArchivedChecklistServiceId);
        for (const group of groupsToRestore) {
            for (const checklist of group.archivedChecklists) {
                await restoreChecklist(checklist.checklist_id, false);
            }
        }
        fetchServices();
    };

    const getActiveChecklists = (service: any) => (service.checklists || []).filter((cl: any) => Number(cl.is_deleted || 0) !== 1);
    const getArchivedChecklists = (service: any) => (service.checklists || []).filter((cl: any) => Number(cl.is_deleted || 0) === 1);

    const activeServices = services.filter(s => !(s.description || '').startsWith('[ARCHIVED]'));
    const archivedServices = services.filter(s => (s.description || '').startsWith('[ARCHIVED]'));
    const visibleServices = showArchiveView ? archivedServices : activeServices;
    const archivedChecklistGroups = services
        .map(s => ({ service_id: s.service_id, service_name: s.service_name, archivedChecklists: getArchivedChecklists(s) }))
        .filter(s => s.archivedChecklists.length > 0);
    const filteredArchivedChecklistGroups = selectedArchivedChecklistServiceId === null
        ? archivedChecklistGroups
        : archivedChecklistGroups.filter(group => group.service_id === selectedArchivedChecklistServiceId);
    const paginatedServices = visibleServices.slice((servicePage - 1) * ITEMS_PER_PAGE, servicePage * ITEMS_PER_PAGE);
    const paginatedArchivedChecklistGroups = filteredArchivedChecklistGroups.slice((archivedChecklistPage - 1) * ITEMS_PER_PAGE, archivedChecklistPage * ITEMS_PER_PAGE);
    const totalArchivedChecklists = archivedChecklistGroups.reduce((sum, s) => sum + s.archivedChecklists.length, 0);
    const pageTitle = showArchiveView ? 'Archived Services' : showChecklistArchiveView ? 'Archived Checklists' : 'Service Management';
    const pageHeading = showArchiveView ? 'Archived Services' : showChecklistArchiveView ? 'Archived Checklists' : 'Service Management';

    useEffect(() => {
        setServicePage(1);
        setArchivedChecklistPage(1);
    }, [showArchiveView, showChecklistArchiveView]);

    useEffect(() => {
        setArchivedChecklistPage(1);
    }, [selectedArchivedChecklistServiceId]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(visibleServices.length / ITEMS_PER_PAGE));
        if (servicePage > totalPages) setServicePage(totalPages);
    }, [visibleServices.length, servicePage]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(filteredArchivedChecklistGroups.length / ITEMS_PER_PAGE));
        if (archivedChecklistPage > totalPages) setArchivedChecklistPage(totalPages);
    }, [filteredArchivedChecklistGroups.length, archivedChecklistPage]);

    useEffect(() => {
        if (selectedArchivedChecklistServiceId === null) return;
        const stillExists = archivedChecklistGroups.some(group => group.service_id === selectedArchivedChecklistServiceId);
        if (!stillExists) {
            setSelectedArchivedChecklistServiceId(null);
        }
    }, [archivedChecklistGroups, selectedArchivedChecklistServiceId]);

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
                <title>{pageTitle}</title>
            </Head>

            <div className="pageHeaderInline" style={{ marginBottom: '20px' }}>
                <div className="pageHeaderText">
                    <h1 style={{ fontSize: '14px', fontWeight: 'bold', color: '#1a202c', margin: 0 }}>{pageHeading}</h1>
                </div>
                {!showArchiveView && !showChecklistArchiveView ? (
                    <div className="pageInlineFilters">
                        <button
                            className="app-action-btn"
                            onClick={() => {
                                setShowArchiveView(true);
                                setShowChecklistArchiveView(false);
                            }}
                            style={{ padding: '10px 12px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                        >{`Archive (${archivedServices.length})`}</button>
                        <button
                            className="app-action-btn"
                            onClick={() => {
                                setShowChecklistArchiveView(true);
                                setShowArchiveView(false);
                                setSelectedArchivedChecklistServiceId(null);
                            }}
                            style={{ padding: '10px 12px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                        >{`Checklist Archive (${totalArchivedChecklists})`}</button>
                        <button
                            className="app-action-btn app-action-btn-primary"
                            onClick={() => openServiceModal()}
                            title="Add Service"
                            aria-label="Add Service"
                            style={{
                                padding: '10px 20px', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px'
                            }}
                        >
                            <CrudActionIcon action="create" size={18} />
                        </button>
                    </div>
                ) : showArchiveView ? (
                    <div className="pageInlineFilters">
                        <button className="app-action-btn app-action-btn-primary" onClick={() => setShowArchiveView(false)} style={{ padding: '10px 12px', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Back to Active</button>
                        {archivedServices.length > 0 && (
                            <button className="app-action-btn app-action-btn-success" onClick={async () => { for (const s of archivedServices) await handleRestoreService(s.service_id); }} title="Restore All" aria-label="Restore all services" style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CrudActionIcon action="restore" />
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="pageInlineFilters">
                        <button className="app-action-btn app-action-btn-primary" onClick={() => { setShowChecklistArchiveView(false); setSelectedArchivedChecklistServiceId(null); }} style={{ padding: '10px 12px', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Back to Active</button>
                        {totalArchivedChecklists > 0 && (
                            <button className="app-action-btn app-action-btn-success" onClick={handleRestoreAllArchivedChecklists} title="Restore All" aria-label="Restore all checklist tasks" style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CrudActionIcon action="restore" />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {showChecklistArchiveView ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {archivedChecklistGroups.length > 0 && (
                        <div style={{ background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #dbeafe', borderRadius: '12px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)', padding: '14px' }}>
                            <div style={{ marginBottom: '10px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em', color: '#0f172a' }}>
                                FILTER BY SERVICE
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                                {archivedChecklistGroups.map((group) => (
                                    <button
                                        key={`archived-filter-${group.service_id}`}
                                        type="button"
                                        onClick={() => setSelectedArchivedChecklistServiceId(prev => prev === group.service_id ? null : group.service_id)}
                                        style={{
                                            padding: '9px 10px',
                                            borderRadius: '8px',
                                            border: selectedArchivedChecklistServiceId === group.service_id ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                                            background: selectedArchivedChecklistServiceId === group.service_id ? '#1d4ed8' : '#ffffff',
                                            color: selectedArchivedChecklistServiceId === group.service_id ? '#ffffff' : '#334155',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            boxShadow: selectedArchivedChecklistServiceId === group.service_id ? '0 2px 8px rgba(37, 99, 235, 0.35)' : 'none'
                                        }}
                                    >
                                        {group.service_name} ({group.archivedChecklists.length})
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {filteredArchivedChecklistGroups.length === 0 ? (
                        <div style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: '12px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)', padding: '24px', textAlign: 'center', color: '#64748b' }}>
                            No archived checklist tasks found.
                        </div>
                    ) : paginatedArchivedChecklistGroups.map(group => (
                        <div key={`archived-checklists-${group.service_id}`} style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: '12px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)', overflow: 'hidden' }}>
                            <div style={{ padding: '14px 20px', borderBottom: '1px solid #dbeafe', background: 'linear-gradient(90deg, #eff6ff 0%, #f8fafc 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '14px', color: '#1e3a8a' }}>{group.service_name}</h3>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e3a8a', background: '#dbeafe', borderRadius: '999px', padding: '4px 10px' }}>{group.archivedChecklists.length} archived</span>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                                        <th style={{ padding: '10px', fontSize: '13px', color: '#334155', fontWeight: 700 }}>Task Name</th>
                                        <th style={{ padding: '10px', fontSize: '13px', color: '#334155', fontWeight: 700 }}>Description</th>
                                        <th style={{ padding: '10px', width: '100px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {group.archivedChecklists.map((cl: any) => (
                                        <tr key={cl.checklist_id} style={{ borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
                                            <td style={{ padding: '10px', fontSize: '14px', color: '#0f172a', fontWeight: 600 }}>{cl.task_name}</td>
                                            <td style={{ padding: '10px', fontSize: '14px', color: '#475569' }}>{cl.description}</td>
                                            <td style={{ padding: '10px', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => restoreChecklist(cl.checklist_id)}
                                                    title="Restore"
                                                    aria-label={`Restore ${cl.task_name}`}
                                                    style={{ padding: '6px 12px', background: '#15803d', color: 'white', border: '1px solid #166534', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                >
                                                    <CrudActionIcon action="restore" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                    <Pagination
                        currentPage={archivedChecklistPage}
                        totalItems={filteredArchivedChecklistGroups.length}
                        itemsPerPage={ITEMS_PER_PAGE}
                        onPageChange={setArchivedChecklistPage}
                        label="service checklist groups"
                    />
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 20px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px'
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', color: '#475569' }}>SERVICE NAME</span>
                            <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', color: '#475569' }}>DESCRIPTION</span>
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', color: '#475569' }}>ACTIONS</span>
                    </div>

                    {visibleServices.length === 0 ? (
                        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                            {showArchiveView ? 'No archived services found.' : 'No active services found.'}
                        </div>
                    ) : paginatedServices.map(s => {
                        const activeChecklists = getActiveChecklists(s);

                        return (
                            <div key={s.service_id} style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                                <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: expandedServiceId === s.service_id ? '1px solid #e2e8f0' : 'none' }}>
                                    <div>
                                        <h3 style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#2d3748' }}>{s.service_name}</h3>
                                        <p style={{ margin: 0, color: '#718096', fontSize: '14px' }}>{s.description}</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button onClick={() => setExpandedServiceId(expandedServiceId === s.service_id ? null : s.service_id)}
                                            style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', color: '#4a5568', fontSize: '14px' }}>
                                            {expandedServiceId === s.service_id ? 'Hide Checklist' : 'View Checklist'}
                                        </button>
                                        {!showArchiveView ? (
                                            <>
                                                <button onClick={() => openServiceModal(s)} title="Edit" aria-label={`Edit ${s.service_name}`} style={{ padding: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#4a5568', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <CrudActionIcon action="edit" />
                                                </button>
                                                <button onClick={() => handleArchiveService(s.service_id)} title="Archive" aria-label={`Archive ${s.service_name}`} style={{ padding: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#e53e3e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <CrudActionIcon action="archive" />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button onClick={() => handleRestoreService(s.service_id)} title="Restore" aria-label={`Restore ${s.service_name}`} style={{ padding: '8px 12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <CrudActionIcon action="restore" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {expandedServiceId === s.service_id && (
                                    <div style={{ padding: '20px', background: '#f8fafc' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                            <h4 style={{ margin: 0, fontSize: '14px', color: '#4a5568' }}>Standard Checklist Tasks</h4>
                                            <button onClick={() => openChecklistModal(s)} title="Add Task" aria-label={`Add task for ${s.service_name}`} style={{ fontSize: '12px', padding: '6px 12px', background: '#3182ce', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <CrudActionIcon action="create" />
                                            </button>
                                        </div>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '8px', overflow: 'hidden' }}>
                                            <thead>
                                                <tr style={{ background: '#edf2f7', textAlign: 'left' }}>
                                                    <th style={{ padding: '10px', fontSize: '14px', color: '#4a5568' }}>Task Name</th>
                                                    <th style={{ padding: '10px', fontSize: '14px', color: '#4a5568' }}>Description</th>
                                                    <th style={{ padding: '10px', width: '80px' }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {activeChecklists.length > 0 ? activeChecklists.map((cl: any) => (
                                                    <tr key={cl.checklist_id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                                        <td style={{ padding: '10px', fontSize: '14px', color: '#2d3748' }}>{cl.task_name}</td>
                                                        <td style={{ padding: '10px', fontSize: '14px', color: '#718096' }}>{cl.description}</td>
                                                        <td style={{ padding: '10px', textAlign: 'center' }}>
                                                            <button
                                                                onClick={() => deleteChecklist(cl.checklist_id)}
                                                                title="Archive checklist task"
                                                                aria-label={`Archive ${cl.task_name}`}
                                                                style={{ color: '#e53e3e', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                            >
                                                                <CrudActionIcon action="archive" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )) : (
                                                    <tr><td colSpan={3} style={{ padding: '15px', textAlign: 'center', color: '#a0aec0', fontSize: '14px' }}>No tasks defined for this service yet.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <Pagination
                        currentPage={servicePage}
                        totalItems={visibleServices.length}
                        itemsPerPage={ITEMS_PER_PAGE}
                        onPageChange={setServicePage}
                        label={showArchiveView ? 'archived services' : 'services'}
                    />
                </div>
            )}

            {/* Service Modal */}
            {showServiceModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '500px', maxWidth: '90%' }}>
                        <h2 style={{ marginTop: 0, marginBottom: '20px' }}>{editingService ? 'Edit Service' : 'Add Service'}</h2>
                        <form onSubmit={handleServiceSubmit}>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>Service Name</label>
                                <input type="text" value={serviceFormData.service_name} onChange={e => setServiceFormData({ ...serviceFormData, service_name: e.target.value })} required
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', background: 'white', color: 'black' }} />
                            </div>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>Description</label>
                                <textarea value={serviceFormData.description} onChange={e => setServiceFormData({ ...serviceFormData, description: e.target.value })}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', background: 'white', color: 'black' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => setShowServiceModal(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" title="Save" aria-label="Save service" style={{ padding: '8px 16px', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                    Submit
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Checklist Modal */}
            {showChecklistModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '500px', maxWidth: '90%' }}>
                        <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Add Task for {activeServiceForChecklist?.service_name}</h2>
                        <form onSubmit={handleChecklistSubmit}>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>Task Name</label>
                                <input type="text" value={checklistFormData.task_name} onChange={e => setChecklistFormData({ ...checklistFormData, task_name: e.target.value })} required
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', background: 'white', color: 'black' }} />
                            </div>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>Description</label>
                                <textarea value={checklistFormData.description} onChange={e => setChecklistFormData({ ...checklistFormData, description: e.target.value })}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', background: 'white', color: 'black' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => setShowChecklistModal(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" title="Create Task" aria-label="Create checklist task" style={{ padding: '8px 16px', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                    Submit
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
