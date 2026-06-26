import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useProtectedPage } from '@/components/AuthProvider';
import Layout from '../components/Layout';
import CrudActionIcon from '../components/CrudActionIcon';
import PasswordInput from '../components/PasswordInput';
import { getBackendBaseUrl, resolveBackendAssetUrl } from '@/utils/network';
import { notifyError, notifySuccess } from '@/utils/notify';
import {
    PROFILE_DOCUMENT_FIELDS,
    type ProfileDocumentFieldKey,
    getProfileDocumentSummary,
    isProfileDocumentSubmitted,
} from '@/utils/profileDocuments';

const API_BASE_URL = getBackendBaseUrl();

type ProfileData = {
    id: number;
    first_name: string;
    last_name: string;
    username: string;
    email: string;
    role: string;
    status: string;
    branch_name?: string | null;
    date_of_birth?: string | null;
    photo?: string | null;
    sss_number?: string | null;
    pagibig_number?: string | null;
    philhealth_number?: string | null;
    tin_number?: string | null;
} & Partial<Record<ProfileDocumentFieldKey, number | boolean | null>>;

type ProfileFormState = {
    first_name: string;
    last_name: string;
    email: string;
    date_of_birth: string;
    sss_number: string;
    pagibig_number: string;
    philhealth_number: string;
    tin_number: string;
    password: string;
    confirmPassword: string;
};

type PhotoUploadPayload = {
    name: string;
    data_url: string;
};

type EditAccessRequestRecord = {
    request_id: number;
    status: string;
    created_at: string;
    approved_at?: string | null;
    access_granted_until?: string | null;
    used_at?: string | null;
    archived_at?: string | null;
    request_reason?: string | null;
};

type EditAccessStatus = {
    eligible: boolean;
    active_access?: EditAccessRequestRecord | null;
    pending_request?: EditAccessRequestRecord | null;
    latest_request?: EditAccessRequestRecord | null;
};

const createInitialFormState = (): ProfileFormState => ({
    first_name: '',
    last_name: '',
    email: '',
    date_of_birth: '',
    sss_number: '',
    pagibig_number: '',
    philhealth_number: '',
    tin_number: '',
    password: '',
    confirmPassword: '',
});

const isValidGmailComEmail = (value: string) => /^[^\s@]+@(gmail\.com|phinmaed\.com)$/i.test(value.trim());
const GOV_NUMBER_LABELS = {
    sss_number: 'SSS Number',
    pagibig_number: 'Pag-IBIG Number',
    philhealth_number: 'PhilHealth Number',
    tin_number: 'TIN Number',
} as const;
const normalizeGovernmentNumberForComparison = (value: unknown) =>
    String(value || '').trim().replace(/[^A-Za-z0-9\-]/g, '');
const formatDateTimeLabel = (value?: string | null) => {
    const raw = String(value || '').trim();
    if (!raw) return 'N/A';
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString();
};
const getDuplicateGovernmentNumberMessage = (values: Partial<Record<keyof typeof GOV_NUMBER_LABELS, unknown>>) => {
    const seen = new Map<string, keyof typeof GOV_NUMBER_LABELS>();
    for (const field of Object.keys(GOV_NUMBER_LABELS) as Array<keyof typeof GOV_NUMBER_LABELS>) {
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

export default function ProfilePage() {
    const {
        user: sessionUser,
        loading: authLoading,
        logout,
        refreshSession,
    } = useProtectedPage();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [form, setForm] = useState<ProfileFormState>(createInitialFormState());
    const [photoPreview, setPhotoPreview] = useState('');
    const [photoUpload, setPhotoUpload] = useState<PhotoUploadPayload | null>(null);
    const [photoRemoveRequested, setPhotoRemoveRequested] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [editProfileOpen, setEditProfileOpen] = useState(false);
    const [requestAccessOpen, setRequestAccessOpen] = useState(false);
    const [requestReason, setRequestReason] = useState('');
    const [requestSubmitting, setRequestSubmitting] = useState(false);
    const [editAccessStatus, setEditAccessStatus] = useState<EditAccessStatus | null>(null);
    const [editAccessLoading, setEditAccessLoading] = useState(false);
    const normalizedRole = String(sessionUser?.role || '').toLowerCase();
    const useFloatingEditProfile = normalizedRole === 'staff' || normalizedRole === 'manager';

    const completionSummary = useMemo(() => {
        const summary = getProfileDocumentSummary(profile);
        return `${summary.submittedCount}/${summary.totalCount}`;
    }, [profile]);

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

    useEffect(() => {
        if ((!editProfileOpen && !requestAccessOpen) || typeof window === 'undefined') return;

        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !saving && !requestSubmitting) {
                setEditProfileOpen(false);
                setRequestAccessOpen(false);
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [editProfileOpen, requestAccessOpen, requestSubmitting, saving]);

    const loadProfile = useCallback(async (userId: number) => {
        const res = await fetch(`${API_BASE_URL}/api/users.php?id=${userId}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) {
            throw new Error(data.message || 'Failed to load profile');
        }

        const nextProfile = data.data as ProfileData;
        setProfile(nextProfile);
        setForm({
            first_name: nextProfile.first_name || '',
            last_name: nextProfile.last_name || '',
            email: nextProfile.email || '',
            date_of_birth: nextProfile.date_of_birth || '',
            sss_number: nextProfile.sss_number || '',
            pagibig_number: nextProfile.pagibig_number || '',
            philhealth_number: nextProfile.philhealth_number || '',
            tin_number: nextProfile.tin_number || '',
            password: '',
            confirmPassword: '',
        });
        setPhotoPreview(resolveBackendAssetUrl(nextProfile.photo || ''));
        setPhotoUpload(null);
        setPhotoRemoveRequested(false);
        setError('');
    }, []);

    const loadEditAccessStatus = useCallback(async () => {
        if (!useFloatingEditProfile) {
            setEditAccessStatus(null);
            return;
        }

        setEditAccessLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/edit-requests.php?action=my-access`, {
                credentials: 'include',
            });
            const data = await res.json();
            if (!data.success || !data.data) {
                throw new Error(data.message || 'Failed to load edit access status.');
            }
            setEditAccessStatus(data.data as EditAccessStatus);
        } catch {
            setEditAccessStatus(null);
            setError('Failed to load edit access status.');
        } finally {
            setEditAccessLoading(false);
        }
    }, [useFloatingEditProfile]);

    useEffect(() => {
        const userId = Number(sessionUser?.id || 0);
        if (!userId) {
            if (!authLoading) {
                setLoading(false);
            }
            return;
        }

        let active = true;

        const initialize = async () => {
            setLoading(true);
            try {
                await loadProfile(userId);
                if (useFloatingEditProfile) {
                    await loadEditAccessStatus();
                }
            } catch {
                if (active) {
                    setError('Failed to load profile');
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        void initialize();

        return () => {
            active = false;
        };
    }, [authLoading, loadEditAccessStatus, loadProfile, sessionUser?.id, useFloatingEditProfile]);

    const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
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
            setPhotoPreview(dataUrl);
            setPhotoUpload({ name: file.name, data_url: dataUrl });
            setPhotoRemoveRequested(false);
            setError('');
        };
        reader.readAsDataURL(file);
    };

    const handleRemovePhoto = () => {
        setPhotoPreview('');
        setPhotoUpload(null);
        setPhotoRemoveRequested(true);
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!profile) return;

        setError('');
        setSuccess('');

        const password = form.password.trim();
        const confirmPassword = form.confirmPassword.trim();

        if (password || confirmPassword) {
            if (password.length < 8) {
                setError('New password must be at least 8 characters.');
                return;
            }
            if (password !== confirmPassword) {
                setError('Password confirmation does not match.');
                return;
            }
        }

        const normalizedEmail = form.email.trim().toLowerCase();
        if (!isValidGmailComEmail(normalizedEmail)) {
            setError('Email must be a valid @gmail.com or @phinmaed.com address.');
            return;
        }

        const payload: Record<string, unknown> = {
            id: profile.id,
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            email: normalizedEmail,
            date_of_birth: form.date_of_birth || null,
            sss_number: form.sss_number.trim(),
            pagibig_number: form.pagibig_number.trim(),
            philhealth_number: form.philhealth_number.trim(),
            tin_number: form.tin_number.trim(),
        };
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

        if (password) {
            payload.password = password;
        }
        if (photoUpload) {
            payload.photo_upload = photoUpload;
        }
        if (photoRemoveRequested) {
            payload.photo_remove = true;
        }

        setSaving(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/users.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.message || 'Failed to update profile.');
                return;
            }

            setSuccess(data.message || 'Profile updated successfully.');
            setProfile((prev) => prev ? { ...prev, first_name: form.first_name, last_name: form.last_name, email: form.email, date_of_birth: form.date_of_birth, sss_number: form.sss_number, pagibig_number: form.pagibig_number, philhealth_number: form.philhealth_number, tin_number: form.tin_number } : prev);
            if (useFloatingEditProfile) {
                await loadEditAccessStatus();
            }
            await refreshSession({ force: true });
            if (useFloatingEditProfile) {
                setEditProfileOpen(false);
            }
        } catch {
            setError('Failed to update profile. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleRequestAccessSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!useFloatingEditProfile) return;

        setRequestSubmitting(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/edit-requests.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    request_reason: requestReason.trim(),
                }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.message || 'Failed to submit edit access request.');
                return;
            }

            setSuccess(data.message || 'Edit access request submitted successfully.');
            const submittedReason = requestReason.trim();
            setRequestReason('');
            setRequestAccessOpen(false);
            const requestId = Date.now();
            setEditAccessStatus((prev) => prev ? {
                ...prev,
                eligible: false,
                pending_request: { request_id: requestId, status: 'pending', created_at: new Date().toISOString(), request_reason: submittedReason } as EditAccessRequestRecord,
                latest_request: { request_id: requestId, status: 'pending', created_at: new Date().toISOString(), request_reason: submittedReason } as EditAccessRequestRecord,
            } : prev);
        } catch {
            setError('Failed to submit edit access request.');
        } finally {
            setRequestSubmitting(false);
        }
    };

    const renderEditProfileForm = (isFloating = false) => (
        <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14, padding: 12, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}>
                <label style={{ display: 'block', marginBottom: 8, color: '#334155', fontSize: 13, fontWeight: 600 }}>Profile Picture</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ width: 68, height: 68, borderRadius: '999px', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', color: '#475569', fontSize: 14, fontWeight: 700 }}>
                        {photoPreview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={photoPreview} alt="Profile preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            `${(form.first_name || profile?.username || 'U').charAt(0).toUpperCase()}`
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhotoChange} />
                        {photoPreview && (
                            <button
                                type="button"
                                onClick={handleRemovePhoto}
                                style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff1f2', color: '#be123c', cursor: 'pointer' }}
                            >
                                Remove
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
                <div>
                    <label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>First Name</label>
                    <input type="text" name="first_name" value={form.first_name} onChange={handleInputChange} required style={{ width: '100%', padding: '9px 10px', borderRadius: 6, border: '1px solid #cbd5e1', color: '#0f172a' }} />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>Last Name</label>
                    <input type="text" name="last_name" value={form.last_name} onChange={handleInputChange} required style={{ width: '100%', padding: '9px 10px', borderRadius: 6, border: '1px solid #cbd5e1', color: '#0f172a' }} />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>Email</label>
                    <input type="email" name="email" value={form.email} onChange={handleInputChange} required pattern="^[^\s@]+@(gmail\.com|phinmaed\.com)$" title="Use a valid @gmail.com or @phinmaed.com email address." placeholder="example@phinmaed.com" style={{ width: '100%', padding: '9px 10px', borderRadius: 6, border: '1px solid #cbd5e1', color: '#0f172a' }} />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>Birthdate</label>
                    <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleInputChange} style={{ width: '100%', padding: '9px 10px', borderRadius: 6, border: '1px solid #cbd5e1', color: '#0f172a' }} />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>Username</label>
                    <input type="text" value={profile?.username || ''} disabled style={{ width: '100%', padding: '9px 10px', borderRadius: 6, border: '1px solid #cbd5e1', color: '#64748b', backgroundColor: '#f8fafc' }} />
                </div>
            </div>

            <div style={{ marginBottom: 14, border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                <div style={{ fontWeight: 700, color: '#1f2937', marginBottom: 10, fontSize: 13 }}>Government Numbers</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>SSS Number</label>
                        <input type="text" name="sss_number" value={form.sss_number} onChange={handleInputChange} placeholder="e.g. 12-3456789-0" style={{ width: '100%', padding: '9px 10px', borderRadius: 6, border: '1px solid #cbd5e1', color: '#0f172a' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>Pag-IBIG Number</label>
                        <input type="text" name="pagibig_number" value={form.pagibig_number} onChange={handleInputChange} placeholder="e.g. 1234-5678-9012" style={{ width: '100%', padding: '9px 10px', borderRadius: 6, border: '1px solid #cbd5e1', color: '#0f172a' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>PhilHealth Number</label>
                        <input type="text" name="philhealth_number" value={form.philhealth_number} onChange={handleInputChange} placeholder="e.g. 12-345678901-2" style={{ width: '100%', padding: '9px 10px', borderRadius: 6, border: '1px solid #cbd5e1', color: '#0f172a' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>TIN Number</label>
                        <input type="text" name="tin_number" value={form.tin_number} onChange={handleInputChange} placeholder="e.g. 123-456-789-000" style={{ width: '100%', padding: '9px 10px', borderRadius: 6, border: '1px solid #cbd5e1', color: '#0f172a' }} />
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: 14, border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#f8fafc' }}>
                <div style={{ fontWeight: 700, color: '#1f2937', marginBottom: 10, fontSize: 13 }}>Change Password (Optional)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>New Password</label>
                        <PasswordInput name="password" value={form.password} onChange={handleInputChange} placeholder="At least 8 characters" style={{ width: '100%', padding: '9px 10px', borderRadius: 6, border: '1px solid #cbd5e1', color: '#0f172a' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: 4, color: '#555', fontSize: 13 }}>Confirm Password</label>
                        <PasswordInput name="confirmPassword" value={form.confirmPassword} onChange={handleInputChange} placeholder="Repeat new password" style={{ width: '100%', padding: '9px 10px', borderRadius: 6, border: '1px solid #cbd5e1', color: '#0f172a' }} />
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: isFloating ? 'space-between' : 'flex-end', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {isFloating && (
                    <button
                        type="button"
                        onClick={() => !saving && setEditProfileOpen(false)}
                        style={{ padding: '10px 18px', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', color: '#475569', fontWeight: 700, opacity: saving ? 0.7 : 1 }}
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="submit"
                    disabled={saving}
                    title="Save Profile Changes"
                    aria-label="Save Profile Changes"
                    style={{
                        padding: '10px 18px',
                        background: '#1e3a8a',
                        border: 'none',
                        borderRadius: 8,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        color: 'white',
                        fontWeight: 700,
                        opacity: saving ? 0.7 : 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                    }}
                >
                    {saving ? 'Saving...' : (
                        <>
                            <CrudActionIcon action="save" />
                            <span>Save Changes</span>
                        </>
                    )}
                </button>
            </div>
        </form>
    );

    const activeEditAccess = editAccessStatus?.active_access ?? null;
    const pendingEditRequest = editAccessStatus?.pending_request ?? null;
    const latestEditRequest = editAccessStatus?.latest_request ?? null;
    const latestEditRequestStatus = String(latestEditRequest?.status || '').trim().toLowerCase();
    const latestEditRequestWasRevoked = Boolean(latestEditRequest?.archived_at) && latestEditRequestStatus === 'approved';
    const latestEditRequestWasRejected = latestEditRequestStatus === 'rejected'
        || (Boolean(latestEditRequest?.archived_at) && latestEditRequestStatus === 'pending');
    const canOpenFloatingEditProfile = !useFloatingEditProfile || Boolean(activeEditAccess);
    const floatingActionLabel = activeEditAccess ? 'Edit Profile' : 'Request Edit Access';

    if (authLoading || loading) {

      return (

        <Layout role={String(sessionUser?.role || '')} user={sessionUser} onLogout={logout}>

          <div style={{ padding: 20 }}>Loading...</div>

        </Layout>

      );

    }

    return (
        <Layout role={sessionUser?.role} user={sessionUser} onLogout={logout}>
            <Head>
                <title>My Profile</title>
            </Head>

            <div style={{ maxWidth: 1050, margin: '0 auto', padding: '16px' }}>
                <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ margin: '0 0 6px 0', fontSize: 14, color: '#1e293b' }}>My Profile</h1>
                        <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
                            {useFloatingEditProfile
                                ? 'View your account details. Staff and managers need approved edit access before profile changes can be made.'
                                : 'View all your account details and update your profile information.'}
                        </p>
                    </div>
                    {useFloatingEditProfile && (
                        <button
                            type="button"
                            disabled={editAccessLoading || Boolean(pendingEditRequest)}
                            onClick={() => {
                                if (canOpenFloatingEditProfile) {
                                    setEditProfileOpen(true);
                                    return;
                                }
                                setRequestAccessOpen(true);
                            }}
                            style={{
                                padding: '10px 16px',
                                borderRadius: 10,
                                border: '1px solid #bfdbfe',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                cursor: editAccessLoading || pendingEditRequest ? 'not-allowed' : 'pointer',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                boxShadow: '0 10px 25px rgba(37, 99, 235, 0.12)',
                                opacity: editAccessLoading || pendingEditRequest ? 0.7 : 1,
                            }}
                        >
                            <CrudActionIcon action={activeEditAccess ? 'edit' : 'create'} />
                            <span>
                                {editAccessLoading
                                    ? 'Checking Access...'
                                    : pendingEditRequest
                                        ? 'Request Pending'
                                        : floatingActionLabel}
                            </span>
                        </button>
                    )}
                </div>

                {useFloatingEditProfile && (
                    <div
                        style={{
                            marginBottom: 14,
                            padding: '12px 14px',
                            borderRadius: 12,
                            border: pendingEditRequest
                                ? '1px solid #fcd34d'
                                : latestEditRequestWasRejected || latestEditRequestWasRevoked
                                    ? '1px solid #fca5a5'
                                : activeEditAccess
                                    ? '1px solid #86efac'
                                    : '1px solid #bfdbfe',
                            background: pendingEditRequest
                                ? '#fffbeb'
                                : latestEditRequestWasRejected || latestEditRequestWasRevoked
                                    ? '#fef2f2'
                                : activeEditAccess
                                    ? '#f0fdf4'
                                    : '#eff6ff',
                        }}
                    >
                        <div style={{ color: '#0f172a', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                            {pendingEditRequest
                                ? 'Edit access request is pending review.'
                                : latestEditRequestWasRejected
                                    ? 'Your edit access request was rejected.'
                                    : latestEditRequestWasRevoked
                                        ? 'Your approved edit access was revoked.'
                                : activeEditAccess
                                    ? 'Edit access approved.'
                                    : 'Profile edits require approval first.'}
                        </div>
                        <div style={{ color: '#475569', fontSize: 12, lineHeight: 1.6 }}>
                            {pendingEditRequest
                                ? `Requested on ${formatDateTimeLabel(pendingEditRequest.created_at)}. You will receive an in-app alert and email once approval is granted.`
                                : latestEditRequestWasRejected
                                    ? `Your last request was rejected on ${formatDateTimeLabel(latestEditRequest?.archived_at || latestEditRequest?.created_at)}. Submit a new request if you still need to update your profile.`
                                    : latestEditRequestWasRevoked
                                        ? `Your approved edit access was revoked on ${formatDateTimeLabel(latestEditRequest?.archived_at || latestEditRequest?.approved_at)}. Any changes you already saved were kept.`
                                : activeEditAccess
                                    ? `Your access is active until ${formatDateTimeLabel(activeEditAccess.access_granted_until)}. Open the edit form before the access window expires.`
                                    : latestEditRequest?.used_at
                                        ? `Your last approved edit request was used on ${formatDateTimeLabel(latestEditRequest.used_at)}. Submit a new request whenever you need to change your details again.`
                                        : 'Submit an edit access request before changing your profile details. Once approved, you will be notified by email and in the system.'}
                        </div>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 14, marginBottom: 14 }}>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                        <h2 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#0f172a' }}>Account Snapshot</h2>
                        <div style={{ display: 'grid', gap: 8 }}>
                            <div><span style={{ color: '#64748b', fontSize: 12 }}>Username:</span> <strong>{profile?.username || '-'}</strong></div>
                            <div><span style={{ color: '#64748b', fontSize: 12 }}>Role:</span> <strong style={{ textTransform: 'capitalize' }}>{profile?.role || '-'}</strong></div>
                            <div><span style={{ color: '#64748b', fontSize: 12 }}>Status:</span> <strong style={{ textTransform: 'capitalize' }}>{profile?.status || '-'}</strong></div>
                            <div><span style={{ color: '#64748b', fontSize: 12 }}>Branch:</span> <strong>{profile?.branch_name || 'No Branch'}</strong></div>
                            <div><span style={{ color: '#64748b', fontSize: 12 }}>Documents:</span> <strong>{completionSummary}</strong></div>
                        </div>
                    </div>

                    <div id="employment-documents" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                        <h2 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#0f172a' }}>Employment Documents</h2>
                        <div style={{ display: 'grid', gap: 7 }}>
                            {PROFILE_DOCUMENT_FIELDS.map((item) => {
                                const submitted = isProfileDocumentSubmitted(profile?.[item.key]);
                                return (
                                    <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px' }}>
                                        <span style={{ color: '#334155', fontSize: 12 }}>{item.label}</span>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                fontWeight: 700,
                                                borderRadius: 999,
                                                padding: '2px 8px',
                                                color: submitted ? '#166534' : '#991b1b',
                                                background: submitted ? '#dcfce7' : '#fee2e2',
                                            }}
                                        >
                                            {submitted ? 'Submitted' : 'Missing'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {!useFloatingEditProfile && (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                        <h2 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#0f172a' }}>Edit Profile</h2>
                        {renderEditProfileForm()}
                    </div>
                )}
            </div>

            {useFloatingEditProfile && requestAccessOpen && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.52)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 20000,
                        padding: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <div
                        style={{
                            width: 'min(720px, 100%)',
                            background: '#ffffff',
                            borderRadius: 20,
                            boxShadow: '0 30px 80px rgba(15, 23, 42, 0.28)',
                            border: '1px solid rgba(148, 163, 184, 0.28)',
                            overflow: 'hidden',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                gap: 16,
                                padding: '20px 24px',
                                borderBottom: '1px solid #e2e8f0',
                                background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)',
                            }}
                        >
                            <div>
                                <h2 style={{ margin: '0 0 6px 0', fontSize: 14, color: '#0f172a' }}>Request Edit Access</h2>
                                <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                                    Submit this request first. Admin or manager reviewers will approve access before your profile can be edited.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => !requestSubmitting && setRequestAccessOpen(false)}
                                aria-label="Close Request Access"
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 999,
                                    border: '1px solid #cbd5e1',
                                    background: '#ffffff',
                                    color: '#475569',
                                    cursor: requestSubmitting ? 'not-allowed' : 'pointer',
                                    fontSize: 14,
                                    lineHeight: 1,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }}
                            >
                                X
                            </button>
                        </div>

                        <form onSubmit={handleRequestAccessSubmit} style={{ padding: 24 }}>
                            <div style={{ marginBottom: 14, padding: 12, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}>
                                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, marginBottom: 6 }}>What happens next</div>
                                <div style={{ color: '#475569', fontSize: 12, lineHeight: 1.7 }}>
                                    Once approved, you will receive an email and an in-app notification that your edit window is open. After you save your profile changes, that approval is consumed automatically.
                                </div>
                            </div>

                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: 'block', marginBottom: 6, color: '#334155', fontSize: 13, fontWeight: 600 }}>
                                    Reason or notes for the reviewer
                                </label>
                                <textarea
                                    value={requestReason}
                                    onChange={(event) => setRequestReason(event.target.value)}
                                    rows={5}
                                    placeholder="Optional: explain what details you need to update."
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: 10,
                                        border: '1px solid #cbd5e1',
                                        color: '#0f172a',
                                        resize: 'vertical',
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={() => !requestSubmitting && setRequestAccessOpen(false)}
                                    style={{
                                        padding: '10px 18px',
                                        background: 'transparent',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: 8,
                                        cursor: requestSubmitting ? 'not-allowed' : 'pointer',
                                        color: '#475569',
                                        fontWeight: 700,
                                        opacity: requestSubmitting ? 0.7 : 1,
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={requestSubmitting}
                                    style={{
                                        padding: '10px 18px',
                                        background: '#1e3a8a',
                                        border: 'none',
                                        borderRadius: 8,
                                        cursor: requestSubmitting ? 'not-allowed' : 'pointer',
                                        color: 'white',
                                        fontWeight: 700,
                                        opacity: requestSubmitting ? 0.7 : 1,
                                    }}
                                >
                                    {requestSubmitting ? 'Submitting...' : 'Submit Request'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {useFloatingEditProfile && editProfileOpen && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.52)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 20000,
                        padding: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <div
                        style={{
                            width: 'min(1120px, 100%)',
                            maxHeight: 'calc(100vh - 48px)',
                            background: '#ffffff',
                            borderRadius: 20,
                            boxShadow: '0 30px 80px rgba(15, 23, 42, 0.28)',
                            border: '1px solid rgba(148, 163, 184, 0.28)',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                gap: 16,
                                padding: '20px 24px',
                                borderBottom: '1px solid #e2e8f0',
                                background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)',
                            }}
                        >
                            <div>
                                <h2 style={{ margin: '0 0 6px 0', fontSize: 14, color: '#0f172a' }}>Edit Profile</h2>
                                <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
                                    Update your personal details, profile picture, government IDs, and password.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => !saving && setEditProfileOpen(false)}
                                aria-label="Close Edit Profile"
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 999,
                                    border: '1px solid #cbd5e1',
                                    background: '#ffffff',
                                    color: '#475569',
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                    fontSize: 14,
                                    lineHeight: 1,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <div style={{ padding: 24, overflowY: 'auto' }}>
                            {renderEditProfileForm(true)}
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
