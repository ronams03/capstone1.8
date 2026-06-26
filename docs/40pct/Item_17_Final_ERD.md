# Item 17 - Final ERD (Consistent with Current Implementation)

Source of truth used:
- `database/Capstone1.sql`

```mermaid
erDiagram
    BRANCHES {
        int branch_id PK
        string branch_name
        int manager_id FK
    }

    ROLES {
        int role_id PK
        string role_name
    }

    EMPLOYEES {
        int employee_id PK
        string first_name
        string last_name
        int branch_id FK
    }

    EMPLOYEE_ROLE {
        int employee_role_id PK
        int employee_id FK
        int role_id FK
    }

    USERS {
        int id PK
        string username
        string role
        int employee_id FK
        int branch_id FK
    }

    CLIENT {
        int client_id PK
        string client_name
        string status
    }

    PROJECTS {
        int id PK
        string name
        int client_id FK
        int manager_id FK
        int created_by FK
    }

    TASKS {
        int id PK
        string title
        int project_id FK
        int assigned_to FK
        int created_by FK
    }

    TASK_COLLABORATORS {
        int collaborator_id PK
        int task_id FK
        int user_id FK
        int created_by FK
    }

    ACTIVITY_LOG {
        int id PK
        int user_id FK
        string action
    }

    PAYROLL {
        int id PK
        int employee_id FK
        date pay_period_start
        date pay_period_end
        decimal net_pay
    }

    LEAVE_REQUEST {
        int leave_request_id PK
        int employee_id FK
        int approved_by FK
        string status
    }

    LEAVE_REQUEST_COMMENT {
        int comment_id PK
        int leave_request_id FK
        int user_id FK
        int parent_comment_id FK
    }

    SHIFT_SCHEDULE {
        int shift_schedule_id PK
        int employee_id FK
        date shift_date
    }

    SERVICES {
        int service_id PK
        string service_name
    }

    SERVICE_CHECKLISTS {
        int checklist_id PK
        int service_id FK
        string task_name
    }

    CLIENT_SERVICES {
        int id PK
        int client_id FK
        int service_id FK
    }

    BILLING {
        int billing_id PK
        int client_id FK
        int project_id FK
    }

    PAYMENT {
        int payment_id PK
        int invoice_id FK
        int client_id FK
        int employee_id FK
    }

    BRANCHES ||--o{ EMPLOYEES : "branch_id"
    EMPLOYEES o|--o{ BRANCHES : "manager_id"

    EMPLOYEES ||--o{ EMPLOYEE_ROLE : "employee_id"
    ROLES ||--o{ EMPLOYEE_ROLE : "role_id"

    EMPLOYEES o|--o{ USERS : "employee_id"
    BRANCHES o|--o{ USERS : "branch_id"

    CLIENT ||--o{ PROJECTS : "client_id"
    USERS o|--o{ PROJECTS : "manager_id"
    USERS o|--o{ PROJECTS : "created_by"

    PROJECTS ||--o{ TASKS : "project_id"
    USERS o|--o{ TASKS : "assigned_to"
    USERS o|--o{ TASKS : "created_by"

    TASKS ||--o{ TASK_COLLABORATORS : "task_id"
    USERS ||--o{ TASK_COLLABORATORS : "user_id"
    USERS o|--o{ TASK_COLLABORATORS : "created_by"

    USERS o|--o{ ACTIVITY_LOG : "user_id"

    EMPLOYEES ||--o{ PAYROLL : "employee_id"
    EMPLOYEES ||--o{ LEAVE_REQUEST : "employee_id"
    EMPLOYEES o|--o{ LEAVE_REQUEST : "approved_by"
    LEAVE_REQUEST ||--o{ LEAVE_REQUEST_COMMENT : "leave_request_id"
    USERS ||--o{ LEAVE_REQUEST_COMMENT : "user_id"
    EMPLOYEES ||--o{ SHIFT_SCHEDULE : "employee_id"

    SERVICES ||--o{ SERVICE_CHECKLISTS : "service_id"
    CLIENT ||--o{ CLIENT_SERVICES : "client_id"
    SERVICES ||--o{ CLIENT_SERVICES : "service_id"

    CLIENT ||--o{ BILLING : "client_id"
    PROJECTS ||--o{ BILLING : "project_id"
    BILLING ||--o{ PAYMENT : "invoice_id"
    CLIENT ||--o{ PAYMENT : "client_id"
    EMPLOYEES ||--o{ PAYMENT : "employee_id"
```

## Notes for Panel

- The ERD above focuses on the modules used in the 40 percent completion checklist.
- All relationship lines are mapped from existing foreign keys in `database/Capstone1.sql`.
