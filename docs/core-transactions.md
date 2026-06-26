User Authentication and Session Login
Validates username/password + captcha, checks account status/role, then creates secure session access.
Main: / (login), /api/auth.php, /api/captcha.php, /api/altcha.php

Project and Task Lifecycle Management
Creates/updates projects, assigns tasks/collaborators, tracks progress, and updates task/project status until completion.
Main: /projects, /projects/[id], /my-tasks, /api/projects.php, /api/tasks.php, /api/task-reports.php

Leave Request Workflow
Staff submit leave requests; manager/admin review, approve/reject/archive/restore; comments and status history are recorded.
Main: /leave-requests, /manager/approval-inbox, /api/leave-requests.php, /api/leave-types.php

Overtime Request Workflow
Staff file overtime requests; approvers review and decide; decisions and SLA timing are tracked.
Main: /overtime-requests, /manager/approval-inbox, /api/overtime-requests.php

Attendance Import and Validation
Uploads attendance .xlsx, validates structure/data, flags row issues/anomalies, then stores clean records for payroll use.
Main: /payroll-management (import flow), /manager/payroll-precheck, /api/attendance_import.php, /api/payroll-precheck.php

Payroll Processing and Payslip Publishing
Computes payroll (allowances, deductions, net pay), stores payroll records, updates payroll status, and exposes payslips to employees.
Main: /payroll-management, /my-payslips, /api/payroll.php, /api/payroll_analytics.php

Payslip Dispute Handling
Employees submit disputes; manager/admin review comments/evidence; dispute and related exception status are updated to closure.
Main: /payslip-disputes, /manager/approval-inbox, /api/payslip-disputes.php

Document Management Transaction
Records document entries, document type, status, file location/path, and retrieval/analytics for compliance tracking.
Main: /documents, /api/documents.php

Activity Logging / Audit Trail
Logs critical actions (who/what/when) and before/after changes for traceability and accountability.
Main: /api/activity-logs.php, shared logging in logActivity / logAuditTrail across APIs