import type { ReactElement } from 'react';
import CrudActionIcon from './CrudActionIcon';

export type SettingsSection =
    | 'profile'
    | 'account-lockout'
    | 'session-timeout'
    | 'math-captcha'
    | 'data-deletion'
    | 'intruder-ip-lockout'
    | 'system-backup'
    | 'pagination'
    | 'deduction-types'
    | 'leave-management'
    | 'privacy-policy'
    | 'rate-limiting'
    | 'password-policy'
    | 'logs-management';

export type SettingsNavItem = {
    id: SettingsSection;
    label: string;
    path: string;
    introTitle: string;
    introText: string;
    icon: ReactElement;
};

export const settingsNavItems: SettingsNavItem[] = [
    {
        id: 'profile',
        label: 'Admin Profile',
        path: '/settings',
        introTitle: 'Admin Profile & Security',
        introText: 'Update account identity, manage Google Authenticator pairing, and control password changes from this workspace.',
        icon: <CrudActionIcon action="view" size={15} />,
    },
    {
        id: 'account-lockout',
        label: 'Account Lockout',
        path: '/settings/account-lockout',
        introTitle: 'Account Lockout',
        introText: 'Adjust automated lockout thresholds and review locked user accounts without leaving the admin settings workspace.',
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
        ),
    },
    {
        id: 'session-timeout',
        label: 'Session Timeout',
        path: '/settings/session-timeout',
        introTitle: 'Session Timeout',
        introText: 'Configure inactivity expiry rules for manager and staff sessions.',
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
            </svg>
        ),
    },
    {
        id: 'math-captcha',
        label: 'Captcha Management',
        path: '/settings/math-captcha',
        introTitle: 'Captcha Management',
        introText: 'Control the login captcha, expiry timing, and failed attempt limit before the account is locked.',
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" ry="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="11" y2="12" />
                <line x1="13" y1="12" x2="17" y2="12" />
                <line x1="7" y1="16" x2="11" y2="16" />
                <line x1="13" y1="16" x2="17" y2="16" />
            </svg>
        ),
    },
    {
        id: 'data-deletion',
        label: 'Data Deletion',
        path: '/settings/data-deletion',
        introTitle: 'Data Deletion',
        introText: 'Permanently remove archived records from a contained admin panel instead of navigating away.',
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4h6v2" />
            </svg>
        ),
    },
    {
        id: 'intruder-ip-lockout',
        label: 'Browser Lockout',
        path: '/settings/intruder-ip-lockout',
        introTitle: 'Browser Lockout',
        introText: 'Monitor blocked browsers and adjust intruder lockout rules from the same settings screen.',
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12h6" />
                <path d="M12 9v6" />
            </svg>
        ),
    },
    {
        id: 'system-backup',
        label: 'System Backup',
        path: '/settings/system-backup',
        introTitle: 'System Backup',
        introText: 'Create backups, review history, and manage backup schedules inside this current settings page.',
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
        ),
    },
    {
        id: 'pagination',
        label: 'Pagination',
        path: '/settings/pagination',
        introTitle: 'Pagination',
        introText: 'Set system table sizing defaults without opening a separate page.',
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" ry="2" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="9" y1="10" x2="9" y2="20" />
            </svg>
        ),
    },
    {
        id: 'deduction-types',
        label: 'Deduction Type',
        path: '/settings/deduction-types',
        introTitle: 'Deduction Type',
        introText: 'Manage payroll deduction definitions in a dedicated settings page.',
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
        ),
    },
    {
        id: 'leave-management',
        label: 'Leave Management',
        path: '/settings/leave-management',
        introTitle: 'Leave Management',
        introText: 'Open leave type management in the current page and keep the settings navigation visible.',
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 8v13H3V8" />
                <path d="M1 3h22v5H1z" />
                <path d="M10 12h4" />
                <path d="M12 10v4" />
            </svg>
        ),
    },
    {
        id: 'privacy-policy',
        label: 'Privacy Policy',
        path: '/settings/privacy-policy',
        introTitle: 'Privacy Policy',
        introText: 'Edit and publish the privacy policy while staying inside the admin settings workspace.',
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16v16H4z" />
                <path d="M8 8h8" />
                <path d="M8 12h8" />
                <path d="M8 16h5" />
            </svg>
        ),
    },

    {
        id: 'password-policy',
        label: 'Password Policy',
        path: '/settings/password-policy',
        introTitle: 'Password Expiration & History',
        introText: 'Force password changes on a schedule and prevent reuse of recent passwords for every user.',
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12h6" />
                <path d="M12 9v6" />
                <path d="M8 16l-1 4 4-2 4 2-1-4" />
            </svg>
        ),
    },
    {
        id: 'rate-limiting',
        label: 'Rate Limiting',
        path: '/settings/rate-limiting',
        introTitle: 'Rate Limiting',
        introText: 'Throttle API requests per browser or network to reduce abusive spikes and DDoS-style floods.',
        icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20V10" />
                <path d="M18.4 5.6A9 9 0 1 1 5 19.1" />
                <path d="M12 4v2" />
            </svg>
        ),
    },
];
