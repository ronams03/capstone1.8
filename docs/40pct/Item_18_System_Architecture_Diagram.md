# Item 18 - System Architecture Diagram

This architecture matches the current project stack:
- Frontend: Next.js (React, TypeScript)
- Backend: PHP API endpoints (`/api/*.php`)
- Database: MySQL (`llb`)
- Storage: local uploads folder
- External: SMTP mail service

```mermaid
flowchart LR
    U[User Browser]

    subgraph FE[Frontend Layer]
        N1[Next.js Pages]
        N2[React Components]
        N3[Client-side Fetch with credentials include]
    end

    subgraph BE[Backend API Layer - PHP]
        A0[config.php + utils.php]
        A1[auth.php]
        A2[projects.php]
        A3[tasks.php]
        A4[payroll.php]
        A5[attendance_import.php]
        A6[leave-requests.php]
        A7[overtime-requests.php]
        A8[payslip-disputes.php]
    end

    subgraph SEC[Security and Access Control]
        S1[PHP Session Cookie]
        S2[requireAuth requireRole requireMinRole]
        S3[Password Hashing Bcrypt]
        S4[Intruder Browser Lockout]
    end

    subgraph DATA[Data Layer]
        D1[(MySQL llb Database)]
        D2[(uploads/ local file storage)]
    end

    subgraph EXT[External Services]
        E1[SMTP Mail Provider]
    end

    U --> N1
    N1 --> N2
    N2 --> N3
    N3 --> A1
    N3 --> A2
    N3 --> A3
    N3 --> A4
    N3 --> A5
    N3 --> A6
    N3 --> A7
    N3 --> A8

    A1 --> A0
    A2 --> A0
    A3 --> A0
    A4 --> A0
    A5 --> A0
    A6 --> A0
    A7 --> A0
    A8 --> A0

    A0 --> S1
    A0 --> S2
    A0 --> S3
    A0 --> S4

    A1 --> D1
    A2 --> D1
    A3 --> D1
    A4 --> D1
    A5 --> D1
    A6 --> D1
    A7 --> D1
    A8 --> D1

    A3 --> D2
    A5 --> D2
    A1 --> E1
```

## End-to-End Transaction Path Example

1. User logs in from browser on Next.js login page.
2. Frontend calls `api/auth.php?action=login` with session credentials.
3. Backend validates captcha, password hash, and role, then opens session.
4. User submits data in module form (for example payroll or task).
5. Frontend calls target API endpoint (`payroll.php`, `tasks.php`, etc.).
6. Backend validates input, enforces RBAC, writes to MySQL, logs activity, and returns JSON response.
7. Frontend refreshes table/list and displays updated output.

## End-to-End Functional Flowchart (Assumed Fully Functional)

```mermaid
flowchart TD
    START([Start]) --> OPEN[User opens system]
    OPEN --> LOGIN[Login page]
    LOGIN --> SUBMIT[Submit username password and captcha]
    SUBMIT --> AUTH_API[auth.php login]
    AUTH_API --> CAPTCHA_OK{Captcha valid}
    CAPTCHA_OK -- No --> CAPTCHA_ERR[Show captcha error]
    CAPTCHA_ERR --> LOGIN
    CAPTCHA_OK -- Yes --> CRED_OK{Credentials and account status valid}
    CRED_OK -- No --> LOGIN_ERR[Show login error or lockout message]
    LOGIN_ERR --> LOGIN
    CRED_OK -- Yes --> SESSION[Create session and role context]
    SESSION --> ROLE{Route by role}

    ROLE --> ADMIN_DASH[Admin dashboard]
    ROLE --> MANAGER_DASH[Manager dashboard]
    ROLE --> STAFF_DASH[Staff dashboard]

    ADMIN_DASH --> NAV{Select module}
    MANAGER_DASH --> NAV
    STAFF_DASH --> NAV

    NAV --> PROJECT_FLOW
    NAV --> HR_APPROVAL_FLOW
    NAV --> PAYROLL_FLOW
    NAV --> DISPUTE_FLOW
    NAV --> DOC_FLOW
    NAV --> ANALYTICS_FLOW
    NAV --> SETTINGS_FLOW

    subgraph PROJECT_FLOW[Project and Task Workflow]
        P1[Create or update project]
        P2[Assign manager and team]
        P3[Create tasks and collaborators]
        P4[Staff executes task]
        P5[Upload task proof files]
        P6[Manager or admin review]
        P7{Task approved}
        P8[Update task and project status]
        P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> P7
        P7 -- No --> P4
        P7 -- Yes --> P8
    end

    subgraph HR_APPROVAL_FLOW[Leave and Overtime Workflow]
        H1[Staff submits leave or overtime request]
        H2[Request stored as pending]
        H3[Manager approval inbox]
        H4{Approve or reject}
        H5[Update request status]
        H6[Notify requestor]
        H1 --> H2 --> H3 --> H4 --> H5 --> H6
    end

    subgraph PAYROLL_FLOW[Attendance to Payroll Workflow]
        Y1[Import attendance xlsx]
        Y2[Validate and parse rows]
        Y3[Store attendance records]
        Y4[Run payroll precheck anomalies]
        Y5[Manager resolves anomalies]
        Y6[Compute payroll draft]
        Y7[Update deductions allowances and status]
        Y8[Publish payslip]
        Y9[Staff views payslip]
        Y1 --> Y2 --> Y3 --> Y4 --> Y5 --> Y6 --> Y7 --> Y8 --> Y9
    end

    subgraph DISPUTE_FLOW[Payslip Dispute Workflow]
        D1[Staff files payslip dispute]
        D2[Dispute queue for manager or admin]
        D3[Review comments and evidence]
        D4{Resolved}
        D5[Update payroll and dispute status]
        D6[Notify employee]
        D1 --> D2 --> D3 --> D4
        D4 -- No --> D3
        D4 -- Yes --> D5 --> D6
    end

    subgraph DOC_FLOW[Document Management Workflow]
        F1[Upload or update document metadata]
        F2[Store file in uploads]
        F3[Store record in database]
        F1 --> F2 --> F3
    end

    subgraph ANALYTICS_FLOW[Analytics and Monitoring]
        A1[Aggregate operational payroll and request data]
        A2[Render dashboards charts and KPIs]
        A1 --> A2
    end

    subgraph SETTINGS_FLOW[Security and Admin Settings]
        S1[Update lockout and system settings]
        S2[Update admin profile and password]
        S3[Backup and data deletion controls]
        S1 --> S2 --> S3
    end

    P8 --> DB[(MySQL llb)]
    H5 --> DB
    Y3 --> DB
    Y7 --> DB
    D5 --> DB
    F3 --> DB
    A1 --> DB
    S3 --> DB

    F2 --> UP[(uploads storage)]
    H6 --> SMTP[SMTP email notifications]
    Y8 --> SMTP
    D6 --> SMTP

    NAV --> LOGOUT[Logout]
    LOGOUT --> END([End session])
```
