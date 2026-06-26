<?php
/**
 * Utility Functions for API
 * 
 * Common functions used across all API endpoints
 */

/**
 * Set CORS headers
 */
function setCORSHeaders() {
    // Get the origin from the request headers
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    
    // Allow all origins (or you can verify against a whitelist if needed)
    // We echo back the origin to support Access-Control-Allow-Credentials: true
    if ($origin) {
        header("Access-Control-Allow-Origin: $origin");
        header('Vary: Origin');
    } else {
         // Fallback for non-browser requests or when origin is missing
        header('Access-Control-Allow-Origin: *');
    }

    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Client-Browser-ID');

    // IMPORTANT: Browsers reject `Access-Control-Allow-Credentials: true` with wildcard origin.
    // Only set credentials header when an explicit Origin is present.
    if ($origin) {
        header('Access-Control-Allow-Credentials: true');
    }
    header('Content-Type: application/json; charset=UTF-8');
    
    // Handle preflight requests
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit();
    }

    // Enforce intruder browser lockout on every API request,
    // including unauthenticated endpoints.
    enforceIntruderBrowserLockout();

    // Enforce configurable request throttling to reduce abusive floods.
    enforceRequestRateLimit();

    // Enforce optional system lockdown mode.
    // When enabled, only admin traffic is allowed.
    enforceSystemLockdown();
}

/**
 * Get authenticated user id for activity logging.
 * @return int 0 when unavailable
 */
function getActivityLogUserId() {
    $user_id = $_SESSION['user_id'] ?? 0;
    return (is_numeric($user_id) && (int)$user_id > 0) ? (int)$user_id : 0;
}

/**
 * Normalize text for safe activity action tokens.
 * @param mixed $value
 * @return string
 */
function normalizeActivityToken($value) {
    $token = strtolower(trim((string)$value));
    $token = preg_replace('/[^a-z0-9]+/', '_', $token);
    $token = trim((string)$token, '_');
    return $token !== '' ? $token : 'unknown';
}

/**
 * Resolve current API endpoint token (without .php extension).
 * @return string
 */
function getActivityEndpointToken() {
    $script = basename($_SERVER['SCRIPT_NAME'] ?? '');
    $name = preg_replace('/\.php$/i', '', $script);
    return normalizeActivityToken($name);
}

/**
 * Convert an endpoint/action token into a readable label.
 * @param mixed $value
 * @return string
 */
function humanizeActivityLabel($value) {
    $label = trim((string)$value);
    if ($label === '') return 'Request';

    $label = str_replace('\\', '/', $label);
    $label = basename($label);
    $label = preg_replace('/\.php$/i', '', $label);
    $label = str_replace(['_', '-'], ' ', $label);
    $label = preg_replace('/\s+/', ' ', $label);
    $label = trim((string)$label);

    return $label !== '' ? ucwords($label) : 'Request';
}

/**
 * Build a clean activity description for automatic API logs.
 * @param bool $success
 * @param int $code
 * @param string $method
 * @param string $endpoint
 * @param string $message
 * @return string
 */
function buildAutoActivityDescription($success, $code, $method, $endpoint, $message = '') {
    $cleanMessage = preg_replace('/\s+/', ' ', trim((string)$message));
    if ($cleanMessage !== '') {
        return $cleanMessage;
    }

    $statusLabel = $success ? 'Successful' : 'Failed';
    $methodLabel = strtoupper(trim((string)$method));
    $endpointLabel = humanizeActivityLabel($endpoint);

    return trim(sprintf('%s %s request for %s', $statusLabel, $methodLabel, $endpointLabel));
}

/**
 * Clean legacy auto-generated activity descriptions for display.
 * @param mixed $description
 * @return string
 */
function cleanAutoActivityDescription($description) {
    $text = trim((string)$description);
    if ($text === '') return '';

    if (!preg_match('/^(SUCCESS|FAILED)\s+\[(\d+)\]\s+([A-Z]+)\s+([^|]+?)(?:\s+\|\s+(.*))?$/', $text, $matches)) {
        return $text;
    }

    $message = trim((string)($matches[5] ?? ''));
    if ($message !== '') {
        return $message;
    }

    $success = strtoupper((string)$matches[1]) === 'SUCCESS';
    $code = intval($matches[2] ?? 200);
    $method = strtoupper(trim((string)($matches[3] ?? 'UNKNOWN')));
    $uri = trim((string)($matches[4] ?? ''));
    $path = parse_url($uri, PHP_URL_PATH);
    $endpoint = $path !== null && $path !== false && $path !== '' ? basename((string)$path) : $uri;

    return buildAutoActivityDescription($success, $code, $method, (string)$endpoint, '');
}

function normalizePhoneCountryCode($value, $fallback = '+63') {
    $raw = trim((string)$value);
    $digits = preg_replace('/\D+/', '', $raw);
    if ($digits === '') {
        $fallbackDigits = preg_replace('/\D+/', '', (string)$fallback);
        return $fallbackDigits === '' ? '+63' : '+' . $fallbackDigits;
    }
    return '+' . $digits;
}

function sanitizeInternationalPhoneDraft($value) {
    $raw = (string)($value ?? '');
    if ($raw === '') return '';

    $sanitized = preg_replace('/[^\d+]/', '', $raw);
    if ($sanitized === null) return '';

    if (strpos($sanitized, '00') === 0) {
        $sanitized = '+' . substr($sanitized, 2);
    }

    if (strpos($sanitized, '+') === 0) {
        $sanitized = '+' . str_replace('+', '', substr($sanitized, 1));
    } else {
        $sanitized = str_replace('+', '', $sanitized);
    }

    return trim($sanitized);
}

/**
 * Normalize a phone number into international E.164-like format.
 * Empty values return null. Invalid values return false.
 * Raw local numbers inherit the provided default country code.
 * @param mixed $value
 * @param string $defaultCountryCode
 * @return string|false|null
 */
function normalizeInternationalPhoneNumber($value, $defaultCountryCode = '+63') {
    if (!isset($value)) return null;

    $defaultCode = normalizePhoneCountryCode($defaultCountryCode, '+63');
    $defaultDigits = substr($defaultCode, 1);
    $draft = sanitizeInternationalPhoneDraft($value);

    if ($draft === '' || $draft === '+' || $draft === $defaultCode) {
        return null;
    }

    if (strpos($draft, '+') !== 0) {
        $digits = preg_replace('/\D+/', '', $draft);
        if ($digits === '') return false;

        $normalizedLocalDigits = ltrim($digits, '0');
        if ($normalizedLocalDigits === '') {
            $normalizedLocalDigits = $digits;
        }

        if (strpos($normalizedLocalDigits, $defaultDigits) === 0) {
            $draft = '+' . $normalizedLocalDigits;
        } else {
            $draft = $defaultCode . $normalizedLocalDigits;
        }
    }

    $digits = preg_replace('/\D+/', '', substr($draft, 1));
    if (!preg_match('/^[1-9]\d{6,14}$/', (string)$digits)) {
        return false;
    }

    return '+' . $digits;
}

/**
 * Backward-compatible alias retained for existing callers.
 * @param mixed $value
 * @return string|false|null
 */
function normalizePhilippineMobileNumber($value) {
    return normalizeInternationalPhoneNumber($value, '+63');
}

/**
 * Decide if this request should be auto-logged.
 * Auto logging targets authenticated data-changing operations.
 * @param bool $success
 * @return bool
 */
function shouldAutoLogActivity($success) {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? '');
    if (!in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        return false;
    }

    if (getActivityLogUserId() <= 0) {
        return false;
    }

    // Avoid duplicate "success" entries when an endpoint already writes a manual log.
    if ($success && !empty($GLOBALS['__activity_logged_manually'])) {
        return false;
    }

    $script = strtolower(basename($_SERVER['SCRIPT_NAME'] ?? ''));
    if ($script === 'activity-logs.php') {
        return false;
    }

    return true;
}

/**
 * Resolve a database connection for automatic logging.
 * Reuses endpoint connection when available.
 * @return array{0:mixed,1:bool} [connection, shouldClose]
 */
function getAutoLogConnection() {
    if (isset($GLOBALS['conn']) && $GLOBALS['conn'] instanceof mysqli) {
        return [$GLOBALS['conn'], false];
    }

    return [null, false];
}

/**
 * Automatic activity logging for API responses.
 * @param bool $success
 * @param string $message
 * @param int $code
 * @return void
 */
function autoLogApiActivity($success, $message = '', $code = 200) {
    if (!shouldAutoLogActivity((bool)$success)) {
        return;
    }

    if (!function_exists('logActivity')) {
        return;
    }

    $user_id = getActivityLogUserId();
    if ($user_id <= 0) {
        return;
    }

    [$db, $should_close] = getAutoLogConnection();
    if (!$db) {
        return;
    }

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN');
    $endpoint = getActivityEndpointToken();
    $action_param = normalizeActivityToken($_GET['action'] ?? '');
    $action = strtolower($method) . '_' . $endpoint;
    if (!empty($_GET['action'])) {
        $action .= '_' . $action_param;
    }
    $action = substr($action, 0, 100);

    $description = buildAutoActivityDescription((bool)$success, (int)$code, $method, $endpoint, (string)$message);

    try {
        logActivity($db, $user_id, $action, $description, $endpoint);
    } catch (Throwable $e) {
        // Intentionally ignore logging failures to avoid breaking API responses.
    }

    if ($should_close && function_exists('closeDBConnection')) {
        closeDBConnection($db);
    }
}

/**
 * Send JSON response
 * @param bool $success Success status
 * @param mixed $data Response data
 * @param string $message Response message
 * @param int $code HTTP status code
 */
function buildJsonResponsePayload($success, $data = null, $message = '', $errors = null) {
    $response = [
        'success' => $success,
        'message' => $message
    ];

    if ($data !== null) {
        $response['data'] = $data;
    }

    if ($errors !== null) {
        $response['errors'] = $errors;
    }

    return $response;
}

function sendResponse($success, $data = null, $message = '', $code = 200) {
    http_response_code($code);

    autoLogApiActivity((bool)$success, (string)$message, (int)$code);

    echo json_encode(buildJsonResponsePayload($success, $data, $message), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit();
}

/**
 * Send error response
 * @param string $message Error message
 * @param int $code HTTP status code
 * @param mixed $errors Additional error details
 */
function sendError($message, $code = 400, $errors = null) {
    http_response_code($code);

    autoLogApiActivity(false, (string)$message, (int)$code);

    echo json_encode(buildJsonResponsePayload(false, null, $message, $errors), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit();
}

/**
 * Send a JSON response to the client immediately, then continue running a callback.
 * Useful for background email work that should not block the UI.
 *
 * @param bool $success
 * @param mixed $data
 * @param string $message
 * @param int $code
 * @param callable|null $callback
 */
function sendResponseAndContinue($success, $data = null, $message = '', $code = 200, $callback = null) {
    http_response_code($code);

    autoLogApiActivity((bool)$success, (string)$message, (int)$code);

    $body = json_encode(buildJsonResponsePayload($success, $data, $message), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($body === false) {
        $body = json_encode([
            'success' => (bool)$success,
            'message' => (string)$message,
        ]);
    }

    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

    if (function_exists('session_status') && session_status() === PHP_SESSION_ACTIVE) {
        @session_write_close();
    }

    ignore_user_abort(true);
    @set_time_limit(0);
    @ini_set('zlib.output_compression', '0');
    if (function_exists('apache_setenv')) {
        @apache_setenv('no-gzip', '1');
    }

    $bodyLength = strlen((string)$body);
    header('Connection: close');
    header('Content-Length: ' . $bodyLength);

    echo $body;

    $didFastClose = false;
    if (function_exists('fastcgi_finish_request')) {
        @fastcgi_finish_request();
        $didFastClose = true;
    }

    if (!$didFastClose) {
        while (ob_get_level() > 0) {
            @ob_end_flush();
        }
        @flush();
    }

    if (is_callable($callback)) {
        try {
            $callback();
        } catch (\Throwable $throwable) {
            error_log('Background callback failed: ' . $throwable->getMessage());
        } catch (\Exception $exception) {
            error_log('Background callback failed: ' . $exception->getMessage());
        }
    }

    exit();
}

/**
 * Get request method
 * @return string HTTP request method
 */
function getRequestMethod() {
    return $_SERVER['REQUEST_METHOD'];
}

/**
 * Get JSON input data
 * If JSON is invalid or empty, returns an empty array to avoid null deref errors.
 * @return array
 */
function getJSONInput() {
    $input = file_get_contents('php://input');
    if ($input === false || trim($input) === '') {
        return [];
    }

    $decoded = json_decode($input, true);
    if (!is_array($decoded)) {
        return [];
    }

    return $decoded;
}

/**
 * Validate email format
 * @param string $email Email address to validate
 * @return bool True if valid, false otherwise
 */
function validateEmail($email) {
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

/**
 * Validate allowed email domains.
 * Currently allowed: @gmail.com, @phinmaed.com
 * @param string $email Email address to validate
 * @return bool True if valid and domain is allowed, false otherwise
 */
function validateGmailComEmail($email) {
    $value = trim((string)$email);
    if (!validateEmail($value)) return false;
    return (bool)preg_match('/@(gmail\.com|phinmaed\.com)$/i', $value);
}

/**
 * Validate date format (Y-m-d)
 * @param string $date Date string to validate
 * @return bool True if valid, false otherwise
 */
function validateDate($date) {
    $d = DateTime::createFromFormat('Y-m-d', $date);
    return $d && $d->format('Y-m-d') === $date;
}

/**
 * Validate datetime format (Y-m-d H:i:s)
 * @param string $datetime Datetime string to validate
 * @return bool True if valid, false otherwise
 */
function validateDateTime($datetime) {
    $d = DateTime::createFromFormat('Y-m-d H:i:s', $datetime);
    return $d && $d->format('Y-m-d H:i:s') === $datetime;
}

/**
 * Generate unique ID with prefix
 * @param string $prefix Prefix for the ID
 * @return string Generated unique ID
 */
function generateUniqueID($prefix = '') {
    return $prefix . date('Ymd') . '-' . uniqid();
}

/**
 * Check if user is authenticated (basic session check)
 * @return int|false User ID if authenticated, false otherwise
 */
function checkAuthentication() {
    // Session should already be started by the calling script
    
    if (isset($_SESSION['user_id']) && !empty($_SESSION['user_id'])) {
        return $_SESSION['user_id'];
    }
    
    return false;
}

/**
 * Resolve browser identifier used by intruder browser lockout.
 * Prefers explicit frontend header, then session id, then UA+IP fingerprint.
 * @return string
 */
function getIntruderBrowserIdentifier() {
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
 * Resolve the request throttling key for the current client.
 * Reuses the browser identifier when available and falls back to a network fingerprint.
 * @return string
 */
function getRequestRateLimitClientKey() {
    $browserKey = trim((string)getIntruderBrowserIdentifier());
    if ($browserKey !== '') {
        return substr($browserKey, 0, 64);
    }

    $remote = trim((string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'));
    $ua = trim((string)($_SERVER['HTTP_USER_AGENT'] ?? 'unknown'));
    return substr(hash('sha256', $remote . '|' . $ua), 0, 64);
}

/**
 * Resolve when an intruder browser block should expire.
 * Browser blocks are intentionally temporary so the login page is never locked permanently.
 * @param int $windowHours
 * @return string
 */
function getIntruderBrowserBlockUntilValue($windowHours) {
    $hours = max(1, (int)$windowHours);
    return date('Y-m-d H:i:s', time() + ($hours * 3600));
}

/**
 * Ensure request throttling storage and default settings exist.
 * @param mysqli $conn
 * @return void
 */
function ensureRequestRateLimitStorage($conn) {
    if (!$conn || !($conn instanceof mysqli)) return;

    $conn->query(
        "CREATE TABLE IF NOT EXISTS request_rate_limits (
            client_key VARCHAR(64) NOT NULL PRIMARY KEY,
            request_count INT NOT NULL DEFAULT 0,
            window_start DATETIME NOT NULL,
            last_request_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_request_rate_limits_last_request_at (last_request_at),
            INDEX idx_request_rate_limits_window_start (window_start)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $conn->query(
        "INSERT INTO settings (setting_key, setting_value, setting_type) VALUES
            ('rate_limit_enabled', '1', 'boolean'),
            ('rate_limit_max_requests', '180', 'number'),
            ('rate_limit_window_seconds', '60', 'number')
         ON DUPLICATE KEY UPDATE setting_key = setting_key"
    );
}

/**
 * Load global request throttling settings.
 * @param mysqli $conn
 * @return array{enabled:bool,max_requests:int,window_seconds:int}
 */
function getRequestRateLimitConfig($conn) {
    $cfg = [
        'rate_limit_enabled' => '1',
        'rate_limit_max_requests' => '180',
        'rate_limit_window_seconds' => '60',
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

    $enabledRaw = strtolower(trim((string)($cfg['rate_limit_enabled'] ?? '1')));
    $enabled = in_array($enabledRaw, ['1', 'true', 'yes', 'on'], true);
    $maxRequests = max(10, min(5000, (int)($cfg['rate_limit_max_requests'] ?? 180)));
    $windowSeconds = max(10, min(86400, (int)($cfg['rate_limit_window_seconds'] ?? 60)));

    return [
        'enabled' => $enabled,
        'max_requests' => $maxRequests,
        'window_seconds' => $windowSeconds,
    ];
}

/**
 * Advance the request throttling counter for the current client.
 * @param mysqli $conn
 * @param string $clientKey
 * @param int $windowSeconds
 * @return array{request_count:int,window_start:string,last_request_at:string}|null
 */
function updateRequestRateLimitState($conn, $clientKey, $windowSeconds) {
    $now = date('Y-m-d H:i:s');
    $windowResetBefore = date('Y-m-d H:i:s', time() - max(1, (int)$windowSeconds));

    $upsert = $conn->prepare(
        "INSERT INTO request_rate_limits (client_key, request_count, window_start, last_request_at)
         VALUES (?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE
            request_count = CASE WHEN window_start <= ? THEN 1 ELSE request_count + 1 END,
            window_start = CASE WHEN window_start <= ? THEN VALUES(window_start) ELSE window_start END,
            last_request_at = VALUES(last_request_at),
            updated_at = CURRENT_TIMESTAMP"
    );
    if (!$upsert) return null;

    $upsert->bind_param('sssss', $clientKey, $now, $now, $windowResetBefore, $windowResetBefore);
    $upsert->execute();
    $upsert->close();

    $read = $conn->prepare(
        "SELECT request_count, window_start, last_request_at
         FROM request_rate_limits
         WHERE client_key = ?
         LIMIT 1"
    );
    if (!$read) return null;

    $read->bind_param('s', $clientKey);
    $read->execute();
    $row = $read->get_result()->fetch_assoc();
    $read->close();

    if (!$row) return null;

    return [
        'request_count' => (int)($row['request_count'] ?? 0),
        'window_start' => (string)($row['window_start'] ?? ''),
        'last_request_at' => (string)($row['last_request_at'] ?? ''),
    ];
}

/**
 * Best-effort cleanup for stale request throttling rows.
 * @param mysqli $conn
 * @return void
 */
function cleanupRequestRateLimitState($conn) {
    if (!$conn || !($conn instanceof mysqli)) return;
    if (mt_rand(1, 100) !== 1) return;

    $cutoff = date('Y-m-d H:i:s', time() - 86400);
    $stmt = $conn->prepare("DELETE FROM request_rate_limits WHERE last_request_at < ? LIMIT 500");
    if (!$stmt) return;

    $stmt->bind_param('s', $cutoff);
    $stmt->execute();
    $stmt->close();
}

/**
 * Public status check must bypass hard lock enforcement so the frontend can
 * discover when an admin has unblocked the browser.
 * @return bool
 */
function isIntruderBrowserLockoutBypassRequest() {
    $script = strtolower((string)basename($_SERVER['SCRIPT_NAME'] ?? ''));
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $action = strtolower(trim((string)($_GET['action'] ?? '')));

    return $script === 'auth.php'
        && $method === 'GET'
        && $action === 'intruder_status';
}

/**
 * Ensure intruder browser lockout storage and settings exist.
 * Uses historical table/setting names for backward compatibility.
 * @param mysqli $conn
 * @return void
 */
function ensureIntruderBrowserLockoutStorage($conn) {
    if (!$conn || !($conn instanceof mysqli)) return;

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
 * Load intruder browser lockout settings.
 * @param mysqli $conn
 * @return array{enabled:bool,threshold:int,window_hours:int}
 */
function getIntruderBrowserLockoutConfig($conn) {
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
 * Load browser state and reset expired windows.
 * @param mysqli $conn
 * @param string $browserKey
 * @param int $windowHours
 * @return array<string,mixed>|null
 */
function loadIntruderBrowserLockoutState($conn, $browserKey, $windowHours) {
    $stmt = $conn->prepare("SELECT failed_count, window_start, blocked_until FROM intruder_ip_lockouts WHERE ip_address = ? LIMIT 1");
    if (!$stmt) return null;

    $stmt->bind_param('s', $browserKey);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) return null;

    $now = time();
    $windowSeconds = max(1, (int)$windowHours) * 3600;
    $windowStartTs = $row['window_start'] ? strtotime((string)$row['window_start']) : null;
    $blockedUntilTs = $row['blocked_until'] ? strtotime((string)$row['blocked_until']) : null;

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
            $reset->bind_param('s', $browserKey);
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

/**
 * Returns intruder browser lockout state for the current request browser.
 * @param mysqli $conn
 * @param string $browserKey
 * @return array{blocked:bool,window_hours:int,remaining_minutes:int,remaining_hours:int,requires_admin_unblock:bool}
 */
function getIntruderBrowserBlockInfo($conn, $browserKey) {
    $cfg = getIntruderBrowserLockoutConfig($conn);
    if (!$cfg['enabled']) {
        return [
            'blocked' => false,
            'window_hours' => (int)$cfg['window_hours'],
            'remaining_minutes' => 0,
            'remaining_hours' => 0,
            'requires_admin_unblock' => false,
        ];
    }

    $state = loadIntruderBrowserLockoutState($conn, $browserKey, (int)$cfg['window_hours']);
    $blockedUntilTs = $state && !empty($state['blocked_until'])
        ? strtotime((string)$state['blocked_until'])
        : false;

    if (!$blockedUntilTs || $blockedUntilTs <= time()) {
        return [
            'blocked' => false,
            'window_hours' => (int)$cfg['window_hours'],
            'remaining_minutes' => 0,
            'remaining_hours' => 0,
            'requires_admin_unblock' => false,
        ];
    }

    return [
        'blocked' => true,
        'window_hours' => (int)$cfg['window_hours'],
        'remaining_minutes' => max(1, (int)ceil(($blockedUntilTs - time()) / 60)),
        'remaining_hours' => max(1, (int)ceil(($blockedUntilTs - time()) / 3600)),
        'requires_admin_unblock' => false,
    ];
}

/**
 * Enforce intruder browser lockout globally for this request.
 * @param mysqli|null $conn
 * @return void
 */
function enforceIntruderBrowserLockout($conn = null) {
    static $checked = false;
    if ($checked) return;
    $checked = true;

    if (isIntruderBrowserLockoutBypassRequest()) {
        return;
    }

    $db = ($conn instanceof mysqli) ? $conn : null;
    if (!$db && isset($GLOBALS['conn']) && $GLOBALS['conn'] instanceof mysqli) {
        $db = $GLOBALS['conn'];
    }

    $shouldClose = false;
    if (!$db && function_exists('getDBConnection')) {
        try {
            $db = getDBConnection();
            $shouldClose = true;
        } catch (Throwable $e) {
            $db = null;
        }
    }

    if (!$db) return;

    ensureIntruderBrowserLockoutStorage($db);
    $browserKey = getIntruderBrowserIdentifier();
    $info = getIntruderBrowserBlockInfo($db, $browserKey);

    if ($shouldClose && function_exists('closeDBConnection')) {
        closeDBConnection($db);
    }

    if (!$info['blocked']) return;

    sendError(
        'INTRUDER BLOCKED. This browser cannot access the system until an administrator unblocks it.',
        429
    );
}

/**
 * Enforce configurable request throttling globally for this request.
 * @param mysqli|null $conn
 * @return void
 */
function enforceRequestRateLimit($conn = null) {
    static $checked = false;
    if ($checked) return;
    $checked = true;

    $db = ($conn instanceof mysqli) ? $conn : null;
    if (!$db && isset($GLOBALS['conn']) && $GLOBALS['conn'] instanceof mysqli) {
        $db = $GLOBALS['conn'];
    }

    $shouldClose = false;
    if (!$db && function_exists('getDBConnection')) {
        try {
            $db = getDBConnection();
            $shouldClose = true;
        } catch (Throwable $e) {
            $db = null;
        }
    }

    if (!$db) return;

    ensureRequestRateLimitStorage($db);
    $cfg = getRequestRateLimitConfig($db);

    if (!$cfg['enabled']) {
        if ($shouldClose && function_exists('closeDBConnection')) {
            closeDBConnection($db);
        }
        return;
    }

    $clientKey = getRequestRateLimitClientKey();
    $state = updateRequestRateLimitState($db, $clientKey, (int)$cfg['window_seconds']);
    cleanupRequestRateLimitState($db);

    if ($shouldClose && function_exists('closeDBConnection')) {
        closeDBConnection($db);
    }

    if (!$state) return;
    if ((int)$state['request_count'] <= (int)$cfg['max_requests']) return;

    $windowStartTs = strtotime((string)$state['window_start']);
    $retryAfterSeconds = 1;
    if ($windowStartTs !== false) {
        $retryAfterSeconds = max(1, ($windowStartTs + (int)$cfg['window_seconds']) - time());
    }

    header('Retry-After: ' . $retryAfterSeconds);
    sendError(
        'Rate limit exceeded. Too many requests from this browser or network. Please wait before trying again.',
        429,
        [
            'retry_after_seconds' => $retryAfterSeconds,
            'limit' => (int)$cfg['max_requests'],
            'window_seconds' => (int)$cfg['window_seconds'],
        ]
    );
}

/**
 * Ensure system lockdown settings exist.
 * @param mysqli $conn
 * @return void
 */
function ensureSystemLockdownSettings($conn) {
    if (!$conn || !($conn instanceof mysqli)) return;

    $conn->query(
        "INSERT INTO settings (setting_key, setting_value, setting_type) VALUES
            ('security_lockdown_enabled', '0', 'boolean'),
            ('security_lockdown_reason', '', 'string'),
            ('security_lockdown_updated_at', '', 'string'),
            ('security_lockdown_updated_by', '', 'string')
         ON DUPLICATE KEY UPDATE setting_key = setting_key"
    );
}

/**
 * Read lockdown status from settings.
 * @param mysqli $conn
 * @return array{enabled:bool,reason:string,updated_at:string,updated_by:string}
 */
function getSystemLockdownState($conn) {
    ensureSystemLockdownSettings($conn);
    return [
        'enabled' => false,
        'reason' => '',
        'updated_at' => '',
        'updated_by' => '',
    ];
}

/**
 * True when request should bypass lockdown gate before role checks.
 * This keeps admin login/logout flows available while lockdown is enabled.
 * @return bool
 */
function isSystemLockdownBypassRequest() {
    $script = strtolower((string)basename($_SERVER['SCRIPT_NAME'] ?? ''));
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $action = strtolower(trim((string)($_GET['action'] ?? '')));

    if ($script === 'auth.php') {
        // Allow essential auth operations even during lockdown (admin login/logout).
        if ($method === 'POST' && in_array($action, ['login', 'logout'], true)) {
            return true;
        }
        // Allow session checks so non-admins can receive lockdown status messaging.
        if ($method === 'GET' && in_array($action, ['', 'session', 'lockdown_status'], true)) {
            return true;
        }
    }

    return false;
}

/**
 * Enforce lockdown mode globally.
 * @param mysqli|null $conn
 * @return void
 */
function enforceSystemLockdown($conn = null) {
    return;
}

/**
 * Presence window (seconds) used for "online" checks.
 * Accounts with a heartbeat newer than this window are treated as online.
 * @return int
 */
function getSessionPresenceWindowSeconds() {
    return 180; // 3 minutes
}

/**
 * Ensure table exists for active account presence tracking.
 * @param mysqli $conn
 * @return void
 */
function ensureSessionPresenceStorage($conn) {
    if (!$conn || !($conn instanceof mysqli)) return;

    $conn->query(
        "CREATE TABLE IF NOT EXISTS active_user_sessions (
            user_id INT NOT NULL PRIMARY KEY,
            session_id VARCHAR(128) NOT NULL,
            role VARCHAR(20) NOT NULL,
            last_seen DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_active_user_last_seen (last_seen)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

/**
 * Resolve DB connection for presence operations.
 * @param mysqli|null $conn
 * @return array{0:mixed,1:bool}
 */
function resolvePresenceConnection($conn = null) {
    if ($conn instanceof mysqli) return [$conn, false];
    if (isset($GLOBALS['conn']) && $GLOBALS['conn'] instanceof mysqli) return [$GLOBALS['conn'], false];

    if (function_exists('getDBConnection')) {
        try {
            return [getDBConnection(), true];
        } catch (Throwable $e) {
            return [null, false];
        }
    }

    return [null, false];
}

/**
 * Remove stale presence rows outside the online window.
 * @param mysqli $conn
 * @return void
 */
function purgeStaleSessionPresence($conn) {
    if (!$conn || !($conn instanceof mysqli)) return;
    $windowSeconds = max(30, intval(getSessionPresenceWindowSeconds()));
    $stmt = $conn->prepare(
        "DELETE FROM active_user_sessions
         WHERE last_seen < DATE_SUB(NOW(), INTERVAL ? SECOND)"
    );
    if (!$stmt) return;
    $stmt->bind_param('i', $windowSeconds);
    $stmt->execute();
    $stmt->close();
}

/**
 * Upsert presence heartbeat for current authenticated session identity.
 * @param mysqli|null $conn
 * @return void
 */
function touchCurrentSessionPresence($conn = null) {
    $userId = intval($_SESSION['user_id'] ?? 0);
    $role = strtolower(trim((string)($_SESSION['role'] ?? '')));
    if ($userId <= 0 || $role === '') return;

    $sid = session_id();
    if (!$sid) return;

    [$db, $shouldClose] = resolvePresenceConnection($conn);
    if (!$db) return;

    ensureSessionPresenceStorage($db);
    purgeStaleSessionPresence($db);

    $stmt = $db->prepare(
        "INSERT INTO active_user_sessions
            (user_id, session_id, role, last_seen)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
            session_id = VALUES(session_id),
            role = VALUES(role),
            last_seen = VALUES(last_seen),
            updated_at = CURRENT_TIMESTAMP"
    );

    if ($stmt) {
        $stmt->bind_param('iss', $userId, $sid, $role);
        $stmt->execute();
        $stmt->close();
    }

    if ($shouldClose && function_exists('closeDBConnection')) {
        closeDBConnection($db);
    }
}

/**
 * Remove a presence row for a user id.
 * @param int $userId
 * @param mysqli|null $conn
 * @return void
 */
function clearSessionPresenceByUser($userId, $conn = null) {
    $uid = intval($userId);
    if ($uid <= 0) return;

    [$db, $shouldClose] = resolvePresenceConnection($conn);
    if (!$db) return;

    ensureSessionPresenceStorage($db);
    $stmt = $db->prepare("DELETE FROM active_user_sessions WHERE user_id = ?");
    if ($stmt) {
        $stmt->bind_param('i', $uid);
        $stmt->execute();
        $stmt->close();
    }

    if ($shouldClose && function_exists('closeDBConnection')) {
        closeDBConnection($db);
    }
}

/**
 * Check whether the account holder is currently online.
 * @param mysqli $conn
 * @param int $userId
 * @return bool
 */
function isRealUserCurrentlyOnline($conn, $userId) {
    $uid = intval($userId);
    if ($uid <= 0 || !$conn || !($conn instanceof mysqli)) return false;

    ensureSessionPresenceStorage($conn);
    purgeStaleSessionPresence($conn);
    $windowSeconds = max(30, intval(getSessionPresenceWindowSeconds()));

    $stmt = $conn->prepare(
         "SELECT 1
         FROM active_user_sessions
         WHERE user_id = ?
           AND last_seen >= DATE_SUB(NOW(), INTERVAL ? SECOND)
         LIMIT 1"
    );
    if (!$stmt) return false;
    $stmt->bind_param('ii', $uid, $windowSeconds);
    $stmt->execute();
    $online = $stmt->get_result()->num_rows > 0;
    $stmt->close();
    return $online;
}

/**
 * Default inactivity timeout policy for manager/staff sessions.
 * @return array{enabled:bool,manager_minutes:int,staff_minutes:int}
 */
function getDefaultManagedRoleSessionTimeoutConfig() {
    return [
        'enabled' => true,
        'manager_minutes' => 30,
        'staff_minutes' => 30,
    ];
}

/**
 * Ensure manager/staff session timeout settings exist.
 * @param mysqli $conn
 * @return void
 */
function ensureManagedRoleSessionTimeoutSettings($conn) {
    if (!$conn || !($conn instanceof mysqli)) return;

    $conn->query(
        "INSERT INTO settings (setting_key, setting_value, setting_type) VALUES
            ('session_timeout_enabled', '1', 'boolean'),
            ('session_timeout_manager_minutes', '30', 'number'),
            ('session_timeout_staff_minutes', '30', 'number')
         ON DUPLICATE KEY UPDATE setting_key = setting_key"
    );
}

/**
 * Load manager/staff inactivity timeout policy from settings.
 * @param mysqli|null $conn
 * @return array{enabled:bool,manager_minutes:int,staff_minutes:int}
 */
function getManagedRoleSessionTimeoutConfig($conn = null) {
    static $cached = null;
    if (is_array($cached)) {
        return $cached;
    }

    $defaults = getDefaultManagedRoleSessionTimeoutConfig();
    [$db, $shouldClose] = resolvePresenceConnection($conn);
    if (!$db) {
        $cached = $defaults;
        return $cached;
    }

    ensureManagedRoleSessionTimeoutSettings($db);

    $raw = [
        'session_timeout_enabled' => $defaults['enabled'] ? '1' : '0',
        'session_timeout_manager_minutes' => (string)$defaults['manager_minutes'],
        'session_timeout_staff_minutes' => (string)$defaults['staff_minutes'],
    ];

    $keys = array_keys($raw);
    $placeholders = implode(',', array_fill(0, count($keys), '?'));
    $types = str_repeat('s', count($keys));

    $stmt = $db->prepare("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ($placeholders)");
    if ($stmt) {
        $stmt->bind_param($types, ...$keys);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $key = (string)($row['setting_key'] ?? '');
            if (array_key_exists($key, $raw)) {
                $raw[$key] = (string)($row['setting_value'] ?? $raw[$key]);
            }
        }
        $stmt->close();
    }

    if ($shouldClose && function_exists('closeDBConnection')) {
        closeDBConnection($db);
    }

    $enabledRaw = strtolower(trim((string)($raw['session_timeout_enabled'] ?? '1')));
    $enabled = in_array($enabledRaw, ['1', 'true', 'yes', 'on'], true);
    $managerMinutes = max(1, min(1440, intval($raw['session_timeout_manager_minutes'] ?? $defaults['manager_minutes'])));
    $staffMinutes = max(1, min(1440, intval($raw['session_timeout_staff_minutes'] ?? $defaults['staff_minutes'])));

    $cached = [
        'enabled' => $enabled,
        'manager_minutes' => $managerMinutes,
        'staff_minutes' => $staffMinutes,
    ];

    return $cached;
}

/**
 * Default login math captcha enabled state.
 * @return bool
 */
function getDefaultLoginMathCaptchaEnabled() {
    return true;
}

/**
 * Default login captcha expiry window in seconds.
 * @return int
 */
function getDefaultCaptchaTimeoutSeconds() {
    return 300;
}

/**
 * Default failed login/captcha attempt limit before the account is locked.
 * @return int
 */
function getDefaultLoginFailedAttemptLimit() {
    return 5;
}

/**
 * Ensure login captcha timeout setting exists.
 * @param mysqli $conn
 * @return void
 */
function ensureCaptchaTimeoutSetting($conn) {
    if (!$conn || !($conn instanceof mysqli)) return;

    $defaultSeconds = (string)getDefaultCaptchaTimeoutSeconds();
    $defaultEnabled = getDefaultLoginMathCaptchaEnabled() ? '1' : '0';
    $defaultAttemptLimit = (string)getDefaultLoginFailedAttemptLimit();
    $conn->query(
        "INSERT INTO settings (setting_key, setting_value, setting_type) VALUES
            ('captcha_timeout_seconds', '{$defaultSeconds}', 'number'),
            ('login_math_captcha_enabled', '{$defaultEnabled}', 'boolean'),
            ('login_failed_attempt_limit', '{$defaultAttemptLimit}', 'number')
         ON DUPLICATE KEY UPDATE setting_key = setting_key"
    );
}

/**
 * Load login captcha expiry window from settings.
 * @param mysqli|null $conn
 * @return int
 */
function getCaptchaTimeoutSeconds($conn = null) {
    static $cached = null;
    if (is_int($cached)) {
        return $cached;
    }

    $defaultSeconds = getDefaultCaptchaTimeoutSeconds();
    [$db, $shouldClose] = resolvePresenceConnection($conn);
    if (!$db) {
        $cached = $defaultSeconds;
        return $cached;
    }

    ensureCaptchaTimeoutSetting($db);

    $value = $defaultSeconds;
    $stmt = $db->prepare("SELECT setting_value FROM settings WHERE setting_key = 'captcha_timeout_seconds' LIMIT 1");
    if ($stmt) {
        $stmt->execute();
        $stmt->bind_result($settingValue);
        if ($stmt->fetch()) {
            $value = (int)$settingValue;
        }
        $stmt->close();
    }

    if ($shouldClose && function_exists('closeDBConnection')) {
        closeDBConnection($db);
    }

    $cached = max(30, min(86400, (int)$value));
    return $cached;
}

/**
 * Load login math captcha enabled state from settings.
 * @param mysqli|null $conn
 * @return bool
 */
function isLoginMathCaptchaEnabled($conn = null) {
    static $cached = null;
    if (is_bool($cached)) {
        return $cached;
    }

    $defaultEnabled = getDefaultLoginMathCaptchaEnabled();
    [$db, $shouldClose] = resolvePresenceConnection($conn);
    if (!$db) {
        $cached = $defaultEnabled;
        return $cached;
    }

    ensureCaptchaTimeoutSetting($db);

    $value = $defaultEnabled ? '1' : '0';
    $stmt = $db->prepare("SELECT setting_value FROM settings WHERE setting_key = 'login_math_captcha_enabled' LIMIT 1");
    if ($stmt) {
        $stmt->execute();
        $stmt->bind_result($settingValue);
        if ($stmt->fetch()) {
            $value = (string)$settingValue;
        }
        $stmt->close();
    }

    if ($shouldClose && function_exists('closeDBConnection')) {
        closeDBConnection($db);
    }

    $normalized = strtolower(trim((string)$value));
    $cached = !in_array($normalized, ['0', 'false', 'off', 'no'], true);
    return $cached;
}

/**
 * Load login failed attempt limit from settings.
 * This applies to both invalid passwords and failed captcha verification.
 * @param mysqli|null $conn
 * @return int
 */
function getLoginFailedAttemptLimit($conn = null) {
    static $cached = null;
    if (is_int($cached)) {
        return $cached;
    }

    $defaultLimit = getDefaultLoginFailedAttemptLimit();
    [$db, $shouldClose] = resolvePresenceConnection($conn);
    if (!$db) {
        $cached = $defaultLimit;
        return $cached;
    }

    ensureCaptchaTimeoutSetting($db);

    $value = $defaultLimit;
    $stmt = $db->prepare("SELECT setting_value FROM settings WHERE setting_key = 'login_failed_attempt_limit' LIMIT 1");
    if ($stmt) {
        $stmt->execute();
        $stmt->bind_result($settingValue);
        if ($stmt->fetch()) {
            $value = (int)$settingValue;
        }
        $stmt->close();
    }

    if ($shouldClose && function_exists('closeDBConnection')) {
        closeDBConnection($db);
    }

    $cached = max(1, min(20, (int)$value));
    return $cached;
}

/**
 * Roles included in inactivity timeout policy.
 * @param string $role
 * @return bool
 */
function shouldApplyManagedRoleSessionTimeout($role) {
    $normalized = strtolower(trim((string)$role));
    return in_array($normalized, ['manager', 'staff'], true);
}

/**
 * Track latest authenticated activity in session.
 * @return void
 */
function markSessionActivityNow() {
    $now = time();
    if (intval($_SESSION['session_started_at'] ?? 0) <= 0) {
        $_SESSION['session_started_at'] = $now;
    }
    $_SESSION['last_activity_at'] = $now;
}

/**
 * Clear current auth session state and presence row.
 * @param int|null $userId
 * @param mysqli|null $conn
 * @return void
 */
function clearManagedRoleSessionState($userId = null, $conn = null) {
    $uid = intval($userId ?? ($_SESSION['user_id'] ?? 0));
    if ($uid > 0) {
        clearSessionPresenceByUser($uid, $conn);
    }

    unset(
        $_SESSION['user_id'],
        $_SESSION['username'],
        $_SESSION['role'],
        $_SESSION['employee_id'],
        $_SESSION['branch_id'],
        $_SESSION['must_reset_password'],
        $_SESSION['session_started_at'],
        $_SESSION['last_activity_at']
    );

    if (session_status() === PHP_SESSION_ACTIVE) {
        session_unset();
        session_destroy();
    }
}

/**
 * Enforce inactivity timeout for manager/staff sessions.
 * @param mysqli|null $conn
 * @param bool $touchActivity
 * @return void
 */
function enforceManagedRoleSessionTimeout($conn = null, $touchActivity = true) {
    $userId = intval($_SESSION['user_id'] ?? 0);
    if ($userId <= 0) return;

    $role = strtolower(trim((string)($_SESSION['role'] ?? '')));
    if (!shouldApplyManagedRoleSessionTimeout($role)) return;

    $cfg = getManagedRoleSessionTimeoutConfig($conn);
    if (empty($cfg['enabled'])) {
        if ($touchActivity) markSessionActivityNow();
        return;
    }

    $limitMinutes = ($role === 'manager')
        ? intval($cfg['manager_minutes'] ?? 30)
        : intval($cfg['staff_minutes'] ?? 30);
    $limitSeconds = max(60, $limitMinutes * 60);
    $now = time();

    $lastActivity = intval($_SESSION['last_activity_at'] ?? 0);
    if ($lastActivity <= 0) {
        $sessionStarted = intval($_SESSION['session_started_at'] ?? 0);
        if ($sessionStarted <= 0) {
            $sessionStarted = $now;
            $_SESSION['session_started_at'] = $sessionStarted;
        }
        $lastActivity = $sessionStarted;
        $_SESSION['last_activity_at'] = $lastActivity;
    }

    if (($now - $lastActivity) > $limitSeconds) {
        clearManagedRoleSessionState($userId, $conn);
        sendError('Session expired due to inactivity. Please log in again.', 401);
    }

    if ($touchActivity) {
        markSessionActivityNow();
    }
}

/**
 * Require authentication
 * Sends error response if not authenticated
 */
function requireAuth() {
    // Intruder browser lockout applies before auth checks so blocked browsers
    // cannot access protected APIs even with valid sessions.
    enforceIntruderBrowserLockout();

    $user_id = checkAuthentication();
    
    if (!$user_id) {
        sendError('Authentication required', 401);
    }

    enforceManagedRoleSessionTimeout(null, false);

    // Keep online presence fresh for authenticated activity.
    touchCurrentSessionPresence();
    markSessionActivityNow();

    return $user_id;
}

/**
 * Paginate results
 * @param int $total_records Total number of records
 * @param int $page Current page number
 * @param int $per_page Records per page
 * @return array Pagination information
 */
function getPaginationInfo($total_records, $page = 1, $per_page = 10) {
    $page = max(1, intval($page));
    $per_page = max(1, min(100, intval($per_page)));
    
    $total_pages = ceil($total_records / $per_page);
    $offset = ($page - 1) * $per_page;
    
    return [
        'current_page' => $page,
        'per_page' => $per_page,
        'total_records' => $total_records,
        'total_pages' => $total_pages,
        'offset' => $offset
    ];
}

/**
 * Build WHERE clause from filters
 * @param array $filters Filter conditions
 * @param array $allowed_fields Allowed field names
 * @return array Array with 'clause' and 'params' keys
 */
function buildWhereClause($filters, $allowed_fields) {
    $conditions = [];
    $params = [];
    $types = '';
    
    foreach ($filters as $field => $value) {
        if (in_array($field, $allowed_fields) && $value !== null && $value !== '') {
            $conditions[] = "$field = ?";
            $params[] = $value;
            
            // Determine parameter type
            if (is_int($value)) {
                $types .= 'i';
            } elseif (is_float($value)) {
                $types .= 'd';
            } else {
                $types .= 's';
            }
        }
    }
    
    $clause = !empty($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';
    
    return [
        'clause' => $clause,
        'params' => $params,
        'types' => $types
    ];
}

/**
 * Format currency (PHP)
 * @param float $amount Amount to format
 * @return string Formatted currency string
 */
function formatCurrency($amount) {
    return '₱' . number_format($amount, 2);
}

/**
 * Calculate net pay for payroll
 * @param float $gross_pay Gross pay amount
 * @param float $total_deductions Total deductions
 * @return float Net pay amount
 */
function calculateNetPay($gross_pay, $total_deductions) {
    return max(0, $gross_pay - $total_deductions);
}

/**
 * Resolve the manual/base cash advance component stored on a payroll row.
 * @param array|null $payrollRow
 * @return float
 */
function getPayrollCashAdvanceManualBase($payrollRow) {
    if (!is_array($payrollRow)) return 0;
    if (array_key_exists('cash_advance_manual_deduction', $payrollRow)) {
        return floatval($payrollRow['cash_advance_manual_deduction'] ?? 0);
    }
    return floatval($payrollRow['cash_advance_deduction'] ?? 0);
}

/**
 * Recalculate payroll gross pay from its component fields.
 * @param array|null $payrollRow
 * @return float
 */
function calculatePayrollGrossFromRow($payrollRow) {
    if (!is_array($payrollRow)) return 0;

    return round(
        floatval($payrollRow['basic_salary'] ?? 0)
        + floatval($payrollRow['overtime_pay'] ?? 0)
        + floatval($payrollRow['clothing_allowance'] ?? 0)
        + floatval($payrollRow['travel_allowance'] ?? 0)
        + floatval($payrollRow['salary_adjustment'] ?? 0)
        - floatval($payrollRow['late_deduction'] ?? 0)
        - floatval($payrollRow['absence_deduction'] ?? 0),
        2
    );
}

/**
 * Recalculate total payroll deductions from its component fields.
 * @param array|null $payrollRow
 * @return float
 */
function calculatePayrollTotalDeductionsFromRow($payrollRow) {
    if (!is_array($payrollRow)) return 0;

    return round(
        floatval($payrollRow['tax'] ?? 0)
        + floatval($payrollRow['sss_contribution'] ?? 0)
        + floatval($payrollRow['pagibig_contribution'] ?? 0)
        + floatval($payrollRow['philhealth_contribution'] ?? 0)
        + floatval($payrollRow['cash_advance_deduction'] ?? 0)
        + floatval($payrollRow['laptop_loan_deduction'] ?? 0)
        + floatval($payrollRow['other_deductions'] ?? 0),
        2
    );
}

/**
 * Recalculate payroll net pay from its component fields.
 * @param array|null $payrollRow
 * @return float
 */
function calculatePayrollNetFromRow($payrollRow) {
    if (!is_array($payrollRow)) return 0;
    $grossPay = calculatePayrollGrossFromRow($payrollRow);
    $totalDeductions = calculatePayrollTotalDeductionsFromRow($payrollRow);
    return round(max(0, $grossPay - $totalDeductions + floatval($payrollRow['bonus'] ?? 0)), 2);
}

/**
 * Attach approved undeducted cash advances to a payroll and refresh totals.
 * The payroll keeps its manual/base cash advance component and adds approved requests on top.
 * @param mysqli $conn
 * @param int $payrollId
 * @return array|null
 */
function syncPayrollCashAdvanceRequests($conn, $payrollId) {
    if (!$conn || !($conn instanceof mysqli)) return null;

    $payrollId = intval($payrollId);
    if ($payrollId <= 0) return null;

    $payrollStmt = $conn->prepare(
        "SELECT id, employee_id, pay_period_end,
                basic_salary, overtime_pay, bonus,
                clothing_allowance, travel_allowance, salary_adjustment,
                late_deduction, absence_deduction,
                tax, sss_contribution, pagibig_contribution, philhealth_contribution,
                cash_advance_deduction, cash_advance_manual_deduction,
                laptop_loan_deduction, other_deductions
         FROM payroll
         WHERE id = ?
         LIMIT 1"
    );
    if (!$payrollStmt) return null;
    $payrollStmt->bind_param('i', $payrollId);
    $payrollStmt->execute();
    $payroll = $payrollStmt->get_result()->fetch_assoc();
    $payrollStmt->close();

    if (!$payroll) return null;

    $employeeId = intval($payroll['employee_id'] ?? 0);
    $payPeriodEnd = trim((string)($payroll['pay_period_end'] ?? ''));
    if ($employeeId <= 0 || $payPeriodEnd === '') return null;

    $releaseStmt = $conn->prepare(
        "UPDATE cash_advance_request
         SET deducted_payroll_id = NULL,
             deducted_at = NULL
         WHERE deducted_payroll_id = ?
           AND (employee_id <> ? OR status <> 'approved' OR request_date > ?)"
    );
    if ($releaseStmt) {
        $releaseStmt->bind_param('iis', $payrollId, $employeeId, $payPeriodEnd);
        $releaseStmt->execute();
        $releaseStmt->close();
    }

    $assignStmt = $conn->prepare(
        "UPDATE cash_advance_request
         SET deducted_payroll_id = ?,
             deducted_at = NOW()
         WHERE employee_id = ?
           AND status = 'approved'
           AND deducted_payroll_id IS NULL
           AND request_date <= ?"
    );
    if ($assignStmt) {
        $assignStmt->bind_param('iis', $payrollId, $employeeId, $payPeriodEnd);
        $assignStmt->execute();
        $assignStmt->close();
    }

    $sumStmt = $conn->prepare(
        "SELECT COALESCE(SUM(amount), 0) AS total_amount
         FROM cash_advance_request
         WHERE deducted_payroll_id = ?
           AND status = 'approved'"
    );
    if (!$sumStmt) return null;
    $sumStmt->bind_param('i', $payrollId);
    $sumStmt->execute();
    $sumRow = $sumStmt->get_result()->fetch_assoc();
    $sumStmt->close();

    $approvedRequestTotal = round(floatval($sumRow['total_amount'] ?? 0), 2);
    $manualBase = round(getPayrollCashAdvanceManualBase($payroll), 2);
    $payroll['cash_advance_manual_deduction'] = $manualBase;
    $payroll['cash_advance_deduction'] = round($manualBase + $approvedRequestTotal, 2);

    $grossPay = calculatePayrollGrossFromRow($payroll);
    $totalDeductions = calculatePayrollTotalDeductionsFromRow($payroll);
    $netPay = calculatePayrollNetFromRow($payroll);

    $updateStmt = $conn->prepare(
        "UPDATE payroll
         SET cash_advance_deduction = ?,
             gross_pay = ?,
             total_deductions = ?,
             net_pay = ?
         WHERE id = ?"
    );
    if (!$updateStmt) return null;
    $updateStmt->bind_param('ddddi', $payroll['cash_advance_deduction'], $grossPay, $totalDeductions, $netPay, $payrollId);
    $updateStmt->execute();
    $updateStmt->close();

    return [
        'payroll_id' => $payrollId,
        'cash_advance_manual_deduction' => $manualBase,
        'cash_advance_deduction' => $payroll['cash_advance_deduction'],
        'gross_pay' => $grossPay,
        'total_deductions' => $totalDeductions,
        'net_pay' => $netPay,
    ];
}

/**
 * If a matching open payroll exists, attach approved cash advances to it immediately.
 * Open payrolls are draft, pending, or approved records that are not yet paid out.
 * @param mysqli $conn
 * @param int $employeeId
 * @param string $requestDate
 * @return array|null
 */
function syncNextDraftPayrollCashAdvanceRequests($conn, $employeeId, $requestDate) {
    if (!$conn || !($conn instanceof mysqli)) return null;

    $employeeId = intval($employeeId);
    $requestDate = trim((string)$requestDate);
    if ($employeeId <= 0 || $requestDate === '') return null;

    $payrollStmt = $conn->prepare(
        "SELECT id
         FROM payroll
         WHERE employee_id = ?
           AND status IN ('draft', 'pending', 'approved')
           AND pay_period_end >= ?
         ORDER BY pay_period_end ASC, id ASC
         LIMIT 1"
    );
    if (!$payrollStmt) return null;
    $payrollStmt->bind_param('is', $employeeId, $requestDate);
    $payrollStmt->execute();
    $row = $payrollStmt->get_result()->fetch_assoc();
    $payrollStmt->close();

    $payrollId = intval($row['id'] ?? 0);
    if ($payrollId <= 0) return null;

    return syncPayrollCashAdvanceRequests($conn, $payrollId);
}

/**
 * Normalize a deduction type name for matching.
 * @param string $name
 * @return string
 */
function normalizeDeductionTypeKey($name) {
    $key = strtolower(trim((string)$name));
    $key = preg_replace('/[^a-z0-9]+/', ' ', $key);
    $key = preg_replace('/\s+/', ' ', (string)$key);
    return trim((string)$key);
}

/**
 * Check if a government ID number is present.
 * @param mixed $value
 * @return bool
 */
function hasGovernmentNumber($value) {
    return trim((string)$value) !== '';
}

/**
 * Build eligibility map for gov deductions based on employee numbers.
 * @param array|null $employeeRow
 * @return array<string, bool>
 */
function buildGovEligibilityFromEmployee($employeeRow) {
    if (!is_array($employeeRow)) {
        return [
            'tax' => false,
            'sss_contribution' => false,
            'pagibig_contribution' => false,
            'philhealth_contribution' => false,
        ];
    }

    return [
        'tax' => hasGovernmentNumber($employeeRow['tin_number'] ?? null),
        'sss_contribution' => hasGovernmentNumber($employeeRow['sss_number'] ?? null),
        'pagibig_contribution' => hasGovernmentNumber($employeeRow['pagibig_number'] ?? null),
        'philhealth_contribution' => hasGovernmentNumber($employeeRow['philhealth_number'] ?? null),
    ];
}

/**
 * Load active deduction types keyed by normalized names.
 * @param mysqli $conn
 * @return array<string, array>
 */
function getActiveDeductionTypes($conn) {
    $types = [];
    if (!$conn || !($conn instanceof mysqli)) return $types;

    $sql = "SELECT type_name, default_amount, is_percentage, is_active, threshold_amount, threshold_mode, threshold_rules, base_floor, base_cap
            FROM deduction_type
            WHERE is_active = 1";
    $result = $conn->query($sql);
    if (!$result) return $types;

    while ($row = $result->fetch_assoc()) {
        $key = normalizeDeductionTypeKey($row['type_name'] ?? '');
        if ($key === '') continue;
        $types[$key] = $row;
        $compact = str_replace(' ', '', $key);
        if ($compact !== '') {
            $types[$compact] = $row;
        }
    }

    return $types;
}

/**
 * Apply base floor/cap bounds to a deduction computation base.
 * @param float $base
 * @param array|null $typeRow
 * @return float
 */
function applyDeductionBaseBounds($base, $typeRow) {
    $base = floatval($base);
    if (!$typeRow) return $base;
    $floor = floatval($typeRow['base_floor'] ?? 0);
    $cap = floatval($typeRow['base_cap'] ?? 0);
    if ($floor > 0 && $base < $floor) {
        $base = $floor;
    }
    if ($cap > 0 && $base > $cap) {
        $base = $cap;
    }
    return $base;
}

/**
 * Resolve a deduction type row by name candidates.
 * @param array<string, array> $types
 * @param array $names
 * @return array|null
 */
function findDeductionType($types, $names) {
    foreach ($names as $name) {
        $key = normalizeDeductionTypeKey((string)$name);
        if ($key !== '' && isset($types[$key])) return $types[$key];
        $compact = str_replace(' ', '', $key);
        if ($compact !== '' && isset($types[$compact])) return $types[$compact];
    }
    return null;
}

/**
 * Compute a deduction amount from a type row.
 * @param float $base
 * @param array|null $typeRow
 * @return float|null
 */
function computeThresholdRateDeduction($base, $rules) {
    $base = floatval($base);
    if ($base <= 0) return 0;

    $above = [];
    $below = [];
    foreach ($rules as $rule) {
        if (!is_array($rule)) continue;
        $mode = strtolower(trim((string)($rule['mode'] ?? 'none')));
        $amountRule = floatval($rule['amount'] ?? 0);
        if ($amountRule <= 0) continue;
        $rate = floatval($rule['rate'] ?? 0);
        if ($mode === 'above') {
            $above[] = ['amount' => $amountRule, 'rate' => $rate];
        } elseif ($mode === 'below') {
            $below[] = ['amount' => $amountRule, 'rate' => $rate];
        }
    }

    if (empty($above) && empty($below)) return 0;

    usort($above, function ($a, $b) {
        return $a['amount'] <=> $b['amount'];
    });
    usort($below, function ($a, $b) {
        return $a['amount'] <=> $b['amount'];
    });

    $bands = [];
    $firstAboveAmount = !empty($above) ? $above[0]['amount'] : 0;

    if (!empty($below)) {
        $belowRule = $below[0];
        $end = $firstAboveAmount > 0 ? min($belowRule['amount'], $firstAboveAmount) : $belowRule['amount'];
        if ($end > 0) {
            $bands[] = [
                'start' => 0,
                'end' => $end,
                'rate' => max(0, $belowRule['rate']),
            ];
        }
    } elseif ($firstAboveAmount > 0) {
        $bands[] = [
            'start' => 0,
            'end' => $firstAboveAmount,
            'rate' => 0,
        ];
    }

    $count = count($above);
    for ($i = 0; $i < $count; $i += 1) {
        $current = $above[$i];
        $next = $above[$i + 1] ?? null;
        $start = $current['amount'];
        $end = $next ? $next['amount'] : INF;
        if ($end > $start) {
            $bands[] = [
                'start' => $start,
                'end' => $end,
                'rate' => max(0, $current['rate']),
            ];
        }
    }

    $total = 0;
    foreach ($bands as $band) {
        if ($base <= $band['start']) break;
        $taxable = min($base, $band['end']) - $band['start'];
        if ($taxable > 0) {
            $total += $taxable * ($band['rate'] / 100);
        }
    }

    return round($total, 2);
}

function computeDeductionAmount($base, $typeRow) {
    if (!$typeRow) return null;
    $originalBase = floatval($base);
    $base = applyDeductionBaseBounds($originalBase, $typeRow);
    $amount = floatval($typeRow['default_amount'] ?? 0);
    $isPercentage = !empty($typeRow['is_percentage']);
    $rules = [];
    $hasRate = false;
    if (!empty($typeRow['threshold_rules'])) {
        $rawRules = $typeRow['threshold_rules'];
        if (is_string($rawRules)) {
            $decoded = json_decode($rawRules, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $rawRules = $decoded;
            }
        }

        if (is_array($rawRules)) {
            foreach ($rawRules as $rule) {
                if (!is_array($rule)) continue;
                $mode = strtolower(trim((string)($rule['mode'] ?? ($rule['threshold_mode'] ?? 'none'))));
                $amountRule = floatval($rule['amount'] ?? ($rule['threshold_amount'] ?? 0));
                $rateProvided = array_key_exists('rate', $rule) || array_key_exists('threshold_rate', $rule);
                $rateValue = $rateProvided ? floatval($rule['rate'] ?? ($rule['threshold_rate'] ?? 0)) : 0;
                if ($mode === 'above' || $mode === 'below') {
                    if ($amountRule > 0) {
                        $entry = ['mode' => $mode, 'amount' => $amountRule];
                        if ($rateProvided) {
                            $entry['rate'] = $rateValue;
                            $hasRate = true;
                        }
                        $rules[] = $entry;
                    }
                }
            }
        }
    }

    if (empty($rules)) {
        $thresholdAmount = floatval($typeRow['threshold_amount'] ?? 0);
        $thresholdMode = strtolower(trim((string)($typeRow['threshold_mode'] ?? 'none')));
        if ($thresholdAmount > 0 && in_array($thresholdMode, ['above', 'below'], true)) {
            $rules[] = ['mode' => $thresholdMode, 'amount' => $thresholdAmount];
        }
    }

    if ($hasRate) {
        return computeThresholdRateDeduction($base, $rules);
    }

    foreach ($rules as $rule) {
        if ($rule['mode'] === 'above' && $originalBase <= $rule['amount']) {
            return 0;
        }
        if ($rule['mode'] === 'below' && $originalBase > $rule['amount']) {
            return 0;
        }
    }

    $computed = $isPercentage ? ($base * ($amount / 100)) : $amount;
    return round($computed, 2);
}

/**
 * Compute government-mandated deductions based on deduction type settings.
 * @param mysqli $conn
 * @param float $baseAmount
 * @return array<string, float>
 */
function computeGovernmentDeductionsFromTypes($conn, $baseAmount, $eligibility = null) {
    $types = getActiveDeductionTypes($conn);
    if (empty($types)) return [];

    $mapping = [
        'tax' => ['withholding tax', 'tax'],
        'sss_contribution' => ['sss'],
        'philhealth_contribution' => ['philhealth', 'phil health'],
        'pagibig_contribution' => ['pag-ibig', 'pag ibig', 'pagibig'],
    ];

    $out = [];
    foreach ($mapping as $field => $names) {
        if (is_array($eligibility) && array_key_exists($field, $eligibility) && !$eligibility[$field]) {
            continue;
        }
        $row = findDeductionType($types, $names);
        if (!$row) continue;
        $amount = computeDeductionAmount($baseAmount, $row);
        if ($amount !== null) {
            $out[$field] = $amount;
        }
    }

    return $out;
}

/**
 * Role feature access catalog for manager/staff capabilities.
 * Admin always keeps full access and is not configurable here.
 *
 * @return array<string, array{label:string,roles:array<string,bool>}>
 */
function getRoleFeatureAccessCatalog() {
    return [
        'calendar' => [
            'label' => 'Calendar',
            'roles' => ['manager' => true, 'staff' => true],
        ],
        'analytics' => [
            'label' => 'Analytics',
            'roles' => ['manager' => false, 'staff' => true],
        ],
        'my_tasks' => [
            'label' => 'My Tasks',
            'roles' => ['manager' => true, 'staff' => true],
        ],
        'leave_requests' => [
            'label' => 'Leave Requests',
            'roles' => ['manager' => true, 'staff' => true],
        ],
        'my_payslips' => [
            'label' => 'My Payslips',
            'roles' => ['manager' => true, 'staff' => true],
        ],
        'clients' => [
            'label' => 'Clients',
            'roles' => ['manager' => true, 'staff' => false],
        ],
        'services' => [
            'label' => 'Services',
            'roles' => ['manager' => true, 'staff' => false],
        ],
        'employees' => [
            'label' => 'Employees',
            'roles' => ['manager' => true, 'staff' => false],
        ],
        'shift_schedules' => [
            'label' => 'Shift Schedules',
            'roles' => ['manager' => true, 'staff' => false],
        ],
        'projects' => [
            'label' => 'Projects',
            'roles' => ['manager' => true, 'staff' => true],
        ],
        'payroll' => [
            'label' => 'Payroll',
            'roles' => ['manager' => true, 'staff' => false],
        ],
        'payroll_precheck' => [
            'label' => 'Payroll Pre-check',
            'roles' => ['manager' => true, 'staff' => false],
        ],
        'overtime_requests' => [
            'label' => 'Overtime Requests',
            'roles' => ['manager' => true, 'staff' => true],
        ],
        'cash_advance' => [
            'label' => 'Cash Advance',
            'roles' => ['manager' => true, 'staff' => true],
        ],
        'payslip_disputes' => [
            'label' => 'Payslip Disputes',
            'roles' => ['manager' => true, 'staff' => true],
        ],
        'approval_inbox' => [
            'label' => 'Approval Inbox',
            'roles' => ['manager' => true, 'staff' => false],
        ],
        'edit_requests' => [
            'label' => 'Edit Request',
            'roles' => ['manager' => true, 'staff' => false],
        ],
        'documents' => [
            'label' => 'Documents',
            'roles' => ['manager' => true, 'staff' => true],
        ],
    ];
}

/**
 * Normalize bool-like input from settings/JSON.
 * @param mixed $value
 * @param bool $default
 * @return bool
 */
function normalizeFeatureAccessBool($value, $default = false) {
    if (is_bool($value)) return $value;
    if (is_int($value) || is_float($value)) return ((int)$value) !== 0;
    if (is_string($value)) {
        $normalized = strtolower(trim($value));
        if ($normalized === '') return $default;
        if (in_array($normalized, ['1', 'true', 'yes', 'on'], true)) return true;
        if (in_array($normalized, ['0', 'false', 'no', 'off'], true)) return false;
    }
    return $default;
}

/**
 * @param string $role
 * @return string
 */
function normalizeFeatureAccessRole($role) {
    $normalized = strtolower(trim((string)$role));
    if (in_array($normalized, ['admin', 'manager', 'staff'], true)) {
        return $normalized;
    }
    return '';
}

/**
 * @param string $role
 * @return string
 */
function getFeatureAccessRoleRowName($role) {
    $normalized = normalizeFeatureAccessRole($role);
    if ($normalized === 'admin') return 'Admin';
    if ($normalized === 'manager') return 'Manager';
    if ($normalized === 'staff') return 'Staff';
    return '';
}

/**
 * Ensure role records exist so feature-access preferences have a stable home.
 */
function ensureRoleFeatureAccessStorage($conn) {
    if (!$conn) return;

    $conn->query(
        "CREATE TABLE IF NOT EXISTS roles (
            role_id INT AUTO_INCREMENT PRIMARY KEY,
            role_name VARCHAR(100) NOT NULL UNIQUE,
            description TEXT NULL,
            permissions JSON NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'active'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $dbName = DB_NAME;
    $checkStmt = $conn->prepare(
        "SELECT 1
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'roles' AND COLUMN_NAME = 'status'
         LIMIT 1"
    );
    if ($checkStmt) {
        $checkStmt->bind_param('s', $dbName);
        $checkStmt->execute();
        $hasStatus = $checkStmt->get_result()->num_rows > 0;
        $checkStmt->close();
        if (!$hasStatus) {
            $conn->query("ALTER TABLE roles ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'");
            $conn->query("UPDATE roles SET status = 'active' WHERE status IS NULL OR status = ''");
        }
    }

    $defaults = [
        ['Admin', 'System administrator'],
        ['Manager', 'Manager role'],
        ['Staff', 'Staff member with limited access'],
    ];

    foreach ($defaults as $row) {
        [$roleName, $description] = $row;
        $stmt = $conn->prepare(
            "INSERT INTO roles (role_name, description, permissions, status)
             VALUES (?, ?, '{}', 'active')
             ON DUPLICATE KEY UPDATE
               description = COALESCE(NULLIF(description, ''), VALUES(description)),
               status = 'active'"
        );
        if ($stmt) {
            $stmt->bind_param('ss', $roleName, $description);
            $stmt->execute();
            $stmt->close();
        }
    }
}

/**
 * @return array<string, bool>
 */
function getDefaultRoleFeatureAccessMap($role) {
    $normalizedRole = normalizeFeatureAccessRole($role);
    $catalog = getRoleFeatureAccessCatalog();
    $access = [];

    foreach ($catalog as $featureKey => $definition) {
        $access[$featureKey] = $normalizedRole === 'admin'
            ? true
            : !empty($definition['roles'][$normalizedRole]);
    }

    return $access;
}

/**
 * @return string[]
 */
function getSupportedRoleFeatureKeys($role) {
    $normalizedRole = normalizeFeatureAccessRole($role);
    if (!in_array($normalizedRole, ['manager', 'staff'], true)) return [];

    $catalog = getRoleFeatureAccessCatalog();
    $supported = [];
    foreach ($catalog as $featureKey => $definition) {
        if (!empty($definition['roles'][$normalizedRole])) {
            $supported[] = $featureKey;
        }
    }
    return $supported;
}

/**
 * @return array<string, mixed>
 */
function getStoredRolePermissions($conn, $role) {
    ensureRoleFeatureAccessStorage($conn);

    $rowName = getFeatureAccessRoleRowName($role);
    if ($rowName === '') return [];

    $stmt = $conn->prepare(
        "SELECT permissions
         FROM roles
         WHERE LOWER(TRIM(role_name)) = LOWER(TRIM(?))
         LIMIT 1"
    );
    if (!$stmt) return [];

    $stmt->bind_param('s', $rowName);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $decoded = json_decode((string)($row['permissions'] ?? '{}'), true);
    return is_array($decoded) ? $decoded : [];
}

/**
 * @return array<string, bool>
 */
function getRoleFeatureAccessMap($role, $conn = null) {
    $normalizedRole = normalizeFeatureAccessRole($role);
    $defaults = getDefaultRoleFeatureAccessMap($normalizedRole);

    if ($normalizedRole === '' || $normalizedRole === 'admin') {
        return $defaults;
    }

    $db = $conn;
    $ownsConnection = false;
    if (!$db) {
        $db = getDBConnection();
        $ownsConnection = true;
    }

    $permissions = getStoredRolePermissions($db, $normalizedRole);
    $storedAccess = [];
    if (isset($permissions['feature_access']) && is_array($permissions['feature_access'])) {
        $storedAccess = $permissions['feature_access'];
    }

    foreach ($defaults as $featureKey => $defaultEnabled) {
        if (array_key_exists($featureKey, $storedAccess)) {
            $defaults[$featureKey] = normalizeFeatureAccessBool($storedAccess[$featureKey], $defaultEnabled);
        }
    }

    if ($ownsConnection) {
        closeDBConnection($db);
    }

    return $defaults;
}

/**
 * Persist manager/staff feature access selections into roles.permissions.feature_access.
 *
 * @param array<string, mixed> $featureAccess
 * @return array<string, bool>
 */
function saveRoleFeatureAccessMap($conn, $role, $featureAccess) {
    $normalizedRole = normalizeFeatureAccessRole($role);
    if (!in_array($normalizedRole, ['manager', 'staff'], true)) {
        sendError('Invalid role for feature access update.', 400);
    }

    ensureRoleFeatureAccessStorage($conn);

    $permissions = getStoredRolePermissions($conn, $normalizedRole);
    $storedFeatureAccess = isset($permissions['feature_access']) && is_array($permissions['feature_access'])
        ? $permissions['feature_access']
        : [];
    $supportedKeys = getSupportedRoleFeatureKeys($normalizedRole);
    $defaults = getDefaultRoleFeatureAccessMap($normalizedRole);
    $nextAccess = [];

    foreach ($supportedKeys as $featureKey) {
        $incoming = is_array($featureAccess) && array_key_exists($featureKey, $featureAccess)
            ? $featureAccess[$featureKey]
            : ($storedFeatureAccess[$featureKey] ?? $defaults[$featureKey] ?? false);
        $nextAccess[$featureKey] = normalizeFeatureAccessBool($incoming, $defaults[$featureKey] ?? false);
    }

    $permissions['feature_access'] = $nextAccess;
    $encodedPermissions = json_encode($permissions, JSON_UNESCAPED_SLASHES);
    if ($encodedPermissions === false) {
        sendError('Failed to encode role feature access settings.', 500);
    }

    $rowName = getFeatureAccessRoleRowName($normalizedRole);
    $stmt = $conn->prepare(
        "UPDATE roles
         SET permissions = ?, status = 'active'
         WHERE LOWER(TRIM(role_name)) = LOWER(TRIM(?))
         LIMIT 1"
    );
    if (!$stmt) sendError('Failed to prepare role feature access update.', 500);
    $stmt->bind_param('ss', $encodedPermissions, $rowName);
    $stmt->execute();
    $stmt->close();

    return getRoleFeatureAccessMap($normalizedRole, $conn);
}

/**
 * @param string $featureKey
 * @return bool
 */
function roleSupportsFeatureAccess($role, $featureKey) {
    $normalizedRole = normalizeFeatureAccessRole($role);
    if ($normalizedRole === 'admin') return true;

    $catalog = getRoleFeatureAccessCatalog();
    if (!isset($catalog[$featureKey])) return false;

    return !empty($catalog[$featureKey]['roles'][$normalizedRole]);
}

/**
 * @param string $featureKey
 * @return bool
 */
function hasRoleFeatureAccess($role, $featureKey, $conn = null) {
    $normalizedRole = normalizeFeatureAccessRole($role);
    if ($normalizedRole === 'admin') return true;
    if ($normalizedRole === '' || !roleSupportsFeatureAccess($normalizedRole, $featureKey)) {
        return false;
    }

    $access = getRoleFeatureAccessMap($normalizedRole, $conn);
    return !empty($access[$featureKey]);
}

/**
 * Require current user to have a configurable feature enabled for their role.
 *
 * @param string $featureKey
 * @param array<int, string> $allowedRoles
 * @return string
 */
function requireFeatureAccess($featureKey, $allowedRoles = ['admin', 'manager', 'staff'], $conn = null) {
    requireAuth();

    $role = normalizeFeatureAccessRole($_SESSION['role'] ?? '');
    $normalizedAllowed = array_values(array_filter(array_map('normalizeFeatureAccessRole', $allowedRoles)));

    if ($role === '' || !in_array($role, $normalizedAllowed, true)) {
        sendError('Forbidden: insufficient permissions', 403);
    }

    if ($role !== 'admin' && !hasRoleFeatureAccess($role, $featureKey, $conn)) {
        sendError('Forbidden: this feature is disabled for your role', 403);
    }

    return $role;
}

/**
 * Require at least one feature from a shared capability set.
 *
 * @param array<int, string> $featureKeys
 * @param array<int, string> $allowedRoles
 * @return string
 */
function requireAnyFeatureAccess($featureKeys, $allowedRoles = ['admin', 'manager', 'staff'], $conn = null) {
    requireAuth();

    $role = normalizeFeatureAccessRole($_SESSION['role'] ?? '');
    $normalizedAllowed = array_values(array_filter(array_map('normalizeFeatureAccessRole', $allowedRoles)));

    if ($role === '' || !in_array($role, $normalizedAllowed, true)) {
        sendError('Forbidden: insufficient permissions', 403);
    }

    if ($role === 'admin') {
        return $role;
    }

    foreach ((array)$featureKeys as $featureKey) {
        if (hasRoleFeatureAccess($role, (string)$featureKey, $conn)) {
            return $role;
        }
    }

    sendError('Forbidden: this feature is disabled for your role', 403);
}

/**
 * Hash password using bcrypt
 * @param string $password Plain text password
 * @return string Hashed password
 */
function hashPassword($password) {
    return password_hash($password, PASSWORD_BCRYPT);
}

/**
 * Verify password against hash
 * @param string $password Plain text password
 * @param string $hash Hashed password
 * @return bool True if password matches, false otherwise
 */
function verifyPassword($password, $hash) {
    return password_verify($password, $hash);
}

/**
 * RBAC: Require user to have one of the specified roles
 * @param array $allowed_roles Array of allowed role strings, e.g. ['admin', 'manager']
 */
function requireRole($allowed_roles) {
    requireAuth();
    $role = $_SESSION['role'] ?? '';
    if (!in_array($role, $allowed_roles)) {
        sendError('Forbidden: insufficient permissions', 403);
    }
    return $role;
}

/**
 * RBAC: Require user to have at least the specified minimum role level
 * Hierarchy: admin > manager > staff
 * @param string $min_role Minimum role required
 */
function requireMinRole($min_role) {
    requireAuth();
    $hierarchy = ['staff' => 1, 'manager' => 2, 'admin' => 3];
    $role = $_SESSION['role'] ?? '';
    $user_level = $hierarchy[$role] ?? 0;
    $required_level = $hierarchy[$min_role] ?? 99;
    if ($user_level < $required_level) {
        sendError('Forbidden: insufficient permissions', 403);
    }
    return $role;
}

/**
 * Get current user's role from session
 * @return string The role or empty string
 */
function getCurrentRole() {
    return $_SESSION['role'] ?? '';
}

?>
