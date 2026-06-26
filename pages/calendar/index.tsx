import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import CrudActionIcon from '../../components/CrudActionIcon';
import styles from '../../styles/CalendarManagement.module.css';
import { confirmAction, notifyError, notifySuccess } from '@/utils/notify';
import { getApiBaseUrl } from '@/utils/network';

const API_BASE = getApiBaseUrl();
const HOLIDAY_SYNC_STORAGE_KEY = 'capstone_holidays_sync';
const HOLIDAY_SYNC_EVENT = 'capstone:holidays-sync';
interface SessionUser {
    role?: string;
    [key: string]: unknown;
}

interface Holiday {
    holiday_id: number;
    holiday_name: string;
    holiday_date: string;
    holiday_type: string;
    holiday_scope: string;
    description?: string | null;
    source?: string | null;
    is_system?: number;
    created_at?: string | null;
    updated_at?: string | null;
}

interface HolidayComment {
    comment_id: number;
    holiday_id: number;
    user_id: number;
    parent_comment_id?: number | null;
    comment_text: string;
    commenter_name?: string;
    commenter_role?: string;
    created_at?: string;
    updated_at?: string;
}

interface HolidayForm {
    holiday_name: string;
    holiday_date: string;
    holiday_type: string;
    holiday_scope: string;
    description: string;
    source: string;
}

interface ApiResponse<T> {
    success?: boolean;
    data?: T;
    message?: string;
    error?: string;
}

interface FetchHolidayOptions {
    silent?: boolean;
}

const decodeHtmlEntities = (value: string) => {
    const text = String(value || '');
    if (!text.includes('&')) return text;
    return text
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&#x22;/gi, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ');
};

const pad2 = (value: number) => String(value).padStart(2, '0');

const toInputDate = (date: Date) =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const formatDate = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

const formatMonth = (date: Date) =>
    date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

const buildMonth = (year: number, month: number) => {
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
};

const holidayTypeOptions = [
    'Regular Holiday',
    'Special Non-Working Day',
    'Additional Special Non-Working Day',
    'Special Working Day',
    'Observance',
];

const scopeOptions = [
    'National Capital Region (NCR)',
    'Cordillera Administrative Region (CAR)',
    'Region I - Ilocos Region',
    'Region II - Cagayan Valley',
    'Region III - Central Luzon',
    'Region IV-A - CALABARZON',
    'Region IV-B - MIMAROPA',
    'Region V - Bicol Region',
    'Region VI - Western Visayas',
    'Region VII - Central Visayas',
    'Region VIII - Eastern Visayas',
    'Region IX - Zamboanga Peninsula',
    'Region X - Northern Mindanao',
    'Region XI - Davao Region',
    'Region XII - SOCCSKSARGEN',
    'Region XIII - Caraga',
    'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)',
];

const sourceOptions = [
    'Official Gazette',
    'Presidential Proclamation',
    'DOLE Advisory',
    'LGU Ordinance',
    'Company Policy',
    'Other',
];

const initialForm = (): HolidayForm => ({
    holiday_name: '',
    holiday_date: toInputDate(new Date()),
    holiday_type: 'Regular Holiday',
    holiday_scope: 'National',
    description: '',
    source: '',
});

const getHolidayBadgeClass = (type: string) => {
    const text = type.toLowerCase();
    if (text.includes('regular')) return styles.badgeRegular;
    if (text.includes('working')) return styles.badgeWorking;
    return styles.badgeSpecial;
};

export default function CalendarManagementPage() {
    const router = useRouter();
    const [user, setUser] = useState<SessionUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [calendarDate, setCalendarDate] = useState(() => new Date());
    const [fetching, setFetching] = useState(false);
    const [error, setError] = useState('');

    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'view' | 'edit' | 'create'>('view');
    const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);
    const [form, setForm] = useState<HolidayForm>(initialForm());
    const [saving, setSaving] = useState(false);
    const [comments, setComments] = useState<HolidayComment[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [commentSaving, setCommentSaving] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [replyTarget, setReplyTarget] = useState<HolidayComment | null>(null);
    const [sourceOption, setSourceOption] = useState(() =>
        sourceOptions.includes(initialForm().source) ? initialForm().source : 'Other'
    );
    const [customSource, setCustomSource] = useState('');
    const [scopeMode, setScopeMode] = useState<'list' | 'manual'>('list');
    const [customScope, setCustomScope] = useState('');
    const dateInputRef = useRef<HTMLInputElement | null>(null);
    const holidayRequestRef = useRef(0);

    const role = String(user?.role || '').toLowerCase();
    const isAdmin = role === 'admin';
    const canManage = ['admin', 'manager'].includes(role);
    const canComment = ['admin', 'manager', 'staff'].includes(role);
    const currentYear = calendarDate.getFullYear();
    const currentMonth = calendarDate.getMonth();
    const scopeIsNational = form.holiday_scope.trim().toLowerCase() === 'national';

    const normalizedHolidays = useMemo(
        () =>
            holidays.map((holiday) => ({
                ...holiday,
                holiday_name: decodeHtmlEntities(holiday.holiday_name),
                holiday_type: decodeHtmlEntities(holiday.holiday_type || ''),
                holiday_scope: decodeHtmlEntities(holiday.holiday_scope || ''),
                description: decodeHtmlEntities(String(holiday.description || '')),
                source: decodeHtmlEntities(String(holiday.source || '')),
            })),
        [holidays]
    );

    const holidaysByDate = useMemo(() => {
        const map = new Map<string, Holiday[]>();
        normalizedHolidays.forEach((holiday) => {
            const key = holiday.holiday_date;
            if (!map.has(key)) map.set(key, []);
            map.get(key)?.push(holiday);
        });
        return map;
    }, [normalizedHolidays]);

    const monthHolidays = useMemo(() => {
        const list = normalizedHolidays.filter((holiday) => {
            const date = new Date(`${holiday.holiday_date}T00:00:00`);
            return date.getFullYear() === currentYear && date.getMonth() === currentMonth;
        });
        return list.sort((a, b) => {
            if (a.holiday_date === b.holiday_date) return a.holiday_name.localeCompare(b.holiday_name);
            return a.holiday_date.localeCompare(b.holiday_date);
        });
    }, [currentMonth, currentYear, normalizedHolidays]);

    const weeks = useMemo(() => buildMonth(currentYear, currentMonth), [currentYear, currentMonth]);

    const checkSession = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/auth.php`, { credentials: 'include' });
            const data = (await res.json()) as ApiResponse<SessionUser>;
            if (!data?.success || !data.data) {
                router.push('/');
                return;
            }
            setUser(data.data);
        } catch {
            router.push('/');
        } finally {
            setLoading(false);
        }
    }, [router]);

    const handleLogout = async () => {
        await fetch(`${API_BASE}/auth.php?action=logout`, { method: 'POST', credentials: 'include' });
        router.push('/');
    };

    const notifyHolidayCalendarSync = useCallback((source = 'calendar') => {
        if (typeof window === 'undefined') return;
        const stamp = String(Date.now());
        try {
            localStorage.setItem(HOLIDAY_SYNC_STORAGE_KEY, stamp);
        } catch {
            // Ignore storage errors in restricted browser contexts.
        }
        window.dispatchEvent(new CustomEvent(HOLIDAY_SYNC_EVENT, { detail: { source, stamp } }));
    }, []);

    const fetchHolidays = useCallback(
        async (year: number, options?: FetchHolidayOptions) => {
            const requestId = holidayRequestRef.current + 1;
            holidayRequestRef.current = requestId;
            if (!options?.silent) {
                setFetching(true);
                setError('');
            }
            try {
                const res = await fetch(`${API_BASE}/holidays.php?year=${year}`, { credentials: 'include' });
                const data = (await res.json()) as ApiResponse<Holiday[]>;
                if (requestId !== holidayRequestRef.current) return;
                if (data?.success && Array.isArray(data.data)) {
                    setHolidays(data.data);
                    setError('');
                    return;
                }
                setHolidays([]);
                setError(String(data?.message || data?.error || 'Failed to load holidays.'));
            } catch {
                if (requestId !== holidayRequestRef.current) return;
                setHolidays([]);
                setError('Network error while loading holidays.');
            } finally {
                if (requestId === holidayRequestRef.current && !options?.silent) {
                    setFetching(false);
                }
            }
        },
        []
    );

    const fetchComments = useCallback(async (holidayId: number) => {
        if (!holidayId) return;
        setCommentsLoading(true);
        try {
            const res = await fetch(`${API_BASE}/holiday-comments.php?holiday_id=${holidayId}`, {
                credentials: 'include',
            });
            const data = (await res.json()) as ApiResponse<HolidayComment[]>;
            if (data?.success && Array.isArray(data.data)) {
                setComments(data.data);
            } else {
                setComments([]);
                notifyError(String(data?.message || data?.error || 'Failed to load comments.'));
            }
        } catch {
            setComments([]);
            notifyError('Failed to load comments.');
        } finally {
            setCommentsLoading(false);
        }
    }, []);

    useEffect(() => {
        checkSession();
    }, [checkSession]);

    useEffect(() => {
        if (user) {
            fetchHolidays(currentYear);
        }
    }, [currentYear, fetchHolidays, user]);

    useEffect(() => {
        if (!selectedHoliday || modalMode !== 'view') return;
        const latestHoliday =
            normalizedHolidays.find((holiday) => holiday.holiday_id === selectedHoliday.holiday_id) || null;

        if (!latestHoliday) {
            setModalOpen(false);
            setModalMode('view');
            setSelectedHoliday(null);
            setComments([]);
            setCommentText('');
            setReplyTarget(null);
            return;
        }

        const hasChanged =
            latestHoliday.holiday_name !== selectedHoliday.holiday_name ||
            latestHoliday.holiday_date !== selectedHoliday.holiday_date ||
            latestHoliday.holiday_type !== selectedHoliday.holiday_type ||
            latestHoliday.holiday_scope !== selectedHoliday.holiday_scope ||
            (latestHoliday.description || '') !== (selectedHoliday.description || '') ||
            (latestHoliday.source || '') !== (selectedHoliday.source || '');

        if (hasChanged) {
            setSelectedHoliday(latestHoliday);
        }
    }, [modalMode, normalizedHolidays, selectedHoliday]);

    useEffect(() => {
        if (!user) return;

        const refreshHolidayViews = () => {
            if (fetching || saving) return;
            void fetchHolidays(currentYear, { silent: true });
        };

        const onFocus = () => {
            refreshHolidayViews();
        };
        const onVisibilityChange = () => {
            if (!document.hidden) {
                refreshHolidayViews();
            }
        };

        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [currentYear, fetchHolidays, fetching, saving, user]);

    useEffect(() => {
        if (!user) return;

        const syncHolidayViews = () => {
            if (fetching || saving) return;
            void fetchHolidays(currentYear, { silent: true });
        };

        const onCustomSync = (event: Event) => {
            const customEvent = event as CustomEvent<{ source?: string }>;
            if (customEvent.detail?.source === 'calendar') return;
            syncHolidayViews();
        };
        const onStorageSync = (event: StorageEvent) => {
            if (event.key === HOLIDAY_SYNC_STORAGE_KEY) {
                syncHolidayViews();
            }
        };

        window.addEventListener(HOLIDAY_SYNC_EVENT, onCustomSync as EventListener);
        window.addEventListener('storage', onStorageSync);

        return () => {
            window.removeEventListener(HOLIDAY_SYNC_EVENT, onCustomSync as EventListener);
            window.removeEventListener('storage', onStorageSync);
        };
    }, [currentYear, fetchHolidays, fetching, saving, user]);

    const openHoliday = (holiday: Holiday) => {
        const resolvedSource = holiday.source || '';
        const resolvedSourceOption = sourceOptions.includes(resolvedSource) ? resolvedSource : 'Other';
        const resolvedScope = holiday.holiday_scope || 'National';
        const resolvedScopeMode = scopeOptions.includes(resolvedScope) ? 'list' : 'manual';
        setSelectedHoliday(holiday);
        setForm({
            holiday_name: holiday.holiday_name || '',
            holiday_date: holiday.holiday_date || '',
            holiday_type: holiday.holiday_type || 'Regular Holiday',
            holiday_scope: holiday.holiday_scope || 'National',
            description: holiday.description || '',
            source: holiday.source || '',
        });
        setSourceOption(resolvedSourceOption);
        setCustomSource(resolvedSourceOption === 'Other' ? resolvedSource : '');
        setScopeMode(resolvedScopeMode);
        setCustomScope(resolvedScopeMode === 'manual' ? resolvedScope : '');
        setModalMode('view');
        setModalOpen(true);
        setCommentText('');
        setReplyTarget(null);
        setComments([]);
        void fetchComments(holiday.holiday_id);
    };

    const openCreateHoliday = () => {
        if (!canManage) return;
        const today = new Date();
        const isCurrentMonth =
            today.getFullYear() === currentYear && today.getMonth() === currentMonth;
        const defaultDate = isCurrentMonth ? today : new Date(currentYear, currentMonth, 1);
        setSelectedHoliday(null);
        setForm({ ...initialForm(), holiday_date: toInputDate(defaultDate) });
        setSourceOption('Other');
        setCustomSource('');
        setScopeMode('list');
        setCustomScope('');
        setModalMode('create');
        setModalOpen(true);
        setCommentText('');
        setReplyTarget(null);
        setComments([]);
    };

    const closeModal = () => {
        setModalOpen(false);
        setModalMode('view');
        setSelectedHoliday(null);
        setComments([]);
        setCommentText('');
        setReplyTarget(null);
    };

    const handleFormChange = (field: keyof HolidayForm, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleScopeChange = (value: 'National' | 'Other') => {
        if (value === 'National') {
            handleFormChange('holiday_scope', 'National');
            setScopeMode('list');
            setCustomScope('');
            return;
        }
        if (scopeIsNational) {
            const fallbackScope = scopeOptions[0] || 'Other';
            setScopeMode('list');
            setCustomScope('');
            handleFormChange('holiday_scope', fallbackScope);
            return;
        }
        const isListValue = scopeOptions.includes(form.holiday_scope);
        setScopeMode(isListValue ? 'list' : 'manual');
        if (isListValue) {
            handleFormChange('holiday_scope', form.holiday_scope || scopeOptions[0]);
        } else {
            const nextCustom = form.holiday_scope || customScope;
            setCustomScope(nextCustom);
            handleFormChange('holiday_scope', nextCustom);
        }
    };

    const handleScopeModeChange = (mode: 'list' | 'manual') => {
        setScopeMode(mode);
        if (mode === 'list') {
            const nextScope = scopeOptions.includes(form.holiday_scope)
                ? form.holiday_scope
                : scopeOptions[0];
            handleFormChange('holiday_scope', nextScope);
            return;
        }
        const nextCustom =
            customScope || (scopeOptions.includes(form.holiday_scope) ? '' : form.holiday_scope);
        setCustomScope(nextCustom);
        handleFormChange('holiday_scope', nextCustom);
    };

    const handleCustomScopeChange = (value: string) => {
        setCustomScope(value);
        handleFormChange('holiday_scope', value);
    };

    const openDatePicker = () => {
        const input = dateInputRef.current;
        if (!input) return;
        const anyInput = input as HTMLInputElement & { showPicker?: () => void };
        if (typeof anyInput.showPicker === 'function') {
            anyInput.showPicker();
            return;
        }
        input.focus();
    };

    const handleSourceOptionChange = (value: string) => {
        setSourceOption(value);
        if (value === 'Other') {
            handleFormChange('source', customSource);
        } else {
            setCustomSource('');
            handleFormChange('source', value);
        }
    };

    const handleCustomSourceChange = (value: string) => {
        setCustomSource(value);
        handleFormChange('source', value);
    };

    const handleSave = async (event: FormEvent) => {
        event.preventDefault();
        if (!canManage) return;
        const isCreate = modalMode === 'create';
        if (!isCreate && !selectedHoliday) {
            notifyError('No holiday selected.');
            return;
        }
        setSaving(true);

        const payload = {
            holiday_name: form.holiday_name.trim(),
            holiday_date: form.holiday_date,
            holiday_type: form.holiday_type,
            holiday_scope: form.holiday_scope,
            description: form.description,
            source: form.source,
        } as Record<string, unknown>;
        if (!isCreate && selectedHoliday) {
            payload.holiday_id = selectedHoliday.holiday_id;
        }

        try {
            const res = await fetch(`${API_BASE}/holidays.php`, {
                method: isCreate ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            const data = (await res.json()) as ApiResponse<{ holiday_id?: number }>;
            if (!data?.success) {
                notifyError(
                    String(data?.message || data?.error || `Failed to ${isCreate ? 'add' : 'save'} holiday.`)
                );
                return;
            }
            notifySuccess(isCreate ? 'Holiday added successfully.' : 'Holiday updated successfully.');
            closeModal();
            notifyHolidayCalendarSync();
            if (isCreate && data?.data?.holiday_id) {
                const optimistic: Holiday = {
                    holiday_id: data.data.holiday_id,
                    holiday_name: form.holiday_name,
                    holiday_date: form.holiday_date,
                    holiday_type: form.holiday_type,
                    holiday_scope: form.holiday_scope,
                    description: form.description || null,
                    source: form.source || null,
                };
                setHolidays(prev => [...prev, optimistic]);
            } else if (!isCreate && selectedHoliday) {
                setHolidays(prev =>
                    prev.map(h =>
                        h.holiday_id === selectedHoliday.holiday_id
                            ? { ...h, holiday_name: form.holiday_name, holiday_date: form.holiday_date, holiday_type: form.holiday_type, holiday_scope: form.holiday_scope, description: form.description, source: form.source }
                            : h
                    )
                );
            }
        } catch {
            notifyError(`Network error while ${isCreate ? 'adding' : 'saving'} holiday.`);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedHoliday || !canManage) return;
        const confirmed = await confirmAction({
            title: 'Delete holiday?',
            text: 'This will remove the holiday from the calendar.',
            confirmButtonText: 'Delete holiday',
            icon: 'warning',
            danger: true,
        });
        if (!confirmed) return;

        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/holidays.php?id=${selectedHoliday.holiday_id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const data = (await res.json()) as ApiResponse<unknown>;
            if (!data?.success) {
                notifyError(String(data?.message || data?.error || 'Failed to delete holiday.'));
                return;
            }
            notifySuccess('Holiday deleted.');
            closeModal();
            notifyHolidayCalendarSync();
            setHolidays(prev => prev.filter(h => h.holiday_id !== selectedHoliday!.holiday_id));
        } catch {
            notifyError('Network error while deleting holiday.');
        } finally {
            setSaving(false);
        }
    };

    const submitComment = async () => {
        if (!selectedHoliday || !canComment) return;
        const text = commentText.trim();
        if (!text) {
            notifyError('Comment cannot be empty.');
            return;
        }

        setCommentSaving(true);
        try {
            const res = await fetch(`${API_BASE}/holiday-comments.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    holiday_id: selectedHoliday.holiday_id,
                    comment_text: text,
                    parent_comment_id: replyTarget?.comment_id ?? null,
                }),
            });
            const data = (await res.json()) as ApiResponse<{ comment_id: number }>;
            if (!data?.success) {
                notifyError(String(data?.message || data?.error || 'Failed to post comment.'));
                return;
            }

            setCommentText('');
            setReplyTarget(null);
            notifySuccess('Comment posted.');
            await fetchComments(selectedHoliday.holiday_id);
        } catch {
            notifyError('Failed to post comment.');
        } finally {
            setCommentSaving(false);
        }
    };

    const handleDeleteComment = async (comment: HolidayComment) => {
        if (!isAdmin || !comment?.comment_id) return;
        const confirmed = await confirmAction({
            title: 'Delete comment?',
            text: 'This will remove the comment from the discussion.',
            confirmButtonText: 'Delete comment',
            icon: 'warning',
            danger: true,
        });
        if (!confirmed) return;

        try {
            const res = await fetch(`${API_BASE}/holiday-comments.php?comment_id=${comment.comment_id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const data = (await res.json()) as ApiResponse<unknown>;
            if (!data?.success) {
                notifyError(String(data?.message || data?.error || 'Failed to delete comment.'));
                return;
            }
            notifySuccess('Comment deleted.');
            if (selectedHoliday) {
                await fetchComments(selectedHoliday.holiday_id);
            }
        } catch {
            notifyError('Failed to delete comment.');
        }
    };

    const prevMonth = () => {
        const next = new Date(calendarDate);
        next.setMonth(calendarDate.getMonth() - 1);
        setCalendarDate(next);
    };

    const nextMonth = () => {
        const next = new Date(calendarDate);
        next.setMonth(calendarDate.getMonth() + 1);
        setCalendarDate(next);
    };

    const isToday = (day: number | null) => {
        if (!day) return false;
        const today = new Date();
        return (
            today.getFullYear() === currentYear &&
            today.getMonth() === currentMonth &&
            today.getDate() === day
        );
    };

    const renderDayCell = (day: number | null, index: number) => {
        if (!day) {
            return <div key={`empty-${index}`} className={`${styles.dayCell} ${styles.dayCellEmpty}`} />;
        }

        const dateStr = `${currentYear}-${pad2(currentMonth + 1)}-${pad2(day)}`;
        const dayHolidays = holidaysByDate.get(dateStr) || [];

        return (
            <div key={dateStr} className={`${styles.dayCell} ${isToday(day) ? styles.today : ''}`}>
                <div className={styles.dayNumber}>{day}</div>
                {dayHolidays.length > 0 && (
                    <div className={styles.holidayStack}>
                        {dayHolidays.slice(0, 2).map((holiday) => (
                            <button
                                key={holiday.holiday_id}
                                type="button"
                                className={styles.holidayPill}
                                onClick={() => openHoliday(holiday)}
                            >
                                {holiday.holiday_name}
                            </button>
                        ))}
                        {dayHolidays.length > 2 && (
                            <button
                                type="button"
                                className={styles.holidayMore}
                                onClick={() => openHoliday(dayHolidays[0])}
                            >
                                +{dayHolidays.length - 2} more
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <Layout role={user?.role as string | undefined} user={user} onLogout={handleLogout}>
                <div className={styles.page}>Loading calendar...</div>
            </Layout>
        );
    }

    return (
        <Layout role={user?.role as string | undefined} user={user} onLogout={handleLogout}>
            <Head>
                <title>Calendar Management</title>
            </Head>
            <div className={styles.page}>
                <section className={styles.hero} data-static-hover="true">
                    <div className={styles.heroTop}>
                        <div>
                            <h1 className={styles.title}>Company Calendar</h1>
                            <p className={styles.subtitle}>
                                Track Philippines holidays, plan coverage, and share observances with every team.
                            </p>
                        </div>
                        <div className={styles.heroActions}>
                            {canManage && (
                                <button type="button" className={styles.primaryButton} onClick={openCreateHoliday}>
                                    Add Holiday
                                </button>
                            )}
                            <button
                                className={styles.secondaryButton}
                                onClick={() => fetchHolidays(currentYear)}
                                disabled={fetching}
                            >
                                {fetching ? 'Refreshing...' : 'Refresh'}
                            </button>
                        </div>
                    </div>
                </section>

                <div className={styles.contentGrid}>
                    <section className={styles.panel}>
                        <div className={styles.calendarHeader}>
                            <div className={styles.calendarControls}>
                                <button type="button" className={styles.calendarButton} onClick={prevMonth}>
                                    Prev
                                </button>
                                <button type="button" className={styles.calendarButton} onClick={nextMonth}>
                                    Next
                                </button>
                            </div>
                            <div className={styles.monthTitle}>{formatMonth(calendarDate)}</div>
                        </div>
                        <div className={styles.calendarGrid}>
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                                <div key={day} className={styles.weekday}>
                                    {day}
                                </div>
                            ))}
                            {weeks.flat().map(renderDayCell)}
                        </div>
                        {error && <div className={styles.note}>{error}</div>}
                    </section>

                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <h2>{formatMonth(calendarDate)} holidays</h2>
                                <p>{monthHolidays.length} observance{monthHolidays.length === 1 ? '' : 's'}</p>
                            </div>
                        </div>
                        <div className={styles.holidayList}>
                            {monthHolidays.length === 0 && (
                                <div className={styles.emptyState}>
                                    No holidays listed for this month.
                                </div>
                            )}
                            {monthHolidays.map((holiday) => (
                                <button
                                    key={holiday.holiday_id}
                                    type="button"
                                    className={styles.holidayCard}
                                    onClick={() => openHoliday(holiday)}
                                >
                                    <div className={styles.holidayCardHead}>
                                        <h3 className={styles.holidayName}>{holiday.holiday_name}</h3>
                                        <span className={styles.holidayDate}>{formatDate(holiday.holiday_date)}</span>
                                    </div>
                                    <div className={styles.holidayMeta}>
                                        <span className={`${styles.badge} ${getHolidayBadgeClass(holiday.holiday_type)}`}>
                                            {holiday.holiday_type || 'Holiday'}
                                        </span>
                                        {holiday.holiday_scope && (
                                            <span className={styles.badge}>{holiday.holiday_scope}</span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>
                </div>
            </div>

            {modalOpen && (
                <div className={styles.modalBackdrop} onClick={closeModal}>
                    <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
                        <div className={styles.modalHead}>
                            <h3>
                                {modalMode === 'create'
                                    ? 'Add Calendar Holiday'
                                    : modalMode === 'edit'
                                      ? 'Edit Holiday'
                                      : 'Holiday Details'}
                            </h3>
                            <button type="button" onClick={closeModal}>
                                x
                            </button>
                        </div>

                        {modalMode === 'view' && selectedHoliday && (
                            <>
                                <div className={styles.viewGrid}>
                                    <div className={styles.viewItem}>
                                        <span>Holiday</span>
                                        <p>{selectedHoliday.holiday_name}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <span>Date</span>
                                        <p>{formatDate(selectedHoliday.holiday_date)}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <span>Type</span>
                                        <p>{selectedHoliday.holiday_type || 'Holiday'}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <span>Scope</span>
                                        <p>{selectedHoliday.holiday_scope || 'National'}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <span>Source</span>
                                        <p>{selectedHoliday.source || 'N/A'}</p>
                                    </div>
                                </div>
                                {selectedHoliday.description && (
                                    <div className={styles.note}>{selectedHoliday.description}</div>
                                )}

                                {canManage ? (
                                    <div className={styles.modalActions}>
                                        <button
                                            type="button"
                                            className={styles.secondaryButton}
                                            onClick={() => setModalMode('edit')}
                                        >
                                            <CrudActionIcon action="edit" />
                                            &nbsp;Edit
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.dangerButton}
                                            onClick={handleDelete}
                                            disabled={saving}
                                        >
                                            <CrudActionIcon action="delete" />
                                            &nbsp;Delete
                                        </button>
                                    </div>
                                ) : (
                                    <div className={styles.note}>
                                        Staff can view and comment on holidays but cannot edit them.
                                    </div>
                                )}

                                <div className={styles.commentSection}>
                                    <div className={styles.commentHead}>
                                        <span className={styles.commentTitle}>Comments</span>
                                        <button
                                            type="button"
                                            className={styles.commentRefresh}
                                            onClick={() => void fetchComments(selectedHoliday.holiday_id)}
                                            disabled={commentsLoading}
                                        >
                                            {commentsLoading ? 'Refreshing...' : 'Refresh'}
                                        </button>
                                    </div>

                                    <div className={styles.commentList}>
                                        {commentsLoading ? (
                                            <div className={styles.commentEmpty}>Loading comments...</div>
                                        ) : comments.length === 0 ? (
                                            <div className={styles.commentEmpty}>No comments yet.</div>
                                        ) : (
                                            comments.map((comment) => {
                                                const isReply = Boolean(comment.parent_comment_id);
                                                const isAdminComment =
                                                    String(comment.commenter_role || '').toLowerCase() === 'admin';
                                                return (
                                                    <div
                                                        key={comment.comment_id}
                                                        className={`${styles.commentCard} ${isReply ? styles.commentReply : ''} ${isAdminComment ? styles.adminComment : ''}`}
                                                    >
                                                        <div className={styles.commentHeader}>
                                                            <div className={styles.commentMeta}>
                                                                <span className={styles.commentName}>
                                                                    {comment.commenter_name || 'User'}
                                                                </span>
                                                                <span className={styles.commentRole}>
                                                                    {comment.commenter_role || '-'}
                                                                </span>
                                                                {isAdminComment && (
                                                                    <span className={styles.adminBadge}>Admin</span>
                                                                )}
                                                                {isReply && (
                                                                    <span className={styles.commentBadge}>Reply</span>
                                                                )}
                                                            </div>
                                                            <span className={styles.commentDate}>
                                                                {comment.created_at
                                                                    ? new Date(comment.created_at).toLocaleString()
                                                                    : '-'}
                                                            </span>
                                                        </div>
                                                        <div className={styles.commentText}>{comment.comment_text}</div>
                                                        <div className={styles.commentActionsRow}>
                                                            <button
                                                                type="button"
                                                                className={styles.commentActionButton}
                                                                onClick={() => setReplyTarget(comment)}
                                                            >
                                                                Reply
                                                            </button>
                                                            {isAdmin && (
                                                                <button
                                                                    type="button"
                                                                    className={styles.commentDeleteButton}
                                                                    onClick={() => void handleDeleteComment(comment)}
                                                                >
                                                                    Delete
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    {canComment && (
                                        <div className={styles.commentForm}>
                                            {replyTarget && (
                                                <div className={styles.replyBanner}>
                                                    <span>
                                                        Replying to {replyTarget.commenter_name || 'User'}:{' '}
                                                        &quot;{replyTarget.comment_text}&quot;
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className={styles.replyClear}
                                                        onClick={() => setReplyTarget(null)}
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                            )}
                                            <textarea
                                                className={`${styles.textarea} ${styles.commentTextarea}`}
                                                value={commentText}
                                                onChange={(event) => setCommentText(event.target.value)}
                                                placeholder="Write a comment or reply..."
                                            />
                                            <div className={styles.commentFormActions}>
                                                <button
                                                    type="button"
                                                    className={styles.primaryButton}
                                                    onClick={() => void submitComment()}
                                                    disabled={commentSaving || !commentText.trim()}
                                                >
                                                    {commentSaving ? 'Posting...' : 'Post Comment'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {modalMode !== 'view' && (
                            <form className={styles.modalForm} onSubmit={handleSave}>
                                <div className={styles.formRow}>
                                    <label className={styles.formLabel} htmlFor="holiday-name">
                                        Holiday Name
                                    </label>
                                    <div className={styles.formField}>
                                        <input
                                            id="holiday-name"
                                            className={styles.input}
                                            value={form.holiday_name}
                                            onChange={(event) => handleFormChange('holiday_name', event.target.value)}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className={styles.formRow}>
                                    <label className={styles.formLabel} htmlFor="holiday-type">
                                        Type
                                    </label>
                                    <div className={styles.formField}>
                                        <select
                                            id="holiday-type"
                                            className={styles.select}
                                            value={form.holiday_type}
                                            onChange={(event) => handleFormChange('holiday_type', event.target.value)}
                                        >
                                            {holidayTypeOptions.map((option) => (
                                                <option key={option} value={option}>
                                                    {option}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className={styles.formRow}>
                                    <span className={styles.formLabel}>Scope</span>
                                    <div className={styles.formField}>
                                        <div className={styles.radioGroup}>
                                            <label className={styles.radioOption}>
                                                <input
                                                    type="radio"
                                                    name="holiday_scope"
                                                    value="National"
                                                    checked={scopeIsNational}
                                                    onChange={() => handleScopeChange('National')}
                                                />
                                                <span>National</span>
                                            </label>
                                            <label className={styles.radioOption}>
                                                <input
                                                    type="radio"
                                                    name="holiday_scope"
                                                    value="Other"
                                                    checked={!scopeIsNational}
                                                    onChange={() => handleScopeChange('Other')}
                                                />
                                                <span>Other</span>
                                            </label>
                                        </div>
                                        {!scopeIsNational && (
                                            <div className={styles.scopePicker}>
                                                <div className={styles.scopeModeToggle}>
                                                    <label className={styles.radioOption}>
                                                        <input
                                                            type="radio"
                                                            name="holiday_scope_mode"
                                                            value="list"
                                                            checked={scopeMode === 'list'}
                                                            onChange={() => handleScopeModeChange('list')}
                                                        />
                                                        <span>Regional Source</span>
                                                    </label>
                                                    <label className={styles.radioOption}>
                                                        <input
                                                            type="radio"
                                                            name="holiday_scope_mode"
                                                            value="manual"
                                                            checked={scopeMode === 'manual'}
                                                            onChange={() => handleScopeModeChange('manual')}
                                                        />
                                                        <span>Manual input</span>
                                                    </label>
                                                </div>
                                                {scopeMode === 'list' ? (
                                                    <select
                                                        className={`${styles.select} ${styles.scopeSelect}`}
                                                        value={
                                                            scopeOptions.includes(form.holiday_scope)
                                                                ? form.holiday_scope
                                                                : scopeOptions[0]
                                                        }
                                                        onChange={(event) =>
                                                            handleFormChange('holiday_scope', event.target.value)
                                                        }
                                                    >
                                                        {scopeOptions.map((option) => (
                                                            <option key={option} value={option}>
                                                                {option}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        className={`${styles.input} ${styles.scopeManualInput}`}
                                                        value={customScope}
                                                        onChange={(event) =>
                                                            handleCustomScopeChange(event.target.value)
                                                        }
                                                        placeholder="Enter scope"
                                                        aria-label="Scope detail"
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className={styles.formRow}>
                                    <label className={styles.formLabel} htmlFor="holiday-date">
                                        Date
                                    </label>
                                    <div className={styles.formField}>
                                        <div className={styles.dateField}>
                                            <button
                                                type="button"
                                                className={styles.dateIconButton}
                                                onClick={openDatePicker}
                                                aria-label="Open calendar"
                                            >
                                                <svg viewBox="0 0 24 24" role="presentation">
                                                    <path
                                                        d="M7 3a1 1 0 0 1 1 1v1h8V4a1 1 0 1 1 2 0v1h1.5A2.5 2.5 0 0 1 22 7.5v10A2.5 2.5 0 0 1 19.5 20h-15A2.5 2.5 0 0 1 2 17.5v-10A2.5 2.5 0 0 1 4.5 5H6V4a1 1 0 0 1 1-1Zm12.5 7H4.5v7.5c0 .55.45 1 1 1h14c.55 0 1-.45 1-1V10ZM4.5 7a1 1 0 0 0-1 1v.5h17V8a1 1 0 0 0-1-1H18v1a1 1 0 1 1-2 0V7H8v1a1 1 0 1 1-2 0V7H4.5Z"
                                                        fill="currentColor"
                                                    />
                                                </svg>
                                            </button>
                                            <input
                                                id="holiday-date"
                                                type="date"
                                                className={styles.dateInput}
                                                ref={dateInputRef}
                                                value={form.holiday_date}
                                                onChange={(event) => handleFormChange('holiday_date', event.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className={styles.formRow}>
                                    <label className={styles.formLabel} htmlFor="holiday-source">
                                        Source
                                    </label>
                                    <div className={styles.formField}>
                                        <select
                                            id="holiday-source"
                                            className={styles.select}
                                            value={sourceOption}
                                            onChange={(event) => handleSourceOptionChange(event.target.value)}
                                        >
                                            {sourceOptions.map((option) => (
                                                <option key={option} value={option}>
                                                    {option}
                                                </option>
                                            ))}
                                        </select>
                                        {sourceOption === 'Other' && (
                                            <input
                                                className={`${styles.input} ${styles.sourceOtherInput}`}
                                                value={customSource}
                                                onChange={(event) => handleCustomSourceChange(event.target.value)}
                                                placeholder="Enter source"
                                                aria-label="Source detail"
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className={`${styles.formRow} ${styles.formRowTop}`}>
                                    <label className={styles.formLabel} htmlFor="holiday-notes">
                                        Notes
                                    </label>
                                    <div className={styles.formField}>
                                        <textarea
                                            id="holiday-notes"
                                            className={styles.textarea}
                                            value={form.description}
                                            onChange={(event) => handleFormChange('description', event.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className={`${styles.modalActions} ${styles.formActions}`}>
                                    <button
                                        type="button"
                                        className={styles.ghostButton}
                                        onClick={closeModal}
                                        disabled={saving}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className={`${styles.primaryButton} ${styles.modalPrimary}`}
                                        disabled={saving}
                                    >
                                        {saving
                                            ? modalMode === 'create'
                                                ? 'Adding...'
                                                : 'Saving...'
                                            : modalMode === 'create'
                                              ? 'Add Holiday'
                                              : 'Save Holiday'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </Layout>
    );
}
