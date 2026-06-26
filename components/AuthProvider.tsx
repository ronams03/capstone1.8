import {
    createContext,
    type ReactNode,
    type SetStateAction,
    startTransition,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useRouter } from 'next/router';
import { getApiBaseUrl } from '@/utils/network';
import type { RoleFeatureAccessMap } from '@/utils/roleFeatureAccess';

export type SessionUser = {
    id?: number;
    role?: string;
    username?: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    photo?: string | null;
    must_reset_password?: number | string;
    password_change_reason?: string;
    password_status?: {
        expired?: boolean;
        requires_change?: boolean;
        reason?: string;
        days_remaining?: number | null;
        password_expires_at?: string | null;
    } | null;
    dashboard_path?: string;
    role_feature_access?: RoleFeatureAccessMap;
    [key: string]: unknown;
};

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type RefreshSessionOptions = {
    force?: boolean;
};

type UseProtectedPageOptions = {
    allowedRoles?: string[];
    unauthenticatedRedirect?: string;
    unauthorizedRedirect?: string;
    includeNext?: boolean;
};

type AuthContextValue = {
    user: SessionUser | null;
    status: AuthStatus;
    isAuthenticated: boolean;
    refreshSession: (options?: RefreshSessionOptions) => Promise<SessionUser | null>;
    logout: () => Promise<void>;
    setSessionUser: (nextUser: SetStateAction<SessionUser | null>) => void;
};

const API_BASE_URL = getApiBaseUrl();
const AuthContext = createContext<AuthContextValue | null>(null);

function buildSessionUrl(force = false) {
    return force ? `${API_BASE_URL}/auth.php?action=session` : `${API_BASE_URL}/auth.php`;
}

function normalizeRole(value: unknown) {
    return String(value || '').trim().toLowerCase();
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const [user, setUser] = useState<SessionUser | null>(null);
    const [status, setStatus] = useState<AuthStatus>('loading');
    const inFlightRef = useRef<Promise<SessionUser | null> | null>(null);

    const setSessionUser = useCallback((nextUser: SetStateAction<SessionUser | null>) => {
        setUser((previousUser) => {
            const resolvedUser = typeof nextUser === 'function'
                ? (nextUser as (previous: SessionUser | null) => SessionUser | null)(previousUser)
                : nextUser;

            setStatus(resolvedUser ? 'authenticated' : 'unauthenticated');
            return resolvedUser;
        });
    }, []);

    const refreshSession = useCallback(async (options?: RefreshSessionOptions) => {
        const force = !!options?.force;

        if (!force && inFlightRef.current) {
            return inFlightRef.current;
        }

        if (force) {
            setStatus((prev) => (prev === 'unauthenticated' ? 'loading' : prev));
        }

        const request = (async () => {
            try {
                const response = await fetch(buildSessionUrl(force), {
                    credentials: 'include',
                    cache: 'no-store',
                });
                const payload = await response.json();

                if (payload?.success) {
                    const nextUser = (payload.data || {}) as SessionUser;
                    setUser(nextUser);
                    setStatus('authenticated');
                    return nextUser;
                }

                setUser(null);
                setStatus('unauthenticated');
                return null;
            } catch {
                setUser(null);
                setStatus('unauthenticated');
                return null;
            } finally {
                inFlightRef.current = null;
            }
        })();

        if (!force) {
            inFlightRef.current = request;
        }

        return request;
    }, []);

    const logout = useCallback(async () => {
        setUser(null);
        setStatus('unauthenticated');
        startTransition(() => {
            void router.push('/');
        });

        void fetch(`${API_BASE_URL}/auth.php?action=logout`, {
            method: 'POST',
            credentials: 'include',
        }).catch(() => undefined);
    }, [router]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void refreshSession();
        }, 0);

        return () => {
            window.clearTimeout(timer);
        };
    }, [refreshSession]);

    useEffect(() => {
        if (!router.isReady || status !== 'authenticated' || !user) return;
        const mustChangePassword = Number(user.must_reset_password ?? 0) === 1 || Boolean(user.password_status?.requires_change);
        if (!mustChangePassword) return;

        const currentPath = router.asPath || router.pathname || '';
        if (currentPath.startsWith('/reset-password') || currentPath.startsWith('/change-password')) return;

        const reason = String(user.password_change_reason || user.password_status?.reason || 'expired');
        const nextPath = reason === 'first_login'
            ? '/reset-password?mode=first_login'
            : `/change-password?reason=${reason === 'expired' ? 'expired' : 'manual'}`;
        startTransition(() => {
            void router.replace(nextPath);
        });
    }, [router, status, user]);

    const value = useMemo<AuthContextValue>(() => ({
        user,
        status,
        isAuthenticated: status === 'authenticated',
        refreshSession,
        logout,
        setSessionUser,
    }), [logout, refreshSession, setSessionUser, status, user]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider.');
    }
    return context;
}

export function useProtectedPage(options?: UseProtectedPageOptions) {
    const {
        allowedRoles = [],
        unauthenticatedRedirect = '/',
        unauthorizedRedirect = '/dashboard',
        includeNext = true,
    } = options || {};
    const auth = useAuth();
    const router = useRouter();
    const forcedRefreshAttemptedRef = useRef(false);

    const normalizedAllowedRoles = useMemo(
        () => allowedRoles.map((role) => normalizeRole(role)).filter(Boolean),
        [allowedRoles],
    );
    const currentRole = normalizeRole(auth.user?.role);
    const roleAllowed = normalizedAllowedRoles.length === 0 || normalizedAllowedRoles.includes(currentRole);
    const currentPath = router.asPath || router.pathname || '/';

    useEffect(() => {
        if (!router.isReady) return;

        if (auth.status === 'loading') {
            return;
        }

        if (auth.status === 'unauthenticated' && !forcedRefreshAttemptedRef.current) {
            forcedRefreshAttemptedRef.current = true;
            void auth.refreshSession({ force: true });
            return;
        }

        if (auth.status === 'unauthenticated') {
            if (unauthenticatedRedirect === '/' && includeNext) {
                startTransition(() => {
                    void router.replace({
                        pathname: '/',
                        query: currentPath && currentPath !== '/'
                            ? { next: currentPath }
                            : {},
                    });
                });
                return;
            }

            startTransition(() => {
                void router.replace(unauthenticatedRedirect);
            });
            return;
        }

        if (!roleAllowed) {
            startTransition(() => {
                void router.replace(unauthorizedRedirect);
            });
        }
    }, [
        auth,
        currentPath,
        includeNext,
        roleAllowed,
        router,
        unauthenticatedRedirect,
        unauthorizedRedirect,
    ]);

    const loading = !router.isReady
        || auth.status === 'loading'
        || auth.status === 'unauthenticated'
        || !roleAllowed;

    return {
        user: auth.user,
        loading,
        logout: auth.logout,
        refreshSession: auth.refreshSession,
        setSessionUser: auth.setSessionUser,
        status: auth.status,
    };
}
