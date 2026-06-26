Create a logical ERD for an Accounting and HR Management System named "LLB Accountants". Use crow's foot notation. Show primary keys as PK and foreign keys as FK. Include attributes inside each entity. Group related entities by module: Core Administration, Clients and Services, Projects and Tasks, Payroll and HR, Documents and Audit, and System Support. Use one-to-many relationships unless otherwise stated. Include standalone tables even if they have no foreign keys.

Entities and attributes:

1. BRANCHES
- branch_id PK
- branch_name
- location
- contact_info
- manager_id FK -> EMPLOYEES.employee_id
- status
- created_at
- updated_at

2. ROLES
- role_id PK
- role_name
- description
- permissions
- created_at
- updated_at

3. EMPLOYEES
- employee_id PK
- employee_date_id
- first_name
- last_name
- date_of_birth
- email
- phone_number
- address
- position
- hire_date
- salary
- status
- branch_id FK -> BRANCHES.branch_id
- profile_photo
- sss_number
- pagibig_number
- philhealth_number
- tin_number
- document_resume
- document_nbi_clearance
- document_police_clearance
- document_barangay_clearance
- document_birth_certificate
- document_medical_certificate
- document_diploma_tor
- document_employment_contract
- created_at
- updated_at

4. EMPLOYEE_ROLE
- employee_role_id PK
- employee_id FK -> EMPLOYEES.employee_id
- role_id FK -> ROLES.role_id
- assigned_date

5. USERS
- id PK
- username
- password
- email
- first_name
- last_name
- role
- status
- employee_id FK -> EMPLOYEES.employee_id
- branch_id FK -> BRANCHES.branch_id
- last_login
- reset_request_count
- reset_request_window_start
- reset_token_hash
- reset_token_expires
- must_reset_password
- date_of_birth
- photo
- sss_number
- pagibig_number
- philhealth_number
- tin_number
- document_resume
- document_nbi_clearance
- document_police_clearance
- document_barangay_clearance
- document_birth_certificate
- document_medical_certificate
- document_diploma_tor
- document_employment_contract
- created_at
- updated_at

6. CLIENT
- client_id PK
- client_name
- contact_person
- email
- phone
- address
- status
- registration_date
- created_at
- updated_at

7. SERVICES
- service_id PK
- service_name
- description
- created_at
- updated_at

8. SERVICE_CHECKLISTS
- checklist_id PK
- service_id FK -> SERVICES.service_id
- task_name
- description
- is_required
- is_deleted
- deleted_at
- created_at
- updated_at

9. CLIENT_SERVICES
- id PK
- client_id FK -> CLIENT.client_id
- service_id FK -> SERVICES.service_id
- assigned_date
- status
- renewal_required
- expiry_date
- last_renewed_at
- reminder_days_before
- renewal_cycle
- auto_renew_enabled
- renewal_notes
- change_notes

10. PROJECTS
- id PK
- name
- description
- client_id FK -> CLIENT.client_id
- manager_id FK -> USERS.id
- created_by FK -> USERS.id
- status
- start_date
- end_date
- budget
- actual_cost
- created_at
- updated_at

11. WORK
- work_id PK
- project_id FK -> PROJECTS.id
- employee_id FK -> EMPLOYEES.employee_id
- description
- start_date
- end_date
- status
- hours_logged
- priority
- created_at
- updated_at

12. TASKS
- id PK
- title
- description
- assigned_to FK -> USERS.id
- created_by FK -> USERS.id
- project_id FK -> PROJECTS.id
- status
- priority
- due_date
- created_at
- updated_at

13. TASK_COLLABORATORS
- collaborator_id PK
- task_id FK -> TASKS.id
- user_id FK -> USERS.id
- shift_mode
- shift_start
- shift_end
- created_by FK -> USERS.id
- created_at
- updated_at

14. CHECKLIST_ITEMS
- id PK
- task_id FK -> TASKS.id
- description
- is_completed
- proof_file
- completed_by FK -> USERS.id
- completed_at
- created_at

15. PROJECT_MESSAGES
- id PK
- project_id FK -> PROJECTS.id
- sender_id FK -> USERS.id
- message
- created_at

16. TASK_COMPLETION_REPORTS
- report_id PK
- task_id FK -> TASKS.id
- project_id FK -> PROJECTS.id
- client_id FK -> CLIENT.client_id
- report_body
- sent_by FK -> USERS.id
- sent_at
- created_at

17. ACTIVITY_LOG
- id PK
- user_id FK -> USERS.id
- work_id FK -> WORK.work_id
- action
- description
- activity_type
- duration
- ip_address
- created_at

18. CLIENT_RECEIVABLES_FINES
- fine_id PK
- client_id FK -> CLIENT.client_id
- fine_amount
- fine_date
- due_date
- reason
- status
- created_at
- updated_at

19. DEDUCTION_TYPE
- deduction_type_id PK
- type_name
- description
- default_amount
- threshold_amount
- threshold_mode
- threshold_rules
- base_floor
- base_cap
- is_percentage
- is_active
- created_at
- updated_at

20. DEDUCTION
- deduction_id PK
- deduction_type_id FK -> DEDUCTION_TYPE.deduction_type_id
- amount
- description
- created_at

21. PAYROLL
- id PK
- employee_id FK -> EMPLOYEES.employee_id
- employee_name
- pay_period_start
- pay_period_end
- basic_salary
- overtime_hours
- overtime_rate
- overtime_pay
- bonus
- clothing_allowance
- travel_allowance
- salary_adjustment
- tax
- sss_contribution
- pagibig_contribution
- philhealth_contribution
- cash_advance_deduction
- cash_advance_manual_deduction
- laptop_loan_deduction
- late_deduction
- absence_deduction
- other_deductions
- gross_pay
- total_deductions
- net_pay
- status
- notes
- created_at
- updated_at

22. PAYROLL_USER_ARCHIVE
- archive_id PK
- payroll_id FK -> PAYROLL.id
- user_id FK -> USERS.id
- is_archived
- archived_at
- deleted_at
- created_at
- updated_at

23. ATTENDANCE_RECORDS
- id PK
- employee_id FK -> EMPLOYEES.employee_id
- pay_period_start
- pay_period_end
- days_worked
- overtime_hours
- late_minutes
- absent_days
- leave_days
- import_batch_id
- created_at

24. LEAVE_REQUEST
- leave_request_id PK
- employee_id FK -> EMPLOYEES.employee_id
- leave_type
- start_date
- end_date
- reason
- status
- approved_by FK -> EMPLOYEES.employee_id
- approved_at
- created_at
- updated_at

25. LEAVE_REQUEST_COMMENT
- comment_id PK
- leave_request_id FK -> LEAVE_REQUEST.leave_request_id
- user_id FK -> USERS.id
- parent_comment_id FK -> LEAVE_REQUEST_COMMENT.comment_id
- comment_text
- created_at
- updated_at

26. LEAVE_BALANCE
- leave_balance_id PK
- employee_id FK -> EMPLOYEES.employee_id
- leave_type
- total_days
- used_days
- remaining_days
- year
- created_at
- updated_at

27. SHIFT_SCHEDULE
- shift_schedule_id PK
- employee_id FK -> EMPLOYEES.employee_id
- shift_date
- shift_start
- shift_end
- shift_type
- status
- notes
- created_at
- updated_at

28. HOLIDAYS
- holiday_id PK
- holiday_name
- holiday_date
- holiday_type
- holiday_scope
- description
- source
- is_system
- created_by FK -> USERS.id
- updated_by FK -> USERS.id
- created_at
- updated_at

29. CASH_ADVANCE_REQUEST
- cash_advance_request_id PK
- employee_id FK -> EMPLOYEES.employee_id
- request_date
- amount
- reason
- status
- sla_due_at
- approved_by FK -> USERS.id
- approved_at
- manager_notes
- deducted_payroll_id FK -> PAYROLL.id
- deducted_at
- created_by FK -> USERS.id
- created_at
- updated_at

30. AUDIT_REPORT
- report_id PK
- report_title
- report_date
- auditor_id FK -> EMPLOYEES.employee_id
- findings
- status
- created_at
- updated_at

31. DOCUMENT_RECEIVED
- document_id PK
- document_name
- received_date
- document_type
- status
- client_id FK -> CLIENT.client_id
- employee_id FK -> EMPLOYEES.employee_id
- file_path
- notes
- created_at
- updated_at

32. DOCUMENT_SUBMISSION
- submission_id PK
- document_id FK -> DOCUMENT_RECEIVED.document_id
- submission_date
- submitted_by FK -> EMPLOYEES.employee_id
- status
- notes
- created_at
- updated_at

33. SETTINGS
- id PK
- setting_key
- setting_value
- setting_type
- created_at
- updated_at

34. INTRUDER_IP_LOCKOUTS
- id PK
- ip_address
- failed_count
- window_start
- blocked_until
- created_at
- updated_at

35. REQUEST_RATE_LIMITS
- client_key PK
- request_count
- window_start
- last_request_at
- created_at
- updated_at

36. CHART_OF_ACCOUNTS
- id PK
- account_code
- account_name
- account_type
- parent_account_id FK -> CHART_OF_ACCOUNTS.id
- is_active
- created_at
- updated_at

37. PROFILE_EDIT_REQUEST
- request_id PK
- user_id FK -> USERS.id
- employee_id FK -> EMPLOYEES.employee_id
- requested_by FK -> USERS.id
- request_reason
- request_snapshot_json
- status
- approved_by FK -> USERS.id
- approved_at
- access_granted_until
- used_at
- used_by FK -> USERS.id
- updated_fields_json
- archived_at
- archived_by FK -> USERS.id
- created_at
- updated_at

38. AI_NOTIFICATIONS
- id PK
- event_type
- target_user_id
- target_role
- ai_message
- icon_emoji
- priority_score
- suggested_action
- action_url
- context_json
- is_sent
- sent_at
- read_at
- expires_at
- source
- user_rating
- was_action_taken
- dismissed
- created_at
- updated_at

Relationships:

- BRANCHES 1-to-many EMPLOYEES via branch_id
- EMPLOYEES 0-or-1 to many BRANCHES as manager via manager_id
- EMPLOYEES 1-to-many EMPLOYEE_ROLE
- ROLES 1-to-many EMPLOYEE_ROLE
- EMPLOYEES 1-to-many USERS via employee_id
- BRANCHES 1-to-many USERS via branch_id
- CLIENT 1-to-many PROJECTS
- USERS 1-to-many PROJECTS as manager
- USERS 1-to-many PROJECTS as creator
- PROJECTS 1-to-many WORK
- EMPLOYEES 1-to-many WORK
- PROJECTS 1-to-many TASKS
- USERS 1-to-many TASKS as assignee
- USERS 1-to-many TASKS as creator
- TASKS 1-to-many TASK_COLLABORATORS
- USERS 1-to-many TASK_COLLABORATORS
- TASKS 1-to-many CHECKLIST_ITEMS
- USERS 1-to-many CHECKLIST_ITEMS as completer
- PROJECTS 1-to-many PROJECT_MESSAGES
- USERS 1-to-many PROJECT_MESSAGES as sender
- TASKS 1-to-1 TASK_COMPLETION_REPORTS
- PROJECTS 1-to-many TASK_COMPLETION_REPORTS
- CLIENT 1-to-many TASK_COMPLETION_REPORTS
- USERS 1-to-many TASK_COMPLETION_REPORTS as sender
- USERS 1-to-many ACTIVITY_LOG
- WORK 1-to-many ACTIVITY_LOG
- CLIENT 1-to-many CLIENT_RECEIVABLES_FINES
- DEDUCTION_TYPE 1-to-many DEDUCTION
- EMPLOYEES 1-to-many PAYROLL
- PAYROLL 1-to-many PAYROLL_USER_ARCHIVE
- USERS 1-to-many PAYROLL_USER_ARCHIVE
- EMPLOYEES 1-to-many ATTENDANCE_RECORDS
- EMPLOYEES 1-to-many LEAVE_REQUEST as requester
- EMPLOYEES 1-to-many LEAVE_REQUEST as approver
- LEAVE_REQUEST 1-to-many LEAVE_REQUEST_COMMENT
- LEAVE_REQUEST_COMMENT 1-to-many LEAVE_REQUEST_COMMENT as threaded replies
- USERS 1-to-many LEAVE_REQUEST_COMMENT
- EMPLOYEES 1-to-many LEAVE_BALANCE
- EMPLOYEES 1-to-many SHIFT_SCHEDULE
- USERS 1-to-many HOLIDAYS as creator
- USERS 1-to-many HOLIDAYS as updater
- EMPLOYEES 1-to-many CASH_ADVANCE_REQUEST
- USERS 1-to-many CASH_ADVANCE_REQUEST as creator
- USERS 1-to-many CASH_ADVANCE_REQUEST as approver
- PAYROLL 1-to-many CASH_ADVANCE_REQUEST
- EMPLOYEES 1-to-many AUDIT_REPORT
- CLIENT 1-to-many DOCUMENT_RECEIVED
- EMPLOYEES 1-to-many DOCUMENT_RECEIVED
- DOCUMENT_RECEIVED 1-to-many DOCUMENT_SUBMISSION
- EMPLOYEES 1-to-many DOCUMENT_SUBMISSION
- CHART_OF_ACCOUNTS 1-to-many CHART_OF_ACCOUNTS via parent_account_id
- SERVICES 1-to-many SERVICE_CHECKLISTS
- CLIENT 1-to-many CLIENT_SERVICES
- SERVICES 1-to-many CLIENT_SERVICES
- USERS 1-to-many PROFILE_EDIT_REQUEST as target user
- EMPLOYEES 1-to-many PROFILE_EDIT_REQUEST
- USERS 1-to-many PROFILE_EDIT_REQUEST as requester
- USERS 1-to-many PROFILE_EDIT_REQUEST as approver
- USERS 1-to-many PROFILE_EDIT_REQUEST as user who used access
- USERS 1-to-many PROFILE_EDIT_REQUEST as archiver

Layout instructions:
- Place Core Administration tables on the top-left.
- Place Client, Services, and Project tables in the center.
- Place Payroll and HR tables on the right.
- Place Documents and Audit tables at the bottom-left.
- Place standalone system tables at the bottom-right.
- Keep junction tables between their parent entities.
- Use clear crow's foot connectors and avoid crossing lines when possible.
