-- =====================================================
-- Database Schema for LLB Accountants - Accounting System
-- Complete Implementation Based on ERD Diagram
-- =====================================================
-- This script includes: Schema Creation + Data Migration + Default Data
-- =====================================================

-- Create Database
CREATE DATABASE IF NOT EXISTS llb;
USE llb;

-- =====================================================
-- CORE TABLES: Branches, Roles, Employees, Users
-- =====================================================

-- Branches Table
CREATE TABLE IF NOT EXISTS branches (
    branch_id INT AUTO_INCREMENT PRIMARY KEY,
    branch_name VARCHAR(100) NOT NULL,
    location VARCHAR(255),
    contact_info TEXT,
    manager_id INT NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_branch_name (branch_name),
    INDEX idx_manager (manager_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Roles Table
CREATE TABLE IF NOT EXISTS roles (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    permissions JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_role_name (role_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Employees Table
CREATE TABLE IF NOT EXISTS employees (
    employee_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_date_id VARCHAR(50) UNIQUE,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    date_of_birth DATE,
    email VARCHAR(100) UNIQUE,
    phone_number VARCHAR(20),
    address TEXT,
    position VARCHAR(100),
    hire_date DATE,
    salary DECIMAL(12,2) DEFAULT 0.00,
    status ENUM('active', 'inactive', 'on_leave', 'terminated') DEFAULT 'active',
    branch_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(branch_id) ON DELETE SET NULL,
    INDEX idx_employee_name (first_name, last_name),
    INDEX idx_employee_status (status),
    INDEX idx_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add foreign key for branch manager (after employees table exists)
ALTER TABLE branches 
ADD CONSTRAINT fk_branch_manager 
FOREIGN KEY (manager_id) REFERENCES employees(employee_id) ON DELETE SET NULL;

-- Employee_Role Junction Table
CREATE TABLE IF NOT EXISTS employee_role (
    employee_role_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    role_id INT NOT NULL,
    assigned_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
    UNIQUE KEY unique_employee_role (employee_id, role_id),
    INDEX idx_employee (employee_id),
    INDEX idx_role (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Users Table (Extended)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    role ENUM('admin', 'manager', 'staff') DEFAULT 'staff',
    status ENUM('active', 'inactive', 'suspended', 'locked') DEFAULT 'active',
    employee_id INT NULL,
    branch_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE SET NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(branch_id) ON DELETE SET NULL,
    INDEX idx_username (username),
    INDEX idx_role (role),
    INDEX idx_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- CLIENT & SUPPLIER MANAGEMENT
-- =====================================================

-- Client Table
CREATE TABLE IF NOT EXISTS client (
    client_id INT AUTO_INCREMENT PRIMARY KEY,
    client_name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    address TEXT,
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    registration_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_client_name (client_name),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================
-- FINANCIAL MANAGEMENT
-- =====================================================


-- Projects Table (Extended)
CREATE TABLE IF NOT EXISTS projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    client_id INT,
    manager_id INT,
    created_by INT,
    status ENUM('active', 'completed', 'archived', 'on_hold') DEFAULT 'active',
    start_date DATETIME,
    end_date DATETIME,
    budget DECIMAL(15,2) DEFAULT 0.00,
    actual_cost DECIMAL(15,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES client(client_id) ON DELETE SET NULL,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_project_name (name),
    INDEX idx_status (status),
    INDEX idx_client (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Client Receivables Fines Table
CREATE TABLE IF NOT EXISTS client_receivables_fines (
    fine_id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL,
    fine_amount DECIMAL(15,2) NOT NULL,
    fine_date DATE NOT NULL,
    due_date DATETIME,
    reason TEXT,
    status ENUM('pending', 'paid', 'waived', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES client(client_id) ON DELETE CASCADE,
    INDEX idx_client (client_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- WORK & TASK MANAGEMENT
-- =====================================================

-- Work Table (Enhanced Tasks)
CREATE TABLE IF NOT EXISTS work (
    work_id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT,
    employee_id INT,
    description TEXT,
    start_date DATETIME,
    end_date DATETIME,
    status ENUM('pending', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
    hours_logged DECIMAL(5,2) DEFAULT 0.00,
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_project (project_id),
    INDEX idx_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tasks Table (Keep for backward compatibility)
CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assigned_to INT,
    created_by INT,
    project_id INT,
    status ENUM('pending', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    due_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_status (status),
    INDEX idx_assigned (assigned_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Task Collaborators Table
CREATE TABLE IF NOT EXISTS task_collaborators (
    collaborator_id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    user_id INT NOT NULL,
    shift_mode ENUM('none', 'current_time', 'range') NOT NULL DEFAULT 'none',
    shift_start DATETIME NULL,
    shift_end DATETIME NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_task_collaborator (task_id, user_id),
    INDEX idx_task_collaborators_user (user_id),
    INDEX idx_task_collaborators_shift_start (shift_start),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Activity Logs Table (Enhanced)
CREATE TABLE IF NOT EXISTS activity_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    work_id INT NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    activity_type VARCHAR(50),
    duration INT NULL COMMENT 'Duration in minutes',
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (work_id) REFERENCES work(work_id) ON DELETE SET NULL,
    INDEX idx_user (user_id),
    INDEX idx_action (action),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Checklist Items Table (Enhanced)
CREATE TABLE IF NOT EXISTS checklist_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    description VARCHAR(255) NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    proof_file VARCHAR(255) NULL,
    completed_by INT NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- PAYROLL & HR MANAGEMENT
-- =====================================================

-- Deduction Type Table
CREATE TABLE IF NOT EXISTS deduction_type (
    deduction_type_id INT AUTO_INCREMENT PRIMARY KEY,
    type_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    default_amount DECIMAL(10,2) DEFAULT 0.00,
    threshold_amount DECIMAL(10,2) DEFAULT 0.00,
    threshold_mode ENUM('none','above','below') NOT NULL DEFAULT 'none',
    threshold_rules TEXT NULL,
    base_floor DECIMAL(10,2) DEFAULT 0.00,
    base_cap DECIMAL(10,2) DEFAULT 0.00,
    is_percentage BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Deduction Table
CREATE TABLE IF NOT EXISTS deduction (
    deduction_id INT AUTO_INCREMENT PRIMARY KEY,
    deduction_type_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deduction_type_id) REFERENCES deduction_type(deduction_type_id) ON DELETE CASCADE,
    INDEX idx_type (deduction_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payroll Table 
CREATE TABLE IF NOT EXISTS payroll (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    employee_name VARCHAR(100) NOT NULL,
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    basic_salary DECIMAL(12,2) DEFAULT 0.00,
    overtime_hours DECIMAL(5, 2) DEFAULT 0,
    overtime_rate DECIMAL(10, 2) DEFAULT 0,
    overtime_pay DECIMAL(12,2) DEFAULT 0.00,
    bonus DECIMAL(10, 2) DEFAULT 0,
    tax DECIMAL(10, 2) DEFAULT 0,
    sss_contribution DECIMAL(10, 2) DEFAULT 0,
    pagibig_contribution DECIMAL(10, 2) DEFAULT 0,
    philhealth_contribution DECIMAL(10, 2) DEFAULT 0,
    other_deductions DECIMAL(10, 2) DEFAULT 0,
    gross_pay DECIMAL(12,2) DEFAULT 0.00,
    total_deductions DECIMAL(12,2) DEFAULT 0.00,
    net_pay DECIMAL(12,2) DEFAULT 0.00,
    status ENUM('draft', 'pending', 'approved', 'paid', 'archived') DEFAULT 'draft',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    INDEX idx_employee (employee_id),
    INDEX idx_period (pay_period_start, pay_period_end),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_user_archive (
    archive_id INT AUTO_INCREMENT PRIMARY KEY,
    payroll_id INT NOT NULL,
    user_id INT NOT NULL,
    is_archived TINYINT(1) NOT NULL DEFAULT 0,
    archived_at DATETIME NULL,
    deleted_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_payroll_user_archive (payroll_id, user_id),
    INDEX idx_payroll_user_archive_user (user_id, is_archived, deleted_at),
    CONSTRAINT fk_payroll_user_archive_payroll FOREIGN KEY (payroll_id) REFERENCES payroll(id) ON DELETE CASCADE,
    CONSTRAINT fk_payroll_user_archive_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Leave Request Table
CREATE TABLE IF NOT EXISTS leave_request (
    leave_request_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    leave_type ENUM('sick', 'vacation', 'emergency', 'maternity', 'paternity', 'unpaid') NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status ENUM('pending', 'approved', 'rejected', 'cancelled') DEFAULT 'pending',
    approved_by INT NULL,
    approved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES employees(employee_id) ON DELETE SET NULL,
    INDEX idx_employee (employee_id),
    INDEX idx_status (status),
    INDEX idx_dates (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Leave Request Comment Table
CREATE TABLE IF NOT EXISTS leave_request_comment (
    comment_id INT AUTO_INCREMENT PRIMARY KEY,
    leave_request_id INT NOT NULL,
    user_id INT NOT NULL,
    parent_comment_id INT NULL,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (leave_request_id) REFERENCES leave_request(leave_request_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES leave_request_comment(comment_id) ON DELETE SET NULL,
    INDEX idx_leave_request (leave_request_id),
    INDEX idx_parent_comment (parent_comment_id),
    INDEX idx_comment_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Leave Balance Table
CREATE TABLE IF NOT EXISTS leave_balance (
    leave_balance_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    leave_type ENUM('sick', 'vacation', 'emergency', 'maternity', 'paternity', 'unpaid') NOT NULL,
    total_days DECIMAL(5,2) DEFAULT 0.00,
    used_days DECIMAL(5,2) DEFAULT 0.00,
    remaining_days DECIMAL(5,2) DEFAULT 0.00,
    year INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    UNIQUE KEY unique_employee_leave_year (employee_id, leave_type, year),
    INDEX idx_employee (employee_id),
    INDEX idx_year (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Shift Schedule Table
CREATE TABLE IF NOT EXISTS shift_schedule (
    shift_schedule_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    shift_date DATE NOT NULL,
    shift_start TIME NOT NULL,
    shift_end TIME NOT NULL,
    shift_type ENUM('morning', 'afternoon', 'night', 'flexible') DEFAULT 'morning',
    status ENUM('scheduled', 'completed', 'cancelled', 'no_show') DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    INDEX idx_employee (employee_id),
    INDEX idx_date (shift_date),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Holidays Table
CREATE TABLE IF NOT EXISTS holidays (
    holiday_id INT AUTO_INCREMENT PRIMARY KEY,
    holiday_name VARCHAR(160) NOT NULL,
    holiday_date DATE NOT NULL,
    holiday_type VARCHAR(60) NOT NULL DEFAULT 'Regular Holiday',
    holiday_scope VARCHAR(60) NOT NULL DEFAULT 'National',
    description TEXT NULL,
    source VARCHAR(140) NULL,
    is_system TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT NULL,
    updated_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_holiday_date_name (holiday_date, holiday_name),
    INDEX idx_holiday_date (holiday_date),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- EQUIPMENT & ASSETS
-- =====================================================


-- =====================================================
-- AUDIT & DOCUMENT MANAGEMENT
-- =====================================================

-- Audit Report Table
CREATE TABLE IF NOT EXISTS audit_report (
    report_id INT AUTO_INCREMENT PRIMARY KEY,
    report_title VARCHAR(255) NOT NULL,
    report_date DATE NOT NULL,
    auditor_id INT,
    findings TEXT,
    status ENUM('draft', 'in_review', 'completed', 'archived') DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (auditor_id) REFERENCES employees(employee_id) ON DELETE SET NULL,
    INDEX idx_report_date (report_date),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Document Received Table
CREATE TABLE IF NOT EXISTS document_received (
    document_id INT AUTO_INCREMENT PRIMARY KEY,
    document_name VARCHAR(255) NOT NULL,
    received_date DATE NOT NULL,
    document_type VARCHAR(100),
    status ENUM('received', 'processing', 'completed', 'archived') DEFAULT 'received',
    client_id INT,
    employee_id INT,
    file_path VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES client(client_id) ON DELETE SET NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE SET NULL,
    INDEX idx_received_date (received_date),
    INDEX idx_status (status),
    INDEX idx_client (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Document Submission Table
CREATE TABLE IF NOT EXISTS document_submission (
    submission_id INT AUTO_INCREMENT PRIMARY KEY,
    document_id INT NOT NULL,
    submission_date DATE NOT NULL,
    submitted_by INT,
    status ENUM('pending', 'submitted', 'accepted', 'rejected') DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES document_received(document_id) ON DELETE CASCADE,
    FOREIGN KEY (submitted_by) REFERENCES employees(employee_id) ON DELETE SET NULL,
    INDEX idx_submission_date (submission_date),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- SYSTEM SETTINGS
-- =====================================================

-- Settings Table
CREATE TABLE IF NOT EXISTS settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'string',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Intruder IP Lockout Table
CREATE TABLE IF NOT EXISTS intruder_ip_lockouts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL UNIQUE,
    failed_count INT NOT NULL DEFAULT 0,
    window_start DATETIME NULL,
    blocked_until DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_intruder_blocked_until (blocked_until),
    INDEX idx_intruder_window_start (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chart of Accounts Table
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    account_code VARCHAR(20) NOT NULL UNIQUE,
    account_name VARCHAR(255) NOT NULL,
    account_type ENUM('asset', 'liability', 'equity', 'revenue', 'expense') NOT NULL,
    parent_account_id INT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    INDEX idx_account_code (account_code),
    INDEX idx_account_type (account_type),
    INDEX idx_parent_account (parent_account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- DEFAULT DATA INSERTION
-- =====================================================

-- Insert Default Roles
INSERT INTO roles (role_name, description, permissions) VALUES
('Admin', 'System Administrator with full access', '{"all": true}'),
('Manager', 'Project and team manager', '{"projects": "all", "tasks": "all", "clients": "all", "services": "all", "payroll": "all", "suppliers": "all", "employees": "read", "branches": "read", "analytics": "all", "leave": "all", "attendance": "all", "settings": "denied", "activity_log": "read"}'),
('Staff', 'Staff member with limited access', '{"tasks": "assigned", "documents": "upload", "profile": "own", "leave": "own"}')
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    permissions = VALUES(permissions);

-- Insert Default Deduction Types
INSERT INTO deduction_type (type_name, description, default_amount, threshold_amount, threshold_mode, threshold_rules, base_floor, base_cap, is_percentage) VALUES
('SSS', 'Employee share is 5% of MSC with floor PHP 5000 and cap PHP 35000 (SSS rate 15% total as of Jan 1, 2025).', 5.00, 0.00, 'none', NULL, 5000.00, 35000.00, TRUE),
('PhilHealth', 'Employee share is 2.5% of monthly basic salary with floor PHP 10000 and ceiling PHP 100000 (premium rate 5%).', 2.50, 0.00, 'none', NULL, 10000.00, 100000.00, TRUE),
('Pag-IBIG', 'Employee share is 2% above PHP 1500, with salary base capped at PHP 10000 (max PHP 200).', 2.00, 1500.00, 'above', NULL, 0.00, 10000.00, TRUE),
('Withholding Tax', 'Monthly withholding tax (BIR 2023+ table): 0% up to 20833; 15% over 20833; 20% over 33333; 25% over 66667; 30% over 166667; 35% over 666667.', 0.00, 20833.00, 'below', '[{"mode":"below","amount":20833,"rate":0},{"mode":"above","amount":20833,"rate":15},{"mode":"above","amount":33333,"rate":20},{"mode":"above","amount":66667,"rate":25},{"mode":"above","amount":166667,"rate":30},{"mode":"above","amount":666667,"rate":35}]', 0.00, 0.00, FALSE),
('Late Deduction', 'Deduction for tardiness', 0.00, 0.00, 'none', NULL, 0.00, 0.00, FALSE),
('Absence Deduction', 'Deduction for absences', 0.00, 0.00, 'none', NULL, 0.00, 0.00, FALSE)
ON DUPLICATE KEY UPDATE type_name = type_name;

-- Insert Default Admin User (password: Lolrankgamers123@)
INSERT INTO users (username, password, email, first_name, last_name, role, status) 
VALUES ('admin', '$2y$10$kwBbF7Bagh18guDKeDDe9eK/PC5c8X4jPW93fHu4fO9WfhDzg.1jq', 'kristinedais14@gmail.com', 'System', 'Administrator', 'admin', 'active')
ON DUPLICATE KEY UPDATE username = username;

-- Insert Default Manager User (password: Manager123@)
INSERT INTO users (username, password, email, first_name, last_name, role, status)
VALUES ('manager', '$2y$10$kwBbF7Bagh18guDKeDDe9eK/PC5c8X4jPW93fHu4fO9WfhDzg.1jq', 'manager@lbaccountants.com', 'Default', 'Manager', 'manager', 'active')
ON DUPLICATE KEY UPDATE username = username;

-- Insert Default Staff User (password: Staff123@)
INSERT INTO users (username, password, email, first_name, last_name, role, status)
VALUES ('staff', '$2y$10$kwBbF7Bagh18guDKeDDe9eK/PC5c8X4jPW93fHu4fO9WfhDzg.1jq', 'staff@lbaccountants.com', 'Default', 'Staff', 'staff', 'active')
ON DUPLICATE KEY UPDATE username = username;

-- Insert Default Settings
INSERT INTO settings (setting_key, setting_value, setting_type) VALUES
('company_name', 'LLB Accountants', 'string'),
('company_email', 'info@lbaccountants.com', 'string'),
('timezone', 'Asia/Manila', 'string'),
('date_format', 'Y-m-d', 'string'),
('currency', 'PHP', 'string'),
('tax_rate', '12', 'number'),
('fiscal_year_start', '01-01', 'string'),
('intruder_ip_lockout_enabled', '1', 'boolean'),
('intruder_ip_lockout_threshold', '10', 'number'),
('intruder_ip_lockout_window_hours', '24', 'number'),
('session_timeout_enabled', '1', 'boolean'),
('session_timeout_manager_minutes', '30', 'number'),
('session_timeout_staff_minutes', '30', 'number'),
('captcha_timeout_seconds', '300', 'number'),
('login_failed_attempt_limit', '5', 'number')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

-- Insert Sample Chart of Accounts
INSERT INTO chart_of_accounts (account_code, account_name, account_type, parent_account_id) VALUES
('1000', 'Assets', 'asset', NULL),
('1100', 'Current Assets', 'asset', 1),
('1110', 'Cash', 'asset', 2),
('1120', 'Accounts Receivable', 'asset', 2),
('2000', 'Liabilities', 'liability', NULL),
('2100', 'Current Liabilities', 'liability', 5),
('2110', 'Accounts Payable', 'liability', 6),
('3000', 'Equity', 'equity', NULL),
('4000', 'Revenue', 'revenue', NULL),
('5000', 'Expenses', 'expense', NULL)
ON DUPLICATE KEY UPDATE account_code = account_code;

-- =====================================================
-- DATA MIGRATION (For Existing Databases)
-- =====================================================

-- Create employees from existing users (if they don't exist)
INSERT INTO employees (first_name, last_name, email, position, hire_date, status)
SELECT 
    first_name, 
    last_name, 
    email,
    CASE 
        WHEN role = 'admin' THEN 'Administrator'
        WHEN role = 'manager' THEN 'Manager'
        ELSE 'Staff'
    END as position,
    created_at as hire_date,
    CASE 
        WHEN status = 'active' THEN 'active'
        WHEN status = 'inactive' THEN 'inactive'
        ELSE 'inactive'
    END as status
FROM users
WHERE email IS NOT NULL 
  AND first_name IS NOT NULL 
  AND last_name IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM employees e WHERE e.email = users.email
  );

-- Link users to employees
UPDATE users u
INNER JOIN employees e ON u.email = e.email
SET u.employee_id = e.employee_id
WHERE u.employee_id IS NULL;

-- Create default branch if none exists
INSERT INTO branches (branch_name, location, status)
SELECT 'Main Office', 'Head Office', 'active'
WHERE NOT EXISTS (SELECT 1 FROM branches LIMIT 1);

-- Assign users to default branch
UPDATE users u
SET u.branch_id = (SELECT branch_id FROM branches LIMIT 1)
WHERE u.branch_id IS NULL;

-- Assign employees to default branch
UPDATE employees e
SET e.branch_id = (SELECT branch_id FROM branches LIMIT 1)
WHERE e.branch_id IS NULL;

-- Assign roles to employees based on user role
INSERT INTO employee_role (employee_id, role_id)
SELECT DISTINCT
    e.employee_id,
    r.role_id
FROM employees e
INNER JOIN users u ON e.employee_id = u.employee_id
INNER JOIN roles r ON r.role_name = CASE
    WHEN u.role = 'admin' THEN 'Admin'
    WHEN u.role = 'manager' THEN 'Manager'
    ELSE 'Staff'
END
WHERE NOT EXISTS (
    SELECT 1 FROM employee_role er WHERE er.employee_id = e.employee_id
);

-- Update payroll records to link with employees
UPDATE payroll p
INNER JOIN users u ON p.employee_id = u.id
INNER JOIN employees e ON u.employee_id = e.employee_id
SET p.employee_name = CONCAT(e.first_name, ' ', e.last_name)
WHERE p.employee_name IS NULL OR p.employee_name = '';

-- =====================================================
-- SCHEMA COMPLETE
-- =====================================================
-- Total Tables Created: see sections above
-- - Core: branches, roles, employees, employee_role, users
-- - Clients: client, suppliers
-- - Financial: chart_of_accounts, projects, client_receivables_fines
-- - Work: work, tasks, activity_log, checklist_items
-- - Payroll: deduction_type, deduction, payroll, leave_request, leave_balance, shift_schedule
-- - Assets: equipment
-- - Documents: audit_report, document_received, document_submission
-- - System: settings
-- =====================================================
-- Default Login: admin / Lolrankgamers123@
-- =====================================================

-- =====================================================
-- MERGED UPDATES: User Table Fixes
-- =====================================================
-- Migration: Fix users table for user creation
ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'manager', 'staff') DEFAULT 'staff';
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE NULL AFTER last_name;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo VARCHAR(255) NULL AFTER status;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sss_number VARCHAR(30) NULL AFTER photo;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pagibig_number VARCHAR(30) NULL AFTER sss_number;
ALTER TABLE users ADD COLUMN IF NOT EXISTS philhealth_number VARCHAR(30) NULL AFTER pagibig_number;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tin_number VARCHAR(30) NULL AFTER philhealth_number;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_resume TINYINT(1) NOT NULL DEFAULT 0 AFTER tin_number;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_nbi_clearance TINYINT(1) NOT NULL DEFAULT 0 AFTER document_resume;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_police_clearance TINYINT(1) NOT NULL DEFAULT 0 AFTER document_nbi_clearance;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_barangay_clearance TINYINT(1) NOT NULL DEFAULT 0 AFTER document_police_clearance;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_birth_certificate TINYINT(1) NOT NULL DEFAULT 0 AFTER document_barangay_clearance;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_medical_certificate TINYINT(1) NOT NULL DEFAULT 0 AFTER document_birth_certificate;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_diploma_tor TINYINT(1) NOT NULL DEFAULT 0 AFTER document_medical_certificate;
ALTER TABLE users ADD COLUMN IF NOT EXISTS document_employment_contract TINYINT(1) NOT NULL DEFAULT 0 AFTER document_diploma_tor;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS profile_photo VARCHAR(255) NULL AFTER status;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS sss_number VARCHAR(30) NULL AFTER profile_photo;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pagibig_number VARCHAR(30) NULL AFTER sss_number;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS philhealth_number VARCHAR(30) NULL AFTER pagibig_number;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tin_number VARCHAR(30) NULL AFTER philhealth_number;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS document_resume TINYINT(1) NOT NULL DEFAULT 0 AFTER tin_number;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS document_nbi_clearance TINYINT(1) NOT NULL DEFAULT 0 AFTER document_resume;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS document_police_clearance TINYINT(1) NOT NULL DEFAULT 0 AFTER document_nbi_clearance;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS document_barangay_clearance TINYINT(1) NOT NULL DEFAULT 0 AFTER document_police_clearance;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS document_birth_certificate TINYINT(1) NOT NULL DEFAULT 0 AFTER document_barangay_clearance;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS document_medical_certificate TINYINT(1) NOT NULL DEFAULT 0 AFTER document_birth_certificate;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS document_diploma_tor TINYINT(1) NOT NULL DEFAULT 0 AFTER document_medical_certificate;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS document_employment_contract TINYINT(1) NOT NULL DEFAULT 0 AFTER document_diploma_tor;

-- =====================================================
-- MERGED UPDATES: Service-Based Workflow
-- =====================================================
-- 1. Services Table
CREATE TABLE IF NOT EXISTS services (
    service_id INT AUTO_INCREMENT PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Service Checklists Table
CREATE TABLE IF NOT EXISTS service_checklists (
    checklist_id INT AUTO_INCREMENT PRIMARY KEY,
    service_id INT NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    description TEXT,
    is_required BOOLEAN DEFAULT TRUE,
    is_deleted TINYINT(1) NOT NULL DEFAULT 0,
    deleted_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (service_id) REFERENCES services(service_id) ON DELETE CASCADE,
    INDEX idx_service (service_id),
    INDEX idx_service_deleted (service_id, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Client Services Table
CREATE TABLE IF NOT EXISTS client_services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL,
    service_id INT NOT NULL,
    assigned_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('active', 'inactive') DEFAULT 'active',
    renewal_required TINYINT(1) NOT NULL DEFAULT 0,
    expiry_date DATE NULL,
    last_renewed_at DATE NULL,
    reminder_days_before INT NOT NULL DEFAULT 30,
    renewal_cycle VARCHAR(40) NOT NULL DEFAULT 'none',
    auto_renew_enabled TINYINT(1) NOT NULL DEFAULT 0,
    renewal_notes TEXT NULL,
    change_notes TEXT NULL,
    FOREIGN KEY (client_id) REFERENCES client(client_id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(service_id) ON DELETE CASCADE,
    UNIQUE KEY unique_client_service (client_id, service_id),
    INDEX idx_client (client_id),
    INDEX idx_service (service_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration safety for existing databases
ALTER TABLE service_checklists ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER is_required;
ALTER TABLE service_checklists ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL AFTER is_deleted;

-- 4. Initial Seed Data
INSERT INTO services (service_name, description) VALUES 
('Audit', 'Financial statement auditing and compliance'),
('Tax', 'Tax return preparation and filing'),
('Bookkeeping', 'Daily financial record keeping')
ON DUPLICATE KEY UPDATE service_name = service_name;

INSERT INTO service_checklists (service_id, task_name, description) 
SELECT service_id, 'Review Financial Statements', 'Analyze balance sheet and income statement'
FROM services
WHERE service_name = 'Audit'
  AND NOT EXISTS (
      SELECT 1
      FROM service_checklists sc
      WHERE sc.service_id = services.service_id
        AND sc.task_name = 'Review Financial Statements'
  );

INSERT INTO service_checklists (service_id, task_name, description) 
SELECT service_id, 'Check Compliance', 'Ensure regulatory compliance'
FROM services
WHERE service_name = 'Audit'
  AND NOT EXISTS (
      SELECT 1
      FROM service_checklists sc
      WHERE sc.service_id = services.service_id
        AND sc.task_name = 'Check Compliance'
  );

INSERT INTO service_checklists (service_id, task_name, description) 
SELECT service_id, 'Collect Receipts', 'Gather all expense receipts'
FROM services
WHERE service_name = 'Tax'
  AND NOT EXISTS (
      SELECT 1
      FROM service_checklists sc
      WHERE sc.service_id = services.service_id
        AND sc.task_name = 'Collect Receipts'
  );

INSERT INTO service_checklists (service_id, task_name, description) 
SELECT service_id, 'File Returns', 'Submit tax returns to authorities'
FROM services
WHERE service_name = 'Tax'
  AND NOT EXISTS (
      SELECT 1
      FROM service_checklists sc
      WHERE sc.service_id = services.service_id
        AND sc.task_name = 'File Returns'
  );

INSERT INTO service_checklists (service_id, task_name, description) 
SELECT service_id, 'Record Daily Transactions', 'Log all sales and expenses'
FROM services
WHERE service_name = 'Bookkeeping'
  AND NOT EXISTS (
      SELECT 1
      FROM service_checklists sc
      WHERE sc.service_id = services.service_id
        AND sc.task_name = 'Record Daily Transactions'
  );

INSERT INTO service_checklists (service_id, task_name, description) 
SELECT service_id, 'Reconcile Bank Accounts', 'Match ledger with bank statements'
FROM services
WHERE service_name = 'Bookkeeping'
  AND NOT EXISTS (
      SELECT 1
      FROM service_checklists sc
      WHERE sc.service_id = services.service_id
        AND sc.task_name = 'Reconcile Bank Accounts'
  );

-- =====================================================
-- MERGED UPDATES: Consolidated Migrations
-- =====================================================

-- User authentication / reset columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_request_count INT DEFAULT 0 AFTER updated_at;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_request_window_start DATETIME NULL AFTER reset_request_count;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(64) NULL AFTER reset_request_window_start;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires DATETIME NULL AFTER reset_token_hash;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_reset_password TINYINT(1) NOT NULL DEFAULT 0 AFTER reset_token_expires;

-- Payroll enhancements used by attendance import, payroll analytics, and cash advance workflows
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS clothing_allowance DECIMAL(10,2) DEFAULT 0 AFTER bonus;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS travel_allowance DECIMAL(10,2) DEFAULT 0 AFTER clothing_allowance;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS salary_adjustment DECIMAL(10,2) DEFAULT 0 AFTER travel_allowance;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS late_deduction DECIMAL(10,2) DEFAULT 0 AFTER salary_adjustment;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS absence_deduction DECIMAL(10,2) DEFAULT 0 AFTER late_deduction;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS cash_advance_deduction DECIMAL(10,2) DEFAULT 0 AFTER philhealth_contribution;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS cash_advance_manual_deduction DECIMAL(10,2) DEFAULT 0 AFTER cash_advance_deduction;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS laptop_loan_deduction DECIMAL(10,2) DEFAULT 0 AFTER cash_advance_manual_deduction;

UPDATE payroll
SET cash_advance_manual_deduction = cash_advance_deduction
WHERE COALESCE(cash_advance_manual_deduction, 0) = 0
  AND COALESCE(cash_advance_deduction, 0) <> 0;

-- Attendance imports
CREATE TABLE IF NOT EXISTS attendance_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    days_worked DECIMAL(5,2) DEFAULT 0,
    overtime_hours DECIMAL(5,2) DEFAULT 0,
    late_minutes INT DEFAULT 0,
    absent_days DECIMAL(5,2) DEFAULT 0,
    leave_days DECIMAL(5,2) DEFAULT 0,
    import_batch_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    INDEX idx_employee (employee_id),
    INDEX idx_period (pay_period_start, pay_period_end),
    INDEX idx_batch (import_batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Project chat
CREATE TABLE IF NOT EXISTS project_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    sender_id INT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_project (project_id),
    INDEX idx_sender (sender_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Task completion reports
CREATE TABLE IF NOT EXISTS task_completion_reports (
    report_id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    project_id INT NULL,
    client_id INT NULL,
    report_body TEXT NOT NULL,
    sent_by INT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_task_completion_report_task (task_id),
    INDEX idx_task_completion_report_project (project_id),
    INDEX idx_task_completion_report_client (client_id),
    INDEX idx_task_completion_report_sender (sent_by),
    CONSTRAINT fk_task_completion_report_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_completion_report_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    CONSTRAINT fk_task_completion_report_client FOREIGN KEY (client_id) REFERENCES client(client_id) ON DELETE SET NULL,
    CONSTRAINT fk_task_completion_report_sender FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Request throttling storage
CREATE TABLE IF NOT EXISTS request_rate_limits (
    client_key VARCHAR(64) NOT NULL PRIMARY KEY,
    request_count INT NOT NULL DEFAULT 0,
    window_start DATETIME NOT NULL,
    last_request_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_request_rate_limits_last_request_at (last_request_at),
    INDEX idx_request_rate_limits_window_start (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cash advance request workflow
CREATE TABLE IF NOT EXISTS cash_advance_request (
    cash_advance_request_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    request_date DATE NOT NULL,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    status ENUM('submitted', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'submitted',
    sla_due_at DATETIME NULL,
    approved_by INT NULL,
    approved_at DATETIME NULL,
    manager_notes TEXT NULL,
    deducted_payroll_id INT NULL,
    deducted_at DATETIME NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cash_adv_employee (employee_id),
    INDEX idx_cash_adv_status (status),
    INDEX idx_cash_adv_request_date (request_date),
    INDEX idx_cash_adv_sla (sla_due_at),
    INDEX idx_cash_adv_payroll (deducted_payroll_id),
    CONSTRAINT fk_cash_adv_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    CONSTRAINT fk_cash_adv_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cash_adv_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_cash_adv_payroll FOREIGN KEY (deducted_payroll_id) REFERENCES payroll(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default settings introduced by later migrations
INSERT INTO settings (setting_key, setting_value, setting_type) VALUES
('admin_dashboard_access_pin', '1433', 'string'),
('lockout_enabled', '1', 'boolean'),
('lockout_threshold_manager', '3', 'number'),
('lockout_threshold_staff', '3', 'number'),
('lockout_window_hours', '24', 'number'),
('rate_limit_enabled', '1', 'boolean'),
('rate_limit_max_requests', '180', 'number'),
('rate_limit_window_seconds', '60', 'number')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

-- Ensure role permissions match the current RBAC expectations
UPDATE users SET role = 'staff' WHERE role = 'user';
UPDATE roles SET permissions = '{"all": true}' WHERE role_name = 'Admin';
UPDATE roles
SET permissions = '{"projects": "all", "tasks": "all", "clients": "all", "services": "all", "payroll": "all", "suppliers": "all", "employees": "read", "branches": "read", "analytics": "all", "leave": "all", "attendance": "all", "settings": "denied", "activity_log": "read"}'
WHERE role_name = 'Manager';
UPDATE roles
SET description = 'Staff member with limited access',
    permissions = '{"tasks": "assigned", "documents": "upload", "profile": "own", "leave": "own"}'
WHERE role_name = 'Staff';

-- Safe unique index for user first + last name combinations
SET @dup_count := (
    SELECT COUNT(*)
    FROM (
        SELECT LOWER(TRIM(first_name)) AS first_name_key,
               LOWER(TRIM(last_name)) AS last_name_key
        FROM users
        WHERE first_name IS NOT NULL
          AND last_name IS NOT NULL
        GROUP BY LOWER(TRIM(first_name)), LOWER(TRIM(last_name))
        HAVING COUNT(*) > 1
    ) AS dup_rows
);

SET @idx_exists := (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'users'
      AND index_name = 'uniq_users_first_last_name'
);

SET @sql := IF(
    @idx_exists > 0,
    'SELECT ''Index uniq_users_first_last_name already exists.'' AS message',
    IF(
        @dup_count > 0,
        'SELECT ''Duplicate first_name + last_name rows found. Clean duplicates before adding unique index.'' AS message',
        'ALTER TABLE users ADD UNIQUE KEY uniq_users_first_last_name (first_name, last_name)'
    )
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
