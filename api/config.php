<?php
/**
 * Database Configuration for LLB Accountants System
 * 
 * This file contains database connection settings and helper functions
 */

// Configure session for cross-origin requests (Next.js frontend)
if (session_status() === PHP_SESSION_NONE) {
    $isHttps =
        (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443)
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string)$_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https');

    // Set session cookie parameters for cross-origin support
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $isHttps,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    session_start();
}

// Database configuration
define('DB_HOST', 'localhost');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'llb');

// Timezone configuration
date_default_timezone_set('Asia/Manila');

/**
 * Get database connection
 * @return mysqli Database connection object
 */
function getDBConnection() {
    try {
        $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    } catch (Throwable $e) {
        http_response_code(500);
        die(json_encode([
            'success' => false,
            'message' => 'Database connection failed. Check MariaDB account permissions.',
        ]));
    }
    
    if ($conn->connect_error) {
        http_response_code(500);
        die(json_encode([
            'success' => false,
            'message' => 'Database connection failed: ' . $conn->connect_error
        ]));
    }
    
    // Set charset to utf8mb4
    $conn->set_charset('utf8mb4');
    
    return $conn;
}

/**
 * Close database connection
 * @param mysqli $conn Database connection object
 */
function closeDBConnection($conn) {
    if ($conn) {
        $conn->close();
    }
}

/**
 * Resolve the cache file used to throttle runtime schema checks.
 * @return string
 */
function getRuntimeSchemaCacheFile() {
    static $cacheFile = null;
    if ($cacheFile !== null) {
        return $cacheFile;
    }

    $baseTempDir = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR);
    $cacheDir = $baseTempDir . DIRECTORY_SEPARATOR . 'capstone1-runtime-cache';
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0775, true);
    }

    $cacheFile = $cacheDir . '/schema-checks.json';
    return $cacheFile;
}

/**
 * Load the runtime schema cache from disk.
 * @return array<string, mixed>
 */
function readRuntimeSchemaCache() {
    $file = getRuntimeSchemaCacheFile();
    if (!is_file($file)) {
        return [];
    }

    $raw = @file_get_contents($file);
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
        return $decoded;
    }

    return [];
}

/**
 * Persist the runtime schema cache to disk.
 * @param array<string, mixed> $cache
 * @return void
 */
function writeRuntimeSchemaCache($cache) {
    $file = getRuntimeSchemaCacheFile();
    @file_put_contents($file, json_encode($cache, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
}

/**
 * Run a schema guard at most once per cache window.
 * Cache keys should be versioned so new schema work can force a fresh check.
 * @param string $cacheKey
 * @param callable $callback
 * @param int $ttlSeconds
 * @return bool True when the callback ran, false when skipped due to cache.
 */
function runRuntimeSchemaUpgradeOnce($cacheKey, $callback, $ttlSeconds = 43200) {
    $key = trim((string)$cacheKey);
    if ($key === '' || !is_callable($callback)) {
        return false;
    }

    $cache = readRuntimeSchemaCache();
    $now = time();
    $ttl = max(60, intval($ttlSeconds));
    $lastCheckedAt = intval($cache[$key]['checked_at'] ?? 0);

    if ($lastCheckedAt > 0 && ($now - $lastCheckedAt) < $ttl) {
        return false;
    }

    $callback();

    $cache[$key] = [
        'checked_at' => $now,
    ];
    writeRuntimeSchemaCache($cache);

    return true;
}

/**
 * Execute a prepared statement with error handling
 * @param mysqli $conn Database connection
 * @param string $sql SQL query with placeholders
 * @param string $types Parameter types (e.g., 'ssi' for string, string, int)
 * @param array $params Parameters to bind
 * @return mysqli_stmt|false Prepared statement or false on failure
 */
function executePreparedStatement($conn, $sql, $types = '', $params = []) {
    $stmt = $conn->prepare($sql);
    
    if (!$stmt) {
        return false;
    }
    
    if ($types && !empty($params)) {
        $stmt->bind_param($types, ...$params);
    }
    
    if (!$stmt->execute()) {
        $stmt->close();
        return false;
    }
    
    return $stmt;
}

/**
 * Sanitize input data
 * @param mixed $data Input data to sanitize
 * @return mixed Sanitized data
 */
function sanitizeInput($data) {
    if (is_array($data)) {
        return array_map('sanitizeInput', $data);
    }
    
    if (is_string($data)) {
        $data = trim($data);
        $data = stripslashes($data);
        $data = htmlspecialchars($data, ENT_QUOTES, 'UTF-8');
    }
    
    return $data;
}

/**
 * Validate required fields
 * @param array $data Data array to validate
 * @param array $required Required field names
 * @return array|null Array of missing fields or null if all present
 */
function validateRequiredFields($data, $required) {
    $missing = [];
    
    foreach ($required as $field) {
        if (!isset($data[$field]) || $data[$field] === '') {
            $missing[] = $field;
        }
    }
    
    return empty($missing) ? null : $missing;
}

/**
 * Log activity
 * @param mysqli $conn Database connection
 * @param int $user_id User ID
 * @param string $action Action performed
 * @param string $description Action description
 * @param string $activity_type Type of activity
 */
function logActivity($conn, $user_id, $action, $description = '', $activity_type = 'general') {
    // Mark that this request has already written an activity log entry.
    $GLOBALS['__activity_logged_manually'] = true;

    $ip_address = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    
    $sql = "INSERT INTO activity_log (user_id, action, description, activity_type, ip_address) 
            VALUES (?, ?, ?, ?, ?)";
    
    $stmt = $conn->prepare($sql);
    if ($stmt) {
        $stmt->bind_param('issss', $user_id, $action, $description, $activity_type, $ip_address);
        $stmt->execute();
        $stmt->close();
    }
}

/**
 * Ensure a table column exists before newer code depends on it.
 * Safe to call multiple times.
 * @param mysqli $conn
 * @param string $table
 * @param string $column
 * @param string $alterSql
 * @return void
 */
function ensureTableColumn($conn, $table, $column, $alterSql) {
    if (!$conn || !($conn instanceof mysqli)) return;

    $dbName = DB_NAME;
    $checkSql = "SELECT 1
                 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
                 LIMIT 1";
    $checkStmt = $conn->prepare($checkSql);
    if (!$checkStmt) return;

    $checkStmt->bind_param('sss', $dbName, $table, $column);
    $checkStmt->execute();
    $exists = $checkStmt->get_result()->num_rows > 0;
    $checkStmt->close();

    if (!$exists) {
        $conn->query($alterSql);
    }
}

/**
 * Ensure a table index exists before performance-sensitive queries rely on it.
 * Safe to call multiple times.
 * @param mysqli $conn
 * @param string $table
 * @param string $indexName
 * @param string $alterSql
 * @return void
 */
function ensureTableIndex($conn, $table, $indexName, $alterSql) {
    if (!$conn || !($conn instanceof mysqli)) return;

    $dbName = DB_NAME;
    $checkSql = "SELECT 1
                 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
                 LIMIT 1";
    $checkStmt = $conn->prepare($checkSql);
    if (!$checkStmt) return;

    $checkStmt->bind_param('sss', $dbName, $table, $indexName);
    $checkStmt->execute();
    $exists = $checkStmt->get_result()->num_rows > 0;
    $checkStmt->close();

    if (!$exists) {
        $conn->query($alterSql);
    }
}

/**
 * Ensure payroll status enum includes the archived state.
 * Safe to call multiple times.
 * @param mysqli $conn
 * @return void
 */
function ensurePayrollStatusEnum($conn) {
    if (!$conn || !($conn instanceof mysqli)) return;

    $dbName = DB_NAME;
    $checkSql = "SELECT COLUMN_TYPE
                 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payroll' AND COLUMN_NAME = 'status'
                 LIMIT 1";
    $checkStmt = $conn->prepare($checkSql);
    if (!$checkStmt) return;

    $checkStmt->bind_param('s', $dbName);
    $checkStmt->execute();
    $row = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    $columnType = strtolower((string)($row['COLUMN_TYPE'] ?? ''));
    if ($columnType !== '' && strpos($columnType, "'archived'") === false) {
        $conn->query("ALTER TABLE payroll MODIFY COLUMN status ENUM('draft', 'pending', 'approved', 'paid', 'archived') NOT NULL DEFAULT 'draft'");
    }
}

/**
 * Ensure payslip dispute status enum includes the cancelled state.
 * Safe to call multiple times.
 * @param mysqli $conn
 * @return void
 */
function ensurePayslipDisputeStatusEnum($conn) {
    if (!$conn || !($conn instanceof mysqli)) return;

    $dbName = DB_NAME;
    $checkSql = "SELECT COLUMN_TYPE
                 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payslip_dispute' AND COLUMN_NAME = 'status'
                 LIMIT 1";
    $checkStmt = $conn->prepare($checkSql);
    if (!$checkStmt) return;

    $checkStmt->bind_param('s', $dbName);
    $checkStmt->execute();
    $row = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    $columnType = strtolower((string)($row['COLUMN_TYPE'] ?? ''));
    if ($columnType !== '' && strpos($columnType, "'cancelled'") === false) {
        $conn->query("ALTER TABLE payslip_dispute MODIFY COLUMN status ENUM('submitted','in_review','resolved','rejected','closed','cancelled') NOT NULL DEFAULT 'submitted'");
    }
}

/**
 * Ensure user status enum includes locked (and suspended) states.
 * Safe to call multiple times.
 * @param mysqli $conn
 * @return void
 */
function ensureUserStatusEnum($conn) {
    if (!$conn || !($conn instanceof mysqli)) return;

    $dbName = DB_NAME;
    $checkSql = "SELECT COLUMN_TYPE
                 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'status'
                 LIMIT 1";
    $checkStmt = $conn->prepare($checkSql);
    if (!$checkStmt) return;

    $checkStmt->bind_param('s', $dbName);
    $checkStmt->execute();
    $row = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    $columnType = strtolower((string)($row['COLUMN_TYPE'] ?? ''));
    if ($columnType === '') return;

    $required = ["'active'", "'inactive'", "'suspended'", "'locked'"];
    $needsUpdate = false;
    foreach ($required as $token) {
        if (strpos($columnType, $token) === false) {
            $needsUpdate = true;
            break;
        }
    }

    if (!$needsUpdate) return;

    $conn->query(
        "ALTER TABLE users MODIFY COLUMN status ENUM('active', 'inactive', 'suspended', 'locked') NOT NULL DEFAULT 'active'"
    );

    // Best-effort repair: previously invalid enum writes can store empty strings.
    $resetColCheck = $conn->prepare(
        "SELECT 1
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'reset_request_count'
         LIMIT 1"
    );
    if ($resetColCheck) {
        $resetColCheck->bind_param('s', $dbName);
        $resetColCheck->execute();
        $hasResetCount = $resetColCheck->get_result()->num_rows > 0;
        $resetColCheck->close();
        if ($hasResetCount) {
            $conn->query(
                "UPDATE users
                 SET status = 'locked'
                 WHERE (status IS NULL OR status = '')
                   AND reset_request_count > 0"
            );
        }
    }
}

/**
 * Ensure Phase 1 storage tables exist.
 * Safe to call multiple times.
 * @param mysqli $conn
 * @return void
 */
function ensurePhaseOneTables($conn) {
    if (!$conn || !($conn instanceof mysqli)) return;

    $conn->query(
        "CREATE TABLE IF NOT EXISTS attendance_records (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    ensureTableColumn(
        $conn,
        'deduction_type',
        'threshold_amount',
        "ALTER TABLE deduction_type ADD COLUMN threshold_amount DECIMAL(10,2) DEFAULT 0 AFTER default_amount"
    );
    ensureTableColumn(
        $conn,
        'deduction_type',
        'threshold_mode',
        "ALTER TABLE deduction_type ADD COLUMN threshold_mode ENUM('none','above','below') NOT NULL DEFAULT 'none' AFTER threshold_amount"
    );
    ensureTableColumn(
        $conn,
        'deduction_type',
        'threshold_rules',
        "ALTER TABLE deduction_type ADD COLUMN threshold_rules TEXT NULL AFTER threshold_mode"
    );
    ensureTableColumn(
        $conn,
        'deduction_type',
        'base_floor',
        "ALTER TABLE deduction_type ADD COLUMN base_floor DECIMAL(10,2) DEFAULT 0 AFTER threshold_rules"
    );
    ensureTableColumn(
        $conn,
        'deduction_type',
        'base_cap',
        "ALTER TABLE deduction_type ADD COLUMN base_cap DECIMAL(10,2) DEFAULT 0 AFTER base_floor"
    );

    ensureTableColumn(
        $conn,
        'payroll',
        'clothing_allowance',
        "ALTER TABLE payroll ADD COLUMN clothing_allowance DECIMAL(10,2) DEFAULT 0 AFTER bonus"
    );
    ensureTableColumn(
        $conn,
        'payroll',
        'travel_allowance',
        "ALTER TABLE payroll ADD COLUMN travel_allowance DECIMAL(10,2) DEFAULT 0 AFTER clothing_allowance"
    );
    ensureTableColumn(
        $conn,
        'payroll',
        'salary_adjustment',
        "ALTER TABLE payroll ADD COLUMN salary_adjustment DECIMAL(10,2) DEFAULT 0 AFTER travel_allowance"
    );
    ensureTableColumn(
        $conn,
        'payroll',
        'late_deduction',
        "ALTER TABLE payroll ADD COLUMN late_deduction DECIMAL(10,2) DEFAULT 0 AFTER salary_adjustment"
    );
    ensureTableColumn(
        $conn,
        'payroll',
        'absence_deduction',
        "ALTER TABLE payroll ADD COLUMN absence_deduction DECIMAL(10,2) DEFAULT 0 AFTER late_deduction"
    );
    ensureTableColumn(
        $conn,
        'payroll',
        'cash_advance_deduction',
        "ALTER TABLE payroll ADD COLUMN cash_advance_deduction DECIMAL(10,2) DEFAULT 0 AFTER philhealth_contribution"
    );
    $dbName = DB_NAME;
    $cashAdvanceManualCheck = $conn->prepare(
        "SELECT 1
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payroll' AND COLUMN_NAME = 'cash_advance_manual_deduction'
         LIMIT 1"
    );
    if ($cashAdvanceManualCheck) {
        $cashAdvanceManualCheck->bind_param('s', $dbName);
        $cashAdvanceManualCheck->execute();
        $hasManualCashAdvance = $cashAdvanceManualCheck->get_result()->num_rows > 0;
        $cashAdvanceManualCheck->close();
        if (!$hasManualCashAdvance) {
            $conn->query(
                "ALTER TABLE payroll ADD COLUMN cash_advance_manual_deduction DECIMAL(10,2) DEFAULT 0 AFTER cash_advance_deduction"
            );
            $conn->query(
                "UPDATE payroll
                 SET cash_advance_manual_deduction = cash_advance_deduction"
            );
        }
    }
    ensureTableColumn(
        $conn,
        'payroll',
        'laptop_loan_deduction',
        "ALTER TABLE payroll ADD COLUMN laptop_loan_deduction DECIMAL(10,2) DEFAULT 0 AFTER cash_advance_deduction"
    );
    ensurePayrollStatusEnum($conn);
    ensureTableIndex(
        $conn,
        'payroll',
        'idx_payroll_employee_period',
        "ALTER TABLE payroll ADD INDEX idx_payroll_employee_period (employee_id, pay_period_start, pay_period_end)"
    );
    ensureTableIndex(
        $conn,
        'payroll',
        'idx_payroll_status_period',
        "ALTER TABLE payroll ADD INDEX idx_payroll_status_period (status, pay_period_start, pay_period_end, created_at)"
    );
    ensureTableIndex(
        $conn,
        'payroll',
        'idx_payroll_created',
        "ALTER TABLE payroll ADD INDEX idx_payroll_created (created_at DESC)"
    );

    $conn->query(
        "CREATE TABLE IF NOT EXISTS payroll_user_archive (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    ensureTableColumn(
        $conn,
        'payroll_user_archive',
        'is_archived',
        "ALTER TABLE payroll_user_archive ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0 AFTER user_id"
    );
    ensureTableColumn(
        $conn,
        'payroll_user_archive',
        'archived_at',
        "ALTER TABLE payroll_user_archive ADD COLUMN archived_at DATETIME NULL AFTER is_archived"
    );
    ensureTableColumn(
        $conn,
        'payroll_user_archive',
        'deleted_at',
        "ALTER TABLE payroll_user_archive ADD COLUMN deleted_at DATETIME NULL AFTER archived_at"
    );

    $conn->query(
        "CREATE TABLE IF NOT EXISTS payslip_dispute (
            dispute_id INT AUTO_INCREMENT PRIMARY KEY,
            payroll_id INT NOT NULL,
            employee_id INT NOT NULL,
            issue_type ENUM('missing_overtime','deduction_error','allowance_missing','wrong_period','other') NOT NULL DEFAULT 'other',
            dispute_reason TEXT NOT NULL,
            expected_value DECIMAL(12,2) NULL,
            current_value DECIMAL(12,2) NULL,
            status ENUM('submitted','in_review','resolved','rejected','closed','cancelled') NOT NULL DEFAULT 'submitted',
            priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
            sla_due_at DATETIME NULL,
            resolution_notes TEXT NULL,
            resolved_by INT NULL,
            resolved_at DATETIME NULL,
            created_by INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            is_archived TINYINT(1) NOT NULL DEFAULT 0,
            archived_at DATETIME NULL,
            archived_by INT NULL,
            INDEX idx_dispute_payroll (payroll_id),
            INDEX idx_dispute_employee (employee_id),
            INDEX idx_dispute_status (status),
            INDEX idx_dispute_archived (is_archived),
            INDEX idx_dispute_sla (sla_due_at),
            CONSTRAINT fk_dispute_payroll FOREIGN KEY (payroll_id) REFERENCES payroll(id) ON DELETE CASCADE,
            CONSTRAINT fk_dispute_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
            CONSTRAINT fk_dispute_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_dispute_resolved_by FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
            CONSTRAINT fk_dispute_archived_by FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    ensurePayslipDisputeStatusEnum($conn);

    ensureTableColumn(
        $conn,
        'payslip_dispute',
        'is_archived',
        "ALTER TABLE payslip_dispute ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0 AFTER updated_at"
    );
    ensureTableColumn(
        $conn,
        'payslip_dispute',
        'archived_at',
        "ALTER TABLE payslip_dispute ADD COLUMN archived_at DATETIME NULL AFTER is_archived"
    );
    ensureTableColumn(
        $conn,
        'payslip_dispute',
        'archived_by',
        "ALTER TABLE payslip_dispute ADD COLUMN archived_by INT NULL AFTER archived_at"
    );

    $conn->query(
        "CREATE TABLE IF NOT EXISTS payslip_dispute_comment (
            comment_id INT AUTO_INCREMENT PRIMARY KEY,
            dispute_id INT NOT NULL,
            user_id INT NOT NULL,
            comment_text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_dispute_comment_dispute (dispute_id),
            INDEX idx_dispute_comment_created (created_at),
            CONSTRAINT fk_dispute_comment_dispute FOREIGN KEY (dispute_id) REFERENCES payslip_dispute(dispute_id) ON DELETE CASCADE,
            CONSTRAINT fk_dispute_comment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $conn->query(
        "CREATE TABLE IF NOT EXISTS overtime_request (
            overtime_request_id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id INT NOT NULL,
            work_date DATE NOT NULL,
            hours_requested DECIMAL(5,2) NOT NULL DEFAULT 0,
            reason TEXT NOT NULL,
            status ENUM('submitted','approved','rejected','cancelled') NOT NULL DEFAULT 'submitted',
            sla_due_at DATETIME NULL,
            approved_by INT NULL,
            approved_at DATETIME NULL,
            manager_notes TEXT NULL,
            created_by INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            is_archived TINYINT(1) NOT NULL DEFAULT 0,
            archived_at DATETIME NULL,
            INDEX idx_ot_employee (employee_id),
            INDEX idx_ot_status (status),
            INDEX idx_ot_sla (sla_due_at),
            CONSTRAINT fk_ot_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
            CONSTRAINT fk_ot_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_ot_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    ensureTableColumn(
        $conn,
        'overtime_request',
        'is_archived',
        "ALTER TABLE overtime_request ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0 AFTER updated_at"
    );
    ensureTableColumn(
        $conn,
        'overtime_request',
        'archived_at',
        "ALTER TABLE overtime_request ADD COLUMN archived_at DATETIME NULL AFTER is_archived"
    );

    $conn->query(
        "CREATE TABLE IF NOT EXISTS cash_advance_request (
            cash_advance_request_id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id INT NOT NULL,
            request_date DATE NOT NULL,
            amount DECIMAL(12,2) NOT NULL DEFAULT 0,
            reason TEXT NOT NULL,
            status ENUM('submitted','approved','rejected','cancelled') NOT NULL DEFAULT 'submitted',
            sla_due_at DATETIME NULL,
            approved_by INT NULL,
            approved_at DATETIME NULL,
            manager_notes TEXT NULL,
            deducted_payroll_id INT NULL,
            deducted_at DATETIME NULL,
            created_by INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            is_archived TINYINT(1) NOT NULL DEFAULT 0,
            archived_at DATETIME NULL,
            archived_by INT NULL,
            INDEX idx_cash_adv_employee (employee_id),
            INDEX idx_cash_adv_status (status),
            INDEX idx_cash_adv_request_date (request_date),
            INDEX idx_cash_adv_sla (sla_due_at),
            INDEX idx_cash_adv_payroll (deducted_payroll_id),
            INDEX idx_cash_adv_archived (is_archived),
            CONSTRAINT fk_cash_adv_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
            CONSTRAINT fk_cash_adv_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_cash_adv_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
            CONSTRAINT fk_cash_adv_payroll FOREIGN KEY (deducted_payroll_id) REFERENCES payroll(id) ON DELETE SET NULL,
            CONSTRAINT fk_cash_adv_archived_by FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    ensureTableColumn(
        $conn,
        'cash_advance_request',
        'is_archived',
        "ALTER TABLE cash_advance_request ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0 AFTER updated_at"
    );
    ensureTableColumn(
        $conn,
        'cash_advance_request',
        'archived_at',
        "ALTER TABLE cash_advance_request ADD COLUMN archived_at DATETIME NULL AFTER is_archived"
    );
    ensureTableColumn(
        $conn,
        'cash_advance_request',
        'archived_by',
        "ALTER TABLE cash_advance_request ADD COLUMN archived_by INT NULL AFTER archived_at"
    );
    ensureTableIndex(
        $conn,
        'cash_advance_request',
        'idx_cash_adv_archived',
        "ALTER TABLE cash_advance_request ADD INDEX idx_cash_adv_archived (is_archived)"
    );
    ensureTableIndex(
        $conn,
        'cash_advance_request',
        'idx_cash_adv_status_payroll',
        "ALTER TABLE cash_advance_request ADD INDEX idx_cash_adv_status_payroll (status, deducted_payroll_id)"
    );

    $conn->query(
        "CREATE TABLE IF NOT EXISTS approval_sla_config (
            item_key VARCHAR(50) PRIMARY KEY,
            sla_hours INT NOT NULL DEFAULT 48,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $conn->query(
        "INSERT INTO approval_sla_config (item_key, sla_hours) VALUES
            ('leave', 48),
            ('overtime', 24),
            ('cash_advance', 24),
            ('payslip_dispute', 72)
         ON DUPLICATE KEY UPDATE item_key = item_key"
    );

    $conn->query(
        "CREATE TABLE IF NOT EXISTS exception_queue (
            exception_id INT AUTO_INCREMENT PRIMARY KEY,
            source_type ENUM('attendance_import','payroll_precheck','approval_sla','payslip_dispute','overtime_request','leave_request','system') NOT NULL,
            source_record_id VARCHAR(120) NOT NULL,
            title VARCHAR(255) NOT NULL,
            details TEXT NULL,
            severity ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
            status ENUM('open','in_progress','resolved','ignored') NOT NULL DEFAULT 'open',
            owner_role ENUM('admin','manager') NOT NULL DEFAULT 'admin',
            metadata_json LONGTEXT NULL,
            created_by INT NULL,
            resolved_by INT NULL,
            resolved_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_exception_source (source_type, source_record_id),
            INDEX idx_exception_status (status),
            INDEX idx_exception_severity (severity),
            INDEX idx_exception_owner (owner_role),
            CONSTRAINT fk_exception_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
            CONSTRAINT fk_exception_resolved_by FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $conn->query(
        "CREATE TABLE IF NOT EXISTS audit_trail (
            audit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NULL,
            entity_type VARCHAR(80) NOT NULL,
            entity_id VARCHAR(120) NOT NULL,
            action VARCHAR(50) NOT NULL,
            before_values LONGTEXT NULL,
            after_values LONGTEXT NULL,
            changed_fields TEXT NULL,
            source_endpoint VARCHAR(120) NULL,
            ip_address VARCHAR(45) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_audit_entity (entity_type, entity_id),
            INDEX idx_audit_user (user_id),
            INDEX idx_audit_action (action),
            INDEX idx_audit_created (created_at),
            CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

/**
 * Normalize payload for stable audit diff generation.
 * @param mixed $data
 * @return array
 */
function normalizeAuditPayload($data) {
    if (!is_array($data)) {
        return [];
    }

    $normalized = [];
    foreach ($data as $key => $value) {
        if (is_object($value)) {
            $value = (array)$value;
        }

        if (is_array($value)) {
            $normalized[$key] = json_encode($value, JSON_UNESCAPED_UNICODE);
        } elseif ($value === null) {
            $normalized[$key] = null;
        } elseif (is_bool($value)) {
            $normalized[$key] = $value ? 1 : 0;
        } else {
            $normalized[$key] = (string)$value;
        }
    }

    ksort($normalized);
    return $normalized;
}

/**
 * Build a comma-separated changed field list between before/after payloads.
 * @param array $before
 * @param array $after
 * @return string
 */
function resolveAuditChangedFields($before, $after) {
    $beforeNorm = normalizeAuditPayload($before);
    $afterNorm = normalizeAuditPayload($after);

    $keys = array_unique(array_merge(array_keys($beforeNorm), array_keys($afterNorm)));
    sort($keys);

    $changed = [];
    foreach ($keys as $key) {
        $left = $beforeNorm[$key] ?? null;
        $right = $afterNorm[$key] ?? null;
        if ($left !== $right) {
            $changed[] = $key;
        }
    }

    return implode(',', $changed);
}

/**
 * Hardened audit trail entry with before/after values.
 * @param mysqli $conn
 * @param int|null $user_id
 * @param string $entity_type
 * @param string|int $entity_id
 * @param string $action
 * @param array|null $before
 * @param array|null $after
 * @param string $source_endpoint
 * @return void
 */
function logAuditTrail($conn, $user_id, $entity_type, $entity_id, $action, $before = null, $after = null, $source_endpoint = '') {
    if (!$conn || !($conn instanceof mysqli)) return;
    ensurePhaseOneTables($conn);

    $uid = (is_numeric($user_id) && (int)$user_id > 0) ? (int)$user_id : null;
    $entityType = trim((string)$entity_type);
    $entityId = trim((string)$entity_id);
    $actionName = trim((string)$action);
    $source = trim((string)$source_endpoint);

    if ($entityType === '' || $entityId === '' || $actionName === '') {
        return;
    }

    $beforeArr = is_array($before) ? $before : [];
    $afterArr = is_array($after) ? $after : [];

    $beforeJson = !empty($beforeArr) ? json_encode($beforeArr, JSON_UNESCAPED_UNICODE) : null;
    $afterJson = !empty($afterArr) ? json_encode($afterArr, JSON_UNESCAPED_UNICODE) : null;
    $changedFields = resolveAuditChangedFields($beforeArr, $afterArr);
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    if ($uid === null) {
        $sql = "INSERT INTO audit_trail
                (user_id, entity_type, entity_id, action, before_values, after_values, changed_fields, source_endpoint, ip_address)
                VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)";
        $stmt = $conn->prepare($sql);
        if (!$stmt) return;
        $stmt->bind_param(
            'ssssssss',
            $entityType,
            $entityId,
            $actionName,
            $beforeJson,
            $afterJson,
            $changedFields,
            $source,
            $ip
        );
    } else {
        $sql = "INSERT INTO audit_trail
                (user_id, entity_type, entity_id, action, before_values, after_values, changed_fields, source_endpoint, ip_address)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
        $stmt = $conn->prepare($sql);
        if (!$stmt) return;
        $uidParam = $uid;
        $stmt->bind_param(
            'issssssss',
            $uidParam,
            $entityType,
            $entityId,
            $actionName,
            $beforeJson,
            $afterJson,
            $changedFields,
            $source,
            $ip
        );
    }
    $stmt->execute();
    $stmt->close();
}

/**
 * Upsert an exception record for admin review.
 * @param mysqli $conn
 * @param string $source_type
 * @param string $source_record_id
 * @param string $title
 * @param string $details
 * @param string $severity
 * @param string $owner_role
 * @param array|null $metadata
 * @param int|null $created_by
 * @return void
 */
function upsertExceptionQueue(
    $conn,
    $source_type,
    $source_record_id,
    $title,
    $details = '',
    $severity = 'medium',
    $owner_role = 'admin',
    $metadata = null,
    $created_by = null
) {
    if (!$conn || !($conn instanceof mysqli)) return;
    ensurePhaseOneTables($conn);

    $sourceType = trim((string)$source_type);
    $sourceRecordId = trim((string)$source_record_id);
    if ($sourceType === '' || $sourceRecordId === '') return;

    $allowedSeverity = ['low', 'medium', 'high', 'critical'];
    $level = in_array($severity, $allowedSeverity, true) ? $severity : 'medium';
    $owner = in_array($owner_role, ['admin', 'manager'], true) ? $owner_role : 'admin';
    $metaJson = is_array($metadata) ? json_encode($metadata, JSON_UNESCAPED_UNICODE) : null;
    $creator = (is_numeric($created_by) && (int)$created_by > 0) ? (int)$created_by : null;

    if ($creator === null) {
        $sql = "INSERT INTO exception_queue
                (source_type, source_record_id, title, details, severity, status, owner_role, metadata_json, created_by)
                VALUES (?, ?, ?, ?, ?, 'open', ?, ?, NULL)
                ON DUPLICATE KEY UPDATE
                    title = VALUES(title),
                    details = VALUES(details),
                    severity = VALUES(severity),
                    owner_role = VALUES(owner_role),
                    metadata_json = VALUES(metadata_json),
                    updated_at = CURRENT_TIMESTAMP";
        $stmt = $conn->prepare($sql);
        if (!$stmt) return;
        $stmt->bind_param('sssssss', $sourceType, $sourceRecordId, $title, $details, $level, $owner, $metaJson);
    } else {
        $sql = "INSERT INTO exception_queue
                (source_type, source_record_id, title, details, severity, status, owner_role, metadata_json, created_by)
                VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    title = VALUES(title),
                    details = VALUES(details),
                    severity = VALUES(severity),
                    owner_role = VALUES(owner_role),
                    metadata_json = VALUES(metadata_json),
                    updated_at = CURRENT_TIMESTAMP";
        $stmt = $conn->prepare($sql);
        if (!$stmt) return;
        $creatorParam = $creator;
        $stmt->bind_param('sssssssi', $sourceType, $sourceRecordId, $title, $details, $level, $owner, $metaJson, $creatorParam);
    }
    $stmt->execute();
    $stmt->close();
}

?>
