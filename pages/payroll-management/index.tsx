import { type Dispatch, type SetStateAction, useState, useEffect, useMemo, useRef, useEffectEvent } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import Pagination from '../../components/Pagination';
import CrudActionIcon from '../../components/CrudActionIcon';
import s from '../../styles/Payroll.module.css';
import { getApiBaseUrl } from '@/utils/network';
import { confirmAction, notifyError, notifySuccess } from '@/utils/notify';
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, BarElement, ArcElement,
    Tooltip, Legend, Title
} from 'chart.js';
import { Bar, Doughnut, Pie } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend, Title);

const API = getApiBaseUrl();
const OPTS: RequestInit = { credentials: 'include' };
const AZ_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PESO_SYMBOL = '\u20B1';

const fmt = (v: number | string | null) => {
    const n = Number(v) || 0;
    return `${PESO_SYMBOL}${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const toNumber = (v: number | string | null | undefined) => Number(v) || 0;
const hasPositiveValues = (values: Array<number | string | null | undefined>) => values.some(value => Number(value) > 0);
const formatChartCurrencyTick = (value: number | string) => `${PESO_SYMBOL}${Number(value).toLocaleString('en-PH')}`;

type PayrollRecord = {
    id: number;
    employee_id: number;
    employee_name: string;
    full_employee_name?: string;
    branch_name?: string;
    pay_period_start: string;
    pay_period_end: string;
    basic_salary: number;
    overtime_hours: number;
    overtime_rate: number;
    overtime_pay: number;
    bonus: number;
    clothing_allowance: number;
    travel_allowance: number;
    salary_adjustment: number;
    late_deduction: number;
    absence_deduction: number;
    tax: number;
    sss_contribution: number;
    pagibig_contribution: number;
    philhealth_contribution: number;
    cash_advance_manual_deduction?: number;
    cash_advance_deduction: number;
    cash_advance_request_count?: number;
    cash_advance_request_total?: number;
    laptop_loan_deduction: number;
    other_deductions: number;
    gross_pay: number;
    total_deductions: number;
    net_pay: number;
    status: 'draft' | 'pending' | 'approved' | 'paid' | 'archived';
    notes: string;
    created_at: string;
};

type Employee = {
    employee_id: number;
    first_name: string;
    last_name: string;
    salary: number;
    status: string;
};

type BranchOption = {
    branch_id: number;
    branch_name: string;
    status?: string;
};

type AnalyticsMonthlyPoint = {
    month?: string | null;
    month_label?: string | null;
    total?: number | string | null;
};

type AnalyticsBranchPoint = {
    branch_name?: string | null;
    total?: number | string | null;
};

type AnalyticsContractPoint = {
    employment_type?: string | null;
    total?: number | string | null;
};

const calcAttendanceDeduction = (r: Pick<PayrollRecord, 'late_deduction' | 'absence_deduction'>) => (
    toNumber(r.late_deduction) + toNumber(r.absence_deduction)
);

const calcGovDeductions = (r: Pick<PayrollRecord, 'tax' | 'sss_contribution' | 'pagibig_contribution' | 'philhealth_contribution'>) => (
    toNumber(r.tax) + toNumber(r.sss_contribution) + toNumber(r.pagibig_contribution) + toNumber(r.philhealth_contribution)
);

const calcLoanDeductions = (r: Pick<PayrollRecord, 'cash_advance_deduction' | 'laptop_loan_deduction' | 'other_deductions'>) => (
    toNumber(r.cash_advance_deduction) + toNumber(r.laptop_loan_deduction) + toNumber(r.other_deductions)
);

const calcAllDeductions = (r: PayrollRecord) => (
    calcAttendanceDeduction(r) + calcGovDeductions(r) + calcLoanDeductions(r)
);

const calcGrossBeforeAttendance = (r: PayrollRecord) => (
    toNumber(r.basic_salary)
    + toNumber(r.overtime_pay)
    + toNumber(r.clothing_allowance)
    + toNumber(r.travel_allowance)
    + toNumber(r.salary_adjustment)
);

const badgeClass: Record<string, string> = {
    draft: s.badgeDraft,
    pending: s.badgePending,
    approved: s.badgeApproved,
    paid: s.badgePaid,
    archived: s.badgeArchived,
};

const defaultForm = {
    employee_id: '',
    pay_period_start: '',
    pay_period_end: '',
    overtime_hours: '0',
    overtime_rate: '0',
    bonus: '0',
    clothing_allowance: '0',
    travel_allowance: '0',
    salary_adjustment: '0',
    late_deduction: '0',
    absence_deduction: '0',
    tax: '0',
    sss_contribution: '0',
    pagibig_contribution: '0',
    philhealth_contribution: '0',
    cash_advance_deduction: '0',
    laptop_loan_deduction: '0',
    other_deductions: '0',
    status: 'draft',
    notes: '',
};

const todayDateValue = () => {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 10);
};

/** Helper: return 1st-half and 2nd-half date ranges for a given month */
const getPayPeriodDates = (half: 1 | 2) => {
    const now = new Date();
    const today = now.getDate();
    const targetMonth = half === 2 && today < 16
        ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
        : new Date(now.getFullYear(), now.getMonth(), 1);
    const y = targetMonth.getFullYear();
    const m = String(targetMonth.getMonth() + 1).padStart(2, '0');
    const isCurrentMonth = targetMonth.getFullYear() === now.getFullYear() && targetMonth.getMonth() === now.getMonth();

    if (half === 1) {
        const endDay = isCurrentMonth ? Math.min(15, today) : 15;
        return { start: `${y}-${m}-01`, end: `${y}-${m}-${String(endDay).padStart(2, '0')}` };
    }

    const lastDay = new Date(y, targetMonth.getMonth() + 1, 0).getDate();
    const endDay = isCurrentMonth ? today : lastDay;
    return { start: `${y}-${m}-16`, end: `${y}-${m}-${String(endDay).padStart(2, '0')}` };
};

const validatePayPeriodRange = (start: string, end: string) => {
    if (!start || !end) return 'Please set the pay period dates';
    if (start > end) return 'Pay period start date cannot be after the end date';

    const today = todayDateValue();
    if (start > today || end > today) {
        return `Pay period cannot go beyond the current date (${today})`;
    }

    return '';
};

export default function PayrollManagement() {
    const router = useRouter();
    const ITEMS_PER_PAGE = 10;
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const isMountedRef = useRef(true);
    const recordsRequestRef = useRef(0);
    const analyticsRequestRef = useRef(0);

    // Data
    const [records, setRecords] = useState<PayrollRecord[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [analytics, setAnalytics] = useState<any>(null);

    // UI state
    const [activeTab, setActiveTab] = useState<'records' | 'analytics'>('records');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [periodStart, setPeriodStart] = useState('');
    const [periodEnd, setPeriodEnd] = useState('');
    const [analyticsBranchId, setAnalyticsBranchId] = useState('all');
    const [azFilterMode, setAzFilterMode] = useState<'all' | 'range'>('all');
    const [azStart, setAzStart] = useState('A');
    const [azEnd, setAzEnd] = useState('Z');
    const [azCardOpen, setAzCardOpen] = useState(false);
    const azFilterRef = useRef<HTMLDivElement | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [formSaving, setFormSaving] = useState(false);
    const [updatingIds, setUpdatingIds] = useState<number[]>([]);
    const [recalculatingIds, setRecalculatingIds] = useState<number[]>([]);
    const selectAllRef = useRef<HTMLInputElement | null>(null);

    // Modals
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<PayrollRecord | null>(null);
    const [viewRecord, setViewRecord] = useState<PayrollRecord | null>(null);
    const viewTotals = useMemo(() => {
        if (!viewRecord) return null;
        const attendance = calcAttendanceDeduction(viewRecord);
        const gov = calcGovDeductions(viewRecord);
        const loans = calcLoanDeductions(viewRecord);
        const totalAll = attendance + gov + loans;
        const grossBefore = calcGrossBeforeAttendance(viewRecord);
        return { attendance, gov, loans, totalAll, grossBefore };
    }, [viewRecord]);
    const viewCashAdvanceBreakdown = useMemo(() => {
        if (!viewRecord) {
            return { requestCount: 0, requestTotal: 0, manualTotal: 0 };
        }

        return {
            requestCount: Math.max(0, Math.floor(toNumber(viewRecord.cash_advance_request_count))),
            requestTotal: toNumber(viewRecord.cash_advance_request_total),
            manualTotal: toNumber(viewRecord.cash_advance_manual_deduction),
        };
    }, [viewRecord]);
    const [formData, setFormData] = useState({ ...defaultForm });
    const [formSalary, setFormSalary] = useState(0);
    const [formError, setFormError] = useState('');

    // Import modal state
    const [showImportModal, setShowImportModal] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importPeriodStart, setImportPeriodStart] = useState('');
    const [importPeriodEnd, setImportPeriodEnd] = useState('');
    const [importSourceSystem, setImportSourceSystem] = useState('payroll_excel');
    const [importLoading, setImportLoading] = useState(false);
    const [importResult, setImportResult] = useState<any>(null);
    const [importError, setImportError] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const today = todayDateValue();
    const isArchiveStorageView = statusFilter === 'archived';

    // ── Session ──
    useEffect(() => {
        void checkSession();
        return () => {
            isMountedRef.current = false;
        };
    }, []);
    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (!azCardOpen) return;
            const target = event.target as Node | null;
            if (azFilterRef.current && target && azFilterRef.current.contains(target)) return;
            setAzCardOpen(false);
        };
        const handleKey = (event: KeyboardEvent) => {
            if (!azCardOpen) return;
            if (event.key === 'Escape') setAzCardOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [azCardOpen]);
    useEffect(() => {
        if (!formError) return;
        void notifyError(formError);
        setFormError('');
    }, [formError]);
    useEffect(() => {
        if (!importError) return;
        void notifyError(importError);
        setImportError('');
    }, [importError]);

    const checkSession = async () => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => {
            controller.abort();
        }, 12000);

        try {
            const res = await fetch(`${API}/auth.php`, { ...OPTS, signal: controller.signal });
            if (!res.ok) throw new Error(`Auth session request failed: ${res.status}`);
            const d = await res.json();
            if (d.success) {
                if (isMountedRef.current) {
                    setUser(d.data);
                    fetchAll();
                }
            }
            else {
                await router.replace('/');
            }
        } catch (error: unknown) {
            if ((error as { name?: string })?.name === 'AbortError') {
                void notifyError('Session check timed out. Please refresh and try again.');
            }
            await router.replace('/');
        }
        finally {
            window.clearTimeout(timeoutId);
            if (isMountedRef.current) setLoading(false);
        }
    };

    // ── Data fetching ──
    const fetchAll = () => { fetchRecords(); fetchEmployees(); fetchBranches(); fetchAnalytics(); };

    const fetchRecords = async () => {
        const requestId = recordsRequestRef.current + 1;
        recordsRequestRef.current = requestId;
        setRecordsLoading(true);
        try {
            let url = `${API}/payroll.php?`;
            if (periodStart) url += `period_start=${periodStart}&`;
            if (periodEnd) url += `period_end=${periodEnd}&`;
            if (statusFilter && statusFilter !== 'all') url += `status=${statusFilter}&`;
            const res = await fetch(url, OPTS);
            const d = await res.json();
            if (requestId !== recordsRequestRef.current) return;
            if (d.success) setRecords(d.data);
        } catch { console.error('Failed to fetch payroll records'); }
        finally {
            if (requestId === recordsRequestRef.current && isMountedRef.current) {
                setRecordsLoading(false);
            }
        }
    };

    const fetchEmployees = async () => {
        try {
            const res = await fetch(`${API}/employees.php`, OPTS);
            const d = await res.json();
            if (d.success) setEmployees(d.data.filter((e: Employee) => e.status === 'active'));
        } catch { console.error('Failed to fetch employees'); }
    };

    const fetchBranches = async () => {
        try {
            const res = await fetch(`${API}/branches.php?status=active`, OPTS);
            const d = await res.json();
            if (d.success) {
                setBranches(Array.isArray(d.data) ? d.data : []);
            }
        } catch { console.error('Failed to fetch branches'); }
    };

    const fetchAnalytics = async () => {
        const requestId = analyticsRequestRef.current + 1;
        analyticsRequestRef.current = requestId;
        setAnalyticsLoading(true);
        try {
            const params = new URLSearchParams();
            if (periodStart) params.set('start', periodStart);
            if (periodEnd) params.set('end', periodEnd);
            if (analyticsBranchId !== 'all') params.set('branch_id', analyticsBranchId);
            const query = params.toString();
            const res = await fetch(`${API}/payroll_analytics.php${query ? `?${query}` : ''}`, OPTS);
            const d = await res.json();
            if (requestId !== analyticsRequestRef.current) return;
            if (d.success) setAnalytics(d.data);
        } catch { console.error('Failed to fetch analytics'); }
        finally {
            if (requestId === analyticsRequestRef.current && isMountedRef.current) {
                setAnalyticsLoading(false);
            }
        }
    };
    const refreshRecords = useEffectEvent(() => {
        fetchRecords();
    });
    const refreshAnalytics = useEffectEvent(() => {
        fetchAnalytics();
    });

    // ── Filtering ──
    const filtered = useMemo(() => {
        const hasAzRange = azFilterMode === 'range';
        const startIndex = hasAzRange ? AZ_LETTERS.indexOf(azStart) : -1;
        const endIndex = hasAzRange ? AZ_LETTERS.indexOf(azEnd) : -1;
        const rangeFrom = hasAzRange ? Math.min(startIndex, endIndex) : -1;
        const rangeTo = hasAzRange ? Math.max(startIndex, endIndex) : -1;

        return records.filter(r => {
            const name = (r.full_employee_name || r.employee_name || '').toLowerCase();
            if (!isArchiveStorageView && r.status === 'archived') return false;
            if (searchTerm && !name.includes(searchTerm.toLowerCase())) return false;
            if (statusFilter !== 'all' && r.status !== statusFilter) return false;
            if (hasAzRange) {
                const lastName = (r.full_employee_name || r.employee_name || '').trim().split(/\s+/).pop() || '';
                const letter = lastName ? lastName[0].toUpperCase() : '';
                const letterIndex = AZ_LETTERS.indexOf(letter);
                if (letterIndex === -1 || letterIndex < rangeFrom || letterIndex > rangeTo) return false;
            }
            return true;
        });
    }, [records, searchTerm, statusFilter, azFilterMode, azStart, azEnd]);
    const selectableIds = useMemo(
        () => filtered
            .filter(record => isArchiveStorageView || record.status !== 'archived')
            .map(record => Number(record.id))
            .filter(id => Number.isFinite(id) && id > 0),
        [filtered, isArchiveStorageView]
    );
    const selectedIdSet = useMemo(
        () => new Set(
            selectedIds
                .map(id => Number(id))
                .filter(id => Number.isFinite(id) && id > 0)
        ),
        [selectedIds]
    );
    const selectedRecords = useMemo(
        () => filtered.filter(record => selectedIdSet.has(Number(record.id))),
        [filtered, selectedIdSet]
    );
    const hasPayableSelection = selectedRecords.some(record => record.status !== 'paid' && record.status !== 'archived');
    const hasReleasableSelection = selectedRecords.some(
        record => record.status !== 'approved' && record.status !== 'paid' && record.status !== 'archived'
    );
    const hasArchivableSelection = selectedRecords.some(record => record.status !== 'archived');
    const paginatedRecords = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    const visibleSelectableIds = useMemo(
        () => paginatedRecords
            .filter(record => isArchiveStorageView || record.status !== 'archived')
            .map(record => Number(record.id))
            .filter(id => Number.isFinite(id) && id > 0),
        [paginatedRecords, isArchiveStorageView]
    );
    const allVisibleSelected = visibleSelectableIds.length > 0 && visibleSelectableIds.every(id => selectedIdSet.has(id));
    const someVisibleSelected = visibleSelectableIds.some(id => selectedIdSet.has(id));
    const allSelectedApproved = selectedRecords.length > 0 && selectedRecords.every(record => record.status === 'approved');
    const releasableRecords = useMemo(
        () => filtered.filter(record => record.status !== 'approved' && record.status !== 'paid' && record.status !== 'archived'),
        [filtered]
    );
    const selectedUnreleaseIds = useMemo(
        () => selectedRecords.filter(record => record.status === 'approved').map(record => record.id),
        [selectedRecords]
    );

    const lastNameOf = (record: PayrollRecord) => {
        const fullName = String(record.full_employee_name || record.employee_name || '').trim();
        if (!fullName) return '';
        const parts = fullName.split(/\s+/);
        return parts[parts.length - 1]?.toLowerCase() || '';
    };

    const sortByLastName = (records: PayrollRecord[]) =>
        [...records].sort((a, b) => {
            const lastA = lastNameOf(a);
            const lastB = lastNameOf(b);
            if (lastA !== lastB) return lastA.localeCompare(lastB);
            const fullA = String(a.full_employee_name || a.employee_name || '').toLowerCase();
            const fullB = String(b.full_employee_name || b.employee_name || '').toLowerCase();
            if (fullA !== fullB) return fullA.localeCompare(fullB);
            return a.id - b.id;
        });
    const archivedIdsSorted = sortByLastName(
        filtered.filter(record => record.status === 'archived')
    ).map(record => record.id);

    const selectedReleaseIdsSorted = useMemo(
        () => sortByLastName(selectedRecords.filter(record => record.status !== 'approved' && record.status !== 'paid' && record.status !== 'archived'))
            .map(record => record.id),
        [selectedRecords]
    );
    const selectedArchivedIdsSorted = useMemo(
        () => sortByLastName(selectedRecords.filter(record => record.status === 'archived'))
            .map(record => record.id),
        [selectedRecords]
    );
    const releasableIdsSorted = useMemo(
        () => sortByLastName(releasableRecords).map(record => record.id),
        [releasableRecords]
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, searchTerm, statusFilter, periodStart, periodEnd, azFilterMode, azStart, azEnd]);

    useEffect(() => {
        setSelectedIds(prev => prev.filter(id => selectableIds.includes(id)));
    }, [selectableIds]);

    // selectAllRef indeterminate effect removed — checkbox replaced with button UI

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [filtered.length, currentPage]);

    // ── Form helpers ──
    const onInput = (e: any) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));

        if (name === 'employee_id') {
            const emp = employees.find(emp => emp.employee_id === Number(value));
            setFormSalary(emp ? Number(emp.salary) : 0);
        }
    };

    const calc = useMemo(() => {
        const ot_hours = Number(formData.overtime_hours) || 0;
        const ot_rate = Number(formData.overtime_rate) || 0;
        const ot_pay = ot_hours * ot_rate;

        const clothing = Number(formData.clothing_allowance) || 0;
        const travel = Number(formData.travel_allowance) || 0;
        const adj = Number(formData.salary_adjustment) || 0;

        const late = Number(formData.late_deduction) || 0;
        const absence = Number(formData.absence_deduction) || 0;

        // Gross: basic + OT + allowances + adjustments − attendance deductions (bonus excluded)
        const gross = formSalary + ot_pay + clothing + travel + adj - late - absence;

        const tax = Number(formData.tax) || 0;
        const sss = Number(formData.sss_contribution) || 0;
        const pagibig = Number(formData.pagibig_contribution) || 0;
        const phil = Number(formData.philhealth_contribution) || 0;
        const ca = Number(formData.cash_advance_deduction) || 0;
        const laptop = Number(formData.laptop_loan_deduction) || 0;
        const other = Number(formData.other_deductions) || 0;
        const total_ded = tax + sss + pagibig + phil + ca + laptop + other;

        const bonus = Number(formData.bonus) || 0;
        const net = Math.max(0, gross - total_ded + bonus);

        return { ot_pay, gross, total_ded, bonus, net };
    }, [formData, formSalary]);

    const applyPayPeriod = (half: 1 | 2) => {
        const dates = getPayPeriodDates(half);
        setFormData(prev => ({ ...prev, pay_period_start: dates.start, pay_period_end: dates.end }));
    };

    const openAdd = () => {
        setEditing(null);
        setFormData({ ...defaultForm });
        setFormSalary(0);
        setFormError('');
        setShowModal(true);
    };

    const openEdit = (r: PayrollRecord) => {
        setEditing(r);
        setFormData({
            employee_id: String(r.employee_id),
            pay_period_start: r.pay_period_start,
            pay_period_end: r.pay_period_end,
            overtime_hours: String(r.overtime_hours),
            overtime_rate: String(r.overtime_rate),
            bonus: String(r.bonus),
            clothing_allowance: String(r.clothing_allowance),
            travel_allowance: String(r.travel_allowance),
            salary_adjustment: String(r.salary_adjustment),
            late_deduction: String(r.late_deduction),
            absence_deduction: String(r.absence_deduction),
            tax: String(r.tax),
            sss_contribution: String(r.sss_contribution),
            pagibig_contribution: String(r.pagibig_contribution),
            philhealth_contribution: String(r.philhealth_contribution),
            cash_advance_deduction: String(r.cash_advance_manual_deduction ?? r.cash_advance_deduction),
            laptop_loan_deduction: String(r.laptop_loan_deduction),
            other_deductions: String(r.other_deductions),
            status: r.status,
            notes: r.notes || '',
        });
        setFormSalary(Number(r.basic_salary));
        setFormError('');
        setShowModal(true);
    };

    const handleSubmit = async (e: any) => {
        e.preventDefault();
        setFormError('');
        const isEdit = !!editing;
        const dateError = validatePayPeriodRange(formData.pay_period_start, formData.pay_period_end);
        if (dateError) {
            setFormError(dateError);
            return;
        }

        const payload: any = {
            employee_id: Number(formData.employee_id),
            pay_period_start: formData.pay_period_start,
            pay_period_end: formData.pay_period_end,
            overtime_hours: Number(formData.overtime_hours),
            overtime_rate: Number(formData.overtime_rate),
            bonus: Number(formData.bonus),
            clothing_allowance: Number(formData.clothing_allowance),
            travel_allowance: Number(formData.travel_allowance),
            salary_adjustment: Number(formData.salary_adjustment),
            late_deduction: Number(formData.late_deduction),
            absence_deduction: Number(formData.absence_deduction),
            tax: Number(formData.tax),
            sss_contribution: Number(formData.sss_contribution),
            pagibig_contribution: Number(formData.pagibig_contribution),
            philhealth_contribution: Number(formData.philhealth_contribution),
            cash_advance_deduction: Number(formData.cash_advance_deduction),
            laptop_loan_deduction: Number(formData.laptop_loan_deduction),
            other_deductions: Number(formData.other_deductions),
            status: formData.status,
            notes: formData.notes,
        };
        if (isEdit) payload.id = editing!.id;

        setFormSaving(true);
        try {
            const res = await fetch(`${API}/payroll.php`, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            const d = await res.json();
            if (d.success) {
                setShowModal(false);
                if (isEdit) {
                    setRecords(prev => prev.map(r =>
                        r.id === editing!.id ? { ...r, ...d.data } : r
                    ));
                } else {
                    if (d.data) setRecords(prev => [d.data, ...prev]);
                    else fetchRecords();
                }
            } else {
                setFormError(d.message || 'Operation failed');
            }
        } catch { setFormError('Network error'); }
        finally { setFormSaving(false); }
    };

    const toggleRecordSelection = (payrollId: number | string) => {
        const normalizedId = Number(payrollId);
        if (!Number.isFinite(normalizedId) || normalizedId <= 0) return;

        setSelectedIds(prev =>
            prev.includes(normalizedId)
                ? prev.filter(id => id !== normalizedId)
                : [...prev, normalizedId]
        );
    };

    const toggleSelectAll = () => {
        setSelectedIds(prev => {
            const normalizedPrev = prev
                .map(id => Number(id))
                .filter(id => Number.isFinite(id) && id > 0);

            if (allVisibleSelected) {
                return normalizedPrev.filter(id => !visibleSelectableIds.includes(id));
            }

            const merged = new Set(normalizedPrev);
            visibleSelectableIds.forEach(id => merged.add(id));
            return Array.from(merged);
        });
    };

    const updateBusyIds = (setter: Dispatch<SetStateAction<number[]>>, ids: number[], active: boolean) => {
        const normalizedIds = ids.map(Number).filter(id => Number.isFinite(id) && id > 0);
        if (normalizedIds.length === 0) return;
        setter(prev => {
            const current = new Set(prev);
            normalizedIds.forEach(id => active ? current.add(id) : current.delete(id));
            return Array.from(current);
        });
    };

    const isIdBusy = (id: number) => updatingIds.includes(id) || recalculatingIds.includes(id);

    const updatePayrollStatus = async (
        targetIds: number[],
        nextStatus: 'approved' | 'draft' | 'paid' | 'archived',
        mode: 'single' | 'bulk' | 'bulk-az',
        originStatus?: PayrollRecord['status']
    ) => {
        if (targetIds.length === 0) return;

        const isRevertPaid = originStatus === 'paid' && nextStatus === 'approved';
        const isRestoreFromArchive = originStatus === 'archived' && nextStatus === 'approved';
        const actionLabel = isRevertPaid
            ? 'revert to approved'
            : isRestoreFromArchive
            ? 'restore'
            : nextStatus === 'approved'
            ? 'release'
            : nextStatus === 'draft'
                ? 'unrelease'
            : nextStatus === 'paid'
                ? 'mark as paid'
                : 'archive';
        const actionTitle = isRevertPaid
            ? 'Revert to Approved'
            : isRestoreFromArchive
            ? 'Restore Payroll'
            : nextStatus === 'approved'
            ? 'Release payslip'
            : nextStatus === 'draft'
                ? 'Unrelease payslip'
            : nextStatus === 'paid'
                ? 'Mark payroll as paid'
                : 'Archive payroll';
        const actionButton = isRevertPaid
            ? 'Revert to Approved'
            : isRestoreFromArchive
            ? 'Restore'
            : nextStatus === 'approved'
            ? 'Release Payslip'
            : nextStatus === 'draft'
                ? 'Unrelease Payslip'
            : nextStatus === 'paid'
                ? 'Mark as Paid'
                : 'Archive';
        const actionIcon = nextStatus === 'archived' ? 'warning' : 'question';
        const actionDanger = nextStatus === 'archived';
        const isAlphabetical = mode === 'bulk-az';
        const actionHelp = isRevertPaid
            ? (mode === 'single'
                ? 'This will revert the selected payroll record to approved in case it was marked as paid by mistake.'
                : `This will revert ${targetIds.length} payroll record(s) to approved.`)
            : isRestoreFromArchive
            ? (mode === 'single'
                ? 'This will restore the selected archived payroll record and return it to active records as approved.'
                : `This will restore ${targetIds.length} archived payroll record(s) and return them to active records as approved.`)
            : nextStatus === 'approved'
            ? (mode === 'single'
                ? 'This will release the selected payslip and make it available to the employee.'
                : isAlphabetical
                    ? `This will release ${targetIds.length} payslip(s) in A-Z order by last name and make them available to employees.`
                    : `This will release ${targetIds.length} selected payslip(s) and make them available to employees.`)
            : nextStatus === 'draft'
                ? (mode === 'single'
                    ? 'This will unrelease the selected payslip and hide it from the employee.'
                    : `This will unrelease ${targetIds.length} selected payslip(s) and hide them from employees.`)
            : mode === 'single'
                ? `This will ${actionLabel} the selected payroll record.`
                : `This will ${actionLabel} ${targetIds.length} selected payroll record(s).`;
        const confirmed = await confirmAction({
            title: `${actionTitle}?`,
            text: actionHelp,
            confirmButtonText: actionButton,
            icon: actionIcon,
            danger: actionDanger,
        });

        if (!confirmed) return;

        const previousRecords = new Map(records.map(record => [record.id, record]));
        updateBusyIds(setUpdatingIds, targetIds, true);
        setRecords(prev => prev.map(record =>
            targetIds.includes(record.id) ? { ...record, status: nextStatus } : record
        ));
        setViewRecord(prev => (
            prev && targetIds.includes(prev.id)
                ? { ...prev, status: nextStatus }
                : prev
        ));

        try {
            const payload = mode === 'single'
                ? { id: targetIds[0], status: nextStatus }
                : { ids: targetIds, status: nextStatus };

            const res = await fetch(`${API}/payroll.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            const d = await res.json();

            if (!d.success) {
                setRecords(prev => prev.map(record => {
                    const original = previousRecords.get(record.id);
                    return original ? { ...original } : record;
                }));
                setViewRecord(prev => {
                    if (!prev || !targetIds.includes(prev.id)) return prev;
                    const original = previousRecords.get(prev.id);
                    return original ? { ...original } : prev;
                });
                void notifyError(d.message || 'Failed to update payroll records.');
                return;
            }

            setSelectedIds([]);
            void notifySuccess(
                d.message || (isRevertPaid
                    ? 'Payroll reverted to approved.'
                    : isRestoreFromArchive
                        ? 'Payroll restored from archive.'
                    : nextStatus === 'approved'
                        ? 'Payslip released.'
                        : nextStatus === 'draft'
                            ? 'Payslip unreleased.'
                            : nextStatus === 'paid'
                                ? 'Payroll marked as paid.'
                                : 'Payroll archived.')
            );
        } catch {
            setRecords(prev => prev.map(record => {
                const original = previousRecords.get(record.id);
                return original ? { ...original } : record;
            }));
            setViewRecord(prev => {
                if (!prev || !targetIds.includes(prev.id)) return prev;
                const original = previousRecords.get(prev.id);
                return original ? { ...original } : prev;
            });
            void notifyError('Network error while updating payroll records.');
        } finally {
            updateBusyIds(setUpdatingIds, targetIds, false);
        }
    };

    const recalcGovernmentDeductions = async (recordId: number) => {
        if (recalculatingIds.includes(recordId)) return;

        const confirmed = await confirmAction({
            title: 'Recalculate government deductions?',
            text: 'This will recompute Withholding Tax, SSS, Pag-IBIG, and PhilHealth from Deduction Type settings based on the employee’s government numbers. Values are only filled when they are currently 0.',
            confirmButtonText: 'Recalculate',
            icon: 'question',
        });
        if (!confirmed) return;

        updateBusyIds(setRecalculatingIds, [recordId], true);
        try {
            const res = await fetch(`${API}/payroll.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: recordId }),
            });
            const d = await res.json();

            if (!d.success) {
                void notifyError(d.message || 'Failed to recalculate deductions.');
                return;
            }

            void notifySuccess('Government deductions recalculated.');
            const fresh = await fetch(`${API}/payroll.php?id=${recordId}`, OPTS);
            const freshData = await fresh.json();
            if (freshData.success && freshData.data) {
                setViewRecord(freshData.data);
                setRecords(prev => prev.map(r =>
                    r.id === recordId ? freshData.data : r
                ));
            }
        } catch {
            void notifyError('Network error while recalculating deductions.');
        } finally {
            updateBusyIds(setRecalculatingIds, [recordId], false);
        }
    };

    const toggleArchiveStorageView = () => {
        setActiveTab('records');
        setSelectedIds([]);
        setSearchTerm('');
        setPeriodStart('');
        setPeriodEnd('');
        setStatusFilter(prev => (prev === 'archived' ? 'all' : 'archived'));
    };

    const handleLogout = async () => {
        await fetch(`${API}/auth.php?action=logout`, { method: 'POST', credentials: 'include' });
        router.push('/');
    };

    // ── Import helpers ──
    const openImport = () => {
        setImportFile(null);
        setImportPeriodStart('');
        setImportPeriodEnd('');
        setImportResult(null);
        setImportError('');
        setShowImportModal(true);
    };

    const applyImportPeriod = (half: 1 | 2) => {
        const dates = getPayPeriodDates(half);
        setImportPeriodStart(dates.start);
        setImportPeriodEnd(dates.end);
    };

    const isSupportedImportFile = (file?: File | null) => {
        if (!file) return false;
        const name = file.name.toLowerCase();
        return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
    };

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (isSupportedImportFile(file)) {
            setImportFile(file);
            setImportError('');
        } else {
            setImportError('Only .xls, .xlsx, or .csv files are accepted');
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (isSupportedImportFile(file)) {
                setImportFile(file);
                setImportError('');
            } else {
                setImportError('Only .xls, .xlsx, or .csv files are accepted');
            }
        }
    };

    const handleImport = async () => {
        if (!importFile) { setImportError('Please select an Excel or CSV file'); return; }
        const dateError = validatePayPeriodRange(importPeriodStart, importPeriodEnd);
        if (dateError) { setImportError(dateError); return; }

        setImportLoading(true);
        setImportError('');
        setImportResult(null);

        const fd = new FormData();
        fd.append('file', importFile);
        fd.append('pay_period_start', importPeriodStart);
        fd.append('pay_period_end', importPeriodEnd);
        fd.append('source_system', importSourceSystem);

        try {
            const res = await fetch(`${API}/attendance_import.php`, {
                method: 'POST',
                credentials: 'include',
                body: fd,
            });

            const raw = await res.text();
            let d: any = null;
            try {
                d = raw ? JSON.parse(raw) : null;
            } catch {
                throw new Error(raw || `Import request failed with status ${res.status}`);
            }

            if (res.ok && d?.success) {
                setImportResult(d.data);
                fetchRecords();
            } else {
                setImportError(d?.message || `Import failed with status ${res.status}`);
            }
        } catch (error: any) {
            setImportError(error?.message || 'Network error during import');
        }
        finally { setImportLoading(false); }
    };

    const downloadTemplate = () => {
        window.open(`${API}/attendance_import.php?action=template`, '_blank');
    };

    // Re-fetch when filters change
    useEffect(() => {
        if (!user) return;
        refreshRecords();
    }, [user, statusFilter, periodStart, periodEnd]);
    useEffect(() => {
        if (!user) return;
        refreshAnalytics();
    }, [user, periodStart, periodEnd, analyticsBranchId]);

    // ── Chart data ──
    const monthlyChart = useMemo(() => {
        if (!Array.isArray(analytics?.charts?.monthly) || analytics.charts.monthly.length === 0) return null;
        const data = (analytics.charts.monthly as AnalyticsMonthlyPoint[])
            .map((point) => ({
                month: String(point.month || point.month_label || '').trim(),
                total: Number(point.total) || 0,
            }))
            .filter(point => point.month);
        if (data.length === 0 || !hasPositiveValues(data.map(point => point.total))) return null;
        return {
            labels: data.map(point => point.month),
            datasets: [{
                label: 'Net Payroll',
                data: data.map(point => point.total),
                backgroundColor: 'rgba(30,58,138,0.75)',
                borderColor: '#1e3a8a',
                borderWidth: 1,
                borderRadius: 6,
            }],
        };
    }, [analytics]);

    const breakdownChart = useMemo(() => {
        if (!analytics?.charts?.breakdown) return null;
        const entries = Object.entries(analytics.charts.breakdown as Record<string, number | string | null | undefined>)
            .map(([label, value]) => ({ label, value: Number(value) || 0 }))
            .filter(entry => entry.value > 0);
        if (entries.length === 0) return null;
        return {
            labels: entries.map(entry => entry.label),
            datasets: [{
                data: entries.map(entry => entry.value),
                backgroundColor: ['#1e3a8a', '#f59e0b', '#7c3aed', '#10b981'],
                borderWidth: 0,
            }],
        };
    }, [analytics]);

    const deductionBreakdownChart = useMemo(() => {
        if (!analytics?.charts?.deduction_breakdown) return null;
        const entries = Object.entries(analytics.charts.deduction_breakdown as Record<string, number | string | null | undefined>)
            .map(([label, value]) => ({ label, value: Number(value) || 0 }))
            .filter(entry => entry.value > 0);
        if (entries.length === 0) return null;
        return {
            labels: entries.map(entry => entry.label),
            datasets: [{
                data: entries.map(entry => entry.value),
                backgroundColor: ['#dc2626', '#f97316', '#f59e0b', '#2563eb', '#0ea5e9', '#14b8a6', '#8b5cf6', '#7c3aed', '#64748b'],
                borderWidth: 0,
            }],
        };
    }, [analytics]);

    const branchChart = useMemo(() => {
        if (!Array.isArray(analytics?.charts?.branch) || analytics.charts.branch.length === 0) return null;
        const data = (analytics.charts.branch as AnalyticsBranchPoint[])
            .map((point) => ({
                branch_name: String(point.branch_name || 'Unassigned').trim() || 'Unassigned',
                total: Number(point.total) || 0,
            }))
            .filter(point => point.total > 0);
        if (data.length === 0) return null;
        return {
            labels: data.map(point => point.branch_name || 'Unassigned'),
            datasets: [{
                label: 'Payroll',
                data: data.map(point => point.total),
                backgroundColor: ['#1e3a8a', '#059669', '#d97706', '#7c3aed', '#dc2626'],
                borderWidth: 0,
                borderRadius: 6,
            }],
        };
    }, [analytics]);

    const deductionBranchChart = useMemo(() => {
        if (!Array.isArray(analytics?.charts?.deduction_branch) || analytics.charts.deduction_branch.length === 0) return null;
        const data = (analytics.charts.deduction_branch as AnalyticsBranchPoint[])
            .map((point) => ({
                branch_name: String(point.branch_name || 'Unassigned').trim() || 'Unassigned',
                total: Number(point.total) || 0,
            }))
            .filter(point => point.total > 0);
        if (data.length === 0) return null;
        return {
            labels: data.map(point => point.branch_name || 'Unassigned'),
            datasets: [{
                label: 'Deductions',
                data: data.map(point => point.total),
                backgroundColor: ['#dc2626', '#f97316', '#f59e0b', '#8b5cf6', '#64748b'],
                borderWidth: 0,
                borderRadius: 6,
            }],
        };
    }, [analytics]);

    const contractChart = useMemo(() => {
        if (!Array.isArray(analytics?.charts?.contract_type) || analytics.charts.contract_type.length === 0) return null;
        const data = (analytics.charts.contract_type as AnalyticsContractPoint[])
            .map((point) => ({
                employment_type: String(point.employment_type || 'Unknown').trim() || 'Unknown',
                total: Number(point.total) || 0,
            }))
            .filter(point => point.total > 0);
        if (data.length === 0) return null;
        return {
            labels: data.map(point => point.employment_type || 'Unknown'),
            datasets: [{
                data: data.map(point => point.total),
                backgroundColor: ['#3b82f6', '#f59e0b', '#10b981', '#ef4444'],
                borderWidth: 0,
            }],
        };
    }, [analytics]);

    if (loading) {
      return (
        <>
            <Head><title>Payroll Management</title></Head>
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f4f6f8',
                padding: 16,
            }}>
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid #dbe4f0',
                    background: '#ffffff',
                    color: '#334155',
                    fontSize: 14,
                }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e3a8a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <polyline points="1 20 1 14 7 14"></polyline>
                        <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10"></path>
                        <path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14"></path>
                    </svg>
                    Loading payroll management...
                </div>
            </div>
        </>
      );

    }

    const kpi = analytics?.kpi;
    const viewBusy = viewRecord ? isIdBusy(viewRecord.id) : false;
    const canManage = user?.role !== 'staff';
    const analyticsBranchLabel = analyticsBranchId === 'all'
        ? 'All branches'
        : (branches.find(branch => String(branch.branch_id) === analyticsBranchId)?.branch_name || 'Selected branch');

    return (
        <Layout role={user?.role} user={user} onLogout={handleLogout}>
            <Head><title>Payroll Management</title></Head>

            {/* Page Header */}
            <div className={s.pageHeader}>
                <div className={s.pageTitleGroup}>
                    <h1 className={s.pageTitle}>Payroll Management</h1>
                    {canManage && (
                        <button
                            type="button"
                            className={isArchiveStorageView ? s.archiveStorageBtnActive : s.archiveStorageBtn}
                            onClick={toggleArchiveStorageView}
                            title={isArchiveStorageView ? 'Back to active payroll records' : 'Open payroll archive storage'}
                            aria-label={isArchiveStorageView ? 'Back to active payroll records' : 'Open payroll archive storage'}
                        >
                            <CrudActionIcon action="archive" size={15} />
                            {isArchiveStorageView ? 'Back to Active' : 'Archive Storage'}
                        </button>
                    )}
                </div>
                {user?.role !== 'staff' && (
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className={s.btnSecondary} onClick={openImport}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                            Import Attendance
                        </button>
                        <button className={s.btnPrimary} onClick={openAdd} title="Add Payroll" aria-label="Add Payroll">
                            <CrudActionIcon action="create" size={16} />
                        </button>
                    </div>
                )}
            </div>

            {/* KPI Cards */}
            <div className={s.kpiRow}>
                <div className={s.kpiCard}>
                    <div className={`${s.kpiIcon} ${s.kpiIconBlue}`}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                    </div>
                    <div>
                        <div className={s.kpiLabel}>Total Payroll</div>
                        <div className={s.kpiValue}>{fmt(kpi?.total_payroll)}</div>
                    </div>
                </div>
                <div className={s.kpiCard}>
                    <div className={`${s.kpiIcon} ${s.kpiIconGreen}`}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                    </div>
                    <div>
                        <div className={s.kpiLabel}>Active Headcount</div>
                        <div className={s.kpiValue}>{kpi?.headcount || 0}</div>
                    </div>
                </div>
                <div className={s.kpiCard}>
                    <div className={`${s.kpiIcon} ${s.kpiIconAmber}`}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                    </div>
                    <div>
                        <div className={s.kpiLabel}>Avg Salary</div>
                        <div className={s.kpiValue}>{fmt(kpi?.avg_salary)}</div>
                    </div>
                </div>
                <div className={s.kpiCard}>
                    <div className={`${s.kpiIcon} ${s.kpiIconPurple}`}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14c0 4-3 7-7 7s-7-3-7-7" /><path d="M5 10c0-4 3-7 7-7s7 3 7 7" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                    </div>
                    <div>
                        <div className={s.kpiLabel}>Total Deductions</div>
                        <div className={s.kpiValue}>{fmt(kpi?.total_deductions)}</div>
                    </div>
                </div>
                <div className={`${s.kpiCard} ${s.kpiSwitchCard}`}>
                    <div className={s.kpiSwitchMeta}>
                        <div className={s.kpiLabel}>Dashboard View</div>
                        <div className={s.kpiSwitchHint}>Open payroll records or analytics.</div>
                    </div>
                    <div className={s.kpiSwitchTabs}>
                        <button className={activeTab === 'records' ? s.tabActive : s.tab} onClick={() => setActiveTab('records')}>
                            Payroll Records
                        </button>
                        <button className={activeTab === 'analytics' ? s.tabActive : s.tab} onClick={() => setActiveTab('analytics')}>
                            Analytics
                        </button>
                    </div>
                </div>
            </div>

            {activeTab === 'records' && (
                <div className={s.toolbarRow}>
                    <div className={s.filtersBar}>
                        <div className={s.filterField}>
                            <label className={s.filterLabel}>Employee</label>
                            <div className={s.searchWrap}>
                                <svg className={s.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                <input className={s.searchInput} type="text" placeholder="Search by employee name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                        </div>
                        <div className={s.filterField}>
                            <label className={s.filterLabel}>Status</label>
                            <select className={s.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                                <option value="all">All Status</option>
                                <option value="draft">Draft</option>
                                <option value="pending">Pending</option>
                                <option value="approved">Approved</option>
                                <option value="paid">Paid</option>
                                <option value="archived">Archived</option>
                            </select>
                        </div>
                        <div className={s.filterField}>
                            <label className={s.filterLabel}>A-Z Filter</label>
                            <div className={s.azFilterWrap} ref={azFilterRef}>
                                <select
                                    className={s.filterSelect}
                                    value={azFilterMode}
                                    onClick={() => {
                                        if (azFilterMode === 'range') setAzCardOpen(true);
                                    }}
                                    onChange={e => {
                                        const next = e.target.value as 'all' | 'range';
                                        setAzFilterMode(next);
                                        setAzCardOpen(next === 'range');
                                        if (next === 'all') {
                                            setAzStart('A');
                                            setAzEnd('Z');
                                        }
                                    }}
                                >
                                    <option value="all">All</option>
                                    <option value="range">A-Z Range</option>
                                </select>
                                {azFilterMode === 'range' && azCardOpen && (
                                    <div className={s.azFilterCard}>
                                        <div className={s.azFilterHeader}>
                                            <span className={s.azFilterTitle}>A-Z Range</span>
                                            <button
                                                type="button"
                                                className={s.azFilterClose}
                                                aria-label="Close A-Z filter"
                                                onClick={() => setAzCardOpen(false)}
                                            >
                                                ×
                                            </button>
                                        </div>
                                        <div className={s.azFilterRow}>
                                            <span className={s.azFilterLabel}>Start</span>
                                            <select
                                                className={s.azFilterSelect}
                                                value={azStart}
                                                onChange={e => setAzStart(e.target.value)}
                                            >
                                                {AZ_LETTERS.map(letter => (
                                                    <option key={letter} value={letter}>{letter}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className={s.azFilterRow}>
                                            <span className={s.azFilterLabel}>End</span>
                                            <select
                                                className={s.azFilterSelect}
                                                value={azEnd}
                                                onChange={e => setAzEnd(e.target.value)}
                                            >
                                                {AZ_LETTERS.map(letter => (
                                                    <option key={letter} value={letter}>{letter}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className={s.azFilterHint}>
                                            Filters by last name initial.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className={s.filterField}>
                            <label className={s.filterLabel}>Period From</label>
                            <input className={s.filterDate} type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} title="Period From" />
                        </div>
                        <div className={s.filterField}>
                            <label className={s.filterLabel}>Period To</label>
                            <input className={s.filterDate} type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} title="Period To" />
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════ RECORDS TAB ═══════════════════════ */}
            {activeTab === 'records' && (
                <>
                    {canManage && (
                        <div className={s.bulkActionsBar}>
                            <div className={s.bulkMeta}>
                                <span className={s.bulkCount}>{selectedIds.length} selected</span>
                                <span className={s.bulkHint}>
                                    {isArchiveStorageView
                                        ? (archivedIdsSorted.length > 0
                                            ? `${archivedIdsSorted.length} archived record(s) in filtered view`
                                            : 'No archived payroll records in view')
                                        : (selectableIds.length > 0
                                            ? `${selectableIds.length} selectable record(s) in view`
                                            : 'No selectable payroll records')}
                                </span>
                                {selectedIds.length > 0 && (
                                    <button type="button" className={s.bulkClearBtn} onClick={() => setSelectedIds([])}>
                                        Clear
                                    </button>
                                )}
                            </div>
                            <div className={s.bulkButtons}>
                                {isArchiveStorageView ? (
                                    <>
                                        <button
                                            type="button"
                                            className={s.bulkBtn}
                                            disabled={selectedArchivedIdsSorted.length === 0}
                                            onClick={() => void updatePayrollStatus(selectedArchivedIdsSorted, 'approved', 'bulk', 'archived')}
                                            title="Restore selected archived payroll records"
                                        >
                                            <CrudActionIcon action="restore" />
                                            Restore Selected
                                        </button>
                                        <button
                                            type="button"
                                            className={s.bulkBtn}
                                            disabled={archivedIdsSorted.length === 0}
                                            onClick={() => void updatePayrollStatus(archivedIdsSorted, 'approved', 'bulk', 'archived')}
                                            title="Restore all archived payroll records currently in view"
                                        >
                                            <CrudActionIcon action="restore" />
                                            Restore All
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            className={s.bulkBtn}
                                            disabled={allSelectedApproved ? selectedUnreleaseIds.length === 0 : !hasReleasableSelection}
                                            onClick={() => {
                                                if (allSelectedApproved) {
                                                    void updatePayrollStatus(selectedUnreleaseIds, 'draft', 'bulk');
                                                    return;
                                                }
                                                void updatePayrollStatus(selectedReleaseIdsSorted, 'approved', 'bulk');
                                            }}
                                        >
                                            <CrudActionIcon action={allSelectedApproved ? 'cancel' : 'approve'} />
                                            {allSelectedApproved ? 'Unrelease Payslip' : 'Release Payslip'}
                                        </button>
                                        <button
                                            type="button"
                                            className={s.bulkBtn}
                                            disabled={releasableIdsSorted.length === 0}
                                            onClick={() => void updatePayrollStatus(releasableIdsSorted, 'approved', 'bulk-az')}
                                            title="Release all visible payslips in A-Z order by last name"
                                        >
                                            <CrudActionIcon action="approve" />
                                            Release A-Z
                                        </button>
                                        <button
                                            type="button"
                                            className={s.bulkBtn}
                                            disabled={!hasPayableSelection}
                                            onClick={() => void updatePayrollStatus(selectedIds, 'paid', 'bulk')}
                                        >
                                            <CrudActionIcon action="approve" />
                                            Mark Paid
                                        </button>
                                        <button
                                            type="button"
                                            className={s.bulkBtnDanger}
                                            disabled={!hasArchivableSelection}
                                            onClick={() => void updatePayrollStatus(selectedIds, 'archived', 'bulk')}
                                        >
                                            <CrudActionIcon action="archive" />
                                            Archive
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    <div className={s.tableWrap}>
                        <table className={s.table}>
                            <thead>
                                <tr>
                                    {canManage && (
                                        <th className={`${s.th} ${s.selectBtnCell}`}>
                                            <button
                                                type="button"
                                                className={`${s.selectBtn} ${allVisibleSelected && visibleSelectableIds.length > 0 ? s.selectBtnActive : ''}`}
                                                disabled={visibleSelectableIds.length === 0}
                                                onClick={toggleSelectAll}
                                                title={allVisibleSelected ? 'Deselect all on this page' : 'Select all on this page'}
                                            >
                                                {allVisibleSelected && visibleSelectableIds.length > 0 ? 'Deselect All' : 'Select All'}
                                            </button>
                                        </th>
                                    )}
                                    <th className={s.th}>Employee</th>
                                    <th className={s.th}>Period</th>
                                    <th className={s.th}>Gross (Before Attendance)</th>
                                    <th className={s.th}>Deductions</th>
                                    <th className={s.th}>Net Pay</th>
                                    <th className={s.th}>Status</th>
                                    <th className={s.th} style={{ textAlign: 'center', width: canManage ? 200 : 80 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={canManage ? 9 : 8} className={s.emptyState}>No payroll records found.</td></tr>
                                ) : paginatedRecords.map(r => {
                                    const rowBusy = isIdBusy(r.id);
                                    return (
                                        <tr key={r.id} className={selectedIdSet.has(Number(r.id)) ? s.selectedRow : ''}>
                                        {canManage && (
                                            <td className={`${s.td} ${s.selectBtnCell}`}>
                                                <button
                                                    type="button"
                                                    className={`${s.selectBtn} ${selectedIdSet.has(Number(r.id)) ? s.selectBtnActive : ''}`}
                                                    disabled={rowBusy}
                                                    onClick={() => toggleRecordSelection(r.id)}
                                                    title={rowBusy ? 'Wait for the current action to finish' : selectedIdSet.has(Number(r.id)) ? `Deselect ${r.full_employee_name || r.employee_name}` : `Select ${r.full_employee_name || r.employee_name}`}
                                                >
                                                    {selectedIdSet.has(Number(r.id)) ? '✓' : 'Select'}
                                                </button>
                                            </td>
                                        )}
                                        <td className={s.td} style={{ fontWeight: 600 }}>{r.full_employee_name || r.employee_name}</td>
                                        <td className={s.td} style={{ whiteSpace: 'nowrap' }}>
                                            {new Date(r.pay_period_start).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} –{' '}
                                            {new Date(r.pay_period_end).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </td>
                                        <td className={s.td}>{fmt(calcGrossBeforeAttendance(r))}</td>
                                        <td className={s.td} style={{ color: '#dc2626' }}>{fmt(calcAllDeductions(r))}</td>
                                        <td className={s.td} style={{ fontWeight: 700 }}>{fmt(r.net_pay)}</td>
                                        <td className={s.td}>
                                            {canManage && r.status === 'paid' ? (
                                                <button
                                                    type="button"
                                                    className={`${s.badge} ${badgeClass[r.status] || s.badgeDraft} ${s.badgeButton}`}
                                                    disabled={rowBusy}
                                                    title={rowBusy ? 'Working...' : 'Revert to Approved'}
                                                    aria-label={`Revert payroll for ${r.full_employee_name || r.employee_name} to approved`}
                                                    onClick={() => void updatePayrollStatus([r.id], 'approved', 'single', r.status)}
                                                >
                                                    {rowBusy ? 'Working' : r.status}
                                                </button>
                                            ) : (
                                                <span className={`${s.badge} ${badgeClass[r.status] || s.badgeDraft}`}>{r.status}</span>
                                            )}
                                        </td>
                                        <td className={s.td} style={{ textAlign: 'center' }}>
                                            <div className={s.actionsCell}>
                                                <button
                                                    className={`${s.actionInlineBtn} ${rowBusy ? s.isWorking : ''}`}
                                                    disabled={rowBusy}
                                                    title={rowBusy ? 'Working...' : 'View'}
                                                    aria-label={`View payroll for ${r.full_employee_name || r.employee_name}`}
                                                    onClick={() => setViewRecord(r)}
                                                >
                                                    <CrudActionIcon action="view" size={14} />
                                                </button>
                                                {canManage && (
                                                    <>
                                                        <button
                                                            className={`${s.actionInlineBtn} ${rowBusy ? s.isWorking : ''}`}
                                                            disabled={rowBusy}
                                                            title={rowBusy ? 'Working...' : 'Edit'}
                                                            aria-label={`Edit payroll for ${r.full_employee_name || r.employee_name}`}
                                                            onClick={() => openEdit(r)}
                                                        >
                                                            <CrudActionIcon action="edit" size={14} />
                                                        </button>
                                                        {r.status !== 'paid' && r.status !== 'archived' && (
                                                            <button
                                                                className={`${s.actionInlineBtn} ${s.actionInlineSuccess} ${rowBusy ? s.isWorking : ''}`}
                                                                disabled={rowBusy}
                                                                title={rowBusy ? 'Working...' : 'Mark as Paid'}
                                                                aria-label={`Mark payroll for ${r.full_employee_name || r.employee_name} as paid`}
                                                                onClick={() => void updatePayrollStatus([r.id], 'paid', 'single')}
                                                            >
                                                                <CrudActionIcon action="approve" size={14} />
                                                            </button>
                                                        )}
                                                        {r.status !== 'archived' && (
                                                            <button
                                                                className={`${s.actionInlineBtn} ${s.actionInlineDanger} ${rowBusy ? s.isWorking : ''}`}
                                                                disabled={rowBusy}
                                                                title={rowBusy ? 'Working...' : 'Archive'}
                                                                aria-label={`Archive payroll for ${r.full_employee_name || r.employee_name}`}
                                                                onClick={() => void updatePayrollStatus([r.id], 'archived', 'single')}
                                                            >
                                                                <CrudActionIcon action="archive" size={14} />
                                                            </button>
                                                        )}
                                                        {r.status === 'archived' && (
                                                            <button
                                                                className={`${s.actionInlineBtn} ${s.actionInlineSuccess} ${rowBusy ? s.isWorking : ''}`}
                                                                disabled={rowBusy}
                                                                title={rowBusy ? 'Working...' : 'Restore from Archive'}
                                                                aria-label={`Restore archived payroll for ${r.full_employee_name || r.employee_name}`}
                                                                onClick={() => void updatePayrollStatus([r.id], 'approved', 'single', r.status)}
                                                            >
                                                                <CrudActionIcon action="restore" size={14} />
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <Pagination
                        currentPage={currentPage}
                        totalItems={filtered.length}
                        itemsPerPage={ITEMS_PER_PAGE}
                        onPageChange={setCurrentPage}
                        label="payroll records"
                    />
                </>
            )}

            {/* ═══════════════════════ ANALYTICS TAB ═══════════════════════ */}
            {activeTab === 'analytics' && (
                <>
                    <h2 className={s.analyticsHeading}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                        Payroll Analytics
                    </h2>
                    <div style={{ marginTop: '-8px', marginBottom: '16px', color: '#64748b', fontSize: '13px' }}>
                        Includes approved, paid, and archived payroll records{periodStart || periodEnd ? ' within the selected period.' : '.'} Deduction analytics are calculated company-wide from each payroll deduction column. Current branch scope: {analyticsBranchLabel}.
                    </div>
                    <div className={s.toolbarRow}>
                        <div className={s.filtersBar} style={{ gridTemplateColumns: 'minmax(220px, 320px)', maxWidth: 320 }}>
                            <div className={s.filterField}>
                                <label className={s.filterLabel}>Branch Scope</label>
                                <select
                                    className={s.filterSelect}
                                    value={analyticsBranchId}
                                    onChange={e => setAnalyticsBranchId(e.target.value)}
                                >
                                    <option value="all">All Branches</option>
                                    {branches.map(branch => (
                                        <option key={branch.branch_id} value={String(branch.branch_id)}>
                                            {branch.branch_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className={s.chartsGrid}>
                        {/* Monthly Trend */}
                        <div className={s.chartCard}>
                            <h3 className={s.chartTitle}>Monthly Payroll Trend</h3>
                            {monthlyChart ? (
                                <Bar data={monthlyChart} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v: any) => formatChartCurrencyTick(v) } } } }} />
                            ) : <div className={s.emptyState}>No data yet</div>}
                        </div>

                        {/* Breakdown */}
                        <div className={s.chartCard}>
                            <h3 className={s.chartTitle}>Payroll Breakdown</h3>
                            {breakdownChart ? (
                                <div style={{ maxWidth: 280, margin: '0 auto' }}>
                                    <Doughnut data={breakdownChart} options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true } } } }} />
                                </div>
                            ) : <div className={s.emptyState}>No data yet</div>}
                        </div>

                        {/* By Branch */}
                        <div className={s.chartCard}>
                            <h3 className={s.chartTitle}>Payroll by Branch</h3>
                            {branchChart && branchChart.labels.length > 0 ? (
                                <Bar data={branchChart} options={{ indexAxis: 'y' as const, responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { callback: (v: any) => formatChartCurrencyTick(v) } } } }} />
                            ) : <div className={s.emptyState}>No data yet</div>}
                        </div>

                        {/* By Contract Type */}
                        <div className={s.chartCard}>
                            <h3 className={s.chartTitle}>Payroll by Contract Type</h3>
                            {contractChart && contractChart.labels.length > 0 ? (
                                <div style={{ maxWidth: 280, margin: '0 auto' }}>
                                    <Pie data={contractChart} options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true } } } }} />
                                </div>
                            ) : <div className={s.emptyState}>No data yet</div>}
                        </div>

                        {/* Deduction Breakdown */}
                        <div className={s.chartCard}>
                            <h3 className={s.chartTitle}>Company Deduction Breakdown</h3>
                            {deductionBreakdownChart ? (
                                <div style={{ maxWidth: 320, margin: '0 auto' }}>
                                    <Doughnut data={deductionBreakdownChart} options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { padding: 14, usePointStyle: true } } } }} />
                                </div>
                            ) : <div className={s.emptyState}>No deduction data yet</div>}
                        </div>

                        {/* Deductions by Branch */}
                        <div className={s.chartCard}>
                            <h3 className={s.chartTitle}>Deductions by Branch</h3>
                            {deductionBranchChart && deductionBranchChart.labels.length > 0 ? (
                                <Bar data={deductionBranchChart} options={{ indexAxis: 'y' as const, responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { callback: (v: any) => formatChartCurrencyTick(v) } } } }} />
                            ) : <div className={s.emptyState}>No deduction data yet</div>}
                        </div>
                    </div>
                </>
            )}

            {/* ═══════════════════════ ADD / EDIT MODAL ═══════════════════════ */}
            {showModal && (
                <div className={s.overlay} onClick={() => setShowModal(false)}>
                    <div className={s.modal} onClick={e => e.stopPropagation()}>
                        <div className={s.modalHeader}>
                            <h2 className={s.modalTitle}>{editing ? 'Edit Payroll' : 'Add Payroll'}</h2>
                            <button className={s.modalClose} onClick={() => setShowModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className={s.modalBody}>
                                {/* Employee & Salary */}
                                <div className={s.formGrid}>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Employee *</label>
                                        <select name="employee_id" value={formData.employee_id} onChange={onInput} required disabled={!!editing}>
                                            <option value="">-- Select Employee --</option>
                                            {employees.map(emp => (
                                                <option key={emp.employee_id} value={emp.employee_id}>
                                                    {emp.first_name} {emp.last_name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Basic Salary</label>
                                        <input type="text" value={fmt(formSalary)} disabled style={{ background: '#f8fafc' }} />
                                    </div>
                                </div>

                                {/* Pay Period with Quick-pick */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 4 }}>
                                    <span className={s.formLabel} style={{ marginBottom: 0 }}>Pay Period *</span>
                                    <button type="button" onClick={() => applyPayPeriod(1)} style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', color: '#475569' }}>1st Half</button>
                                    <button type="button" onClick={() => applyPayPeriod(2)} style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', color: '#475569' }}>2nd Half</button>
                                </div>
                                <div className={s.formGrid}>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Start</label>
                                        <input type="date" name="pay_period_start" value={formData.pay_period_start} onChange={onInput} max={today} required />
                                    </div>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>End</label>
                                        <input type="date" name="pay_period_end" value={formData.pay_period_end} onChange={onInput} max={today} required />
                                    </div>
                                </div>

                                {/* Earnings */}
                                <h3 className={s.formSection}>Earnings</h3>
                                <div className={s.formGrid}>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Overtime Hours</label>
                                        <input type="number" name="overtime_hours" value={formData.overtime_hours} onChange={onInput} min="0" step="0.5" />
                                    </div>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>{`Overtime Rate (${PESO_SYMBOL}/hr)`}</label>
                                        <input type="number" name="overtime_rate" value={formData.overtime_rate} onChange={onInput} min="0" step="0.01" />
                                    </div>
                                </div>

                                {/* Allowances */}
                                <h3 className={s.formSection}>Allowances</h3>
                                <div className={s.formGrid}>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Clothing Allowance</label>
                                        <input type="number" name="clothing_allowance" value={formData.clothing_allowance} onChange={onInput} min="0" step="0.01" />
                                    </div>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Travel Allowance</label>
                                        <input type="number" name="travel_allowance" value={formData.travel_allowance} onChange={onInput} min="0" step="0.01" />
                                    </div>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Salary Adjustment</label>
                                        <input type="number" name="salary_adjustment" value={formData.salary_adjustment} onChange={onInput} step="0.01" />
                                    </div>
                                </div>

                                {/* Attendance Deductions */}
                                <h3 className={s.formSection}>Attendance Deductions</h3>
                                <div className={s.formGrid}>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Late Deduction</label>
                                        <input type="number" name="late_deduction" value={formData.late_deduction} onChange={onInput} min="0" step="0.01" />
                                    </div>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Absence Deduction</label>
                                        <input type="number" name="absence_deduction" value={formData.absence_deduction} onChange={onInput} min="0" step="0.01" />
                                    </div>
                                </div>

                                {/* Government Contributions */}
                                <h3 className={s.formSection}>Government Contributions</h3>
                                <div className={s.formGrid}>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Withholding Tax</label>
                                        <input type="number" name="tax" value={formData.tax} onChange={onInput} min="0" step="0.01" />
                                    </div>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>SSS</label>
                                        <input type="number" name="sss_contribution" value={formData.sss_contribution} onChange={onInput} min="0" step="0.01" />
                                    </div>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>PhilHealth</label>
                                        <input type="number" name="philhealth_contribution" value={formData.philhealth_contribution} onChange={onInput} min="0" step="0.01" />
                                    </div>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Pag-IBIG</label>
                                        <input type="number" name="pagibig_contribution" value={formData.pagibig_contribution} onChange={onInput} min="0" step="0.01" />
                                    </div>
                                </div>

                                {/* Loan Deductions */}
                                <h3 className={s.formSection}>Loan Deductions</h3>
                                <p style={{ marginTop: -6, marginBottom: 12, color: '#64748b', fontSize: 12 }}>
                                    Approved cash advance requests are added automatically after the payroll is saved. Use the field below only for a manual adjustment if needed.
                                </p>
                                <div className={s.formGrid}>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Manual Cash Advance Adjustment</label>
                                        <input type="number" name="cash_advance_deduction" value={formData.cash_advance_deduction} onChange={onInput} min="0" step="0.01" />
                                    </div>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Laptop Loan</label>
                                        <input type="number" name="laptop_loan_deduction" value={formData.laptop_loan_deduction} onChange={onInput} min="0" step="0.01" />
                                    </div>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Other Deductions</label>
                                        <input type="number" name="other_deductions" value={formData.other_deductions} onChange={onInput} min="0" step="0.01" />
                                    </div>
                                </div>

                                {/* Bonus (separate from gross per client) */}
                                <h3 className={s.formSection}>Bonus</h3>
                                <div className={s.formGrid}>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Bonus Amount</label>
                                        <input type="number" name="bonus" value={formData.bonus} onChange={onInput} min="0" step="0.01" />
                                    </div>
                                </div>

                                {/* Summary */}
                                <h3 className={s.formSection}>Summary</h3>
                                <div className={s.calcRow}><span>Overtime Pay</span><span className={s.calcValue}>{fmt(calc.ot_pay)}</span></div>
                                <div className={s.calcRow}><span>Gross Pay</span><span className={s.calcValue}>{fmt(calc.gross)}</span></div>
                                <div className={s.calcRow}><span>Total Deductions</span><span className={s.calcValue} style={{ color: '#dc2626' }}>{fmt(calc.total_ded)}</span></div>
                                {calc.bonus > 0 && (
                                    <div className={s.calcRow}><span>Bonus</span><span className={s.calcValue} style={{ color: '#059669' }}>+{fmt(calc.bonus)}</span></div>
                                )}
                                <div className={s.calcRowTotal}><span>Net Pay</span><span>{fmt(calc.net)}</span></div>

                                {/* Status & Notes */}
                                <div className={s.formGrid} style={{ marginTop: 16 }}>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Status</label>
                                        <select name="status" value={formData.status} onChange={onInput}>
                                            <option value="draft">Draft</option>
                                            <option value="pending">Pending</option>
                                            <option value="approved">Approved</option>
                                            <option value="paid">Paid</option>
                                        </select>
                                    </div>
                                    <div className={s.formGroup}>
                                        <label className={s.formLabel}>Notes</label>
                                        <textarea name="notes" value={formData.notes} onChange={onInput} placeholder="Optional notes..." rows={2} style={{ minHeight: 'auto' }} />
                                    </div>
                    </div>
                    {recordsLoading && <div className={s.loadingPill}>Refreshing payroll records...</div>}
                </div>
                            <div className={s.modalFooter}>
                                <button type="button" className={s.btnSecondary} onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" title={editing ? 'Update Payroll' : 'Create Payroll'} aria-label={editing ? 'Update Payroll' : 'Create Payroll'} className={s.btnPrimary} disabled={formSaving}>
                                    {formSaving ? 'Saving...' : 'Submit'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ═══════════════════════ VIEW MODAL ═══════════════════════ */}
            {viewRecord && (
                <div className={s.overlay} onClick={() => setViewRecord(null)}>
                    <div className={`${s.modal} ${s.detailModal}`} onClick={e => e.stopPropagation()}>
                        <div className={s.modalHeader}>
                            <h2 className={s.modalTitle}>Payroll Details</h2>
                            <button className={s.modalClose} onClick={() => setViewRecord(null)}>×</button>
                        </div>
                        <div className={s.modalBody}>
                            <div className={s.detailGrid}>
                                {/* Employee Info */}
                                <div><span className={s.detailLabel}>Employee</span><span className={s.detailValue}>{viewRecord.full_employee_name || viewRecord.employee_name}</span></div>
                                <div><span className={s.detailLabel}>Branch</span><span className={s.detailValue}>{viewRecord.branch_name || '-'}</span></div>
                                <div>
                                    <span className={s.detailLabel}>Status</span>
                                    {canManage && viewRecord.status === 'paid' ? (
                                        <button
                                            type="button"
                                            className={`${s.badge} ${badgeClass[viewRecord.status]} ${s.badgeButton}`}
                                            title="Revert to Approved"
                                            aria-label={`Revert payroll for ${viewRecord.full_employee_name || viewRecord.employee_name} to approved`}
                                            onClick={() => void updatePayrollStatus([viewRecord.id], 'approved', 'single', viewRecord.status)}
                                        >
                                            {viewRecord.status}
                                        </button>
                                    ) : (
                                        <span className={`${s.badge} ${badgeClass[viewRecord.status]}`}>{viewRecord.status}</span>
                                    )}
                                </div>
                                <div><span className={s.detailLabel}>Pay Period Start</span><span className={s.detailValue}>{new Date(viewRecord.pay_period_start).toLocaleDateString()}</span></div>
                                <div><span className={s.detailLabel}>Pay Period End</span><span className={s.detailValue}>{new Date(viewRecord.pay_period_end).toLocaleDateString()}</span></div>

                                <hr className={s.detailDivider} />

                                {/* Earnings */}
                                <div><span className={s.detailLabel}>Basic Salary</span><span className={s.detailValue}>{fmt(viewRecord.basic_salary)}</span></div>
                                <div><span className={s.detailLabel}>{`Overtime (${viewRecord.overtime_hours}h × ${PESO_SYMBOL}${Number(viewRecord.overtime_rate).toFixed(2)})`}</span><span className={s.detailValue}>{fmt(viewRecord.overtime_pay)}</span></div>

                                {/* Allowances */}
                                {(Number(viewRecord.clothing_allowance) > 0 || Number(viewRecord.travel_allowance) > 0 || Number(viewRecord.salary_adjustment) !== 0) && (
                                    <>
                                        <hr className={s.detailDivider} />
                                        {Number(viewRecord.clothing_allowance) > 0 && <div><span className={s.detailLabel}>Clothing Allowance</span><span className={s.detailValue}>{fmt(viewRecord.clothing_allowance)}</span></div>}
                                        {Number(viewRecord.travel_allowance) > 0 && <div><span className={s.detailLabel}>Travel Allowance</span><span className={s.detailValue}>{fmt(viewRecord.travel_allowance)}</span></div>}
                                        {Number(viewRecord.salary_adjustment) !== 0 && <div><span className={s.detailLabel}>Salary Adjustment</span><span className={s.detailValue}>{fmt(viewRecord.salary_adjustment)}</span></div>}
                                    </>
                                )}

                                {/* Attendance Deductions */}
                                <>
                                    <hr className={s.detailDivider} />
                                    <div><span className={s.detailLabel}>Late Deduction</span><span className={s.detailValue} style={{ color: '#dc2626' }}>-{fmt(viewRecord.late_deduction)}</span></div>
                                    <div><span className={s.detailLabel}>Absence Deduction</span><span className={s.detailValue} style={{ color: '#dc2626' }}>-{fmt(viewRecord.absence_deduction)}</span></div>
                                </>

                                <div><span className={s.detailLabel}>Gross (Before Attendance)</span><span className={s.detailValue}>{fmt(viewTotals?.grossBefore ?? 0)}</span></div>
                                <div><span className={s.detailLabel}>Gross (After Attendance)</span><span className={s.detailValue} style={{ color: '#059669', fontWeight: 700 }}>{fmt(viewRecord.gross_pay)}</span></div>

                                <hr className={s.detailDivider} />

                                {/* Government Contributions */}
                                <div><span className={s.detailLabel}>Withholding Tax</span><span className={s.detailValue}>{fmt(viewRecord.tax)}</span></div>
                                <div><span className={s.detailLabel}>SSS</span><span className={s.detailValue}>{fmt(viewRecord.sss_contribution)}</span></div>
                                <div><span className={s.detailLabel}>PhilHealth</span><span className={s.detailValue}>{fmt(viewRecord.philhealth_contribution)}</span></div>
                                <div><span className={s.detailLabel}>Pag-IBIG</span><span className={s.detailValue}>{fmt(viewRecord.pagibig_contribution)}</span></div>

                                {/* Loan Deductions */}
                                <>
                                    {viewCashAdvanceBreakdown.requestCount > 0 && (
                                        <div><span className={s.detailLabel}>{`Approved CA Requests (${viewCashAdvanceBreakdown.requestCount})`}</span><span className={s.detailValue}>{fmt(viewCashAdvanceBreakdown.requestTotal)}</span></div>
                                    )}
                                    {viewCashAdvanceBreakdown.manualTotal > 0 && (
                                        <div><span className={s.detailLabel}>Manual CA Adjustment</span><span className={s.detailValue}>{fmt(viewCashAdvanceBreakdown.manualTotal)}</span></div>
                                    )}
                                    <div><span className={s.detailLabel}>Cash Advance (CA) Total</span><span className={s.detailValue}>{fmt(viewRecord.cash_advance_deduction)}</span></div>
                                    <div><span className={s.detailLabel}>Laptop Loan</span><span className={s.detailValue}>{fmt(viewRecord.laptop_loan_deduction)}</span></div>
                                    <div><span className={s.detailLabel}>Other Deductions</span><span className={s.detailValue}>{fmt(viewRecord.other_deductions)}</span></div>
                                </>

                                <div><span className={s.detailLabel}>Total Deductions (All)</span><span className={s.detailValue} style={{ color: '#dc2626', fontWeight: 700 }}>-{fmt(viewTotals?.totalAll ?? 0)}</span></div>

                                {/* Bonus (separate line) */}
                                {Number(viewRecord.bonus) > 0 && (
                                    <>
                                        <hr className={s.detailDivider} />
                                        <div><span className={s.detailLabel}>Bonus</span><span className={s.detailValue} style={{ color: '#059669', fontWeight: 700 }}>+{fmt(viewRecord.bonus)}</span></div>
                                    </>
                                )}

                                <hr className={s.detailDivider} />

                                {/* Net Pay */}
                                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '8px 0' }}>
                                    <span className={s.detailLabel}>Net Pay</span>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e3a8a', marginTop: 4 }}>{fmt(viewRecord.net_pay)}</div>
                                </div>

                                {viewRecord.notes && (
                                    <>
                                        <hr className={s.detailDivider} />
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <span className={s.detailLabel}>Notes</span>
                                            <span className={s.detailValue}>{viewRecord.notes}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className={s.modalFooter}>
                            {canManage && (
                                <>
                                    {viewRecord.status === 'archived' && (
                                        <button
                                            type="button"
                                            className={`${s.btnPrimary} ${viewBusy ? s.isWorking : ''}`}
                                            disabled={viewBusy}
                                            onClick={() => void updatePayrollStatus([viewRecord.id], 'approved', 'single', viewRecord.status)}
                                        >
                                            {viewBusy ? 'Working...' : 'Restore from Archive'}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className={`${s.btnSecondary} ${viewBusy ? s.isWorking : ''}`}
                                        disabled={viewBusy || viewRecord.status === 'archived'}
                                        onClick={() => void recalcGovernmentDeductions(viewRecord.id)}
                                        title={viewRecord.status === 'archived' ? 'Archived payroll records cannot be modified.' : viewBusy ? 'Working...' : 'Recalculate deductions from settings'}
                                    >
                                        {viewBusy ? 'Working...' : 'Recalculate Gov Deductions'}
                                    </button>
                                </>
                            )}
                            <button className={s.btnSecondary} onClick={() => setViewRecord(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════ IMPORT MODAL ═══════════════════════ */}
            {showImportModal && (
                <div className={s.overlay} onClick={() => !importLoading && setShowImportModal(false)}>
                    <div className={s.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                        <div className={s.modalHeader}>
                            <h2 className={s.modalTitle}>Import Attendance</h2>
                            <button className={s.modalClose} onClick={() => !importLoading && setShowImportModal(false)}>×</button>
                        </div>
                        <div className={s.modalBody}>
                            {/* Success result */}
                            {importResult ? (
                                <div>
                                    <div className={s.importResultCard}>
                                        <div className={s.importResultIcon}>
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                                        </div>
                                        <h3 style={{ margin: '12px 0 4px', color: '#1e293b' }}>Import Complete</h3>
                                        <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Batch: {importResult.batch_id}</p>
                                        {importResult.source_system && (
                                            <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Source: {importResult.source_system}</p>
                                        )}
                                    </div>
                                    <div className={s.importStats}>
                                        <div className={s.importStat}>
                                            <span className={s.importStatNumber} style={{ color: '#059669' }}>{importResult.records_created}</span>
                                            <span className={s.importStatLabel}>Records Created</span>
                                        </div>
                                        <div className={s.importStat}>
                                            <span className={s.importStatNumber} style={{ color: '#f59e0b' }}>{importResult.records_skipped}</span>
                                            <span className={s.importStatLabel}>Skipped</span>
                                        </div>
                                        <div className={s.importStat}>
                                            <span className={s.importStatNumber} style={{ color: '#dc2626' }}>{importResult.errors?.length || 0}</span>
                                            <span className={s.importStatLabel}>Errors</span>
                                        </div>
                                    </div>
                                    {importResult.identity_summary && (
                                        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                                            <div style={{ border: '1px solid #dbeafe', borderRadius: 8, padding: '10px 12px', background: '#eff6ff' }}>
                                                <div style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 700 }}>Base44 Matched</div>
                                                <div style={{ fontSize: 18, color: '#1e3a8a', fontWeight: 800 }}>{importResult.identity_summary.matched_via_base44 || 0}</div>
                                            </div>
                                            <div style={{ border: '1px solid #dcfce7', borderRadius: 8, padding: '10px 12px', background: '#f0fdf4' }}>
                                                <div style={{ fontSize: 11, color: '#15803d', fontWeight: 700 }}>Smart Name Matched</div>
                                                <div style={{ fontSize: 18, color: '#166534', fontWeight: 800 }}>{importResult.identity_summary.matched_via_smart_name || 0}</div>
                                            </div>
                                            <div style={{ border: '1px solid #fee2e2', borderRadius: 8, padding: '10px 12px', background: '#fef2f2' }}>
                                                <div style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700 }}>Unresolved</div>
                                                <div style={{ fontSize: 18, color: '#991b1b', fontWeight: 800 }}>{importResult.identity_summary.unresolved || 0}</div>
                                            </div>
                                        </div>
                                    )}
                                    {importResult.warnings?.length > 0 && (
                                        <div style={{ marginTop: 12 }}>
                                            <h4 style={{ fontSize: 13, color: '#b45309', marginBottom: 6 }}>Warnings:</h4>
                                            <ul style={{ fontSize: 12, color: '#475569', paddingLeft: 18, margin: 0 }}>
                                                {importResult.warnings.map((warning: string, i: number) => <li key={i} style={{ marginBottom: 2 }}>{warning}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    {importResult.errors?.length > 0 && (
                                        <div style={{ marginTop: 12 }}>
                                            <h4 style={{ fontSize: 13, color: '#dc2626', marginBottom: 6 }}>Errors:</h4>
                                            <ul style={{ fontSize: 12, color: '#475569', paddingLeft: 18, margin: 0 }}>
                                                {importResult.errors.map((err: string, i: number) => <li key={i} style={{ marginBottom: 2 }}>{err}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {/* File Dropzone */}
                                    <div
                                        className={`${s.dropzone} ${dragOver ? s.dropzoneActive : ''} ${importFile ? s.dropzoneHasFile : ''}`}
                                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                        onDragLeave={() => setDragOver(false)}
                                        onDrop={handleFileDrop}
                                        onClick={() => document.getElementById('importFileInput')?.click()}
                                    >
                                        <input id="importFileInput" type="file" accept=".xls,.xlsx,.csv" onChange={handleFileSelect} style={{ display: 'none' }} />
                                        {importFile ? (
                                            <div style={{ textAlign: 'center' }}>
                                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                                                <p style={{ margin: '8px 0 2px', fontWeight: 600, color: '#1e293b' }}>{importFile.name}</p>
                                                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>{(importFile.size / 1024).toFixed(1)} KB</p>
                                            </div>
                                        ) : (
                                            <div style={{ textAlign: 'center' }}>
                                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                                <p style={{ margin: '10px 0 4px', fontWeight: 600, color: '#475569' }}>Drop your Excel/CSV file here</p>
                                                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>or click to browse — .xls, .xlsx, or .csv</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Download Template */}
                                    <div style={{ textAlign: 'center', margin: '10px 0 16px' }}>
                                        <button type="button" onClick={downloadTemplate} style={{ background: 'none', border: 'none', color: '#1e3a8a', cursor: 'pointer', fontSize: 13, textDecoration: 'underline', fontWeight: 500 }}>
                                            ↓ Download blank attendance template
                                        </button>
                                    </div>

                                    <div className={s.formGroup} style={{ marginBottom: 12 }}>
                                        <label className={s.formLabel}>Source System</label>
                                        <select value={importSourceSystem} onChange={e => setImportSourceSystem(e.target.value)}>
                                            <option value="payroll_excel">Payroll Excel</option>
                                            <option value="attendance_excel">Attendance Excel</option>
                                            <option value="zkteco">ZKTeco</option>
                                            <option value="manual_import">Manual Import</option>
                                        </select>
                                    </div>

                                    {/* Pay Period */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <span className={s.formLabel} style={{ marginBottom: 0 }}>Pay Period *</span>
                                        <button type="button" onClick={() => applyImportPeriod(1)} style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', color: '#475569' }}>1st Half</button>
                                        <button type="button" onClick={() => applyImportPeriod(2)} style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', color: '#475569' }}>2nd Half</button>
                                    </div>
                                    <div className={s.formGrid}>
                                        <div className={s.formGroup}>
                                            <label className={s.formLabel}>Start</label>
                                            <input type="date" value={importPeriodStart} onChange={e => setImportPeriodStart(e.target.value)} max={today} required />
                                        </div>
                                        <div className={s.formGroup}>
                                            <label className={s.formLabel}>End</label>
                                            <input type="date" value={importPeriodEnd} onChange={e => setImportPeriodEnd(e.target.value)} max={today} required />
                                        </div>
                                    </div>

                                    {/* Info box */}
                                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 14px', marginTop: 12, fontSize: 12, color: '#1e40af' }}>
                                        <strong>How it works:</strong> Upload your attendance Excel or CSV (from ZKTeco export or manual). The system will match each EmployeeID, then auto-calculate basic salary, OT (DOLE 1.25×), late &amp; absence deductions, and generate <strong>draft</strong> payroll records for you to review and approve.
                                    </div>
                                </>
                            )}
                        </div>
                        <div className={s.modalFooter}>
                            {importResult ? (
                                <button className={s.btnPrimary} onClick={() => setShowImportModal(false)}>Done</button>
                            ) : (
                                <>
                                    <button className={s.btnSecondary} onClick={() => setShowImportModal(false)} disabled={importLoading}>Cancel</button>
                                    <button className={s.btnPrimary} onClick={handleImport} disabled={importLoading || !importFile}>
                                        {importLoading ? 'Importing...' : 'Generate Payroll'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </Layout>
    );
}
