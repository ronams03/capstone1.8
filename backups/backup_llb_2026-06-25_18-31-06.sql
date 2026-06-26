-- LLB Accountants System Backup
-- Database: llb
-- Generated: 2026-06-25 18:31:06
-- =====================================================

SET FOREIGN_KEY_CHECKS=0;
SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';
SET NAMES utf8mb4;

-- -----------------------------------------------
-- Table: `active_user_sessions`
-- -----------------------------------------------
DROP TABLE IF EXISTS `active_user_sessions`;
CREATE TABLE `active_user_sessions` (
  `user_id` int(11) NOT NULL,
  `session_id` varchar(128) NOT NULL,
  `role` varchar(20) NOT NULL,
  `last_seen` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`),
  KEY `idx_active_user_last_seen` (`last_seen`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `active_user_sessions` VALUES ('1', 'mujakrkvpsjtpt4c1gqao0f4ep', 'admin', '2026-06-25 18:31:06', '2026-06-25 18:28:59', '2026-06-25 18:31:06');

-- -----------------------------------------------
-- Table: `activity_log`
-- -----------------------------------------------
DROP TABLE IF EXISTS `activity_log`;
CREATE TABLE `activity_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `work_id` int(11) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `activity_type` varchar(50) DEFAULT NULL,
  `duration` int(11) DEFAULT NULL COMMENT 'Duration in minutes',
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `work_id` (`work_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_action` (`action`),
  KEY `idx_created` (`created_at`),
  CONSTRAINT `activity_log_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `activity_log_ibfk_2` FOREIGN KEY (`work_id`) REFERENCES `work` (`work_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `activity_log` VALUES ('1', '1', NULL, 'login', 'User logged in', 'authentication', NULL, '::1', '2026-06-18 06:47:53');
INSERT INTO `activity_log` VALUES ('2', '1', NULL, 'logout', 'User logged out', 'authentication', NULL, '::1', '2026-06-18 07:27:07');
INSERT INTO `activity_log` VALUES ('3', '1', NULL, 'post_auth_login_precheck', 'Credentials verified. Server security check is in progress.', 'auth', NULL, '::1', '2026-06-18 07:27:11');
INSERT INTO `activity_log` VALUES ('4', '1', NULL, 'login', 'User logged in', 'authentication', NULL, '::1', '2026-06-18 07:30:03');
INSERT INTO `activity_log` VALUES ('5', '1', NULL, 'login', 'User logged in', 'authentication', NULL, '::1', '2026-06-18 14:40:05');
INSERT INTO `activity_log` VALUES ('6', '1', NULL, 'post_auth_login_precheck', 'Credentials verified. Server security check is in progress.', 'auth', NULL, '::1', '2026-06-18 15:50:35');
INSERT INTO `activity_log` VALUES ('7', '1', NULL, 'login', 'User logged in', 'authentication', NULL, '::1', '2026-06-18 15:50:36');
INSERT INTO `activity_log` VALUES ('8', '1', NULL, 'reject_profile_edit_request', 'Rejected profile edit request #4 for Nina Garcia.', 'profile', NULL, '::1', '2026-06-18 16:24:36');
INSERT INTO `activity_log` VALUES ('9', '1', NULL, 'put_edit_requests', 'Archived requests cannot be approved.', 'edit_requests', NULL, '::1', '2026-06-18 16:24:47');
INSERT INTO `activity_log` VALUES ('10', '1', NULL, 'approve_profile_edit_access', 'Approved profile edit access request #8 for Patricia Villanueva.', 'profile', NULL, '::1', '2026-06-18 16:24:49');
INSERT INTO `activity_log` VALUES ('11', '1', NULL, 'put_edit_requests', 'Archived requests cannot be approved.', 'edit_requests', NULL, '::1', '2026-06-18 16:25:25');
INSERT INTO `activity_log` VALUES ('12', '1', NULL, 'archive_profile_edit_request', 'Archived profile edit request #3 for Carlo Dela Cruz.', 'profile', NULL, '::1', '2026-06-18 18:48:09');
INSERT INTO `activity_log` VALUES ('13', '1', NULL, 'archive_profile_edit_request', 'Archived profile edit request #10 for Eliza Flores.', 'profile', NULL, '::1', '2026-06-18 18:48:11');
INSERT INTO `activity_log` VALUES ('14', '1', NULL, 'archive_profile_edit_request', 'Archived profile edit request #7 for Diego Cruz.', 'profile', NULL, '::1', '2026-06-18 18:48:12');
INSERT INTO `activity_log` VALUES ('15', '1', NULL, 'archive_profile_edit_request', 'Archived profile edit request #5 for Rafael Torres.', 'profile', NULL, '::1', '2026-06-18 18:48:13');
INSERT INTO `activity_log` VALUES ('16', '1', NULL, 'revoke_profile_edit_access', 'Revoked profile edit access request #8 for Patricia Villanueva.', 'profile', NULL, '::1', '2026-06-18 18:48:13');
INSERT INTO `activity_log` VALUES ('17', '1', NULL, 'put_edit_requests', 'This request is already archived.', 'edit_requests', NULL, '::1', '2026-06-18 18:48:14');
INSERT INTO `activity_log` VALUES ('18', '1', NULL, 'put_edit_requests', 'This request is already archived.', 'edit_requests', NULL, '::1', '2026-06-18 18:48:15');
INSERT INTO `activity_log` VALUES ('19', '1', NULL, 'revoke_profile_edit_access', 'Revoked profile edit access request #9 for Gabriel Ramos.', 'profile', NULL, '::1', '2026-06-18 18:48:18');
INSERT INTO `activity_log` VALUES ('20', '1', NULL, 'revoke_profile_edit_access', 'Revoked profile edit access request #6 for Sofia Mendoza.', 'profile', NULL, '::1', '2026-06-18 18:48:19');
INSERT INTO `activity_log` VALUES ('21', '1', NULL, 'revoke_profile_edit_access', 'Revoked profile edit access request #2 for Angela Reyes.', 'profile', NULL, '::1', '2026-06-18 18:48:20');
INSERT INTO `activity_log` VALUES ('22', '1', NULL, 'leave_comment', 'Added a comment to leave request ID: 4 (employee ID: 7)', 'leave_management', NULL, '::1', '2026-06-19 14:09:52');
INSERT INTO `activity_log` VALUES ('23', '1', NULL, 'cancel_leave', 'Cancelled leave request ID: 4', 'leave_management', NULL, '::1', '2026-06-19 14:10:07');
INSERT INTO `activity_log` VALUES ('24', '1', NULL, 'update_password_policy', 'Updated password expiration and history policy', 'settings', NULL, '::1', '2026-06-19 16:31:21');
INSERT INTO `activity_log` VALUES ('25', '1', NULL, 'update_password_policy', 'Updated password expiration and history policy', 'settings', NULL, '::1', '2026-06-19 16:38:37');
INSERT INTO `activity_log` VALUES ('26', '1', NULL, 'login', 'User logged in', 'authentication', NULL, '::1', '2026-06-20 08:21:27');
INSERT INTO `activity_log` VALUES ('27', '1', NULL, 'approve_leave', 'Leave request archived: 7', 'leave_management', NULL, '::1', '2026-06-20 08:22:17');
INSERT INTO `activity_log` VALUES ('28', '1', NULL, 'login', 'User logged in', 'authentication', NULL, '::1', '2026-06-24 12:16:19');
INSERT INTO `activity_log` VALUES ('29', '1', NULL, 'logout', 'User logged out', 'authentication', NULL, '::1', '2026-06-24 12:16:30');
INSERT INTO `activity_log` VALUES ('30', '1', NULL, 'login', 'User logged in', 'authentication', NULL, '::1', '2026-06-24 12:48:34');
INSERT INTO `activity_log` VALUES ('31', '1', NULL, 'browser_lockout_unblocked', 'Admin unblocked browser lockout: sid_3ol2sa3egigmk4agk261f3694c', 'security', NULL, '::1', '2026-06-24 12:48:45');
INSERT INTO `activity_log` VALUES ('32', '1', NULL, 'logout', 'User logged out', 'authentication', NULL, '::1', '2026-06-24 12:48:48');
INSERT INTO `activity_log` VALUES ('33', '1', NULL, 'login', 'User logged in', 'authentication', NULL, '::1', '2026-06-25 18:28:59');
INSERT INTO `activity_log` VALUES ('34', '1', NULL, 'delete_backup', 'Deleted backup: backup_llb_2026-05-05_15-21-42.sql', 'backup', NULL, '::1', '2026-06-25 18:30:35');
INSERT INTO `activity_log` VALUES ('35', '1', NULL, 'update_backup_schedule', 'Updated backup schedule: daily', 'backup', NULL, '::1', '2026-06-25 18:30:59');

-- -----------------------------------------------
-- Table: `ai_notifications`
-- -----------------------------------------------
DROP TABLE IF EXISTS `ai_notifications`;
CREATE TABLE `ai_notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `event_type` varchar(50) NOT NULL COMMENT 'Type of event that triggered this',
  `target_user_id` int(11) NOT NULL COMMENT 'User ID who should receive this',
  `target_role` enum('admin','manager','staff') NOT NULL COMMENT 'Role of target user',
  `ai_message` text NOT NULL COMMENT 'AI-generated notification message',
  `icon_emoji` varchar(10) DEFAULT '?' COMMENT 'Icon for notification',
  `priority_score` int(11) DEFAULT 5 COMMENT 'Priority score 1-10 (10 is most urgent)',
  `suggested_action` varchar(255) DEFAULT NULL COMMENT 'Suggested action for user',
  `action_url` varchar(500) DEFAULT NULL COMMENT 'URL to navigate to for action',
  `context_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Raw context data as JSON' CHECK (json_valid(`context_json`)),
  `is_sent` tinyint(1) DEFAULT 0 COMMENT 'Whether notification has been delivered',
  `sent_at` timestamp NULL DEFAULT NULL COMMENT 'When notification was sent',
  `read_at` timestamp NULL DEFAULT NULL COMMENT 'When user read it',
  `expires_at` timestamp NULL DEFAULT NULL COMMENT 'When notification should be removed',
  `source` enum('base44_ai','fallback','manual') DEFAULT 'base44_ai' COMMENT 'Source of notification',
  `user_rating` int(11) DEFAULT NULL COMMENT 'User rating 1-5',
  `was_action_taken` tinyint(1) DEFAULT 0 COMMENT 'Did user take suggested action',
  `dismissed` tinyint(1) DEFAULT 0 COMMENT 'Whether user dismissed it',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_target_user` (`target_user_id`,`is_sent`,`created_at`),
  KEY `idx_event_type` (`event_type`,`created_at`),
  KEY `idx_target_role` (`target_role`,`created_at`),
  KEY `idx_priority` (`priority_score`,`created_at`),
  KEY `idx_expires` (`expires_at`),
  KEY `idx_is_sent` (`is_sent`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI-generated smart notifications';

-- -----------------------------------------------
-- Table: `approval_sla_config`
-- -----------------------------------------------
DROP TABLE IF EXISTS `approval_sla_config`;
CREATE TABLE `approval_sla_config` (
  `item_key` varchar(50) NOT NULL,
  `sla_hours` int(11) NOT NULL DEFAULT 48,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`item_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `approval_sla_config` VALUES ('cash_advance', '24', '2026-06-18 06:48:04');
INSERT INTO `approval_sla_config` VALUES ('leave', '48', '2026-06-18 06:48:04');
INSERT INTO `approval_sla_config` VALUES ('overtime', '24', '2026-06-18 06:48:04');
INSERT INTO `approval_sla_config` VALUES ('payslip_dispute', '72', '2026-06-18 06:48:04');

-- -----------------------------------------------
-- Table: `attendance_records`
-- -----------------------------------------------
DROP TABLE IF EXISTS `attendance_records`;
CREATE TABLE `attendance_records` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `pay_period_start` date NOT NULL,
  `pay_period_end` date NOT NULL,
  `days_worked` decimal(5,2) DEFAULT 0.00,
  `overtime_hours` decimal(5,2) DEFAULT 0.00,
  `late_minutes` int(11) DEFAULT 0,
  `absent_days` decimal(5,2) DEFAULT 0.00,
  `leave_days` decimal(5,2) DEFAULT 0.00,
  `import_batch_id` varchar(50) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_employee` (`employee_id`),
  KEY `idx_period` (`pay_period_start`,`pay_period_end`),
  KEY `idx_batch` (`import_batch_id`),
  CONSTRAINT `attendance_records_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `audit_report`
-- -----------------------------------------------
DROP TABLE IF EXISTS `audit_report`;
CREATE TABLE `audit_report` (
  `report_id` int(11) NOT NULL AUTO_INCREMENT,
  `report_title` varchar(255) NOT NULL,
  `report_date` date NOT NULL,
  `auditor_id` int(11) DEFAULT NULL,
  `findings` text DEFAULT NULL,
  `status` enum('draft','in_review','completed','archived') DEFAULT 'draft',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`report_id`),
  KEY `auditor_id` (`auditor_id`),
  KEY `idx_report_date` (`report_date`),
  KEY `idx_status` (`status`),
  CONSTRAINT `audit_report_ibfk_1` FOREIGN KEY (`auditor_id`) REFERENCES `employees` (`employee_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `audit_trail`
-- -----------------------------------------------
DROP TABLE IF EXISTS `audit_trail`;
CREATE TABLE `audit_trail` (
  `audit_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `entity_type` varchar(80) NOT NULL,
  `entity_id` varchar(120) NOT NULL,
  `action` varchar(50) NOT NULL,
  `before_values` longtext DEFAULT NULL,
  `after_values` longtext DEFAULT NULL,
  `changed_fields` text DEFAULT NULL,
  `source_endpoint` varchar(120) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`audit_id`),
  KEY `idx_audit_entity` (`entity_type`,`entity_id`),
  KEY `idx_audit_user` (`user_id`),
  KEY `idx_audit_action` (`action`),
  KEY `idx_audit_created` (`created_at`),
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `audit_trail` VALUES ('1', '1', 'leave_request', '4', 'cancel', '{\"leave_request_id\":4,\"status\":\"pending\",\"employee_id\":7,\"leave_type\":\"vacation\",\"start_date\":\"2026-06-25\",\"end_date\":\"2026-06-27\"}', '{\"status\":\"cancelled\"}', 'employee_id,end_date,leave_request_id,leave_type,start_date,status', 'leave-requests.php', '::1', '2026-06-19 14:10:07');
INSERT INTO `audit_trail` VALUES ('2', '1', 'leave_request', '7', 'update_status', '{\"leave_request_id\":7,\"employee_id\":10,\"leave_type\":\"emergency\",\"start_date\":\"2026-06-22\",\"end_date\":\"2026-06-22\",\"status\":\"pending\"}', '{\"leave_request_id\":7,\"employee_id\":10,\"leave_type\":\"emergency\",\"start_date\":\"2026-06-22\",\"end_date\":\"2026-06-22\",\"status\":\"rejected\"}', 'status', 'leave-requests.php', '::1', '2026-06-20 08:22:18');

-- -----------------------------------------------
-- Table: `branches`
-- -----------------------------------------------
DROP TABLE IF EXISTS `branches`;
CREATE TABLE `branches` (
  `branch_id` int(11) NOT NULL AUTO_INCREMENT,
  `branch_name` varchar(100) NOT NULL,
  `location` varchar(255) DEFAULT NULL,
  `contact_info` text DEFAULT NULL,
  `manager_id` int(11) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`branch_id`),
  KEY `idx_branch_name` (`branch_name`),
  KEY `idx_manager` (`manager_id`),
  CONSTRAINT `fk_branch_manager` FOREIGN KEY (`manager_id`) REFERENCES `employees` (`employee_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `branches` VALUES ('1', 'Main Office', 'Head Office', NULL, NULL, 'active', '2026-06-18 06:45:56', '2026-06-18 06:45:56');
INSERT INTO `branches` VALUES ('2', 'Makati Branch', 'Makati CBD, Metro Manila', 'makati@lbaccountants.com | (02) 8888-1001', '1', 'active', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `branches` VALUES ('3', 'Quezon City Branch', 'Quezon Avenue, Quezon City', 'qc@lbaccountants.com | (02) 8888-1002', '1', 'active', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `branches` VALUES ('4', 'Cebu Branch', 'Cebu Business Park, Cebu City', 'cebu@lbaccountants.com | (032) 234-1003', '1', 'active', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `branches` VALUES ('5', 'Davao Branch', 'San Pedro Street, Davao City', 'davao@lbaccountants.com | (082) 221-1004', '1', 'active', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `branches` VALUES ('6', 'Iloilo Branch', 'Mandurriao, Iloilo City', 'iloilo@lbaccountants.com | (033) 320-1005', '1', 'active', '2026-06-18 15:03:33', '2026-06-18 15:03:33');

-- -----------------------------------------------
-- Table: `cash_advance_request`
-- -----------------------------------------------
DROP TABLE IF EXISTS `cash_advance_request`;
CREATE TABLE `cash_advance_request` (
  `cash_advance_request_id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `request_date` date NOT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `reason` text NOT NULL,
  `status` enum('submitted','approved','rejected','cancelled') NOT NULL DEFAULT 'submitted',
  `sla_due_at` datetime DEFAULT NULL,
  `approved_by` int(11) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `manager_notes` text DEFAULT NULL,
  `deducted_payroll_id` int(11) DEFAULT NULL,
  `deducted_at` datetime DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `archived_at` datetime DEFAULT NULL,
  `archived_by` int(11) DEFAULT NULL,
  PRIMARY KEY (`cash_advance_request_id`),
  KEY `idx_cash_adv_employee` (`employee_id`),
  KEY `idx_cash_adv_status` (`status`),
  KEY `idx_cash_adv_request_date` (`request_date`),
  KEY `idx_cash_adv_sla` (`sla_due_at`),
  KEY `idx_cash_adv_payroll` (`deducted_payroll_id`),
  KEY `idx_cash_adv_archived` (`is_archived`),
  KEY `fk_cash_adv_created_by` (`created_by`),
  KEY `fk_cash_adv_approved_by` (`approved_by`),
  KEY `fk_cash_adv_archived_by` (`archived_by`),
  KEY `idx_cash_adv_status_payroll` (`status`,`deducted_payroll_id`),
  CONSTRAINT `fk_cash_adv_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cash_adv_archived_by` FOREIGN KEY (`archived_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cash_adv_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cash_adv_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cash_adv_payroll` FOREIGN KEY (`deducted_payroll_id`) REFERENCES `payroll` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `cash_advance_request` VALUES ('1', '4', '2026-06-01', '8000.00', 'Emergency medical expense advance.', 'approved', '2026-06-03 00:00:00', '5', '2026-06-02 00:00:00', 'Approved and scheduled for payroll deduction.', '1', '2026-06-03 00:00:00', '4', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `cash_advance_request` VALUES ('2', '5', '2026-06-02', '12000.00', 'Travel advance for client audit site visit.', 'approved', '2026-06-04 00:00:00', '4', '2026-06-03 00:00:00', 'Approved for travel expenses.', '2', '2026-06-04 00:00:00', '5', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `cash_advance_request` VALUES ('3', '6', '2026-06-03', '5000.00', 'Office supplies reimbursement advance.', 'submitted', '2026-06-05 00:00:00', NULL, NULL, NULL, NULL, NULL, '6', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `cash_advance_request` VALUES ('4', '7', '2026-06-04', '7000.00', 'Family emergency cash assistance.', 'approved', '2026-06-06 00:00:00', '6', '2026-06-05 00:00:00', 'Approved with payroll deduction.', '4', '2026-06-06 00:00:00', '7', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `cash_advance_request` VALUES ('5', '8', '2026-06-05', '15000.00', 'Laptop repair advance.', 'rejected', '2026-06-07 00:00:00', '5', '2026-06-06 00:00:00', 'Please route through asset support.', NULL, NULL, '8', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `cash_advance_request` VALUES ('6', '9', '2026-06-06', '6000.00', 'Transportation advance for client visit.', 'approved', '2026-06-08 00:00:00', '4', '2026-06-07 00:00:00', 'Approved.', '6', '2026-06-08 00:00:00', '9', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `cash_advance_request` VALUES ('7', '10', '2026-06-07', '4000.00', 'Petty cash replenishment.', 'submitted', '2026-06-09 00:00:00', NULL, NULL, NULL, NULL, NULL, '10', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `cash_advance_request` VALUES ('8', '11', '2026-06-08', '9000.00', 'Audit fieldwork transportation.', 'approved', '2026-06-10 00:00:00', '5', '2026-06-09 00:00:00', 'Approved.', '8', '2026-06-10 00:00:00', '11', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `cash_advance_request` VALUES ('9', '12', '2026-06-09', '20000.00', 'Tax filing support travel advance.', 'rejected', '2026-06-11 00:00:00', '4', '2026-06-10 00:00:00', 'Amount requires finance review.', NULL, NULL, '12', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `cash_advance_request` VALUES ('10', '13', '2026-06-10', '3000.00', 'Administrative errands advance.', 'approved', '2026-06-12 00:00:00', '6', '2026-06-11 00:00:00', 'Approved.', '10', '2026-06-12 00:00:00', '13', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);

-- -----------------------------------------------
-- Table: `chart_of_accounts`
-- -----------------------------------------------
DROP TABLE IF EXISTS `chart_of_accounts`;
CREATE TABLE `chart_of_accounts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `account_code` varchar(20) NOT NULL,
  `account_name` varchar(255) NOT NULL,
  `account_type` enum('asset','liability','equity','revenue','expense') NOT NULL,
  `parent_account_id` int(11) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `account_code` (`account_code`),
  KEY `idx_account_code` (`account_code`),
  KEY `idx_account_type` (`account_type`),
  KEY `idx_parent_account` (`parent_account_id`),
  CONSTRAINT `chart_of_accounts_ibfk_1` FOREIGN KEY (`parent_account_id`) REFERENCES `chart_of_accounts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `chart_of_accounts` VALUES ('1', '1000', 'Assets', 'asset', NULL, '1', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `chart_of_accounts` VALUES ('2', '1100', 'Current Assets', 'asset', '1', '1', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `chart_of_accounts` VALUES ('3', '1110', 'Cash', 'asset', '2', '1', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `chart_of_accounts` VALUES ('4', '1120', 'Accounts Receivable', 'asset', '2', '1', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `chart_of_accounts` VALUES ('5', '2000', 'Liabilities', 'liability', NULL, '1', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `chart_of_accounts` VALUES ('6', '2100', 'Current Liabilities', 'liability', '5', '1', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `chart_of_accounts` VALUES ('7', '2110', 'Accounts Payable', 'liability', '6', '1', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `chart_of_accounts` VALUES ('8', '3000', 'Equity', 'equity', NULL, '1', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `chart_of_accounts` VALUES ('9', '4000', 'Revenue', 'revenue', NULL, '1', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `chart_of_accounts` VALUES ('10', '5000', 'Expenses', 'expense', NULL, '1', '2026-06-18 06:45:55', '2026-06-18 06:45:55');

-- -----------------------------------------------
-- Table: `checklist_items`
-- -----------------------------------------------
DROP TABLE IF EXISTS `checklist_items`;
CREATE TABLE `checklist_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `task_id` int(11) NOT NULL,
  `description` varchar(255) NOT NULL,
  `is_completed` tinyint(1) DEFAULT 0,
  `proof_file` varchar(255) DEFAULT NULL,
  `completed_by` int(11) DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `completed_by` (`completed_by`),
  KEY `idx_task` (`task_id`),
  CONSTRAINT `checklist_items_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `checklist_items_ibfk_2` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `client`
-- -----------------------------------------------
DROP TABLE IF EXISTS `client`;
CREATE TABLE `client` (
  `client_id` int(11) NOT NULL AUTO_INCREMENT,
  `client_name` varchar(100) NOT NULL,
  `contact_person` varchar(100) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `status` enum('active','inactive','suspended') DEFAULT 'active',
  `registration_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`client_id`),
  KEY `idx_client_name` (`client_name`),
  KEY `idx_status` (`status`),
  KEY `idx_client_email` (`email`),
  KEY `idx_client_contact_person` (`contact_person`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `client` VALUES ('1', 'Apex Retail Group', 'Luis Tan', 'luis.tan@apexretail.ph', '09175551001', 'Ortigas Center, Pasig', 'active', '2026-05-01', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `client` VALUES ('2', 'Blue Harbor Shipping', 'Maria Lim', 'maria.lim@blueharbor.ph', '09175551002', 'North Harbor, Manila', 'active', '2026-05-01', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `client` VALUES ('3', 'Cedar Food Manufacturing', 'Jose Perez', 'jose.perez@cedarfood.ph', '09175551003', 'Laguna Technopark, Laguna', 'active', '2026-05-01', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `client` VALUES ('4', 'Dawn Medical Clinics', 'Anna Cruz', 'anna.cruz@dawnmedical.ph', '09175551004', 'Alabang, Muntinlupa', 'active', '2026-05-01', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `client` VALUES ('5', 'Evergreen Construction', 'Mark Rivera', 'mark.rivera@evergreen.ph', '09175551005', 'C5 Road, Taguig', 'active', '2026-05-01', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `client` VALUES ('6', 'Falcon Logistics', 'Grace Ong', 'grace.ong@falconlogistics.ph', '09175551006', 'Paranaque, Metro Manila', 'active', '2026-05-01', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `client` VALUES ('7', 'Golden Spoon Restaurants', 'Rico Garcia', 'rico.garcia@goldenspoon.ph', '09175551007', 'Makati, Metro Manila', 'active', '2026-05-01', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `client` VALUES ('8', 'Harborview Properties', 'Liza Santos', 'liza.santos@harborview.ph', '09175551008', 'Cebu IT Park, Cebu', 'active', '2026-05-01', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `client` VALUES ('9', 'Iris Pharma Distributors', 'Paul Reyes', 'paul.reyes@irispharma.ph', '09175551009', 'Mandaue, Cebu', 'active', '2026-05-01', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `client` VALUES ('10', 'Jade Tech Solutions', 'Sara Lim', 'sara.lim@jadetech.ph', '09175551010', 'BGC, Taguig', 'active', '2026-05-01', '2026-06-18 15:03:33', '2026-06-18 15:03:33');

-- -----------------------------------------------
-- Table: `client_receivables_fines`
-- -----------------------------------------------
DROP TABLE IF EXISTS `client_receivables_fines`;
CREATE TABLE `client_receivables_fines` (
  `fine_id` int(11) NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `fine_amount` decimal(15,2) NOT NULL,
  `fine_date` date NOT NULL,
  `due_date` datetime DEFAULT NULL,
  `reason` text DEFAULT NULL,
  `status` enum('pending','paid','waived','cancelled') DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`fine_id`),
  KEY `idx_client` (`client_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `client_receivables_fines_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `client` (`client_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `client_services`
-- -----------------------------------------------
DROP TABLE IF EXISTS `client_services`;
CREATE TABLE `client_services` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `service_id` int(11) NOT NULL,
  `assigned_date` timestamp NOT NULL DEFAULT current_timestamp(),
  `status` enum('active','inactive') DEFAULT 'active',
  `renewal_required` tinyint(1) NOT NULL DEFAULT 0,
  `expiry_date` date DEFAULT NULL,
  `last_renewed_at` date DEFAULT NULL,
  `reminder_days_before` int(11) NOT NULL DEFAULT 30,
  `renewal_cycle` varchar(40) NOT NULL DEFAULT 'none',
  `auto_renew_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `renewal_notes` text DEFAULT NULL,
  `change_notes` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_client_service` (`client_id`,`service_id`),
  KEY `idx_client` (`client_id`),
  KEY `idx_service` (`service_id`),
  CONSTRAINT `client_services_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `client` (`client_id`) ON DELETE CASCADE,
  CONSTRAINT `client_services_ibfk_2` FOREIGN KEY (`service_id`) REFERENCES `services` (`service_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `deduction`
-- -----------------------------------------------
DROP TABLE IF EXISTS `deduction`;
CREATE TABLE `deduction` (
  `deduction_id` int(11) NOT NULL AUTO_INCREMENT,
  `deduction_type_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`deduction_id`),
  KEY `idx_type` (`deduction_type_id`),
  CONSTRAINT `deduction_ibfk_1` FOREIGN KEY (`deduction_type_id`) REFERENCES `deduction_type` (`deduction_type_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `deduction_type`
-- -----------------------------------------------
DROP TABLE IF EXISTS `deduction_type`;
CREATE TABLE `deduction_type` (
  `deduction_type_id` int(11) NOT NULL AUTO_INCREMENT,
  `type_name` varchar(50) NOT NULL,
  `description` text DEFAULT NULL,
  `default_amount` decimal(10,2) DEFAULT 0.00,
  `threshold_amount` decimal(10,2) DEFAULT 0.00,
  `threshold_mode` enum('none','above','below') NOT NULL DEFAULT 'none',
  `threshold_rules` text DEFAULT NULL,
  `base_floor` decimal(10,2) DEFAULT 0.00,
  `base_cap` decimal(10,2) DEFAULT 0.00,
  `is_percentage` tinyint(1) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`deduction_type_id`),
  UNIQUE KEY `type_name` (`type_name`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `deduction_type` VALUES ('1', 'SSS', 'Employee share is 5% of MSC with floor PHP 5000 and cap PHP 35000 (SSS rate 15% total as of Jan 1, 2025).', '5.00', '0.00', 'none', NULL, '5000.00', '35000.00', '1', '1', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `deduction_type` VALUES ('2', 'PhilHealth', 'Employee share is 2.5% of monthly basic salary with floor PHP 10000 and ceiling PHP 100000 (premium rate 5%).', '2.50', '0.00', 'none', NULL, '10000.00', '100000.00', '1', '1', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `deduction_type` VALUES ('3', 'Pag-IBIG', 'Employee share is 2% above PHP 1500, with salary base capped at PHP 10000 (max PHP 200).', '2.00', '1500.00', 'above', NULL, '0.00', '10000.00', '1', '1', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `deduction_type` VALUES ('4', 'Withholding Tax', 'Monthly withholding tax (BIR 2023+ table): 0% up to 20833; 15% over 20833; 20% over 33333; 25% over 66667; 30% over 166667; 35% over 666667.', '0.00', '20833.00', 'below', '[{\"mode\":\"below\",\"amount\":20833,\"rate\":0},{\"mode\":\"above\",\"amount\":20833,\"rate\":15},{\"mode\":\"above\",\"amount\":33333,\"rate\":20},{\"mode\":\"above\",\"amount\":66667,\"rate\":25},{\"mode\":\"above\",\"amount\":166667,\"rate\":30},{\"mode\":\"above\",\"amount\":666667,\"rate\":35}]', '0.00', '0.00', '0', '1', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `deduction_type` VALUES ('5', 'Late Deduction', 'Deduction for tardiness', '0.00', '0.00', 'none', NULL, '0.00', '0.00', '0', '1', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `deduction_type` VALUES ('6', 'Absence Deduction', 'Deduction for absences', '0.00', '0.00', 'none', NULL, '0.00', '0.00', '0', '1', '2026-06-18 06:45:55', '2026-06-18 06:45:55');

-- -----------------------------------------------
-- Table: `document_received`
-- -----------------------------------------------
DROP TABLE IF EXISTS `document_received`;
CREATE TABLE `document_received` (
  `document_id` int(11) NOT NULL AUTO_INCREMENT,
  `document_name` varchar(255) NOT NULL,
  `received_date` date NOT NULL,
  `document_type` varchar(100) DEFAULT NULL,
  `status` enum('received','processing','completed','archived') DEFAULT 'received',
  `client_id` int(11) DEFAULT NULL,
  `employee_id` int(11) DEFAULT NULL,
  `file_path` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `task_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`document_id`),
  KEY `employee_id` (`employee_id`),
  KEY `idx_received_date` (`received_date`),
  KEY `idx_status` (`status`),
  KEY `idx_client` (`client_id`),
  KEY `task_id` (`task_id`),
  KEY `task_id_2` (`task_id`),
  KEY `task_id_3` (`task_id`),
  KEY `task_id_4` (`task_id`),
  KEY `task_id_5` (`task_id`),
  KEY `task_id_6` (`task_id`),
  KEY `task_id_7` (`task_id`),
  KEY `task_id_8` (`task_id`),
  KEY `task_id_9` (`task_id`),
  KEY `task_id_10` (`task_id`),
  KEY `task_id_11` (`task_id`),
  CONSTRAINT `document_received_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `client` (`client_id`) ON DELETE SET NULL,
  CONSTRAINT `document_received_ibfk_2` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `document_submission`
-- -----------------------------------------------
DROP TABLE IF EXISTS `document_submission`;
CREATE TABLE `document_submission` (
  `submission_id` int(11) NOT NULL AUTO_INCREMENT,
  `document_id` int(11) NOT NULL,
  `submission_date` date NOT NULL,
  `submitted_by` int(11) DEFAULT NULL,
  `status` enum('pending','submitted','accepted','rejected') DEFAULT 'pending',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `task_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`submission_id`),
  KEY `document_id` (`document_id`),
  KEY `submitted_by` (`submitted_by`),
  KEY `idx_submission_date` (`submission_date`),
  KEY `idx_status` (`status`),
  KEY `task_id` (`task_id`),
  KEY `task_id_2` (`task_id`),
  KEY `task_id_3` (`task_id`),
  KEY `task_id_4` (`task_id`),
  KEY `task_id_5` (`task_id`),
  KEY `task_id_6` (`task_id`),
  KEY `task_id_7` (`task_id`),
  KEY `task_id_8` (`task_id`),
  KEY `task_id_9` (`task_id`),
  KEY `task_id_10` (`task_id`),
  KEY `task_id_11` (`task_id`),
  CONSTRAINT `document_submission_ibfk_1` FOREIGN KEY (`document_id`) REFERENCES `document_received` (`document_id`) ON DELETE CASCADE,
  CONSTRAINT `document_submission_ibfk_2` FOREIGN KEY (`submitted_by`) REFERENCES `employees` (`employee_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `employee_role`
-- -----------------------------------------------
DROP TABLE IF EXISTS `employee_role`;
CREATE TABLE `employee_role` (
  `employee_role_id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `role_id` int(11) NOT NULL,
  `assigned_date` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`employee_role_id`),
  UNIQUE KEY `unique_employee_role` (`employee_id`,`role_id`),
  KEY `idx_employee` (`employee_id`),
  KEY `idx_role` (`role_id`),
  CONSTRAINT `employee_role_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE,
  CONSTRAINT `employee_role_ibfk_2` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `employee_role` VALUES ('1', '1', '1', '2026-06-18 06:45:56');
INSERT INTO `employee_role` VALUES ('2', '2', '2', '2026-06-18 06:45:56');
INSERT INTO `employee_role` VALUES ('3', '3', '3', '2026-06-18 06:45:56');
INSERT INTO `employee_role` VALUES ('4', '4', '1', '2026-06-18 15:03:33');
INSERT INTO `employee_role` VALUES ('5', '5', '2', '2026-06-18 15:03:33');
INSERT INTO `employee_role` VALUES ('6', '6', '2', '2026-06-18 15:03:33');
INSERT INTO `employee_role` VALUES ('7', '7', '3', '2026-06-18 15:03:33');
INSERT INTO `employee_role` VALUES ('8', '8', '3', '2026-06-18 15:03:33');
INSERT INTO `employee_role` VALUES ('9', '9', '3', '2026-06-18 15:03:33');
INSERT INTO `employee_role` VALUES ('10', '10', '3', '2026-06-18 15:03:33');
INSERT INTO `employee_role` VALUES ('11', '11', '3', '2026-06-18 15:03:33');
INSERT INTO `employee_role` VALUES ('12', '12', '3', '2026-06-18 15:03:33');
INSERT INTO `employee_role` VALUES ('13', '13', '3', '2026-06-18 15:03:33');

-- -----------------------------------------------
-- Table: `employees`
-- -----------------------------------------------
DROP TABLE IF EXISTS `employees`;
CREATE TABLE `employees` (
  `employee_id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_date_id` varchar(50) DEFAULT NULL,
  `first_name` varchar(50) NOT NULL,
  `last_name` varchar(50) NOT NULL,
  `date_of_birth` date DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `phone_number` varchar(20) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `position` varchar(100) DEFAULT NULL,
  `hire_date` date DEFAULT NULL,
  `salary` decimal(12,2) DEFAULT 0.00,
  `status` enum('active','inactive','on_leave','terminated') DEFAULT 'active',
  `profile_photo` varchar(255) DEFAULT NULL,
  `sss_number` varchar(30) DEFAULT NULL,
  `pagibig_number` varchar(30) DEFAULT NULL,
  `philhealth_number` varchar(30) DEFAULT NULL,
  `tin_number` varchar(30) DEFAULT NULL,
  `document_resume` tinyint(1) NOT NULL DEFAULT 0,
  `document_nbi_clearance` tinyint(1) NOT NULL DEFAULT 0,
  `document_police_clearance` tinyint(1) NOT NULL DEFAULT 0,
  `document_barangay_clearance` tinyint(1) NOT NULL DEFAULT 0,
  `document_birth_certificate` tinyint(1) NOT NULL DEFAULT 0,
  `document_medical_certificate` tinyint(1) NOT NULL DEFAULT 0,
  `document_diploma_tor` tinyint(1) NOT NULL DEFAULT 0,
  `document_employment_contract` tinyint(1) NOT NULL DEFAULT 0,
  `branch_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `department` varchar(100) DEFAULT NULL,
  `employment_type` varchar(50) NOT NULL DEFAULT 'Full-Time',
  PRIMARY KEY (`employee_id`),
  UNIQUE KEY `employee_date_id` (`employee_date_id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_employee_name` (`first_name`,`last_name`),
  KEY `idx_employee_status` (`status`),
  KEY `idx_branch` (`branch_id`),
  CONSTRAINT `employees_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`branch_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `employees` VALUES ('1', NULL, 'System', 'Administrator', NULL, 'kristinedais14@gmail.com', NULL, NULL, 'Administrator', '2026-06-18', '0.00', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '1', '2026-06-18 06:45:56', '2026-06-18 06:45:56', NULL, 'Full-Time');
INSERT INTO `employees` VALUES ('2', NULL, 'Default', 'Manager', NULL, 'manager@lbaccountants.com', NULL, NULL, 'Manager', '2026-06-18', '0.00', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '1', '2026-06-18 06:45:56', '2026-06-18 06:45:56', NULL, 'Full-Time');
INSERT INTO `employees` VALUES ('3', NULL, 'Default', 'Staff', NULL, 'staff@lbaccountants.com', NULL, NULL, 'Staff', '2026-06-18', '0.00', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '1', '2026-06-18 06:45:56', '2026-06-18 06:45:56', NULL, 'Full-Time');
INSERT INTO `employees` VALUES ('4', 'LLB-EMP-2026-004', 'Miguel', 'Santos', '1990-04-12', 'miguel.santos@lbaccountants.com', '09171234004', 'Makati, Metro Manila', 'Senior Accountant', '2023-02-01', '42000.00', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '2', '2026-06-18 15:03:33', '2026-06-18 15:03:33', NULL, 'Full-Time');
INSERT INTO `employees` VALUES ('5', 'LLB-EMP-2026-005', 'Angela', 'Reyes', '1992-08-21', 'angela.reyes@lbaccountants.com', '09171234005', 'Quezon City, Metro Manila', 'Audit Supervisor', '2022-06-15', '45000.00', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '3', '2026-06-18 15:03:33', '2026-06-18 15:03:33', NULL, 'Full-Time');
INSERT INTO `employees` VALUES ('6', 'LLB-EMP-2026-006', 'Carlo', 'Dela Cruz', '1988-11-03', 'carlo.delacruz@lbaccountants.com', '09171234006', 'Cebu City, Cebu', 'Tax Associate', '2024-01-10', '36000.00', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '4', '2026-06-18 15:03:33', '2026-06-18 15:03:33', NULL, 'Full-Time');
INSERT INTO `employees` VALUES ('7', 'LLB-EMP-2026-007', 'Nina', 'Garcia', '1995-01-30', 'nina.garcia@lbaccountants.com', '09171234007', 'Davao City, Davao del Sur', 'Bookkeeping Specialist', '2024-03-01', '32000.00', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '5', '2026-06-18 15:03:33', '2026-06-18 15:03:33', NULL, 'Full-Time');
INSERT INTO `employees` VALUES ('8', 'LLB-EMP-2026-008', 'Rafael', 'Torres', '1991-07-17', 'rafael.torres@lbaccountants.com', '09171234008', 'Iloilo City, Iloilo', 'Payroll Analyst', '2023-09-01', '38000.00', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '6', '2026-06-18 15:03:33', '2026-06-18 15:03:33', NULL, 'Full-Time');
INSERT INTO `employees` VALUES ('9', 'LLB-EMP-2026-009', 'Sofia', 'Mendoza', '1993-12-09', 'sofia.mendoza@lbaccountants.com', '09171234009', 'Pasig, Metro Manila', 'Staff Accountant', '2024-07-01', '30000.00', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '2', '2026-06-18 15:03:33', '2026-06-18 15:03:33', NULL, 'Full-Time');
INSERT INTO `employees` VALUES ('10', 'LLB-EMP-2026-010', 'Diego', 'Cruz', '1989-05-25', 'diego.cruz@lbaccountants.com', '09171234010', 'Taguig, Metro Manila', 'Compliance Associate', '2023-11-01', '34000.00', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '3', '2026-06-18 15:03:33', '2026-06-18 15:03:33', NULL, 'Full-Time');
INSERT INTO `employees` VALUES ('11', 'LLB-EMP-2026-011', 'Patricia', 'Villanueva', '1994-10-14', 'patricia.villanueva@lbaccountants.com', '09171234011', 'Cebu City, Cebu', 'Junior Auditor', '2025-01-15', '29000.00', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '4', '2026-06-18 15:03:33', '2026-06-18 15:03:33', NULL, 'Full-Time');
INSERT INTO `employees` VALUES ('12', 'LLB-EMP-2026-012', 'Gabriel', 'Ramos', '1987-03-08', 'gabriel.ramos@lbaccountants.com', '09171234012', 'Davao City, Davao del Sur', 'Senior Tax Associate', '2022-08-20', '41000.00', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '5', '2026-06-18 15:03:33', '2026-06-18 15:03:33', NULL, 'Full-Time');
INSERT INTO `employees` VALUES ('13', 'LLB-EMP-2026-013', 'Eliza', 'Flores', '1996-06-19', 'eliza.flores@lbaccountants.com', '09171234013', 'Makati, Metro Manila', 'Administrative Staff', '2025-04-01', '26000.00', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '6', '2026-06-18 15:03:33', '2026-06-18 15:03:33', NULL, 'Full-Time');

-- -----------------------------------------------
-- Table: `exception_queue`
-- -----------------------------------------------
DROP TABLE IF EXISTS `exception_queue`;
CREATE TABLE `exception_queue` (
  `exception_id` int(11) NOT NULL AUTO_INCREMENT,
  `source_type` enum('attendance_import','payroll_precheck','approval_sla','payslip_dispute','overtime_request','leave_request','system') NOT NULL,
  `source_record_id` varchar(120) NOT NULL,
  `title` varchar(255) NOT NULL,
  `details` text DEFAULT NULL,
  `severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `status` enum('open','in_progress','resolved','ignored') NOT NULL DEFAULT 'open',
  `owner_role` enum('admin','manager') NOT NULL DEFAULT 'admin',
  `metadata_json` longtext DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `resolved_by` int(11) DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`exception_id`),
  UNIQUE KEY `uq_exception_source` (`source_type`,`source_record_id`),
  KEY `idx_exception_status` (`status`),
  KEY `idx_exception_severity` (`severity`),
  KEY `idx_exception_owner` (`owner_role`),
  KEY `fk_exception_created_by` (`created_by`),
  KEY `fk_exception_resolved_by` (`resolved_by`),
  CONSTRAINT `fk_exception_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_exception_resolved_by` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `holidays`
-- -----------------------------------------------
DROP TABLE IF EXISTS `holidays`;
CREATE TABLE `holidays` (
  `holiday_id` int(11) NOT NULL AUTO_INCREMENT,
  `holiday_name` varchar(160) NOT NULL,
  `holiday_date` date NOT NULL,
  `holiday_type` varchar(60) NOT NULL DEFAULT 'Regular Holiday',
  `holiday_scope` varchar(60) NOT NULL DEFAULT 'National',
  `description` text DEFAULT NULL,
  `source` varchar(140) DEFAULT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(11) DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`holiday_id`),
  UNIQUE KEY `uniq_holiday_date_name` (`holiday_date`,`holiday_name`),
  KEY `idx_holiday_date` (`holiday_date`),
  KEY `created_by` (`created_by`),
  KEY `updated_by` (`updated_by`),
  CONSTRAINT `holidays_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `holidays_ibfk_2` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `holidays` VALUES ('1', 'New Year&#039;s Day', '2026-01-01', 'Regular Holiday', 'National', 'Regular Holiday', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('2', 'EDSA People Power Revolution Anniversary', '2026-02-25', 'Special Working Day', 'National', 'Special Working Day', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('3', 'Chinese New Year', '2026-02-17', 'Additional Special Non-Working Day', 'National', 'Additional Special Non-Working Day', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('4', 'Maundy Thursday', '2026-04-02', 'Regular Holiday', 'National', 'Regular Holiday', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('5', 'Good Friday', '2026-04-03', 'Regular Holiday', 'National', 'Regular Holiday', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('6', 'Black Saturday', '2026-04-04', 'Additional Special Non-Working Day', 'National', 'Additional Special Non-Working Day', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('7', 'Araw ng Kagitingan', '2026-04-09', 'Regular Holiday', 'National', 'Regular Holiday', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('8', 'Labor Day', '2026-05-01', 'Regular Holiday', 'National', 'Regular Holiday', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('9', 'Independence Day', '2026-06-12', 'Regular Holiday', 'National', 'Regular Holiday', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('10', 'Ninoy Aquino Day', '2026-08-21', 'Special Non-Working Day', 'National', 'Special Non-Working Day', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('11', 'National Heroes Day', '2026-08-31', 'Regular Holiday', 'National', 'Regular Holiday', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('12', 'All Saints&#039; Day', '2026-11-01', 'Special Non-Working Day', 'National', 'Special Non-Working Day', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('13', 'All Souls&#039; Day', '2026-11-02', 'Additional Special Non-Working Day', 'National', 'Additional Special Non-Working Day', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('14', 'Bonifacio Day', '2026-11-30', 'Regular Holiday', 'National', 'Regular Holiday', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('15', 'Feast of the Immaculate Conception of Mary', '2026-12-08', 'Special Non-Working Day', 'National', 'Special Non-Working Day', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('16', 'Christmas Eve', '2026-12-24', 'Additional Special Non-Working Day', 'National', 'Additional Special Non-Working Day', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('17', 'Christmas Day', '2026-12-25', 'Regular Holiday', 'National', 'Regular Holiday', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('18', 'Rizal Day', '2026-12-30', 'Regular Holiday', 'National', 'Regular Holiday', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');
INSERT INTO `holidays` VALUES ('19', 'Last Day of the Year', '2026-12-31', 'Special Non-Working Day', 'National', 'Special Non-Working Day', 'Proclamation No. 1006 (s. 2025)', '1', NULL, NULL, '2026-06-19 13:08:31', '2026-06-19 13:08:31');

-- -----------------------------------------------
-- Table: `intruder_ip_lockouts`
-- -----------------------------------------------
DROP TABLE IF EXISTS `intruder_ip_lockouts`;
CREATE TABLE `intruder_ip_lockouts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ip_address` varchar(45) NOT NULL,
  `failed_count` int(11) NOT NULL DEFAULT 0,
  `window_start` datetime DEFAULT NULL,
  `blocked_until` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ip_address` (`ip_address`),
  KEY `idx_intruder_blocked_until` (`blocked_until`),
  KEY `idx_intruder_window_start` (`window_start`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `intruder_ip_lockouts` VALUES ('1', 'sid_3ol2sa3egigmk4agk261f3694c', '2', '2026-06-24 12:50:14', NULL, '2026-06-24 12:20:09', '2026-06-24 12:50:17');

-- -----------------------------------------------
-- Table: `leave_balance`
-- -----------------------------------------------
DROP TABLE IF EXISTS `leave_balance`;
CREATE TABLE `leave_balance` (
  `leave_balance_id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `leave_type` varchar(100) NOT NULL,
  `total_days` decimal(5,2) DEFAULT 0.00,
  `used_days` decimal(5,2) DEFAULT 0.00,
  `remaining_days` decimal(5,2) DEFAULT 0.00,
  `year` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`leave_balance_id`),
  UNIQUE KEY `unique_employee_leave_year` (`employee_id`,`leave_type`,`year`),
  KEY `idx_employee` (`employee_id`),
  KEY `idx_year` (`year`),
  CONSTRAINT `leave_balance_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `leave_balance` VALUES ('1', '4', 'vacation', '15.00', '3.00', '12.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('2', '5', 'vacation', '15.00', '3.00', '12.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('3', '6', 'vacation', '15.00', '3.00', '12.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('4', '7', 'vacation', '15.00', '3.00', '12.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('5', '8', 'vacation', '15.00', '3.00', '12.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('6', '9', 'vacation', '15.00', '3.00', '12.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('7', '10', 'vacation', '15.00', '3.00', '12.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('8', '11', 'vacation', '15.00', '3.00', '12.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('9', '12', 'vacation', '15.00', '3.00', '12.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('10', '13', 'vacation', '15.00', '3.00', '12.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('16', '4', 'sick', '10.00', '2.00', '8.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('17', '5', 'sick', '10.00', '2.00', '8.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('18', '6', 'sick', '10.00', '2.00', '8.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('19', '7', 'sick', '10.00', '2.00', '8.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('20', '8', 'sick', '10.00', '2.00', '8.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('21', '9', 'sick', '10.00', '2.00', '8.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('22', '10', 'sick', '10.00', '2.00', '8.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('23', '11', 'sick', '10.00', '2.00', '8.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('24', '12', 'sick', '10.00', '2.00', '8.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_balance` VALUES ('25', '13', 'sick', '10.00', '2.00', '8.00', '2026', '2026-06-18 15:03:34', '2026-06-18 15:03:34');

-- -----------------------------------------------
-- Table: `leave_request`
-- -----------------------------------------------
DROP TABLE IF EXISTS `leave_request`;
CREATE TABLE `leave_request` (
  `leave_request_id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `leave_type` varchar(100) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `reason` text DEFAULT NULL,
  `status` enum('pending','approved','rejected','cancelled') DEFAULT 'pending',
  `approved_by` int(11) DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`leave_request_id`),
  KEY `approved_by` (`approved_by`),
  KEY `idx_employee` (`employee_id`),
  KEY `idx_status` (`status`),
  KEY `idx_dates` (`start_date`,`end_date`),
  CONSTRAINT `leave_request_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE,
  CONSTRAINT `leave_request_ibfk_2` FOREIGN KEY (`approved_by`) REFERENCES `employees` (`employee_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `leave_request` VALUES ('1', '4', 'vacation', '2026-06-20', '2026-06-21', 'Planned family vacation.', 'approved', '5', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_request` VALUES ('2', '5', 'sick', '2026-06-15', '2026-06-15', 'Medical consultation and rest.', 'approved', '4', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_request` VALUES ('3', '6', 'emergency', '2026-06-16', '2026-06-16', 'Family emergency.', 'approved', '6', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_request` VALUES ('4', '7', 'vacation', '2026-06-25', '2026-06-27', 'Personal leave.', 'cancelled', NULL, NULL, '2026-06-18 15:03:34', '2026-06-19 14:10:07');
INSERT INTO `leave_request` VALUES ('5', '8', 'sick', '2026-06-18', '2026-06-18', 'Flu and fever.', 'rejected', '5', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_request` VALUES ('6', '9', 'vacation', '2026-07-01', '2026-07-03', 'Vacation leave.', 'approved', '4', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_request` VALUES ('7', '10', 'emergency', '2026-06-22', '2026-06-22', 'Urgent personal matter.', 'rejected', '1', '2026-06-20 08:22:17', '2026-06-18 15:03:34', '2026-06-20 08:22:17');
INSERT INTO `leave_request` VALUES ('8', '11', 'unpaid', '2026-07-05', '2026-07-06', 'Unpaid personal leave.', 'approved', '6', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_request` VALUES ('9', '12', 'paternity', '2026-06-24', '2026-06-26', 'Paternity leave.', 'approved', '4', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `leave_request` VALUES ('10', '13', 'vacation', '2026-07-10', '2026-07-10', 'One-day vacation leave.', 'rejected', '5', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '2026-06-18 15:03:34');

-- -----------------------------------------------
-- Table: `leave_request_comment`
-- -----------------------------------------------
DROP TABLE IF EXISTS `leave_request_comment`;
CREATE TABLE `leave_request_comment` (
  `comment_id` int(11) NOT NULL AUTO_INCREMENT,
  `leave_request_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `parent_comment_id` int(11) DEFAULT NULL,
  `comment_text` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`comment_id`),
  KEY `user_id` (`user_id`),
  KEY `idx_leave_request` (`leave_request_id`),
  KEY `idx_parent_comment` (`parent_comment_id`),
  KEY `idx_comment_created` (`created_at`),
  CONSTRAINT `leave_request_comment_ibfk_1` FOREIGN KEY (`leave_request_id`) REFERENCES `leave_request` (`leave_request_id`) ON DELETE CASCADE,
  CONSTRAINT `leave_request_comment_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `leave_request_comment_ibfk_3` FOREIGN KEY (`parent_comment_id`) REFERENCES `leave_request_comment` (`comment_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `leave_request_comment` VALUES ('1', '4', '1', NULL, 'HI', '2026-06-19 14:09:52', '2026-06-19 14:09:52');

-- -----------------------------------------------
-- Table: `leave_type`
-- -----------------------------------------------
DROP TABLE IF EXISTS `leave_type`;
CREATE TABLE `leave_type` (
  `leave_type_id` int(11) NOT NULL AUTO_INCREMENT,
  `type_key` varchar(100) NOT NULL,
  `type_name` varchar(120) NOT NULL,
  `description` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`leave_type_id`),
  UNIQUE KEY `type_key` (`type_key`),
  UNIQUE KEY `type_name` (`type_name`),
  KEY `idx_leave_type_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=493 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `leave_type` VALUES ('1', 'sick', 'Sick', '', '1', '2026-06-18 16:25:42', '2026-06-18 16:25:42');
INSERT INTO `leave_type` VALUES ('2', 'vacation', 'Vacation', '', '1', '2026-06-18 16:25:42', '2026-06-18 16:25:42');
INSERT INTO `leave_type` VALUES ('3', 'emergency', 'Emergency', '', '1', '2026-06-18 16:25:42', '2026-06-18 16:25:42');
INSERT INTO `leave_type` VALUES ('4', 'maternity', 'Maternity', '', '1', '2026-06-18 16:25:42', '2026-06-18 16:25:42');
INSERT INTO `leave_type` VALUES ('5', 'paternity', 'Paternity', '', '1', '2026-06-18 16:25:42', '2026-06-18 16:25:42');
INSERT INTO `leave_type` VALUES ('6', 'unpaid', 'Unpaid', '', '1', '2026-06-18 16:25:42', '2026-06-18 16:25:42');

-- -----------------------------------------------
-- Table: `overtime_request`
-- -----------------------------------------------
DROP TABLE IF EXISTS `overtime_request`;
CREATE TABLE `overtime_request` (
  `overtime_request_id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `work_date` date NOT NULL,
  `hours_requested` decimal(5,2) NOT NULL DEFAULT 0.00,
  `reason` text NOT NULL,
  `status` enum('submitted','approved','rejected','cancelled') NOT NULL DEFAULT 'submitted',
  `sla_due_at` datetime DEFAULT NULL,
  `approved_by` int(11) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `manager_notes` text DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `archived_at` datetime DEFAULT NULL,
  PRIMARY KEY (`overtime_request_id`),
  KEY `idx_ot_employee` (`employee_id`),
  KEY `idx_ot_status` (`status`),
  KEY `idx_ot_sla` (`sla_due_at`),
  KEY `fk_ot_created_by` (`created_by`),
  KEY `fk_ot_approved_by` (`approved_by`),
  CONSTRAINT `fk_ot_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ot_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ot_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `overtime_request` VALUES ('1', '4', '2026-06-03', '3.00', 'Month-end financial statement review extension.', 'approved', '2026-06-03 18:00:00', '5', '2026-06-04 18:00:00', 'Approved for audit close support.', '4', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL);
INSERT INTO `overtime_request` VALUES ('2', '5', '2026-06-04', '2.50', 'Client audit documentation finalization.', 'approved', '2026-06-04 18:00:00', '4', '2026-06-05 18:00:00', 'Approved.', '5', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL);
INSERT INTO `overtime_request` VALUES ('3', '6', '2026-06-05', '4.00', 'Tax schedule preparation before filing deadline.', 'approved', '2026-06-05 18:00:00', '6', '2026-06-06 18:00:00', 'Approved.', '6', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL);
INSERT INTO `overtime_request` VALUES ('4', '7', '2026-06-06', '2.00', 'Bank reconciliation catch-up.', 'submitted', '2026-06-06 18:00:00', NULL, NULL, NULL, '7', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL);
INSERT INTO `overtime_request` VALUES ('5', '8', '2026-06-07', '5.00', 'Payroll precheck and correction run.', 'rejected', '2026-06-07 18:00:00', '5', '2026-06-08 18:00:00', 'Needs clearer project justification.', '8', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL);
INSERT INTO `overtime_request` VALUES ('6', '9', '2026-06-08', '3.50', 'Client receivable aging report support.', 'approved', '2026-06-08 18:00:00', '4', '2026-06-09 18:00:00', 'Approved for client reporting.', '9', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL);
INSERT INTO `overtime_request` VALUES ('7', '10', '2026-06-09', '2.00', 'Compliance checklist update.', 'submitted', '2026-06-09 18:00:00', NULL, NULL, NULL, '10', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL);
INSERT INTO `overtime_request` VALUES ('8', '11', '2026-06-10', '4.50', 'Audit working paper completion.', 'approved', '2026-06-10 18:00:00', '5', '2026-06-11 18:00:00', 'Approved.', '11', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL);
INSERT INTO `overtime_request` VALUES ('9', '12', '2026-06-11', '6.00', 'Tax review for multiple client accounts.', 'approved', '2026-06-11 18:00:00', '4', '2026-06-12 18:00:00', 'Approved due to deadline.', '12', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL);
INSERT INTO `overtime_request` VALUES ('10', '13', '2026-06-12', '1.50', 'Administrative document encoding support.', 'rejected', '2026-06-12 18:00:00', '6', '2026-06-13 18:00:00', 'Regular working hours should be sufficient.', '13', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL);

-- -----------------------------------------------
-- Table: `password_history`
-- -----------------------------------------------
DROP TABLE IF EXISTS `password_history`;
CREATE TABLE `password_history` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_password_history_user_created` (`user_id`,`created_at`),
  KEY `idx_password_history_user_hash` (`user_id`,`password_hash`(191)),
  CONSTRAINT `fk_password_history_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `payroll`
-- -----------------------------------------------
DROP TABLE IF EXISTS `payroll`;
CREATE TABLE `payroll` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `employee_name` varchar(100) NOT NULL,
  `pay_period_start` date NOT NULL,
  `pay_period_end` date NOT NULL,
  `basic_salary` decimal(12,2) DEFAULT 0.00,
  `overtime_hours` decimal(5,2) DEFAULT 0.00,
  `overtime_rate` decimal(10,2) DEFAULT 0.00,
  `overtime_pay` decimal(12,2) DEFAULT 0.00,
  `bonus` decimal(10,2) DEFAULT 0.00,
  `clothing_allowance` decimal(10,2) DEFAULT 0.00,
  `travel_allowance` decimal(10,2) DEFAULT 0.00,
  `salary_adjustment` decimal(10,2) DEFAULT 0.00,
  `late_deduction` decimal(10,2) DEFAULT 0.00,
  `absence_deduction` decimal(10,2) DEFAULT 0.00,
  `tax` decimal(10,2) DEFAULT 0.00,
  `sss_contribution` decimal(10,2) DEFAULT 0.00,
  `pagibig_contribution` decimal(10,2) DEFAULT 0.00,
  `philhealth_contribution` decimal(10,2) DEFAULT 0.00,
  `cash_advance_deduction` decimal(10,2) DEFAULT 0.00,
  `cash_advance_manual_deduction` decimal(10,2) DEFAULT 0.00,
  `laptop_loan_deduction` decimal(10,2) DEFAULT 0.00,
  `other_deductions` decimal(10,2) DEFAULT 0.00,
  `gross_pay` decimal(12,2) DEFAULT 0.00,
  `total_deductions` decimal(12,2) DEFAULT 0.00,
  `net_pay` decimal(12,2) DEFAULT 0.00,
  `status` enum('draft','pending','approved','paid','archived') NOT NULL DEFAULT 'draft',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_employee` (`employee_id`),
  KEY `idx_period` (`pay_period_start`,`pay_period_end`),
  KEY `idx_status` (`status`),
  KEY `idx_payroll_employee_period` (`employee_id`,`pay_period_start`,`pay_period_end`),
  KEY `idx_payroll_status_period` (`status`,`pay_period_start`,`pay_period_end`,`created_at`),
  KEY `idx_payroll_created` (`created_at`),
  CONSTRAINT `payroll_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `payroll` VALUES ('1', '4', 'Miguel Santos', '2026-05-01', '2026-05-31', '42000.00', '6.00', '195.00', '1170.00', '3000.00', '500.00', '300.00', '0.00', '0.00', '0.00', '1470.00', '1050.00', '420.00', '420.00', '0.00', '0.00', '0.00', '840.00', '46170.00', '4200.00', '41970.00', 'approved', 'May payroll approved for senior accountant.', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `payroll` VALUES ('2', '5', 'Angela Reyes', '2026-05-01', '2026-05-31', '45000.00', '4.00', '210.00', '840.00', '2500.00', '500.00', '300.00', '0.00', '0.00', '0.00', '1592.50', '1137.50', '455.00', '455.00', '0.00', '0.00', '0.00', '910.00', '48340.00', '4550.00', '43790.00', 'approved', 'May payroll approved for audit supervisor.', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `payroll` VALUES ('3', '6', 'Carlo Dela Cruz', '2026-05-01', '2026-05-31', '36000.00', '8.00', '170.00', '1360.00', '1500.00', '500.00', '300.00', '0.00', '0.00', '0.00', '1260.00', '900.00', '360.00', '360.00', '0.00', '0.00', '0.00', '720.00', '38860.00', '3600.00', '35260.00', 'pending', 'Pending manager review.', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `payroll` VALUES ('4', '7', 'Nina Garcia', '2026-05-01', '2026-05-31', '32000.00', '3.00', '150.00', '450.00', '1000.00', '500.00', '300.00', '0.00', '0.00', '0.00', '1032.50', '737.50', '295.00', '295.00', '0.00', '0.00', '0.00', '590.00', '33450.00', '2950.00', '30500.00', 'approved', 'May payroll approved.', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `payroll` VALUES ('5', '8', 'Rafael Torres', '2026-05-01', '2026-05-31', '38000.00', '5.00', '180.00', '900.00', '2000.00', '500.00', '300.00', '0.00', '0.00', '0.00', '1312.50', '937.50', '375.00', '375.00', '0.00', '0.00', '0.00', '750.00', '40900.00', '3750.00', '37150.00', 'approved', 'May payroll approved.', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `payroll` VALUES ('6', '9', 'Sofia Mendoza', '2026-05-01', '2026-05-31', '30000.00', '7.00', '140.00', '980.00', '1200.00', '500.00', '300.00', '0.00', '0.00', '0.00', '997.50', '712.50', '285.00', '285.00', '0.00', '0.00', '0.00', '570.00', '32180.00', '2850.00', '29330.00', 'pending', 'Needs final payroll review.', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `payroll` VALUES ('7', '10', 'Diego Cruz', '2026-05-01', '2026-05-31', '34000.00', '2.00', '160.00', '320.00', '1000.00', '500.00', '300.00', '0.00', '0.00', '0.00', '1102.50', '787.50', '315.00', '315.00', '0.00', '0.00', '0.00', '630.00', '35320.00', '3150.00', '32170.00', 'approved', 'May payroll approved.', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `payroll` VALUES ('8', '11', 'Patricia Villanueva', '2026-05-01', '2026-05-31', '29000.00', '6.00', '135.00', '810.00', '800.00', '500.00', '300.00', '0.00', '0.00', '0.00', '945.00', '675.00', '270.00', '270.00', '0.00', '0.00', '0.00', '540.00', '30610.00', '2700.00', '27910.00', 'approved', 'May payroll approved.', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `payroll` VALUES ('9', '12', 'Gabriel Ramos', '2026-05-01', '2026-05-31', '41000.00', '9.00', '190.00', '1710.00', '2500.00', '500.00', '300.00', '0.00', '0.00', '0.00', '1435.00', '1025.00', '410.00', '410.00', '0.00', '0.00', '0.00', '820.00', '45210.00', '4100.00', '41110.00', 'pending', 'Awaiting payroll finalization.', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `payroll` VALUES ('10', '13', 'Eliza Flores', '2026-05-01', '2026-05-31', '26000.00', '1.00', '120.00', '120.00', '500.00', '500.00', '300.00', '0.00', '0.00', '0.00', '770.00', '550.00', '220.00', '220.00', '0.00', '0.00', '0.00', '440.00', '26620.00', '2200.00', '24420.00', 'approved', 'May payroll approved.', '2026-06-18 15:03:33', '2026-06-18 15:03:33');

-- -----------------------------------------------
-- Table: `payroll_user_archive`
-- -----------------------------------------------
DROP TABLE IF EXISTS `payroll_user_archive`;
CREATE TABLE `payroll_user_archive` (
  `archive_id` int(11) NOT NULL AUTO_INCREMENT,
  `payroll_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `archived_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`archive_id`),
  UNIQUE KEY `uniq_payroll_user_archive` (`payroll_id`,`user_id`),
  KEY `idx_payroll_user_archive_user` (`user_id`,`is_archived`,`deleted_at`),
  CONSTRAINT `fk_payroll_user_archive_payroll` FOREIGN KEY (`payroll_id`) REFERENCES `payroll` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_payroll_user_archive_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `payslip_dispute`
-- -----------------------------------------------
DROP TABLE IF EXISTS `payslip_dispute`;
CREATE TABLE `payslip_dispute` (
  `dispute_id` int(11) NOT NULL AUTO_INCREMENT,
  `payroll_id` int(11) NOT NULL,
  `employee_id` int(11) NOT NULL,
  `issue_type` enum('missing_overtime','deduction_error','allowance_missing','wrong_period','other') NOT NULL DEFAULT 'other',
  `dispute_reason` text NOT NULL,
  `expected_value` decimal(12,2) DEFAULT NULL,
  `current_value` decimal(12,2) DEFAULT NULL,
  `status` enum('submitted','in_review','resolved','rejected','closed','cancelled') NOT NULL DEFAULT 'submitted',
  `priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
  `sla_due_at` datetime DEFAULT NULL,
  `resolution_notes` text DEFAULT NULL,
  `resolved_by` int(11) DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `archived_at` datetime DEFAULT NULL,
  `archived_by` int(11) DEFAULT NULL,
  PRIMARY KEY (`dispute_id`),
  KEY `idx_dispute_payroll` (`payroll_id`),
  KEY `idx_dispute_employee` (`employee_id`),
  KEY `idx_dispute_status` (`status`),
  KEY `idx_dispute_archived` (`is_archived`),
  KEY `idx_dispute_sla` (`sla_due_at`),
  KEY `fk_dispute_created_by` (`created_by`),
  KEY `fk_dispute_resolved_by` (`resolved_by`),
  KEY `fk_dispute_archived_by` (`archived_by`),
  CONSTRAINT `fk_dispute_archived_by` FOREIGN KEY (`archived_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_dispute_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dispute_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dispute_payroll` FOREIGN KEY (`payroll_id`) REFERENCES `payroll` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dispute_resolved_by` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `payslip_dispute` VALUES ('1', '1', '4', 'missing_overtime', 'Overtime hours for June 3 were not reflected in payroll preview.', '1170.00', '0.00', 'resolved', 'high', '2026-05-05 00:00:00', 'Adjusted in payroll precheck.', '5', '2026-05-04 00:00:00', '4', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `payslip_dispute` VALUES ('2', '2', '5', 'allowance_missing', 'Travel allowance was not included in May payslip.', '300.00', '0.00', 'in_review', 'medium', '2026-05-05 00:00:00', NULL, NULL, NULL, '5', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `payslip_dispute` VALUES ('3', '3', '6', 'deduction_error', 'Late deduction appears even though attendance was on time.', '0.00', '250.00', 'resolved', 'high', '2026-05-05 00:00:00', 'Deduction removed after attendance review.', '4', '2026-05-04 00:00:00', '6', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `payslip_dispute` VALUES ('4', '4', '7', 'other', 'Employee name spelling should be corrected in payslip display.', NULL, NULL, 'submitted', 'low', '2026-05-05 00:00:00', NULL, NULL, NULL, '7', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `payslip_dispute` VALUES ('5', '5', '8', 'wrong_period', 'Payroll preview shows April period instead of May.', NULL, NULL, 'rejected', 'medium', '2026-05-05 00:00:00', 'Preview period corrected before final approval.', '5', '2026-05-04 00:00:00', '8', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `payslip_dispute` VALUES ('6', '6', '9', 'missing_overtime', 'Seven overtime hours were not included in gross pay.', '980.00', '0.00', 'in_review', 'high', '2026-05-05 00:00:00', NULL, NULL, NULL, '9', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `payslip_dispute` VALUES ('7', '7', '10', 'allowance_missing', 'Clothing allowance is missing from the May payslip.', '500.00', '0.00', 'closed', 'medium', '2026-05-05 00:00:00', 'Allowance added and payslip reissued.', '4', '2026-05-04 00:00:00', '10', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `payslip_dispute` VALUES ('8', '8', '11', 'deduction_error', 'SSS contribution appears higher than expected.', '700.00', '900.00', 'resolved', 'medium', '2026-05-05 00:00:00', 'Contribution recalculated.', '6', '2026-05-04 00:00:00', '11', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `payslip_dispute` VALUES ('9', '9', '12', 'missing_overtime', 'Nine overtime hours were omitted from payroll calculation.', '1710.00', '0.00', 'submitted', 'high', '2026-05-05 00:00:00', NULL, NULL, NULL, '12', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);
INSERT INTO `payslip_dispute` VALUES ('10', '10', '13', 'other', 'Requesting clarification on total deductions.', NULL, NULL, 'submitted', 'low', '2026-05-05 00:00:00', NULL, NULL, NULL, '13', '2026-06-18 15:03:34', '2026-06-18 15:03:34', '0', NULL, NULL);

-- -----------------------------------------------
-- Table: `payslip_dispute_comment`
-- -----------------------------------------------
DROP TABLE IF EXISTS `payslip_dispute_comment`;
CREATE TABLE `payslip_dispute_comment` (
  `comment_id` int(11) NOT NULL AUTO_INCREMENT,
  `dispute_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `comment_text` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`comment_id`),
  KEY `idx_dispute_comment_dispute` (`dispute_id`),
  KEY `idx_dispute_comment_created` (`created_at`),
  KEY `fk_dispute_comment_user` (`user_id`),
  CONSTRAINT `fk_dispute_comment_dispute` FOREIGN KEY (`dispute_id`) REFERENCES `payslip_dispute` (`dispute_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dispute_comment_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `profile_edit_request`
-- -----------------------------------------------
DROP TABLE IF EXISTS `profile_edit_request`;
CREATE TABLE `profile_edit_request` (
  `request_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `employee_id` int(11) DEFAULT NULL,
  `requested_by` int(11) NOT NULL,
  `request_reason` text DEFAULT NULL,
  `request_snapshot_json` longtext DEFAULT NULL,
  `status` enum('pending','approved','used','rejected') NOT NULL DEFAULT 'pending',
  `approved_by` int(11) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `access_granted_until` datetime DEFAULT NULL,
  `used_at` datetime DEFAULT NULL,
  `used_by` int(11) DEFAULT NULL,
  `updated_fields_json` longtext DEFAULT NULL,
  `archived_at` datetime DEFAULT NULL,
  `archived_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`request_id`),
  KEY `idx_profile_edit_request_user` (`user_id`,`status`,`archived_at`),
  KEY `idx_profile_edit_request_status` (`status`,`archived_at`,`created_at`),
  KEY `idx_profile_edit_request_archived` (`archived_at`),
  KEY `fk_profile_edit_request_employee` (`employee_id`),
  KEY `fk_profile_edit_request_requested_by` (`requested_by`),
  KEY `fk_profile_edit_request_approved_by` (`approved_by`),
  KEY `fk_profile_edit_request_used_by` (`used_by`),
  KEY `fk_profile_edit_request_archived_by` (`archived_by`),
  CONSTRAINT `fk_profile_edit_request_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_profile_edit_request_archived_by` FOREIGN KEY (`archived_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_profile_edit_request_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_profile_edit_request_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_profile_edit_request_used_by` FOREIGN KEY (`used_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_profile_edit_request_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `profile_edit_request` VALUES ('1', '4', '4', '4', 'Update phone number and emergency contact.', '{\"email\":\"miguel.santos@lbaccountants.com\",\"role\":\"admin\"}', 'used', '5', '2026-06-18 15:03:34', '2026-06-20 15:03:34', '2026-06-18 15:03:34', '4', '{\"phone_number\":\"09171234994\"}', NULL, NULL, '2026-06-18 15:03:34', '2026-06-18 15:03:34');
INSERT INTO `profile_edit_request` VALUES ('2', '5', '5', '5', 'Correct residential address.', '{\"email\":\"angela.reyes@lbaccountants.com\",\"role\":\"manager\"}', 'approved', '4', '2026-06-18 15:03:34', '2026-06-18 18:48:20', NULL, NULL, '{\"address\":\"Updated QC address\"}', '2026-06-18 18:48:20', '1', '2026-06-18 15:03:34', '2026-06-18 18:48:20');
INSERT INTO `profile_edit_request` VALUES ('3', '6', '6', '6', 'Update SSS and PhilHealth numbers.', '{\"email\":\"carlo.delacruz@lbaccountants.com\",\"role\":\"manager\"}', 'used', '6', '2026-06-18 15:03:34', '2026-06-20 15:03:34', '2026-06-18 15:03:34', '6', '{\"sss_number\":\"34-1234567-8\",\"philhealth_number\":\"12-345678901-2\"}', '2026-06-18 18:48:09', '1', '2026-06-18 15:03:34', '2026-06-18 18:48:09');
INSERT INTO `profile_edit_request` VALUES ('4', '7', '7', '7', 'Upload missing NBI clearance.', '{\"email\":\"nina.garcia@lbaccountants.com\",\"role\":\"staff\"}', 'rejected', NULL, NULL, NULL, NULL, NULL, '{\"document_nbi_clearance\":1}', '2026-06-18 16:24:36', '1', '2026-06-18 15:03:34', '2026-06-18 16:24:36');
INSERT INTO `profile_edit_request` VALUES ('5', '8', '8', '8', 'Update payroll bank details note.', '{\"email\":\"rafael.torres@lbaccountants.com\",\"role\":\"staff\"}', 'rejected', '5', '2026-06-18 15:03:34', NULL, NULL, NULL, '{\"note\":\"Use payroll portal instead\"}', '2026-06-18 18:48:13', '1', '2026-06-18 15:03:34', '2026-06-18 18:48:13');
INSERT INTO `profile_edit_request` VALUES ('6', '9', '9', '9', 'Update profile photo and contact details.', '{\"email\":\"sofia.mendoza@lbaccountants.com\",\"role\":\"staff\"}', 'approved', '4', '2026-06-18 15:03:34', '2026-06-18 18:48:19', NULL, NULL, '{\"photo\":\"profile_2026_009.jpg\"}', '2026-06-18 18:48:19', '1', '2026-06-18 15:03:34', '2026-06-18 18:48:19');
INSERT INTO `profile_edit_request` VALUES ('7', '10', '10', '10', 'Correct TIN number.', '{\"email\":\"diego.cruz@lbaccountants.com\",\"role\":\"staff\"}', 'used', '6', '2026-06-18 15:03:34', '2026-06-20 15:03:34', '2026-06-18 15:03:34', '10', '{\"tin_number\":\"123-456-789-000\"}', '2026-06-18 18:48:12', '1', '2026-06-18 15:03:34', '2026-06-18 18:48:12');
INSERT INTO `profile_edit_request` VALUES ('8', '11', '11', '11', 'Update diploma and TOR documents.', '{\"email\":\"patricia.villanueva@lbaccountants.com\",\"role\":\"staff\"}', 'approved', '1', '2026-06-18 16:24:49', '2026-06-18 18:48:13', NULL, NULL, '{\"document_diploma_tor\":1}', '2026-06-18 18:48:13', '1', '2026-06-18 15:03:34', '2026-06-18 18:48:13');
INSERT INTO `profile_edit_request` VALUES ('9', '12', '12', '12', 'Update tax and Pag-IBIG details.', '{\"email\":\"gabriel.ramos@lbaccountants.com\",\"role\":\"staff\"}', 'approved', '4', '2026-06-18 15:03:34', '2026-06-18 18:48:18', NULL, NULL, '{\"pagibig_number\":\"1234-5678-9012\"}', '2026-06-18 18:48:18', '1', '2026-06-18 15:03:34', '2026-06-18 18:48:18');
INSERT INTO `profile_edit_request` VALUES ('10', '13', '13', '13', 'Correct barangay clearance status.', '{\"email\":\"eliza.flores@lbaccountants.com\",\"role\":\"staff\"}', 'rejected', '6', '2026-06-18 15:03:34', NULL, NULL, NULL, '{\"document_barangay_clearance\":0}', '2026-06-18 18:48:11', '1', '2026-06-18 15:03:34', '2026-06-18 18:48:11');

-- -----------------------------------------------
-- Table: `project_messages`
-- -----------------------------------------------
DROP TABLE IF EXISTS `project_messages`;
CREATE TABLE `project_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `project_id` int(11) NOT NULL,
  `sender_id` int(11) NOT NULL,
  `message` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_project` (`project_id`),
  KEY `idx_sender` (`sender_id`),
  KEY `idx_created` (`created_at`),
  CONSTRAINT `project_messages_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_messages_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `projects`
-- -----------------------------------------------
DROP TABLE IF EXISTS `projects`;
CREATE TABLE `projects` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `client_id` int(11) DEFAULT NULL,
  `manager_id` int(11) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `status` enum('active','completed','archived','on_hold') DEFAULT 'active',
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `budget` decimal(15,2) DEFAULT 0.00,
  `actual_cost` decimal(15,2) DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `manager_id` (`manager_id`),
  KEY `created_by` (`created_by`),
  KEY `idx_project_name` (`name`),
  KEY `idx_status` (`status`),
  KEY `idx_client` (`client_id`),
  CONSTRAINT `projects_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `client` (`client_id`) ON DELETE SET NULL,
  CONSTRAINT `projects_ibfk_2` FOREIGN KEY (`manager_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `projects_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `projects` VALUES ('1', 'Apex 2026 Tax Compliance', 'Monthly VAT, withholding tax, and annual ITR preparation support.', '1', '5', '5', 'active', '2026-05-01 09:00:00', '2026-06-30 18:00:00', '180000.00', '42000.00', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `projects` VALUES ('2', 'Blue Harbor Audit Support', 'Audit documentation review and ledger reconciliation.', '2', '6', '6', 'active', '2026-05-05 09:00:00', '2026-07-15 18:00:00', '220000.00', '51000.00', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `projects` VALUES ('3', 'Cedar Food Bookkeeping Cleanup', 'Daily transaction recording and bank reconciliation.', '3', '5', '5', 'active', '2026-04-15 09:00:00', '2026-06-15 18:00:00', '150000.00', '64000.00', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `projects` VALUES ('4', 'Dawn Clinics Payroll Review', 'Payroll precheck and employee benefit computation.', '4', '4', '4', 'active', '2026-05-01 09:00:00', '2026-05-31 18:00:00', '120000.00', '38000.00', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `projects` VALUES ('5', 'Evergreen Construction Tax Filing', 'Quarterly tax filing and supporting schedules.', '5', '6', '6', 'on_hold', '2026-06-01 09:00:00', '2026-08-31 18:00:00', '260000.00', '25000.00', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `projects` VALUES ('6', 'Falcon Logistics Receivables Review', 'Client receivable aging and collection follow-up.', '6', '5', '5', 'active', '2026-05-10 09:00:00', '2026-07-10 18:00:00', '170000.00', '47000.00', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `projects` VALUES ('7', 'Golden Spoon Monthly Close', 'Month-end closing, journal entries, and financial statements.', '7', '4', '4', 'completed', '2026-04-01 09:00:00', '2026-04-30 18:00:00', '130000.00', '118000.00', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `projects` VALUES ('8', 'Harborview Property Audit', 'Internal audit procedures for property management controls.', '8', '6', '6', 'active', '2026-05-20 09:00:00', '2026-08-20 18:00:00', '300000.00', '68000.00', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `projects` VALUES ('9', 'Iris Pharma Compliance Package', 'Compliance checklist and regulatory filing package.', '9', '5', '5', 'active', '2026-06-01 09:00:00', '2026-07-31 18:00:00', '190000.00', '33000.00', '2026-06-18 15:03:33', '2026-06-18 15:03:33');
INSERT INTO `projects` VALUES ('10', 'Jade Tech Systems Review', 'IT service revenue recognition and account review.', '10', '4', '4', 'active', '2026-05-15 09:00:00', '2026-07-30 18:00:00', '210000.00', '55000.00', '2026-06-18 15:03:33', '2026-06-18 15:03:33');

-- -----------------------------------------------
-- Table: `request_rate_limits`
-- -----------------------------------------------
DROP TABLE IF EXISTS `request_rate_limits`;
CREATE TABLE `request_rate_limits` (
  `client_key` varchar(64) NOT NULL,
  `request_count` int(11) NOT NULL DEFAULT 0,
  `window_start` datetime NOT NULL,
  `last_request_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`client_key`),
  KEY `idx_request_rate_limits_last_request_at` (`last_request_at`),
  KEY `idx_request_rate_limits_window_start` (`window_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `request_rate_limits` VALUES ('6c158ad7c9a448c19630b60008091995', '1', '2026-06-25 18:31:06', '2026-06-25 18:31:06', '2026-06-18 06:47:15', '2026-06-25 18:31:06');
INSERT INTO `request_rate_limits` VALUES ('sid_j7evitgd1hsl3tknejng8vlgom', '1', '2026-06-25 18:28:55', '2026-06-25 18:28:55', '2026-06-25 18:28:55', '2026-06-25 18:28:55');
INSERT INTO `request_rate_limits` VALUES ('sid_mujakrkvpsjtpt4c1gqao0f4ep', '2', '2026-06-25 18:28:58', '2026-06-25 18:28:59', '2026-06-25 18:28:58', '2026-06-25 18:28:59');

-- -----------------------------------------------
-- Table: `roles`
-- -----------------------------------------------
DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `role_id` int(11) NOT NULL AUTO_INCREMENT,
  `role_name` varchar(50) NOT NULL,
  `description` text DEFAULT NULL,
  `permissions` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`permissions`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `status` varchar(20) NOT NULL DEFAULT 'active',
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `role_name` (`role_name`),
  KEY `idx_role_name` (`role_name`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `roles` VALUES ('1', 'Admin', 'System Administrator with full access', '{\"all\": true}', '2026-06-18 06:45:55', '2026-06-18 06:45:55', 'active');
INSERT INTO `roles` VALUES ('2', 'Manager', 'Project and team manager', '{\"projects\": \"all\", \"tasks\": \"all\", \"clients\": \"all\", \"services\": \"all\", \"payroll\": \"all\", \"suppliers\": \"all\", \"employees\": \"read\", \"branches\": \"read\", \"analytics\": \"all\", \"leave\": \"all\", \"attendance\": \"all\", \"settings\": \"denied\", \"activity_log\": \"read\"}', '2026-06-18 06:45:55', '2026-06-18 06:45:55', 'active');
INSERT INTO `roles` VALUES ('3', 'Staff', 'Staff member with limited access', '{\"tasks\": \"assigned\", \"documents\": \"upload\", \"profile\": \"own\", \"leave\": \"own\"}', '2026-06-18 06:45:55', '2026-06-18 06:45:55', 'active');

-- -----------------------------------------------
-- Table: `service_checklists`
-- -----------------------------------------------
DROP TABLE IF EXISTS `service_checklists`;
CREATE TABLE `service_checklists` (
  `checklist_id` int(11) NOT NULL AUTO_INCREMENT,
  `service_id` int(11) NOT NULL,
  `task_name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `is_required` tinyint(1) DEFAULT 1,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `deleted_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`checklist_id`),
  KEY `idx_service` (`service_id`),
  KEY `idx_service_deleted` (`service_id`,`is_deleted`),
  CONSTRAINT `service_checklists_ibfk_1` FOREIGN KEY (`service_id`) REFERENCES `services` (`service_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `service_checklists` VALUES ('1', '1', 'Review Financial Statements', 'Analyze balance sheet and income statement', '1', '0', NULL, '2026-06-18 06:45:57', '2026-06-18 06:45:57');
INSERT INTO `service_checklists` VALUES ('2', '1', 'Check Compliance', 'Ensure regulatory compliance', '1', '0', NULL, '2026-06-18 06:45:57', '2026-06-18 06:45:57');
INSERT INTO `service_checklists` VALUES ('3', '2', 'Collect Receipts', 'Gather all expense receipts', '1', '0', NULL, '2026-06-18 06:45:57', '2026-06-18 06:45:57');
INSERT INTO `service_checklists` VALUES ('4', '2', 'File Returns', 'Submit tax returns to authorities', '1', '0', NULL, '2026-06-18 06:45:57', '2026-06-18 06:45:57');
INSERT INTO `service_checklists` VALUES ('5', '3', 'Record Daily Transactions', 'Log all sales and expenses', '1', '0', NULL, '2026-06-18 06:45:57', '2026-06-18 06:45:57');
INSERT INTO `service_checklists` VALUES ('6', '3', 'Reconcile Bank Accounts', 'Match ledger with bank statements', '1', '0', NULL, '2026-06-18 06:45:57', '2026-06-18 06:45:57');

-- -----------------------------------------------
-- Table: `services`
-- -----------------------------------------------
DROP TABLE IF EXISTS `services`;
CREATE TABLE `services` (
  `service_id` int(11) NOT NULL AUTO_INCREMENT,
  `service_name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `certificate_template_path` varchar(255) DEFAULT NULL,
  `certificate_template_name` varchar(255) DEFAULT NULL,
  `certificate_template_mime` varchar(120) DEFAULT NULL,
  `certificate_template_size` int(11) DEFAULT NULL,
  `certificate_template_updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`service_id`),
  UNIQUE KEY `service_name` (`service_name`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `services` VALUES ('1', 'Audit', 'Financial statement auditing and compliance', '2026-06-18 06:45:57', '2026-06-18 06:45:57', NULL, NULL, NULL, NULL, NULL);
INSERT INTO `services` VALUES ('2', 'Tax', 'Tax return preparation and filing', '2026-06-18 06:45:57', '2026-06-18 06:45:57', NULL, NULL, NULL, NULL, NULL);
INSERT INTO `services` VALUES ('3', 'Bookkeeping', 'Daily financial record keeping', '2026-06-18 06:45:57', '2026-06-18 06:45:57', NULL, NULL, NULL, NULL, NULL);

-- -----------------------------------------------
-- Table: `settings`
-- -----------------------------------------------
DROP TABLE IF EXISTS `settings`;
CREATE TABLE `settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) NOT NULL,
  `setting_value` text DEFAULT NULL,
  `setting_type` varchar(50) DEFAULT 'string',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `setting_key` (`setting_key`),
  KEY `idx_key` (`setting_key`)
) ENGINE=InnoDB AUTO_INCREMENT=8024 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `settings` VALUES ('1', 'company_name', 'LLB Accountants', 'string', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `settings` VALUES ('2', 'company_email', 'info@lbaccountants.com', 'string', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `settings` VALUES ('3', 'timezone', 'Asia/Manila', 'string', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `settings` VALUES ('4', 'date_format', 'Y-m-d', 'string', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `settings` VALUES ('5', 'currency', 'PHP', 'string', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `settings` VALUES ('6', 'tax_rate', '12', 'number', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `settings` VALUES ('7', 'fiscal_year_start', '01-01', 'string', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `settings` VALUES ('8', 'intruder_ip_lockout_enabled', '1', 'boolean', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `settings` VALUES ('9', 'intruder_ip_lockout_threshold', '10', 'number', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `settings` VALUES ('10', 'intruder_ip_lockout_window_hours', '24', 'number', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `settings` VALUES ('11', 'session_timeout_enabled', '1', 'boolean', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `settings` VALUES ('12', 'session_timeout_manager_minutes', '30', 'number', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `settings` VALUES ('13', 'session_timeout_staff_minutes', '30', 'number', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `settings` VALUES ('14', 'captcha_timeout_seconds', '300', 'number', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `settings` VALUES ('15', 'login_failed_attempt_limit', '5', 'number', '2026-06-18 06:45:55', '2026-06-18 06:45:55');
INSERT INTO `settings` VALUES ('16', 'admin_dashboard_access_pin', '1433', 'string', '2026-06-18 06:45:58', '2026-06-18 06:45:58');
INSERT INTO `settings` VALUES ('17', 'lockout_enabled', '1', 'boolean', '2026-06-18 06:45:58', '2026-06-18 06:45:58');
INSERT INTO `settings` VALUES ('18', 'lockout_threshold_manager', '3', 'number', '2026-06-18 06:45:58', '2026-06-18 06:45:58');
INSERT INTO `settings` VALUES ('19', 'lockout_threshold_staff', '3', 'number', '2026-06-18 06:45:58', '2026-06-18 06:45:58');
INSERT INTO `settings` VALUES ('20', 'lockout_window_hours', '24', 'number', '2026-06-18 06:45:58', '2026-06-18 06:45:58');
INSERT INTO `settings` VALUES ('21', 'rate_limit_enabled', '1', 'boolean', '2026-06-18 06:45:58', '2026-06-18 06:45:58');
INSERT INTO `settings` VALUES ('22', 'rate_limit_max_requests', '180', 'number', '2026-06-18 06:45:58', '2026-06-18 06:45:58');
INSERT INTO `settings` VALUES ('23', 'rate_limit_window_seconds', '60', 'number', '2026-06-18 06:45:58', '2026-06-18 06:45:58');
INSERT INTO `settings` VALUES ('30', 'login_math_captcha_enabled', '1', 'boolean', '2026-06-18 06:47:14', '2026-06-18 06:47:14');
INSERT INTO `settings` VALUES ('54', 'security_lockdown_enabled', '0', 'boolean', '2026-06-18 06:47:51', '2026-06-18 06:47:51');
INSERT INTO `settings` VALUES ('55', 'security_lockdown_reason', '', 'string', '2026-06-18 06:47:51', '2026-06-18 06:47:51');
INSERT INTO `settings` VALUES ('56', 'security_lockdown_updated_at', '', 'string', '2026-06-18 06:47:51', '2026-06-18 06:47:51');
INSERT INTO `settings` VALUES ('57', 'security_lockdown_updated_by', '', 'string', '2026-06-18 06:47:51', '2026-06-18 06:47:51');
INSERT INTO `settings` VALUES ('5993', 'password_max_age_days', '30', 'number', '2026-06-19 16:31:21', '2026-06-19 16:38:37');
INSERT INTO `settings` VALUES ('5994', 'password_history_count', '5', 'number', '2026-06-19 16:31:21', '2026-06-19 16:38:37');
INSERT INTO `settings` VALUES ('8014', 'backup_frequency', 'daily', 'string', '2026-06-25 18:30:59', '2026-06-25 18:30:59');
INSERT INTO `settings` VALUES ('8015', 'backup_time', '18:31', 'string', '2026-06-25 18:30:59', '2026-06-25 18:30:59');
INSERT INTO `settings` VALUES ('8016', 'backup_day_of_week', '0', 'string', '2026-06-25 18:30:59', '2026-06-25 18:30:59');
INSERT INTO `settings` VALUES ('8017', 'backup_day_of_month', '1', 'string', '2026-06-25 18:30:59', '2026-06-25 18:30:59');

-- -----------------------------------------------
-- Table: `shift_schedule`
-- -----------------------------------------------
DROP TABLE IF EXISTS `shift_schedule`;
CREATE TABLE `shift_schedule` (
  `shift_schedule_id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `shift_date` date NOT NULL,
  `shift_start` time NOT NULL,
  `shift_end` time NOT NULL,
  `shift_type` enum('morning','afternoon','night','flexible') DEFAULT 'morning',
  `status` enum('scheduled','completed','cancelled','no_show') DEFAULT 'scheduled',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`shift_schedule_id`),
  KEY `idx_employee` (`employee_id`),
  KEY `idx_date` (`shift_date`),
  KEY `idx_status` (`status`),
  CONSTRAINT `shift_schedule_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `task_assignment_event`
-- -----------------------------------------------
DROP TABLE IF EXISTS `task_assignment_event`;
CREATE TABLE `task_assignment_event` (
  `event_id` int(11) NOT NULL AUTO_INCREMENT,
  `task_id` int(11) NOT NULL,
  `previous_assigned_to` int(11) DEFAULT NULL,
  `new_assigned_to` int(11) NOT NULL,
  `assigned_by` int(11) DEFAULT NULL,
  `event_kind` enum('assigned','reassigned') NOT NULL DEFAULT 'assigned',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`event_id`),
  KEY `idx_task_assignment_new_user` (`new_assigned_to`,`created_at`),
  KEY `idx_task_assignment_created` (`created_at`),
  KEY `idx_task_assignment_task` (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `task_collaborators`
-- -----------------------------------------------
DROP TABLE IF EXISTS `task_collaborators`;
CREATE TABLE `task_collaborators` (
  `collaborator_id` int(11) NOT NULL AUTO_INCREMENT,
  `task_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `shift_mode` enum('none','current_time','range') NOT NULL DEFAULT 'none',
  `shift_start` datetime DEFAULT NULL,
  `shift_end` datetime DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`collaborator_id`),
  UNIQUE KEY `uq_task_collaborator` (`task_id`,`user_id`),
  KEY `idx_task_collaborators_user` (`user_id`),
  KEY `idx_task_collaborators_shift_start` (`shift_start`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `task_collaborators_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `task_collaborators_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `task_collaborators_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `task_completion_reports`
-- -----------------------------------------------
DROP TABLE IF EXISTS `task_completion_reports`;
CREATE TABLE `task_completion_reports` (
  `report_id` int(11) NOT NULL AUTO_INCREMENT,
  `task_id` int(11) NOT NULL,
  `project_id` int(11) DEFAULT NULL,
  `client_id` int(11) DEFAULT NULL,
  `report_body` text NOT NULL,
  `sent_by` int(11) DEFAULT NULL,
  `sent_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`report_id`),
  UNIQUE KEY `uq_task_completion_report_task` (`task_id`),
  KEY `idx_task_completion_report_project` (`project_id`),
  KEY `idx_task_completion_report_client` (`client_id`),
  KEY `idx_task_completion_report_sender` (`sent_by`),
  CONSTRAINT `fk_task_completion_report_client` FOREIGN KEY (`client_id`) REFERENCES `client` (`client_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_task_completion_report_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_task_completion_report_sender` FOREIGN KEY (`sent_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_task_completion_report_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `tasks`
-- -----------------------------------------------
DROP TABLE IF EXISTS `tasks`;
CREATE TABLE `tasks` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `assigned_to` int(11) DEFAULT NULL,
  `require_completion_proof` tinyint(1) NOT NULL DEFAULT 0,
  `created_by` int(11) DEFAULT NULL,
  `project_id` int(11) DEFAULT NULL,
  `status` enum('pending','in_progress','completed','cancelled') DEFAULT 'pending',
  `priority` enum('low','medium','high','urgent') DEFAULT 'medium',
  `due_date` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `idx_status` (`status`),
  KEY `idx_assigned` (`assigned_to`),
  KEY `idx_project` (`project_id`),
  CONSTRAINT `tasks_ibfk_1` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tasks_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tasks_ibfk_3` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------
-- Table: `users`
-- -----------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `first_name` varchar(50) DEFAULT NULL,
  `last_name` varchar(50) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `role` enum('admin','manager','staff') DEFAULT 'staff',
  `status` enum('active','inactive','suspended','locked') DEFAULT 'active',
  `photo` varchar(255) DEFAULT NULL,
  `sss_number` varchar(30) DEFAULT NULL,
  `pagibig_number` varchar(30) DEFAULT NULL,
  `philhealth_number` varchar(30) DEFAULT NULL,
  `tin_number` varchar(30) DEFAULT NULL,
  `document_resume` tinyint(1) NOT NULL DEFAULT 0,
  `document_nbi_clearance` tinyint(1) NOT NULL DEFAULT 0,
  `document_police_clearance` tinyint(1) NOT NULL DEFAULT 0,
  `document_barangay_clearance` tinyint(1) NOT NULL DEFAULT 0,
  `document_birth_certificate` tinyint(1) NOT NULL DEFAULT 0,
  `document_medical_certificate` tinyint(1) NOT NULL DEFAULT 0,
  `document_diploma_tor` tinyint(1) NOT NULL DEFAULT 0,
  `document_employment_contract` tinyint(1) NOT NULL DEFAULT 0,
  `employee_id` int(11) DEFAULT NULL,
  `branch_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `reset_request_count` int(11) DEFAULT 0,
  `reset_request_window_start` datetime DEFAULT NULL,
  `reset_token_hash` varchar(64) DEFAULT NULL,
  `reset_token_expires` datetime DEFAULT NULL,
  `must_reset_password` tinyint(1) NOT NULL DEFAULT 0,
  `last_login` timestamp NULL DEFAULT NULL,
  `password_change_otp_hash` varchar(64) DEFAULT NULL,
  `password_change_otp_expires` datetime DEFAULT NULL,
  `forgot_admin_email_code_hash` varchar(64) DEFAULT NULL,
  `forgot_admin_email_code_expires` datetime DEFAULT NULL,
  `password_changed_at` datetime DEFAULT NULL,
  `password_expires_at` datetime DEFAULT NULL,
  `totp_secret` varchar(64) DEFAULT NULL,
  `totp_enabled` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `uniq_users_first_last_name` (`first_name`,`last_name`),
  KEY `branch_id` (`branch_id`),
  KEY `idx_username` (`username`),
  KEY `idx_role` (`role`),
  KEY `idx_employee` (`employee_id`),
  KEY `idx_users_email` (`email`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE SET NULL,
  CONSTRAINT `users_ibfk_2` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`branch_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `users` VALUES ('1', 'admin', '$2y$10$kwBbF7Bagh18guDKeDDe9eK/PC5c8X4jPW93fHu4fO9WfhDzg.1jq', 'kristinedais14@gmail.com', 'System', 'Administrator', NULL, 'admin', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '1', '1', '2026-06-18 06:45:55', '2026-06-25 18:28:59', '0', NULL, NULL, NULL, '0', '2026-06-25 18:28:59', NULL, NULL, NULL, NULL, '2026-06-18 06:47:51', '2026-07-18 06:47:51', 'ZJ4H2PNIJWFPWYYISWEMZADV', '0');
INSERT INTO `users` VALUES ('2', 'manager', '$2y$10$kwBbF7Bagh18guDKeDDe9eK/PC5c8X4jPW93fHu4fO9WfhDzg.1jq', 'manager@lbaccountants.com', 'Default', 'Manager', NULL, 'manager', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '2', '1', '2026-06-18 06:45:55', '2026-06-19 16:38:37', '0', NULL, NULL, NULL, '0', NULL, NULL, NULL, NULL, NULL, NULL, '2026-07-19 16:38:37', NULL, '0');
INSERT INTO `users` VALUES ('3', 'staff', '$2y$10$kwBbF7Bagh18guDKeDDe9eK/PC5c8X4jPW93fHu4fO9WfhDzg.1jq', 'staff@lbaccountants.com', 'Default', 'Staff', NULL, 'staff', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '3', '1', '2026-06-18 06:45:55', '2026-06-19 16:38:37', '0', NULL, NULL, NULL, '0', NULL, NULL, NULL, NULL, NULL, NULL, '2026-07-19 16:38:37', NULL, '0');
INSERT INTO `users` VALUES ('4', 'miguel.santos', '$2y$10$kwBbF7Bagh18guDKeDDe9eK/PC5c8X4jPW93fHu4fO9WfhDzg.1jq', 'miguel.santos@lbaccountants.com', 'Miguel', 'Santos', '1990-04-12', 'admin', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '4', '2', '2026-06-18 15:03:33', '2026-06-19 16:38:37', '0', NULL, NULL, NULL, '1', NULL, NULL, NULL, NULL, NULL, '2026-06-18 15:03:33', '2026-07-18 15:03:33', NULL, '0');
INSERT INTO `users` VALUES ('5', 'angela.reyes', '$2y$10$kwBbF7Bagh18guDKeDDe9eK/PC5c8X4jPW93fHu4fO9WfhDzg.1jq', 'angela.reyes@lbaccountants.com', 'Angela', 'Reyes', '1992-08-21', 'manager', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '5', '3', '2026-06-18 15:03:33', '2026-06-19 16:38:37', '0', NULL, NULL, NULL, '1', NULL, NULL, NULL, NULL, NULL, '2026-06-18 15:03:33', '2026-07-18 15:03:33', NULL, '0');
INSERT INTO `users` VALUES ('6', 'carlo.delacruz', '$2y$10$kwBbF7Bagh18guDKeDDe9eK/PC5c8X4jPW93fHu4fO9WfhDzg.1jq', 'carlo.delacruz@lbaccountants.com', 'Carlo', 'Dela Cruz', '1988-11-03', 'manager', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '6', '4', '2026-06-18 15:03:33', '2026-06-19 16:38:37', '0', NULL, NULL, NULL, '1', NULL, NULL, NULL, NULL, NULL, '2026-06-18 15:03:33', '2026-07-18 15:03:33', NULL, '0');
INSERT INTO `users` VALUES ('7', 'nina.garcia', '$2y$10$kwBbF7Bagh18guDKeDDe9eK/PC5c8X4jPW93fHu4fO9WfhDzg.1jq', 'nina.garcia@lbaccountants.com', 'Nina', 'Garcia', '1995-01-30', 'staff', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '7', '5', '2026-06-18 15:03:33', '2026-06-19 16:38:37', '0', NULL, NULL, NULL, '1', NULL, NULL, NULL, NULL, NULL, '2026-06-18 15:03:33', '2026-07-18 15:03:33', NULL, '0');
INSERT INTO `users` VALUES ('8', 'rafael.torres', '$2y$10$kwBbF7Bagh18guDKeDDe9eK/PC5c8X4jPW93fHu4fO9WfhDzg.1jq', 'rafael.torres@lbaccountants.com', 'Rafael', 'Torres', '1991-07-17', 'staff', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '8', '6', '2026-06-18 15:03:33', '2026-06-19 16:38:37', '0', NULL, NULL, NULL, '1', NULL, NULL, NULL, NULL, NULL, '2026-06-18 15:03:33', '2026-07-18 15:03:33', NULL, '0');
INSERT INTO `users` VALUES ('9', 'sofia.mendoza', '$2y$10$kwBbF7Bagh18guDKeDDe9eK/PC5c8X4jPW93fHu4fO9WfhDzg.1jq', 'sofia.mendoza@lbaccountants.com', 'Sofia', 'Mendoza', '1993-12-09', 'staff', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '9', '2', '2026-06-18 15:03:33', '2026-06-19 16:38:37', '0', NULL, NULL, NULL, '1', NULL, NULL, NULL, NULL, NULL, '2026-06-18 15:03:33', '2026-07-18 15:03:33', NULL, '0');
INSERT INTO `users` VALUES ('10', 'diego.cruz', '$2y$10$kwBbF7Bagh18guDKeDDe9eK/PC5c8X4jPW93fHu4fO9WfhDzg.1jq', 'diego.cruz@lbaccountants.com', 'Diego', 'Cruz', '1989-05-25', 'staff', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '10', '3', '2026-06-18 15:03:33', '2026-06-19 16:38:37', '0', NULL, NULL, NULL, '1', NULL, NULL, NULL, NULL, NULL, '2026-06-18 15:03:33', '2026-07-18 15:03:33', NULL, '0');
INSERT INTO `users` VALUES ('11', 'patricia.villanueva', '$2y$10$kwBbF7Bagh18guDKeDDe9eK/PC5c8X4jPW93fHu4fO9WfhDzg.1jq', 'patricia.villanueva@lbaccountants.com', 'Patricia', 'Villanueva', '1994-10-14', 'staff', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '11', '4', '2026-06-18 15:03:33', '2026-06-19 16:38:37', '0', NULL, NULL, NULL, '1', NULL, NULL, NULL, NULL, NULL, '2026-06-18 15:03:33', '2026-07-18 15:03:33', NULL, '0');
INSERT INTO `users` VALUES ('12', 'gabriel.ramos', '$2y$10$kwBbF7Bagh18guDKeDDe9eK/PC5c8X4jPW93fHu4fO9WfhDzg.1jq', 'gabriel.ramos@lbaccountants.com', 'Gabriel', 'Ramos', '1987-03-08', 'staff', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '12', '5', '2026-06-18 15:03:33', '2026-06-19 16:38:37', '0', NULL, NULL, NULL, '1', NULL, NULL, NULL, NULL, NULL, '2026-06-18 15:03:33', '2026-07-18 15:03:33', NULL, '0');
INSERT INTO `users` VALUES ('13', 'eliza.flores', '$2y$10$kwBbF7Bagh18guDKeDDe9eK/PC5c8X4jPW93fHu4fO9WfhDzg.1jq', 'eliza.flores@lbaccountants.com', 'Eliza', 'Flores', '1996-06-19', 'staff', 'active', NULL, NULL, NULL, NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '13', '6', '2026-06-18 15:03:33', '2026-06-19 16:38:37', '0', NULL, NULL, NULL, '1', NULL, NULL, NULL, NULL, NULL, '2026-06-18 15:03:33', '2026-07-18 15:03:33', NULL, '0');

-- -----------------------------------------------
-- Table: `work`
-- -----------------------------------------------
DROP TABLE IF EXISTS `work`;
CREATE TABLE `work` (
  `work_id` int(11) NOT NULL AUTO_INCREMENT,
  `project_id` int(11) DEFAULT NULL,
  `employee_id` int(11) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `status` enum('pending','in_progress','completed','cancelled') DEFAULT 'pending',
  `hours_logged` decimal(5,2) DEFAULT 0.00,
  `priority` enum('low','medium','high','urgent') DEFAULT 'medium',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`work_id`),
  KEY `idx_status` (`status`),
  KEY `idx_project` (`project_id`),
  KEY `idx_employee` (`employee_id`),
  CONSTRAINT `work_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `work_ibfk_2` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
