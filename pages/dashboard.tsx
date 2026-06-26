
import { useEffect, useMemo, useState, useCallback } from 'react';
import Head from 'next/head';
import { useProtectedPage } from '@/components/AuthProvider';
import ExpandIconButton from '@/components/ExpandIconButton';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import { DashboardCalendarMini, DashboardCalendarOverlay, type DashboardCalendarEventMap } from '../components/DashboardCalendar';
import { getBackendBaseUrl } from '@/utils/network';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface MySummary { pending: number; in_progress: number; completed: number }
interface ProjectCalendarSource {
    id: number;
    status?: string | null;
    start_date?: string | null;
    end_date?: string | null;
}

interface DashboardTaskRow {
    id: number;
    title: string;
    status: string;
    client_name?: string | null;
    project_name?: string | null;
    due_date?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

type TimePeriodFilter = 'week' | 'month' | 'year';

interface TaskTrendData {
    labels: string[];
    created: number[];
    completed: number[];
}

interface TaskTrendApiRow {
    date: string;
    created?: number | null;
    completed?: number | null;
}

interface DashboardCachePayload {
    tasks: DashboardTaskRow[];
    projectCount: number;
    dateEvents: DashboardCalendarEventMap;
    savedAt: number;
}

const API_BASE_URL = getBackendBaseUrl();
const DASHBOARD_CACHE_TTL_MS = 60 * 1000;
const EMPTY_SUMMARY: MySummary = { pending: 0, in_progress: 0, completed: 0 };

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

function formatDateTime(value: unknown, emptyLabel = '-') {
    const raw = String(value || '').trim();
    if (!raw) return emptyLabel;
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

function buildProjectDateEvents(projects: ProjectCalendarSource[]): DashboardCalendarEventMap {
    const eventMap: DashboardCalendarEventMap = {};
    const activeProjects = projects.filter((project) => project?.status !== 'archived');

    for (const project of activeProjects) {
        if (project?.start_date) {
            const startDate = new Date(project.start_date);
            const startKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
            eventMap[startKey] = eventMap[startKey] || { projectIds: [] };
            eventMap[startKey].start = true;
            if (!eventMap[startKey].projectIds.includes(project.id)) {
                eventMap[startKey].projectIds.push(project.id);
            }
        }

        if (project?.end_date) {
            const endDate = new Date(project.end_date);
            const endKey = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
            eventMap[endKey] = eventMap[endKey] || { projectIds: [] };
            eventMap[endKey].end = true;
            if (!eventMap[endKey].projectIds.includes(project.id)) {
                eventMap[endKey].projectIds.push(project.id);
            }
        }
    }

    return eventMap;
}

function buildTaskSummary(tasks: DashboardTaskRow[]): MySummary {
    return tasks.reduce<MySummary>((summary, task) => {
        if (task.status === 'pending') summary.pending += 1;
        else if (task.status === 'in_progress') summary.in_progress += 1;
        else if (task.status === 'completed') summary.completed += 1;
        return summary;
    }, { ...EMPTY_SUMMARY });
}

function getDashboardCacheKey(userId: number) {
    return `staff-dashboard:${userId}:v1`;
}

function readDashboardCache(userId: number): DashboardCachePayload | null {
    if (typeof window === 'undefined' || userId <= 0) return null;

    try {
        const raw = window.sessionStorage.getItem(getDashboardCacheKey(userId));
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<DashboardCachePayload> | null;
        if (!parsed || !Array.isArray(parsed.tasks) || typeof parsed.projectCount !== 'number' || typeof parsed.savedAt !== 'number') {
            window.sessionStorage.removeItem(getDashboardCacheKey(userId));
            return null;
        }

        if (Date.now() - parsed.savedAt > DASHBOARD_CACHE_TTL_MS) {
            window.sessionStorage.removeItem(getDashboardCacheKey(userId));
            return null;
        }

        return {
            tasks: parsed.tasks as DashboardTaskRow[],
            projectCount: parsed.projectCount,
            dateEvents: parsed.dateEvents && typeof parsed.dateEvents === 'object' ? parsed.dateEvents as DashboardCalendarEventMap : {},
            savedAt: parsed.savedAt,
        };
    } catch {
        return null;
    }
}

function writeDashboardCache(userId: number, payload: Omit<DashboardCachePayload, 'savedAt'>) {
    if (typeof window === 'undefined' || userId <= 0) return;

    try {
        window.sessionStorage.setItem(
            getDashboardCacheKey(userId),
            JSON.stringify({
                ...payload,
                savedAt: Date.now(),
            })
        );
    } catch {
        // Ignore storage failures; the dashboard should continue without cache.
    }
}

export default function Dashboard() {
    const ITEMS_PER_PAGE = 10;
    const EXPANDED_TASKS_PAGE_SIZE = 12;
    const { user, loading: authLoading, logout } = useProtectedPage();
    const [myTasks, setMyTasks] = useState<DashboardTaskRow[]>([]);
    const [mySummary, setMySummary] = useState<MySummary>({ pending: 0, in_progress: 0, completed: 0 });
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [tasksError, setTasksError] = useState('');
    const [dateEvents, setDateEvents] = useState<DashboardCalendarEventMap>({});
    const [projectCount, setProjectCount] = useState(0);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [dateModalOpen, setDateModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [dateTasks, setDateTasks] = useState<DashboardTaskRow[]>([]);
    const [loadingDateTasks, setLoadingDateTasks] = useState(false);
    const [tasksExpanded, setTasksExpanded] = useState(false);
    const [expandedTasksPage, setExpandedTasksPage] = useState(1);
    const [dateTasksPage, setDateTasksPage] = useState(1);
    const [timePeriod, setTimePeriod] = useState<TimePeriodFilter>('week');
    const [taskTrend, setTaskTrend] = useState<TaskTrendData>({ labels: [], created: [], completed: [] });
    const [trendLoading, setTrendLoading] = useState(false);
    useEffect(() => {
        const userId = Number(user?.id || 0);
        if (!userId) {
            if (!authLoading) {
                setMyTasks([]);
                setMySummary({ ...EMPTY_SUMMARY });
                setProjectCount(0);
                setDateEvents({});
                setLoading(false);
            }
            return;
        }

        let active = true;
        const controller = new AbortController();
        const cached = readDashboardCache(userId);

        if (cached) {
            setMyTasks(cached.tasks);
            setMySummary(buildTaskSummary(cached.tasks));
            setProjectCount(cached.projectCount);
            setDateEvents(cached.dateEvents);
            setLoading(false);
        } else {
            setLoading(true);
        }

        const loadDashboard = async () => {
            setTasksError('');

            const [tasksResult, projectsResult] = await Promise.allSettled([
                fetch(`${API_BASE_URL}/api/tasks.php?assigned_to=${userId}&include_collaborations=1&compact=dashboard`, {
                    credentials: 'include',
                    signal: controller.signal,
                }).then((res) => res.json()),
                fetch(`${API_BASE_URL}/api/projects.php?compact=calendar`, {
                    credentials: 'include',
                    signal: controller.signal,
                }).then((res) => res.json()),
            ]);

            if (!active || controller.signal.aborted) return;

            let nextTasks = cached?.tasks ?? [];
            let nextProjectCount = cached?.projectCount ?? 0;
            let nextDateEvents = cached?.dateEvents ?? {};
            let shouldPersistCache = false;
            let nextTasksError = '';

            if (tasksResult.status === 'fulfilled') {
                const data = tasksResult.value;

                if (data.success) {
                    const items: DashboardTaskRow[] = Array.isArray(data.data) ? data.data : [];
                    nextTasks = items;
                    setMyTasks(items);
                    setMySummary(buildTaskSummary(items));
                    shouldPersistCache = true;
                } else {
                    if (!cached) {
                        setMyTasks([]);
                        setMySummary({ ...EMPTY_SUMMARY });
                        nextTasks = [];
                    }
                    nextTasksError = data.message || 'Unable to load your tasks right now.';
                }
            } else {
                if (!cached) {
                    setMyTasks([]);
                    setMySummary({ ...EMPTY_SUMMARY });
                    nextTasks = [];
                }
                nextTasksError = 'Unable to connect to the task service right now.';
            }

            if (projectsResult.status === 'fulfilled' && projectsResult.value?.success) {
                const accessibleProjects: ProjectCalendarSource[] = Array.isArray(projectsResult.value.data) ? projectsResult.value.data : [];
                nextProjectCount = accessibleProjects.filter((project) => project?.status !== 'archived').length;
                nextDateEvents = buildProjectDateEvents(accessibleProjects);
                setProjectCount(nextProjectCount);
                setDateEvents(nextDateEvents);
                shouldPersistCache = true;
            } else {
                if (!cached) {
                    setProjectCount(0);
                    setDateEvents({});
                    nextProjectCount = 0;
                    nextDateEvents = {};
                }
            }

            if (active) {
                setTasksError(nextTasksError);
                if (shouldPersistCache) {
                    writeDashboardCache(userId, {
                        tasks: nextTasks,
                        projectCount: nextProjectCount,
                        dateEvents: nextDateEvents,
                    });
                }
                setLoading(false);
            }
        };

        void loadDashboard();

        return () => {
            active = false;
            controller.abort();
        };
    }, [authLoading, user?.id]);

    // Fetch task trend data based on time period
    const fetchTaskTrend = useCallback(async (userId: number, period: TimePeriodFilter) => {
        setTrendLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/analytics.php?user_id=${userId}&period=${period}`, {
                credentials: 'include',
            });
            const result = await response.json();
            
            if (result.success && Array.isArray(result.data?.trend)) {
                const trend = result.data.trend as TaskTrendApiRow[];
                setTaskTrend({
                    labels: trend.map((item) => item.date),
                    created: trend.map((item) => item.created || 0),
                    completed: trend.map((item) => item.completed || 0),
                });
            }
        } catch (error) {
            console.error('Failed to fetch task trend:', error);
        } finally {
            setTrendLoading(false);
        }
    }, []);

    useEffect(() => {
        const userId = Number(user?.id || 0);
        if (userId) {
            fetchTaskTrend(userId, timePeriod);
        }
    }, [user?.id, timePeriod, fetchTaskTrend]);

    const paginatedTasks = useMemo(
        () => myTasks.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
        [currentPage, myTasks]
    );
    const paginatedExpandedTasks = useMemo(
        () => myTasks.slice((expandedTasksPage - 1) * EXPANDED_TASKS_PAGE_SIZE, expandedTasksPage * EXPANDED_TASKS_PAGE_SIZE),
        [expandedTasksPage, myTasks]
    );

    const assignmentAnalytics = useMemo(() => {
        const today = new Date();
        const todayKey = formatDateKey(today);
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        const nextWeekKey = formatDateKey(nextWeek);
        const openStatuses = new Set(['pending', 'in_progress']);

        const projectAssignments = new Map<string, number>();
        const clientAssignments = new Map<string, number>();

        let dueToday = 0;
        let overdue = 0;
        let dueNextSevenDays = 0;
        let noDueDate = 0;

        for (const task of myTasks) {
            const projectName = String(task.project_name || '').trim() || 'Unspecified project';
            const clientName = String(task.client_name || '').trim() || 'Unspecified client';
            projectAssignments.set(projectName, (projectAssignments.get(projectName) || 0) + 1);
            clientAssignments.set(clientName, (clientAssignments.get(clientName) || 0) + 1);

            const dueKey = normalizeDateKey(task.due_date);
            if (!dueKey) {
                noDueDate += 1;
                continue;
            }

            const normalizedStatus = String(task.status || '').trim().toLowerCase();
            if (!openStatuses.has(normalizedStatus)) {
                continue;
            }

            if (dueKey === todayKey) {
                dueToday += 1;
                continue;
            }

            if (dueKey < todayKey) {
                overdue += 1;
                continue;
            }

            if (dueKey <= nextWeekKey) {
                dueNextSevenDays += 1;
            }
        }

        const toTopRows = (source: Map<string, number>) => (
            Array.from(source.entries())
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .slice(0, 5)
                .map(([label, count]) => ({ label, count }))
        );

        const completionRate = myTasks.length > 0
            ? Math.round((mySummary.completed / myTasks.length) * 100)
            : 0;

        return {
            completionRate,
            dueNextSevenDays,
            dueToday,
            noDueDate,
            overdue,
            topClients: toTopRows(clientAssignments),
            topProjects: toTopRows(projectAssignments),
            totalOpenTasks: mySummary.pending + mySummary.in_progress,
        };
    }, [mySummary.completed, mySummary.in_progress, mySummary.pending, myTasks]);

    // Premium chart data configuration
    const trendChartData = useMemo(() => ({
        labels: taskTrend.labels.map((date) => {
            const d = new Date(date);
            if (timePeriod === 'week') {
                return d.toLocaleDateString('en-US', { weekday: 'short' });
            } else if (timePeriod === 'month') {
                return `Week ${Math.ceil(d.getDate() / 7)}`;
            } else {
                return d.toLocaleDateString('en-US', { month: 'short' });
            }
        }),
        datasets: [
            {
                label: 'Tasks Created',
                data: taskTrend.created,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 7,
                pointBackgroundColor: '#6366f1',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointHoverBackgroundColor: '#6366f1',
                pointHoverBorderColor: '#ffffff',
                pointHoverBorderWidth: 3,
            },
            {
                label: 'Tasks Completed',
                data: taskTrend.completed,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 7,
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointHoverBackgroundColor: '#10b981',
                pointHoverBorderColor: '#ffffff',
                pointHoverBorderWidth: 3,
            },
        ],
    }), [taskTrend, timePeriod]);

    const trendChartOptions = useMemo<ChartOptions<'line'>>(() => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index' as const,
            intersect: false,
        },
        plugins: {
            legend: {
                display: true,
                position: 'top' as const,
                align: 'end' as const,
                labels: {
                    color: '#94a3b8',
                    font: {
                        size: 12,
                        weight: 'bold',
                    },
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 20,
                },
            },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleColor: '#f8fafc',
                bodyColor: '#e2e8f0',
                borderColor: 'rgba(99, 102, 241, 0.3)',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 8,
                displayColors: true,
                boxPadding: 6,
                titleFont: {
                    size: 13,
                    weight: 'bold',
                },
                bodyFont: {
                    size: 12,
                    weight: 'normal',
                },
                callbacks: {
                    title: (items) => {
                        if (items.length > 0) {
                            const index = items[0].dataIndex;
                            const originalDate = taskTrend.labels[index];
                            return new Date(originalDate).toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                            });
                        }
                        return '';
                    },
                },
            },
        },
        scales: {
            x: {
                grid: {
                    display: false,
                },
                border: {
                    display: false,
                },
                ticks: {
                    color: '#64748b',
                    font: {
                        size: 11,
                        weight: 'normal',
                    },
                    maxRotation: 0,
                },
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(148, 163, 184, 0.1)',
                    drawBorder: false,
                },
                border: {
                    display: false,
                },
                ticks: {
                    color: '#64748b',
                    font: {
                        size: 11,
                        weight: 'normal',
                    },
                    padding: 8,
                    stepSize: 1,
                },
            },
        },
    }), [taskTrend.labels]);

    // Advanced Analytics Metrics
    const advancedMetrics = useMemo(() => {
        const totalTasks = myTasks.length;
        const completedTasks = mySummary.completed;
        const inProgressTasks = mySummary.in_progress;
        const pendingTasks = mySummary.pending;
        
        // Completion rate
        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        
        // Productivity score (weighted: completed=100%, in_progress=50%, pending=0%)
        const productivityScore = totalTasks > 0 
            ? Math.round(((completedTasks * 100 + inProgressTasks * 50) / totalTasks)) 
            : 0;
        
        // On-time completion rate (tasks completed before or on due date)
        const now = new Date();
        let onTimeCompleted = 0;
        let overdueTasks = 0;
        
        myTasks.forEach(task => {
            if (task.status === 'completed' && task.updated_at) {
                const completedDate = new Date(task.updated_at);
                const dueDate = task.due_date ? new Date(task.due_date) : null;
                if (dueDate && completedDate <= dueDate) {
                    onTimeCompleted++;
                }
            }
            if ((task.status === 'pending' || task.status === 'in_progress') && task.due_date) {
                const dueDate = new Date(task.due_date);
                if (dueDate < now) {
                    overdueTasks++;
                }
            }
        });
        
        const onTimeRate = completedTasks > 0 ? Math.round((onTimeCompleted / completedTasks) * 100) : 0;
        
        // Average tasks per week (based on trend data)
        const totalCreated = taskTrend.created.reduce((sum, val) => sum + val, 0);
        const weeksOfData = timePeriod === 'week' ? 1 : timePeriod === 'month' ? 4 : 52;
        const avgTasksPerWeek = Math.round((totalCreated / weeksOfData) * 10) / 10;
        
        return {
            completionRate,
            productivityScore,
            onTimeRate,
            overdueTasks,
            avgTasksPerWeek,
            totalTasks,
            completedTasks,
            inProgressTasks,
            pendingTasks,
        };
    }, [myTasks, mySummary, taskTrend.created, timePeriod]);

    // Task Status Distribution (Pie Chart)
    const statusDistributionData = useMemo(() => ({
        labels: ['Completed', 'In Progress', 'Pending'],
        datasets: [
            {
                data: [mySummary.completed, mySummary.in_progress, mySummary.pending],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.85)',  // Emerald
                    'rgba(59, 130, 246, 0.85)',  // Blue
                    'rgba(148, 163, 184, 0.85)', // Slate
                ],
                borderColor: [
                    '#10b981',
                    '#3b82f6',
                    '#94a3b8',
                ],
                borderWidth: 3,
                hoverOffset: 12,
                hoverBorderColor: '#ffffff',
                hoverBorderWidth: 3,
            },
        ],
    }), [mySummary]);

    const statusDistributionOptions = useMemo<ChartOptions<'doughnut'>>(() => ({
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        interaction: {
            mode: 'point' as const,
            intersect: true,
        },
        plugins: {
            legend: {
                display: true,
                position: 'bottom' as const,
                labels: {
                    color: '#94a3b8',
                    font: {
                        size: 11,
                        weight: 'bold',
                    },
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 16,
                },
            },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleColor: '#f8fafc',
                bodyColor: '#e2e8f0',
                borderColor: 'rgba(99, 102, 241, 0.3)',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 8,
                displayColors: true,
                boxPadding: 6,
                titleFont: {
                    size: 13,
                    weight: 'bold',
                },
                bodyFont: {
                    size: 12,
                    weight: 'normal',
                },
                callbacks: {
                    label: (context) => {
                        const label = context.label || '';
                        const value = context.parsed || 0;
                        const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                        const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                        return `${label}: ${value} tasks (${percentage}%)`;
                    },
                },
            },
        },
    }), []);

    // Export task list to CSV
    const exportTaskListCSV = useCallback(() => {
        if (myTasks.length === 0) return;
        
        const headers = ['Task ID', 'Title', 'Client', 'Project', 'Status', 'Due Date'];
        const rows = myTasks.map(task => [
            task.id,
            `"${task.title.replace(/"/g, '""')}"`,
            `"${(task.client_name || '-').replace(/"/g, '""')}"`,
            `"${(task.project_name || '-').replace(/"/g, '""')}"`,
            task.status,
            task.due_date || '-',
        ]);
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `my-tasks-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [myTasks]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(myTasks.length / ITEMS_PER_PAGE));
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [myTasks.length, currentPage]);
    useEffect(() => {
        if (!tasksExpanded) {
            setExpandedTasksPage(1);
            return;
        }

        const totalPages = Math.max(1, Math.ceil(myTasks.length / EXPANDED_TASKS_PAGE_SIZE));
        if (expandedTasksPage > totalPages) setExpandedTasksPage(totalPages);
    }, [expandedTasksPage, myTasks.length, tasksExpanded]);

    const openTasksForDate = async (dateStr: string) => {
        setSelectedDate(dateStr);
        const event = dateEvents[dateStr];
        if (!event || !event.projectIds.length) {
            setDateTasks([]);
            setDateModalOpen(true);
            return;
        }

        setLoadingDateTasks(true);
        try {
            const params = new URLSearchParams();
            params.set('project_ids', event.projectIds.join(','));
            const response = await fetch(`${API_BASE_URL}/api/tasks.php?${params.toString()}`, { credentials: 'include' });
            const result = await response.json();
            setDateTasks(result?.success && Array.isArray(result.data) ? result.data : []);
        } catch {
            setDateTasks([]);
        } finally {
            setLoadingDateTasks(false);
            setDateModalOpen(true);
        }
    };

    const paginatedDateTasks = useMemo(
        () => dateTasks.slice((dateTasksPage - 1) * ITEMS_PER_PAGE, dateTasksPage * ITEMS_PER_PAGE),
        [dateTasks, dateTasksPage]
    );

    useEffect(() => {
        setDateTasksPage(1);
    }, [selectedDate, dateModalOpen]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(dateTasks.length / ITEMS_PER_PAGE));
        if (dateTasksPage > totalPages) setDateTasksPage(totalPages);
    }, [dateTasks.length, dateTasksPage]);

    const getStatusStyles = (status: string) => {
        if (status === 'completed') {
            return {
                background: 'rgba(34, 197, 94, 0.16)',
                color: '#86efac',
                border: '1px solid rgba(34, 197, 94, 0.42)',
            };
        }

        if (status === 'in_progress') {
            return {
                background: 'rgba(59, 130, 246, 0.16)',
                color: '#93c5fd',
                border: '1px solid rgba(59, 130, 246, 0.42)',
            };
        }

        return {
            background: 'rgba(148, 163, 184, 0.16)',
            color: '#cbd5e1',
            border: '1px solid rgba(148, 163, 184, 0.38)',
        };
    };

    const getCalendarTaskStatusStyles = (status: string) => {
        if (status === 'completed') {
            return {
                background: '#dcfce7',
                color: '#166534',
            };
        }

        if (status === 'in_progress') {
            return {
                background: '#dbeafe',
                color: '#1e40af',
            };
        }

        return {
            background: '#fef3c7',
            color: '#92400e',
        };
    };

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
                <title>Dashboard</title>
            </Head>

            <div style={{
                maxWidth: '1200px',
                margin: '0 auto',
                padding: '12px',
                borderRadius: '14px',
                border: '1px solid #1f3b68',
                background: '#0b1730',
            }}>
                <div style={{ display: 'grid', gap: 12, marginBottom: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, alignItems: 'stretch' }}>
                        <div style={{ borderRadius: 12, border: '1px solid #274574', background: '#0d1d3d', padding: '14px 16px' }}>
                            <h2 style={{ margin: 0, color: '#f8fbff', fontSize: '14px', letterSpacing: '0.01em' }}>Welcome back, {user?.first_name}!</h2>
                            <p style={{ color: '#9fb3de', margin: '4px 0 10px', fontSize: '13px' }}>Task assignment analytics snapshot for your current workload.</p>

                            <div style={{ borderRadius: 10, border: '1px solid #274574', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#0d1d3d' }}>
                                    <tbody>
                                        <tr style={{ borderTop: '1px solid #274574' }}>
                                            <td style={{ padding: '8px 10px', color: '#c7d7ff', fontSize: 12 }}>Total assigned tasks</td>
                                            <td style={{ padding: '8px 10px', color: '#f8fbff', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{myTasks.length}</td>
                                            <td style={{ padding: '8px 10px', color: '#c7d7ff', fontSize: 12 }}>Active projects</td>
                                            <td style={{ padding: '8px 10px', color: '#f8fbff', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{projectCount}</td>
                                        </tr>
                                        <tr style={{ borderTop: '1px solid #274574' }}>
                                            <td style={{ padding: '8px 10px', color: '#c7d7ff', fontSize: 12 }}>Open tasks</td>
                                            <td style={{ padding: '8px 10px', color: '#f8fbff', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{assignmentAnalytics.totalOpenTasks}</td>
                                            <td style={{ padding: '8px 10px', color: '#c7d7ff', fontSize: 12 }}>Completion rate</td>
                                            <td style={{ padding: '8px 10px', color: '#f8fbff', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{assignmentAnalytics.completionRate}%</td>
                                        </tr>
                                        <tr style={{ borderTop: '1px solid #274574' }}>
                                            <td style={{ padding: '8px 10px', color: '#c7d7ff', fontSize: 12 }}>Due today</td>
                                            <td style={{ padding: '8px 10px', color: '#f8fbff', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{assignmentAnalytics.dueToday}</td>
                                            <td style={{ padding: '8px 10px', color: '#c7d7ff', fontSize: 12 }}>Overdue</td>
                                            <td style={{ padding: '8px 10px', color: assignmentAnalytics.overdue > 0 ? '#fda4af' : '#f8fbff', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>
                                                {assignmentAnalytics.overdue}
                                            </td>
                                        </tr>
                                        <tr style={{ borderTop: '1px solid #274574' }}>
                                            <td style={{ padding: '8px 10px', color: '#c7d7ff', fontSize: 12 }}>Due in next 7 days</td>
                                            <td style={{ padding: '8px 10px', color: '#f8fbff', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{assignmentAnalytics.dueNextSevenDays}</td>
                                            <td style={{ padding: '8px 10px', color: '#c7d7ff', fontSize: 12 }}>No due date</td>
                                            <td style={{ padding: '8px 10px', color: '#f8fbff', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{assignmentAnalytics.noDueDate}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, color: '#c7d7ff' }}>
                                    Top Project: <strong style={{ color: '#f8fbff' }}>{assignmentAnalytics.topProjects[0]?.label || 'None'}</strong>
                                </span>
                                <span style={{ fontSize: 12, color: '#c7d7ff' }}>
                                    Top Client: <strong style={{ color: '#f8fbff' }}>{assignmentAnalytics.topClients[0]?.label || 'None'}</strong>
                                </span>
                            </div>
                        </div>

                        {/* My Task Trend Chart */}
                        <div style={{ minWidth: 0 }}>
                            <div style={{ borderRadius: 12, border: '1px solid #274574', background: '#0d1d3d', overflow: 'hidden', height: '100%' }}>
                                <div style={{ padding: '14px 16px', borderBottom: '1px solid #274574', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                    <div>
                                        <div style={{ color: '#f8fbff', fontSize: '14px', fontWeight: 700 }}>My Task Trend</div>
                                        <div style={{ color: '#9fb3de', fontSize: '11px', marginTop: 2 }}>Task creation & completion over time</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {(['week', 'month', 'year'] as TimePeriodFilter[]).map((period) => (
                                            <button
                                                key={period}
                                                onClick={() => setTimePeriod(period)}
                                                style={{
                                                    padding: '6px 14px',
                                                    borderRadius: 8,
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    border: timePeriod === period ? '1px solid #6366f1' : '1px solid #274574',
                                                    background: timePeriod === period ? 'rgba(99, 102, 241, 0.2)' : 'rgba(39, 69, 116, 0.3)',
                                                    color: timePeriod === period ? '#a5b4fc' : '#9fb3de',
                                                    transition: 'all 0.2s ease',
                                                }}
                                            >
                                                {period.charAt(0).toUpperCase() + period.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ padding: 16, height: 280 }}>
                                    {trendLoading ? (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9fb3de', fontSize: 13 }}>
                                            Loading analytics...
                                        </div>
                                    ) : taskTrend.labels.length > 0 ? (
                                        <Line data={trendChartData} options={trendChartOptions} />
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9fb3de', fontSize: 13 }}>
                                            No trend data available
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Advanced Metrics Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                        <div style={{ borderRadius: 10, border: '1px solid #274574', padding: '14px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(39, 69, 116, 0.2) 100%)' }}>
                            <div style={{ color: '#9fb3de', fontSize: 11, marginBottom: 6 }}>Productivity Score</div>
                            <div style={{ color: '#f8fbff', fontSize: 28, fontWeight: 700 }}>{advancedMetrics.productivityScore}%</div>
                            <div style={{ color: '#9fb3de', fontSize: 10, marginTop: 4 }}>Weighted performance</div>
                        </div>
                        <div style={{ borderRadius: 10, border: '1px solid #274574', padding: '14px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(39, 69, 116, 0.2) 100%)' }}>
                            <div style={{ color: '#9fb3de', fontSize: 11, marginBottom: 6 }}>On-Time Rate</div>
                            <div style={{ color: '#f8fbff', fontSize: 28, fontWeight: 700 }}>{advancedMetrics.onTimeRate}%</div>
                            <div style={{ color: '#9fb3de', fontSize: 10, marginTop: 4 }}>{advancedMetrics.overdueTasks} overdue</div>
                        </div>
                        <div style={{ borderRadius: 10, border: '1px solid #274574', padding: '14px', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(39, 69, 116, 0.2) 100%)' }}>
                            <div style={{ color: '#9fb3de', fontSize: 11, marginBottom: 6 }}>Avg Tasks/Week</div>
                            <div style={{ color: '#f8fbff', fontSize: 28, fontWeight: 700 }}>{advancedMetrics.avgTasksPerWeek}</div>
                            <div style={{ color: '#9fb3de', fontSize: 10, marginTop: 4 }}>Task creation rate</div>
                        </div>
                        <div style={{ borderRadius: 10, border: '1px solid #274574', padding: '14px', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(39, 69, 116, 0.2) 100%)' }}>
                            <div style={{ color: '#9fb3de', fontSize: 11, marginBottom: 6 }}>Completion Rate</div>
                            <div style={{ color: '#f8fbff', fontSize: 28, fontWeight: 700 }}>{advancedMetrics.completionRate}%</div>
                            <div style={{ color: '#9fb3de', fontSize: 10, marginTop: 4 }}>{advancedMetrics.completedTasks}/{advancedMetrics.totalTasks} tasks</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
                        {/* Task Status Distribution Chart */}
                        <div style={{ flex: '1 1 360px', minWidth: 280, borderRadius: 12, border: '1px solid #274574', background: '#0d1d3d', overflow: 'hidden' }}>
                            <div style={{ padding: '14px 16px', borderBottom: '1px solid #274574' }}>
                                <div style={{ color: '#f8fbff', fontSize: '14px', fontWeight: 700 }}>Task Status Distribution</div>
                                <div style={{ color: '#9fb3de', fontSize: '11px', marginTop: 2 }}>Breakdown of tasks by current status</div>
                            </div>
                            <div style={{ padding: 16, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {myTasks.length > 0 ? (
                                    <Doughnut data={statusDistributionData} options={statusDistributionOptions} />
                                ) : (
                                    <div style={{ color: '#9fb3de', fontSize: 13 }}>No tasks to display</div>
                                )}
                            </div>
                        </div>

                        <div style={{ flex: '0 1 260px', width: '100%', maxWidth: 260 }}>
                            <div style={{ borderRadius: 10, border: '1px solid #274574', padding: '10px', background: '#0d1d3d', height: '100%' }}>
                                <div style={{ color: '#f8fbff', fontSize: '14px', fontWeight: 700 }}>Project Calendar</div>
                                <div style={{ color: '#9fb3de', fontSize: '11px', marginTop: 2, marginBottom: 8 }}>Start and due dates from your projects</div>
                                <DashboardCalendarMini
                                    onExpand={() => setCalendarOpen(true)}
                                    events={dateEvents}
                                    onDayClick={(date) => openTasksForDate(date)}
                                    theme="dark"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '10px', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '14px', color: '#dbe7ff', margin: 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}>My Assigned Tasks</h3>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                                onClick={exportTaskListCSV}
                                disabled={myTasks.length === 0}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: 8,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: myTasks.length === 0 ? 'not-allowed' : 'pointer',
                                    border: '1px solid #274574',
                                    background: 'rgba(39, 69, 116, 0.3)',
                                    color: '#9fb3de',
                                    opacity: myTasks.length === 0 ? 0.5 : 1,
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                }}
                                title="Export tasks to CSV"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                                Export Tasks
                            </button>
                            <ExpandIconButton
                                tone="dark"
                                label="Expand assigned tasks"
                                onClick={() => setTasksExpanded(true)}
                                title="Expand tasks"
                            />
                            <span style={{ fontSize: 12, color: '#c7d7ff', border: '1px solid rgba(148, 163, 184, 0.3)', borderRadius: '999px', padding: '4px 10px', background: 'rgba(148, 163, 184, 0.14)' }}>Pending: <strong>{mySummary.pending}</strong></span>
                            <span style={{ fontSize: 12, color: '#bfdbfe', border: '1px solid rgba(59, 130, 246, 0.38)', borderRadius: '999px', padding: '4px 10px', background: 'rgba(59, 130, 246, 0.16)' }}>In Progress: <strong>{mySummary.in_progress}</strong></span>
                            <span style={{ fontSize: 12, color: '#86efac', border: '1px solid rgba(34, 197, 94, 0.38)', borderRadius: '999px', padding: '4px 10px', background: 'rgba(34, 197, 94, 0.16)' }}>Completed: <strong>{mySummary.completed}</strong></span>
                        </div>
                    </div>
                    {tasksError && (
                        <div style={{ marginBottom: '8px', padding: '9px 10px', borderRadius: '10px', background: 'rgba(127, 29, 29, 0.4)', border: '1px solid rgba(248, 113, 113, 0.45)', color: '#fecaca', fontSize: '12px' }}>
                            {tasksError}
                        </div>
                    )}
                    <div style={{
                        borderRadius: '14px',
                        border: '1px solid #274574',
                        background: '#0d1d3d',
                        overflow: 'hidden',
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', color: '#dbe7ff' }}>
                            <thead style={{ background: '#132954' }}>
                                <tr>
                                    <th style={{ padding: '9px 10px', textAlign: 'left', color: '#9fb3de', fontSize: '12px' }}>Task</th>
                                    <th style={{ padding: '9px 10px', textAlign: 'left', color: '#9fb3de', fontSize: '12px' }}>Client</th>
                                    <th style={{ padding: '9px 10px', textAlign: 'left', color: '#9fb3de', fontSize: '12px' }}>Project</th>
                                    <th style={{ padding: '9px 10px', textAlign: 'left', color: '#9fb3de', fontSize: '12px' }}>Status</th>
                                    <th style={{ padding: '9px 10px', textAlign: 'left', color: '#9fb3de', fontSize: '12px' }}>Due Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {myTasks.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '14px', textAlign: 'center', color: '#9fb3de', fontSize: '12px' }}>
                                            No pending tasks assigned to you.
                                        </td>
                                    </tr>
                                ) : paginatedTasks.map((t) => (
                                    <tr key={t.id} style={{ borderTop: '1px solid rgba(99, 132, 205, 0.18)' }}>
                                        <td style={{ padding: '9px 10px', fontWeight: 600, color: '#e5edff', fontSize: '12px' }}>{t.title}</td>
                                        <td style={{ padding: '9px 10px', color: '#c7d7ff', fontSize: '12px' }}>{t.client_name || '-'}</td>
                                        <td style={{ padding: '9px 10px', color: '#c7d7ff', fontSize: '12px' }}>{t.project_name}</td>
                                        <td style={{ padding: '9px 10px' }}>
                                            <span style={{
                                                padding: '2px 7px',
                                                borderRadius: '10px',
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                textTransform: 'capitalize',
                                                ...getStatusStyles(t.status),
                                            }}>
                                                {t.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '9px 10px', color: '#9fb3de', fontSize: '12px' }}>
                                            {formatDateTime(t.due_date)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination
                        currentPage={currentPage}
                        totalItems={myTasks.length}
                        itemsPerPage={ITEMS_PER_PAGE}
                        onPageChange={setCurrentPage}
                        label="tasks"
                        variant="dark"
                    />
                </div>
            </div>
            {tasksExpanded && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setTasksExpanded(false)}>
                    <div style={{ width: '95%', maxWidth: 1200, maxHeight: '90vh', background: '#0d1d3d', borderRadius: 14, boxShadow: '0 20px 50px rgba(0,0,0,0.4)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #274574', flexShrink: 0 }}>
                            <div>
                                <div style={{ fontWeight: 700, color: '#dbe7ff', fontSize: 16 }}>All Assigned Tasks</div>
                                <div style={{ color: '#9fb3de', fontSize: 12, marginTop: 4 }}>Total: {myTasks.length} tasks</div>
                            </div>
                            <button onClick={() => setTasksExpanded(false)} style={{ background: 'transparent', border: '1px solid #274574', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, color: '#c7d7ff', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                Close
                            </button>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#dbe7ff' }}>
                                <thead style={{ background: '#132954', position: 'sticky', top: 0, zIndex: 1 }}>
                                    <tr>
                                        <th style={{ padding: '10px 12px', textAlign: 'left', color: '#9fb3de', fontSize: '12px', borderBottom: '2px solid #274574' }}>Task</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'left', color: '#9fb3de', fontSize: '12px', borderBottom: '2px solid #274574' }}>Client</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'left', color: '#9fb3de', fontSize: '12px', borderBottom: '2px solid #274574' }}>Project</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'left', color: '#9fb3de', fontSize: '12px', borderBottom: '2px solid #274574' }}>Status</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'left', color: '#9fb3de', fontSize: '12px', borderBottom: '2px solid #274574' }}>Due Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myTasks.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#9fb3de', fontSize: '13px' }}>
                                                No tasks assigned to you.
                                            </td>
                                        </tr>
                                    ) : paginatedExpandedTasks.map((t) => (
                                        <tr key={t.id} style={{ borderTop: '1px solid rgba(99, 132, 205, 0.18)' }}>
                                            <td style={{ padding: '10px 12px', fontWeight: 600, color: '#e5edff', fontSize: '13px' }}>{t.title}</td>
                                            <td style={{ padding: '10px 12px', color: '#c7d7ff', fontSize: '12px' }}>{t.client_name || '-'}</td>
                                            <td style={{ padding: '10px 12px', color: '#c7d7ff', fontSize: '12px' }}>{t.project_name}</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <span style={{
                                                    padding: '3px 8px',
                                                    borderRadius: '10px',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    textTransform: 'capitalize',
                                                    ...getStatusStyles(t.status),
                                                }}>
                                                    {t.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 12px', color: '#9fb3de', fontSize: '12px' }}>
                                                {formatDateTime(t.due_date)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ padding: '0 20px 20px' }}>
                            <Pagination
                                currentPage={expandedTasksPage}
                                totalItems={myTasks.length}
                                itemsPerPage={EXPANDED_TASKS_PAGE_SIZE}
                                onPageChange={setExpandedTasksPage}
                                label="tasks"
                                variant="dark"
                            />
                        </div>
                    </div>
                </div>
            )}
            {dateModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ width: '90%', maxWidth: 900, background: 'white', borderRadius: 10, padding: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
                            <div style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>Tasks on {selectedDate}</div>
                            <button onClick={() => setDateModalOpen(false)} style={{ background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>Close</button>
                        </div>
                        {loadingDateTasks ? (
                            <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Loading tasks...</div>
                        ) : dateTasks.length === 0 ? (
                            <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>No tasks for projects on this date.</div>
                        ) : (
                            <>
                                <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead style={{ background: '#f8fafc' }}>
                                            <tr>
                                                <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#4b5563' }}>Task</th>
                                                <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#4b5563' }}>Client</th>
                                                <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#4b5563' }}>Project</th>
                                                <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#4b5563' }}>Status</th>
                                                <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#4b5563' }}>Due Date</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedDateTasks.map((task) => (
                                                <tr key={task.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                                                    <td style={{ padding: '10px', fontSize: 13, color: '#111827', fontWeight: 500 }}>{task.title}</td>
                                                    <td style={{ padding: '10px', fontSize: 12, color: '#6b7280' }}>{task.client_name || '-'}</td>
                                                    <td style={{ padding: '10px', fontSize: 12, color: '#6b7280' }}>{task.project_name || '-'}</td>
                                                    <td style={{ padding: '10px' }}>
                                                        <span style={{ ...getCalendarTaskStatusStyles(task.status), padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500, textTransform: 'capitalize' }}>
                                                            {String(task.status || 'pending').replace('_', ' ')}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px', fontSize: 12, color: '#4b5563' }}>
                                                        {formatDateTime(task.due_date)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <Pagination
                                    currentPage={dateTasksPage}
                                    totalItems={dateTasks.length}
                                    itemsPerPage={ITEMS_PER_PAGE}
                                    onPageChange={setDateTasksPage}
                                    label="tasks"
                                />
                            </>
                        )}
                    </div>
                </div>
            )}
            <DashboardCalendarOverlay
                open={calendarOpen}
                onClose={() => setCalendarOpen(false)}
                events={dateEvents}
                onDayClick={(date) => openTasksForDate(date)}
            />
        </Layout>
    );
}
