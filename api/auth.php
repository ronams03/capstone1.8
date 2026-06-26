<?php
/**
 * Authentication API
 * Handles user login, logout, and session management
 */

require_once 'config.php';
require_once 'utils.php';
require_once 'mailer.php';
require_once 'password_policy_utils.php';

// Session is started by config.php
const LOGIN_AUTO_CHECK_MIN_DELAY_MS = 0;
const LOGIN_AUTO_CHECK_MAX_DELAY_MS = 0;
const LOGIN_SUSPICIOUS_RISK_THRESHOLD_DEFAULT = 3;
const LOGIN_NETWORK_RTT_UNSTABLE_MS = 1200;
const LOGIN_NETWORK_MIN_DOWNLINK_MBPS = 0.7;
const LOGIN_SERVER_CONNECTIVITY_TIMEOUT_SECONDS = 0.05;

setCORSHeaders();

$method = getRequestMethod();
$conn = getDBConnection();

// Keep auth/session queries compatible with older schemas.
ensureAuthSchema($conn);
ensurePasswordPolicySchema($conn);

// Apply browser lockout globally for auth endpoints as well
// so blocked browsers cannot access login/session/auth flows.
enforceIntruderBrowserLockout($conn);

switch ($method) {
    case 'POST':
        $action = $_GET['action'] ?? 'login';
        if ($action === 'login') {
            handleLogin($conn);
        } elseif ($action === 'login_precheck') {
            handleLoginPrecheck($conn);
        } elseif ($action === 'login_complete') {
            handleLoginComplete($conn);
        } elseif ($action === 'logout') {
            handleLogout($conn);
        } elseif ($action === 'register') {
            handleRegister($conn);
        } elseif ($action === 'forgot_password') {
            handleForgotPassword($conn);
        } elseif ($action === 'forgot_password_totp') {
            handleForgotPasswordTOTP($conn);
        } elseif ($action === 'forgot_password_verify_totp') {
            handleForgotPasswordVerifyTOTP($conn);
        } elseif ($action === 'forgot_password_verify_email_code') {
            handleForgotPasswordVerifyEmailCode($conn);
        } elseif ($action === 'reset_password') {
            handleResetPassword($conn);
        } elseif ($action === 'first_login_change_password') {
            handleFirstLoginChangePassword($conn);
        } elseif ($action === 'admin_update_profile') {
            handleAdminUpdateProfile($conn);
        } elseif ($action === 'password_policy') {
            handlePasswordPolicy($conn);
        } elseif ($action === 'update_password_policy') {
            handleUpdatePasswordPolicy($conn);
        } elseif ($action === 'request_password_change_otp') {
            handleRequestPasswordChangeOTP($conn);
        } elseif ($action === 'change_password_with_otp') {
            handleChangePasswordWithOTP($conn);
        } elseif ($action === 'totp_pair') {
            handleTOTPpair($conn);
        } elseif ($action === 'totp_validate') {
            handleTOTPvalidate($conn);
        } elseif ($action === 'change_password_with_totp') {
            handleChangePasswordWithTOTP($conn);
        } elseif ($action === 'admin_verify_dashboard_pin') {
            handleAdminVerifyDashboardPin($conn);
        } elseif ($action === 'admin_update_dashboard_pin') {
            handleAdminUpdateDashboardPin($conn);
        } elseif ($action === 'data_deletion_request_code') {
            handleDataDeletionRequestCode($conn);
        } elseif ($action === 'data_deletion_verify_code') {
            handleDataDeletionVerifyCode($conn);
        } else {
            sendError('Invalid action', 400);
        }
        break;
    case 'GET':
        $getAction = $_GET['action'] ?? 'session';
        if ($getAction === 'totp_status') {
            handleTOTPStatus($conn);
        } elseif ($getAction === 'lockdown_status') {
            handlePublicLockdownStatus($conn);
        } elseif ($getAction === 'intruder_status') {
            handlePublicIntruderStatus($conn);
        } elseif ($getAction === 'data_deletion_access_status') {
            handleDataDeletionAccessStatus($conn);
        } elseif ($getAction === 'password_policy') {
            handlePasswordPolicy($conn);
        } else {
            handleCheckSession($conn);
        }
        break;
    default:
        sendError('Method not allowed', 405);
}

/**
 * Safely add a column to a table if it does not already exist.
 * Avoids mysqli_sql_exception on duplicate column in PHP 8.x strict mode.
 */
function ensureColumn($conn, $table, $column, $definition) {
    $db = DB_NAME;
    $check = $conn->prepare(
        "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1"
    );
    $check->bind_param('sss', $db, $table, $column);
    $check->execute();
    $exists = $check->get_result()->num_rows > 0;
    $check->close();
    if (!$exists) {
        $conn->query("ALTER TABLE `$table` ADD COLUMN $definition");
    }
}

function ensureAuthSchema($conn) {
    ensureColumn($conn, 'users', 'must_reset_password', 'must_reset_password TINYINT(1) NOT NULL DEFAULT 0');
    ensureColumn($conn, 'users', 'reset_token_hash', 'reset_token_hash VARCHAR(64) NULL');
    ensureColumn($conn, 'users', 'reset_token_expires', 'reset_token_expires DATETIME NULL');
    ensureColumn($conn, 'users', 'reset_request_count', 'reset_request_count INT DEFAULT 0');
    ensureColumn($conn, 'users', 'reset_request_window_start', 'reset_request_window_start DATETIME NULL');
    ensureColumn($conn, 'users', 'password_change_otp_hash', 'password_change_otp_hash VARCHAR(64) NULL');
    ensureColumn($conn, 'users', 'password_change_otp_expires', 'password_change_otp_expires DATETIME NULL');
    ensureColumn($conn, 'users', 'forgot_admin_email_code_hash', 'forgot_admin_email_code_hash VARCHAR(64) NULL');
    ensureColumn($conn, 'users', 'forgot_admin_email_code_expires', 'forgot_admin_email_code_expires DATETIME NULL');
    if (function_exists('ensureUserStatusEnum')) {
        ensureUserStatusEnum($conn);
    }
}

function setActiveSessionUserFromRecord($user, $mustResetPassword = false) {
    $userId = intval($user['id'] ?? 0);
    if ($userId <= 0) {
        sendError('Invalid user session data', 500);
    }

    $employeeId = isset($user['employee_id']) && $user['employee_id'] !== '' ? intval($user['employee_id']) : null;
    $branchId = isset($user['branch_id']) && $user['branch_id'] !== '' ? intval($user['branch_id']) : null;
    $role = strtolower(trim((string)($user['role'] ?? '')));

    $_SESSION['user_id'] = $userId;
    $_SESSION['username'] = (string)($user['username'] ?? '');
    $_SESSION['role'] = $role;
    $_SESSION['employee_id'] = $employeeId;
    $_SESSION['branch_id'] = $branchId;
    $_SESSION['must_reset_password'] = $mustResetPassword ? 1 : 0;
    $_SESSION['password_change_reason'] = $mustResetPassword ? getPasswordChangeReasonForUser($user) : '';
    $_SESSION['session_started_at'] = time();
    $_SESSION['last_activity_at'] = time();

    // Security-sensitive approval should always be re-verified after identity switches.
    clearDataDeletionAccessSession();
}

function getRoleDashboardPath($role) {
    $normalizedRole = strtolower(trim((string)$role));
    if ($normalizedRole === 'admin') return '/admin/dashboard';
    if ($normalizedRole === 'manager') return '/manager/dashboard';
    return '/dashboard';
}

function fetchAuthUserForSessionSwitch($conn, $userId) {
    $id = intval($userId);
    if ($id <= 0) return null;

    $stmt = $conn->prepare(
        "SELECT id, username, role, status, employee_id, branch_id, must_reset_password, first_name, last_name, password_changed_at, password_expires_at
         FROM users
         WHERE id = ?
         LIMIT 1"
    );
    if (!$stmt) {
        sendError('Failed to fetch account for session switch', 500);
    }
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $user ?: null;
}

function normalizePersonName($value, $maxLen = 50) {
    $str = trim((string)$value);
    if ($str === '') return '';
    $str = preg_replace('/\s+/', ' ', $str);
    $str = sanitizeInput($str);
    if (strlen($str) > $maxLen) $str = substr($str, 0, $maxLen);
    return $str;
}

function ensureUniqueUserFullName($conn, $firstName, $lastName, $excludeUserId = null) {
    $first = normalizePersonName($firstName, 50);
    $last = normalizePersonName($lastName, 50);
    if ($first === '' || $last === '') return;

    if ($excludeUserId !== null) {
        $stmt = $conn->prepare(
            "SELECT id
             FROM users
             WHERE LOWER(TRIM(first_name)) = LOWER(TRIM(?))
               AND LOWER(TRIM(last_name)) = LOWER(TRIM(?))
               AND id <> ?
             LIMIT 1"
        );
        $id = intval($excludeUserId);
        $stmt->bind_param('ssi', $first, $last, $id);
    } else {
        $stmt = $conn->prepare(
            "SELECT id
             FROM users
             WHERE LOWER(TRIM(first_name)) = LOWER(TRIM(?))
               AND LOWER(TRIM(last_name)) = LOWER(TRIM(?))
             LIMIT 1"
        );
        $stmt->bind_param('ss', $first, $last);
    }

    $stmt->execute();
    $exists = $stmt->get_result()->num_rows > 0;
    $stmt->close();

    if ($exists) {
        sendError('A user with the same first name and last name already exists.', 409);
    }
}

function normalizeEmailIdentifier($value) {
    $email = strtolower(trim((string)$value));
    if ($email === '') return '';
    return sanitizeInput($email);
}

function parseNullablePositiveInt($value) {
    if (!isset($value) || $value === '') return null;
    if (!is_numeric($value)) return null;
    $n = intval($value);
    return $n > 0 ? $n : null;
}

function assertBranchExistsForRegister($conn, $branchId) {
    $id = intval($branchId);
    if ($id <= 0) sendError('Invalid branch ID', 400);

    $stmt = $conn->prepare("SELECT branch_id FROM branches WHERE branch_id = ? LIMIT 1");
    if (!$stmt) sendError('Failed to validate branch', 500);
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $exists = $stmt->get_result()->num_rows > 0;
    $stmt->close();

    if (!$exists) {
        sendError('Selected branch not found', 404);
    }
}

function assertManagerBranchAvailabilityForRegister($conn, $role, $branchId) {
    $normalizedRole = strtolower(trim((string)$role));
    $resolvedBranchId = parseNullablePositiveInt($branchId);

    if ($normalizedRole !== 'manager' || $resolvedBranchId === null) {
        return;
    }

    assertBranchExistsForRegister($conn, $resolvedBranchId);

    $stmt = $conn->prepare(
        "SELECT id
         FROM users
         WHERE LOWER(TRIM(role)) = 'manager'
           AND branch_id = ?
         LIMIT 1"
    );
    if (!$stmt) sendError('Failed to validate branch manager assignment', 500);
    $stmt->bind_param('i', $resolvedBranchId);
    $stmt->execute();
    $hasExistingManager = $stmt->get_result()->num_rows > 0;
    $stmt->close();

    if ($hasExistingManager) {
        sendError('This branch already has a manager assigned. Only one manager is allowed per branch.', 409);
    }
}

function buildUsernameBaseFromEmail($email) {
    $normalized = normalizeEmailIdentifier($email);
    if ($normalized === '') return 'user';

    $localPart = $normalized;
    $atPos = strpos($normalized, '@');
    if ($atPos !== false) {
        $localPart = substr($normalized, 0, $atPos);
    }

    $base = preg_replace('/[^a-z0-9._-]/', '', strtolower($localPart));
    $base = trim((string)$base, '._-');
    if ($base === '') $base = 'user';
    if (strlen($base) > 42) $base = substr($base, 0, 42);
    return $base;
}

function generateUniqueUsernameFromEmail($conn, $email) {
    $base = buildUsernameBaseFromEmail($email);

    for ($attempt = 0; $attempt < 1000; $attempt++) {
        if ($attempt === 0) {
            $candidate = $base;
        } else {
            $suffix = '_' . (string)$attempt;
            $maxBaseLen = 50 - strlen($suffix);
            if ($maxBaseLen < 1) $maxBaseLen = 1;
            $candidate = substr($base, 0, $maxBaseLen) . $suffix;
        }

        $check = $conn->prepare("SELECT id FROM users WHERE username = ? LIMIT 1");
        if (!$check) {
            sendError('Failed to validate generated username', 500);
        }
        $check->bind_param('s', $candidate);
        $check->execute();
        $exists = $check->get_result()->num_rows > 0;
        $check->close();

        if (!$exists) {
            return $candidate;
        }
    }

    return 'user_' . substr(bin2hex(random_bytes(8)), 0, 12);
}

/**
 * Best-effort setup for intruder browser lockout storage + default settings.
 * Note: setting keys/table name keep "ip" for backward compatibility.
 */
function ensureIntruderIPLockoutStorage($conn) {
    $conn->query(
        "CREATE TABLE IF NOT EXISTS intruder_ip_lockouts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ip_address VARCHAR(45) NOT NULL UNIQUE,
            failed_count INT NOT NULL DEFAULT 0,
            window_start DATETIME NULL,
            blocked_until DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_intruder_blocked_until (blocked_until),
            INDEX idx_intruder_window_start (window_start)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $conn->query(
        "INSERT INTO settings (setting_key, setting_value, setting_type) VALUES
            ('intruder_ip_lockout_enabled', '1', 'boolean'),
            ('intruder_ip_lockout_threshold', '10', 'number'),
            ('intruder_ip_lockout_window_hours', '24', 'number')
         ON DUPLICATE KEY UPDATE setting_key = setting_key"
    );
}

/**
 * Resolve browser identifier provided by frontend.
 * Fallbacks ensure a stable-ish key even if header is absent.
 */
function getClientBrowserIdentifier() {
    $fromHeader = trim((string)($_SERVER['HTTP_X_CLIENT_BROWSER_ID'] ?? ''));
    if ($fromHeader !== '') {
        $clean = preg_replace('/[^A-Za-z0-9_-]/', '', $fromHeader);
        if ($clean !== '') {
            return substr($clean, 0, 45);
        }
    }

    $sid = session_id();
    if ($sid) {
        $cleanSid = preg_replace('/[^A-Za-z0-9]/', '', $sid);
        if ($cleanSid !== '') {
            return substr('sid_' . $cleanSid, 0, 45);
        }
    }

    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? 'unknown');
    $remote = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    return substr(hash('sha256', $ua . '|' . $remote), 0, 45);
}

/**
 * Load intruder browser lockout config from settings table.
 */
function getIntruderIPLockoutConfig($conn) {
    $cfg = [
        'intruder_ip_lockout_enabled' => '1',
        'intruder_ip_lockout_threshold' => '10',
        'intruder_ip_lockout_window_hours' => '24',
    ];

    $keys = array_keys($cfg);
    $placeholders = implode(',', array_fill(0, count($keys), '?'));
    $types = str_repeat('s', count($keys));

    $stmt = $conn->prepare("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ($placeholders)");
    if ($stmt) {
        $stmt->bind_param($types, ...$keys);
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $cfg[$row['setting_key']] = $row['setting_value'];
        }
        $stmt->close();
    }

    $enabledRaw = strtolower(trim((string)($cfg['intruder_ip_lockout_enabled'] ?? '1')));
    $enabled = in_array($enabledRaw, ['1', 'true', 'yes'], true);
    $threshold = max(1, (int)($cfg['intruder_ip_lockout_threshold'] ?? 10));
    $windowHours = max(1, (int)($cfg['intruder_ip_lockout_window_hours'] ?? 24));

    return [
        'enabled' => $enabled,
        'threshold' => $threshold,
        'window_hours' => $windowHours,
    ];
}

/**
 * Load browser state and auto-reset counters when lockout window has passed.
 */
function loadIntruderIPState($conn, $ipAddress, $windowHours) {
    $stmt = $conn->prepare("SELECT failed_count, window_start, blocked_until FROM intruder_ip_lockouts WHERE ip_address = ? LIMIT 1");
    if (!$stmt) return null;

    $stmt->bind_param('s', $ipAddress);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) return null;

    $now = time();
    $windowSeconds = max(1, (int)$windowHours) * 3600;
    $windowStartTs = $row['window_start'] ? strtotime($row['window_start']) : null;
    $blockedUntilTs = $row['blocked_until'] ? strtotime($row['blocked_until']) : null;

    if (!empty($row['blocked_until'])) {
        if ($blockedUntilTs && $blockedUntilTs > $now) {
            return $row;
        }
    }

    $needsReset = false;
    if (!empty($row['blocked_until'])) {
        $needsReset = true;
    } else {
        if ($windowStartTs && ($windowStartTs + $windowSeconds) <= $now) {
            $needsReset = true;
        }
        if (!$windowStartTs && (int)($row['failed_count'] ?? 0) > 0) {
            $needsReset = true;
        }
    }

    if ($needsReset) {
        $reset = $conn->prepare("UPDATE intruder_ip_lockouts SET failed_count = 0, window_start = NULL, blocked_until = NULL WHERE ip_address = ?");
        if ($reset) {
            $reset->bind_param('s', $ipAddress);
            $reset->execute();
            $reset->close();
        }
        return [
            'failed_count' => 0,
            'window_start' => null,
            'blocked_until' => null,
        ];
    }

    return $row;
}

function isIntruderIPBlocked($state) {
    if (!$state || empty($state['blocked_until'])) return false;
    $blockedUntilTs = strtotime((string)$state['blocked_until']);
    return $blockedUntilTs && $blockedUntilTs > time();
}

function upsertIntruderIPState($conn, $ipAddress, $failedCount, $windowStart, $blockedUntil) {
    $stmt = $conn->prepare(
        "INSERT INTO intruder_ip_lockouts (ip_address, failed_count, window_start, blocked_until)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           failed_count = VALUES(failed_count),
           window_start = VALUES(window_start),
           blocked_until = VALUES(blocked_until),
           updated_at = CURRENT_TIMESTAMP"
    );
    if (!$stmt) return;
    $stmt->bind_param('siss', $ipAddress, $failedCount, $windowStart, $blockedUntil);
    $stmt->execute();
    $stmt->close();
}

/**
 * Track one unknown-account attempt for a browser and return current state.
 */
function recordIntruderIPAttempt($conn, $ipAddress, $config, $state = null) {
    $now = time();
    $count = (int)($state['failed_count'] ?? 0);
    $windowStart = $state['window_start'] ?? null;

    if (!$windowStart) {
        $windowStart = date('Y-m-d H:i:s', $now);
        $count = 0;
    }

    $count++;
    $blocked = $count >= (int)$config['threshold'];
    $blockedUntil = $blocked
        ? getIntruderBrowserBlockUntilValue((int)($config['window_hours'] ?? 24))
        : null;

    upsertIntruderIPState($conn, $ipAddress, $count, $windowStart, $blockedUntil);

    return [
        'count' => $count,
        'blocked' => $blocked,
        'blocked_until' => $blockedUntil,
    ];
}

/**
 * Validate and consume recent math captcha verification from session.
 */
function isMathCaptchaVerified() {
    if (!isset($_SESSION['captcha_verified'])) {
        return false;
    }

    $verification = $_SESSION['captcha_verified'];
    $validUntil = intval($verification['valid_until'] ?? 0);

    if ($validUntil <= time()) {
        unset($_SESSION['captcha_verified']);
        return false;
    }

    return true;
}

function clearMathCaptchaVerification() {
    unset($_SESSION['captcha_verified']);
}

function clearPendingLoginSession() {
    unset($_SESSION['pending_login']);
}

function getLoginSuspiciousRiskThreshold($conn) {
    static $cachedThreshold = null;
    if ($cachedThreshold !== null) {
        return $cachedThreshold;
    }

    $threshold = LOGIN_SUSPICIOUS_RISK_THRESHOLD_DEFAULT;
    $stmt = $conn->prepare(
        "SELECT setting_value FROM settings WHERE setting_key = 'login_suspicious_risk_threshold' LIMIT 1"
    );
    if ($stmt) {
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($row && isset($row['setting_value'])) {
            $threshold = intval($row['setting_value']);
        }
    }

    $cachedThreshold = max(1, min(10, $threshold));
    return $cachedThreshold;
}

function mergeRiskSignals($baseSignals, $extraSignals) {
    $merged = [];
    $sources = [$baseSignals, $extraSignals];
    foreach ($sources as $source) {
        if (!is_array($source)) {
            continue;
        }
        foreach ($source as $signal) {
            $text = trim((string)$signal);
            if ($text !== '') {
                $merged[$text] = true;
            }
        }
    }
    return array_keys($merged);
}

function collectClientNetworkRiskSignals($payload) {
    $signals = [];
    $network = $payload['network'] ?? null;
    if (!is_array($network)) {
        return $signals;
    }

    if (array_key_exists('online', $network)) {
        $online = filter_var($network['online'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($online === false) {
            $signals[] = 'client_reported_offline';
        }
    }

    $effectiveType = strtolower(trim((string)($network['effective_type'] ?? '')));
    if (in_array($effectiveType, ['slow-2g', '2g'], true)) {
        $signals[] = 'client_signal_unstable';
    }

    $rtt = isset($network['rtt']) && is_numeric($network['rtt']) ? floatval($network['rtt']) : null;
    if ($rtt !== null && $rtt >= LOGIN_NETWORK_RTT_UNSTABLE_MS) {
        $signals[] = 'client_high_rtt';
    }

    $downlink = isset($network['downlink']) && is_numeric($network['downlink']) ? floatval($network['downlink']) : null;
    if ($downlink !== null && $downlink > 0 && $downlink < LOGIN_NETWORK_MIN_DOWNLINK_MBPS) {
        $signals[] = 'client_low_downlink';
    }

    return mergeRiskSignals($signals, []);
}

function canReachHostPort($host, $port, $timeoutSeconds = LOGIN_SERVER_CONNECTIVITY_TIMEOUT_SECONDS) {
    $errno = 0;
    $errstr = '';
    $socket = @fsockopen((string)$host, intval($port), $errno, $errstr, floatval($timeoutSeconds));
    if (is_resource($socket)) {
        fclose($socket);
        return true;
    }
    return false;
}

function collectServerNetworkRiskSignals() {
    $signals = [];

    $dnsHost = 'cloudflare.com';
    $resolved = @gethostbyname($dnsHost);
    $dnsLooksHealthy = is_string($resolved) && $resolved !== $dnsHost && filter_var($resolved, FILTER_VALIDATE_IP) !== false;
    if (!$dnsLooksHealthy) {
        $signals[] = 'server_dns_unavailable';
    }

    $outboundReachable = canReachHostPort('1.1.1.1', 53)
        || canReachHostPort('8.8.8.8', 53);
    if (!$outboundReachable) {
        $signals[] = 'server_no_outbound_connectivity';
    }

    if ($dnsLooksHealthy || $outboundReachable) {
        return [];
    }

    return mergeRiskSignals($signals, []);
}

function evaluatePrecheckRiskScore($conn, $user, $intruderConfig, $intruderState) {
    $score = 0;
    $signals = [];

    $intruderFailedCount = max(0, intval($intruderState['failed_count'] ?? 0));
    $intruderThreshold = max(1, intval($intruderConfig['threshold'] ?? 10));
    if ($intruderFailedCount >= max(1, $intruderThreshold - 1)) {
        $score += 3;
        $signals[] = 'browser_failures_near_intruder_threshold';
    } elseif ($intruderFailedCount >= 3) {
        $score += 2;
        $signals[] = 'repeated_browser_failures';
    } elseif ($intruderFailedCount >= 1) {
        $score += 1;
        $signals[] = 'browser_failed_recently';
    }

    $accountFailedCount = 0;
    $lockoutEnabled = true;
    $windowHours = 24;

    $settingsStmt = $conn->prepare(
        "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('lockout_enabled','lockout_window_hours')"
    );
    if ($settingsStmt) {
        $settingsStmt->execute();
        $settingsResult = $settingsStmt->get_result();
        while ($settingRow = $settingsResult->fetch_assoc()) {
            $settingKey = (string)($settingRow['setting_key'] ?? '');
            $settingValue = (string)($settingRow['setting_value'] ?? '');
            if ($settingKey === 'lockout_enabled') {
                $lockoutEnabled = $settingValue === '1';
            } elseif ($settingKey === 'lockout_window_hours') {
                $windowHours = max(1, intval($settingValue));
            }
        }
        $settingsStmt->close();
    }

    if ($lockoutEnabled) {
        $windowStartRaw = trim((string)($user['reset_request_window_start'] ?? ''));
        $windowStartTs = $windowStartRaw !== '' ? strtotime($windowStartRaw) : false;
        if ($windowStartTs !== false && ($windowStartTs + ($windowHours * 3600)) >= time()) {
            $accountFailedCount = max(0, intval($user['reset_request_count'] ?? 0));
        }
    }

    if ($accountFailedCount >= 3) {
        $score += 3;
        $signals[] = 'account_failed_attempts_high';
    } elseif ($accountFailedCount >= 1) {
        $score += 1;
        $signals[] = 'account_failed_attempts_recent';
    }

    $ua = trim((string)($_SERVER['HTTP_USER_AGENT'] ?? ''));
    if ($ua === '' || strlen($ua) < 12) {
        $score += 1;
        $signals[] = 'low_entropy_user_agent';
    }

    $riskThreshold = getLoginSuspiciousRiskThreshold($conn);

    return [
        'score' => $score,
        'signals' => $signals,
        'intruder_failed_count' => $intruderFailedCount,
        'account_failed_count' => $accountFailedCount,
        'threshold' => $riskThreshold,
        'suspicious' => $score >= $riskThreshold,
    ];
}

function randomAutoCheckDelayMs() {
    return random_int(LOGIN_AUTO_CHECK_MIN_DELAY_MS, LOGIN_AUTO_CHECK_MAX_DELAY_MS);
}

function storePendingLoginSession($user, $clientBrowserId, $captchaMode = 'altcha', $autoCheckDelayMs = 0, $riskScore = 0, $riskSignals = []) {
    clearPendingLoginSession();
    clearMathCaptchaVerification();

    $mode = strtolower(trim((string)$captchaMode));
    if (!in_array($mode, ['altcha', 'auto', 'slider'], true)) {
        $mode = 'altcha';
    }
    if ($mode === 'slider') {
        $mode = 'altcha';
    }

    $safeDelayMs = max(LOGIN_AUTO_CHECK_MIN_DELAY_MS, min(LOGIN_AUTO_CHECK_MAX_DELAY_MS, intval($autoCheckDelayMs)));
    $autoCheckUntilMs = 0;
    if ($mode === 'auto') {
        $autoCheckUntilMs = (int)round(microtime(true) * 1000) + $safeDelayMs;
    }

    $signalSummary = [];
    if (is_array($riskSignals)) {
        foreach ($riskSignals as $signal) {
            $text = trim((string)$signal);
            if ($text !== '') {
                $signalSummary[] = $text;
            }
        }
    }

    $_SESSION['pending_login'] = [
        'user_id' => (int)($user['id'] ?? 0),
        'email' => normalizeEmailIdentifier((string)($user['email'] ?? '')),
        'password_hash' => (string)($user['password'] ?? ''),
        'browser_id' => (string)$clientBrowserId,
        'created_at' => time(),
        'valid_until' => time() + 90,
        'captcha_mode' => $mode,
        'auto_check_until_ms' => $autoCheckUntilMs,
        'risk_score' => max(0, intval($riskScore)),
        'risk_signals' => $signalSummary,
    ];
}

function getPendingLoginSession($clientBrowserId) {
    $pending = $_SESSION['pending_login'] ?? null;
    if (!is_array($pending)) {
        return null;
    }

    $validUntil = (int)($pending['valid_until'] ?? 0);
    $pendingUserId = (int)($pending['user_id'] ?? 0);
    $pendingBrowserId = (string)($pending['browser_id'] ?? '');
    $pendingPasswordHash = (string)($pending['password_hash'] ?? '');

    if (
        $validUntil <= time()
        || $pendingUserId <= 0
        || $pendingBrowserId === ''
        || $pendingPasswordHash === ''
        || !hash_equals($pendingBrowserId, (string)$clientBrowserId)
    ) {
        clearPendingLoginSession();
        clearMathCaptchaVerification();
        return null;
    }

    return $pending;
}

function authenticateLoginCredentials($conn, $email, $password, $clientBrowserId, $intruderConfig, $intruderState) {
    $lockdownState = getSystemLockdownState($conn);
    if (!empty($lockdownState['enabled'])) {
        $roleStmt = $conn->prepare(
            "SELECT role FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 1"
        );
        $loginRole = '';
        if ($roleStmt) {
            $roleStmt->bind_param('s', $email);
            $roleStmt->execute();
            $roleRow = $roleStmt->get_result()->fetch_assoc();
            $roleStmt->close();
            $loginRole = strtolower(trim((string)($roleRow['role'] ?? '')));
        }

        if ($loginRole !== 'admin') {
            clearMathCaptchaVerification();
            clearPendingLoginSession();
            sendError(
                'System Lockdown Mode is active. Only admin logins are currently allowed.',
                423,
                [
                    'lockdown_enabled' => true,
                    'lockdown_reason' => (string)$lockdownState['reason'],
                    'lockdown_updated_at' => (string)$lockdownState['updated_at'],
                ]
            );
        }
    }

    $sql = "SELECT u.*, 
                   CONCAT(e.first_name, ' ', e.last_name) as full_name,
                   b.branch_name
            FROM users u
            LEFT JOIN employees e ON u.employee_id = e.employee_id
            LEFT JOIN branches b ON u.branch_id = b.branch_id
            WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(?))";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        rejectLoginAttempt($conn, $clientBrowserId, $intruderConfig, $intruderState, 'Invalid email or password', 401);
    }

    $user = $result->fetch_assoc();

    if ($user['status'] === 'locked') {
        clearPendingLoginSession();
        sendError('Your account has been locked due to too many failed login or captcha attempts. Please contact an administrator.', 403);
    }

    if ($user['status'] !== 'active') {
        clearPendingLoginSession();
        sendError('Account is not active', 403);
    }

    if (!verifyPassword($password, $user['password'])) {
        $lockoutErrors = null;
        $lockoutResult = checkAndIncrementLoginFailureCounter($conn, $user);
        $remainingAttempts = $lockoutResult['remaining_attempts'] ?? null;
        $threshold = $lockoutResult['threshold'] ?? null;
        $failedAttempts = $lockoutResult['failed_attempts'] ?? null;

        if ($remainingAttempts !== null || $threshold !== null || $failedAttempts !== null) {
            $lockoutErrors = [
                'attempts_remaining' => $remainingAttempts !== null ? (int)$remainingAttempts : null,
                'failed_attempts' => $failedAttempts !== null ? (int)$failedAttempts : null,
                'lockout_threshold' => $threshold !== null ? (int)$threshold : null,
            ];
        }

        if (($lockoutResult['status'] ?? '') === 'locked') {
            if (is_array($lockoutErrors)) {
                $lockoutErrors['lockout_triggered'] = true;
            }
            rejectLoginAttempt(
                $conn,
                $clientBrowserId,
                $intruderConfig,
                $intruderState,
                'Your account has been locked due to too many failed login or captcha attempts. Please contact an administrator.',
                403,
                $lockoutErrors
            );
        }

        rejectLoginAttempt($conn, $clientBrowserId, $intruderConfig, $intruderState, 'Invalid email or password', 401, $lockoutErrors);
    }

    $user = preparePasswordExpirationForUser($conn, $user);

    return $user;
}

function sendAuthenticatedLoginResponse($conn, $user, $clientBrowserId) {
    $mustResetPassword = isPasswordChangeRequired($user) ? 1 : 0;

    setActiveSessionUserFromRecord($user, $mustResetPassword);
    touchCurrentSessionPresence($conn);
    clearMathCaptchaVerification();
    clearPendingLoginSession();
    clearIntruderIPAttempts($conn, $clientBrowserId);
    clearAccountLockoutCounter($conn, (int)($user['id'] ?? 0));

    $update_sql = "UPDATE users SET last_login = NOW() WHERE id = ?";
    $update_stmt = $conn->prepare($update_sql);
    $update_stmt->bind_param('i', $user['id']);
    $update_stmt->execute();

    logActivity($conn, $user['id'], 'login', 'User logged in', 'authentication');

    unset($user['password']);
    $user['must_reset_password'] = $mustResetPassword ? 1 : 0;
    $user['password_change_reason'] = $mustResetPassword ? getPasswordChangeReasonForUser($user) : '';
    $user['password_status'] = getPasswordChangeStatus($conn, $user);
    $loginRole = strtolower(trim((string)($user['role'] ?? '')));
    $isManagedRole = in_array($loginRole, ['manager', 'staff'], true);
    $timeoutConfig = getManagedRoleSessionTimeoutConfig($conn);
    $roleTimeoutMinutes = $loginRole === 'manager'
        ? intval($timeoutConfig['manager_minutes'] ?? 30)
        : intval($timeoutConfig['staff_minutes'] ?? 30);
    $user['session_timeout_enabled'] = $isManagedRole && !empty($timeoutConfig['enabled']);
    $user['session_timeout_minutes'] = $isManagedRole ? max(1, $roleTimeoutMinutes) : 0;
    $user['session_timeout_warning_seconds'] = 30;
    $user['dashboard_path'] = getRoleDashboardPath($loginRole);
    $user['role_feature_access'] = getRoleFeatureAccessMap($loginRole, $conn);

    if ($mustResetPassword) {
        $message = 'Login successful. Please change your temporary password now.';
    } else {
        $message = 'Login successful';
    }
    sendResponse(true, $user, $message);
}

/**
 * Reset browser lockout counters after a successful login from this browser.
 * @param mysqli $conn
 * @param string $clientBrowserId
 * @return void
 */
function clearIntruderIPAttempts($conn, $clientBrowserId) {
    $stmt = $conn->prepare(
        "UPDATE intruder_ip_lockouts
         SET failed_count = 0, window_start = NULL, blocked_until = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE ip_address = ?"
    );
    if (!$stmt) return;

    $stmt->bind_param('s', $clientBrowserId);
    $stmt->execute();
    $stmt->close();
}

/**
 * Record a failed login attempt against the browser lockout system and end the request.
 * @param mysqli $conn
 * @param string $clientBrowserId
 * @param array<string, mixed> $intruderConfig
 * @param array<string, mixed>|null $intruderState
 * @param string $message
 * @param int $code
 * @param mixed $errors
 * @return void
 */
function rejectLoginAttempt($conn, $clientBrowserId, $intruderConfig, $intruderState, $message, $code = 401, $errors = null) {
    clearMathCaptchaVerification();
    clearPendingLoginSession();

    if (!empty($intruderConfig['enabled'])) {
        $attempt = recordIntruderIPAttempt($conn, $clientBrowserId, $intruderConfig, $intruderState);
        if (!empty($attempt['blocked'])) {
            sendError(
                'INTRUDER BLOCKED. This browser cannot access the system until an administrator unblocks it.',
                429
            );
        }
    }

    sendError($message, $code, $errors);
}

/**
 * POST - Login
 */
function handleLogin($conn) {
    $data = getJSONInput();
    
    $required = ['email', 'password'];
    $missing = validateRequiredFields($data, $required);
    
    if ($missing) {
        sendError('Missing required fields: ' . implode(', ', $missing), 400);
    }

    $email = normalizeEmailIdentifier($data['email']);
    $password = $data['password'];

    ensureIntruderIPLockoutStorage($conn);
    $clientBrowserId = getClientBrowserIdentifier();
    $intruderConfig = getIntruderIPLockoutConfig($conn);
    $intruderState = null;

    if ($intruderConfig['enabled']) {
        $intruderState = loadIntruderIPState($conn, $clientBrowserId, $intruderConfig['window_hours']);
        if (isIntruderIPBlocked($intruderState)) {
            sendError(
                'INTRUDER BLOCKED. This browser cannot access the system until an administrator unblocks it.',
                429
            );
        }
    }

    $user = authenticateLoginCredentials($conn, $email, $password, $clientBrowserId, $intruderConfig, $intruderState);
    sendAuthenticatedLoginResponse($conn, $user, $clientBrowserId);
}

/**
 * POST - Precheck login credentials and decide whether manual captcha is required.
 */
function handleLoginPrecheck($conn) {
    $data = getJSONInput();

    $required = ['email', 'password'];
    $missing = validateRequiredFields($data, $required);

    if ($missing) {
        sendError('Missing required fields: ' . implode(', ', $missing), 400);
    }

    $email = normalizeEmailIdentifier($data['email']);
    $password = $data['password'];

    ensureIntruderIPLockoutStorage($conn);
    $clientBrowserId = getClientBrowserIdentifier();
    $intruderConfig = getIntruderIPLockoutConfig($conn);
    $intruderState = null;

    if ($intruderConfig['enabled']) {
        $intruderState = loadIntruderIPState($conn, $clientBrowserId, $intruderConfig['window_hours']);
        if (isIntruderIPBlocked($intruderState)) {
            sendError(
                'INTRUDER BLOCKED. This browser cannot access the system until an administrator unblocks it.',
                429
            );
        }
    }

    $user = authenticateLoginCredentials($conn, $email, $password, $clientBrowserId, $intruderConfig, $intruderState);
    $risk = evaluatePrecheckRiskScore($conn, $user, $intruderConfig, $intruderState);
    $clientNetworkSignals = collectClientNetworkRiskSignals($data);
    $serverNetworkSignals = collectServerNetworkRiskSignals();
    $networkSignals = mergeRiskSignals($clientNetworkSignals, $serverNetworkSignals);
    $riskSignals = mergeRiskSignals(
        is_array($risk['signals'] ?? null) ? $risk['signals'] : [],
        $networkSignals
    );
    $autoCheckDelayMs = randomAutoCheckDelayMs();
    storePendingLoginSession(
        $user,
        $clientBrowserId,
        'auto',
        $autoCheckDelayMs,
        intval($risk['score'] ?? 0),
        $riskSignals
    );

    sendResponse(true, [
        'captcha_required' => false,
        'captcha_mode' => 'auto',
        'expires_in' => 90,
        'auto_check_delay_ms' => $autoCheckDelayMs,
        'risk_score' => intval($risk['score'] ?? 0),
    ], 'Credentials verified. Server security check is in progress.');
}

/**
 * POST - Finalize login after captcha verification.
 */
function handleLoginComplete($conn) {
    ensureIntruderIPLockoutStorage($conn);
    $clientBrowserId = getClientBrowserIdentifier();

    $pending = getPendingLoginSession($clientBrowserId);
    if (!$pending) {
        sendError('Login session expired. Enter your email and password again.', 400);
    }

    if (!isMathCaptchaVerified()) {
        $autoCheckUntilMs = intval($pending['auto_check_until_ms'] ?? 0);
        $nowMs = (int)round(microtime(true) * 1000);
        if ($autoCheckUntilMs > $nowMs) {
            $waitMs = max(250, $autoCheckUntilMs - $nowMs);
            sendError('Server security check is still running. Please wait a moment and try again.', 400, [
                'retry_after_ms' => $waitMs,
            ]);
        }

        $_SESSION['captcha_verified'] = [
            'timestamp'  => time(),
            'valid_until'=> time() + 120,
            'method'     => 'server_auto_check',
        ];
    }

    $pendingUserId = (int)($pending['user_id'] ?? 0);
    $sql = "SELECT u.*, 
                   CONCAT(e.first_name, ' ', e.last_name) as full_name,
                   b.branch_name
            FROM users u
            LEFT JOIN employees e ON u.employee_id = e.employee_id
            LEFT JOIN branches b ON u.branch_id = b.branch_id
            WHERE u.id = ?
            LIMIT 1";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param('i', $pendingUserId);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        clearPendingLoginSession();
        clearMathCaptchaVerification();
        sendError('Login session expired. Enter your email and password again.', 400);
    }

    $user = $result->fetch_assoc();

    $storedEmail = normalizeEmailIdentifier((string)($pending['email'] ?? ''));
    $currentEmail = normalizeEmailIdentifier((string)($user['email'] ?? ''));
    $storedPasswordHash = (string)($pending['password_hash'] ?? '');
    $currentPasswordHash = (string)($user['password'] ?? '');

    if (
        $storedEmail === ''
        || $storedPasswordHash === ''
        || !hash_equals($storedEmail, $currentEmail)
        || !hash_equals($storedPasswordHash, $currentPasswordHash)
    ) {
        clearPendingLoginSession();
        clearMathCaptchaVerification();
        sendError('Login session changed. Enter your email and password again.', 400);
    }

    if ($user['status'] === 'locked') {
        clearPendingLoginSession();
        clearMathCaptchaVerification();
        sendError('Your account has been locked due to too many failed login or captcha attempts. Please contact an administrator.', 403);
    }

    if ($user['status'] !== 'active') {
        clearPendingLoginSession();
        clearMathCaptchaVerification();
        sendError('Account is not active', 403);
    }

    $user = preparePasswordExpirationForUser($conn, $user);

    sendAuthenticatedLoginResponse($conn, $user, $clientBrowserId);
}

/**
 * POST - Logout
 */
function handleLogout($conn) {
    // Session already started at top of file
    $effectiveUserId = intval($_SESSION['user_id'] ?? 0);

    if ($effectiveUserId > 0) {
        logActivity($conn, $effectiveUserId, 'logout', 'User logged out', 'authentication');
    }

    clearSessionPresenceByUser($effectiveUserId, $conn);

    if (session_status() === PHP_SESSION_ACTIVE) {
        $cookieParams = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $cookieParams['path'] ?? '/',
            $cookieParams['domain'] ?? '',
            $cookieParams['secure'] ?? false,
            $cookieParams['httponly'] ?? true
        );
        session_unset();
        session_destroy();
    }

    sendResponseAndContinue(true, null, 'Logout successful');
}

/**
 * POST - Register new user
 */
function handleRegister($conn) {
    $data = getJSONInput();
    
    $required = ['password', 'email', 'first_name', 'last_name'];
    $missing = validateRequiredFields($data, $required);
    
    if ($missing) {
        sendError('Missing required fields: ' . implode(', ', $missing), 400);
    }
    
    $email = normalizeEmailIdentifier($data['email']);
    if (!validateGmailComEmail($email)) {
        sendError('Email must be a valid @gmail.com or @phinmaed.com address', 400);
    }
    
    $username = generateUniqueUsernameFromEmail($conn, $email);
    $password = hashPassword($data['password']);
    $first_name = normalizePersonName($data['first_name'], 50);
    $last_name = normalizePersonName($data['last_name'], 50);
    if ($first_name === '' || $last_name === '') {
        sendError('First name and last name are required', 400);
    }
    $role = strtolower(trim((string)($data['role'] ?? 'staff')));
    if (!in_array($role, ['admin', 'manager', 'staff'], true)) {
        sendError('Invalid role', 400);
    }
    $mustResetPassword = in_array($role, ['manager', 'staff'], true) ? 1 : 0;
    $passwordChangedAt = date('Y-m-d H:i:s');
    $passwordPolicy = getPasswordPolicy($conn);
    $passwordExpiresAt = date('Y-m-d H:i:s', time() + ($passwordPolicy['max_age_days'] * 86400));
    $employee_id = parseNullablePositiveInt($data['employee_id'] ?? null);
    $branch_id = parseNullablePositiveInt($data['branch_id'] ?? null);
    if ($branch_id !== null) {
        assertBranchExistsForRegister($conn, $branch_id);
    }
    assertManagerBranchAvailabilityForRegister($conn, $role, $branch_id);

    ensureUniqueUserFullName($conn, $first_name, $last_name, null);
    
    // Check if email already exists
    $check_sql = "SELECT id, email
                  FROM users
                  WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
                  LIMIT 1";
    $check_stmt = $conn->prepare($check_sql);
    $check_stmt->bind_param('s', $email);
    $check_stmt->execute();

    $duplicate = $check_stmt->get_result()->fetch_assoc();
    if ($duplicate) {
        $duplicateEmail = trim((string)($duplicate['email'] ?? ''));
        if ($duplicateEmail !== '' && strcasecmp($duplicateEmail, trim((string)$email)) === 0) {
            sendError('Email already in use', 409);
        }
        sendError('Email already in use', 409);
    }
    
    $sql = "INSERT INTO users (username, password, email, first_name, last_name, role, employee_id, branch_id, must_reset_password, password_changed_at, password_expires_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    
    $stmt = $conn->prepare($sql);
    $employeeBind = $employee_id ?? 0;
    $branchBind = $branch_id ?? 0;
    $stmt->bind_param('ssssssiiss', $username, $password, $email, $first_name, $last_name, $role, $employeeBind, $branchBind, $mustResetPassword, $passwordChangedAt, $passwordExpiresAt);
    
    if ($stmt->execute()) {
        $user_id = $conn->insert_id;

        logActivity($conn, $user_id, 'register', 'New user registered', 'authentication');
        
        sendResponse(true, ['user_id' => $user_id], 'User registered successfully', 201);
    } else {
        sendError('Failed to register user: ' . $conn->error, 500);
    }
}

/**
 * GET - Check session
 */
function handleCheckSession($conn) {
    // Session already started at top of file
    if (isset($_SESSION['user_id']) && !empty($_SESSION['user_id'])) {
        enforceManagedRoleSessionTimeout($conn, false);
    }
    
    if (!isset($_SESSION['user_id'])) {
        sendError('Not authenticated', 401);
    }
    
    $user_id = $_SESSION['user_id'];
    
    $sql = "SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.role, u.status, u.photo,
                   u.employee_id, u.branch_id, u.must_reset_password, u.password_changed_at, u.password_expires_at,
                   CONCAT(e.first_name, ' ', e.last_name) as full_name,
                   b.branch_name
            FROM users u
            LEFT JOIN employees e ON u.employee_id = e.employee_id
            LEFT JOIN branches b ON u.branch_id = b.branch_id
            WHERE u.id = ?";
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows === 0) {
        clearSessionPresenceByUser(intval($user_id), $conn);
        session_destroy();
        sendError('Session invalid', 401);
    }
    
    $user = $result->fetch_assoc();
    
    if ($user['status'] !== 'active') {
        clearSessionPresenceByUser(intval($user_id), $conn);
        session_destroy();
        sendError('Account is not active', 403);
    }

    $user = preparePasswordExpirationForUser($conn, $user);

    $mustResetPassword = isPasswordChangeRequired($user) ? 1 : 0;

    $_SESSION['must_reset_password'] = $mustResetPassword ? 1 : 0;
    $_SESSION['password_change_reason'] = $mustResetPassword ? getPasswordChangeReasonForUser($user) : '';
    $user['must_reset_password'] = $mustResetPassword ? 1 : 0;
    $user['password_change_reason'] = $_SESSION['password_change_reason'];
    $user['password_status'] = getPasswordChangeStatus($conn, $user);

    $timeoutConfig = getManagedRoleSessionTimeoutConfig($conn);
    $sessionRole = strtolower(trim((string)($user['role'] ?? '')));
    $isManagedRole = in_array($sessionRole, ['manager', 'staff'], true);
    $roleTimeoutMinutes = $sessionRole === 'manager'
        ? intval($timeoutConfig['manager_minutes'] ?? 30)
        : intval($timeoutConfig['staff_minutes'] ?? 30);
    $user['session_timeout_enabled'] = $isManagedRole && !empty($timeoutConfig['enabled']);
    $user['session_timeout_minutes'] = $isManagedRole ? max(1, $roleTimeoutMinutes) : 0;
    $user['session_timeout_warning_seconds'] = 30;
    $user['dashboard_path'] = getRoleDashboardPath($sessionRole);
    $user['role_feature_access'] = getRoleFeatureAccessMap($sessionRole, $conn);

    $lockdownState = getSystemLockdownState($conn);
    $user['lockdown_enabled'] = !empty($lockdownState['enabled']);
    $user['lockdown_reason'] = (string)($lockdownState['reason'] ?? '');
    $user['lockdown_updated_at'] = (string)($lockdownState['updated_at'] ?? '');

    markSessionActivityNow();
    touchCurrentSessionPresence($conn);
    
    sendResponse(true, $user, 'Session valid');
}

/**
 * GET - Public lockdown status (no auth required)
 */
function handlePublicLockdownStatus($conn) {
    $state = getSystemLockdownState($conn);

    sendResponse(true, [
        'enabled' => !empty($state['enabled']),
        'reason' => (string)($state['reason'] ?? ''),
        'updated_at' => (string)($state['updated_at'] ?? ''),
    ], 'Lockdown status retrieved.');
}

/**
 * GET - Public intruder browser lockout status (no auth required)
 */
function handlePublicIntruderStatus($conn) {
    ensureIntruderBrowserLockoutStorage($conn);
    $browserKey = getIntruderBrowserIdentifier();
    $info = getIntruderBrowserBlockInfo($conn, $browserKey);

    sendResponse(true, [
        'blocked' => !empty($info['blocked']),
        'browser_id' => $browserKey,
        'requires_admin_unblock' => !empty($info['requires_admin_unblock']),
        'message' => !empty($info['blocked'])
            ? 'INTRUDER BLOCKED. This browser cannot access the system until an administrator unblocks it.'
            : '',
    ], 'Intruder browser status retrieved.');
}

/**
 * POST - Forgot password (request reset link)
 * Payload: { email }
 */
function handleForgotPassword($conn) {
    $data = getJSONInput();
    $email = normalizeEmailIdentifier($data['email'] ?? ($data['usernameOrEmail'] ?? ''));

    if ($email === '') {
        sendError('Missing required fields: email', 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendError('Please enter a valid email address.', 400);
    }

    ensureTOTPColumns($conn);
    ensureIntruderIPLockoutStorage($conn);

    $clientBrowserId = getClientBrowserIdentifier();
    $intruderConfig = getIntruderIPLockoutConfig($conn);
    $intruderState = null;
    if ($intruderConfig['enabled']) {
        $intruderState = loadIntruderIPState($conn, $clientBrowserId, $intruderConfig['window_hours']);
        if (isIntruderIPBlocked($intruderState)) {
            sendError(
                'INTRUDER BLOCKED. This browser cannot access the system until an administrator unblocks it.',
                429
            );
        }
    }

    // Lookup user by email (include role and TOTP columns)
    $sql = "SELECT id, username, email, first_name, last_name, status, role, totp_secret, totp_enabled, reset_request_count, reset_request_window_start
            FROM users
            WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
            LIMIT 1";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $res = $stmt->get_result();

    // Generic response for inactive accounts or accounts without email
    $genericMsg = 'If the account exists, a password reset email has been sent.';

    if ($res->num_rows === 0) {
        if ($intruderConfig['enabled']) {
            $attempt = recordIntruderIPAttempt($conn, $clientBrowserId, $intruderConfig, $intruderState);
            if ($attempt['blocked']) {
                sendError(
                    'INTRUDER BLOCKED. This browser cannot access the system until an administrator unblocks it.',
                    429
                );
            }
        }
        // Credentials not found; return a neutral machine-readable code for UI handling.
        sendError('', 404, ['code' => 'ACCOUNT_NOT_FOUND']);
    }

    $user = $res->fetch_assoc();

    // Check if account is locked.
    if ($user['status'] === 'locked') {
        sendError('Your account has been locked due to too many failed login or captcha attempts. Please contact an administrator.', 403);
    }

    if ($user['status'] !== 'active') {
        sendResponse(true, null, $genericMsg);
    }

    // --- Admin: ALWAYS use TOTP (never email) ---
    if ($user['role'] === 'admin') {
        // Start fresh for each admin forgot-password attempt.
        clearAdminForgotPasswordSession();
        clearAdminForgotPasswordEmailCode($conn, (int)$user['id']);

        // Auto-generate TOTP secret if admin doesn't have one yet
        $secret = $user['totp_secret'];
        if (!$secret) {
            $secret = generateTOTPSecret(24);
            $up2 = $conn->prepare("UPDATE users SET totp_secret = ? WHERE id = ?");
            $up2->bind_param('si', $secret, $user['id']);
            $up2->execute();
        }

        $needsSetup = !(bool)$user['totp_enabled'];

        // Build QR code URL if setup is needed
        $qrCodeUrl = null;
        $pairUrl = null;
        if ($needsSetup) {
            $appName = urlencode(getenv('TOTP_APP_NAME') ?: 'LLB Accountants');
            $appInfo = urlencode((string)($user['email'] ?? ''));
            $pairUrl = "https://www.authenticatorapi.com/pair.aspx?AppName={$appName}&AppInfo={$appInfo}&SecretCode=" . urlencode($secret);
            $label = rawurlencode('LLB Accountants') . ':' . rawurlencode((string)($user['email'] ?? ''));
            $otpauthUri = "otpauth://totp/{$label}?secret=" . urlencode($secret) . '&issuer=' . rawurlencode('LLB Accountants');
            $qrCodeUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' . urlencode($otpauthUri);
        }

        sendResponse(true, [
            'requireTOTP' => true,
            'email'       => (string)($user['email'] ?? ''),
            'needsSetup'  => $needsSetup,
            'qrCodeUrl'   => $qrCodeUrl,
            'pairUrl'     => $pairUrl,
            'secret'      => $needsSetup ? $secret : null,
        ], $needsSetup
            ? 'Admin account detected. Please set up Google Authenticator first.'
            : 'Admin account detected. Please verify with your authenticator app.'
        );
    }

    // --- Non-admin: send email reset link ---
    if (!$user['email']) {
        sendResponse(true, null, $genericMsg);
    }

    // Generate token
    $token = bin2hex(random_bytes(32));
    $token_hash = hash('sha256', $token);
    $expires_at = date('Y-m-d H:i:s', time() + 60 * 60); // 1 hour

    ensureColumn($conn, 'users', 'reset_token_hash', 'reset_token_hash VARCHAR(64) NULL');
    ensureColumn($conn, 'users', 'reset_token_expires', 'reset_token_expires DATETIME NULL');

    $up = $conn->prepare("UPDATE users SET reset_token_hash = ?, reset_token_expires = ? WHERE id = ?");
    $up->bind_param('ssi', $token_hash, $expires_at, $user['id']);
    $up->execute();

    // Build reset link — detect frontend host from Referer or fallback
    $frontendBase = '';
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    if ($referer) {
        $parsed = parse_url($referer);
        if ($parsed && isset($parsed['host'])) {
            $port = isset($parsed['port']) ? ':' . $parsed['port'] : '';
            $scheme = $parsed['scheme'] ?? 'http';
            $frontendBase = $scheme . '://' . $parsed['host'] . $port;
        }
    }
    if (!$frontendBase) {
        $configuredFrontendBase = trim((string)(getenv('FRONTEND_BASE_URL') ?: ''));
        if ($configuredFrontendBase !== '') {
            $frontendBase = $configuredFrontendBase;
        } else {
            $isHttps = !empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off';
            $scheme = $isHttps ? 'https' : 'http';
            $host = trim((string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
            $frontendBase = $scheme . '://' . $host;
        }
    }
    $resetLink = rtrim($frontendBase, '/') . '/reset-password?token=' . urlencode($token);

    $fullName = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));

    $subject = 'Password reset request';
    $html = "<p>Hi " . htmlspecialchars($fullName ?: (string)($user['email'] ?? 'User')) . ",</p>"
          . "<p>We received a request to reset your password.</p>"
          . "<p><a href=\"" . htmlspecialchars($resetLink) . "\">Click here to reset your password</a></p>"
          . "<p>This link will expire in 1 hour. If you did not request this, you can ignore this email.</p>";

    $sent = false;
    if (function_exists('sendMail')) {
        $sent = sendMail($user['email'], $fullName, $subject, $html);
        if (!$sent) {
            error_log('Forgot password email failed to send for user_id=' . $user['id']);
        }
    } else {
        error_log('sendMail function not available — PHPMailer may not be installed');
    }

    logActivity($conn, $user['id'], 'forgot_password', $sent ? 'Password reset email sent' : 'Password reset email failed', 'authentication');

    if ($sent) {
        sendResponse(true, null, 'Password reset link has been sent to your email.');
    } else {
        sendError('Failed to send reset email. Please check your SMTP configuration or try again later.', 500);
    }
}

/**
 * Clear failed login counters for a user after a successful login or manual unlock.
 * The storage columns keep their historical names for backward compatibility.
 */
function clearAccountLockoutCounter($conn, $userId) {
    $id = (int)$userId;
    if ($id <= 0) return;

    $stmt = $conn->prepare(
        "UPDATE users
         SET reset_request_count = 0,
             reset_request_window_start = NULL
         WHERE id = ?"
    );
    if (!$stmt) return;

    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();
}

/**
 * Check and increment the failed-login counter for a user.
 * If lockout is enabled and the threshold is reached, lock the account.
 * The storage columns keep their historical names for backward compatibility.
 * @return string 'ok' or 'locked'
 */
function checkAndIncrementLoginFailureCounter($conn, $user) {
    // Load lockout settings.
    $settingsStmt = $conn->prepare(
        "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('lockout_enabled','lockout_window_hours')"
    );
    $settingsStmt->execute();
    $settingsResult = $settingsStmt->get_result();
    $cfg = [];
    while ($r = $settingsResult->fetch_assoc()) {
        $cfg[$r['setting_key']] = $r['setting_value'];
    }
    $settingsStmt->close();

    $enabled = ($cfg['lockout_enabled'] ?? '1') === '1';
    if (!$enabled) {
        return [
            'status' => 'disabled',
            'failed_attempts' => 0,
            'remaining_attempts' => null,
            'threshold' => null,
        ];
    }

    // Admin accounts are exempt from lockout — only staff and manager are affected.
    $role = strtolower(trim($user['role'] ?? ''));
    if ($role === 'admin') {
        return [
            'status' => 'admin_exempt',
            'failed_attempts' => 0,
            'remaining_attempts' => null,
            'threshold' => null,
        ];
    }

    $threshold = getLoginFailedAttemptLimit($conn);
    $windowHours = (int)($cfg['lockout_window_hours'] ?? 24);

    $count       = (int)($user['reset_request_count'] ?? 0);
    $windowStart = $user['reset_request_window_start'] ?? null;

    // If no window set, or window expired, reset counter
    if (!$windowStart || (strtotime($windowStart) + $windowHours * 3600) < time()) {
        $count = 0;
        $windowStart = date('Y-m-d H:i:s');
    }

    $count++;
    $remainingAttempts = max(0, $threshold - $count);

    if ($count >= $threshold) {
        // Lock the account
        $lockStmt = $conn->prepare(
            "UPDATE users SET status = 'locked', reset_request_count = ?, reset_request_window_start = ? WHERE id = ?"
        );
        $lockStmt->bind_param('isi', $count, $windowStart, $user['id']);
        $lockStmt->execute();
        $lockStmt->close();

        logActivity($conn, $user['id'], 'account_locked',
            "Account locked after {$count} failed login or captcha attempts (threshold: {$threshold})",
            'security');

        return [
            'status' => 'locked',
            'failed_attempts' => $count,
            'remaining_attempts' => 0,
            'threshold' => $threshold,
        ];
    }

    // Just increment the counter
    $incStmt = $conn->prepare(
        "UPDATE users SET reset_request_count = ?, reset_request_window_start = ? WHERE id = ?"
    );
    $incStmt->bind_param('isi', $count, $windowStart, $user['id']);
    $incStmt->execute();
    $incStmt->close();

    return [
        'status' => 'ok',
        'failed_attempts' => $count,
        'remaining_attempts' => $remainingAttempts,
        'threshold' => $threshold,
    ];
}

function clearAdminForgotPasswordSession() {
    unset($_SESSION['admin_forgot_password_user_id']);
    unset($_SESSION['admin_forgot_password_totp_verified_at']);
    unset($_SESSION['admin_forgot_password_email_verified_user_id']);
    unset($_SESSION['admin_forgot_password_email_verified_at']);
}

function clearAdminForgotPasswordEmailCode($conn, $userId) {
    ensureColumn($conn, 'users', 'forgot_admin_email_code_hash', 'forgot_admin_email_code_hash VARCHAR(64) NULL');
    ensureColumn($conn, 'users', 'forgot_admin_email_code_expires', 'forgot_admin_email_code_expires DATETIME NULL');

    $id = (int)$userId;
    $stmt = $conn->prepare("UPDATE users SET forgot_admin_email_code_hash = NULL, forgot_admin_email_code_expires = NULL WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
}

function generateAlphaCode($length = 6) {
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    $out = '';
    for ($i = 0; $i < $length; $i++) {
        $out .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    return $out;
}

function issueAdminForgotPasswordEmailCode($conn, $user) {
    $userId = (int)$user['id'];
    $email = trim((string)($user['email'] ?? ''));
    if ($email === '') {
        sendError('Admin email is not configured for this account. Please contact system support.', 400);
    }

    ensureColumn($conn, 'users', 'forgot_admin_email_code_hash', 'forgot_admin_email_code_hash VARCHAR(64) NULL');
    ensureColumn($conn, 'users', 'forgot_admin_email_code_expires', 'forgot_admin_email_code_expires DATETIME NULL');

    $code = generateAlphaCode(6);
    $codeHash = hash('sha256', $code);
    $expiresAt = date('Y-m-d H:i:s', time() + 10 * 60); // 10 minutes

    $up = $conn->prepare("UPDATE users SET forgot_admin_email_code_hash = ?, forgot_admin_email_code_expires = ? WHERE id = ?");
    $up->bind_param('ssi', $codeHash, $expiresAt, $userId);
    if (!$up->execute()) {
        sendError('Failed to store email verification code', 500);
    }

    $fullName = trim((string)($user['first_name'] ?? '') . ' ' . (string)($user['last_name'] ?? ''));
    $subject = 'Your admin password reset email code';
    $html = "<p>Hi " . htmlspecialchars($fullName ?: (string)($user['username'] ?? 'Admin')) . ",</p>"
          . "<p>Your 6-letter verification code is:</p>"
          . "<h2 style=\"letter-spacing:3px\">" . htmlspecialchars($code) . "</h2>"
          . "<p>This code expires in 10 minutes. If this was not you, secure your account immediately.</p>";

    $sent = false;
    if (function_exists('sendMail')) {
        $sent = sendMail($email, $fullName, $subject, $html);
    }

    logActivity(
        $conn,
        $userId,
        'forgot_password_admin_email_code',
        $sent ? 'Sent admin forgot-password email code' : 'Failed to send admin forgot-password email code',
        'authentication'
    );

    if (!$sent) {
        sendError('Failed to send verification code email. Please check your SMTP configuration.', 500);
    }
}

/**
 * POST - Verify TOTP code only (admin forgot-password step 1)
 * Payload: { email, pin }
 */
function handleForgotPasswordVerifyTOTP($conn) {
    $data = getJSONInput();
    $email = normalizeEmailIdentifier($data['email'] ?? ($data['usernameOrEmail'] ?? ''));
    $pin = preg_replace('/\D+/', '', (string)($data['pin'] ?? ''));

    if ($email === '') sendError('Missing email', 400);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) sendError('Please enter a valid email address.', 400);
    if (strlen($pin) !== 6) sendError('Invalid authenticator code', 400);

    ensureTOTPColumns($conn);

    $sql = "SELECT id, username, email, first_name, last_name, status, role, totp_secret, totp_enabled
            FROM users
            WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
            LIMIT 1";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $u = $stmt->get_result()->fetch_assoc();

    if (!$u) sendError('Invalid credentials', 400);
    if ($u['status'] !== 'active') sendError('Account is not active', 403);
    if ($u['role'] !== 'admin') sendError('This method is only for admin accounts', 403);
    if (!$u['totp_secret']) sendError('TOTP is not set up', 400);

    $secret = $u['totp_secret'];
    $ok = validateTOTP($secret, $pin);
    if (!$ok) sendError('Invalid authenticator code', 400);

    // Enable TOTP if this is the first successful validation
    if (!(bool)$u['totp_enabled']) {
        $conn->query("UPDATE users SET totp_enabled = 1 WHERE id = " . intval($u['id']));
    }

    issueAdminForgotPasswordEmailCode($conn, $u);

    $_SESSION['admin_forgot_password_user_id'] = (int)$u['id'];
    $_SESSION['admin_forgot_password_totp_verified_at'] = time();
    unset($_SESSION['admin_forgot_password_email_verified_user_id']);
    unset($_SESSION['admin_forgot_password_email_verified_at']);

    sendResponse(
        true,
        ['verified' => true, 'emailCodeSent' => true],
        'Authenticator verified. A 6-letter code was sent to your admin email.'
    );
}

/**
 * POST - Verify email code after authenticator verification (admin forgot-password step 2)
 * Payload: { email, emailCode }
 */
function handleForgotPasswordVerifyEmailCode($conn) {
    $data = getJSONInput();
    $email = normalizeEmailIdentifier($data['email'] ?? ($data['usernameOrEmail'] ?? ''));
    $emailCode = strtoupper(trim((string)($data['emailCode'] ?? '')));
    $emailCode = preg_replace('/[^A-Z]/', '', $emailCode);

    if ($email === '') sendError('Missing email', 400);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) sendError('Please enter a valid email address.', 400);
    if (strlen($emailCode) !== 6) sendError('Invalid email verification code', 400);

    ensureColumn($conn, 'users', 'forgot_admin_email_code_hash', 'forgot_admin_email_code_hash VARCHAR(64) NULL');
    ensureColumn($conn, 'users', 'forgot_admin_email_code_expires', 'forgot_admin_email_code_expires DATETIME NULL');

    $sql = "SELECT id, username, status, role, forgot_admin_email_code_hash, forgot_admin_email_code_expires
            FROM users
            WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
            LIMIT 1";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $u = $stmt->get_result()->fetch_assoc();

    if (!$u) sendError('Invalid credentials', 400);
    if ($u['status'] !== 'active') sendError('Account is not active', 403);
    if ($u['role'] !== 'admin') sendError('This method is only for admin accounts', 403);

    $sessionUserId = (int)($_SESSION['admin_forgot_password_user_id'] ?? 0);
    $totpVerifiedAt = (int)($_SESSION['admin_forgot_password_totp_verified_at'] ?? 0);
    if (
        $sessionUserId !== (int)$u['id'] ||
        $totpVerifiedAt <= 0 ||
        (time() - $totpVerifiedAt) > (15 * 60)
    ) {
        clearAdminForgotPasswordSession();
        sendError('Authenticator verification expired. Please verify again.', 400);
    }

    $storedHash = (string)($u['forgot_admin_email_code_hash'] ?? '');
    $expiresAt = (string)($u['forgot_admin_email_code_expires'] ?? '');
    if ($storedHash === '' || $expiresAt === '') {
        sendError('Email code not requested or expired. Verify authenticator again.', 400);
    }

    if (strtotime($expiresAt) < time()) {
        clearAdminForgotPasswordEmailCode($conn, (int)$u['id']);
        unset($_SESSION['admin_forgot_password_email_verified_user_id']);
        unset($_SESSION['admin_forgot_password_email_verified_at']);
        sendError('Email code expired. Verify authenticator again.', 400);
    }

    $incomingHash = hash('sha256', $emailCode);
    if (!hash_equals($storedHash, $incomingHash)) {
        sendError('Invalid email verification code', 400);
    }

    clearAdminForgotPasswordEmailCode($conn, (int)$u['id']);
    $_SESSION['admin_forgot_password_email_verified_user_id'] = (int)$u['id'];
    $_SESSION['admin_forgot_password_email_verified_at'] = time();

    sendResponse(true, ['emailVerified' => true], 'Email code verified. You may now set a new password.');
}

/**
 * POST - Set new password after admin forgot-password verification
 * Payload: { email, newPassword }
 */
function handleForgotPasswordTOTP($conn) {
    $data = getJSONInput();
    $email = normalizeEmailIdentifier($data['email'] ?? ($data['usernameOrEmail'] ?? ''));
    $newPassword = (string)($data['newPassword'] ?? '');

    if ($email === '') sendError('Missing email', 400);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) sendError('Please enter a valid email address.', 400);
    if (strlen($newPassword) < 8) sendError('Password must be at least 8 characters', 400);

    $sql = "SELECT id, username, status, role, password FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 1";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $u = $stmt->get_result()->fetch_assoc();

    if (!$u) sendError('Invalid credentials', 400);
    if ($u['status'] !== 'active') sendError('Account is not active', 403);
    if ($u['role'] !== 'admin') sendError('This reset method is only available for admin accounts', 403);

    $now = time();
    $sessionUserId = (int)($_SESSION['admin_forgot_password_user_id'] ?? 0);
    $totpVerifiedAt = (int)($_SESSION['admin_forgot_password_totp_verified_at'] ?? 0);
    $emailVerifiedUserId = (int)($_SESSION['admin_forgot_password_email_verified_user_id'] ?? 0);
    $emailVerifiedAt = (int)($_SESSION['admin_forgot_password_email_verified_at'] ?? 0);
    $ttl = 15 * 60;

    if (
        $sessionUserId !== (int)$u['id'] ||
        $totpVerifiedAt <= 0 ||
        ($now - $totpVerifiedAt) > $ttl
    ) {
        clearAdminForgotPasswordSession();
        sendError('Authenticator verification expired. Please start again.', 400);
    }

    if (
        $emailVerifiedUserId !== (int)$u['id'] ||
        $emailVerifiedAt <= 0 ||
        $emailVerifiedAt < $totpVerifiedAt ||
        ($now - $emailVerifiedAt) > $ttl
    ) {
        sendError('Please verify the email code before setting a new password.', 400);
    }

    // Update password with history and expiration metadata.
    ensurePasswordPolicySchema($conn);
    $policy = getPasswordPolicy($conn);
    $hashed = validateAndHashPasswordForChange($conn, $u['id'], $newPassword, (string)($u['password'] ?? ''), $policy['history_count']);
    persistPasswordChange($conn, (int)$u['id'], $hashed, (string)($u['password'] ?? ''), $policy['history_count'], $policy['max_age_days'], true);

    clearAdminForgotPasswordEmailCode($conn, (int)$u['id']);
    clearAdminForgotPasswordSession();

    logActivity($conn, $u['id'], 'forgot_password_totp', 'Admin reset password via authenticator + email code (forgot password)', 'authentication');

    sendResponse(true, null, 'Password reset successfully. You can now log in.');
}

/**
 * POST - Reset password
 * Payload: { token, newPassword }
 */
function handleResetPassword($conn) {
    $data = getJSONInput();
    $required = ['token', 'newPassword'];
    $missing = validateRequiredFields($data, $required);
    if ($missing) {
        sendError('Missing required fields: ' . implode(', ', $missing), 400);
    }

    $token = (string)$data['token'];
    $newPassword = (string)$data['newPassword'];

    if (strlen($newPassword) < 8) {
        sendError('Password must be at least 8 characters', 400);
    }

    ensureColumn($conn, 'users', 'must_reset_password', 'must_reset_password TINYINT(1) NOT NULL DEFAULT 0');

    $token_hash = hash('sha256', $token);

    $sql = "SELECT id, status, password, reset_token_expires FROM users WHERE reset_token_hash = ? LIMIT 1";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('s', $token_hash);
    $stmt->execute();
    $res = $stmt->get_result();

    if ($res->num_rows === 0) {
        sendError('Invalid or expired token', 400);
    }

    $user = $res->fetch_assoc();

    if ($user['status'] !== 'active') {
        sendError('Account is not active', 403);
    }

    if (!$user['reset_token_expires'] || strtotime($user['reset_token_expires']) < time()) {
        sendError('Invalid or expired token', 400);
    }

    $policy = getPasswordPolicy($conn);
    $hashed = validateAndHashPasswordForChange($conn, $user['id'], $newPassword, (string)($user['password'] ?? ''), $policy['history_count']);
    persistPasswordChange($conn, (int)$user['id'], $hashed, (string)($user['password'] ?? ''), $policy['history_count'], $policy['max_age_days'], true);

    $clear = $conn->prepare("UPDATE users SET reset_token_hash = NULL, reset_token_expires = NULL WHERE id = ?");
    $clear->bind_param('i', $user['id']);
    $clear->execute();
    $clear->close();

    logActivity($conn, $user['id'], 'reset_password', 'Password reset successful', 'authentication');

    sendResponse(true, null, 'Password updated successfully');
}

/**
 * POST - Change temporary password after first login (authenticated only)
 * Payload: { newPassword }
 */
function handleFirstLoginChangePassword($conn) {
    if (!isset($_SESSION['user_id'])) {
        sendError('Not authenticated', 401);
    }

    $data = getJSONInput();
    $required = ['newPassword'];
    $missing = validateRequiredFields($data, $required);
    if ($missing) {
        sendError('Missing required fields: ' . implode(', ', $missing), 400);
    }

    $newPassword = (string)$data['newPassword'];
    if (strlen($newPassword) < 8) {
        sendError('Password must be at least 8 characters', 400);
    }

    ensureColumn($conn, 'users', 'must_reset_password', 'must_reset_password TINYINT(1) NOT NULL DEFAULT 0');
    ensureColumn($conn, 'users', 'reset_token_hash', 'reset_token_hash VARCHAR(64) NULL');
    ensureColumn($conn, 'users', 'reset_token_expires', 'reset_token_expires DATETIME NULL');
    ensurePasswordPolicySchema($conn);

    $policy = getPasswordPolicy($conn);
    $userId = (int)$_SESSION['user_id'];
    $stmt = $conn->prepare("SELECT id, role, status, password, must_reset_password, password_changed_at, password_expires_at FROM users WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $res = $stmt->get_result();

    if ($res->num_rows === 0) {
        session_destroy();
        sendError('Session invalid', 401);
    }

    $user = $res->fetch_assoc();

    if ($user['status'] !== 'active') {
        sendError('Account is not active', 403);
    }
    if ((int)($user['must_reset_password'] ?? 0) !== 1) {
        sendError('Password change is not required for this account.', 400);
    }
    if (verifyPassword($newPassword, (string)$user['password'])) {
        sendError('New password must be different from your current password.', 400);
    }

    $hashed = validateAndHashPasswordForChange($conn, $userId, $newPassword, (string)($user['password'] ?? ''), $policy['history_count']);
    persistPasswordChange($conn, $userId, $hashed, (string)($user['password'] ?? ''), $policy['history_count'], $policy['max_age_days'], true);

    $_SESSION['must_reset_password'] = 0;
    $_SESSION['password_change_reason'] = '';
    logActivity($conn, $userId, 'first_login_password_change', 'User changed temporary password after first login', 'authentication');
    sendResponse(true, [
        'role' => $user['role'],
    ], 'Password updated successfully');
}

/**
 * POST - Admin update own profile details (settings)
 * Payload: { username, email, first_name, last_name }
 */
function handleAdminUpdateProfile($conn) {
    if (!isset($_SESSION['user_id'])) {
        sendError('Not authenticated', 401);
    }

    $user_id = (int)$_SESSION['user_id'];
    $data = getJSONInput();

    $currentStmt = $conn->prepare("SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1");
    $currentStmt->bind_param('i', $user_id);
    $currentStmt->execute();
    $currentUser = $currentStmt->get_result()->fetch_assoc();
    $currentStmt->close();
    if (!$currentUser) {
        sendError('User not found', 404);
    }

    $nextFirstName = array_key_exists('first_name', $data)
        ? normalizePersonName($data['first_name'], 50)
        : normalizePersonName($currentUser['first_name'] ?? '', 50);
    $nextLastName = array_key_exists('last_name', $data)
        ? normalizePersonName($data['last_name'], 50)
        : normalizePersonName($currentUser['last_name'] ?? '', 50);
    ensureUniqueUserFullName($conn, $nextFirstName, $nextLastName, $user_id);

    $allowed = ['username', 'email', 'first_name', 'last_name'];
    $updates = [];
    $types = '';
    $params = [];

    foreach ($allowed as $k) {
        if (array_key_exists($k, $data)) {
            $val = is_string($data[$k]) ? trim($data[$k]) : $data[$k];
            if ($k === 'email' && $val !== '' && !validateGmailComEmail($val)) {
                sendError('Email must be a valid @gmail.com or @phinmaed.com address', 400);
            }
            if ($k === 'email' && $val !== '') {
                // Ensure email is unique
                $check = $conn->prepare("SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1");
                $check->bind_param('si', $val, $user_id);
                $check->execute();
                if ($check->get_result()->num_rows > 0) {
                    sendError('Email already in use', 409);
                }
            }
            if ($k === 'username') {
                $val = sanitizeInput($val);
                if ($val === '') {
                    sendError('Username cannot be empty', 400);
                }
                // ensure unique
                $check = $conn->prepare("SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1");
                $check->bind_param('si', $val, $user_id);
                $check->execute();
                if ($check->get_result()->num_rows > 0) {
                    sendError('Username already exists', 409);
                }
            }
            if ($k === 'first_name') {
                $val = $nextFirstName;
            }
            if ($k === 'last_name') {
                $val = $nextLastName;
            }

            $updates[] = "$k = ?";
            $types .= 's';
            $params[] = $val;
        }
    }

    if (empty($updates)) {
        sendError('No fields to update', 400);
    }

    $sql = "UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?";
    $types .= 'i';
    $params[] = $user_id;

    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);

    if (!$stmt->execute()) {
        sendError('Failed to update profile', 500);
    }

    // Update session username if changed
    if (isset($data['username'])) {
        $_SESSION['username'] = trim((string)$data['username']);
    }

    // Sync first_name / last_name to employees table if linked
    $employee_id = $_SESSION['employee_id'] ?? null;
    if ($employee_id && (isset($data['first_name']) || isset($data['last_name']))) {
        $empUpdates = [];
        $empTypes = '';
        $empParams = [];
        if (isset($data['first_name'])) {
            $empUpdates[] = 'first_name = ?';
            $empTypes .= 's';
            $empParams[] = $nextFirstName;
        }
        if (isset($data['last_name'])) {
            $empUpdates[] = 'last_name = ?';
            $empTypes .= 's';
            $empParams[] = $nextLastName;
        }
        if (!empty($empUpdates)) {
            $empSql = "UPDATE employees SET " . implode(', ', $empUpdates) . " WHERE employee_id = ?";
            $empTypes .= 'i';
            $empParams[] = (int)$employee_id;
            $empStmt = $conn->prepare($empSql);
            $empStmt->bind_param($empTypes, ...$empParams);
            $empStmt->execute();
        }
    }

    logActivity($conn, $user_id, 'admin_update_profile', 'Admin updated profile details', 'authentication');

    // Return updated user
    $fetch = $conn->prepare("SELECT id, username, email, first_name, last_name, role, status, photo FROM users WHERE id = ?");
    $fetch->bind_param('i', $user_id);
    $fetch->execute();
    $user = $fetch->get_result()->fetch_assoc();

    sendResponse(true, $user, 'Profile updated successfully');
}

/**
 * GET - Return password expiration and history policy (admin only).
 */
function handlePasswordPolicy($conn) {
    if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') {
        sendError('Forbidden', 403);
    }

    sendResponse(true, getPasswordPolicy($conn), 'Password policy retrieved');
}

/**
 * POST - Update password expiration and history policy (admin only).
 * Payload: { max_age_days, history_count }
 */
function handleUpdatePasswordPolicy($conn) {
    if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') {
        sendError('Forbidden', 403);
    }

    $data = getJSONInput();
    $maxAgeDays = isset($data['max_age_days']) ? (int)$data['max_age_days'] : 90;
    $historyCount = isset($data['history_count']) ? (int)$data['history_count'] : 5;
    $policy = updatePasswordPolicy($conn, $maxAgeDays, $historyCount);

    logActivity($conn, (int)$_SESSION['user_id'], 'update_password_policy', 'Updated password expiration and history policy', 'settings');

    sendResponse(true, $policy, 'Password policy updated');
}

/**
 * POST - Request OTP for changing password while logged in.
 * Payload: { }
 */
function handleRequestPasswordChangeOTP($conn) {
    if (!isset($_SESSION['user_id'])) {
        sendError('Not authenticated', 401);
    }

    $user_id = (int)$_SESSION['user_id'];

    $stmt = $conn->prepare("SELECT id, username, email, first_name, last_name, status FROM users WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $res = $stmt->get_result();

    if ($res->num_rows === 0) {
        sendError('User not found', 404);
    }

    $user = $res->fetch_assoc();
    if ($user['status'] !== 'active') {
        sendError('Account is not active', 403);
    }

    $toEmail = $user['email'];
    if (!$toEmail) {
        sendError('Email is not configured for this account. Please contact an administrator.', 400);
    }

    ensurePasswordPolicySchema($conn);

    $otp = strval(random_int(100000, 999999));
    $otpHash = hash('sha256', $otp);
    $expires_at = date('Y-m-d H:i:s', time() + 10 * 60); // 10 minutes

    $up = $conn->prepare("UPDATE users SET password_change_otp_hash = ?, password_change_otp_expires = ? WHERE id = ?");
    if (!$up) sendError('Failed to prepare OTP', 500);
    $up->bind_param('ssi', $otpHash, $expires_at, $user_id);
    if (!$up->execute()) {
        $up->close();
        sendError('Failed to store OTP', 500);
    }
    $up->close();

    $sent = sendPasswordChangeOtpEmail($user, $otp);

    logActivity($conn, $user_id, 'request_password_change_otp', $sent ? 'OTP sent' : 'OTP send failed', 'authentication');

    if ($sent) {
        sendResponse(true, null, 'OTP sent to your email.');
    } else {
        sendError('Failed to send OTP email. Please check your SMTP configuration.', 500);
    }
}

/**
 * POST - Change password with OTP (admin settings)
 * Payload: { otp, newPassword }
 */
function handleChangePasswordWithOTP($conn) {
    if (!isset($_SESSION['user_id'])) {
        sendError('Not authenticated', 401);
    }

    $user_id = (int)$_SESSION['user_id'];
    $data = getJSONInput();

    $required = ['otp', 'newPassword'];
    $missing = validateRequiredFields($data, $required);
    if ($missing) {
        sendError('Missing required fields: ' . implode(', ', $missing), 400);
    }

    $otp = preg_replace('/\D+/', '', (string)$data['otp']);
    $newPassword = (string)$data['newPassword'];

    if (strlen($otp) !== 6) {
        sendError('Invalid OTP', 400);
    }

    ensurePasswordPolicySchema($conn);

    $stmt = $conn->prepare("SELECT id, status, password, password_change_otp_hash, password_change_otp_expires FROM users WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $res = $stmt->get_result();

    if ($res->num_rows === 0) {
        sendError('User not found', 404);
    }

    $u = $res->fetch_assoc();

    if ($u['status'] !== 'active') {
        sendError('Account is not active', 403);
    }

    if (!$u['password_change_otp_hash'] || !$u['password_change_otp_expires']) {
        sendError('OTP not requested or expired', 400);
    }

    if (strtotime($u['password_change_otp_expires']) < time()) {
        $conn->query("UPDATE users SET password_change_otp_hash = NULL, password_change_otp_expires = NULL WHERE id = " . intval($user_id));
        sendError('OTP not requested or expired', 400);
    }

    $otpHash = hash('sha256', $otp);
    if (!hash_equals($u['password_change_otp_hash'], $otpHash)) {
        sendError('Invalid OTP', 400);
    }

    $policy = getPasswordPolicy($conn);
    $hashed = validateAndHashPasswordForChange($conn, $user_id, $newPassword, (string)($u['password'] ?? ''), $policy['history_count']);
    persistPasswordChange($conn, $user_id, $hashed, (string)($u['password'] ?? ''), $policy['history_count'], $policy['max_age_days'], true);

    $clear = $conn->prepare("UPDATE users SET password_change_otp_hash = NULL, password_change_otp_expires = NULL WHERE id = ?");
    $clear->bind_param('i', $user_id);
    $clear->execute();
    $clear->close();

    logActivity($conn, $user_id, 'change_password', 'User changed password via email OTP', 'authentication');

    sendResponse(true, null, 'Password changed successfully');
}

// --- AuthenticatorAPI.com (TOTP) ---

function ensureTOTPColumns($conn) {
    // best-effort
    ensureColumn($conn, 'users', 'totp_secret', 'totp_secret VARCHAR(64) NULL');
    ensureColumn($conn, 'users', 'totp_enabled', 'totp_enabled TINYINT(1) NOT NULL DEFAULT 0');
}

function generateTOTPSecret($length = 20) {
    // Base32 alphabet for TOTP secrets
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $secret = '';
    for ($i = 0; $i < $length; $i++) {
        $secret .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    return $secret;
}

/**
 * Validate a TOTP PIN locally using RFC 6238.
 * Checks current time window ±1 (30-second tolerance for clock drift).
 * @param string $secret Base32-encoded secret
 * @param string $pin 6-digit code
 * @return bool
 */
function validateTOTP($secret, $pin) {
    // Base32 decode the secret
    $base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $binary = '';
    $secret = strtoupper(rtrim($secret, '='));
    $buffer = 0;
    $bitsLeft = 0;
    for ($i = 0; $i < strlen($secret); $i++) {
        $val = strpos($base32chars, $secret[$i]);
        if ($val === false) continue;
        $buffer = ($buffer << 5) | $val;
        $bitsLeft += 5;
        if ($bitsLeft >= 8) {
            $bitsLeft -= 8;
            $binary .= chr(($buffer >> $bitsLeft) & 0xFF);
        }
    }

    // Check current, previous, and next 30-second windows (±1 tolerance)
    $timeStep = 30;
    $currentTime = time();
    for ($offset = -1; $offset <= 1; $offset++) {
        $counter = intdiv($currentTime, $timeStep) + $offset;
        // Pack counter as 8-byte big-endian
        $counterBytes = pack('N*', 0, $counter);
        $hash = hash_hmac('sha1', $counterBytes, $binary, true);
        // Dynamic truncation
        $offsetByte = ord($hash[strlen($hash) - 1]) & 0x0F;
        $code = (
            ((ord($hash[$offsetByte]) & 0x7F) << 24) |
            ((ord($hash[$offsetByte + 1]) & 0xFF) << 16) |
            ((ord($hash[$offsetByte + 2]) & 0xFF) << 8) |
            (ord($hash[$offsetByte + 3]) & 0xFF)
        ) % 1000000;

        $expectedPin = str_pad((string)$code, 6, '0', STR_PAD_LEFT);
        if (hash_equals($expectedPin, $pin)) {
            return true;
        }
    }
    return false;
}

/**
 * POST - Create/get pairing link for current admin
 * Response includes pairUrl that the user can open/scan.
 */
function handleTOTPpair($conn) {
    if (!isset($_SESSION['user_id'])) sendError('Not authenticated', 401);
    if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') sendError('Forbidden', 403);

    ensureTOTPColumns($conn);

    $user_id = (int)$_SESSION['user_id'];

    $stmt = $conn->prepare("SELECT id, username, totp_secret, totp_enabled FROM users WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $u = $stmt->get_result()->fetch_assoc();

    if (!$u) sendError('User not found', 404);

    $data = getJSONInput();
    $regenerate = !empty($data['regenerate']);

    $secret = $u['totp_secret'];
    if (!$secret || $regenerate) {
        $secret = generateTOTPSecret(24);
        $up = $conn->prepare("UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?");
        $up->bind_param('si', $secret, $user_id);
        $up->execute();
    }

    $appName = urlencode(getenv('TOTP_APP_NAME') ?: 'LLB Accountants');
    $appInfo = urlencode($u['username']);
    $pairUrl = "https://www.authenticatorapi.com/pair.aspx?AppName={$appName}&AppInfo={$appInfo}&SecretCode=" . urlencode($secret);

    // Build otpauth URI for standard QR code generation
    $label = rawurlencode('LLB Accountants') . ':' . rawurlencode($u['username']);
    $otpauthUri = "otpauth://totp/{$label}?secret=" . urlencode($secret) . '&issuer=' . rawurlencode('LLB Accountants');

    sendResponse(true, [
        'pairUrl'    => $pairUrl,
        'qrCodeUrl'  => 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' . urlencode($otpauthUri),
        'secret'     => $secret,
        'enabled'    => (bool)$u['totp_enabled'],
    ], 'Pairing link generated');
}

/**
 * GET - Check current TOTP status for logged-in admin
 * Auto-generates a TOTP secret if one doesn't exist yet.
 */
function handleTOTPStatus($conn) {
    if (!isset($_SESSION['user_id'])) sendError('Not authenticated', 401);
    if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') sendError('Forbidden', 403);

    ensureTOTPColumns($conn);

    $user_id = (int)$_SESSION['user_id'];
    $stmt = $conn->prepare("SELECT username, totp_secret, totp_enabled FROM users WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $u = $stmt->get_result()->fetch_assoc();

    if (!$u) sendError('User not found', 404);

    // Auto-generate a TOTP secret if one doesn't exist
    $secret = $u['totp_secret'];
    if (!$secret) {
        $secret = generateTOTPSecret(24);
        $up = $conn->prepare("UPDATE users SET totp_secret = ? WHERE id = ?");
        $up->bind_param('si', $secret, $user_id);
        $up->execute();
    }

    // Build QR code URL so frontend can always display it
    $label = rawurlencode('LLB Accountants') . ':' . rawurlencode($u['username']);
    $otpauthUri = "otpauth://totp/{$label}?secret=" . urlencode($secret) . '&issuer=' . rawurlencode('LLB Accountants');
    $qrCodeUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' . urlencode($otpauthUri);

    sendResponse(true, [
        'hasSecret'  => true,
        'enabled'    => (bool)$u['totp_enabled'],
        'secret'     => $secret,
        'qrCodeUrl'  => $qrCodeUrl,
    ], 'TOTP status');
}

/**
 * POST - Validate a TOTP PIN; enables TOTP on first successful validation.
 * Payload: { pin }
 */
function handleTOTPvalidate($conn) {
    if (!isset($_SESSION['user_id'])) sendError('Not authenticated', 401);
    if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') sendError('Forbidden', 403);

    ensureTOTPColumns($conn);

    $user_id = (int)$_SESSION['user_id'];
    $data = getJSONInput();
    $missing = validateRequiredFields($data, ['pin']);
    if ($missing) sendError('Missing required fields: ' . implode(', ', $missing), 400);

    $pin = preg_replace('/\D+/', '', (string)$data['pin']);
    if (strlen($pin) !== 6) sendError('Invalid code', 400);

    $stmt = $conn->prepare("SELECT id, username, totp_secret, totp_enabled FROM users WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $u = $stmt->get_result()->fetch_assoc();
    if (!$u || !$u['totp_secret']) sendError('TOTP not set up', 400);

    $secret = $u['totp_secret'];
    $ok = validateTOTP($secret, $pin);
    if (!$ok) {
        sendError('Invalid code', 400);
    }

    if (!(bool)$u['totp_enabled']) {
        $conn->query("UPDATE users SET totp_enabled = 1 WHERE id = " . intval($user_id));
    }

    sendResponse(true, ['enabled' => true], 'Code verified');
}

/**
 * POST - Change password with TOTP
 * Payload: { pin, newPassword }
 */
function handleChangePasswordWithTOTP($conn) {
    if (!isset($_SESSION['user_id'])) sendError('Not authenticated', 401);
    if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') sendError('Forbidden', 403);

    ensureTOTPColumns($conn);

    $user_id = (int)$_SESSION['user_id'];
    $data = getJSONInput();
    $missing = validateRequiredFields($data, ['pin', 'newPassword']);
    if ($missing) sendError('Missing required fields: ' . implode(', ', $missing), 400);

    $pin = preg_replace('/\D+/', '', (string)$data['pin']);
    $newPassword = (string)$data['newPassword'];

    if (strlen($pin) !== 6) sendError('Invalid code', 400);
    if (strlen($newPassword) < 8) sendError('Password must be at least 8 characters', 400);

    $stmt = $conn->prepare("SELECT id, username, status, totp_secret, totp_enabled FROM users WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $u = $stmt->get_result()->fetch_assoc();

    if (!$u) sendError('User not found', 404);
    if ($u['status'] !== 'active') sendError('Account is not active', 403);
    if (!$u['totp_secret']) sendError('TOTP is not set up', 400);

    $secret = $u['totp_secret'];
    $ok = validateTOTP($secret, $pin);
    if (!$ok) sendError('Invalid code', 400);

    $hashed = hashPassword($newPassword);
    $up = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
    $up->bind_param('si', $hashed, $user_id);
    if (!$up->execute()) sendError('Failed to update password', 500);

    logActivity($conn, $user_id, 'change_password', 'Admin changed password via TOTP', 'authentication');

    sendResponse(true, null, 'Password changed successfully');
}

/**
 * Ensure hidden admin dashboard PIN setting exists.
 */
function ensureAdminDashboardPinSetting($conn) {
    $defaultPin = '1433';
    $stmt = $conn->prepare(
        "INSERT INTO settings (setting_key, setting_value, setting_type)
         VALUES ('admin_dashboard_access_pin', ?, 'string')
         ON DUPLICATE KEY UPDATE setting_key = setting_key"
    );
    if ($stmt) {
        $stmt->bind_param('s', $defaultPin);
        $stmt->execute();
        $stmt->close();
    }
}

/**
 * Read stored hidden admin dashboard PIN.
 */
function getAdminDashboardPin($conn) {
    ensureAdminDashboardPinSetting($conn);

    $stmt = $conn->prepare("SELECT setting_value FROM settings WHERE setting_key = 'admin_dashboard_access_pin' LIMIT 1");
    if (!$stmt) return '1433';

    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $pin = (string)($row['setting_value'] ?? '1433');
    $pin = preg_replace('/\D+/', '', $pin);
    if (strlen($pin) !== 4) return '1433';
    return $pin;
}

/**
 * POST - Verify hidden admin dashboard PIN.
 * Payload: { pin }
 */
function handleAdminVerifyDashboardPin($conn) {
    if (!isset($_SESSION['user_id'])) sendError('Not authenticated', 401);
    if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') sendError('Forbidden', 403);

    $data = getJSONInput();
    $pin = preg_replace('/\D+/', '', (string)($data['pin'] ?? ''));
    if (strlen($pin) !== 4) sendError('PIN must be exactly 4 digits', 400);

    $storedPin = getAdminDashboardPin($conn);
    if (!hash_equals($storedPin, $pin)) {
        sendError('Invalid dashboard PIN', 403);
    }

    $_SESSION['admin_dashboard_pin_verified_at'] = time();
    sendResponse(true, ['verified' => true], 'Dashboard PIN verified');
}

/**
 * POST - Update hidden admin dashboard PIN.
 * Payload: { newPin, totpPin }
 */
function handleAdminUpdateDashboardPin($conn) {
    if (!isset($_SESSION['user_id'])) sendError('Not authenticated', 401);
    if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') sendError('Forbidden', 403);

    ensureTOTPColumns($conn);
    ensureAdminDashboardPinSetting($conn);

    $user_id = (int)$_SESSION['user_id'];
    $data = getJSONInput();

    $newPin = preg_replace('/\D+/', '', (string)($data['newPin'] ?? ''));
    $totpPin = preg_replace('/\D+/', '', (string)($data['totpPin'] ?? ''));

    if (strlen($newPin) !== 4) sendError('New dashboard PIN must be exactly 4 digits', 400);
    if (strlen($totpPin) !== 6) sendError('Invalid authenticator code', 400);

    $stmt = $conn->prepare("SELECT id, username, status, totp_secret, totp_enabled FROM users WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $u = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$u) sendError('User not found', 404);
    if ($u['status'] !== 'active') sendError('Account is not active', 403);
    if (!$u['totp_secret']) sendError('TOTP is not set up', 400);

    if (!validateTOTP($u['totp_secret'], $totpPin)) {
        sendError('Invalid authenticator code', 400);
    }

    if (!(bool)$u['totp_enabled']) {
        $conn->query("UPDATE users SET totp_enabled = 1 WHERE id = " . intval($user_id));
    }

    $up = $conn->prepare(
        "INSERT INTO settings (setting_key, setting_value, setting_type)
         VALUES ('admin_dashboard_access_pin', ?, 'string')
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), setting_type = 'string', updated_at = NOW()"
    );
    $up->bind_param('s', $newPin);
    if (!$up->execute()) sendError('Failed to update dashboard PIN', 500);
    $up->close();

    logActivity($conn, $user_id, 'admin_update_dashboard_pin', 'Admin updated hidden dashboard PIN via TOTP', 'settings');

    sendResponse(true, null, 'Hidden dashboard PIN updated successfully');
}

function clearDataDeletionAccessSession() {
    unset($_SESSION['data_deletion_access_verified_until']);
    unset($_SESSION['data_deletion_access_code_hash']);
    unset($_SESSION['data_deletion_access_code_expires_at']);
    unset($_SESSION['data_deletion_access_code_attempts']);
}

function clearDataDeletionCodeSession() {
    unset($_SESSION['data_deletion_access_code_hash']);
    unset($_SESSION['data_deletion_access_code_expires_at']);
    unset($_SESSION['data_deletion_access_code_attempts']);
}

function maskEmailForDisplay($email) {
    $value = trim((string)$email);
    if ($value === '' || strpos($value, '@') === false) return '';

    [$local, $domain] = explode('@', $value, 2);
    $localLen = strlen($local);
    if ($localLen <= 2) {
        $maskedLocal = str_repeat('*', max(1, $localLen));
    } else {
        $maskedLocal = substr($local, 0, 1) . str_repeat('*', max(1, $localLen - 2)) . substr($local, -1);
    }

    return $maskedLocal . '@' . $domain;
}

function getCurrentAdminForDataDeletion($conn) {
    if (!isset($_SESSION['user_id'])) sendError('Not authenticated', 401);
    if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') sendError('Forbidden', 403);

    $user_id = (int)$_SESSION['user_id'];
    $stmt = $conn->prepare("SELECT id, username, first_name, last_name, email, password, status FROM users WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$user) sendError('User not found', 404);
    if (($user['status'] ?? '') !== 'active') sendError('Account is not active', 403);

    return $user;
}

/**
 * GET - Check current step-up status for data deletion page.
 */
function handleDataDeletionAccessStatus($conn) {
    $admin = getCurrentAdminForDataDeletion($conn);
    $now = time();

    $verifiedUntil = (int)($_SESSION['data_deletion_access_verified_until'] ?? 0);
    if ($verifiedUntil > 0 && $verifiedUntil <= $now) {
        unset($_SESSION['data_deletion_access_verified_until']);
        $verifiedUntil = 0;
    }

    $codeExpires = (int)($_SESSION['data_deletion_access_code_expires_at'] ?? 0);
    if ($codeExpires > 0 && $codeExpires <= $now) {
        clearDataDeletionCodeSession();
        $codeExpires = 0;
    }

    sendResponse(true, [
        'verified' => $verifiedUntil > $now,
        'verified_until' => $verifiedUntil > $now ? date('c', $verifiedUntil) : null,
        'code_requested' => !empty($_SESSION['data_deletion_access_code_hash']) && $codeExpires > $now,
        'code_expires_at' => $codeExpires > $now ? date('c', $codeExpires) : null,
        'email_masked' => maskEmailForDisplay($admin['email'] ?? ''),
    ], 'Data deletion access status');
}

/**
 * POST - Validate admin password and send 8-digit email code for data deletion.
 * Payload: { password }
 */
function handleDataDeletionRequestCode($conn) {
    $admin = getCurrentAdminForDataDeletion($conn);
    $data = getJSONInput();
    $password = (string)($data['password'] ?? '');

    if ($password === '') {
        sendError('Password is required', 400);
    }

    if (!verifyPassword($password, (string)$admin['password'])) {
        logActivity($conn, (int)$admin['id'], 'data_deletion_request_code_failed', 'Invalid admin password for data deletion access', 'settings');
        sendError('Invalid password', 401);
    }

    $toEmail = trim((string)($admin['email'] ?? ''));
    if ($toEmail === '') {
        sendError('Admin email is missing. Update your profile email first.', 400);
    }

    $code = str_pad((string)random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
    $codeHash = hash('sha256', $code);
    $expiresAtTs = time() + (10 * 60);

    clearDataDeletionAccessSession();
    $_SESSION['data_deletion_access_code_hash'] = $codeHash;
    $_SESSION['data_deletion_access_code_expires_at'] = $expiresAtTs;
    $_SESSION['data_deletion_access_code_attempts'] = 0;

    $fullName = trim((string)($admin['first_name'] ?? '') . ' ' . (string)($admin['last_name'] ?? ''));
    $displayName = $fullName !== '' ? $fullName : (string)($admin['username'] ?? 'Admin');
    $subject = 'Data Deletion Access Verification Code';

    $content = '<p>Hi ' . htmlspecialchars($displayName, ENT_QUOTES, 'UTF-8') . ',</p>'
        . '<p>Your verification code for Data Deletion Control is:</p>'
        . '<h2 style="letter-spacing:3px;margin:10px 0;">' . htmlspecialchars($code, ENT_QUOTES, 'UTF-8') . '</h2>'
        . '<p>This code expires in 10 minutes.</p>'
        . '<p>If you did not request this code, secure your account immediately.</p>';

    $html = function_exists('buildBrandedEmailLayout')
        ? buildBrandedEmailLayout($content, 'Your data deletion access code is ready.')
        : $content;

    $sent = function_exists('sendMail')
        ? sendMail($toEmail, $displayName, $subject, $html)
        : false;

    if (!$sent) {
        clearDataDeletionCodeSession();
        sendError('Failed to send verification code. Check email configuration.', 500);
    }

    logActivity($conn, (int)$admin['id'], 'data_deletion_request_code', 'Sent data deletion access code to admin email', 'settings');

    sendResponse(true, [
        'email_masked' => maskEmailForDisplay($toEmail),
        'code_expires_at' => date('c', $expiresAtTs),
    ], 'Verification code sent to admin email.');
}

/**
 * POST - Verify 8-digit code and grant temporary access to data deletion.
 * Payload: { code }
 */
function handleDataDeletionVerifyCode($conn) {
    $admin = getCurrentAdminForDataDeletion($conn);
    $data = getJSONInput();
    $code = preg_replace('/\D+/', '', (string)($data['code'] ?? ''));

    if (strlen($code) !== 8) {
        sendError('Verification code must be 8 digits', 400);
    }

    $now = time();
    $codeHash = (string)($_SESSION['data_deletion_access_code_hash'] ?? '');
    $codeExpires = (int)($_SESSION['data_deletion_access_code_expires_at'] ?? 0);
    $attempts = (int)($_SESSION['data_deletion_access_code_attempts'] ?? 0);

    if ($codeHash === '' || $codeExpires <= $now) {
        clearDataDeletionCodeSession();
        sendError('No active verification code. Request a new code.', 400);
    }

    if ($attempts >= 5) {
        clearDataDeletionCodeSession();
        sendError('Too many invalid attempts. Request a new code.', 429);
    }

    $incomingHash = hash('sha256', $code);
    if (!hash_equals($codeHash, $incomingHash)) {
        $_SESSION['data_deletion_access_code_attempts'] = $attempts + 1;
        if (((int)$_SESSION['data_deletion_access_code_attempts']) >= 5) {
            clearDataDeletionCodeSession();
            sendError('Too many invalid attempts. Request a new code.', 429);
        }
        sendError('Invalid verification code', 400);
    }

    clearDataDeletionCodeSession();
    $verifiedUntil = time() + (15 * 60);
    $_SESSION['data_deletion_access_verified_until'] = $verifiedUntil;

    logActivity($conn, (int)$admin['id'], 'data_deletion_access_verified', 'Admin completed step-up verification for data deletion', 'settings');

    sendResponse(true, [
        'verified' => true,
        'verified_until' => date('c', $verifiedUntil),
    ], 'Data deletion access granted.');
}

closeDBConnection($conn);
?>
