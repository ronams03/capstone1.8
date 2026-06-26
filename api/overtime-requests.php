<?php
/**
 * Overtime Requests API (Phase 1 MVP)
 */

require_once 'config.php';
require_once 'utils.php';

setCORSHeaders();

$method = getRequestMethod();
$conn = getDBConnection();
ensurePhaseOneTables($conn);

switch ($method) {
    case 'GET':
        requireFeatureAccess('overtime_requests', ['admin', 'manager', 'staff'], $conn);
        handleGet($conn);
        break;
    case 'POST':
        requireFeatureAccess('overtime_requests', ['admin', 'manager', 'staff'], $conn);
        handlePost($conn);
        break;
    case 'PUT':
        requireFeatureAccess('overtime_requests', ['admin', 'manager', 'staff'], $conn);
        handlePut($conn);
        break;
    case 'DELETE':
        requireFeatureAccess('overtime_requests', ['admin', 'manager', 'staff'], $conn);
        handleDelete($conn);
        break;
    default:
        sendError('Method not allowed', 405);
}

function getSessionRoleForOvertime() {
    return strtolower(trim((string)($_SESSION['role'] ?? '')));
}

function getSessionEmployeeForOvertime($conn) {
    $sessionEmployeeId = intval($_SESSION['employee_id'] ?? 0);
    if ($sessionEmployeeId > 0) return $sessionEmployeeId;

    $userId = intval($_SESSION['user_id'] ?? 0);
    if ($userId <= 0) return 0;

    $stmt = $conn->prepare("SELECT employee_id FROM users WHERE id = ? LIMIT 1");
    if (!$stmt) return 0;
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $employeeId = intval($row['employee_id'] ?? 0);
    if ($employeeId > 0) {
        $_SESSION['employee_id'] = $employeeId;
    }
    return $employeeId;
}

function requireSessionEmployeeForOvertime($conn) {
    $employeeId = getSessionEmployeeForOvertime($conn);
    if ($employeeId <= 0) {
        sendError('Your account is not linked to an employee record.', 403);
    }
    return $employeeId;
}

function getOvertimeApprovalSlaHours($conn, $itemKey, $defaultHours = 24) {
    $key = trim((string)$itemKey);
    if ($key === '') return max(1, intval($defaultHours));

    $stmt = $conn->prepare("SELECT sla_hours FROM approval_sla_config WHERE item_key = ? LIMIT 1");
    if (!$stmt) return max(1, intval($defaultHours));
    $stmt->bind_param('s', $key);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return max(1, intval($row['sla_hours'] ?? $defaultHours));
}

function getOvertimeSlaDueAt($conn) {
    $hours = getOvertimeApprovalSlaHours($conn, 'overtime', 24);
    return date('Y-m-d H:i:s', time() + ($hours * 3600));
}

function getOvertimeRow($conn, $id) {
    $stmt = $conn->prepare("SELECT * FROM overtime_request WHERE overtime_request_id = ? LIMIT 1");
    if (!$stmt) sendError('Failed to load overtime request', 500);
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

function canViewOvertimeRequest($role, $selfEmployeeId, $record) {
    if (!$record) return false;
    if ($role === 'admin' || $role === 'manager') return true;
    if ($role === 'staff') return intval($record['employee_id'] ?? 0) === intval($selfEmployeeId);
    return false;
}

function handleGet($conn) {
    $role = getSessionRoleForOvertime();
    if (!in_array($role, ['admin', 'manager', 'staff'], true)) {
        sendError('Forbidden', 403);
    }

    $selfEmployeeId = $role === 'staff' ? requireSessionEmployeeForOvertime($conn) : getSessionEmployeeForOvertime($conn);
    $id = intval($_GET['id'] ?? 0);

    $sql = "SELECT ot.*,
                   CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
                   creator.username AS created_by_username,
                   approver.username AS approved_by_username
            FROM overtime_request ot
            INNER JOIN employees e ON e.employee_id = ot.employee_id
            LEFT JOIN users creator ON creator.id = ot.created_by
            LEFT JOIN users approver ON approver.id = ot.approved_by
            WHERE 1=1";
    $params = [];
    $types = '';
    $archivedFilterProvided = array_key_exists('archived', $_GET);
    $archivedOnly = $archivedFilterProvided ? intval($_GET['archived']) === 1 : false;

    if ($id > 0) {
        $sql .= " AND ot.overtime_request_id = ?";
        $params[] = $id;
        $types .= 'i';
    }

    if ($role === 'staff') {
        $sql .= " AND ot.employee_id = ?";
        $params[] = $selfEmployeeId;
        $types .= 'i';
    } elseif (!empty($_GET['employee_id'])) {
        $sql .= " AND ot.employee_id = ?";
        $params[] = intval($_GET['employee_id']);
        $types .= 'i';
    }

    if (!empty($_GET['status'])) {
        $sql .= " AND ot.status = ?";
        $params[] = strtolower(trim((string)$_GET['status']));
        $types .= 's';
    }

    if (!empty($_GET['date_from'])) {
        $sql .= " AND ot.work_date >= ?";
        $params[] = sanitizeInput($_GET['date_from']);
        $types .= 's';
    }

    if (!empty($_GET['date_to'])) {
        $sql .= " AND ot.work_date <= ?";
        $params[] = sanitizeInput($_GET['date_to']);
        $types .= 's';
    }

    if ($id <= 0 || $archivedFilterProvided) {
        $sql .= $archivedOnly
            ? " AND COALESCE(ot.is_archived, 0) = 1"
            : " AND COALESCE(ot.is_archived, 0) = 0";
    }

    $sql .= " ORDER BY
                CASE WHEN ot.status = 'submitted' THEN 0 ELSE 1 END ASC,
                ot.created_at DESC,
                ot.overtime_request_id DESC";

    if (!empty($params)) {
        $stmt = $conn->prepare($sql);
        if (!$stmt) sendError('Failed to prepare overtime query', 500);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
    } else {
        $result = $conn->query($sql);
    }
    if (!$result) sendError('Failed to retrieve overtime requests', 500);

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }

    if ($id > 0) {
        if (empty($rows)) sendError('Overtime request not found', 404);
        sendResponse(true, $rows[0], 'Overtime request retrieved successfully');
    }

    sendResponse(true, $rows, 'Overtime requests retrieved successfully');
}

function handlePost($conn) {
    $role = getSessionRoleForOvertime();
    if (!in_array($role, ['admin', 'manager', 'staff'], true)) {
        sendError('Forbidden', 403);
    }

    $currentUserId = intval($_SESSION['user_id'] ?? 0);
    if ($currentUserId <= 0) sendError('Authentication required', 401);

    $selfEmployeeId = $role === 'staff' ? requireSessionEmployeeForOvertime($conn) : getSessionEmployeeForOvertime($conn);
    $data = getJSONInput();

    $required = ['work_date', 'hours_requested', 'reason'];
    if ($role !== 'staff') {
        $required[] = 'employee_id';
    }
    $missing = validateRequiredFields($data, $required);
    if ($missing) {
        sendError('Missing required fields: ' . implode(', ', $missing), 400);
    }

    $employeeId = $role === 'staff' ? $selfEmployeeId : intval($data['employee_id']);
    if ($employeeId <= 0) sendError('Invalid employee ID', 400);

    $workDate = sanitizeInput($data['work_date']);
    if (!validateDate($workDate)) sendError('Invalid work date format. Expected YYYY-MM-DD.', 400);

    $hoursRequested = floatval($data['hours_requested']);
    if ($hoursRequested <= 0 || $hoursRequested > 24) {
        sendError('Hours requested must be greater than 0 and at most 24.', 400);
    }

    $reason = trim((string)$data['reason']);
    if ($reason === '') sendError('Reason is required', 400);
    if (strlen($reason) > 3000) sendError('Reason is too long (max 3000 characters)', 400);

    $safeReason = sanitizeInput($reason);
    $slaDueAt = getOvertimeSlaDueAt($conn);
    $status = 'submitted';

    $stmt = $conn->prepare(
        "INSERT INTO overtime_request (employee_id, work_date, hours_requested, reason, status, sla_due_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    if (!$stmt) sendError('Failed to prepare overtime insert', 500);
    $stmt->bind_param('isdsssi', $employeeId, $workDate, $hoursRequested, $safeReason, $status, $slaDueAt, $currentUserId);
    if (!$stmt->execute()) {
        $stmt->close();
        sendError('Failed to submit overtime request: ' . $conn->error, 500);
    }
    $requestId = intval($conn->insert_id);
    $stmt->close();

    $after = getOvertimeRow($conn, $requestId);
    logActivity($conn, $currentUserId, 'create_overtime_request', 'Submitted overtime request #' . $requestId, 'payroll_management');
    logAuditTrail($conn, $currentUserId, 'overtime_request', $requestId, 'create', null, $after, basename(__FILE__));
    upsertExceptionQueue(
        $conn,
        'overtime_request',
        (string)$requestId,
        'Overtime request awaiting approval',
        'Overtime request #' . $requestId . ' needs manager review.',
        $hoursRequested >= 6 ? 'high' : 'medium',
        'admin',
        [
            'overtime_request_id' => $requestId,
            'employee_id' => $employeeId,
            'hours_requested' => $hoursRequested,
            'status' => $status,
            'sla_due_at' => $slaDueAt,
        ],
        $currentUserId
    );

    sendResponse(true, ['overtime_request_id' => $requestId], 'Overtime request submitted successfully', 201);
}

function handlePut($conn) {
    $role = getSessionRoleForOvertime();
    if (!in_array($role, ['admin', 'manager', 'staff'], true)) {
        sendError('Forbidden', 403);
    }

    $currentUserId = intval($_SESSION['user_id'] ?? 0);
    if ($currentUserId <= 0) sendError('Authentication required', 401);
    $selfEmployeeId = $role === 'staff' ? requireSessionEmployeeForOvertime($conn) : getSessionEmployeeForOvertime($conn);

    $data = getJSONInput();
    $id = intval($data['overtime_request_id'] ?? 0);
    if ($id <= 0) sendError('Overtime request ID is required', 400);

    $before = getOvertimeRow($conn, $id);
    if (!$before) sendError('Overtime request not found', 404);
    if (!canViewOvertimeRequest($role, $selfEmployeeId, $before)) sendError('Forbidden', 403);

    $updates = [];
    $params = [];
    $types = '';

    if ($role === 'staff') {
        $action = strtolower(trim((string)($data['action'] ?? '')));
        if ($action !== 'cancel') sendError('Staff can only cancel their own overtime request.', 403);
        if (intval($before['employee_id'] ?? 0) !== intval($selfEmployeeId)) sendError('Forbidden', 403);
        if (strtolower((string)($before['status'] ?? '')) !== 'submitted') sendError('Only submitted overtime requests can be cancelled.', 400);
        $updates[] = "status = 'cancelled'";
        $updates[] = "is_archived = 0";
        $updates[] = "archived_at = NULL";
    } else {
        if (empty($data['status'])) sendError('Status is required', 400);
        $status = strtolower(trim((string)$data['status']));
        if (!in_array($status, ['submitted', 'approved', 'rejected', 'cancelled'], true)) {
            sendError('Invalid overtime request status', 400);
        }

        $updates[] = "status = ?";
        $params[] = $status;
        $types .= 's';

        if (in_array($status, ['approved', 'rejected'], true)) {
            $updates[] = "approved_by = ?";
            $updates[] = "approved_at = NOW()";
            $params[] = $currentUserId;
            $types .= 'i';
        } elseif ($status === 'submitted') {
            $updates[] = "approved_by = NULL";
            $updates[] = "approved_at = NULL";
        }

        if (array_key_exists('manager_notes', $data)) {
            $updates[] = "manager_notes = ?";
            $params[] = sanitizeInput((string)$data['manager_notes']);
            $types .= 's';
        }

        if ($status === 'rejected') {
            $updates[] = "is_archived = 1";
            $updates[] = "archived_at = NOW()";
        } else {
            $updates[] = "is_archived = 0";
            $updates[] = "archived_at = NULL";
        }
    }

    if (empty($updates)) sendError('No fields to update', 400);

    $sql = "UPDATE overtime_request SET " . implode(', ', $updates) . " WHERE overtime_request_id = ?";
    $params[] = $id;
    $types .= 'i';

    $stmt = $conn->prepare($sql);
    if (!$stmt) sendError('Failed to prepare overtime update', 500);
    $stmt->bind_param($types, ...$params);
    if (!$stmt->execute()) {
        $stmt->close();
        sendError('Failed to update overtime request: ' . $conn->error, 500);
    }
    if ($stmt->affected_rows <= 0) {
        $stmt->close();
        sendError('No changes were applied', 409);
    }
    $stmt->close();

    $after = getOvertimeRow($conn, $id);
    $statusNow = strtolower((string)($after['status'] ?? ''));
    if (in_array($statusNow, ['approved', 'rejected', 'cancelled'], true)) {
        $resolveSql = "UPDATE exception_queue
                       SET status = 'resolved',
                           resolved_by = ?,
                           resolved_at = NOW()
                       WHERE source_type = 'overtime_request'
                         AND source_record_id = ?";
        $resolveStmt = $conn->prepare($resolveSql);
        if ($resolveStmt) {
            $sourceId = (string)$id;
            $resolveStmt->bind_param('is', $currentUserId, $sourceId);
            $resolveStmt->execute();
            $resolveStmt->close();
        }
    } else {
        upsertExceptionQueue(
            $conn,
            'overtime_request',
            (string)$id,
            'Overtime request awaiting approval',
            'Overtime request #' . $id . ' is currently submitted.',
            floatval($after['hours_requested'] ?? 0) >= 6 ? 'high' : 'medium',
            'admin',
            [
                'overtime_request_id' => $id,
                'employee_id' => intval($after['employee_id'] ?? 0),
                'status' => $statusNow,
                'sla_due_at' => (string)($after['sla_due_at'] ?? ''),
            ],
            $currentUserId
        );
    }

    logActivity($conn, $currentUserId, 'update_overtime_request', 'Updated overtime request #' . $id, 'payroll_management');
    logAuditTrail($conn, $currentUserId, 'overtime_request', $id, 'update', $before, $after, basename(__FILE__));
    sendResponse(true, $after, 'Overtime request updated successfully');
}

function handleDelete($conn) {
    $role = getSessionRoleForOvertime();
    if ($role !== 'admin') {
        sendError('Only admins can delete archived overtime requests.', 403);
    }

    $currentUserId = intval($_SESSION['user_id'] ?? 0);
    if ($currentUserId <= 0) sendError('Authentication required', 401);

    $id = intval($_GET['id'] ?? $_GET['overtime_request_id'] ?? 0);
    if ($id <= 0) sendError('Overtime request ID is required', 400);

    $before = getOvertimeRow($conn, $id);
    if (!$before) sendError('Overtime request not found', 404);
    if (intval($before['is_archived'] ?? 0) !== 1) {
        sendError('Only archived overtime requests can be deleted', 400);
    }

    $queueStmt = $conn->prepare(
        "DELETE FROM exception_queue
         WHERE source_type = 'overtime_request'
           AND source_record_id = ?"
    );
    if ($queueStmt) {
        $recordId = (string)$id;
        $queueStmt->bind_param('s', $recordId);
        $queueStmt->execute();
        $queueStmt->close();
    }

    $stmt = $conn->prepare(
        "DELETE FROM overtime_request
         WHERE overtime_request_id = ?
           AND COALESCE(is_archived, 0) = 1"
    );
    if (!$stmt) sendError('Failed to prepare overtime delete', 500);
    $stmt->bind_param('i', $id);
    if (!$stmt->execute()) {
        $stmt->close();
        sendError('Failed to delete overtime request: ' . $conn->error, 500);
    }
    if ($stmt->affected_rows <= 0) {
        $stmt->close();
        sendError('Overtime request is no longer archived', 409);
    }
    $stmt->close();

    logActivity($conn, $currentUserId, 'delete_overtime_request', 'Deleted archived overtime request #' . $id, 'payroll_management');
    logAuditTrail($conn, $currentUserId, 'overtime_request', $id, 'delete', $before, null, basename(__FILE__));
    sendResponse(true, null, 'Overtime request deleted successfully');
}

closeDBConnection($conn);
?>
