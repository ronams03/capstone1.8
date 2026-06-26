<?php
/**
 * ALTCHA API - Server-side challenge generation and validation
 * Session-bound verification prevents solving without a matching login flow.
 */

require_once 'config.php';
require_once 'utils.php';
require_once __DIR__ . '/../vendor/autoload.php';

use AltchaOrg\Altcha\V1\Altcha as AltchaV1;
use AltchaOrg\Altcha\V1\ChallengeOptions as AltchaChallengeOptions;
use AltchaOrg\Altcha\V1\Hasher\Algorithm as AltchaAlgorithm;

const CAPTCHA_VERIFICATION_TTL_SECONDS = 120;

setCORSHeaders();

$conn = getDBConnection();
$method = getRequestMethod();
$action = $_GET['action'] ?? '';

if ($method === 'GET' && $action === 'altcha_challenge') {
    generateAltchaChallenge();
} elseif ($method === 'POST' && $action === 'altcha_verify') {
    verifyAltchaCaptcha();
} else {
    sendError('Invalid action', 400);
}

function clearCaptchaVerification(): void {
    unset($_SESSION['captcha_verified']);
}

function clearAltchaChallengeState(): void {
    unset($_SESSION['altcha_challenge_salt']);
    unset($_SESSION['altcha_challenge_signature']);
}

function requirePendingLogin(): array {
    $pending = $_SESSION['pending_login'] ?? null;
    if (!is_array($pending)) {
        clearAltchaChallengeState();
        clearCaptchaVerification();
        sendError('Login session expired. Enter your email and password again.', 400);
    }

    $validUntil = (int)($pending['valid_until'] ?? 0);
    $browserId = (string)($pending['browser_id'] ?? '');
    $currentBrowserId = function_exists('getIntruderBrowserIdentifier')
        ? (string)getIntruderBrowserIdentifier()
        : '';

    if (
        $validUntil <= time()
        || $browserId === ''
        || $currentBrowserId === ''
        || !hash_equals($browserId, $currentBrowserId)
    ) {
        unset($_SESSION['pending_login']);
        clearAltchaChallengeState();
        clearCaptchaVerification();
        sendError('Login session expired. Enter your email and password again.', 400);
    }

    return $pending;
}

function getAltchaSecretFilePath(): string {
    $baseCacheFile = function_exists('getRuntimeSchemaCacheFile')
        ? getRuntimeSchemaCacheFile()
        : sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'capstone1-schema-cache.json';

    return dirname($baseCacheFile) . DIRECTORY_SEPARATOR . 'altcha-secret.json';
}

function getAltchaSecret(): string {
    static $secret = null;
    if (is_string($secret) && $secret !== '') {
        return $secret;
    }

    $secretFile = getAltchaSecretFilePath();
    if (is_file($secretFile)) {
        $raw = @file_get_contents($secretFile);
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if (is_array($decoded) && !empty($decoded['hmac_key']) && is_string($decoded['hmac_key'])) {
            $secret = $decoded['hmac_key'];
            return $secret;
        }
    }

    $secret = bin2hex(random_bytes(32));
    @file_put_contents($secretFile, json_encode(['hmac_key' => $secret], JSON_PRETTY_PRINT));
    return $secret;
}

function getAltchaClient(): AltchaV1 {
    static $client = null;
    if ($client instanceof AltchaV1) {
        return $client;
    }

    $client = new AltchaV1(getAltchaSecret());
    return $client;
}

function decodeAltchaPayload(string $payload): ?array {
    $decoded = base64_decode($payload, true);
    if ($decoded === false || $decoded === '') {
        return null;
    }

    try {
        $parsed = json_decode($decoded, true, 8, JSON_THROW_ON_ERROR);
    } catch (JsonException | ValueError) {
        return null;
    }

    return is_array($parsed) ? $parsed : null;
}

function getLoginFailureLockoutConfig($conn): array {
    $cfg = [
        'lockout_enabled' => '1',
        'lockout_window_hours' => '24',
    ];

    $stmt = $conn->prepare(
        "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('lockout_enabled','lockout_window_hours')"
    );
    if ($stmt) {
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $cfg[$row['setting_key']] = $row['setting_value'];
        }
        $stmt->close();
    }

    return [
        'enabled' => ($cfg['lockout_enabled'] ?? '1') === '1',
        'window_hours' => max(1, (int)($cfg['lockout_window_hours'] ?? 24)),
    ];
}

function recordPendingLoginFailure($conn, int $userId): array {
    if ($userId <= 0) {
        return [
            'status' => 'disabled',
            'failed_attempts' => 0,
            'remaining_attempts' => null,
            'threshold' => null,
        ];
    }

    $policy = getLoginFailureLockoutConfig($conn);
    if (!$policy['enabled']) {
        return [
            'status' => 'disabled',
            'failed_attempts' => 0,
            'remaining_attempts' => null,
            'threshold' => null,
        ];
    }

    $threshold = getLoginFailedAttemptLimit($conn);
    $windowHours = (int)$policy['window_hours'];

    $stmt = $conn->prepare(
        "SELECT id, status, role, reset_request_count, reset_request_window_start
         FROM users
         WHERE id = ?
         LIMIT 1"
    );
    if (!$stmt) {
        sendError('Failed to update login attempt state.', 500);
    }
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$user) {
        return [
            'status' => 'disabled',
            'failed_attempts' => 0,
            'remaining_attempts' => null,
            'threshold' => $threshold,
        ];
    }

    if (strtolower(trim($user['role'] ?? '')) === 'admin') {
        return [
            'status' => 'admin_exempt',
            'failed_attempts' => 0,
            'remaining_attempts' => null,
            'threshold' => null,
        ];
    }

    if (($user['status'] ?? '') === 'locked') {
        return [
            'status' => 'locked',
            'failed_attempts' => (int)($user['reset_request_count'] ?? $threshold),
            'remaining_attempts' => 0,
            'threshold' => $threshold,
        ];
    }

    $count = (int)($user['reset_request_count'] ?? 0);
    $windowStart = $user['reset_request_window_start'] ?? null;

    if (!$windowStart || (strtotime((string)$windowStart) + ($windowHours * 3600)) < time()) {
        $count = 0;
        $windowStart = date('Y-m-d H:i:s');
    }

    $count++;
    $remainingAttempts = max(0, $threshold - $count);

    if ($count >= $threshold) {
        $lockStmt = $conn->prepare(
            "UPDATE users SET status = 'locked', reset_request_count = ?, reset_request_window_start = ? WHERE id = ?"
        );
        if ($lockStmt) {
            $lockStmt->bind_param('isi', $count, $windowStart, $userId);
            $lockStmt->execute();
            $lockStmt->close();
        }

        logActivity(
            $conn,
            $userId,
            'account_locked',
            "Account locked after {$count} failed login or captcha attempts (threshold: {$threshold})",
            'security'
        );

        return [
            'status' => 'locked',
            'failed_attempts' => $count,
            'remaining_attempts' => 0,
            'threshold' => $threshold,
        ];
    }

    $updateStmt = $conn->prepare(
        "UPDATE users SET reset_request_count = ?, reset_request_window_start = ? WHERE id = ?"
    );
    if ($updateStmt) {
        $updateStmt->bind_param('isi', $count, $windowStart, $userId);
        $updateStmt->execute();
        $updateStmt->close();
    }

    return [
        'status' => 'ok',
        'failed_attempts' => $count,
        'remaining_attempts' => $remainingAttempts,
        'threshold' => $threshold,
    ];
}

function buildAltchaFailureMessage(array $lockoutResult, string $baseMessage): string {
    $message = $baseMessage;
    $remainingAttempts = $lockoutResult['remaining_attempts'] ?? null;
    if (is_int($remainingAttempts) && $remainingAttempts > 0) {
        $label = $remainingAttempts === 1 ? 'attempt' : 'attempts';
        $message .= " {$remainingAttempts} {$label} remaining before account lock.";
    }

    return $message;
}

function rejectAltchaAttempt(array $pending, string $baseMessage, int $statusCode = 400): void {
    global $conn;

    clearAltchaChallengeState();
    $lockoutResult = recordPendingLoginFailure($conn, (int)($pending['user_id'] ?? 0));
    if (($lockoutResult['status'] ?? '') === 'locked') {
        sendError('Your account has been locked due to too many failed login or captcha attempts. Please contact an administrator.', 403);
    }

    sendError(buildAltchaFailureMessage($lockoutResult, $baseMessage), $statusCode);
}

function generateAltchaChallenge(): void {
    $pending = requirePendingLogin();
    $secondsUntilPendingExpires = max(0, (int)($pending['valid_until'] ?? 0) - time());
    if ($secondsUntilPendingExpires <= 0) {
        clearAltchaChallengeState();
        sendError('Login session expired. Enter your email and password again.', 400);
    }

    $ttlSeconds = max(30, min(getCaptchaTimeoutSeconds(), $secondsUntilPendingExpires));
    $expiresAt = time() + $ttlSeconds;
    $params = [
        'action' => 'login',
        'browser_id' => (string)($pending['browser_id'] ?? ''),
        'user_id' => (string)($pending['user_id'] ?? ''),
        'pending_valid_until' => (string)($pending['valid_until'] ?? 0),
    ];

    $challenge = getAltchaClient()->createChallenge(
        new AltchaChallengeOptions(
            AltchaAlgorithm::SHA256,
            50000,
            (new DateTimeImmutable('@' . $expiresAt))->setTimezone(new DateTimeZone(date_default_timezone_get())),
            $params
        )
    );

    $_SESSION['altcha_challenge_salt'] = $challenge->salt;
    $_SESSION['altcha_challenge_signature'] = $challenge->signature;

    // ALTCHA widget expects this exact challenge payload shape.
    $response = [
        'algorithm' => $challenge->algorithm,
        'challenge' => $challenge->challenge,
        'maxnumber' => $challenge->maxNumber,
        'salt' => $challenge->salt,
        'signature' => $challenge->signature,
    ];

    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit();
}

function verifyAltchaCaptcha(): void {
    $pending = requirePendingLogin();
    $data = getJSONInput();
    $payload = trim((string)($data['payload'] ?? $data['altcha'] ?? ''));
    $dismissed = !empty($data['dismissed']);

    if ($dismissed) {
        rejectAltchaAttempt($pending, 'ALTCHA was dismissed. Start the login process again to continue.');
    }

    if ($payload === '') {
        rejectAltchaAttempt($pending, 'ALTCHA verification payload is missing. Refresh the challenge and try again.');
    }

    $parsedPayload = decodeAltchaPayload($payload);
    if (!$parsedPayload) {
        rejectAltchaAttempt($pending, 'ALTCHA verification could not be read. Refresh the challenge and try again.');
    }

    $expectedSalt = (string)($_SESSION['altcha_challenge_salt'] ?? '');
    $expectedSignature = (string)($_SESSION['altcha_challenge_signature'] ?? '');
    if (
        $expectedSalt === ''
        || $expectedSignature === ''
        || !hash_equals($expectedSalt, (string)($parsedPayload['salt'] ?? ''))
        || !hash_equals($expectedSignature, (string)($parsedPayload['signature'] ?? ''))
    ) {
        clearAltchaChallengeState();
        sendError('ALTCHA challenge expired. Refresh the challenge and try again.', 400);
    }

    $params = [];
    $salt = (string)($parsedPayload['salt'] ?? '');
    $saltParts = explode('?', $salt, 2);
    if (count($saltParts) === 2) {
        parse_str($saltParts[1], $params);
    }

    $expectedBrowserId = (string)($pending['browser_id'] ?? '');
    $expectedUserId = (string)($pending['user_id'] ?? '');
    if (
        ($params['action'] ?? '') !== 'login'
        || (string)($params['browser_id'] ?? '') !== $expectedBrowserId
        || (string)($params['user_id'] ?? '') !== $expectedUserId
    ) {
        rejectAltchaAttempt($pending, 'ALTCHA challenge no longer matches this login attempt. Refresh the challenge and try again.');
    }

    if (!getAltchaClient()->verifySolution($payload, true)) {
        rejectAltchaAttempt($pending, 'ALTCHA verification failed. Refresh the challenge and try again.');
    }

    clearAltchaChallengeState();
    $_SESSION['captcha_verified'] = [
        'timestamp' => time(),
        'valid_until' => time() + CAPTCHA_VERIFICATION_TTL_SECONDS,
        'method' => 'altcha',
    ];

    sendResponse(true, [
        'success' => true,
    ], 'ALTCHA verified!');
}
