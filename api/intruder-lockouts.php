<?php
/**
 * Intruder Browser Lockouts API
 * Admin-only operations for blocked browser entries.
 *
 * GET  - List currently blocked browsers
 * POST ?action=unblock - Unblock a browser by browser_id
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/utils.php';

setCORSHeaders();

$method = getRequestMethod();
$conn = getDBConnection();

requireAuth();
requireRole(['admin']);

switch ($method) {
    case 'GET':
        handleListBlockedBrowsers($conn);
        break;
    case 'POST':
        $action = $_GET['action'] ?? '';
        if ($action === 'unblock') {
            handleUnblockBrowser($conn);
        } else {
            sendError('Invalid action', 400);
        }
        break;
    default:
        sendError('Method not allowed', 405);
}

function handleListBlockedBrowsers($conn) {
    ensureIntruderBrowserLockoutStorage($conn);

    $sql = "SELECT ip_address, failed_count, window_start, blocked_until, updated_at
            FROM intruder_ip_lockouts
            WHERE blocked_until IS NOT NULL AND blocked_until > NOW()
            ORDER BY blocked_until DESC";

    $result = $conn->query($sql);
    if (!$result) {
        sendError('Failed to retrieve blocked browsers', 500);
    }

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = [
            'browser_id' => $row['ip_address'],
            'failed_count' => (int)$row['failed_count'],
            'window_start' => $row['window_start'],
            'blocked_until' => $row['blocked_until'],
            'blocked_since' => $row['updated_at'],
            'updated_at' => $row['updated_at'],
            'remaining_minutes' => 0,
            'remaining_hours' => 0,
            'requires_admin_unblock' => true,
        ];
    }

    sendResponse(true, $rows, 'Blocked browsers retrieved');
}

function handleUnblockBrowser($conn) {
    $data = getJSONInput();
    $browserIdRaw = trim((string)($data['browser_id'] ?? ''));

    if ($browserIdRaw === '') {
        sendError('browser_id is required', 400);
    }

    if (strlen($browserIdRaw) > 45) {
        sendError('Invalid browser_id', 400);
    }

    if (!preg_match('/^[A-Za-z0-9_.:-]+$/', $browserIdRaw)) {
        sendError('Invalid browser_id', 400);
    }
    $browserId = $browserIdRaw;

    $stmt = $conn->prepare(
        "UPDATE intruder_ip_lockouts
         SET failed_count = 0, window_start = NULL, blocked_until = NULL
         WHERE ip_address = ?"
    );
    if (!$stmt) {
        sendError('Failed to prepare unblock query', 500);
    }

    $stmt->bind_param('s', $browserId);
    if (!$stmt->execute()) {
        $stmt->close();
        sendError('Failed to unblock browser', 500);
    }
    $affected = $stmt->affected_rows;
    $stmt->close();

    if ($affected <= 0) {
        // Row may not exist, or may already be reset.
        $check = $conn->prepare("SELECT id FROM intruder_ip_lockouts WHERE ip_address = ? LIMIT 1");
        if ($check) {
            $check->bind_param('s', $browserId);
            $check->execute();
            $exists = $check->get_result()->num_rows > 0;
            $check->close();

            if (!$exists) {
                sendError('Browser lockout record not found', 404);
            }
        }
    }

    $adminId = (int)($_SESSION['user_id'] ?? 0);
    if ($adminId > 0) {
        logActivity(
            $conn,
            $adminId,
            'browser_lockout_unblocked',
            'Admin unblocked browser lockout: ' . $browserId,
            'security'
        );
    }

    sendResponse(true, null, 'Browser unblocked successfully');
}

closeDBConnection($conn);
?>
