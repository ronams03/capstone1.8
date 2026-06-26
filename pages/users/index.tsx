import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useProtectedPage } from '@/components/AuthProvider';
import Layout from '../../components/Layout';
import Pagination from '../../components/Pagination';
import CrudActionIcon from '../../components/CrudActionIcon';
import PasswordInput from '../../components/PasswordInput';
import { getBackendBaseUrl, resolveBackendAssetUrl } from '@/utils/network';
import { notifyError, notifySuccess, notifyWarning, confirmAction } from '@/utils/notify';

const API_BASE_URL = getBackendBaseUrl();
const USER_DOC_FIELDS = [
    'document_resume',
    'document_nbi_clearance',
    'document_police_clearance',
    'document_barangay_clearance',
    'document_birth_certificate',
    'document_medical_certificate',
    'document_diploma_tor',
    'document_employment_contract',
] as const;
const USER_DOC_LABELS: Record<(typeof USER_DOC_FIELDS)[number], string> = {
    document_resume: 'Resume / CV',
    document_nbi_clearance: 'NBI Clearance',
    document_police_clearance: 'Police Clearance',
    document_barangay_clearance: 'Barangay Clearance',
    document_birth_certificate: 'Birth Certificate',
    document_medical_certificate: 'Medical Certificate',
    document_diploma_tor: 'Diploma / TOR',
    document_employment_contract: 'Signed Employment Contract',
};
const GOV_NUMBER_FIELDS = ['sss_number', 'pagibig_number', 'philhealth_number', 'tin_number'] as const;
type GovNumberField = (typeof GOV_NUMBER_FIELDS)[number];
const GOV_NUMBER_LABELS: Record<GovNumberField, string> = {
    sss_number: 'SSS Number',
    pagibig_number: 'Pag-IBIG Number',
    philhealth_number: 'PhilHealth Number',
    tin_number: 'TIN Number',
};
const GOV_NUMBER_PLACEHOLDERS: Record<GovNumberField, string> = {
    sss_number: 'e.g. 12-3456789-0',
    pagibig_number: 'e.g. 1234-5678-9012',
    philhealth_number: 'e.g. 12-345678901-2',
    tin_number: 'e.g. 123-456-789-000',
};
const normalizeGovernmentNumberForComparison = (value: unknown) =>
    String(value || '').trim().replace(/[^A-Za-z0-9\-]/g, '');
const getDuplicateGovernmentNumberMessage = (values: Partial<Record<GovNumberField, unknown>>) => {
    const seen = new Map<string, GovNumberField>();
    for (const field of GOV_NUMBER_FIELDS) {
        const normalized = normalizeGovernmentNumberForComparison(values[field]);
        if (!normalized) continue;

        const existingField = seen.get(normalized);
        if (existingField) {
            return `${GOV_NUMBER_LABELS[field]} must not be the same as ${GOV_NUMBER_LABELS[existingField]}.`;
        }

        seen.set(normalized, field);
    }

    return '';
};

type UserDocField = (typeof USER_DOC_FIELDS)[number];

interface Branch {
    branch_id: number;
    branch_name: string;
    status?: string;
}

type UserRecord = {
    id: number;
    first_name: string;
    last_name: string;
    username: string;
    email: string;
    role: string;
    status: string;
    created_at: string;
    date_of_birth?: string | null;
    branch_id?: number | string | null;
    employee_id?: number | string | null;
    branch_name?: string | null;
    salary?: number | string | null;
    photo?: string | null;
    sss_number?: string | null;
    pagibig_number?: string | null;
    philhealth_number?: string | null;
    tin_number?: string | null;
} & Partial<Record<UserDocField, number | boolean | null>> & {
    [key: string]: unknown;
};

type UserFormData = {
    first_name: string;
    last_name: string;
    date_of_birth: string;
    email: string;
    password: string;
    role: string;
    status: string;
    branch_id: string;
    salary: string;
    photo: string;
} & Record<GovNumberField, string> & Record<UserDocField, boolean>;

interface UserPayload extends Partial<UserFormData> {
    id?: number;
    photo_upload?: { name: string; data_url: string };
    photo_remove?: boolean;
    employee_id?: string | number | null;
    username?: string;
}

const createInitialFormData = (): UserFormData => ({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    email: '',
    password: '',
    role: 'staff',
    status: 'active',
    branch_id: '',
    salary: '0',
    photo: '',
    sss_number: '',
    pagibig_number: '',
    philhealth_number: '',
    tin_number: '',
    document_resume: false,
    document_nbi_clearance: false,
    document_police_clearance: false,
    document_barangay_clearance: false,
    document_birth_certificate: false,
    document_medical_certificate: false,
    document_diploma_tor: false,
    document_employment_contract: false,
});
const createInitialGovNumberEnabled = (): Record<GovNumberField, boolean> => ({
    sss_number: false,
    pagibig_number: false,
    philhealth_number: false,
    tin_number: false,
});

const resolveAssetUrl = (value?: string | null) => {
    return resolveBackendAssetUrl(value);
};
const DEFAULT_ITEMS_PER_PAGE = 10;

const clampItemsPerPage = (value: number) => {
    if (!Number.isFinite(value)) return DEFAULT_ITEMS_PER_PAGE;
    return Math.max(1, Math.min(100, Math.trunc(value)));
};

const isValidGmailComEmail = (value: string) => /^[^\s@]+@(gmail\.com|phinmaed\.com)$/i.test(value.trim());
const MINIMUM_USER_AGE = 18;
const isProtectedRole = (role?: string) => {
    const normalized = String(role || '').toLowerCase();
    return normalized === 'admin';
};

const parseIsoDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day
    ) {
        return null;
    }
    return parsed;
};

const getLatestAllowedBirthDate = () => {
    const today = new Date();
    return new Date(today.getFullYear() - MINIMUM_USER_AGE, today.getMonth(), today.getDate());
};

const formatDateForInput = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const MAX_BIRTHDATE = formatDateForInput(getLatestAllowedBirthDate());
const ALPHABET_FILTER_OPTIONS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));

const isAtLeastMinimumAge = (value: string) => {
    const birthDate = parseIsoDate(value);
    if (!birthDate) return false;
    return birthDate <= getLatestAllowedBirthDate();
};

export default function Users() {
    const { user, loading: authLoading, logout } = useProtectedPage({
        allowedRoles: ['admin'],
        unauthorizedRedirect: '/dashboard',
    });
    const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [showArchiveView, setShowArchiveView] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    // Modals & Action States
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
    const [viewUser, setViewUser] = useState<UserRecord | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [userToDelete, setUserToDelete] = useState<UserRecord | null>(null);
    const [activeDropdown, setActiveDropdown] = useState<number | null>(null);

    // Filters & Search
    const [searchTerm, setSearchTerm] = useState('');
    const [firstNameFilter, setFirstNameFilter] = useState('');
    const [lastNameFilter, setLastNameFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [branchFilter, setBranchFilter] = useState('all');

    const [formData, setFormData] = useState<UserFormData>(createInitialFormData());
    const [photoPreview, setPhotoPreview] = useState('');
    const [photoUpload, setPhotoUpload] = useState<{ name: string; data_url: string } | null>(null);
    const [photoRemoveRequested, setPhotoRemoveRequested] = useState(false);
    const [govNumberEnabled, setGovNumberEnabled] = useState<Record<GovNumberField, boolean>>(createInitialGovNumberEnabled());
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const occupiedManagerBranchIds = new Set(
        users
            .filter((record) => String(record.role || '').toLowerCase() === 'manager')
            .filter((record) => Number(record.branch_id || 0) > 0)
            .filter((record) => !editingUser || Number(record.id) !== Number(editingUser.id))
            .map((record) => Number(record.branch_id || 0))
    );
    const isManagerRoleSelected = String(formData.role || '').toLowerCase() === 'manager';

    const isSelfUser = (record?: { id?: number } | null) => {
        const sessionId = Number(user?.id || 0);
        const targetId = Number(record?.id || 0);
        return sessionId > 0 && targetId > 0 && sessionId === targetId;
    };
    const canEditProtectedSelf = (record?: UserRecord | null) => {
        if (!record) return false;
        if (!isSelfUser(record)) return false;
        const sessionRole = String(user?.role || '').toLowerCase();
        const targetRole = String(record.role || '').toLowerCase();
        return sessionRole === 'admin' && targetRole === 'admin';
    };

    // This page bootstraps once the shared auth state is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const role = String(user?.role || '').toLowerCase();
        if (!role) {
            if (!authLoading) {
                setLoading(false);
            }
            return;
        }

        let active = true;

        const loadUsersPage = async () => {
            setLoading(true);
            try {
                await fetchPaginationSettings(role);
                await fetchData();
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        void loadUsersPage();

        return () => {
            active = false;
        };
    }, [authLoading, user?.role]);

    useEffect(() => {
        const handleClickOutside = () => setActiveDropdown(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
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

    const fetchPaginationSettings = async (role?: string) => {
        if (role !== 'admin') {
            setItemsPerPage(DEFAULT_ITEMS_PER_PAGE);
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/settings_api.php?keys=pagination_items_per_page`, { credentials: 'include' });
            const data = await res.json();
            const configured = clampItemsPerPage(Number(data?.data?.pagination_items_per_page ?? DEFAULT_ITEMS_PER_PAGE));
            setItemsPerPage(configured);
        } catch {
            setItemsPerPage(DEFAULT_ITEMS_PER_PAGE);
        }
    };

    const fetchData = async () => { await Promise.all([fetchUsers(), fetchBranches()]); };

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/users.php`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) setUsers(data.data);
        } catch { console.error('Failed to fetch users'); }
    };

    const fetchUserById = async (userId: number) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/users.php?id=${userId}`, { credentials: 'include' });
            const data = await res.json();
            if (data.success && data.data) return data.data as UserRecord;
        } catch {
            // ignore fetch detail failure
        }
        return null;
    };

    const syncUserRecord = (nextUser: UserRecord) => {
        setUsers((prev) => prev.map((u) => (u.id === nextUser.id ? { ...u, ...nextUser } : u)));
        setViewUser((prev) => (prev && prev.id === nextUser.id ? { ...prev, ...nextUser } : prev));
        setEditingUser((prev) => (prev && prev.id === nextUser.id ? { ...prev, ...nextUser } : prev));
    };

    const refreshUserRecord = async (userId: number) => {
        const fresh = await fetchUserById(userId);
        if (fresh) syncUserRecord(fresh);
    };

    const fetchBranches = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/branches.php`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) setBranches(data.data);
        } catch { console.error('Failed to fetch branches'); }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const target = e.target;
        const { name } = target;
        const nextValue =
            target instanceof HTMLInputElement && target.type === 'checkbox'
                ? target.checked
                : target.value;
        setFormData((prev) => {
            const nextFormData = { ...prev, [name]: nextValue } as UserFormData;
            if (name === 'role' && String(nextValue).toLowerCase() === 'manager') {
                const selectedBranchId = Number(prev.branch_id || 0);
                if (selectedBranchId > 0 && occupiedManagerBranchIds.has(selectedBranchId)) {
                    nextFormData.branch_id = '';
                }
            }
            return nextFormData;
        });
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        if (!file.type?.startsWith('image/')) {
            setError('Please select a valid image file for profile picture.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setError('Profile picture must be 5MB or less.');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            if (!dataUrl.startsWith('data:image/')) {
                setError('Failed to read image file.');
                return;
            }
            setError('');
            setPhotoPreview(dataUrl);
            setPhotoUpload({ name: file.name, data_url: dataUrl });
            setPhotoRemoveRequested(false);
        };
        reader.readAsDataURL(file);
    };

    const handleRemovePhoto = () => {
        setPhotoPreview('');
        setPhotoUpload(null);
        setPhotoRemoveRequested(true);
        setFormData((prev) => ({ ...prev, photo: '' }));
    };

    const resetForm = () => {
        setFormData(createInitialFormData());
        setPhotoPreview('');
        setPhotoUpload(null);
        setPhotoRemoveRequested(false);
        setGovNumberEnabled(createInitialGovNumberEnabled());
        setEditingUser(null); setError(''); setSuccess('');
    };

    const openAddModal = () => { resetForm(); setShowModal(true); };

    const openEditModal = (u: UserRecord) => {
        if (isProtectedRole(u.role) && !canEditProtectedSelf(u)) {
            void notifyWarning('Admin and manager accounts cannot be edited here.', 4000);
            setActiveDropdown(null);
            return;
        }
        void refreshUserRecord(u.id);
        setEditingUser(u);
        setFormData({
            first_name: u.first_name || '', last_name: u.last_name || '', date_of_birth: u.date_of_birth || '',
            email: u.email || '', password: '', role: u.role || 'staff',
            status: u.status || 'active', branch_id: u.branch_id ? String(u.branch_id) : '',
            salary: String(u.salary ?? '0'),
            photo: u.photo || '',
            sss_number: u.sss_number || '',
            pagibig_number: u.pagibig_number || '',
            philhealth_number: u.philhealth_number || '',
            tin_number: u.tin_number || '',
            document_resume: !!Number(u.document_resume || 0),
            document_nbi_clearance: !!Number(u.document_nbi_clearance || 0),
            document_police_clearance: !!Number(u.document_police_clearance || 0),
            document_barangay_clearance: !!Number(u.document_barangay_clearance || 0),
            document_birth_certificate: !!Number(u.document_birth_certificate || 0),
            document_medical_certificate: !!Number(u.document_medical_certificate || 0),
            document_diploma_tor: !!Number(u.document_diploma_tor || 0),
            document_employment_contract: !!Number(u.document_employment_contract || 0),
        });
        setPhotoPreview(resolveAssetUrl(u.photo));
        setPhotoUpload(null);
        setPhotoRemoveRequested(false);
        setGovNumberEnabled({
            sss_number: !!String(u.sss_number || '').trim(),
            pagibig_number: !!String(u.pagibig_number || '').trim(),
            philhealth_number: !!String(u.philhealth_number || '').trim(),
            tin_number: !!String(u.tin_number || '').trim(),
        });
        setError(''); setSuccess(''); setShowModal(true); setActiveDropdown(null);
    };

    const handleGovNumberToggle = (field: GovNumberField, checked: boolean) => {
        setGovNumberEnabled((prev) => ({ ...prev, [field]: checked }));
        if (!checked) {
            setFormData((prev) => ({ ...prev, [field]: '' }));
        }
    };

    const openViewModal = (u: UserRecord) => {
        setViewUser(u);
        setActiveDropdown(null);
        void refreshUserRecord(u.id);
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault(); setError(''); setSuccess('');
        try {
            const isEdit = !!editingUser;
            if (isEdit && editingUser && isProtectedRole(editingUser.role) && !canEditProtectedSelf(editingUser)) {
                setError('Only the admin account owner can edit this profile.');
                return;
            }
            const payload: UserPayload = isEdit && editingUser ? { ...formData, id: editingUser.id } : { ...formData };
            const normalizedEmail = String(payload.email || '').trim().toLowerCase();
            if (!isValidGmailComEmail(normalizedEmail)) {
                setError('Email must be a valid @gmail.com or @phinmaed.com address.');
                return;
            }
            payload.email = normalizedEmail;

            const duplicateGovernmentNumberMessage = getDuplicateGovernmentNumberMessage({
                sss_number: payload.sss_number,
                pagibig_number: payload.pagibig_number,
                philhealth_number: payload.philhealth_number,
                tin_number: payload.tin_number,
            });
            if (duplicateGovernmentNumberMessage) {
                setError(duplicateGovernmentNumberMessage);
                return;
            }

            const normalizedDob = String(formData.date_of_birth || '').trim();
            if (normalizedDob && !isAtLeastMinimumAge(normalizedDob)) {
                setError('Employee must be at least 18 years old.');
                return;
            }
            const selectedBranchId = Number(formData.branch_id || 0);
            if (String(payload.role || '').toLowerCase() === 'manager' && selectedBranchId > 0 && occupiedManagerBranchIds.has(selectedBranchId)) {
                setError('This branch already has a manager assigned. Only one manager is allowed per branch.');
                return;
            }

            if (isEdit && !payload.password) delete payload.password;
            if (!isEdit && (payload.role === 'manager' || payload.role === 'staff')) {
                delete payload.password;
            }
            if (photoUpload) payload.photo_upload = photoUpload;
            if (photoRemoveRequested) payload.photo_remove = true;

            const res = await fetch(`${API_BASE_URL}/api/users.php`, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                setSuccess(data.message || (isEdit ? 'Employee updated!' : 'Employee created!'));
                setShowModal(false); resetForm();

                if (isEdit && editingUser) {
                    // Optimistic update for PUT
                    setUsers((prev) =>
                        (prev || []).map((u) =>
                            u.id === editingUser.id ? { ...u, ...payload } : u
                        )
                    );
                } else {
                    // Optimistic insert for POST
                    const newUser: UserRecord = {
                        id: Number(data?.data?.id || 0),
                        first_name: payload.first_name as string,
                        last_name: payload.last_name as string,
                        username: '',
                        email: payload.email as string,
                        role: payload.role as string,
                        status: payload.status as string || 'active',
                        created_at: new Date().toISOString(),
                        date_of_birth: payload.date_of_birth as string | null,
                        branch_id: payload.branch_id ? Number(payload.branch_id) : null,
                        employee_id: payload.employee_id ? Number(payload.employee_id) : null,
                        branch_name: '',
                        salary: payload.salary ? Number(payload.salary) : null,
                        photo: null,
                        sss_number: payload.sss_number as string | null,
                        pagibig_number: payload.pagibig_number as string | null,
                        philhealth_number: payload.philhealth_number as string | null,
                        tin_number: payload.tin_number as string | null,
                    };
                    setUsers((prev) => [newUser, ...(prev || [])]);
                }
            } else { setError(data.message || 'Failed'); }
        } catch { setError('An error occurred'); }
    };

    // Archive user (soft delete)
    const handleArchiveClick = (u: UserRecord) => {
        if (isProtectedRole(u.role)) {
            void notifyWarning('Admin and manager accounts cannot be archived.', 4000);
            setActiveDropdown(null);
            return;
        }
        setUserToDelete(u); setShowDeleteConfirm(true); setActiveDropdown(null);
    };

    const handleDeleteConfirm = async () => {
        if (!userToDelete) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/users.php?id=${userToDelete.id}`, { method: 'DELETE', credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                setUsers((prev) =>
                    (prev || []).map((u) =>
                        u.id === userToDelete.id ? { ...u, status: 'inactive' } : u
                    )
                );
            }
            setShowDeleteConfirm(false); setUserToDelete(null);
        } catch (err) { console.error('Failed to delete user', err); }
    };

    // Restore user
    const handleRestore = async (userId: number) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/users.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: userId, status: 'active' })
            });
            const data = await res.json();
            if (data.success) {
                setUsers((prev) =>
                    (prev || []).map((u) =>
                        u.id === userId ? { ...u, status: 'active' } : u
                    )
                );
            }
        } catch (err) { console.error('Failed to restore user', err); }
    };

    // Toggle status (active/inactive) - not for locked users
    const handleToggleStatus = async (target: UserRecord) => {
        if (isProtectedRole(target.role)) {
            await notifyWarning('Admin and manager accounts cannot be deactivated.', 4000);
            return;
        }
        const currentStatus = String(target.status || '').toLowerCase();
        if (currentStatus === 'locked') return; // don't toggle locked users this way
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        try {
            const res = await fetch(`${API_BASE_URL}/api/users.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: target.id, status: newStatus })
            });
            const data = await res.json();
            if (data.success) {
                setUsers((prev) =>
                    (prev || []).map((u) =>
                        u.id === target.id ? { ...u, status: newStatus } : u
                    )
                );
            }
        } catch (err) { console.error('Failed to update user status', err); }
    };

    // Unlock user
    const handleUnlock = async (userId: number) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/users.php?action=unlock&id=${userId}`, {
                method: 'POST',
                credentials: 'include',
            });
            const data = await res.json();
            if (data.success) {
                setUsers((prev) =>
                    (prev || []).map((u) =>
                        u.id === userId ? { ...u, status: 'active' } : u
                    )
                );
            }
        } catch (err) { console.error('Failed to unlock user', err); }
    };

    // Bulk actions
    const handleArchiveAll = async () => {
        const active = users.filter(u => u.status === 'active' || u.status === 'locked');
        const protectedUsers = active.filter(u => isProtectedRole(u.role));
        const eligibleUsers = active.filter(u => !isProtectedRole(u.role));

        if (eligibleUsers.length === 0) {
            void notifyWarning('No users available to archive.', 3000);
            return;
        }

        const protectedMsg = protectedUsers.length > 0
            ? `\n\nNote: ${protectedUsers.length} admin/manager account(s) will be skipped.`
            : '';

        const confirmed = await confirmAction({
            title: 'Archive all users?',
            text: `This will archive ${eligibleUsers.length} user(s).${protectedMsg}`,
            confirmButtonText: 'Archive All',
            icon: 'warning',
        });

        if (!confirmed) return;

        for (const u of eligibleUsers) {
            try {
                const res = await fetch(`${API_BASE_URL}/api/users.php?id=${u.id}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                const data = await res.json();
                if (data.success) {
                    // Continue with next user
                }
            } catch (err) {
                console.error('Failed to archive user', u.id, err);
            }
        }
        setUsers((prev) =>
            (prev || []).map((u) =>
                eligibleUsers.some((e) => e.id === u.id) ? { ...u, status: 'inactive' } : u
            )
        );
    };

    const handleRestoreAll = async () => {
        const archived = users.filter(u => u.status === 'inactive');
        for (const u of archived) { await handleRestore(u.id); }
        setUsers((prev) =>
            (prev || []).map((u) =>
                archived.some((a) => a.id === u.id) ? { ...u, status: 'active' } : u
            )
        );
    };

    const toggleDropdown = (e: React.MouseEvent, userId: number) => {
        e.stopPropagation(); setActiveDropdown(activeDropdown === userId ? null : userId);
    };

    // Filter users
    const activeUsers = users.filter(u => u.status === 'active' || u.status === 'locked');
    const archivedUsers = users.filter(u => u.status === 'inactive');

    const displayedUsers = (showArchiveView ? archivedUsers : activeUsers).filter(u => {
        const normalizedSearchTerm = searchTerm.trim().toLowerCase();
        const normalizedFirstNameFilter = firstNameFilter.trim().toLowerCase();
        const normalizedLastNameFilter = lastNameFilter.trim().toLowerCase();
        const matchesSearch = normalizedSearchTerm === '' ||
            (u.first_name?.toLowerCase() || '').includes(normalizedSearchTerm) ||
            (u.last_name?.toLowerCase() || '').includes(normalizedSearchTerm) ||
            (u.username?.toLowerCase() || '').includes(normalizedSearchTerm) ||
            (u.email?.toLowerCase() || '').includes(normalizedSearchTerm);
        const matchesFirstName = normalizedFirstNameFilter === '' || (u.first_name?.trim().toLowerCase() || '').startsWith(normalizedFirstNameFilter);
        const matchesLastName = normalizedLastNameFilter === '' || (u.last_name?.trim().toLowerCase() || '').startsWith(normalizedLastNameFilter);
        const matchesRole = roleFilter === 'all' || u.role === roleFilter;
        const matchesBranch = branchFilter === 'all'
            ? true
            : branchFilter === 'none'
                ? !u.branch_id
                : String(u.branch_id || '') === branchFilter;
        return matchesSearch && matchesFirstName && matchesLastName && matchesRole && matchesBranch;
    });
    const paginatedUsers = displayedUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const getCompletedDocCount = (u: UserRecord) => USER_DOC_FIELDS.filter((field) => !!Number(u?.[field] ?? 0) || u?.[field] === true).length;
    const formatCurrency = (value: number | string | null | undefined) => {
        const amount = Number(value ?? 0);
        const safe = Number.isFinite(amount) ? amount : 0;
        return `PHP ${safe.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [showArchiveView, searchTerm, firstNameFilter, lastNameFilter, roleFilter, branchFilter]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(displayedUsers.length / itemsPerPage));
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [displayedUsers.length, currentPage, itemsPerPage]);

    const tableHeaderStyle = { padding: '12px 15px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#4a5568', fontWeight: 'bold' } as const;
    const tableCellStyle = { padding: '12px 15px', borderBottom: '1px solid #e2e8f0', color: '#2d3748' };
    if (authLoading || loading) {

      return (

        <Layout role={String(user?.role || '')} user={user} onLogout={logout}>

          <div style={{ padding: 20 }}>Loading...</div>

        </Layout>

      );

    }

    return (
        <Layout role={user?.role} user={user} onLogout={logout}>
            <Head><title>{showArchiveView ? 'Archived Employees' : 'Employees'}</title></Head>

            <div className="pageHeaderInline" style={{ marginBottom: '20px' }}>
                <div className="pageHeaderText" style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                    <h1 style={{ fontSize: '14px', fontWeight: 'bold', color: '#1a202c', margin: 0 }}>
                        {showArchiveView ? 'Archived Employees' : 'Employees'}
                    </h1>
                </div>

                <div className="pageInlineFilters">
                <div style={{ flex: '0 1 220px', minWidth: '200px', position: 'relative' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}>
                        <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input id="search-users" type="text" placeholder="Search employees..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ width: '100%', padding: '10px 10px 10px 40px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', color: '#000', backgroundColor: '#fff' }} />
                </div>
                <select
                    id="first-name-filter"
                    value={firstNameFilter}
                    onChange={(e) => setFirstNameFilter(e.target.value)}
                    style={{ width: '150px', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', color: '#333', backgroundColor: '#fff' }}
                >
                    <option value="">First Name A-Z</option>
                    {ALPHABET_FILTER_OPTIONS.map((letter) => (
                        <option key={letter} value={letter}>{letter}</option>
                    ))}
                </select>
                <select
                    id="last-name-filter"
                    value={lastNameFilter}
                    onChange={(e) => setLastNameFilter(e.target.value)}
                    style={{ width: '150px', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', color: '#333', backgroundColor: '#fff' }}
                >
                    <option value="">Last Name A-Z</option>
                    {ALPHABET_FILTER_OPTIONS.map((letter) => (
                        <option key={letter} value={letter}>{letter}</option>
                    ))}
                </select>
                <select id="role-filter" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ width: '120px', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', color: '#333' }}>
                    <option value="all">All Roles</option>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="staff">Staff</option>
                </select>
                <select id="branch-filter" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} style={{ width: '150px', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', color: '#333' }}>
                    <option value="all">All Branches</option>
                    <option value="none">No Branch</option>
                    {branches.map((b) => (
                        <option key={b.branch_id} value={String(b.branch_id)}>{b.branch_name}</option>
                    ))}
                </select>
                    <button
                        onClick={() => setShowArchiveView(!showArchiveView)}
                        title={showArchiveView ? 'Back to Active Employees' : 'View Archived Employees'}
                        style={{
                            background: showArchiveView ? '#1e3a8a' : '#f1f5f9',
                            color: showArchiveView ? 'white' : '#64748b',
                            border: 'none', borderRadius: '6px', padding: '8px 12px',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px'
                        }}
                    >
                        <CrudActionIcon action="archive" />
                        {showArchiveView ? 'Back to Active' : `Archive (${archivedUsers.length})`}
                    </button>
                    {!showArchiveView ? (
                        user?.role !== 'staff' && (
                            <>
                                {activeUsers.length > 0 && (
                                    <button
                                        onClick={handleArchiveAll}
                                        title="Archive All"
                                        aria-label="Archive All"
                                        style={{
                                            padding: '8px 16px',
                                            background: '#dc2626',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontWeight: 'bold',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <CrudActionIcon action="archive" />
                                        Archive All
                                    </button>
                                )}
                                <button onClick={openAddModal} title="Add Employee" aria-label="Add Employee" style={{ padding: '10px 20px', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <CrudActionIcon action="create" size={18} />
                                </button>
                            </>
                        )
                    ) : archivedUsers.length > 0 && (
                        <button onClick={handleRestoreAll} title="Restore All" aria-label="Restore All" style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                            <CrudActionIcon action="restore" />
                        </button>
                    )}
                </div>
            </div>

            {/* Users Table */}
            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'visible' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f8fafc' }}>
                        <tr>
                            <th style={tableHeaderStyle}></th>
                            <th style={tableHeaderStyle}>Name</th>
                            <th style={tableHeaderStyle}>Email</th>
                            <th style={tableHeaderStyle}>Branch</th>
                            <th style={tableHeaderStyle}>Salary</th>
                            <th style={tableHeaderStyle}>Role</th>
                            {!showArchiveView && <th style={tableHeaderStyle}>Status</th>}
                            <th style={tableHeaderStyle}>Hired Date</th>
                            <th style={{ ...tableHeaderStyle, textAlign: 'center', width: showArchiveView ? '150px' : '60px' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayedUsers.length === 0 ? (
                            <tr><td colSpan={showArchiveView ? 8 : 9} style={{ padding: '20px', textAlign: 'center', color: '#666' }}>{showArchiveView ? 'No archived employees.' : 'No employees found.'}</td></tr>
                        ) : paginatedUsers.map((u, index) => {
                            const isProtected = isProtectedRole(u.role);
                            const isLocked = u.status === 'locked';
                            const canToggleStatus = !isProtected && !isLocked;
                            const canEditRow = !isProtected || canEditProtectedSelf(u);
                            const canManageArchive = user?.role !== 'staff' && !isProtected;
                            const canUnlock = user?.role !== 'staff' && isLocked;

                            return (
                            <tr key={u.id}>
                                <td style={tableCellStyle}>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                                <td style={tableCellStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ width: 34, height: 34, borderRadius: '999px', background: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontWeight: 700 }}>
                                            {u.photo ? (
                                                <img src={resolveAssetUrl(u.photo)} alt={`${u.first_name} ${u.last_name}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                `${(u.first_name || u.username || 'U').charAt(0).toUpperCase()}`
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span>{u.first_name} {u.last_name}</span>
                                            <span style={{ fontSize: 12, color: '#64748b' }}>
                                                Docs: {getCompletedDocCount(u)}/{USER_DOC_FIELDS.length}
                                            </span>
                                        </div>
                                    </div>
                                </td>
                                <td style={tableCellStyle}>{u.email}</td>
                                <td style={tableCellStyle}>{u.branch_name || '-'}</td>
                                <td style={tableCellStyle}>{formatCurrency(u.salary)}</td>
                                <td style={tableCellStyle}>
                                    <span style={{
                                        padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold',
                                        background: u.role === 'manager' ? '#fef3c7' : '#dcfce7',
                                        color: u.role === 'manager' ? '#d97706' : '#15803d', textTransform: 'capitalize'
                                    }}>{u.role}</span>
                                </td>
                                {!showArchiveView && (
                                    <td style={tableCellStyle}>
                                        <span
                                            onClick={() => canToggleStatus && handleToggleStatus(u)}
                                            title={
                                                isProtected
                                                    ? 'Admin and manager accounts cannot be deactivated.'
                                                    : isLocked
                                                        ? 'Account is locked - use Unlock action'
                                                        : `Click to ${u.status === 'active' ? 'deactivate' : 'activate'} this user`
                                            }
                                            style={{
                                                color: u.status === 'active' ? 'green' : u.status === 'locked' ? '#d97706' : 'red',
                                                fontWeight: 'bold',
                                                padding: '4px 8px',
                                                borderRadius: '12px',
                                                background: u.status === 'active' ? '#dcfce7' : u.status === 'locked' ? '#fef3c7' : '#fee2e2',
                                                textTransform: 'capitalize',
                                                cursor: canToggleStatus ? 'pointer' : 'not-allowed',
                                                transition: 'opacity 0.2s',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                            }}
                                            onMouseOver={(e) => canToggleStatus && (e.currentTarget.style.opacity = '0.7')}
                                            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
                                        >
                                            {u.status === 'locked' && (
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                                </svg>
                                            )}
                                            {u.status}
                                        </span>
                                    </td>
                                )}
                                <td style={tableCellStyle}>{new Date(u.created_at).toLocaleDateString()}</td>
                                <td style={{ ...tableCellStyle, textAlign: 'center', position: 'relative' }}>
                                    {showArchiveView ? (
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                            <button onClick={() => handleRestore(u.id)} title="Restore" aria-label={`Restore ${u.first_name} ${u.last_name}`} style={{ padding: '6px 12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <CrudActionIcon action="restore" />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <button onClick={(e) => toggleDropdown(e, u.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '5px' }}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="#666"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg>
                                            </button>
                                            {activeDropdown === u.id && (
                                                <div style={{ position: 'absolute', right: '10px', top: '100%', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100, minWidth: '120px' }}>
                                                    <button onClick={() => openViewModal(u)} title="View" aria-label={`View ${u.first_name} ${u.last_name}`} style={{ display: 'block', width: '100%', padding: '10px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                        <CrudActionIcon action="view" />
                                                    </button>
                                                    {user?.role !== 'staff' && canEditRow && (
                                                        <button onClick={() => openEditModal(u)} title="Edit" aria-label={`Edit ${u.first_name} ${u.last_name}`} style={{ display: 'block', width: '100%', padding: '10px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                            <CrudActionIcon action="edit" />
                                                        </button>
                                                    )}
                                                    {canUnlock ? (
                                                        <button onClick={() => handleUnlock(u.id)} style={{ display: 'block', width: '100%', padding: '10px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#d97706', fontWeight: 'bold' }}>
                                                            Unlock
                                                        </button>
                                                    ) : canManageArchive ? (
                                                        <button onClick={() => handleArchiveClick(u)} title="Archive" aria-label={`Archive ${u.first_name} ${u.last_name}`} style={{ display: 'block', width: '100%', padding: '10px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'red' }}>
                                                            <CrudActionIcon action="archive" />
                                                        </button>
                                                    ) : null}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </td>
                            </tr>
                        );
                        })}
                    </tbody>
                </table>
            </div>
            <Pagination
                currentPage={currentPage}
                totalItems={displayedUsers.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                label={showArchiveView ? 'archived employees' : 'employees'}
            />

            {/* View Employee Modal */}
            {viewUser && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'white', padding: '20px', borderRadius: '12px', width: '860px', maxWidth: '95%', maxHeight: '88vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
                            <h2 style={{ margin: 0, color: '#1e3a8a' }}>Employee Details</h2>
                            <button onClick={() => setViewUser(null)} style={{ background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', color: '#999' }}>x</button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}>
                            <div style={{ width: 64, height: 64, borderRadius: '999px', background: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: 14, fontWeight: 800 }}>
                                {viewUser.photo ? (
                                    <img src={resolveAssetUrl(viewUser.photo)} alt={`${viewUser.first_name} ${viewUser.last_name}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    `${(viewUser.first_name || viewUser.username || 'U').charAt(0).toUpperCase()}`
                                )}
                            </div>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2937' }}>{viewUser.first_name} {viewUser.last_name}</div>
                                <div style={{ color: '#64748b', fontSize: 12 }}>{viewUser.username}</div>
                                <div style={{ marginTop: 6, fontSize: 12, color: '#334155', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 999, padding: '3px 10px', display: 'inline-block' }}>
                                    Document Compliance: {getCompletedDocCount(viewUser)}/{USER_DOC_FIELDS.length}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                                <div style={{ fontWeight: 700, color: '#1f2937', marginBottom: 10, fontSize: 13 }}>Employee Account</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                                    <div><label style={{ display: 'block', color: '#64748b', fontSize: 12, marginBottom: 4 }}>Full Name</label><div style={{ fontWeight: 500, color: '#333' }}>{viewUser.first_name} {viewUser.last_name}</div></div>
                                    <div><label style={{ display: 'block', color: '#64748b', fontSize: 12, marginBottom: 4 }}>Username</label><div style={{ fontWeight: 500, color: '#333' }}>{viewUser.username}</div></div>
                                    <div><label style={{ display: 'block', color: '#64748b', fontSize: 12, marginBottom: 4 }}>Email</label><div style={{ fontWeight: 500, color: '#333' }}>{viewUser.email}</div></div>
                                    <div><label style={{ display: 'block', color: '#64748b', fontSize: 12, marginBottom: 4 }}>Role</label><span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: viewUser.role === 'manager' ? '#fef3c7' : '#dcfce7', color: viewUser.role === 'manager' ? '#d97706' : '#15803d', textTransform: 'capitalize' }}>{viewUser.role}</span></div>
                                    <div><label style={{ display: 'block', color: '#64748b', fontSize: 12, marginBottom: 4 }}>Branch</label><div style={{ fontWeight: 500, color: '#333' }}>{viewUser.branch_name || 'No Branch'}</div></div>
                                    <div><label style={{ display: 'block', color: '#64748b', fontSize: 12, marginBottom: 4 }}>Status</label><span style={{ color: viewUser.status === 'active' ? 'green' : 'red', fontWeight: 'bold', textTransform: 'capitalize' }}>{viewUser.status}</span></div>
                                    <div><label style={{ display: 'block', color: '#64748b', fontSize: 12, marginBottom: 4 }}>Salary</label><div style={{ fontWeight: 500, color: '#333' }}>{formatCurrency(viewUser.salary)}</div></div>
                                    <div><label style={{ display: 'block', color: '#64748b', fontSize: 12, marginBottom: 4 }}>SSS Number</label><div style={{ fontWeight: 500, color: '#333' }}>{viewUser.sss_number || '-'}</div></div>
                                    <div><label style={{ display: 'block', color: '#64748b', fontSize: 12, marginBottom: 4 }}>Pag-IBIG Number</label><div style={{ fontWeight: 500, color: '#333' }}>{viewUser.pagibig_number || '-'}</div></div>
                                    <div><label style={{ display: 'block', color: '#64748b', fontSize: 12, marginBottom: 4 }}>PhilHealth Number</label><div style={{ fontWeight: 500, color: '#333' }}>{viewUser.philhealth_number || '-'}</div></div>
                                    <div><label style={{ display: 'block', color: '#64748b', fontSize: 12, marginBottom: 4 }}>TIN Number</label><div style={{ fontWeight: 500, color: '#333' }}>{viewUser.tin_number || '-'}</div></div>
                                </div>
                            </div>
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                                <label style={{ display: 'block', color: '#1f2937', fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Employment Documents</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
                                    {USER_DOC_FIELDS.map((field) => {
                                        const submitted = !!Number(viewUser[field] ?? 0) || viewUser[field] === true;
                                        return (
                                            <div key={field} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 9px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#334155', fontSize: 12 }}>{USER_DOC_LABELS[field]}</span>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: submitted ? '#166534' : '#991b1b', background: submitted ? '#dcfce7' : '#fee2e2', borderRadius: 999, padding: '2px 7px' }}>
                                                    {submitted ? 'Submitted' : 'Missing'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'white', position: 'sticky', bottom: 0 }}>
                            {user?.role !== 'staff' && (!isProtectedRole(viewUser.role) || canEditProtectedSelf(viewUser)) && (
                                <button
                                    onClick={() => {
                                        const selectedUser = viewUser;
                                        setViewUser(null);
                                        openEditModal(selectedUser);
                                    }}
                                    title="Edit"
                                    aria-label="Edit employee"
                                    style={{ padding: '10px 20px', background: '#1e3a8a', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'white', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <CrudActionIcon action="edit" />
                                </button>
                            )}
                            <button onClick={() => setViewUser(null)} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#475569', fontWeight: '500' }}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'white', padding: '20px', borderRadius: '12px', width: '860px', maxWidth: '95%', maxHeight: '88vh', overflowY: 'auto' }}>
                        <h2 style={{ marginTop: 0, marginBottom: '14px', color: '#333' }}>{editingUser ? 'Edit Employee' : 'Add Employee'}</h2>
                        <form onSubmit={handleSubmit}>
                            <div style={{ marginBottom: 14, padding: 12, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}>
                                <label style={{ display: 'block', marginBottom: 8, color: '#334155', fontSize: 13, fontWeight: 600 }}>Profile Picture</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                    <div style={{ width: 64, height: 64, borderRadius: '999px', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', color: '#475569', fontSize: 14, fontWeight: 700 }}>
                                        {photoPreview ? (
                                            <img src={photoPreview} alt="Profile preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            `${(formData.first_name || formData.email || 'U').charAt(0).toUpperCase()}`
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhotoChange} style={{ color: '#334155' }} />
                                        {(photoPreview || formData.photo) && (
                                            <button type="button" onClick={handleRemovePhoto} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff1f2', color: '#be123c', cursor: 'pointer' }}>Remove</button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 14 }}>
                                <div><label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>First Name</label><input type="text" name="first_name" value={formData.first_name} onChange={handleInputChange} required style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', color: '#333', backgroundColor: 'white' }} /></div>
                                <div><label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>Last Name</label><input type="text" name="last_name" value={formData.last_name} onChange={handleInputChange} required style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', color: '#333', backgroundColor: 'white' }} /></div>
                                <div><label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>Email</label><input type="email" name="email" value={formData.email} onChange={handleInputChange} required pattern="^[^\s@]+@(gmail\.com|phinmaed\.com)$" title="Use a valid @gmail.com or @phinmaed.com email address." placeholder="example@phinmaed.com" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', color: '#333', backgroundColor: 'white' }} /></div>
                                <div><label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>Birthdate</label><input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleInputChange} max={MAX_BIRTHDATE} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', color: '#333', backgroundColor: 'white' }} /></div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>
                                        Password
                                        {editingUser ? (
                                            <span style={{ color: '#999', fontSize: 11 }}> (leave blank to keep)</span>
                                        ) : (
                                            <span style={{ color: '#999', fontSize: 11 }}> (auto-generated and sent by email)</span>
                                        )}
                                    </label>
                                    <PasswordInput
                                        name="password"
                                        value={formData.password}
                                        onChange={handleInputChange}
                                        required={false}
                                        disabled={!editingUser}
                                        placeholder={editingUser ? 'Optional password update' : 'Temporary password will be generated automatically'}
                                        style={{
                                            width: '100%',
                                            padding: '8px 10px',
                                            borderRadius: 6,
                                            border: '1px solid #ccc',
                                            color: editingUser ? '#333' : '#94a3b8',
                                            backgroundColor: editingUser ? 'white' : '#f8fafc',
                                            cursor: editingUser ? 'text' : 'not-allowed'
                                        }}
                                    />
                                </div>
                                <div><label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>Role</label><select name="role" value={formData.role} onChange={handleInputChange} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', backgroundColor: 'white', color: '#333' }}><option value="staff">Staff</option><option value="manager">Manager</option></select></div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>Branch</label>
                                    <select name="branch_id" value={formData.branch_id} onChange={handleInputChange} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', backgroundColor: 'white', color: '#333' }}>
                                        <option value="">-- No Branch --</option>
                                        {branches.filter(b => b.status === 'active').map((b) => {
                                            const managerAssigned = occupiedManagerBranchIds.has(Number(b.branch_id));
                                            const disabled = isManagerRoleSelected && managerAssigned;
                                            const label = disabled ? `${b.branch_name} (Manager assigned)` : b.branch_name;
                                            return <option key={b.branch_id} value={b.branch_id} disabled={disabled}>{label}</option>;
                                        })}
                                    </select>
                                    {isManagerRoleSelected && (
                                        <div style={{ marginTop: 6, color: '#64748b', fontSize: 12 }}>
                                            Each branch can only have one manager. Staff accounts can still be assigned to any branch.
                                        </div>
                                    )}
                                </div>
                                <div><label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>Monthly Salary (PHP)</label><input type="number" name="salary" value={formData.salary} onChange={handleInputChange} min="0" step="0.01" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', color: '#333', backgroundColor: 'white' }} /></div>
                            </div>

                            <div style={{ marginBottom: 14, border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                                <div style={{ fontWeight: 700, color: '#1f2937', marginBottom: 10, fontSize: 13 }}>Philippine Government Numbers</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                                    {GOV_NUMBER_FIELDS.map((field) => (
                                        <div key={field}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, color: '#555', fontSize: 12, fontWeight: 600 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={!!govNumberEnabled[field]}
                                                    onChange={(e) => handleGovNumberToggle(field, e.target.checked)}
                                                />
                                                <span>{GOV_NUMBER_LABELS[field]}</span>
                                            </label>
                                            <input
                                                type="text"
                                                name={field}
                                                value={formData[field]}
                                                onChange={handleInputChange}
                                                disabled={!govNumberEnabled[field]}
                                                placeholder={GOV_NUMBER_PLACEHOLDERS[field]}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px 10px',
                                                    borderRadius: 6,
                                                    border: '1px solid #ccc',
                                                    color: govNumberEnabled[field] ? '#333' : '#94a3b8',
                                                    backgroundColor: govNumberEnabled[field] ? 'white' : '#f8fafc',
                                                    cursor: govNumberEnabled[field] ? 'text' : 'not-allowed'
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ marginBottom: 14, border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                                <div style={{ fontWeight: 700, color: '#1f2937', marginBottom: 10, fontSize: 13 }}>Employment Document Checklist</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 8 }}>
                                    {USER_DOC_FIELDS.map((field) => (
                                        <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontSize: 12, padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
                                            <input type="checkbox" name={field} checked={formData[field]} onChange={handleInputChange} />
                                            <span>{USER_DOC_LABELS[field]}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e5e7eb', paddingTop: 12, background: 'white', position: 'sticky', bottom: 0 }}>
                                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', color: '#666' }}>Cancel</button>
                                <button type="submit" title={editingUser ? 'Update Employee' : 'Create Employee'} aria-label={editingUser ? 'Update Employee' : 'Create Employee'} style={{ padding: '10px 20px', background: '#1e3a8a', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'white', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                    Submit
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete/Archive Confirmation Modal */}
            {showDeleteConfirm && userToDelete && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
                    <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '400px', maxWidth: '90%', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>Archive Employee?</h3>
                        <p style={{ margin: '0 0 20px 0', color: '#666' }}>
                            Are you sure you want to archive <strong>{userToDelete.first_name} {userToDelete.last_name}</strong>?
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                            <button onClick={() => { setShowDeleteConfirm(false); setUserToDelete(null); }} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', color: '#666' }}>Cancel</button>
                            <button onClick={handleDeleteConfirm} title="Archive" aria-label="Archive employee" style={{ padding: '10px 20px', background: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'white', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CrudActionIcon action="archive" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
