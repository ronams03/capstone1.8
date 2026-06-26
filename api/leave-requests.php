<?php
/**
 * Leave Requests API
 * Handles CRUD operations for leave requests
 */

require_once 'config.php';
require_once 'utils.php';

setCORSHeaders();

$method = getRequestMethod();
$conn = getDBConnection();
ensureLeaveTypeStorage($conn);
ensureLeaveRequestCommentsTable($conn);
ensurePhaseOneTables($conn);

switch ($method) {
    case 'GET':
        requireFeatureAccess('leave_requests', ['admin', 'manager', 'staff'], $conn);
        handleGet($conn);
        break;
    case 'POST':
        requireFeatureAccess('leave_requests', ['admin', 'manager', 'staff'], $conn);
        handlePost($conn);
        break;
    case 'PUT':
        requireFeatureAccess('leave_requests', ['admin', 'manager', 'staff'], $conn);
        handlePut($conn);
        break;
    case 'DELETE':
        requireFeatureAccess('leave_requests', ['admin', 'manager', 'staff'], $conn);
        handleDelete($conn);
        break;
    default:
        sendError('Method not allowed', 405);
}

function getCurrentSessionRole() {
    return strtolower((string)($_SESSION['role'] ?? ''));
}

function getCurrentSessionEmployeeId($conn) {
    $sessionEmployeeId = intval($_SESSION['employee_id'] ?? 0);
    if ($sessionEmployeeId > 0) return $sessionEmployeeId;

    $userId = intval($_SESSION['user_id'] ?? 0);
    if ($userId <= 0) return 0;

    $stmt = $conn->prepare("SELECT id, employee_id, first_name, last_name, email, role, status, branch_id FROM users WHERE id = ? LIMIT 1");
    if (!$stmt) return 0;
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$user) return 0;

    $employeeId = intval($user['employee_id'] ?? 0);
    if ($employeeId > 0) {
        $_SESSION['employee_id'] = $employeeId;
        return $employeeId;
    }

    $email = trim((string)($user['email'] ?? ''));
    if ($email !== '') {
        $byEmail = $conn->prepare("SELECT employee_id FROM employees WHERE email = ? LIMIT 1");
        if ($byEmail) {
            $byEmail->bind_param('s', $email);
            $byEmail->execute();
            $row = $byEmail->get_result()->fetch_assoc();
            $byEmail->close();
            $employeeId = intval($row['employee_id'] ?? 0);
        }
    }

    if ($employeeId <= 0) {
        $firstName = trim((string)($user['first_name'] ?? ''));
        $lastName = trim((string)($user['last_name'] ?? ''));
        if ($firstName !== '' && $lastName !== '') {
            $byName = $conn->prepare(
                "SELECT employee_id
                 FROM employees
                 WHERE LOWER(TRIM(first_name)) = LOWER(TRIM(?))
                   AND LOWER(TRIM(last_name)) = LOWER(TRIM(?))
                 LIMIT 2"
            );
            if ($byName) {
                $byName->bind_param('ss', $firstName, $lastName);
                $byName->execute();
                $result = $byName->get_result();
                if ($result && $result->num_rows === 1) {
                    $row = $result->fetch_assoc();
                    $employeeId = intval($row['employee_id'] ?? 0);
                }
                $byName->close();
            }
        }
    }

    if ($employeeId <= 0) {
        $role = strtolower((string)($user['role'] ?? ''));
        $status = strtolower((string)($user['status'] ?? ''));
        $firstName = trim((string)($user['first_name'] ?? ''));
        $lastName = trim((string)($user['last_name'] ?? ''));
        $branchId = intval($user['branch_id'] ?? 0);

        if (
            in_array($role, ['staff', 'manager'], true) &&
            $status === 'active' &&
            $firstName !== '' &&
            $lastName !== ''
        ) {
            $position = $role === 'manager' ? 'Manager' : 'Staff';
            $emailValue = $email !== '' ? $email : null;

            if ($branchId > 0) {
                $insertEmp = $conn->prepare(
                    "INSERT INTO employees (first_name, last_name, email, position, hire_date, status, branch_id)
                     VALUES (?, ?, ?, ?, CURDATE(), 'active', ?)"
                );
                if ($insertEmp) {
                    $insertEmp->bind_param('ssssi', $firstName, $lastName, $emailValue, $position, $branchId);
                }
            } else {
                $insertEmp = $conn->prepare(
                    "INSERT INTO employees (first_name, last_name, email, position, hire_date, status)
                     VALUES (?, ?, ?, ?, CURDATE(), 'active')"
                );
                if ($insertEmp) {
                    $insertEmp->bind_param('ssss', $firstName, $lastName, $emailValue, $position);
                }
            }

            if (!empty($insertEmp)) {
                if ($insertEmp->execute()) {
                    $employeeId = intval($conn->insert_id);
                } elseif ($insertEmp->errno === 1062 && $email !== '') {
                    // Race-safe fallback for unique email collisions.
                    $retry = $conn->prepare("SELECT employee_id FROM employees WHERE email = ? LIMIT 1");
                    if ($retry) {
                        $retry->bind_param('s', $email);
                        $retry->execute();
                        $row = $retry->get_result()->fetch_assoc();
                        $retry->close();
                        $employeeId = intval($row['employee_id'] ?? 0);
                    }
                }
                $insertEmp->close();
            }
        }
    }

    if ($employeeId > 0) {
        $link = $conn->prepare("UPDATE users SET employee_id = ? WHERE id = ? LIMIT 1");
        if ($link) {
            $link->bind_param('ii', $employeeId, $userId);
            $link->execute();
            $link->close();
        }
        $_SESSION['employee_id'] = $employeeId;
    }

    return $employeeId;
}

function requireCurrentEmployeeId($conn) {
    $employeeId = getCurrentSessionEmployeeId($conn);
    if ($employeeId <= 0) {
        sendError('Your account is not linked to an employee record.', 403);
    }
    return $employeeId;
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

function getDefaultLeaveTypeSeeds() {
    return [
        ['type_key' => 'sick', 'type_name' => 'Sick'],
        ['type_key' => 'vacation', 'type_name' => 'Vacation'],
        ['type_key' => 'emergency', 'type_name' => 'Emergency'],
        ['type_key' => 'maternity', 'type_name' => 'Maternity'],
        ['type_key' => 'paternity', 'type_name' => 'Paternity'],
        ['type_key' => 'unpaid', 'type_name' => 'Unpaid'],
    ];
}

function ensureLeaveTypeColumnIsVarchar($conn, $table, $column) {
    $dbName = DB_NAME;
    $checkSql = "SELECT DATA_TYPE, COLUMN_TYPE
                 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
                 LIMIT 1";
    $checkStmt = $conn->prepare($checkSql);
    if (!$checkStmt) {
        sendError('Failed to validate leave type schema.', 500);
    }
    $checkStmt->bind_param('sss', $dbName, $table, $column);
    $checkStmt->execute();
    $col = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    if (!$col) return;

    $dataType = strtolower((string)($col['DATA_TYPE'] ?? ''));
    $columnType = strtolower((string)($col['COLUMN_TYPE'] ?? ''));
    if ($dataType === 'enum' || strpos($columnType, 'enum(') === 0) {
        $alterSql = "ALTER TABLE `$table` MODIFY COLUMN `$column` VARCHAR(100) NOT NULL";
        if (!$conn->query($alterSql)) {
            sendError('Failed to upgrade leave type schema on ' . $table . ': ' . $conn->error, 500);
        }
    }
}

function ensureLeaveTypeStorage($conn) {
    $createSql = "CREATE TABLE IF NOT EXISTS leave_type (
                    leave_type_id INT AUTO_INCREMENT PRIMARY KEY,
                    type_key VARCHAR(100) NOT NULL UNIQUE,
                    type_name VARCHAR(120) NOT NULL UNIQUE,
                    description TEXT NULL,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_leave_type_active (is_active)
                  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    if (!$conn->query($createSql)) {
        sendError('Failed to initialize leave type storage: ' . $conn->error, 500);
    }

    ensureLeaveTypeColumnIsVarchar($conn, 'leave_request', 'leave_type');
    ensureLeaveTypeColumnIsVarchar($conn, 'leave_balance', 'leave_type');

    $insertSql = "INSERT INTO leave_type (type_key, type_name, description, is_active)
                  VALUES (?, ?, '', 1)
                  ON DUPLICATE KEY UPDATE type_name = VALUES(type_name)";
    $stmt = $conn->prepare($insertSql);
    if (!$stmt) {
        sendError('Failed to initialize default leave types.', 500);
    }
    foreach (getDefaultLeaveTypeSeeds() as $seed) {
        $key = (string)$seed['type_key'];
        $name = (string)$seed['type_name'];
        $stmt->bind_param('ss', $key, $name);
        $stmt->execute();
    }
    $stmt->close();
}

function getAllowedLeaveTypes($conn) {
    $sql = "SELECT type_key
            FROM leave_type
            WHERE is_active = 1
            ORDER BY type_name ASC";
    $result = $conn->query($sql);
    if (!$result) {
        $fallback = [];
        foreach (getDefaultLeaveTypeSeeds() as $seed) {
            $fallback[] = (string)$seed['type_key'];
        }
        return $fallback;
    }

    $types = [];
    while ($row = $result->fetch_assoc()) {
        $key = trim((string)($row['type_key'] ?? ''));
        if ($key !== '') $types[] = $key;
    }
    return $types;
}

function normalizeEmployeeRoleForLeaveSubmission($value) {
    $role = strtolower(trim((string)$value));
    if ($role === '') return '';
    if ($role === 'manager' || strpos($role, 'manager') !== false) return 'manager';
    if ($role === 'staff' || strpos($role, 'staff') !== false) return 'staff';
    if ($role === 'admin' || strpos($role, 'administrator') !== false) return 'admin';
    return $role;
}

function getEmployeeRoleForLeaveSubmission($conn, $employeeId) {
    $employeeId = intval($employeeId);
    if ($employeeId <= 0) return null;

    $stmt = $conn->prepare(
        "SELECT e.position,
                (SELECT LOWER(TRIM(u.role))
                 FROM users u
                 WHERE u.employee_id = e.employee_id
                 ORDER BY u.id DESC
                 LIMIT 1) AS linked_role
         FROM employees e
         WHERE e.employee_id = ?
         LIMIT 1"
    );
    if (!$stmt) sendError('Failed to validate target employee role.', 500);
    $stmt->bind_param('i', $employeeId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) return null;

    $linkedRole = normalizeEmployeeRoleForLeaveSubmission($row['linked_role'] ?? '');
    if ($linkedRole !== '') return $linkedRole;
    return normalizeEmployeeRoleForLeaveSubmission($row['position'] ?? '');
}

function getLeaveRequestRecord($conn, $leaveId) {
    $stmt = $conn->prepare(
        "SELECT leave_request_id, employee_id, leave_type, start_date, end_date, status
         FROM leave_request
         WHERE leave_request_id = ?
         LIMIT 1"
    );
    if (!$stmt) sendError('Failed to prepare leave request lookup', 500);
    $stmt->bind_param('i', $leaveId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

function ensureLeaveRequestAccess($conn, $leaveId, $role, $selfEmployeeId) {
    $record = getLeaveRequestRecord($conn, $leaveId);
    if (!$record) {
        sendError('Leave request not found', 404);
    }

    if ($role === 'staff' && intval($record['employee_id'] ?? 0) !== intval($selfEmployeeId)) {
        sendError('Forbidden', 403);
    }

    return $record;
}

function handleGetComments($conn, $leaveId, $role, $selfEmployeeId) {
    ensureLeaveRequestAccess($conn, $leaveId, $role, $selfEmployeeId);

    $sql = "SELECT c.comment_id,
                   c.leave_request_id,
                   c.user_id,
                   c.parent_comment_id,
                   c.comment_text,
                   c.created_at,
                   c.updated_at,
                   u.first_name,
                   u.last_name,
                   u.username,
                   LOWER(COALESCE(u.role, '')) AS commenter_role
            FROM leave_request_comment c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE c.leave_request_id = ?
            ORDER BY c.created_at ASC, c.comment_id ASC";

    $stmt = $conn->prepare($sql);
    if (!$stmt) sendError('Failed to prepare comments query', 500);
    $stmt->bind_param('i', $leaveId);
    $stmt->execute();
    $result = $stmt->get_result();

    $comments = [];
    while ($row = $result->fetch_assoc()) {
        $fullName = trim((string)($row['first_name'] ?? '') . ' ' . (string)($row['last_name'] ?? ''));
        $comments[] = [
            'comment_id' => intval($row['comment_id']),
            'leave_request_id' => intval($row['leave_request_id']),
            'user_id' => intval($row['user_id']),
            'parent_comment_id' => $row['parent_comment_id'] !== null ? intval($row['parent_comment_id']) : null,
            'comment_text' => (string)($row['comment_text'] ?? ''),
            'created_at' => (string)($row['created_at'] ?? ''),
            'updated_at' => (string)($row['updated_at'] ?? ''),
            'commenter_name' => $fullName !== '' ? $fullName : ((string)($row['username'] ?? 'Unknown User')),
            'commenter_role' => (string)($row['commenter_role'] ?? ''),
        ];
    }
    $stmt->close();

    sendResponse(true, $comments, 'Leave request comments retrieved successfully');
}

function handleCreateComment($conn, $data, $role, $selfEmployeeId) {
    $leaveId = intval($data['leave_request_id'] ?? 0);
    if ($leaveId <= 0) {
        sendError('Leave request ID is required', 400);
    }

    $commentTextRaw = trim((string)($data['comment'] ?? $data['comment_text'] ?? ''));
    if ($commentTextRaw === '') {
        sendError('Comment is required', 400);
    }
    if (strlen($commentTextRaw) > 2000) {
        sendError('Comment is too long (max 2000 characters)', 400);
    }

    $leaveRecord = ensureLeaveRequestAccess($conn, $leaveId, $role, $selfEmployeeId);
    $currentUserId = intval($_SESSION['user_id'] ?? 0);
    if ($currentUserId <= 0) {
        sendError('Authentication required', 401);
    }

    $parentCommentId = null;
    if (isset($data['parent_comment_id']) && $data['parent_comment_id'] !== null && $data['parent_comment_id'] !== '') {
        $parentCommentId = intval($data['parent_comment_id']);
        if ($parentCommentId <= 0) {
            sendError('Invalid parent comment ID', 400);
        }

        $parentStmt = $conn->prepare(
            "SELECT comment_id
             FROM leave_request_comment
             WHERE comment_id = ? AND leave_request_id = ?
             LIMIT 1"
        );
        if (!$parentStmt) sendError('Failed to prepare parent comment lookup', 500);
        $parentStmt->bind_param('ii', $parentCommentId, $leaveId);
        $parentStmt->execute();
        $parent = $parentStmt->get_result()->fetch_assoc();
        $parentStmt->close();

        if (!$parent) {
            sendError('Parent comment not found for this leave request', 404);
        }
    }

    $commentText = sanitizeInput($commentTextRaw);
    if ($parentCommentId !== null) {
        $insert = $conn->prepare(
            "INSERT INTO leave_request_comment (leave_request_id, user_id, parent_comment_id, comment_text)
             VALUES (?, ?, ?, ?)"
        );
        if (!$insert) sendError('Failed to prepare comment insert', 500);
        $insert->bind_param('iiis', $leaveId, $currentUserId, $parentCommentId, $commentText);
    } else {
        $insert = $conn->prepare(
            "INSERT INTO leave_request_comment (leave_request_id, user_id, comment_text)
             VALUES (?, ?, ?)"
        );
        if (!$insert) sendError('Failed to prepare comment insert', 500);
        $insert->bind_param('iis', $leaveId, $currentUserId, $commentText);
    }

    if (!$insert->execute()) {
        $insert->close();
        sendError('Failed to save comment: ' . $conn->error, 500);
    }

    $newCommentId = intval($conn->insert_id);
    $insert->close();

    logActivity(
        $conn,
        $currentUserId,
        'leave_comment',
        'Added a comment to leave request ID: ' . $leaveId . ' (employee ID: ' . intval($leaveRecord['employee_id'] ?? 0) . ')',
        'leave_management'
    );

    sendResponse(true, ['comment_id' => $newCommentId], 'Comment posted successfully', 201);
}

function handleGet($conn) {
    $leave_id = $_GET['id'] ?? null;
    $role = getCurrentSessionRole();
    $isStaff = $role === 'staff';
    $selfEmployeeId = $isStaff ? requireCurrentEmployeeId($conn) : 0;
    $commentsOnly = isset($_GET['comments']) && (string)($_GET['comments']) !== '0';
    $requestRole = strtolower(trim((string)($_GET['role'] ?? '')));
    if ($requestRole !== '' && !in_array($requestRole, ['admin', 'manager', 'staff'], true)) {
        sendError('Invalid role filter', 400);
    }

    if ($commentsOnly) {
        $commentsLeaveId = intval($_GET['leave_request_id'] ?? $_GET['id'] ?? 0);
        if ($commentsLeaveId <= 0) {
            sendError('Leave request ID is required', 400);
        }
        handleGetComments($conn, $commentsLeaveId, $role, $selfEmployeeId);
        return;
    }
    
    if ($leave_id) {
        $sql = "SELECT lr.*, 
                       CONCAT(e.first_name, ' ', e.last_name) as employee_name,
                       e.position,
                       COALESCE(
                           (SELECT LOWER(u.role) FROM users u WHERE u.employee_id = lr.employee_id ORDER BY u.id DESC LIMIT 1),
                           LOWER(TRIM(e.position))
                       ) as employee_role,
                       (SELECT COUNT(*) FROM leave_request_comment c WHERE c.leave_request_id = lr.leave_request_id) as comment_count,
                       CONCAT(a.first_name, ' ', a.last_name) as approved_by_name
                FROM leave_request lr
                LEFT JOIN employees e ON lr.employee_id = e.employee_id
                LEFT JOIN employees a ON lr.approved_by = a.employee_id
                WHERE lr.leave_request_id = ?";

        if ($isStaff) {
            $sql .= " AND lr.employee_id = ?";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param('ii', $leave_id, $selfEmployeeId);
        } else {
            $stmt = $conn->prepare($sql);
            $stmt->bind_param('i', $leave_id);
        }

        $stmt->execute();
        $result = $stmt->get_result();
        
        if ($row = $result->fetch_assoc()) {
            sendResponse(true, $row, 'Leave request retrieved successfully');
        } else {
            sendError('Leave request not found', 404);
        }
    } else {
        $employee_id = $_GET['employee_id'] ?? null;
        $status = isset($_GET['status']) ? strtolower(trim((string)$_GET['status'])) : null;

        if ($isStaff) {
            $employee_id = $selfEmployeeId;
        }
        
        $sql = "SELECT lr.*, 
                       CONCAT(e.first_name, ' ', e.last_name) as employee_name,
                       e.position,
                       COALESCE(
                           (SELECT LOWER(u.role) FROM users u WHERE u.employee_id = lr.employee_id ORDER BY u.id DESC LIMIT 1),
                           LOWER(TRIM(e.position))
                       ) as employee_role,
                       (SELECT COUNT(*) FROM leave_request_comment c WHERE c.leave_request_id = lr.leave_request_id) as comment_count
                FROM leave_request lr
                LEFT JOIN employees e ON lr.employee_id = e.employee_id
                WHERE 1=1";
        
        $params = [];
        $types = '';
        
        if ($employee_id) {
            $sql .= " AND lr.employee_id = ?";
            $params[] = $employee_id;
            $types .= 'i';
        }
        
        if ($status !== null && $status !== '') {
            if ($status === 'archived') {
                $sql .= " AND lr.status IN ('approved', 'rejected', 'archived', 'cancelled')";
            } else {
                $sql .= " AND lr.status = ?";
                $params[] = $status;
                $types .= 's';
            }
        }

        if ($requestRole !== '') {
            $sql .= " AND (
                EXISTS (
                    SELECT 1 FROM users ur
                    WHERE ur.employee_id = lr.employee_id
                      AND LOWER(ur.role) = ?
                ) OR (
                    NOT EXISTS (
                        SELECT 1 FROM users ur2
                        WHERE ur2.employee_id = lr.employee_id
                    )
                    AND LOWER(TRIM(e.position)) = ?
                )
            )";
            $params[] = $requestRole;
            $params[] = $requestRole;
            $types .= 'ss';
        }
        
        $sql .= " ORDER BY lr.created_at DESC";
        
        if (!empty($params)) {
            $stmt = $conn->prepare($sql);
            $stmt->bind_param($types, ...$params);
            $stmt->execute();
            $result = $stmt->get_result();
        } else {
            $result = $conn->query($sql);
        }
        
        $leave_requests = [];
        while ($row = $result->fetch_assoc()) {
            $leave_requests[] = $row;
        }
        
        sendResponse(true, $leave_requests, 'Leave requests retrieved successfully');
    }
}

function handlePost($conn) {
    $data = getJSONInput();
    $role = getCurrentSessionRole();
    $isStaff = $role === 'staff';
    $selfEmployeeId = $isStaff ? requireCurrentEmployeeId($conn) : 0;
    $actorEmployeeId = $isStaff ? $selfEmployeeId : getCurrentSessionEmployeeId($conn);

    if (($data['action'] ?? '') === 'comment') {
        handleCreateComment($conn, $data, $role, $selfEmployeeId);
        return;
    }

    if (!in_array($role, ['staff', 'manager', 'admin'], true)) {
        sendError('Only admin, manager, or staff can submit leave requests.', 403);
    }
    
    $required = ['leave_type', 'start_date', 'end_date'];
    if (!$isStaff) {
        $required[] = 'employee_id';
    }
    $missing = validateRequiredFields($data, $required);
    
    if ($missing) {
        sendError('Missing required fields: ' . implode(', ', $missing), 400);
    }
    
    $employee_id = $isStaff
        ? $selfEmployeeId
        : intval($data['employee_id']);
    if ($employee_id <= 0) {
        sendError('Employee ID is required', 400);
    }
    if (!$isStaff) {
        $targetRole = getEmployeeRoleForLeaveSubmission($conn, $employee_id);
        if ($targetRole === null) {
            sendError('Employee not found', 404);
        }
        if ($role === 'admin' && !in_array($targetRole, ['manager', 'staff'], true)) {
            if ($actorEmployeeId <= 0 || $employee_id !== $actorEmployeeId) {
                sendError('Admin can only create leave requests for manager or staff employees.', 403);
            }
        }
    }
    $leave_type = sanitizeInput($data['leave_type']);
    $start_date = sanitizeInput($data['start_date']);
    $end_date = sanitizeInput($data['end_date']);
    $reason = sanitizeInput($data['reason'] ?? '');
    $status = 'pending';

    $allowedLeaveTypes = getAllowedLeaveTypes($conn);
    if (empty($allowedLeaveTypes)) {
        sendError('No active leave types are configured. Please contact an admin.', 400);
    }
    if (!in_array($leave_type, $allowedLeaveTypes, true)) {
        sendError('Invalid leave type', 400);
    }

    if (!validateDate($start_date) || !validateDate($end_date)) {
        sendError('Invalid date format. Expected YYYY-MM-DD.', 400);
    }
    if (strtotime($end_date) < strtotime($start_date)) {
        sendError('End date cannot be earlier than start date.', 400);
    }
    
    // Calculate days
    $start = new DateTime($start_date);
    $end = new DateTime($end_date);
    $days = $start->diff($end)->days + 1;
    
    // Check leave balance
    $year = date('Y');
    $balance_sql = "SELECT remaining_days FROM leave_balance 
                    WHERE employee_id = ? AND leave_type = ? AND year = ?";
    $balance_stmt = $conn->prepare($balance_sql);
    $balance_stmt->bind_param('isi', $employee_id, $leave_type, $year);
    $balance_stmt->execute();
    $balance_result = $balance_stmt->get_result();
    
    if ($balance_result->num_rows > 0) {
        $balance = $balance_result->fetch_assoc();
        if ($balance['remaining_days'] < $days) {
            sendError('Insufficient leave balance', 400);
        }
    }
    
    $sql = "INSERT INTO leave_request (employee_id, leave_type, start_date, end_date, reason, status) 
            VALUES (?, ?, ?, ?, ?, ?)";
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('isssss', $employee_id, $leave_type, $start_date, $end_date, $reason, $status);
    
    if ($stmt->execute()) {
        $leave_id = $conn->insert_id;
        $afterLeave = getLeaveRequestRecord($conn, $leave_id);
        
        if ($user_id = checkAuthentication()) {
            logActivity($conn, $user_id, 'create_leave_request', "Created leave request for employee ID: $employee_id", 'leave_management');
            logAuditTrail($conn, $user_id, 'leave_request', $leave_id, 'create', null, $afterLeave, basename(__FILE__));
        }

        upsertExceptionQueue(
            $conn,
            'leave_request',
            (string)$leave_id,
            'Leave request pending approval',
            'Leave request #' . $leave_id . ' is waiting for review.',
            'medium',
            'admin',
            [
                'leave_request_id' => $leave_id,
                'employee_id' => $employee_id,
                'status' => 'pending',
            ],
            intval($_SESSION['user_id'] ?? 0) > 0 ? intval($_SESSION['user_id'] ?? 0) : null
        );
        
        sendResponse(true, ['leave_request_id' => $leave_id], 'Leave request created successfully', 201);
    } else {
        sendError('Failed to create leave request: ' . $conn->error, 500);
    }
}

function handlePut($conn) {
    $data = getJSONInput();
    $role = getCurrentSessionRole();
    $isStaff = $role === 'staff';
    $selfEmployeeId = $isStaff ? requireCurrentEmployeeId($conn) : 0;
    
    if (!isset($data['leave_request_id'])) {
        sendError('Leave request ID is required', 400);
    }
    
    $leave_id = intval($data['leave_request_id']);
    
    // Handle approval/rejection/archive/restore
    if (isset($data['action']) && in_array($data['action'], ['approve', 'reject', 'archive', 'restore'], true)) {
        // Only admin and manager can review or restore leave requests
        requireMinRole('manager');
        $action = strtolower((string)$data['action']);
        $actor_employee_id = getCurrentSessionEmployeeId($conn);

        if ($actor_employee_id <= 0) {
            sendError('Your account is not linked to an employee record.', 403);
        }

        $beforeAction = getLeaveRequestRecord($conn, $leave_id);
        $leave_sql = "SELECT employee_id, leave_type, start_date, end_date, status FROM leave_request WHERE leave_request_id = ? LIMIT 1";
        $leave_stmt = $conn->prepare($leave_sql);
        $leave_stmt->bind_param('i', $leave_id);
        $leave_stmt->execute();
        $leave_data = $leave_stmt->get_result()->fetch_assoc();
        $leave_stmt->close();

        if (!$leave_data) {
            sendError('Leave request not found', 404);
        }

        $targetRole = getEmployeeRoleForLeaveSubmission($conn, intval($leave_data['employee_id'] ?? 0));
        if ($role === 'manager' && $targetRole !== 'staff') {
            if (intval($leave_data['employee_id'] ?? 0) === intval($actor_employee_id)) {
                sendError('Managers cannot approve their own leave requests. Please have an admin review it.', 403);
            }
            sendError('Managers can only approve staff leave requests. Please have an admin review this request.', 403);
        }

        $current_status = strtolower((string)($leave_data['status'] ?? ''));

        if ($action === 'restore') {
            if (!in_array($current_status, ['approved', 'rejected', 'archived', 'cancelled'], true)) {
                sendError('Only archived leave requests can be restored', 400);
            }

            $sql = "UPDATE leave_request
                    SET status = 'pending', approved_by = NULL, approved_at = NULL
                    WHERE leave_request_id = ? AND status IN ('approved', 'rejected', 'archived', 'cancelled')";
            $stmt = $conn->prepare($sql);
            if (!$stmt) {
                sendError('Failed to prepare restore update', 500);
            }
            $stmt->bind_param('i', $leave_id);

            if (!$stmt->execute()) {
                sendError('Failed to restore leave request: ' . $conn->error, 500);
            }

            if ($stmt->affected_rows <= 0) {
                sendError('Leave request is no longer archived', 409);
            }

            // Reverse previous leave balance deduction when restoring an approved request.
            if ($current_status === 'approved') {
                $start = new DateTime($leave_data['start_date']);
                $end = new DateTime($leave_data['end_date']);
                $days = $start->diff($end)->days + 1;

                $year = date('Y');
                $restore_balance = "UPDATE leave_balance
                                    SET used_days = GREATEST(used_days - ?, 0),
                                        remaining_days = remaining_days + ?
                                    WHERE employee_id = ? AND leave_type = ? AND year = ?";
                $balance_stmt = $conn->prepare($restore_balance);
                if ($balance_stmt) {
                    $balance_stmt->bind_param('ddisi', $days, $days, $leave_data['employee_id'], $leave_data['leave_type'], $year);
                    $balance_stmt->execute();
                    $balance_stmt->close();
                }
            }

            logActivity($conn, $actor_employee_id, 'restore_leave', "Restored leave request to pending: $leave_id", 'leave_management');
            $afterAction = getLeaveRequestRecord($conn, $leave_id);
            logAuditTrail($conn, intval($_SESSION['user_id'] ?? 0), 'leave_request', $leave_id, 'restore', $beforeAction, $afterAction, basename(__FILE__));
            upsertExceptionQueue(
                $conn,
                'leave_request',
                (string)$leave_id,
                'Leave request pending approval',
                'Leave request #' . $leave_id . ' was restored to pending status.',
                'medium',
                'admin',
                [
                    'leave_request_id' => $leave_id,
                    'status' => 'pending',
                ],
                intval($_SESSION['user_id'] ?? 0) > 0 ? intval($_SESSION['user_id'] ?? 0) : null
            );
            sendResponse(true, null, 'Leave request restored successfully');
        }

        $status = $action === 'approve' ? 'approved' : 'rejected';
        if ($current_status !== 'pending') {
            sendError('Only pending leave requests can be approved or archived', 400);
        }

        $sql = "UPDATE leave_request SET status = ?, approved_by = ?, approved_at = NOW() WHERE leave_request_id = ? AND status = 'pending'";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('sii', $status, $actor_employee_id, $leave_id);

        if ($stmt->execute()) {
            if ($stmt->affected_rows <= 0) {
                sendError('Leave request is no longer pending', 409);
            }
            // Update leave balance if approved
            if ($status === 'approved') {
                $start = new DateTime($leave_data['start_date']);
                $end = new DateTime($leave_data['end_date']);
                $days = $start->diff($end)->days + 1;

                $year = date('Y');
                $update_balance = "UPDATE leave_balance 
                                  SET used_days = used_days + ?, 
                                      remaining_days = remaining_days - ?
                                  WHERE employee_id = ? AND leave_type = ? AND year = ?";
                $balance_stmt = $conn->prepare($update_balance);
                $balance_stmt->bind_param('ddisi', $days, $days, $leave_data['employee_id'], $leave_data['leave_type'], $year);
                $balance_stmt->execute();
            }

            $label = $status === 'approved' ? 'approved' : 'archived';
            logActivity($conn, $actor_employee_id, 'approve_leave', "Leave request $label: $leave_id", 'leave_management');
            $afterAction = getLeaveRequestRecord($conn, $leave_id);
            logAuditTrail($conn, intval($_SESSION['user_id'] ?? 0), 'leave_request', $leave_id, 'update_status', $beforeAction, $afterAction, basename(__FILE__));

            $resolveSql = "UPDATE exception_queue
                           SET status = 'resolved',
                               resolved_by = ?,
                               resolved_at = NOW()
                           WHERE source_type = 'leave_request'
                             AND source_record_id = ?";
            $resolveStmt = $conn->prepare($resolveSql);
            if ($resolveStmt) {
                $sourceId = (string)$leave_id;
                $resolveBy = intval($_SESSION['user_id'] ?? 0);
                $resolveStmt->bind_param('is', $resolveBy, $sourceId);
                $resolveStmt->execute();
                $resolveStmt->close();
            }

            sendResponse(true, null, "Leave request $label successfully");
        } else {
            sendError('Failed to update leave request: ' . $conn->error, 500);
        }
    } else {
        // Regular update
        $updates = [];
        $params = [];
        $types = '';
        $currentRecord = getLeaveRequestRecord($conn, $leave_id);
        if (!$currentRecord) {
            sendError('Leave request not found', 404);
        }
        
        if ($isStaff) {
            $ownCheck = $conn->prepare("SELECT leave_request_id, status, employee_id FROM leave_request WHERE leave_request_id = ? LIMIT 1");
            $ownCheck->bind_param('i', $leave_id);
            $ownCheck->execute();
            $ownRecord = $ownCheck->get_result()->fetch_assoc();
            $ownCheck->close();

            if (!$ownRecord) sendError('Leave request not found', 404);
            if (intval($ownRecord['employee_id']) !== $selfEmployeeId) sendError('Forbidden', 403);
            if (($ownRecord['status'] ?? '') !== 'pending') sendError('Only pending leave requests can be updated', 400);
        } else {
            if (strtolower((string)($currentRecord['status'] ?? '')) !== 'pending') {
                sendError('Only pending leave requests can be updated', 400);
            }
        }

        $allowed_fields = ['start_date', 'end_date', 'reason'];

        $nextStartDate = isset($data['start_date']) ? sanitizeInput($data['start_date']) : (string)($currentRecord['start_date'] ?? '');
        $nextEndDate = isset($data['end_date']) ? sanitizeInput($data['end_date']) : (string)($currentRecord['end_date'] ?? '');
        if ($nextStartDate !== '' && $nextEndDate !== '') {
            if (!validateDate($nextStartDate) || !validateDate($nextEndDate)) {
                sendError('Invalid date format. Expected YYYY-MM-DD.', 400);
            }
            if (strtotime($nextEndDate) < strtotime($nextStartDate)) {
                sendError('End date cannot be earlier than start date.', 400);
            }
        }
        
        foreach ($allowed_fields as $field) {
            if (isset($data[$field])) {
                $updates[] = "$field = ?";
                $params[] = sanitizeInput($data[$field]);
                $types .= 's';
            }
        }
        
        if (empty($updates)) {
            sendError('No fields to update', 400);
        }
        
        $params[] = $leave_id;
        $types .= 'i';
        
        $sql = "UPDATE leave_request SET " . implode(', ', $updates) . " WHERE leave_request_id = ?";
        
        $stmt = $conn->prepare($sql);
        $stmt->bind_param($types, ...$params);
        
        if ($stmt->execute()) {
            $afterRegular = getLeaveRequestRecord($conn, $leave_id);
            logAuditTrail($conn, intval($_SESSION['user_id'] ?? 0), 'leave_request', $leave_id, 'update', $currentRecord, $afterRegular, basename(__FILE__));
            sendResponse(true, null, 'Leave request updated successfully');
        } else {
            sendError('Failed to update leave request: ' . $conn->error, 500);
        }
    }
}

function handleDelete($conn) {
    $leave_id = $_GET['id'] ?? null;
    $role = getCurrentSessionRole();
    $isStaff = $role === 'staff';
    $selfEmployeeId = $isStaff ? requireCurrentEmployeeId($conn) : 0;
    
    if (!$leave_id) {
        sendError('Leave request ID is required', 400);
    }
    
    $leave_id = intval($leave_id);
    
    // Only allow cancellation of pending requests or deletion of archived requests
    $check_sql = "SELECT leave_request_id, status, employee_id, leave_type, start_date, end_date FROM leave_request WHERE leave_request_id = ?";
    $check_stmt = $conn->prepare($check_sql);
    $check_stmt->bind_param('i', $leave_id);
    $check_stmt->execute();
    $result = $check_stmt->get_result();
    
    if ($result->num_rows === 0) {
        sendError('Leave request not found', 404);
    }
    
    $record = $result->fetch_assoc();
    if ($isStaff && intval($record['employee_id'] ?? 0) !== $selfEmployeeId) {
        sendError('Forbidden', 403);
    }
    $current_status = strtolower((string)($record['status'] ?? ''));
    if ($current_status !== 'pending') {
        if (!in_array($current_status, ['approved', 'rejected', 'archived', 'cancelled'], true)) {
            sendError('Only archived leave requests can be deleted', 400);
        }

        requireMinRole('manager');
        $actor_employee_id = getCurrentSessionEmployeeId($conn);
        if ($actor_employee_id <= 0) {
            sendError('Your account is not linked to an employee record.', 403);
        }

        $targetRole = getEmployeeRoleForLeaveSubmission($conn, intval($record['employee_id'] ?? 0));
        if ($role === 'manager' && $targetRole !== 'staff') {
            sendError('Managers can only delete staff leave requests.', 403);
        }

        $beforeDelete = getLeaveRequestRecord($conn, $leave_id);
        $delete_stmt = $conn->prepare("DELETE FROM leave_request WHERE leave_request_id = ? LIMIT 1");
        if (!$delete_stmt) {
            sendError('Failed to prepare delete leave request', 500);
        }
        $delete_stmt->bind_param('i', $leave_id);

        if (!$delete_stmt->execute()) {
            sendError('Failed to delete leave request: ' . $conn->error, 500);
        }
        $delete_stmt->close();

        if ($user_id = checkAuthentication()) {
            logActivity($conn, $user_id, 'delete_leave', "Deleted archived leave request ID: $leave_id", 'leave_management');
            logAuditTrail($conn, $user_id, 'leave_request', $leave_id, 'delete', $beforeDelete, null, basename(__FILE__));
        }

        sendResponse(true, null, 'Leave request deleted successfully');
    }

    $sql = "UPDATE leave_request SET status = 'cancelled' WHERE leave_request_id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('i', $leave_id);
    
    if ($stmt->execute()) {
        if ($user_id = checkAuthentication()) {
            logActivity($conn, $user_id, 'cancel_leave', "Cancelled leave request ID: $leave_id", 'leave_management');
            logAuditTrail($conn, $user_id, 'leave_request', $leave_id, 'cancel', $record, ['status' => 'cancelled'], basename(__FILE__));
        }

        $resolveSql = "UPDATE exception_queue
                       SET status = 'resolved',
                           resolved_by = ?,
                           resolved_at = NOW()
                       WHERE source_type = 'leave_request'
                         AND source_record_id = ?";
        $resolveStmt = $conn->prepare($resolveSql);
        if ($resolveStmt) {
            $sourceId = (string)$leave_id;
            $resolveBy = intval($_SESSION['user_id'] ?? 0);
            $resolveStmt->bind_param('is', $resolveBy, $sourceId);
            $resolveStmt->execute();
            $resolveStmt->close();
        }
        
        sendResponse(true, null, 'Leave request cancelled successfully');
    } else {
        sendError('Failed to cancel leave request: ' . $conn->error, 500);
    }
}

closeDBConnection($conn);
?>
