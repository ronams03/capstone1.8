<?php
/**
 * Settings API
 * Admin-only CRUD for key-value settings table
 *
 * GET  ?keys=key1,key2,...   — returns requested settings
 * PUT  body { settings: { key: value, ... } } — updates settings
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/utils.php';

setCORSHeaders();

$method = getRequestMethod();
$conn   = getDBConnection();

// Public endpoint: return login title lines without auth
if ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'public_login_title') {
    handlePublicLoginTitle($conn);
    closeDBConnection($conn);
    exit;
}

// Public endpoint: return privacy policy display settings without auth
if ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'public_privacy_policy_settings') {
    handlePublicPrivacyPolicySettings($conn);
    closeDBConnection($conn);
    exit;
}

// Public endpoint: return login captcha display settings without auth
if ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'public_login_captcha_settings') {
    handlePublicLoginCaptchaSettings($conn);
    closeDBConnection($conn);
    exit;
}

// Admin only
requireAuth();
requireRole(['admin']);

switch ($method) {
    case 'GET':
        handleGetSettings($conn);
        break;
    case 'PUT':
        handleUpdateSettings($conn);
        break;
    default:
        sendError('Method not allowed', 405);
}

/**
 * GET — Retrieve settings by keys
 */
function handleGetSettings($conn) {
    $keysParam = $_GET['keys'] ?? '';
    if ($keysParam === '') {
        sendError('Missing "keys" query parameter', 400);
    }

    $keys = array_map('trim', explode(',', $keysParam));
    $placeholders = implode(',', array_fill(0, count($keys), '?'));
    $types = str_repeat('s', count($keys));

    $sql  = "SELECT setting_key, setting_value, setting_type FROM settings WHERE setting_key IN ($placeholders)";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$keys);
    $stmt->execute();
    $result = $stmt->get_result();

    $settings = [];
    while ($row = $result->fetch_assoc()) {
        $val = $row['setting_value'];
        // Cast to native type
        if ($row['setting_type'] === 'number') {
            $val = is_numeric($val) ? (float)$val : $val;
        } elseif ($row['setting_type'] === 'boolean') {
            $val = ($val === '1' || $val === 'true');
        }
        $settings[$row['setting_key']] = $val;
    }
    $stmt->close();

    sendResponse(true, $settings, 'Settings retrieved');
}

/**
 * PUT — Update settings
 * Body: { "settings": { "lockout_enabled": true, "lockout_threshold_manager": 3, ... } }
 */
function handleUpdateSettings($conn) {
    $data     = getJSONInput();
    $settings = $data['settings'] ?? [];

    if (empty($settings) || !is_array($settings)) {
        sendError('Missing or invalid "settings" object', 400);
    }

    // Whitelist of allowed keys to prevent arbitrary setting injection
    $allowedKeys = [
        'lockout_enabled',
        'lockout_threshold_manager',
        'lockout_threshold_staff',
        'lockout_window_hours',
        'intruder_ip_lockout_enabled',
        'intruder_ip_lockout_threshold',
        'intruder_ip_lockout_window_hours',
        'login_title_line_1',
        'login_title_line_2',
        'login_title_line_3',
        'login_title_line_4',
        'backup_frequency',
        'backup_time',
        'backup_day_of_week',
        'backup_day_of_month',
        'pagination_items_per_page',
        'hourly_rate_staff',
        'hourly_rate_manager',
        'privacy_policy_watermark_enabled',
        'privacy_policy_watermark_count',
        'session_timeout_enabled',
        'session_timeout_manager_minutes',
        'session_timeout_staff_minutes',
        'captcha_timeout_seconds',
        'login_math_captcha_enabled',
        'login_failed_attempt_limit',
        'login_suspicious_risk_threshold',
        'rate_limit_enabled',
        'rate_limit_max_requests',
        'rate_limit_window_seconds',
        // Slider captcha bot-resistance
        'slider_min_drag_ms',
        'slider_max_attempts',
        'slider_tolerance_px',
        'slider_min_path_points',
    ];

    $updated = [];
    foreach ($settings as $key => $value) {
        if (!in_array($key, $allowedKeys)) {
            continue;
        }

        if ($key === 'pagination_items_per_page') {
            $value = max(1, min(100, (int)$value));
        }
        if ($key === 'privacy_policy_watermark_count') {
            $value = max(1, min(6, (int)$value));
        }
        if ($key === 'privacy_policy_watermark_enabled') {
            $value = !empty($value);
        }
        if ($key === 'session_timeout_enabled') {
            $value = !empty($value);
        }
        if ($key === 'session_timeout_manager_minutes' || $key === 'session_timeout_staff_minutes') {
            $value = max(1, min(1440, (int)$value));
        }
        if ($key === 'captcha_timeout_seconds') {
            $value = max(30, min(86400, (int)$value));
        }
        if ($key === 'login_math_captcha_enabled') {
            $value = !empty($value);
        }
        if ($key === 'login_failed_attempt_limit') {
            $value = max(1, min(20, (int)$value));
        }
        if ($key === 'login_suspicious_risk_threshold') {
            $value = max(1, min(10, (int)$value));
        }
        if ($key === 'rate_limit_enabled') {
            $value = !empty($value);
        }
        if ($key === 'rate_limit_max_requests') {
            $value = max(10, min(5000, (int)$value));
        }
        if ($key === 'rate_limit_window_seconds') {
            $value = max(10, min(86400, (int)$value));
        }
        if ($key === 'hourly_rate_staff' || $key === 'hourly_rate_manager') {
            $value = max(0, (float)$value);
        }
        if ($key === 'slider_min_drag_ms') {
            $value = max(200, min(5000, (int)$value));
        }
        if ($key === 'slider_max_attempts') {
            $value = max(1, min(10, (int)$value));
        }
        if ($key === 'slider_tolerance_px') {
            $value = max(8, min(40, (int)$value));
        }
        if ($key === 'slider_min_path_points') {
            $value = max(1, min(20, (int)$value));
        }

        // Normalise booleans for storage
        $storeVal = is_bool($value) ? ($value ? '1' : '0') : (string)$value;

        $stmt = $conn->prepare(
            "INSERT INTO settings (setting_key, setting_value, setting_type)
             VALUES (?, ?, CASE WHEN ? IN ('true','false','1','0') THEN 'boolean' ELSE 'number' END)
             ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()"
        );
        $stmt->bind_param('ssss', $key, $storeVal, $storeVal, $storeVal);
        $stmt->execute();
        $stmt->close();
        $updated[] = $key;
    }

    // Log
    $user_id = (int)$_SESSION['user_id'];
    logActivity($conn, $user_id, 'update_system_settings', 'Updated settings: ' . implode(', ', $updated), 'settings');

    sendResponse(true, null, 'Settings updated successfully');
}

/**
 * Public — Return login title lines (no auth required)
 */
function handlePublicLoginTitle($conn) {
    $keys = ['login_title_line_1','login_title_line_2','login_title_line_3','login_title_line_4'];
    $placeholders = implode(',', array_fill(0, count($keys), '?'));
    $types = str_repeat('s', count($keys));

    $sql  = "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ($placeholders)";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$keys);
    $stmt->execute();
    $result = $stmt->get_result();

    $settings = [];
    while ($row = $result->fetch_assoc()) {
        $settings[$row['setting_key']] = $row['setting_value'];
    }
    $stmt->close();

    sendResponse(true, $settings, 'Login title retrieved');
}

/**
 * Public - Return privacy policy display settings (no auth required)
 */
function handlePublicPrivacyPolicySettings($conn) {
    $keys = ['privacy_policy_watermark_enabled', 'privacy_policy_watermark_count'];
    $placeholders = implode(',', array_fill(0, count($keys), '?'));
    $types = str_repeat('s', count($keys));

    $sql  = "SELECT setting_key, setting_value, setting_type FROM settings WHERE setting_key IN ($placeholders)";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$keys);
    $stmt->execute();
    $result = $stmt->get_result();

    $settings = [
        'privacy_policy_watermark_enabled' => true,
        'privacy_policy_watermark_count' => 3,
    ];

    while ($row = $result->fetch_assoc()) {
        $val = $row['setting_value'];
        if ($row['setting_type'] === 'number') {
            $val = is_numeric($val) ? (int)$val : $val;
        } elseif ($row['setting_type'] === 'boolean') {
            $val = ($val === '1' || $val === 'true');
        }
        $settings[$row['setting_key']] = $val;
    }
    $stmt->close();

    $settings['privacy_policy_watermark_enabled'] = !empty($settings['privacy_policy_watermark_enabled']);
    $settings['privacy_policy_watermark_count'] = max(1, min(6, (int)$settings['privacy_policy_watermark_count']));

    sendResponse(true, $settings, 'Privacy policy display settings retrieved');
}

/**
 * Get a setting value from the settings table with a default fallback.
 */
function getSettingValue($conn, $key, $default = null) {
    if (!($conn instanceof mysqli)) return $default;
    $stmt = $conn->prepare("SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1");
    if (!$stmt) return $default;
    $stmt->bind_param('s', $key);
    $stmt->execute();
    $stmt->bind_result($value);
    $found = $stmt->fetch();
    $stmt->close();
    return $found ? $value : $default;
}

/**
 * Public - Return login captcha display settings (no auth required)
 */
function handlePublicLoginCaptchaSettings($conn) {
    $settings = [
        'login_math_captcha_enabled' => isLoginMathCaptchaEnabled($conn),
        'captcha_timeout_seconds' => getCaptchaTimeoutSeconds($conn),
        'login_failed_attempt_limit' => getLoginFailedAttemptLimit($conn),
        'slider_min_drag_ms' => (int)getSettingValue($conn, 'slider_min_drag_ms', 400),
        'slider_max_attempts' => (int)getSettingValue($conn, 'slider_max_attempts', 3),
    ];

    sendResponse(true, $settings, 'Login captcha display settings retrieved');
}

closeDBConnection($conn);
?>
