<?php
/**
 * Payslip Disputes API (Phase 1 MVP)
 * Workflow: submit -> in_review -> resolved/rejected/cancelled -> closed
 */

require_once 'config.php';
require_once 'utils.php';

setCORSHeaders();

$method = getRequestMethod();
$conn = getDBConnection();
ensurePhaseOneTables($conn);

switch ($method) {
    case 'GET':
        requireFeatureAccess('payslip_disputes', ['admin', 'manager', 'staff'], $conn);
        handleGet($conn);
        break;
    case 'POST':
        requireFeatureAccess('payslip_disputes', ['admin', 'manager', 'staff'], $conn);
        handlePost($conn);
        break;
    case 'PUT':
        requireFeatureAccess('payslip_disputes', ['admin', 'manager', 'staff'], $conn);
        handlePut($conn);
        break;
    case 'DELETE':
        requireFeatureAccess('payslip_disputes', ['admin', 'manager', 'staff'], $conn);
        handleDelete($conn);
        break;
    default:
        sendError('Method not allowed', 405);
}

function getSessionRoleValue() {
    return strtolower(trim((string)($_SESSION['role'] ?? '')));
}

function resolveSessionEmployeeIdForDisputes($conn) {
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

function requireSessionEmployeeIdForDisputes($conn) {
    $employeeId = resolveSessionEmployeeIdForDisputes($conn);
    if ($employeeId <= 0) {
        sendError('Your account is not linked to an employee record.', 403);
    }
    return $employeeId;
}

function getSlaHoursForApprovalItem($conn, $itemKey, $defaultHours = 72) {
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

function getDisputeRow($conn, $disputeId) {
    $stmt = $conn->prepare(
        "SELECT pd.*,
                p.pay_period_start,
                p.pay_period_end,
                p.net_pay
         FROM payslip_dispute pd
         LEFT JOIN payroll p ON p.id = pd.payroll_id
         WHERE pd.dispute_id = ?
         LIMIT 1"
    );
    if (!$stmt) sendError('Failed to prepare dispute lookup', 500);
    $stmt->bind_param('i', $disputeId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

function canViewDisputeRow($role, $selfEmployeeId, $row) {
    if (!$row) return false;
    if ($role === 'admin' || $role === 'manager') return true;
    if ($role === 'staff') {
        return intval($row['employee_id'] ?? 0) === intval($selfEmployeeId);
    }
    return false;
}

function isDisputeArchivedRow($row) {
    return intval($row['is_archived'] ?? 0) === 1;
}

function handleGetComments($conn, $disputeId, $role, $selfEmployeeId) {
    $record = getDisputeRow($conn, $disputeId);
    if (!$record) sendError('Dispute not found', 404);
    if (!canViewDisputeRow($role, $selfEmployeeId, $record)) sendError('Forbidden', 403);

    $stmt = $conn->prepare(
        "SELECT c.comment_id, c.dispute_id, c.user_id, c.comment_text, c.created_at,
                u.first_name, u.last_name, u.username, LOWER(COALESCE(u.role, '')) AS commenter_role
         FROM payslip_dispute_comment c
         INNER JOIN users u ON u.id = c.user_id
         WHERE c.dispute_id = ?
         ORDER BY c.comment_id ASC"
    );
    if (!$stmt) sendError('Failed to load dispute comments', 500);
    $stmt->bind_param('i', $disputeId);
    $stmt->execute();
    $result = $stmt->get_result();

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $name = trim((string)($row['first_name'] ?? '') . ' ' . (string)($row['last_name'] ?? ''));
        $rows[] = [
            'comment_id' => intval($row['comment_id']),
            'dispute_id' => intval($row['dispute_id']),
            'user_id' => intval($row['user_id']),
            'comment_text' => (string)($row['comment_text'] ?? ''),
            'created_at' => (string)($row['created_at'] ?? ''),
            'commenter_name' => $name !== '' ? $name : (string)($row['username'] ?? 'Unknown User'),
            'commenter_role' => (string)($row['commenter_role'] ?? ''),
        ];
    }
    $stmt->close();

    sendResponse(true, $rows, 'Dispute comments retrieved successfully');
}

function handleGet($conn) {
    $role = getSessionRoleValue();
    if (!in_array($role, ['admin', 'manager', 'staff'], true)) {
        sendError('Forbidden', 403);
    }

    $selfEmployeeId = $role === 'staff' ? requireSessionEmployeeIdForDisputes($conn) : resolveSessionEmployeeIdForDisputes($conn);
    $id = intval($_GET['id'] ?? 0);
    $commentsOnly = isset($_GET['comments']) && (string)($_GET['comments']) !== '0';
    if ($commentsOnly) {
        $disputeId = intval($_GET['dispute_id'] ?? $_GET['id'] ?? 0);
        if ($disputeId <= 0) sendError('Dispute ID is required', 400);
        handleGetComments($conn, $disputeId, $role, $selfEmployeeId);
        return;
    }

    $sql = "SELECT pd.*,
                   CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
                   p.pay_period_start,
                   p.pay_period_end,
                   p.net_pay,
                   creator.username AS created_by_username,
                   resolver.username AS resolved_by_username
            FROM payslip_dispute pd
            INNER JOIN employees e ON e.employee_id = pd.employee_id
            INNER JOIN payroll p ON p.id = pd.payroll_id
            LEFT JOIN users creator ON creator.id = pd.created_by
            LEFT JOIN users resolver ON resolver.id = pd.resolved_by
            WHERE 1=1";
    $params = [];
    $types = '';
    $archivedFilterProvided = array_key_exists('archived', $_GET);
    $archivedOnly = $archivedFilterProvided ? intval($_GET['archived']) === 1 : false;

    if ($id > 0) {
        $sql .= " AND pd.dispute_id = ?";
        $params[] = $id;
        $types .= 'i';
    }

    if ($role === 'staff') {
        $sql .= " AND pd.employee_id = ?";
        $params[] = $selfEmployeeId;
        $types .= 'i';
    } elseif (!empty($_GET['employee_id'])) {
        $sql .= " AND pd.employee_id = ?";
        $params[] = intval($_GET['employee_id']);
        $types .= 'i';
    }

    if (!empty($_GET['payroll_id'])) {
        $sql .= " AND pd.payroll_id = ?";
        $params[] = intval($_GET['payroll_id']);
        $types .= 'i';
    }

    if (!empty($_GET['status'])) {
        $sql .= " AND pd.status = ?";
        $params[] = strtolower(trim((string)$_GET['status']));
        $types .= 's';
    }

    if (!empty($_GET['issue_type'])) {
        $sql .= " AND pd.issue_type = ?";
        $params[] = strtolower(trim((string)$_GET['issue_type']));
        $types .= 's';
    }

    if ($id <= 0 || $archivedFilterProvided) {
        $sql .= $archivedOnly
            ? " AND COALESCE(pd.is_archived, 0) = 1"
            : " AND COALESCE(pd.is_archived, 0) = 0";
    }

    $sql .= " ORDER BY
                CASE
                    WHEN pd.status IN ('submitted', 'in_review') THEN 0
                    ELSE 1
                END ASC,
                pd.created_at DESC,
                pd.dispute_id DESC";

    if (!empty($params)) {
        $stmt = $conn->prepare($sql);
        if (!$stmt) sendError('Failed to prepare dispute query', 500);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
    } else {
        $result = $conn->query($sql);
    }
    if (!$result) sendError('Failed to retrieve disputes', 500);

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }

    if ($id > 0) {
        if (empty($rows)) sendError('Dispute not found', 404);
        sendResponse(true, $rows[0], 'Dispute retrieved successfully');
    }

    sendResponse(true, $rows, 'Disputes retrieved successfully');
}

function handleCreateDispute($conn, $data, $role, $selfEmployeeId, $currentUserId) {
    $required = ['payroll_id', 'issue_type', 'dispute_reason'];
    $missing = validateRequiredFields($data, $required);
    if ($missing) {
        sendError('Missing required fields: ' . implode(', ', $missing), 400);
    }

    $payrollId = intval($data['payroll_id']);
    if ($payrollId <= 0) sendError('Invalid payroll ID', 400);

    $issueType = strtolower(trim((string)$data['issue_type']));
    $allowedTypes = ['missing_overtime', 'deduction_error', 'allowance_missing', 'wrong_period', 'other'];
    if (!in_array($issueType, $allowedTypes, true)) {
        sendError('Invalid dispute issue type', 400);
    }

    $reason = trim((string)$data['dispute_reason']);
    if ($reason === '') sendError('Dispute reason is required', 400);
    if (strlen($reason) > 3000) sendError('Dispute reason is too long (max 3000 characters)', 400);

    $priority = strtolower(trim((string)($data['priority'] ?? 'medium')));
    if (!in_array($priority, ['low', 'medium', 'high'], true)) $priority = 'medium';

    $expectedValue = isset($data['expected_value']) && $data['expected_value'] !== '' ? floatval($data['expected_value']) : null;
    $currentValue = isset($data['current_value']) && $data['current_value'] !== '' ? floatval($data['current_value']) : null;

    $payrollStmt = $conn->prepare("SELECT id, employee_id, net_pay FROM payroll WHERE id = ? LIMIT 1");
    if (!$payrollStmt) sendError('Failed to validate payroll record', 500);
    $payrollStmt->bind_param('i', $payrollId);
    $payrollStmt->execute();
    $payroll = $payrollStmt->get_result()->fetch_assoc();
    $payrollStmt->close();
    if (!$payroll) sendError('Payroll record not found', 404);

    $employeeId = intval($payroll['employee_id'] ?? 0);
    if ($role === 'staff' && $employeeId !== intval($selfEmployeeId)) {
        sendError('You can only dispute your own payslips', 403);
    }

    $slaHours = getSlaHoursForApprovalItem($conn, 'payslip_dispute', 72);
    $slaDueAt = date('Y-m-d H:i:s', time() + ($slaHours * 3600));
    $status = 'submitted';
    $safeReason = sanitizeInput($reason);

    $sql = "INSERT INTO payslip_dispute
            (payroll_id, employee_id, issue_type, dispute_reason, expected_value, current_value, status, priority, sla_due_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    $stmt = $conn->prepare($sql);
    if (!$stmt) sendError('Failed to prepare dispute insert', 500);
    $stmt->bind_param(
        'iissddsssi',
        $payrollId,
        $employeeId,
        $issueType,
        $safeReason,
        $expectedValue,
        $currentValue,
        $status,
        $priority,
        $slaDueAt,
        $currentUserId
    );
    if (!$stmt->execute()) {
        $stmt->close();
        sendError('Failed to submit dispute: ' . $conn->error, 500);
    }
    $disputeId = intval($conn->insert_id);
    $stmt->close();

    $newRow = getDisputeRow($conn, $disputeId);
    logActivity($conn, $currentUserId, 'create_payslip_dispute', 'Submitted payslip dispute #' . $disputeId, 'payroll_management');
    logAuditTrail($conn, $currentUserId, 'payslip_dispute', $disputeId, 'create', null, $newRow, basename(__FILE__));
    upsertExceptionQueue(
        $conn,
        'payslip_dispute',
        (string)$disputeId,
        'Payslip dispute submitted',
        'Dispute #' . $disputeId . ' was submitted and is waiting for review.',
        $priority === 'high' ? 'high' : 'medium',
        'admin',
        [
            'dispute_id' => $disputeId,
            'payroll_id' => $payrollId,
            'employee_id' => $employeeId,
            'status' => $status,
        ],
        $currentUserId
    );

    sendResponse(true, ['dispute_id' => $disputeId], 'Dispute submitted successfully', 201);
}

function handleCreateComment($conn, $data, $role, $selfEmployeeId, $currentUserId) {
    $disputeId = intval($data['dispute_id'] ?? 0);
    if ($disputeId <= 0) sendError('Dispute ID is required', 400);

    $comment = trim((string)($data['comment'] ?? $data['comment_text'] ?? ''));
    if ($comment === '') sendError('Comment is required', 400);
    if (strlen($comment) > 2000) sendError('Comment is too long (max 2000 characters)', 400);

    $record = getDisputeRow($conn, $disputeId);
    if (!$record) sendError('Dispute not found', 404);
    if (!canViewDisputeRow($role, $selfEmployeeId, $record)) sendError('Forbidden', 403);

    $safeComment = sanitizeInput($comment);
    $stmt = $conn->prepare(
        "INSERT INTO payslip_dispute_comment (dispute_id, user_id, comment_text)
         VALUES (?, ?, ?)"
    );
    if (!$stmt) sendError('Failed to save comment', 500);
    $stmt->bind_param('iis', $disputeId, $currentUserId, $safeComment);
    if (!$stmt->execute()) {
        $stmt->close();
        sendError('Failed to save comment: ' . $conn->error, 500);
    }
    $commentId = intval($conn->insert_id);
    $stmt->close();

    logActivity($conn, $currentUserId, 'comment_payslip_dispute', 'Added comment on payslip dispute #' . $disputeId, 'payroll_management');
    logAuditTrail($conn, $currentUserId, 'payslip_dispute_comment', $commentId, 'create', null, [
        'comment_id' => $commentId,
        'dispute_id' => $disputeId,
        'comment_text' => $safeComment,
    ], basename(__FILE__));

    sendResponse(true, ['comment_id' => $commentId], 'Comment added successfully', 201);
}

function handlePost($conn) {
    $role = getSessionRoleValue();
    if (!in_array($role, ['admin', 'manager', 'staff'], true)) {
        sendError('Forbidden', 403);
    }

    $currentUserId = intval($_SESSION['user_id'] ?? 0);
    if ($currentUserId <= 0) sendError('Authentication required', 401);

    $selfEmployeeId = $role === 'staff' ? requireSessionEmployeeIdForDisputes($conn) : resolveSessionEmployeeIdForDisputes($conn);
    $data = getJSONInput();
    $action = strtolower(trim((string)($data['action'] ?? 'create')));

    if ($action === 'comment') {
        handleCreateComment($conn, $data, $role, $selfEmployeeId, $currentUserId);
        return;
    }

    handleCreateDispute($conn, $data, $role, $selfEmployeeId, $currentUserId);
}

function handlePut($conn) {
    $role = getSessionRoleValue();
    if (!in_array($role, ['admin', 'manager', 'staff'], true)) {
        sendError('Forbidden', 403);
    }

    $currentUserId = intval($_SESSION['user_id'] ?? 0);
    if ($currentUserId <= 0) sendError('Authentication required', 401);

    $selfEmployeeId = $role === 'staff' ? requireSessionEmployeeIdForDisputes($conn) : resolveSessionEmployeeIdForDisputes($conn);
    $data = getJSONInput();
    $disputeId = intval($data['dispute_id'] ?? 0);
    if ($disputeId <= 0) sendError('Dispute ID is required', 400);

    $before = getDisputeRow($conn, $disputeId);
    if (!$before) sendError('Dispute not found', 404);
    if (!canViewDisputeRow($role, $selfEmployeeId, $before)) sendError('Forbidden', 403);
    $action = strtolower(trim((string)($data['action'] ?? '')));
    $currentStatus = strtolower((string)($before['status'] ?? ''));
    $isArchived = isDisputeArchivedRow($before);

    if ($action === 'archive') {
        if ($isArchived) sendError('Dispute is already archived', 409);
        if (!in_array($currentStatus, ['resolved', 'rejected', 'closed'], true)) {
            sendError('Only resolved, rejected, or closed disputes can be archived.', 400);
        }

        $stmt = $conn->prepare(
            "UPDATE payslip_dispute
             SET is_archived = 1,
                 archived_at = NOW(),
                 archived_by = ?
             WHERE dispute_id = ?
               AND COALESCE(is_archived, 0) = 0"
        );
        if (!$stmt) sendError('Failed to prepare dispute archive update', 500);
        $stmt->bind_param('ii', $currentUserId, $disputeId);
        if (!$stmt->execute()) {
            $stmt->close();
            sendError('Failed to archive dispute: ' . $conn->error, 500);
        }
        if ($stmt->affected_rows <= 0) {
            $stmt->close();
            sendError('Dispute is already archived', 409);
        }
        $stmt->close();

        $after = getDisputeRow($conn, $disputeId);
        logActivity($conn, $currentUserId, 'archive_payslip_dispute', 'Archived payslip dispute #' . $disputeId, 'payroll_management');
        logAuditTrail($conn, $currentUserId, 'payslip_dispute', $disputeId, 'archive', $before, $after, basename(__FILE__));
        sendResponse(true, $after, 'Dispute archived successfully');
    }

    if ($action === 'restore') {
        if (!$isArchived) sendError('Dispute is not archived', 409);

        $stmt = $conn->prepare(
            "UPDATE payslip_dispute
             SET is_archived = 0,
                 archived_at = NULL,
                 archived_by = NULL
             WHERE dispute_id = ?
               AND COALESCE(is_archived, 0) = 1"
        );
        if (!$stmt) sendError('Failed to prepare dispute restore update', 500);
        $stmt->bind_param('i', $disputeId);
        if (!$stmt->execute()) {
            $stmt->close();
            sendError('Failed to restore dispute: ' . $conn->error, 500);
        }
        if ($stmt->affected_rows <= 0) {
            $stmt->close();
            sendError('Dispute is no longer archived', 409);
        }
        $stmt->close();

        $after = getDisputeRow($conn, $disputeId);
        logActivity($conn, $currentUserId, 'restore_payslip_dispute', 'Restored payslip dispute #' . $disputeId, 'payroll_management');
        logAuditTrail($conn, $currentUserId, 'payslip_dispute', $disputeId, 'restore', $before, $after, basename(__FILE__));
        sendResponse(true, $after, 'Dispute restored successfully');
    }

    $updates = [];
    $params = [];
    $types = '';

    if ($action === 'cancel') {
        if ($isArchived) {
            sendError('Archived disputes can no longer be cancelled.', 400);
        }
        if (!in_array($currentStatus, ['submitted', 'in_review'], true)) {
            sendError('Only submitted or in-review disputes can be cancelled.', 400);
        }
        if ($role === 'staff' && intval($before['employee_id'] ?? 0) !== intval($selfEmployeeId)) {
            sendError('You can only cancel your own disputes.', 403);
        }

        $updates[] = "status = 'cancelled'";
        $updates[] = "resolved_by = ?";
        $updates[] = "resolved_at = NOW()";
        $params[] = $currentUserId;
        $types .= 'i';

        if (!array_key_exists('resolution_notes', $data)) {
            $updates[] = "resolution_notes = ?";
            $params[] = $role === 'staff' ? 'Cancelled by requester.' : 'Cancelled by reviewer.';
            $types .= 's';
        }
    } elseif ($role === 'staff') {
        if ($action !== 'close') {
            sendError('Staff can only cancel an active dispute or close a reviewed dispute.', 403);
        }
        if (!in_array($currentStatus, ['resolved', 'rejected'], true)) {
            sendError('Only resolved or rejected disputes can be closed.', 400);
        }
        if (intval($before['employee_id'] ?? 0) !== intval($selfEmployeeId)) {
            sendError('You can only close your own disputes.', 403);
        }

        $updates[] = "status = 'closed'";
    } else {
        if (isset($data['status'])) {
            $status = strtolower(trim((string)$data['status']));
            $allowedStatus = ['submitted', 'in_review', 'resolved', 'rejected', 'closed', 'cancelled'];
            if (!in_array($status, $allowedStatus, true)) {
                sendError('Invalid dispute status', 400);
            }
            if ($status === 'cancelled' && !in_array($currentStatus, ['submitted', 'in_review'], true)) {
                sendError('Only submitted or in-review disputes can be cancelled.', 400);
            }
            $updates[] = "status = ?";
            $params[] = $status;
            $types .= 's';

            if (in_array($status, ['resolved', 'rejected', 'cancelled'], true)) {
                $updates[] = "resolved_by = ?";
                $updates[] = "resolved_at = NOW()";
                $params[] = $currentUserId;
                $types .= 'i';
            } elseif (in_array($status, ['submitted', 'in_review'], true)) {
                $updates[] = "resolved_by = NULL";
                $updates[] = "resolved_at = NULL";
            }
        }

        if (isset($data['priority'])) {
            $priority = strtolower(trim((string)$data['priority']));
            if (!in_array($priority, ['low', 'medium', 'high'], true)) {
                sendError('Invalid dispute priority', 400);
            }
            $updates[] = "priority = ?";
            $params[] = $priority;
            $types .= 's';
        }

        if (array_key_exists('resolution_notes', $data)) {
            $updates[] = "resolution_notes = ?";
            $params[] = sanitizeInput((string)$data['resolution_notes']);
            $types .= 's';
        }
    }

    if (empty($updates)) sendError('No fields to update', 400);

    $sql = "UPDATE payslip_dispute SET " . implode(', ', $updates) . " WHERE dispute_id = ?";
    $params[] = $disputeId;
    $types .= 'i';

    $stmt = $conn->prepare($sql);
    if (!$stmt) sendError('Failed to prepare dispute update', 500);
    $stmt->bind_param($types, ...$params);
    if (!$stmt->execute()) {
        $stmt->close();
        sendError('Failed to update dispute: ' . $conn->error, 500);
    }
    if ($stmt->affected_rows <= 0) {
        $stmt->close();
        sendError('No changes were applied', 409);
    }
    $stmt->close();

    $after = getDisputeRow($conn, $disputeId);
    $statusNow = strtolower((string)($after['status'] ?? ''));
    if (in_array($statusNow, ['resolved', 'rejected', 'closed', 'cancelled'], true)) {
        $resolveSql = "UPDATE exception_queue
                       SET status = 'resolved',
                           resolved_by = ?,
                           resolved_at = NOW()
                       WHERE source_type = 'payslip_dispute'
                         AND source_record_id = ?";
        $resolveStmt = $conn->prepare($resolveSql);
        if ($resolveStmt) {
            $recordId = (string)$disputeId;
            $resolveStmt->bind_param('is', $currentUserId, $recordId);
            $resolveStmt->execute();
            $resolveStmt->close();
        }
    } else {
        upsertExceptionQueue(
            $conn,
            'payslip_dispute',
            (string)$disputeId,
            'Payslip dispute requires review',
            'Dispute #' . $disputeId . ' is currently ' . $statusNow . '.',
            strtolower((string)($after['priority'] ?? 'medium')) === 'high' ? 'high' : 'medium',
            'admin',
            [
                'dispute_id' => $disputeId,
                'status' => $statusNow,
                'payroll_id' => intval($after['payroll_id'] ?? 0),
                'employee_id' => intval($after['employee_id'] ?? 0),
            ],
            $currentUserId
        );
    }

    logActivity($conn, $currentUserId, 'update_payslip_dispute', 'Updated payslip dispute #' . $disputeId, 'payroll_management');
    logAuditTrail($conn, $currentUserId, 'payslip_dispute', $disputeId, 'update', $before, $after, basename(__FILE__));
    sendResponse(true, $after, 'Dispute updated successfully');
}

function handleDelete($conn) {
    $role = getSessionRoleValue();
    if (!in_array($role, ['admin', 'manager', 'staff'], true)) {
        sendError('Forbidden', 403);
    }

    if (!in_array($role, ['admin', 'manager'], true)) {
        sendError('Only managers or admins can delete archived disputes.', 403);
    }

    $currentUserId = intval($_SESSION['user_id'] ?? 0);
    if ($currentUserId <= 0) sendError('Authentication required', 401);

    $selfEmployeeId = $role === 'staff' ? requireSessionEmployeeIdForDisputes($conn) : resolveSessionEmployeeIdForDisputes($conn);
    $disputeId = intval($_GET['id'] ?? $_GET['dispute_id'] ?? 0);
    if ($disputeId <= 0) sendError('Dispute ID is required', 400);

    $before = getDisputeRow($conn, $disputeId);
    if (!$before) sendError('Dispute not found', 404);
    if (!canViewDisputeRow($role, $selfEmployeeId, $before)) sendError('Forbidden', 403);
    if (!isDisputeArchivedRow($before)) sendError('Only archived disputes can be deleted', 400);

    $queueStmt = $conn->prepare(
        "DELETE FROM exception_queue
         WHERE source_type = 'payslip_dispute'
           AND source_record_id = ?"
    );
    if ($queueStmt) {
        $recordId = (string)$disputeId;
        $queueStmt->bind_param('s', $recordId);
        $queueStmt->execute();
        $queueStmt->close();
    }

    $stmt = $conn->prepare(
        "DELETE FROM payslip_dispute
         WHERE dispute_id = ?
           AND COALESCE(is_archived, 0) = 1"
    );
    if (!$stmt) sendError('Failed to prepare dispute delete', 500);
    $stmt->bind_param('i', $disputeId);
    if (!$stmt->execute()) {
        $stmt->close();
        sendError('Failed to delete dispute: ' . $conn->error, 500);
    }
    if ($stmt->affected_rows <= 0) {
        $stmt->close();
        sendError('Dispute is no longer archived', 409);
    }
    $stmt->close();

    logActivity($conn, $currentUserId, 'delete_payslip_dispute', 'Deleted archived payslip dispute #' . $disputeId, 'payroll_management');
    logAuditTrail($conn, $currentUserId, 'payslip_dispute', $disputeId, 'delete', $before, null, basename(__FILE__));
    sendResponse(true, null, 'Dispute deleted successfully');
}

closeDBConnection($conn);
?>
