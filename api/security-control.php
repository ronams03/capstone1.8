<?php
/**
 * Security Control API
 * Admin-only security controls and alert feed.
 *
 * GET  ?action=alerts          - suspicious inbound/outbound IP/browser events
 * GET  ?action=lockdown_status - current lockdown mode state
 * POST ?action=lockdown        - enable/disable lockdown mode
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/utils.php';

setCORSHeaders();

$method = getRequestMethod();
$conn = getDBConnection();

requireAuth();
requireRole(['admin']);

$action = trim((string)($_GET['action'] ?? ''));

if ($method === 'GET') {
    if ($action === '' || $action === 'alerts') {
        handleGetSecurityAlerts($conn);
    } elseif ($action === 'lockdown_status') {
        handleGetLockdownStatus($conn);
    } else {
        sendError('Invalid action', 400);
    }
}

if ($method === 'POST') {
    if ($action === 'lockdown') {
        handleSetLockdown($conn);
    } else {
        sendError('Invalid action', 400);
    }
}

sendError('Method not allowed', 405);

function normalizeAlertDirection($text) {
    $lower = strtolower((string)$text);
    if (strpos($lower, 'outbound') !== false || strpos($lower, 'egress') !== false || strpos($lower, 'external') !== false) {
        return 'outbound';
    }
    return 'inbound';
}

function normalizeAlertSeverity($text) {
    $lower = strtolower((string)$text);
    if (
        strpos($lower, 'attack') !== false
        || strpos($lower, 'malicious') !== false
        || strpos($lower, 'blocked') !== false
        || strpos($lower, 'lockout') !== false
    ) {
        return 'high';
    }

    if (
        strpos($lower, 'failed') !== false
        || strpos($lower, 'invalid') !== false
        || strpos($lower, 'denied') !== false
        || strpos($lower, 'suspicious') !== false
    ) {
        return 'medium';
    }

    return 'low';
}

function isAttackOrSpamSignal($text) {
    $lower = strtolower((string)$text);
    if ($lower === '') return false;

    return (bool)preg_match(
        '/(attack|malicious|blocked|lockout|intruder|spam|flood|ddos|brute|rate\\s*limit|too\\s*many|unknown\\s*ip|unknown_ip|unrecognized\\s*ip|suspicious\\s*ip|invalid\\s*ip)/',
        $lower
    );
}

function upsertSettingValue($conn, $key, $value, $type = 'string') {
    $stmt = $conn->prepare(
        "INSERT INTO settings (setting_key, setting_value, setting_type)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), setting_type = VALUES(setting_type), updated_at = NOW()"
    );
    if (!$stmt) {
        return false;
    }

    $stmt->bind_param('sss', $key, $value, $type);
    $ok = $stmt->execute();
    $stmt->close();
    return $ok;
}

function toBoolFlag($value) {
    if (is_bool($value)) return $value;
    if (is_numeric($value)) return ((int)$value) !== 0;
    $raw = strtolower(trim((string)$value));
    return in_array($raw, ['1', 'true', 'yes', 'on'], true);
}

function formatIsoDateTime($value) {
    $raw = trim((string)$value);
    if ($raw === '') return '';
    $ts = strtotime($raw);
    if ($ts === false) return $raw;
    return date('Y-m-d H:i:s', $ts);
}

function handleGetLockdownStatus($conn) {
    $state = getSystemLockdownState($conn);

    sendResponse(true, [
        'enabled' => !empty($state['enabled']),
        'reason' => (string)($state['reason'] ?? ''),
        'updated_at' => formatIsoDateTime((string)($state['updated_at'] ?? '')),
        'updated_by' => (string)($state['updated_by'] ?? ''),
    ], 'Lockdown status retrieved.');
}

function handleSetLockdown($conn) {
    $adminId = (int)($_SESSION['user_id'] ?? 0);
    if ($adminId <= 0) {
        sendError('Authentication required', 401);
    }

    if (
        !upsertSettingValue($conn, 'security_lockdown_enabled', '0', 'boolean')
        || !upsertSettingValue($conn, 'security_lockdown_reason', '', 'string')
        || !upsertSettingValue($conn, 'security_lockdown_updated_at', '', 'string')
        || !upsertSettingValue($conn, 'security_lockdown_updated_by', '', 'string')
    ) {
        sendError('Failed to update lockdown settings.', 500);
    }

    sendResponse(true, [
        'enabled' => false,
        'reason' => '',
        'updated_at' => '',
        'updated_by' => '',
    ], 'System lockdown has been removed.');
}

function handleGetSecurityAlerts($conn) {
    ensureIntruderBrowserLockoutStorage($conn);
    $lockdown = getSystemLockdownState($conn);

    $limit = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 25;
    $alerts = [];

    // Active blocked browser/IP lockouts (strong signal).
    $blockedStmt = $conn->prepare(
        "SELECT ip_address, failed_count, blocked_until, updated_at
         FROM intruder_ip_lockouts
         WHERE blocked_until IS NOT NULL AND blocked_until > NOW()
         ORDER BY blocked_until DESC
         LIMIT ?"
    );
    if ($blockedStmt) {
        $blockedStmt->bind_param('i', $limit);
        $blockedStmt->execute();
        $blockedRows = $blockedStmt->get_result();
        while ($row = $blockedRows->fetch_assoc()) {
            $ip = (string)($row['ip_address'] ?? '');
            $failedCount = (int)($row['failed_count'] ?? 0);
            $blockedUntil = (string)($row['blocked_until'] ?? '');
            $updatedAt = (string)($row['updated_at'] ?? '');
            $occurredAt = $updatedAt !== '' ? $updatedAt : $blockedUntil;

            $alerts[] = [
                'id' => 'intruder_lockout:' . $ip . ':' . $blockedUntil,
                'kind' => 'intruder_lockout',
                'severity' => 'high',
                'direction' => 'inbound',
                'ip_address' => $ip,
                'title' => 'Inbound bad IP/browser blocked',
                'message' => "Blocked after {$failedCount} failed attempts until {$blockedUntil}.",
                'occurred_at' => $occurredAt,
                'action' => 'intruder_lockout',
                'activity_type' => 'security',
            ];
        }
        $blockedStmt->close();
    }

    // Recent suspicious activity log records.
    $logLimit = max($limit * 4, 40);
    $logsSql = "SELECT id, action, description, activity_type, ip_address, created_at
                FROM activity_log
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                  AND activity_type IN ('security', 'auth')
                ORDER BY created_at DESC
                LIMIT ?";
    $logsStmt = $conn->prepare($logsSql);
    if ($logsStmt) {
        $logsStmt->bind_param('i', $logLimit);
        $logsStmt->execute();
        $logRows = $logsStmt->get_result();
        while ($row = $logRows->fetch_assoc()) {
            $action = (string)($row['action'] ?? '');
            $description = trim((string)($row['description'] ?? ''));
            $activityType = (string)($row['activity_type'] ?? '');
            $ip = trim((string)($row['ip_address'] ?? ''));
            $createdAt = (string)($row['created_at'] ?? '');
            $id = (int)($row['id'] ?? 0);

            $signalText = trim($action . ' ' . $description . ' ' . $activityType . ' ' . $ip);
            if (!isAttackOrSpamSignal($signalText)) {
                continue;
            }

            $severity = normalizeAlertSeverity($signalText);
            $direction = normalizeAlertDirection($signalText);

            $alerts[] = [
                'id' => 'activity_log:' . $id,
                'kind' => 'activity_signal',
                'severity' => $severity,
                'direction' => $direction,
                'ip_address' => $ip,
                'title' => $direction === 'outbound' ? 'Outbound suspicious activity' : 'Inbound suspicious activity',
                'message' => $description !== '' ? $description : ("Action: {$action}"),
                'occurred_at' => $createdAt,
                'action' => $action,
                'activity_type' => $activityType,
            ];
        }
        $logsStmt->close();
    }

    usort($alerts, function ($a, $b) {
        $ta = strtotime((string)($a['occurred_at'] ?? '')) ?: 0;
        $tb = strtotime((string)($b['occurred_at'] ?? '')) ?: 0;
        return $tb <=> $ta;
    });

    if (count($alerts) > $limit) {
        $alerts = array_slice($alerts, 0, $limit);
    }

    sendResponse(true, [
        'alerts' => $alerts,
        'lockdown' => [
            'enabled' => !empty($lockdown['enabled']),
            'reason' => (string)($lockdown['reason'] ?? ''),
            'updated_at' => formatIsoDateTime((string)($lockdown['updated_at'] ?? '')),
            'updated_by' => (string)($lockdown['updated_by'] ?? ''),
        ],
        'generated_at' => date('Y-m-d H:i:s'),
    ], 'Security alerts retrieved.');
}

closeDBConnection($conn);
?>
