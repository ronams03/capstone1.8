import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import Pagination from '../../components/Pagination';
import CrudActionIcon from '../../components/CrudActionIcon';
import SettingsLayout from '../../components/SettingsLayout';
import { SettingsPageHeader } from '../../components/SettingsPageShell';
import { useAdminSettingsPage } from '../../components/useAdminSettingsPage';
import { confirmAction, notifyError, notifySuccess } from '@/utils/notify';
import { getApiBaseUrl } from '@/utils/network';

const API_BASE = getApiBaseUrl();

type ThresholdMode = 'none' | 'above' | 'below';

type ThresholdRule = {
    mode: ThresholdMode;
    amount: string;
    rate: string;
};

interface DeductionTypeRow {
    deduction_type_id: number;
    type_name: string;
    description: string | null;
    default_amount: number | string | null;
    threshold_amount?: number | string | null;
    threshold_mode?: ThresholdMode | string | null;
    threshold_rules?: string | ThresholdRule[] | null;
    base_floor?: number | string | null;
    base_cap?: number | string | null;
    is_percentage: number | boolean | null;
    is_active: number | boolean | null;
}

interface DeductionTypeForm {
    type_name: string;
    description: string;
    default_amount: string;
    threshold_rules: ThresholdRule[];
    base_floor: string;
    base_cap: string;
    is_percentage: boolean;
    is_active: boolean;
}
type NormalizedThresholdRule = {
    mode: ThresholdMode;
    amount: number;
    rate: number;
    hasRate: boolean;
};

const createEmptyThresholdRule = (): ThresholdRule => ({ mode: 'none', amount: '', rate: '' });

const createInitialForm = (): DeductionTypeForm => ({
    type_name: '',
    description: '',
    default_amount: '0',
    threshold_rules: [createEmptyThresholdRule()],
    base_floor: '0',
    base_cap: '0',
    is_percentage: false,
    is_active: true,
});

const parseNumber = (value: string | number | null | undefined) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
};

const clampHourlyRate = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, value);
};

const formatNumber = (value: number) => (
    value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
);

const formatCurrency = (value: number) => `PHP ${formatNumber(value)}`;
const formatPercent = (value: number) => `${formatNumber(value)}%`;
const formatDefaultValue = (value: string | number | null | undefined, isPercentage: boolean) => (
    isPercentage ? formatPercent(parseNumber(value)) : formatCurrency(parseNumber(value))
);
const formatBaseBounds = (floor: number, cap: number) => {
    if (floor > 0 && cap > 0) return `${formatCurrency(floor)} to ${formatCurrency(cap)}`;
    if (floor > 0) return `Min ${formatCurrency(floor)}`;
    if (cap > 0) return `Max ${formatCurrency(cap)}`;
    return 'None';
};

const normalizeThresholdMode = (value: unknown): ThresholdMode => (
    value === 'above' || value === 'below' ? value : 'none'
);

const normalizeThresholdRule = (rule: any): ThresholdRule => {
    const mode = normalizeThresholdMode(rule?.mode ?? rule?.threshold_mode ?? 'none');
    const amountValue = rule?.amount ?? rule?.threshold_amount ?? '';
    const rateValue = rule?.rate ?? rule?.threshold_rate ?? '';
    return {
        mode,
        amount: amountValue === null || amountValue === undefined ? '' : String(amountValue),
        rate: rateValue === null || rateValue === undefined ? '' : String(rateValue),
    };
};

const parseThresholdRules = (value: unknown): ThresholdRule[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.map((rule) => normalizeThresholdRule(rule));
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        try {
            const decoded = JSON.parse(trimmed);
            if (Array.isArray(decoded)) {
                return decoded.map((rule) => normalizeThresholdRule(rule));
            }
        } catch {
            return [];
        }
    }
    return [];
};

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

const getThresholdRulesFromRow = (row?: DeductionTypeRow | null): ThresholdRule[] => {
    if (!row) return [];
    const parsed = parseThresholdRules(row.threshold_rules);
    if (parsed.length > 0) return parsed;
    const fallbackMode = normalizeThresholdMode(row.threshold_mode);
    const fallbackAmount = parseNumber(row.threshold_amount ?? 0);
    if (fallbackMode !== 'none' || fallbackAmount > 0) {
        return [{ mode: fallbackMode, amount: String(row.threshold_amount ?? 0), rate: '' }];
    }
    return [];
};

const normalizeThresholdRulesForCalc = (rules: ThresholdRule[]): NormalizedThresholdRule[] => (
    rules
        .map((rule) => {
            const hasRate = String(rule.rate ?? '').trim() !== '';
            return {
                mode: normalizeThresholdMode(rule.mode),
                amount: parseNumber(rule.amount),
                rate: hasRate ? parseNumber(rule.rate) : 0,
                hasRate,
            };
        })
        .filter((rule) => rule.mode !== 'none' && rule.amount > 0)
);

const getModeLabel = (row: DeductionTypeRow) => {
    const rules = getThresholdRulesFromRow(row);
    const normalized = normalizeThresholdRulesForCalc(rules);
    if (normalized.some((rule) => rule.hasRate)) return 'Rate Table';
    return Number(row.is_percentage) ? 'Percentage' : 'Fixed Amount';
};

const shouldApplyThreshold = (salary: number, thresholdAmount: number, thresholdMode: ThresholdMode) => {
    if (!Number.isFinite(thresholdAmount) || thresholdAmount <= 0) return true;
    if (thresholdMode === 'above') return salary > thresholdAmount;
    if (thresholdMode === 'below') return salary <= thresholdAmount;
    return true;
};

const shouldApplyThresholds = (salary: number, rules: ThresholdRule[]) => {
    const normalized = normalizeThresholdRulesForCalc(rules);
    if (normalized.length === 0) return true;
    return normalized.every((rule) => shouldApplyThreshold(salary, rule.amount, rule.mode));
};

const computeThresholdRateDeduction = (salary: number, rules: NormalizedThresholdRule[]) => {
    if (!Number.isFinite(salary) || salary <= 0) return 0;

    const aboveRules = rules
        .filter((rule) => rule.mode === 'above')
        .sort((a, b) => a.amount - b.amount);
    const belowRules = rules
        .filter((rule) => rule.mode === 'below')
        .sort((a, b) => a.amount - b.amount);

    const bands: { start: number; end: number; rate: number }[] = [];
    const firstAboveAmount = aboveRules[0]?.amount ?? 0;

    if (belowRules.length > 0) {
        const below = belowRules[0];
        const end = firstAboveAmount > 0 ? Math.min(below.amount, firstAboveAmount) : below.amount;
        if (end > 0) {
            bands.push({ start: 0, end, rate: Math.max(0, below.rate) });
        }
    } else if (firstAboveAmount > 0) {
        bands.push({ start: 0, end: firstAboveAmount, rate: 0 });
    }

    for (let i = 0; i < aboveRules.length; i += 1) {
        const current = aboveRules[i];
        const next = aboveRules[i + 1];
        const start = current.amount;
        const end = next ? next.amount : Infinity;
        if (end > start) {
            bands.push({ start, end, rate: Math.max(0, current.rate) });
        }
    }

    let total = 0;
    for (const band of bands) {
        if (salary <= band.start) break;
        const taxable = Math.min(salary, band.end) - band.start;
        if (taxable > 0) {
            total += taxable * (band.rate / 100);
        }
    }

    return Math.round(total * 100) / 100;
};

const applyBaseBounds = (salary: number, baseFloor: number, baseCap: number) => {
    if (!Number.isFinite(salary)) return 0;
    let base = salary;
    if (Number.isFinite(baseFloor) && baseFloor > 0 && base < baseFloor) {
        base = baseFloor;
    }
    if (Number.isFinite(baseCap) && baseCap > 0 && base > baseCap) {
        base = baseCap;
    }
    return base;
};

const computeDeduction = (
    salary: number,
    deductionValue: number,
    isPercentage: boolean,
    thresholdRules: ThresholdRule[],
    baseFloor: number,
    baseCap: number
) => {
    const normalized = normalizeThresholdRulesForCalc(thresholdRules);
    const hasRateRules = normalized.some((rule) => rule.hasRate);
    const baseSalary = applyBaseBounds(salary, baseFloor, baseCap);
    if (hasRateRules) {
        return computeThresholdRateDeduction(baseSalary, normalized);
    }

    const base = isPercentage ? (baseSalary * (deductionValue / 100)) : deductionValue;
    return shouldApplyThresholds(salary, thresholdRules) ? base : 0;
};

export default function DeductionTypesSettingsPage() {
    const router = useRouter();
    const embedded = true;
    const ITEMS_PER_PAGE = 10;
    const { user, loading: authLoading, logout } = useAdminSettingsPage();
    const [rows, setRows] = useState<DeductionTypeRow[]>([]);
    const [pageLoading, setPageLoading] = useState(true);

    const [showArchiveView, setShowArchiveView] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [showModal, setShowModal] = useState(false);
    const [editingRow, setEditingRow] = useState<DeductionTypeRow | null>(null);
    const [viewRow, setViewRow] = useState<DeductionTypeRow | null>(null);
    const [formData, setFormData] = useState<DeductionTypeForm>(createInitialForm());
    const [error, setError] = useState('');
    const [formCalcSalary, setFormCalcSalary] = useState('');
    const [viewCalcSalary, setViewCalcSalary] = useState('');
    const [viewCalcDeduction, setViewCalcDeduction] = useState('');
    const [hourlyRates, setHourlyRates] = useState({ staff: '', manager: '' });
    const [hourlyRatesLoading, setHourlyRatesLoading] = useState(false);
    const [hourlyRatesSaving, setHourlyRatesSaving] = useState(false);
    const [hourlyRatesMsg, setHourlyRatesMsg] = useState<string | null>(null);
    const [hourlyRatesErr, setHourlyRatesErr] = useState<string | null>(null);
    const [showHourlyRateModal, setShowHourlyRateModal] = useState(false);

    useEffect(() => {
        if (authLoading || !user) return;

        let active = true;
        const loadPage = async () => {
            try {
                await Promise.all([fetchRows(), fetchHourlyRates()]);
            } finally {
                if (active) {
                    setPageLoading(false);
                }
            }
        };

        void loadPage();
        return () => {
            active = false;
        };
    }, [authLoading, user]);

    useEffect(() => {
        if (!error) return;
        void notifyError(error);
        setError('');
    }, [error]);

    useEffect(() => {
        if (!hourlyRatesMsg) return;
        void notifySuccess(hourlyRatesMsg);
        setHourlyRatesMsg(null);
    }, [hourlyRatesMsg]);

    useEffect(() => {
        if (!hourlyRatesErr) return;
        void notifyError(hourlyRatesErr);
        setHourlyRatesErr(null);
    }, [hourlyRatesErr]);

    const fetchRows = async () => {
        try {
            const res = await fetch(`${API_BASE}/deduction-types.php`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                const incoming = (data.data || []) as DeductionTypeRow[];
                const decoded = incoming.map((row) => ({
                    ...row,
                    description: row.description ? decodeHtmlEntities(row.description) : row.description,
                }));
                setRows(decoded);
            }
        } catch {
            console.error('Failed to fetch deduction types');
        }
    };

    const fetchHourlyRates = async () => {
        setHourlyRatesLoading(true);
        try {
            const res = await fetch(`${API_BASE}/settings_api.php?keys=hourly_rate_staff,hourly_rate_manager`, { credentials: 'include' });
            const data = await res.json();
            if (data.success && data.data) {
                const staffRate = data.data.hourly_rate_staff ?? '';
                const managerRate = data.data.hourly_rate_manager ?? '';
                setHourlyRates({
                    staff: staffRate === null || staffRate === undefined ? '' : String(staffRate),
                    manager: managerRate === null || managerRate === undefined ? '' : String(managerRate),
                });
            }
        } catch {
            setHourlyRatesErr('Failed to load hourly rate settings.');
        } finally {
            setHourlyRatesLoading(false);
        }
    };

    const resetForm = () => {
        setFormData(createInitialForm());
        setEditingRow(null);
        setError('');
        setFormCalcSalary('');
    };

    const openAddModal = () => {
        resetForm();
        setShowModal(true);
    };

    const openEditModal = (row: DeductionTypeRow) => {
        setEditingRow(row);
        const thresholdRules = getThresholdRulesFromRow(row);
        setFormData({
            type_name: row.type_name || '',
            description: row.description ? decodeHtmlEntities(row.description) : '',
            default_amount: String(row.default_amount ?? '0'),
            threshold_rules: thresholdRules.length ? thresholdRules : [createEmptyThresholdRule()],
            base_floor: String(row.base_floor ?? '0'),
            base_cap: String(row.base_cap ?? '0'),
            is_percentage: !!Number(row.is_percentage),
            is_active: !!Number(row.is_active),
        });
        setError('');
        setFormCalcSalary('');
        setShowModal(true);
    };

    const openViewModal = (row: DeductionTypeRow) => {
        setViewRow(row);
        setViewCalcSalary('');
        setViewCalcDeduction(String(row.default_amount ?? '0'));
    };

    const openEditFromView = () => {
        if (!viewRow) return;
        const row = viewRow;
        setViewRow(null);
        openEditModal(row);
    };

    const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : false;
        setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleThresholdRuleChange = (index: number, field: 'mode' | 'amount' | 'rate') => (
        e: ChangeEvent<HTMLSelectElement | HTMLInputElement>
    ) => {
        const { value } = e.target;
        setFormData((prev) => {
            const rules = [...prev.threshold_rules];
            if (!rules[index]) {
                rules[index] = createEmptyThresholdRule();
            }
            rules[index] = { ...rules[index], [field]: value };
            return { ...prev, threshold_rules: rules };
        });
    };

    const handleAddThresholdRule = () => {
        setFormData((prev) => ({
            ...prev,
            threshold_rules: [...prev.threshold_rules, createEmptyThresholdRule()],
        }));
    };

    const handleRemoveThresholdRule = (index: number) => {
        setFormData((prev) => {
            const nextRules = prev.threshold_rules.filter((_, idx) => idx !== index);
            return {
                ...prev,
                threshold_rules: nextRules.length ? nextRules : [createEmptyThresholdRule()],
            };
        });
    };

    const handleHourlyRateChange = (field: 'staff' | 'manager') => (e: ChangeEvent<HTMLInputElement>) => {
        const { value } = e.target;
        setHourlyRates((prev) => ({ ...prev, [field]: value }));
    };

    const handleSaveHourlyRates = async () => {
        setHourlyRatesSaving(true);
        setHourlyRatesMsg(null);
        setHourlyRatesErr(null);

        const staffRate = clampHourlyRate(Number(hourlyRates.staff));
        const managerRate = clampHourlyRate(Number(hourlyRates.manager));
        setHourlyRates({
            staff: staffRate ? String(staffRate) : '0',
            manager: managerRate ? String(managerRate) : '0',
        });

        try {
            const res = await fetch(`${API_BASE}/settings_api.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    settings: {
                        hourly_rate_staff: staffRate,
                        hourly_rate_manager: managerRate,
                    },
                }),
            });
            const data = await res.json();
            if (data.success) {
                setHourlyRatesMsg('Hourly rates updated.');
            } else {
                setHourlyRatesErr(data.message || 'Failed to save hourly rates.');
            }
        } catch {
            setHourlyRatesErr('Network error while saving hourly rates.');
        } finally {
            setHourlyRatesSaving(false);
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            const isEdit = !!editingRow;
            const normalizedRules = normalizeThresholdRulesForCalc(formData.threshold_rules);
            const payloadRules = normalizedRules.map((rule) => {
                const entry: { mode: ThresholdMode; amount: number; rate?: number } = {
                    mode: rule.mode,
                    amount: rule.amount,
                };
                if (rule.hasRate) {
                    entry.rate = rule.rate;
                }
                return entry;
            });
            const primaryRule = payloadRules[0];
            const payload: {
                type_name: string;
                description: string;
                default_amount: number;
                threshold_amount: number;
                threshold_mode: ThresholdMode;
                threshold_rules: { mode: ThresholdMode; amount: number; rate?: number }[];
                base_floor: number;
                base_cap: number;
                is_percentage: number;
                is_active: number;
                deduction_type_id?: number;
            } = {
                type_name: formData.type_name,
                description: formData.description,
                default_amount: Number(formData.default_amount || 0),
                threshold_amount: primaryRule?.amount ?? 0,
                threshold_mode: primaryRule?.mode ?? 'none',
                threshold_rules: payloadRules,
                base_floor: Number(formData.base_floor || 0),
                base_cap: Number(formData.base_cap || 0),
                is_percentage: formData.is_percentage ? 1 : 0,
                is_active: formData.is_active ? 1 : 0,
            };
            if (isEdit) {
                payload.deduction_type_id = editingRow.deduction_type_id;
            }

            const res = await fetch(`${API_BASE}/deduction-types.php`, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
                setShowModal(false);
                if (isEdit && data.data) {
                    setRows(prev => prev.map(r => r.deduction_type_id === editingRow!.deduction_type_id ? { ...r, ...data.data } : r));
                } else if (!isEdit && data.data) {
                    setRows(prev => [...prev, data.data as DeductionTypeRow]);
                }
                resetForm();
            } else {
                setError(data.message || 'Failed to save deduction type');
            }
        } catch {
            setError('An error occurred');
        }
    };

    const handleArchive = async (row: DeductionTypeRow) => {
        const allowed = await confirmAction({
            title: 'Archive deduction type?',
            text: `This will archive "${row.type_name}".`,
            confirmButtonText: 'Archive',
            icon: 'warning',
            danger: true,
        });
        if (!allowed) return;

        try {
            const res = await fetch(`${API_BASE}/deduction-types.php?id=${row.deduction_type_id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const data = await res.json();
            if (data.success) setRows(prev => prev.map(r => r.deduction_type_id === row.deduction_type_id ? { ...r, is_active: 0 } : r));
            else alert(data.message || 'Failed to archive');
        } catch {
            alert('An error occurred');
        }
    };

    const handleDeletePermanently = async (row: DeductionTypeRow) => {
        const allowed = await confirmAction({
            title: 'Delete permanently?',
            text: `This will permanently delete "${row.type_name}".`,
            confirmButtonText: 'Delete',
            icon: 'warning',
            danger: true,
        });
        if (!allowed) return;

        try {
            const res = await fetch(`${API_BASE}/deduction-types.php?id=${row.deduction_type_id}&permanent=1`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const data = await res.json();
            if (data.success) setRows(prev => prev.filter(r => r.deduction_type_id !== row.deduction_type_id));
            else alert(data.message || 'Failed to delete');
        } catch {
            alert('An error occurred');
        }
    };

    const handleRestore = async (row: DeductionTypeRow) => {
        try {
            const res = await fetch(`${API_BASE}/deduction-types.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    deduction_type_id: row.deduction_type_id,
                    is_active: 1,
                }),
            });
            const data = await res.json();
            if (data.success) setRows(prev => prev.map(r => r.deduction_type_id === row.deduction_type_id ? { ...r, is_active: 1 } : r));
            else alert(data.message || 'Failed to restore');
        } catch {
            alert('An error occurred');
        }
    };

    const displayedRows = useMemo(() => {
        return rows.filter((r) => (showArchiveView ? !Number(r.is_active) : !!Number(r.is_active)));
    }, [rows, showArchiveView]);

    const paginatedRows = displayedRows.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    const archivedCount = rows.filter((r) => !Number(r.is_active)).length;

    const viewIsPercentage = viewRow ? Number(viewRow.is_percentage) === 1 : false;
    const viewSalaryValue = parseNumber(viewCalcSalary);
    const viewDeductionValue = parseNumber(viewCalcDeduction);
    const viewBaseFloor = viewRow ? parseNumber(viewRow.base_floor ?? 0) : 0;
    const viewBaseCap = viewRow ? parseNumber(viewRow.base_cap ?? 0) : 0;
    const viewBaseUsed = applyBaseBounds(viewSalaryValue, viewBaseFloor, viewBaseCap);
    const viewThresholdRules = viewRow ? getThresholdRulesFromRow(viewRow) : [];
    const viewNormalizedRules = normalizeThresholdRulesForCalc(viewThresholdRules);
    const viewUsesRateTable = viewNormalizedRules.some((rule) => rule.hasRate);
    const viewDeductionAmount = viewRow
        ? computeDeduction(viewSalaryValue, viewDeductionValue, viewIsPercentage, viewThresholdRules, viewBaseFloor, viewBaseCap)
        : 0;
    const viewNetSalary = Math.max(0, viewSalaryValue - viewDeductionAmount);

    const formSalaryValue = parseNumber(formCalcSalary);
    const formDeductionValue = parseNumber(formData.default_amount);
    const formBaseFloor = parseNumber(formData.base_floor);
    const formBaseCap = parseNumber(formData.base_cap);
    const formBaseUsed = applyBaseBounds(formSalaryValue, formBaseFloor, formBaseCap);
    const formNormalizedRules = normalizeThresholdRulesForCalc(formData.threshold_rules);
    const formUsesRateTable = formNormalizedRules.some((rule) => rule.hasRate);
    const formDeductionAmount = computeDeduction(formSalaryValue, formDeductionValue, formData.is_percentage, formData.threshold_rules, formBaseFloor, formBaseCap);
    const formNetSalary = Math.max(0, formSalaryValue - formDeductionAmount);
    const showThresholdFields = true;

    useEffect(() => {
        setCurrentPage(1);
        setViewRow(null);
    }, [showArchiveView]);

    useEffect(() => {
        if (!viewRow) return;
        setViewCalcDeduction(String(viewRow.default_amount ?? '0'));
    }, [viewRow?.default_amount, viewRow]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(displayedRows.length / ITEMS_PER_PAGE));
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [displayedRows.length, currentPage]);

    if (authLoading || pageLoading) {
        return (
            <SettingsLayout activeSection="deduction-types" user={user} onLogout={logout}>
                <div style={{ padding: 20 }}>Loading...</div>
            </SettingsLayout>
        );
    }

    return (
        <SettingsLayout activeSection="deduction-types" user={user} onLogout={logout}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <SettingsPageHeader embedded={embedded} title={showArchiveView ? 'Archived Deduction Types' : 'Deduction Type'} onBack={() => router.push('/settings')} />
                        <button
                            onClick={() => setShowArchiveView((v) => !v)}
                            style={{ padding: '8px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', background: showArchiveView ? '#1e3a8a' : '#f1f5f9', color: showArchiveView ? 'white' : '#64748b' }}
                        >
                            {showArchiveView ? 'Back to Active' : `Archive (${archivedCount})`}
                        </button>
                </div>
                {!showArchiveView && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                            onClick={() => setShowHourlyRateModal(true)}
                            title="Hourly Rate Settings"
                            aria-label="Hourly rate settings"
                            style={{
                                padding: '10px 16px',
                                border: '1px solid #cbd5f5',
                                borderRadius: 6,
                                cursor: 'pointer',
                                background: '#eef2ff',
                                color: '#1e3a8a',
                                fontWeight: 'bold',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            Hourly Rate
                        </button>
                        <button onClick={openAddModal} title="Add Deduction Type" aria-label="Add Deduction Type" style={{ padding: '10px 20px', border: 'none', borderRadius: 6, cursor: 'pointer', background: '#1e3a8a', color: 'white', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CrudActionIcon action="create" />
                        </button>
                    </div>
                )}
            </div>

            <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'visible' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#f8fafc' }}>
                            <tr>
                                <th style={thStyle}>Type Name</th>
                                <th style={thStyle}>Default Value</th>
                                <th style={thStyle}>Mode</th>
                                <th style={thStyle}>Status</th>
                                <th style={{ ...thStyle, textAlign: 'center', width: 138 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayedRows.length === 0 && (
                                <tr>
                                    <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>
                                        {showArchiveView ? 'No archived deduction types.' : 'No deduction types found.'}
                                    </td>
                                </tr>
                            )}
                            {paginatedRows.map((r) => (
                                <tr key={r.deduction_type_id}>
                                    <td style={tdStyle}>{r.type_name}</td>
                                    <td style={tdStyle}>{formatDefaultValue(r.default_amount, Number(r.is_percentage) === 1)}</td>
                                    <td style={tdStyle}>{getModeLabel(r)}</td>
                                    <td style={tdStyle}>
                                        <span style={{ fontWeight: 700, color: Number(r.is_active) ? '#15803d' : '#b91c1c' }}>
                                            {Number(r.is_active) ? 'Active' : 'Archived'}
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                        <div style={actionGroupStyle}>
                                            <button onClick={() => openViewModal(r)} title="View" aria-label={`View ${r.type_name}`} style={actionButtonStyle('#eff6ff', '#1d4ed8')}>
                                                <CrudActionIcon action="view" />
                                            </button>
                                            {!showArchiveView ? (
                                                <>
                                                    <button onClick={() => openEditModal(r)} title="Edit" aria-label={`Edit ${r.type_name}`} style={actionButtonStyle('#f8fafc', '#334155')}>
                                                        <CrudActionIcon action="edit" />
                                                    </button>
                                                    <button onClick={() => handleArchive(r)} title="Archive" aria-label={`Archive ${r.type_name}`} style={actionButtonStyle('#fff1f2', '#be123c')}>
                                                        <CrudActionIcon action="archive" />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={() => handleRestore(r)} title="Restore" aria-label={`Restore ${r.type_name}`} style={actionButtonStyle('#ecfdf5', '#15803d')}>
                                                        <CrudActionIcon action="restore" />
                                                    </button>
                                                    <button onClick={() => handleDeletePermanently(r)} title="Delete" aria-label={`Delete ${r.type_name}`} style={actionButtonStyle('#fff1f2', '#be123c')}>
                                                        <CrudActionIcon action="delete" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <Pagination
                    currentPage={currentPage}
                    totalItems={displayedRows.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                    label={showArchiveView ? 'archived deduction types' : 'deduction types'}
                />

                {showHourlyRateModal && (
                    <div style={overlayStyle} onClick={() => setShowHourlyRateModal(false)}>
                        <div
                            style={{ ...modalStyle, width: 520 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>Hourly Rate Settings</h2>
                                    <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#6b7280' }}>
                                        Set the rate per hour used for staff and manager computations.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowHourlyRateModal(false)}
                                    style={{ background: 'none', border: 'none', fontSize: 14, lineHeight: 1, cursor: 'pointer', color: '#64748b' }}
                                    aria-label="Close hourly rate settings"
                                >
                                    x
                                </button>
                            </div>

                            {hourlyRatesLoading && (
                                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Loading rates...</div>
                            )}

                            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr', marginTop: 8 }}>
                                <div style={{ display: 'grid', gap: 6 }}>
                                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Staff hourly rate</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={hourlyRates.staff}
                                        onChange={handleHourlyRateChange('staff')}
                                        placeholder="0.00"
                                        disabled={hourlyRatesSaving}
                                        style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, color: '#111' }}
                                    />
                                </div>
                                <div style={{ display: 'grid', gap: 6 }}>
                                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Manager hourly rate</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={hourlyRates.manager}
                                        onChange={handleHourlyRateChange('manager')}
                                        placeholder="0.00"
                                        disabled={hourlyRatesSaving}
                                        style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, color: '#111' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                                <button onClick={() => setShowHourlyRateModal(false)} style={btnSecondary}>Close</button>
                                <button
                                    onClick={handleSaveHourlyRates}
                                    disabled={hourlyRatesSaving}
                                    title="Save Hourly Rates"
                                    aria-label="Save hourly rate settings"
                                    style={{
                                        background: '#1e3a8a',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '10px 20px',
                                        borderRadius: 10,
                                        cursor: hourlyRatesSaving ? 'not-allowed' : 'pointer',
                                        fontWeight: 600,
                                        fontSize: 14,
                                        opacity: hourlyRatesSaving ? 0.7 : 1,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    {hourlyRatesSaving ? 'Saving...' : 'Submit'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {viewRow && (
                    <div style={overlayStyle} onClick={() => setViewRow(null)}>
                        <div style={viewModalStyle} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
                                <h2 style={{ margin: 0, color: '#1e3a8a' }}>Deduction Type Details</h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {Number(viewRow.is_active) ? (
                                        <button
                                            onClick={openEditFromView}
                                            title="Edit"
                                            aria-label={`Edit ${viewRow.type_name}`}
                                            style={actionButtonStyle('#f8fafc', '#334155')}
                                        >
                                            <CrudActionIcon action="edit" />
                                        </button>
                                    ) : null}
                                    <button onClick={() => setViewRow(null)} style={{ background: 'none', border: 'none', fontSize: 14, lineHeight: 1, cursor: 'pointer', color: '#64748b' }}>x</button>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
                                <div style={detailCardStyle}>
                                    <span style={detailLabelStyle}>Type Name</span>
                                    <span style={detailValueStyle}>{viewRow.type_name}</span>
                                </div>
                                <div style={detailCardStyle}>
                                    <span style={detailLabelStyle}>Mode</span>
                                    <span style={detailValueStyle}>{getModeLabel(viewRow)}</span>
                                </div>
                                <div style={detailCardStyle}>
                                    <span style={detailLabelStyle}>Default Amount</span>
                                    <span style={detailValueStyle}>{formatDefaultValue(viewRow.default_amount, Number(viewRow.is_percentage) === 1)}</span>
                                </div>
                                <div style={detailCardStyle}>
                                    <span style={detailLabelStyle}>Base Bounds</span>
                                    <span style={detailValueStyle}>{formatBaseBounds(viewBaseFloor, viewBaseCap)}</span>
                                </div>
                                {viewNormalizedRules.length > 0 && (
                                    <div style={detailCardStyle}>
                                        <span style={detailLabelStyle}>Thresholds</span>
                                        <div style={{ ...detailValueStyle, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {viewNormalizedRules.map((rule, idx) => (
                                                <span key={`${rule.mode}-${rule.amount}-${idx}`}>
                                                    {rule.mode === 'above'
                                                        ? `Applies Above ${formatCurrency(rule.amount)}`
                                                        : `Applies Below ${formatCurrency(rule.amount)}`}
                                                    {rule.hasRate ? ` at ${formatPercent(rule.rate)}` : ''}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div style={detailCardStyle}>
                                    <span style={detailLabelStyle}>Status</span>
                                    <span style={{ ...detailValueStyle, color: Number(viewRow.is_active) ? '#15803d' : '#b91c1c' }}>
                                        {Number(viewRow.is_active) ? 'Active' : 'Archived'}
                                    </span>
                                </div>
                            </div>
                            <div style={{ border: '1px solid #dbeafe', borderRadius: 10, background: '#f8fbff', padding: '12px 14px' }}>
                                <div style={{ color: '#1e3a8a', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Computation Description</div>
                                <div style={{ color: '#334155', lineHeight: 1.45, whiteSpace: 'pre-line' }}>
                                    {(viewRow.description ? decodeHtmlEntities(viewRow.description).trim() : '') || 'No computation description added yet for this deduction type.'}
                                </div>
                            </div>
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', padding: '12px 14px', marginTop: 12 }}>
                                <div style={{ color: '#0f172a', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Calculation Example</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
                                    <div>
                                        <label style={labelStyle}>Total Salary (PHP)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={viewCalcSalary}
                                            onChange={(e) => setViewCalcSalary(e.target.value)}
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div style={detailCardStyle}>
                                        <span style={detailLabelStyle}>Computation Base</span>
                                        <span style={detailValueStyle}>{formatCurrency(viewBaseUsed)}</span>
                                    </div>
                                    {viewUsesRateTable ? (
                                        <div style={detailCardStyle}>
                                            <span style={detailLabelStyle}>Rate Table</span>
                                            <span style={detailValueStyle}>Using threshold rates</span>
                                        </div>
                                    ) : (
                                        <div>
                                            <label style={labelStyle}>{viewIsPercentage ? 'Deduction %' : 'Deduction Amount (PHP)'}</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={viewCalcDeduction}
                                                onChange={(e) => setViewCalcDeduction(e.target.value)}
                                                style={inputStyle}
                                            />
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                                    <div style={detailCardStyle}>
                                        <span style={detailLabelStyle}>Deduction Value</span>
                                        <span style={detailValueStyle}>{formatCurrency(viewDeductionAmount)}</span>
                                    </div>
                                    <div style={detailCardStyle}>
                                        <span style={detailLabelStyle}>Net Salary After Deduction</span>
                                        <span style={detailValueStyle}>{formatCurrency(viewNetSalary)}</span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                                <button onClick={() => setViewRow(null)} style={btnSecondary}>Close</button>
                            </div>
                        </div>
                    </div>
                )}

                {showModal && (
                    <div style={overlayStyle}>
                        <div style={modalStyle}>
                            <h2 style={{ marginTop: 0 }}>{editingRow ? 'Edit Deduction Type' : 'Add Deduction Type'}</h2>
                            <form onSubmit={handleSubmit}>
                                <div style={{ marginBottom: 12 }}>
                                    <label style={labelStyle}>Type Name</label>
                                    <input name="type_name" value={formData.type_name} onChange={handleInputChange} required style={inputStyle} />
                                </div>
                                <div style={{ marginBottom: 12 }}>
                                    <label style={labelStyle}>Description (Computation)</label>
                                    <textarea
                                        name="description"
                                        value={formData.description}
                                        onChange={handleInputChange}
                                        placeholder="Describe how this deduction is computed (example: Basic Salary x 5% every payroll period)."
                                        rows={6}
                                        style={{ ...inputStyle, minHeight: 180 }}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                    <div>
                                        <label style={labelStyle}>{formData.is_percentage ? 'Default Rate (%)' : 'Default Amount (PHP)'}</label>
                                        <input type="number" min="0" step="0.01" name="default_amount" value={formData.default_amount} onChange={handleInputChange} style={inputStyle} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 20 }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontSize: 13 }}>
                                            <input type="checkbox" name="is_percentage" checked={formData.is_percentage} onChange={handleInputChange} />
                                            <span>Is Percentage</span>
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontSize: 13 }}>
                                            <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleInputChange} />
                                            <span>Active</span>
                                        </label>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Base Floor (PHP)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            name="base_floor"
                                            value={formData.base_floor}
                                            onChange={handleInputChange}
                                            placeholder="0 = no floor"
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Base Cap (PHP)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            name="base_cap"
                                            value={formData.base_cap}
                                            onChange={handleInputChange}
                                            placeholder="0 = no cap"
                                            style={inputStyle}
                                        />
                                    </div>
                                </div>
                                {showThresholdFields && (
                                    <div style={{ marginBottom: 12 }}>
                                        {formData.threshold_rules.map((rule, idx) => (
                                            <div
                                                key={`threshold-${idx}`}
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '1fr 1fr 1fr auto',
                                                    gap: 12,
                                                    alignItems: 'end',
                                                    marginBottom: 10,
                                                }}
                                            >
                                                <div>
                                                    <label style={labelStyle}>Threshold Mode</label>
                                                    <select
                                                        value={rule.mode}
                                                        onChange={handleThresholdRuleChange(idx, 'mode')}
                                                        style={inputStyle}
                                                    >
                                                        <option value="none">No Threshold</option>
                                                        <option value="above">Applies Above</option>
                                                        <option value="below">Applies Below</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Tax Threshold (PHP)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={rule.amount}
                                                        onChange={handleThresholdRuleChange(idx, 'amount')}
                                                        placeholder="e.g. 20833"
                                                        style={inputStyle}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Rate (%)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={rule.rate}
                                                        onChange={handleThresholdRuleChange(idx, 'rate')}
                                                        placeholder="e.g. 15"
                                                        style={inputStyle}
                                                    />
                                                </div>
                                                <div style={{ paddingBottom: 4 }}>
                                                    {formData.threshold_rules.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveThresholdRule(idx)}
                                                            style={{
                                                                padding: '6px 10px',
                                                                borderRadius: 6,
                                                                border: '1px solid #e2e8f0',
                                                                background: '#f8fafc',
                                                                color: '#475569',
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={handleAddThresholdRule}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: 6,
                                                border: '1px dashed #cbd5e1',
                                                background: '#f8fafc',
                                                color: '#1e3a8a',
                                                cursor: 'pointer',
                                                fontWeight: 600,
                                            }}
                                        >
                                            + Add Threshold
                                        </button>
                                    </div>
                                )}

                                <div style={{ border: '1px dashed #cbd5e1', borderRadius: 10, background: '#f8fafc', padding: '12px 14px', marginBottom: 12 }}>
                                    <div style={{ color: '#0f172a', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Calculation Example</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
                                        <div>
                                            <label style={labelStyle}>Total Salary (PHP)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={formCalcSalary}
                                                onChange={(e) => setFormCalcSalary(e.target.value)}
                                                style={inputStyle}
                                            />
                                        </div>
                                        <div style={detailCardStyle}>
                                            <span style={detailLabelStyle}>Computation Base</span>
                                            <span style={detailValueStyle}>{formatCurrency(formBaseUsed)}</span>
                                        </div>
                                        <div style={detailCardStyle}>
                                            <span style={detailLabelStyle}>Deduction Value</span>
                                            <span style={detailValueStyle}>{formatCurrency(formDeductionAmount)}</span>
                                        </div>
                                        <div style={detailCardStyle}>
                                            <span style={detailLabelStyle}>Net Salary After Deduction</span>
                                            <span style={detailValueStyle}>{formatCurrency(formNetSalary)}</span>
                                        </div>
                                    </div>
                                <div style={{ color: '#64748b', fontSize: 12 }}>
                                    {formUsesRateTable
                                        ? 'Using threshold rate table based on the rules above.'
                                        : formData.is_percentage
                                            ? `Using ${formatPercent(formDeductionValue)} of the entered salary.`
                                            : `Using a fixed deduction of ${formatCurrency(formDeductionValue)}.`}
                                </div>
                            </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                    <button type="button" onClick={() => { setShowModal(false); resetForm(); }} style={btnSecondary}>Cancel</button>
                                    <button type="submit" title={editingRow ? 'Update' : 'Create'} aria-label={editingRow ? 'Update deduction type' : 'Create deduction type'} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                        Submit
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
        </SettingsLayout>
    );
}

const thStyle: CSSProperties = {
    padding: '12px 15px',
    textAlign: 'left',
    borderBottom: '2px solid #e2e8f0',
    color: '#4a5568',
    fontWeight: 'bold',
};

const tdStyle: CSSProperties = {
    padding: '12px 15px',
    borderBottom: '1px solid #e2e8f0',
    color: '#2d3748',
};

const overlayStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
};

const modalStyle: CSSProperties = {
    background: 'white',
    padding: 24,
    borderRadius: 'var(--modal-radius)',
    width: 680,
    maxWidth: '95%',
    maxHeight: '90vh',
    overflowY: 'auto',
};

const labelStyle: CSSProperties = {
    display: 'block',
    marginBottom: 4,
    color: '#555',
    fontSize: 13,
};

const inputStyle: CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #ccc',
    color: '#333',
    backgroundColor: 'white',
};

const btnPrimary: CSSProperties = {
    padding: '10px 16px',
    borderRadius: 6,
    border: 'none',
    background: '#1e3a8a',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 'bold',
};

const btnSecondary: CSSProperties = {
    padding: '10px 16px',
    borderRadius: 6,
    border: '1px solid #cbd5e1',
    background: 'white',
    color: '#334155',
    cursor: 'pointer',
};

const actionGroupStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'nowrap',
};

function actionButtonStyle(background: string, color: string): CSSProperties {
    return {
        width: 30,
        height: 30,
        padding: 0,
        borderRadius: 8,
        border: '1px solid #dbe4f0',
        background,
        color,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    };
}

const viewModalStyle: CSSProperties = {
    background: 'white',
    padding: 20,
    borderRadius: 12,
    width: 860,
    maxWidth: '95%',
    maxHeight: '88vh',
    overflowY: 'auto',
};

const detailCardStyle: CSSProperties = {
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    background: '#f8fafc',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const detailLabelStyle: CSSProperties = {
    color: '#64748b',
    fontSize: 12,
    fontWeight: 600,
};

const detailValueStyle: CSSProperties = {
    color: '#1f2937',
    fontWeight: 700,
};
