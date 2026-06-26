import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from 'react';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartOptions,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import Layout from '@/components/Layout';
import { useProtectedPage } from '@/components/AuthProvider';
import ExpandIconButton from '@/components/ExpandIconButton';
import FloatingListPanel from '@/components/FloatingListPanel';
import Pagination from '@/components/Pagination';
import { getApiBaseUrl } from '@/utils/network';
import { getRoleFallbackPath } from '@/utils/roleFeatureAccess';
import {
  type ReportDefinition,
  type ReportExportFormat,
  type ReportMetricsSection,
  type ReportPayload,
  type ReportSection,
  type ReportTableSection,
  downloadAllReports,
  downloadSingleReport,
} from '@/utils/reportExport';

type BranchOption = {
  branch_id: number;
  branch_name: string;
};

type CatalogResponse = {
  reports?: ReportDefinition[];
  branches?: BranchOption[];
  scope?: {
    branch_id?: number | null;
    branch_label?: string | null;
  };
};

type FilterState = {
  dateFrom: string;
  dateTo: string;
  branchId: string;
};

type PayrollFocusKey = 'overview' | 'spend' | 'deductions' | 'attendance' | 'branches';

const API_BASE = getApiBaseUrl();

const DEFAULT_FILTERS: FilterState = {
  dateFrom: '',
  dateTo: '',
  branchId: 'all',
};

const DEFAULT_PAYROLL_FOCUS: PayrollFocusKey = 'overview';

const PAYROLL_FOCUS_OPTIONS: Array<{
  key: PayrollFocusKey;
  label: string;
  title: string;
  description: string;
}> = [
  {
    key: 'overview',
    label: 'Overview',
    title: 'Payroll and Attendance',
    description: 'Full payroll health across spend, deductions, attendance, and branch totals.',
  },
  {
    key: 'spend',
    label: 'Spend',
    title: 'Payroll Spend Report',
    description: 'Focus on gross payroll outlay, net release, overtime, and the people using the most payroll budget.',
  },
  {
    key: 'deductions',
    label: 'Deductions',
    title: 'Payroll Deduction Report',
    description: 'Focus on total deductions, deduction drivers, and where payroll leakage is concentrated.',
  },
  {
    key: 'attendance',
    label: 'Attendance',
    title: 'Payroll Attendance Report',
    description: 'Focus on worked time, overtime, lateness, absences, and attendance pressure.',
  },
  {
    key: 'branches',
    label: 'Branches',
    title: 'Payroll Branch Report',
    description: 'Focus on which branches carry the highest payroll value, deductions, and attendance load.',
  },
];

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const EXPORT_FORMATS: Array<{ value: ReportExportFormat; label: string }> = [
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
  { value: 'txt', label: 'TXT' },
  { value: 'html', label: 'HTML' },
  { value: 'pdf', label: 'PDF' },
  { value: 'print', label: 'Print' },
];

const REPORT_CHART_COLORS = ['#2563eb', '#0f766e', '#14b8a6', '#f59e0b', '#7c3aed', '#ef4444'];
const REPORT_TABLE_PREVIEW_LIMIT = 3;
const REPORT_TABLE_PAGE_SIZE = 10;

type DerivedMetric = {
  key: string;
  sectionTitle: string;
  label: string;
  value: string | number;
  hint?: string;
  tone?: string;
  numericValue: number;
};

type TablePreviewRow = {
  id: string;
  title: string;
  detail: string;
  badges: string[];
};

type PreviewRowInteraction = {
  getRowTarget: (row: TablePreviewRow) => string;
  onNavigate: (event: MouseEvent<HTMLElement>, path: string) => void;
};

function isMetricsSection(section: ReportSection): section is ReportMetricsSection {
  return section.type === 'metrics';
}

function isTableSection(section: ReportSection): section is ReportTableSection {
  return section.type === 'table';
}

function formatDisplayValue(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || 'N/A';
}

function parseMetricNumber(value: string | number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.abs(value);
  }

  const normalized = String(value ?? '')
    .replace(/,/g, '')
    .trim();
  const match = normalized.match(/-?\d+(\.\d+)?/);
  if (!match) {
    return 0;
  }

  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}

function buildDerivedMetrics(sections: ReportMetricsSection[]) {
  return sections.flatMap((section) =>
    section.items.map((item, index) => ({
      key: `${section.title}-${item.label}-${index}`,
      sectionTitle: section.title,
      label: item.label,
      value: item.value,
      hint: item.hint,
      tone: item.tone,
      numericValue: parseMetricNumber(item.value),
    }))
  );
}

function buildTablePreviewRows(section: ReportTableSection, limit = 4): TablePreviewRow[] {
  const [primaryColumn, ...otherColumns] = section.columns;

  return section.rows.slice(0, limit).map((row, index) => {
    const title = primaryColumn
      ? formatDisplayValue(row[primaryColumn.key])
      : `Row ${index + 1}`;
    const detail = otherColumns
      .slice(0, 2)
      .map((column) => `${column.label}: ${formatDisplayValue(row[column.key])}`)
      .join(' | ');
    const badges = otherColumns
      .slice(2, 5)
      .map((column) => `${column.label}: ${formatDisplayValue(row[column.key])}`);

    return {
      id: `${section.title}-${index}`,
      title,
      detail,
      badges,
    };
  });
}

function resolveBaseReportRoute(reportKey: string, role: unknown) {
  switch (reportKey) {
    case 'project_delivery':
      return '/projects';
    case 'payroll_attendance':
      return '/payroll-management';
    case 'requests_sla':
      return '/manager/approval-inbox';
    case 'documents_compliance':
      return '/documents';
    case 'executive_overview':
    case 'audit_activity':
    default:
      return getRoleFallbackPath(role);
  }
}

function resolveReportDestination(reportKey: string, role: unknown, context = '') {
  const normalized = `${reportKey} ${context}`.trim().toLowerCase();

  if (/(leave)/.test(normalized)) {
    return '/leave-requests';
  }
  if (/(overtime)/.test(normalized)) {
    return '/overtime-requests';
  }
  if (/(cash advance|cash_advance|cash-advance)/.test(normalized)) {
    return '/cash-advance';
  }
  if (/(payslip|dispute)/.test(normalized)) {
    return '/payslip-disputes';
  }
  if (/(request|sla|approval|backlog|breach)/.test(normalized)) {
    return '/manager/approval-inbox';
  }
  if (/(payroll|attendance|deduction|pre-check|precheck)/.test(normalized)) {
    return '/payroll-management';
  }
  if (/(project|task|delivery|overdue|dispatch|progress)/.test(normalized)) {
    return '/projects';
  }
  if (/(document|submission|compliance|intake)/.test(normalized)) {
    return '/documents';
  }
  if (/(activity|audit)/.test(normalized)) {
    return getRoleFallbackPath(role);
  }

  return resolveBaseReportRoute(reportKey, role);
}

function renderPreviewRows(section: ReportTableSection, limit = 4, interaction?: PreviewRowInteraction) {
  const rows = buildTablePreviewRows(section, limit);

  if (rows.length === 0) {
    return <div style={emptyMiniStateStyle}>No rows available for this section.</div>;
  }

  return (
    <div style={previewListStyle}>
      {rows.map((row) => (
        <div
          key={row.id}
          style={interaction ? { ...previewRowStyle, ...interactiveSurfaceStyle } : previewRowStyle}
          title={interaction ? 'Double-click to open the related page.' : undefined}
          onDoubleClick={
            interaction
              ? (event) => interaction.onNavigate(event, interaction.getRowTarget(row))
              : undefined
          }
        >
          <div style={previewRowMainStyle}>
            <div style={previewRowTitleStyle}>{row.title}</div>
            {row.detail ? <div style={previewRowDetailStyle}>{row.detail}</div> : null}
          </div>
          {row.badges.length > 0 ? (
            <div style={previewBadgeWrapStyle}>
              {row.badges.map((badge) => (
                <span key={`${row.id}-${badge}`} style={previewBadgeStyle}>
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function renderExpandedTableRows(section: ReportTableSection, rows: ReportTableSection['rows']) {
  if (rows.length === 0) {
    return <div style={emptyMiniStateStyle}>No rows available for this section.</div>;
  }

  return (
    <div style={expandedTableWrapStyle}>
      <table style={expandedTableStyle}>
        <thead style={expandedTableHeadStyle}>
          <tr>
            {section.columns.map((column) => (
              <th key={`${section.title}-${column.key}`} style={expandedTableHeaderCellStyle}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${section.title}-row-${index}`} style={expandedTableRowStyle}>
              {section.columns.map((column) => (
                <td key={`${section.title}-${index}-${column.key}`} style={expandedTableBodyCellStyle}>
                  {formatDisplayValue(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildReportUrl(reportKey: string, filters: FilterState) {
  const params = new URLSearchParams({
    action: 'generate',
    report_key: reportKey,
  });

  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.branchId && filters.branchId !== 'all') params.set('branch_id', filters.branchId);

  return `${API_BASE}/reports.php?${params.toString()}`;
}

function formatFilterSummary(report: ReportPayload | null) {
  if (!report?.filters) return 'All time';

  const parts: string[] = [];
  if (report.filters.branch_label) {
    parts.push(report.filters.branch_label);
  }
  if (report.filters.date_from || report.filters.date_to) {
    parts.push(`${report.filters.date_from || 'Beginning'} to ${report.filters.date_to || 'Present'}`);
  } else {
    parts.push('All time');
  }
  return parts.join(' | ');
}

function buildFocusedPayrollReport(
  report: ReportPayload | null,
  focus: PayrollFocusKey
): ReportPayload | null {
  if (!report || report.report_key !== 'payroll_attendance' || focus === DEFAULT_PAYROLL_FOCUS) {
    return report;
  }

  const focusDefinition = PAYROLL_FOCUS_OPTIONS.find((item) => item.key === focus) || PAYROLL_FOCUS_OPTIONS[0];
  const sectionMatcher = (section: ReportSection) => {
    const title = section.title.toLowerCase();

    switch (focus) {
      case 'spend':
        return /(payroll snapshot|payroll spend summary|payroll status breakdown|branch payroll totals|payroll spend by employee)/.test(title);
      case 'deductions':
        return /(payroll snapshot|deduction summary|deduction breakdown|top deduction loads|branch payroll totals)/.test(title);
      case 'attendance':
        return /(attendance snapshot|attendance by branch)/.test(title);
      case 'branches':
        return /(payroll snapshot|branch payroll totals|attendance by branch|payroll status breakdown)/.test(title);
      case 'overview':
      default:
        return true;
    }
  };

  const sections = report.sections.filter(sectionMatcher);
  const scopeNotes = [report.filters?.scope_note, `Payroll focus: ${focusDefinition.label}.`].filter(Boolean).join(' ');

  return {
    ...report,
    title: focusDefinition.title,
    description: focusDefinition.description,
    filters: {
      ...report.filters,
      scope_note: scopeNotes,
    },
    sections: sections.length > 0 ? sections : report.sections,
  };
}

export default function ReportsPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useProtectedPage({
    allowedRoles: ['admin', 'manager'],
    unauthorizedRedirect: '/dashboard',
  });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [error, setError] = useState('');
  const [availableReports, setAvailableReports] = useState<ReportDefinition[]>([]);
  const [branchOptions, setBranchOptions] = useState<BranchOption[]>([]);
  const [selectedReportKey, setSelectedReportKey] = useState('');
  const [currentReport, setCurrentReport] = useState<ReportPayload | null>(null);
  const [draftFilters, setDraftFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [initialFilters, setInitialFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [currentExportFormat, setCurrentExportFormat] = useState<ReportExportFormat>('csv');
  const [allExportFormat, setAllExportFormat] = useState<ReportExportFormat>('json');
  const [selectedPayrollFocus, setSelectedPayrollFocus] = useState<PayrollFocusKey>(DEFAULT_PAYROLL_FOCUS);
  const [expandedTableSection, setExpandedTableSection] = useState<ReportTableSection | null>(null);
  const [expandedTablePage, setExpandedTablePage] = useState(1);

  const selectedReportDefinition = useMemo(
    () => availableReports.find((item) => item.key === selectedReportKey) || null,
    [availableReports, selectedReportKey]
  );
  const displayReport = useMemo(
    () => buildFocusedPayrollReport(currentReport, selectedPayrollFocus),
    [currentReport, selectedPayrollFocus]
  );
  const activeReportKey = displayReport?.report_key || selectedReportKey;
  const isPayrollReportSelected = selectedReportKey === 'payroll_attendance';
  const selectedPayrollFocusDefinition = useMemo(
    () => PAYROLL_FOCUS_OPTIONS.find((item) => item.key === selectedPayrollFocus) || PAYROLL_FOCUS_OPTIONS[0],
    [selectedPayrollFocus]
  );
  const defaultReportRoute = useMemo(
    () => resolveBaseReportRoute(activeReportKey, user?.role),
    [activeReportKey, user?.role]
  );

  useEffect(() => {
    setExpandedTableSection(null);
  }, [displayReport]);

  useEffect(() => {
    setExpandedTablePage(1);
  }, [expandedTableSection]);

  const handleCardNavigate = useCallback(
    (event: MouseEvent<HTMLElement>, path: string) => {
      event.preventDefault();
      event.stopPropagation();
      void router.push(path);
    },
    [router]
  );

  const resolveCardTarget = useCallback(
    (context = '') => resolveReportDestination(activeReportKey, user?.role, context),
    [activeReportKey, user?.role]
  );

  const reportLayout = useMemo(() => {
    if (!displayReport) {
      return {
        metricsSections: [] as ReportMetricsSection[],
        tableSections: [] as ReportTableSection[],
        derivedMetrics: [] as DerivedMetric[],
        spotlightMetrics: [] as DerivedMetric[],
        snapshotMetrics: [] as DerivedMetric[],
        performanceMetrics: [] as DerivedMetric[],
        primaryTable: null as ReportTableSection | null,
        secondaryTable: null as ReportTableSection | null,
        remainingSections: [] as ReportSection[],
        briefPoints: [] as string[],
      };
    }

    const metricsSections = displayReport.sections.filter(isMetricsSection);
    const tableSections = displayReport.sections.filter(isTableSection);
    const derivedMetrics = buildDerivedMetrics(metricsSections);
    const featuredMetricsSection = metricsSections[0] || null;
    const spotlightMetrics = buildDerivedMetrics(featuredMetricsSection ? [featuredMetricsSection] : [])
      .filter((item) => item.numericValue > 0)
      .slice(0, 5);
    const fallbackSpotlight = derivedMetrics.filter((item) => item.numericValue > 0).slice(0, 5);
    const snapshotMetrics = (featuredMetricsSection ? buildDerivedMetrics([featuredMetricsSection]) : derivedMetrics).slice(0, 4);
    const performanceMetrics = (derivedMetrics.filter((item) => item.numericValue > 0).length > 0
      ? derivedMetrics.filter((item) => item.numericValue > 0)
      : derivedMetrics
    ).slice(0, 6);
    const primaryTable = tableSections[0] || null;
    const secondaryTable = tableSections[1] || null;
    const remainingSections = displayReport.sections.filter((section) => {
      if (featuredMetricsSection && section === featuredMetricsSection) {
        return false;
      }
      if (primaryTable && section === primaryTable) {
        return false;
      }
      if (secondaryTable && section === secondaryTable) {
        return false;
      }
      return true;
    });

    const briefPoints = [
      displayReport.description,
      `Scope: ${formatFilterSummary(displayReport)}`,
      `${metricsSections.length} analytics section${metricsSections.length === 1 ? '' : 's'} and ${tableSections.length} data section${tableSections.length === 1 ? '' : 's'} are included in this report.`,
      performanceMetrics[0]
        ? `Top tracked figure: ${performanceMetrics[0].label} at ${formatDisplayValue(performanceMetrics[0].value)}.`
        : '',
    ].filter(Boolean);

    return {
      metricsSections,
      tableSections,
      derivedMetrics,
      spotlightMetrics: spotlightMetrics.length > 0 ? spotlightMetrics : fallbackSpotlight,
      snapshotMetrics,
      performanceMetrics,
      primaryTable,
      secondaryTable,
      remainingSections,
      briefPoints,
    };
  }, [displayReport]);

  const paginatedExpandedTableRows = useMemo(() => {
    if (!expandedTableSection) {
      return [];
    }

    const startIndex = (expandedTablePage - 1) * REPORT_TABLE_PAGE_SIZE;
    return expandedTableSection.rows.slice(startIndex, startIndex + REPORT_TABLE_PAGE_SIZE);
  }, [expandedTablePage, expandedTableSection]);

  const spotlightChartData = useMemo(() => {
    const items = reportLayout.spotlightMetrics;
    return {
      labels: items.map((item) => item.label),
      datasets: [
        {
          data: items.map((item, index) => item.numericValue || items.length - index),
          backgroundColor: items.map((_, index) => REPORT_CHART_COLORS[index % REPORT_CHART_COLORS.length]),
          borderColor: '#ffffff',
          borderWidth: 4,
          hoverOffset: 6,
        },
      ],
    };
  }, [reportLayout.spotlightMetrics]);

  const spotlightChartOptions = useMemo<ChartOptions<'doughnut'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: '64%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const item = reportLayout.spotlightMetrics[context.dataIndex];
              return item ? `${item.label}: ${formatDisplayValue(item.value)}` : '';
            },
          },
        },
      },
    }),
    [reportLayout.spotlightMetrics]
  );

  const performanceChartData = useMemo(() => ({
    labels: reportLayout.performanceMetrics.map((item) => item.label),
    datasets: [
      {
        data: reportLayout.performanceMetrics.map((item, index) => item.numericValue || reportLayout.performanceMetrics.length - index),
        backgroundColor: reportLayout.performanceMetrics.map(
          (_, index) => REPORT_CHART_COLORS[index % REPORT_CHART_COLORS.length]
        ),
        borderRadius: 10,
        borderSkipped: false as const,
        barThickness: 14,
      },
    ],
  }), [reportLayout.performanceMetrics]);

  const performanceChartOptions = useMemo<ChartOptions<'bar'>>(
    () => ({
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const item = reportLayout.performanceMetrics[context.dataIndex];
              return item ? `${item.label}: ${formatDisplayValue(item.value)}` : '';
            },
          },
        },
      },
      scales: {
        x: {
          display: false,
          grid: { display: false },
          border: { display: false },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#475569',
            font: {
              size: 11,
              weight: 700,
            },
          },
        },
      },
    }),
    [reportLayout.performanceMetrics]
  );

  const fetchReportPayload = useCallback(
    async (reportKey: string, filters: FilterState) => {
      const response = await fetch(buildReportUrl(reportKey, filters), {
        credentials: 'include',
      });
      const payload = (await response.json()) as {
        success?: boolean;
        message?: string;
        data?: ReportPayload;
      };

      if (!payload?.success || !payload.data) {
        throw new Error(payload?.message || 'Failed to load the selected report.');
      }

      return payload.data;
    },
    []
  );

  useEffect(() => {
    if (authLoading || !user) return;

    let active = true;

    const loadCatalog = async () => {
      setCatalogLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE}/reports.php?action=list`, {
          credentials: 'include',
        });
        const payload = (await response.json()) as {
          success?: boolean;
          message?: string;
          data?: CatalogResponse;
        };

        if (!payload?.success || !payload.data) {
          throw new Error(payload?.message || 'Failed to load report options.');
        }

        if (!active) return;

        const reports = Array.isArray(payload.data.reports) ? payload.data.reports : [];
        const branches = Array.isArray(payload.data.branches) ? payload.data.branches : [];
        const scopedBranchId = payload.data.scope?.branch_id ? String(payload.data.scope.branch_id) : 'all';
        const nextFilters: FilterState = {
          dateFrom: '',
          dateTo: '',
          branchId: scopedBranchId,
        };

        setAvailableReports(reports);
        setBranchOptions(branches);
        setInitialFilters(nextFilters);
        setDraftFilters(nextFilters);
        setAppliedFilters(nextFilters);
        setSelectedReportKey((current) => current || reports[0]?.key || '');
      } catch (catalogError) {
        if (active) {
          setError(catalogError instanceof Error ? catalogError.message : 'Failed to load report options.');
        }
      } finally {
        if (active) {
          setCatalogLoading(false);
        }
      }
    };

    void loadCatalog();

    return () => {
      active = false;
    };
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading || !user || !selectedReportKey) return;

    let active = true;
    setReportLoading(true);
    setError('');

    const loadReport = async () => {
      try {
        const report = await fetchReportPayload(selectedReportKey, appliedFilters);
        if (!active) return;
        setCurrentReport(report);
      } catch (reportError) {
        if (active) {
          setCurrentReport(null);
          setError(reportError instanceof Error ? reportError.message : 'Failed to load the selected report.');
        }
      } finally {
        if (active) {
          setReportLoading(false);
        }
      }
    };

    void loadReport();

    return () => {
      active = false;
    };
  }, [appliedFilters, authLoading, fetchReportPayload, selectedReportKey, user]);

  useEffect(() => {
    if (selectedReportKey === 'payroll_attendance') return;
    setSelectedPayrollFocus(DEFAULT_PAYROLL_FOCUS);
  }, [selectedReportKey]);

  const handleSelectReport = (reportKey: string) => {
    startTransition(() => {
      setSelectedReportKey(reportKey);
      if (reportKey !== 'payroll_attendance') {
        setSelectedPayrollFocus(DEFAULT_PAYROLL_FOCUS);
      }
    });
  };

  const handleSelectPayrollFocus = (focus: PayrollFocusKey) => {
    startTransition(() => {
      setSelectedPayrollFocus(focus);
    });
  };

  const handleDraftFilterChange = (field: keyof FilterState, value: string) => {
    setDraftFilters((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleApplyFilters = () => {
    if (draftFilters.dateFrom && draftFilters.dateTo && draftFilters.dateFrom > draftFilters.dateTo) {
      setError('The start date cannot be later than the end date.');
      return;
    }

    startTransition(() => {
      setAppliedFilters(draftFilters);
    });
  };

  const handleResetFilters = () => {
    setDraftFilters(initialFilters);
    startTransition(() => {
      setAppliedFilters(initialFilters);
    });
  };

  const handleExportCurrent = async () => {
    if (!displayReport) {
      setError('Load a report before exporting it.');
      return;
    }

    try {
      await downloadSingleReport(displayReport, currentExportFormat);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Failed to export the current report.');
    }
  };

  const handleExportAll = async () => {
    if (availableReports.length === 0) {
      setError('No reports are available to export.');
      return;
    }

    setExportingAll(true);
    setError('');
    try {
      const reports = await Promise.all(
        availableReports.map((item) => fetchReportPayload(item.key, appliedFilters))
      );
      await downloadAllReports(reports, allExportFormat);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Failed to export all reports.');
    } finally {
      setExportingAll(false);
    }
  };

  if (authLoading || catalogLoading) {
    return (
      <Layout role={user?.role as string | undefined} user={user} onLogout={logout}>
        <div style={pageShellStyle}>
          <div style={loadingCardStyle}>Loading reports...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout role={user?.role as string | undefined} user={user} onLogout={logout}>
      <Head>
        <title>Reports | Capstone1</title>
      </Head>

      <div style={pageShellStyle}>
        {error ? <div style={errorBannerStyle}>{error}</div> : null}

        <section style={controlCardStyle}>
          <div style={controlGridStyle}>
            <label style={fieldWrapStyle}>
              <span style={fieldLabelStyle}>Report Type</span>
              <select
                value={selectedReportKey}
                onChange={(event) => handleSelectReport(event.target.value)}
                style={fieldStyle}
              >
                {availableReports.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>

            <label style={fieldWrapStyle}>
              <span style={fieldLabelStyle}>Date From</span>
              <input
                type="date"
                value={draftFilters.dateFrom}
                onChange={(event) => handleDraftFilterChange('dateFrom', event.target.value)}
                style={fieldStyle}
              />
            </label>

            <label style={fieldWrapStyle}>
              <span style={fieldLabelStyle}>Date To</span>
              <input
                type="date"
                value={draftFilters.dateTo}
                onChange={(event) => handleDraftFilterChange('dateTo', event.target.value)}
                style={fieldStyle}
              />
            </label>

            <label style={fieldWrapStyle}>
              <span style={fieldLabelStyle}>Branch</span>
              <select
                value={draftFilters.branchId}
                onChange={(event) => handleDraftFilterChange('branchId', event.target.value)}
                style={fieldStyle}
                disabled={branchOptions.length <= 1}
              >
                {branchOptions.length > 1 ? <option value="all">All branches</option> : null}
                {branchOptions.map((branch) => (
                  <option key={branch.branch_id} value={String(branch.branch_id)}>
                    {branch.branch_name}
                  </option>
                ))}
                {branchOptions.length === 0 ? <option value="all">All branches</option> : null}
              </select>
            </label>
          </div>

          <div style={actionRowStyle}>
            <button type="button" onClick={handleApplyFilters} style={primaryButtonStyle}>
              Refresh Report
            </button>
            <button type="button" onClick={handleResetFilters} style={secondaryButtonStyle}>
              Reset Filters
            </button>
          </div>

          {isPayrollReportSelected ? (
            <div style={subreportWrapStyle}>
              <div style={subreportHeaderStyle}>
                <div style={fieldLabelStyle}>Payroll Report Focus</div>
                <div style={subreportDescriptionStyle}>{selectedPayrollFocusDefinition.description}</div>
              </div>
              <div style={subreportButtonRowStyle}>
                {PAYROLL_FOCUS_OPTIONS.map((option) => {
                  const isActive = option.key === selectedPayrollFocus;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => handleSelectPayrollFocus(option.key)}
                      style={isActive ? activeSubreportButtonStyle : subreportButtonStyle}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>

        <section style={reportCanvasStyle}>
          <div style={reportCanvasHeaderStyle}>
            <div style={reportCanvasTitleWrapStyle}>
              <div style={reportHeaderEyebrowStyle}>Operational Report Board</div>
              <h2 style={reportTitleStyle}>{displayReport?.title || selectedReportDefinition?.title || 'Reports'}</h2>
              <p style={reportDescriptionStyle}>
                {displayReport?.description || selectedReportDefinition?.description || 'Choose a report to view analytics and export it.'}
              </p>
              <div style={reportMetaStyle}>
                <span style={metaBadgeStyle}>Scope: {formatFilterSummary(displayReport)}</span>
                {isPayrollReportSelected ? (
                  <span style={metaBadgeStyle}>Focus: {selectedPayrollFocusDefinition.label}</span>
                ) : null}
                <span style={metaBadgeStyle}>
                  Updated: {displayReport ? new Date(displayReport.generated_at).toLocaleString() : 'Waiting for report data'}
                </span>
              </div>
            </div>

            <div style={reportCanvasToolsStyle}>
              <div style={exportPanelWrapStyle}>
                <div style={exportPanelStyle}>
                  <div style={exportPanelTitleStyle}>Export Current</div>
                  <div style={exportControlRowStyle}>
                    <select
                      value={currentExportFormat}
                      onChange={(event) => setCurrentExportFormat(event.target.value as ReportExportFormat)}
                      style={compactFieldStyle}
                    >
                      {EXPORT_FORMATS.map((format) => (
                        <option key={format.value} value={format.value}>
                          {format.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleExportCurrent()}
                      style={primaryButtonStyle}
                      disabled={!displayReport}
                    >
                      Export
                    </button>
                  </div>
                </div>

                <div style={exportPanelStyle}>
                  <div style={exportPanelTitleStyle}>Export All</div>
                  <div style={exportControlRowStyle}>
                    <select
                      value={allExportFormat}
                      onChange={(event) => setAllExportFormat(event.target.value as ReportExportFormat)}
                      style={compactFieldStyle}
                    >
                      {EXPORT_FORMATS.map((format) => (
                        <option key={format.value} value={format.value}>
                          {format.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleExportAll()}
                      style={secondaryButtonStyle}
                      disabled={exportingAll}
                    >
                      {exportingAll ? 'Preparing...' : 'Export'}
                    </button>
                  </div>
                </div>
              </div>
              <div style={exportHintStyle}>PDF downloads a file. Print opens your browser print dialog.</div>
            </div>
          </div>
        </section>

        {reportLoading ? (
          <div style={loadingCardStyle}>Loading report analytics...</div>
        ) : !displayReport ? (
          <div style={emptyStateStyle}>Select a report and refresh it to view analytics here.</div>
        ) : (
          <section style={sectionStackStyle}>
            <div style={editorialHeroGridStyle}>
              <article
                style={{ ...editorialPanelStyle, ...briefPanelStyle, ...interactiveSurfaceStyle }}
                title="Double-click to open the related page."
                onDoubleClick={(event) => handleCardNavigate(event, defaultReportRoute)}
              >
                <div style={panelEyebrowStyle}>Report Brief</div>
                <div style={panelTitleStyle}>Working summary</div>
                <div style={briefCopyStackStyle}>
                  {reportLayout.briefPoints.map((point, index) => (
                    <p key={`brief-${index}`} style={briefCopyStyle}>
                      {point}
                    </p>
                  ))}
                </div>
                <div style={briefFactGridStyle}>
                  {reportLayout.snapshotMetrics.slice(0, 2).map((metric) => (
                    <div
                      key={`brief-fact-${metric.key}`}
                      style={{ ...briefFactStyle, ...interactiveSurfaceStyle }}
                      title="Double-click to open the related page."
                      onDoubleClick={(event) =>
                        handleCardNavigate(event, resolveCardTarget(`${metric.sectionTitle} ${metric.label}`))
                      }
                    >
                      <span style={briefFactLabelStyle}>{metric.label}</span>
                      <strong style={briefFactValueStyle}>{formatDisplayValue(metric.value)}</strong>
                    </div>
                  ))}
                </div>
              </article>

              <article
                style={{ ...editorialPanelStyle, ...spotlightPanelStyle, ...interactiveSurfaceStyle }}
                title="Double-click to open the related page."
                onDoubleClick={(event) =>
                  handleCardNavigate(
                    event,
                    resolveCardTarget(reportLayout.metricsSections[0]?.title || displayReport.title)
                  )
                }
              >
                <div style={panelEyebrowStyle}>{reportLayout.metricsSections[0]?.title || 'Metric Spotlight'}</div>
                <div style={panelTitleStyle}>Report mix</div>
                {reportLayout.spotlightMetrics.length > 0 ? (
                  <div style={spotlightBodyStyle}>
                    <div style={chartFrameStyle}>
                      <Doughnut data={spotlightChartData} options={spotlightChartOptions} />
                    </div>
                    <div style={legendListStyle}>
                      {reportLayout.spotlightMetrics.map((metric, index) => (
                        <div
                          key={`spotlight-${metric.key}`}
                          style={{ ...legendRowStyle, ...interactiveSurfaceStyle }}
                          title="Double-click to open the related page."
                          onDoubleClick={(event) =>
                            handleCardNavigate(event, resolveCardTarget(`${metric.sectionTitle} ${metric.label}`))
                          }
                        >
                          <span
                            style={{
                              ...legendSwatchStyle,
                              background: REPORT_CHART_COLORS[index % REPORT_CHART_COLORS.length],
                            }}
                          />
                          <div style={legendTextStyle}>
                            <strong style={legendLabelStyle}>{metric.label}</strong>
                            <span style={legendValueStyle}>{formatDisplayValue(metric.value)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={emptyMiniStateStyle}>No chart-ready metrics for this report.</div>
                )}
              </article>

              <article
                style={{ ...editorialPanelStyle, ...snapshotPanelStyle, ...interactiveSurfaceStyle }}
                title="Double-click to open the related page."
                onDoubleClick={(event) =>
                  handleCardNavigate(
                    event,
                    resolveCardTarget(reportLayout.metricsSections[0]?.title || displayReport.title)
                  )
                }
              >
                <div style={panelEyebrowStyle}>Snapshot</div>
                <div style={panelTitleStyle}>At-a-glance figures</div>
                <div style={snapshotGridStyle}>
                  {reportLayout.snapshotMetrics.map((metric) => (
                    <div
                      key={`snapshot-${metric.key}`}
                      style={{ ...snapshotCardStyle, ...interactiveSurfaceStyle }}
                      title="Double-click to open the related page."
                      onDoubleClick={(event) =>
                        handleCardNavigate(event, resolveCardTarget(`${metric.sectionTitle} ${metric.label}`))
                      }
                    >
                      <span style={snapshotLabelStyle}>{metric.label}</span>
                      <strong style={snapshotValueStyle}>{formatDisplayValue(metric.value)}</strong>
                      {metric.hint ? <span style={snapshotHintStyle}>{metric.hint}</span> : null}
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <div style={editorialSecondaryGridStyle}>
              {reportLayout.performanceMetrics.length > 1 ? (
                <article
                  style={{ ...editorialPanelStyle, ...chartPanelStyle, ...interactiveSurfaceStyle }}
                  title="Double-click to open the related page."
                  onDoubleClick={(event) => handleCardNavigate(event, defaultReportRoute)}
                >
                  <div style={panelEyebrowStyle}>Performance View</div>
                  <div style={panelTitleStyle}>Metric distribution</div>
                  <div style={barChartWrapStyle}>
                    <Bar data={performanceChartData} options={performanceChartOptions} />
                  </div>
                </article>
              ) : null}

              {reportLayout.primaryTable ? (
                <article
                  style={{ ...editorialPanelStyle, ...listPanelStyle, ...interactiveSurfaceStyle }}
                  title="Double-click to open the related page."
                  onDoubleClick={(event) =>
                    handleCardNavigate(event, resolveCardTarget(reportLayout.primaryTable?.title || displayReport.title))
                  }
                >
                  <div style={listCardHeaderStyle}>
                    <div>
                      <div style={panelEyebrowStyle}>{reportLayout.primaryTable.title}</div>
                      <div style={panelTitleStyle}>Primary data preview</div>
                    </div>
                    <ExpandIconButton
                      label={`Expand ${reportLayout.primaryTable.title}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setExpandedTableSection(reportLayout.primaryTable);
                      }}
                    />
                  </div>
                  {renderPreviewRows(reportLayout.primaryTable, REPORT_TABLE_PREVIEW_LIMIT, {
                    getRowTarget: () => resolveCardTarget(reportLayout.primaryTable?.title || displayReport.title),
                    onNavigate: handleCardNavigate,
                  })}
                  {reportLayout.primaryTable.rows.length > REPORT_TABLE_PREVIEW_LIMIT ? (
                    <div style={previewMetaStyle}>
                      Showing {REPORT_TABLE_PREVIEW_LIMIT} of {reportLayout.primaryTable.rows.length} rows.
                    </div>
                  ) : null}
                </article>
              ) : null}

              {reportLayout.secondaryTable ? (
                <article
                  style={{ ...editorialPanelStyle, ...listPanelStyle, ...interactiveSurfaceStyle }}
                  title="Double-click to open the related page."
                  onDoubleClick={(event) =>
                    handleCardNavigate(event, resolveCardTarget(reportLayout.secondaryTable?.title || displayReport.title))
                  }
                >
                  <div style={listCardHeaderStyle}>
                    <div>
                      <div style={panelEyebrowStyle}>{reportLayout.secondaryTable.title}</div>
                      <div style={panelTitleStyle}>Secondary data preview</div>
                    </div>
                    <ExpandIconButton
                      label={`Expand ${reportLayout.secondaryTable.title}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setExpandedTableSection(reportLayout.secondaryTable);
                      }}
                    />
                  </div>
                  {renderPreviewRows(reportLayout.secondaryTable, REPORT_TABLE_PREVIEW_LIMIT, {
                    getRowTarget: () => resolveCardTarget(reportLayout.secondaryTable?.title || displayReport.title),
                    onNavigate: handleCardNavigate,
                  })}
                  {reportLayout.secondaryTable.rows.length > REPORT_TABLE_PREVIEW_LIMIT ? (
                    <div style={previewMetaStyle}>
                      Showing {REPORT_TABLE_PREVIEW_LIMIT} of {reportLayout.secondaryTable.rows.length} rows.
                    </div>
                  ) : null}
                </article>
              ) : null}
            </div>

            {reportLayout.remainingSections.length > 0 ? (
              <div style={sectionStackStyle}>
                <div style={editorialSectionTitleWrapStyle}>
                  <div style={panelEyebrowStyle}>Additional Sections</div>
                  <div style={panelTitleStyle}>Current report detail blocks</div>
                </div>
                <div style={editorialSectionGridStyle}>
                  {reportLayout.remainingSections.map((section, index) => (
                    <section
                      key={`${section.title}-${index}`}
                      style={{ ...sectionCardStyle, ...interactiveSurfaceStyle }}
                      title="Double-click to open the related page."
                      onDoubleClick={(event) => handleCardNavigate(event, resolveCardTarget(section.title))}
                    >
                      <div style={sectionHeaderStyle}>
                        <div style={{ minWidth: 0 }}>
                          <h3 style={sectionTitleStyle}>{section.title}</h3>
                          {section.description ? <p style={sectionDescriptionStyle}>{section.description}</p> : null}
                        </div>
                        {section.type === 'table' ? (
                          <ExpandIconButton
                            label={`Expand ${section.title}`}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setExpandedTableSection(section);
                            }}
                          />
                        ) : null}
                      </div>

                      {section.type === 'metrics' ? (
                        <div style={metricGridStyle}>
                          {section.items.map((item) => (
                            <article
                              key={`${section.title}-${item.label}`}
                              style={{
                                ...metricCardStyle,
                                ...interactiveSurfaceStyle,
                                ...(item.tone === 'good'
                                  ? metricCardGoodStyle
                                  : item.tone === 'warn'
                                    ? metricCardWarnStyle
                                    : item.tone === 'danger'
                                      ? metricCardDangerStyle
                                      : null),
                              }}
                              title="Double-click to open the related page."
                              onDoubleClick={(event) =>
                                handleCardNavigate(event, resolveCardTarget(`${section.title} ${item.label}`))
                              }
                            >
                              <div style={metricLabelStyle}>{item.label}</div>
                              <div style={metricValueStyle}>{formatDisplayValue(item.value)}</div>
                              {item.hint ? <div style={metricHintStyle}>{item.hint}</div> : null}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <>
                          {renderPreviewRows(section, REPORT_TABLE_PREVIEW_LIMIT, {
                            getRowTarget: () => resolveCardTarget(section.title),
                            onNavigate: handleCardNavigate,
                          })}
                          {section.rows.length > REPORT_TABLE_PREVIEW_LIMIT ? (
                            <div style={previewMetaStyle}>
                              Showing {REPORT_TABLE_PREVIEW_LIMIT} of {section.rows.length} rows.
                            </div>
                          ) : null}
                        </>
                      )}
                    </section>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        )}
        <FloatingListPanel
          open={expandedTableSection !== null}
          onClose={() => setExpandedTableSection(null)}
          title={expandedTableSection?.title || 'Expanded table'}
          description={
            expandedTableSection?.description
            || (expandedTableSection ? `${expandedTableSection.rows.length} rows available in this section.` : undefined)
          }
        >
          {expandedTableSection ? (
            <>
              {renderExpandedTableRows(expandedTableSection, paginatedExpandedTableRows)}
              <Pagination
                currentPage={expandedTablePage}
                totalItems={expandedTableSection.rows.length}
                itemsPerPage={REPORT_TABLE_PAGE_SIZE}
                onPageChange={setExpandedTablePage}
                label="rows"
              />
            </>
          ) : null}
        </FloatingListPanel>
      </div>
    </Layout>
  );
}

const pageShellStyle = {
  display: 'grid',
  gap: 12,
  padding: '2px 0 20px',
};

const controlCardStyle = {
  background: '#ffffff',
  border: '1px solid #dbe4f0',
  borderRadius: 18,
  padding: 12,
  boxShadow: '0 8px 20px rgba(15, 23, 42, 0.04)',
};

const controlGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 10,
};

const fieldWrapStyle = {
  display: 'grid',
  gap: 6,
};

const fieldLabelStyle = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: '#64748b',
};

const fieldStyle = {
  width: '100%',
  borderRadius: 10,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  color: '#0f172a',
  padding: '10px 12px',
  fontSize: 13,
};

const compactFieldStyle = {
  ...fieldStyle,
  padding: '9px 12px',
  minWidth: 0,
};

const actionRowStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 6,
  flexWrap: 'wrap' as const,
  marginTop: 10,
};

const subreportWrapStyle = {
  display: 'grid',
  gap: 8,
  marginTop: 12,
  paddingTop: 12,
  borderTop: '1px solid #e2e8f0',
};

const subreportHeaderStyle = {
  display: 'grid',
  gap: 4,
};

const subreportDescriptionStyle = {
  color: '#475569',
  fontSize: 11,
  lineHeight: 1.5,
};

const subreportButtonRowStyle = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 8,
};

const subreportButtonStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: 999,
  background: '#ffffff',
  color: '#334155',
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
};

const activeSubreportButtonStyle = {
  ...subreportButtonStyle,
  borderColor: '#1d4ed8',
  background: '#eff6ff',
  color: '#1d4ed8',
  boxShadow: '0 10px 22px rgba(37, 99, 235, 0.12)',
};

const primaryButtonStyle = {
  border: '1px solid #1d4ed8',
  borderRadius: 10,
  background: '#1d4ed8',
  color: '#ffffff',
  padding: '9px 14px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
};

const secondaryButtonStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  background: '#ffffff',
  color: '#334155',
  padding: '9px 14px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
};

const reportCanvasStyle = {
  display: 'grid',
  gap: 12,
  background: '#f8fafc',
  border: '1px solid #dbe4f0',
  borderRadius: 20,
  padding: 12,
};

const reportCanvasHeaderStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 12,
  alignItems: 'start',
};

const reportCanvasTitleWrapStyle = {
  display: 'grid',
  gap: 8,
  alignContent: 'start',
};

const reportCanvasToolsStyle = {
  display: 'grid',
  gap: 8,
  alignContent: 'start',
};

const reportHeaderEyebrowStyle = {
  marginBottom: 0,
  fontSize: 12,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  color: '#0f766e',
  fontWeight: 800,
};

const reportTitleStyle = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.25,
  color: '#0f172a',
};

const reportDescriptionStyle = {
  margin: 0,
  color: '#475569',
  lineHeight: 1.55,
  fontSize: 12,
  maxWidth: 560,
};

const reportMetaStyle = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap' as const,
};

const metaBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 28,
  borderRadius: 999,
  padding: '5px 8px',
  background: '#ffffff',
  border: '1px solid #dbe4f0',
  color: '#64748b',
  fontSize: 10,
};

const exportPanelWrapStyle = {
  display: 'grid',
  gap: 8,
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
};

const exportPanelStyle = {
  border: '1px solid #dbe4f0',
  borderRadius: 14,
  background: '#ffffff',
  padding: 10,
};

const exportPanelTitleStyle = {
  marginBottom: 8,
  fontSize: 11,
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  color: '#475569',
};

const exportControlRowStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 8,
  alignItems: 'center',
};

const exportHintStyle = {
  color: '#64748b',
  fontSize: 10,
  lineHeight: 1.5,
};

const sectionStackStyle = {
  display: 'grid',
  gap: 12,
};

const editorialHeroGridStyle = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
};

const editorialSecondaryGridStyle = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
};

const editorialSectionTitleWrapStyle = {
  display: 'grid',
  gap: 4,
};

const editorialSectionGridStyle = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
};

const editorialPanelStyle = {
  display: 'grid',
  gap: 10,
  alignContent: 'start',
  background: '#ffffff',
  border: '1px solid #dbe4f0',
  borderRadius: 16,
  padding: 12,
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.04)',
};

const interactiveSurfaceStyle = {
  cursor: 'pointer',
  userSelect: 'none' as const,
};

const briefPanelStyle = {
  minHeight: 220,
};

const spotlightPanelStyle = {
  minHeight: 220,
};

const snapshotPanelStyle = {
  minHeight: 220,
};

const chartPanelStyle = {
  minHeight: 240,
};

const listPanelStyle = {
  minHeight: 240,
};

const panelEyebrowStyle = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: '#64748b',
};

const panelTitleStyle = {
  fontSize: 14,
  fontWeight: 800,
  color: '#0f172a',
  lineHeight: 1.3,
};

const briefCopyStackStyle = {
  display: 'grid',
  gap: 8,
};

const briefCopyStyle = {
  margin: 0,
  fontSize: 11,
  color: '#475569',
  lineHeight: 1.55,
};

const briefFactGridStyle = {
  display: 'grid',
  gap: 8,
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
};

const briefFactStyle = {
  display: 'grid',
  gap: 4,
  borderRadius: 14,
  border: '1px solid #dbe4f0',
  background: '#f8fafc',
  padding: 10,
};

const briefFactLabelStyle = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: '#64748b',
};

const briefFactValueStyle = {
  fontSize: 14,
  lineHeight: 1.25,
  color: '#0f172a',
};

const spotlightBodyStyle = {
  display: 'grid',
  gap: 10,
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  alignItems: 'center',
};

const chartFrameStyle = {
  position: 'relative' as const,
  minHeight: 180,
};

const legendListStyle = {
  display: 'grid',
  gap: 8,
};

const legendRowStyle = {
  display: 'grid',
  gridTemplateColumns: '12px minmax(0, 1fr)',
  gap: 10,
  alignItems: 'start',
};

const legendSwatchStyle = {
  width: 12,
  height: 12,
  borderRadius: 999,
  marginTop: 4,
};

const legendTextStyle = {
  display: 'grid',
  gap: 2,
};

const legendLabelStyle = {
  color: '#0f172a',
  fontSize: 11,
};

const legendValueStyle = {
  color: '#475569',
  fontSize: 10,
};

const emptyMiniStateStyle = {
  borderRadius: 14,
  border: '1px dashed #cbd5e1',
  background: '#f8fafc',
  padding: 12,
  color: '#64748b',
  fontSize: 11,
};

const snapshotGridStyle = {
  display: 'grid',
  gap: 8,
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
};

const snapshotCardStyle = {
  display: 'grid',
  gap: 6,
  borderRadius: 14,
  border: '1px solid #dbe4f0',
  background: '#f8fafc',
  padding: 10,
  alignContent: 'start',
};

const snapshotLabelStyle = {
  color: '#64748b',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
};

const snapshotValueStyle = {
  color: '#0f172a',
  fontSize: 14,
  lineHeight: 1.25,
};

const snapshotHintStyle = {
  color: '#475569',
  fontSize: 10,
  lineHeight: 1.5,
};

const barChartWrapStyle = {
  minHeight: 190,
};

const sectionCardStyle = {
  ...editorialPanelStyle,
  minHeight: 0,
};

const sectionHeaderStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
};

const sectionTitleStyle = {
  margin: 0,
  fontSize: 14,
  color: '#0f172a',
};

const sectionDescriptionStyle = {
  margin: 0,
  color: '#64748b',
  fontSize: 11,
  lineHeight: 1.6,
};

const metricGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 8,
};

const metricCardStyle = {
  display: 'grid',
  gap: 6,
  alignContent: 'start',
  borderRadius: 14,
  border: '1px solid #dbe4f0',
  background: '#f8fafc',
  padding: 10,
};

const metricCardGoodStyle = {
  background: '#ecfdf5',
  borderColor: '#a7f3d0',
};

const metricCardWarnStyle = {
  background: '#fff7ed',
  borderColor: '#fdba74',
};

const metricCardDangerStyle = {
  background: '#fef2f2',
  borderColor: '#fca5a5',
};

const metricLabelStyle = {
  color: '#64748b',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
};

const metricValueStyle = {
  color: '#0f172a',
  fontSize: 14,
  lineHeight: 1.25,
  fontWeight: 800,
};

const metricHintStyle = {
  color: '#475569',
  fontSize: 10,
  lineHeight: 1.5,
};

const previewListStyle = {
  display: 'grid',
  gap: 8,
};

const previewRowStyle = {
  display: 'grid',
  gap: 6,
  borderRadius: 14,
  border: '1px solid #dbe4f0',
  background: '#f8fafc',
  padding: 10,
};

const previewRowMainStyle = {
  display: 'grid',
  gap: 4,
};

const previewRowTitleStyle = {
  color: '#0f172a',
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.4,
};

const previewRowDetailStyle = {
  color: '#475569',
  fontSize: 10,
  lineHeight: 1.5,
};

const previewBadgeWrapStyle = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 6,
};

const previewBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 24,
  borderRadius: 999,
  background: '#ffffff',
  border: '1px solid #dbe4f0',
  color: '#64748b',
  fontSize: 11,
  padding: '4px 8px',
};

const listCardHeaderStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 12,
};

const previewMetaStyle = {
  marginTop: 10,
  color: '#64748b',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.03em',
};

const expandedTableWrapStyle = {
  overflowX: 'auto' as const,
  borderRadius: 18,
  border: '1px solid #dbe4f0',
  background: '#f8fafc',
};

const expandedTableStyle = {
  width: '100%',
  minWidth: 640,
  borderCollapse: 'collapse' as const,
};

const expandedTableHeadStyle = {
  position: 'sticky' as const,
  top: 0,
  zIndex: 1,
  background: '#ffffff',
};

const expandedTableHeaderCellStyle = {
  padding: '14px 16px',
  borderBottom: '1px solid #dbe4f0',
  color: '#475569',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  textAlign: 'left' as const,
  whiteSpace: 'nowrap' as const,
};

const expandedTableRowStyle = {
  borderTop: '1px solid #e2e8f0',
};

const expandedTableBodyCellStyle = {
  padding: '13px 16px',
  color: '#0f172a',
  fontSize: 13,
  lineHeight: 1.5,
  verticalAlign: 'top' as const,
};

const loadingCardStyle = {
  border: '1px solid #dbe4f0',
  borderRadius: 18,
  background: '#ffffff',
  padding: 18,
  color: '#475569',
  fontSize: 12,
  textAlign: 'center' as const,
};

const emptyStateStyle = {
  border: '1px dashed #cbd5e1',
  borderRadius: 18,
  background: '#ffffff',
  padding: 18,
  color: '#64748b',
  fontSize: 12,
  textAlign: 'center' as const,
};

const errorBannerStyle = {
  border: '1px solid #fecaca',
  borderRadius: 16,
  background: '#fef2f2',
  color: '#b91c1c',
  padding: '10px 12px',
  fontSize: 12,
  lineHeight: 1.5,
};
