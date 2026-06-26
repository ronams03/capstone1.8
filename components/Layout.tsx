import { useState, ReactNode, MouseEvent, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Sidebar from './Sidebar';
import Pagination from './Pagination';
import PasswordChangeModal from './PasswordChangeModal';
import styles from '../styles/Layout.module.css';
import { getBackendBaseUrl, resolveBackendAssetUrl } from '@/utils/network';
import { notifyError, notifySuccess, notifyWarning } from '@/utils/notify';
import {
    getFeatureKeyForPath,
    getRoleFallbackPath,
    hasRoleFeatureAccess,
    type RoleFeatureAccessMap,
} from '@/utils/roleFeatureAccess';
import {
    countUnreadNotifications,
    getNotificationReadState,
    isNotificationRead,
    markNotificationsReadInStorage,
    markNotificationsUnreadInStorage,
    parseNotificationTimestamp,
    subscribeToNotificationReadState,
} from '@/utils/notificationReadState';
import { formatRouteLabel, getRouteBreadcrumbs } from '@/utils/routeLabels';

interface LayoutProps {
    children: ReactNode;
    role?: string;
    user?: {
        full_name?: string;
        username?: string;
        photo?: string | null;
        role_feature_access?: RoleFeatureAccessMap;
        [key: string]: unknown;
    } | null;
    onLogout: () => void;
}

type SecurityAlert = {
    id: string;
    kind: string;
    severity: 'high' | 'medium' | 'low';
    direction: 'inbound' | 'outbound';
    ip_address: string;
    title: string;
    message: string;
    occurred_at: string;
    action?: string;
    activity_type?: string;
};

type TaskAssignmentNotificationMeta = {
    kind?: string;
    task_id?: number;
    task_title?: string;
    assigned_by_name?: string;
    assigned_by_role?: string;
    project_name?: string;
    client_name?: string;
    priority?: string;
    due_date?: string;
};

type AppNotification = {
    id: string;
    read_key?: string;
    type: string;
    title: string;
    message: string;
    severity: 'info' | 'medium' | 'high' | 'success' | string;
    occurred_at: string;
    link?: string;
    meta?: {
        assignment?: TaskAssignmentNotificationMeta;
        [key: string]: unknown;
    };
};

const NOTIFICATION_CENTER_ITEMS_PER_PAGE = 8;

function parseAlertTimestamp(value: string) {
    return parseNotificationTimestamp(value);
}

function formatAlertTimestamp(value: string) {
    const ms = parseAlertTimestamp(value);
    if (!ms) return String(value || '');
    return new Date(ms).toLocaleString();
}

export default function Layout({ children, role, user, onLogout }: LayoutProps) {
    const sidebarIdentity = String(user?.id ?? user?.username ?? role ?? 'anonymous').trim().toLowerCase() || 'anonymous';
    const sidebarStorageKey = `sidebarCollapsed:${sidebarIdentity}`;
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false;
        try {
            return window.localStorage.getItem(sidebarStorageKey) === '1';
        } catch {
            return false;
        }
    });
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const mediaQuery = window.matchMedia('(max-width: 1024px)');
        const applyViewport = (isMobile: boolean) => {
            setIsMobileViewport(isMobile);
            if (!isMobile) {
                setMobileSidebarOpen(false);
            }
        };

        applyViewport(mediaQuery.matches);

        const onChange = (event: MediaQueryListEvent) => {
            applyViewport(event.matches);
        };

        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', onChange);
            return () => {
                mediaQuery.removeEventListener('change', onChange);
            };
        }

        mediaQuery.addListener(onChange);
        return () => {
            mediaQuery.removeListener(onChange);
        };
    }, []);
    useEffect(() => {
        if (typeof window === 'undefined') return;

        try {
            const stored = window.localStorage.getItem(sidebarStorageKey);
            if (stored === '1') {
                setSidebarCollapsed(true);
                return;
            }
            if (stored === '0') {
                setSidebarCollapsed(false);
                return;
            }

            window.localStorage.setItem(sidebarStorageKey, sidebarCollapsed ? '1' : '0');
        } catch {
            // Ignore storage access failures.
        }
    }, [sidebarCollapsed, sidebarStorageKey]);
    const [idleWarningOpen, setIdleWarningOpen] = useState(false);
    const [idleWarningCountdown, setIdleWarningCountdown] = useState(30);
    const [isIdleAutoLoggingOut, setIsIdleAutoLoggingOut] = useState(false);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    const [notificationsUnseenCount, setNotificationsUnseenCount] = useState(0);
    const [notificationReadState, setNotificationReadState] = useState<Record<string, number>>({});
    const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
    const [notificationCenterPage, setNotificationCenterPage] = useState(1);
    const [notificationCenterTypeFilter, setNotificationCenterTypeFilter] = useState('all');
    const [notificationCenterSeverityFilter, setNotificationCenterSeverityFilter] = useState('all');
    const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);
    const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);
    const [securityAlertsOpen, setSecurityAlertsOpen] = useState(false);
    const [securityAlertsLoading, setSecurityAlertsLoading] = useState(false);
    const [securityAlertsUnseenCount, setSecurityAlertsUnseenCount] = useState(0);
    const [selectedSecurityAlert, setSelectedSecurityAlert] = useState<SecurityAlert | null>(null);
    const [isPageRefreshing, setIsPageRefreshing] = useState(false);
    const [lockdownEnabled, setLockdownEnabled] = useState(false);
    const [lockdownReason, setLockdownReason] = useState('');
    const [lockdownUpdatedAt, setLockdownUpdatedAt] = useState('');
    const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
    const [passwordChangeReason, setPasswordChangeReason] = useState<'manual' | 'expired' | 'first_login'>('manual');
    const router = useRouter();
    const breadcrumbRole = typeof role === 'string'
        ? role
        : typeof user?.role === 'string'
            ? user.role
            : undefined;
    const routeBreadcrumbs = useMemo(() => {
        return getRouteBreadcrumbs(router.asPath || router.pathname, breadcrumbRole);
    }, [breadcrumbRole, router.asPath, router.pathname]);
    const API_BASE_URL = getBackendBaseUrl();
    const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const notificationClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastResetAtRef = useRef<number>(0);
    const resetIdleTimerRef = useRef<(() => void) | null>(null);
    const notificationsMenuRef = useRef<HTMLDivElement | null>(null);
    const securityMenuRef = useRef<HTMLDivElement | null>(null);
    const notificationsRef = useRef<AppNotification[]>([]);
    const securityAlertsRef = useRef<SecurityAlert[]>([]);
    const notificationFetchPromiseRef = useRef<Promise<void> | null>(null);
    const securityAlertFetchPromiseRef = useRef<Promise<void> | null>(null);
    const lastNotificationAutoRefreshAtRef = useRef(0);
    const lastSecurityAlertAutoRefreshAtRef = useRef(0);
    const lastLockdownStatusRefreshAtRef = useRef(0);

    const resolvePhotoUrl = (photo: string | null | undefined) => {
        return resolveBackendAssetUrl(photo);
    };

    const photoUrl = resolvePhotoUrl(user?.photo);
    const normalizeBooleanSetting = (value: unknown, fallback = true): boolean => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
            if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
        }
        return fallback;
    };

    const sessionTimeoutMinutes = useMemo(() => {
        const raw = Number(user?.session_timeout_minutes ?? 30);
        if (!Number.isFinite(raw)) return 30;
        return Math.max(1, Math.min(1440, Math.trunc(raw)));
    }, [user?.session_timeout_minutes]);

    const sessionTimeoutEnabled = useMemo(
        () => normalizeBooleanSetting(user?.session_timeout_enabled, true),
        [user?.session_timeout_enabled]
    );

    const normalizedRole = String(role || user?.role || '').toLowerCase();
    const passwordStatus = (user?.password_status || null) as {
        expired?: boolean;
        requires_change?: boolean;
        reason?: string;
        days_remaining?: number | null;
        password_expires_at?: string | null;
        max_age_days?: number;
        history_count?: number;
    } | null;
    const passwordRequiresChange = Number(user?.must_reset_password ?? 0) === 1 || Boolean(passwordStatus?.requires_change);
    const passwordChangeReasonForUser = passwordRequiresChange
        ? (String(user?.password_change_reason || passwordStatus?.reason || 'expired') === 'first_login' ? 'first_login' : 'expired')
        : 'manual';
    const passwordExpiresLabel = passwordStatus?.password_expires_at
        ? `Expires ${new Date(passwordStatus.password_expires_at).toLocaleDateString()}`
        : 'Expiration not set';
    const currentFeatureKey = useMemo(
        () => getFeatureKeyForPath(router.pathname || router.asPath || ''),
        [router.asPath, router.pathname],
    );
    const canAccessCurrentFeature = useMemo(() => (
        !currentFeatureKey
        || !normalizedRole
        || hasRoleFeatureAccess(
            normalizedRole,
            currentFeatureKey,
            (user?.role_feature_access || null) as RoleFeatureAccessMap | null,
        )
    ), [currentFeatureKey, normalizedRole, user?.role_feature_access]);
    const isAdminRole = normalizedRole === 'admin';
    const isLockdownRestricted = lockdownEnabled && !isAdminRole;
    const isLogoutDisabled = lockdownEnabled;
    const normalizedLockdownReason = String(lockdownReason || '').trim();
    const displayLockdownReason =
        normalizedLockdownReason !== ''
        && normalizedLockdownReason !== 'Emergency response: lockdown mode enabled from Admin Profile & Security.'
            ? normalizedLockdownReason
            : '';
    const notificationsReadStorageKey = `notificationsRead:${sidebarIdentity}`;
    const securityAlertsLastSeenStorageKey = `securityAlertsLastSeen:${sidebarIdentity}`;
    const shouldTrackIdleTimeout =
        (normalizedRole === 'manager' || normalizedRole === 'staff')
        && sessionTimeoutEnabled;
    const idleWarningSeconds = useMemo(() => {
        return Math.max(1, Math.ceil(Math.min(30000, sessionTimeoutMinutes * 60 * 1000) / 1000));
    }, [sessionTimeoutMinutes]);

    const closeUserDropdown = useCallback(() => {
        if (typeof document === 'undefined') return;
        const dropdown = document.getElementById('userDropdown');
        if (dropdown) {
            dropdown.classList.remove(styles.open);
        }
    }, []);

    useEffect(() => {
        if (!router.isReady || !normalizedRole || !currentFeatureKey || canAccessCurrentFeature) return;

        const fallbackPath = getRoleFallbackPath(normalizedRole);
        if ((router.pathname || '') === fallbackPath) return;

        void router.replace(fallbackPath);
    }, [canAccessCurrentFeature, currentFeatureKey, normalizedRole, router]);

    const canRunThrottledRefresh = useCallback((ref: { current: number }, minIntervalMs: number) => {
        const now = Date.now();
        if (now - ref.current < minIntervalMs) {
            return false;
        }
        ref.current = now;
        return true;
    }, []);

    useEffect(() => {
        notificationsRef.current = notifications;
    }, [notifications]);

    useEffect(() => {
        securityAlertsRef.current = securityAlerts;
    }, [securityAlerts]);

    const applyLockdownState = useCallback(() => {
        setLockdownEnabled(false);
        setLockdownReason('');
        setLockdownUpdatedAt('');
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem('lockdown_state');
            if (raw) {
                JSON.parse(raw);
                applyLockdownState();
            }
        } catch {
            // Ignore storage issues.
        }
    }, [applyLockdownState]);

    useEffect(() => {
        const enabledFromUser = (user as { lockdown_enabled?: boolean } | null | undefined)?.lockdown_enabled;
        if (typeof enabledFromUser !== 'undefined') {
            setLockdownEnabled(Boolean(enabledFromUser));
        }
        const reasonFromUser = (user as { lockdown_reason?: string } | null | undefined)?.lockdown_reason;
        if (typeof reasonFromUser !== 'undefined') {
            setLockdownReason(String(reasonFromUser || ''));
        }
        const updatedFromUser = (user as { lockdown_updated_at?: string } | null | undefined)?.lockdown_updated_at;
        if (typeof updatedFromUser !== 'undefined') {
            setLockdownUpdatedAt(String(updatedFromUser || ''));
        }
    }, [user]);

    const handleLogoutClick = () => {
        closeUserDropdown();
        setNotificationsOpen(false);
        setNotificationCenterOpen(false);
        setSelectedNotification(null);
        setSelectedSecurityAlert(null);
        if (isLogoutDisabled) return;
        onLogout();
    };

    const syncNotificationReadState = useCallback(() => {
        setNotificationReadState(getNotificationReadState(notificationsReadStorageKey));
    }, [notificationsReadStorageKey]);

    useEffect(() => {
        syncNotificationReadState();
    }, [syncNotificationReadState]);

    useEffect(() => {
        return subscribeToNotificationReadState(notificationsReadStorageKey, syncNotificationReadState);
    }, [notificationsReadStorageKey, syncNotificationReadState]);

    const deriveUnseenNotificationCount = useCallback((itemsToCount: AppNotification[], readStateOverride?: Record<string, number>) => {
        return countUnreadNotifications(itemsToCount, readStateOverride ?? notificationReadState);
    }, [notificationReadState]);

    const markNotificationsAsRead = useCallback((itemsOverride?: AppNotification[]) => {
        const list = itemsOverride ?? notificationsRef.current;
        if (!Array.isArray(list) || list.length === 0) {
            setNotificationsUnseenCount(deriveUnseenNotificationCount(Array.isArray(list) ? list : notificationsRef.current));
            return;
        }

        const nextReadState = markNotificationsReadInStorage(notificationsReadStorageKey, list);
        setNotificationReadState(nextReadState);
        setNotificationsUnseenCount(deriveUnseenNotificationCount(list, nextReadState));
    }, [deriveUnseenNotificationCount, notificationsReadStorageKey]);

    const markNotificationsAsUnread = useCallback((itemsOverride?: AppNotification[]) => {
        const list = itemsOverride ?? notificationsRef.current;
        if (!Array.isArray(list) || list.length === 0) return;

        const nextReadState = markNotificationsUnreadInStorage(notificationsReadStorageKey, list);
        setNotificationReadState(nextReadState);
        setNotificationsUnseenCount(deriveUnseenNotificationCount(notificationsRef.current, nextReadState));
    }, [deriveUnseenNotificationCount, notificationsReadStorageKey]);

    const isReadNotification = useCallback((notification: AppNotification) => {
        return isNotificationRead(notification, notificationReadState);
    }, [notificationReadState]);

    const fetchNotifications = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
        if (notificationFetchPromiseRef.current) {
            return notificationFetchPromiseRef.current;
        }

        const request = (async () => {
            if (!silent) {
                setNotificationsLoading(true);
            }

            try {
                const res = await fetch(`${API_BASE_URL}/api/notifications.php`, {
                    credentials: 'include',
                });
                const data = await res.json();
                const nextNotifications = Array.isArray(data?.data) ? (data.data as AppNotification[]) : [];
                setNotifications(nextNotifications);
            } catch {
                if (!silent) {
                    setNotifications([]);
                    setNotificationsUnseenCount(0);
                }
            } finally {
                if (!silent) {
                    setNotificationsLoading(false);
                }
                notificationFetchPromiseRef.current = null;
            }
        })();

        notificationFetchPromiseRef.current = request;
        return request;
    }, [API_BASE_URL]);

    const deriveUnseenAlertCount = useCallback((alerts: SecurityAlert[]) => {
        if (typeof window === 'undefined') return 0;

        let lastSeen = 0;
        try {
            lastSeen = Number(window.localStorage.getItem(securityAlertsLastSeenStorageKey) || 0);
        } catch {
            lastSeen = 0;
        }

        if (!Number.isFinite(lastSeen) || lastSeen < 0) {
            lastSeen = 0;
        }

        return alerts.reduce((count, alert) => {
            return parseAlertTimestamp(alert.occurred_at) > lastSeen ? count + 1 : count;
        }, 0);
    }, [securityAlertsLastSeenStorageKey]);

    const markSecurityAlertsAsRead = useCallback((alertsOverride?: SecurityAlert[]) => {
        if (typeof window === 'undefined') return;
        const list = alertsOverride ?? securityAlertsRef.current;
        if (!Array.isArray(list) || list.length === 0) {
            setSecurityAlertsUnseenCount(0);
            return;
        }

        const latestSeen = list.reduce((maxValue, alert) => {
            const ts = parseAlertTimestamp(alert.occurred_at);
            return ts > maxValue ? ts : maxValue;
        }, 0);

        if (latestSeen > 0) {
            try {
                window.localStorage.setItem(securityAlertsLastSeenStorageKey, String(latestSeen));
            } catch {
                // Ignore storage failures.
            }
        }

        setSecurityAlertsUnseenCount(0);
    }, [securityAlertsLastSeenStorageKey]);

    const fetchSecurityAlerts = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
        if (!isAdminRole) return;

        if (securityAlertFetchPromiseRef.current) {
            return securityAlertFetchPromiseRef.current;
        }

        const request = (async () => {
            if (!silent) {
                setSecurityAlertsLoading(true);
            }

            try {
                const res = await fetch(`${API_BASE_URL}/api/security-control.php?action=alerts&limit=20`, {
                    credentials: 'include',
                });
                const data = await res.json();
                const alerts = Array.isArray(data?.data?.alerts) ? (data.data.alerts as SecurityAlert[]) : [];
                const lockdown = data?.data?.lockdown;
                setSecurityAlerts(alerts);
                if (typeof lockdown?.enabled !== 'undefined') {
                    applyLockdownState();
                }

                if (securityAlertsOpen) {
                    markSecurityAlertsAsRead(alerts);
                } else {
                    setSecurityAlertsUnseenCount(deriveUnseenAlertCount(alerts));
                }
            } catch {
                if (!silent) {
                    setSecurityAlerts([]);
                    setSecurityAlertsUnseenCount(0);
                }
            } finally {
                if (!silent) {
                    setSecurityAlertsLoading(false);
                }
                securityAlertFetchPromiseRef.current = null;
            }
        })();

        securityAlertFetchPromiseRef.current = request;
        return request;
    }, [API_BASE_URL, applyLockdownState, deriveUnseenAlertCount, isAdminRole, markSecurityAlertsAsRead, securityAlertsOpen]);


    useEffect(() => {
        setNotificationsUnseenCount(deriveUnseenNotificationCount(notifications));
    }, [deriveUnseenNotificationCount, notifications]);

    const clearIdleTimers = useCallback(() => {
        if (warningTimerRef.current) {
            clearTimeout(warningTimerRef.current);
            warningTimerRef.current = null;
        }
        if (logoutTimerRef.current) {
            clearTimeout(logoutTimerRef.current);
            logoutTimerRef.current = null;
        }
        if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
        }
    }, []);

    const executeIdleAutoLogout = useCallback(async () => {
        if (isIdleAutoLoggingOut) return;
        setIsIdleAutoLoggingOut(true);
        setIdleWarningOpen(false);
        setNotificationsOpen(false);
        setNotificationCenterOpen(false);
        setSelectedNotification(null);
        setSecurityAlertsOpen(false);
        setSelectedSecurityAlert(null);
        clearIdleTimers();
        closeUserDropdown();
        try {
            await Promise.resolve(onLogout());
        } catch {
            setIsIdleAutoLoggingOut(false);
        }
    }, [clearIdleTimers, closeUserDropdown, isIdleAutoLoggingOut, onLogout]);

    useEffect(() => {
        if (!normalizedRole) {
            setNotifications([]);
            setNotificationsUnseenCount(0);
            setNotificationsOpen(false);
            setNotificationCenterOpen(false);
            setSelectedNotification(null);
            return;
        }

        const refreshNotifications = (silent: boolean, autoTriggered = false) => {
            if (autoTriggered && !canRunThrottledRefresh(lastNotificationAutoRefreshAtRef, 10000)) {
                return;
            }
            void fetchNotifications({ silent });
        };
        const handleWindowFocus = () => {
            refreshNotifications(true, true);
        };
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                refreshNotifications(true, true);
            }
        };

        refreshNotifications(false);
        window.addEventListener('focus', handleWindowFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('focus', handleWindowFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [canRunThrottledRefresh, fetchNotifications, normalizedRole]);

    useEffect(() => {
        if (!shouldTrackIdleTimeout || isIdleAutoLoggingOut) {
            clearIdleTimers();
            return;
        }

        const timeoutMs = sessionTimeoutMinutes * 60 * 1000;
        const warningLeadMs = Math.min(30000, timeoutMs);
        const warningDelayMs = Math.max(0, timeoutMs - warningLeadMs);
        const warningSeconds = Math.max(1, Math.ceil(warningLeadMs / 1000));

        const armIdleTimers = () => {
            clearIdleTimers();
            setIdleWarningOpen(false);
            setIdleWarningCountdown(warningSeconds);

            warningTimerRef.current = setTimeout(() => {
                setIdleWarningOpen(true);
                void notifyWarning(`Session will logout in ${warningSeconds} seconds due to inactivity.`, 3500);

                countdownTimerRef.current = setInterval(() => {
                    setIdleWarningCountdown((prev) => Math.max(1, prev - 1));
                }, 1000);
            }, warningDelayMs);

            logoutTimerRef.current = setTimeout(() => {
                void executeIdleAutoLogout();
            }, timeoutMs);
        };

        const handleActivity = () => {
            const now = Date.now();
            if (now - lastResetAtRef.current < 1000) return;
            lastResetAtRef.current = now;
            armIdleTimers();
        };
        resetIdleTimerRef.current = armIdleTimers;

        const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart'];
        events.forEach((eventName) => {
            window.addEventListener(eventName, handleActivity, { passive: true });
        });

        armIdleTimers();

        return () => {
            events.forEach((eventName) => {
                window.removeEventListener(eventName, handleActivity);
            });
            resetIdleTimerRef.current = null;
            clearIdleTimers();
        };
    }, [clearIdleTimers, executeIdleAutoLogout, isIdleAutoLoggingOut, sessionTimeoutMinutes, shouldTrackIdleTimeout]);

    useEffect(() => {
        if (!isAdminRole) {
            setSecurityAlerts([]);
            setSecurityAlertsUnseenCount(0);
            setSecurityAlertsOpen(false);
            setSelectedSecurityAlert(null);
            return;
        }

        const refreshSecurityAlerts = (silent: boolean, autoTriggered = false) => {
            if (autoTriggered && !canRunThrottledRefresh(lastSecurityAlertAutoRefreshAtRef, 12000)) {
                return;
            }
            void fetchSecurityAlerts({ silent });
        };
        const handleWindowFocus = () => {
            refreshSecurityAlerts(true, true);
        };
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                refreshSecurityAlerts(true, true);
            }
        };

        refreshSecurityAlerts(false);
        window.addEventListener('focus', handleWindowFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('focus', handleWindowFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [canRunThrottledRefresh, fetchSecurityAlerts, isAdminRole]);

    useEffect(() => {
        if (isAdminRole) return;

        let isActive = true;
        const handleLockdownEvent = () => {
            if (!isActive) return;
            applyLockdownState();
        };
        const handleLockdownState = () => {
            if (!isActive) return;
            applyLockdownState();
        };
        const handleStorage = (event: StorageEvent) => {
            if (!isActive) return;
            if (event.key !== 'lockdown_state' || !event.newValue) return;
            try {
                JSON.parse(event.newValue);
                applyLockdownState();
            } catch {
                // Ignore parse errors.
            }
        };

        window.addEventListener('lockdown:active', handleLockdownEvent);
        window.addEventListener('lockdown:state', handleLockdownState);
        window.addEventListener('storage', handleStorage);
        const fetchLockdownStatus = async (autoTriggered = false) => {
            if (autoTriggered && !canRunThrottledRefresh(lastLockdownStatusRefreshAtRef, 15000)) {
                return;
            }
            try {
                const res = await fetch(`${API_BASE_URL}/api/auth.php`, { credentials: 'include' });
                await res.json();
                if (!isActive) return;
                applyLockdownState();
            } catch {
                // Keep last known lockdown state on network errors.
            }
        };
        const handleWindowFocus = () => {
            void fetchLockdownStatus(true);
        };
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                void fetchLockdownStatus(true);
            }
        };

        void fetchLockdownStatus();
        window.addEventListener('focus', handleWindowFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            isActive = false;
            window.removeEventListener('lockdown:active', handleLockdownEvent);
            window.removeEventListener('lockdown:state', handleLockdownState);
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('focus', handleWindowFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [API_BASE_URL, applyLockdownState, canRunThrottledRefresh, isAdminRole]);

    useEffect(() => {
        if ((!isLockdownRestricted && !notificationCenterOpen && !selectedNotification && !selectedSecurityAlert) || typeof document === 'undefined') return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isLockdownRestricted, notificationCenterOpen, selectedNotification, selectedSecurityAlert]);

    useEffect(() => {
        if (!notificationsOpen) return;

        const handleDocumentClick = (event: globalThis.MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (notificationsMenuRef.current?.contains(target)) return;
            setNotificationsOpen(false);
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setNotificationsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleDocumentClick);
        window.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleDocumentClick);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [notificationsOpen]);

    useEffect(() => {
        if (!notificationCenterOpen) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setNotificationCenterOpen(false);
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('keydown', handleEscape);
        };
    }, [notificationCenterOpen]);

    useEffect(() => {
        if (!securityAlertsOpen) return;

        const handleDocumentClick = (event: globalThis.MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (securityMenuRef.current?.contains(target)) return;
            setSecurityAlertsOpen(false);
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setSecurityAlertsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleDocumentClick);
        window.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleDocumentClick);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [securityAlertsOpen]);

    useEffect(() => {
        if (!selectedNotification) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setSelectedNotification(null);
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('keydown', handleEscape);
        };
    }, [selectedNotification]);

    useEffect(() => {
        return () => {
            if (notificationClickTimerRef.current) {
                clearTimeout(notificationClickTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!selectedSecurityAlert) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setSelectedSecurityAlert(null);
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('keydown', handleEscape);
        };
    }, [selectedSecurityAlert]);

    const handleStaySignedIn = () => {
        if (isIdleAutoLoggingOut) return;
        lastResetAtRef.current = 0;
        setIdleWarningCountdown(idleWarningSeconds);
        setIdleWarningOpen(false);
        resetIdleTimerRef.current?.();
    };

    const toggleSidebar = () => {
        if (isMobileViewport) {
            setMobileSidebarOpen((prev) => !prev);
            return;
        }

        setSidebarCollapsed((prev) => {
            const next = !prev;
            try {
                window.localStorage.setItem(sidebarStorageKey, next ? '1' : '0');
            } catch {
                // Ignore storage access failures.
            }
            return next;
        });
    };

    const closeMobileSidebar = useCallback(() => {
        setMobileSidebarOpen(false);
    }, []);

    useEffect(() => {
        if (isMobileViewport) {
            setMobileSidebarOpen(false);
        }
    }, [isMobileViewport, router.asPath]);

    const handleRefreshCurrentPage = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (isPageRefreshing) return;

        setIsPageRefreshing(true);
        setNotificationsOpen(false);
        setNotificationCenterOpen(false);
        setSelectedNotification(null);
        setSecurityAlertsOpen(false);
        setSelectedSecurityAlert(null);
        closeUserDropdown();
        router.reload();
    };

    const handleOpenNotificationCenter = () => {
        setNotificationsOpen(false);
        setSecurityAlertsOpen(false);
        setSelectedSecurityAlert(null);
        setSelectedNotification(null);
        setNotificationCenterPage(1);
        setNotificationCenterTypeFilter('all');
        setNotificationCenterSeverityFilter('all');
        closeUserDropdown();
        setNotificationCenterOpen(true);
    };

    const handleCloseNotificationCenter = () => {
        setNotificationCenterOpen(false);
    };

    const handleMarkAllNotificationsAsRead = useCallback((itemsOverride?: AppNotification[]) => {
        markNotificationsAsRead(itemsOverride ?? notificationsRef.current);
    }, [markNotificationsAsRead]);

    const handleOpenNotificationLink = (destination: string) => {
        setNotificationsOpen(false);
        setNotificationCenterOpen(false);
        setSelectedNotification(null);
        setSecurityAlertsOpen(false);
        setSelectedSecurityAlert(null);
        closeUserDropdown();
        void router.push(destination);
    };

    const handleOpenNotificationDetail = useCallback((notification: AppNotification) => {
        setNotificationsOpen(false);
        markNotificationsAsRead([notification]);
        setSelectedNotification(notification);
        setSecurityAlertsOpen(false);
        setSelectedSecurityAlert(null);
        closeUserDropdown();
    }, [closeUserDropdown, markNotificationsAsRead]);

    const handleNotificationPreviewClick = useCallback((notification: AppNotification) => {
        if (notificationClickTimerRef.current) {
            clearTimeout(notificationClickTimerRef.current);
        }

        notificationClickTimerRef.current = setTimeout(() => {
            handleOpenNotificationDetail(notification);
            notificationClickTimerRef.current = null;
        }, 220);
    }, [handleOpenNotificationDetail]);

    const handleNotificationPreviewDoubleClick = useCallback((notification: AppNotification) => {
        if (notificationClickTimerRef.current) {
            clearTimeout(notificationClickTimerRef.current);
            notificationClickTimerRef.current = null;
        }

        markNotificationsAsUnread([notification]);
    }, [markNotificationsAsUnread]);

    const handleOpenSecuritySettings = () => {
        setNotificationsOpen(false);
        setNotificationCenterOpen(false);
        setSelectedNotification(null);
        setSecurityAlertsOpen(false);
        setSelectedSecurityAlert(null);
        closeUserDropdown();
        void router.push('/settings?section=intruder-ip-lockout');
    };

    const openPasswordChangeModal = (nextReason: 'manual' | 'expired' | 'first_login' = 'manual') => {
        closeUserDropdown();
        setNotificationsOpen(false);
        setSecurityAlertsOpen(false);
        setPasswordChangeReason(nextReason);
        setPasswordChangeOpen(true);
    };

    const handleOpenSecurityAlertDetail = (alert: SecurityAlert) => {
        setNotificationsOpen(false);
        setNotificationCenterOpen(false);
        setSelectedNotification(null);
        setSecurityAlertsOpen(false);
        setSelectedSecurityAlert(alert);
        closeUserDropdown();
    };

    const getSeverityTagStyle = (severity: SecurityAlert['severity']) => {
        if (severity === 'high') {
            return { background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c' };
        }
        if (severity === 'medium') {
            return { background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e' };
        }
        return { background: '#dcfce7', border: '1px solid #bbf7d0', color: '#166534' };
    };

    const getNotificationSeverityTagStyle = (severity: AppNotification['severity']) => {
        const normalizedSeverity = String(severity || 'info').toLowerCase();
        if (normalizedSeverity === 'high') {
            return { background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c' };
        }
        if (normalizedSeverity === 'medium') {
            return { background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e' };
        }
        if (normalizedSeverity === 'success') {
            return { background: '#dcfce7', border: '1px solid #bbf7d0', color: '#166534' };
        }
        return { background: '#dbeafe', border: '1px solid #bfdbfe', color: '#1d4ed8' };
    };

    const formatNotificationType = (value: string) => {
        const normalized = String(value || 'general').replace(/_/g, ' ').trim();
        if (!normalized) return 'General';
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    };

    const getTaskAssignmentMeta = useCallback((notification: AppNotification | null | undefined) => {
        const assignment = notification?.meta?.assignment;
        if (!assignment || typeof assignment !== 'object') {
            return null;
        }
        const taskTitle = String(assignment.task_title || '').trim();
        const assignedBy = String(assignment.assigned_by_name || '').trim();
        if (taskTitle === '' && assignedBy === '') {
            return null;
        }
        return assignment as TaskAssignmentNotificationMeta;
    }, []);

    const formatAssignerRoleLabel = useCallback((value: string | undefined) => {
        const normalized = String(value || '').trim().toLowerCase();
        if (normalized === 'manager') return 'Manager';
        if (normalized === 'administrator' || normalized === 'admin') return 'Administrator';
        if (!normalized) return 'Administrator';
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }, []);

    const renderAssignmentMetaPanel = useCallback((notification: AppNotification, compact = false) => {
        const assignment = getTaskAssignmentMeta(notification);
        if (!assignment) return null;

        const assignedByName = String(assignment.assigned_by_name || '').trim() || 'Administrator';
        const assignedByRole = formatAssignerRoleLabel(assignment.assigned_by_role);
        const assignmentKind = String(assignment.kind || '').toLowerCase() === 'reassigned' ? 'Reassigned' : 'Assigned';
        const projectName = String(assignment.project_name || '').trim();
        const clientName = String(assignment.client_name || '').trim();
        const priority = String(assignment.priority || '').trim();
        const dueDate = String(assignment.due_date || '').trim();

        return (
            <div className={`${styles.notificationAssignmentPanel} ${compact ? styles.notificationAssignmentPanelCompact : ''}`}>
                <div className={styles.notificationAssignmentHeader}>
                    <span className={styles.notificationAssignmentBadge}>{assignmentKind}</span>
                    <span className={styles.notificationAssignmentBy}>
                        Assigned by {assignedByName} ({assignedByRole})
                    </span>
                </div>
                <div className={styles.notificationAssignmentGrid}>
                    {projectName && (
                        <span className={styles.notificationAssignmentPill}>
                            Project: {projectName}
                        </span>
                    )}
                    {clientName && (
                        <span className={styles.notificationAssignmentPill}>
                            Client: {clientName}
                        </span>
                    )}
                    {priority && (
                        <span className={styles.notificationAssignmentPill}>
                            Priority: {priority}
                        </span>
                    )}
                    {dueDate && (
                        <span className={styles.notificationAssignmentPill}>
                            Due: {dueDate}
                        </span>
                    )}
                </div>
            </div>
        );
    }, [formatAssignerRoleLabel, getTaskAssignmentMeta]);

    const visibleNotifications = useMemo(() => {
        return notifications.filter((item) => {
            if (notificationCenterTypeFilter !== 'all' && String(item.type) !== notificationCenterTypeFilter) return false;
            if (notificationCenterSeverityFilter !== 'all' && String(item.severity) !== notificationCenterSeverityFilter) return false;
            return true;
        });
    }, [notificationCenterSeverityFilter, notificationCenterTypeFilter, notifications]);

    const paginatedNotifications = useMemo(() => {
        const startIndex = (notificationCenterPage - 1) * NOTIFICATION_CENTER_ITEMS_PER_PAGE;
        return visibleNotifications.slice(startIndex, startIndex + NOTIFICATION_CENTER_ITEMS_PER_PAGE);
    }, [notificationCenterPage, visibleNotifications]);

    const visibleNotificationsUnreadCount = useMemo(() => {
        return deriveUnseenNotificationCount(visibleNotifications);
    }, [deriveUnseenNotificationCount, visibleNotifications]);

    useEffect(() => {
        setNotificationCenterPage(1);
    }, [notificationCenterSeverityFilter, notificationCenterTypeFilter]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(visibleNotifications.length / NOTIFICATION_CENTER_ITEMS_PER_PAGE));
        if (notificationCenterPage > totalPages) {
            setNotificationCenterPage(totalPages);
        }
    }, [notificationCenterPage, visibleNotifications.length]);

    return (
        <div className={styles.container}>
            <Sidebar
                collapsed={sidebarCollapsed}
                role={role}
                featureAccess={(user?.role_feature_access || null) as RoleFeatureAccessMap | null}
                mobile={isMobileViewport}
                mobileOpen={mobileSidebarOpen}
                onNavigate={closeMobileSidebar}
            />

            {isMobileViewport && mobileSidebarOpen && (
                <button
                    type="button"
                    className={styles.sidebarBackdrop}
                    aria-label="Close navigation menu"
                    onClick={closeMobileSidebar}
                />
            )}

            <div className={`${styles.mainContent} ${isMobileViewport ? styles.mainContentMobile : (sidebarCollapsed ? styles.mainContentCollapsed : styles.mainContentExpanded)}`}>
                <header className={styles.header}>
                    <button
                        type="button"
                        className={styles.toggleButton}
                        onClick={toggleSidebar}
                        aria-label={isMobileViewport ? (mobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu') : (sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar')}
                        aria-expanded={isMobileViewport ? mobileSidebarOpen : !sidebarCollapsed}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                    </button>

                    <div className={styles.headerMeta}>
                        <nav className={styles.breadcrumbNav} aria-label="Breadcrumb">
                            <ol className={styles.breadcrumbList}>
                                {routeBreadcrumbs.map((breadcrumb, index) => {
                                    const isCurrent = index === routeBreadcrumbs.length - 1;

                                    return (
                                        <li key={`${breadcrumb.href}-${breadcrumb.label}`} className={styles.breadcrumbItem}>
                                            {isCurrent ? (
                                                <span className={styles.breadcrumbCurrent} aria-current="page">
                                                    {breadcrumb.label}
                                                </span>
                                            ) : (
                                                <Link href={breadcrumb.href} className={styles.breadcrumbLink}>
                                                    {breadcrumb.label}
                                                </Link>
                                            )}

                                            {!isCurrent && <span className={styles.breadcrumbSeparator} aria-hidden="true">&gt;</span>}
                                        </li>
                                    );
                                })}
                            </ol>
                        </nav>
                    </div>

                    <div className={styles.headerActions}>
                        <button
                            type="button"
                            className={`${styles.headerIconButton} ${isPageRefreshing ? styles.headerIconButtonActive : ''}`}
                            aria-label="Refresh current page"
                            title={isPageRefreshing ? 'Refreshing page...' : 'Refresh current page'}
                            onClick={handleRefreshCurrentPage}
                            disabled={isPageRefreshing}
                        >
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="23 4 23 10 17 10" />
                                <polyline points="1 20 1 14 7 14" />
                                <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10" />
                                <path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14" />
                            </svg>
                        </button>

                        <div className={styles.notificationArea} ref={notificationsMenuRef}>
                            <button
                                type="button"
                                className={`${styles.notificationBellButton} ${notificationsOpen ? styles.notificationBellButtonOpen : ''}`}
                                aria-label="Notifications"
                                title="Notifications"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    closeUserDropdown();
                                    setSecurityAlertsOpen(false);
                                    setNotificationsOpen((prev) => !prev);
                                }}
                            >
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                                </svg>
                                {notificationsUnseenCount > 0 && (
                                    <span className={styles.notificationCountBadge}>
                                        {notificationsUnseenCount > 99 ? '99+' : notificationsUnseenCount}
                                    </span>
                                )}
                            </button>

                            {notificationsOpen && (
                                <div className={styles.notificationDropdown}>
                                    <div className={styles.notificationHeader}>
                                        <div className={styles.notificationHeaderTitle}>Notifications</div>
                                        <div className={styles.notificationHeaderActions}>
                                            <button
                                                type="button"
                                                className={styles.notificationRefreshButton}
                                                disabled={notifications.length === 0 || notificationsUnseenCount === 0}
                                                onClick={() => handleMarkAllNotificationsAsRead(notifications)}
                                            >
                                                Read all
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.notificationIconButton}
                                                aria-label="Maximize notifications"
                                                title="Maximize notifications"
                                                onClick={handleOpenNotificationCenter}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="15 3 21 3 21 9" />
                                                    <polyline points="9 21 3 21 3 15" />
                                                    <line x1="21" y1="3" x2="14" y2="10" />
                                                    <line x1="3" y1="21" x2="10" y2="14" />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.notificationRefreshButton}
                                                onClick={() => { void fetchNotifications({ silent: false }); }}
                                            >
                                                {notificationsLoading ? 'Refreshing...' : 'Refresh'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className={styles.notificationList}>
                                        {notifications.length === 0 ? (
                                            <div className={styles.notificationEmptyState}>No notifications available right now.</div>
                                        ) : (
                                            notifications.map((notification) => {
                                                const severityStyle = getNotificationSeverityTagStyle(notification.severity);
                                                const notificationIsRead = isReadNotification(notification);
                                                const assignmentMeta = getTaskAssignmentMeta(notification);
                                                return (
                                                    <button
                                                        key={notification.id}
                                                        type="button"
                                                        className={`${styles.notificationItem} ${notificationIsRead ? styles.notificationItemRead : styles.notificationItemUnread}`}
                                                        onClick={() => handleNotificationPreviewClick(notification)}
                                                        onDoubleClick={() => handleNotificationPreviewDoubleClick(notification)}
                                                        aria-label={`Open notification: ${notification.title}`}
                                                        title={notificationIsRead ? 'Double-click to mark as unread.' : 'Click to open and mark as read.'}
                                                    >
                                                        <div className={styles.notificationItemTop}>
                                                            <div className={styles.notificationItemLead}>
                                                                {!notificationIsRead && <span className={styles.notificationUnreadDot} aria-hidden="true" />}
                                                                <span style={{
                                                                    ...severityStyle,
                                                                    borderRadius: 999,
                                                                    padding: '1px 8px',
                                                                    fontSize: 10,
                                                                    fontWeight: 800,
                                                                    textTransform: 'uppercase',
                                                                    letterSpacing: '0.05em',
                                                                }}>
                                                                    {String(notification.severity || 'info')}
                                                                </span>
                                                                <span className={styles.notificationTypeTag}>
                                                                    {formatNotificationType(notification.type)}
                                                                </span>
                                                            </div>
                                                            <span className={styles.notificationReadStatus}>
                                                                {notificationIsRead ? 'Read' : 'Unread'}
                                                            </span>
                                                        </div>
                                                        <div className={styles.notificationItemTitle}>{notification.title}</div>
                                                        <div className={styles.notificationItemMessage}>{notification.message}</div>
                                                        {assignmentMeta && renderAssignmentMetaPanel(notification, true)}
                                                        <div className={styles.notificationItemTimestamp}>
                                                            {formatAlertTimestamp(notification.occurred_at)}
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>

                                    <div className={styles.notificationFooter}>
                                        <div className={styles.notificationFooterHint}>
                                            Double-click any notification to mark it as unread.
                                        </div>
                                        <button
                                            type="button"
                                            className={styles.notificationFooterButton}
                                            onClick={handleOpenNotificationCenter}
                                        >
                                            Open Maximized Notification Center
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {isAdminRole && (
                            <div className={styles.notificationArea} ref={securityMenuRef}>
                                <button
                                    type="button"
                                    className={`${styles.notificationBellButton} ${securityAlertsOpen ? styles.notificationBellButtonOpen : ''}`}
                                    aria-label="Security activity"
                                    title="Security activity"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        closeUserDropdown();
                                        setNotificationsOpen(false);
                                        setSecurityAlertsOpen((prev) => {
                                            const next = !prev;
                                            if (next) {
                                                markSecurityAlertsAsRead();
                                            }
                                            return next;
                                        });
                                    }}
                                >
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 3l7 4v5c0 5-3.5 7.74-7 9-3.5-1.26-7-4-7-9V7l7-4z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <circle cx="12" cy="17" r="1" />
                                    </svg>
                                    {securityAlertsUnseenCount > 0 && (
                                        <span className={styles.notificationCountBadge}>
                                            {securityAlertsUnseenCount > 99 ? '99+' : securityAlertsUnseenCount}
                                        </span>
                                    )}
                                </button>

                                {securityAlertsOpen && (
                                    <div className={styles.notificationDropdown}>
                                        <div className={styles.notificationHeader}>
                                            <div className={styles.notificationHeaderTitle}>Suspicious Activity</div>
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                <button
                                                    type="button"
                                                    className={styles.notificationIconButton}
                                                    aria-label="Maximize security alerts"
                                                    title="Maximize security alerts"
                                                    onClick={handleOpenSecuritySettings}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        padding: '6px',
                                                        cursor: 'pointer',
                                                        color: '#64748b',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        borderRadius: '6px',
                                                    }}
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="15 3 21 3 21 9" />
                                                        <polyline points="9 21 3 21 3 15" />
                                                        <line x1="21" y1="3" x2="14" y2="10" />
                                                        <line x1="3" y1="21" x2="10" y2="14" />
                                                    </svg>
                                                </button>
                                                <button
                                                    type="button"
                                                    className={styles.notificationRefreshButton}
                                                    onClick={() => { void fetchSecurityAlerts({ silent: false }); }}
                                                >
                                                    {securityAlertsLoading ? 'Refreshing...' : 'Refresh'}
                                                </button>
                                            </div>
                                        </div>

                                        <div className={styles.notificationList}>
                                            {securityAlerts.length === 0 ? (
                                                <div className={styles.notificationEmptyState}>No suspicious inbound or outbound IP activity detected.</div>
                                            ) : (
                                                securityAlerts.map((alert) => {
                                                    const severityStyle = getSeverityTagStyle(alert.severity);
                                                    return (
                                                        <button
                                                            key={alert.id}
                                                            type="button"
                                                            className={styles.notificationItem}
                                                            onClick={() => handleOpenSecurityAlertDetail(alert)}
                                                            aria-label={`Open security alert: ${alert.title}`}
                                                        >
                                                            <div className={styles.notificationItemTop}>
                                                                <span style={{
                                                                    ...severityStyle,
                                                                    borderRadius: 999,
                                                                    padding: '1px 8px',
                                                                    fontSize: 10,
                                                                    fontWeight: 800,
                                                                    textTransform: 'uppercase',
                                                                    letterSpacing: '0.05em',
                                                                }}>
                                                                    {alert.severity}
                                                                </span>
                                                                <span className={styles.notificationDirectionTag}>
                                                                    {alert.direction}
                                                                </span>
                                                            </div>
                                                            <div className={styles.notificationItemTitle}>{alert.title}</div>
                                                            <div className={styles.notificationItemMeta}>
                                                                <span className={styles.notificationMetaLabel}>IP:</span>{' '}
                                                                {alert.ip_address || 'unknown'}
                                                            </div>
                                                            <div className={styles.notificationItemMessage}>
                                                                {alert.message}
                                                            </div>
                                                            <div className={styles.notificationItemTimestamp}>
                                                                {formatAlertTimestamp(alert.occurred_at)}
                                                            </div>
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>

                                        <div className={styles.notificationFooter}>
                                            <button
                                                type="button"
                                                className={styles.notificationFooterButton}
                                                onClick={handleOpenSecuritySettings}
                                            >
                                                Open Intruder Lockout Settings
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div
                            className={styles.profileArea}
                            onClick={() => setSidebarCollapsed((prev) => prev)}
                        >
                            {/* Toggle Dropdown on click */}
                            <div
                                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setNotificationsOpen(false);
                                    setSecurityAlertsOpen(false);
                                    if (typeof document === 'undefined') return;
                                    const dropdown = document.getElementById('userDropdown');
                                    if (dropdown) {
                                        dropdown.classList.toggle(styles.open);
                                    }
                                }}
                            >
                                <div className={styles.profileIdentity}>
                                    <div style={{ fontSize: '14px', color: '#666' }}>
                                        {user?.full_name || user?.username}
                                    </div>
                                    <button
                                        type="button"
                                        className={styles.headerLogoutButton}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            void handleLogoutClick();
                                        }}
                                        disabled={isLogoutDisabled}
                                        title={
                                            lockdownEnabled ? 'Logout disabled while lockdown mode is active.' : 'Logout'
                                        }
                                        aria-label="Logout"
                                    >
                                        Logout
                                    </button>
                                </div>
                                <div style={{ width: '32px', height: '32px', background: '#ddd', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontWeight: 'bold', overflow: 'hidden', position: 'relative' }}>
                                    <span>{user?.username?.[0]?.toUpperCase()}</span>
                                    {photoUrl && (
                                        <img
                                            src={photoUrl}
                                            alt="Profile"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
                                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }}
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Dropdown Menu */}
                            <div id="userDropdown" className={styles.profileDropdown}>
                            {(role === 'staff' || role === 'manager') && (
                                <div
                                    className={styles.dropdownItem}
                                    data-static-hover="true"
                                    onClick={() => {
                                        closeUserDropdown();
                                        router.push('/profile');
                                    }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', color: '#1e3a8a' }}>
                                        <path d="M20 21a8 8 0 1 0-16 0"></path>
                                        <circle cx="12" cy="7" r="4"></circle>
                                    </svg>
                                    <span style={{ color: '#1e3a8a' }}>My Profile</span>
                                </div>
                            )}
                            <div
                                className={styles.dropdownItem}
                                onClick={() => openPasswordChangeModal(passwordChangeReasonForUser)}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', color: passwordRequiresChange ? '#b91c1c' : '#1e3a8a' }}>
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                    <path d="M9 12h6"></path>
                                    <path d="M12 9v6"></path>
                                </svg>
                                <span style={{ display: 'grid', gap: 1, color: passwordRequiresChange ? '#b91c1c' : '#1e3a8a' }}>
                                    <span>{passwordRequiresChange ? 'Change Required Password' : 'Change Password'}</span>
                                    {!passwordRequiresChange && <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{passwordExpiresLabel}</span>}
                                </span>
                            </div>
                            {passwordRequiresChange && (
                                <div style={{ padding: '8px 12px 10px', fontSize: 11, color: '#b91c1c', background: '#fef2f2', borderTop: '1px solid #fee2e2' }}>
                                    Your password must be changed before continuing.
                                </div>
                            )}
                            {role === 'admin' && (
                                <>
                                    <div className={styles.dropdownDivider}></div>
                                    <div
                                        className={styles.dropdownItem}
                                        onClick={() => {
                                            closeUserDropdown();
                                            router.push('/settings/password-policy');
                                        }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', color: '#0f766e' }}>
                                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                            <path d="M9 12h6"></path>
                                            <path d="M12 9v6"></path>
                                            <path d="M8 16l-1 4 4-2 4 2-1-4"></path>
                                        </svg>
                                        <span style={{ color: '#0f766e' }}>Password Policy</span>
                                    </div>
                                </>
                            )}
                            </div>
                        </div>
                    </div>
                </header>

                <main style={{ padding: '10px' }}>
                    {children}
                </main>
            </div>

            <PasswordChangeModal
                open={passwordChangeOpen}
                user={user ?? null}
                reason={passwordChangeReason}
                allowClose={!passwordRequiresChange}
                onClose={() => {
                    setPasswordChangeOpen(false);
                }}
                onPasswordChanged={() => {
                    setPasswordChangeOpen(false);
                    window.location.reload();
                }}
            />

            {idleWarningOpen && shouldTrackIdleTimeout && (
                <div className={styles.idleWarningOverlay} role="dialog" aria-modal="true" aria-labelledby="idle-warning-title">
                    <div className={styles.idleWarningCard}>
                        <h3 id="idle-warning-title" className={styles.idleWarningTitle}>Inactivity Warning</h3>
                        <p className={styles.idleWarningText}>
                            You will be logged out in <strong>{idleWarningCountdown}</strong> seconds due to inactivity.
                        </p>
                        <div className={styles.idleWarningActions}>
                            <button
                                type="button"
                                className={styles.idleContinueButton}
                                onClick={handleStaySignedIn}
                                disabled={isIdleAutoLoggingOut}
                            >
                                Stay Signed In
                            </button>
                            <button
                                type="button"
                                className={styles.idleLogoutButton}
                                onClick={() => { void executeIdleAutoLogout(); }}
                                disabled={isIdleAutoLoggingOut}
                            >
                                {isIdleAutoLoggingOut ? 'Logging out...' : 'Logout Now'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {notificationCenterOpen && (
                <div
                    className={styles.notificationCenterOverlay}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="notification-center-title"
                    onClick={handleCloseNotificationCenter}
                >
                    <div
                        className={styles.notificationCenterCard}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className={styles.notificationCenterHeader}>
                            <div className={styles.notificationCenterContentRail}>
                                <div className={styles.notificationCenterEyebrow}>Notification Center</div>
                                <h3 id="notification-center-title" className={styles.notificationCenterTitle}>
                                    All Notifications
                                </h3>
                                <p className={styles.notificationCenterText}>
                                    Review alerts without leaving the current page.
                                </p>
                            </div>
                            <div className={styles.notificationCenterControls}>
                                <select
                                    value={notificationCenterTypeFilter}
                                    onChange={(event) => setNotificationCenterTypeFilter(event.target.value)}
                                    className={styles.notificationCenterSelect}
                                >
                                    <option value="all">All Types</option>
                                    <option value="activity">Activity</option>
                                    <option value="task">Task</option>
                                    <option value="client">Client</option>
                                    <option value="leave">Leave</option>
                                    <option value="payroll">Payroll</option>
                                    <option value="shift">Shift</option>
                                    <option value="approval">Approval</option>
                                </select>
                                <select
                                    value={notificationCenterSeverityFilter}
                                    onChange={(event) => setNotificationCenterSeverityFilter(event.target.value)}
                                    className={styles.notificationCenterSelect}
                                >
                                    <option value="all">All Severity</option>
                                    <option value="high">High</option>
                                    <option value="medium">Medium</option>
                                    <option value="info">Info</option>
                                    <option value="success">Success</option>
                                </select>
                            </div>
                            <div className={styles.notificationCenterHeaderActions}>
                                <button
                                    type="button"
                                    className={styles.notificationRefreshButton}
                                    disabled={visibleNotifications.length === 0 || visibleNotificationsUnreadCount === 0}
                                    onClick={() => handleMarkAllNotificationsAsRead(visibleNotifications)}
                                >
                                    Read all
                                </button>
                                <button
                                    type="button"
                                    className={styles.notificationRefreshButton}
                                    onClick={() => { void fetchNotifications({ silent: false }); }}
                                >
                                    {notificationsLoading ? 'Refreshing...' : 'Refresh'}
                                </button>
                                <button
                                    type="button"
                                    className={styles.notificationIconButton}
                                    aria-label="Close notification center"
                                    onClick={handleCloseNotificationCenter}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className={styles.notificationCenterBody}>
                            {visibleNotifications.length === 0 ? (
                                <div className={styles.notificationCenterEmpty}>
                                    No notifications match your current filters.
                                </div>
                            ) : (
                                paginatedNotifications.map((notification) => {
                                    const severityStyle = getNotificationSeverityTagStyle(notification.severity);
                                    const notificationIsRead = isReadNotification(notification);
                                    const assignmentMeta = getTaskAssignmentMeta(notification);
                                    return (
                                        <button
                                            key={notification.id}
                                            type="button"
                                            className={`${styles.notificationCenterItem} ${notificationIsRead ? styles.notificationCenterItemRead : styles.notificationCenterItemUnread}`}
                                            onClick={() => handleNotificationPreviewClick(notification)}
                                            onDoubleClick={() => handleNotificationPreviewDoubleClick(notification)}
                                            title={`${notification.title} - ${notification.message}`}
                                        >
                                            <div className={styles.notificationCenterItemLead}>
                                                {!notificationIsRead && <span className={styles.notificationUnreadDot} aria-hidden="true" />}
                                                <span style={{
                                                    ...severityStyle,
                                                    borderRadius: 999,
                                                    padding: '2px 8px',
                                                    fontSize: 10,
                                                    fontWeight: 800,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.05em',
                                                }}>
                                                    {String(notification.severity || 'info')}
                                                </span>
                                                <span className={styles.notificationTypeTag}>
                                                    {formatNotificationType(notification.type)}
                                                </span>
                                            </div>
                                            <div className={`${styles.notificationCenterItemSummary} ${assignmentMeta ? styles.notificationCenterItemSummaryStacked : ''}`}>
                                                <div className={styles.notificationCenterItemHeadline}>
                                                    <div className={styles.notificationCenterItemTitle}>{notification.title}</div>
                                                    {!assignmentMeta && <span className={styles.notificationCenterItemDivider} aria-hidden="true">&bull;</span>}
                                                    <div className={styles.notificationCenterItemMessage}>{notification.message}</div>
                                                </div>
                                                {assignmentMeta && renderAssignmentMetaPanel(notification)}
                                            </div>
                                            <div className={styles.notificationCenterItemTimestamp}>
                                                <span className={styles.notificationReadStatus}>
                                                    {notificationIsRead ? 'Read' : 'Unread'}
                                                </span>
                                                <span>{formatAlertTimestamp(notification.occurred_at)}</span>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                        {visibleNotifications.length > 0 && (
                            <div className={styles.notificationCenterPagination}>
                                <Pagination
                                    currentPage={notificationCenterPage}
                                    totalItems={visibleNotifications.length}
                                    itemsPerPage={NOTIFICATION_CENTER_ITEMS_PER_PAGE}
                                    onPageChange={setNotificationCenterPage}
                                    label="notifications"
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {selectedNotification && (
                <div
                    className={styles.notificationDetailOverlay}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="notification-detail-title"
                    onClick={() => setSelectedNotification(null)}
                >
                    <div
                        className={styles.notificationDetailCard}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            className={styles.notificationDetailCloseButton}
                            aria-label="Close notification details"
                            onClick={() => setSelectedNotification(null)}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>

                        <div className={styles.notificationDetailHeader}>
                            <div className={styles.notificationDetailEyebrow}>System Notification</div>
                            <div className={styles.notificationDetailBadgeRow}>
                                <span style={{
                                    ...getNotificationSeverityTagStyle(selectedNotification.severity),
                                    borderRadius: 999,
                                    padding: '5px 10px',
                                    fontSize: 11,
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                }}>
                                    {String(selectedNotification.severity || 'info')}
                                </span>
                                <span className={styles.notificationTypeTag}>
                                    {formatNotificationType(selectedNotification.type)}
                                </span>
                            </div>
                            <h3 id="notification-detail-title" className={styles.notificationDetailTitle}>
                                {selectedNotification.title}
                            </h3>
                            <p className={styles.notificationDetailText}>
                                {selectedNotification.message}
                            </p>
                            {renderAssignmentMetaPanel(selectedNotification)}
                        </div>

                        <div className={styles.notificationDetailGrid}>
                            <div className={styles.notificationDetailField}>
                                <span className={styles.notificationDetailFieldLabel}>Notification Type</span>
                                <span className={styles.notificationDetailFieldValue}>
                                    {formatNotificationType(selectedNotification.type)}
                                </span>
                            </div>
                            <div className={styles.notificationDetailField}>
                                <span className={styles.notificationDetailFieldLabel}>Received At</span>
                                <span className={styles.notificationDetailFieldValue}>
                                    {formatAlertTimestamp(selectedNotification.occurred_at)}
                                </span>
                            </div>
                            <div className={styles.notificationDetailField}>
                                <span className={styles.notificationDetailFieldLabel}>Severity</span>
                                <span className={styles.notificationDetailFieldValue}>
                                    {String(selectedNotification.severity || 'info').toUpperCase()}
                                </span>
                            </div>
                            <div className={styles.notificationDetailField}>
                                <span className={styles.notificationDetailFieldLabel}>Linked Page</span>
                                <span className={styles.notificationDetailFieldValue}>
                                    {formatRouteLabel(selectedNotification.link)}
                                </span>
                            </div>
                        </div>

                        <div className={styles.notificationDetailActions}>
                            <button
                                type="button"
                                className={styles.notificationDetailSecondaryButton}
                                onClick={() => setSelectedNotification(null)}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                className={styles.notificationDetailSecondaryButton}
                                onClick={() => {
                                    markNotificationsAsUnread([selectedNotification]);
                                    setSelectedNotification(null);
                                }}
                            >
                                Mark as unread
                            </button>
                            <button
                                type="button"
                                className={styles.notificationDetailSecondaryButton}
                                onClick={handleOpenNotificationCenter}
                            >
                                Open Maximized Center
                            </button>
                            {selectedNotification.link && (
                                <button
                                    type="button"
                                    className={styles.notificationDetailPrimaryButton}
                                    onClick={() => handleOpenNotificationLink(selectedNotification.link as string)}
                                >
                                    Open Related Page
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {selectedSecurityAlert && (
                <div
                    className={styles.notificationDetailOverlay}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="security-alert-detail-title"
                    onClick={() => setSelectedSecurityAlert(null)}
                >
                    <div
                        className={styles.notificationDetailCard}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            className={styles.notificationDetailCloseButton}
                            aria-label="Close security alert details"
                            onClick={() => setSelectedSecurityAlert(null)}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>

                        <div className={styles.notificationDetailHeader}>
                            <div className={styles.notificationDetailEyebrow}>Security Notification</div>
                            <div className={styles.notificationDetailBadgeRow}>
                                <span style={{
                                    ...getSeverityTagStyle(selectedSecurityAlert.severity),
                                    borderRadius: 999,
                                    padding: '5px 10px',
                                    fontSize: 11,
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                }}>
                                    {selectedSecurityAlert.severity}
                                </span>
                                <span className={styles.notificationDirectionTag}>
                                    {selectedSecurityAlert.direction}
                                </span>
                            </div>
                            <h3 id="security-alert-detail-title" className={styles.notificationDetailTitle}>
                                {selectedSecurityAlert.title}
                            </h3>
                            <p className={styles.notificationDetailText}>
                                {selectedSecurityAlert.message}
                            </p>
                        </div>

                        <div className={styles.notificationDetailGrid}>
                            <div className={styles.notificationDetailField}>
                                <span className={styles.notificationDetailFieldLabel}>IP Address</span>
                                <span className={styles.notificationDetailFieldValue}>
                                    {selectedSecurityAlert.ip_address || 'Unknown'}
                                </span>
                            </div>
                            <div className={styles.notificationDetailField}>
                                <span className={styles.notificationDetailFieldLabel}>Detected At</span>
                                <span className={styles.notificationDetailFieldValue}>
                                    {formatAlertTimestamp(selectedSecurityAlert.occurred_at)}
                                </span>
                            </div>
                            <div className={styles.notificationDetailField}>
                                <span className={styles.notificationDetailFieldLabel}>Alert Type</span>
                                <span className={styles.notificationDetailFieldValue}>
                                    {selectedSecurityAlert.activity_type || selectedSecurityAlert.kind || 'Unknown'}
                                </span>
                            </div>
                            <div className={styles.notificationDetailField}>
                                <span className={styles.notificationDetailFieldLabel}>Suggested Action</span>
                                <span className={styles.notificationDetailFieldValue}>
                                    {selectedSecurityAlert.action || 'Review the source IP and tighten intruder controls if needed.'}
                                </span>
                            </div>
                        </div>

                        <div className={styles.notificationDetailActions}>
                            <button
                                type="button"
                                className={styles.notificationDetailSecondaryButton}
                                onClick={() => setSelectedSecurityAlert(null)}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                className={styles.notificationDetailPrimaryButton}
                                onClick={handleOpenSecuritySettings}
                            >
                                Open Intruder Lockout Settings
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isLockdownRestricted && (
                <div className={styles.lockdownOverlay} role="alertdialog" aria-modal="true" aria-live="assertive">
                    <div className={styles.lockdownCard}>
                        <div className={styles.lockdownHeader}>
                            <div className={styles.lockdownIcon} aria-hidden="true">
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2 2 20h20L12 2z" />
                                    <line x1="12" y1="9" x2="12" y2="13" />
                                    <circle cx="12" cy="17" r="1" />
                                </svg>
                            </div>
                            <div className={styles.lockdownHeaderCopy}>
                                <div className={styles.lockdownEyebrow}>Emergency Lockdown</div>
                                <h3 className={styles.lockdownTitle}>System activity is temporarily paused.</h3>
                            </div>
                        </div>
                        <p className={styles.lockdownText}>
                            Please remain on this screen until the lockdown is lifted.
                        </p>
                        {displayLockdownReason && (
                            <div className={styles.lockdownReasonText}>{displayLockdownReason}</div>
                        )}
                        {lockdownUpdatedAt && (
                            <div className={styles.lockdownMeta}>Updated {lockdownUpdatedAt}</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
