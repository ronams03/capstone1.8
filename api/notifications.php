<?php
/**
 * Notifications API
 * Aggregates contextual reminders/updates for the currently authenticated user.
 * Now includes AI-powered smart notifications via Base44
 */

require_once 'config.php';
require_once 'utils.php';
require_once 'edit_request_utils.php';
require_once 'ai_notifications.php';

setCORSHeaders();

$method = getRequestMethod();
if ($method !== 'GET') {
    sendError('Method not allowed', 405);
}

$conn = getDBConnection();
ensurePhaseOneTables($conn);
ensureTaskCollaboratorsTable($conn);
ensureTaskAssignmentEventsTable($conn);
ensureLeaveRequestCommentsTable($conn);
ensureAINotificationsTable($conn);
requireAuth();

$userId = intval($_SESSION['user_id'] ?? 0);
$role = strtolower((string)($_SESSION['role'] ?? ''));
$branchId = profileEditResolveBranchId($conn, $userId);

if ($userId <= 0) {
    sendError('Authentication required', 401);
}

function ensureAINotificationsTable($conn) {
    // Ensure AI notifications table exists
    $sql = "CREATE TABLE IF NOT EXISTS ai_notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                event_type VARCHAR(50) NOT NULL,
                target_user_id INT NOT NULL,
                target_role ENUM('admin', 'manager', 'staff') NOT NULL,
                ai_message TEXT NOT NULL,
                icon_emoji VARCHAR(10) DEFAULT '🔔',
                priority_score INT DEFAULT 5,
                suggested_action VARCHAR(255),
                action_url VARCHAR(500),
                context_json JSON,
                is_sent BOOLEAN DEFAULT FALSE,
                sent_at TIMESTAMP NULL,
                read_at TIMESTAMP NULL,
                expires_at TIMESTAMP NULL,
                source ENUM('base44_ai', 'fallback', 'manual') DEFAULT 'base44_ai',
                user_rating INT NULL,
                was_action_taken BOOLEAN DEFAULT FALSE,
                dismissed BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_target_user (target_user_id, is_sent, created_at),
                INDEX idx_event_type (event_type, created_at),
                INDEX idx_target_role (target_role, created_at),
                INDEX idx_priority (priority_score DESC, created_at),
                INDEX idx_expires (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    if (!$conn->query($sql)) {
        error_log('[AI Notifications] Failed to create table: ' . $conn->error);
    }
}

function ensureTaskCollaboratorsTable($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS task_collaborators (
                collaborator_id INT AUTO_INCREMENT PRIMARY KEY,
                task_id INT NOT NULL,
                user_id INT NOT NULL,
                shift_mode ENUM('none', 'current_time', 'range') NOT NULL DEFAULT 'none',
                shift_start DATETIME NULL,
                shift_end DATETIME NULL,
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_task_collaborator (task_id, user_id),
                KEY idx_task_collaborators_user (user_id),
                KEY idx_task_collaborators_shift_start (shift_start),
                CONSTRAINT fk_task_collaborators_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                CONSTRAINT fk_task_collaborators_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                CONSTRAINT fk_task_collaborators_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    if (!$conn->query($sql)) {
        sendError('Failed to initialize task collaborators storage: ' . $conn->error, 500);
    }
}

function ensureTaskAssignmentEventsTable($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS task_assignment_event (
                event_id INT AUTO_INCREMENT PRIMARY KEY,
                task_id INT NOT NULL,
                previous_assigned_to INT NULL,
                new_assigned_to INT NOT NULL,
                assigned_by INT NULL,
                event_kind ENUM('assigned', 'reassigned') NOT NULL DEFAULT 'assigned',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                KEY idx_task_assignment_new_user (new_assigned_to, created_at),
                KEY idx_task_assignment_created (created_at),
                KEY idx_task_assignment_task (task_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    if (!$conn->query($sql)) {
        sendError('Failed to initialize task assignment events storage: ' . $conn->error, 500);
    }
}

function ensureLeaveRequestCommentsTable($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS leave_request_comment (
                comment_id INT AUTO_INCREMENT PRIMARY KEY,
                leave_request_id INT NOT NULL,
                user_id INT NOT NULL,
                parent_comment_id INT NULL,
                comment_text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_leave_comment_request FOREIGN KEY (leave_request_id) REFERENCES leave_request(leave_request_id) ON DELETE CASCADE,
                CONSTRAINT fk_leave_comment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                CONSTRAINT fk_leave_comment_parent FOREIGN KEY (parent_comment_id) REFERENCES leave_request_comment(comment_id) ON DELETE SET NULL,
                INDEX idx_leave_comment_request (leave_request_id),
                INDEX idx_leave_comment_parent (parent_comment_id),
                INDEX idx_leave_comment_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    if (!$conn->query($sql)) {
        sendError('Failed to initialize leave request comments storage: ' . $conn->error, 500);
    }
}

function resolveCurrentEmployeeId($conn, $userId) {
    $sessionEmployeeId = intval($_SESSION['employee_id'] ?? 0);
    if ($sessionEmployeeId > 0) return $sessionEmployeeId;

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

function buildNotificationId($type, $title, $message, $occurredAt, $link = '', $sourceKey = '') {
    $payload = implode('|', [
        trim((string)$type),
        trim((string)$title),
        trim((string)$message),
        trim((string)$occurredAt),
        trim((string)$link),
        trim((string)$sourceKey),
    ]);

    return substr(hash('sha256', $payload), 0, 24);
}

function addNotification(&$items, $type, $title, $message, $occurredAt, $severity = 'info', $link = '', $sourceKey = '', $readKey = '', $meta = null) {
    $id = buildNotificationId($type, $title, $message, $occurredAt, $link, $sourceKey);
    $resolvedReadKey = trim((string)$readKey);
    if ($resolvedReadKey === '') {
        $resolvedReadKey = trim((string)$sourceKey);
    }
    if ($resolvedReadKey === '') {
        $resolvedReadKey = $id;
    }

    $payload = [
        'id' => $id,
        'read_key' => $resolvedReadKey,
        'type' => (string)$type,
        'title' => (string)$title,
        'message' => (string)$message,
        'severity' => (string)$severity,
        'occurred_at' => (string)$occurredAt,
        'link' => (string)$link,
    ];

    if (is_array($meta) && !empty($meta)) {
        $payload['meta'] = $meta;
    }

    $items[] = $payload;
}

function getApprovalSlaHoursForNotifications($conn, $itemKey, $defaultHours) {
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

function notificationPreview($value, $limit = 90) {
    $text = trim((string)$value);
    if ($text === '') return '';
    if (function_exists('mb_strlen') && function_exists('mb_substr')) {
        if (mb_strlen($text) > $limit) {
            return mb_substr($text, 0, max(0, $limit - 3)) . '...';
        }
        return $text;
    }
    if (strlen($text) > $limit) {
        return substr($text, 0, max(0, $limit - 3)) . '...';
    }
    return $text;
}

$employeeId = resolveCurrentEmployeeId($conn, $userId);
$items = [];
$today = date('Y-m-d');
$todayTs = strtotime($today);

// Task due reminders for assigned tasks and collaborator tasks.
$taskStmt = $conn->prepare(
    "SELECT t.id,
            t.project_id,
            t.title,
            t.status,
            t.due_date,
            CASE WHEN t.assigned_to = ? THEN 1 ELSE 0 END AS is_primary_assignee
     FROM tasks t
     LEFT JOIN task_collaborators tc
            ON tc.task_id = t.id
           AND tc.user_id = ?
     WHERE (t.assigned_to = ? OR tc.user_id = ?)
       AND status IN ('pending', 'in_progress')
     ORDER BY (due_date IS NULL), due_date ASC, id DESC
     LIMIT 60"
);
if ($taskStmt) {
    $taskStmt->bind_param('iiii', $userId, $userId, $userId, $userId);
    $taskStmt->execute();
    $taskResult = $taskStmt->get_result();
    while ($row = $taskResult->fetch_assoc()) {
        $dueDate = trim((string)($row['due_date'] ?? ''));
        if ($dueDate === '') continue;

        $dueTs = strtotime($dueDate);
        if ($dueTs === false) continue;
        $deltaDays = (int)floor(($dueTs - $todayTs) / 86400);
        $isPrimary = intval($row['is_primary_assignee'] ?? 0) === 1;
        $collabSuffix = $isPrimary ? '' : ' (collaborator task)';

        if ($deltaDays < 0) {
            addNotification(
                $items,
                'task',
                'Overdue Task',
                $row['title'] . ' is overdue since ' . date('M d, Y', $dueTs) . '.' . $collabSuffix,
                date('Y-m-d H:i:s', $dueTs),
                'high',
                '/projects/' . intval($row['project_id']),
                'task_due:' . intval($row['id']) . ':overdue'
            );
        } elseif ($deltaDays <= 3) {
            addNotification(
                $items,
                'task',
                'Task Due Soon',
                $row['title'] . ' is due on ' . date('M d, Y', $dueTs) . '.' . $collabSuffix,
                date('Y-m-d H:i:s', $dueTs),
                $deltaDays === 0 ? 'high' : 'medium',
                '/projects/' . intval($row['project_id']),
                'task_due:' . intval($row['id']) . ':soon'
            );
        }
    }
    $taskStmt->close();
}

// Direct task assignment and reassignment updates.
$taskAssignmentStmt = $conn->prepare(
    "SELECT tae.event_id,
            tae.task_id,
            tae.event_kind,
            tae.created_at,
            t.title,
            t.project_id,
            t.priority,
            t.due_date,
            p.name AS project_name,
            c.client_name,
            u.id AS assigner_user_id,
            u.role AS assigner_role,
            u.first_name AS assigner_first_name,
            u.last_name AS assigner_last_name,
            u.username AS assigner_username
     FROM task_assignment_event tae
     INNER JOIN tasks t ON t.id = tae.task_id
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN client c ON c.client_id = p.client_id
     LEFT JOIN users u ON u.id = tae.assigned_by
     WHERE tae.new_assigned_to = ?
       AND tae.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     ORDER BY tae.created_at DESC, tae.event_id DESC
     LIMIT 40"
);
if ($taskAssignmentStmt) {
    $taskAssignmentStmt->bind_param('i', $userId);
    $taskAssignmentStmt->execute();
    $taskAssignmentResult = $taskAssignmentStmt->get_result();
    while ($row = $taskAssignmentResult->fetch_assoc()) {
        $eventKind = strtolower(trim((string)($row['event_kind'] ?? 'assigned')));
        $taskTitle = trim((string)($row['title'] ?? 'Untitled Task'));
        $projectName = trim((string)($row['project_name'] ?? 'N/A'));
        $clientName = trim((string)($row['client_name'] ?? 'N/A'));
        $priority = strtolower(trim((string)($row['priority'] ?? 'medium')));
        $priorityLabel = $priority !== '' ? ucwords(str_replace('_', ' ', $priority)) : 'Not set';
        $dueRaw = trim((string)($row['due_date'] ?? ''));
        $dueTs = $dueRaw !== '' ? strtotime($dueRaw) : false;
        $dueLabel = $dueTs ? date('M d, Y', $dueTs) : 'No due date';

        $assignerRole = strtolower(trim((string)($row['assigner_role'] ?? '')));
        $assignerRoleLabel = $assignerRole === 'manager' ? 'Manager' : 'Administrator';
        $assignerName = trim((string)($row['assigner_first_name'] ?? '') . ' ' . (string)($row['assigner_last_name'] ?? ''));
        if ($assignerName === '') {
            $assignerName = trim((string)($row['assigner_username'] ?? ''));
        }
        if ($assignerName === '') {
            $assignerName = $assignerRoleLabel;
        }

        $title = $eventKind === 'reassigned' ? 'Task Reassignment' : 'Task Assignment';
        $message = '"' . $taskTitle . '" was '
            . ($eventKind === 'reassigned' ? 'reassigned' : 'assigned')
            . ' by ' . $assignerName . ' (' . $assignerRoleLabel . '). '
            . 'Project: ' . $projectName . '. Client: ' . $clientName . '. '
            . 'Priority: ' . $priorityLabel . '. Due: ' . $dueLabel . '.';

        $severity = 'info';
        if ($priority === 'high' || $priority === 'urgent') {
            $severity = 'high';
        } elseif ($priority === 'medium') {
            $severity = 'medium';
        }

        $link = intval($row['project_id'] ?? 0) > 0
            ? '/projects/' . intval($row['project_id'])
            : '/my-tasks';

        addNotification(
            $items,
            'task',
            $title,
            $message,
            (string)($row['created_at'] ?? date('Y-m-d H:i:s')),
            $severity,
            $link,
            'task_assignment:' . intval($row['event_id'] ?? 0),
            'task_assignment:' . intval($row['event_id'] ?? 0),
            [
                'assignment' => [
                    'kind' => $eventKind,
                    'task_id' => intval($row['task_id'] ?? 0),
                    'task_title' => $taskTitle,
                    'assigned_by_name' => $assignerName,
                    'assigned_by_role' => strtolower($assignerRoleLabel),
                    'project_name' => $projectName,
                    'client_name' => $clientName,
                    'priority' => $priorityLabel,
                    'due_date' => $dueLabel,
                ],
            ]
        );
    }
    $taskAssignmentStmt->close();
}

// Collaborator assignment updates.
$taskCollabStmt = $conn->prepare(
    "SELECT tc.task_id,
            tc.shift_mode,
            tc.shift_start,
            tc.shift_end,
            tc.created_at,
            t.title,
            t.project_id
     FROM task_collaborators tc
     INNER JOIN tasks t ON t.id = tc.task_id
     WHERE tc.user_id = ?
       AND tc.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
     ORDER BY tc.created_at DESC
     LIMIT 25"
);
if ($taskCollabStmt) {
    $taskCollabStmt->bind_param('i', $userId);
    $taskCollabStmt->execute();
    $taskCollabResult = $taskCollabStmt->get_result();
    while ($row = $taskCollabResult->fetch_assoc()) {
        $shiftMode = strtolower((string)($row['shift_mode'] ?? 'none'));
        $message = 'You were added as a collaborator on "' . (string)$row['title'] . '".';
        if ($shiftMode === 'current_time') {
            $shiftStart = trim((string)($row['shift_start'] ?? ''));
            if ($shiftStart !== '') {
                $message .= ' Shift started at ' . date('M d, Y g:i A', strtotime($shiftStart)) . '.';
            }
        } elseif ($shiftMode === 'range') {
            $shiftStart = trim((string)($row['shift_start'] ?? ''));
            $shiftEnd = trim((string)($row['shift_end'] ?? ''));
            if ($shiftStart !== '' && $shiftEnd !== '') {
                $message .= ' Shift window: ' . date('M d, Y g:i A', strtotime($shiftStart)) . ' to ' . date('M d, Y g:i A', strtotime($shiftEnd)) . '.';
            }
        }

        $occurredAt = (string)($row['created_at'] ?? date('Y-m-d H:i:s'));
        addNotification(
            $items,
            'task',
            'New Task Collaboration',
            $message,
            $occurredAt,
            'info',
            '/projects/' . intval($row['project_id']),
            'task_collab:' . intval($row['task_id']) . ':' . $occurredAt
        );
    }
    $taskCollabStmt->close();
}

// Task collaborator shift reminders.
$taskShiftStmt = $conn->prepare(
    "SELECT tc.task_id,
            tc.shift_mode,
            tc.shift_start,
            tc.shift_end,
            t.title,
            t.project_id
     FROM task_collaborators tc
     INNER JOIN tasks t ON t.id = tc.task_id
     WHERE tc.user_id = ?
       AND t.status IN ('pending', 'in_progress')
       AND tc.shift_start IS NOT NULL
       AND tc.shift_start >= NOW()
       AND tc.shift_start <= DATE_ADD(NOW(), INTERVAL 7 DAY)
     ORDER BY tc.shift_start ASC
     LIMIT 20"
);
if ($taskShiftStmt) {
    $taskShiftStmt->bind_param('i', $userId);
    $taskShiftStmt->execute();
    $taskShiftResult = $taskShiftStmt->get_result();
    while ($row = $taskShiftResult->fetch_assoc()) {
        $shiftStartRaw = trim((string)($row['shift_start'] ?? ''));
        if ($shiftStartRaw === '') continue;
        $shiftStartTs = strtotime($shiftStartRaw);
        if ($shiftStartTs === false) continue;

        $shiftEndRaw = trim((string)($row['shift_end'] ?? ''));
        $message = 'Task shift for "' . (string)$row['title'] . '" starts on ' . date('M d, Y g:i A', $shiftStartTs) . '.';
        if ($shiftEndRaw !== '') {
            $shiftEndTs = strtotime($shiftEndRaw);
            if ($shiftEndTs !== false) {
                $message = 'Task shift for "' . (string)$row['title'] . '" is scheduled from '
                    . date('M d, Y g:i A', $shiftStartTs)
                    . ' to '
                    . date('M d, Y g:i A', $shiftEndTs)
                    . '.';
            }
        }

        addNotification(
            $items,
            'shift',
            'Task Shift Reminder',
            $message,
            date('Y-m-d H:i:s', $shiftStartTs),
            'info',
            '/projects/' . intval($row['project_id']),
            'task_shift:' . intval($row['task_id']) . ':' . $shiftStartRaw
        );
    }
    $taskShiftStmt->close();
}

// Leave updates for the current employee.
if ($employeeId > 0) {
    $leaveStmt = $conn->prepare(
        "SELECT leave_request_id, leave_type, start_date, end_date, status, approved_at, created_at
         FROM leave_request
         WHERE employee_id = ?
         ORDER BY leave_request_id DESC
         LIMIT 20"
    );
    if ($leaveStmt) {
        $leaveStmt->bind_param('i', $employeeId);
        $leaveStmt->execute();
        $leaveResult = $leaveStmt->get_result();
        while ($row = $leaveResult->fetch_assoc()) {
            $status = strtolower((string)($row['status'] ?? ''));
            if (!in_array($status, ['approved', 'rejected', 'cancelled', 'pending'], true)) continue;

            $startDate = (string)($row['start_date'] ?? '');
            $endDate = (string)($row['end_date'] ?? '');
            $range = $startDate;
            if ($endDate !== '' && $endDate !== $startDate) {
                $range .= ' to ' . $endDate;
            }

            $severity = $status === 'approved' ? 'success' : ($status === 'rejected' ? 'high' : 'info');
            $label = ucfirst($status);
            $occurredAt = (string)($row['approved_at'] ?? $row['created_at'] ?? date('Y-m-d H:i:s'));
            addNotification(
                $items,
                'leave',
                'Leave Request ' . $label,
                strtoupper((string)$row['leave_type']) . ' leave for ' . $range . ' is now ' . $label . '.',
                $occurredAt,
                $severity,
                '/leave-requests?request_id=' . intval($row['leave_request_id']),
                'leave_request:' . intval($row['leave_request_id']) . ':' . $status
            );
        }
        $leaveStmt->close();
    }
}

// Leave comment notifications for request owners (staff/manager) when someone else comments.
if ($employeeId > 0) {
    $commentStmt = $conn->prepare(
        "SELECT c.comment_id,
                c.leave_request_id,
                c.comment_text,
                c.created_at,
                lr.leave_type,
                lr.start_date,
                lr.end_date,
                u.id AS commenter_user_id,
                u.first_name AS commenter_first_name,
                u.last_name AS commenter_last_name,
                u.username AS commenter_username
         FROM leave_request_comment c
         INNER JOIN leave_request lr ON lr.leave_request_id = c.leave_request_id
         INNER JOIN users u ON u.id = c.user_id
         WHERE lr.employee_id = ?
           AND c.user_id <> ?
         ORDER BY c.created_at DESC
         LIMIT 20"
    );
    if ($commentStmt) {
        $commentStmt->bind_param('ii', $employeeId, $userId);
        $commentStmt->execute();
        $commentResult = $commentStmt->get_result();
        while ($row = $commentResult->fetch_assoc()) {
            $commenterName = trim((string)($row['commenter_first_name'] ?? '') . ' ' . (string)($row['commenter_last_name'] ?? ''));
            if ($commenterName === '') {
                $commenterName = (string)($row['commenter_username'] ?? 'A reviewer');
            }

            $range = (string)($row['start_date'] ?? '');
            if (!empty($row['end_date']) && $row['end_date'] !== $row['start_date']) {
                $range .= ' to ' . $row['end_date'];
            }
            $preview = trim((string)($row['comment_text'] ?? ''));
            if (strlen($preview) > 90) {
                $preview = substr($preview, 0, 87) . '...';
            }

            addNotification(
                $items,
                'leave',
                'Leave Request Comment',
                $commenterName . ' commented on your ' . strtoupper((string)$row['leave_type']) . ' leave request (' . $range . '). ' . $preview,
                (string)($row['created_at'] ?? date('Y-m-d H:i:s')),
                'info',
                '/leave-requests?request_id=' . intval($row['leave_request_id']),
                'leave_comment:' . intval($row['comment_id'])
            );
        }
        $commentStmt->close();
    }
}

// Reviewer reminders for new staff/manager comments on pending leave requests.
if (in_array($role, ['manager', 'admin'], true)) {
    $reviewCommentStmt = $conn->prepare(
        "SELECT c.comment_id,
                c.leave_request_id,
                c.comment_text,
                c.created_at,
                lr.employee_id,
                lr.leave_type,
                lr.start_date,
                lr.end_date,
                lr.status,
                e.first_name AS employee_first_name,
                e.last_name AS employee_last_name,
                u.id AS commenter_user_id
         FROM leave_request_comment c
         INNER JOIN leave_request lr ON lr.leave_request_id = c.leave_request_id
         LEFT JOIN employees e ON e.employee_id = lr.employee_id
         INNER JOIN users u ON u.id = c.user_id
         WHERE c.user_id <> ?
           AND LOWER(lr.status) = 'pending'
           AND LOWER(COALESCE(u.role, '')) IN ('staff', 'manager')
         ORDER BY c.created_at DESC
         LIMIT 20"
    );
    if ($reviewCommentStmt) {
        $reviewCommentStmt->bind_param('i', $userId);
        $reviewCommentStmt->execute();
        $reviewCommentResult = $reviewCommentStmt->get_result();
        while ($row = $reviewCommentResult->fetch_assoc()) {
            $employeeName = trim((string)($row['employee_first_name'] ?? '') . ' ' . (string)($row['employee_last_name'] ?? ''));
            if ($employeeName === '') {
                $employeeName = 'Employee #' . intval($row['employee_id'] ?? 0);
            }

            $preview = trim((string)($row['comment_text'] ?? ''));
            if (strlen($preview) > 90) {
                $preview = substr($preview, 0, 87) . '...';
            }

            addNotification(
                $items,
                'approval',
                'Leave Request Reply',
                $employeeName . ' replied on a pending leave request. ' . $preview,
                (string)($row['created_at'] ?? date('Y-m-d H:i:s')),
                'medium',
                '/leave-requests?request_id=' . intval($row['leave_request_id']),
                'leave_review_comment:' . intval($row['comment_id'])
            );
        }
        $reviewCommentStmt->close();
    }
}

// Payslip/payroll updates for the current employee.
if ($employeeId > 0) {
    $cashAdvanceStmt = $conn->prepare(
        "SELECT cash_advance_request_id,
                request_date,
                amount,
                status,
                manager_notes,
                created_at,
                approved_at,
                updated_at
         FROM cash_advance_request
         WHERE employee_id = ?
         ORDER BY cash_advance_request_id DESC
         LIMIT 20"
    );
    if ($cashAdvanceStmt) {
        $cashAdvanceStmt->bind_param('i', $employeeId);
        $cashAdvanceStmt->execute();
        $cashAdvanceResult = $cashAdvanceStmt->get_result();
        while ($row = $cashAdvanceResult->fetch_assoc()) {
            $status = strtolower((string)($row['status'] ?? 'submitted'));
            if (!in_array($status, ['submitted', 'approved', 'rejected', 'cancelled'], true)) continue;

            $severity = 'info';
            if ($status === 'approved') $severity = 'success';
            if ($status === 'rejected') $severity = 'high';
            if ($status === 'submitted') $severity = 'medium';

            $message = 'Cash advance request #' . intval($row['cash_advance_request_id'])
                . ' for PHP ' . number_format((float)($row['amount'] ?? 0), 2)
                . ' on ' . (string)($row['request_date'] ?? '-')
                . ' is now ' . strtoupper($status) . '.';
            $notesPreview = notificationPreview($row['manager_notes'] ?? '');
            if ($notesPreview !== '' && $status !== 'submitted') {
                $message .= ' Note: ' . $notesPreview;
            }

            addNotification(
                $items,
                'payroll',
                'Cash Advance Update',
                $message,
                (string)($row['approved_at'] ?? $row['updated_at'] ?? $row['created_at'] ?? date('Y-m-d H:i:s')),
                $severity,
                '/cash-advance',
                'cash_advance_request:' . intval($row['cash_advance_request_id']) . ':' . $status
            );
        }
        $cashAdvanceStmt->close();
    }
}

if ($employeeId > 0) {
    $overtimeStmt = $conn->prepare(
        "SELECT overtime_request_id,
                work_date,
                hours_requested,
                status,
                manager_notes,
                created_at,
                approved_at,
                updated_at
         FROM overtime_request
         WHERE employee_id = ?
         ORDER BY overtime_request_id DESC
         LIMIT 20"
    );
    if ($overtimeStmt) {
        $overtimeStmt->bind_param('i', $employeeId);
        $overtimeStmt->execute();
        $overtimeResult = $overtimeStmt->get_result();
        while ($row = $overtimeResult->fetch_assoc()) {
            $status = strtolower((string)($row['status'] ?? 'submitted'));
            if (!in_array($status, ['submitted', 'approved', 'rejected', 'cancelled'], true)) continue;

            $severity = 'info';
            if ($status === 'approved') $severity = 'success';
            if ($status === 'rejected') $severity = 'high';
            if ($status === 'submitted') $severity = 'medium';

            $message = 'Overtime request #' . intval($row['overtime_request_id'])
                . ' for ' . rtrim(rtrim(number_format((float)($row['hours_requested'] ?? 0), 2), '0'), '.')
                . ' hour(s) on ' . (string)($row['work_date'] ?? '-')
                . ' is now ' . strtoupper($status) . '.';
            $notesPreview = notificationPreview($row['manager_notes'] ?? '');
            if ($notesPreview !== '' && $status !== 'submitted') {
                $message .= ' Note: ' . $notesPreview;
            }

            addNotification(
                $items,
                'approval',
                'Overtime Request Update',
                $message,
                (string)($row['approved_at'] ?? $row['updated_at'] ?? $row['created_at'] ?? date('Y-m-d H:i:s')),
                $severity,
                '/overtime-requests',
                'overtime_request:' . intval($row['overtime_request_id']) . ':' . $status
            );
        }
        $overtimeStmt->close();
    }
}

if ($employeeId > 0) {
    $payrollStmt = $conn->prepare(
        "SELECT id, pay_period_start, pay_period_end, status, net_pay, created_at
         FROM payroll
         WHERE employee_id = ?
         ORDER BY pay_period_end DESC, id DESC
         LIMIT 10"
    );
    if ($payrollStmt) {
        $payrollStmt->bind_param('i', $employeeId);
        $payrollStmt->execute();
        $payrollResult = $payrollStmt->get_result();
        while ($row = $payrollResult->fetch_assoc()) {
            $status = strtolower((string)($row['status'] ?? 'draft'));
            if ($status === 'draft') continue;

            $periodStart = (string)($row['pay_period_start'] ?? '');
            $periodEnd = (string)($row['pay_period_end'] ?? '');
            $periodText = trim($periodStart . ' - ' . $periodEnd);
            $net = number_format((float)($row['net_pay'] ?? 0), 2);
            addNotification(
                $items,
                'payroll',
                'Payslip Update',
                'Payroll (' . $periodText . ') is ' . strtoupper($status) . '. Net pay: PHP ' . $net . '.',
                (string)($row['created_at'] ?? date('Y-m-d H:i:s')),
                $status === 'approved' || $status === 'paid' ? 'success' : 'info',
                '/my-payslips',
                'payroll:' . intval($row['id']) . ':' . $status
            );
        }
        $payrollStmt->close();
    }
}

// Payslip dispute updates for the current employee.
if ($employeeId > 0) {
    $disputeStmt = $conn->prepare(
        "SELECT dispute_id, issue_type, status, created_at, resolved_at, updated_at, sla_due_at, resolution_notes
         FROM payslip_dispute
         WHERE employee_id = ?
         ORDER BY dispute_id DESC
         LIMIT 20"
    );
    if ($disputeStmt) {
        $disputeStmt->bind_param('i', $employeeId);
        $disputeStmt->execute();
        $disputeResult = $disputeStmt->get_result();
        while ($row = $disputeResult->fetch_assoc()) {
            $status = strtolower((string)($row['status'] ?? 'submitted'));
            $title = 'Payslip Dispute Update';
            $severity = 'info';

            if ($status === 'resolved') $severity = 'success';
            if ($status === 'rejected') $severity = 'high';
            if ($status === 'in_review') $severity = 'medium';

            $occurredAt = (string)($row['resolved_at'] ?? $row['updated_at'] ?? $row['created_at'] ?? date('Y-m-d H:i:s'));
            $message = 'Dispute #' . intval($row['dispute_id']) . ' (' . strtoupper((string)$row['issue_type']) . ') is now ' . strtoupper($status) . '.';
            $resolutionPreview = notificationPreview($row['resolution_notes'] ?? '');
            if ($resolutionPreview !== '' && in_array($status, ['resolved', 'rejected', 'cancelled'], true)) {
                $message .= ' Note: ' . $resolutionPreview;
            }
            addNotification(
                $items,
                'payroll',
                $title,
                $message,
                $occurredAt,
                $severity,
                '/payslip-disputes?dispute_id=' . intval($row['dispute_id']),
                'payslip_dispute:' . intval($row['dispute_id']) . ':' . $status
            );
        }
        $disputeStmt->close();
    }
}

if ($employeeId > 0) {
    $disputeCommentStmt = $conn->prepare(
        "SELECT c.comment_id,
                c.dispute_id,
                c.comment_text,
                c.created_at,
                pd.issue_type,
                u.first_name AS commenter_first_name,
                u.last_name AS commenter_last_name,
                u.username AS commenter_username
         FROM payslip_dispute_comment c
         INNER JOIN payslip_dispute pd ON pd.dispute_id = c.dispute_id
         INNER JOIN users u ON u.id = c.user_id
         WHERE pd.employee_id = ?
           AND c.user_id <> ?
         ORDER BY c.created_at DESC
         LIMIT 20"
    );
    if ($disputeCommentStmt) {
        $disputeCommentStmt->bind_param('ii', $employeeId, $userId);
        $disputeCommentStmt->execute();
        $disputeCommentResult = $disputeCommentStmt->get_result();
        while ($row = $disputeCommentResult->fetch_assoc()) {
            $commenterName = trim((string)($row['commenter_first_name'] ?? '') . ' ' . (string)($row['commenter_last_name'] ?? ''));
            if ($commenterName === '') {
                $commenterName = (string)($row['commenter_username'] ?? 'A reviewer');
            }

            addNotification(
                $items,
                'payroll',
                'Payslip Dispute Comment',
                $commenterName . ' commented on your ' . strtoupper((string)($row['issue_type'] ?? 'issue')) . ' dispute. ' . notificationPreview($row['comment_text'] ?? ''),
                (string)($row['created_at'] ?? date('Y-m-d H:i:s')),
                'info',
                '/payslip-disputes?dispute_id=' . intval($row['dispute_id']),
                'payslip_dispute_comment:' . intval($row['comment_id'])
            );
        }
        $disputeCommentStmt->close();
    }
}

// Upcoming shift reminders.
if ($employeeId > 0) {
    $shiftStmt = $conn->prepare(
        "SELECT shift_schedule_id, shift_date, shift_start, shift_end, status
         FROM shift_schedule
         WHERE employee_id = ?
           AND shift_date >= CURDATE()
           AND shift_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
         ORDER BY shift_date ASC, shift_start ASC
         LIMIT 20"
    );
    if ($shiftStmt) {
        $shiftStmt->bind_param('i', $employeeId);
        $shiftStmt->execute();
        $shiftResult = $shiftStmt->get_result();
        while ($row = $shiftResult->fetch_assoc()) {
            $status = strtolower((string)($row['status'] ?? 'scheduled'));
            if ($status !== 'scheduled') continue;

            $shiftTs = strtotime((string)$row['shift_date'] . ' ' . (string)$row['shift_start']);
            if ($shiftTs === false) continue;

            addNotification(
                $items,
                'shift',
                'Upcoming Shift',
                'You have a scheduled shift on ' . date('M d, Y', $shiftTs) . ' (' . (string)$row['shift_start'] . ' - ' . (string)$row['shift_end'] . ').',
                date('Y-m-d H:i:s', $shiftTs),
                'info',
                '/calendar',
                'shift_schedule:' . intval($row['shift_schedule_id']) . ':' . (string)$row['shift_date'] . ':' . (string)$row['shift_start']
            );
        }
        $shiftStmt->close();
    }
}

// Client activity updates for the shared notification center.
if (in_array($role, ['admin', 'manager', 'staff'], true)) {
    $clientLink = in_array($role, ['admin', 'manager'], true) ? '/clients' : '';
    $clientActivityStmt = $conn->prepare(
        "SELECT action, description, created_at
         FROM activity_log
         WHERE activity_type = 'client_management'
           AND action IN ('create_client', 'update_client', 'archive_client', 'permanent_delete_client')
           AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         ORDER BY created_at DESC
         LIMIT 20"
    );
    if ($clientActivityStmt) {
        $clientActivityStmt->execute();
        $clientActivityResult = $clientActivityStmt->get_result();
        while ($row = $clientActivityResult->fetch_assoc()) {
            $action = strtolower(trim((string)($row['action'] ?? '')));
            $title = 'Client Activity';
            $severity = 'info';

            if ($action === 'create_client') {
                $title = 'New Client Created';
            } elseif ($action === 'update_client') {
                $title = 'Client Updated';
            } elseif ($action === 'archive_client') {
                $title = 'Client Archived';
                $severity = 'medium';
            } elseif ($action === 'permanent_delete_client') {
                $title = 'Client Deleted';
                $severity = 'high';
            }

            $message = trim((string)($row['description'] ?? ''));
            if ($message === '') {
                $message = 'A client record activity was logged in the system.';
            }

            addNotification(
                $items,
                'client',
                $title,
                $message,
                (string)($row['created_at'] ?? date('Y-m-d H:i:s')),
                $severity,
                $clientLink,
                'client_activity:' . substr(hash('sha256', $action . '|' . $message . '|' . (string)($row['created_at'] ?? '')), 0, 24)
            );
        }
        $clientActivityStmt->close();
    }
}

// Admin-only notifications for recent staff/manager activity log events.
if ($role === 'admin') {
    $teamActivityStmt = $conn->prepare(
        "SELECT al.id,
                al.action,
                al.description,
                al.activity_type,
                al.created_at,
                u.id AS actor_user_id,
                u.role AS actor_role,
                u.first_name AS actor_first_name,
                u.last_name AS actor_last_name,
                u.username AS actor_username
         FROM activity_log al
         INNER JOIN users u ON u.id = al.user_id
         WHERE LOWER(COALESCE(u.role, '')) IN ('staff', 'manager')
           AND al.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         ORDER BY al.created_at DESC, al.id DESC
         LIMIT 40"
    );
    if ($teamActivityStmt) {
        $teamActivityStmt->execute();
        $teamActivityResult = $teamActivityStmt->get_result();
        while ($row = $teamActivityResult->fetch_assoc()) {
            $actorRole = strtolower(trim((string)($row['actor_role'] ?? 'staff')));
            $actorRoleLabel = $actorRole === 'manager' ? 'Manager' : 'Staff';
            $actorName = trim((string)($row['actor_first_name'] ?? '') . ' ' . (string)($row['actor_last_name'] ?? ''));
            if ($actorName === '') {
                $actorName = trim((string)($row['actor_username'] ?? ''));
            }
            if ($actorName === '') {
                $actorName = 'User #' . intval($row['actor_user_id'] ?? 0);
            }

            $description = trim((string)($row['description'] ?? ''));
            $action = strtolower(trim((string)($row['action'] ?? '')));
            $activityType = trim((string)($row['activity_type'] ?? ''));
            $activityTypeLabel = $activityType !== '' ? ucwords(str_replace('_', ' ', $activityType)) : 'General';

            if ($description === '') {
                $description = 'performed ' . str_replace('_', ' ', $action);
            }

            $message = $actorName . ' (' . $actorRoleLabel . '): ' . $description;
            if (!preg_match('/[.!?]$/', $message)) {
                $message .= '.';
            }
            $message .= ' Area: ' . $activityTypeLabel . '.';

            $severity = $actorRole === 'manager' ? 'medium' : 'info';
            if (
                strpos($action, 'delete') !== false
                || strpos($action, 'archive') !== false
                || strpos($action, 'reject') !== false
                || strpos($action, 'terminate') !== false
                || strpos($action, 'lock') !== false
                || strpos($action, 'fail') !== false
            ) {
                $severity = 'high';
            }

            addNotification(
                $items,
                'activity',
                $actorRoleLabel . ' Activity',
                $message,
                (string)($row['created_at'] ?? date('Y-m-d H:i:s')),
                $severity,
                '/admin/dashboard',
                'team_activity:' . intval($row['id'] ?? 0)
            );
        }
        $teamActivityStmt->close();
    }
}

// Manager/admin operational reminder.
if (in_array($role, ['manager', 'admin'], true)) {
    $pendingLeaveSql = "SELECT COUNT(*) AS pending_count, MAX(created_at) AS latest_created_at FROM leave_request WHERE status = 'pending'";
    $pendingLeaveResult = $conn->query($pendingLeaveSql);
    if ($pendingLeaveResult) {
        $row = $pendingLeaveResult->fetch_assoc();
        $pending = intval($row['pending_count'] ?? 0);
        if ($pending > 0) {
            $latestCreatedAt = trim((string)($row['latest_created_at'] ?? ''));
            $occurredAt = $latestCreatedAt !== '' ? $latestCreatedAt : date('Y-m-d H:i:s');
            addNotification(
                $items,
                'approval',
                'Pending Leave Approvals',
                'There are ' . $pending . ' leave request(s) waiting for approval.',
                $occurredAt,
                'medium',
                '/leave-requests',
                'pending_leave_approvals:' . $pending . ':' . $occurredAt,
                'pending_leave_approvals'
            );
        }
    }
}

// SLA reminder signals for manager/admin approval inbox.
if (in_array($role, ['manager', 'admin'], true)) {
    $leaveHours = getApprovalSlaHoursForNotifications($conn, 'leave', 48);
    $otHours = getApprovalSlaHoursForNotifications($conn, 'overtime', 24);
    $disputeHours = getApprovalSlaHoursForNotifications($conn, 'payslip_dispute', 72);
    $nowTs = time();

    // Pending leave SLA.
    $leaveSlaStmt = $conn->prepare(
        "SELECT leave_request_id, created_at
         FROM leave_request
         WHERE LOWER(status) = 'pending'
         ORDER BY created_at DESC
         LIMIT 200"
    );
    if ($leaveSlaStmt) {
        $leaveSlaStmt->execute();
        $leaveSlaResult = $leaveSlaStmt->get_result();
        $leaveOverdue = 0;
        $leaveDueSoon = 0;
        $latestLeaveSignalTs = 0;
        while ($row = $leaveSlaResult->fetch_assoc()) {
            $createdTs = strtotime((string)($row['created_at'] ?? ''));
            if (!$createdTs) continue;
            $dueTs = $createdTs + ($leaveHours * 3600);
            $remainingMinutes = intval(floor(($dueTs - $nowTs) / 60));
            if ($remainingMinutes < 0) {
                $leaveOverdue++;
                $latestLeaveSignalTs = max($latestLeaveSignalTs, $dueTs);
            } elseif ($remainingMinutes <= 360) {
                $leaveDueSoon++;
                $latestLeaveSignalTs = max($latestLeaveSignalTs, $dueTs);
            }
        }
        if ($leaveOverdue > 0 || $leaveDueSoon > 0) {
            $message = [];
            if ($leaveOverdue > 0) $message[] = $leaveOverdue . ' overdue';
            if ($leaveDueSoon > 0) $message[] = $leaveDueSoon . ' due soon';
            $occurredAt = $latestLeaveSignalTs > 0 ? date('Y-m-d H:i:s', $latestLeaveSignalTs) : date('Y-m-d H:i:s');
            addNotification(
                $items,
                'approval',
                'Leave SLA Reminder',
                'Pending leave approvals: ' . implode(', ', $message) . '.',
                $occurredAt,
                $leaveOverdue > 0 ? 'high' : 'medium',
                '/manager/approval-inbox?type=leave',
                'leave_sla:' . $leaveOverdue . ':' . $leaveDueSoon . ':' . $occurredAt,
                'leave_sla'
            );
        }
        $leaveSlaStmt->close();
    }

    // Pending overtime SLA.
    $otSlaStmt = $conn->prepare(
        "SELECT overtime_request_id, created_at, sla_due_at
         FROM overtime_request
         WHERE LOWER(status) = 'submitted'
         ORDER BY created_at DESC
         LIMIT 200"
    );
    if ($otSlaStmt) {
        $otSlaStmt->execute();
        $otSlaResult = $otSlaStmt->get_result();
        $otOverdue = 0;
        $otDueSoon = 0;
        $latestOtSignalTs = 0;
        while ($row = $otSlaResult->fetch_assoc()) {
            $dueRaw = trim((string)($row['sla_due_at'] ?? ''));
            $dueTs = $dueRaw !== '' ? strtotime($dueRaw) : (strtotime((string)($row['created_at'] ?? '')) + ($otHours * 3600));
            if (!$dueTs) continue;
            $remainingMinutes = intval(floor(($dueTs - $nowTs) / 60));
            if ($remainingMinutes < 0) {
                $otOverdue++;
                $latestOtSignalTs = max($latestOtSignalTs, $dueTs);
            } elseif ($remainingMinutes <= 360) {
                $otDueSoon++;
                $latestOtSignalTs = max($latestOtSignalTs, $dueTs);
            }
        }
        if ($otOverdue > 0 || $otDueSoon > 0) {
            $message = [];
            if ($otOverdue > 0) $message[] = $otOverdue . ' overdue';
            if ($otDueSoon > 0) $message[] = $otDueSoon . ' due soon';
            $occurredAt = $latestOtSignalTs > 0 ? date('Y-m-d H:i:s', $latestOtSignalTs) : date('Y-m-d H:i:s');
            addNotification(
                $items,
                'approval',
                'Overtime SLA Reminder',
                'Pending overtime approvals: ' . implode(', ', $message) . '.',
                $occurredAt,
                $otOverdue > 0 ? 'high' : 'medium',
                '/manager/approval-inbox?type=overtime',
                'overtime_sla:' . $otOverdue . ':' . $otDueSoon . ':' . $occurredAt,
                'overtime_sla'
            );
        }
        $otSlaStmt->close();
    }

    // Pending payslip dispute SLA.
    $disputeSlaStmt = $conn->prepare(
        "SELECT dispute_id, created_at, sla_due_at
         FROM payslip_dispute
         WHERE LOWER(status) IN ('submitted', 'in_review')
         ORDER BY created_at DESC
         LIMIT 200"
    );
    if ($disputeSlaStmt) {
        $disputeSlaStmt->execute();
        $disputeSlaResult = $disputeSlaStmt->get_result();
        $disputeOverdue = 0;
        $disputeDueSoon = 0;
        $latestDisputeSignalTs = 0;
        while ($row = $disputeSlaResult->fetch_assoc()) {
            $dueRaw = trim((string)($row['sla_due_at'] ?? ''));
            $dueTs = $dueRaw !== '' ? strtotime($dueRaw) : (strtotime((string)($row['created_at'] ?? '')) + ($disputeHours * 3600));
            if (!$dueTs) continue;
            $remainingMinutes = intval(floor(($dueTs - $nowTs) / 60));
            if ($remainingMinutes < 0) {
                $disputeOverdue++;
                $latestDisputeSignalTs = max($latestDisputeSignalTs, $dueTs);
            } elseif ($remainingMinutes <= 360) {
                $disputeDueSoon++;
                $latestDisputeSignalTs = max($latestDisputeSignalTs, $dueTs);
            }
        }
        if ($disputeOverdue > 0 || $disputeDueSoon > 0) {
            $message = [];
            if ($disputeOverdue > 0) $message[] = $disputeOverdue . ' overdue';
            if ($disputeDueSoon > 0) $message[] = $disputeDueSoon . ' due soon';
            $occurredAt = $latestDisputeSignalTs > 0 ? date('Y-m-d H:i:s', $latestDisputeSignalTs) : date('Y-m-d H:i:s');
            addNotification(
                $items,
                'approval',
                'Dispute SLA Reminder',
                'Pending payslip disputes: ' . implode(', ', $message) . '.',
                $occurredAt,
                $disputeOverdue > 0 ? 'high' : 'medium',
                '/manager/approval-inbox?type=payslip_dispute',
                'dispute_sla:' . $disputeOverdue . ':' . $disputeDueSoon . ':' . $occurredAt,
                'dispute_sla'
            );
        }
        $disputeSlaStmt->close();
    }
}

/**
 * Get AI-generated smart notifications for user
 */
function getAINotifications($conn, $userId, $role) {
    $items = [];
    
    // Fetch AI notifications from database
    $sql = "SELECT * FROM ai_notifications 
            WHERE target_user_id = ? 
              AND is_sent = 1 
              AND dismissed = 0
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY priority_score DESC, created_at DESC
            LIMIT 20";
    
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return [];
    }
    
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    
    while ($row = $result->fetch_assoc()) {
        $priority = 'medium';
        $score = intval($row['priority_score'] ?? 5);
        
        if ($score >= 8) {
            $priority = 'critical';
        } elseif ($score >= 6) {
            $priority = 'high';
        } elseif ($score <= 3) {
            $priority = 'low';
        }
        
        $items[] = [
            'id' => 'ai_' . $row['id'],
            'type' => 'ai_' . $row['event_type'],
            'title' => $row['suggested_action'] ?? 'Smart Notification',
            'message' => $row['ai_message'],
            'occurred_at' => $row['created_at'],
            'priority' => $priority,
            'action_url' => $row['action_url'] ?? '/notifications',
            'icon_emoji' => $row['icon_emoji'] ?? '🔔',
            'is_ai' => true,
            'source' => $row['source'],
            'notification_id' => intval($row['id']),
            'dedup_key' => 'ai_notification:' . $row['id']
        ];
    }
    
    $stmt->close();
    
    return $items;
}

// Profile edit access workflow notifications.
$requesterRows = profileEditRequesterNotificationRows($conn, $userId, 12);
foreach ($requesterRows as $row) {
    $status = strtolower(trim((string)($row['status'] ?? '')));
    $requestId = intval($row['request_id'] ?? 0);

    if ($status === 'pending') {
        addNotification(
            $items,
            'profile',
            'Edit Access Request Submitted',
            'Your request to edit your profile details is waiting for approval.',
            (string)($row['created_at'] ?? date('Y-m-d H:i:s')),
            'info',
            '/profile',
            'profile_request:' . $requestId . ':pending',
            'profile_request:' . $requestId . ':pending'
        );
    } elseif ($status === 'approved') {
        $untilRaw = trim((string)($row['access_granted_until'] ?? ''));
        $message = 'Your edit access request was approved.';
        if ($untilRaw !== '') {
            $message .= ' You can edit your profile until ' . date('M d, Y h:i A', strtotime($untilRaw)) . '.';
        }
        addNotification(
            $items,
            'profile',
            'Edit Access Approved',
            $message,
            (string)($row['approved_at'] ?? $row['created_at'] ?? date('Y-m-d H:i:s')),
            'success',
            '/profile',
            'profile_request:' . $requestId . ':approved',
            'profile_request:' . $requestId . ':approved'
        );
    } elseif ($status === 'used') {
        addNotification(
            $items,
            'profile',
            'Profile Changes Saved',
            'Your approved edit access was used to save your updated profile details.',
            (string)($row['used_at'] ?? $row['approved_at'] ?? $row['created_at'] ?? date('Y-m-d H:i:s')),
            'success',
            '/profile',
            'profile_request:' . $requestId . ':used',
            'profile_request:' . $requestId . ':used'
        );
    }
}

if ($role === 'manager' || $role === 'admin') {
    $pendingRequestRows = profileEditPendingNotificationRows($conn, $role, $userId, $branchId, 12);
    foreach ($pendingRequestRows as $row) {
        $requestId = intval($row['request_id'] ?? 0);
        addNotification(
            $items,
            'profile',
            'Edit Access Review Needed',
            ($row['requester_name'] ?? 'A user') . ' requested access to edit profile details.',
            (string)($row['created_at'] ?? date('Y-m-d H:i:s')),
            'medium',
            '/edit-requests',
            'profile_request_review:' . $requestId,
            'profile_request_review:' . $requestId
        );
    }

    $usedRequestRows = profileEditUsedNotificationRows($conn, $role, $userId, $branchId, 12);
    foreach ($usedRequestRows as $row) {
        $requestId = intval($row['request_id'] ?? 0);
        $changedFields = is_array($row['updated_fields'] ?? null) ? $row['updated_fields'] : [];
        addNotification(
            $items,
            'profile',
            'Profile Self-Update Completed',
            ($row['requester_name'] ?? 'A user') . ' updated their own details. Changed fields: ' . profileEditSummarizeChangedFields($changedFields) . '.',
            (string)($row['used_at'] ?? $row['updated_at'] ?? date('Y-m-d H:i:s')),
            'info',
            '/edit-requests',
            'profile_request_used:' . $requestId,
            'profile_request_used:' . $requestId
        );
    }
}

usort($items, function($left, $right) {
    $leftTs = strtotime((string)($left['occurred_at'] ?? '')) ?: 0;
    $rightTs = strtotime((string)($right['occurred_at'] ?? '')) ?: 0;
    return $rightTs <=> $leftTs;
});

// Add AI-generated smart notifications
$aiNotifications = getAINotifications($conn, $userId, $role);
$items = array_merge($items, $aiNotifications);

// Re-sort with AI notifications included
usort($items, function($left, $right) {
    $leftTs = strtotime((string)($left['occurred_at'] ?? '')) ?: 0;
    $rightTs = strtotime((string)($right['occurred_at'] ?? '')) ?: 0;
    return $rightTs <=> $leftTs;
});

if (count($items) > 60) {
    $items = array_slice($items, 0, 60);
}

sendResponse(true, $items, 'Notifications retrieved successfully');
