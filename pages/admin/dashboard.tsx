import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  ArcElement,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import Layout from '@/components/Layout';
import { useProtectedPage } from '@/components/AuthProvider';
import {
  DashboardCalendarMini,
  DashboardCalendarOverlay,
  type DashboardCalendarEventMap,
} from '@/components/DashboardCalendar';
import { getApiBaseUrl } from '@/utils/network';
import styles from '../../styles/Layout.module.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  ArcElement,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler
);

const API_BASE = getApiBaseUrl();

interface AnalyticsCounts {
  total_users: number;
  total_projects: number;
  total_clients: number;
  tasks_total: number;
  tasks_pending: number;
  tasks_in_progress: number;
  tasks_completed: number;
  payroll_pending: number;
}

interface TrendPoint {
  date: string;
  created: number;
  completed: number;
}

interface AnalyticsResponse {
  success?: boolean;
  data?: {
    counts?: Partial<AnalyticsCounts>;
    trend?: TrendPoint[];
  };
}

interface PayrollMonthlyPoint {
  month: string;
  total: number;
}

interface PayrollKpi {
  headcount: number;
  total_payroll: number;
  total_salaries: number;
  total_deductions: number;
  total_benefits: number;
  avg_salary: number;
  avg_deductions: number;
  avg_benefit: number;
}

interface PayrollAnalyticsResponse {
  success?: boolean;
  data?: {
    kpi?: Partial<PayrollKpi>;
    charts?: {
      monthly?: PayrollMonthlyPoint[];
    };
  };
}

interface DashboardUser {
  id: number;
  username?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
  status?: string | null;
  created_at?: string | null;
  branch_name?: string | null;
  employee_name?: string | null;
  salary?: number | string | null;
}

interface UsersResponse {
  success?: boolean;
  data?: DashboardUser[];
}

interface ActivityLogRow {
  id: number;
  user_id: number | null;
  action: string;
  description?: string | null;
  activity_type?: string | null;
  created_at: string;
  first_name?: string | null;
  last_name?: string | null;
}

interface ActivityLogsResponse {
  success?: boolean;
  data?: ActivityLogRow[];
}

interface ProjectCalendarRow {
  id: number;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

interface ProjectsResponse {
  success?: boolean;
  data?: ProjectCalendarRow[];
}

interface CalendarTaskRow {
  id: number;
  title: string;
  client_name?: string | null;
  project_name?: string | null;
  status?: string | null;
  due_date?: string | null;
}

interface TasksResponse {
  success?: boolean;
  data?: CalendarTaskRow[];
}

const EMPTY_COUNTS: AnalyticsCounts = {
  total_users: 0,
  total_projects: 0,
  total_clients: 0,
  tasks_total: 0,
  tasks_pending: 0,
  tasks_in_progress: 0,
  tasks_completed: 0,
  payroll_pending: 0,
};

const EMPTY_PAYROLL_KPI: PayrollKpi = {
  headcount: 0,
  total_payroll: 0,
  total_salaries: 0,
  total_deductions: 0,
  total_benefits: 0,
  avg_salary: 0,
  avg_deductions: 0,
  avg_benefit: 0,
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatShortDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildProjectDateEvents(projects: ProjectCalendarRow[]): DashboardCalendarEventMap {
  const eventMap: DashboardCalendarEventMap = {};

  for (const project of projects) {
    if (project.status === 'archived') continue;

    if (project.start_date) {
      const startDate = new Date(project.start_date);
      if (!Number.isNaN(startDate.getTime())) {
        const key = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
        eventMap[key] = eventMap[key] || { projectIds: [] };
        eventMap[key].start = true;
        if (!eventMap[key].projectIds.includes(project.id)) {
          eventMap[key].projectIds.push(project.id);
        }
      }
    }

    if (project.end_date) {
      const endDate = new Date(project.end_date);
      if (!Number.isNaN(endDate.getTime())) {
        const key = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
        eventMap[key] = eventMap[key] || { projectIds: [] };
        eventMap[key].end = true;
        if (!eventMap[key].projectIds.includes(project.id)) {
          eventMap[key].projectIds.push(project.id);
        }
      }
    }
  }

  return eventMap;
}

function getFullName(user: DashboardUser | ActivityLogRow) {
  const first = String(user.first_name || '').trim();
  const last = String(user.last_name || '').trim();
  const full = `${first} ${last}`.trim();
  return full || ('username' in user ? String(user.username || 'Unknown user') : 'System');
}

function getTaskStatusTone(status: string) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed') {
    return { background: '#dcfce7', color: '#166534' };
  }
  if (normalized === 'in_progress') {
    return { background: '#dbeafe', color: '#1d4ed8' };
  }
  if (normalized === 'cancelled') {
    return { background: '#fee2e2', color: '#b91c1c' };
  }
  return { background: '#fef3c7', color: '#92400e' };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { credentials: 'include' });
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default function AdminDashboard() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useProtectedPage({
    allowedRoles: ['admin'],
    unauthorizedRedirect: '/dashboard',
  });

  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<AnalyticsCounts>(EMPTY_COUNTS);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [payrollKpi, setPayrollKpi] = useState<PayrollKpi>(EMPTY_PAYROLL_KPI);
  const [monthlyPayroll, setMonthlyPayroll] = useState<PayrollMonthlyPoint[]>([]);
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogRow[]>([]);
  const [dateEvents, setDateEvents] = useState<DashboardCalendarEventMap>({});
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dateTasks, setDateTasks] = useState<CalendarTaskRow[]>([]);
  const [loadingDateTasks, setLoadingDateTasks] = useState(false);
  const [activityLogModalOpen, setActivityLogModalOpen] = useState(false);
  const [selectedActivityLog, setSelectedActivityLog] = useState<ActivityLogRow | null>(null);
  const [activityLogExpandedModalOpen, setActivityLogExpandedModalOpen] = useState(false);
  const [activityLogSearchQuery, setActivityLogSearchQuery] = useState('');
  const [activityLogFilterAction, setActivityLogFilterAction] = useState('all');
  const [activityLogFilterType, setActivityLogFilterType] = useState('all');
  const [activityLogFilterStartDate, setActivityLogFilterStartDate] = useState('');
  const [activityLogFilterEndDate, setActivityLogFilterEndDate] = useState('');
  const [activityLogDashboardPage, setActivityLogDashboardPage] = useState(1);
  const [activityLogExpandedPage, setActivityLogExpandedPage] = useState(1);
  const [activityLogItemsPerPage] = useState(6);

  useEffect(() => {
    if (String(user?.role || '').toLowerCase() !== 'admin') {
      if (!authLoading) {
        setLoading(false);
      }
      return;
    }

    let active = true;

    const loadDashboard = async () => {
      setLoading(true);

      const [analytics, payroll, usersRes, logsRes, projectsRes] = await Promise.all([
        fetchJson<AnalyticsResponse>(`${API_BASE}/analytics.php`),
        fetchJson<PayrollAnalyticsResponse>(`${API_BASE}/payroll_analytics.php`),
        fetchJson<UsersResponse>(`${API_BASE}/users.php?status=active`),
        fetchJson<ActivityLogsResponse>(`${API_BASE}/activity-logs.php?limit=6&offset=0`),
        fetchJson<ProjectsResponse>(`${API_BASE}/projects.php?compact=calendar`),
      ]);

      if (!active) return;

      setCounts({ ...EMPTY_COUNTS, ...(analytics?.data?.counts || {}) });
      setTrend(Array.isArray(analytics?.data?.trend) ? analytics!.data!.trend! : []);
      setPayrollKpi({ ...EMPTY_PAYROLL_KPI, ...(payroll?.data?.kpi || {}) });
      setMonthlyPayroll(Array.isArray(payroll?.data?.charts?.monthly) ? payroll!.data!.charts!.monthly! : []);
      setUsers(Array.isArray(usersRes?.data) ? usersRes!.data! : []);
      setActivityLogs(Array.isArray(logsRes?.data) ? logsRes!.data! : []);
      setDateEvents(buildProjectDateEvents(Array.isArray(projectsRes?.data) ? projectsRes!.data! : []));
      setLoading(false);
    };

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [authLoading, user?.role]);

  const openTasksForDate = async (date: string) => {
    setSelectedDate(date);
    const event = dateEvents[date];
    if (!event || event.projectIds.length === 0) {
      setDateTasks([]);
      setDateModalOpen(true);
      return;
    }

    setLoadingDateTasks(true);
    try {
      const params = new URLSearchParams();
      params.set('project_ids', event.projectIds.join(','));
      const result = await fetchJson<TasksResponse>(`${API_BASE}/tasks.php?${params.toString()}`);
      setDateTasks(Array.isArray(result?.data) ? result!.data! : []);
    } finally {
      setLoadingDateTasks(false);
      setDateModalOpen(true);
    }
  };

  const roleBreakdown = useMemo(() => {
    return users.reduce(
      (acc, current) => {
        const role = String(current.role || '').toLowerCase();
        if (role === 'admin') acc.admin += 1;
        else if (role === 'manager') acc.manager += 1;
        else acc.staff += 1;
        return acc;
      },
      { admin: 0, manager: 0, staff: 0 }
    );
  }, [users]);

  const recentUsers = useMemo(() => {
    return [...users]
      .sort((left, right) => new Date(String(right.created_at || '')).getTime() - new Date(String(left.created_at || '')).getTime())
      .slice(0, 5);
  }, [users]);

  useEffect(() => {
    setActivityLogDashboardPage(1);
    setActivityLogExpandedPage(1);
  }, [activityLogFilterAction, activityLogFilterType, activityLogFilterStartDate, activityLogFilterEndDate, activityLogSearchQuery]);

  const topActivityTypes = useMemo(() => {
    const map = new Map<string, number>();
    for (const log of activityLogs) {
      const key = String(log.activity_type || 'general').trim() || 'general';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4);
  }, [activityLogs]);

  const filteredActivityLogs = useMemo(() => {
    let filtered = activityLogs;

    // Filter by action
    if (activityLogFilterAction !== 'all') {
      filtered = filtered.filter((log) => String(log.action || '').toLowerCase() === activityLogFilterAction.toLowerCase());
    }

    // Filter by type
    if (activityLogFilterType !== 'all') {
      filtered = filtered.filter((log) => String(log.activity_type || 'general').toLowerCase() === activityLogFilterType.toLowerCase());
    }

    // Filter by date range
    if (activityLogFilterStartDate) {
      const startTime = new Date(activityLogFilterStartDate).getTime();
      filtered = filtered.filter((log) => new Date(String(log.created_at || '')).getTime() >= startTime);
    }
    if (activityLogFilterEndDate) {
      const endTime = new Date(activityLogFilterEndDate).getTime() + 86400000; // End of day
      filtered = filtered.filter((log) => new Date(String(log.created_at || '')).getTime() <= endTime);
    }

    // Search query - search across all fields
    if (activityLogSearchQuery.trim()) {
      const query = activityLogSearchQuery.toLowerCase();
      filtered = filtered.filter((log) => {
        const searchableText = `${getFullName(log)} ${log.action} ${log.activity_type} ${log.description} ${log.created_at}`.toLowerCase();
        return searchableText.includes(query);
      });
    }

    return filtered;
  }, [activityLogs, activityLogFilterAction, activityLogFilterType, activityLogFilterStartDate, activityLogFilterEndDate, activityLogSearchQuery]);

  const paginatedActivityLogsDashboard = useMemo(() => {
    const startIndex = (activityLogDashboardPage - 1) * activityLogItemsPerPage;
    return filteredActivityLogs.slice(startIndex, startIndex + activityLogItemsPerPage);
  }, [filteredActivityLogs, activityLogDashboardPage, activityLogItemsPerPage]);

  const dashboardActivityLogTotalPages = useMemo(() => {
    return Math.ceil(filteredActivityLogs.length / activityLogItemsPerPage);
  }, [filteredActivityLogs, activityLogItemsPerPage]);

  const paginatedActivityLogsExpanded = useMemo(() => {
    const startIndex = (activityLogExpandedPage - 1) * 20;
    return filteredActivityLogs.slice(startIndex, startIndex + 20);
  }, [filteredActivityLogs, activityLogExpandedPage]);

  const expandedActivityLogTotalPages = useMemo(() => {
    return Math.ceil(filteredActivityLogs.length / 20);
  }, [filteredActivityLogs]);

  const lineData = useMemo(() => ({
    labels: trend.map((item) => formatShortDate(item.date)),
    datasets: [
      {
        label: 'Created',
        data: trend.map((item) => item.created),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.16)',
        fill: true,
        tension: 0.35,
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: 'Completed',
        data: trend.map((item) => item.completed),
        borderColor: '#a855f7',
        backgroundColor: 'rgba(168, 85, 247, 0.08)',
        fill: true,
        tension: 0.35,
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  }), [trend]);

  const lineOptions = useMemo<ChartOptions<'line'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          padding: 16,
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1 },
        grid: { color: 'rgba(148, 163, 184, 0.15)' },
      },
    },
  }), []);

  const barData = useMemo(() => ({
    labels: monthlyPayroll.map((item) => item.month),
    datasets: [
      {
        label: 'Net Payroll',
        data: monthlyPayroll.map((item) => item.total),
        backgroundColor: ['#2563eb', '#38bdf8', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'],
        borderRadius: 10,
        maxBarThickness: 38,
      },
    ],
  }), [monthlyPayroll]);

  const barOptions = useMemo<ChartOptions<'bar'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(148, 163, 184, 0.15)' },
      },
    },
  }), []);

  const doughnutData = useMemo(() => ({
    labels: ['Pending', 'In Progress', 'Completed'],
    datasets: [
      {
        data: [counts.tasks_pending, counts.tasks_in_progress, counts.tasks_completed],
        backgroundColor: ['#f59e0b', '#2563eb', '#8b5cf6'],
        borderColor: ['#fcd34d', '#93c5fd', '#d8b4fe'],
        borderWidth: 2,
        hoverOffset: 8,
      },
    ],
  }), [counts.tasks_completed, counts.tasks_in_progress, counts.tasks_pending]);

  const doughnutOptions = useMemo<ChartOptions<'doughnut'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 16,
        },
      },
    },
  }), []);

  const cardStyle: CSSProperties = {
    background: '#ffffff',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  };

  if (authLoading || loading) {
    return (
      <Layout role="admin" user={user} onLogout={logout}>
        <div style={{ padding: 20 }}>Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout role="admin" user={user} onLogout={logout}>
      <Head>
        <title>Admin Dashboard</title>
      </Head>

      <div style={{ display: 'grid', gap: 10, padding: '16px', maxWidth: 1520, width: '100%', margin: '0 auto', overflowX: 'hidden' }}>
        <div className={styles.banner}>
          <div className={styles.bannerOverlay}></div>
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ padding: '6px 10px', flex: '1 1 240px', minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: '14px' }}>Welcome back, Admin!</h1>
              <p style={{ margin: '2px 0 0 0', opacity: 0.9, fontSize: '12px' }}>Here&apos;s what&apos;s happening with your system today.</p>
            </div>

            <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, padding: 4, flex: '1 1 920px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 620px', minWidth: 280, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {[
                  {
                    label: 'Total Users',
                    value: counts.total_users,
                    color: '#1e3a8a',
                    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
                  },
                  {
                    label: 'Pending Tasks',
                    value: counts.tasks_pending,
                    color: '#fbbf24',
                    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>,
                  },
                  {
                    label: 'Completed Tasks',
                    value: counts.tasks_completed,
                    color: '#1e3a8a',
                    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
                  },
                  {
                    label: 'Payroll Pending',
                    value: counts.payroll_pending,
                    color: '#fbbf24',
                    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>,
                  },
                  {
                    label: 'Projects',
                    value: counts.total_projects,
                    color: '#1e3a8a',
                    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
                  },
                  {
                    label: 'Clients',
                    value: counts.total_clients,
                    color: '#fbbf24',
                    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>,
                  },
                ].map((item) => (
                  <div key={item.label} className={styles.statsCard} style={{ minWidth: 0 }}>
                    <div className={styles.statsIconBox} style={{ background: item.color }}>
                      {item.icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#111827', lineHeight: 1 }}>{item.value}</h2>
                      <p style={{ margin: 0, color: '#6b7280', fontSize: '11px', lineHeight: 1.2 }}>{item.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ flex: '0 1 250px', minWidth: 230, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <DashboardCalendarMini
                  onExpand={() => setCalendarOpen(true)}
                  events={dateEvents}
                  onDayClick={(date) => {
                    void openTasksForDate(date);
                  }}
                  theme="light"
                />
              </div>
            </div>
          </div>
        </div>



        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', gap: '10px' }}>
          <div style={{ ...cardStyle, padding: 14, minHeight: 280, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#111827', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              Task Distribution
            </h3>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <div style={{ width: '100%', maxWidth: 260, aspectRatio: '1', margin: '0 auto' }}>
                <Doughnut data={doughnutData} options={doughnutOptions} />
              </div>
              <div style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{counts.tasks_total}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Total Tasks</div>
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 14, minHeight: 280, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#111827', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
              Task Activity Trends (Last 7 Days)
            </h3>
            <div style={{ flex: 1, minHeight: 0 }}>
              <Line data={lineData} options={lineOptions} />
            </div>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(350px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
          <div style={{ ...cardStyle, padding: 20, minHeight: 320 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Monthly Payroll</h2>
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>Net payroll totals from live payroll analytics.</p>
              </div>
              <div style={{ color: '#0f172a', fontWeight: 800 }}>{formatCurrency(payrollKpi.total_payroll)}</div>
            </div>
            <div style={{ height: 230 }}>
              <Bar data={barData} options={barOptions} />
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 20, minHeight: 320 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Activity Types</h2>
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>Recent log categories seen in the system.</p>
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              {topActivityTypes.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: 13 }}>No activity logs available.</div>
              ) : (
                topActivityTypes.map(([label, value], index) => (
                  <div key={label} style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                      <span style={{ color: '#0f172a', fontWeight: 700, textTransform: 'capitalize' }}>{label.replace(/_/g, ' ')}</span>
                      <span style={{ color: '#64748b' }}>{value}</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, (value / Math.max(1, activityLogs.length)) * 100)}%`,
                          height: '100%',
                          borderRadius: 999,
                          background: ['#2563eb', '#06b6d4', '#8b5cf6', '#ec4899'][index % 4],
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section style={{ ...cardStyle, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Recent Activity</h2>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>Latest entries from the live activity log.</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setActivityLogExpandedModalOpen(true)} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 12, padding: '8px 12px', cursor: 'pointer', color: '#0f172a', fontWeight: 700, transition: 'all 0.15s ease', fontSize: 13 }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = '#f8fafc';
                  (e.currentTarget as HTMLElement).style.borderColor = '#bfdbfe';
                }}>
                ↗ Expand
              </button>
              <button onClick={() => router.push('/reports')} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 12, padding: '8px 12px', cursor: 'pointer', color: '#0f172a', fontWeight: 700 }}>
                Reports
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 4 }}>
            {filteredActivityLogs.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13, padding: '8px 0' }}>No recent activity logs found.</div>
            ) : (
              paginatedActivityLogsDashboard.map((log) => (
                <button
                  key={log.id}
                  onClick={() => {
                    setSelectedActivityLog(log);
                    setActivityLogModalOpen(true);
                  }}
                  style={{
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    borderRadius: 8,
                    padding: '5px 8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = '#f1f5f9';
                    (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = '#f8fafc';
                    (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 12 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0, flex: 1 }}>
                      <span style={{ padding: '2px 5px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                        {log.action}
                      </span>
                      <span style={{ color: '#0f172a', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getFullName(log)}
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: 11, flexShrink: 0 }}>•</span>
                      <span style={{ color: '#64748b', fontSize: 11, textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {String(log.activity_type || 'general').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}>
                      {formatDateTime(log.created_at)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          {dashboardActivityLogTotalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
              <button
                onClick={() => setActivityLogDashboardPage((p) => Math.max(1, p - 1))}
                disabled={activityLogDashboardPage === 1}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: activityLogDashboardPage === 1 ? 'not-allowed' : 'pointer', color: '#0f172a', fontSize: 12, fontWeight: 600, opacity: activityLogDashboardPage === 1 ? 0.5 : 1 }}
              >
                ← Prev
              </button>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {Array.from({ length: dashboardActivityLogTotalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setActivityLogDashboardPage(page)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: page === activityLogDashboardPage ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                      background: page === activityLogDashboardPage ? '#eff6ff' : '#fff',
                      cursor: 'pointer',
                      color: page === activityLogDashboardPage ? '#1d4ed8' : '#0f172a',
                      fontSize: 12,
                      fontWeight: page === activityLogDashboardPage ? 700 : 600,
                    }}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setActivityLogDashboardPage((p) => Math.min(dashboardActivityLogTotalPages, p + 1))}
                disabled={activityLogDashboardPage === dashboardActivityLogTotalPages}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: activityLogDashboardPage === dashboardActivityLogTotalPages ? 'not-allowed' : 'pointer', color: '#0f172a', fontSize: 12, fontWeight: 600, opacity: activityLogDashboardPage === dashboardActivityLogTotalPages ? 0.5 : 1 }}
              >
                Next →
              </button>
            </div>
          )}
        </section>
      </div>

      <DashboardCalendarOverlay
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        events={dateEvents}
        onDayClick={(date) => {
          void openTasksForDate(date);
        }}
      />

      {dateModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: 'min(920px, 100%)', maxHeight: '86vh', overflow: 'auto', background: '#ffffff', borderRadius: 24, border: '1px solid #e5e7eb', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Project Tasks on {selectedDate}</h2>
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>Tasks linked to projects scheduled on the selected calendar date.</p>
              </div>
              <button onClick={() => setDateModalOpen(false)} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 12, padding: '8px 12px', cursor: 'pointer', color: '#0f172a', fontWeight: 700 }}>
                Close
              </button>
            </div>

            {loadingDateTasks ? (
              <div style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>Loading tasks...</div>
            ) : dateTasks.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>No project tasks found for this date.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {dateTasks.map((task) => {
                  const tone = getTaskStatusTone(String(task.status || 'pending'));
                  return (
                    <div key={task.id} style={{ borderRadius: 18, border: '1px solid #e2e8f0', background: '#f8fafc', padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{task.title}</div>
                          <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>
                            {(task.client_name || 'No client')} | {(task.project_name || 'No project')}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ ...tone, borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 800, textTransform: 'capitalize' }}>
                            {String(task.status || 'pending').replace(/_/g, ' ')}
                          </span>
                          <span style={{ color: '#64748b', fontSize: 12 }}>{formatDateTime(task.due_date)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activityLogModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: 'min(500px, 100%)', maxHeight: '70vh', overflow: 'auto', background: '#ffffff', borderRadius: 24, border: '1px solid #e5e7eb', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #e5e7eb' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Activity Details</h2>
              </div>
              <button onClick={() => setActivityLogModalOpen(false)} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 12, padding: '6px 10px', cursor: 'pointer', color: '#0f172a', fontWeight: 600, fontSize: 12 }}>
                Close
              </button>
            </div>

            {selectedActivityLog && (
              <div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>User</span>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{getFullName(selectedActivityLog)}</div>
                </div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Action</span>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', textTransform: 'capitalize' }}>
                    <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: 12 }}>
                      {selectedActivityLog.action}
                    </span>
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Activity Type</span>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', textTransform: 'capitalize' }}>
                    {String(selectedActivityLog.activity_type || 'general').replace(/_/g, ' ')}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Timestamp</span>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{formatDateTime(selectedActivityLog.created_at)}</div>
                </div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>Description</span>
                  <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    {selectedActivityLog.description || 'No description provided.'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activityLogExpandedModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', zIndex: 20001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: 'min(1200px, 100%)', maxHeight: '92vh', overflow: 'hidden', background: '#ffffff', borderRadius: 24, border: '1px solid #e5e7eb', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 24, paddingBottom: 16, borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, color: '#0f172a' }}>All Activity Logs</h2>
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>Search and filter system activity logs.</p>
              </div>
              <button onClick={() => setActivityLogExpandedModalOpen(false)} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 12, padding: '8px 12px', cursor: 'pointer', color: '#0f172a', fontWeight: 700 }}>
                Close
              </button>
            </div>

            <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 300px', minWidth: 200 }}>
                  <input
                    type="text"
                    placeholder="Search by user, action, type, description, or date..."
                    value={activityLogSearchQuery}
                    onChange={(e) => setActivityLogSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                      fontSize: 12,
                      color: '#0f172a',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ minWidth: 130 }}>
                  <select
                    value={activityLogFilterAction}
                    onChange={(e) => setActivityLogFilterAction(e.target.value)}
                    style={{ width: '100%', padding: '8px 8px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12, color: '#0f172a' }}
                    title="Filter by Action"
                  >
                    <option value="all">All Actions</option>
                    <option value="create">Create</option>
                    <option value="update">Update</option>
                    <option value="delete">Delete</option>
                    <option value="view">View</option>
                    <option value="login">Login</option>
                  </select>
                </div>

                <div style={{ minWidth: 120 }}>
                  <select
                    value={activityLogFilterType}
                    onChange={(e) => setActivityLogFilterType(e.target.value)}
                    style={{ width: '100%', padding: '8px 8px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12, color: '#0f172a' }}
                    title="Filter by Type"
                  >
                    <option value="all">All Types</option>
                    <option value="general">General</option>
                    <option value="user">User</option>
                    <option value="project">Project</option>
                    <option value="payroll">Payroll</option>
                    <option value="task">Task</option>
                  </select>
                </div>

                <div style={{ minWidth: 140 }}>
                  <input
                    type="date"
                    value={activityLogFilterStartDate}
                    onChange={(e) => setActivityLogFilterStartDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 8px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12, color: '#0f172a' }}
                    title="Start Date"
                  />
                </div>

                <div style={{ minWidth: 140 }}>
                  <input
                    type="date"
                    value={activityLogFilterEndDate}
                    onChange={(e) => setActivityLogFilterEndDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 8px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12, color: '#0f172a' }}
                    title="End Date"
                  />
                </div>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'grid', gap: 8, flex: 1 }}>
                {filteredActivityLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 14, padding: '40px 20px' }}>
                    No activity logs found matching your filters.
                  </div>
                ) : (
                  paginatedActivityLogsExpanded.map((log) => (
                    <button
                      key={log.id}
                      onClick={() => {
                        setSelectedActivityLog(log);
                        setActivityLogExpandedModalOpen(false);
                        setActivityLogModalOpen(true);
                      }}
                      style={{
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        borderRadius: 10,
                        padding: '10px 12px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = '#f1f5f9';
                        (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = '#f8fafc';
                        (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0';
                      }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center' }}>
                        <span style={{ padding: '3px 6px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                          {log.action}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {getFullName(log)}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                            {String(log.activity_type || 'general').replace(/_/g, ' ')} • {log.description || 'No description'}
                          </div>
                        </div>
                        <span style={{ color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {expandedActivityLogTotalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
                  <button
                    onClick={() => setActivityLogExpandedPage((p) => Math.max(1, p - 1))}
                    disabled={activityLogExpandedPage === 1}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: activityLogExpandedPage === 1 ? 'not-allowed' : 'pointer', color: '#0f172a', fontSize: 12, fontWeight: 600, opacity: activityLogExpandedPage === 1 ? 0.5 : 1 }}
                  >
                    ← Prev
                  </button>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {Array.from({ length: expandedActivityLogTotalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setActivityLogExpandedPage(page)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: page === activityLogExpandedPage ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                          background: page === activityLogExpandedPage ? '#eff6ff' : '#fff',
                          cursor: 'pointer',
                          color: page === activityLogExpandedPage ? '#1d4ed8' : '#0f172a',
                          fontSize: 12,
                          fontWeight: page === activityLogExpandedPage ? 700 : 600,
                        }}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setActivityLogExpandedPage((p) => Math.min(expandedActivityLogTotalPages, p + 1))}
                    disabled={activityLogExpandedPage === expandedActivityLogTotalPages}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: activityLogExpandedPage === expandedActivityLogTotalPages ? 'not-allowed' : 'pointer', color: '#0f172a', fontSize: 12, fontWeight: 600, opacity: activityLogExpandedPage === expandedActivityLogTotalPages ? 0.5 : 1 }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
