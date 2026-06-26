# Item 16 - Database Relationships 


 1.) User and Access Relationships

- `branches.branch_id` -> `users.branch_id`
- `employees.employee_id` -> `users.employee_id`
- `employees.employee_id` ->  `employee_role.employee_id`
- `roles.role_id` -> `employee_role.role_id`
- `branches.manager_id` -> `employees.employee_id`

Talk track:
"This is our identity chain. Branch links to employees and users. Employee-role is a junction table, so one employee can have one or more role records if needed."


References:
- `database - Capstone1.sql - line (59)`
- `database - Capstone1.sql - line (99)`
- `database - Capstone1.sql - line (98)`
- `database - Capstone1.sql - line (76)`
- `database - Capstone1.sql - line (77)`
- `database - Capstone1.sql - line (68)`



 2.) Project and Task Relationships 

- `client.client_id` -> `projects.client_id`
- `projects.id` -> `tasks.project_id`
- `users.id` -> `tasks.assigned_to`
- `users.id` -> `tasks.created_by`
- `tasks.id` -> `task_collaborators.task_id`
- `users.id` -> `task_collaborators.user_id`

Talk track:
"This is our core operational flow. Clients own projects, projects contain tasks, and each task is assigned to users. We also support many collaborators per task using the `task_collaborators` table."

References:
- `database - Capstone1.sql - line (146)`
- `database - Capstone1.sql - line (252)`
- `database - Capstone1.sql - line (250)`
- `database - Capstone1.sql - line (251)`
- `database - Capstone1.sql - line (271)`
- `database - Capstone1.sql - line (272)`

3.)Payroll and HR Relationships

- `employees.employee_id` -> `payroll.employee_id`
- `employees.employee_id` -> `leave_request.employee_id`
- `employees.employee_id` -> `leave_request.approved_by`
- `leave_request.leave_request_id` -> `leave_request_comment.leave_request_id`
- `users.id` -> `leave_request_comment.user_id`
- `employees.employee_id` -> `shift_schedule.employee_id`

Talk track:
"Payroll, leave, and shift scheduling all connect back to the employee master record. This ensures one source of truth for workforce data across HR modules."

References:
- `database - Capstone1.sql - line (360)`
- `database - Capstone1.sql - line (379)`
- `database - Capstone1.sql - line (380)`
- `database - Capstone1.sql - line (395)`
- `database - Capstone1.sql - line (396)`
- `database - Capstone1.sql - line (432)`

4.) Service Workflow Relationships 

- `services.service_id` -> `service_checklists.service_id`
- `client.client_id` -> `client_services.client_id`
- `services.service_id` -> `client_services.service_id`

Talk track:
"Services are reusable templates. A client can be linked to multiple services, and each service has checklist definitions."

References:
- `database - Capstone1.sql - line (752)`
- `database - Capstone1.sql - line (764)`
- `database - Capstone1.sql - line (765)`

5.) Integrity and Validation Statement 

"Referential integrity is enforced by foreign keys with `ON DELETE CASCADE` or `ON DELETE SET NULL` depending on data retention needs. API endpoints validate required fields before insert or update, and role checks protect restricted operations."

Evidence for this statement:
- `database - Capstone1.sql - line (59)` (`ON DELETE SET NULL`)
- `database - Capstone1.sql - line (68)` (`ON DELETE SET NULL`)
- `database - Capstone1.sql - line (99)` (`ON DELETE SET NULL`)
- `database - Capstone1.sql - line (146)` (`ON DELETE SET NULL`)
- `database - Capstone1.sql - line (250)` (`ON DELETE SET NULL`)
- `database - Capstone1.sql - line (76)` (`ON DELETE CASCADE`)
- `database - Capstone1.sql - line (252)` (`ON DELETE CASCADE`)
- `database - Capstone1.sql - line (271)` (`ON DELETE CASCADE`)
- `database - Capstone1.sql - line (360)` (`ON DELETE CASCADE`)
- `database - Capstone1.sql - line (395)` (`ON DELETE CASCADE`)
- `database - Capstone1.sql - line (752)` (`ON DELETE CASCADE`)
- `database - Capstone1.sql - line (764)` (`ON DELETE CASCADE`)
- `api - config.php - line (119)` (required-field validation helper)
- `api - projects.php - line (232)` (required-field validation usage)
- `api - tasks.php - line (587)` (required-field validation usage)
- `api - payroll.php - line (174)` (required-field validation usage)
- `api - utils.php - line (896)` (RBAC helper function)
- `api - utils.php - line (910)` (RBAC helper function)
- `api - projects.php - line (22)` (RBAC enforcement)
- `api - tasks.php - line (23)` (RBAC enforcement)

6.) Quick SQL Snippets for Live Demo

```sql
-- project to task
SELECT p.id AS project_id, p.name, t.id AS task_id, t.title
FROM projects p
LEFT JOIN tasks t ON t.project_id = p.id
ORDER BY p.id, t.id;
```

```sql
-- payroll to employees
SELECT e.employee_id, CONCAT(e.first_name, ' ', e.last_name) AS employee_name, pr.id AS payroll_id, pr.net_pay
FROM employees e
LEFT JOIN payroll pr ON pr.employee_id = e.employee_id
ORDER BY e.employee_id, pr.id;
```
