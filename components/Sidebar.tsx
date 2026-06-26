import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { warmRoute, warmRoutes } from '@/utils/routeWarmup';
import {
    hasRoleFeatureAccess,
    type RoleFeatureAccessMap,
    type RoleFeatureKey,
} from '@/utils/roleFeatureAccess';
import styles from '../styles/Layout.module.css';

const DEFAULT_OPEN_SECTIONS: Record<string, boolean> = {
    'MAIN': true,
    'MY WORK': true,
    'MASTER FILES': true,
    'TRANSACTION FILES': true,
    'SYSTEM': true
};

function getInitialOpenSections(): Record<string, boolean> {
    if (typeof window === 'undefined') return DEFAULT_OPEN_SECTIONS;

    try {
        const saved = window.localStorage.getItem('sidebarSectionsState');
        return saved ? JSON.parse(saved) : DEFAULT_OPEN_SECTIONS;
    } catch (e) {
        console.error('Failed to load sidebar state', e);
        return DEFAULT_OPEN_SECTIONS;
    }
}

interface SidebarProps {
    collapsed: boolean;
    role?: string;
    featureAccess?: RoleFeatureAccessMap | null;
    mobile?: boolean;
    mobileOpen?: boolean;
    onNavigate?: () => void;
}

type SidebarItem = {
    label: string;
    path?: string;
    featureKey?: RoleFeatureKey;
    roles: string[];
    icon: React.ReactNode;
};

export default function Sidebar({
    collapsed,
    role,
    featureAccess,
    mobile = false,
    mobileOpen = false,
    onNavigate,
}: SidebarProps) {
    const router = useRouter();
    const currentPath = router.pathname;
    const assetBasePath = router.basePath || '';
    const navRef = React.useRef<HTMLElement | null>(null);
    const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const normalizedRole = String(role || '').trim().toLowerCase();
    const isCollapsed = mobile ? false : collapsed;
    const sidebarScrollStorageKey = `sidebarNavScroll:${mobile ? 'mobile' : 'desktop'}:${normalizedRole || 'anonymous'}`;

    const isActive = (path: string) => currentPath === path;
    const menuSections: Array<{ title: string; items: SidebarItem[] }> = [
        {
            title: 'MAIN',
            items: [
                {
                    label: 'Dashboard',
                    path: normalizedRole === 'admin'
                        ? '/admin/dashboard'
                        : normalizedRole === 'manager'
                            ? '/manager/dashboard'
                            : '/dashboard',
                    roles: ['admin', 'manager', 'staff'],
                    icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                        </svg>
                    )
                },
                {
                    label: 'Calendar',
                    path: '/calendar',
                    featureKey: 'calendar',
                    roles: ['admin', 'manager', 'staff'],
                    icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                            <path d="M8 14h.01"></path>
                            <path d="M12 14h.01"></path>
                            <path d="M16 14h.01"></path>
                            <path d="M8 18h.01"></path>
                            <path d="M12 18h.01"></path>
                            <path d="M16 18h.01"></path>
                        </svg>
                    )
                },
                {
                    label: 'Analytics',
                    path: '/analytics',
                    featureKey: 'analytics',
                    roles: ['staff'],
                    icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="20" x2="18" y2="10"></line>
                            <line x1="12" y1="20" x2="12" y2="4"></line>
                            <line x1="6" y1="20" x2="6" y2="14"></line>
                        </svg>
                    )
                }
            ]
        },
        {
            title: 'MY WORK',
            items: [
                {
                    label: 'My Tasks',
                    path: '/my-tasks',
                    featureKey: 'my_tasks',
                    roles: ['manager', 'staff'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                },
                {
                    label: 'Leave Requests',
                    path: '/leave-requests',
                    featureKey: 'leave_requests',
                    roles: ['manager', 'staff'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7l-8 8-4-4"></path><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path></svg>
                },
                {
                    label: 'My Payslips',
                    path: '/my-payslips',
                    featureKey: 'my_payslips',
                    roles: ['admin', 'manager', 'staff'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="3" y1="10" x2="21" y2="10"></line><path d="M8 15h3"></path><path d="M13 15h3"></path></svg>
                }
            ]
        },
        {
            title: 'MASTER FILES',
            items: [
                {
                    label: 'Client',
                    path: '/clients',
                    featureKey: 'clients',
                    roles: ['admin', 'manager'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
                },
                {
                    label: 'Service',
                    path: '/services',
                    featureKey: 'services',
                    roles: ['admin', 'manager'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                },
                {
                    label: 'Employees',
                    path: '/users',
                    roles: ['admin'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                },
                {
                    label: 'Branch',
                    path: '/branches',
                    roles: ['admin'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                },

            ]
        },
        {
            title: 'TRANSACTION FILES',
            items: [
                {
                    label: 'Project',
                    path: '/projects',
                    featureKey: 'projects',
                    roles: ['admin', 'manager', 'staff'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                },
                {
                    label: 'Payroll',
                    path: '/payroll-management',
                    featureKey: 'payroll',
                    roles: ['admin', 'manager'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                },
                {
                    label: 'Overtime Requests',
                    path: '/overtime-requests',
                    featureKey: 'overtime_requests',
                    roles: ['manager', 'staff', 'admin'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3"></path><circle cx="12" cy="12" r="9"></circle><path d="M19 5l2 2"></path></svg>
                },
                {
                    label: 'Cash Advance',
                    path: '/cash-advance',
                    featureKey: 'cash_advance',
                    roles: ['manager', 'staff', 'admin'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v22"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                },
                {
                    label: 'Payslip Disputes',
                    path: '/payslip-disputes',
                    featureKey: 'payslip_disputes',
                    roles: ['manager', 'staff', 'admin'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15V6a2 2 0 0 0-2-2h-4l-2-2H5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h7"></path><circle cx="18" cy="18" r="3"></circle><line x1="20.2" y1="20.2" x2="22" y2="22"></line></svg>
                },
                {
                    label: 'Approval Inbox',
                    path: '/manager/approval-inbox',
                    featureKey: 'approval_inbox',
                    roles: ['manager'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3 6 12H2"></path></svg>
                },
                {
                    label: 'Profile Edit Request',
                    path: '/edit-requests',
                    featureKey: 'edit_requests',
                    roles: ['admin', 'manager'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>
                },
                {
                    label: 'Leave Approvals',
                    path: '/leave-requests',
                    roles: ['admin'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                },
                {
                    label: 'Documents',
                    path: '/documents',
                    featureKey: 'documents',
                    roles: ['admin', 'manager', 'staff'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                }
            ]
        },
        {
            title: 'SYSTEM',
            items: [
                {
                    label: 'Reports',
                    path: '/reports',
                    roles: ['admin', 'manager'],
                    icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 6h13"></path>
                            <path d="M8 12h13"></path>
                            <path d="M8 18h13"></path>
                            <path d="M3 6h.01"></path>
                            <path d="M3 12h.01"></path>
                            <path d="M3 18h.01"></path>
                        </svg>
                    )
                },
                {
                    label: 'Settings',
                    path: '/settings',
                    roles: ['admin'],
                    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                }
            ]
        }
    ];

    // Filter menu items based on user role
    const filteredSections = menuSections
        .map(section => ({
            ...section,
            items: section.items.filter((item) => {
                if (!normalizedRole || !item.roles.includes(normalizedRole)) {
                    return false;
                }

                return hasRoleFeatureAccess(
                    normalizedRole,
                    (item.featureKey || null) as RoleFeatureKey | null,
                    featureAccess,
                );
            })
        }))
        .filter(section => section.items.length > 0);
    const accessiblePaths = (() => {
        const paths = new Set<string>();
        filteredSections.forEach((section) => {
            section.items.forEach((item) => {
                if (item.path) {
                    paths.add(item.path);
                }
            });
        });
        return Array.from(paths);
    })();
    const accessiblePathsSignature = accessiblePaths.join('|');

    // State for collapsible sections
    const [openSections, setOpenSections] = React.useState<Record<string, boolean>>(getInitialOpenSections);

    const toggleSection = (title: string) => {
        setOpenSections(prev => {
            const newState = { ...prev, [title]: !prev[title] };
            try {
                window.localStorage.setItem('sidebarSectionsState', JSON.stringify(newState));
            } catch {
                // Ignore storage access failures.
            }
            return newState;
        });
    };

    const saveSidebarScroll = React.useCallback(() => {
        if (typeof window === 'undefined') return;

        try {
            window.sessionStorage.setItem(
                sidebarScrollStorageKey,
                String(navRef.current?.scrollTop ?? 0),
            );
        } catch {
            // Ignore storage access failures.
        }
    }, [sidebarScrollStorageKey]);

    const restoreSidebarScroll = React.useCallback(() => {
        if (typeof window === 'undefined' || !navRef.current) return;

        try {
            const savedScrollTop = Number(window.sessionStorage.getItem(sidebarScrollStorageKey) || 0);
            if (!Number.isFinite(savedScrollTop) || savedScrollTop < 0) return;

            navRef.current.scrollTop = savedScrollTop;
        } catch {
            // Ignore storage access failures.
        }
    }, [sidebarScrollStorageKey]);

    React.useEffect(() => {
        restoreSidebarScroll();

        if (typeof window === 'undefined') return;

        const animationFrameId = window.requestAnimationFrame(restoreSidebarScroll);
        return () => {
            window.cancelAnimationFrame(animationFrameId);
        };
    }, [accessiblePathsSignature, currentPath, isCollapsed, openSections, restoreSidebarScroll]);

    React.useEffect(() => {
        router.events.on('routeChangeStart', saveSidebarScroll);

        return () => {
            saveSidebarScroll();
            router.events.off('routeChangeStart', saveSidebarScroll);
        };
    }, [router.events, saveSidebarScroll]);

    const clearLogoPressTimer = React.useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    const startLogoLongPress = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (normalizedRole !== 'admin') return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        clearLogoPressTimer();

        longPressTimerRef.current = setTimeout(() => {
            router.push('/create.admin');
        }, 5000);
    }, [clearLogoPressTimer, normalizedRole, router]);

    const stopLogoLongPress = React.useCallback(() => {
        clearLogoPressTimer();
    }, [clearLogoPressTimer]);

    React.useEffect(() => {
        return () => {
            clearLogoPressTimer();
        };
    }, [clearLogoPressTimer]);

    const handleWarmRoute = React.useCallback((path: string) => {
        if (!path || path === currentPath) return;
        warmRoute(router, path);
    }, [currentPath, router]);

    React.useEffect(() => {
        if (typeof window === 'undefined' || !accessiblePathsSignature) return;

        const routesToWarm = accessiblePathsSignature
            .split('|')
            .filter((path) => path && path !== currentPath);
        if (routesToWarm.length === 0) return;

        const warmAccessibleRoutes = () => {
            warmRoutes(router, routesToWarm);
        };

        if (typeof window.requestIdleCallback === 'function') {
            const idleId = window.requestIdleCallback(() => {
                warmAccessibleRoutes();
            }, { timeout: 1200 });

            return () => {
                window.cancelIdleCallback(idleId);
            };
        }

        const timeoutId = window.setTimeout(() => {
            warmAccessibleRoutes();
        }, 250);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [accessiblePathsSignature, currentPath, router]);

    return (
        <div
            className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : styles.sidebarExpanded} ${mobile ? styles.sidebarMobile : ''} ${mobile && mobileOpen ? styles.sidebarMobileOpen : ''}`}
            aria-hidden={mobile && !mobileOpen}
        >
            <div
                className={styles.logoArea}
                onPointerDown={startLogoLongPress}
                onPointerUp={stopLogoLongPress}
                onPointerLeave={stopLogoLongPress}
                onPointerCancel={stopLogoLongPress}
            >
                <img
                    src={`${assetBasePath}/logo.png`}
                    alt="Logo"
                    className={styles.logoImage}
                    width={46}
                    height={46}
                />
                <span className={styles.logoText}>LLB Accountants</span>
            </div>

            <nav ref={navRef} className={styles.nav} onScroll={saveSidebarScroll}>
                {filteredSections.map((section, sIndex) => {
                    // Check if section should be open. If sidebar is collapsed (minimized), default to closed OR open? 
                    // Usually collapsed sidebar hides headers so hierarchy is flat or icons only.
                    // User request: "dropdown btn".
                    // If sidebar is collapsed (minimized width), we typically confuse users if we hide items inside a hidden category.
                    // So let's force OPEN if collapsed.
                    const isOpen = isCollapsed ? true : (openSections[section.title] ?? true);
                    const sectionItemCountStyle = { '--section-items-count': section.items.length } as React.CSSProperties;

                    return (
                        <div key={sIndex}>
                            <div
                                className={styles.sectionHeader}
                                onClick={() => !isCollapsed && toggleSection(section.title)}
                                style={{
                                    cursor: isCollapsed ? 'default' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                }}
                            >
                                {isCollapsed ? '' : section.title}
                                {!isCollapsed && (
                                    <span style={{ fontSize: '10px', opacity: 0.7, display: 'inline-flex', transition: 'none', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                                        {isOpen ? 'v' : '>'}
                                    </span>
                                )}
                            </div>

                            <div
                                className={`${styles.sectionItems} ${isOpen ? styles.sectionItemsOpen : styles.sectionItemsClosed}`}
                                style={sectionItemCountStyle}
                            >
                                {section.items.map((item, iIndex) => {
                                    const itemIsActive = item.path ? isActive(item.path) : false;
                                    const itemContent = (
                                        <div className={`${styles.navItem} ${styles.sectionButton} ${itemIsActive ? styles.activeNavItem : ''}`}>
                                            <div className={styles.navIcon} style={{ position: 'relative' }}>
                                                {item.icon}
                                            </div>
                                            <span className={styles.navText}>{item.label}</span>
                                        </div>
                                    );

                                    if (item.path) {
                                        return (
                                            <Link
                                                href={item.path}
                                                key={iIndex}
                                                 prefetch={false}
                                                scroll={false}
                                                style={{ textDecoration: 'none' }}
                                                onClick={() => {
                                                     saveSidebarScroll();
                                                     handleWarmRoute(item.path as string);
                                                    onNavigate?.();
                                                }}
                                                onMouseEnter={() => handleWarmRoute(item.path as string)}
                                                onFocus={() => handleWarmRoute(item.path as string)}
                                                onTouchStart={() => handleWarmRoute(item.path as string)}
                                            >
                                                {itemContent}
                                            </Link>
                                        );
                                    }

                                    return null;
                                })}
                            </div>
                        </div>
                    );
                })}
            </nav>
        </div>
    );
}
